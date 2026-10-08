/**
 * 饮食推荐引擎：融合 节气 / 天气 / 肝郁指数 / 近期症状 四类信号，为四餐从池中选菜并生成饮食原则
 * 范式与 acuRecommend.js 一致：纯函数 + 规则打分；同一天同一人同一天气结果稳定，跨天自动轮换
 * 未登录 / 无天气 / 无症状时逐级降级：退化为日期确定性轮换（与中药图鉴同款兜底）
 * 每条推荐都带因果式理由（因为症状/肝郁/天气/节气/偏好…所以推荐它），增强互动感
 */

const { getSolarTerm } = require('./acuRecommend');

// 调理标签 → 功效短语（理由句用）
const TAG_PHRASE = {
  安神: '安神助眠', 疏肝: '疏肝理气', 解郁: '解郁宽心', 理气: '理气和胃',
  健脾: '健脾胃', 开胃: '开胃', 祛湿: '祛湿', 润肺: '润肺止咳', 润燥: '润燥生津',
  生津: '生津止渴', 温补: '温补养阳', 散寒: '驱寒暖身', 补气: '补气提神', 补血: '补血养身',
  清肝: '清肝降火', 清心: '清心除烦', 化痰: '化痰', 和胃: '和胃', 温中: '温中',
};

// 天气注释 → 应对动作（理由句用）
const WNOTE_ACTION = {
  '天气寒冷': '吃点温热的暖暖身', '天气炎热': '吃点清爽的败败火', '有雨湿重': '吃点祛湿的',
  '空气干燥': '吃点润燥的', '温差较大': '把脾胃顾好',
};
const { getSolarTermFood } = require('./solarTermFood');

// 食物 → 调理标签（菜名与 RECIPE_POOL 对齐；药膳汤谱已并入池中）
const FOOD_TAGS = {
  '红枣山药粥': ['健脾', '补气'],
  '小米枸杞粥': ['健脾', '安神'],
  '百合莲子羹': ['安神', '润肺'],
  '陈皮红豆沙': ['祛湿', '理气'],
  '白术陈皮粥': ['健脾', '祛湿', '开胃'],
  '姜汁豆浆': ['散寒', '温中', '化痰'],
  '芹菜炒香干': ['清肝'],
  '西兰花炒胡萝卜': [],
  '番茄炖豆腐': ['生津'],
  '清蒸鲈鱼': ['健脾', '补气'],
  '健脾山药汤': ['健脾', '补气', '和胃'],
  '人参滋补汤': ['补气', '温补'],
  '菠菜猪肝汤': ['补血', '清肝'],
  '莲藕排骨汤': ['润燥'],
  '山药菌菇汤': ['健脾'],
  '银耳百合羹': ['润肺', '安神', '润燥'],
  '当归生姜羊肉汤': ['温补', '散寒', '补血'],
  '龙眼红枣银耳炖鸡蛋': ['安神', '补血', '健脾'],
  '玫瑰花茶': ['疏肝', '解郁'],
  '陈皮红枣茶': ['理气', '健脾'],
  '枸杞菊花茶': ['清肝'],
  '佛手柑茶': ['疏肝', '理气'],
};

// 症状（用户口语记录）→ 期望的调理标签
const SYMPTOM_FOOD = {
  失眠: ['安神'], 多梦: ['安神'], 入睡难: ['安神'], 睡不好: ['安神'], 早醒: ['安神'],
  生气: ['疏肝', '解郁'], 烦躁: ['疏肝', '清心'], 易怒: ['疏肝', '解郁'], 焦虑: ['疏肝', '安神'],
  情绪低落: ['疏肝', '解郁'], 叹气: ['疏肝', '理气'], 胸闷: ['疏肝', '理气'],
  食欲不振: ['健脾', '开胃'], 没胃口: ['健脾', '开胃'], 腹胀: ['理气', '健脾'], 胃胀: ['理气', '和胃'],
  便溏: ['健脾'], 腹泻: ['健脾'],
  疲劳: ['补气'], 乏力: ['补气'], 气短: ['补气'],
  头晕: ['补血'], 面色差: ['补血'],
  咳嗽: ['润肺', '化痰'], 痰多: ['化痰'], 咽干: ['润燥', '生津'], 口干: ['生津', '润燥'],
  怕冷: ['温补', '散寒'], 手脚冰凉: ['温补', '散寒'],
  湿气重: ['祛湿'], 困重: ['祛湿'],
};

// 简单字符串哈希 → 0~1 确定性扰动（与 acuRecommend 相同）
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

/**
 * 健康偏好（health_profiles 标签化字段）→ 引擎开关
 * dietPref 形如「清淡、忌生冷、爱喝汤」；bodySense 形如「怕冷」
 * 兼容驼峰（API 层）与蛇形（SQL 查询直接透传）两种键名
 */
function parsePrefs(p) {
  const s = [(p && (p.dietPref || p.diet_pref)) || '', (p && (p.bodySense || p.body_sense)) || ''].join('、');
  return {
    vegetarian: /素食/.test(s),
    loveSoup: /爱喝汤/.test(s),
    noCold: /忌生冷/.test(s),
    coldSensitive: /怕冷/.test(s),
    heatSensitive: /怕热/.test(s),
  };
}

/**
 * 汇总四类信号 → 各调理维度的加分标签集合（推荐食谱与红黑榜共用）
 * @returns {{jitterBase, wTags, wNotes, sTags, seasonNote, lTags, liverScore, symHitTags, symWords}}
 */
function getSignalTags(user, symptoms, weather, now = new Date()) {
  const jitterBase = hash32(now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate());

  // 信号1：天气 → 加分标签
  const wTags = new Set();
  const wNotes = [];
  if (weather) {
    const rainy = /雨|雷/.test(weather.dayWeather || '');
    const snowy = /雪/.test(weather.dayWeather || '');
    if (weather.temp <= 10 || snowy) { wTags.add('温补'); wTags.add('散寒'); wNotes.push('天气寒冷'); }
    if (weather.temp >= 28) { wTags.add('清肝'); wTags.add('生津'); wNotes.push('天气炎热'); }
    if (rainy) { wTags.add('祛湿'); wNotes.push('有雨湿重'); }
    if ((weather.humidity || 0) >= 80) wTags.add('祛湿');
    if (!rainy && (weather.humidity || 0) > 0 && (weather.humidity || 0) <= 40) { wTags.add('润燥'); wTags.add('润肺'); wNotes.push('空气干燥'); }
    if ((weather.high || 0) - (weather.low || 0) >= 10) { wTags.add('健脾'); if (!wNotes.length) wNotes.push('温差较大'); }
  }

  // 信号2：节气（acuRecommend 24节气真值）→ 加分标签（按季节）+ 节气依据句
  const tf = getSolarTermFood(now);
  const sTags = new Set();
  const mo = now.getMonth() + 1;
  if (mo >= 2 && mo <= 4) { sTags.add('疏肝'); sTags.add('解郁'); }
  else if (mo >= 5 && mo <= 7) { sTags.add('祛湿'); sTags.add('清心'); }
  else if (mo >= 8 && mo <= 10) { sTags.add('润燥'); sTags.add('润肺'); }
  else { sTags.add('温补'); sTags.add('散寒'); }
  const seasonNote = '当前' + tf.name + '·' + tf.theme;

  // 信号3：肝郁指数 → 加分标签
  const liverScore = user && typeof user.score === 'number' ? user.score : null;
  const lTags = new Set();
  if (liverScore !== null) {
    if (liverScore >= 70) { lTags.add('疏肝'); lTags.add('解郁'); lTags.add('理气'); }
    else if (liverScore >= 50) { lTags.add('疏肝'); lTags.add('理气'); }
  }

  // 信号4：近期症状 → 期望标签（权重最高）
  const symHitTags = new Set();
  const symWords = [];
  for (const s of symptoms || []) {
    const tags = SYMPTOM_FOOD[s.symptom];
    if (tags && tags.length) { tags.forEach(t => symHitTags.add(t)); symWords.push(s.symptom + (s.count > 1 ? '×' + s.count : '')); }
  }

  return { jitterBase, wTags, wNotes, sTags, seasonNote, lTags, liverScore, symHitTags, symWords };
}

// 同一信号的多种说法：按条目名确定性挑选（同一天稳定、不同菜不同句），避免四餐一个腔调
const REASON_TPL = {
  symptom: [
    (w, eff) => `你最近有「${w}」，这道菜${eff}，正对症`,
    (w, eff) => `你最近常有「${w}」，特意选了能${eff}的它`,
    (w, eff) => `针对你的「${w}」，吃这道${eff}正合适`,
  ],
  liver: [
    s => `你的肝郁指数 ${s.liverScore} 偏高，这道菜帮你疏肝理气`,
    s => `肝郁指数到了 ${s.liverScore}，需要疏解，这道菜边吃边帮你顺气`,
    s => `你的肝郁指数 ${s.liverScore}，气机有点堵，吃它顺一顺`,
  ],
  weather: [
    (n, eff) => `今天${n}，正好${WNOTE_ACTION[n] || '吃它调一调'}`,
    (n, eff) => `今天${n}，这道菜${eff}正合适`,
    (n, eff) => `赶上今天${n}，吃点对路的——${eff}`,
    (n, eff) => `今天${n}，就吃它能${eff}`,
    (n, eff) => `天气不给面子（${n}），这道菜帮你${(WNOTE_ACTION[n] || '调养一番').replace('吃点', '')}`,
  ],
  term: [
    (s, eff) => `${s.seasonNote}，这道菜正应季`,
    (s, eff) => `顺着${s.seasonNote}的节奏，${eff}刚刚好`,
    (s, eff) => `${s.seasonNote}，这个时节吃它${eff}正当时`,
    (s, eff) => `${s.seasonNote}，${eff}正趁时候`,
  ],
  pref: [
    () => '你爱喝汤，这碗正合口味',
    () => '按你「爱喝汤」的偏好，选了这碗',
  ],
};

// 红黑榜短理由模板（贴条目下方的小字）
const ITEM_TPL = {
  symptom: [
    (w, eff) => `对症「${w}」·${eff}`,
    (w, eff) => `针对「${w}」·${eff}`,
  ],
  liver: [() => '疏肝理气', () => '帮你顺气解郁', () => '疏肝解郁宽心'],
  weather: [
    (n, eff) => `今日${n || '天气'}·${eff}`,
    (n, eff) => `${eff}，应今日天气`,
    (n, eff) => `今日${n || '天气多变'}，吃它调一调`,
  ],
  term: [eff => eff || '应季而食', eff => `${eff || '顺时而食'}·应季`, () => '应季而食'],
  pref: [() => '合你的偏好', () => '按你的偏好选的'],
};

function pickTpl(map, kind, seed) {
  const arr = map[kind];
  return arr[Math.floor(hash32(seed + '#' + kind) * arr.length) % arr.length];
}

// 因果式理由句：因为<信号>…所以推荐它；多信号时合并成综合建议（tags 为该菜命中的调理标签）
function signalReason(why, sig, tags = [], seed = '') {
  const effAll = () => (tags || []).map(t => TAG_PHRASE[t]).filter(Boolean).join('、');
  const parts = [];
  if (why.has('symptom') && sig.symWords.length) {
    const eff = (tags || []).map(t => TAG_PHRASE[t]).filter(Boolean).slice(0, 2).join('、');
    parts.push(pickTpl(REASON_TPL, 'symptom', seed)(sig.symWords.join('、'), eff || '调养身体'));
  }
  if (why.has('liver')) parts.push(pickTpl(REASON_TPL, 'liver', seed)(sig));
  if (why.has('weather')) {
    const n = sig.wNotes[0];
    parts.push(n ? pickTpl(REASON_TPL, 'weather', seed)(n, effAll() || '温和养人') : '今天这天气，吃它正合适');
  }
  if (why.has('term')) parts.push(pickTpl(REASON_TPL, 'term', seed)(sig, effAll() || '顺时而食'));
  if (why.has('pref')) parts.push(pickTpl(REASON_TPL, 'pref', seed)());
  if (!parts.length) return '';
  if (parts.length === 1) return '因为' + parts[0];
  return '因为' + parts[0] + '，加上' + parts.slice(1).join('，加上') + '——综合你的情况，推荐了它';
}

// 红黑榜单条轻理由（短句，贴在条目下方）
function itemReason(r, sig) {
  const eff = (r.tags || []).map(t => TAG_PHRASE[t]).filter(Boolean).join('、');
  const seed = r.name || '';
  if (r.why.has('symptom') && sig.symWords.length) return pickTpl(ITEM_TPL, 'symptom', seed)(sig.symWords[0], eff || '调养身体');
  if (r.why.has('liver')) {
    const extra = (r.tags || []).map(t => TAG_PHRASE[t]).filter(Boolean).filter(p => p !== '疏肝理气').join('、');
    const base = pickTpl(ITEM_TPL, 'liver', seed)();
    return extra ? base + '·' + extra : base;
  }
  if (r.why.has('weather')) return pickTpl(ITEM_TPL, 'weather', seed)(sig.wNotes[0] || '', eff || '温和养人');
  if (r.why.has('term')) return pickTpl(ITEM_TPL, 'term', seed)(eff);
  if (r.why.has('pref')) return pickTpl(ITEM_TPL, 'pref', seed)();
  return eff || '时令轮换';
}

/**
 * 为四餐各选一道菜
 * @param {Object} pool       { breakfast:[{name,ingredients}], lunch:[...], dinner:[...], snack:[...] }
 * @param {Object} mealLabels { breakfast:'早餐', ... }
 * @param {Object} user       {score, level}（可为 null：未登录）
 * @param {Array}  symptoms   近30天症状 [{symptom, count}]（可为空）
 * @param {Object} weather    getClothingByWeather 的返回（可为 null）
 * @param {Date}   [now]
 * @returns {{items:[{time,name,ingredients,reason}]}}
 */
function recommendMeals(pool, mealLabels, user, symptoms, weather, now = new Date(), prefs = null, opts = null) {
  const sig = getSignalTags(user, symptoms, weather, now);
  // 换一批模式：exclude 排除当前菜（格式「餐次:菜名,餐次:菜名」），salt 打散扰动种子让组合随机
  const exclude = {};
  if (opts && opts.exclude) {
    String(opts.exclude).split(',').forEach(pair => {
      const [t, n] = pair.split(':').map(s => decodeURIComponent((s || '').trim()));
      if (t && n) (exclude[t] = exclude[t] || new Set()).add(n);
    });
  }
  const jitterSalt = opts && opts.shuffle ? String(opts.salt || Date.now()).slice(0, 32) : sig.jitterBase.toFixed(6);

  // 每餐从池中选最高分：症状(3) > 肝郁(2) > 天气(2) > 节气(1) > 偏好(±1~2) > 扰动(0~0.45)
  const items = [];
  Object.entries(mealLabels).forEach(([meal, label]) => {
    const arr = (pool[meal] || []).filter(r => !(exclude[label] && exclude[label].has(r.name)));
    if (!arr.length) return;
    let best = null;
    for (const r of arr) {
      const tags = FOOD_TAGS[r.name] || [];
      let score = 0;
      const why = new Set();
      const hitTags = [];
      for (const t of tags) {
        if (sig.symHitTags.has(t)) { score += 3; why.add('symptom'); hitTags.push(t); }
        else if (sig.lTags.has(t)) { score += 2; why.add('liver'); hitTags.push(t); }
        else if (sig.wTags.has(t)) { score += 2; why.add('weather'); hitTags.push(t); }
        else if (sig.sTags.has(t)) { score += 1; why.add('term'); hitTags.push(t); }
      }
      // 健康偏好：素食压肉菜、爱喝汤提汤羹
      if (prefs && prefs.loveSoup && /汤|羹/.test(r.name)) { score += 1; why.add('pref'); }
      if (prefs && prefs.vegetarian && /羊|鱼|猪|排骨|鸡|鸭|肝|蛋/.test(r.name + (r.ingredients || ''))) score -= 2;
      score += hash32(r.name + '#' + jitterSalt) * 0.45;
      if (!best || score > best.score) best = { r, score, why, tags: hitTags };
    }
    items.push({
      time: label,
      name: best.r.name,
      ingredients: best.r.ingredients,
      reason: signalReason(best.why, sig, best.tags, label + '#' + best.r.name) || '今天按时令轮到它，换换口味',
    });
  });
  return { items };
}

// 红黑榜条目 → 调理标签（与 contentData.goodFoods 菜名对齐）
const FOOD_GROUP_TAGS = {
  '玫瑰花茶': ['疏肝', '解郁'], '陈皮茶': ['理气', '祛湿'], '菊花茶': ['清肝'], '枸杞茶': ['补气'],
  '茉莉花茶': ['疏肝', '理气'], '荷叶茶': ['祛湿'], '桂花茶': ['温中'], '大麦茶': ['健脾', '和胃'],
  '山药粥': ['健脾'], '小米粥': ['健脾', '安神'], '红枣饭': ['补血', '健脾'], '薏米饭': ['祛湿'],
  '燕麦粥': ['健脾'], '南瓜小米粥': ['健脾', '和胃'], '红豆薏米饭': ['祛湿'], '黑芝麻饭': ['润燥', '补血'],
  '菠菜': ['清肝', '补血'], '芹菜': ['清肝'], '西兰花': [], '胡萝卜': [],
  '山药': ['健脾'], '冬瓜': ['祛湿'], '白萝卜': ['理气', '化痰'], '莲藕': ['生津'],
  '苹果': [], '橙子': ['生津'], '葡萄': [], '猕猴桃': [],
  '雪梨': ['润燥', '生津'], '柑橘': ['生津'], '香蕉': [], '红枣': ['补血', '健脾'],
};

/**
 * 红黑榜个性化排序 + 每日轮换：
 * - 池内条目按 症状(3)>肝郁(2)>天气(2)>节气(1)+扰动(日期) 打分，good 每组取前4展示
 *   → 命中信号的第一名标「今日优先」及依据；无信号时按日期轮换，每天组合不同
 * - 避雷组：按天气给对应组加警示语（雨天湿重生冷尤忌 / 寒天生冷伤阳 / 热天辛辣助火 / 干天辛燥伤津），同样轮换取前4
 */
const GROUP_SHOW_N = 4;

function rankFoodGroups(good, bad, user, symptoms, weather, now = new Date(), prefs = null) {
  const sig = getSignalTags(user, symptoms, weather, now);
  const out = { good: {}, bad: {} };

  for (const [group, items] of Object.entries(good || {})) {
    const ranked = (items || []).map(name => {
      const tags = FOOD_GROUP_TAGS[name] || [];
      let score = 0;
      const why = new Set();
      const hitTags = [];
      for (const t of tags) {
        if (sig.symHitTags.has(t)) { score += 3; why.add('symptom'); hitTags.push(t); }
        else if (sig.lTags.has(t)) { score += 2; why.add('liver'); hitTags.push(t); }
        else if (sig.wTags.has(t)) { score += 2; why.add('weather'); hitTags.push(t); }
        else if (sig.sTags.has(t)) { score += 1; why.add('term'); hitTags.push(t); }
      }
      score += hash32(name + '#food#' + sig.jitterBase.toFixed(6)) * 0.3;
      return { name, score, why, tags: hitTags };
    }).sort((a, b) => b.score - a.score)
      .slice(0, GROUP_SHOW_N);

    const top = ranked[0];
    let topReason = '';
    if (top && top.why.size) {
      const why = signalReason(top.why, sig, top.tags, top.name);
      if (why) topReason = '今日优先：' + top.name + '，' + why;
    }
    out.good[group] = {
      items: ranked.map(r => ({ name: r.name, reason: itemReason(r, sig) })),
      topName: topReason ? top.name : null,
      topReason,
    };
  }

  if (weather) {
    const rainy = /雨|雷/.test(weather.dayWeather || '');
    const snowy = /雪/.test(weather.dayWeather || '');
    const humid = (weather.humidity || 0) >= 80;
    for (const [group, items] of Object.entries(bad || {})) {
      let tip = null;
      if (group === 'cold') {
        if (prefs && prefs.noCold) tip = '你在偏好里选了忌生冷，冰饮凉菜能免则免';
        else if (rainy || snowy || humid || weather.temp <= 10) {
          tip = (rainy || humid) ? '今日湿重，生冷甜腻尤忌' : (snowy ? '天寒最忌生冷' : '天寒阳气弱，生冷尤忌');
        }
      }
      if (group === 'spicy' && (weather.temp >= 28
        || (!rainy && (weather.humidity || 0) > 0 && (weather.humidity || 0) <= 40))) {
        tip = weather.temp >= 28 ? '今日炎热，辛辣油炸助火' : '今日干燥，辛辣烧烤伤津';
      }
      const sorted = (items || []).slice()
        .sort((a, b) => hash32(a + '#bad#' + sig.jitterBase.toFixed(6)) - hash32(b + '#bad#' + sig.jitterBase.toFixed(6)))
        .slice(0, GROUP_SHOW_N);
      out.bad[group] = { items: sorted, tip };
    }
  } else {
    for (const [group, items] of Object.entries(bad || {})) {
      const sorted = (items || []).slice()
        .sort((a, b) => hash32(a + '#bad#' + sig.jitterBase.toFixed(6)) - hash32(b + '#bad#' + sig.jitterBase.toFixed(6)))
        .slice(0, GROUP_SHOW_N);
      out.bad[group] = { items: sorted, tip: null };
    }
  }
  return out;
}

/**
 * 今日饮食原则：由节气 + 天气 + 肝郁指数生成；无天气时返回 null（调用方回退静态池轮换）
 */
function buildDietPrinciple(weather, user, now = new Date(), prefs = null) {
  if (!weather) return null;
  const rainy = /雨|雷/.test(weather.dayWeather || '');
  const snowy = /雪/.test(weather.dayWeather || '');
  const diff = (weather.high || 0) - (weather.low || 0);
  const tf = getSolarTermFood(now);
  let main;
  if (snowy) main = '今日有雪，宜温热食材御寒，忌生冷';
  else if (rainy) main = '今日有雨湿重，宜薏米、陈皮、山药健脾祛湿，忌生冷甜腻';
  else if (weather.temp <= 8) main = '今日寒冷，宜温补热汤，忌寒凉冰饮';
  else if (weather.temp >= 28) main = '今日炎热，宜清淡生津，忌辛辣油炸';
  else if (diff >= 10) main = '今日温差较大，顾好脾胃，早晚忌生冷';
  else if ((weather.humidity || 0) > 0 && (weather.humidity || 0) <= 40) main = '今日干燥，宜银耳、百合、雪梨润燥，忌辛辣烧烤';
  else main = '今日气温舒适，饮食平和，规律三餐';
  const parts = ['当前' + tf.name + '·' + tf.theme, main];
  if (prefs && prefs.noCold) parts.push('你忌生冷，冰饮凉菜尽量不碰');
  if (user && typeof user.score === 'number' && user.score >= 50) {
    parts.push('肝郁偏重，配玫瑰花茶、佛手柑茶疏肝理气');
  }
  return parts.join('；');
}

module.exports = { recommendMeals, buildDietPrinciple, rankFoodGroups, parsePrefs, FOOD_TAGS, SYMPTOM_FOOD };

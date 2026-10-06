/**
 * 饮食推荐引擎：融合 节气 / 天气 / 肝郁指数 / 近期症状 四类信号，为四餐从池中选菜并生成饮食原则
 * 范式与 acuRecommend.js 一致：纯函数 + 规则打分；同一天同一人同一天气结果稳定，跨天自动轮换
 * 未登录 / 无天气 / 无症状时逐级降级：退化为日期确定性轮换（与中药图鉴同款兜底）
 */

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

  // 信号2：节气（按月份简版）→ 加分标签
  const mo = now.getMonth() + 1;
  const sTags = new Set();
  let seasonNote = '';
  if (mo >= 2 && mo <= 4) { sTags.add('疏肝'); sTags.add('解郁'); seasonNote = '春季肝气当令'; }
  else if (mo >= 5 && mo <= 7) { sTags.add('祛湿'); sTags.add('清心'); seasonNote = '夏季暑湿渐盛'; }
  else if (mo >= 8 && mo <= 10) { sTags.add('润燥'); sTags.add('润肺'); seasonNote = '秋季燥邪当令'; }
  else { sTags.add('温补'); sTags.add('散寒'); seasonNote = '冬季宜温补藏阳'; }

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

// 按信号挑出依据句（symptom > liver > weather > term）
function signalReason(why, sig) {
  const parts = [];
  if (why.has('symptom') && sig.symWords.length) parts.push('你近期记录过「' + sig.symWords.join('、') + '」');
  if (why.has('liver')) parts.push('你的肝郁指数' + sig.liverScore);
  if (why.has('weather')) parts.push(sig.wNotes.join('、') || '今日天气');
  if (why.has('term')) parts.push(sig.seasonNote);
  return parts;
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
function recommendMeals(pool, mealLabels, user, symptoms, weather, now = new Date()) {
  const sig = getSignalTags(user, symptoms, weather, now);

  // 每餐从池中选最高分：症状(3) > 肝郁(2) > 天气(2) > 节气(1) > 扰动(0~0.45)
  const items = [];
  Object.entries(mealLabels).forEach(([meal, label]) => {
    const arr = pool[meal] || [];
    if (!arr.length) return;
    let best = null;
    for (const r of arr) {
      const tags = FOOD_TAGS[r.name] || [];
      let score = 0;
      const why = new Set();
      for (const t of tags) {
        if (sig.symHitTags.has(t)) { score += 3; why.add('symptom'); }
        else if (sig.lTags.has(t)) { score += 2; why.add('liver'); }
        else if (sig.wTags.has(t)) { score += 2; why.add('weather'); }
        else if (sig.sTags.has(t)) { score += 1; why.add('term'); }
      }
      score += hash32(r.name + '#' + sig.jitterBase.toFixed(6)) * 0.45;
      if (!best || score > best.score) best = { r, score, why };
    }
    const parts = signalReason(best.why, sig);
    items.push({
      time: label,
      name: best.r.name,
      ingredients: best.r.ingredients,
      reason: parts.length ? '根据' + parts.join('、') + '为你选出' : '',
    });
  });
  return { items };
}

// 红黑榜条目 → 调理标签（与 contentData.goodFoods 菜名对齐）
const FOOD_GROUP_TAGS = {
  '玫瑰花茶': ['疏肝', '解郁'], '陈皮茶': ['理气', '祛湿'], '菊花茶': ['清肝'], '枸杞茶': ['补气'],
  '山药粥': ['健脾'], '小米粥': ['健脾', '安神'], '红枣饭': ['补血', '健脾'], '薏米饭': ['祛湿'],
  '菠菜': ['清肝', '补血'], '芹菜': ['清肝'], '西兰花': [], '胡萝卜': [],
  '苹果': [], '橙子': ['生津'], '葡萄': [], '猕猴桃': [],
};

/**
 * 红黑榜个性化排序：
 * - 推荐组：按 症状(3)>肝郁(2)>天气(2)>节气(1)+扰动 重排；命中信号的第一名标「今日优先」及依据
 * - 避雷组：按天气给对应组加警示语（雨天湿重生冷尤忌 / 寒天生冷伤阳 / 热天辛辣助火 / 干天辛燥伤津）
 */
function rankFoodGroups(good, bad, user, symptoms, weather, now = new Date()) {
  const sig = getSignalTags(user, symptoms, weather, now);
  const out = { good: {}, bad: {} };

  for (const [group, items] of Object.entries(good || {})) {
    const ranked = (items || []).map(name => {
      const tags = FOOD_GROUP_TAGS[name] || [];
      let score = 0;
      const why = new Set();
      for (const t of tags) {
        if (sig.symHitTags.has(t)) { score += 3; why.add('symptom'); }
        else if (sig.lTags.has(t)) { score += 2; why.add('liver'); }
        else if (sig.wTags.has(t)) { score += 2; why.add('weather'); }
        else if (sig.sTags.has(t)) { score += 1; why.add('term'); }
      }
      score += hash32(name + '#food#' + sig.jitterBase.toFixed(6)) * 0.3;
      return { name, score, why };
    }).sort((a, b) => b.score - a.score);

    const top = ranked[0];
    let topReason = '';
    if (top && top.why.size) {
      const parts = signalReason(top.why, sig);
      if (parts.length) topReason = '今日优先：' + top.name + '（' + parts.join('、') + '）';
    }
    out.good[group] = { items: ranked.map(r => r.name), topName: topReason ? top.name : null, topReason };
  }

  if (weather) {
    const rainy = /雨|雷/.test(weather.dayWeather || '');
    const snowy = /雪/.test(weather.dayWeather || '');
    const humid = (weather.humidity || 0) >= 80;
    for (const [group, items] of Object.entries(bad || {})) {
      let tip = null;
      if (group === 'cold' && (rainy || snowy || humid || weather.temp <= 10)) {
        tip = (rainy || humid) ? '今日湿重，生冷甜腻尤忌' : (snowy ? '天寒最忌生冷' : '天寒阳气弱，生冷尤忌');
      }
      if (group === 'spicy' && (weather.temp >= 28
        || (!rainy && (weather.humidity || 0) > 0 && (weather.humidity || 0) <= 40))) {
        tip = weather.temp >= 28 ? '今日炎热，辛辣油炸助火' : '今日干燥，辛辣烧烤伤津';
      }
      out.bad[group] = { items: items || [], tip };
    }
  } else {
    for (const [group, items] of Object.entries(bad || {})) {
      out.bad[group] = { items: items || [], tip: null };
    }
  }
  return out;
}

/**
 * 今日饮食原则：由天气 + 肝郁指数生成；无天气时返回 null（调用方回退静态池轮换）
 */
function buildDietPrinciple(weather, user) {
  if (!weather) return null;
  const rainy = /雨|雷/.test(weather.dayWeather || '');
  const snowy = /雪/.test(weather.dayWeather || '');
  const diff = (weather.high || 0) - (weather.low || 0);
  let main;
  if (snowy) main = '今日有雪，宜温热食材御寒，忌生冷';
  else if (rainy) main = '今日有雨湿重，宜薏米、陈皮、山药健脾祛湿，忌生冷甜腻';
  else if (weather.temp <= 8) main = '今日寒冷，宜温补热汤，忌寒凉冰饮';
  else if (weather.temp >= 28) main = '今日炎热，宜清淡生津，忌辛辣油炸';
  else if (diff >= 10) main = '今日温差较大，顾好脾胃，早晚忌生冷';
  else if ((weather.humidity || 0) > 0 && (weather.humidity || 0) <= 40) main = '今日干燥，宜银耳、百合、雪梨润燥，忌辛辣烧烤';
  else main = '今日气温舒适，饮食平和，规律三餐';
  const parts = [main];
  if (user && typeof user.score === 'number' && user.score >= 50) {
    parts.push('肝郁偏重，配玫瑰花茶、佛手柑茶疏肝理气');
  }
  return parts.join('；');
}

module.exports = { recommendMeals, buildDietPrinciple, rankFoodGroups, FOOD_TAGS, SYMPTOM_FOOD };

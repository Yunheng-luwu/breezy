// 每日一穴智能推荐：融合 节气 / 肝郁指数 / 近期症状 三类信号，规则打分选穴
// 纯函数 + 静态节气表，无外部依赖；同一天同一状态结果稳定，跨天自动轮换

// 24 节气近似日期（公历，每年±1天浮动，健康提示场景足够精确）
// catBoost：该节气下按穴位分类加分（stress=疏肝解郁 neck=肩颈温阳 sleep=安神 office=保健润肺）
const SOLAR_TERMS = [
  { m: 1,  d: 5,  name: '小寒', tip: '寒气正盛，宜温阳散寒、固护阳气', boost: { neck: 2, sleep: 1 } },
  { m: 1,  d: 20, name: '大寒', tip: '一年中最冷，宜温经通阳、防寒保暖', boost: { neck: 2, sleep: 1 } },
  { m: 2,  d: 4,  name: '立春', tip: '春回大地，阳气初生，正是疏肝理气的好时机', boost: { stress: 2 } },
  { m: 2,  d: 19, name: '雨水', tip: '春雨润物，肝气渐旺，宜疏肝兼养脾胃', boost: { stress: 2, office: 1 } },
  { m: 3,  d: 5,  name: '惊蛰', tip: '肝阳升发，易情绪波动，宜疏肝解郁', boost: { stress: 2 } },
  { m: 3,  d: 20, name: '春分', tip: '昼夜均分，肝气正盛，宜疏肝理气、调和气血', boost: { stress: 2 } },
  { m: 4,  d: 5,  name: '清明', tip: '气清景明，肝气旺盛，宜疏肝明目、踏舒情志', boost: { stress: 2 } },
  { m: 4,  d: 20, name: '谷雨', tip: '雨生百谷，湿气渐起，宜疏肝兼健脾祛湿', boost: { stress: 2, office: 1 } },
  { m: 5,  d: 5,  name: '立夏', tip: '夏气通心，心火易旺，宜养心安神', boost: { sleep: 2 } },
  { m: 5,  d: 21, name: '小满', tip: '暑气渐盛，易心烦失眠，宜清心除烦安神', boost: { sleep: 2 } },
  { m: 6,  d: 5,  name: '芒种', tip: '仲夏时节，暑热扰心，宜养心安神', boost: { sleep: 2 } },
  { m: 6,  d: 21, name: '夏至', tip: '白昼最长，心火最旺，宜清心安神、晚睡早起', boost: { sleep: 2 } },
  { m: 7,  d: 7,  name: '小暑', tip: '暑湿渐重，既伤心神又困脾胃，宜安神兼和胃', boost: { sleep: 2, office: 1 } },
  { m: 7,  d: 22, name: '大暑', tip: '湿热交蒸，宜健脾化湿、清心安神', boost: { sleep: 2, office: 1 } },
  { m: 8,  d: 7,  name: '立秋', tip: '秋燥初起，宜宣肺润燥、防呼吸道不适', boost: { office: 2, neck: 1 } },
  { m: 8,  d: 23, name: '处暑', tip: '暑气渐消，燥邪当令，宜润肺护表', boost: { office: 2, neck: 1 } },
  { m: 9,  d: 7,  name: '白露', tip: '凉燥渐盛，易感冒咳嗽，宜宣肺利窍、解表防感', boost: { office: 2, neck: 1 } },
  { m: 9,  d: 23, name: '秋分', tip: '昼夜再分，秋燥明显，宜润肺防燥、顾护表气', boost: { office: 2, neck: 1 } },
  { m: 10, d: 8,  name: '寒露', tip: '露气寒冷，将凝结也，宜润肺防燥、防寒护表', boost: { office: 2, neck: 1 } },
  { m: 10, d: 23, name: '霜降', tip: '霜降而百物肃杀，宜润肺健脾、平补过冬', boost: { office: 2, sleep: 1 } },
  { m: 11, d: 7,  name: '立冬', tip: '冬主收藏，宜温阳散寒、补肾固本', boost: { neck: 2, sleep: 1 } },
  { m: 11, d: 22, name: '小雪', tip: '天地阴盛，宜温阳护表、防寒保暖', boost: { neck: 2, sleep: 1 } },
  { m: 12, d: 7,  name: '大雪', tip: '寒邪最盛，宜温经通阳、引火归元', boost: { neck: 2, sleep: 1 } },
  { m: 12, d: 21, name: '冬至', tip: '一阳初生，宜温阳散寒、静养阳气', boost: { neck: 2, sleep: 1 } },
];

// 取当前节气（year-12 月底早于小寒时回落到冬至）
function getSolarTerm(now) {
  const mo = now.getMonth() + 1, da = now.getDate();
  let cur = SOLAR_TERMS[SOLAR_TERMS.length - 1]; // 默认冬至（覆盖 12/21~1/4）
  for (const t of SOLAR_TERMS) {
    if (mo > t.m || (mo === t.m && da >= t.d)) cur = t;
  }
  return cur;
}

// 症状同义展开：把用户随手记的口语词映射到穴位场景词
const SYMPTOM_ALIASES = {
  失眠: ['失眠', '睡眠', '助眠'], 多梦: ['失眠', '睡眠'], 入睡难: ['失眠', '睡眠'],
  睡不好: ['失眠', '睡眠'], 早醒: ['失眠', '睡眠'],
  生气: ['生气', '烦躁', '急躁', '胸闷'], 烦躁: ['烦躁', '急躁', '生气'], 易怒: ['急躁', '烦躁', '生气'],
  焦虑: ['烦躁', '胸闷'], 情绪低落: ['胸闷', '生气'], 叹气: ['胸闷'],
  胸闷: ['胸闷'], 心慌: ['心悸', '胸闷'],
  头痛: ['头痛'], 偏头痛: ['头痛'], 头晕: ['头痛', '眩晕'], 牙痛: ['牙痛'],
  肩颈痛: ['肩颈', '肩酸', '肩部'], 颈肩: ['肩颈', '肩酸'], 肩酸: ['肩酸', '肩部'], 脖子僵: ['肩颈', '肩部'], 落枕: ['肩颈', '肩部'],
  眼干: ['目', '眼'], 眼睛干: ['目', '眼'], 眼疲劳: ['目', '眼'],
  恶心: ['恶心'], 反胃: ['恶心', '和胃'], 胃胀: ['和胃', '胃'], 晕车: ['恶心'],
  怕冷: ['怕冷', '阳气'], 手脚冰凉: ['怕冷', '阳气', '温阳'],
  手腕痛: ['手腕酸痛'], 鼠标手: ['手腕酸痛'], 腰酸: ['腰'],
  疲劳: ['倦', '疲'], 乏力: ['倦', '疲'],
};

// 简单字符串哈希，做「日期+用户」确定性扰动
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295; // 0~1
}

/**
 * 推荐今日穴位
 * @param {Array}  acupoints MySQL acupoints 全表 [{id,category,name,tag,effect,icon,...}]
 * @param {Object} user      {score, level}（可为 null：未登录/无档案）
 * @param {Array}  symptoms  近30天症状 [{symptom, count}]（可为空数组）
 * @param {Date}   [now]     当前时间（便于测试）
 * @returns {{acu, reason, solarTerm, signals}}
 */
function recommendDailyAcupoint(acupoints, user, symptoms, now = new Date()) {
  const term = getSolarTerm(now);
  if (!acupoints.length) return null;

  // 用户 key + 日期 → 0~0.45 的确定性扰动，让并列同分时每天有差异、同天稳定
  const jitterBase = hash32(String(now.getFullYear()) + '-' + (now.getMonth() + 1) + '-' + now.getDate());

  const scored = acupoints.map(a => {
    const hay = a.name + ' ' + a.tag + ' ' + a.effect + ' ' + (a.location || '');
    let score = 0;
    const hits = [];

    // 信号1：节气
    for (const [cat, add] of Object.entries(term.boost || {})) {
      if (a.category === cat) { score += add; hits.push({ k: 'term', add, cat }); }
    }

    // 信号2：肝郁指数
    if (user && typeof user.score === 'number') {
      const s = user.score;
      if (s >= 50 && a.category === 'stress') { score += 2; hits.push({ k: 'liver', add: 2 }); }
      else if (s >= 30 && a.category === 'stress') { score += 1; hits.push({ k: 'liver', add: 1 }); }
      else if (s < 30 && a.category === 'office') { score += 1; hits.push({ k: 'liver', add: 1 }); }
    }

    // 信号3：近期症状（按症状词逐个匹配，同义词展开）
    for (const sym of symptoms || []) {
      const words = [sym.symptom, ...(SYMPTOM_ALIASES[sym.symptom] || [])];
      if (words.some(w => w && hay.includes(w))) {
        score += 3;
        hits.push({ k: 'symptom', add: 3, word: sym.symptom, count: sym.count });
      }
    }

    // 扰动：同一天内同一用户结果固定，跨天/跨用户有差异
    const jitter = hash32(a.id + '#' + jitterBase.toFixed(6)) * 0.45;
    score += jitter;

    return { acu: a, score, hits, jitter };
  }).sort((x, y) => y.score - x.score);

  const best = scored[0];
  const a = best.acu;

  // —— 组装推荐理由 ——
  const parts = [];
  parts.push(`今处${term.name}：${term.tip}`);
  if (user && typeof user.score === 'number') {
    parts.push(user.score >= 80 ? `你的肝郁指数${user.score}（${user.level}），情绪压力需要重点疏解`
      : user.score >= 50 ? `你的肝郁指数${user.score}（${user.level}），适合疏肝理气`
        : user.score >= 30 ? `你的肝郁指数${user.score}（${user.level}），状态小有波动`
          : `你的肝郁指数${user.score}（${user.level}），气机平和`);
  }
  const symHits = best.hits.filter(h => h.k === 'symptom');
  if (symHits.length) {
    parts.push(`你近期记录过「${symHits.map(h => h.word + (h.count > 1 ? '×' + h.count : '')).join('、')}」，今天按它正对症`);
  }
  parts.push(`今日推荐${a.name}（${a.tag}）：${a.effect}`);

  return {
    acu: {
      id: a.id, name: a.name, tag: a.tag, effect: a.effect, icon: a.icon,
      location: a.location, method: a.method, duration: a.duration, frequency: a.frequency,
    },
    reason: parts.join('；'),
    solarTerm: { name: term.name, tip: term.tip },
    signals: {
      termMatched: Object.keys(term.boost || {}).some(c => term.boost[c] && a.category === c),
      liverLevel: user ? user.level : null,
      symptomHits: symHits.map(h => h.word),
    },
  };
}

module.exports = { recommendDailyAcupoint, getSolarTerm, SOLAR_TERMS };

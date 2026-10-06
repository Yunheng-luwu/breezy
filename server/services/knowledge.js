/**
 * 知识库加载与检索（数据来源：server/data/knowledge/*.json，由《知识库.docx》结构化生成）
 * 供 AI 只读工具使用，不直接对外暴露。
 */
const fs = require('fs');
const path = require('path');

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'knowledge', file), 'utf-8'));
}

const acupoints = load('acupoints.json').map((a, i) => ({ id: i + 1, ...a }));
const dietKb = load('diet.json');
const medicines = load('medicines.json');
const formulas = load('formulas.json');
const practicesKb = load('practices.json');
const constitutionSymptoms = load('constitution_symptoms.json');

function firstSentence(text, max = 40) {
  const t = String(text || '').replace(/\s+/g, '');
  const cut = t.split(/[。；]/)[0] || t;
  return cut.length > max ? cut.slice(0, max) : cut;
}

// ---------- 穴位 ----------
function listAcupoints(category) {
  return acupoints.filter(a => a.categories.includes(category));
}
function getAcupoint(id) {
  return acupoints.find(a => a.id === id) || null;
}

// ---------- 泡脚 ----------
// 每个配方的匹配词（数据正文之外的检索辅助词）
const FOOTBATH_KEYWORDS = {
  玫瑰疏肝方: ['疏肝', '生气', '压力', '胸闷', '情绪', '郁', '焦虑', '烦躁', '胁胀', '叹气'],
  艾叶暖身方: ['手脚冰凉', '怕冷', '暖身', '寒湿', '关节', '体寒', '发凉', '暖脚'],
  合欢安神方: ['失眠', '睡不好', '安神', '多梦', '入睡', '解郁', '睡眠'],
  生姜驱寒方: ['寒气', '怕冷', '感冒', '受凉', '驱寒', '手脚凉', '淋雨'],
  陈皮理气方: ['胀气', '湿气', '痰', '健脾', '理气', '消化', '腹胀', '积食'],
};
function matchFootbath(status) {
  const text = String(status || '');
  let best = null;
  let bestScore = 0;
  for (const r of dietKb.footbaths) {
    const kws = FOOTBATH_KEYWORDS[r.name] || [];
    let score = 0;
    kws.forEach(k => { if (text.includes(k)) score += 1; });
    if (r.effect && text) {
      // 功效正文命中也给少量分
      String(r.effect).slice(0, 30).split(/[、，。]/).forEach(w => w.length >= 2 && text.includes(w) && (score += 0.5));
    }
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best || dietKb.footbaths.find(r => r.name === '玫瑰疏肝方') || dietKb.footbaths[0];
}

// ---------- 药膳食疗 ----------
function getDietTherapy(type) {
  const map = { tea: 'teas', porridge: 'porridges', dish: 'dishes', soup: 'soups' };
  const key = map[type];
  return key ? dietKb[key] : null;
}

// ---------- 调养方剂（科普层面） ----------
function findFormula(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return null;
  return formulas.find(f => f.name.includes(kw) || kw.includes(f.name))
    || formulas.find(f => [f.effect, f.syndrome, f.ingredients].some(x => String(x || '').includes(kw)))
    || null;
}
function listFormulaNames() {
  return formulas.map(f => f.name);
}

// ---------- 中成药 ----------
function findMedicine(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return null;
  // 名称直接命中优先
  return medicines.find(m => m.name.includes(kw) || kw.includes(m.name))
    || medicines.find(m => [m.effect, m.syndrome, m.ingredients].some(f => String(f || '').includes(kw)))
    || null;
}
function listMedicineNames() {
  return medicines.map(m => m.name);
}

// ---------- 功法 ----------
// 从“6次，1分40秒”“6次，2分”“左右交替进行，6次，1分30秒”等文本解析秒数，解析失败回退 30 秒
function parseMoveSecs(text) {
  const t = String(text || '');
  const m = t.match(/(\d+)\s*分(?:\s*(\d+)\s*秒)?/);
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  const onlySec = t.match(/(\d+)\s*秒/);
  return onlySec ? Number(onlySec[1]) : 30;
}
function getPracticeMoves() {
  return practicesKb.baduanjin.map((m, i) => ({
    id: i + 1,
    name: m.name,
    duration: m.duration,
    secs: parseMoveSecs(m.duration),
    breath: m.breath,
    steps: m.steps,
    mistakes: m.mistakes,
    effect: m.effect,
    cautions: m.cautions,
  }));
}
function getPracticeDetail(name) {
  const kw = String(name || '');
  if (kw.includes('呼吸') || kw.includes('478') || kw.includes('4-7-8')) {
    return { name: '478 呼吸法', ...practicesKb.breathing_478 };
  }
  const move = practicesKb.baduanjin.find(m => m.name.includes(kw) || kw.includes(m.name.replace(/[左右]/g, '')));
  return move || null;
}

// ---------- 体质与症状 ----------
function getConstitution() {
  return constitutionSymptoms.constitutions[0] || null;
}
const SYMPTOM_ALIASES = {
  梅核气: '咽喉异物感', 咽异物: '咽喉异物感', 嗓子: '咽喉异物感', 喉咙: '咽喉异物感',
  睡不着: '失眠多梦', 睡不好: '失眠多梦', 睡眠: '失眠多梦',
  脖子: '肩颈僵硬', 颈椎: '肩颈僵硬', 肩膀: '肩颈僵硬',
  发火: '易怒', 脾气: '易怒', 烦躁: '易怒',
  胸胀: '胸闷', 气短: '胸闷',
  胁痛: '两胁胀痛', 肋骨: '两胁胀痛',
  眩晕: '头晕', 头疼: '头晕',
};
function findSymptom(name) {
  const kw = String(name || '').trim();
  if (!kw) return null;
  const list = constitutionSymptoms.symptoms;
  const direct = list.find(s => s.name.includes(kw) || kw.includes(s.name));
  if (direct) return direct;
  for (const [alias, target] of Object.entries(SYMPTOM_ALIASES)) {
    if (kw.includes(alias)) return list.find(s => s.name === target) || null;
  }
  // 关联证型/表现关键词兜底
  return list.find(s => String(s.syndromes + s.manifestation).includes(kw)) || null;
}
function listSymptomNames() {
  return constitutionSymptoms.symptoms.map(s => s.name);
}

module.exports = {
  listAcupoints,
  getAcupoint,
  firstSentence,
  matchFootbath,
  getDietTherapy,
  findMedicine,
  listMedicineNames,
  findFormula,
  listFormulaNames,
  getPracticeMoves,
  getPracticeDetail,
  getConstitution,
  findSymptom,
  listSymptomNames,
};

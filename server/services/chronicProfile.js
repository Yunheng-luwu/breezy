/**
 * 慢病档案服务
 * - 供 /api/chronic-profile 之外的 AI 编排层读取用户健康背景
 * - 仅拼装简短上下文文本注入系统提示词，用于主动规避调理风险，不做诊断
 */
const { pool } = require('../db/pool');

const YEARS_LABEL = { lt1: '1年以内', '1to3': '1-3年', '3to5': '3-5年', gt5: '5年以上' };
const PREGNANCY_LABEL = {
  none: '',
  trying: '备孕中',
  pregnant: '孕期',
  breastfeeding: '哺乳期',
};

function parseList(raw) {
  if (raw == null) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * 拼装注入给大模型的用户健康背景文本；无任何信息时返回空串
 * 同时汇总慢病档案与健康档案里的体质/过敏史
 */
async function buildHealthContext(userId) {
  let chronic = null;
  let profile = null;
  try {
    const [cRows] = await pool.query(
      'SELECT has_disease, diseases, has_meds, meds, pregnancy FROM chronic_profiles WHERE user_id = ?',
      [userId],
    );
    chronic = cRows[0] || null;
    const [pRows] = await pool.query(
      'SELECT constitution, allergy FROM health_profiles WHERE user_id = ?',
      [userId],
    );
    profile = pRows[0] || null;
  } catch {
    return ''; // 档案查询失败不影响正常对话
  }

  const lines = [];
  if (chronic && chronic.has_disease) {
    const names = parseList(chronic.diseases)
      .map(d => d.name + (YEARS_LABEL[d.years] ? `（${YEARS_LABEL[d.years]}）` : ''))
      .join('、');
    if (names) lines.push('- 已确诊慢病：' + names);
  }
  if (chronic && chronic.has_meds) {
    const names = parseList(chronic.meds).map(m => m.name + (m.dose ? `(${m.dose})` : '')).join('、');
    if (names) lines.push('- 长期服用药物：' + names);
  }
  if (chronic) {
    const pg = PREGNANCY_LABEL[chronic.pregnancy] || '';
    if (pg) lines.push('- 孕哺状态：' + pg);
  }
  if (profile && profile.constitution) lines.push('- 中医体质：' + profile.constitution);
  if (profile && profile.allergy) lines.push('- 过敏史：' + profile.allergy);

  if (!lines.length) return '';
  return '【用户健康背景（仅用于主动规避泡脚/功法/穴位/食疗的禁忌，不得据此做诊断或危言耸听，用户未聊到相关话题时不要刻意提起）】\n'
    + lines.join('\n');
}

module.exports = { buildHealthContext };

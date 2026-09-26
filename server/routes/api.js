/**
 * 松序 - API路由（业务接口）
 * 数据全部读写 MySQL/MariaDB（songxu 库），响应结构与旧版 mock 保持一致
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { signToken, optionalAuth, requireAuth, hashPassword, verifyPassword } = require('../middleware/auth');
const { getClothingByWeather } = require('../services/weather');
const {
  dietData, clothingData, exerciseData,
  practiceStretchData, practiceOfficeData,
} = require('../services/contentData');

// 所有路由先做可选认证（有 token 解析出 req.userId，无 token 按演示用户处理）
router.use(optionalAuth);

// ============ 通用工具 ============

// 异步路由错误统一处理
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// 当前用户：请求带有效 token 用其身份，否则用演示用户（be-2 后逐步收紧）
const getUserId = (req) => req.userId || 1;

// ============ 静态内容（与数据库无关） ============
// 静态数据统一放在 services/contentData.js，供本路由与 AI 工具层共用

const aiReplies = {
  '睡不着': '建议睡前按揉神门穴和三阴交各3分钟，配合478呼吸法（吸气4秒、屏息7秒、呼气8秒），重复4轮。另外23点前放下手机，让肝胆经正常排毒。',
  '生气': '生气后肝气上逆，建议立刻按揉太冲穴（足背第一二跖骨间）5分钟，配合深呼吸。再泡一杯玫瑰花茶疏肝理气。记住：生气伤肝，疏解比压抑好。',
  '肩颈': '肩颈僵硬多因久坐气滞，建议按揉风池穴和肩井穴各3分钟。每小时起身做扩胸运动2分钟，疏通胆经气血运行。',
  '吃什么': '今日适合喝陈皮红枣茶（陈皮3g+红枣5颗），午餐搭配菠菜猪肝汤养血疏肝。忌冰饮和辛辣，避免加重肝郁。',
};

// ============ 接口定义 ============

// 健康仪表盘
router.get('/health/dashboard', wrap(async (req, res) => {
  const userId = getUserId(req);
  const [users] = await pool.query(
    'SELECT score, level FROM users WHERE id = ?', [userId],
  );
  const [todos] = await pool.query(
    `SELECT id, content AS text, todo_time AS time, is_done AS done, type
       FROM todos
      WHERE user_id = ? AND todo_date = CURDATE()
      ORDER BY todo_time`, [userId],
  );
  const user = users[0] || { score: 62, level: '轻度肝郁' };
  const desc = user.score >= 80 ? '肝郁明显，建议及时调理并关注情绪'
    : user.score >= 50 ? '气机略滞，适合按揉太冲穴疏解'
      : '状态平稳，继续保持良好作息';
  res.json({
    success: true,
    data: {
      score: user.score,
      level: user.level,
      desc,
      weather: '阴 18°C',
      city: '杭州',
      todos: todos.map(t => ({ ...t, done: !!t.done })),
    },
  });
}));

// 穴位数据（按分类）
router.get('/care/acupoints', wrap(async (req, res) => {
  const cat = req.query.category || 'stress';
  const [rows] = await pool.query(
    `SELECT id, name, tag, effect, icon FROM acupoints
      WHERE category = ? ORDER BY id`, [cat],
  );
  res.json({ success: true, data: rows });
}));

// 穴位详情
router.get('/care/acupoints/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, tag, effect, icon, location, method, duration, frequency
       FROM acupoints WHERE id = ?`, [req.params.id],
  );
  if (!rows[0]) {
    return res.status(404).json({ success: false, message: '穴位不存在' });
  }
  res.json({ success: true, data: rows[0] });
}));

// 泡脚配方生成（按状态关键词匹配）
router.post('/care/footbath', wrap(async (req, res) => {
  const status = (req.body.status || '').trim();
  if (!status) {
    return res.status(400).json({ success: false, message: '请输入你今天的状态' });
  }
  const [rows] = await pool.query(
    'SELECT name, herbs, water_temp AS temp, duration, keywords FROM footbath_recipes',
  );
  let recipe = rows.find(r => r.is_default) || rows[0];
  const hit = rows.find(r => r.keywords && r.keywords.split(',').some(k => k && status.includes(k)));
  if (hit) recipe = hit;
  res.json({ success: true, data: { name: recipe.name, herbs: recipe.herbs, temp: recipe.temp, duration: recipe.duration } });
}));

// 饮食推荐
router.get('/diet/recommend', (req, res) => {
  res.json({ success: true, data: dietData.recommend });
});

router.get('/diet/foods', (req, res) => {
  res.json({ success: true, data: { good: dietData.goodFoods, bad: dietData.badFoods } });
});

router.get('/diet/recipes', (req, res) => {
  res.json({ success: true, data: { items: dietData.recipes, pool: dietData.recipePool } });
});

// 穿衣建议（be-7：真实天气，失败回退默认数据）
router.get('/clothing', wrap(async (req, res) => {
  const data = await getClothingByWeather(req);
  res.json({ success: true, data: data || clothingData });
}));

// 运动建议
router.get('/rhythm/exercise', (req, res) => {
  res.json({ success: true, data: exerciseData });
});

// 情绪打卡（落库）
router.post('/rhythm/mood', wrap(async (req, res) => {
  const mood = (req.body.mood || '未知').toString().trim().slice(0, 20) || '未知';
  await pool.query('INSERT INTO mood_checkins (user_id, mood) VALUES (?, ?)', [getUserId(req), mood]);
  res.json({ success: true, message: '情绪已记录: ' + mood });
}));

// 作息打卡：查近 7 天 + 今日记录
router.get('/rhythm/sleep', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(checkin_date, '%Y-%m-%d') AS date, sleep_time AS sleepTime, wake_time AS wakeTime
       FROM sleep_checkins
      WHERE user_id = ? AND checkin_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      ORDER BY checkin_date`,
    [getUserId(req)],
  );
  const [todayRows] = await pool.query(
    `SELECT sleep_time AS sleepTime, wake_time AS wakeTime
       FROM sleep_checkins WHERE user_id = ? AND checkin_date = CURDATE()`,
    [getUserId(req)],
  );
  res.json({ success: true, data: { week: rows, today: todayRows[0] || null } });
}));

// 作息打卡：当天 upsert（HH:mm 校验）
router.post('/rhythm/sleep', wrap(async (req, res) => {
  const sleepTime = (req.body.sleepTime || '').trim();
  const wakeTime = (req.body.wakeTime || '').trim();
  if (!sleepTime || !TIME_RE.test(sleepTime)) {
    return res.status(400).json({ success: false, message: '请选择入睡时间（HH:mm）' });
  }
  if (!wakeTime || !TIME_RE.test(wakeTime)) {
    return res.status(400).json({ success: false, message: '请选择起床时间（HH:mm）' });
  }
  await pool.query(
    `INSERT INTO sleep_checkins (user_id, checkin_date, sleep_time, wake_time)
     VALUES (?, CURDATE(), ?, ?)
     ON DUPLICATE KEY UPDATE sleep_time = VALUES(sleep_time), wake_time = VALUES(wake_time)`,
    [getUserId(req), sleepTime, wakeTime],
  );
  res.json({ success: true, message: '今日作息已打卡' });
}));

// ============ 待办事项（be-4） ============

const TODO_TYPES = ['med', 'ai', 'sleep', 'diet'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// 按日查询待办（不传 date 默认今天）
router.get('/todos', wrap(async (req, res) => {
  const date = (req.query.date || '').trim();
  if (date && !DATE_RE.test(date)) {
    return res.status(400).json({ success: false, message: '日期格式应为 YYYY-MM-DD' });
  }
  const [rows] = await pool.query(
    `SELECT id, content AS text, todo_time AS time, is_done AS done, type
       FROM todos
      WHERE user_id = ? AND todo_date = COALESCE(?, CURDATE())
      ORDER BY todo_time`,
    [getUserId(req), date || null],
  );
  res.json({ success: true, data: rows.map(t => ({ ...t, done: !!t.done })) });
}));

// 创建待办
router.post('/todos', wrap(async (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content) {
    return res.status(400).json({ success: false, message: '请输入待办内容' });
  }
  const time = (req.body.time || '').trim();
  if (time && !TIME_RE.test(time)) {
    return res.status(400).json({ success: false, message: '提醒时间格式应为 HH:mm' });
  }
  const type = TODO_TYPES.includes(req.body.type) ? req.body.type : 'ai';
  const date = (req.body.date || '').trim();
  if (date && !DATE_RE.test(date)) {
    return res.status(400).json({ success: false, message: '日期格式应为 YYYY-MM-DD' });
  }
  const [result] = await pool.query(
    'INSERT INTO todos (user_id, content, todo_time, type, todo_date) VALUES (?, ?, ?, ?, COALESCE(?, CURDATE()))',
    [getUserId(req), content.slice(0, 255), time, type, date || null],
  );
  res.json({ success: true, data: { id: result.insertId }, message: '待办已添加' });
}));

// 批量标记当天全部完成/未完成
router.post('/todos/toggle-all', wrap(async (req, res) => {
  const date = (req.body.date || '').trim();
  if (date && !DATE_RE.test(date)) {
    return res.status(400).json({ success: false, message: '日期格式应为 YYYY-MM-DD' });
  }
  const done = req.body.done === false ? 0 : 1;
  await pool.query(
    'UPDATE todos SET is_done = ? WHERE user_id = ? AND todo_date = COALESCE(?, CURDATE())',
    [done, getUserId(req), date || null],
  );
  res.json({ success: true, message: done ? '已全部标记完成' : '已全部标记未完成' });
}));

// 待办：切换完成状态
router.post('/todos/:id/toggle', wrap(async (req, res) => {
  const [result] = await pool.query(
    'UPDATE todos SET is_done = 1 - is_done WHERE id = ? AND user_id = ?',
    [req.params.id, getUserId(req)],
  );
  if (!result.affectedRows) {
    return res.status(404).json({ success: false, message: '待办不存在' });
  }
  res.json({ success: true });
}));

// 删除待办
router.delete('/todos/:id', wrap(async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM todos WHERE id = ? AND user_id = ?',
    [req.params.id, getUserId(req)],
  );
  if (!result.affectedRows) {
    return res.status(404).json({ success: false, message: '待办不存在' });
  }
  res.json({ success: true, message: '待办已删除' });
}));

// AI对话（旧版关键词模拟，AI 能力已由独立服务 songxu-ai 提供）
router.post('/chat/message', (req, res) => {
  const msg = req.body.message || '';
  let reply = '';
  for (const key in aiReplies) {
    if (msg.includes(key)) {
      reply = aiReplies[key];
      break;
    }
  }
  if (!reply) {
    reply = '我理解你的感受。建议你先做一个深呼吸，然后告诉我具体的不适症状，我可以为你推荐对应的穴位或饮食调理方案~';
  }
  res.json({ success: true, data: { reply } });
});

// AI疏肝处方（旧版模拟，待 AI 阶段接入后更新）
router.get('/chat/prescription', (req, res) => {
  res.json({
    success: true,
    data: {
      emotion: '今日肝郁指数62，气机略滞。建议午休时到户外走5分钟，让肝气舒展。',
      action: '按揉太冲穴5分钟 + 478呼吸法4轮',
      warm: '身体比你想象的更聪明，给它一点时间和耐心，它会慢慢好起来的 \u{1F49B}',
    },
  });
});

// 症状记录（读写库）
router.get('/record/symptoms', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT symptom, severity,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS time,
            IFNULL(cause, '') AS cause
       FROM symptoms WHERE user_id = ?
      ORDER BY created_at DESC`, [getUserId(req)],
  );
  res.json({ success: true, data: rows });
}));

router.post('/record/symptoms', wrap(async (req, res) => {
  const symptom = (req.body.symptom || '').trim();
  if (!symptom) {
    return res.status(400).json({ success: false, message: '请选择或输入症状' });
  }
  await pool.query(
    'INSERT INTO symptoms (user_id, symptom, severity, cause) VALUES (?, ?, ?, ?)',
    [getUserId(req), symptom.slice(0, 50), req.body.severity || '轻度', (req.body.cause || '').slice(0, 255)],
  );
  res.json({ success: true, message: '症状已记录' });
}));

// 用药提醒（读库 + 打卡落库）
router.get('/record/medicines', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, dose, med_time AS time, note,
            DATE_FORMAT(last_punch_at, '%Y-%m-%d %H:%i') AS lastPunch
       FROM medicines WHERE user_id = ? ORDER BY id`, [getUserId(req)],
  );
  res.json({ success: true, data: rows });
}));

router.post('/record/medicines/:id/punch', wrap(async (req, res) => {
  const [result] = await pool.query(
    'UPDATE medicines SET last_punch_at = NOW() WHERE id = ? AND user_id = ?',
    [req.params.id, getUserId(req)],
  );
  if (!result.affectedRows) {
    return res.status(404).json({ success: false, message: '用药提醒不存在' });
  }
  res.json({ success: true, message: '已打卡' });
}));

// 新增用药提醒
router.post('/record/medicines', wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, message: '请输入药品名称' });
  }
  const dose = (req.body.dose || '').trim().slice(0, 50);
  const medTime = (req.body.time || '').trim().slice(0, 50);
  const note = (req.body.note || '').trim().slice(0, 255);
  const [result] = await pool.query(
    'INSERT INTO medicines (user_id, name, dose, med_time, note) VALUES (?, ?, ?, ?, ?)',
    [getUserId(req), name.slice(0, 100), dose, medTime, note],
  );
  res.json({ success: true, data: { id: result.insertId }, message: '用药提醒已添加' });
}));

// 删除用药提醒
router.delete('/record/medicines/:id', wrap(async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM medicines WHERE id = ? AND user_id = ?',
    [req.params.id, getUserId(req)],
  );
  if (!result.affectedRows) {
    return res.status(404).json({ success: false, message: '用药提醒不存在' });
  }
  res.json({ success: true, message: '用药提醒已删除' });
}));

// 症状近 7 天统计（供周趋势图）
router.get('/record/symptoms/stats', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS cnt
       FROM symptoms
      WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)`,
    [getUserId(req)],
  );
  const map = new Map(rows.map(r => [String(r.day).slice(0, 10), Number(r.cnt)]));
  const localDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    days.push({ date: key, count: map.get(key) || 0 });
  }
  const [[{ monthCount }]] = await pool.query(
    `SELECT COUNT(*) AS monthCount FROM symptoms
      WHERE user_id = ? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    [getUserId(req)],
  );
  res.json({ success: true, data: { days, monthCount } });
}));

// ============ 注册 / 登录（账号 + 密码，be-10） ============

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^[a-zA-Z0-9]{6,16}$/;

// 注册：账号 + 昵称 + 邮箱 + 密码 → 创建用户并直接登录
router.post('/auth/register', wrap(async (req, res) => {
  const username = (req.body.username || '').trim();
  const nickname = ((req.body.nickname || '').trim() || '小松').slice(0, 50);
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ success: false, message: '账号须为 3-20 位字母、数字或下划线' });
  }
  if (!EMAIL_RE.test(email) || email.length > 100) {
    return res.status(400).json({ success: false, message: '请输入正确的邮箱地址' });
  }
  if (!PASSWORD_RE.test(password)) {
    return res.status(400).json({ success: false, message: '密码须为 6-16 位字母或数字' });
  }

  const [exist] = await pool.query(
    'SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 2',
    [username, email],
  );
  if (exist.some(r => r.username === username)) {
    return res.status(400).json({ success: false, message: '该账号已被注册' });
  }
  if (exist.some(r => r.email === email)) {
    return res.status(400).json({ success: false, message: '该邮箱已被注册' });
  }

  const [result] = await pool.query(
    'INSERT INTO users (username, email, password_hash, name) VALUES (?, ?, ?, ?)',
    [username, email, hashPassword(password), nickname],
  );
  const token = signToken(result.insertId);
  res.json({
    success: true,
    message: '注册成功',
    user: { name: nickname, username, email, score: 62, level: '轻度肝郁' },
    token,
  });
}));

// 登录：账号（用户名或邮箱）+ 密码 → JWT
router.post('/auth/login', wrap(async (req, res) => {
  const account = (req.body.account || '').trim();
  const password = req.body.password || '';
  if (!account || !password) {
    return res.status(400).json({ success: false, message: '请输入账号和密码' });
  }
  const [rows] = await pool.query(
    'SELECT id, name, username, email, password_hash, score, level FROM users WHERE username = ? OR email = ? LIMIT 1',
    [account, account],
  );
  const u = rows[0];
  if (!u || !u.password_hash || !verifyPassword(password, u.password_hash)) {
    return res.status(401).json({ success: false, message: '账号或密码错误' });
  }
  res.json({
    success: true,
    user: { name: u.name, username: u.username, email: u.email, score: u.score, level: u.level },
    token: signToken(u.id),
  });
}));

// 当前登录用户信息（登录态持久化校验）
router.get('/auth/me', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT name, username, email, score, level FROM users WHERE id = ?', [req.userId],
  );
  if (!rows[0]) {
    return res.status(401).json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true, data: rows[0] });
}));

// 功法动作：group=baduanjin 查库（默认），stretch/office 返回静态动作
router.get('/practice/moves', wrap(async (req, res) => {
  const group = req.query.group || 'baduanjin';
  if (group === 'stretch') {
    return res.json({ success: true, data: practiceStretchData.map((m, i) => ({ id: 100 + i, name: m.name, duration: m.duration, desc: m.desc })) });
  }
  if (group === 'office') {
    return res.json({ success: true, data: practiceOfficeData.map((m, i) => ({ id: 200 + i, name: m.name, duration: m.duration, desc: m.desc })) });
  }
  const [rows] = await pool.query(
    'SELECT id, name, duration FROM practice_moves ORDER BY sort_order',
  );
  res.json({ success: true, data: rows });
}));

// ============ 健康档案（be-3） ============

// 查询档案：用户基础信息（含肝郁指数）+ 健康档案，无档案时自动补空行
router.get('/profile', wrap(async (req, res) => {
  const userId = getUserId(req);
  const profileSql = `
    SELECT constitution, allergy, diet_pref, exercise_pref, sleep_pref, body_sense, updated_at
      FROM health_profiles WHERE user_id = ?`;
  const [users] = await pool.query('SELECT name, username, email, score, level FROM users WHERE id = ?', [userId]);
  let [rows] = await pool.query(profileSql, [userId]);
  if (!rows[0]) {
    await pool.query('INSERT IGNORE INTO health_profiles (user_id) VALUES (?)', [userId]);
    [rows] = await pool.query(profileSql, [userId]);
  }
  const u = users[0] || {};
  const p = rows[0] || {};
  res.json({
    success: true,
    data: {
      name: u.name, username: u.username, email: u.email,
      score: u.score, level: u.level,
      constitution: p.constitution, allergy: p.allergy,
      dietPref: p.diet_pref, exercisePref: p.exercise_pref,
      sleepPref: p.sleep_pref, bodySense: p.body_sense,
      updatedAt: p.updated_at,
    },
  });
}));

// 更新档案：支持只提交部分字段；肝郁指数单独写入 users 表
router.put('/profile', wrap(async (req, res) => {
  const userId = getUserId(req);
  const body = req.body || {};
  // 前端字段名 → 数据库列名（值长度上限）
  const fieldMap = {
    constitution: ['constitution', 50],
    allergy: ['allergy', 255],
    dietPref: ['diet_pref', 50],
    exercisePref: ['exercise_pref', 50],
    sleepPref: ['sleep_pref', 50],
    bodySense: ['body_sense', 50],
  };

  // 与现有档案合并：未提交的字段保持原值
  const [rows] = await pool.query('SELECT * FROM health_profiles WHERE user_id = ?', [userId]);
  const cur = rows[0] || {};
  const merged = {};
  for (const [jsKey, [col, max]] of Object.entries(fieldMap)) {
    if (body[jsKey] !== undefined) {
      const v = body[jsKey];
      if (v !== null && typeof v !== 'string') {
        return res.status(400).json({ success: false, message: jsKey + ' 须为字符串' });
      }
      merged[col] = v === null ? null : (v.trim().slice(0, max) || null);
    } else {
      merged[col] = cur[col] !== undefined ? cur[col] : null;
    }
  }

  // 肝郁指数：可选；未显式给 level 时按分数推导
  if (body.score !== undefined) {
    const s = Number(body.score);
    if (!Number.isInteger(s) || s < 0 || s > 100) {
      return res.status(400).json({ success: false, message: '肝郁指数须为 0-100 的整数' });
    }
    const level = typeof body.level === 'string' && body.level.trim()
      ? body.level.trim().slice(0, 20)
      : s >= 80 ? '重度肝郁' : s >= 50 ? '轻度肝郁' : s >= 30 ? '轻微肝郁' : '气机平和';
    await pool.query('UPDATE users SET score = ?, level = ? WHERE id = ?', [s, level, userId]);
  }

  await pool.query(
    `INSERT INTO health_profiles (user_id, constitution, allergy, diet_pref, exercise_pref, sleep_pref, body_sense)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       constitution = VALUES(constitution), allergy = VALUES(allergy),
       diet_pref = VALUES(diet_pref), exercise_pref = VALUES(exercise_pref),
       sleep_pref = VALUES(sleep_pref), body_sense = VALUES(body_sense)`,
    [userId, merged.constitution, merged.allergy, merged.diet_pref,
      merged.exercise_pref, merged.sleep_pref, merged.body_sense],
  );
  res.json({ success: true, message: '健康档案已保存' });
}));

// 个人中心数据总览：本月症状数、近7天作息打卡天数与平均入睡时间、当前肝郁指数
router.get('/profile/stats', wrap(async (req, res) => {
  const userId = getUserId(req);
  const [[sym]] = await pool.query(
    `SELECT COUNT(*) AS monthCount FROM symptoms
      WHERE user_id = ? AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`, [userId],
  );
  const [sleepRows] = await pool.query(
    `SELECT sleep_time AS sleepTime FROM sleep_checkins
      WHERE user_id = ? AND checkin_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`, [userId],
  );
  // 平均入睡时间：凌晨 0-12 点的时刻按前一夜 +24h 计算后再回转
  let avgSleep = '';
  if (sleepRows.length) {
    const mins = sleepRows.map(r => {
      const [h, m] = r.sleepTime.split(':').map(Number);
      return h < 12 ? h * 60 + m + 24 * 60 : h * 60 + m;
    });
    const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) % (24 * 60);
    avgSleep = String(Math.floor(avg / 60)).padStart(2, '0') + ':' + String(avg % 60).padStart(2, '0');
  }
  const [users] = await pool.query('SELECT score FROM users WHERE id = ?', [userId]);
  res.json({
    success: true,
    data: {
      avgSleep,
      sleepDays: sleepRows.length,
      monthSymptomCount: sym.monthCount,
      score: users[0] ? users[0].score : null,
    },
  });
}));

// 统一错误处理（异步路由抛错时返回 JSON 而非 HTML 错误页）
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[api] 接口错误:', err.message);
  res.status(500).json({ success: false, message: '服务内部错误，请稍后重试' });
});

module.exports = router;

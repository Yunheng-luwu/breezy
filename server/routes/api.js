/**
 * 松序 - API路由（业务接口）
 * 数据全部读写 MySQL/MariaDB（songxu 库）
 * be-8 标准化：统一 { success, data, message } 信封；个人数据与写操作强制登录；
 *             错误统一 throw ApiError 由全局中间件处理
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../db/pool');
const { signToken, requireAuth, hashPassword, verifyPassword } = require('../middleware/auth');
const { getClothingByWeather, getClothingByAdcode, searchCity, locateByLngLat } = require('../services/weather');
const {
  ApiError, ok, wrap, cleanStr, optionalDate, timeField, enumOr, TIME_RE,
} = require('../utils/http');
const {
  dietData, clothingData, exerciseData,
  practiceStretchData, practiceOfficeData,
} = require('../services/contentData');
const kb = require('../services/knowledge');
const { recommendMeals, buildDietPrinciple, rankFoodGroups } = require('../services/dietRecommend');

// 登录用户的个性化信号：肝郁指数 + 近30天症状（未登录/查库失败返回空，调用方降级为通用推荐）
async function getUserSignals(req) {
  if (!req.userId) return { user: null, symptoms: [] };
  try {
    const [users] = await pool.query('SELECT score, level FROM users WHERE id = ?', [req.userId]);
    const [syms] = await pool.query(
      `SELECT symptom, COUNT(*) AS count FROM symptoms
        WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY symptom ORDER BY count DESC LIMIT 6`, [req.userId],
    );
    return { user: users[0] || null, symptoms: syms };
  } catch (e) {
    return { user: null, symptoms: [] };
  }
}

// 静态数据统一放在 services/contentData.js，供本路由与 AI 工具层共用

// ============ 静态内容（公开只读，与用户数据无关） ============

// 健康仪表盘
router.get('/health/dashboard', requireAuth, wrap(async (req, res) => {
  const userId = req.userId;
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
  // 天气取真实服务（按来源 IP 定位），失败时留空而不是写死城市
  const w = await getClothingByWeather(req);
  res.json({
    success: true,
    data: {
      score: user.score,
      level: user.level,
      desc,
      weather: w ? `${w.weather} ${w.temp}°C` : '',
      city: w ? w.city : '',
      todos: todos.map(t => ({ ...t, done: !!t.done })),
    },
  });
}));

// 每日一穴智能推荐：节气 + 肝郁指数 + 近30天症状 融合打分，同一天结果稳定
const { recommendDailyAcupoint } = require('../services/acuRecommend');
router.get('/care/acupoint-of-day', requireAuth, wrap(async (req, res) => {
  const [acus] = await pool.query('SELECT id, category, name, tag, effect, icon, location, method, duration, frequency FROM acupoints');
  const [users] = await pool.query('SELECT score, level FROM users WHERE id = ?', [req.userId]);
  const [syms] = await pool.query(
    `SELECT symptom, COUNT(*) AS count FROM symptoms
      WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY symptom ORDER BY count DESC LIMIT 6`, [req.userId],
  );
  const user = users[0] || null;
  const r = recommendDailyAcupoint(acus, user, syms);
  if (!r) throw new ApiError(404, '穴位库为空');
  ok(res, r);
}));

// 穴位数据（按分类）
router.get('/care/acupoints', wrap(async (req, res) => {
  const cat = req.query.category || 'stress';
  const [rows] = await pool.query(
    `SELECT id, name, tag, effect, icon FROM acupoints
      WHERE category = ? ORDER BY id`, [cat],
  );
  ok(res, rows);
}));

// 穴位详情
router.get('/care/acupoints/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, tag, effect, icon, location, method, duration, frequency
       FROM acupoints WHERE id = ?`, [req.params.id],
  );
  if (!rows[0]) {
    throw new ApiError(404, '穴位不存在');
  }
  ok(res, rows[0]);
}));

// 泡脚配方生成（按状态关键词匹配）
router.post('/care/footbath', wrap(async (req, res) => {
  const status = cleanStr(req.body.status, 255);
  if (!status) {
    throw new ApiError(400, '请输入你今天的状态');
  }
  const [rows] = await pool.query(
    'SELECT name, herbs, water_temp AS temp, duration, keywords, is_default FROM footbath_recipes',
  );
  let recipe = rows.find(r => r.is_default) || rows[0];
  const hit = rows.find(r => r.keywords && r.keywords.split(',').some(k => k && status.includes(k)));
  if (hit) recipe = hit;
  ok(res, { name: recipe.name, herbs: recipe.herbs, temp: recipe.temp, duration: recipe.duration });
}));

// 饮食推荐
// 今日饮食原则：天气+肝郁指数动态生成；无天气时回退静态池按日期轮换
router.get('/diet/recommend', wrap(async (req, res) => {
  const { user } = await getUserSignals(req);
  const weather = await getClothingByWeather(req).catch(() => null);
  let principle = buildDietPrinciple(weather, user);
  if (!principle) {
    const list = dietData.recommend.principles;
    const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    principle = list[doy % list.length];
  }
  ok(res, { ...dietData.recommend, principle });
}));

router.get('/diet/foods', wrap(async (req, res) => {
  const { user, symptoms } = await getUserSignals(req);
  const weather = await getClothingByWeather(req).catch(() => null);
  ok(res, rankFoodGroups(dietData.goodFoods, dietData.badFoods, user, symptoms, weather));
}));

// 食谱推荐：药膳汤谱（与 /diet/soups、AI 工具共用 knowledge 库）按性质并入各餐池，
// 当日推荐按「一年中第几天」从池中确定性轮换——同一天所有人相同，次日自动更换
const SOUP_MEAL = {
  '白术陈皮粥': 'breakfast', '姜汁豆浆': 'breakfast',
  '健脾山药汤': 'lunch', '人参滋补汤': 'lunch',
  '当归生姜羊肉汤': 'dinner',
  '龙眼红枣银耳炖鸡蛋': 'snack',
};
const MEAL_LABEL = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
const RECIPE_POOL = (() => {
  const pool = JSON.parse(JSON.stringify(dietData.recipePool));
  for (const s of (kb.getDietTherapy('soup') || [])) {
    const meal = SOUP_MEAL[s.name];
    if (meal && pool[meal] && !pool[meal].some(r => r.name === s.name)) {
      pool[meal].push({ name: s.name, ingredients: s.ingredients });
    }
  }
  return pool;
})();

router.get('/diet/recipes', wrap(async (req, res) => {
  // 个性化信号：登录才查（肝郁指数 + 近30天症状）；未登录/查库失败按通用推荐
  const { user, symptoms } = await getUserSignals(req);
  const weather = await getClothingByWeather(req).catch(() => null);
  const { items } = recommendMeals(RECIPE_POOL, MEAL_LABEL, user, symptoms, weather);
  ok(res, { items, pool: RECIPE_POOL });
}));

// 药膳汤谱（公开只读，供饮食调理页展示；与 AI 工具共用 knowledge 库）
router.get('/diet/soups', (req, res) => {
  ok(res, { items: kb.getDietTherapy('soup') || [] });
});

// 穿衣建议（be-7：真实天气，失败回退默认数据）
// 支持用户手动选城：?adcode=330100；不传则按来源 IP 定位
router.get('/clothing', wrap(async (req, res) => {
  const adcode = cleanStr(req.query.adcode, 6);
  let data;
  if (adcode) {
    if (!/^\d{6}$/.test(adcode)) throw new ApiError(400, '城市编码格式不正确');
    const city = cleanStr(req.query.city, 20) || '';
    data = await getClothingByAdcode(adcode, city, true);
  } else {
    data = await getClothingByWeather(req);
  }
  ok(res, data || clothingData);
}));

// 城市搜索：用户输入城市名，返回高德候选城市（供手动切换城市）
router.get('/weather/cities', wrap(async (req, res) => {
  const keyword = cleanStr(req.query.keyword, 20);
  if (!keyword) throw new ApiError(400, '请输入城市名');
  const list = await searchCity(keyword);
  ok(res, { items: list });
}));

// 浏览器定位反查：前端 navigator.geolocation 拿到经纬度后换城市编码
router.get('/weather/locate', wrap(async (req, res) => {
  const lng = parseFloat(req.query.lng);
  const lat = parseFloat(req.query.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)
    || lng < 73 || lng > 136 || lat < 3 || lat > 54) {
    throw new ApiError(400, '经纬度不在中国范围内');
  }
  const loc = await locateByLngLat(lng.toFixed(6), lat.toFixed(6));
  ok(res, loc);
}));

// 运动建议
router.get('/rhythm/exercise', (req, res) => {
  ok(res, exerciseData);
});

// 情绪打卡（落库）
router.post('/rhythm/mood', requireAuth, wrap(async (req, res) => {
  const mood = cleanStr(req.body.mood, 20) || '未知';
  await pool.query('INSERT INTO mood_checkins (user_id, mood) VALUES (?, ?)', [req.userId, mood]);
  ok(res, undefined, '情绪已记录: ' + mood);
}));

// 作息打卡：查近 7 天 + 今日记录
router.get('/rhythm/sleep', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(checkin_date, '%Y-%m-%d') AS date, sleep_time AS sleepTime,
            wake_time AS wakeTime, nap_time AS napTime
       FROM sleep_checkins
      WHERE user_id = ? AND checkin_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      ORDER BY checkin_date`,
    [req.userId],
  );
  const [todayRows] = await pool.query(
    `SELECT sleep_time AS sleepTime, wake_time AS wakeTime, nap_time AS napTime
       FROM sleep_checkins WHERE user_id = ? AND checkin_date = CURDATE()`,
    [req.userId],
  );
  ok(res, { week: rows, today: todayRows[0] || null });
}));

// 作息打卡：当天 upsert；起床/入睡/午憩可单独打卡，仅更新本次提交的非空时间
router.post('/rhythm/sleep', requireAuth, wrap(async (req, res) => {
  const sleepTime = timeField(req.body.sleepTime, false, '入睡时间');
  const wakeTime = timeField(req.body.wakeTime, false, '起床时间');
  const napTime = timeField(req.body.napTime, false, '午憩时间');
  if (!sleepTime && !wakeTime && !napTime) {
    throw new ApiError(400, '请至少提交一个打卡时间');
  }
  await pool.query(
    `INSERT INTO sleep_checkins (user_id, checkin_date, sleep_time, wake_time, nap_time)
     VALUES (?, CURDATE(), ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       sleep_time = IF(VALUES(sleep_time) = '', sleep_time, VALUES(sleep_time)),
       wake_time  = IF(VALUES(wake_time)  = '', wake_time,  VALUES(wake_time)),
       nap_time   = IF(VALUES(nap_time)   = '', nap_time,   VALUES(nap_time))`,
    [req.userId, sleepTime, wakeTime, napTime],
  );
  ok(res, undefined, '今日作息已打卡');
}));

// ============ 待办事项（be-4） ============

const TODO_TYPES = ['med', 'ai', 'sleep', 'diet'];

// 按日查询待办（不传 date 默认今天）
router.get('/todos', requireAuth, wrap(async (req, res) => {
  const date = optionalDate(req.query.date);
  const [rows] = await pool.query(
    `SELECT id, content AS text, todo_time AS time, is_done AS done, type
       FROM todos
      WHERE user_id = ? AND todo_date = COALESCE(?, CURDATE())
      ORDER BY todo_time`,
    [req.userId, date || null],
  );
  ok(res, rows.map(t => ({ ...t, done: !!t.done })));
}));

// 创建待办
router.post('/todos', requireAuth, wrap(async (req, res) => {
  const content = cleanStr(req.body.content, 255);
  if (!content) {
    throw new ApiError(400, '请输入待办内容');
  }
  const time = timeField(req.body.time, false, '提醒时间');
  const type = enumOr(req.body.type, TODO_TYPES, 'ai');
  const date = optionalDate(req.body.date);
  const [result] = await pool.query(
    'INSERT INTO todos (user_id, content, todo_time, type, todo_date) VALUES (?, ?, ?, ?, COALESCE(?, CURDATE()))',
    [req.userId, content, time, type, date || null],
  );
  ok(res, { id: result.insertId }, '待办已添加');
}));

// 批量标记当天全部完成/未完成
router.post('/todos/toggle-all', requireAuth, wrap(async (req, res) => {
  const date = optionalDate(req.body.date);
  const done = req.body.done === false ? 0 : 1;
  await pool.query(
    'UPDATE todos SET is_done = ? WHERE user_id = ? AND todo_date = COALESCE(?, CURDATE())',
    [done, req.userId, date || null],
  );
  ok(res, undefined, done ? '已全部标记完成' : '已全部标记未完成');
}));

// 待办：切换完成状态
router.post('/todos/:id/toggle', requireAuth, wrap(async (req, res) => {
  const [result] = await pool.query(
    'UPDATE todos SET is_done = 1 - is_done WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
  );
  if (!result.affectedRows) {
    throw new ApiError(404, '待办不存在');
  }
  ok(res);
}));

// 删除待办
router.delete('/todos/:id', requireAuth, wrap(async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM todos WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
  );
  if (!result.affectedRows) {
    throw new ApiError(404, '待办不存在');
  }
  ok(res, undefined, '待办已删除');
}));

// ============ 症状与用药记录（be-5 / be-6） ============

// 症状记录（读写库）
router.get('/record/symptoms', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT symptom, severity,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS time,
            IFNULL(cause, '') AS cause
       FROM symptoms WHERE user_id = ?
      ORDER BY created_at DESC`, [req.userId],
  );
  ok(res, rows);
}));

router.post('/record/symptoms', requireAuth, wrap(async (req, res) => {
  const symptom = cleanStr(req.body.symptom, 50);
  if (!symptom) {
    throw new ApiError(400, '请选择或输入症状');
  }
  await pool.query(
    'INSERT INTO symptoms (user_id, symptom, severity, cause) VALUES (?, ?, ?, ?)',
    [req.userId, symptom, cleanStr(req.body.severity, 20) || '轻度', cleanStr(req.body.cause, 255)],
  );
  ok(res, undefined, '症状已记录');
}));

// 用药提醒（读库 + 打卡落库）
router.get('/record/medicines', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, name, dose, med_time AS time, note,
            DATE_FORMAT(last_punch_at, '%Y-%m-%d %H:%i') AS lastPunch
       FROM medicines WHERE user_id = ? ORDER BY id`, [req.userId],
  );
  ok(res, rows);
}));

router.post('/record/medicines/:id/punch', requireAuth, wrap(async (req, res) => {
  const [result] = await pool.query(
    'UPDATE medicines SET last_punch_at = NOW() WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
  );
  if (!result.affectedRows) {
    throw new ApiError(404, '用药提醒不存在');
  }
  ok(res, undefined, '已打卡');
}));

// 新增用药提醒
router.post('/record/medicines', requireAuth, wrap(async (req, res) => {
  const name = cleanStr(req.body.name, 100);
  if (!name) {
    throw new ApiError(400, '请输入药品名称');
  }
  const dose = cleanStr(req.body.dose, 50);
  const medTime = cleanStr(req.body.time, 50);
  const note = cleanStr(req.body.note, 255);
  const [result] = await pool.query(
    'INSERT INTO medicines (user_id, name, dose, med_time, note) VALUES (?, ?, ?, ?, ?)',
    [req.userId, name, dose, medTime, note],
  );
  ok(res, { id: result.insertId }, '用药提醒已添加');
}));

// 删除用药提醒
router.delete('/record/medicines/:id', requireAuth, wrap(async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM medicines WHERE id = ? AND user_id = ?',
    [req.params.id, req.userId],
  );
  if (!result.affectedRows) {
    throw new ApiError(404, '用药提醒不存在');
  }
  ok(res, undefined, '用药提醒已删除');
}));

// 症状近 7 天统计（供周趋势图）
router.get('/record/symptoms/stats', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS cnt
       FROM symptoms
      WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)`,
    [req.userId],
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
    [req.userId],
  );
  ok(res, { days, monthCount });
}));

// ============ 用户收藏（跟随账号，多端同步） ============

const FAV_TYPES = ['recipe'];

function parseFavRow(row) {
  let meta = {};
  try { meta = row.meta ? JSON.parse(row.meta) : {}; } catch (e) { meta = {}; }
  return {
    type: row.fav_type,
    name: row.target_name,
    time: meta.time || '',
    ingredients: meta.ingredients || '',
    createdAt: row.created_at,
  };
}

// 收藏列表（默认食谱）
router.get('/favorites', requireAuth, wrap(async (req, res) => {
  const type = enumOr(req.query.type, FAV_TYPES, 'recipe');
  const [rows] = await pool.query(
    'SELECT fav_type, target_name, meta, created_at FROM user_favorites WHERE user_id = ? AND fav_type = ? ORDER BY id DESC',
    [req.userId, type],
  );
  ok(res, rows.map(parseFavRow));
}));

// 添加收藏：支持单条 {type,name,time,ingredients} 或批量数组（用于本地收藏一次性迁移）
router.post('/favorites', requireAuth, wrap(async (req, res) => {
  const list = Array.isArray(req.body.items) ? req.body.items : [req.body];
  const rows = [];
  for (const item of list.slice(0, 200)) {
    const type = enumOr(item && item.type, FAV_TYPES, 'recipe');
    const name = cleanStr(item && item.name, 100);
    if (!name) continue;
    const meta = JSON.stringify({
      time: cleanStr(item.time, 20),
      ingredients: cleanStr(item.ingredients, 200),
    });
    await pool.query(
      'INSERT IGNORE INTO user_favorites (user_id, fav_type, target_name, meta) VALUES (?, ?, ?, ?)',
      [req.userId, type, name, meta],
    );
    rows.push({ type, name });
  }
  ok(res, { count: rows.length }, rows.length ? '已收藏' : '没有可收藏的内容');
}));

// 取消收藏
router.delete('/favorites', requireAuth, wrap(async (req, res) => {
  const type = enumOr(req.body.type, FAV_TYPES, 'recipe');
  const name = cleanStr(req.body.name, 100);
  if (!name) {
    throw new ApiError(400, '缺少收藏名称');
  }
  const [result] = await pool.query(
    'DELETE FROM user_favorites WHERE user_id = ? AND fav_type = ? AND target_name = ?',
    [req.userId, type, name],
  );
  if (!result.affectedRows) {
    throw new ApiError(404, '收藏不存在');
  }
  ok(res, undefined, '已取消收藏');
}));

// ============ 注册 / 登录（账号 + 密码，be-2） ============

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^[a-zA-Z0-9]{6,16}$/;

// 注册：账号 + 昵称 + 邮箱 + 密码 → 创建用户并直接登录
router.post('/auth/register', wrap(async (req, res) => {
  const username = cleanStr(req.body.username, 20);
  const nickname = cleanStr(req.body.nickname, 50) || '小松';
  const email = cleanStr(req.body.email, 100);
  const password = req.body.password || '';

  if (!USERNAME_RE.test(username)) {
    throw new ApiError(400, '账号须为 3-20 位字母、数字或下划线');
  }
  if (!EMAIL_RE.test(email)) {
    throw new ApiError(400, '请输入正确的邮箱地址');
  }
  if (!PASSWORD_RE.test(password)) {
    throw new ApiError(400, '密码须为 6-16 位字母或数字');
  }

  const [exist] = await pool.query(
    'SELECT username, email FROM users WHERE username = ? OR email = ? LIMIT 2',
    [username, email],
  );
  if (exist.some(r => r.username === username)) {
    throw new ApiError(400, '该账号已被注册');
  }
  if (exist.some(r => r.email === email)) {
    throw new ApiError(400, '该邮箱已被注册');
  }

  const [result] = await pool.query(
    'INSERT INTO users (username, email, password_hash, name) VALUES (?, ?, ?, ?)',
    [username, email, hashPassword(password), nickname],
  );
  const token = signToken(result.insertId);
  ok(res, {
    token,
    user: { name: nickname, username, email, score: 62, level: '轻度肝郁' },
  }, '注册成功');
}));

// 登录：账号（用户名或邮箱）+ 密码 → JWT
router.post('/auth/login', wrap(async (req, res) => {
  const account = cleanStr(req.body.account, 100);
  const password = req.body.password || '';
  if (!account || !password) {
    throw new ApiError(400, '请输入账号和密码');
  }
  const [rows] = await pool.query(
    'SELECT id, name, username, email, password_hash, score, level, avatar FROM users WHERE username = ? OR email = ? LIMIT 1',
    [account, account],
  );
  const u = rows[0];
  if (!u || !u.password_hash || !verifyPassword(password, u.password_hash)) {
    throw new ApiError(401, '账号或密码错误');
  }
  ok(res, {
    token: signToken(u.id),
    user: { name: u.name, username: u.username, email: u.email, score: u.score, level: u.level, avatar: u.avatar },
  });
}));

// 当前登录用户信息（登录态持久化校验）
router.get('/auth/me', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT name, username, email, score, level, avatar FROM users WHERE id = ?', [req.userId],
  );
  if (!rows[0]) {
    throw new ApiError(401, '用户不存在');
  }
  ok(res, rows[0]);
}));

// 功法动作：group=baduanjin 读中医知识库（默认，含分步/呼吸/易错点），stretch/office 返回静态动作
router.get('/practice/moves', wrap(async (req, res) => {
  const group = req.query.group || 'baduanjin';
  if (group === 'stretch') {
    return ok(res, practiceStretchData.map((m, i) => ({ id: 100 + i, name: m.name, duration: m.duration, desc: m.desc })));
  }
  if (group === 'office') {
    return ok(res, practiceOfficeData.map((m, i) => ({ id: 200 + i, name: m.name, duration: m.duration, desc: m.desc })));
  }
  ok(res, kb.getPracticeMoves());
}));

// ============ 健康档案（be-3） ============

// 查询档案：用户基础信息（含肝郁指数）+ 健康档案，无档案时自动补空行
router.get('/profile', requireAuth, wrap(async (req, res) => {
  const userId = req.userId;
  const profileSql = `
    SELECT constitution, allergy, diet_pref, exercise_pref, sleep_pref, body_sense,
           wake_time, nap_time, bed_time, updated_at
      FROM health_profiles WHERE user_id = ?`;
  const [users] = await pool.query('SELECT name, username, email, score, level, avatar FROM users WHERE id = ?', [userId]);
  let [rows] = await pool.query(profileSql, [userId]);
  if (!rows[0]) {
    await pool.query('INSERT IGNORE INTO health_profiles (user_id) VALUES (?)', [userId]);
    [rows] = await pool.query(profileSql, [userId]);
  }
  const u = users[0] || {};
  const p = rows[0] || {};
  ok(res, {
    name: u.name, username: u.username, email: u.email,
    score: u.score, level: u.level, avatar: u.avatar,
    constitution: p.constitution, allergy: p.allergy,
    dietPref: p.diet_pref, exercisePref: p.exercise_pref,
    sleepPref: p.sleep_pref, bodySense: p.body_sense,
    wakeTime: p.wake_time, napTime: p.nap_time, bedTime: p.bed_time,
    updatedAt: p.updated_at,
  });
}));

// 更新档案：支持只提交部分字段；肝郁指数单独写入 users 表
router.put('/profile', requireAuth, wrap(async (req, res) => {
  const userId = req.userId;
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
        throw new ApiError(400, jsKey + ' 须为字符串');
      }
      merged[col] = v === null ? null : (v.trim().slice(0, max) || null);
    } else {
      merged[col] = cur[col] !== undefined ? cur[col] : null;
    }
  }

  // 目标作息时间：HH:mm 校验，传 null 可清空；未提交则保持原值
  const timeLabels = { wakeTime: '起床时间', napTime: '午憩时间', bedTime: '入睡时间' };
  const timeCols = { wakeTime: 'wake_time', napTime: 'nap_time', bedTime: 'bed_time' };
  for (const [jsKey, col] of Object.entries(timeCols)) {
    if (body[jsKey] === undefined) {
      merged[col] = cur[col] !== undefined ? cur[col] : null;
      continue;
    }
    const v = body[jsKey];
    if (v === null || v === '') { merged[col] = null; continue; }
    if (typeof v !== 'string' || !TIME_RE.test(v.trim())) {
      throw new ApiError(400, `${timeLabels[jsKey]}格式应为 HH:mm`);
    }
    merged[col] = v.trim();
  }

  // 昵称：可选，写入 users.name（限长 50）
  if (body.name !== undefined) {
    const name = cleanStr(body.name, 50);
    if (!name) {
      throw new ApiError(400, '昵称不能为空');
    }
    await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, userId]);
  }

  // 肝郁指数：可选；未显式给 level 时按分数推导
  if (body.score !== undefined) {
    const s = Number(body.score);
    if (!Number.isInteger(s) || s < 0 || s > 100) {
      throw new ApiError(400, '肝郁指数须为 0-100 的整数');
    }
    const level = typeof body.level === 'string' && body.level.trim()
      ? body.level.trim().slice(0, 20)
      : s >= 80 ? '重度肝郁' : s >= 50 ? '轻度肝郁' : s >= 30 ? '轻微肝郁' : '气机平和';
    await pool.query('UPDATE users SET score = ?, level = ? WHERE id = ?', [s, level, userId]);
  }

  await pool.query(
    `INSERT INTO health_profiles
       (user_id, constitution, allergy, diet_pref, exercise_pref, sleep_pref, body_sense,
        wake_time, nap_time, bed_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       constitution = VALUES(constitution), allergy = VALUES(allergy),
       diet_pref = VALUES(diet_pref), exercise_pref = VALUES(exercise_pref),
       sleep_pref = VALUES(sleep_pref), body_sense = VALUES(body_sense),
       wake_time = VALUES(wake_time), nap_time = VALUES(nap_time), bed_time = VALUES(bed_time)`,
    [userId, merged.constitution, merged.allergy, merged.diet_pref,
      merged.exercise_pref, merged.sleep_pref, merged.body_sense,
      merged.wake_time, merged.nap_time, merged.bed_time],
  );
  ok(res, undefined, '健康档案已保存');
}));

// ============ 慢病档案问卷 ============

const DISEASE_WHITELIST = new Set([
  '高血压', '糖尿病', '冠心病/心脏病', '胃病（胃炎/胃溃疡）', '肝病',
  '甲状腺疾病（甲亢/甲减）', '哮喘/慢阻肺', '长期失眠', '焦虑/抑郁',
  '颈椎病/腰椎病', '其他',
]);
const YEARS_ENUM = new Set(['lt1', '1to3', '3to5', 'gt5']);
const PREGNANCY_ENUM = new Set(['none', 'trying', 'pregnant', 'breastfeeding']);

function parseJsonList(raw) {
  if (raw == null) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// 查询慢病档案：未填写时 data 为 null
router.get('/chronic-profile', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT has_disease, diseases, has_meds, meds, pregnancy, updated_at FROM chronic_profiles WHERE user_id = ?',
    [req.userId],
  );
  if (!rows[0]) { ok(res, null); return; }
  const r = rows[0];
  ok(res, {
    hasDisease: !!r.has_disease,
    diseases: parseJsonList(r.diseases),
    hasMeds: !!r.has_meds,
    meds: parseJsonList(r.meds),
    pregnancy: r.pregnancy || 'none',
    updatedAt: r.updated_at,
  });
}));

// 保存慢病档案（整份问卷一次性提交，UPSERT）
router.put('/chronic-profile', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  const hasDisease = b.hasDisease === true;
  const hasMeds = b.hasMeds === true;

  let diseases = [];
  if (hasDisease) {
    if (!Array.isArray(b.diseases)) throw new ApiError(400, '慢病列表格式不正确');
    if (b.diseases.length === 0) throw new ApiError(400, '请至少选择一种慢病，或选择“没有慢病”');
    if (b.diseases.length > 10) throw new ApiError(400, '慢病数量超出限制');
    const names = new Set();
    for (const d of b.diseases) {
      const name = cleanStr((d || {}).name, 20);
      // 允许“其他：xxx”自填形式（冒号后内容 1-14 字）
      const validName = name && (DISEASE_WHITELIST.has(name)
        || /^其他[:：][\s\S]{1,14}$/.test(name));
      if (!validName) throw new ApiError(400, '包含不支持的慢病选项');
      if (names.has(name)) continue;
      names.add(name);
      const years = (d.years || '').trim();
      if (!YEARS_ENUM.has(years)) throw new ApiError(400, '患病年限格式不正确');
      diseases.push({ name, years });
    }
  }

  let meds = [];
  if (hasMeds) {
    if (!Array.isArray(b.meds)) throw new ApiError(400, '用药列表格式不正确');
    const names = new Set();
    for (const m of b.meds.slice(0, 10)) {
      const name = cleanStr((m || {}).name, 50);
      if (!name) continue; // 空白行直接忽略
      if (names.has(name)) continue;
      names.add(name);
      meds.push({ name, dose: cleanStr(m.dose, 50) || '' });
    }
    if (meds.length === 0) throw new ApiError(400, '请填写长期服用的药物，或选择“没有长期用药”');
  }

  const pregnancy = typeof b.pregnancy === 'string' ? b.pregnancy.trim() : 'none';
  if (!PREGNANCY_ENUM.has(pregnancy)) throw new ApiError(400, '孕哺状态格式不正确');

  await pool.query(
    `INSERT INTO chronic_profiles (user_id, has_disease, diseases, has_meds, meds, pregnancy)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       has_disease = VALUES(has_disease), diseases = VALUES(diseases),
       has_meds = VALUES(has_meds), meds = VALUES(meds), pregnancy = VALUES(pregnancy)`,
    [req.userId, hasDisease ? 1 : 0,
      hasDisease ? JSON.stringify(diseases) : null,
      hasMeds ? 1 : 0,
      hasMeds ? JSON.stringify(meds) : null,
      pregnancy],
  );
  ok(res, undefined, '慢病档案已保存');
}));

// ============ 头像（预设 + 上传） ============

// 预设头像 key：p1-p10（emoji 映射在前端维护）；上传头像：/uploads/avatars/u{id}_{rand}.ext
const AVATAR_PRESET_RE = /^p(?:[1-9]|10)$/;
const AVATAR_UPLOAD_RE = /^\/uploads\/avatars\/[A-Za-z0-9_]+\.(jpg|png|webp)$/;
const AVATAR_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'avatars');
const AVATAR_MAX_BYTES = 300 * 1024; // 前端 canvas 压缩后一般 < 50KB，这里留足余量

// 替换头像后清理该用户旧的上传文件（预设切换不清理）
async function removeOldUpload(userId, avatar) {
  if (avatar && AVATAR_UPLOAD_RE.test(avatar) && avatar.includes('/u' + userId + '_')) {
    try { await fs.unlink(path.join(__dirname, '..', '..', 'public', avatar)); } catch (e) { /* 文件不存在则忽略 */ }
  }
}

// 选择预设头像，或绑定已上传的路径
router.put('/user/avatar', requireAuth, wrap(async (req, res) => {
  const avatar = String(req.body.avatar || '').trim();
  if (!AVATAR_PRESET_RE.test(avatar) && !AVATAR_UPLOAD_RE.test(avatar)) {
    throw new ApiError(400, '不支持的头像格式');
  }
  if (avatar.startsWith('/uploads/')) {
    // 只能绑定自己上传的文件，且文件必须真实存在
    if (!avatar.includes('/u' + req.userId + '_')) {
      throw new ApiError(403, '不能使用其他用户的头像文件');
    }
    try { await fs.access(path.join(__dirname, '..', '..', 'public', avatar)); } catch (e) {
      throw new ApiError(400, '头像文件不存在，请重新上传');
    }
  }
  const [[cur]] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.userId]);
  await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId]);
  await removeOldUpload(req.userId, cur && cur.avatar);
  ok(res, { avatar }, '头像已更新');
}));

// 上传头像：前端已裁剪压缩（dataURL），落盘到 public/uploads/avatars 并直接生效
router.post('/user/avatar/upload', requireAuth, wrap(async (req, res) => {
  const m = String(req.body.data || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    throw new ApiError(400, '仅支持 JPG/PNG/WebP 图片');
  }
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > AVATAR_MAX_BYTES) {
    throw new ApiError(400, '图片过大，请压缩后重试');
  }
  await fs.mkdir(AVATAR_DIR, { recursive: true });
  const filename = 'u' + req.userId + '_' + Date.now().toString(36)
    + Math.random().toString(36).slice(2, 6) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  await fs.writeFile(path.join(AVATAR_DIR, filename), buf);
  const avatar = '/uploads/avatars/' + filename;
  const [[cur]] = await pool.query('SELECT avatar FROM users WHERE id = ?', [req.userId]);
  await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.userId]);
  await removeOldUpload(req.userId, cur && cur.avatar);
  ok(res, { avatar }, '头像已更新');
}));

// 个人中心数据总览：本月症状数、近7天作息打卡天数与平均入睡时间、当前肝郁指数
router.get('/profile/stats', requireAuth, wrap(async (req, res) => {
  const userId = req.userId;
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
  ok(res, {
    avgSleep,
    sleepDays: sleepRows.length,
    monthSymptomCount: sym.monthCount,
    score: users[0] ? users[0].score : null,
  });
}));

module.exports = router;

/**
 * 松序 - API路由（业务接口）
 * 数据全部读写 MySQL/MariaDB（songxu 库），响应结构与旧版 mock 保持一致
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { signToken, optionalAuth, requireAuth, DEV_CODE } = require('../middleware/auth');
const { getClothingByWeather } = require('../services/weather');

// 所有路由先做可选认证（有 token 解析出 req.userId，无 token 按演示用户处理）
router.use(optionalAuth);

// ============ 通用工具 ============

// 异步路由错误统一处理
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// 当前用户：请求带有效 token 用其身份，否则用演示用户（be-2 后逐步收紧）
const getUserId = (req) => req.userId || 1;

// ============ 静态内容（与数据库无关） ============

const dietData = {
  recommend: {
    principle: '今日阴雨湿重，宜喝陈皮红枣茶，忌冰饮',
    foods: ['陈皮', '红枣', '玫瑰花', '山药', '枸杞'],
  },
  goodFoods: {
    tea: ['玫瑰花茶', '陈皮茶', '菊花茶', '枸杞茶'],
    staple: ['山药粥', '小米粥', '红枣饭', '薏米饭'],
    vegetable: ['菠菜', '芹菜', '西兰花', '胡萝卜'],
    fruit: ['苹果', '橙子', '葡萄', '猕猴桃'],
  },
  badFoods: {
    cold: ['冰饮', '冰淇淋', '生鱼片', '凉拌菜'],
    spicy: ['辣椒', '花椒', '烧烤', '炸鸡'],
    sour: ['柠檬', '醋', '酸梅', '山楂(过量)'],
  },
  recipes: [
    { time: '早餐', name: '红枣山药粥', ingredients: '山药100g, 红枣5颗, 大米50g' },
    { time: '午餐', name: '芹菜炒香干', ingredients: '芹菜200g, 香干100g, 木耳适量' },
    { time: '晚餐', name: '菠菜猪肝汤', ingredients: '菠菜150g, 猪肝100g, 姜片3片' },
    { time: '加餐', name: '玫瑰花茶', ingredients: '玫瑰花5朵, 枸杞10粒, 蜂蜜适量' },
  ],
};

const clothingData = {
  temp: 18, weather: '\u{1F327}', city: '杭州',
  high: 22, low: 14, diff: 8, wind: '北风3级', humidity: 65,
  principle: '今日降温大风，重点护住颈肩脚踝',
  inner: '薄长袖纯棉打底，透气吸汗',
  outer: '薄羽绒或风衣，防风为主',
  shoes: '运动鞋或短靴，不露脚踝',
};

const exerciseData = [
  { name: '八段锦·两手托天', duration: '3分钟', tag: '舒肝理气', icon: '\u{1F9D8}' },
  { name: '梳头功', duration: '2分钟', tag: '疏肝明目', icon: '\u{1F48E}' },
  { name: '扩胸运动', duration: '2分钟', tag: '宽胸理气', icon: '\u{1F4AA}' },
  { name: '侧腰拉伸', duration: '3分钟', tag: '疏通胆经', icon: '\u{1F9D5}' },
  { name: '搓胁肋', duration: '2分钟', tag: '疏肝解郁', icon: '\u{1F9B6}' },
  { name: '深呼吸478', duration: '4分钟', tag: '安神定志', icon: '\u{1F33F}' },
];

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
  res.json({ success: true, data: dietData.recipes });
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
  const mood = req.body.mood || '未知';
  await pool.query('INSERT INTO mood_checkins (user_id, mood) VALUES (?, ?)', [getUserId(req), mood]);
  res.json({ success: true, message: '情绪已记录: ' + mood });
}));

// 待办：切换完成状态（be-4 前端对接用）
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
    `SELECT id, name, dose, med_time AS time, note
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

// 发送验证码（开发期固定验证码，接入短信服务后替换）
router.post('/auth/send-code', wrap(async (req, res) => {
  const phone = (req.body.phone || '').trim();
  if (!/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: '请输入正确的手机号' });
  }
  res.json({
    success: true,
    message: '验证码已发送（开发环境）',
    devCode: DEV_CODE, // 开发环境直接返回便于测试，上线前移除
  });
}));

// 登录：手机号 + 验证码 → JWT
router.post('/auth/login', wrap(async (req, res) => {
  const phone = (req.body.phone || '').trim();
  const code = (req.body.code || '').trim();
  if (!/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: '请输入正确的手机号' });
  }
  if (code !== DEV_CODE) {
    return res.status(401).json({ success: false, message: '验证码错误' });
  }
  let [rows] = await pool.query('SELECT id, name, score, level FROM users WHERE phone = ?', [phone]);
  if (!rows[0]) {
    const [result] = await pool.query(
      'INSERT INTO users (phone, name) VALUES (?, ?)', [phone, '小松'],
    );
    rows = [{ id: result.insertId, name: '小松', score: 62, level: '轻度肝郁' }];
  }
  const u = rows[0];
  res.json({
    success: true,
    user: { name: u.name, phone, score: u.score, level: u.level },
    token: signToken(u.id),
  });
}));

// 当前登录用户信息（登录态持久化校验）
router.get('/auth/me', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT name, phone, score, level FROM users WHERE id = ?', [req.userId],
  );
  if (!rows[0]) {
    return res.status(401).json({ success: false, message: '用户不存在' });
  }
  res.json({ success: true, data: rows[0] });
}));

// 功法动作（读库）
router.get('/practice/moves', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, duration FROM practice_moves ORDER BY sort_order',
  );
  res.json({ success: true, data: rows });
}));

// 统一错误处理（异步路由抛错时返回 JSON 而非 HTML 错误页）
router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[api] 接口错误:', err.message);
  res.status(500).json({ success: false, message: '服务内部错误，请稍后重试' });
});

module.exports = router;

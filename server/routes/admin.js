/**
 * 管理端接口（第一期：只读数据看板）
 * GET /api/admin/overview  核心指标 + 近7天趋势 + 最新注册用户
 */
const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAdmin } = require('../middleware/auth');
const { wrap } = require('../utils/http');

// optionalAuth 已在 server.js 全局挂载，这里只需管理员校验
router.use(requireAdmin);

// 近 N 天日期序列（含今天），yyyy-mm-dd
function lastDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// 把 [{d, c}] 按 days 补零
function fillDays(days, rows) {
  const map = {};
  rows.forEach(r => { map[String(r.d).slice(0, 10)] = r.c; });
  return days.map(d => ({ date: d.slice(5), count: map[d] || 0 }));
}

router.get('/overview', wrap(async (req, res) => {
  const q = async (sql, params) => (await pool.query(sql, params))[0];

  // 顶部指标卡
  const [users] = await q('SELECT COUNT(*) c FROM users WHERE username IS NOT NULL');
  const [todayNew] = await q("SELECT COUNT(*) c FROM users WHERE username IS NOT NULL AND DATE(created_at) = CURDATE()");
  const [todayActive] = await q(`SELECT COUNT(DISTINCT u) c FROM (
      SELECT user_id u FROM sleep_checkins WHERE DATE(created_at) = CURDATE()
      UNION SELECT user_id FROM mood_checkins WHERE DATE(created_at) = CURDATE()
      UNION SELECT user_id FROM symptoms WHERE DATE(created_at) = CURDATE()
      UNION SELECT user_id FROM todos WHERE DATE(created_at) = CURDATE()
      UNION SELECT user_id FROM chat_sessions WHERE DATE(created_at) = CURDATE()
    ) t`);
  const [chats] = await q('SELECT COUNT(*) c FROM chat_messages');
  const [todos] = await q('SELECT COUNT(*) c, SUM(is_done = 1) d FROM todos');
  const [symptoms] = await q('SELECT COUNT(*) c FROM symptoms');
  const [sleep] = await q('SELECT COUNT(*) c FROM sleep_checkins');
  const [mood] = await q('SELECT COUNT(*) c FROM mood_checkins');

  // 近 7 天趋势
  const days = lastDays(7);
  const newUserRows = await q(
    'SELECT DATE(created_at) d, COUNT(*) c FROM users WHERE username IS NOT NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at)');
  const checkinRows = await q(`SELECT d, COUNT(*) c FROM (
      SELECT DATE(created_at) d FROM sleep_checkins WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      UNION ALL SELECT DATE(created_at) FROM mood_checkins WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      UNION ALL SELECT DATE(created_at) FROM symptoms WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
    ) t GROUP BY d`);

  // 最新注册用户
  const recent = await q(
    'SELECT id, username, name, DATE_FORMAT(created_at, "%Y-%m-%d %H:%i") createdAt FROM users WHERE username IS NOT NULL ORDER BY id DESC LIMIT 8');

  res.json({
    success: true,
    data: {
      cards: {
        totalUsers: users.c,
        todayNewUsers: todayNew.c,
        todayActiveUsers: todayActive.c,
        totalChatMessages: chats.c,
        totalTodos: todos.c || 0,
        doneTodos: Number(todos.d || 0),
        totalSymptoms: symptoms.c,
        totalSleepCheckins: sleep.c,
        totalMoodCheckins: mood.c,
      },
      newUserTrend: fillDays(days, newUserRows),
      checkinTrend: fillDays(days, checkinRows),
      recentUsers: recent,
    },
  });
}));

module.exports = router;

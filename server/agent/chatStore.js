/**
 * 会话与记忆存储
 * - MySQL 可用：用户、会话、消息全部落库
 * - MySQL 不可用：降级为进程内内存存储，并在响应中显式标注 storage='memory'
 */
const { pool, ping } = require('../db/pool');
const config = require('../config');

let dbReady = false;

// 内存降级存储
const memoryDB = {
  seq: { user: 1, session: 1, message: 1 },
  sessions: new Map(), // sessionId -> { id, userId, title, messages: [] }
};

async function init() {
  try {
    await ping();
    dbReady = true;
  } catch (err) {
    dbReady = false;
    console.warn('[chatStore] MySQL 不可用，已降级为内存模式：', err.code || err.message);
  }
  return dbReady;
}

function getStorageMode() {
  return dbReady ? 'db' : 'memory';
}

/**
 * 获取或创建演示用户（手机号模拟登录）
 */
async function resolveUser(userId) {
  if (dbReady) {
    if (userId) {
      const [rows] = await pool.query('SELECT id, phone, name FROM users WHERE id = ?', [userId]);
      if (rows[0]) return rows[0];
    }
    const phone = 'demo_00000000000';
    const [existing] = await pool.query('SELECT id, phone, name FROM users WHERE phone = ?', [phone]);
    if (existing[0]) return existing[0];
    const [result] = await pool.query('INSERT INTO users (phone, name) VALUES (?, ?)', [phone, '小松']);
    return { id: result.insertId, phone, name: '小松' };
  }

  return { id: memoryDB.seq.user, phone: 'demo', name: '小松' };
}

/**
 * 获取或创建会话
 */
async function resolveSession(user, sessionId) {
  if (dbReady) {
    if (sessionId) {
      const [rows] = await pool.query(
        'SELECT id, user_id AS userId, title FROM chat_sessions WHERE id = ? AND user_id = ?',
        [sessionId, user.id],
      );
      if (rows[0]) return rows[0];
    }
    const [result] = await pool.query(
      'INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)',
      [user.id, '新的对话'],
    );
    return { id: result.insertId, userId: user.id, title: '新的对话' };
  }

  if (sessionId && memoryDB.sessions.has(sessionId)) {
    return memoryDB.sessions.get(sessionId);
  }
  const id = memoryDB.seq.session++;
  const session = { id, userId: user.id, title: '新的对话', messages: [] };
  memoryDB.sessions.set(id, session);
  return session;
}

/**
 * 读取最近 N 条历史消息（按时间正序返回）
 */
async function loadHistory(sessionId) {
  if (dbReady) {
    const [rows] = await pool.query(
      `SELECT role, content FROM (
        SELECT role, content, created_at FROM chat_messages
        WHERE session_id = ? ORDER BY id DESC LIMIT ?
      ) t ORDER BY t.created_at ASC`,
      [sessionId, config.memoryTurns],
    );
    return rows;
  }

  const session = memoryDB.sessions.get(sessionId);
  if (!session) return [];
  return session.messages.slice(-config.memoryTurns).map(m => ({ role: m.role, content: m.content }));
}

/**
 * 追加一条消息
 */
async function appendMessage(sessionId, role, content) {
  if (dbReady) {
    await pool.query(
      'INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)',
      [sessionId, role, content],
    );
    return;
  }

  const session = memoryDB.sessions.get(sessionId);
  session.messages.push({ role, content });
}

module.exports = {
  init,
  getStorageMode,
  resolveUser,
  resolveSession,
  loadHistory,
  appendMessage,
};

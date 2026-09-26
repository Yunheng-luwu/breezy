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

/**
 * 会话列表（按最新消息倒序，附最后一条消息预览）
 */
async function listSessions(user) {
  if (dbReady) {
    const [rows] = await pool.query(
      `SELECT s.id, s.title,
        (SELECT m.content FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
        (SELECT m.created_at FROM chat_messages m WHERE m.session_id = s.id ORDER BY m.id DESC LIMIT 1) AS updatedAt
       FROM chat_sessions s
       WHERE s.user_id = ?
       ORDER BY updatedAt DESC, s.id DESC
       LIMIT 50`,
      [user.id],
    );
    return rows;
  }

  const list = [];
  for (const s of memoryDB.sessions.values()) {
    if (s.userId !== user.id) continue;
    const last = s.messages[s.messages.length - 1];
    list.push({ id: s.id, title: s.title, lastMessage: last ? last.content : '', updatedAt: null });
  }
  return list.reverse();
}

/**
 * 某个会话的完整消息（校验归属，按时间正序）
 */
async function loadMessages(sessionId, user) {
  if (dbReady) {
    const [sessions] = await pool.query(
      'SELECT id, title FROM chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, user.id],
    );
    if (!sessions[0]) return null;
    const [rows] = await pool.query(
      'SELECT role, content, created_at AS createdAt FROM chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT 200',
      [sessionId],
    );
    return { title: sessions[0].title, messages: rows };
  }

  const session = memoryDB.sessions.get(Number(sessionId));
  if (!session || session.userId !== user.id) return null;
  return { title: session.title, messages: session.messages.map(m => ({ role: m.role, content: m.content })) };
}

/**
 * 删除会话（校验归属，连带删除消息）
 * @returns {boolean} 是否删除成功（会话不存在或不属于该用户时为 false）
 */
async function deleteSession(sessionId, user) {
  if (dbReady) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [sessions] = await conn.query(
        'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ? FOR UPDATE',
        [sessionId, user.id],
      );
      if (!sessions.length) {
        await conn.rollback();
        return false;
      }
      await conn.query('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
      const [result] = await conn.query('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?', [sessionId, user.id]);
      await conn.commit();
      return result.affectedRows > 0;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  const session = memoryDB.sessions.get(Number(sessionId));
  if (!session || session.userId !== user.id) return false;
  memoryDB.sessions.delete(Number(sessionId));
  return true;
}

/**
 * 首条消息时自动命名会话（仅当标题仍是默认名）
 */
async function renameSessionIfDefault(sessionId, title) {
  if (dbReady) {
    await pool.query(
      "UPDATE chat_sessions SET title = ? WHERE id = ? AND title = '新的对话'",
      [title, sessionId],
    );
    return;
  }

  const session = memoryDB.sessions.get(sessionId);
  if (session && session.title === '新的对话') session.title = title;
}

module.exports = {
  init,
  getStorageMode,
  resolveUser,
  resolveSession,
  loadHistory,
  appendMessage,
  listSessions,
  loadMessages,
  deleteSession,
  renameSessionIfDefault,
};

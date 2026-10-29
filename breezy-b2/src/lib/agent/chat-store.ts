/**
 * 对话持久化 + 会话管理（对应冻结版 server/agent/chatStore.js）
 */
import { query, queryOne, execute } from "@/lib/db";

export interface SessionRow {
  id: number;
  title: string;
}

export interface HistoryRow {
  role: "user" | "assistant";
  content: string;
}

/** 确保用户有会话，没有则创建 */
export async function resolveSession(
  userId: number,
  sessionId?: number,
): Promise<SessionRow> {
  if (sessionId) {
    const s = await queryOne<SessionRow>(
      "SELECT id, title FROM chat_sessions WHERE id = ? AND user_id = ?",
      [sessionId, userId],
    );
    if (s) return s;
  }
  const id = await execute(
    "INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)",
    [userId, "新的对话"],
  );
  return { id, title: "新的对话" };
}

/** 追加消息（cards 为当轮下发的卡片/板块导航，随消息一起持久化） */
export async function appendMessage(
  sessionId: number,
  role: "system" | "user" | "assistant",
  content: string,
  cards?: unknown,
): Promise<void> {
  await poolInsert(sessionId, role, content, cards);
}

/** 首条消息自动命名会话 */
export async function renameSessionIfDefault(
  sessionId: number,
  firstText: string,
): Promise<void> {
  const s = await queryOne<{ title: string }>(
    "SELECT title FROM chat_sessions WHERE id = ?",
    [sessionId],
  );
  if (s && s.title === "新的对话" && firstText.trim()) {
    const title = firstText.trim().slice(0, 20);
    await poolUpdate(sessionId, title);
  }
}

/** 加载最近 N 轮历史（冻结版默认 10 轮） */
export async function loadHistory(
  sessionId: number,
  turns = 10,
): Promise<HistoryRow[]> {
  const rows = await query<HistoryRow>(
    `SELECT role, content FROM chat_messages
      WHERE session_id = ? AND role IN ('user','assistant')
      ORDER BY id DESC LIMIT ?`,
    [sessionId, turns * 2],
  );
  return rows.reverse();
}

/** 会话列表（首页/侧栏展示） */
export async function listSessions(userId: number): Promise<SessionRow[]> {
  return query<SessionRow>(
    `SELECT id, title FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`,
    [userId],
  );
}

// ---- 内部 helpers（避免循环 import pool 造成单测不便） ----
import { pool } from "@/lib/db";

async function poolInsert(
  sessionId: number,
  role: string,
  content: string,
  cards?: unknown,
): Promise<void> {
  await pool.execute(
    "INSERT INTO chat_messages (session_id, role, content, cards) VALUES (?, ?, ?, ?)",
    [sessionId, role, content, cards ? JSON.stringify(cards) : null],
  );
  await pool.execute(
    "UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [sessionId],
  );
}

async function poolUpdate(sessionId: number, title: string): Promise<void> {
  await pool.execute("UPDATE chat_sessions SET title = ? WHERE id = ?", [
    title,
    sessionId,
  ]);
}

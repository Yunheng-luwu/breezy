/**
 * 历史会话接口（AI 助手侧栏）
 * GET /api/chat-sessions       → 当前用户会话列表（近 20 条）
 * GET /api/chat-sessions?id=N  → 该会话的消息列表（校验归属当前用户）
 * POST /api/chat-sessions      → 确保会话：body { id? }，有则复用、无则新建，返回 { id }
 * DELETE /api/chat-sessions    → body { id } 删除指定会话及其消息（校验归属）
 */
import { NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, message: "请先登录" }, { status: 401 });
  }
  let id: unknown;
  try {
    id = ((await req.json()) as { id?: unknown }).id;
  } catch {
    id = undefined;
  }
  const wanted = Number(id);
  if (Number.isFinite(wanted)) {
    const owned = await queryOne<{ id: number }>(
      "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?",
      [wanted, user.id],
    );
    if (owned) return NextResponse.json({ ok: true, data: { id: owned.id } });
  }
  const newId = await execute(
    "INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)",
    [user.id, "新的对话"],
  );
  return NextResponse.json({ ok: true, data: { id: newId } });
}

interface SessionListRow {
  id: number;
  title: string;
  time: string;
}

interface MessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  cards: string | null;
}

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  // 未登录：不返回任何人的会话
  if (!user) return NextResponse.json({ ok: true, data: [] });
  const userId = user.id;

  const idParam = new URL(req.url).searchParams.get("id");

  // 会话列表
  if (!idParam) {
    const rows = await query<SessionListRow>(
      `SELECT id, title, DATE_FORMAT(updated_at, '%m-%d %H:%i') AS time
         FROM chat_sessions WHERE user_id = ?
        ORDER BY updated_at DESC LIMIT 20`,
      [userId],
    );
    return NextResponse.json({ ok: true, data: rows });
  }

  // 单会话消息
  const sessionId = Number(idParam);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ ok: false, message: "会话 id 无效" }, { status: 400 });
  }
  const owned = await queryOne<{ id: number }>(
    "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?",
    [sessionId, userId],
  );
  if (!owned) {
    return NextResponse.json({ ok: false, message: "会话不存在" }, { status: 404 });
  }
  // chat_messages 无 user_id 列，归属已通过上方 chat_sessions 校验
  const rows = await query<MessageRow>(
    `SELECT id, role, content, cards FROM chat_messages
      WHERE session_id = ? AND role IN ('user', 'assistant')
      ORDER BY id ASC LIMIT 50`,
    [sessionId],
  );
  // cards 存的是当轮下发的卡片/板块导航 JSON，解析后一并返回，避免重进会话丢失
  const data = rows.map((r) => {
    let cards: unknown = null;
    if (r.cards) {
      try {
        cards = JSON.parse(r.cards);
      } catch {
        cards = null;
      }
    }
    return { id: r.id, role: r.role, content: r.content, cards };
  });
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, message: "请先登录" }, { status: 401 });
  }
  const userId = user.id;

  let id: unknown;
  try {
    id = ((await req.json()) as { id?: unknown }).id;
  } catch {
    id = undefined;
  }
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId)) {
    return NextResponse.json({ ok: false, message: "会话 id 无效" }, { status: 400 });
  }
  const owned = await queryOne<{ id: number }>(
    "SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?",
    [sessionId, userId],
  );
  if (!owned) {
    return NextResponse.json({ ok: false, message: "会话不存在" }, { status: 404 });
  }
  await execute("DELETE FROM chat_messages WHERE session_id = ?", [sessionId]);
  await execute("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?", [sessionId, userId]);
  return NextResponse.json({ ok: true });
}

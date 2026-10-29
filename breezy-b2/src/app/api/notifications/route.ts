/**
 * 全局提醒：当前用户今日未完成待办 + 今日未打卡用药
 * GET → { ok, data: { todos: [{id,text,time}], meds: [{id,name,time}] } }
 */
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  // 未登录不读任何人的数据
  if (!user) {
    return NextResponse.json({ ok: true, data: { todos: [], meds: [] } });
  }
  const userId = user.id;

  try {
    const [todos, meds] = await Promise.all([
      query<{ id: number; text: string; time: string }>(
        `SELECT id, content AS text, todo_time AS time
           FROM todos
          WHERE user_id = ? AND todo_date = CURDATE() AND is_done = 0
          ORDER BY todo_time, id`,
        [userId],
      ),
      query<{ id: number; name: string; time: string }>(
        `SELECT id, name, med_time AS time
           FROM medicines
          WHERE user_id = ?
            AND (last_punch_at IS NULL OR DATE(last_punch_at) <> CURDATE())
          ORDER BY med_time, id`,
        [userId],
      ),
    ]);
    return NextResponse.json({ ok: true, data: { todos, meds } });
  } catch (e) {
    console.error("[notifications]", e);
    return NextResponse.json({ ok: false, message: "查询失败，请稍后再试" }, { status: 500 });
  }
}

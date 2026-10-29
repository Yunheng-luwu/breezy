/**
 * AI 跟练成绩上报 + 排行榜查询
 * POST { action, category, score, reps } → 写 practice_scores
 * GET  ?category=all|baduanjin|stretch|office → Top 8 成绩
 */
import { NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

const CATEGORIES = new Set(["baduanjin", "stretch", "office"]);

interface ScoreRow {
  action: string;
  category: string;
  score: number;
  reps: number;
  date: string;
  user: string;
}

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, message: "请先登录" }, { status: 401 });
  }

  let body: {
    action?: unknown;
    category?: unknown;
    score?: unknown;
    reps?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim().slice(0, 50);
  const category = String(body.category ?? "baduanjin");
  const score = Number(body.score);
  const reps = Number(body.reps);

  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ ok: false, message: "category 无效" }, { status: 400 });
  }
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return NextResponse.json({ ok: false, message: "score 需为 0-100 整数" }, { status: 400 });
  }
  if (!Number.isInteger(reps) || reps < 0 || reps > 999) {
    return NextResponse.json({ ok: false, message: "reps 需为 0-999 整数" }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ ok: false, message: "action 不能为空" }, { status: 400 });
  }

  try {
    await execute(
      "INSERT INTO practice_scores (user_id, action, category, score, reps) VALUES (?, ?, ?, ?, ?)",
      [user.id, action, category, score, reps],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[practice-scores]", e);
    return NextResponse.json({ ok: false, message: "上报失败，请稍后再试" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const category = new URL(req.url).searchParams.get("category") ?? "all";

  if (category !== "all" && !CATEGORIES.has(category)) {
    return NextResponse.json({ ok: false, message: "category 无效" }, { status: 400 });
  }

  try {
    const where = category === "all" ? "" : "WHERE ps.category = ?";
    const rows = await query<ScoreRow>(
      `SELECT ps.action, ps.category, ps.score, ps.reps,
              DATE_FORMAT(ps.created_at, '%m-%d') AS date,
              COALESCE(u.name, '松友') AS user
       FROM practice_scores ps
       LEFT JOIN users u ON u.id = ps.user_id
       ${where}
       ORDER BY ps.score DESC, ps.created_at ASC
       LIMIT 8`,
      category === "all" ? [] : [category],
    );
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    console.error("[practice-scores]", e);
    return NextResponse.json({ ok: false, message: "查询失败，请稍后再试" }, { status: 500 });
  }
}

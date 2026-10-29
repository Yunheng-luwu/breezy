/**
 * 统一动作接口：AI 确认卡 / 页面交互的唯一写库入口
 * POST { action, payload } → 写 songxu_b2
 *
 * action 取值：
 *   symptom        记录症状
 *   mood           情绪打卡
 *   todo           新增待办
 *   toggle_todo    勾选/取消待办
 *   delete_todo    删除待办（个人中心管理）
 *   delete_mood    删除某条情绪打卡
 *   delete_favorite 取消收藏（按 id）
 *   profile        更新健康档案（upsert）
 *   medicine       用药打卡
 *   favorite       收藏/取消收藏
 */
import { NextResponse } from "next/server";
import { execute, query, queryOne } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Payload = Record<string, any>;

const TODO_TYPES = new Set(["med", "ai", "sleep", "diet"]);
const SEVERITIES = new Set(["轻度", "中度", "重度"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PROFILE_COLUMNS: Record<string, string> = {
  constitution: "constitution",
  allergy: "allergy",
  dietPref: "diet_pref",
  exercisePref: "exercise_pref",
  sleepPref: "sleep_pref",
  bodySense: "body_sense",
  wakeTime: "wake_time",
  napTime: "nap_time",
  bedTime: "bed_time",
};

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "请先登录后再记录" },
      { status: 401 },
    );
  }
  const userId = user.id;

  let body: { action?: string; payload?: Payload };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "请求格式错误" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const p: Payload = body.payload ?? {};

  try {
    switch (action) {
      case "symptom": {
        const symptom = String(p.symptom ?? "").trim().slice(0, 50);
        if (!symptom) return bad("症状名称不能为空");
        const severity = SEVERITIES.has(p.severity) ? p.severity : "轻度";
        const cause = p.cause ? String(p.cause).slice(0, 255) : null;
        await execute(
          "INSERT INTO symptoms (user_id, symptom, severity, cause) VALUES (?, ?, ?, ?)",
          [userId, symptom, severity, cause],
        );
        return ok(`已记录：${symptom}（${severity}）`);
      }

      case "mood": {
        const mood = String(p.mood ?? "").trim().slice(0, 20);
        if (!mood) return bad("情绪不能为空");
        await execute("INSERT INTO mood_checkins (user_id, mood) VALUES (?, ?)", [
          userId,
          mood,
        ]);
        return ok(`情绪已打卡：${mood}`);
      }

      case "todo": {
        const content = String(p.content ?? "").trim().slice(0, 255);
        if (!content) return bad("待办内容不能为空");
        const time = TIME_RE.test(String(p.time ?? "")) ? String(p.time) : "";
        const type = TODO_TYPES.has(p.type) ? String(p.type) : "ai";
        const date = DATE_RE.test(String(p.date ?? "")) ? String(p.date) : null;
        await execute(
          `INSERT INTO todos (user_id, content, todo_time, type, todo_date)
           VALUES (?, ?, ?, ?, COALESCE(?, CURDATE()))`,
          [userId, content, time, type, date],
        );
        return ok(`待办已添加：${content}`);
      }

      case "toggle_todo": {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return bad("待办 id 无效");
        await execute(
          "UPDATE todos SET is_done = ? WHERE id = ? AND user_id = ?",
          [p.done ? 1 : 0, id, userId],
        );
        return ok(p.done ? "已标记完成" : "已取消完成");
      }

      case "delete_todo": {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return bad("待办 id 无效");
        await execute("DELETE FROM todos WHERE id = ? AND user_id = ?", [id, userId]);
        return ok("待办已删除");
      }

      case "delete_mood": {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return bad("记录 id 无效");
        await execute("DELETE FROM mood_checkins WHERE id = ? AND user_id = ?", [id, userId]);
        return ok("情绪记录已删除");
      }

      case "delete_favorite": {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return bad("收藏 id 无效");
        await execute("DELETE FROM user_favorites WHERE id = ? AND user_id = ?", [id, userId]);
        return ok("已取消收藏");
      }

      case "profile": {
        const cols: string[] = [];
        const values: (string | null)[] = [];
        for (const [k, v] of Object.entries(p)) {
          const col = PROFILE_COLUMNS[k];
          if (!col) continue;
          if (typeof v !== "string" || !v.trim()) continue;
          cols.push(col);
          values.push(v.trim().slice(0, 200));
        }
        if (!cols.length) return bad("没有可保存的档案字段");
        const exists = await queryOne<{ id: number }>(
          "SELECT id FROM health_profiles WHERE user_id = ?",
          [userId],
        );
        if (exists) {
          await execute(
            `UPDATE health_profiles SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE user_id = ?`,
            [...values, userId],
          );
        } else {
          await execute(
            `INSERT INTO health_profiles (user_id, ${cols.join(", ")}) VALUES (?, ${cols
              .map(() => "?")
              .join(", ")})`,
            [userId, ...values],
          );
        }
        return ok("健康档案已更新");
      }

      case "medicine": {
        const id = Number(p.medicineId);
        if (!Number.isFinite(id)) return bad("药品 id 无效");
        const rows = await query<{ name: string }>(
          "SELECT name FROM medicines WHERE id = ? AND user_id = ?",
          [id, userId],
        );
        if (!rows.length) return bad("未找到该用药提醒");
        await execute(
          "UPDATE medicines SET last_punch_at = NOW() WHERE id = ? AND user_id = ?",
          [id, userId],
        );
        return ok(`用药已打卡：${rows[0].name}`);
      }

      case "favorite": {
        const favType = String(p.type ?? "recipe").slice(0, 20);
        const name = String(p.name ?? "").trim().slice(0, 100);
        if (!name) return bad("收藏内容不能为空");
        const exists = await queryOne<{ id: number }>(
          "SELECT id FROM user_favorites WHERE user_id = ? AND fav_type = ? AND target_name = ?",
          [userId, favType, name],
        );
        if (exists) {
          await execute("DELETE FROM user_favorites WHERE id = ?", [exists.id]);
          return ok("已取消收藏");
        }
        await execute(
          "INSERT INTO user_favorites (user_id, fav_type, target_name, meta) VALUES (?, ?, ?, ?)",
          [userId, favType, name, String(p.meta ?? "").slice(0, 255)],
        );
        return ok("已收藏");
      }

      default:
        return bad(`未知操作：${action}`);
    }
  } catch (e) {
    console.error("[actions]", action, e);
    return NextResponse.json({ ok: false, message: "操作失败，请稍后再试" }, { status: 500 });
  }
}

function ok(message: string) {
  return NextResponse.json({ ok: true, message });
}

function bad(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

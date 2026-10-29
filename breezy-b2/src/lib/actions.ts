"use server";

/**
 * 页面 Server Actions —— 表单直接提交，写库后 revalidate
 */
import { revalidatePath } from "next/cache";
import { execute, queryOne } from "@/lib/db";
import { currentUserId } from "@/lib/queries";

const TODO_TYPES = new Set(["med", "ai", "sleep", "diet"]);
const SEVERITIES = new Set(["轻度", "中度", "重度"]);

function str(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export async function toggleTodoAction(id: number, done: boolean) {
  const uid = await currentUserId();
  if (!uid) return;
  await execute("UPDATE todos SET is_done = ? WHERE id = ? AND user_id = ?", [
    done ? 1 : 0,
    id,
    uid,
  ]);
  revalidatePath("/home");
  revalidatePath("/rhythm");
}

export async function toggleAllTodosAction() {
  const uid = await currentUserId();
  if (!uid) return;
  await execute(
    "UPDATE todos SET is_done = 1 WHERE user_id = ? AND todo_date = CURDATE()",
    [uid],
  );
  revalidatePath("/home");
  revalidatePath("/rhythm");
}

/** 按钮直传文本的快捷加待办（穴位/泡脚方等「加入今日待办」） */
export async function quickAddTodoAction(content: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const text = String(content ?? "").trim().slice(0, 255);
  if (!text) return;
  await execute(
    `INSERT INTO todos (user_id, content, todo_time, type, todo_date)
     VALUES (?, ?, '', 'ai', CURDATE())`,
    [uid, text],
  );
  revalidatePath("/home");
  revalidatePath("/rhythm");
}

export async function addTodoAction(fd: FormData) {
  const uid = await currentUserId();
  if (!uid) return;
  const content = str(fd, "content", 255);
  if (!content) return;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(str(fd, "time", 5)) ? str(fd, "time", 5) : "";
  const rawType = str(fd, "type", 10);
  const type = TODO_TYPES.has(rawType) ? rawType : "ai";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(fd, "date", 10)) ? str(fd, "date", 10) : null;
  await execute(
    `INSERT INTO todos (user_id, content, todo_time, type, todo_date)
     VALUES (?, ?, ?, ?, COALESCE(?, CURDATE()))`,
    [uid, content, time, type, date],
  );
  revalidatePath("/home");
  revalidatePath("/rhythm");
}

export async function addSymptomAction(fd: FormData) {
  const uid = await currentUserId();
  if (!uid) return;
  const symptom = str(fd, "symptom", 50);
  if (!symptom) return;
  const rawSev = str(fd, "severity", 10);
  const severity = SEVERITIES.has(rawSev) ? rawSev : "轻度";
  const cause = str(fd, "cause", 255) || null;
  await execute(
    "INSERT INTO symptoms (user_id, symptom, severity, cause) VALUES (?, ?, ?, ?)",
    [uid, symptom, severity, cause],
  );
  revalidatePath("/record");
  revalidatePath("/home");
}

/** 快速记录症状（快捷标签入口，对齐冻结版 quickSymptom/submitSymptom） */
export async function quickSymptomAction(symptom: string, severity: string, cause: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const name = String(symptom ?? "").trim().slice(0, 50);
  if (!name) return;
  const sev = SEVERITIES.has(severity) ? severity : "轻度";
  const c = String(cause ?? "").trim().slice(0, 255) || null;
  await execute(
    "INSERT INTO symptoms (user_id, symptom, severity, cause) VALUES (?, ?, ?, ?)",
    [uid, name, sev, c],
  );
  revalidatePath("/record");
  revalidatePath("/home");
}

/** 症状历史翻页：每次取 30 条（客户端「加载更多」调用） */
export async function loadSymptomsAction(offset: number) {
  const uid = await currentUserId();
  if (!uid) return [];
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const { getSymptoms } = await import("@/lib/queries");
  return getSymptoms(uid, 30, off);
}

/** 记录日历：取某月逐日症状条数（客户端翻月时调用） */
export async function symptomCalendarAction(ym: string) {
  const uid = await currentUserId();
  if (!uid) return [];
  const key = String(ym ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return [];
  const { getSymptomMonth } = await import("@/lib/queries");
  return getSymptomMonth(uid, key);
}

/** 记录日历：取某天症状明细（点击日期时调用） */
export async function symptomDayAction(day: string) {
  const uid = await currentUserId();
  if (!uid) return [];
  const key = String(day ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  const { getSymptomsByDay } = await import("@/lib/queries");
  return getSymptomsByDay(uid, key);
}

export async function addMoodAction(mood: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const m = String(mood).trim().slice(0, 20);
  if (!m) return;
  await execute("INSERT INTO mood_checkins (user_id, mood) VALUES (?, ?)", [uid, m]);
  revalidatePath("/mood");
  revalidatePath("/home");
}

/** 穿衣页体感偏好：写回档案，供服务端场景提醒联动 */
export async function setBodySenseAction(sense: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const v = ["怕冷", "正常", "怕热"].includes(sense) ? sense : "正常";
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM health_profiles WHERE user_id = ?",
    [uid],
  );
  if (exists) {
    await execute("UPDATE health_profiles SET body_sense = ? WHERE user_id = ?", [v, uid]);
  } else {
    await execute("INSERT INTO health_profiles (user_id, body_sense) VALUES (?, ?)", [uid, v]);
  }
  revalidatePath("/clothing");
  revalidatePath("/profile");
  revalidatePath("/home");
}

/** 随手记：新增一条 */
export async function addNoteAction(content: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const text = String(content ?? "").trim().slice(0, 500);
  if (!text) return;
  await execute("INSERT INTO notes (user_id, content) VALUES (?, ?)", [uid, text]);
  revalidatePath("/record");
}

/** 随手记：删除自己的一条 */
export async function deleteNoteAction(id: number) {
  const uid = await currentUserId();
  if (!uid) return;
  await execute("DELETE FROM notes WHERE id = ? AND user_id = ?", [id, uid]);
  revalidatePath("/record");
}

export async function saveSleepAction(fd: FormData) {
  const uid = await currentUserId();
  if (!uid) return;
  const sleep = str(fd, "sleepTime", 5);
  const wake = str(fd, "wakeTime", 5);
  const nap = str(fd, "napTime", 5);
  if (!sleep && !wake && !nap) return;
  await execute(
    `INSERT INTO sleep_checkins (user_id, checkin_date, sleep_time, wake_time, nap_time)
     VALUES (?, CURDATE(), ?, ?, ?)
     ON DUPLICATE KEY UPDATE sleep_time = VALUES(sleep_time),
       wake_time = VALUES(wake_time), nap_time = VALUES(nap_time)`,
    [uid, sleep, wake, nap],
  );
  revalidatePath("/rhythm");
  revalidatePath("/record");
  revalidatePath("/home");
}

/** 时间轴快捷打卡：按目标时间一键记录某一节点（对齐冻结版 quickRhythmPunch） */
export async function punchRhythmAction(
  field: "sleepTime" | "wakeTime" | "napTime",
  time: string,
) {
  const uid = await currentUserId();
  if (!uid) return;
  const t = String(time ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return;
  const col =
    field === "sleepTime" ? "sleep_time" : field === "wakeTime" ? "wake_time" : "nap_time";
  await execute(
    `INSERT INTO sleep_checkins (user_id, checkin_date, ${col})
     VALUES (?, CURDATE(), ?)
     ON DUPLICATE KEY UPDATE ${col} = VALUES(${col})`,
    [uid, t],
  );
  revalidatePath("/rhythm");
  revalidatePath("/record");
  revalidatePath("/home");
}

/** 调整目标作息时间：写入健康档案（对齐冻结版 saveRhythmTime） */
export async function saveRhythmTimeAction(
  field: "wakeTime" | "napTime" | "bedTime",
  value: string,
) {
  const uid = await currentUserId();
  if (!uid) return;
  const v = String(value ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(v)) return;
  const col =
    field === "wakeTime" ? "wake_time" : field === "napTime" ? "nap_time" : "bed_time";
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM health_profiles WHERE user_id = ?",
    [uid],
  );
  if (exists) {
    await execute(`UPDATE health_profiles SET ${col} = ? WHERE user_id = ?`, [v, uid]);
  } else {
    await execute(`INSERT INTO health_profiles (user_id, ${col}) VALUES (?, ?)`, [uid, v]);
  }
  revalidatePath("/rhythm");
  revalidatePath("/profile");
}

export async function saveProfileAction(fd: FormData) {
  const uid = await currentUserId();
  if (!uid) return;
  const cols: string[] = [];
  const values: string[] = [];
  const map: Record<string, string> = {
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
  for (const [key, col] of Object.entries(map)) {
    if (!fd.has(key)) continue;
    const v = str(fd, key, 200);
    cols.push(col);
    values.push(v);
  }
  if (!cols.length) return;
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM health_profiles WHERE user_id = ?",
    [uid],
  );
  if (exists) {
    await execute(
      `UPDATE health_profiles SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE user_id = ?`,
      [...values, uid],
    );
  } else {
    await execute(
      `INSERT INTO health_profiles (user_id, ${cols.join(", ")}) VALUES (?, ${cols
        .map(() => "?")
        .join(", ")})`,
      [uid, ...values],
    );
  }
  revalidatePath("/profile");
  revalidatePath("/home");
}

export async function saveAssessmentAction(score: number, level: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  await execute("UPDATE users SET score = ?, level = ? WHERE id = ?", [
    s,
    String(level).slice(0, 20),
    uid,
  ]);
  revalidatePath("/profile");
  revalidatePath("/home");
}

/** 修改昵称与头像（预设 emoji 或 /uploads/avatars/ 路径） */
export async function saveIdentityAction(name: string, avatar: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const n = String(name ?? "").trim().slice(0, 20);
  const a = String(avatar ?? "").trim().slice(0, 255);
  // 头像只允许 emoji 短文本或本站上传路径
  if (a && !a.startsWith("/uploads/avatars/") && Array.from(a).length > 8) return;
  if (!n) return;
  await execute("UPDATE users SET name = ?, avatar = ? WHERE id = ?", [n, a, uid]);
  revalidatePath("/profile");
  revalidatePath("/home");
}

/** 体质问卷结果写入档案 */
export async function saveConstitutionAction(value: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const v = String(value ?? "").trim().slice(0, 20);
  const allowed = [
    "平和质", "气虚质", "阳虚质", "阴虚质", "痰湿质",
    "湿热质", "血瘀质", "气郁质", "特禀质",
  ];
  const ok = allowed.some((c) => v === c || v === `倾向${c}`);
  if (!ok) return;
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM health_profiles WHERE user_id = ?",
    [uid],
  );
  if (exists) {
    await execute("UPDATE health_profiles SET constitution = ? WHERE user_id = ?", [v, uid]);
  } else {
    await execute("INSERT INTO health_profiles (user_id, constitution) VALUES (?, ?)", [uid, v]);
  }
  revalidatePath("/profile");
  revalidatePath("/home");
}

const PREGNANCY_VALUES = new Set(["none", "trying", "pregnant", "breastfeeding"]);

/** 顿号/逗号分隔文本 → JSON [{name}]，与 health-context.ts 读取端保持一致 */
function toJsonList(text: string): string | null {
  const names = text
    .split(/[、，,;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!names.length) return null;
  return JSON.stringify(names.map((name) => ({ name: name.slice(0, 50) })));
}

export async function saveChronicAction(fd: FormData) {
  const uid = await currentUserId();
  if (!uid) return;
  const hasDisease = str(fd, "hasDisease", 1) === "1" ? 1 : 0;
  const hasMeds = str(fd, "hasMeds", 1) === "1" ? 1 : 0;
  const rawPreg = str(fd, "pregnancy", 12);
  const pregnancy = PREGNANCY_VALUES.has(rawPreg) ? rawPreg : "none";
  const diseases = hasDisease ? toJsonList(str(fd, "diseases", 500)) : null;
  const meds = hasMeds ? toJsonList(str(fd, "meds", 500)) : null;
  await execute(
    `INSERT INTO chronic_profiles (user_id, has_disease, diseases, has_meds, meds, pregnancy)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE has_disease = VALUES(has_disease), diseases = VALUES(diseases),
       has_meds = VALUES(has_meds), meds = VALUES(meds), pregnancy = VALUES(pregnancy)`,
    [uid, hasDisease, diseases, hasMeds, meds, pregnancy],
  );
  revalidatePath("/profile");
}

export async function punchMedicineAction(id: number) {
  const uid = await currentUserId();
  if (!uid) return;
  await execute(
    "UPDATE medicines SET last_punch_at = NOW() WHERE id = ? AND user_id = ?",
    [id, uid],
  );
  revalidatePath("/record");
}

export async function addMedicineAction(fd: FormData) {
  const uid = await currentUserId();
  if (!uid) return;
  const name = str(fd, "name", 100);
  if (!name) return;
  await execute(
    "INSERT INTO medicines (user_id, name, dose, med_time, note) VALUES (?, ?, ?, ?, ?)",
    [uid, name, str(fd, "dose", 50), str(fd, "medTime", 50), str(fd, "note", 255) || null],
  );
  revalidatePath("/record");
}

export async function deleteMedicineAction(id: number) {
  const uid = await currentUserId();
  if (!uid) return;
  await execute("DELETE FROM medicines WHERE id = ? AND user_id = ?", [id, uid]);
  revalidatePath("/record");
}

export async function toggleFavoriteAction(type: string, name: string, meta = "") {
  const uid = await currentUserId();
  // 未登录不写库：返回 false（取消状态）
  if (!uid) return false;
  const t = String(type).slice(0, 20);
  const n = String(name).trim().slice(0, 100);
  if (!n) return false;
  const exists = await queryOne<{ id: number }>(
    "SELECT id FROM user_favorites WHERE user_id = ? AND fav_type = ? AND target_name = ?",
    [uid, t, n],
  );
  if (exists) {
    await execute("DELETE FROM user_favorites WHERE id = ?", [exists.id]);
    revalidatePath("/profile");
    return false;
  }
  await execute(
    "INSERT INTO user_favorites (user_id, fav_type, target_name, meta) VALUES (?, ?, ?, ?)",
    [uid, t, n, String(meta).slice(0, 255)],
  );
  revalidatePath("/profile");
  return true;
}

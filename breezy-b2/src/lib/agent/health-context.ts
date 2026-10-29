/**
 * 用户健康背景（慢病/用药/孕哺/过敏）→ 追加到系统提示词
 * 对应冻结版 server/services/chronicProfile.js 的 buildHealthContext
 * 仅用于规避禁忌，不做诊断
 */
import { query, queryOne } from "@/lib/db";

interface ChronicRow {
  has_disease: number;
  diseases: string | null;
  has_meds: number;
  meds: string | null;
  pregnancy: string;
}

interface ProfileRow {
  allergy: string | null;
  constitution: string | null;
}

function parseList(json: string | null): Array<Record<string, string>> {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const PREGNANCY_LABEL: Record<string, string> = {
  trying: "备孕期",
  pregnant: "孕期",
  breastfeeding: "哺乳期",
};

/** 返回健康背景文本；无档案时返回空串（不追加） */
export async function buildHealthContext(userId: number): Promise<string> {
  const chronic = await queryOne<ChronicRow>(
    "SELECT has_disease, diseases, has_meds, meds, pregnancy FROM chronic_profiles WHERE user_id = ?",
    [userId],
  );
  const profile = await queryOne<ProfileRow>(
    "SELECT allergy, constitution FROM health_profiles WHERE user_id = ?",
    [userId],
  );

  const lines: string[] = [];

  if (chronic?.has_disease) {
    const names = parseList(chronic.diseases)
      .map((d) => (d.name ? `${d.name}${d.years ? `（${d.years}年）` : ""}` : ""))
      .filter(Boolean);
    if (names.length) lines.push(`已确诊慢病：${names.join("、")}`);
  }

  if (chronic?.has_meds) {
    const names = parseList(chronic.meds)
      .map((m) => (m.name ? `${m.name}${m.dose ? ` ${m.dose}` : ""}` : ""))
      .filter(Boolean);
    if (names.length) lines.push(`长期用药：${names.join("、")}`);
  }

  const preg = chronic?.pregnancy ? PREGNANCY_LABEL[chronic.pregnancy] : "";
  if (preg) lines.push(`特殊时期：${preg}`);

  if (profile?.allergy) lines.push(`过敏史：${profile.allergy}`);
  if (profile?.constitution)
    lines.push(`用户自述体质：${profile.constitution}（用户自己填写，未经辨识，不可据此判定体质）`);

  if (!lines.length) return "";

  return `【该用户的健康背景（仅用于规避禁忌，不要据此下诊断，用户没聊到就不要主动提起）】\n${lines
    .map((l) => `- ${l}`)
    .join("\n")}`;
}

/**
 * 用户全站记录快照：情绪自评 / 情绪打卡 / 症状 / 作息 / 待办 / 跟练 / 随手记 / 档案 / 收藏
 * 让 AI 像「一个大脑」一样跨板块调用真实数据，而不是只看当前一句话
 */
export async function buildUserSnapshot(userId: number): Promise<string> {
  if (!userId) return "";
  const [user, mood, symptom, sleep, todo, practice, notes, profile, fav] = await Promise.all([
    queryOne<{ score: number | null; level: string | null }>(
      "SELECT score, level FROM users WHERE id = ?",
      [userId],
    ),
    query<{ mood: string; c: number; last: string }>(
      `SELECT mood, COUNT(*) AS c, DATE_FORMAT(MAX(created_at), '%m-%d') AS last
         FROM mood_checkins
        WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY mood ORDER BY c DESC, last DESC LIMIT 5`,
      [userId],
    ),
    query<{ symptom: string; c: number; sev: string; last: string }>(
      `SELECT s.symptom, COUNT(*) AS c,
              SUBSTRING_INDEX(GROUP_CONCAT(s.severity ORDER BY s.created_at DESC), ',', 1) AS sev,
              DATE_FORMAT(MAX(s.created_at), '%m-%d') AS last
         FROM symptoms s
        WHERE s.user_id = ? AND s.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY s.symptom ORDER BY c DESC, last DESC LIMIT 6`,
      [userId],
    ),
    query<{ d: string; sleep_time: string; wake_time: string; nap_time: string }>(
      `SELECT DATE_FORMAT(checkin_date, '%m-%d') AS d, sleep_time, wake_time, nap_time
         FROM sleep_checkins
        WHERE user_id = ? AND checkin_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        ORDER BY checkin_date DESC LIMIT 7`,
      [userId],
    ),
    query<{ text: string; time: string; done: number }>(
      `SELECT content AS text, todo_time AS time, is_done AS done
         FROM todos WHERE user_id = ? AND todo_date = CURDATE()
        ORDER BY todo_time, id LIMIT 8`,
      [userId],
    ),
    query<{ action: string; c: number; best: number; last: string }>(
      `SELECT action, COUNT(*) AS c, MAX(score) AS best,
              DATE_FORMAT(MAX(created_at), '%m-%d') AS last
         FROM practice_scores
        WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        GROUP BY action ORDER BY c DESC LIMIT 5`,
      [userId],
    ),
    query<{ c: string; d: string }>(
      `SELECT LEFT(content, 60) AS c, DATE_FORMAT(created_at, '%m-%d') AS d
         FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 3`,
      [userId],
    ),
    queryOne<Record<string, string | null>>(
      `SELECT constitution, body_sense, diet_pref, exercise_pref, sleep_pref,
              wake_time, nap_time, bed_time
         FROM health_profiles WHERE user_id = ?`,
      [userId],
    ),
    queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM user_favorites WHERE user_id = ?", [userId]),
  ]);

  const lines: string[] = [];

  if (user?.score != null)
    lines.push(
      `情绪自评：${user.score} 分（${user.level ?? "未分级"}；PHQ-9/GAD-7 自评量表，非诊断）`,
    );

  if (mood.length)
    lines.push(
      `近7天情绪打卡：${mood.map((m) => `${m.mood}×${m.c}（最近${m.last}）`).join("、")}`,
    );

  if (symptom.length)
    lines.push(
      `近30天症状：${symptom
        .map((s) => `${s.symptom}×${s.c}（最近${s.last}，${s.sev}）`)
        .join("、")}`,
    );

  if (sleep.length)
    lines.push(
      `近7天作息打卡：${sleep
        .map(
          (s) =>
            `${s.d} 入睡${s.sleep_time || "未记"}/起床${s.wake_time || "未记"}${
              s.nap_time ? `/午憩${s.nap_time}` : ""
            }`,
        )
        .join("；")}`,
    );

  if (todo.length) {
    const done = todo.filter((t) => t.done).length;
    lines.push(
      `今日待办 ${todo.length} 条，完成 ${done} 条：${todo
        .map((t) => `${t.done ? "✔" : "○"}${t.time ? t.time + " " : ""}${t.text}`)
        .join("；")}`,
    );
  }

  if (practice.length)
    lines.push(
      `近7天跟练：${practice
        .map((p) => `${p.action}×${p.c}（最高${p.best}分，最近${p.last}）`)
        .join("、")}`,
    );

  if (notes.length)
    lines.push(`随手记：${notes.map((n) => `${n.d}「${n.c}」`).join("；")}`);

  const p = profile ?? {};
  const prof: string[] = [];
  if (p.constitution) prof.push(`自述体质 ${p.constitution}（用户自填，非辨识结果）`);
  if (p.body_sense) prof.push(`体感 ${p.body_sense}`);
  if (p.diet_pref) prof.push(`饮食偏好 ${p.diet_pref}`);
  if (p.exercise_pref) prof.push(`运动习惯 ${p.exercise_pref}`);
  if (p.sleep_pref) prof.push(`作息习惯 ${p.sleep_pref}`);
  if (p.wake_time || p.nap_time || p.bed_time)
    prof.push(
      `目标作息 ${p.wake_time || "--"}起床/${p.nap_time || "--"}午憩/${p.bed_time || "--"}入睡`,
    );
  if (prof.length) lines.push(`档案：${prof.join("；")}`);

  if (fav?.c) lines.push(`收藏 ${fav.c} 项`);

  if (!lines.length) return "";

  return `【用户平台记录快照（真实数据，用于跨板块整合；缺失的项就是没有记录，禁止编造）】\n${lines
    .map((l) => `- ${l}`)
    .join("\n")}`;
}

/** 健康背景 + 全站记录快照，一起注入系统提示词 */
export async function buildAgentContext(userId: number): Promise<string> {
  const [health, snapshot] = await Promise.all([
    buildHealthContext(userId),
    buildUserSnapshot(userId),
  ]);
  return [health, snapshot].filter(Boolean).join("\n\n");
}

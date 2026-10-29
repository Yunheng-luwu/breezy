/**
 * 服务端读取查询（Server Component 用）
 * 所有函数都基于当前登录用户；未登录时 userId=0，查询结果为空
 */
import { query, queryOne } from "@/lib/db";
import { getSessionUser, GUEST_USER_ID } from "@/lib/auth";

export interface UserRow {
  id: number;
  name: string;
  username: string | null;
  score: number | null;
  level: string | null;
  avatar: string | null;
  created_at: string;
}

export interface TodoRow {
  id: number;
  text: string;
  time: string;
  type: string;
  done: boolean;
}

export interface SymptomRow {
  id: number;
  symptom: string;
  severity: string;
  cause: string;
  note: string;
  time: string;
}

export interface MedicineRow {
  id: number;
  name: string;
  dose: string;
  time: string;
  note: string;
  lastPunchAt: string | null;
}

/** 当前用户 id（未登录 → 0，所有查询为空；写入动作需自行拒绝） */
export async function currentUserId(): Promise<number> {
  const u = await getSessionUser();
  return u?.id ?? GUEST_USER_ID;
}

/** 是否已登录（用于页面提示体验模式） */
export async function isLoggedIn(): Promise<boolean> {
  return (await getSessionUser()) !== null;
}

export async function getUser(userId: number): Promise<UserRow | null> {
  return queryOne<UserRow>(
    "SELECT id, name, username, score, level, avatar, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM users WHERE id = ?",
    [userId],
  );
}

export async function getTodos(userId: number, date?: string): Promise<TodoRow[]> {
  const rows = await query<{
    id: number;
    text: string;
    time: string;
    type: string;
    done: number;
  }>(
    `SELECT id, content AS text, todo_time AS time, type, is_done AS done
       FROM todos WHERE user_id = ? AND todo_date = COALESCE(?, CURDATE())
      ORDER BY todo_time, id`,
    [userId, date ?? null],
  );
  return rows.map((r) => ({ ...r, done: !!r.done }));
}

export async function getSymptoms(userId: number, limit = 20, offset = 0): Promise<SymptomRow[]> {
  return query<SymptomRow>(
    `SELECT id, symptom, severity, IFNULL(cause, '') AS cause, IFNULL(note, '') AS note,
            DATE_FORMAT(created_at, '%m-%d %H:%i') AS time
       FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
}

/** 随手记：最近若干条 */
export async function getNotes(
  userId: number,
  limit = 10,
): Promise<{ id: number; content: string; time: string }[]> {
  if (!userId) return [];
  return query<{ id: number; content: string; time: string }>(
    `SELECT id, content, DATE_FORMAT(created_at, '%m-%d %H:%i') AS time
       FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit],
  );
}

/** 记录日历：某月（YYYY-MM）逐日症状条数 */
export async function getSymptomMonth(
  userId: number,
  ym: string,
): Promise<Array<{ day: string; count: number }>> {
  const rows = await query<{ day: string; count: number }>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS count
       FROM symptoms
      WHERE user_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?
      GROUP BY DATE(created_at)`,
    [userId, ym],
  );
  return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}

/** 记录日历：某一天的症状明细 */
export async function getSymptomsByDay(
  userId: number,
  day: string,
): Promise<SymptomRow[]> {
  return query<SymptomRow>(
    `SELECT id, symptom, severity, IFNULL(cause, '') AS cause, IFNULL(note, '') AS note,
            DATE_FORMAT(created_at, '%H:%i') AS time
       FROM symptoms WHERE user_id = ? AND DATE(created_at) = ?
      ORDER BY created_at`,
    [userId, day],
  );
}

/** 慢病调理跟踪：近 4 周（滚动 7 天窗口）症状发作次数 */
export async function getSymptomWeeklyStats(
  userId: number,
): Promise<Array<{ label: string; start: string; end: string; count: number }>> {
  const rows = await query<{ day: string; count: number }>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS count
       FROM symptoms
      WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 27 DAY)
      GROUP BY DATE(created_at)`,
    [userId],
  );
  const map = new Map(rows.map((r) => [r.day, Number(r.count)]));
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const end = new Date();
    end.setDate(end.getDate() - w * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      count += map.get(fmt(d)) ?? 0;
    }
    weeks.push({
      label: w === 0 ? "本周" : w === 1 ? "上周" : `${w}周前`,
      start: fmt(start),
      end: fmt(end),
      count,
    });
  }
  return weeks;
}

export async function getMedicines(userId: number): Promise<MedicineRow[]> {
  return query<MedicineRow>(
    `SELECT id, name, dose, med_time AS time, IFNULL(note, '') AS note,
            DATE_FORMAT(last_punch_at, '%m-%d %H:%i') AS lastPunchAt
       FROM medicines WHERE user_id = ? ORDER BY id`,
    [userId],
  );
}

export interface HealthProfile {
  constitution: string;
  allergy: string;
  dietPref: string;
  exercisePref: string;
  sleepPref: string;
  bodySense: string;
  wakeTime: string;
  napTime: string;
  bedTime: string;
}

export async function getHealthProfile(userId: number): Promise<HealthProfile> {
  const row = await queryOne<Record<string, string | null>>(
    `SELECT constitution, allergy, diet_pref, exercise_pref, sleep_pref, body_sense,
            wake_time, nap_time, bed_time
       FROM health_profiles WHERE user_id = ?`,
    [userId],
  );
  return {
    constitution: row?.constitution ?? "",
    allergy: row?.allergy ?? "",
    dietPref: row?.diet_pref ?? "",
    exercisePref: row?.exercise_pref ?? "",
    sleepPref: row?.sleep_pref ?? "",
    bodySense: row?.body_sense ?? "",
    wakeTime: row?.wake_time ?? "",
    napTime: row?.nap_time ?? "",
    bedTime: row?.bed_time ?? "",
  };
}

export interface ChronicProfile {
  hasDisease: boolean;
  diseases: string;
  hasMeds: boolean;
  meds: string;
  pregnancy: string;
}

/** 库中 diseases/meds 为 JSON [{name,...}]，表单回显时拼成「、」分隔文本；纯文本旧数据原样透传 */
function listToText(raw: string | null): string {
  if (!raw) return "";
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) {
      return v
        .map((it) => (typeof it === "string" ? it : String(it?.name ?? "")))
        .filter(Boolean)
        .join("、");
    }
  } catch {
    // 非 JSON，按纯文本透传
  }
  return raw;
}

export async function getChronicProfile(userId: number): Promise<ChronicProfile | null> {
  const row = await queryOne<{
    has_disease: number;
    diseases: string | null;
    has_meds: number;
    meds: string | null;
    pregnancy: string;
  }>(
    "SELECT has_disease, diseases, has_meds, meds, pregnancy FROM chronic_profiles WHERE user_id = ?",
    [userId],
  );
  if (!row) return null;
  return {
    hasDisease: !!row.has_disease,
    diseases: listToText(row.diseases),
    hasMeds: !!row.has_meds,
    meds: listToText(row.meds),
    pregnancy: row.pregnancy || "none",
  };
}

export interface SymptomTrendPoint {
  date: string;
  count: number;
}

/** 近 days 天症状条数（按天分组，缺天补 0，含今天） */
export async function getSymptomTrend(userId: number, days = 14): Promise<SymptomTrendPoint[]> {
  const span = Math.max(1, Math.floor(days)) - 1;
  const rows = await query<{ d: string; c: number }>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM symptoms
      WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ${span} DAY)
      GROUP BY DATE(created_at)`,
    [userId],
  );
  const map = new Map(rows.map((r) => [r.d, Number(r.c)]));
  const out: SymptomTrendPoint[] = [];
  for (let i = span; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
      dt.getDate(),
    ).padStart(2, "0")}`;
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}

export interface SleepRow {
  sleepTime: string;
  wakeTime: string;
  napTime: string;
  date: string;
}

export async function getSleepCheckin(userId: number): Promise<SleepRow | null> {
  return queryOne<SleepRow>(
    `SELECT sleep_time AS sleepTime, wake_time AS wakeTime, nap_time AS napTime,
            DATE_FORMAT(checkin_date, '%Y-%m-%d') AS date
       FROM sleep_checkins WHERE user_id = ? AND checkin_date = CURDATE()`,
    [userId],
  );
}

export async function getRecentSleep(userId: number, limit = 7): Promise<SleepRow[]> {
  return query<SleepRow>(
    `SELECT sleep_time AS sleepTime, wake_time AS wakeTime, nap_time AS napTime,
            DATE_FORMAT(checkin_date, '%m-%d') AS date
       FROM sleep_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT ?`,
    [userId, limit],
  );
}

export async function getRecentMood(
  userId: number,
  limit = 7,
): Promise<{ id: number; mood: string; time: string }[]> {
  return query<{ id: number; mood: string; time: string }>(
    `SELECT id, mood, DATE_FORMAT(created_at, '%m-%d %H:%i') AS time
       FROM mood_checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    [userId, limit],
  );
}

/** 情绪统计：累计次数、今日次数、全量情绪分布（不写死条数） */
export async function getMoodStats(userId: number) {
  const rows = await query<{ total: number; today: number | null }>(
    `SELECT COUNT(*) AS total, SUM(created_at >= CURDATE()) AS today
       FROM mood_checkins WHERE user_id = ?`,
    [userId],
  );
  const dist = await query<{ mood: string; n: number }>(
    `SELECT mood, COUNT(*) AS n FROM mood_checkins
      WHERE user_id = ? GROUP BY mood ORDER BY n DESC, mood ASC`,
    [userId],
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    today: Number(rows[0]?.today ?? 0),
    dist: dist.map((d) => ({ mood: d.mood, n: Number(d.n) })),
  };
}

export async function getFavorites(userId: number) {
  return query<{ id: number; favType: string; targetName: string; meta: string }>(
    `SELECT id, fav_type AS favType, target_name AS targetName, meta
       FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
  );
}

/** 首页/我的：汇总数据 */
export async function getDashboard(userId: number) {
  const [user, todos, symptoms, medicines, sleep, moods] = await Promise.all([
    getUser(userId),
    getTodos(userId),
    getSymptoms(userId, 5),
    getMedicines(userId),
    getSleepCheckin(userId),
    getRecentMood(userId, 10),
  ]);
  const chatCount = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)",
    [userId],
  );
  const favList = await getFavorites(userId);
  const favCount = favList.length;
  const chatSessions = await query<{
    id: number;
    title: string;
    time: string;
  }>(
    `SELECT s.id, s.title, DATE_FORMAT(s.updated_at, '%m-%d %H:%i') AS time
       FROM chat_sessions s WHERE s.user_id = ? ORDER BY s.updated_at DESC LIMIT 10`,
    [userId],
  );
  return {
    user,
    todos,
    symptoms,
    medicines,
    sleep,
    moods,
    chatCount: chatCount?.n ?? 0,
    favCount,
    favList,
    chatSessions,
  };
}

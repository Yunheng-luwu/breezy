"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { punchRhythmAction, saveRhythmTimeAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

/* ============ 页签：作息节律 / 轻动建议 ============ */

export function RhythmTabs({ sleep, exercise }: { sleep: ReactNode; exercise: ReactNode }) {
  const [tab, setTab] = useState<"sleep" | "exercise">("sleep");
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {([
          ["sleep", "作息节律"],
          ["exercise", "轻动建议"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              tab === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "sleep" ? sleep : exercise}
    </div>
  );
}

/* ============ 作息目标时间轴：快捷打卡 + 调整目标时间 ============ */

const RANGES: Record<string, [number, number]> = {
  wakeTime: [5 * 60, 11 * 60 + 30],
  napTime: [12 * 60, 15 * 60],
  bedTime: [20 * 60, 26 * 60 + 30],
};

function fmtHM(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

interface RhythmGoal {
  key: "wakeTime" | "napTime" | "bedTime";
  punchField: "wakeTime" | "napTime" | "sleepTime";
  label: string;
  emoji: string;
  time: string;
  done: boolean;
}

export function RhythmTimeline({ goals }: { goals: RhythmGoal[] }) {
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<RhythmGoal | null>(null);
  const [editVal, setEditVal] = useState("");

  const openEdit = (g: RhythmGoal) => {
    setEdit(g);
    setEditVal(g.time);
  };

  const options: string[] = [];
  if (edit) {
    const [s, e] = RANGES[edit.key];
    for (let m = s; m <= e; m += 30) options.push(fmtHM(m));
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2 rounded-xl border bg-card p-5">
        {goals.map((g) => (
          <div key={g.key} className="text-center">
            <div className="text-2xl">{g.emoji}</div>
            <p className="mt-1 font-brush text-xl text-ink">{g.time || "--:--"}</p>
            <p className="text-xs text-muted-foreground">{g.label}</p>
            <div className="mt-2 flex justify-center gap-2 text-xs">
              <button
                type="button"
                disabled={pending || g.done}
                onClick={() => start(() => punchRhythmAction(g.punchField, g.time))}
                className={cn(
                  "rounded-full border px-2.5 py-0.5",
                  g.done
                    ? "border-jade/40 bg-jade/10 text-jade"
                    : "border-primary/40 text-primary hover:bg-primary/5",
                )}
              >
                {g.done ? "已打卡" : "打卡"}
              </button>
              <button
                type="button"
                onClick={() => openEdit(g)}
                className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground hover:border-primary/50"
              >
                调整
              </button>
            </div>
          </div>
        ))}
        <div className="text-center opacity-60">
          <div className="text-2xl">🌿</div>
          <p className="mt-1 font-brush text-xl text-ink">01:00</p>
          <p className="text-xs text-muted-foreground">肝经当令</p>
        </div>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `调整${edit.label}时间` : ""}>
        <p className="mb-3 text-xs text-muted-foreground">
          保存后会同步到你的健康档案，AI 建议也会参考它
        </p>
        <select
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setEdit(null)}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          >
            取消
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (edit) await saveRhythmTimeAction(edit.key, editVal);
                setEdit(null);
              })
            }
            className="flex-1 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            保存
          </button>
        </div>
      </Modal>
    </>
  );
}

/* ============ 熬夜补救方案（按当天打卡动态生成，对齐冻结版 openNightRepair） ============ */

function sleepMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h < 12 ? h * 60 + m + 1440 : h * 60 + m;
}

interface RepairItem {
  icon: string;
  title: string;
  text: string;
}

function buildRepair(sleepTime?: string, wakeTime?: string) {
  const items: RepairItem[] = [];
  let title = "🌙 睡眠小建议";
  let status = "";
  if (sleepTime && wakeTime) {
    const sm = sleepMinutes(sleepTime);
    const wm = sleepMinutes(wakeTime);
    let dur = wm - sm;
    if (dur <= 0) dur += 24 * 60;
    const durText = `${Math.floor(dur / 60)} 小时 ${dur % 60} 分`;
    const late = sm > 24 * 60;
    const deep = sm > 25 * 60;
    const long = dur >= 9.5 * 60;
    const short = dur < 6.5 * 60;
    const kind = late ? (long ? "lateLong" : "late") : long ? "long" : short ? "short" : "ok";
    const verdict = {
      late: "昨晚熬了夜，今天好好补一补",
      lateLong: "睡得晚又睡得久，重点是今天把节律拉回来",
      long: "睡得有点多，白天反而容易昏沉乏力",
      short: "睡得偏少，今天温和地补一补",
      ok: "睡眠时长很健康，继续保持",
    }[kind];
    status = `今日 ${sleepTime} 入睡 · ${wakeTime} 起床 · 睡了约 ${durText}。${verdict}`;

    if (kind === "late") {
      title = "🌙 熬夜补救方案";
      items.push(
        { icon: "☀️", title: "起床后先补水", text: "一杯温开水，简单拉伸 5 分钟，别立刻刷手机" },
        { icon: "🍚", title: "早餐吃温热易消化的", text: `小米粥、山药粥都好，少油炸生冷${dur < 6 * 60 ? "；昨晚睡眠不足，今天别空腹" : ""}` },
        { icon: "☕", title: "咖啡因只在上午", text: "可以来一杯咖啡或淡茶提神，14 点后别再碰，免得晚上又睡不着" },
        { icon: "😴", title: "午间小憩补回来", text: "13 点前后睡 20~30 分钟，定个闹钟，超过半小时反而影响晚上入睡" },
        { icon: "🚶", title: "今天运动降档", text: "只安排散步、八段锦这类和缓的，别做高强度训练加重身体负担" },
        { icon: "💆", title: "午休或睡前按揉穴位", text: "太冲穴（足背第1、2趾间上）2~3 分钟，酸胀为度，疏肝理气" },
        { icon: "🛁", title: "今晚温水泡脚", text: "40℃ 左右泡 15 分钟，微微发热即可，睡前 1 小时做" },
        { icon: "🌙", title: "今晚提前躺下", text: `比平时提前 30~60 分钟入睡（${deep ? "昨晚过了 1 点，今晚尽量 23 点前" : "今晚争取 23 点前"}），睡前 1 小时放下手机` },
      );
    } else if (kind === "lateLong") {
      title = "🔄 节律后移的调整";
      items.push(
        { icon: "🌅", title: "起床后晒晒太阳", text: "到窗边或户外接触阳光 10 分钟，帮生物钟重新对时" },
        { icon: "⏰", title: "今天别再补觉", text: "午憩跳过或闭目养神 15 分钟以内，困意留给今晚" },
        { icon: "🍚", title: "午餐正常吃", text: "别因为起得晚就省掉，温热易消化为主" },
        { icon: "🚶", title: "下午轻度活动", text: "散步 20 分钟或一组八段锦，别久躺刷手机" },
        { icon: "☕", title: "咖啡因只在上午", text: "14 点后别再碰，避免今晚又推迟入睡" },
        { icon: "🛁", title: "今晚温水泡脚", text: "40℃ 左右泡 15 分钟，睡前 1 小时做" },
        { icon: "🌙", title: "今晚 23 点前躺下", text: "这是把节律拉回来的关键一步，睡前 1 小时放下手机" },
      );
    } else if (kind === "long") {
      title = "🌅 睡眠过长的调整";
      items.push(
        { icon: "🌅", title: "起床后晒晒太阳", text: "到窗边或户外接触阳光 10 分钟，帮生物钟重新对时" },
        { icon: "⏰", title: "固定起床时间", text: "比睡眠总时长更重要的是节律，明天同一闹钟起床" },
        { icon: "🛋️", title: "白天别赖床久躺", text: "躺得越久越乏，起来活动，困意留给今晚" },
        { icon: "😴", title: "午憩跳过或缩短", text: "今天不建议再补觉，最多闭目养神 15~20 分钟" },
        { icon: "🚶", title: "轻度运动提神", text: "散步 20 分钟或做一组八段锦，比咖啡更解昏沉" },
        { icon: "🍵", title: "下午之后少碰咖啡因", text: "避免影响今晚入睡，晚上睡前 1 小时放下手机" },
      );
    } else if (kind === "short") {
      title = "💤 睡眠不足的补救";
      items.push(
        { icon: "☀️", title: "起床后先补水", text: "一杯温开水，简单拉伸 5 分钟再开始一天" },
        { icon: "🍚", title: "早餐别空腹", text: "温热易消化的小米粥、鸡蛋都好，给身体供上能量" },
        { icon: "☕", title: "咖啡因只在上午", text: "提神可以，但 14 点后别再碰，免得今晚又睡不着" },
        { icon: "😴", title: "午间小憩 20~30 分钟", text: "13 点前后最佳，定个闹钟，超过半小时反而头昏" },
        { icon: "🚶", title: "今天运动降档", text: "和缓为主，别硬撑高强度训练" },
        { icon: "🌙", title: "今晚提前躺下", text: "比平时提前 30~60 分钟入睡，睡前 1 小时放下手机" },
        { icon: "⚠️", title: "犯困别硬撑", text: "今天尽量避免长时间开车或高危操作" },
      );
    } else {
      title = "🌿 睡眠状况小结";
      items.push(
        { icon: "⏰", title: "固定作息继续保持", text: "保持同一时间起床，周末浮动尽量不超过 1 小时" },
        { icon: "🌅", title: "早晨晒晒太阳", text: "起床后接触阳光，让生物钟更稳定" },
        { icon: "💆", title: "常规养生别落下", text: "睡前温水泡脚 15 分钟，或按揉太冲穴 2~3 分钟疏肝理气" },
        { icon: "🧘", title: "睡前 1 小时静下来", text: "放下手机，做几组 478 呼吸更容易入睡" },
      );
    }
  } else {
    status = "今天还没有睡眠打卡，在上方打卡后，这里会按你的实际入睡和起床时间生成专属方案。先给你一份通用版：";
    items.push(
      { icon: "☀️", title: "起床后先补水", text: "一杯温开水，简单拉伸 5 分钟再开始一天" },
      { icon: "😴", title: "午间小憩", text: "13 点前后睡 20~30 分钟，别超过半小时" },
      { icon: "🌙", title: "今晚 23 点前躺下", text: "睡前 1 小时放下手机，温水泡脚 15 分钟更好入睡" },
    );
  }
  return { title, status, items };
}

/** 熬夜补救方案条目 → 对应功能页（找不到对应则不可点） */
function planHref(title: string): string | undefined {
  if (/穴位|太冲/.test(title)) return "/care";
  if (/泡脚/.test(title)) return "/care";
  if (/八段锦|拉伸|运动|活动|散步/.test(title)) return "/practice?tab=stretch";
  if (/呼吸/.test(title)) return "/practice?tab=stretch&move=%E6%B7%B1%E5%91%BC%E5%90%B8478";
  if (/粥|早餐|午餐|咖啡|茶|饮食/.test(title)) return "/diet";
  return undefined;
}

export function NightRepairCard({
  sleepTime,
  wakeTime,
}: {
  sleepTime?: string;
  wakeTime?: string;
}) {
  const [open, setOpen] = useState(false);
  const plan = buildRepair(sleepTime, wakeTime);
  return (
    <>
      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 font-semibold text-ink">熬夜补救</h3>
        <div className="space-y-2 text-sm">
          {[
            { text: "按揉太冲穴 5 分钟", href: "/care" },
            { text: "喝枸杞菊花茶", href: "/diet" },
            { text: "午间小憩 20 分钟", href: undefined },
          ].map((it, i) =>
            it.href ? (
              <Link
                key={it.text}
                href={it.href}
                className="flex items-center justify-between text-muted-foreground transition-colors hover:text-primary"
              >
                <span>
                  {i + 1}. {it.text}
                </span>
                <span aria-hidden>→</span>
              </Link>
            ) : (
              <p key={it.text} className="text-muted-foreground">
                {i + 1}. {it.text}
              </p>
            ),
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-md border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/5"
        >
          点击查看完整方案
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={plan.title}>
        <p className="mb-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          {plan.status}
        </p>
        <div className="divide-y divide-dashed divide-border">
          {plan.items.map((it) => {
            const href = planHref(it.title);
            const body = (
              <>
                <span className="text-xl leading-6">{it.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {it.title}
                    {href && <span className="ml-1 text-xs font-normal text-primary">去看看 →</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{it.text}</p>
                </div>
              </>
            );
            return href ? (
              <Link
                key={it.title}
                href={href}
                className="flex gap-3 py-2.5 transition-colors hover:bg-primary/5"
              >
                {body}
              </Link>
            ) : (
              <div key={it.title} className="flex gap-3 py-2.5">
                {body}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          补救只是应急，规律作息才是养肝的根本。以上建议仅供健康参考。
        </p>
      </Modal>
    </>
  );
}

/* ============ 周作息趋势：入睡 / 起床 / 午憩 三指标切换对比 ============ */

export interface TrendDay {
  key: string;
  week: string;
  sleepTime: string | null;
  wakeTime: string | null;
  napTime: string | null;
}

type TrendField = "sleepTime" | "wakeTime" | "napTime";

/** 入睡跨零点：0-12 点视为次日，加 1440 便于比较 */
function trendMinutes(field: TrendField, t: string) {
  const [h, m] = t.split(":").map(Number);
  return field === "sleepTime" && h < 12 ? h * 60 + m + 1440 : h * 60 + m;
}

const TREND_METRICS: Array<{
  field: TrendField;
  label: string;
  emoji: string;
  min: number;
  max: number;
  color: (v: number) => string;
  tip: (vals: number[]) => string;
}> = [
  {
    field: "sleepTime",
    label: "入睡",
    emoji: "🌙",
    min: 20 * 60,
    max: 26 * 60 + 30,
    color: (v) =>
      v <= 22 * 60 + 30
        ? "bg-jade"
        : v <= 24 * 60
          ? "bg-primary"
          : v <= 25 * 60
            ? "bg-amber-500"
            : "bg-destructive",
    tip: (vals) => {
      if (!vals.length) return "🧠 每天记录入睡时间，这里会帮你盯住熬夜的日子";
      const late = vals.filter((v) => v > 24 * 60).length;
      return late === 0
        ? "💚 最近入睡很规律，肝胆得到充分休养，继续保持"
        : `🕯️ 近7天有 ${late} 天过了零点才睡，尽量在 23 点前躺下，养肝效果更好`;
    },
  },
  {
    field: "wakeTime",
    label: "起床",
    emoji: "🌅",
    min: 5 * 60,
    max: 11 * 60,
    color: (v) =>
      v <= 7 * 60
        ? "bg-jade"
        : v <= 8 * 60
          ? "bg-primary"
          : v <= 9 * 60
            ? "bg-amber-500"
            : "bg-destructive",
    tip: (vals) => {
      if (!vals.length) return "🌅 还没有起床记录，打卡后这里能看到起床规律";
      const late = vals.filter((v) => v > 8 * 60 + 30).length;
      if (late === 0) return "💚 起床时间很稳，阳气升发顺畅，继续保持";
      return `🌤️ 近7天有 ${late} 天 8:30 之后才起，尽量 7 点前起身，顺应阳气升发`;
    },
  },
  {
    field: "napTime",
    label: "午憩",
    emoji: "😴",
    min: 11 * 60,
    max: 16 * 60,
    color: (v) =>
      v >= 11 * 60 + 30 && v <= 14 * 60
        ? "bg-jade"
        : v <= 14 * 60 + 30
          ? "bg-primary"
          : v <= 15 * 60 + 30
            ? "bg-amber-500"
            : "bg-destructive",
    tip: (vals) => {
      if (!vals.length) return "😴 还没有午憩记录，13 点前后闭目 20 分钟更养心";
      const good = vals.filter((v) => v >= 11 * 60 + 30 && v <= 14 * 60).length;
      return good === vals.length
        ? "💚 午憩时间正好，闭目养神，下午精神更足"
        : "🕒 午憩偏晚，尽量 13 点前后小憩 20 分钟，别超过 30 分钟";
    },
  },
];

export function SleepTrendCard({ week }: { week: TrendDay[] }) {
  const [field, setField] = useState<TrendField>("sleepTime");
  const metric = TREND_METRICS.find((m) => m.field === field)!;

  const has: number[] = [];
  week.forEach((d) => {
    const t = d[field];
    if (t) has.push(trendMinutes(field, t));
  });

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-brush text-xl font-bold text-ink">周作息趋势</h2>
        <div className="flex gap-2">
          {TREND_METRICS.map((m) => (
            <button
              key={m.field}
              type="button"
              onClick={() => setField(m.field)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                field === m.field
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-ink",
              )}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex h-32 items-end justify-around gap-2 border-b border-border pb-2">
        {week.map((d) => {
          const t = d[field];
          if (!t) {
            return (
              <div key={d.key} className="flex h-full flex-col items-center justify-end gap-1">
                <span className="text-[11px] text-muted-foreground">—</span>
                <div className="h-[14%] w-6 rounded-t bg-muted" />
                <span className="text-xs text-muted-foreground">{d.week}</span>
              </div>
            );
          }
          const mins = trendMinutes(field, t);
          const pct = Math.max(
            18,
            Math.min(100, ((mins - metric.min) / (metric.max - metric.min)) * 82 + 18),
          );
          return (
            <div key={d.key} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="text-[11px] text-muted-foreground">{t}</span>
              <div
                className={cn("w-6 rounded-t", metric.color(mins))}
                style={{ height: `${pct}%` }}
              />
              <span className="text-xs text-muted-foreground">{d.week}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{metric.tip(has)}</p>
    </div>
  );
}

/* ============ 轻动建议：场景筛选 + 跟着做 ============ */

const EXERCISE_SCENE: Record<string, string> = {
  梳头功: "office",
  扩胸运动: "office",
  深呼吸478: "office",
  侧腰拉伸: "office",
  "八段锦·两手托天": "home",
  搓胁肋: "home",
};

// 轻动「跟着做」→ 跳到对应功法所在页面并定位到该动作
const FOLLOW_HREF: Record<string, string> = {
  "八段锦·两手托天": `/practice/baduanjin?move=${encodeURIComponent("两手托天理三焦")}`,
  搓胁肋: `/practice?tab=stretch&move=${encodeURIComponent("搓胁肋")}`,
  侧腰拉伸: `/practice?tab=stretch&move=${encodeURIComponent("侧腰拉伸")}`,
  扩胸运动: `/practice?tab=stretch&move=${encodeURIComponent("扩胸展肩")}`,
  梳头功: `/practice?tab=office&move=${encodeURIComponent("梳头功")}`,
  深呼吸478: `/practice?tab=stretch&move=${encodeURIComponent("深呼吸478")}`,
};

interface ExerciseItem {
  name: string;
  duration: string;
  tag: string;
  icon: string;
}

export function ExercisePanel({ items }: { items: ExerciseItem[] }) {
  const [scene, setScene] = useState<"all" | "office" | "home">("all");
  const list = items.filter((e) => scene === "all" || EXERCISE_SCENE[e.name] === scene);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([
          ["all", "全部"],
          ["office", "办公课间"],
          ["home", "日常居家"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setScene(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition",
              scene === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">该场景暂无动作</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <div key={e.name} className="rounded-xl border bg-card p-4 text-center">
              <div className="text-3xl">{e.icon}</div>
              <p className="mt-2 font-medium text-ink">{e.name}</p>
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                {e.tag}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">{e.duration}</p>
              <Link
                href={FOLLOW_HREF[e.name] ?? "/practice"}
                className="mt-3 block rounded-md border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/5"
              >
                跟着做
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

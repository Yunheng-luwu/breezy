"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import {
  addNoteAction,
  deleteNoteAction,
  quickSymptomAction,
  symptomCalendarAction,
  symptomDayAction,
} from "@/lib/actions";
import { cn } from "@/lib/utils";

/* ============ 页签：症状记录 / 用药提醒 / 慢病调理 ============ */

export function RecordTabs({
  symptom,
  medicine,
  chronic,
}: {
  symptom: ReactNode;
  medicine: ReactNode;
  chronic: ReactNode;
}) {
  const [tab, setTab] = useState<"symptom" | "medicine" | "chronic">("symptom");
  const tabs = [
    ["symptom", "症状记录"],
    ["medicine", "用药提醒"],
    ["chronic", "慢病调理"],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {tabs.map(([key, label]) => (
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
      {tab === "symptom" ? symptom : tab === "medicine" ? medicine : chronic}
    </div>
  );
}

/* ============ 快速记录症状（快捷标签 + 程度/诱因表单） ============ */

const QUICK_SYMPTOMS = [
  { name: "头疼", emoji: "🤕" },
  { name: "胸闷", emoji: "😷" },
  { name: "失眠", emoji: "💤" },
  { name: "易怒", emoji: "😤" },
  { name: "腹胀", emoji: "🫛" },
  { name: "口苦", emoji: "👅" },
];

export function QuickSymptoms() {
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [sev, setSev] = useState("轻度");
  const [cause, setCause] = useState("");
  const [customName, setCustomName] = useState("");
  const [pending, start] = useTransition();

  const name = custom ? customName.trim() : (picked ?? "");
  const submit = () => {
    if (!name) return;
    start(async () => {
      await quickSymptomAction(name, sev, cause);
      setPicked(null);
      setCustom(false);
      setCustomName("");
      setCause("");
      setSev("轻度");
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-3 font-semibold text-ink">快速记录症状</h3>
      <div className="flex flex-wrap gap-2">
        {QUICK_SYMPTOMS.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => {
              setPicked(s.name);
              setCustom(false);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              picked === s.name && !custom
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            {s.emoji} {s.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setCustom(true);
            setPicked(null);
          }}
          className={cn(
            "rounded-full border border-dashed px-3 py-1.5 text-sm transition",
            custom
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          ✏️ 其他症状
        </button>
      </div>

      {(picked || custom) && (
        <div className="mt-4 space-y-3 rounded-lg bg-muted/40 p-4">
          <p className="text-sm">
            症状：
            {custom ? (
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={50}
                placeholder="输入症状名称"
                className="ml-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            ) : (
              <b className="text-ink">{picked}</b>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              程度
              <select
                value={sev}
                onChange={(e) => setSev(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                <option>轻度</option>
                <option>中度</option>
                <option>重度</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              可能原因
              <input
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                maxLength={50}
                placeholder="如：熬夜、压力大"
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={pending || !name}
              onClick={submit}
              className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              记录
            </button>
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setCustom(false);
              }}
              className="rounded-md border border-border px-4 py-1.5 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ 记录日历（月份翻页 + 点日期看明细） ============ */

interface DayCount {
  day: string;
  count: number;
}
interface DayItem {
  id: number;
  symptom: string;
  severity: string;
  cause: string;
  time: string;
}

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SymptomCalendar({ initial }: { initial: DayCount[] }) {
  const now = new Date();
  const [ym, setYm] = useState(ymOf(now));
  const [counts, setCounts] = useState<DayCount[]>(initial);
  const [dayItems, setDayItems] = useState<{ day: string; items: DayItem[] } | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const countMap = new Map(counts.map((c) => [c.day, c.count]));
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayKey = `${ymOf(now)}-${String(now.getDate()).padStart(2, "0")}`;

  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    const next = ymOf(d);
    setYm(next);
    start(async () => {
      setCounts(await symptomCalendarAction(next));
      setSelectedKey(null);
    });
  };

  const openDay = (key: string) => {
    setSelectedKey(key);
    start(async () => {
      const items = (await symptomDayAction(key)) as DayItem[];
      setDayItems({ day: key, items });
    });
  };

  const cells: Array<{ key: string; label?: number; count?: number }> = [];
  for (let i = 0; i < first.getDay(); i++) cells.push({ key: `e${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${ym}-${String(d).padStart(2, "0")}`;
    cells.push({ key, label: d, count: countMap.get(key) ?? 0 });
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="h-7 w-7 rounded-full border border-border text-muted-foreground hover:border-primary/50"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-ink">
          {y} 年 {m} 月
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="h-7 w-7 rounded-full border border-border text-muted-foreground hover:border-primary/50"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
        {cells.map((c) =>
          c.label == null ? (
            <div key={c.key} />
          ) : (
            <button
              key={c.key}
              type="button"
              disabled={pending}
              title={c.count ? `${c.count} 条记录，点击查看` : "点击查看当天"}
              onClick={() => openDay(c.key)}
              className={cn(
                "relative rounded-md py-1.5 text-sm transition hover:border-primary/40",
                c.key === selectedKey
                  ? "border border-primary bg-primary text-primary-foreground"
                  : "border border-transparent",
                c.key !== selectedKey && c.key === todayKey && "ring-1 ring-primary/40",
                c.key !== selectedKey && !c.count && c.key !== todayKey
                  ? "text-muted-foreground hover:text-ink"
                  : c.key !== selectedKey && c.count
                    ? "bg-primary/10 font-medium text-primary hover:bg-primary/15"
                    : "text-ink",
              )}
            >
              {c.label}
              {!!c.count && c.key !== selectedKey && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          ),
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 rounded-full bg-primary" />
          有记录
        </span>
        <span className="flex items-center gap-1">
          <i className="h-2 w-2 rounded-full ring-1 ring-primary/40" />
          今天
        </span>
        <span className="text-[11px]">任意日期都可点 · 点开看当天记录</span>
      </div>

      <Modal
        open={!!dayItems}
        onClose={() => {
          setDayItems(null);
          setSelectedKey(null);
        }}
        title={dayItems ? `${dayItems.day} 症状记录` : ""}
      >
        {dayItems && dayItems.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            这天还没有症状记录
          </p>
        ) : (
          <div className="space-y-2">
            {dayItems?.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium text-ink">{it.symptom}</span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {it.severity}
                </span>
                <span className="flex-1 text-xs text-muted-foreground">{it.cause || "—"}</span>
                <span className="text-xs text-muted-foreground">{it.time}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============ 慢病调理（静态常识 + AI 计划 + 近4周跟踪） ============ */

const CHRONIC_DATA: Record<
  string,
  { methods: Array<[string, string]>; signals: Array<[string, string]> }
> = {
  偏头痛: {
    methods: [
      ["🧘 穴位", "风池、太阳、合谷，每个穴位轻柔按揉 2-3 分钟"],
      ["🍵 饮食", "天麻炖鱼头、菊花茶；少红酒、奶酪、浓咖啡"],
      ["🛌 作息", "尽量 23 点前入睡，午休 15-20 分钟，不睡太久"],
    ],
    signals: [
      ["调理周期", "以 4 周为一个观察周期，记录发作频率与程度"],
      ["加重信号", "发作频率增加、持续时间变长、疼痛程度加重"],
      ["就医指征", "伴呕吐、视觉异常或肢体麻木，或“最严重的一次头痛”，请及时就诊"],
    ],
  },
  慢性咽炎: {
    methods: [
      ["🧘 穴位", "列缺、照海、天突（轻揉，勿重按），每日 2-3 次"],
      ["🍵 饮食", "胖大海枸杞茶、百合银耳羹；忌辛辣油炸、烟酒"],
      ["🗣️ 习惯", "少清嗓子、多喝温水，空调房注意加湿"],
    ],
    signals: [
      ["调理周期", "养护以 4-8 周为周期，减少反复刺激最重要"],
      ["加重信号", "咽痛明显、吞咽困难、反复清嗓带血"],
      ["就医指征", "持续超过 2 周不缓解或伴发热、声音嘶哑，请耳鼻喉科就诊"],
    ],
  },
  月经不调: {
    methods: [
      ["🧘 穴位", "三阴交、太冲、血海，经前一周开始轻揉"],
      ["🍵 饮食", "玫瑰枸杞茶、当归红枣蛋；经前忌生冷"],
      ["🛌 作息", "规律睡眠、注意腰腹保暖，情绪波动时做 478 呼吸"],
    ],
    signals: [
      ["调理周期", "连续观察 2-3 个月经周期，记录周期、经期、经量"],
      ["加重信号", "周期紊乱加重、经量明显变化、经前情绪剧烈波动"],
      ["就医指征", "停经、非经期出血、剧痛或周期长期紊乱，请妇科就诊"],
    ],
  },
  功能性消化不良: {
    methods: [
      ["🧘 穴位", "中脘、足三里、内关，饭后 1 小时轻揉"],
      ["🍵 饮食", "山药小米粥、陈皮茶；少食多餐，细嚼慢咽"],
      ["🚶 习惯", "饭后散步 10-15 分钟，避免立刻躺下"],
    ],
    signals: [
      ["调理周期", "以 2-4 周为周期，观察腹胀、嗳气变化"],
      ["加重信号", "餐后腹胀持续加重、食欲明显下降、体重减轻"],
      ["就医指征", "黑便、持续呕吐、夜间痛醒或症状超过 4 周，请消化科就诊"],
    ],
  },
};

interface WeekStat {
  label: string;
  start: string;
  end: string;
  count: number;
}

export function ChronicPanel({ weeks }: { weeks: WeekStat[] }) {
  const [name, setName] = useState("偏头痛");
  const d = CHRONIC_DATA[name];
  const total = weeks.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const first = weeks[0]?.count ?? 0;
  const last = weeks[weeks.length - 1]?.count ?? 0;
  const tip =
    total === 0
      ? "📝 近4周还没有症状记录，去「症状记录」记一记，才能看出调理趋势"
      : first > last
        ? "🧠 近4周发作频率在下降，当前调理方向是对的，继续保持"
        : first < last
          ? "🧠 本周发作比之前频繁，留意发作当天的作息、饮食和情绪，必要时调整方案"
          : `🧠 近4周共记录 ${total} 次发作，频率基本持平，坚持记录观察变化`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {Object.keys(CHRONIC_DATA).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setName(k)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              name === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold text-ink">日常调理方法</h3>
            <div className="space-y-2 text-sm leading-relaxed">
              {d.methods.map(([k, v]) => (
                <p key={k}>
                  <b>{k}：</b>
                  <span className="text-muted-foreground">{v}</span>
                </p>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 font-semibold text-ink">调理周期与加重信号</h3>
            <div className="space-y-2 text-sm leading-relaxed">
              {d.signals.map(([k, v], i) => (
                <p key={k}>
                  <b className={i === 2 ? "text-destructive" : ""}>{k}：</b>
                  <span className="text-muted-foreground">{v}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
        <Link
          href={`/assistant?q=${encodeURIComponent(`我最近在调理「${name}」，请结合疏肝解郁的思路，为我生成一份本周可执行的调理计划：每天 1 个养生动作、饮食注意和作息安排，并提醒我什么情况下需要就医。`)}`}
          className="mt-4 block rounded-md bg-primary px-4 py-2 text-center text-sm text-primary-foreground"
        >
          让 AI 生成本周调理计划
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">
          日常养护内容仅供参考，不能替代医生诊疗
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 font-semibold text-ink">调理跟踪</h3>
        <div className="flex h-28 items-end justify-around gap-3">
          {weeks.map((w) => {
            const pct = w.count ? Math.max(12, (w.count / max) * 88) : 4;
            const color =
              w.count === 0
                ? "bg-muted"
                : w.count >= max && max >= 3
                  ? "bg-destructive"
                  : w.count >= 2
                    ? "bg-amber-500"
                    : "bg-primary";
            return (
              <div key={w.label} className="flex h-full flex-col items-center justify-end gap-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {w.count || ""}
                </span>
                <div className={`w-8 rounded-t ${color}`} style={{ height: `${pct}%` }} />
                <span className="text-xs text-muted-foreground">{w.label}</span>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground/70">
                  {w.start.slice(5).replace("-", "/")}~{w.end.slice(5).replace("-", "/")}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{tip}</p>
      </div>
    </div>
  );
}

/* ============ 随手记 ============ */

export function NotePanel({
  initial,
}: {
  initial: { id: number; content: string; time: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    const t = text.trim();
    if (!t) return;
    start(async () => {
      await addNoteAction(t);
      setText("");
      setOpen(false);
      router.refresh();
    });
  }

  function remove(id: number) {
    start(async () => {
      await deleteNoteAction(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-primary/30 bg-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">随手记</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {open ? "收起" : "写一条 +"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="记下今天身体的感觉、吃了什么、心情如何……"
            className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {text.length}/500
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !text.trim()}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 max-h-44 space-y-2 overflow-y-auto scrollbar-thin">
        {initial.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            还没有随手记，点「写一条」记下此刻的感受
          </p>
        ) : (
          initial.map((n) => (
            <div key={n.id} className="group rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-start gap-2">
                <p className="flex-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink">
                  {n.content}
                </p>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label="删除这条随手记"
                  className="text-[11px] leading-none text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{n.time}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============ 症状历史（限高滚动 + 翻页加载更多） ============ */

import { loadSymptomsAction } from "@/lib/actions";
import type { SymptomRow } from "@/lib/queries";

const PAGE = 30;

export function SymptomHistoryList({ initial }: { initial: SymptomRow[] }) {
  const [rows, setRows] = useState<SymptomRow[]>(initial);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    setLoading(true);
    try {
      const more = await loadSymptomsAction(rows.length);
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...more.filter((m) => !seen.has(m.id))];
      });
      if (more.length < PAGE) setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        还没有症状记录，点上方快捷标签开始
      </p>
    );
  }

  return (
    <>
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="font-medium text-ink">{row.symptom}</span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {row.severity}
            </span>
            <span className="flex-1 truncate text-xs text-muted-foreground">
              {row.cause || "—"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{row.time}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-3 w-full rounded-lg border border-dashed border-primary/40 py-2 text-xs text-primary transition hover:bg-primary/5 disabled:opacity-50"
        >
          {loading ? "加载中…" : "加载更早的记录"}
        </button>
      )}
    </>
  );
}

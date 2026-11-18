"use client";

/**
 * "我的状态"四张卡：今日调养页（preview）只读展示，个人中心（manage）可展开管理
 * 情绪自评 → 分数与等级
 * 今日待办 → 今日待办，可勾选/取消、可删除
 * 情绪打卡 → 近 10 次情绪打卡，可删除单条
 * 收藏数  → 收藏列表，可取消收藏
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatItem {
  label: string;
  icon: string;
  value: string;
  hint: string;
  href: string;
  key: "score" | "todo" | "mood" | "fav";
}

interface TodoRow {
  id: number;
  text: string;
  done: boolean;
}
interface FavRow {
  id: number;
  favType: string;
  targetName: string;
}
interface MoodRow {
  id: number;
  mood: string;
  time: string;
}

export function StatsPanel({
  score,
  level,
  todos,
  favList,
  moods,
  mode = "manage",
}: {
  score: number | null;
  level: string | null;
  todos: TodoRow[];
  favList: FavRow[];
  moods: MoodRow[];
  /** preview：只读展示，卡片点击跳个人中心；manage：可展开管理 */
  mode?: "preview" | "manage";
}) {
  const router = useRouter();
  const [open, setOpen] = useState<StatItem["key"] | null>(null);
  const [busy, setBusy] = useState(false);

  const doneTodos = todos.filter((t) => t.done).length;
  const stats: StatItem[] = [
    {
      label: "情绪自评",
      icon: "🌿",
      value: score != null ? String(score) : "--",
      hint: level ?? "待自评",
      href: "/profile#assessment",
      key: "score",
    },
    {
      label: "今日待办",
      icon: "✅",
      value: `${doneTodos}/${todos.length}`,
      hint: todos.length === 0 ? "去安排" : doneTodos === todos.length ? "已完成" : "进行中",
      href: "/rhythm#todo",
      key: "todo",
    },
    {
      label: "情绪打卡",
      icon: "💭",
      value: String(moods.length),
      hint: "近 10 次",
      href: "/mood#mood-checkin",
      key: "mood",
    },
    {
      label: "收藏数",
      icon: "⭐",
      value: String(favList.length),
      hint: "我的收藏",
      href: "/profile",
      key: "fav",
    },
  ];

  /** 点卡片直达对应页面：个人中心里情绪自评滚到测评区，收藏展开列表管理 */
  function go(s: StatItem) {
    if (s.key === "score") {
      document
        .getElementById("assessment")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (s.key === "fav") {
      setOpen(open === "fav" ? null : "fav");
      return;
    }
    // 整页跳转，保证带 #锚点 时能定位到对应区块
    window.location.assign(s.href);
  }

  /** 统一写库：成功后让服务端组件重新取数，列表自动刷新 */
  async function act(
    action: string,
    payload: Record<string, unknown>,
    confirmMsg?: string,
  ) {
    if (busy) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        window.alert(data.message ?? "操作失败");
        return;
      }
      router.refresh();
    } catch {
      window.alert("网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  const body = open && (
    <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold text-ink">
          {open === "mood" && `情绪打卡 · 最近 ${moods.length} 次`}
          {open === "fav" && `我的收藏 · 共 ${favList.length} 条`}
        </h4>
        <button
          type="button"
          onClick={() => setOpen(null)}
          aria-label="关闭"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {open === "mood" && (
        <div className="space-y-2">
          {moods.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              还没打过情绪卡 · 去<Link href="/mood" className="text-primary underline">情绪解压</Link>页打卡
            </p>
          ) : (
            moods.map((m) => (
              <div
                key={m.id}
                className="group flex items-center gap-2 rounded-lg border border-border px-3 py-1.5"
              >
                <span className="text-xl">{emojiOf(m.mood)}</span>
                <span className="flex-1 truncate text-sm text-ink">{m.mood}</span>
                <span className="text-xs text-muted-foreground">{m.time}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act("delete_mood", { id: m.id }, "删除这条情绪记录？")}
                  aria-label="删除记录"
                  className="rounded p-1 text-muted-foreground/60 transition hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {open === "fav" && (
        <div className="space-y-2">
          {favList.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              还没有收藏 · 浏览内容时点⭐就会出现在这里
            </p>
          ) : (
            favList.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {favTypeLabel(f.favType)}
                </span>
                <span className="flex-1 truncate text-sm text-ink">{f.targetName}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act("delete_favorite", { id: f.id }, `取消收藏「${f.targetName}」？`)
                  }
                  className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-40"
                >
                  取消收藏
                </button>
              </div>
            ))
          )}
        </div>
      )}

    </div>
  );

  const cardInner = (s: StatItem) => (
    <>
      <span className="text-2xl">{s.icon}</span>
      <p className="mt-2 text-3xl font-bold text-ink">{s.value}</p>
      <p className="text-xs text-muted-foreground">{s.label}</p>
      <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
        {s.hint}
      </span>
    </>
  );

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-brush text-2xl font-bold text-ink">我的状态</h2>
        {mode === "preview" ? (
          <Link href="/profile" className="text-sm text-primary hover:underline">
            查看档案 →
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">点击卡片直达对应页面</span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) =>
          mode === "preview" ? (
            <a
              key={s.key}
              href={s.href}
              className="rounded-xl border bg-card p-5 text-center transition-all hover:border-primary hover:shadow-sm"
            >
              {cardInner(s)}
            </a>
          ) : (
            <button
              key={s.key}
              type="button"
              onClick={() => go(s)}
              className={cn(
                "rounded-xl border bg-card p-5 text-center transition-all hover:border-primary hover:shadow-sm",
                open === s.key && "border-primary ring-1 ring-primary/30",
              )}
            >
              {cardInner(s)}
            </button>
          ),
        )}
      </div>
      {mode === "manage" && (
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>管理：</span>
          <button
            type="button"
            onClick={() => setOpen(open === "mood" ? null : "mood")}
            className={cn("transition-colors hover:text-primary", open === "mood" && "text-primary")}
          >
            情绪记录
          </button>
          <button
            type="button"
            onClick={() => setOpen(open === "fav" ? null : "fav")}
            className={cn("transition-colors hover:text-primary", open === "fav" && "text-primary")}
          >
            收藏
          </button>
        </div>
      )}
      {mode === "manage" && body}
    </section>
  );
}

function emojiOf(mood: string): string {
  const m = mood ?? "";
  if (/开心|愉快|好|棒|喜欢/.test(m)) return "😊";
  if (/平静|一般|还行/.test(m)) return "😐";
  if (/疲惫|累|乏/.test(m)) return "😵";
  if (/难过|伤心|低落|丧/.test(m)) return "😢";
  if (/烦躁|焦虑|紧张|怒|生气/.test(m)) return "😤";
  if (/失眠|睡不好/.test(m)) return "😴";
  return "🙂";
}

function favTypeLabel(t: string): string {
  return { recipe: "食疗", acupoint: "穴位", diet: "饮食", footbath: "泡脚" }[t] ?? t;
}

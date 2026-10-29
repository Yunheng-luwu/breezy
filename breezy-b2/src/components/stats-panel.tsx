"use client";

/**
 * 个人中心顶部"我的状态"四张卡：点击展开详情面板，并支持直接管理
 * 情绪自评 → 近 10 次情绪打卡，可删除单条
 * 今日打卡 → 今日待办，可勾选/取消、可删除
 * 收藏数  → 收藏列表，可取消收藏
 * AI 对话数 → 最近会话，可打开、可删除
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
  key: "mood" | "todo" | "fav" | "chat";
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
interface ChatRow {
  id: number;
  title: string;
  time: string;
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
  chatSessions,
  moods,
}: {
  score: number | null;
  level: string | null;
  todos: TodoRow[];
  favList: FavRow[];
  chatSessions: ChatRow[];
  moods: MoodRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<StatItem["key"] | null>(null);
  const [busy, setBusy] = useState(false);

  const doneTodos = todos.filter((t) => t.done).length;
  const stats: StatItem[] = [
    {
      label: "情绪自评",
      icon: "🌡️",
      value: score != null ? String(score) : "--",
      key: "mood",
    },
    {
      label: "今日打卡",
      icon: "✅",
      value: `${doneTodos}/${todos.length}`,
      key: "todo",
    },
    { label: "收藏数", icon: "⭐", value: String(favList.length), key: "fav" },
    { label: "AI 对话数", icon: "💬", value: String(chatSessions.length), key: "chat" },
  ];

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

  async function deleteSession(id: number) {
    if (busy) return;
    if (!window.confirm("删除该会话及全部对话记录？")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        window.alert(data.message ?? "删除失败");
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
          {open === "mood" && `情绪自评：${score != null ? score + " 分" : "未测评"}${level ? " · " + level : ""}`}
          {open === "todo" && `今日待办 · 已完成 ${doneTodos}/${todos.length}`}
          {open === "fav" && `我的收藏 · 共 ${favList.length} 条`}
          {open === "chat" && `AI 对话 · 最近 ${chatSessions.length} 个会话`}
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

      {open === "todo" && (
        <div className="space-y-2">
          {todos.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              今日还没有待办 · 去<Link href="/rhythm" className="text-primary underline">生活节律</Link>页安排
            </p>
          ) : (
            todos.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-3 py-1.5",
                  t.done && "bg-muted/50",
                )}
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act("toggle_todo", { id: t.id, done: !t.done })}
                  aria-label={t.done ? "取消完成" : "标记完成"}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] transition disabled:opacity-40",
                    t.done
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-border text-transparent hover:border-primary",
                  )}
                >
                  ✓
                </button>
                <span
                  className={cn(
                    "flex-1 truncate text-sm",
                    t.done ? "text-muted-foreground line-through" : "text-ink",
                  )}
                >
                  {t.text}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act("delete_todo", { id: t.id }, `删除待办「${t.text}」？`)}
                  aria-label="删除待办"
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

      {open === "chat" && (
        <div className="space-y-2">
          {chatSessions.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              还没有对话 · 去<Link href="/assistant" className="text-primary underline">AI 助手</Link>聊聊
            </p>
          ) : (
            chatSessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 transition hover:border-primary/50 hover:bg-primary/5"
              >
                <Link href={`/assistant?session=${s.id}`} className="flex flex-1 items-center gap-2">
                  <span className="flex-1 truncate text-sm text-ink">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{s.time}</span>
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => deleteSession(s.id)}
                  aria-label="删除会话"
                  className="rounded p-1 text-muted-foreground/60 transition hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">我的状态</h2>
        {open && (
          <span className="text-xs text-muted-foreground">点击下方条目可管理</span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setOpen(open === s.key ? null : s.key)}
            className={cn(
              "rounded-xl border bg-card p-5 text-center transition-all hover:border-primary hover:shadow-sm",
              open === s.key && "border-primary ring-1 ring-primary/30",
            )}
          >
            <span className="text-2xl">{s.icon}</span>
            <p className="mt-2 text-3xl font-bold text-ink">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </button>
        ))}
      </div>
      {body}
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

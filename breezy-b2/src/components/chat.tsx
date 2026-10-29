"use client";

/**
 * AI 助手（AI SDK v5 useChat）
 * - 对接 /api/agent（流式 + tool calling + 结构化卡片）
 * - 渲染 15 种卡片，确认卡点击后才写库
 */
import { useState, useMemo, useEffect, useRef, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, StopCircle, Sparkles, Plus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AgentCards, type AgentCardData } from "@/components/agent-cards";
import Link from "next/link";
import { ChatSidebar } from "@/components/chat-sidebar";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "最近总胸闷、爱叹气，怎么调理？",
  "今天吃什么比较养肝？",
  "八段锦该怎么练？",
  "帮我把「今晚10点泡脚」加进待办",
  "我失眠多梦，推荐按哪个穴位？",
];

/** 提取文本 */
function getMessageText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** 提取一轮消息里的卡片 */
function getMessageCards(m: UIMessage): AgentCardData[] {
  const cards: AgentCardData[] = [];
  for (const p of (m.parts ?? []) as Array<{ type: string; data?: unknown }>) {
    if (p.type === "data-cards") {
      const data = p.data as { cards?: AgentCardData[] } | undefined;
      if (data?.cards) cards.push(...data.cards);
    }
  }
  return cards;
}

/** 提取安全等级（急症拦截） */
function getMessageSafety(m: UIMessage): string | undefined {
  for (const p of (m.parts ?? []) as Array<{ type: string; data?: unknown }>) {
    if (p.type === "data-safety") {
      const data = p.data as { level?: string } | undefined;
      if (data?.level) return data.level;
    }
  }
  return undefined;
}

/** 提取会话 id */
function getMessageSession(m: UIMessage): number | undefined {
  for (const p of (m.parts ?? []) as Array<{ type: string; data?: unknown }>) {
    if (p.type === "data-session") {
      const data = p.data as { sessionId?: number } | undefined;
      if (data?.sessionId) return data.sessionId;
    }
  }
  return undefined;
}

/** 渲染 AI 正文：把 [板块名](/路径) 形式的链接变成可点击按钮 */
function RichText({ text }: { text: string }) {
  const re = /\[([^\]\n]{1,24})\]\((\/[a-z][a-z0-9\-/?=&%#]*)\)/gi;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <Link
        key={k++}
        href={m[2]}
        className="mx-1 inline-flex items-center gap-1 rounded-full border-2 border-primary/50 bg-primary/10 px-3.5 py-1 text-sm font-semibold text-primary shadow-sm transition-all hover:scale-105 hover:bg-primary/15"
      >
        {m[1]} →
      </Link>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

export function Chat({ initialText }: { initialText?: string }) {
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopHistoryOpen, setDesktopHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);
  const ensuringRef = useRef<Promise<number | undefined> | null>(null);
  const [activeQ, setActiveQ] = useState(0);
  const [hoverQ, setHoverQ] = useState<number | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, setMessages } = useChat({
    transport,
    // 直接从流式数据段捕获会话 id：比遍历消息更可靠，保证多轮对话写进同一会话
    onData: (part: unknown) => {
      const p = part as { type?: string; data?: { sessionId?: number } };
      if (p?.type === "data-session" && p.data?.sessionId) {
        const sid = p.data.sessionId;
        setSessionId((prev) => (prev === sid ? prev : sid));
      }
    },
  });

  const isLoading = status === "submitted" || status === "streaming";

  // 会话提问目录（对齐冻结版 buildChatQToc）：每条用户提问一个圆点
  const questions = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user")
        .map((m) => getMessageText(m).replace(/\s+/g, " ").trim()),
    [messages],
  );

  // 用户消息 → 提问序号（供目录定位）
  const userIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const m of messages) if (m.role === "user") map.set(m.id, n++);
    return map;
  }, [messages]);

  const syncActiveQ = () => {
    const area = listRef.current;
    if (!area) return;
    const nodes = area.querySelectorAll<HTMLElement>("[data-qturn]");
    if (!nodes.length) return;
    const line = area.getBoundingClientRect().top + area.clientHeight * 0.25;
    let idx = 0;
    nodes.forEach((el, i) => {
      if (el.getBoundingClientRect().top <= line) idx = i;
    });
    if (area.scrollTop + area.clientHeight >= area.scrollHeight - 40) {
      idx = nodes.length - 1;
    }
    setActiveQ((prev) => (prev === idx ? prev : idx));
  };

  const jumpToQuestion = (i: number) => {
    const area = listRef.current;
    if (!area) return;
    const el = area.querySelector<HTMLElement>(`[data-qturn="${i}"]`);
    if (!el) return;
    const top =
      el.getBoundingClientRect().top -
      area.getBoundingClientRect().top +
      area.scrollTop -
      60;
    area.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  useEffect(() => {
    syncActiveQ();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status]);

  // 从流式返回中捕获会话 id，后续轮次复用同一会话；新会话创建后刷新侧栏
  useEffect(() => {
    for (const m of messages) {
      const sid = m.role === "assistant" ? getMessageSession(m) : undefined;
      if (sid && sid !== sessionId) {
        setSessionId(sid);
        setSessionsVersion((v) => v + 1);
        break;
      }
    }
  }, [messages, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // 确保当前有一个会话 id：已有则复用，没有则先建一个，保证多轮写进同一会话
  const ensureSession = async (): Promise<number | undefined> => {
    if (sessionId) return sessionId;
    if (ensuringRef.current) return ensuringRef.current;
    const task = (async () => {
      try {
        const res = await fetch("/api/chat-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: { id?: number };
        };
        const id = json?.data?.id;
        if (json?.ok && id) {
          setSessionId(id);
          setSessionsVersion((v) => v + 1);
          return id;
        }
      } catch {
        /* 建会话失败时退回服务端自动建会话 */
      } finally {
        ensuringRef.current = null;
      }
      return undefined;
    })();
    ensuringRef.current = task;
    return task;
  };

  const submitText = async (text: string) => {
    const t = text.trim();
    if (!t || isLoading) return;
    // 每轮显式带上会话 id，保证多轮对话写进同一会话
    const sid = await ensureSession();
    sendMessage({ text: t }, { body: sid ? { sessionId: sid } : {} });
    setInput("");
  };

  // 携带 q（如从情绪页「AI 树洞」跳转）进入时，自动发出第一句，仅一次
  useEffect(() => {
    if (initialSentRef.current || !initialText || messages.length > 0) return;
    initialSentRef.current = true;
    submitText(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText, messages.length]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    submitText(input);
  };

  const newChat = () => {
    setMessages([]);
    setSessionId(undefined);
    setInput("");
    ensuringRef.current = null;
    try {
      sessionStorage.removeItem("breezy_chat_sid");
    } catch {
      /* 忽略隐私模式限制 */
    }
  };

  // 侧栏切换会话：拉取历史消息灌入 useChat；null = 新对话
  const selectSession = async (id: number | null) => {
    if (id === null) {
      newChat();
      return;
    }
    if (id === sessionId) return;
    try {
      const res = await fetch(`/api/chat-sessions?id=${id}`);
      const json = (await res.json()) as {
        ok?: boolean;
        data?: Array<{ id: number; role: string; content: string; cards?: AgentCardData[] | null }>;
      };
      if (!json?.ok) return;
      // 历史消息同步还原卡片/板块导航，否则重进会话链接会消失
      const history: UIMessage[] = (json.data ?? []).map((m) => ({
        id: String(m.id),
        role: m.role as UIMessage["role"],
        parts: [
          { type: "text", text: m.content },
          ...(m.cards?.length
            ? [{ type: "data-cards" as const, data: { cards: m.cards } }]
            : []),
        ],
      }));
      setMessages(history);
      setSessionId(id);
      setInput("");
      try {
        sessionStorage.setItem("breezy_chat_sid", String(id));
      } catch {
        /* 忽略隐私模式限制 */
      }
    } catch {
      /* 切换失败保持当前会话 */
    }
  };

  // 刷新/从其它页跳回时恢复上次会话，避免同一话题被拆成多条历史
  useEffect(() => {
    // 携带新问题（?q=）进入时按新对话处理
    if (initialText) return;
    try {
      const saved = Number(sessionStorage.getItem("breezy_chat_sid"));
      if (saved > 0) void selectSession(saved);
    } catch {
      /* 忽略隐私模式限制 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 记住当前会话，供刷新后恢复
  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem("breezy_chat_sid", String(sessionId));
    } catch {
      /* 忽略隐私模式限制 */
    }
  }, [sessionId]);

  return (
    <div className="flex h-full">
      <ChatSidebar
        currentId={sessionId}
        onSelect={selectSession}
        refreshKey={sessionsVersion}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        desktopOpen={desktopHistoryOpen}
        onCloseDesktop={() => setDesktopHistoryOpen(false)}
      />

      <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* 顶部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="历史会话"
            onClick={() => setSidebarOpen(true)}
          >
            <History className="h-4 w-4" />
          </Button>
          {!desktopHistoryOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label="展开历史会话"
              title="历史会话"
              onClick={() => setDesktopHistoryOpen(true)}
            >
              <History className="h-4 w-4" />
            </Button>
          )}
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">小松 · AI 健康助手</p>
            <p className="text-[11px] text-muted-foreground">
              中医知识库 · 23 项工具 · 个性化调理
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={newChat}>
          <Plus className="mr-1 h-4 w-4" /> 新对话
        </Button>
      </div>

      {/* 消息列表 + 会话提问目录 */}
      <div className="relative flex min-h-0 flex-1">
        {questions.length >= 2 && (
          <nav
            aria-label="本次提问目录"
            onMouseLeave={() => setHoverQ(null)}
            className="absolute bottom-28 left-2 top-24 z-10 hidden w-5 flex-col items-center justify-center gap-3 md:flex"
          >
            {questions.map((q, i) => {
              const center = hoverQ ?? activeQ;
              const d = i - center;
              const scale = 1 + 0.9 * Math.exp(-(d * d) / (2 * 0.85 * 0.85));
              return (
                <button
                  key={i}
                  type="button"
                  title={q}
                  aria-label={q.slice(0, 30)}
                  onMouseEnter={() => setHoverQ(i)}
                  onClick={() => jumpToQuestion(i)}
                  style={{ transform: `scale(${scale.toFixed(3)})` }}
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full transition-[transform,background-color] duration-100",
                    i === activeQ
                      ? "bg-primary"
                      : "bg-[#6b4e2e]/25 hover:bg-[#6b4e2e]/45",
                  )}
                />
              );
            })}
          </nav>
        )}

        <div
          ref={listRef}
          onScroll={syncActiveQ}
          className={cn(
            "flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin",
            questions.length >= 2 && "md:pl-12",
          )}
        >
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-lg text-center">
            <p className="text-4xl">🌿</p>
            <p className="mt-3 text-base font-medium">你好，我是小松</p>
            <p className="mt-1 text-sm text-muted-foreground">
              说说你最近的身体感受，我会从中医知识库出发，给你可执行的调理建议。
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submitText(s)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const text = getMessageText(m);
          const cards = m.role === "assistant" ? getMessageCards(m) : [];
          const safety = m.role === "assistant" ? getMessageSafety(m) : undefined;
          if (!text && cards.length === 0) return null;
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              data-qturn={isUser ? userIndexMap.get(m.id) : undefined}
              className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}
            >
              {!isUser && (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs">
                  🌿
                </span>
              )}
              <div className={cn("max-w-[85%]", isUser && "order-first")}>
                {safety && (
                  <div className="mb-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                    <p className="text-sm font-semibold text-destructive">
                      急症提醒 · 请优先就医
                    </p>
                    <p className="mt-1 text-xs text-destructive/80">
                      以下内容仅为紧急情况下的初步指引，请立即拨打 120 或前往急诊，本助手不能替代医生诊断。
                    </p>
                  </div>
                )}
                {text && (
                  <div
                    className={cn(
                      "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      isUser ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {isUser ? text : <RichText text={text} />}
                  </div>
                )}
                {cards.length > 0 && <AgentCards cards={cards} />}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-2">
            <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs">
              🌿
            </span>
            <div className="rounded-2xl bg-muted px-4 py-3">
              <span className="flex gap-1">
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.2s]" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.1s]" />
                <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              出错了：{error.message}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* 输入区 */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="说说你最近的感受，例如「最近总失眠、容易烦躁」…"
            className="min-h-[44px] resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {isLoading ? (
            <Button type="button" variant="outline" size="icon" onClick={stop}>
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          内容仅作养生参考，不能替代医生诊断；出现急症请及时就医。
        </p>
      </form>
      </div>
    </div>
  );
}

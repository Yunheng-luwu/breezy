"use client";

/**
 * AI 助手历史会话侧栏（桌面端显示，移动端 hidden）
 * 对齐冻结版样式：纯标题列表 + 管理模式（勾选/全选/批量删除）
 * onSelect(id) 切换会话；onSelect(null) 表示新对话
 * refreshKey 变化时重新拉取列表（新会话创建后由父组件递增）
 */
import { useCallback, useEffect, useState } from "react";
import { Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatSessionItem {
  id: number;
  title: string;
  time: string;
}

export function ChatSidebar({
  currentId,
  onSelect,
  refreshKey = 0,
  mobileOpen = false,
  onCloseMobile,
  desktopOpen = true,
  onCloseDesktop,
}: {
  currentId?: number;
  onSelect: (id: number | null) => void;
  refreshKey?: number;
  /** 移动端抽屉开关（桌面端侧栏可收起） */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** 桌面端侧栏是否展开 */
  desktopOpen?: boolean;
  onCloseDesktop?: () => void;
}) {
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-sessions");
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ChatSessionItem[];
      };
      if (json?.ok) setSessions(json.data ?? []);
    } catch {
      /* 列表加载失败不阻塞对话 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [refreshKey, load]);

  // 移动端抽屉：Esc 关闭
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  const toggleManage = () => {
    setManaging((m) => !m);
    setSelected(new Set());
  };

  const togglePick = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPicked = sessions.length > 0 && selected.size === sessions.length;
  const toggleAll = () => {
    setSelected(allPicked ? new Set() : new Set(sessions.map((s) => s.id)));
  };

  const deleteSelected = async () => {
    if (!selected.size || deleting) return;
    if (!window.confirm(`确定删除选中的 ${selected.size} 条对话吗？删除后不可恢复`)) return;
    setDeleting(true);
    const currentDeleted = currentId != null && selected.has(currentId);
    for (const id of Array.from(selected)) {
      try {
        await fetch("/api/chat-sessions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
      } catch {
        /* 单条失败继续删其余 */
      }
    }
    setSelected(new Set());
    setManaging(false);
    await load();
    // 删除的包含当前会话：清空对话区回到新对话
    if (currentDeleted) onSelect(null);
    setDeleting(false);
  };

  // 侧栏内选择会话/新对话后，移动端抽屉随之关闭
  const select = (id: number | null) => {
    onSelect(id);
    onCloseMobile?.();
  };

  const body = (isMobile: boolean) => (
    <>
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <p className="text-xs tracking-wider text-muted-foreground">历史会话</p>
        <div className="flex items-center gap-1">
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={toggleManage}
              title={managing ? "完成管理" : "管理对话"}
              className={cn(
                "rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary",
                managing && "text-xs font-medium text-primary",
              )}
            >
              {managing ? "完成" : <Settings2 className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={isMobile ? onCloseMobile : onCloseDesktop}
            aria-label={isMobile ? "关闭历史会话" : "收起历史会话"}
            title={isMobile ? "关闭" : "收起"}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {managing && (
        <div className="flex items-center justify-between px-4 pb-2 text-xs text-muted-foreground">
          <label className="flex cursor-pointer select-none items-center gap-1.5">
            <input
              type="checkbox"
              checked={allPicked}
              onChange={toggleAll}
              className="h-3.5 w-3.5 accent-primary"
            />
            全选
          </label>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={selected.size === 0 || deleting}
            className="rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-destructive/10 disabled:hover:text-destructive"
          >
            {deleting ? "删除中…" : `删除${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      )}

      <div className="flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
        {loading && (
          <p className="px-2 py-3 text-xs text-muted-foreground">加载中…</p>
        )}
        {!loading && sessions.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            还没有对话，和小松聊聊吧
          </p>
        )}
        {sessions.map((s) =>
          managing ? (
            <div
              key={s.id}
              onClick={() => togglePick(s.id)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                selected.has(s.id)
                  ? "bg-primary/15 font-medium text-ink"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                readOnly
                tabIndex={-1}
                className="h-3.5 w-3.5 shrink-0 accent-primary"
              />
              <span className="truncate">{s.title || "新的对话"}</span>
            </div>
          ) : (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              title={s.title}
              className={cn(
                "block w-full truncate rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                s.id === currentId
                  ? "bg-primary/15 font-medium text-ink"
                  : "text-muted-foreground hover:bg-muted hover:text-ink",
              )}
            >
              {s.title || "新的对话"}
            </button>
          ),
        )}
      </div>
    </>
  );

  return (
    <>
      {/* 桌面端：可收起侧栏 */}
      {desktopOpen && (
        <aside className="hidden h-full w-56 shrink-0 flex-col border-r bg-card/50 md:flex">
          {body(false)}
        </aside>
      )}
      {/* 移动端：抽屉 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭历史会话"
            onClick={onCloseMobile}
            className="absolute inset-0 h-full w-full bg-black/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r bg-card shadow-xl">
            {body(true)}
          </aside>
        </div>
      )}
    </>
  );
}

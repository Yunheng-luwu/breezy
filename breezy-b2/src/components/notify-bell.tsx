"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotifyItem {
  id: number;
  time: string;
}

interface TodoItem extends NotifyItem {
  text: string;
}

interface MedItem extends NotifyItem {
  name: string;
}

interface NotifyData {
  todos: TodoItem[];
  meds: MedItem[];
}

/** 全局提醒铃铛：今日待办 / 待服药物，mount 时拉取一次；支持拖动并记住位置 */
export function NotifyBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotifyData>({ todos: [], meds: [] });
  const ref = useRef<HTMLDivElement>(null);
  /** 拖动后的固定定位（null 表示保持默认右上角） */
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [vw, setVw] = useState(0);
  const dragRef = useRef({
    active: false,
    moved: false,
    dx: 0,
    dy: 0,
    sx: 0,
    sy: 0,
  });
  const suppressClickRef = useRef(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j.data) setData(j.data);
      })
      .catch(() => {});
  }, []);

  // 恢复上次拖到的位置（越界时拉回视口内）
  useEffect(() => {
    if (typeof window === "undefined") return;
    setVw(window.innerWidth);
    try {
      const raw = window.localStorage.getItem("notify-bell-pos");
      if (raw) {
        const p = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof p.x === "number" && typeof p.y === "number") {
          setPos({
            x: Math.min(Math.max(p.x, 8), window.innerWidth - 48),
            y: Math.min(Math.max(p.y, 8), window.innerHeight - 48),
          });
        }
      }
    } catch {
      /* 忽略损坏的本地缓存 */
    }
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  const clamp = (v: number, max: number) => Math.min(Math.max(v, 8), max);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      active: true,
      moved: false,
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      sx: e.clientX,
      sy: e.clientY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    // 位移超过 3px 才视为拖动，避免误伤点击
    if (!d.moved && Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) <= 3) {
      return;
    }
    d.moved = true;
    setPos({
      x: clamp(e.clientX - d.dx, window.innerWidth - 48),
      y: clamp(e.clientY - d.dy, window.innerHeight - 48),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d.moved) {
      suppressClickRef.current = true;
      setPos((p) => {
        if (p) {
          try {
            window.localStorage.setItem("notify-bell-pos", JSON.stringify(p));
          } catch {
            /* 隐私模式下忽略 */
          }
        }
        return p;
      });
    }
  };

  const count = data.todos.length + data.meds.length;
  // 弹窗展开方向：靠近右边界时向左展开，否则向右
  const popupRight = pos ? pos.x + 8 + 288 > (vw || 1024) : true;

  return (
    <div
      ref={ref}
      className="fixed z-40"
      style={pos ? { left: pos.x, top: pos.y } : { right: 20, top: 20 }}
    >
      <button
        type="button"
        aria-label="今日提醒（可拖动）"
        title="可拖动调整位置"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setOpen((v) => !v);
        }}
        className="relative flex h-10 w-10 cursor-grab touch-none items-center justify-center rounded-full border bg-card shadow transition-colors hover:border-primary active:cursor-grabbing"
      >
        <Bell className="h-5 w-5 text-ink" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute mt-2 w-72 rounded-lg border bg-card p-4 shadow-lg",
            popupRight ? "right-0" : "left-0",
          )}
        >
          {count === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              今日事项都完成啦 🌿
            </p>
          ) : (
            <div className="space-y-4">
              {data.todos.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-ink">今日待办</p>
                  <ul className="space-y-1.5">
                    {data.todos.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate text-muted-foreground">
                          {t.text}
                        </span>
                        {t.time && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.time}
                          </span>
                        )}
                        <Link
                          href="/rhythm"
                          onClick={() => setOpen(false)}
                          className="shrink-0 text-xs text-primary hover:underline"
                        >
                          去处理 →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.meds.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-ink">待服药物</p>
                  <ul className="space-y-1.5">
                    {data.meds.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate text-muted-foreground">
                          {m.name}
                        </span>
                        {m.time && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {m.time}
                          </span>
                        )}
                        <Link
                          href="/record"
                          onClick={() => setOpen(false)}
                          className="shrink-0 text-xs text-primary hover:underline"
                        >
                          去处理 →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

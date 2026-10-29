"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toggleTodoAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

/** 待办勾选（客户端，调用 Server Action 后自动刷新） */
export function TodoToggle({
  id,
  done,
  label,
  time,
}: {
  id: number;
  done: boolean;
  label: string;
  time?: string;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => toggleTodoAction(id, !done))}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/60",
        done && "bg-muted/40",
        pending && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          done ? "border-jade bg-jade text-white" : "border-muted-foreground/40",
        )}
      >
        {done && <Check className="h-3 w-3" />}
      </span>
      <span
        className={cn(
          "flex-1 text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {label}
      </span>
      {time && <span className="text-xs text-muted-foreground">{time}</span>}
    </button>
  );
}

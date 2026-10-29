"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { toggleFavoriteAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

/**
 * 收藏按钮：点击后调用 Server Action 写库，并即时切换状态
 */
export function FavButton({
  type,
  name,
  meta = "",
  active = false,
}: {
  type: string;
  name: string;
  meta?: string;
  active?: boolean;
}) {
  const [on, setOn] = useState(active);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    try {
      const next = await toggleFavoriteAction(type, name, meta);
      setOn(next);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
        pending && "opacity-60",
      )}
    >
      <Star className={cn("h-3 w-3", on && "fill-current")} />
      {on ? "已收藏" : "收藏"}
    </button>
  );
}

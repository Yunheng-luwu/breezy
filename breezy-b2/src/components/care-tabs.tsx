"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 居家保健页签：穴位疏通 / 泡脚助眠（对齐冻结版 switchCareTab 布局）
 */
export function CareTabs({
  acupoint,
  footbath,
  initialTab = "footbath",
}: {
  acupoint: ReactNode;
  footbath: ReactNode;
  /** 带 ?acupoint= 深链进入时默认切到穴位疏通 */
  initialTab?: "acupoint" | "footbath";
}) {
  const [tab, setTab] = useState<"acupoint" | "footbath">(initialTab);
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(
          [
            ["footbath", "泡脚助眠"],
            ["acupoint", "穴位疏通"],
          ] as const
        ).map(([key, label]) => (
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
      <div>{tab === "acupoint" ? acupoint : footbath}</div>
    </div>
  );
}

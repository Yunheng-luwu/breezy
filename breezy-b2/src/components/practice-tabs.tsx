"use client";

/**
 * 功法带练三分类 tab（八段锦 / 疏肝拉伸操 / 办公室微运动）
 * 顶部固定「AI 跟练」「排行榜」两个入口，不随 tab 切换
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MoveItem {
  name: string;
}

interface ExerciseItem {
  name: string;
  duration: string;
  desc: string;
}

interface PracticeTabsProps {
  baduanjin: MoveItem[];
  stretch: ExerciseItem[];
  office: ExerciseItem[];
  initialTab?: string;
  initialMove?: string;
}

const MOVE_ICONS: Record<string, string> = {
  预备式: "🧘",
  两手托天理三焦: "🤲",
  左右开弓似射雕: "🏹",
  调理脾胃须单举: "🙌",
  五劳七伤往后瞧: "👀",
  摇头摆尾去心火: "🐉",
  两手攀足固肾腰: "🤸",
  攥拳怒目增气力: "👊",
  背后七颠百病消: "🦶",
  收式: "🌿",
};

const TABS = [
  { key: "baduanjin", label: "八段锦", icon: "🧘" },
  { key: "stretch", label: "疏肝拉伸操", icon: "🤸" },
  { key: "office", label: "办公室微运动", icon: "💼" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ExerciseGrid({
  items,
  tip,
  highlight,
}: {
  items: ExerciseItem[];
  tip: string;
  highlight?: string;
}) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card
            key={item.name}
            id={`move-${item.name}`}
            className={cn(
              "h-full scroll-mt-24 transition-colors hover:border-primary",
              highlight === item.name && "border-primary bg-primary/5 ring-2 ring-primary/25",
            )}
          >
            <CardContent className="pt-5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-ink">{item.name}</p>
                <span className="shrink-0 rounded-full bg-accent px-2.5 py-0.5 text-xs text-accent-foreground">
                  ⏱ {item.duration}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">{tip}</p>
    </div>
  );
}

export default function PracticeTabs({
  baduanjin,
  stretch,
  office,
  initialTab,
  initialMove,
}: PracticeTabsProps) {
  const [tab, setTab] = useState<TabKey>(
    initialTab === "stretch" || initialTab === "office" ? initialTab : "baduanjin",
  );

  // 从其它页面「跟着做」跳进来时，滚动到对应动作并高亮
  useEffect(() => {
    if (!initialMove) return;
    const el = document.getElementById(`move-${initialMove}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [initialMove, tab]);

  return (
    <div className="space-y-6">
      {/* 固定入口：整套带练 + AI 跟练 + 排行榜 */}
      <div className="grid gap-3 md:grid-cols-3">
        <Link href="/practice/baduanjin?full=1" className="group block">
          <Card className="h-full border-primary/30 bg-primary/5 transition-colors group-hover:border-primary">
            <CardContent className="flex items-center gap-4 pt-5">
              <span className="text-3xl transition-transform group-hover:scale-110">🧘</span>
              <div>
                <p className="font-medium text-ink">整套带练</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  摄像头开一次 · 逐式推进 · 自动换示范与评分
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/practice/baduanjin?ai=1" className="group block">
          <Card className="h-full border-primary/30 bg-primary/5 transition-colors group-hover:border-primary">
            <CardContent className="flex items-center gap-4 pt-5">
              <span className="text-3xl transition-transform group-hover:scale-110">🤖</span>
              <div>
                <p className="font-medium text-ink">AI 跟练</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  摄像头实时捕捉 · 动作标准度评分 · 全服排行榜
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rank" className="group block">
          <Card className="h-full border-primary/30 bg-primary/5 transition-colors group-hover:border-primary">
            <CardContent className="flex items-center gap-4 pt-5">
              <span className="text-3xl transition-transform group-hover:scale-110">🏆</span>
              <div>
                <p className="font-medium text-ink">排行榜</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  查看全服动作评分排名
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* tab 切换 */}
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-ink",
            )}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "baduanjin" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {baduanjin.map((move, i) => (
            <Link
              key={move.name}
              href={`/practice/baduanjin?move=${encodeURIComponent(move.name)}`}
              className="group block"
            >
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardContent className="pt-5 text-center">
                  <span className="inline-block text-4xl transition-transform group-hover:scale-110">
                    {MOVE_ICONS[move.name] ?? "🧘"}
                  </span>
                  <p className="mt-2 text-sm font-medium">{move.name}</p>
                  <p className="text-xs text-muted-foreground">第 {i + 1} 式</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {tab === "stretch" && (
        <ExerciseGrid
          items={stretch}
          tip="配合自然呼吸，动作缓慢舒展"
          highlight={initialMove}
        />
      )}

      {tab === "office" && (
        <ExerciseGrid
          items={office}
          tip="每工作 1 小时起来做一组"
          highlight={initialMove}
        />
      )}
    </div>
  );
}

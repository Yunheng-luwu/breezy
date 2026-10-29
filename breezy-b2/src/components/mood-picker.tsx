"use client";

import { useEffect, useState, useTransition } from "react";
import { addMoodAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MOODS = ["舒畅", "一般", "烦躁", "焦虑", "低落", "疲惫"];

/** 情绪打卡：点击按钮调用 Server Action 记录 */
export function MoodPicker() {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  const pick = (mood: string) => {
    start(() => {
      addMoodAction(mood).then(() => setSaved(mood));
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            disabled={pending}
            onClick={() => pick(mood)}
            className={cn(
              "rounded-full border bg-card px-4 py-2 text-sm transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground disabled:opacity-60",
              saved === mood && "border-jade bg-accent text-accent-foreground",
            )}
          >
            {mood}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {pending ? "记录中…" : saved ? `已记录「${saved}」` : "点一点，记下此刻的心情"}
      </p>
    </div>
  );
}

const PHASES = [
  { label: "吸气", secs: 4 },
  { label: "屏息", secs: 7 },
  { label: "呼气", secs: 8 },
];

const IDLE = { idx: 0, left: PHASES[0].secs, round: 1, running: false, done: false };

/** 4-7-8 呼吸引导：吸 4 秒、屏 7 秒、呼 8 秒，循环 4 轮 */
export function Breathing478() {
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    if (!state.running) return;
    const timer = setInterval(() => {
      setState((s) => {
        if (!s.running) return s;
        if (s.left > 1) return { ...s, left: s.left - 1 };
        const next = s.idx + 1;
        if (next < PHASES.length) return { ...s, idx: next, left: PHASES[next].secs };
        if (s.round >= 4) return { ...s, running: false, done: true, left: 0 };
        return { ...s, idx: 0, left: PHASES[0].secs, round: s.round + 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.running]);

  const phase = PHASES[state.idx];

  // 运行中：按阶段呼吸（吸 4s 放大、屏 7s 保持、呼 8s 缩小）
  // 常态：即使未开始也持续缓慢起伏，不出现"死圈"
  const scale = !state.running ? 1 : phase.label === "呼气" ? 0.84 : 1.12;
  const glow = state.running ? scale * 1.28 : 1.28;
  const dur = phase.secs;

  return (
    <div className="space-y-4 text-center">
      <div
        className={cn(
          "relative mx-auto flex h-52 w-52 items-center justify-center",
          !state.running && "animate-calm-breathe",
        )}
      >
        <div
          className="absolute h-40 w-40 rounded-full bg-jade/15 blur-xl transition-transform ease-in-out"
          style={{ transform: `scale(${glow})`, transitionDuration: `${dur}s` }}
        />
        <div
          className="relative flex h-40 w-40 items-center justify-center rounded-full border border-jade/40 bg-secondary/60 transition-transform ease-in-out"
          style={{ transform: `scale(${scale})`, transitionDuration: `${dur}s` }}
        >
          <div>
            <p className="font-brush text-xl text-jade">{state.done ? "完成" : phase.label}</p>
            <p className="text-3xl font-bold text-ink">{state.done ? "4 轮" : state.left}</p>
            <p className="text-xs text-muted-foreground">
              {state.done ? "身心已放松" : `第 ${state.round} / 4 轮`}
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        <Button
          size="sm"
          onClick={() => setState({ ...IDLE, running: true })}
          disabled={state.running}
        >
          {state.done ? "再来一轮" : "开始 4-7-8 呼吸"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setState((s) => ({ ...s, running: false }))}
          disabled={!state.running}
        >
          暂停
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">吸 4 秒 · 屏 7 秒 · 呼 8 秒，循环 4 轮</p>
    </div>
  );
}

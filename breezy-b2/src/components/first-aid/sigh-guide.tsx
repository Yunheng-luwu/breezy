"use client";

/**
 * 生理性叹息引导：双吸一呼 × 5 轮（对齐冻结版节奏）
 * 吸气 2s（放大到 1.12）→ 再吸一口 1s（放大到 1.22）→ 缓缓呼 8s（缩回 0.85）
 * 呼吸球随阶段缩放 + 光晕扩散 + 环形进度，只有节奏提示，没有超时失败。
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const PHASES = [
  {
    label: "吸气…",
    hint: "用鼻子轻轻吸第一口",
    scale: 1.12,
    halo: 1.34,
    haloOpacity: 0.5,
    glow: 0.34,
    ms: 2000,
  },
  {
    label: "再吸一口…",
    hint: "趁气还没出去，快速再补吸一小口",
    scale: 1.22,
    halo: 1.52,
    haloOpacity: 0.58,
    glow: 0.42,
    ms: 1000,
  },
  {
    label: "缓缓呼——",
    hint: "用嘴巴缓缓地、长长地呼出去",
    scale: 0.85,
    halo: 1.08,
    haloOpacity: 0.18,
    glow: 0.16,
    ms: 8000,
  },
];

const TOTAL_ROUNDS = 5;

const RING_R = 100;
const RING_C = 2 * Math.PI * RING_R;

export function SighGuide() {
  const [running, setRunning] = useState(false);
  const [round, setRound] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);

  const phase = PHASES[phaseIdx];

  // setTimeout 驱动阶段流转，卸载 / 停止时自动清理
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      if (phaseIdx < PHASES.length - 1) {
        setPhaseIdx((i) => i + 1);
      } else if (round < TOTAL_ROUNDS) {
        setRound((r) => r + 1);
        setPhaseIdx(0);
      } else {
        setRunning(false);
        setDone(true);
      }
    }, phase.ms);
    return () => clearTimeout(timer);
  }, [running, phaseIdx, round, phase.ms]);

  // 阶段内进度环（rAF 平滑推进，让长呼气有可感知的节奏）
  useEffect(() => {
    if (!running) {
      setProgress(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / phase.ms);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, phaseIdx, round, phase.ms]);

  const start = () => {
    setRound(1);
    setPhaseIdx(0);
    setDone(false);
    setProgress(0);
    setRunning(true);
  };

  const transition = `transform ${running ? phase.ms : 700}ms cubic-bezier(0.37, 0, 0.63, 1), opacity ${running ? phase.ms : 700}ms ease-in-out, box-shadow ${running ? phase.ms : 700}ms ease-in-out`;

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="relative flex h-56 w-56 items-center justify-center">
        {/* 外层光晕：吸气时扩散变亮，呼气时收回变淡 */}
        <span
          aria-hidden
          className="absolute inset-6 rounded-full bg-jade/15 blur-md"
          style={{
            transform: `scale(${running ? phase.halo : 1})`,
            opacity: running ? phase.haloOpacity : 0.28,
            transition,
          }}
        />
        <span
          aria-hidden
          className="absolute inset-10 rounded-full bg-jade/20 blur-sm"
          style={{
            transform: `scale(${running ? phase.halo * 0.9 : 1})`,
            opacity: running ? phase.haloOpacity * 0.8 : 0.34,
            transition,
          }}
        />

        {/* 阶段进度环：一圈走完即进入下一阶段 */}
        <svg viewBox="0 0 224 224" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle
            cx="112"
            cy="112"
            r={RING_R}
            fill="none"
            stroke="hsl(160 40% 88%)"
            strokeWidth="3"
          />
          <circle
            cx="112"
            cy="112"
            r={RING_R}
            fill="none"
            stroke="hsl(160 50% 35%)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
            transform="rotate(-90 112 112)"
            style={{ opacity: running ? 0.85 : 0 }}
          />
        </svg>

        {/* 呼吸球 */}
        <div
          className="relative h-36 w-36 overflow-hidden rounded-full ring-1 ring-white/70"
          style={{
            transform: `scale(${running ? phase.scale : 1})`,
            transition,
            boxShadow: `0 20px 60px -14px hsl(160 50% 35% / ${running ? phase.glow : 0.22}), inset 0 -10px 26px hsl(160 40% 62% / 0.35), inset 0 10px 20px hsl(0 0% 100% / 0.75)`,
          }}
        >
          {/* 缓慢流动的渐变，让球体内部不呆板 */}
          <span
            aria-hidden
            className="absolute -inset-6 animate-[spin_18s_linear_infinite] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 34% 26%, hsl(150 48% 97%), hsl(152 42% 90%) 42%, hsl(158 38% 80%) 100%)",
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 22%, hsl(0 0% 100% / 0.85), transparent 45%)",
            }}
          />
        </div>
      </div>

      <p className="font-brush text-xl text-jade">
        {running ? phase.label : done ? "完成" : "双吸一呼"}
      </p>
      {running ? (
        <>
          <p className="text-sm text-muted-foreground">{phase.hint}</p>
          <p className="text-xs text-muted-foreground">
            第 {round} / {TOTAL_ROUNDS} 轮
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {done
            ? "做得很好，感受一下现在的自己"
            : "两次短吸 + 一次长呼，跟着圆圈的节奏做就好"}
        </p>
      )}
      {!running && (
        <Button size="sm" variant={done ? "outline" : "default"} onClick={start}>
          {done ? "再做一轮" : "开始叹息练习"}
        </Button>
      )}
    </div>
  );
}

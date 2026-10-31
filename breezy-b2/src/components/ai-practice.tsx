"use client";

/**
 * AI 摄像头跟练（MediaPipe 姿态识别）
 * - 懒加载：用户点击「开始 AI 跟练」后才挂载核心组件
 * - 纯前端推理：视频只进本地 canvas 推理，不上传
 * - 引擎：/js/ai-pose.js（window.AIPose），模型按需从 /ai-models 加载
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AiMoveOption {
  name: string;
  video: string;
}

interface AiPracticeProps {
  moves: AiMoveOption[];
  defaultMove?: string;
  /** 整套模式：摄像头只开一次，逐式推进，自动换示范视频与该式评分阈值 */
  routine?: boolean;
}

interface AIPoseEngine {
  start: (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    opts: {
      action?: string;
      onScore?: (score: number, level?: string) => void;
      onRep?: (n: number, target?: number) => void;
      onStatus?: (text: string) => void;
    },
  ) => Promise<void>;
  stop: () => void;
  setAction: (name: string) => void;
  diag?: () => {
    running: boolean;
    delegate: string;
    frames: number;
    detOK: number;
    pts: number;
    video: string;
    canvas: string;
    inferErr: string;
    handErr: string;
    drawErr: string;
  };
}

declare global {
  interface Window {
    AIPose?: AIPoseEngine;
  }
}

type Phase = "idle" | "loading" | "running" | "error";

// 带版本串：引擎改动后强制浏览器重新拉取，避免旧缓存导致自适应逻辑不生效
const AI_SCRIPT_SRC = "/js/ai-pose.js?v=20261031c";

// 测量模式：URL 带 ?posebug=1 时才在界面上暴露识别读数，正常演示不显示
const POSE_DEBUG =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("posebug") === "1";

let scriptPromise: Promise<void> | null = null;

function loadAIPose(): Promise<void> {
  if (window.AIPose) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const exist = document.querySelector<HTMLScriptElement>(
      `script[src="${AI_SCRIPT_SRC}"]`,
    );
    if (exist) {
      exist.addEventListener("load", () => resolve());
      exist.addEventListener("error", () => reject(new Error("AI 引擎加载失败")));
      return;
    }
    const script = document.createElement("script");
    script.src = AI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("AI 引擎加载失败，请刷新重试"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function scoreClass(score: number): string {
  if (score >= 80) return "text-jade";
  if (score >= 60) return "text-amber-400";
  return "text-red-500";
}

export function AiPracticeCore({ moves, defaultMove, routine = false }: AiPracticeProps) {
  const initialMove = routine
    ? (moves[0]?.name ?? "")
    : (moves.find((m) => m.name === defaultMove)?.name ?? moves[0]?.name ?? "");
  const [action, setAction] = useState(initialMove);
  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(100);
  const [rep, setRep] = useState(0);
  const [targetRep, setTargetRep] = useState(0);
  const [status, setStatus] = useState("点击「开启摄像头」，对着示范练起来");
  const [error, setError] = useState<string | null>(null);
  // 整套模式：每式最好成绩汇总
  const [summary, setSummary] = useState<Record<string, { score: number; reps: number }> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runToken = useRef(0);
  const bestScoreRef = useRef(0);
  const repCountRef = useRef(0);
  const lastReportAt = useRef(0);
  const reportedRef = useRef(false);
  const diagTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [liveDiag, setLiveDiag] = useState<string>("");
  const resultsRef = useRef<Record<string, { score: number; reps: number }>>({});
  // 整套自动切式用：当前式名（onRep 闭包用，避免拿到旧值）、自动切换开关、切换锁
  const actionRef = useRef(action);
  actionRef.current = action;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [autoAdvance, setAutoAdvance] = useState(true);
  const autoAdvanceRef = useRef(autoAdvance);
  autoAdvanceRef.current = autoAdvance;
  const advancingRef = useRef(false);

  /** fire-and-forget 上报成绩（bestScore>0 且 repCount>0，间隔 ≥3s 节流） */
  const reportScore = useCallback((action: string) => {
    const score = bestScoreRef.current;
    const reps = repCountRef.current;
    if (score <= 0 || reps <= 0) return;
    const now = Date.now();
    if (now - lastReportAt.current < 3000) return;
    lastReportAt.current = now;
    fetch("/api/practice-scores", {
      method: "POST",
      body: JSON.stringify({ action, category: "baduanjin", score, reps }),
      headers: { "Content-Type": "application/json" },
    })
      .then(() => {
        if (!reportedRef.current) {
          reportedRef.current = true;
          setStatus((prev) => `${prev} · 成绩已计入排行榜`);
        }
      })
      .catch(() => undefined);
  }, []);

  const current = moves.find((m) => m.name === action) ?? moves[0];

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    runToken.current += 1;
    if (diagTimer.current) {
      clearInterval(diagTimer.current);
      diagTimer.current = null;
    }
    window.AIPose?.stop();
    releaseCamera();
    setLiveDiag("");
    setPhase("idle");
    reportScore(action);
    setStatus("已停止，可重新开启摄像头");
  }, [action, releaseCamera, reportScore]);

  const start = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setError(null);
    setScore(100);
    setRep(0);
    bestScoreRef.current = 0;
    repCountRef.current = 0;
    lastReportAt.current = 0;
    reportedRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError(
        window.isSecureContext === false
          ? "摄像头需在 HTTPS 或 localhost 下使用"
          : "当前浏览器不支持摄像头，请使用最新版 Chrome / Edge",
      );
      return;
    }
    const token = ++runToken.current;
    setPhase("loading");
    setStatus("正在请求摄像头权限…");
    try {
      // 对齐冻结版：优先前置摄像头、理想 1280×720。低分辨率（如 640×480）
      // 会让 MediaPipe 输入帧像素只剩 1/4，半身或稍远时容易检不出人。
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (token !== runToken.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      // 暗光下尝试连续自动曝光（不强制亮度，避免部分摄像头偏色）
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { exposureMode?: string[] };
      if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes("continuous")) {
        track
          .applyConstraints({
            advanced: [{ exposureMode: "continuous" }],
          } as unknown as MediaTrackConstraints)
          .catch(() => undefined);
      }
      const video = videoRef.current;
      if (!video) throw new Error("摄像头组件未就绪，请稍后重试");
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      setStatus("正在加载 AI 模型…首次约需数秒（约 27MB，仅加载一次）");
      await loadAIPose();
      const engine = window.AIPose;
      const canvas = canvasRef.current;
      if (!engine) throw new Error("AI 引擎加载失败，请刷新重试");
      if (!canvas) throw new Error("识别画布未就绪，请重试");
      if (token !== runToken.current) return;

      await engine.start(video, canvas, {
        action,
        onScore: (s) => {
          const v = Math.max(0, Math.min(100, Math.round(s)));
          bestScoreRef.current = Math.max(bestScoreRef.current, v);
          setScore(v);
        },
        onRep: (n, target) => {
          repCountRef.current = n;
          setRep(n);
          if (typeof target === "number" && target > 0) setTargetRep(target);
          reportScore(actionRef.current);
          // 整套模式：做够该式目标次数 → 自动记录成绩并切到下一式（引擎换式时阈值与计次自动重置）
          if (
            routine &&
            autoAdvanceRef.current &&
            !advancingRef.current &&
            typeof target === "number" &&
            target > 0 &&
            n >= target
          ) {
            advancingRef.current = true;
            setTimeout(() => {
              advancingRef.current = false;
              const cur = moves.findIndex((m) => m.name === actionRef.current);
              if (cur >= 0 && cur < moves.length - 1) {
                const next = moves[cur + 1].name;
                setStatus(`「${actionRef.current}」完成 ${n} 次，自动进入「${next}」`);
                goMoveRef.current(cur + 1);
              } else if (cur === moves.length - 1) {
                setStatus(`「${actionRef.current}」完成，整套结束`);
                finishRoutineRef.current();
              }
            }, 1600);
          }
        },
        onStatus: (text) => {
          if (text) setStatus(text);
        },
      });
      // 模型加载期间用户已点「停止」：start 内部会重新进入识别循环，这里再停一次
      if (token !== runToken.current) {
        engine.stop();
        return;
      }
      setPhase("running");
      setStatus("AI 已就绪，请全身入镜");
      // 自适应诊断：连续检不出人体时把引擎读数（后端/分辨率/帧数）同步到状态栏，
      // 让用户能自行判断是站太近、光线不足，还是推理后端降级了
      if (diagTimer.current) clearInterval(diagTimer.current);
      if (POSE_DEBUG) diagTimer.current = setInterval(() => {
        const d = window.AIPose?.diag?.();
        if (!d || !d.running) return;
        // 常显读数：帧数 / 检出帧数 / 最近一帧关键点数 / 后端 / 画面分辨率
        setLiveDiag(
          `帧${d.frames} · 检出${d.detOK} · 点${d.pts} · ${d.delegate} · 画面${d.video}`
        );
        if (d.frames < 45 || d.detOK > 0) return;
        const err = d.inferErr || d.handErr || d.drawErr;
        setStatus(
          err
            ? `推理异常（${d.delegate}）：${err.slice(0, 40)}`
            : `未检出人体 · 帧${d.frames} · ${d.delegate}推理 · 画面${d.video}｜请后退让头到脚都入框`
        );
      }, 2000);
    } catch (err) {
      if (token !== runToken.current) return;
      const e = err as { name?: string; message?: string };
      releaseCamera();
      window.AIPose?.stop();
      setPhase("error");
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        setError("请允许摄像头权限后重试");
      } else if (e.name === "NotFoundError") {
        setError("未检测到摄像头，请检查设备");
      } else if (/bindAttribLocation|webgl|wasm|GL_/i.test(e.message || "")) {
        // WebGL 上下文创建失败的典型报错（wasm 内部 _glBindAttribLocation 为 undefined）
        console.error("AI 模型加载失败：", e);
        setError(
          "当前浏览器无法启用 WebGL2，AI 姿态识别依赖它。请在浏览器设置中开启「使用硬件加速」并重启浏览器；若仍失败，请用最新版 Chrome / Edge，或在 chrome://gpu 查看 WebGL2 是否被禁用。"
        );
      } else {
        setError(e.message || "开启失败，请检查设备与权限");
      }
      setStatus("未开始识别");
    }
  }, [action, phase, releaseCamera, reportScore]);

  const changeAction = (name: string) => {
    setAction(name);
    setScore(100);
    setRep(0);
    bestScoreRef.current = 0;
    repCountRef.current = 0;
    if (phaseRef.current === "running") window.AIPose?.setAction(name);
  };

  // ---- 整套模式：一次识别逐式推进，只换示范视频与该式阈值，摄像头不关 ----
  const moveIdx = moves.findIndex((m) => m.name === action);

  /** 记录当前式成绩到汇总 */
  const recordResult = () => {
    const cur = actionRef.current;
    if (!cur) return;
    resultsRef.current[cur] = {
      score: bestScoreRef.current,
      reps: repCountRef.current,
    };
  };

  /** 切到第 i 式：换参考视频 + 换阈值（引擎 setAction），摄像头保持 */
  const goMove = (i: number) => {
    if (i < 0 || i >= moves.length) return;
    recordResult();
    reportScore(actionRef.current);
    changeAction(moves[i].name);
  };

  /** 整套完成：停识别并出汇总 */
  const finishRoutine = () => {
    recordResult();
    stop();
    setSummary({ ...resultsRef.current });
  };

  /** 再练一遍：清空汇总回到第一式 */
  const restartRoutine = () => {
    resultsRef.current = {};
    setSummary(null);
    changeAction(moves[0].name);
  };

  // 引擎 onRep 闭包是启动时创建的，走 ref 拿最新实现
  const goMoveRef = useRef(goMove);
  goMoveRef.current = goMove;
  const finishRoutineRef = useRef(finishRoutine);
  finishRoutineRef.current = finishRoutine;

  useEffect(
    () => () => {
      runToken.current += 1;
      window.AIPose?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    },
    [],
  );

  if (!current) return null;

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-brush text-xl text-ink">
            {routine ? "整套 AI 带练" : "AI 摄像头跟练"}
          </h3>
          <span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
            {routine
              ? `第 ${moveIdx + 1} / ${moves.length} 式 · 摄像头只开一次`
              : "MediaPipe 姿态识别 · 视频不上传"}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-[0.9fr_1.35fr]">
          {/* 示范视频 */}
          <div className="relative overflow-hidden rounded-lg border bg-black">
            <video
              key={current.video}
              src={`/anims/${current.video}`}
              className="aspect-[4/3] h-full w-full object-cover"
              controls
              autoPlay
              muted
              loop
              playsInline
            />
            <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/55 px-2 py-0.5 text-xs text-white">
              示范 · {current.name}
            </span>
          </div>

          {/* 摄像头 + 骨架叠加 */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full -scale-x-100 object-cover"
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
            />
            {(phase === "idle" || phase === "error" || phase === "loading") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 px-4 text-center text-white">
                <span className="text-3xl">📷</span>
                <p className="text-sm">
                  {phase === "loading"
                    ? "正在准备 AI 引擎…"
                    : "点击下方「开启摄像头」开始跟练"}
                </p>
                <p className="text-xs text-white/60">
                  {phase === "loading"
                    ? "首次加载模型约需数秒"
                    : "画面只在本地推理，不会上传服务器"}
                </p>
              </div>
            )}
            <div className="absolute right-3 top-3 rounded-lg bg-black/55 px-3 py-2 text-right text-white backdrop-blur">
              <p
                className={cn(
                  "text-3xl font-bold leading-none",
                  scoreClass(score),
                )}
              >
                {score}
              </p>
              <p className="mt-1 text-xs text-white/70">
                标准度 · {rep}
                {targetRep > 0 ? `/${targetRep}` : ""} 次
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {routine ? (
            <>
              <button
                type="button"
                onClick={() => goMove(moveIdx - 1)}
                disabled={moveIdx <= 0 || phase === "loading"}
                className="rounded-lg border px-3 py-2 text-sm text-ink transition hover:border-primary disabled:opacity-40"
              >
                ← 上一式
              </button>
              <span className="min-w-28 text-center font-medium text-ink">{current.name}</span>
              {moveIdx < moves.length - 1 ? (
                <button
                  type="button"
                  onClick={() => goMove(moveIdx + 1)}
                  disabled={phase === "loading"}
                  className="rounded-lg border px-3 py-2 text-sm text-ink transition hover:border-primary disabled:opacity-40"
                >
                  练好换下一式 →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishRoutine}
                  disabled={phase === "loading"}
                  className="rounded-lg bg-jade px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  ✓ 完成整套
                </button>
              )}
            </>
          ) : (
            <select
              value={action}
              onChange={(e) => changeAction(e.target.value)}
              disabled={phase === "loading"}
              className="rounded-lg border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            >
              {moves.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {phase === "running" || phase === "loading" ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink/90"
            >
              停止跟练
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              开启摄像头
            </button>
          )}

          {routine && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              做够次数自动换下一式
            </label>
          )}

          <p className="text-xs text-muted-foreground">
            {phase === "running"
              ? (POSE_DEBUG && liveDiag) || "站远一点，让全身进入画面"
              : "建议光线充足、背景简洁"}
          </p>
        </div>

        <p className="text-sm text-jade">{status}</p>
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* 整套完成汇总 */}
        {summary && (
          <div className="rounded-xl border border-jade/40 bg-jade/5 p-4">
            <p className="font-medium text-ink">🎉 整套完成 · 各式最好成绩</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {moves.map((m, i) => {
                const r = summary[m.name];
                return (
                  <p
                    key={m.name}
                    className="flex items-center justify-between rounded-lg bg-card px-3 py-1.5 text-xs"
                  >
                    <span>
                      {i + 1}. {m.name}
                    </span>
                    <span className="text-muted-foreground">
                      {r && r.reps > 0 ? `${r.score} 分 · ${r.reps} 次` : "跳过"}
                    </span>
                  </p>
                );
              })}
            </div>
            <button
              type="button"
              onClick={restartRoutine}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              再练一遍
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const LazyAiPractice = dynamic(
  () => import("@/components/ai-practice").then((mod) => mod.AiPracticeCore),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-8 text-center text-sm text-muted-foreground">
        正在加载 AI 跟练组件…
      </div>
    ),
  },
);

/** AI 跟练入口：未点击时只显示入口卡片，点击后才挂载核心组件 */
export default function AiPracticeSection({
  moves,
  defaultMove,
  initiallyOpen = false,
  routine = false,
}: AiPracticeProps & { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);

  if (!moves.length) return null;

  if (!open) {
    return (
      <Card className="border-dashed border-primary/40 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <h3 className="font-brush text-xl text-ink">
              {routine ? "🧘 整套 AI 带练" : "🤖 AI 摄像头跟练"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {routine
                ? "摄像头只开一次，十式逐式推进，自动换示范视频与评分标准 · 视频不上传"
                : "打开摄像头，MediaPipe 实时评估动作标准度 · 视频不上传 · 按需加载"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            {routine ? "开始整套带练" : "开始 AI 跟练"}
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground transition hover:text-ink"
        >
          {routine ? "收起整套带练" : "收起 AI 跟练"}
        </button>
      </div>
      <LazyAiPractice moves={moves} defaultMove={defaultMove} routine={routine} />
    </div>
  );
}

/** 动作示范视频（带「播放示范」按钮） */
export function PracticeVideo({ src, name }: { src: string; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const play = () => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  };
  return (
    <div className="relative overflow-hidden rounded-xl border bg-black">
      <video
        ref={ref}
        src={src}
        className="aspect-video w-full object-contain"
        controls
        autoPlay
        muted
        loop
        playsInline
      />
      <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/55 px-2 py-1 text-xs text-white">
        {name}
      </span>
      <button
        type="button"
        onClick={play}
        className="absolute right-3 top-3 rounded-lg bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground backdrop-blur transition hover:bg-primary"
      >
        ▶ 播放示范
      </button>
    </div>
  );
}

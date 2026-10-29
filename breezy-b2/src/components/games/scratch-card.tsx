"use client";

/**
 * 烦恼刮刮乐：银灰刮层下藏着一句温柔的话
 * destination-out 刮除 + 两点插值；透明占比 ≥55% 触发上行三连音并淡出刮层。
 * 刮动过程无音效，无次数限制。
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const W = 320;
const H = 180;
const BRUSH = 18;
const THRESHOLD = 0.55;

// 涂层下的温柔句子：与冻结版逐字一致
const SENTENCES = [
  "情绪不是敌人呀，它只是提醒你：该歇歇啦～",
  "允许自己什么都不想做，一会儿就好啦～",
  "肝喜条达，人也一样——顺一点，松一点嘛～",
  "今天已经很努力了鸭，先吃饭，再说别的～",
  "深呼吸三次，事情没有想的那么急哒～",
  "你不用立刻好起来，慢慢来就好呀～",
  "睡个好觉，比想通更重要哦～",
  "花有花期，人有节奏，不急的呀～",
  "把肩膀放下来嘛，你一直端着呢～",
  "吃口热乎的，胃暖了，心就暖啦～",
  "今天的太阳落了，明天照常升起鸭～",
  "允许一切发生，也允许自己休息一下嘛～",
  "你已经撑了很久了鸭，辛苦啦～",
  "情绪降一档就好，不用一步到晴天哒～",
  "烦的时候，先把手头的事放十秒嘛～",
  "天凉了，记得照顾好自己鸭～",
  "照顾别人之前，先给自己留一点温柔呀～",
  "不用每一次难过都自己消化，说出来就轻了呀～",
  "允许自己不完美，你已经做得非常好啦～",
  "慢慢来就好，你的节奏就是对的。",
  "先吃饭，再睡觉，天大的事明天再说。",
  "事情会一件一件理顺的，急不来。",
  "你不必时刻坚强，累了就说出来。",
  "此刻的不开心，就停在今天吧。",
  "你已经迈出最难的一步了，剩下的交给我。",
  "世界偶尔刻薄，但你值得被温柔以待。",
  "你的努力和坚持，值得被看见。",
];

export function ScratchCard() {
  const [sentenceIdx, setSentenceIdx] = useState(() => Math.floor(Math.random() * SENTENCES.length));
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const pointerSeenRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  // 挂载铺涂层；卸载关闭 AudioContext
  useEffect(() => {
    initCanvas();
    return () => {
      void audioRef.current?.close().catch(() => {});
    };
  }, []);

  const initCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#d1ccc3");
    grad.addColorStop(0.5, "#bab5ab");
    grad.addColorStop(1, "#a29d95");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 银灰细纹理斜线
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    for (let x = -H; x < W; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H, H);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("刮开看看", W / 2, H / 2);
  };

  const ensureAudio = () => {
    if (!audioRef.current) {
      try {
        audioRef.current = new AudioContext();
      } catch {
        audioRef.current = null;
      }
    }
    return audioRef.current;
  };

  /** 上行三连音 C-E-G（依次 80ms），刮开瞬间提示 */
  const playChime = () => {
    const ctx = ensureAudio();
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state === "suspended") void ctx.resume();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  };

  const scratchAt = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, BRUSH, 0, Math.PI * 2);
    ctx.fill();
  };

  const toCanvasPoint = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * W) / rect.width,
      y: ((e.clientY - rect.top) * H) / rect.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (revealed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerSeenRef.current = Date.now();
    beginStroke(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerSeenRef.current = Date.now();
    moveStroke(e.clientX, e.clientY);
  };

  // 兜底：只派发 mouse 事件的环境；真实浏览器 pointer 先到，50ms 内跳过避免重复
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (revealed || Date.now() - pointerSeenRef.current < 50) return;
    beginStroke(e.clientX, e.clientY);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (Date.now() - pointerSeenRef.current < 50) return;
    moveStroke(e.clientX, e.clientY);
  };
  const onMouseUp = () => endStroke();

  const beginStroke = (x: number, y: number) => {
    ensureAudio(); // 首次交互时创建
    drawingRef.current = true;
    const p = toCanvasPoint({ clientX: x, clientY: y });
    lastRef.current = p;
    scratchAt(p.x, p.y);
  };

  const moveStroke = (x: number, y: number) => {
    if (!drawingRef.current || revealed) return;
    const p = toCanvasPoint({ clientX: x, clientY: y });
    const last = lastRef.current ?? p;
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (BRUSH / 2)));
    for (let i = 1; i <= steps; i++) {
      scratchAt(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
    }
    lastRef.current = p;
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    checkCleared();
  };

  /** 每次 stroke 结束采样透明像素占比，≥55% 判定刮开 */
  const checkCleared = () => {
    if (revealed) return;
    const ctx = canvasRef.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, W, H).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 16) clear++;
    }
    if (clear / (W * H) >= THRESHOLD) {
      setRevealed(true);
      playChime();
    }
  };

  /** 随机换句（避开上一句）并重置刮层 */
  const again = () => {
    let idx = Math.floor(Math.random() * SENTENCES.length);
    while (SENTENCES.length > 1 && idx === sentenceIdx) {
      idx = Math.floor(Math.random() * SENTENCES.length);
    }
    setSentenceIdx(idx);
    setRevealed(false);
    initCanvas();
  };

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-[320px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gradient-to-br from-secondary to-accent p-5 text-center">
          <p className="font-brush text-lg leading-relaxed text-secondary-foreground">
            {SENTENCES[sentenceIdx]}
          </p>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className={cn(
            "absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-lg",
            // 过渡只在淡出方向生效：重置涂层时瞬间显示，避免句子先透出来
            revealed
              ? "pointer-events-none opacity-0 transition-opacity duration-700"
              : "opacity-100",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        />
      </div>

      <div className="min-h-[2rem] text-center">
        {revealed ? (
          <Button size="sm" variant="outline" onClick={again} style={{ animation: "rise-in 0.5s ease-out both" }}>
            再来一张
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            用手指或鼠标刮开涂层，看看今天想对你说什么。
          </p>
        )}
      </div>
    </div>
  );
}

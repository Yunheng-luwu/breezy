"use client";

/**
 * 捏泡泡纸：7×7 = 49 颗泡泡，划过去就破（对齐冻结版 gameBubble）
 * 米色泡泡质感；全破后隐藏网格，浮现一幅 4:3 放晴小画 + 邀约文案
 * 场景图按 节日 > 天气 > 季节 匹配，否则随机通用图；避免与上一张重复
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const SIZE = 7;
const COUNT = SIZE * SIZE;
const STEP_PX = 8; // 两点之间按 8px 插值，防止快速滑动漏泡
const SOUND_GAP_MS = 30; // 同一事件 30ms 节流，防炸耳

// 每破一个冒出的鼓励小字：与冻结版逐字一致
const CHEERS = ["啵～好爽", "压力-1", "烦恼-1", "继续继续", "很解压吧", "呼，松了", "干得漂亮", "就这么戳", "气都散了", "顺气了", "痛快！", "又少一烦"];
const GENERIC_DONE = ["烦恼全戳破啦 · 心情放晴", "破完啦，给自己点个赞吧~", "压力戳光光，今天也要开心呀~", "啵啵啵，烦恼都跑掉了~"];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

type WeatherLite = { weatherText?: string; temp?: number } | null;
type DonePick = { src: string; fit: "cover" | "contain"; text: string };
type FloatWord = { id: number; x: number; y: number; text: string };

// 节日档期 → 场景图（对齐冻结版 BUBBLE_HOLIDAYS）
const HOLIDAYS = [
  { from: [12, 20], to: [12, 26], img: "christmas", texts: ["圣诞快到啦，一起去看灯吧~", "听说圣诞的灯会很好看，一起去吧~", "想在圣诞树下许个愿，你陪我吗~"] },
  { from: [12, 30], to: [1, 2], img: "festival", texts: ["新的一年开始，一起出去走走吧~", "新年第一天，一起去晒晒太阳吧~", "新的一年，第一站想和你一起去~"] },
  { from: [2, 10], to: [2, 20], img: "festival", texts: ["过年啦，一起去逛逛灯会吧~", "年味正浓，一起去热闹热闹吧~", "春节的庙会，一起去看看呀~"] },
  { from: [5, 1], to: [5, 5], img: "festival", texts: ["小长假，一起出去走走吧~", "难得的假期，一起去透透气吧~", "五一的阳光正好，出去走走呀~"] },
  { from: [10, 1], to: [10, 7], img: "festival", texts: ["国庆啦，一起去看看秋天吧~", "假期模式开启，一起去逛逛吧~", "十一长假，找个好地方走走呀~"] },
];

/** 节日 > 天气 > 季节 → 场景图与邀约文案 */
function bubbleScene(weather: WeatherLite): { img: string; text: string } {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const inRange = (from: number[], to: number[]) =>
    from[0] === to[0]
      ? m === from[0] && d >= from[1] && d <= to[1]
      : (m === from[0] && d >= from[1]) || (m === to[0] && d <= to[1]);

  for (const h of HOLIDAYS) {
    if (inRange(h.from, h.to)) return { img: `scene/${h.img}.jpg`, text: pick(h.texts) };
  }

  const wt = weather?.weatherText ?? "";
  const temp = weather?.temp ?? null;
  if (/雪/.test(wt)) return { img: "scene/snow.jpg", text: pick(["下雪啦，我们一起去踩雪吧~", "外面飘雪了，一起去看雪吧~", "雪天的世界好安静，一起去走走吧~"]) };
  if (/雨/.test(wt)) return { img: "scene/rain.jpg", text: pick(["下雨天，一起窝在窗边喝杯热茶吧~", "雨声很治愈，一起听听雨吧~", "下雨了，一起喝杯热茶暖暖吧~"]) };
  if (/晴|多云/.test(wt) && temp !== null && temp >= 20) return { img: "scene/sea.jpg", text: pick(["天气正好，有时间我们一起去海边吧~", "这么好的天气，适合去海边吹吹风~", "阳光暖暖，一起去看海吧~"]) };
  if (m === 3 || m === 4) return { img: "scene/sakura.jpg", text: pick(["花都开好了，一起去看樱花吧~", "樱花季到了，错过要等明年啦~", "春风正好，一起去赏花吧~"]) };
  if (m >= 9 && m <= 11) return { img: "scene/leaves.jpg", text: pick(["秋天到了，我们一起去看落叶吧~", "银杏黄了，一起去踩落叶吧~", "秋天的颜色最美了，一起去看看吧~"]) };
  if (m === 12 || m <= 2) return { img: "scene/snow.jpg", text: pick(["冬天啦，一起去看雪吧~", "冬天适合找个暖和的地方待着，一起吗~", "等一场雪，一起去看吧~"]) };
  return { img: "scene/sea.jpg", text: pick(["有时间我们一起去海边吧~", "想去看海了，一起吗~"]) };
}

export function BubbleWrap() {
  const [popped, setPopped] = useState<boolean[]>(() => Array(COUNT).fill(false));
  const [words, setWords] = useState<FloatWord[]>([]);
  const [reveal, setReveal] = useState<DonePick | null>(null);
  const [showReveal, setShowReveal] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const poppedRef = useRef<boolean[]>(Array(COUNT).fill(false));
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointerHandledRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const lastSoundRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const idRef = useRef(0);
  const lastImgRef = useRef("");
  const weatherRef = useRef<WeatherLite | undefined>(undefined);

  // 卸载：清理浮字定时器 + 关闭 AudioContext
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      void audioRef.current?.close().catch(() => {});
    };
  }, []);

  // AudioContext 在首次交互（第一颗泡泡）时创建
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

  /** 破膜脆响（带通滤波短噪声）+ 300~460Hz 低频短衰减收底 */
  const playPop = () => {
    const now = performance.now();
    if (now - lastSoundRef.current < SOUND_GAP_MS) return;
    lastSoundRef.current = now;
    const ctx = ensureAudio();
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;

    const len = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2200 + Math.random() * 1800;
    band.Q.value = 1.2;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.25, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    noise.connect(band).connect(g1).connect(ctx.destination);
    noise.start(t);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 300 + Math.random() * 160;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g2).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  };

  /** 全部破完的小提示音（两个上行正弦音） */
  const playChime = () => {
    const ctx = ensureAudio();
    if (!ctx || ctx.state === "closed") return;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    [523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const at = t + i * 0.12;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.16, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      osc.connect(g).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.55);
    });
  };

  /** 天气（缓存一次，失败则只用季节/节日） */
  const loadWeather = async (): Promise<WeatherLite> => {
    if (weatherRef.current !== undefined) return weatherRef.current;
    try {
      const r = await fetch("/api/weather");
      const j = (await r.json()) as { data?: WeatherLite };
      weatherRef.current = j?.data ?? null;
    } catch {
      weatherRef.current = null;
    }
    return weatherRef.current;
  };

  /** 通用图：11 张 scratch 图随机，避开上一张 */
  const genericPick = (): DonePick => {
    let src = "";
    do {
      src = `/img/scratch/s${1 + Math.floor(Math.random() * 11)}.jpg`;
    } while (src === lastImgRef.current);
    return { src, fit: "contain", text: pick(GENERIC_DONE) };
  };

  /** 完成页选图：场景/通用各半；与上次重复则换另一类 */
  const pickDone = async (): Promise<DonePick> => {
    if (Math.random() < 0.5) {
      const sc = bubbleScene(await loadWeather());
      const src = `/img/${sc.img}`;
      if (src === lastImgRef.current) return genericPick();
      return { src, fit: "cover", text: sc.text };
    }
    return genericPick();
  };

  const spawnWord = (target: HTMLElement) => {
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (!wrapRect) return;
    const rect = target.getBoundingClientRect();
    const id = idRef.current++;
    setWords((ws) => [
      ...ws,
      {
        id,
        x: rect.left - wrapRect.left + rect.width / 2,
        y: rect.top - wrapRect.top + rect.height / 2,
        text: pick(CHEERS),
      },
    ]);
    timersRef.current.push(
      window.setTimeout(() => {
        setWords((ws) => ws.filter((w) => w.id !== id));
      }, 900),
    );
  };

  /** 命中未破泡泡即破 */
  const pop = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const target = el?.closest("[data-bubble]");
    if (!(target instanceof HTMLElement)) return;
    const idx = Number(target.dataset.bubble);
    if (Number.isNaN(idx) || poppedRef.current[idx]) return;

    poppedRef.current[idx] = true;
    setPopped((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    playPop();
    spawnWord(target);

    if (poppedRef.current.every(Boolean)) {
      playChime();
      void pickDone().then((p) => {
        lastImgRef.current = p.src;
        setReveal(p);
      });
      timersRef.current.push(window.setTimeout(() => setShowReveal(true), 500));
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointerHandledRef.current = Date.now();
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    pop(e.clientX, e.clientY);
  };

  // 兜底：部分环境只派发 click 不派发 pointer 事件；真实拖动后的 click 会被守卫吞掉
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastPointerHandledRef.current < 500) return;
    pop(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    const last = lastPointRef.current;
    if (last) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / STEP_PX));
      for (let i = 1; i <= steps; i++) {
        pop(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
      }
    }
    lastPointRef.current = { x: e.clientX, y: e.clientY };
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const reset = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    poppedRef.current = Array(COUNT).fill(false);
    setPopped(Array(COUNT).fill(false));
    setWords([]);
    setReveal(null);
    setShowReveal(false);
  };

  const left = COUNT - popped.filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-[440px] space-y-3">
      <p className="text-center text-[13px] text-muted-foreground">
        按住划过，连着破 · 剩 <b className="text-ink">{left}</b> 个
      </p>

      {showReveal && reveal && (
        <p
          className="text-center text-[17px] font-semibold text-ink"
          style={{ animation: "fade-in 0.6s ease-out both" }}
        >
          {reveal.text}
        </p>
      )}

      <div ref={wrapRef} className="relative">
        {!showReveal && (
          <div
            className="grid touch-none select-none grid-cols-7 gap-[10px]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
            onClick={onClick}
          >
            {Array.from({ length: COUNT }, (_, i) => (
              <span
                key={i}
                data-bubble={i}
                aria-hidden
                className="aspect-square cursor-pointer rounded-full transition-transform duration-100 ease-out"
                style={
                  popped[i]
                    ? {
                        background: "#EFE6D4",
                        boxShadow: "inset 2px 3px 8px rgba(0,0,0,0.08)",
                        transform: "scale(0.82)",
                      }
                    : {
                        background:
                          "radial-gradient(circle at 32% 30%, rgba(255,255,255,.95), #EFE6D4 45%, #D3C09D)",
                        boxShadow: "inset -2px -3px 6px rgba(0,0,0,0.06)",
                      }
                }
              />
            ))}
          </div>
        )}

        {showReveal && reveal && (
          <div
            className="flex items-center justify-center overflow-hidden rounded-2xl"
            style={{
              aspectRatio: "4 / 3",
              background: "linear-gradient(180deg,#FDF6E9,#F5E9D2)",
              animation: "fade-in 0.8s ease-out both",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={reveal.src}
              alt="放晴小画"
              className="h-full w-full"
              style={{ objectFit: reveal.fit }}
            />
          </div>
        )}

        {words.map((w) => (
          <span
            key={w.id}
            className="pointer-events-none absolute z-10 whitespace-nowrap text-[13px] font-semibold text-primary"
            style={{ left: w.x, top: w.y, animation: "float-up 0.9s ease-out forwards" }}
          >
            {w.text}
          </span>
        ))}
      </div>

      {showReveal && (
        <div className="flex justify-center">
          <Button size="sm" onClick={reset}>
            再捏一张
          </Button>
        </div>
      )}
    </div>
  );
}

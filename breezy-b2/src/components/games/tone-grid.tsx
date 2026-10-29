"use client";

/**
 * 数字舒压格：每局一首小曲，格子数 = 音符数，按 1→N 顺序点即弹出整曲
 * 对齐冻结版：12 首曲谱（音名:拍数）、引导模式高亮下一格、点完自动回放、
 * 播放条可暂停/点进度跳拍、重玩（同曲洗牌）/ 下一首。
 * 音色：钢琴合成音（基频 + 2/3 次谐波，快起音 + 自然衰减）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const NOTE: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
};

interface MelodyNote { f: number; b: number }
interface Melody { name: string; beat: number; notes: MelodyNote[]; cum: number[]; total: number }

function parseMelody(name: string, beat: number, notes: string): Melody {
  const ns = notes.split(" ").map((s) => {
    const [k, b] = s.split(":");
    return { f: NOTE[k], b: b ? parseFloat(b) : 1 };
  });
  const cum: number[] = [];
  let acc = 0;
  ns.forEach((n) => {
    cum.push(acc);
    acc += n.b;
  });
  return { name, beat, notes: ns, cum, total: acc };
}

const MELODIES: Melody[] = [
  ["小星星", 400, "C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2"],
  ["两只老虎", 300, "C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4 A4 G4 F4 E4 C4 G4 A4 G4 F4 E4 C4 C4 G4 C4:2 C4 G4 C4:2"],
  ["生日快乐", 420, "G4:.5 G4:.5 A4 G4 C5 B4:2 G4:.5 G4:.5 A4 G4 D5 C5:2 G4:.5 G4:.5 G5 E5 C5 B4 A4:2 F5:.5 F5:.5 E5 C5 D5 C5:2"],
  ["小蜜蜂", 300, "G4 E4 E4:2 F4 D4 D4:2 C4:.5 D4:.5 E4:.5 F4:.5 G4 G4 G4:2 G4 E4 E4:2 F4 D4 D4:2 C4:.5 E4:.5 G4 G4 E4:2"],
  ["欢乐颂", 380, "E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2"],
  ["粉刷匠", 300, "G4 E4 G4 E4 G4 E4 C4:2 D4 F4 E4 D4 G4:2 G4 E4 G4 E4 G4 E4 C4:2 D4 F4 E4 D4 C4:2"],
  ["铃儿响叮当", 340, "E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4 D4 E4:3 F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4:2"],
  ["卡农", 340, "E5:2 D5:2 C5 B4 A4 G4 A4 B4 C5 B4 A4 G4 A4 G4 E4 F4 F5 G5 A5 G5 F5 E5 D5 C5 B4 C5 D5 C5 B4 A4 G4 F4"],
  ["青花瓷", 360, "E4 G4 A4 C5 A4 G4 E4 D4:2 E4 G4 A4 C5 A4 G4 E4 D4:2 E4 G4 A4 C5 D5 C5 A4 G4 E4 D4 C4:2 C5 A4 G4 E4 D4:2"],
  ["康康舞曲", 260, "C5 C5 C5 C5 F5 F5 E5 E5 D5 D5 D5 D5 G5 G5 F5 E5 D5 C5 D5 E5 F5 E5 D5 C5:2"],
  ["婚礼进行曲", 400, "C5 F5 F5 G5 A5 A5 F5:2 G5 A5 G5 F5 E5:2 C5 F5 F5 G5 A5 A5 F5:2 E5 F5 G5 E5 C5:2"],
  ["Do-Re-Mi", 380, "C4 D4 E4 C4 E4 C4 E4:2 D4 E4 F4 D4 F4 D4 F4:2 E4 F4 G4 E4 G4 E4 G4:2 G4 A4 B4 G4 B4 G4 B4:2"],
].map(([name, beat, notes]) => parseMelody(name as string, beat as number, notes as string));

function shuffle(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
}

/** 选最整齐的行列：优先整除且接近正方形 */
function gridCols(n: number): number {
  const s = Math.ceil(Math.sqrt(n));
  for (let c = s; c <= s + 6; c++) {
    if (n % c === 0) return c;
  }
  return s;
}

export function ToneGrid() {
  const [mi, setMi] = useState(() => Math.floor(Math.random() * MELODIES.length));
  const [order, setOrder] = useState<number[]>(() => shuffle(MELODIES[mi].notes.length));
  const [next, setNext] = useState(1);
  const [guide, setGuide] = useState(true);
  const [fill, setFill] = useState(0);
  const [done, setDone] = useState(false);
  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const playTimers = useRef<number[]>([]);

  const melody = MELODIES[mi];
  const N = melody.notes.length;
  const cols = gridCols(N);

  useEffect(() => {
    const timers = playTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      void audioRef.current?.close().catch(() => {});
    };
  }, []);

  const sfxNote = (f: number) => {
    if (!audioRef.current) {
      try {
        audioRef.current = new AudioContext();
      } catch {
        return;
      }
    }
    const ctx = audioRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(0.16, t + 0.006);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3000;
    master.connect(lp).connect(ctx.destination);
    ([[1, 1], [2, 0.32], [3, 0.12]] as const).forEach(([mult, amp]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * mult;
      g.gain.value = amp;
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.95);
    });
  };

  const stopPlayback = useCallback(() => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    setPlaying(false);
  }, []);

  /** 从第 startIdx 个音符起播，按曲谱时值 */
  const playFrom = useCallback(
    (startIdx: number) => {
      stopPlayback();
      setPlaying(true);
      const m = MELODIES[mi];
      m.notes.forEach((n, i) => {
        if (i < startIdx) return;
        const delay = (m.cum[i] - m.cum[startIdx]) * m.beat;
        playTimers.current.push(
          window.setTimeout(() => {
            sfxNote(n.f);
            setFill(((m.cum[i] + n.b) / m.total) * 100);
          }, delay),
        );
      });
      playTimers.current.push(
        window.setTimeout(() => setPlaying(false), (m.total - m.cum[startIdx]) * m.beat),
      );
    },
    [mi, stopPlayback],
  );

  const build = useCallback(
    (newMi: number) => {
      stopPlayback();
      setMi(newMi);
      setOrder(shuffle(MELODIES[newMi].notes.length));
      setNext(1);
      setFill(0);
      setDone(false);
    },
    [stopPlayback],
  );

  const tap = (n: number) => {
    if (n !== next || done) return; // 点错无反应
    stopPlayback();
    const note = melody.notes[n - 1];
    sfxNote(note.f);
    setFill(((melody.cum[n - 1] + note.b) / melody.total) * 100);
    const nx = next + 1;
    setNext(nx);
    if (nx > N) {
      setDone(true);
      playFrom(0); // 弹完自动回放一遍
    }
  };

  const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const target = Math.min(melody.total - 0.01, Math.max(0, ((e.clientX - r.left) / r.width) * melody.total));
    let idx = 0;
    for (let i = 0; i < N; i++) {
      if (melody.cum[i] <= target) idx = i;
      else break;
    }
    playFrom(idx);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="text-muted-foreground">
          按顺序点数字，弹出小曲 · 下一个是{" "}
          <b className="text-lg text-primary">{next > N ? "✓" : next}</b>
        </span>
        <button
          type="button"
          onClick={() => setGuide((g) => !g)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            guide ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary",
          )}
        >
          引导模式：{guide ? "开" : "关"}
        </button>
      </div>

      <div
        className="mx-auto grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols},1fr)`, maxWidth: Math.min(cols * 54, 680) }}
      >
        {order.map((n) => {
          const isNext = guide && n === next && !done;
          const isDone = n < next;
          return (
            <button
              key={n}
              type="button"
              onClick={() => tap(n)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl text-lg font-semibold transition-all duration-150 select-none",
                isDone
                  ? "bg-primary text-primary-foreground"
                  : isNext
                    ? "scale-105 bg-[#E4D3B4] text-ink shadow-sm"
                    : "bg-secondary/70 text-ink hover:bg-secondary",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>

      {done && (
        <div className="mx-auto flex max-w-md items-center gap-2.5 rounded-full bg-secondary/70 px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => (playing ? stopPlayback() : playFrom(0))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm text-primary-foreground"
          >
            {playing ? "⏸" : "▶"}
          </button>
          <span className="shrink-0 text-xs font-semibold text-ink">《{melody.name}》</span>
          <div className="flex h-5 flex-1 cursor-pointer items-center" onClick={onBarClick}>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/15">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${fill}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-2.5">
        <button
          type="button"
          onClick={() => build(mi)}
          className="rounded-lg border bg-card px-3 py-1.5 text-xs text-ink transition-colors hover:border-primary"
        >
          🔀 重玩（打乱重排）
        </button>
        <button
          type="button"
          onClick={() => build((mi + 1) % MELODIES.length)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-opacity hover:opacity-90"
        >
          🎵 下一首
        </button>
      </div>

      {done && <p className="text-center text-xs text-jade">🎵 你弹出了《{melody.name}》，真好听</p>}
    </div>
  );
}

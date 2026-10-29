"use client";

/**
 * 自由弹琴：8/15 键钢琴 + 12 首简谱 + 试听 / 跟练 / 变速
 * 对齐冻结版：ASD…键盘映射、点字母改键位、点音名改音高、调音滑杆；
 * 8 键模式按曲目自动配音，音超过 8 个自动切 15 键。
 * 音色：Web Audio 合成（正弦泛音列 + 琴槌噪声），参数同冻结版。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ALL_NOTES = [
  { note: "C4", f: 261.63 }, { note: "D4", f: 293.66 }, { note: "E4", f: 329.63 }, { note: "F4", f: 349.23 },
  { note: "G4", f: 392.0 }, { note: "A4", f: 440.0 }, { note: "B4", f: 493.88 }, { note: "C5", f: 523.25 },
  { note: "D5", f: 587.33 }, { note: "E5", f: 659.25 }, { note: "F5", f: 698.46 }, { note: "G5", f: 783.99 },
  { note: "A5", f: 880.0 }, { note: "B5", f: 987.77 }, { note: "C6", f: 1046.5 },
];

const N2NUM: Record<string, string> = {
  C4: "1", D4: "2", E4: "3", F4: "4", G4: "5", A4: "6", B4: "7",
  C5: "1·", D5: "2·", E5: "3·", F5: "4·", G5: "5·", A5: "6·", B5: "7·", C6: "1··",
};

const DEFAULT_BIND = ["a", "s", "d", "f", "g", "h", "j", "k", "q", "w", "e", "r", "t", "y", "u"];

const SCORES: { name: string; nums: string }[] = [
  { name: "自由弹奏", nums: "" },
  { name: "小星星", nums: "1:1 1:1 5:1 5:1 6:1 6:1 5:2 4:1 4:1 3:1 3:1 2:1 2:1 1:2 5:1 5:1 4:1 4:1 3:1 3:1 2:2 5:1 5:1 4:1 4:1 3:1 3:1 2:2 1:1 1:1 5:1 5:1 6:1 6:1 5:2 4:1 4:1 3:1 3:1 2:1 2:1 1:2" },
  { name: "两只老虎", nums: "1:1 2:1 3:1 1:1 1:1 2:1 3:1 1:1 3:1 4:1 5:2 3:1 4:1 5:2 5:.5 6:.5 5:.5 4:.5 3:1 1:1 5:.5 6:.5 5:.5 4:.5 3:1 1:1 2:1 5:1 1:2 2:1 5:1 1:2" },
  { name: "生日快乐", nums: "5:.5 5:.5 6:1 5:1 1·:2 7:1 5:.5 5:.5 6:1 5:1 2·:2 1·:1 5:.5 5:.5 5·:1 3·:1 1·:1 7:1 6:1.5 4·:.5 4·:1 3·:1 1·:1 2·:1 1·:2" },
  { name: "欢乐颂", nums: "3:1 3:1 4:1 5:1 5:1 4:1 3:1 2:1 1:1 1:1 2:1 3:1 3:1.5 1:.5 1:2 2:1 2:1 3:1 3:1 4:1 4:1 5:1 5:1 5:1 4:1 3:1 2:1 1:1 1:1 2:1 3:1 2:1.5 1:.5 1:2" },
  { name: "粉刷匠", nums: "5:1 3:1 5:1 3:1 5:1 3:1 1:2 2:1 4:1 3:1 2:1 5:2 5:1 3:1 5:1 3:1 5:1 3:1 1:2 2:1 4:1 3:1 2:1 1:2" },
  { name: "送别", nums: "5:1 6:.5 5:.5 3:.5 5:.5 1·:2 6:1 1·:.5 6:.5 5:.5 6:.5 3:2 2:1.5 3:.5 5:1 4:1 3:1 2:1 7:1 1:3 r:1 5:1 3:.5 5:.5 1·:2 6:1 1·:1 5:2 5:1 1:.5 2:.5 3:1 2:.5 1:.5 2:3 r:1 5:1 3:.5 5:.5 1·:1.5 7:.5 6:1 1·:1 5:2 5:1 2:.5 3:.5 4:1.5 7:.5 1:3 r:1 6:1 1·:1 1·:2 7:1 6:.5 7:.5 1·:2 6:.5 7:.5 1·:1 6:1 6:.5 5:.5 3:1 1:1 2:3 r:1 5:1 3:.5 5:.5 1·:1.5 7:.5 6:1 1·:1 5:2 5:1 2:.5 3:.5 4:1.5 7:.5 1:3 r:1 5:1 3:.5 5:.5 1·:2 6:1 1·:1 5:2 5:1 1:.5 2:.5 3:1 2:.5 1:.5 2:3 r:1 5:1 3:.5 5:.5 1·:1.5 7:.5 6:1 1·:1 5:2 5:1 2:.5 3:.5 4:1.5 7:.5 1:3" },
  { name: "虫儿飞", nums: "3·:1 3·:.5 3·:.5 4·:1 5·:1 3·:1.5 2·:.5 2·:2 1·:1 1·:.5 1·:.5 2·:1 3·:1 3·:1.5 7:.5 7:2 6:1 3·:1 2·:2 6:1 3·:1 2·:2 6:1 3·:1 2·:1.5 1·:.5 1·:4 3·:1 3·:.5 3·:.5 4·:1 5·:1 3·:1.5 2·:.5 2·:2 1·:1 1·:.5 1·:.5 2·:1 3·:1 3·:1.5 7:.5 7:2 6:1 3·:1 2·:2 6:1 3·:1 2·:2 6:1 3·:1 2·:1.5 1·:.5 1·:3 3·:.5 2·:.5 5·:3 4·:.5 3·:.5 3·:.5 2·:.5 2·:2 5·:.5 4·:.5 3·:1 4·:.5 5·:1.5 3·:1 2·:3.5 1·:.5 6:1 3·:1 2·:1.5 1·:.5 5·:1 2·:.5 1·:.5 1·:2 4·:.5 3·:.5 4·:.5 3·:.5 1·:2 4·:.5 3·:.5 4·:.5 3·:.5 1·:1.5 2·:.5 1·:4" },
  { name: "青花瓷", nums: "5·:3 2·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 6:1 5:1 2·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 1·:1 3·:1 2·:1 1·:1 1·:1 5:1 6:1 3·:1 3·:1 3·:1 2·:1 3·:1 3·:1 2·:1 3·:1 5·:1 3·:1 3·:1 3·:1 3·:1 2·:1 2·:1 2·:1 2·:1 1·:1 3·:1 3·:1 2·:2 2·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 6:1 5:1 5·:1 6:1 3·:1 5·:1 5·:1 3·:1 5·:1 5·:1 3·:1 2·:1 1·:1 1·:1 2·:1 3·:1 2·:1 2·:1 1·:1 1·:1 6:1 2·:1 1·:1 1·:1 6:1 1··:1 2·:1 2·:1 1·:3" },
  { name: "铃儿响叮当", nums: "3:.5 3:.5 3:1 3:.5 3:.5 3:1 3:.5 5:.5 1:.5 2:.5 3:2 4:.5 4:.5 4:1 4:.5 3:.5 3:.5 3:.5 2:.5 2:.5 3:.5 2:.5 2:1 5:1 3:.5 3:.5 3:1 3:.5 3:.5 3:1 3:.5 5:.5 1:.5 2:.5 3:2 4:.5 4:.5 4:1 4:.5 3:.5 3:.5 3:.5 2:.5 2:.5 3:.5 2:.5 2:1 5:1 5:2 1:2" },
  { name: "平安夜", nums: "5:1 6:1 5:2 5:1 6:1 5:2 1·:2 3·:2 2·:1 3·:1 2·:1 1·:1 5:1 6:1 5:1 6:1 5:2 3:2 5:1 6:1 5:2" },
];

interface KeyDef {
  note: string;
  f: number;
  key: string;
}

interface ScoreNote {
  num: string;
  beats: number;
}

function parseScore(nums: string): ScoreNote[] {
  return nums.split(" ").map((t) => {
    const [n, b] = t.split(":");
    return { num: n, beats: b ? parseFloat(b) : 1 };
  });
}

function songNeedKeys(nums: string): number {
  if (!nums) return 0;
  const uniq: string[] = [];
  parseScore(nums).forEach((n) => {
    if (n.num !== "r" && !uniq.includes(n.num)) uniq.push(n.num);
  });
  return uniq.length;
}

/** 8 键模式：按曲目自动配 8 个音；自由弹奏用 C4-C5 */
function buildKeys(kc: number, si: number): KeyDef[] {
  let notes: { note: string; f: number }[];
  if (kc === 15) {
    notes = [...ALL_NOTES];
  } else {
    const score = SCORES[si];
    if (!score.nums) {
      notes = ALL_NOTES.slice(0, 8);
    } else {
      const nums = parseScore(score.nums).map((n) => n.num).filter((n) => n !== "r");
      const uniq: string[] = [];
      nums.forEach((n) => {
        if (!uniq.includes(n)) uniq.push(n);
      });
      const order = ALL_NOTES.map((o) => N2NUM[o.note]);
      uniq.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const used = uniq
        .slice(0, 8)
        .map((num) => ALL_NOTES.find((o) => N2NUM[o.note] === num))
        .filter((o): o is { note: string; f: number } => !!o);
      const rest = ALL_NOTES.filter((o) => !used.includes(o));
      while (used.length < 8 && rest.length) used.push(rest.shift()!);
      notes = used;
    }
  }
  return notes.map((n, i) => ({ note: n.note, f: n.f, key: DEFAULT_BIND[i] || "" }));
}

export function Piano() {
  const [keyCount, setKeyCount] = useState<8 | 15>(8);
  const [semis, setSemis] = useState(0);
  const [si, setSi] = useState(0);
  const [keys, setKeys] = useState<KeyDef[]>(() => buildKeys(8, 0));
  const [bindIdx, setBindIdx] = useState(-1);
  const [pickerIdx, setPickerIdx] = useState(-1);
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [hiNote, setHiNote] = useState(-1);
  const [hint, setHint] = useState("");
  const [speed, setSpeed] = useState(1);

  const audioRef = useRef<AudioContext | null>(null);
  const activeRef = useRef(new Map<number, { master: GainNode; nodes: AudioScheduledSourceNode[] }>());
  const demoTimers = useRef<number[]>([]);
  const practiceTimer = useRef<number | null>(null);
  const hitRef = useRef<Set<number>>(new Set());

  // 键盘监听要拿到最新值，用 ref 镜像
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const bindIdxRef = useRef(bindIdx);
  bindIdxRef.current = bindIdx;
  const siRef = useRef(si);
  siRef.current = si;
  const semisRef = useRef(semis);
  semisRef.current = semis;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const practiceRef = useRef({ mode: practiceMode, idx: practiceIdx });
  practiceRef.current = { mode: practiceMode, idx: practiceIdx };

  const flashHint = (msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint(""), 2600);
  };

  const sfxCtx = () => {
    if (!audioRef.current) {
      try {
        audioRef.current = new AudioContext();
      } catch {
        return null;
      }
    }
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  };

  const stopKeySound = useCallback((idx: number) => {
    const a = activeRef.current.get(idx);
    if (!a) return;
    const ctx = audioRef.current;
    if (ctx) {
      const t = ctx.currentTime;
      a.master.gain.cancelScheduledValues(t);
      a.master.gain.setValueAtTime(a.master.gain.value, t);
      a.master.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      a.nodes.forEach((o) => {
        try {
          o.stop(t + 0.15);
        } catch {
          /* 已停止 */
        }
      });
    }
    activeRef.current.delete(idx);
  }, []);

  const stopPractice = useCallback(() => {
    if (practiceTimer.current) {
      clearTimeout(practiceTimer.current);
      practiceTimer.current = null;
    }
    practiceRef.current = { mode: false, idx: 0 };
    setPracticeMode(false);
    setPracticeIdx(0);
  }, []);

  const stopDemo = useCallback(() => {
    demoTimers.current.forEach(clearTimeout);
    demoTimers.current = [];
    setHiNote(-1);
  }, []);

  // 卸载：清理定时器、按键音、音频
  useEffect(() => {
    const active = activeRef.current;
    return () => {
      demoTimers.current.forEach(clearTimeout);
      if (practiceTimer.current) clearTimeout(practiceTimer.current);
      active.forEach((_, idx) => stopKeySound(idx));
      void audioRef.current?.close().catch(() => {});
    };
  }, [stopKeySound]);

  const advancePracticeRef = useRef<(idx: number) => void>(() => {});

  const playKey = useCallback(
    (idx: number, holdMs: number) => {
      const k = keysRef.current[idx];
      const ctx = sfxCtx();
      if (!ctx || !k) return;
      stopKeySound(idx);
      const t = ctx.currentTime;
      const f = k.f * Math.pow(2, semisRef.current / 12);
      const PEAK = 0.14;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, t);
      master.gain.linearRampToValueAtTime(PEAK, t + 0.004);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 4500;
      lp.Q.value = 0.5;
      master.connect(lp).connect(ctx.destination);
      const oscs: OscillatorNode[] = [];
      // 泛音列：越高频衰减越快（钢琴余音"越来越柔"）
      ([[1, 1.0, 2.4], [2, 0.42, 1.1], [3, 0.18, 0.5], [4, 0.08, 0.22], [5, 0.03, 0.12]] as const).forEach(
        ([mult, amp, dec]) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = f * mult;
          g.gain.setValueAtTime(amp, t);
          g.gain.exponentialRampToValueAtTime(Math.max(amp * 0.3, 0.001), t + dec);
          o.connect(g).connect(master);
          o.start(t);
          oscs.push(o);
        },
      );
      // 琴槌敲击声：8ms 短噪声
      const nlen = Math.floor(ctx.sampleRate * 0.008);
      const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const nd = nbuf.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nlen);
      const nsrc = ctx.createBufferSource();
      nsrc.buffer = nbuf;
      const ng = ctx.createGain();
      ng.gain.value = 0.25;
      const nhp = ctx.createBiquadFilter();
      nhp.type = "highpass";
      nhp.frequency.value = 1800;
      nsrc.connect(nhp).connect(ng).connect(master);
      nsrc.start(t);
      master.gain.setTargetAtTime(PEAK * 0.55, t + 0.04, 0.35);

      setLit((prev) => new Set(prev).add(idx));

      if (holdMs === -1) {
        activeRef.current.set(idx, { master, nodes: [...oscs, nsrc] });
      } else {
        const dur = Math.max(holdMs / 1000, 0.15);
        const rel = t + Math.max(dur - 0.12, 0.05);
        master.gain.setTargetAtTime(0.001, rel, 0.045);
        oscs.forEach((o) => o.stop(t + dur + 0.05));
        window.setTimeout(() => {
          setLit((prev) => {
            const n = new Set(prev);
            n.delete(idx);
            return n;
          });
        }, dur * 1000);
      }
      // 跟练：按对记录，等松手进位
      if (practiceRef.current.mode) {
        const notes = parseScore(SCORES[siRef.current].nums);
        const p = practiceRef.current.idx;
        if (p < notes.length && N2NUM[k.note] === notes[p].num) hitRef.current.add(idx);
      }
    },
    [stopKeySound],
  );

  const stopKey = useCallback(
    (idx: number) => {
      stopKeySound(idx);
      setLit((prev) => {
        if (!prev.has(idx)) return prev;
        const n = new Set(prev);
        n.delete(idx);
        return n;
      });
      advancePracticeRef.current(idx);
    },
    [stopKeySound],
  );

  const finishPractice = useCallback(() => {
    flashHint(`🎉 整曲完成！${SCORES[siRef.current].name}`);
    practiceTimer.current = window.setTimeout(() => stopPractice(), 1500);
  }, [stopPractice]);

  const skipRestIfNeeded = useCallback(() => {
    if (practiceTimer.current) {
      clearTimeout(practiceTimer.current);
      practiceTimer.current = null;
    }
    if (!practiceRef.current.mode) return;
    const notes = parseScore(SCORES[siRef.current].nums);
    const idx = practiceRef.current.idx;
    if (idx >= notes.length) return;
    if (notes[idx].num === "r") {
      const wait = notes[idx].beats * (420 / speedRef.current);
      practiceTimer.current = window.setTimeout(() => {
        const next = practiceRef.current.idx + 1;
        practiceRef.current = { mode: true, idx: next };
        setPracticeIdx(next);
        if (next >= notes.length) finishPractice();
        else skipRestIfNeeded();
      }, wait);
    }
  }, [finishPractice]);

  advancePracticeRef.current = (idx: number) => {
    if (!practiceRef.current.mode || !hitRef.current.has(idx)) return;
    hitRef.current.delete(idx);
    const notes = parseScore(SCORES[siRef.current].nums);
    const next = practiceRef.current.idx + 1;
    practiceRef.current = { mode: true, idx: next };
    setPracticeIdx(next);
    if (next >= notes.length) finishPractice();
    else skipRestIfNeeded();
  };

  const playDemo = useCallback(() => {
    stopDemo();
    if (practiceRef.current.mode) stopPractice();
    const score = SCORES[siRef.current];
    if (!score.nums) return;
    const beat = 420 / speedRef.current;
    let delay = 0;
    parseScore(score.nums).forEach((n, i) => {
      const holdMs = n.beats * beat;
      demoTimers.current.push(
        window.setTimeout(() => {
          setHiNote(i);
          const idx = keysRef.current.findIndex((k) => N2NUM[k.note] === n.num);
          if (idx >= 0) playKey(idx, holdMs);
        }, delay),
      );
      delay += holdMs;
    });
    demoTimers.current.push(window.setTimeout(() => setHiNote(-1), delay));
  }, [playKey, stopDemo, stopPractice]);

  // 键盘弹奏 + 键位绑定
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (bindIdxRef.current >= 0) {
        if (e.key === "Escape") {
          setBindIdx(-1);
          return;
        }
        const kk = e.key.toLowerCase();
        if (kk.length === 1 && /[a-z0-9]/.test(kk)) {
          e.preventDefault();
          const bi = bindIdxRef.current;
          setKeys((prev) =>
            prev.map((k, i) => {
              if (i === bi) return { ...k, key: kk };
              if (k.key === kk) return { ...k, key: "" };
              return k;
            }),
          );
          setBindIdx(-1);
        }
        return;
      }
      const idx = keysRef.current.findIndex((k) => k.key && k.key === e.key.toLowerCase());
      if (idx >= 0) {
        e.preventDefault();
        playKey(idx, -1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const idx = keysRef.current.findIndex((k) => k.key && k.key === e.key.toLowerCase());
      if (idx >= 0) stopKey(idx);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [playKey, stopKey]);

  const switchSong = (next: number) => {
    stopDemo();
    if (practiceRef.current.mode) stopPractice();
    const nsi = (next + SCORES.length) % SCORES.length;
    setSi(nsi);
    const need = songNeedKeys(SCORES[nsi].nums);
    if (keyCount === 8 && need > 8) {
      setKeyCount(15);
      setKeys(buildKeys(15, nsi));
      flashHint(`「${SCORES[nsi].name}」用了 ${need} 个不同的音，8 键放不下，已自动切到 15 键`);
    } else {
      setKeys(buildKeys(keyCount, nsi));
    }
  };

  const switchKeyCount = (kc: 8 | 15) => {
    if (kc === keyCount) return;
    if (kc === 8) {
      const need = songNeedKeys(SCORES[si].nums);
      if (need > 8) {
        flashHint(`「${SCORES[si].name}」用了 ${need} 个不同的音，8 键放不下，请用 15 键`);
        return;
      }
    }
    setKeyCount(kc);
    setBindIdx(-1);
    setPickerIdx(-1);
    setKeys(buildKeys(kc, si));
  };

  const resetAll = () => {
    setSemis(0);
    setSi(0);
    setBindIdx(-1);
    setPickerIdx(-1);
    setKeys(buildKeys(keyCount, 0));
    flashHint("已恢复默认设置");
  };

  const pickNote = (noteName: string) => {
    const base = ALL_NOTES.find((o) => o.note === noteName);
    if (!base || pickerIdx < 0) return;
    setKeys((prev) => prev.map((k, i) => (i === pickerIdx ? { ...k, note: base.note, f: base.f } : k)));
    setPickerIdx(-1);
  };

  const score = SCORES[si];
  const notes = score.nums ? parseScore(score.nums) : null;
  const num2key = (num: string) => keys.find((k) => N2NUM[k.note] === num)?.key || "";

  // 跟练模式只显示当前 12 音窗口
  const ROW = 12;
  const practiceStart = Math.floor(practiceIdx / ROW) * ROW;
  const visibleNotes = notes
    ? practiceMode
      ? notes.slice(practiceStart, practiceStart + ROW).map((n, i) => ({ ...n, _i: practiceStart + i }))
      : notes.map((n, i) => ({ ...n, _i: i }))
    : null;

  return (
    <div className="space-y-3">
      {/* 曲目 + 试听/跟练/变速 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => switchSong(si - 1)} className="rounded-lg border bg-card px-2.5 py-1 text-base text-ink hover:border-primary">‹</button>
        <span className="min-w-20 text-center text-sm font-semibold text-ink">{score.name}</span>
        <button type="button" onClick={() => switchSong(si + 1)} className="rounded-lg border bg-card px-2.5 py-1 text-base text-ink hover:border-primary">›</button>
        <button type="button" onClick={playDemo} className="rounded-lg border bg-card px-3 py-1 text-xs text-ink hover:border-primary">试听</button>
        <button
          type="button"
          onClick={() => {
            if (practiceMode) {
              stopPractice();
            } else {
              stopDemo();
              practiceRef.current = { mode: true, idx: 0 };
              setPracticeMode(true);
              setPracticeIdx(0);
              skipRestIfNeeded();
            }
          }}
          className={cn(
            "rounded-lg border px-3 py-1 text-xs transition-colors",
            practiceMode ? "border-primary bg-primary text-primary-foreground" : "bg-card text-ink hover:border-primary",
          )}
        >
          {practiceMode ? "退出跟练" : "跟练"}
        </button>
        <select
          value={speed}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setSpeed(v);
            if (demoTimers.current.length) {
              stopDemo();
              speedRef.current = v;
              window.setTimeout(() => playDemo(), 30);
            }
          }}
          className="rounded-lg border bg-card px-1.5 py-1 text-xs text-ink"
        >
          <option value={0.5}>0.5x</option>
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
        </select>
      </div>

      {/* 调音 + 键数 */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>调音</span>
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={semis}
          onChange={(e) => setSemis(parseInt(e.target.value))}
          className="w-28 accent-primary"
        />
        <span className="min-w-14 text-ink">
          {semis === 0 ? "原调" : `${semis > 0 ? "+" : ""}${semis} 半音`}
        </span>
        <span className="ml-2">键数</span>
        {([8, 15] as const).map((kc) => (
          <button
            key={kc}
            type="button"
            onClick={() => switchKeyCount(kc)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs",
              keyCount === kc ? "border-primary bg-primary text-primary-foreground" : "bg-card text-ink hover:border-primary",
            )}
          >
            {kc}
          </button>
        ))}
        <button type="button" onClick={resetAll} className="ml-1 rounded-md border bg-card px-2 py-0.5 text-xs text-ink hover:border-primary">
          恢复默认
        </button>
      </div>

      {/* 简谱 */}
      <div className="flex min-h-14 flex-wrap content-center justify-center gap-x-1.5 gap-y-1 rounded-lg bg-secondary/60 px-2 py-2.5">
        {!visibleNotes && (
          <span className="w-full text-center text-sm leading-9 text-muted-foreground">
            自由弹奏，想弹什么就弹什么
          </span>
        )}
        {visibleNotes?.map((n) => {
          const kl = num2key(n.num);
          const isCurrent = practiceMode && n._i === practiceIdx;
          const isDone = practiceMode && n._i < practiceIdx;
          const isHi = !practiceMode && n._i === hiNote;
          return (
            <div
              key={n._i}
              className={cn(
                "inline-flex min-w-7 flex-col items-center rounded-md px-0.5 py-0.5 transition-all",
                isCurrent && "scale-110 bg-primary",
                isDone && "bg-ink/10",
                isHi && "scale-110 bg-primary",
              )}
            >
              <span
                className={cn(
                  "text-base font-semibold leading-6",
                  isCurrent || isHi ? "text-primary-foreground" : "text-ink",
                )}
              >
                {n.num === "r" ? "0" : n.num}
                {n.beats > 1 && <span className="opacity-50">{"—".repeat(Math.max(1, Math.ceil(n.beats) - 1))}</span>}
              </span>
              <span
                className={cn(
                  "text-[11px] uppercase leading-3",
                  isCurrent || isHi
                    ? "text-primary-foreground/80"
                    : kl
                      ? "text-muted-foreground"
                      : "text-destructive/60",
                )}
              >
                {kl || (n.num === "r" ? "休" : "?")}
              </span>
            </div>
          );
        })}
      </div>

      {/* 琴键 */}
      <div className="flex flex-wrap justify-center gap-0.5 pt-1">
        {keys.map((k, i) => (
          <div
            key={i}
            role="button"
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault();
              playKey(i, -1);
            }}
            onPointerUp={() => stopKey(i)}
            onPointerLeave={() => stopKey(i)}
            className={cn(
              "flex h-32 w-9 shrink-0 cursor-pointer select-none flex-col items-center rounded-b-lg border bg-card px-0 pb-2 pt-1.5 transition-all duration-75 sm:w-11",
              lit.has(i) && "translate-y-0.5 border-primary bg-primary",
            )}
          >
            <button
              type="button"
              title="点我改音高"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setBindIdx(-1);
                setPickerIdx(pickerIdx === i ? -1 : i);
              }}
              className={cn(
                "rounded px-1 text-[10px] leading-4",
                lit.has(i) ? "text-primary-foreground/80" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {k.note}
            </button>
            <span className={cn("text-[9px]", lit.has(i) ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
              {N2NUM[k.note] || ""}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              title="点我改按键"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setPickerIdx(-1);
                setBindIdx(bindIdx === i ? -1 : i);
              }}
              className={cn(
                "rounded px-1 text-base font-bold uppercase leading-5",
                bindIdx === i
                  ? "animate-pulse bg-primary text-primary-foreground"
                  : lit.has(i)
                    ? "text-primary-foreground"
                    : "text-ink hover:bg-muted",
              )}
            >
              {bindIdx === i ? "按…" : k.key || "·"}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {hint || "点键上字母重新绑定按键 · 点音名改音高 · 按键盘弹琴"}
      </p>

      {/* 音高选择弹层 */}
      {pickerIdx >= 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPickerIdx(-1)}
        >
          <div className="w-full max-w-sm rounded-xl border bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2.5 text-xs text-muted-foreground">
              选音高（当前 {keys[pickerIdx]?.note}）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_NOTES.map((n) => (
                <button
                  key={n.note}
                  type="button"
                  onClick={() => pickNote(n.note)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px]",
                    keys[pickerIdx]?.note === n.note
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-ink hover:border-primary",
                  )}
                >
                  {n.note} {N2NUM[n.note]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

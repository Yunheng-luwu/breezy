"use client";

/**
 * 情绪粉碎机：写下烦恼 → 剧烈颤抖 → 碎成粒子四散 → 浮现温柔安慰语
 * 内容不落库、无评判、无记录。
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// 粉碎后飘来的安慰语：与冻结版逐字一致
const COMFORTS = [
  "烦恼烦恼，消失喽～",
  "把它留在风里吧，你现在轻多了",
  "碎掉的烦恼，不会再长回来",
  "今天已经辛苦很久了，剩下的明天再说～",
  "你的努力和坚持，一直都值得被认可",
  "呼——都散啦，辛苦你了",
  "这一件，就到这儿为止吧",
];

const PARTICLE_COLORS = [
  "#e8a3a3",
  "#f0b98a",
  "#f2dd9a",
  "#b5d6a7",
  "#9ecfc4",
  "#a9c3e0",
  "#c3aede",
  "#efb9ca",
];

type Stage = "input" | "shaking" | "burst" | "comfort";
type Particle = { id: number; tx: number; ty: number; rot: number; size: number; color: string };

export function Shredder() {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("input");
  const [particles, setParticles] = useState<Particle[]>([]);
  const [comfort, setComfort] = useState("");
  const timersRef = useRef<number[]>([]);
  const idRef = useRef(0);

  // 卸载时清理所有定时器
  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const shred = () => {
    const t = text.trim();
    if (!t || stage === "shaking") return;
    setStage("shaking");
    // 1.2s 颤抖后碎成粒子，1s 粒子飞散后浮现安慰语
    timersRef.current.push(
      window.setTimeout(() => {
        const count = 12 + Math.floor(Math.random() * 5); // 12~16 个
        setParticles(
          Array.from({ length: count }, () => ({
            id: idRef.current++,
            tx: (Math.random() - 0.5) * 300,
            ty: (Math.random() - 0.5) * 240,
            rot: (Math.random() - 0.5) * 360,
            size: 6 + Math.random() * 7,
            color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
          })),
        );
        setStage("burst");
        timersRef.current.push(
          window.setTimeout(() => {
            setComfort(COMFORTS[Math.floor(Math.random() * COMFORTS.length)]);
            setStage("comfort");
          }, 1000),
        );
      }, 1200),
    );
  };

  const reset = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setText("");
    setParticles([]);
    setComfort("");
    setStage("input");
  };

  return (
    <div className="space-y-3">
      {stage === "input" && (
        <>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 100))}
            maxLength={100}
            rows={3}
            placeholder="把此刻的烦恼写下来，写完就把它粉碎…"
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{text.length}/100</span>
            <Button size="sm" onClick={shred} disabled={!text.trim()}>
              粉碎它
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">内容不会被保存，只有你自己知道。</p>
        </>
      )}

      {stage === "shaking" && (
        <div
          className="break-words rounded-lg border bg-muted px-4 py-4 text-center text-sm text-ink"
          style={{ animation: "shred-shake 1.2s ease-in-out" }}
        >
          {text}
        </div>
      )}

      {stage === "burst" && (
        <div className="relative h-24 overflow-hidden">
          {particles.map((p) => (
            <span
              key={p.id}
              className="absolute left-1/2 top-1/2 rounded-[2px]"
              style={
                {
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  animation: "particle-fly 1s ease-out forwards",
                  "--tx": `${p.tx}px`,
                  "--ty": `${p.ty}px`,
                  "--rot": `${p.rot}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      {stage === "comfort" && (
        <div className="space-y-3 text-center" style={{ animation: "rise-in 0.6s ease-out both" }}>
          <p className="font-brush text-lg leading-relaxed text-jade">{comfort}</p>
          <Button size="sm" variant="outline" onClick={reset}>
            再写一件
          </Button>
        </div>
      )}
    </div>
  );
}

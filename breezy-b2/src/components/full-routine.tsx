"use client";

/**
 * 八段锦整套带练：十式视频同屏展示，各自独立播放
 * - 不搞轮播/连播，想练哪式点哪式
 * - 同时只播放一个，点开新的一式会自动暂停上一个
 */
import { useEffect, useRef, useState } from "react";

export interface RoutineMove {
  id: number;
  name: string;
  video: string;
  duration: string;
}

export function FullRoutine({ moves }: { moves: RoutineMove[] }) {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const refs = useRef(new Map<number, HTMLVideoElement>());

  // 同时只播一个
  useEffect(() => {
    refs.current.forEach((v, id) => {
      if (id !== playingId && !v.paused) v.pause();
    });
  }, [playingId]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {moves.map((m, i) => (
        <div
          key={m.id}
          className="overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary"
        >
          <video
            ref={(el) => {
              if (el) refs.current.set(m.id, el);
              else refs.current.delete(m.id);
            }}
            src={`/anims/${m.video}`}
            controls
            preload="metadata"
            playsInline
            onPlay={() => setPlayingId(m.id)}
            className="aspect-video w-full bg-black object-contain"
          />
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-medium text-ink">
              {m.name}
              <span className="ml-1.5 text-xs text-muted-foreground">第 {i + 1} 式</span>
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">⏱ {m.duration}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

/**
 * 食谱视频播放器
 * - 视频存在：循环静音自动播放（带 controls、可点击重播）
 * - 视频加载失败（404 / 未录制）：显示「视频制作中」占位卡片，不影响布局
 */
import { useRef, useState } from "react";
import type { RecipeVideo } from "@/lib/data/recipe-videos";

export function RecipeVideoPlayer({
  video,
  showInfo = true,
}: {
  video: RecipeVideo;
  showInfo?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  const replay = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => undefined);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border bg-black">
      {!failed ? (
        <video
          ref={ref}
          src={video.src}
          className="aspect-video w-full object-cover"
          controls
          autoPlay
          muted
          loop
          playsInline
          poster=""
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-muted/40 text-center">
          <span className="text-4xl">{video.poster}</span>
          <p className="text-sm font-medium text-muted-foreground">视频制作中</p>
          <p className="text-[11px] text-muted-foreground/70">
            录制完成后替换 public{video.src} 即可
          </p>
        </div>
      )}

      <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/55 px-2 py-1 text-xs text-white">
        {video.name}
      </span>
      {showInfo && (
        <span className="pointer-events-none absolute right-3 top-3 rounded bg-primary/90 px-2 py-1 text-[11px] text-primary-foreground">
          {video.duration}
        </span>
      )}
      {!failed && (
        <button
          type="button"
          onClick={replay}
          className="absolute bottom-3 right-3 rounded-lg bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground backdrop-blur transition hover:bg-primary"
        >
          ▶ 重播
        </button>
      )}
    </div>
  );
}

"use client";

/**
 * 饮食页「养生食谱视频」专区
 * - 横滑卡片：封面 emoji + 菜名 + 分类 + 适合体质 + 时长
 * - 点击卡片弹出视频播放器（详情与做法仍在原食谱弹窗）
 */
import { useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { RecipeVideoPlayer } from "@/components/recipe-video";
import { RECIPE_VIDEOS, type RecipeVideo } from "@/lib/data/recipe-videos";
import { cn } from "@/lib/utils";

export function RecipeVideoSection() {
  const [active, setActive] = useState<RecipeVideo | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });
  const [dragging, setDragging] = useState(false);

  // 鼠标按住拖动横滑（触屏走原生滑动，不拦截）
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startLeft: el.scrollLeft,
      moved: false,
    };
    setDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const el = scrollerRef.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    const el = scrollerRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  // 拖动结束时抑制一次点击，避免误开视频
  const onClickCapture = (e: React.MouseEvent) => {
    if (!drag.current.moved) return;
    drag.current.moved = false;
    e.preventDefault();
    e.stopPropagation();
  };

  if (!RECIPE_VIDEOS.length) return null;

  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="font-brush text-2xl font-bold text-ink">养生食谱视频</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            跟着做更直观 · 共 {RECIPE_VIDEOS.length} 条（持续更新中）
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
          🎬 视频
        </span>
      </div>

      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        style={{ scrollSnapType: dragging ? "none" : undefined }}
        className={cn(
          "-mx-1 flex select-none gap-3 overflow-x-auto px-1 pb-2",
          !dragging && "snap-x snap-mandatory",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {RECIPE_VIDEOS.map((v) => (
          <div
            key={v.name}
            className="w-56 shrink-0 snap-start rounded-xl border bg-card p-3 transition-colors hover:border-primary"
          >
            <button
              type="button"
              onClick={() => setActive(v)}
              className="group block w-full text-left"
            >
              {/* 封面：用视频首帧，加载失败时降级为渐变占位 */}
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 to-muted">
                <video
                  src={v.src}
                  muted
                  playsInline
                  preload="auto"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-primary opacity-0 shadow transition-opacity group-hover:opacity-100">
                    ▶
                  </span>
                </span>
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {v.duration}
                </span>
              </div>
              <p className="mt-2 font-semibold text-ink">{v.name}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  {v.category}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  适合 {v.suitable.join("、")}
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.name ?? ""}>
        {active && (
          <div className="space-y-3">
            <RecipeVideoPlayer video={active} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                {active.category}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                时长 {active.duration}
              </span>
              {active.suitable.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-jade/10 px-2.5 py-1 text-jade"
                >
                  适合 {s}
                </span>
              ))}
            </div>
            <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
              视频仅作日常食养演示，不构成医疗建议；体质特殊、孕期或服药者请先咨询医师。
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}

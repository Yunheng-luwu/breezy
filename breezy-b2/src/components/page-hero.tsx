"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** 自动轮播间隔 */
const ROTATE_MS = 3500;
/** 触发滑动的位移阈值（px） */
const SWIPE_THRESHOLD = 50;
/** 滑动过渡时长，需与下方 duration-[900ms] 保持一致 */
const SLIDE_MS = 900;

/**
 * 页面顶部 title 图（对齐冻结版 .page-banner：大图 + 渐变遮罩 + 标题/副标题）
 * 多图时自动横向滑动轮播，支持鼠标拖拽 / 触屏左右滑动，右下角圆点可点选。
 */
export function PageHero({
  img,
  imgs,
  focus,
  title,
  subtitle,
}: {
  /** 单张横幅（兼容旧用法） */
  img?: string;
  /** 多张横幅：自动轮播 */
  imgs?: string[];
  /** 按图片路径指定裁切焦点（object-position），用于主体偏上的图 */
  focus?: Record<string, string>;
  title: string;
  subtitle?: string;
}) {
  const images = imgs && imgs.length ? imgs : img ? [img] : [];
  const n = images.length;
  const multi = n > 1;
  // 末尾追加一张首图，用于无缝回卷
  const slides = multi ? [...images, images[0]] : images;

  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [noAnim, setNoAnim] = useState(false);
  const [reduced, setReduced] = useState(false);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // 自动轮播
  useEffect(() => {
    if (!multi) return;
    const id = window.setInterval(() => {
      if (startX.current !== null) return; // 拖动中不自动切
      setIndex((i) => Math.min(i + 1, n));
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [multi, n]);

  // 滑到克隆帧后瞬时跳回首帧，视觉上无缝
  useEffect(() => {
    if (!multi || index !== n) return;
    const t = window.setTimeout(() => {
      setNoAnim(true);
      setIndex(0);
      window.setTimeout(() => setNoAnim(false), 60);
    }, reduced ? 0 : SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, multi, n, reduced]);

  const goTo = (i: number) => {
    setNoAnim(false);
    setIndex(Math.max(0, Math.min(i, n)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!multi) return;
    startX.current = e.clientX;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    setDrag(e.clientX - startX.current);
  };

  const endDrag = () => {
    if (startX.current === null) return;
    const d = drag;
    startX.current = null;
    setDrag(0);
    if (Math.abs(d) < SWIPE_THRESHOLD) return;
    if (d < 0) setIndex((i) => Math.min(i + 1, n));
    else setIndex((i) => Math.max(0, i - 1));
  };

  const activeIndex = n ? index % n : 0;

  return (
    <div
      className="relative -mx-6 -mt-6 mb-8 h-44 overflow-hidden bg-muted md:h-56"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
    >
      {slides.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt={i === 0 ? title : `${title} ${i + 1}`}
          loading={i < 2 ? "eager" : "lazy"}
          aria-hidden={i % n !== activeIndex}
          draggable={false}
          className={cn(
            "absolute inset-0 h-full w-full select-none object-cover duration-[900ms]",
            !reduced &&
              !noAnim &&
              drag === 0 &&
              "transition-transform ease-[cubic-bezier(0.25,1,0.5,1)]",
          )}
          style={{
            transform: `translateX(calc(${(i - index) * 100}% + ${drag}px))`,
            objectPosition: focus?.[src],
          }}
        />
      ))}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2b241d]/85 via-[#2b241d]/25 to-transparent" />
      <div className="absolute inset-x-6 bottom-5 pr-16">
        <h1 className="font-brush text-3xl font-bold text-white drop-shadow-sm">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
        <span className="mt-2 block h-px w-10 bg-white/60" />
      </div>
      {multi && (
        <div className="absolute bottom-5 right-5 flex items-center gap-1.5">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`切换到第 ${i + 1} 张横幅`}
              aria-current={i === activeIndex}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === activeIndex
                  ? "w-5 bg-white"
                  : "w-1.5 bg-white/50 hover:bg-white/80",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

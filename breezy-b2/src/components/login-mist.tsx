"use client";

import { useEffect, useRef } from "react";

const SIZE = 576; // px，与上一版一致的雾气光斑直径
const HALF = SIZE / 2;

/**
 * 跟随鼠标的雾气光斑：pointermove 时把一层柔和径向渐变移到指针位置，
 * 配合 CSS 过渡形成拖尾；不拦截任何点击事件。
 */
export function LoginMist() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 尊重「减少动态效果」：不做跟随
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: PointerEvent) => {
      el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      el.style.opacity = "1";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 opacity-0 transition-[transform,opacity] duration-300 ease-out"
      style={{
        width: SIZE,
        height: SIZE,
        marginLeft: -HALF,
        marginTop: -HALF,
        background:
          "radial-gradient(closest-side, rgba(255,255,255,0.78), rgba(255,255,255,0.28) 55%, rgba(255,255,255,0))",
        filter: "blur(18px)",
      }}
    />
  );
}

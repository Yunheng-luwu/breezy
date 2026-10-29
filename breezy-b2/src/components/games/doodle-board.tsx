"use client";

/**
 * 涂鸦减压板：自由涂鸦，10 色柔和色板 + 3 档笔粗 + 橡皮 + 清空 + 保存
 * 清空无确认直接清（画乱了也没关系），无评判无打分。
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const W = 480;
const H = 360;
const BG = "#faf6ec";
const COLORS = [
  "#4a4440", // 墨
  "#d96a5f", // 朱砂
  "#e89a5f", // 杏橙
  "#e8c86a", // 鹅黄
  "#9fbf6a", // 苔绿
  "#6aa88f", // 青绿
  "#6a9ec9", // 黛蓝
  "#9a86c9", // 藕紫
  "#d986a8", // 桃粉
  "#b9b1a5", // 米灰
];
const WIDTHS = [3, 6, 12];

export function DoodleBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [eraser, setEraser] = useState(false);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const pointerSeenRef = useRef(0);

  // 挂载铺底色
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
  }, []);

  const strokeColor = eraser ? BG : color;

  const toCanvasPoint = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * W) / rect.width,
      y: ((e.clientY - rect.top) * H) / rect.height,
    };
  };

  const drawDot = (x: number, y: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(x, y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (Date.now() - pointerSeenRef.current < 50) return;
    beginStroke(e.clientX, e.clientY);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (Date.now() - pointerSeenRef.current < 50) return;
    moveStroke(e.clientX, e.clientY);
  };
  const onMouseUp = () => endDraw();

  const beginStroke = (x: number, y: number) => {
    drawingRef.current = true;
    const p = toCanvasPoint({ clientX: x, clientY: y });
    lastRef.current = p;
    drawDot(p.x, p.y);
  };

  const moveStroke = (x: number, y: number) => {
    if (!drawingRef.current) return;
    const p = toCanvasPoint({ clientX: x, clientY: y });
    const last = lastRef.current ?? p;
    // 4px 步长插值，快速拖动也顺滑
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    for (let i = 1; i <= steps; i++) {
      drawLine(
        last.x + (dx * (i - 1)) / steps,
        last.y + (dy * (i - 1)) / steps,
        last.x + (dx * i) / steps,
        last.y + (dy * i) / steps,
      );
    }
    lastRef.current = p;
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clear = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "我的涂鸦.png";
    a.click();
  };

  const pickColor = (c: string) => {
    setColor(c);
    setEraser(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`选择颜色 ${c}`}
              onClick={() => pickColor(c)}
              className={cn(
                "h-6 w-6 rounded-full border border-black/10 transition-transform",
                !eraser && color === c && "scale-110 ring-2 ring-jade ring-offset-1",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              aria-label={`笔粗 ${w}`}
              onClick={() => setWidth(w)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border bg-card transition-colors",
                width === w && !eraser ? "border-jade" : "hover:border-primary",
              )}
            >
              <span className="rounded-full bg-ink" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={eraser ? "default" : "outline"} onClick={() => setEraser((v) => !v)}>
            🧹 橡皮
          </Button>
          <Button size="sm" variant="outline" onClick={clear}>
            清空
          </Button>
          <Button size="sm" variant="outline" onClick={save}>
            保存
          </Button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full touch-none rounded-lg border bg-card shadow-inner"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDraw}
        onPointerCancel={endDraw}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      />

      <p className="text-xs text-muted-foreground">
        画乱了也没关系，清空重来就好；喜欢的话可以保存下来。
      </p>
    </div>
  );
}

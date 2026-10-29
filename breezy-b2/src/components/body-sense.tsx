"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBodySenseAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const SENSE_KEY = "songxu_body_sense";
const ALERT_KEY = "songxu_weather_alert";

const SENSE_TIP: Record<string, string> = {
  怕冷: "🧣 你平时怕冷：比推荐搭配多备一件薄马甲或披肩，重点护住颈背、小腹和脚踝",
  正常: "按今日推荐穿即可，早晚出门记得加件外套",
  怕热: "☀️ 你平时怕热：内搭可选薄款，但肩颈、脚踝别露，空调房备件薄外套",
};

const SENSES = ["怕冷", "正常", "怕热"];

/** 把档案里的自由文本/规范值统一成三态，用于穿戴联动 */
export function normalizeSense(raw?: string | null): "怕冷" | "正常" | "怕热" {
  const s = String(raw ?? "");
  if (s.includes("怕热") || s.includes("怕暖")) return "怕热";
  if (s.includes("怕冷") || s.includes("畏寒")) return "怕冷";
  if (s.includes("正常")) return "正常";
  return "正常";
}

function readLocalSense(): string {
  if (typeof window === "undefined") return "正常";
  return localStorage.getItem(SENSE_KEY) || "正常";
}

/** 穿衣原则下方的体感提示（数据库偏好优先，localStorage 兜底） */
export function SenseTip({ initialSense }: { initialSense?: string }) {
  const [sense, setSense] = useState<"怕冷" | "正常" | "怕热">(
    normalizeSense(initialSense),
  );
  useEffect(() => {
    setSense(normalizeSense(initialSense || readLocalSense()));
    const onChange = () => setSense(normalizeSense(readLocalSense()));
    window.addEventListener("sx-body-sense", onChange);
    return () => window.removeEventListener("sx-body-sense", onChange);
  }, [initialSense]);
  return (
    <p className="mt-2 text-sm text-primary">{SENSE_TIP[sense] ?? SENSE_TIP["正常"]}</p>
  );
}

/** 降温/大风提醒开关 + 体感标签（怕冷/正常/怕热），体感写回档案 */
export function BodySenseControls({ initialSense }: { initialSense?: string }) {
  const router = useRouter();
  const [sense, setSense] = useState<string>(normalizeSense(initialSense));
  const [alertOn, setAlertOn] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    setSense(normalizeSense(initialSense || readLocalSense()));
    setAlertOn(localStorage.getItem(ALERT_KEY) !== "0");
  }, [initialSense]);

  const pickSense = (v: string) => {
    setSense(v);
    localStorage.setItem(SENSE_KEY, v);
    window.dispatchEvent(new Event("sx-body-sense"));
    start(async () => {
      await setBodySenseAction(v);
      router.refresh();
    });
  };
  const toggleAlert = () => {
    const next = !alertOn;
    localStorage.setItem(ALERT_KEY, next ? "1" : "0");
    setAlertOn(next);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
      <div>
        <p className="text-sm text-ink">降温/大风天气自动提醒</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          体感偏好会保存到健康档案，场景提醒按它和实时天气一起生成
        </p>
      </div>
      <div className="flex items-center gap-5">
        <button
          type="button"
          role="switch"
          aria-checked={alertOn}
          aria-label="降温/大风天气自动提醒"
          onClick={toggleAlert}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors",
            alertOn ? "bg-primary" : "bg-muted-foreground/40",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
              alertOn ? "right-0.5" : "left-0.5",
            )}
          />
        </button>
        <div className="flex gap-2">
          {SENSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => pickSense(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60",
                sense === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

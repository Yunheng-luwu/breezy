"use client";

/**
 * 穿衣页城市切换：展开输入框跳转 /clothing?city=xxx
 * 「自动定位」：优先浏览器 GPS 精确定位（高德逆地理转城市），失败/拒授权回退 IP 定位
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 右上角「自动定位」按钮：
 * - 点击 → 浏览器 GPS 定位 → /api/geo/reverse 转城市 → 跳 ?city=（最准）
 * - 用户拒绝授权/浏览器不支持 → 回退 IP 定位（清掉手动城市回 /clothing）
 */
export function AutoLocateButton({ manualCity }: { manualCity?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<"idle" | "gps" | "denied">("idle");

  const locateByIp = () => start(() => router.push("/clothing"));

  const locate = () => {
    if (!("geolocation" in navigator)) {
      locateByIp();
      return;
    }
    setPhase("gps");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        start(async () => {
          try {
            const res = await fetch(
              `/api/geo/reverse?lat=${latitude}&lng=${longitude}`,
            );
            const json = (await res.json()) as { city?: string };
            if (json.city) {
              setPhase("idle");
              router.push(`/clothing?city=${encodeURIComponent(json.city)}`);
              return;
            }
          } catch {
            /* 逆地理失败走 IP 兜底 */
          }
          setPhase("idle");
          router.push("/clothing");
        });
      },
      () => {
        // 用户拒绝或超时：回退 IP 定位，并短暂提示
        setPhase("denied");
        locateByIp();
        setTimeout(() => setPhase("idle"), 4000);
      },
      { timeout: 8000, maximumAge: 300000 },
    );
  };

  const busy = pending || phase === "gps";
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        title="点击重新定位：优先浏览器精确定位，拒绝后按网络 IP 定位"
        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-card px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
      >
        <LocateFixed className="h-3.5 w-3.5" />
        {busy ? "定位中…" : manualCity ? "恢复自动定位" : "重新定位"}
      </button>
      {phase === "denied" && (
        <span className="text-[10px] text-muted-foreground">
          未授权精确定位，已按网络 IP 粗略定位
        </span>
      )}
    </span>
  );
}

export function CitySwitch({ manualCity }: { manualCity?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const submit = () => {
    const city = value.trim();
    if (!city) return;
    setOpen(false);
    setValue("");
    router.push(`/clothing?city=${encodeURIComponent(city)}`);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {manualCity && (
        <span className="text-xs text-muted-foreground">
          已手动选择：{manualCity} ·
        </span>
      )}
      {open ? (
        <span className="inline-flex items-center gap-1">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="城市名，如 北京"
            className="h-7 w-28 px-2 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={submit}>
            确定
          </Button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setValue("");
            }}
            className="text-xs text-muted-foreground hover:text-ink"
          >
            取消
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-primary hover:underline"
        >
          📍 切换城市
        </button>
      )}
    </span>
  );
}

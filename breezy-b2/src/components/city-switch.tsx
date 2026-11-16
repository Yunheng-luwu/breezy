"use client";

/**
 * 穿衣页城市切换：展开输入框跳转 /clothing?city=xxx
 * 「自动定位」：优先浏览器 GPS 精确定位（高德逆地理转城市），失败/拒授权回退 IP 定位
 * 定位/手动选择的城市写入 cookie（30 天），之后各页面无需 URL 参数也能记住
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COOKIE_KEY = "sx_city";
/** 标记城市是否由用户手动选择（自动定位写入的 cookie 不带此标记） */
const MANUAL_KEY = "sx_city_manual";
const COOKIE_DAYS = 30;

function saveCityCookie(city: string, manual: boolean) {
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(city)}; max-age=${COOKIE_DAYS * 86400}; path=/; samesite=lax`;
  document.cookie = manual
    ? `${MANUAL_KEY}=1; max-age=${COOKIE_DAYS * 86400}; path=/; samesite=lax`
    : `${MANUAL_KEY}=; max-age=0; path=/; samesite=lax`;
}

function clearCityCookie() {
  document.cookie = `${COOKIE_KEY}=; max-age=0; path=/; samesite=lax`;
  document.cookie = `${MANUAL_KEY}=; max-age=0; path=/; samesite=lax`;
}

/**
 * 右上角「自动定位」按钮：
 * - 点击 → 浏览器 GPS 定位 → /api/geo/reverse 转城市 → 记 cookie 并跳 ?city=（最准）
 * - 用户拒绝授权/浏览器不支持 → 回退 IP 定位（清 cookie、清 URL 参数回 /clothing）
 */
export function AutoLocateButton({ manualCity }: { manualCity?: string }) {
  const [phase, setPhase] = useState<"idle" | "gps">("idle");

  // 用整页跳转而不是 router.push：定位结果写在 cookie 里，
  // 必须让服务端重新渲染，绕开客户端路由缓存（否则看起来“点了没反应”）
  const goAuto = () => {
    clearCityCookie();
    window.location.assign("/clothing");
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      goAuto();
      return;
    }
    setPhase("gps");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetch(`/api/geo/reverse?lat=${latitude}&lng=${longitude}`)
          .then((res) => res.json() as Promise<{ city?: string }>)
          .then((json) => {
            if (json.city) {
              // 自动定位结果写入 cookie，但不算“手动选择”：跳回不带 city 参数的页面
              saveCityCookie(json.city, false);
              window.location.assign("/clothing");
              return;
            }
            goAuto();
          })
          .catch(() => goAuto());
      },
      () => {
        // 用户拒绝或超时：直接回退自动定位
        goAuto();
      },
      { timeout: 8000, maximumAge: 300000 },
    );
  };

  const busy = phase === "gps";
  return (
    <button
      type="button"
      onClick={locate}
      disabled={busy}
      title="点击重新定位"
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-card px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
    >
      <LocateFixed className="h-3.5 w-3.5" />
      {busy ? "定位中…" : manualCity ? "恢复自动定位" : "重新定位"}
    </button>
  );
}

export function CitySwitch({ manualCity }: { manualCity?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const submit = () => {
    const city = value.trim();
    if (!city) return;
    saveCityCookie(city, true);
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

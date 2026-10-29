/**
 * 轻量天气查询：供解压小游戏按天气选场景图
 * GET → { ok, data: { weather, weatherText, temp, city } | null }
 */
import { NextResponse } from "next/server";
import { getClothingByIp, getClientIp } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const data = await getClothingByIp(getClientIp(req)).catch(() => null);
  if (!data) return NextResponse.json({ ok: true, data: null });
  return NextResponse.json({
    ok: true,
    data: {
      weather: data.weather,
      weatherText: data.weatherText ?? data.dayWeather,
      temp: data.temp,
      city: data.city,
    },
  });
}

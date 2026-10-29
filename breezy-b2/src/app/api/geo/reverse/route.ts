import { NextResponse } from "next/server";

/**
 * 浏览器精确定位 → 城市名
 * 前端拿 GPS 经纬度后调这里，服务端用高德逆地理编码转城市（key 不下发前端）
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "bad coords" }, { status: 400 });
  }
  const key = process.env.AMAP_KEY ?? "";
  if (!key) return NextResponse.json({ error: "no key" }, { status: 503 });

  try {
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${key}&location=${lng},${lat}&extensions=base`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    const json = await res.json();
    const ac = json?.regeocode?.addressComponent;
    // 直辖市 city 为 []，回退用 province；去掉「省/市/自治区」后缀
    let city: string =
      (Array.isArray(ac?.city) ? "" : (ac?.city ?? "")) || (ac?.province ?? "");
    city = String(city).replace(/(省|市|壮族自治区|回族自治区|维吾尔自治区|自治区)$/, "");
    if (!city) return NextResponse.json({ error: "unknown city" }, { status: 404 });
    return NextResponse.json({ city });
  } catch {
    return NextResponse.json({ error: "regeo failed" }, { status: 502 });
  }
}

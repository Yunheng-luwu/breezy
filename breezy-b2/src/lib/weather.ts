/**
 * 天气服务（对应冻结版 server/services/weather.js）
 * 高德 Web 服务 API：IP 定位 → 实时天气 → 按规则生成穿搭建议
 * 结果缓存 5 分钟；失败返回 null，由调用方回退默认数据
 */
import { tempBandOf } from "@/lib/season";

const AMAP_KEY = process.env.AMAP_KEY ?? "";
const DEFAULT_ADCODE = "330100"; // 杭州
const DEFAULT_CITY = "杭州";
const CACHE_TTL = 5 * 60 * 1000;

const cacheMap = new Map<string, { at: number; data: ClothingData }>();

const AMAP_IP_URL = "https://restapi.amap.com/v3/ip";
const AMAP_WEATHER_URL = "https://restapi.amap.com/v3/weather/weatherInfo";

const MUNICIPALITIES: Record<string, { name: string; adcode: string }> = {
  "110000": { name: "北京", adcode: "110100" },
  "310000": { name: "上海", adcode: "310100" },
  "120000": { name: "天津", adcode: "120100" },
  "500000": { name: "重庆", adcode: "500100" },
};

export interface ClothingData {
  temp: number;
  weather: string;
  weatherText?: string;
  city: string;
  high: number;
  low: number;
  diff: number;
  wind: string;
  windLevel: number;
  humidity: number;
  dayWeather: string;
  principle: string;
  inner: string;
  outer: string;
  shoes: string;
  /** 原则的判断依据，便于用户理解（温度档 / 天气 / 湿度 / 风力） */
  basis?: string;
  source?: string;
  located?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function amapGet(url: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ key: AMAP_KEY, ...params });
  const res = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`高德接口 HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== "1") throw new Error(`高德接口错误: ${json.info}(${json.infocode})`);
  return json;
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const v4 = ip.replace(/^::ffff:/, "");
  return (
    v4 === "127.0.0.1" ||
    ip === "::1" ||
    v4.startsWith("10.") ||
    v4.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(v4)
  );
}

export async function locateByIp(ip: string): Promise<{ city: string; adcode: string }> {
  const params: Record<string, string> = isPrivateIp(ip) ? {} : { ip };
  const json = await amapGet(AMAP_IP_URL, params);
  const adcode = Array.isArray(json.adcode) ? "" : json.adcode;
  if (!adcode) throw new Error("IP 定位失败: 无 adcode");
  const city =
    (Array.isArray(json.city) ? "" : json.city) ||
    (Array.isArray(json.province) ? "" : json.province) ||
    "未知城市";
  const muni = MUNICIPALITIES[adcode];
  if (muni) return { city: muni.name, adcode: muni.adcode };
  return { city: String(city).replace(/市$/, ""), adcode };
}

async function fetchWeather(adcode: string) {
  const [live, forecast] = await Promise.all([
    amapGet(AMAP_WEATHER_URL, { city: adcode, extensions: "base" }),
    amapGet(AMAP_WEATHER_URL, { city: adcode, extensions: "all" }),
  ]);
  const l = live.lives?.[0];
  const today = forecast.forecasts?.[0]?.casts?.[0];
  if (!l || !today) throw new Error("天气数据不完整");

  const num = (v: unknown) => {
    const m = String(v).match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };

  return {
    temp: num(l.temperature),
    weatherText: l.weather as string,
    windDir: l.winddirection as string,
    windPower: l.windpower as string,
    windLevel: num(l.windpower),
    humidity: num(l.humidity),
    high: num(today.daytemp),
    low: num(today.nighttemp),
    dayWeather: today.dayweather as string,
    cityName: String(l.city ?? ""),
  };
}

type WeatherBundle = Awaited<ReturnType<typeof fetchWeather>>;

function weatherEmoji(text: string): string {
  if (/雷/.test(text)) return "⛈️";
  if (/雪/.test(text)) return "🌨️";
  if (/雨/.test(text)) return "🌧️";
  if (/雾|霾/.test(text)) return "🌫️";
  if (/阴/.test(text)) return "☁️";
  if (/多云/.test(text)) return "⛅";
  if (/晴/.test(text)) return "☀️";
  return "🌤️";
}

function buildAdvice(w: {
  temp: number;
  dayWeather: string;
  windLevel: number;
  high: number;
  low: number;
  humidity: number;
}) {
  const t = w.temp;
  let inner: string;
  let outer: string;
  let shoes: string;
  if (t >= 30) {
    inner = "短袖或背心，选棉麻透气材质";
    outer = "防晒衫或薄衬衫，物理防晒";
    shoes = "凉鞋或透气运动鞋";
  } else if (t >= 25) {
    inner = "短袖T恤，轻薄透气";
    outer = "薄衬衫或防晒衣，空调房备用";
    shoes = "透气单鞋或运动鞋";
  } else if (t >= 20) {
    inner = "薄长袖或T恤加衬衫叠穿";
    outer = "薄外套或针织开衫，早晚备用";
    shoes = "单鞋或运动鞋";
  } else if (t >= 15) {
    inner = "薄长袖纯棉打底，透气吸汗";
    outer = "风衣或夹克，方便穿脱";
    shoes = "运动鞋或短靴，不露脚踝";
  } else if (t >= 10) {
    inner = "长袖打底加薄毛衣，护住背部";
    outer = "薄羽绒或风衣，防风为主";
    shoes = "短靴或运动鞋，注意脚部保暖";
  } else if (t >= 5) {
    inner = "保暖内衣加毛衣，护住颈背";
    outer = "羽绒服或呢大衣，防风保暖";
    shoes = "加绒靴子，寒从脚生";
  } else {
    inner = "加绒保暖内衣加厚毛衣，护住颈背";
    outer = "长款羽绒服，围巾护颈";
    shoes = "加绒防滑靴，配厚袜子";
  }

  const rainy = /雨|雷/.test(w.dayWeather);
  const snowy = /雪/.test(w.dayWeather);
  const windy = w.windLevel >= 5;
  if (rainy) shoes = "防水鞋或雨靴，雨天不露脚踝";
  if (snowy) shoes = "防滑加绒靴，注意脚下湿滑";
  if (windy && t < 25) outer += "，戴围巾护住颈部";

  const diff = w.high - w.low;
  const cloudy = /阴|雾|霾/.test(w.dayWeather);
  const damp = w.humidity >= 75;

  // 温度档：用于原则文案与依据展示
  const band = tempBandOf(t);

  let principle: string;
  if (snowy) principle = "今日有雪，防寒防滑，重点护住颈背脚踝";
  else if (rainy) principle = "今日有雨湿重，注意防潮保暖，忌淋雨受寒";
  else if (windy) principle = "今日大风，重点护住颈肩脚踝，防风避邪";
  else if (diff >= 10) principle = `今日温差${diff}°C，洋葱式穿衣方便增减`;
  else if (t >= 28) principle = "今日偏热，透气防晒为主，空调房备薄衫";
  else if (t <= 10) principle = "今日偏冷，重点护住颈背脚踝，寒从脚生";
  else if (t <= 15) principle = "今日微凉，长袖加薄外套，早晚护住颈背";
  else if (t <= 20) principle = "今日凉爽，薄外套随身，方便随温度增减";
  else if (t <= 25) principle = "今日气温舒适，早晚添衣，护住颈背";
  else principle = "今日偏暖，轻薄透气，空调房备一件薄衫";
  // 阴天湿重：即使气温不低也容易觉冷，追加提醒
  if (!snowy && !rainy && cloudy && damp) {
    principle += "；阴天湿度高，体感偏凉，别急着减衣";
  }

  const basis = [
    `${t}°C ${band}`,
    w.dayWeather || "",
    `湿度 ${w.humidity}%`,
    `风力 ${w.windLevel} 级`,
    diff >= 8 ? `温差 ${diff}°C` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { principle, inner, outer, shoes, basis };
}

function toClothingData(w: WeatherBundle, city: string, located: boolean): ClothingData {
  const advice = buildAdvice(w);
  return {
    temp: w.temp,
    weather: weatherEmoji(w.weatherText),
    weatherText: w.weatherText,
    city: city || "未知城市",
    high: w.high,
    low: w.low,
    diff: w.high - w.low,
    wind: `${w.windDir}风${w.windPower}级`,
    windLevel: w.windLevel,
    humidity: w.humidity,
    dayWeather: w.dayWeather,
    principle: advice.principle,
    inner: advice.inner,
    outer: advice.outer,
    shoes: advice.shoes,
    basis: advice.basis,
    source: "amap",
    located,
  };
}

/** 按 adcode 取天气 + 穿衣建议（带缓存） */
export async function getClothingByAdcode(
  adcode: string,
  city?: string,
  located = true,
): Promise<ClothingData | null> {
  if (!AMAP_KEY) return null;
  const cacheKey = `adcode:${adcode}`;
  const hit = cacheMap.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

  const w = await fetchWeather(adcode);
  const data = toClothingData(w, city ?? "", located);
  cacheMap.set(cacheKey, { at: Date.now(), data });
  return data;
}

/**
 * 按城市名取穿衣建议（高德 weatherInfo 的 city 参数支持城市名称）
 * 城市不存在或接口失败时返回 null，由调用方回退 IP 定位
 */
export async function getClothingByCity(city: string): Promise<ClothingData | null> {
  if (!AMAP_KEY) return null;
  const name = String(city || "").trim().replace(/市$/, "");
  if (!name) return null;
  const cacheKey = `city:${name}`;
  const hit = cacheMap.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

  try {
    const w = await fetchWeather(name);
    const display = w.cityName.replace(/市$/, "") || name;
    const data = toClothingData(w, display, true);
    cacheMap.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error("[weather] 按城市获取天气失败:", (err as Error).message);
    return null;
  }
}

/** 按来源 IP 取穿衣建议；失败返回 null */
export async function getClothingByIp(ip: string): Promise<ClothingData | null> {
  if (!AMAP_KEY) return null;
  const cleanIp = String(ip || "").replace(/^::ffff:/, "");
  const cacheKey = isPrivateIp(cleanIp) ? "_default" : cleanIp;
  const hit = cacheMap.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

  try {
    let city = DEFAULT_CITY;
    let adcode = DEFAULT_ADCODE;
    let located = true;
    try {
      ({ city, adcode } = await locateByIp(cleanIp));
    } catch {
      located = false;
    }
    const data = await getClothingByAdcode(adcode, city, located);
    if (data) cacheMap.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error("[weather] 获取天气失败:", (err as Error).message);
    return null;
  }
}

// ============ 场景提醒（天气 + 个人状况，文案带真实数值；对齐冻结版 getSceneReminders） ============

export interface SceneUserCtx {
  score: number | null;
  symptoms: string[];
  coldSensitive?: boolean;
  heatSensitive?: boolean;
}

export interface SceneReminder {
  icon: string;
  text: string;
}

export function buildSceneReminders(d: ClothingData, userCtx?: SceneUserCtx | null): SceneReminder[] {
  const rainy = /雨|雷/.test(d.dayWeather || "");
  const snowy = /雪/.test(d.dayWeather || "");
  const windy = (d.windLevel || 0) >= 5;
  const sunny = /晴/.test(d.dayWeather || "") && !rainy && !snowy;
  const diff = d.diff != null ? d.diff : d.high - d.low;
  const picked: Array<SceneReminder & { weight: number }> = [];
  const add = (icon: string, text: string, weight: number) => picked.push({ icon, text, weight });

  if (snowy) add("🌨️", `今天有雪（${d.low}~${d.high}°C），出门防滑，护住颈背脚踝`, 9);
  else if (rainy) add("🌧️", `今天${d.dayWeather}，包里备把伞，鞋子别露脚踝`, 9);
  if (windy && d.temp < 25) add("🌬️", `今天风有${d.windLevel}级，围巾护住后颈再出门`, 8);
  if (d.temp <= 8) add("🧣", `现在只有${d.temp}°C，外套拉链拉到顶，寒从脚生`, 8);
  if (diff >= 10) add("🌡️", `早晚温差${diff}°C，早出晚归多带一件外套`, 7);
  if (d.temp >= 28) add("❄️", `午后最高${d.high}°C，空调房备件披肩护肩颈`, 7);
  if (d.humidity >= 80 && d.temp >= 20) add("💧", `湿度${d.humidity}%偏湿，今天少碰生冷甜腻`, 6);
  if (d.humidity > 0 && d.humidity <= 40) add("💧", `空气偏干（湿度${d.humidity}%），多喝温水，炖个雪梨润润`, 6);
  if (sunny && d.temp >= 25) add("☀️", `中午紫外线强，出门做好防晒，傍晚晒背15分钟`, 5);
  if (sunny && d.temp >= 15 && d.temp < 25) add("☀️", `今天${d.temp}°C晴好，午休出门走10分钟晒晒背`, 4);

  // 个人状况条目：体感偏好 > 近30天症状 > 情绪自评，置顶最前面
  let personal: SceneReminder | null = null;
  if (userCtx) {
    const s = (userCtx.symptoms || []).join(" ");
    if (userCtx.heatSensitive) {
      personal =
        d.temp >= 26
          ? { icon: "🧊", text: `你怕热，今天最高${d.high}°C，选透气衣物，避开午后暴晒` }
          : { icon: "🧊", text: `你怕热，今天${d.temp}°C，内搭选薄款，肩颈别直吹空调` };
    } else if (userCtx.coldSensitive) {
      personal =
        d.temp <= 15
          ? { icon: "🧣", text: `你怕冷，今天只有${d.temp}°C，比别人早一步加衣，护住颈背脚踝` }
          : { icon: "🧣", text: `你怕冷，今天${d.temp}°C，早晚加件薄外套，护住颈背脚踝` };
    } else if (/失眠|睡|梦/.test(s)) personal = { icon: "🌙", text: "你最近睡得不太好，今晚提前半小时放下手机" };
    else if (/肩|颈|酸/.test(s)) personal = { icon: "🧘", text: "久坐易肩颈僵，每小时起来转转肩、拉伸1分钟" };
    else if (/胸闷|胁|叹|怒|烦|压|郁|生气/.test(s)) personal = { icon: "🌿", text: "情绪紧绷时按揉太冲穴3分钟，缓缓疏气" };
    else if (/疲|乏|累|倦/.test(s)) personal = { icon: "🦶", text: "累的时候睡前温水泡脚15分钟，解乏助眠" };
    else if (/胃|食欲|腹|消化|胀/.test(s)) personal = { icon: "🍵", text: "胃口不佳就喝碗小米粥，温软不负担" };
    else if ((userCtx.score ?? 0) >= 70) personal = { icon: "🌼", text: `今日情绪自评${userCtx.score}偏高，午后散步20分钟散散心` };
    else if (userCtx.symptoms.length) personal = { icon: "🍀", text: `这两天留意「${userCtx.symptoms[0]}」，规律作息是最好的调理` };
  }

  const out: SceneReminder[] = [];
  if (personal) out.push(personal);
  for (const r of picked.sort((a, b) => b.weight - a.weight)) {
    if (out.length >= 3) break;
    out.push({ icon: r.icon, text: r.text });
  }
  const fallback: SceneReminder[] = [
    { icon: "💪", text: "出汗别急着脱衣，等汗收了再减" },
    { icon: "🦶", text: "睡前温水泡脚15分钟，微微发热就好" },
    { icon: "🍵", text: "晨起一杯温水，唤醒脾胃" },
  ];
  for (const f of fallback) {
    if (out.length >= 3) break;
    out.push(f);
  }
  return out.slice(0, 3);
}

/** 从 Request headers 解析客户端 IP */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : "") || req.headers.get("x-real-ip") || "";
  return ip.replace(/^::ffff:/, "");
}

/** 记住用户定位/手动选择的城市（客户端写 cookie，30 天） */
export const CITY_COOKIE = "sx_city";

/**
 * 统一城市解析入口：显式城市（URL 参数或 cookie）优先，查不到/未指定时回退 IP 定位。
 * 解决「GPS 定位结果只在 URL 参数里，下次无参访问退回 IP 定位失败 → 默认杭州」的问题。
 */
export async function getClothingSmart(
  city: string | undefined,
  ip: string,
): Promise<ClothingData | null> {
  const name = String(city ?? "").trim();
  if (name) {
    return (await getClothingByCity(name)) ?? (await getClothingByIp(ip));
  }
  return getClothingByIp(ip);
}

import { headers, cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { AutoLocateButton, CitySwitch } from "@/components/city-switch";
import { BodySenseControls, SenseTip, normalizeSense } from "@/components/body-sense";
import { PageHero } from "@/components/page-hero";
import { getSolarTerm } from "@/lib/data/solar-term";
import { SEASON_CLOTHING, seasonOf } from "@/lib/season";
import { currentUserId, getHealthProfile, getSymptoms, getUser } from "@/lib/queries";
import {
  buildSceneReminders,
  getClothingSmart,
  CITY_COOKIE,
  type ClothingData,
  type SceneUserCtx,
} from "@/lib/weather";

const OUTFIT_CARDS = [
  { icon: "👕", label: "内搭", key: "inner" as const },
  { icon: "🧥", label: "外套", key: "outer" as const },
  { icon: "👟", label: "鞋子", key: "shoes" as const },
];

const WARM_SPOTS = [
  { icon: "🧣", label: "颈部", text: "受风易引发头疼，加重气机不畅" },
  { icon: "🎽", label: "背部", text: "背部受凉直接影响肝俞穴" },
  { icon: "🧦", label: "脚踝", text: "寒从脚生，肝经循行经过内踝" },
];

export default async function ClothingPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] };
}) {
  const raw = searchParams?.city;
  // URL 参数 > 定位 cookie > IP 定位
  const urlCity = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
  const cookieCity = cookies().get(CITY_COOKIE)?.value?.trim() || undefined;
  const city = urlCity ?? cookieCity;

  const forwarded = headers().get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim();

  let data: ClothingData | null = null;
  try {
    data = await getClothingSmart(city, ip);
  } catch {
    data = null;
  }

  // 个人化场景提醒：情绪自评 + 近期症状 + 体感偏好
  const userId = await currentUserId();
  let userCtx: SceneUserCtx | null = null;
  let bodySense = "";
  let bodySenseRaw = "";
  try {
    const [user, symptoms, profile] = await Promise.all([
      getUser(userId),
      getSymptoms(userId, 30),
      getHealthProfile(userId),
    ]);
    bodySenseRaw = String(profile.bodySense ?? "").trim();
    bodySense = normalizeSense(bodySenseRaw);
    userCtx = {
      score: user?.score ?? null,
      symptoms: symptoms.map((s) => s.symptom),
      coldSensitive: bodySense === "怕冷",
      heatSensitive: bodySense === "怕热",
    };
  } catch {
    userCtx = null;
  }
  const reminders = data ? buildSceneReminders(data, userCtx) : [];

  // 节气联动：当前节气 + 当季穿衣重点
  const now = new Date();
  const term = getSolarTerm(now);
  const seasonTip = SEASON_CLOTHING[seasonOf(now)];

  return (
    <div className="space-y-6">
      <PageHero
        img="/img/banners/clothing.jpg"
        title="穿衣建议"
        subtitle="因时穿衣 · 护好颈背 · 寒不伤肝"
      />

      {data ? (
        <>
      <Card className="border-primary/20 bg-card/80">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {data.city}
                {data.weatherText ? ` · ${data.weatherText}` : ""}
                {!city && (
                  <span className="ml-1 text-[11px] text-muted-foreground/70">
                    （按网络 IP 粗略定位，可能不准）
                  </span>
                )}
              </p>
              <div className="mt-1">
                <CitySwitch manualCity={city} />
              </div>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl leading-none">{data.weather}</span>
                <span className="font-brush text-6xl font-bold leading-none text-ink">
                  {data.temp}
                  <span className="text-2xl">°C</span>
                </span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <AutoLocateButton manualCity={city} />
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span>最高 {data.high}°</span>
                <span>最低 {data.low}°</span>
                <span>温差 {data.diff}°</span>
                <span>{data.wind}</span>
                <span>湿度 {data.humidity}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-primary">
            今日穿衣原则
          </p>
          <p className="text-xs text-muted-foreground">
            🌿 节气 · {term} ｜ {seasonTip}
          </p>
        </div>
        <p className="mt-1 font-brush text-xl leading-relaxed text-ink">
          {data.principle}
        </p>
        {data.basis && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            依据实况：{data.basis}
          </p>
        )}
        <SenseTip initialSense={bodySenseRaw} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {OUTFIT_CARDS.map((item) => (
          <Card key={item.key}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-sm font-medium text-ink">{item.label}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {data[item.key]}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
        </>
      ) : (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                暂时获取不到实时天气，无法给出具体穿衣建议。
              </p>
              <AutoLocateButton manualCity={city} />
            </div>
            <div className="mt-3">
              <CitySwitch manualCity={city} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              可手动输入城市后重试。未取得实时天气前，不做天气猜测。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 font-brush text-lg text-ink">肝郁人群重点保暖</h3>
            <div className="space-y-4">
              {WARM_SPOTS.map((spot) => (
                <div key={spot.label} className="text-center">
                  <div className="text-2xl">{spot.icon}</div>
                  <p className="mt-1 text-sm font-medium text-ink">{spot.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{spot.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-4 font-brush text-lg text-ink">场景提醒</h3>
            <div className="space-y-3">
              {reminders.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  获取到实时天气后，这里会按你的体质与近期症状给出场景提醒。
                </p>
              )}
              {reminders.map((r, i) => (
                <p key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span>{r.icon}</span>
                  <span>{r.text}</span>
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <BodySenseControls initialSense={bodySenseRaw} />

      <p className="text-xs text-muted-foreground">
        数据来源：高德天气（5 分钟缓存）
      </p>
    </div>
  );
}

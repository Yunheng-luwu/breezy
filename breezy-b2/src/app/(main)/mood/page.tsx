import { headers } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { Breathing478, MoodPicker } from "@/components/mood-picker";
import MoodFirstAid from "@/components/first-aid/first-aid";
import MoodGames from "@/components/games/mood-games";
import { PageHero } from "@/components/page-hero";
import { getSolarTerm } from "@/lib/data/solar-term";
import { SEASON_MOOD, seasonOf, weatherMoodTip } from "@/lib/season";
import { getClothingByIp } from "@/lib/weather";
import { currentUserId, getRecentMood, getMoodStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SCENES = [
  { name: "松风入耳", emoji: "🌲", desc: "山林风声 · 舒缓紧绷肩背" },
  { name: "细雨敲窗", emoji: "🌧️", desc: "雨落白噪音 · 陪伴独处时刻" },
  { name: "溪水潺潺", emoji: "💧", desc: "流水轻响 · 静心入眠" },
];

export default async function MoodPage() {
  const uid = await currentUserId();
  // 右侧列表只取最近若干条（滚动展示），分布与次数则按全量统计
  const [moods, moodStats] = await Promise.all([getRecentMood(uid, 20), getMoodStats(uid)]);

  // 天气 / 节气联动：按实况给今日舒压建议
  const now = new Date();
  const ip = (headers().get("x-forwarded-for") ?? "").split(",")[0].trim();
  const weather = await getClothingByIp(ip).catch(() => null);
  const season = seasonOf(now);
  const term = getSolarTerm(now);
  const moodTip = weather
    ? weatherMoodTip(weather.dayWeather, weather.temp)
    : SEASON_MOOD[season];

  // 左侧「情绪分布」小结：累计/今日次数 + 全量情绪频次条形图
  const { total: moodTotal, today: todayCount, dist } = moodStats;
  const distMax = dist.length ? dist[0].n : 1;

  return (
    <div className="space-y-8">
      <PageHero
        img="/img/banners/mood.jpg"
        title="情绪解压"
        subtitle="不求开心，先降一档 · 给情绪找个出口"
      />

      <div className="rounded-xl border border-jade/30 bg-jade/5 px-4 py-3">
        <p className="text-xs font-medium text-jade">
          🌿 {term} · {season}季
          {weather ? ` ｜ ${weather.city || "本地"} ${weather.temp}°C ${weather.weatherText ?? ""}` : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{moodTip}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {SEASON_MOOD[season]}
        </p>
      </div>

      {/* 情绪打卡（打卡 + 最近记录，同卡片承接） */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-brush text-2xl font-bold text-ink">情绪打卡</h2>
          <span className="text-xs text-muted-foreground">
            今日情绪 · 累计 {moodTotal} 条
          </span>
        </div>
        <Card>
          <CardContent className="pt-6">
            {/* 左：打卡；右：最近记录 —— 同卡片承接，改为左右结构 */}
            <div className="grid gap-5 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-6">
              <div className="flex flex-col">
                <MoodPicker />
                {moodTotal > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      累计 {moodTotal} 次 · 今日 {todayCount} 次
                    </p>
                    <ul className="mt-2.5 space-y-2">
                      {dist.map(({ mood, n }) => (
                        <li key={mood} className="flex items-center gap-2 text-xs">
                          <span className="w-12 shrink-0 text-ink">{mood}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-jade"
                              style={{ width: `${Math.max(8, (n / distMax) * 100)}%` }}
                            />
                          </span>
                          <span className="w-8 shrink-0 text-right text-muted-foreground">
                            {n} 次
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  最近记录 · 共 {moodTotal} 条
                </p>
                {moods.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    还没有记录，先给此刻的自己一个词吧。
                  </p>
                ) : (
                  <ul className="max-h-[248px] space-y-2 overflow-y-auto pr-1">
                    {moods.map((m, i) => (
                      <li
                        key={`${m.time}-${i}`}
                        className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                      >
                        <span className="text-ink">{m.mood}</span>
                        <span className="text-xs text-muted-foreground">{m.time}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 478 呼吸 */}
      <section>
        <h2 className="mb-4 font-brush text-2xl font-bold text-ink">478 呼吸</h2>
        <Card className="border-jade/20 bg-card/80">
          <CardContent className="pt-6">
            <Breathing478 />
          </CardContent>
        </Card>
      </section>

      {/* 情绪急救包 */}
      <section>
        <h2 className="font-brush text-2xl font-bold text-ink">情绪急救包</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">不求开心，先降一档 · 30 秒起效</p>
        <MoodFirstAid />
      </section>

      {/* 解压一刻 */}
      <section>
        <h2 className="mb-4 font-brush text-2xl font-bold text-ink">解压一刻</h2>
        <MoodGames />
      </section>

      {/* 疏压音乐 */}
      <section>
        <h2 className="mb-4 font-brush text-2xl font-bold text-ink">疏压音乐</h2>
        <Card>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
            {SCENES.map((s) => (
              <div
                key={s.name}
                className="rounded-lg border bg-card/80 p-4 text-center transition-colors hover:border-primary"
              >
                <span className="text-3xl">{s.emoji}</span>
                <p className="mt-2 text-sm font-medium text-ink">{s.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-3">
              曲库接入中，暂未开放播放；可先跟随上方呼吸练习放松身心。
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

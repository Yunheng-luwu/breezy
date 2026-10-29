import Link from "next/link";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HerbAtlas } from "@/components/herb-atlas";
import { PageHero } from "@/components/page-hero";
import { HomeTodoPanel } from "@/components/home-todo-panel";
import {
  currentUserId,
  getDashboard,
  getHealthProfile,
  isLoggedIn,
} from "@/lib/queries";
import { dietData } from "@/lib/content-data";
import { dietData as dietLib } from "@/lib/data/diet";
import { foodLib } from "@/lib/data/food-lib";
import { herbs } from "@/lib/data/herbs";
import { firstSentence, listAcupoints } from "@/lib/knowledge";
import { acupoints } from "@/lib/data/acupoints";
import { getSolarTerm } from "@/lib/data/solar-term";
import { SEASON_DIET, seasonOf, weatherSleepTip } from "@/lib/season";
import { getClothingByIp } from "@/lib/weather";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const ENTRIES = [
  { href: "/assistant", label: "AI 对话", emoji: "💬" },
  { href: "/practice", label: "八段锦", emoji: "🧘" },
  { href: "/care", label: "穴位推荐", emoji: "🦶" },
  { href: "/diet", label: "今日食疗", emoji: "🍵" },
  { href: "/record", label: "健康记录", emoji: "📋" },
  { href: "/profile", label: "我的档案", emoji: "👤" },
];

export default async function HomePage() {
  const userId = await currentUserId();
  const [dashboard, profile, loggedIn] = await Promise.all([
    getDashboard(userId),
    getHealthProfile(userId),
    isLoggedIn(),
  ]);

  const { user, todos, sleep, moods, chatCount } = dashboard;
  const now = new Date();
  const dateText = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${WEEKDAYS[now.getDay()]}`;

  // 天气（IP 定位，失败时静默不显示）
  const ip = (headers().get("x-forwarded-for") ?? "").split(",")[0].trim();
  const weather = await getClothingByIp(ip).catch(() => null);

  const principles = dietData.recommend.principles;
  const principle = principles[now.getDate() % principles.length];
  const acupoint = listAcupoints("stress")[0];
  const soups = dietLib.soups ?? [];

  const doneCount = todos.filter((t) => t.done).length;

  // 每日一穴：按当天在一年中的序号轮换
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const dailyPoint = acupoints[dayOfYear % acupoints.length];

  // 天气联动：睡前建议按实况天气替换为更具体的做法
  const weatherSleep = weather
    ? weatherSleepTip(weather.dayWeather, weather.temp)
    : "";

  const sleepAdvice = sleep?.sleepTime
    ? `昨晚 ${sleep.sleepTime} 入睡${sleep.wakeTime ? `、${sleep.wakeTime} 起床` : ""}，今晚延续这个节奏。`
    : profile.bedTime
      ? `你的目标是 ${profile.bedTime} 入睡，睡前半小时放下手机，泡个脚更好。`
      : "建议 23:00 前入睡，睡前用温水泡脚，让肝血归藏。";

  const season = seasonOf(now);
  const term = getSolarTerm(now);

  const prescriptions = [
    {
      id: "diet",
      emoji: "🍵",
      title: "今日饮食",
      source: "食疗原则",
      content: principle,
    },
    {
      id: "care",
      emoji: acupoint?.icon ?? "🦶",
      title: acupoint?.name ?? "太冲穴",
      source: acupoint?.meridian ?? "日常按揉",
      content: acupoint
        ? `${firstSentence(acupoint.effect, 48)}。取穴：${firstSentence(acupoint.location_easy, 40)}。`
        : "每日按揉太冲穴 3-5 分钟，疏肝理气、缓解胸胁胀闷。",
    },
    {
      id: "sleep",
      emoji: "🌙",
      title: "作息调养",
      source: weatherSleep ? "天气联动" : "生活节律",
      content: weatherSleep ? `${sleepAdvice}${weatherSleep}` : sleepAdvice,
    },
  ];

  const stats = [
    { label: "情绪自评", value: user?.score ?? "--", hint: user?.level ?? "待自评", emoji: "🌿" },
    { label: "今日待办", value: `${doneCount}/${todos.length}`, hint: "已完成", emoji: "✅" },
    { label: "情绪打卡", value: moods.length, hint: "最近记录", emoji: "💭" },
    { label: "AI 对话", value: chatCount, hint: "累计消息", emoji: "💬" },
  ];

  return (
    <div className="space-y-8">
      <PageHero
        img="/img/banners/home.jpg"
        title="顺气舒心 · 慢养日常"
        subtitle="基于中医疏肝解郁理论 · 茶饮 · 穴位 · 功法 · 作息，四位一体轻养生"
        seal="松序"
      />

      {/* 顶部欢迎区 */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-brush text-3xl font-bold text-ink">今日调养</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.name ?? "朋友"}，{dateText}
            </p>
            {weather && (
              <p className="mt-1 text-sm text-muted-foreground">
                {weather.weather} {weather.temp}°C · 📍 {weather.city || "本地"}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              🌿 {term} · {season}季 ｜ {SEASON_DIET[season]}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={`/assistant?q=${encodeURIComponent("请根据我的健康档案和今日状态，定制一套调理方案（作息 / 饮食 / 穴位）")}`}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              AI定制
            </Link>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">情绪自评</p>
              <p className="font-brush text-2xl font-bold text-primary">
                {user?.score ?? "--"}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {user?.level ?? ""}
                </span>
              </p>
            </div>
          </div>
        </div>

        {!loggedIn && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
            未登录：个人数据为空，登录后可查看并保存属于你的记录
            <Link href="/login" className="text-primary hover:underline">
              去登录 →
            </Link>
          </div>
        )}
      </section>

      {/* 今日调养 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-brush text-2xl font-bold text-ink">今日调养</h2>
          <span className="text-xs text-muted-foreground">每日轮换 · 顺时而养</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {prescriptions.map((p) => (
            <Card key={p.id} className="border-primary/20 bg-card/80">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{p.emoji}</span>
                  <div>
                    <CardTitle className="text-base text-ink">{p.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">{p.source}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 中药图鉴 · 今日精选 */}
      <section>
        <HerbAtlas herbs={herbs} foodLib={foodLib} soups={soups} />
      </section>

      {/* 每日一穴 */}
      {dailyPoint && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-brush text-2xl font-bold text-ink">每日一穴</h2>
            <span className="text-xs text-muted-foreground">按日轮换 · 随手按一按</span>
          </div>
          <Card className="relative border-primary/20 bg-card/80">
            <Link
              href="/care"
              className="absolute right-4 top-4 text-sm text-primary hover:underline"
            >
              查看全部 →
            </Link>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{dailyPoint.icon ?? "📍"}</span>
                <div>
                  <CardTitle className="text-base text-ink">{dailyPoint.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {dailyPoint.meridian ?? dailyPoint.tag ?? "日常按揉"}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm leading-relaxed">
              <p className="text-muted-foreground">
                <span className="font-medium text-ink">定位：</span>
                {dailyPoint.location_easy}
              </p>
              {dailyPoint.method && (
                <p className="text-muted-foreground">
                  <span className="font-medium text-ink">手法：</span>
                  {dailyPoint.method}
                  {dailyPoint.duration ? `（${dailyPoint.duration}）` : ""}
                </p>
              )}
              <p className="text-jade">
                <span className="font-medium text-ink">功效：</span>
                {dailyPoint.effect}
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {/* 今日节律 */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-brush text-2xl font-bold text-ink">今日调理待办</h2>
            <Link href="/rhythm" className="text-sm text-primary hover:underline">
              详情 →
            </Link>
          </div>
          <Card>
            <CardContent className="px-6 pb-6 pt-0">
              <HomeTodoPanel todos={todos} />
            </CardContent>
          </Card>
        </section>

        {/* 快速入口 */}
        <section>
          <h2 className="mb-4 font-brush text-2xl font-bold text-ink">快速入口</h2>
          <div className="grid grid-cols-2 gap-3">
            {ENTRIES.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent/50"
              >
                <span className="text-2xl">{item.emoji}</span>
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* 我的状态 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-brush text-2xl font-bold text-ink">我的状态</h2>
          <Link href="/profile" className="text-sm text-primary hover:underline">
            查看档案 →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-6 text-center">
                <span className="text-2xl">{s.emoji}</span>
                <p className="mt-2 text-3xl font-bold text-ink">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <span className="mt-1 inline-block rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {s.hint}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

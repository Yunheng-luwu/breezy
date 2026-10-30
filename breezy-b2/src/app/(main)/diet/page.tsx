import { headers, cookies } from "next/headers";
import { DietBoard, DietItemGrid } from "@/components/diet-board";
import { AtlasLauncher } from "@/components/herb-atlas";
import { PageHero } from "@/components/page-hero";
import { dietData as contentDiet } from "@/lib/content-data";
import { dietData } from "@/lib/data/diet";
import { foodLib } from "@/lib/data/food-lib";
import { herbs } from "@/lib/data/herbs";
import { getSolarTerm, getTermFood } from "@/lib/data/solar-term";
import { buildDietFocus } from "@/lib/diet-focus";
import { SEASON_DIET, seasonOf, tempDietTip } from "@/lib/season";
import { CITY_COOKIE, getClothingSmart } from "@/lib/weather";
import {
  currentUserId,
  getFavorites,
  getHealthProfile,
  getSymptoms,
  getUser,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DietPage() {
  const userId = await currentUserId();
  const favorites = await getFavorites(userId);
  const favNames = favorites
    .filter((f) => f.favType === "diet")
    .map((f) => f.targetName);

  const now = new Date();
  const { recommend, goodFoods, badFoods, recipePool, recipes } = contentDiet;
  const principle =
    recommend.principles[now.getDate() % recommend.principles.length];

  const categories = [
    { key: "teas", label: "茶饮 🍵" },
    { key: "porridges", label: "药粥 🍚" },
    { key: "dishes", label: "家常药膳 🥘" },
    { key: "soups", label: "养生汤 🍲" },
  ] as const;

  const soups = dietData.soups ?? [];

  // 天气 / 节气联动：按实况温度与当季给饮食侧重（记住的城市 cookie > IP 定位）
  const ip = (headers().get("x-forwarded-for") ?? "").split(",")[0].trim();
  const cookieCity = cookies().get(CITY_COOKIE)?.value?.trim() || undefined;
  const weather = await getClothingSmart(cookieCity, ip).catch(() => null);
  const season = seasonOf(now);
  const term = getSolarTerm(now);
  const tempTip = weather ? tempDietTip(weather.temp) : "";

  // 个人状况联动：情绪自评 + 近期症状 + 档案（体质/体感/偏好）
  let userCtx: { score: number | null; symptoms: string[]; constitution: string; bodySense: string } | null =
    null;
  try {
    const [me, symptoms, profile] = await Promise.all([
      getUser(userId),
      getSymptoms(userId, 14),
      getHealthProfile(userId),
    ]);
    userCtx = {
      score: me?.score ?? null,
      symptoms: symptoms.map((s) => s.symptom),
      constitution: profile.constitution ?? "",
      bodySense: profile.bodySense ?? "",
    };
  } catch {
    userCtx = null;
  }

  const focus = buildDietFocus({
    ...(userCtx ?? {}),
    temp: weather?.temp ?? null,
    weatherText: weather?.weatherText ?? "",
    term,
  });

  return (
    <div className="space-y-8">
      <PageHero
        img="/img/banners/diet.jpg"
        title="饮食推荐"
        subtitle="药食同源 · 顺时而食 · 疏肝养胃"
      />

      {/* 今日饮食侧重（天气 + 节气 + 个人状况） */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-xs font-medium text-primary">
          🌿 {term} · {season}季
          {weather
            ? ` ｜ ${weather.city || "本地"} ${weather.temp}°C ${weather.weatherText ?? ""}`
            : ""}
        </p>
        <p className="mt-1 text-sm text-ink">
          今日侧重：
          <span className="font-brush text-lg font-semibold text-primary">{focus.label}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            带「今日优先」标记的食谱更贴合你
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">依据：{focus.basis.join(" · ")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tempTip || SEASON_DIET[season]}</p>
      </div>

      <DietBoard
        principles={recommend.principles}
        initialPrinciple={principle}
        goodFoods={goodFoods}
        badFoods={badFoods}
        foodLib={foodLib}
        recipePool={recipePool}
        initialRecipes={recipes}
        soups={soups}
        termFood={getTermFood(now)}
        favNames={favNames}
        focusKeywords={focus.keywords}
      />

      {/* 家常药膳 · 本草图鉴入口 */}
      <AtlasLauncher
        herbs={herbs}
        foodLib={foodLib}
        soups={soups}
        label="家常药膳 🍲"
        description="汤品 · 粥膳 · 炖补 · 饮品，材料、做法、适用与禁忌齐全"
        buttonText="查看药膳"
        defaultTab="soup"
      />

      {/* 食养分类库 */}
      {categories.map((cat) => {
        const items = dietData[cat.key] ?? [];
        if (!items.length) return null;
        return (
          <section key={cat.key}>
            <h2 className="mb-4 text-lg font-semibold">
              {cat.label}
              <span className="ml-2 text-xs text-muted-foreground">
                ({items.length} 款 · 点卡片看做法)
              </span>
            </h2>
            <DietItemGrid items={items} favNames={favNames} focusKeywords={focus.keywords} />
          </section>
        );
      })}

      <p className="text-xs text-muted-foreground">
        红黑榜与食谱基于疏肝理气的食养原则，仅供日常参考，不构成医疗建议。
      </p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { FavButton } from "@/components/favorite-button";
import type { FoodInfo } from "@/lib/data/food-lib";
import type { TermInfo, TermFood } from "@/lib/data/solar-term";
import { cn } from "@/lib/utils";

interface Recipe {
  time: string;
  name: string;
  ingredients: string;
}

interface DietItem {
  name: string;
  ingredients?: string;
  method?: string;
  effect?: string;
  suitable?: string;
  contraindication?: string;
  frequency?: string;
  note?: string;
}

const RECIPE_EMOJI: Record<string, string> = {
  早餐: "🥣",
  午餐: "🍲",
  晚餐: "🍜",
  加餐: "🍵",
};
const MEAL_POOL_KEY: Record<string, string> = {
  早餐: "breakfast",
  午餐: "lunch",
  晚餐: "dinner",
  加餐: "snack",
};

const GOOD_GROUPS: Array<{ key: string; label: string }> = [
  { key: "tea", label: "茶饮" },
  { key: "staple", label: "主食" },
  { key: "vegetable", label: "蔬菜" },
  { key: "fruit", label: "水果" },
];
const BAD_GROUPS: Array<{ key: string; label: string }> = [
  { key: "cold", label: "生冷冰饮" },
  { key: "spicy", label: "辛辣油炸" },
  { key: "sour", label: "过酸食物" },
];

/** 食养分类卡片网格：点击看详情（材料/做法/功效/适用/禁忌/频率） */
export function DietItemGrid({
  items,
  favNames,
  focusKeywords = [],
}: {
  items: DietItem[];
  favNames: string[];
  focusKeywords?: string[];
}) {
  const [detail, setDetail] = useState<DietItem | null>(null);
  const favSet = new Set(favNames);
  const hit = (item: DietItem) =>
    focusKeywords.some((k) => `${item.name}${item.ingredients ?? ""}`.includes(k));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.name}
            role="button"
            tabIndex={0}
            onClick={() => setDetail(item)}
            onKeyDown={(e) => e.key === "Enter" && setDetail(item)}
            className="cursor-pointer rounded-xl border bg-card p-4 transition-colors hover:border-primary"
          >
            <p className="flex items-center gap-2 font-semibold text-ink">
              {item.name}
              {hit(item) && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-normal text-primary">
                  今日优先
                </span>
              )}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {item.effect}
            </p>
            <p className="mt-2 line-clamp-2 text-xs text-primary/80">
              {item.ingredients?.split(/[、，,]/).slice(0, 3).join("、")}
            </p>
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <FavButton
                type="diet"
                name={item.name}
                meta={item.effect ?? ""}
                active={favSet.has(item.name)}
              />
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ""}>
        {detail && (
          <div className="space-y-3 text-sm">
            {[
              ["功效", detail.effect],
              ["材料", detail.ingredients],
              ["做法", detail.method],
              ["适用", detail.suitable],
              ["禁忌", detail.contraindication],
              ["建议频率", detail.frequency],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="mt-0.5 text-muted-foreground">{value}</p>
                </div>
              ))}
            <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
              {detail.note ??
                "以上为日常食养分享，不构成医疗建议；体质特殊、孕期或正在服药者请先咨询医师。"}
            </p>
            <div onClick={(e) => e.stopPropagation()}>
              <FavButton
                type="diet"
                name={detail.name}
                meta={detail.effect ?? ""}
                active={favSet.has(detail.name)}
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
export function DietBoard({
  principles,
  initialPrinciple,
  goodFoods,
  badFoods,
  foodLib,
  recipePool,
  initialRecipes,
  soups,
  termFood,
  favNames,
  focusKeywords = [],
}: {
  principles: string[];
  initialPrinciple: string;
  goodFoods: Record<string, string[]>;
  badFoods: Record<string, string[]>;
  foodLib: Record<string, FoodInfo>;
  recipePool: Record<string, Array<{ name: string; ingredients: string }>>;
  initialRecipes: Recipe[];
  soups: DietItem[];
  termFood: TermInfo | null;
  favNames: string[];
  focusKeywords?: string[];
}) {
  const [principle, setPrinciple] = useState(initialPrinciple);
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [food, setFood] = useState<{ name: string; info: FoodInfo } | null>(null);
  const [soup, setSoup] = useState<DietItem | null>(null);
  const [termDetail, setTermDetail] = useState<TermFood | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const favSet = new Set(favNames);

  const shuffle = () => {
    // 轮换饮食原则（避免与当前相同）
    const candidates = principles.filter((p) => p !== principle);
    if (candidates.length) {
      setPrinciple(candidates[Math.floor(Math.random() * candidates.length)]);
    }
    // 换一批食谱：每餐从池中随机换一道不同的
    setRecipes((cur) =>
      cur.map((r) => {
        const pool = recipePool[MEAL_POOL_KEY[r.time]] ?? [];
        const others = pool.filter((p) => p.name !== r.name);
        if (!others.length) return r;
        const pick = others[Math.floor(Math.random() * others.length)];
        return { time: r.time, name: pick.name, ingredients: pick.ingredients };
      }),
    );
  };

  // 购物清单：汇总当前 4 个食谱的配料，去用量去重
  const shopList = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) {
      for (const s0 of String(r.ingredients || "").split(/[,，]/)) {
        const s = s0
          .trim()
          .replace(/\d+\s*g?$/i, "")
          .replace(/\d+颗?/, "")
          .replace(/适量|片|粒$/, "")
          .trim();
        if (s) set.add(s);
      }
    }
    return Array.from(set);
  }, [recipes]);

  const foodTag = (name: string, good: boolean) => {
    const info = foodLib[name];
    const cls = good
      ? "border-jade/30 bg-jade/10 text-jade"
      : "border-muted-foreground/20 bg-muted text-muted-foreground";
    if (!info) {
      return (
        <span key={name} className={cn("rounded-full border px-2.5 py-0.5 text-xs", cls)}>
          {name}
        </span>
      );
    }
    return (
      <button
        key={name}
        type="button"
        title="查看介绍"
        onClick={() => setFood({ name, info })}
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-xs transition-opacity hover:opacity-70",
          cls,
        )}
      >
        {name}
      </button>
    );
  };

  const soupOf = (name: string) => soups.find((s) => s.name === name);

  return (
    <>
      {/* 今日饮食原则 */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="min-w-0">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
            今日饮食原则
          </span>
          <p className="mt-2 font-brush text-xl leading-relaxed text-ink">{principle}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            原则每日轮换；「今日优先」按你的记录与天气计算
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-4xl">🍵</span>
          <button
            type="button"
            onClick={shuffle}
            className="text-xs text-primary hover:underline"
          >
            换一批
          </button>
        </div>
      </div>

      {/* 红黑榜 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-jade/40 bg-jade/5 p-4">
          <p className="mb-3 font-semibold text-jade">疏肝推荐 ✅</p>
          {GOOD_GROUPS.map((g) => (
            <div key={g.key} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-xs text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {(goodFoods[g.key] ?? []).map((n) => foodTag(n, true))}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-muted bg-muted/40 p-4">
          <p className="mb-3 font-semibold text-muted-foreground">肝郁避雷 ❌</p>
          {BAD_GROUPS.map((g) => (
            <div key={g.key} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-xs text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {(badFoods[g.key] ?? []).map((n) => foodTag(n, false))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 今日食谱 */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-brush text-2xl font-bold text-ink">今日食谱</h2>
          <button
            type="button"
            onClick={shuffle}
            className="text-sm text-primary hover:underline"
          >
            换一批
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {recipes.map((r) => {
            const s = soupOf(r.name);
            return (
              <div key={r.time} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                    {r.time}
                  </span>
                  <span className="text-2xl">{RECIPE_EMOJI[r.time] ?? "🍲"}</span>
                </div>
                <p className="mt-2 flex items-center gap-2 font-semibold text-ink">
                  {r.name}
                  {focusKeywords.some((k) => `${r.name}${r.ingredients}`.includes(k)) && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-normal text-primary">
                      今日优先
                    </span>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {r.ingredients}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <FavButton
                    type="diet"
                    name={r.name}
                    meta={r.ingredients}
                    active={favSet.has(r.name)}
                  />
                  {s && (
                    <button
                      type="button"
                      onClick={() => setSoup(s)}
                      className="text-primary hover:underline"
                    >
                      📖 药膳做法
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShopOpen(true)}
                    className="text-primary hover:underline"
                  >
                    🧺 购物清单
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 本期节气食方 */}
      {termFood && (
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-brush text-2xl font-bold text-ink">本期节气食方</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
              {termFood.name}
            </span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            {termFood.theme} · {termFood.principle}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {termFood.foods.map((f) => (
              <div
                key={f.name}
                role="button"
                tabIndex={0}
                onClick={() => setTermDetail(f)}
                onKeyDown={(e) => e.key === "Enter" && setTermDetail(f)}
                className="cursor-pointer rounded-xl border border-primary/15 bg-card/80 p-4 text-center transition-colors hover:border-primary/50"
              >
                <div className="text-3xl">{f.emoji}</div>
                <div className="mt-2 font-medium text-ink">{f.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {f.tag} · {termFood.name}时令
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 食材介绍弹窗 */}
      <Modal
        open={!!food}
        onClose={() => setFood(null)}
        title={
          food ? (
            <span className="flex items-center gap-2">
              <span className="text-2xl">{food.info.emoji}</span>
              {food.name}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                {food.info.tag}
              </span>
            </span>
          ) : (
            ""
          )
        }
      >
        {food && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{food.info.desc}</p>
            {food.info.tip && (
              <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
                小提示：{food.info.tip}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* 药膳做法弹窗 */}
      <Modal open={!!soup} onClose={() => setSoup(null)} title={soup?.name ?? ""}>
        {soup && (
          <div className="space-y-3 text-sm">
            {[
              ["功效", soup.effect],
              ["材料", soup.ingredients],
              ["做法", soup.method],
              ["适用", soup.suitable],
              ["禁忌", soup.contraindication],
              ["建议频率", soup.frequency],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="mt-0.5 text-muted-foreground">{value}</p>
                </div>
              ))}
            <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
              {soup.note ?? "药膳使用请咨询中医师，孕妇、儿童及慢性病患者遵医嘱。"}
            </p>
          </div>
        )}
      </Modal>

      {/* 节气食方详情弹窗 */}
      <Modal
        open={!!termDetail}
        onClose={() => setTermDetail(null)}
        title={
          termDetail ? (
            <span className="flex items-center gap-2">
              <span className="text-2xl">{termDetail.emoji}</span>
              {termDetail.name}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                {termDetail.tag}
              </span>
            </span>
          ) : (
            ""
          )
        }
      >
        {termDetail && (
          <div className="space-y-3 text-sm">
            {[
              ["功效", termDetail.effect],
              ["材料", termDetail.ingredients],
              ["做法", termDetail.method],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="font-semibold text-ink">{label}</p>
                <p className="mt-0.5 text-muted-foreground">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 购物清单弹窗 */}
      <Modal open={shopOpen} onClose={() => setShopOpen(false)} title="本期购物清单">
        <p className="mb-3 text-xs text-muted-foreground">
          已按当前 4 个食谱汇总，去掉了用量，按份买即可
        </p>
        <div className="grid grid-cols-2 gap-2">
          {shopList.map((x) => (
            <label
              key={x}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <input type="checkbox" className="accent-primary" />
              {x}
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}

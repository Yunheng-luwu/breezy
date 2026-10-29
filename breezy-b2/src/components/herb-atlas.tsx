"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import type { Herb } from "@/lib/data/herbs";
import { cn } from "@/lib/utils";

/**
 * 本草图鉴（中药 / 药膳 / 食材 三页签，带实物图）
 * 对齐冻结版 openHerbAtlas / switchAtlasTab / open*Detail
 * 图片为本地化 WebP：public/img/herbs|food|soups，缺失时以 emoji 兜底
 */

export interface AtlasSoup {
  name: string;
  effect?: string;
  ingredients?: string;
  method?: string;
  suitable?: string;
  contraindication?: string;
  frequency?: string;
  note?: string;
}

export interface AtlasFood {
  emoji: string;
  tag: string;
  desc: string;
  tip?: string;
}

const TABS = [
  { key: "herb", label: "中药" },
  { key: "soup", label: "药膳" },
  { key: "dish", label: "食材" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// 食材分组：顺序与 foodLib 键顺序严格一致（图片按索引对应）
const FOOD_GROUPS = [
  { title: "🍵 茶饮", from: 0, to: 8 },
  { title: "🍚 主食粥饭", from: 8, to: 16 },
  { title: "🥬 蔬菜", from: 16, to: 23 },
  { title: "🍎 水果", from: 23, to: 31 },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
// 图片编号与数据同一套下标（00 对应第 1 项），和冻结版 pad2(index) 一致
const herbImg = (i: number) => `/img/herbs/${pad2(i)}.webp`;
const foodImg = (i: number) => `/img/food/${pad2(i)}.webp`;
const soupImg = (i: number) => `/img/soups/${i + 1}.webp`;

/** 图片加载失败自动退化为 emoji 占位块 */
function AtlasImg({
  src,
  emoji,
  alt,
  className,
}: {
  src: string;
  emoji: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-accent/50 text-3xl",
          className,
        )}
      >
        {emoji}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}

/** 药膳卡片上的小标签：取功效第一段 */
function soupTag(effect?: string) {
  return String(effect || "").replace(/[。；]$/, "").split(/[，,]/)[0] || "调养药膳";
}

type Detail =
  | { kind: "herb"; data: Herb; emoji: string; img: string; tag: string }
  | { kind: "food"; data: AtlasFood; name: string; img: string; tag: string }
  | { kind: "soup"; data: AtlasSoup; img: string; tag: string };

function AtlasPanel({
  herbs,
  foodLib,
  soups,
}: {
  herbs: Herb[];
  foodLib: Record<string, AtlasFood>;
  soups: AtlasSoup[];
}) {
  const [tab, setTab] = useState<TabKey>("herb");
  const [detail, setDetail] = useState<Detail | null>(null);
  const foodNames = useMemo(() => Object.keys(foodLib), [foodLib]);

  const cards = (items: React.ReactNode[]) => (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
      {items}
    </div>
  );

  const card = (
    key: string,
    src: string,
    emoji: string,
    name: string,
    tag: string,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="group overflow-hidden rounded-xl border border-primary/15 bg-card text-left transition-colors hover:border-primary/50"
    >
      <AtlasImg
        src={src}
        emoji={emoji}
        alt={name}
        className="aspect-square w-full transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div className="px-2 py-1.5">
        <p className="truncate text-[13px] font-medium text-ink">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{tag}</p>
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* 页签 */}
      <div className="flex gap-1 rounded-full bg-muted/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-full py-2 text-sm transition-colors",
              tab === t.key
                ? "bg-primary font-semibold text-primary-foreground"
                : "text-muted-foreground hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "herb" &&
        cards(
          herbs.map((h, i) =>
            card(
              h.name,
              herbImg(i),
              h.emoji || "🌿",
              h.name,
              h.effect,
              () =>
                setDetail({
                  kind: "herb",
                  data: h,
                  emoji: h.emoji || "🌿",
                  img: herbImg(i),
                  tag: h.effect,
                }),
            ),
          ),
        )}

      {tab === "soup" &&
        (soups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            药膳数据暂时不可用，请稍后再试。
          </p>
        ) : (
          cards(
            soups.map((s, i) =>
              card(
                s.name,
                soupImg(i),
                "🍲",
                s.name,
                soupTag(s.effect),
                () =>
                  setDetail({
                    kind: "soup",
                    data: s,
                    img: soupImg(i),
                    tag: soupTag(s.effect),
                  }),
              ),
            ),
          )
        ))}

      {tab === "dish" && (
        <div className="space-y-1">
          {FOOD_GROUPS.map((g) => {
            const names = foodNames.slice(g.from, g.to);
            if (!names.length) return null;
            return (
              <div key={g.title}>
                <p className="mb-2 mt-3 text-sm font-semibold text-ink">
                  {g.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {names.length} 项
                  </span>
                </p>
                {cards(
                  names.map((name) => {
                    const f = foodLib[name];
                    const j = foodNames.indexOf(name);
                    return card(name, foodImg(j), f.emoji, name, f.tag, () =>
                      setDetail({
                        kind: "food",
                        data: f,
                        name,
                        img: foodImg(j),
                        tag: f.tag,
                      }),
                    );
                  }),
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 详情 */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detailLabel(detail) : ""}
      >
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="text-center">
              <AtlasImg
                src={detail.img}
                emoji={"emoji" in detail ? detail.emoji : "🍲"}
                alt=""
                className="mx-auto h-40 w-40 rounded-2xl shadow-md"
              />
              <span className="mt-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                {detail.tag}
              </span>
            </div>
            {detail.kind === "herb" && (
              <>
                <Field label="性味归经" text={detail.data.nature} />
                <Field label="功效描述" text={detail.data.desc} />
                <Field label="常见用法" text={detail.data.usage} />
              </>
            )}
            {detail.kind === "food" && (
              <>
                <Field label="食材介绍" text={detail.data.desc} />
                {detail.data.tip && (
                  <Field label="食用提示" text={detail.data.tip} />
                )}
              </>
            )}
            {detail.kind === "soup" && (
              <>
                <Field
                  label="功效"
                  text={String(detail.data.effect || "").replace(
                    /^[^，,]*[，,]/,
                    "",
                  )}
                />
                <Field label="材料" text={detail.data.ingredients} />
                <Field label="做法" text={detail.data.method} />
                <Field label="适用" text={detail.data.suitable} />
                <Field label="禁忌" text={detail.data.contraindication} />
                <Field label="建议频率" text={detail.data.frequency} />
              </>
            )}
            <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
              {detail.kind === "soup"
                ? detail.data.note ||
                  "药膳使用请咨询中医师，孕妇、儿童及慢性病患者遵医嘱。"
                : "以上内容仅供养生科普参考，不构成医疗建议；体质特殊、孕期或正在服药者，请先咨询医师或药师。"}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function detailLabel(d: Detail) {
  if (d.kind === "food") return d.name;
  return d.data.name;
}

function Field({ label, text }: { label: string; text?: string }) {
  return (
    <div>
      <p className="font-semibold text-ink">{label}</p>
      <p className="mt-1 text-muted-foreground">{text || "—"}</p>
    </div>
  );
}

/** 首页：今日精选 8 味（带图）+ 查看全部 */
export function HerbAtlas({
  herbs,
  foodLib,
  soups,
}: {
  herbs: Herb[];
  foodLib: Record<string, AtlasFood>;
  soups: AtlasSoup[];
}) {
  const [open, setOpen] = useState(false);

  const daily = useMemo(() => {
    const now = new Date();
    const doy = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
    );
    const n = herbs.length;
    const pick: Array<{ herb: Herb; idx: number }> = [];
    for (let i = 0; i < Math.min(8, n); i++) {
      const idx = (doy + i) % n;
      pick.push({ herb: herbs[idx], idx });
    }
    return pick;
  }, [herbs]);

  const todayLabel = useMemo(() => {
    const d = new Date();
    return `今日精选 · ${d.getMonth() + 1}月${d.getDate()}日`;
  }, []);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-brush text-2xl font-bold text-ink">
          中药图鉴 · 疏肝养身
        </h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
            {todayLabel}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-sm text-primary hover:underline"
          >
            查看全部 →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
        {daily.map(({ herb, idx }) => (
          <div key={herb.name} className="text-center">
            <AtlasImg
              src={herbImg(idx)}
              emoji={herb.emoji || "🌿"}
              alt={herb.name}
              className="aspect-square w-full rounded-lg border border-primary/15"
            />
            <p className="mt-1 truncate text-sm font-medium text-ink">
              {herb.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {herb.effect}
            </p>
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="本草图鉴"
        wide
      >
        <p className="mb-4 text-sm text-muted-foreground">
          日常调理以「药食同源」为原则，适量为宜；体质特殊或正在服药者，请先咨询医师。
        </p>
        <AtlasPanel herbs={herbs} foodLib={foodLib} soups={soups} />
      </Modal>
    </>
  );
}

/** 饮食页入口：点击打开同一本草图鉴（可指定默认页签） */
export function AtlasLauncher({
  herbs,
  foodLib,
  soups,
  label,
  description,
  buttonText,
  defaultTab = "herb",
}: {
  herbs: Herb[];
  foodLib: Record<string, AtlasFood>;
  soups: AtlasSoup[];
  label: string;
  description: string;
  buttonText: string;
  defaultTab?: TabKey;
}) {
  const [open, setOpen] = useState(false);
  const [tabKey, setTabKey] = useState(defaultTab);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-5">
        <div>
          <h3 className="font-brush text-xl font-bold text-ink">{label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTabKey(defaultTab);
            setOpen(true);
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          {buttonText}
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="本草图鉴"
        wide
      >
        <p className="mb-4 text-sm text-muted-foreground">
          日常调理以「药食同源」为原则，适量为宜；体质特殊或正在服药者，请先咨询医师。
        </p>
        <AtlasPanel
          key={tabKey}
          herbs={herbs}
          foodLib={foodLib}
          soups={soups}
        />
      </Modal>
    </>
  );
}

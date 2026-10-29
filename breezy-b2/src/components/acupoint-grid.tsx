"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { FavButton } from "@/components/favorite-button";
import { quickAddTodoAction } from "@/lib/actions";
import type { Acupoint } from "@/lib/data/acupoints";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "stress", label: "压力爆表疏肝组" },
  { key: "neck", label: "久坐肩颈放松组" },
  { key: "sleep", label: "熬夜失眠安神组" },
  { key: "office", label: "办公放松随手按" },
];

/**
 * 穴位疏通：分类筛选 + 详情弹窗 + 加入今日待办
 * 对齐冻结版 loadAcupoints / openAcuDetail / acuToTodo
 */
export function AcupointGrid({
  acupoints,
  favorites,
}: {
  acupoints: Acupoint[];
  favorites: string[];
}) {
  const [cat, setCat] = useState("stress");
  const [detail, setDetail] = useState<Acupoint | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();
  const favSet = new Set(favorites);

  const list = acupoints.filter((p) => (p.categories ?? []).includes(cat));

  const addToTodo = (p: Acupoint) => {
    start(async () => {
      await quickAddTodoAction(
        `按揉${p.name}${p.duration ? " " + p.duration : ""}`,
      );
      setAdded(true);
    });
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCat(c.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              cat === c.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <div
            key={p.name}
            role="button"
            tabIndex={0}
            onClick={() => {
              setDetail(p);
              setAdded(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setDetail(p);
                setAdded(false);
              }
            }}
            className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-center transition-colors hover:border-primary"
          >
            {/* 图区：保留冻结版的「图上文下」结构，配色收敛到站内淡雅风格 */}
            <div className="flex h-16 items-center justify-center border-b border-border/60 bg-secondary/35 text-2xl">
              {p.icon ?? "📍"}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <p className="font-semibold text-ink">{p.name}</p>
              {p.tag && (
                <span className="mx-auto mt-1 rounded-full bg-jade/10 px-2 py-0.5 text-[11px] text-jade">
                  {p.tag}
                </span>
              )}
              <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                {p.effect}
              </p>
              <span className="mt-3 block w-full rounded-md border border-primary/30 py-1.5 text-xs text-primary transition-colors group-hover:bg-primary/5">
                开始按揉
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 穴位详情 */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={
          detail ? (
            <span className="flex items-center gap-2">
              <span className="text-2xl">{detail.icon ?? "📍"}</span>
              {detail.name}
              {detail.tag && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                  {detail.tag}
                </span>
              )}
            </span>
          ) : (
            ""
          )
        }
      >
        {detail && (
          <div className="space-y-3 text-sm">
            {[
              ["功效", detail.effect],
              ["定位", detail.location_std || detail.location_easy],
              ["取穴", detail.location_easy],
              ["手法", detail.method],
              ["时长", detail.duration],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <span className="w-10 shrink-0 font-semibold text-ink">{label}</span>
                  <span className="text-muted-foreground">{value}</span>
                </div>
              ))}
            {detail.contraindication && (
              <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
                注意：{detail.contraindication}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              按揉以局部有酸胀感为度，皮肤破损处不按，孕期请先咨询医生。
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <FavButton
                type="acupoint"
                name={detail.name}
                meta={detail.tag ?? ""}
                active={favSet.has(detail.name)}
              />
              <button
                type="button"
                disabled={pending || added}
                onClick={() => addToTodo(detail)}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {added ? "已加入今日待办 ✓" : "加入今日待办"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

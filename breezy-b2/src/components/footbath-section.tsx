"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { FavButton } from "@/components/favorite-button";
import { quickAddTodoAction } from "@/lib/actions";

export interface Footbath {
  name: string;
  herbs?: string;
  method?: string;
  temp?: string;
  duration?: string;
  effect?: string;
  contraindication?: string;
  keywords?: string[];
}

/**
 * 泡脚助眠：按状态匹配配方（对齐冻结版 /care/footbath 关键词匹配）+ 加入今日待办
 */
export function FootbathSection({
  footbaths,
  favorites,
}: {
  footbaths: Footbath[];
  favorites: string[];
}) {
  const [status, setStatus] = useState("");
  const [picked, setPicked] = useState<Footbath | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();
  const favSet = new Set(favorites);

  const generate = () => {
    const s = status.trim();
    if (!s) return;
    const hit = footbaths.find((f) =>
      (f.keywords ?? []).some((k) => k && s.includes(k)),
    );
    setPicked(hit ?? footbaths[0] ?? null);
    setAdded(false);
  };

  const addToTodo = (f: Footbath) => {
    start(async () => {
      await quickAddTodoAction(`${f.name}泡脚${f.duration ? `（${f.duration}）` : ""}`);
      setAdded(true);
    });
  };

  return (
    <>
      {/* 状态匹配 */}
      <div className="mb-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink">输入今天的状态，为你定制泡脚方</p>
          <div className="flex gap-2">
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="如：失眠多梦、手脚冰凉"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={generate}
              className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90"
            >
              生成配方
            </button>
          </div>
        </div>
      </div>

      {/* 配方卡片 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {footbaths.map((f) => (
          <FootbathCard
            key={f.name}
            footbath={f}
            favActive={favSet.has(f.name)}
            onView={() => {
              setPicked(f);
              setAdded(false);
            }}
          />
        ))}
      </div>

      {/* 配方详情 */}
      <Modal
        open={!!picked}
        onClose={() => setPicked(null)}
        title={
          picked ? (
            <span className="flex items-center gap-2">
              🛁 {picked.name}
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                为你推荐
              </span>
            </span>
          ) : (
            ""
          )
        }
      >
        {picked && (
          <div className="space-y-3 text-sm">
            {[
              ["配伍", picked.herbs],
              ["做法", picked.method],
              ["水温", picked.temp],
              ["时长", picked.duration],
              ["功效", picked.effect],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label} className="flex gap-3">
                  <span className="w-10 shrink-0 font-semibold text-ink">{label}</span>
                  <span className="text-muted-foreground">{value}</span>
                </div>
              ))}
            <p className="rounded-lg bg-destructive/5 p-3 text-xs text-muted-foreground">
              {picked.contraindication ??
                "经期、皮肤破损、糖尿病周围神经病变者慎用；水温先试后加，泡后头晕不适立即停止。"}
            </p>
            <div className="flex items-center justify-between gap-3 pt-1">
              <FavButton
                type="footbath"
                name={picked.name}
                meta={picked.effect ?? ""}
                active={favSet.has(picked.name)}
              />
              <button
                type="button"
                disabled={pending || added}
                onClick={() => addToTodo(picked)}
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

/** 配方图区 emoji（对齐冻结版 herb-recipe-card 的图文卡） */
function herbEmoji(name: string): string {
  if (/玫瑰/.test(name)) return "🌹";
  if (/艾草|艾叶/.test(name)) return "🌿";
  if (/合欢/.test(name)) return "🌸";
  if (/陈皮|茯苓/.test(name)) return "🍊";
  if (/生姜|驱寒/.test(name)) return "🫚";
  if (/伸筋|舒筋/.test(name)) return "🧘";
  if (/菊花|决明/.test(name)) return "🌼";
  if (/当归/.test(name)) return "🌺";
  if (/益母/.test(name)) return "🌱";
  return "🛁";
}

function FootbathCard({
  footbath: f,
  favActive,
  onView,
}: {
  footbath: Footbath;
  favActive: boolean;
  onView: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => e.key === "Enter" && onView()}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-center transition-colors hover:border-primary"
    >
      {/* 图区：同样收敛为淡青绿，不做大面积渐变 */}
      <div className="flex h-16 items-center justify-center border-b border-border/60 bg-secondary/35 text-2xl">
        {herbEmoji(f.name)}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-semibold text-ink">{f.name}</p>
        {f.effect && (
          <span className="mx-auto mt-1 rounded-full bg-jade/10 px-2 py-0.5 text-[11px] text-jade">
            {f.effect}
          </span>
        )}
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {f.herbs}
        </p>
        <p className="mt-1 text-xs text-jade">
          水温 {f.temp} · {f.duration}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 rounded-md border border-primary/30 py-1.5 text-xs text-primary transition-colors group-hover:bg-primary/5">
            开始泡脚
          </span>
          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
            <FavButton type="footbath" name={f.name} meta={f.effect ?? ""} active={favActive} />
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * AI 结构化卡片渲染 —— 每类卡片都有对应板块入口，且视觉上明确告诉用户"能点击跳转"
 * 15 种 card：穴位/泡脚/饮食/穿衣/运动/功法/概览/症状/用药/待办/档案 + 确认卡 + nav
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AgentCardData = { type: string; [k: string]: any };

const CATEGORY_LABEL: Record<string, string> = {
  stress: "压力·疏肝组",
  neck: "肩颈·放松组",
  sleep: "睡眠·安神组",
  office: "办公·随手按",
};

/** 每种卡片对应的板块跳转入口 */
function EntryLink({
  href,
  label,
  hint = "点击跳转板块",
}: {
  href: string;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="group mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10"
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      <span className="rounded-full bg-primary/15 px-1.5 py-[1px] text-[10px] text-primary/90">
        {hint}
      </span>
    </Link>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
      {children}
    </span>
  );
}

/** 确认卡：点击后调用 /api/actions */
function ConfirmCard({
  title,
  rows,
  action,
  payload,
  successText,
}: {
  title: string;
  rows: [string, string][];
  action: string;
  payload: Record<string, unknown>;
  successText: string;
}) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const confirm = async () => {
    setState("pending");
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      if (data.ok) {
        setState("done");
        setMessage(data.message || successText);
      } else {
        setState("error");
        setMessage(data.message || "操作失败");
      }
    } catch {
      setState("error");
      setMessage("网络异常，请稍后再试");
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
            待确认
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <dl className="space-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="flex-1">{v}</dd>
            </div>
          ))}
        </dl>
        {state === "done" ? (
          <p className="flex items-center gap-1.5 text-sm text-jade">
            <Check className="h-4 w-4" /> {message || successText}
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={confirm} disabled={state === "pending"}>
              {state === "pending" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              确认{successText}
            </Button>
            {state === "error" && <span className="text-xs text-destructive">{message}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CardShell({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-card/90">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span>{title}</span>
          {badge && <Tag>{badge}</Tag>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );
}

function renderCard(card: AgentCardData) {
  switch (card.type) {
    case "acupoint_list":
      return (
        <CardShell title="推荐穴位" badge={CATEGORY_LABEL[card.category]}>
          <div className="grid gap-2 sm:grid-cols-2">
            {card.items.map((it: any) => (
              <div key={it.id} className="flex gap-2 rounded-lg border p-2.5">
                <span className="text-xl">{it.icon}</span>
                <div>
                  <p className="font-medium">
                    {it.name}
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{it.tag}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{it.effect}</p>
                </div>
              </div>
            ))}
          </div>
          <EntryLink href="/care" label="居家保健 · 查看穴位详情" />
        </CardShell>
      );

    case "acupoint_detail": {
      const d = card.item;
      return (
        <CardShell title={`${d.icon ?? ""} ${d.name}`} badge={d.tag}>
          <p className="text-xs leading-relaxed">
            <span className="text-muted-foreground">简易定位：</span>
            {d.location}
          </p>
          <p className="text-xs leading-relaxed">
            <span className="text-muted-foreground">按揉手法：</span>
            {d.method}
          </p>
          <p className="text-xs leading-relaxed">
            <span className="text-muted-foreground">时长频率：</span>
            {d.duration}
          </p>
          <EntryLink href="/care" label="居家保健 · 完整穴位图谱" />
        </CardShell>
      );
    }

    case "footbath": {
      const r = card.recipe;
      return (
        <CardShell title={`泡脚方 · ${r.name}`}>
          <p className="text-xs">药材：{r.herbs}</p>
          <p className="text-xs">
            水温 {r.temp} · 泡 {r.duration}
          </p>
          <EntryLink href="/care" label="居家保健 · 更多泡脚方" />
        </CardShell>
      );
    }

    case "diet": {
      const d = card.data;
      return (
        <CardShell title="今日饮食建议">
          <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-secondary-foreground">
            {d.recommend.principle}
          </p>
          <div className="grid gap-1.5 text-xs sm:grid-cols-2">
            <p>茶饮：{d.goodFoods.tea.slice(0, 5).join("、")}</p>
            <p>主食：{d.goodFoods.staple.slice(0, 4).join("、")}</p>
            <p>蔬菜：{d.goodFoods.vegetable.slice(0, 5).join("、")}</p>
            <p>水果：{d.goodFoods.fruit.slice(0, 5).join("、")}</p>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-xs">
            少吃：{d.badFoods.cold.slice(0, 3).join("、")} ·{" "}
            {d.badFoods.spicy.slice(0, 3).join("、")} · {d.badFoods.sour.slice(0, 3).join("、")}
          </div>
          <EntryLink href="/diet" label="饮食推荐 · 今日食谱与图鉴" />
        </CardShell>
      );
    }

    case "clothing": {
      const d = card.data;
      return (
        <CardShell title={`${d.city} ${d.temp}°C`} badge={d.weather}>
          <p className="text-xs text-muted-foreground">
            最高 {d.high}°C / 最低 {d.low}°C · {d.wind} · 湿度 {d.humidity}%
          </p>
          <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-secondary-foreground">
            {d.principle}
          </p>
          <ul className="space-y-1 text-xs">
            <li>内搭：{d.inner}</li>
            <li>外套：{d.outer}</li>
            <li>鞋子：{d.shoes}</li>
          </ul>
          <EntryLink href="/clothing" label="穿衣建议 · 实时天气与体感" />
        </CardShell>
      );
    }

    case "exercise":
      return (
        <CardShell title="疏肝轻运动">
          <div className="space-y-1.5">
            {card.items.map((e: any) => (
              <div key={e.name} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                <span>{e.icon}</span>
                <span className="flex-1 text-xs">{e.name}</span>
                <span className="text-[11px] text-muted-foreground">{e.duration}</span>
                <Tag>{e.tag}</Tag>
              </div>
            ))}
          </div>
          <EntryLink href="/practice" label="功法带练 · AI 跟练全部动作" />
        </CardShell>
      );

    case "practice":
      return (
        <CardShell title="八段锦十式">
          <div className="grid grid-cols-2 gap-1.5">
            {card.items.map((m: any) => (
              <Link
                key={m.id}
                href={`/practice/baduanjin?move=${encodeURIComponent(m.name)}`}
                className="group rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="text-muted-foreground">{m.id}.</span> {m.name}
                <span className="ml-1 text-[11px] text-muted-foreground">{m.duration}</span>
                <ArrowUpRight className="ml-1 inline h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
              </Link>
            ))}
          </div>
          <EntryLink href="/practice/baduanjin" label="功法带练 · 进入整套 AI 跟练" />
        </CardShell>
      );

    case "practice_detail": {
      const d = card.item;
      return (
        <CardShell title={`功法要领 · ${d.name}`}>
          {[
            ["分步要领", d.steps],
            ["呼吸配合", d.breath],
            ["次数时长", d.duration],
            ["常见错误", d.mistakes],
            ["功效", d.effect],
            ["注意事项", d.cautions],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <p key={k as string} className="text-xs leading-relaxed">
                <span className="text-muted-foreground">{k}：</span>
                {v}
              </p>
            ))}
          <EntryLink
            href={`/practice/baduanjin?move=${encodeURIComponent(d.name)}`}
            label="功法带练 · 开 AI 跟练这一式"
          />
        </CardShell>
      );
    }

    case "overview":
      return (
        <CardShell title="今日健康概览" badge={card.level ?? ""}>
          <p className="text-xs">
            情绪自评 <span className="text-lg font-bold text-ink">{card.score ?? "未评估"}</span>
          </p>
          <div className="space-y-1">
            {card.todos.map((t: any) => (
              <p key={t.id} className={cn("text-xs", t.done && "text-muted-foreground line-through")}>
                {t.done ? "✔" : "○"} {t.time} {t.text}
              </p>
            ))}
          </div>
          <EntryLink href="/home" label="今日调养 · 首页全览" />
        </CardShell>
      );

    case "symptom_list":
      return (
        <CardShell title="最近症状记录" badge={`${card.items.length} 条`}>
          {card.items.length === 0 && <p className="text-xs text-muted-foreground">还没有记录</p>}
          {card.items.map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Tag>{r.severity}</Tag>
              <span className="flex-1">{r.symptom}</span>
              <span className="text-[11px] text-muted-foreground">{r.time}</span>
            </div>
          ))}
          <EntryLink href="/record" label="健康记录 · 写随手记、打卡症状" />
        </CardShell>
      );

    case "medicine_list":
      return (
        <CardShell title="用药提醒" badge={`${card.items.length} 种`}>
          {card.items.length === 0 && <p className="text-xs text-muted-foreground">还没有用药提醒</p>}
          {card.items.map((m: any) => (
            <div key={m.id} className="rounded-lg border px-2.5 py-1.5 text-xs">
              <span className="font-medium">{m.name}</span>
              <span className="ml-1.5 text-muted-foreground">
                {m.dose} · {m.time}
              </span>
              {m.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{m.note}</p>}
            </div>
          ))}
          <EntryLink href="/profile" label="个人中心 · 健康档案与用药" />
        </CardShell>
      );

    case "todo_list":
      return (
        <CardShell title={card.date ? `${card.date} 待办` : "今日调理待办"}>
          {card.items.length === 0 && <p className="text-xs text-muted-foreground">没有待办</p>}
          {card.items.map((t: any) => (
            <p key={t.id} className={cn("text-xs", t.done && "text-muted-foreground line-through")}>
              {t.done ? "✔" : "○"} {t.time ? `${t.time} ` : ""}
              {t.text}
            </p>
          ))}
          <EntryLink href="/rhythm" label="生活节律 · 安排作息与打卡" />
        </CardShell>
      );

    case "profile": {
      const d = card.data;
      return (
        <CardShell title="我的健康档案" badge={d.level ?? ""}>
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            <p>昵称：{d.name || "未设置"}</p>
            <p>体质：{d.constitution || "未填"}</p>
            <p>过敏史：{d.allergy || "未填"}</p>
            <p>体感：{d.bodySense || "未填"}</p>
            <p>饮食偏好：{d.dietPref || "未填"}</p>
            <p>运动习惯：{d.exercisePref || "未填"}</p>
            <p>作息：{d.sleepPref || "未填"}</p>
            <p>
              目标：{d.wakeTime || "--"} / {d.napTime || "--"} / {d.bedTime || "--"}
            </p>
          </div>
          <EntryLink href="/profile" label="个人中心 · 修改档案与偏好" />
        </CardShell>
      );
    }

    case "confirm_symptom":
      return (
        <ConfirmCard
          title="记录这条症状"
          rows={[
            ["症状", card.payload.symptom],
            ["程度", card.payload.severity],
            ...(card.payload.cause ? [["原因", card.payload.cause] as [string, string]] : []),
          ]}
          action="symptom"
          payload={card.payload}
          successText="记录"
        />
      );

    case "confirm_mood":
      return (
        <ConfirmCard
          title="情绪打卡"
          rows={[["感受", card.payload.mood]]}
          action="mood"
          payload={card.payload}
          successText="打卡"
        />
      );

    case "confirm_todo":
      return (
        <ConfirmCard
          title="添加调理待办"
          rows={[
            ["内容", card.payload.content],
            ["时间", card.payload.time || "不限"],
            ["类型", card.payload.type],
          ]}
          action="todo"
          payload={card.payload}
          successText="添加"
        />
      );

    case "confirm_profile": {
      const names: Record<string, string> = {
        constitution: "体质",
        allergy: "过敏史",
        dietPref: "饮食偏好",
        exercisePref: "运动习惯",
        sleepPref: "作息规律",
        bodySense: "体感",
      };
      return (
        <ConfirmCard
          title="更新健康档案"
          rows={Object.entries(card.payload).map(
            ([k, v]) => [names[k] ?? k, String(v)] as [string, string],
          )}
          action="profile"
          payload={card.payload}
          successText="保存"
        />
      );
    }

    case "confirm_medicine":
      return (
        <ConfirmCard
          title="用药打卡"
          rows={[["药品", card.payload.medicineName]]}
          action="medicine"
          payload={card.payload}
          successText="打卡"
        />
      );

    case "nav":
      return (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-primary/80" />
            <span>继续去板块看</span>
            <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-[1px] text-[10px] text-primary/90">
              点按钮跳转
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {card.links.map((l: any) => (
              <Link
                key={l.href}
                href={l.href}
                className="group inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10"
              >
                {l.label}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function AgentCards({ cards }: { cards: AgentCardData[] }) {
  if (!cards?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {cards.map((c, i) => (
        <div key={`${c.type}-${i}`}>{renderCard(c)}</div>
      ))}
    </div>
  );
}

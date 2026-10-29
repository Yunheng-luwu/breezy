import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { query } from "@/lib/db";
import { PageHero } from "@/components/page-hero";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CATS = [
  { key: "all", label: "全部" },
  { key: "baduanjin", label: "八段锦" },
  { key: "stretch", label: "疏肝拉伸" },
  { key: "office", label: "办公室微动" },
] as const;

const CATEGORY_CN: Record<string, string> = {
  baduanjin: "八段锦",
  stretch: "疏肝拉伸",
  office: "办公室微动",
};

const RANK_STYLES = [
  "bg-amber-400 text-amber-950",
  "bg-slate-300 text-slate-800",
  "bg-orange-400 text-orange-950",
];

interface ScoreRow {
  action: string;
  category: string;
  score: number;
  reps: number;
  date: string;
  user: string;
}

export default async function RankPage({
  searchParams,
}: {
  searchParams?: { cat?: string };
}) {
  const cat = searchParams?.cat ?? "all";
  const validCat = CATS.some((c) => c.key === cat) ? cat : "all";

  const where = validCat === "all" ? "" : "WHERE ps.category = ?";
  const rows = await query<ScoreRow>(
    `SELECT ps.action, ps.category, ps.score, ps.reps,
            DATE_FORMAT(ps.created_at, '%m-%d') AS date,
            COALESCE(u.name, '松友') AS user
     FROM practice_scores ps
     LEFT JOIN users u ON u.id = ps.user_id
     ${where}
     ORDER BY ps.score DESC, ps.created_at ASC
     LIMIT 8`,
    validCat === "all" ? [] : [validCat],
  );

  return (
    <div className="space-y-6">
      <PageHero
        img="/img/banners/rank.jpg"
        title="排行榜"
        subtitle="全服动作评分 · 每日更新"
      />

      {/* 分类 tab */}
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <Link
            key={c.key}
            href={`/rank?cat=${c.key}`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              validCat === c.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-ink",
            )}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {rows.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                该分类暂无成绩，快来打第一个分～
              </p>
              <Link
                href="/practice/baduanjin?ai=1"
                className="mt-4 inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                开始 AI 跟练
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">排名</th>
                    <th className="py-2 pr-4 font-medium">用户</th>
                    <th className="py-2 pr-4 font-medium">动作</th>
                    <th className="py-2 pr-4 font-medium">得分</th>
                    <th className="py-2 font-medium">日期</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        {i < 3 ? (
                          <span
                            className={cn(
                              "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                              RANK_STYLES[i],
                            )}
                          >
                            {i + 1}
                          </span>
                        ) : (
                          <span className="inline-flex h-7 w-7 items-center justify-center text-xs text-muted-foreground">
                            {i + 1}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-ink">{row.user}</td>
                      <td className="py-3 pr-4">
                        {row.action}
                        <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">
                          {CATEGORY_CN[row.category] ?? row.category}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-bold text-jade">
                        {row.score}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          · {row.reps} 次
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

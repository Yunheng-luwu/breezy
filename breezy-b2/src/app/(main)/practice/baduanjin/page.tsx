import Link from "next/link";
import AiPracticeSection, { PracticeVideo } from "@/components/ai-practice";
import { FullRoutine, type RoutineMove } from "@/components/full-routine";
import { Card, CardContent } from "@/components/ui/card";
import { MOVE_VIDEOS } from "@/lib/data/baduanjin-videos";
import { getPracticeMoves } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

const DEFAULT_MOVE = "两手托天理三焦";

type PracticeSearchParams = {
  move?: string;
  ai?: string;
  full?: string;
};

function InfoCard({
  title,
  icon,
  text,
  className,
}: {
  title: string;
  icon: string;
  text?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="text-base">{icon}</span>
          {title}
        </h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {text || "—"}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function BaduanjinDetailPage({
  searchParams,
}: {
  searchParams?: PracticeSearchParams;
}) {
  const moves = getPracticeMoves();

  // 整套带练模式：一次识别逐式推进，不换窗口
  if (searchParams?.full === "1") {
    const moveOptions = moves.map((m) => ({
      name: m.name,
      video: MOVE_VIDEOS[m.name] ?? MOVE_VIDEOS[DEFAULT_MOVE],
    }));
    const routine: RoutineMove[] = moves.map((m) => ({
      id: m.id,
      name: m.name,
      video: MOVE_VIDEOS[m.name] ?? MOVE_VIDEOS[DEFAULT_MOVE],
      duration: m.duration,
    }));
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/practice/baduanjin"
              className="text-xs text-muted-foreground transition hover:text-primary"
            >
              ← 返回单式精学
            </Link>
            <h1 className="mt-2 font-brush text-3xl font-bold text-ink">
              八段锦 · 整套带练
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              摄像头只开一次 · 逐式推进自动换示范视频与评分标准 · 全程一个窗口
            </p>
          </div>
          <span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
            🧘 十式连贯
          </span>
        </div>

        {/* AI 整套带练（一次识别逐式推进） */}
        <AiPracticeSection moves={moveOptions} routine initiallyOpen />

        {/* 不开摄像头：纯视频同屏跟练 */}
        <section className="space-y-3">
          <h2 className="font-brush text-xl text-ink">纯视频跟练（不开摄像头）</h2>
          <p className="text-xs text-muted-foreground">
            十式示范同屏，想练哪式点哪式，各自独立播放。
          </p>
          <FullRoutine moves={routine} />
        </section>
      </div>
    );
  }

  const query = searchParams?.move?.trim();
  const current =
    (query &&
      (moves.find((m) => m.name === query) ??
        moves.find((m) => m.name.includes(query)))) ||
    moves.find((m) => m.name === DEFAULT_MOVE) ||
    moves[0];

  const videoFile = MOVE_VIDEOS[current.name] ?? MOVE_VIDEOS[DEFAULT_MOVE];
  const moveOptions = moves.map((m) => ({
    name: m.name,
    video: MOVE_VIDEOS[m.name] ?? MOVE_VIDEOS[DEFAULT_MOVE],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/practice"
            className="text-xs text-muted-foreground transition hover:text-primary"
          >
            ← 返回功法列表
          </Link>
          <h1 className="mt-2 font-brush text-3xl font-bold text-ink">
            八段锦 · 单式精学
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            十式串联 · 示范视频 · AI 摄像头实时评测
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-accent px-3 py-1 text-xs text-accent-foreground">
            第 {current.id} 式
          </span>
          <Link
            href="/practice/baduanjin?full=1"
            className="rounded-full border border-primary/40 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/10"
          >
            🧘 切到整套带练 →
          </Link>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {moves.map((move) => {
          const active = move.name === current.name;
          return (
            <Link
              key={move.id}
              href={`/practice/baduanjin?move=${encodeURIComponent(move.name)}`}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary hover:text-ink",
              )}
            >
              {move.name}
            </Link>
          );
        })}
      </div>

      <AiPracticeSection
        moves={moveOptions}
        defaultMove={current.name}
        initiallyOpen={searchParams?.ai === "1"}
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-brush text-2xl text-ink">{current.name}</h2>
          <p className="text-sm text-muted-foreground">{current.duration}</p>
        </div>
        <PracticeVideo src={`/anims/${videoFile}`} name={current.name} />
      </section>

      <section className="space-y-3">
        <h2 className="font-brush text-xl text-ink">动作要领</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard
            title="分步要领"
            icon="📋"
            text={current.steps}
            className="md:col-span-2"
          />
          <InfoCard title="呼吸配合" icon="🌬️" text={current.breath} />
          <InfoCard title="次数时长" icon="⏱️" text={current.duration} />
          <InfoCard title="常见错误" icon="⚠️" text={current.mistakes} />
          <InfoCard title="功效" icon="🌿" text={current.effect} />
          <InfoCard
            title="注意事项"
            icon="🛡️"
            text={current.cautions}
            className="md:col-span-2"
          />
        </div>
      </section>
    </div>
  );
}

"use client";

/**
 * 解压一刻：一分钟小玩具 + AI 陪玩
 * 无计时、无排名、无输赢，玩只是为了给情绪找个出口。
 * 游戏与提示词对齐冻结版：泡泡纸 / 数字舒压格 / 刮刮乐 / 涂鸦板 / 自由弹琴。
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BubbleWrap } from "./bubble-wrap";
import { ToneGrid } from "./tone-grid";
import { ScratchCard } from "./scratch-card";
import { DoodleBoard } from "./doodle-board";
import { Piano } from "./piano";

type GameKey = "bubble" | "tone" | "scratch" | "doodle" | "piano" | null;

const GAMES: {
  key: Exclude<GameKey, null>;
  emoji: string;
  name: string;
  desc: string;
  guide: string;
  wide?: boolean;
}[] = [
  {
    key: "bubble", emoji: "🫧", name: "捏泡泡纸", desc: "一颗一颗，把烦躁捏掉",
    guide: "按住鼠标拖动，划过的泡泡会「啵」地破掉，连划可以一次破一串。49 个全破完，会浮现一幅放晴的小画，算一局完成。没有计时、没有失败，慢慢戳、慢慢松。",
  },
  {
    key: "tone", emoji: "⚡", name: "数字舒压格", desc: "按顺序点，弹出小曲", wide: true,
    guide: "格子从 1 开始按顺序点。每个格子是一个音符，点对了会发声并自动进入下一个。引导模式下，下一个该点的格子会微微加深放大，方便跟弹。整首点完会自动回放一遍，可按进度条重播或换下一首。点「引导模式」可关掉提示。",
  },
  {
    key: "scratch", emoji: "🎫", name: "烦恼刮刮乐", desc: "刮开看看，换句温柔话",
    guide: "灰色涂层下面藏着一句安慰话。用手指或鼠标在涂层上划动，被划到的地方会变透明、露出下面的字。擦到一定比例会自动全部显出来，并响起一小段提示音。",
  },
  {
    key: "doodle", emoji: "🎨", name: "涂鸦减压板", desc: "乱涂乱画，不用画得好",
    guide: "一块大画布，10 种颜色，按住鼠标就能画线条。画笔停不下来？松开鼠标就停。没有题目、没有评判，想画什么画什么，画完清空再来一张也行。",
  },
  {
    key: "piano", emoji: "🎹", name: "自由弹琴", desc: "选首曲子，跟着简谱弹", wide: true,
    guide: "8 个白键对应键盘 A S D F G H J K（屏幕上也会标字母和简谱数字）。按下按键就响一个钢琴音。上方可以选一首曲子，会显示对应简谱和每个音该按的键，点「试听」让 AI 弹一遍，然后自己跟着弹。",
  },
];

// AI 陪玩开场白：与冻结版逐字一致（开场自带完整游戏规则）
const AI_GAMES = [
  {
    emoji: "🎭", name: "情绪猜猜猜", desc: "小松一问一答猜你心事",
    q: "我们来玩「情绪猜猜猜」：我心里藏着一件最近让我不舒服的事或一种情绪。请你扮演猜心师，每次只问我一个二选一的小问题（比如“这件事更多跟人有关，还是跟事有关？”），根据我的回答逐步收窄，最多问 5 个问题，然后给出你的猜测：我在烦什么、现在是什么情绪，并用一两句话安慰我。规则：一次只问一个问题，语气轻松像朋友猜心，不要同时给建议。开始吧，先问第一个问题。",
  },
  {
    emoji: "🎬", name: "减压小剧场", desc: "一起走进治愈小场景",
    q: "我们来玩「减压小剧场」：请给我生成一个治愈放松的小情境（山间茶馆、雨夜小屋、海边清晨等，随机选一个），先用两三句描述画面，然后给我 2-3 个选项让我选。我选之后你继续推进剧情，每次 1-2 句描述 + 新选项，玩 5-6 轮后把我带到一个特别放松的结局（比如泡好一壶茶、看完一场日落），结尾用一句话总结这次小旅行。语气温柔、画面感强，每次回复保持短小。开始吧。",
  },
  {
    emoji: "📖", name: "故事接龙", desc: "一人一句编个暖故事",
    q: "我们来玩「故事接龙」：规则是我说一句、你接一句，共建一个温暖治愈的小故事，每人每次只说一句话，一共接 10 轮。你来开个头（设定一个轻松的开场，比如“清晨的古镇，一只橘猫跳上了屋顶”），然后等我接。记住：你每次只说一句，别把故事讲完，把空间留给我。",
  },
  {
    emoji: "🌟", name: "夸夸解忧机", desc: "把烦心事歪解成笑点",
    q: "现在你是「夸夸解忧机」：接下来我说的每一件烦心事，你都用幽默脱口秀的角度帮我「歪解」——找到它好笑、荒诞或可以自嘲的一面，逗我笑，最后再用一句话真诚地夸夸我。每次回复控制在 3 句话以内，语气俏皮但温暖，不讲大道理。准备好了就回我一句开场白，然后等我来吐槽。",
  },
];

export default function MoodGames() {
  const [open, setOpen] = useState<GameKey>(null);
  const current = GAMES.find((g) => g.key === open);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">玩一分钟，给情绪找个出口。没有计时，没有输赢。</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {GAMES.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setOpen(g.key)}
            className="rounded-lg border bg-card/80 p-4 text-center transition-colors hover:border-primary"
          >
            <span className="text-3xl">{g.emoji}</span>
            <p className="mt-2 text-sm font-medium text-ink">{g.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{g.desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-2 rounded-xl border border-jade/25 bg-jade/5 p-4 sm:p-5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="font-brush text-lg font-bold text-ink">AI 陪玩</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              让小松陪你聊一会儿 · 玩法规则它会自己讲
            </p>
          </div>
          <Link href="/assistant" className="shrink-0 text-xs text-jade hover:underline">
            直接对话 →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {AI_GAMES.map((a) => (
            <Link
              key={a.name}
              href={`/assistant?q=${encodeURIComponent(a.q)}`}
              className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-jade/10 text-xl">
                {a.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{a.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{a.desc}</span>
              </span>
              <span className="shrink-0 text-xs text-jade transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          ))}
        </div>
      </div>

      {current && (
        <GameModal title={`${current.emoji} ${current.name}`} guide={current.guide} wide={current.wide} onClose={() => setOpen(null)}>
          {open === "bubble" && <BubbleWrap />}
          {open === "tone" && <ToneGrid />}
          {open === "scratch" && <ScratchCard />}
          {open === "doodle" && <DoodleBoard />}
          {open === "piano" && <Piano />}
        </GameModal>
      )}
    </div>
  );
}

/** 统一游戏弹窗外壳：关闭即卸载内容，游戏内部的定时器 / 音频 / 监听随之清理 */
function GameModal({
  title,
  guide,
  wide,
  onClose,
  children,
}: {
  title: string;
  guide: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [showGuide, setShowGuide] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-xl border bg-card p-5 shadow-xl scrollbar-thin ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
        <div className="mb-3 flex items-start justify-between gap-2 pr-8">
          <h3 className="font-brush text-lg font-bold text-ink">{title}</h3>
          <button
            type="button"
            onClick={() => setShowGuide((s) => !s)}
            className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            玩法
          </button>
        </div>
        {showGuide && (
          <p className="mb-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {guide}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

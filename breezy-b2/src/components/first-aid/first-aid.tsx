"use client";

/**
 * 情绪急救包：焦虑 / 生气 / 低落 / 紧绷 四张入口卡
 * 不求开心，先降一档 · 30 秒起效；AI 树洞直接跳转助手页，其余弹全屏 modal。
 */
import { useState } from "react";
import Link from "next/link";
import { SighGuide } from "./sigh-guide";
import { Shredder } from "./shredder";

type Tool = "sigh" | "shredder" | null;

// AI 树洞开场白：与冻结版逐字一致（先接住情绪，不急着给建议）
const TREE_HOLE_Q = "我现在情绪很差，想找个树洞吐吐槽。先别急着给建议，接住我的情绪听我说就好。";

export default function MoodFirstAid() {
  const [open, setOpen] = useState<Tool>(null);

  return (
    <div className="grid grid-cols-2 gap-3">
      <EntryButton emoji="😮‍💨" mood="焦虑了" name="生理性叹息" onClick={() => setOpen("sigh")} />
      <EntryButton emoji="😤" mood="生气了" name="情绪粉碎机" onClick={() => setOpen("shredder")} />
      <EntryLink
        emoji="🫂"
        mood="低落了"
        name="AI 树洞"
        href={`/assistant?q=${encodeURIComponent(TREE_HOLE_Q)}`}
      />
      <EntryButton emoji="😣" mood="紧绷了" name="生理性叹息" onClick={() => setOpen("sigh")} />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border bg-card p-5 shadow-xl scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="关闭"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              ✕
            </button>
            {open === "sigh" ? (
              <>
                <ModalTitle title="生理性叹息" desc="快速给神经系统降温的小动作" />
                <SighGuide />
              </>
            ) : (
              <>
                <ModalTitle title="情绪粉碎机" desc="把烦恼写下来，看它碎掉、飞走" />
                <Shredder />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryButton({
  emoji,
  mood,
  name,
  onClick,
}: {
  emoji: string;
  mood: string;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border bg-card/80 p-4 text-center transition-colors hover:border-primary"
    >
      <span className="text-3xl">{emoji}</span>
      <p className="mt-2 text-sm font-medium text-ink">{mood}</p>
      <p className="mt-1 text-xs text-muted-foreground">{name}</p>
    </button>
  );
}

function EntryLink({
  emoji,
  mood,
  name,
  href,
}: {
  emoji: string;
  mood: string;
  name: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border bg-card/80 p-4 text-center transition-colors hover:border-primary"
    >
      <span className="text-3xl">{emoji}</span>
      <p className="mt-2 text-sm font-medium text-ink">{mood}</p>
      <p className="mt-1 text-xs text-muted-foreground">{name}</p>
    </Link>
  );
}

function ModalTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-3 pr-8">
      <h3 className="font-brush text-lg font-bold text-ink">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

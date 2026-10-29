"use client";

/**
 * 测评提醒小弹窗：不强制、不挡操作，各自关闭后 24 小时内不再出现
 * 情绪自评与体质问卷共用一张卡片，同一时刻只显示一个（情绪优先），避免叠加打扰
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

const KEY_ASSESS = "sx_assessment_prompt_until";
const KEY_CONST = "sx_constitution_prompt_until";
const DAY = 24 * 60 * 60 * 1000;

const snoozed = (key: string) => {
  const until = Number(localStorage.getItem(key) || 0);
  return Number.isFinite(until) && Date.now() < until;
};

export function AssessmentPrompt({
  show,
  showConstitution,
}: {
  show: boolean;
  showConstitution: boolean;
}) {
  const pathname = usePathname();
  const [kind, setKind] = useState<"assess" | "const" | null>(null);

  useEffect(() => {
    // 已在个人中心（两个测评都在本页）就不弹
    if (pathname === "/profile") {
      setKind(null);
      return;
    }
    if (show && !snoozed(KEY_ASSESS)) setKind("assess");
    else if (showConstitution && !snoozed(KEY_CONST)) setKind("const");
    else setKind(null);
  }, [show, showConstitution, pathname]);

  if (!kind) return null;

  const close = () => {
    localStorage.setItem(
      kind === "assess" ? KEY_ASSESS : KEY_CONST,
      String(Date.now() + DAY),
    );
    setKind(null);
  };

  const isAssess = kind === "assess";

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl border border-primary/30 bg-card p-4 shadow-xl sm:left-auto sm:right-6 sm:w-80">
      <button
        type="button"
        onClick={close}
        aria-label="关闭提醒"
        className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-5 text-sm font-medium text-ink">
        {isAssess ? "🌿 先做一次情绪自评？" : "📋 测一下你的体质？"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {isAssess
          ? "16 题、约 2 分钟。做完后，AI 能结合你的情绪状态给出更贴合的饮食、作息和调理建议。"
          : "官方标准问卷，60 题、约 5 分钟。AI 会结合体质调整饮食和调养建议的侧重。已经知道自己体质的话，到档案里直接选就行。"}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        不做也能正常使用，只是建议会更通用，饮食、穿衣等个性化程度会低一些。
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={isAssess ? "/profile#assessment" : "/profile"}
          onClick={close}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {isAssess ? "去做情绪自评" : "去测体质"}
        </Link>
        <button
          type="button"
          onClick={close}
          className="text-xs text-muted-foreground transition-colors hover:text-ink"
        >
          暂时跳过
        </button>
      </div>
    </div>
  );
}

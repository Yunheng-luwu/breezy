"use client";

/**
 * 中医体质自评问卷（CCMQ，60 题）
 * 弹窗式逐题作答，答完自动跳转；结果一键写入健康档案
 * 已知体质的用户可直接在档案下拉框选择，无需做问卷
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ITEMS, OPTIONS, scoreAll, mainResult, type ScaleResult } from "@/lib/constitution-scale";
import { saveConstitutionAction } from "@/lib/actions";

type Phase = "intro" | "quiz" | "result";

export function ConstitutionTest({ current }: { current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [results, setResults] = useState<ScaleResult[] | null>(null);
  const [main, setMain] = useState("");
  const [pending, start] = useTransition();

  const reset = () => {
    setPhase("intro");
    setIdx(0);
    setAnswers([]);
    setResults(null);
    setMain("");
  };

  const answer = (v: number) => {
    const next = [...answers];
    next[idx] = v;
    setAnswers(next);
    if (idx + 1 < ITEMS.length) {
      setIdx(idx + 1);
    } else {
      const r = scoreAll(next);
      setResults(r);
      setMain(mainResult(r));
      setPhase("result");
    }
  };

  const save = () => {
    start(async () => {
      await saveConstitutionAction(main);
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary transition hover:underline"
      >
        {current ? "重新测评" : "📋 不确定？做标准问卷测评（60 题 · 约 5 分钟）"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="font-brush text-xl text-ink">中医体质自评问卷</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {phase === "intro" && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  依据国家标准《中医体质分类与判定》（GB/T 46939-2025），共 60
                  题，按近一年的身体感受作答。结果供日常调养参考，不构成医疗诊断。
                </p>
                <p className="text-sm text-muted-foreground">
                  已经知道自己体质的，不用做题——直接在档案下拉框里选即可。
                </p>
                <button
                  type="button"
                  onClick={() => setPhase("quiz")}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                >
                  开始测评
                </button>
              </div>
            )}

            {phase === "quiz" && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${((idx + 1) / ITEMS.length) * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {idx + 1} / {ITEMS.length}
                  </span>
                </div>
                <p className="min-h-12 text-base font-medium leading-relaxed text-ink">
                  {ITEMS[idx].t}
                </p>
                <div className="grid gap-2">
                  {OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => answer(o.value)}
                      className={`rounded-lg border px-4 py-2.5 text-left text-sm transition hover:border-primary hover:bg-primary/5 ${
                        answers[idx] === o.value
                          ? "border-primary bg-primary/10"
                          : "border-border"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => setIdx(idx - 1)}
                    className="text-xs text-muted-foreground transition hover:text-ink"
                  >
                    ← 上一题
                  </button>
                )}
              </div>
            )}

            {phase === "result" && results && (
              <div className="space-y-4">
                <div className="rounded-xl bg-primary/10 p-4 text-center">
                  <p className="text-xs text-muted-foreground">你的体质自评结果</p>
                  <p className="mt-1 font-brush text-3xl font-bold text-primary">{main}</p>
                </div>
                <div className="space-y-2">
                  {results.map((r) => (
                    <div key={r.key} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 text-muted-foreground">{r.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            r.verdict === "是"
                              ? "bg-primary"
                              : r.verdict === "倾向是"
                                ? "bg-primary/50"
                                : "bg-muted-foreground/30"
                          }`}
                          style={{ width: `${r.score}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-muted-foreground">
                        {r.score} 分{r.verdict !== "否" ? ` · ${r.verdict}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  转化分 ≥40 判定为「是」，30~39 为「倾向是」。本结果为自评参考，不构成诊断。
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={save}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {pending ? "保存中…" : "保存到我的档案"}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-lg border px-4 py-2.5 text-sm text-muted-foreground transition hover:text-ink"
                  >
                    重新测
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

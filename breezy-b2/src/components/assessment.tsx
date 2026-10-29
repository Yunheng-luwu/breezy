"use client";

/**
 * 情绪自评：PHQ-9（抑郁）+ GAD-7（焦虑）两个国际通用自评量表
 * 题干与 0-3 计分、分级阈值均按量表原始规则
 * 结果只作自我了解参考，不构成诊断，不做任何中医证型判定
 */
import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { saveAssessmentAction } from "@/lib/actions";

const SCALE_HINT = "回想过去两周，以下问题困扰你的频率：";

const PHQ9 = [
  "做事时提不起劲或没有兴趣",
  "感到心情低落、沮丧或绝望",
  "入睡困难、睡不安稳或睡得过多",
  "感觉疲倦或没有活力",
  "食欲不振或吃得过多",
  "觉得自己很糟，或觉得自己很失败，让自己或家人失望",
  "对事物专注有困难，例如阅读或看电视时",
  "动作或说话速度缓慢到别人已经察觉，或正好相反——烦躁、坐立不安、动来动去",
  "有不如死掉或用某种方式伤害自己的念头",
];

const GAD7 = [
  "感到紧张、焦虑或急切",
  "不能停止或控制担忧",
  "对各种各样的事情担忧过多",
  "很难放松下来",
  "由于不安而无法静坐",
  "变得容易烦恼或急躁",
  "感到似乎将有可怕的事情发生而害怕",
];

const QUESTIONS = [
  ...PHQ9.map((q) => ({ q, scale: "PHQ-9" as const })),
  ...GAD7.map((q) => ({ q, scale: "GAD-7" as const })),
];

const OPTIONS = [
  { label: "完全没有", value: 0 },
  { label: "有几天", value: 1 },
  { label: "一半以上天数", value: 2 },
  { label: "几乎每天", value: 3 },
];

/** PHQ-9 分级（原始量表阈值） */
function phqBand(s: number) {
  if (s <= 4) return { level: "无明显困扰", tone: "text-jade", ring: "hsl(var(--jade))" };
  if (s <= 9) return { level: "轻度", tone: "text-primary", ring: "hsl(var(--primary))" };
  if (s <= 14) return { level: "中度", tone: "text-primary", ring: "hsl(var(--primary))" };
  if (s <= 19) return { level: "中重度", tone: "text-cinnabar", ring: "hsl(var(--cinnabar))" };
  return { level: "重度", tone: "text-cinnabar", ring: "hsl(var(--cinnabar))" };
}

/** GAD-7 分级（原始量表阈值） */
function gadBand(s: number) {
  if (s <= 4) return { level: "无明显困扰", tone: "text-jade", ring: "hsl(var(--jade))" };
  if (s <= 9) return { level: "轻度", tone: "text-primary", ring: "hsl(var(--primary))" };
  if (s <= 14) return { level: "中度", tone: "text-primary", ring: "hsl(var(--primary))" };
  return { level: "重度", tone: "text-cinnabar", ring: "hsl(var(--cinnabar))" };
}

/** 综合自评（取两个量表中较重的一档，仅作描述） */
function overallLevel(phq: number, gad: number) {
  if (phq <= 4 && gad <= 4) return "情绪状态平稳";
  if (phq <= 9 && gad <= 9) return "轻度情绪困扰";
  if (phq <= 14 && gad <= 14) return "中度情绪困扰";
  return "偏重的情绪困扰";
}

export function Assessment() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    phq: number;
    gad: number;
    index: number;
    level: string;
    critical: boolean;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(value: number) {
    const next = answers.slice(0, step);
    next[step] = value;
    setAnswers(next);
    if (step === QUESTIONS.length - 1) {
      const phq = next.slice(0, PHQ9.length).reduce((s, v) => s + v, 0);
      const gad = next.slice(PHQ9.length).reduce((s, v) => s + v, 0);
      // 折算成 0-100 便于和此前档案字段兼容（PHQ-9 权重 60%、GAD-7 40%）
      const index = Math.round(((phq / 27) * 0.6 + (gad / 21) * 0.4) * 100);
      setResult({
        phq,
        gad,
        index,
        level: overallLevel(phq, gad),
        critical: next[PHQ9.length - 1] > 0,
      });
    } else {
      setStep(step + 1);
    }
  }

  function reset() {
    setStep(0);
    setAnswers([]);
    setResult(null);
    setSaved(false);
  }

  function save() {
    if (!result) return;
    startTransition(async () => {
      await saveAssessmentAction(result.index, result.level);
      setSaved(true);
    });
  }

  if (result) {
    const p = phqBand(result.phq);
    const g = gadBand(result.gad);
    return (
      <Card>
        <CardContent className="space-y-4 pt-6 text-center">
          <div className="flex flex-wrap items-start justify-center gap-6">
            {[
              { label: "PHQ-9 情绪低落自评", score: result.phq, max: 27, band: p },
              { label: "GAD-7 紧张焦虑自评", score: result.gad, max: 21, band: g },
            ].map((it) => (
              <div key={it.label} className="w-36">
                <div
                  className="mx-auto flex h-28 w-28 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(${it.band.ring} ${
                      (it.score / it.max) * 100
                    }%, hsl(var(--muted)) 0)`,
                  }}
                >
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-card">
                    <span className="text-2xl font-bold text-ink">{it.score}</span>
                    <span className="text-[10px] text-muted-foreground">/ {it.max}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{it.label}</p>
                <p className={`text-sm font-medium ${it.band.tone}`}>{it.band.level}</p>
              </div>
            ))}
          </div>

          <p className="font-brush text-xl font-bold text-ink">{result.level}</p>

          {result.critical && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-left">
              <p className="text-sm font-semibold text-destructive">
                请优先照顾自己的安全
              </p>
              <p className="mt-1 text-xs leading-relaxed text-destructive/80">
                你在最后一道题里提到了伤害自己的念头。请立刻联系身边信任的人陪着，
                或拨打全国心理援助热线 <b>12356</b>；如果此刻有立即危险，请拨 <b>120</b> 或前往急诊。
              </p>
            </div>
          )}

          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            PHQ-9 与 GAD-7 是国际通用的自评量表，反映近两周主观感受，
            仅作自我了解与调节参考，不能替代医生诊断；分数偏高不等于患病，请以专业评估为准。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending || saved}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saved ? "已保存" : pending ? "保存中…" : "保存自评结果"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              重新自评
            </button>
          </div>
          {saved && <p className="text-xs text-jade">自评结果已写入个人档案</p>}
        </CardContent>
      </Card>
    );
  }

  const current = QUESTIONS[step];

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {current.scale} · 第 {step + 1} / {QUESTIONS.length} 题
          </span>
          <span>{SCALE_HINT}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(step / QUESTIONS.length) * 100}%` }}
          />
        </div>
        <p className="text-base font-medium text-ink">{current.q}</p>
        {step === PHQ9.length - 1 && (
          <p className="text-xs text-muted-foreground">
            这道题涉及安全，你的回答只用于给出求助提示，不会用来评判你。
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-4">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              className="rounded-lg border bg-card px-3 py-3 text-sm transition-colors hover:border-primary hover:bg-accent/50"
            >
              {o.label}
            </button>
          ))}
        </div>
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            ← 上一题
          </button>
        )}
      </CardContent>
    </Card>
  );
}

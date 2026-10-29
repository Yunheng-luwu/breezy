/**
 * 知识库检索层（对应冻结版 server/services/knowledge.js）
 * 数据源：public/knowledge/*.json（中医知识库，由《知识库.docx》结构化生成）
 * 供 Agent 只读工具使用
 */
import acupointsJson from "@/../public/knowledge/acupoints.json";
import dietJson from "@/../public/knowledge/diet.json";
import medicinesJson from "@/../public/knowledge/medicines.json";
import formulasJson from "@/../public/knowledge/formulas.json";
import practicesJson from "@/../public/knowledge/practices.json";
import constitutionJson from "@/../public/knowledge/constitution_symptoms.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;

export interface AcupointRow extends AnyRecord {
  id: number;
  name: string;
  categories: string[];
}

export const acupoints: AcupointRow[] = (
  acupointsJson as unknown as AnyRecord[]
).map((a, i) => ({ id: i + 1, ...a }) as AcupointRow);

const dietKb = dietJson as AnyRecord;
const medicines = medicinesJson as AnyRecord[];
const formulas = formulasJson as AnyRecord[];
const practicesKb = practicesJson as AnyRecord;
const constitutionSymptoms = constitutionJson as AnyRecord;

/** 取首句，超长截断 */
export function firstSentence(text: unknown, max = 40): string {
  const t = String(text ?? "").replace(/\s+/g, "");
  const cut = t.split(/[。；]/)[0] || t;
  return cut.length > max ? cut.slice(0, max) : cut;
}

// ---------- 穴位 ----------
export function listAcupoints(category: string): AcupointRow[] {
  return acupoints.filter((a) => a.categories.includes(category));
}

export function getAcupoint(id: number): AcupointRow | null {
  return acupoints.find((a) => a.id === id) ?? null;
}

// ---------- 泡脚 ----------
const FOOTBATH_KEYWORDS: Record<string, string[]> = {
  玫瑰疏肝方: ["疏肝", "生气", "压力", "胸闷", "情绪", "郁", "焦虑", "烦躁", "胁胀", "叹气"],
  艾叶暖身方: ["手脚冰凉", "怕冷", "暖身", "寒湿", "关节", "体寒", "发凉", "暖脚"],
  合欢安神方: ["失眠", "睡不好", "安神", "多梦", "入睡", "解郁", "睡眠"],
  生姜驱寒方: ["寒气", "怕冷", "感冒", "受凉", "驱寒", "手脚凉", "淋雨"],
  陈皮理气方: ["胀气", "湿气", "痰", "健脾", "理气", "消化", "腹胀", "积食"],
};

export function matchFootbath(status: string): AnyRecord | null {
  const text = String(status ?? "");
  const list: AnyRecord[] = dietKb.footbaths ?? [];
  let best: AnyRecord | null = null;
  let bestScore = 0;
  for (const r of list) {
    const kws = FOOTBATH_KEYWORDS[r.name] ?? [];
    let score = 0;
    kws.forEach((k) => {
      if (text.includes(k)) score += 1;
    });
    if (r.effect && text) {
      String(r.effect)
        .slice(0, 30)
        .split(/[、，。]/)
        .forEach((w) => {
          if (w.length >= 2 && text.includes(w)) score += 0.5;
        });
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best ?? list.find((r) => r.name === "玫瑰疏肝方") ?? list[0] ?? null;
}

// ---------- 药膳食疗 ----------
export function getDietTherapy(type: string): AnyRecord[] | null {
  const map: Record<string, string> = {
    tea: "teas",
    porridge: "porridges",
    dish: "dishes",
    soup: "soups",
  };
  const key = map[type];
  return key ? (dietKb[key] ?? null) : null;
}

// ---------- 方剂 ----------
export function findFormula(keyword: string): AnyRecord | null {
  const kw = String(keyword ?? "").trim();
  if (!kw) return null;
  return (
    formulas.find((f) => f.name.includes(kw) || kw.includes(f.name)) ??
    formulas.find((f) =>
      [f.effect, f.syndrome, f.ingredients].some((x) => String(x ?? "").includes(kw)),
    ) ??
    null
  );
}

export function listFormulaNames(): string[] {
  return formulas.map((f) => f.name);
}

// ---------- 中成药 ----------
export function findMedicine(keyword: string): AnyRecord | null {
  const kw = String(keyword ?? "").trim();
  if (!kw) return null;
  return (
    medicines.find((m) => m.name.includes(kw) || kw.includes(m.name)) ??
    medicines.find((m) =>
      [m.effect, m.syndrome, m.ingredients].some((f) => String(f ?? "").includes(kw)),
    ) ??
    null
  );
}

export function listMedicineNames(): string[] {
  return medicines.map((m) => m.name);
}

// ---------- 功法 ----------
function parseMoveSecs(text: string): number {
  const t = String(text ?? "");
  const m = t.match(/(\d+)\s*分(?:\s*(\d+)\s*秒)?/);
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  const onlySec = t.match(/(\d+)\s*秒/);
  return onlySec ? Number(onlySec[1]) : 30;
}

export interface PracticeMove {
  id: number;
  name: string;
  duration: string;
  secs: number;
  breath?: string;
  steps?: string;
  mistakes?: string;
  effect?: string;
  cautions?: string;
}

export function getPracticeMoves(): PracticeMove[] {
  const list: AnyRecord[] = practicesKb.baduanjin ?? [];
  return list.map((m, i) => ({
    id: i + 1,
    name: m.name,
    duration: m.duration,
    secs: parseMoveSecs(m.duration),
    breath: m.breath,
    steps: m.steps,
    mistakes: m.mistakes,
    effect: m.effect,
    cautions: m.cautions,
  }));
}

export function getPracticeDetail(name: string): AnyRecord | null {
  const kw = String(name ?? "");
  if (kw.includes("呼吸") || kw.includes("478") || kw.includes("4-7-8")) {
    return { name: "478 呼吸法", ...(practicesKb.breathing_478 ?? {}) };
  }
  const list: AnyRecord[] = practicesKb.baduanjin ?? [];
  return list.find((m) => m.name.includes(kw) || kw.includes(String(m.name).replace(/[左右]/g, ""))) ?? null;
}

// ---------- 体质与症状 ----------
export function getConstitution(): AnyRecord | null {
  return constitutionSymptoms.constitutions?.[0] ?? null;
}

const SYMPTOM_ALIASES: Record<string, string> = {
  梅核气: "咽喉异物感",
  咽异物: "咽喉异物感",
  嗓子: "咽喉异物感",
  喉咙: "咽喉异物感",
  睡不着: "失眠多梦",
  睡不好: "失眠多梦",
  睡眠: "失眠多梦",
  脖子: "肩颈僵硬",
  颈椎: "肩颈僵硬",
  肩膀: "肩颈僵硬",
  发火: "易怒",
  脾气: "易怒",
  烦躁: "易怒",
  胸胀: "胸闷",
  气短: "胸闷",
  胁痛: "两胁胀痛",
  肋骨: "两胁胀痛",
  眩晕: "头晕",
  头疼: "头晕",
};

export function findSymptom(name: string): AnyRecord | null {
  const kw = String(name ?? "").trim();
  if (!kw) return null;
  const list: AnyRecord[] = constitutionSymptoms.symptoms ?? [];
  const direct = list.find((s) => s.name.includes(kw) || kw.includes(s.name));
  if (direct) return direct;
  for (const [alias, target] of Object.entries(SYMPTOM_ALIASES)) {
    if (kw.includes(alias)) return list.find((s) => s.name === target) ?? null;
  }
  return list.find((s) => String(s.syndromes + s.manifestation).includes(kw)) ?? null;
}

export function listSymptomNames(): string[] {
  return (constitutionSymptoms.symptoms ?? []).map((s: AnyRecord) => s.name);
}

/** 原始 diet 知识库（含 footbaths） */
export const rawDietKb = dietKb;

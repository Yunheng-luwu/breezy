/**
 * 节气食方库（对应冻结版 server/services/solarTermFood.js + acuRecommend.js 的节气表）
 * 数据来自 public/knowledge/term-foods.json（24 节气，每节气 3 道时令食方）
 */
import termFoodsJson from "@/../public/knowledge/term-foods.json";

export interface TermFood {
  name: string;
  emoji: string;
  tag: string;
  effect: string;
  ingredients: string;
  method: string;
}

export interface TermInfo {
  name: string;
  theme: string;
  principle: string;
  foods: TermFood[];
}

const TERM_FOODS = termFoodsJson as Record<
  string,
  { theme: string; principle: string; foods: TermFood[] }
>;

// 24 节气近似日期表（与冻结版 acuRecommend.SOLAR_TERMS 一致）
const SOLAR_TERMS: Array<{ m: number; d: number; name: string }> = [
  { m: 1, d: 5, name: "小寒" },
  { m: 1, d: 20, name: "大寒" },
  { m: 2, d: 4, name: "立春" },
  { m: 2, d: 19, name: "雨水" },
  { m: 3, d: 5, name: "惊蛰" },
  { m: 3, d: 20, name: "春分" },
  { m: 4, d: 5, name: "清明" },
  { m: 4, d: 20, name: "谷雨" },
  { m: 5, d: 5, name: "立夏" },
  { m: 5, d: 21, name: "小满" },
  { m: 6, d: 5, name: "芒种" },
  { m: 6, d: 21, name: "夏至" },
  { m: 7, d: 7, name: "小暑" },
  { m: 7, d: 22, name: "大暑" },
  { m: 8, d: 7, name: "立秋" },
  { m: 8, d: 23, name: "处暑" },
  { m: 9, d: 7, name: "白露" },
  { m: 9, d: 23, name: "秋分" },
  { m: 10, d: 8, name: "寒露" },
  { m: 10, d: 23, name: "霜降" },
  { m: 11, d: 7, name: "立冬" },
  { m: 11, d: 22, name: "小雪" },
  { m: 12, d: 7, name: "大雪" },
  { m: 12, d: 21, name: "冬至" },
];

/** 当前节气（12 月底早于小寒时回落到冬至） */
export function getSolarTerm(now = new Date()): string {
  const mo = now.getMonth() + 1;
  const da = now.getDate();
  let cur = SOLAR_TERMS[SOLAR_TERMS.length - 1];
  for (const t of SOLAR_TERMS) {
    if (mo > t.m || (mo === t.m && da >= t.d)) cur = t;
  }
  return cur.name;
}

/** 当前节气的食方信息；缺数据时返回 null */
export function getTermFood(now = new Date()): TermInfo | null {
  const name = getSolarTerm(now);
  const t = TERM_FOODS[name];
  if (!t) return null;
  return { name, theme: t.theme, principle: t.principle, foods: t.foods };
}

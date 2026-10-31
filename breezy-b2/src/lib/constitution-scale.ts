/**
 * 中医体质自评量表（依据国家标准《中医体质分类与判定》GB/T 46939-2025，
 * 2026-04-01 实施；附录 A 共 27 条，九种体质条目数：平和 4、气虚 3、阳虚 3、
 * 阴虚 3、痰湿 3、湿热 3、血瘀 3、气郁 3、特禀 4）
 * 五点计分（没有1/很少2/有时3/经常4/总是5），标 * 条目先逆向计分（1↔5、2↔4、3不变）
 * 判定：转化分 = [(原始分 − 条目数) / (条目数 × 4)] × 100
 *   平和质：≥60 且其余八种均 <30 判「是」，≥60 且其余八种均 <40 判「基本是」
 *   偏颇质：≥40 判「是」，30~39 判「倾向是」，<30 判「否」
 * 仅作日常调养参考，不构成医疗诊断
 */

export type ScaleKey = "ph" | "qx" | "yx" | "yin" | "ts" | "sr" | "xy" | "qy" | "tb";

export const SCALE_NAMES: Record<ScaleKey, string> = {
  ph: "平和质",
  qx: "气虚质",
  yx: "阳虚质",
  yin: "阴虚质",
  ts: "痰湿质",
  sr: "湿热质",
  xy: "血瘀质",
  qy: "气郁质",
  tb: "特禀质",
};

export const SCALE_ORDER: ScaleKey[] = ["ph", "qx", "yx", "yin", "ts", "sr", "xy", "qy", "tb"];

/** 各体质条目数（GB/T 46939-2025 附录 A 规定；湿热质第 3 条按性别二选一作答） */
export const SCALE_COUNT: Record<ScaleKey, number> = {
  ph: 4, qx: 3, yx: 3, yin: 3, ts: 3, sr: 3, xy: 3, qy: 3, tb: 4,
};

export const OPTIONS = [
  { label: "没有", value: 1 },
  { label: "很少", value: 2 },
  { label: "有时", value: 3 },
  { label: "经常", value: 4 },
  { label: "总是", value: 5 },
];

/** 每题归属的体质分量表；1=正向计分，-1=反向计分（标 * 条目） */
export interface ScaleItem {
  t: string;
  s: Partial<Record<ScaleKey, 1 | -1>>;
  /** 性别专属条目：湿热质第 3 条，女性问带下、男性问阴囊潮湿 */
  sex?: "f" | "m";
}

/** GB/T 46939-2025 附录 A：27 条（含性别专属 1 条，实际作答 26 条） */
export const ITEMS: ScaleItem[] = [
  // 平和质 4 条（后 3 条同时计反向分）
  { t: "您精力充沛吗？", s: { ph: 1 } },
  { t: "您容易疲乏吗？*", s: { qx: 1, ph: -1 } },
  { t: "您感到闷闷不乐、情绪低沉吗？*", s: { qy: 1, ph: -1 } },
  { t: "您比一般人耐受不了寒冷（冬天的寒冷，夏天的冷空调、电扇等）吗？*", s: { yx: 1, ph: -1 } },
  // 气虚质
  { t: "您容易气短（呼吸短促，接不上气）吗？", s: { qx: 1 } },
  { t: "您容易心慌吗？", s: { qx: 1 } },
  // 阳虚质
  { t: "您胃脘部、背部或腰膝部怕冷吗？", s: { yx: 1 } },
  { t: "您感到怕冷、衣服比别人穿得多吗？", s: { yx: 1 } },
  // 阴虚质
  { t: "您感觉身体、脸上发热吗？", s: { yin: 1 } },
  { t: "您皮肤或口唇干吗？", s: { yin: 1 } },
  { t: "您面部两颧潮红或偏红吗？", s: { yin: 1 } },
  // 痰湿质
  { t: "您感到身体沉重不轻松或不爽快吗？", s: { ts: 1 } },
  { t: "您腹部肥满松软吗？", s: { ts: 1 } },
  { t: "您嘴里有黏黏的感觉吗？", s: { ts: 1 } },
  // 湿热质（第 3 条按性别二选一）
  { t: "您面部或鼻部有油腻感或者油亮发光吗？", s: { sr: 1 } },
  { t: "您小便时尿道有发热感、尿色浓（深）吗？", s: { sr: 1 } },
  { t: "您带下色黄（白带颜色发黄）吗？", s: { sr: 1 }, sex: "f" },
  { t: "您的阴囊部位潮湿吗？", s: { sr: 1 }, sex: "m" },
  // 血瘀质
  { t: "您身体上有哪里疼痛吗？", s: { xy: 1 } },
  { t: "您面色晦暗或容易出现褐斑吗？", s: { xy: 1 } },
  { t: "您口唇颜色偏暗吗？", s: { xy: 1 } },
  // 气郁质
  { t: "您容易精神紧张、焦虑不安吗？", s: { qy: 1 } },
  { t: "您多愁善感、感情脆弱吗？", s: { qy: 1 } },
  // 特禀质 4 条
  { t: "您没有感冒时也会打喷嚏吗？", s: { tb: 1 } },
  { t: "您容易过敏（对药物、食物、气味、花粉，或在季节交替、气候变化时）吗？", s: { tb: 1 } },
  { t: "您的皮肤容易起荨麻疹（风团、风疹块、风疙瘩）吗？", s: { tb: 1 } },
  { t: "您的皮肤一抓就红，并出现抓痕吗？", s: { tb: 1 } },
];

/** 按性别筛出实际作答的 26 条（未选性别时返回全部 27 条） */
export function itemsFor(sex: "f" | "m" | null): ScaleItem[] {
  if (!sex) return ITEMS;
  return ITEMS.filter((it) => !it.sex || it.sex === sex);
}

export type Verdict = "是" | "基本是" | "倾向是" | "否";

export interface ScaleResult {
  key: ScaleKey;
  name: string;
  /** 转化分 0-100 */
  score: number;
  /** 判定：是 / 基本是（仅平和质） / 倾向是 / 否 */
  verdict: Verdict;
}

/** 计分：原始分 → 转化分；items 为本次实际作答的条目 */
export function scoreAll(answers: number[], items: ScaleItem[] = ITEMS): ScaleResult[] {
  const sums: Record<ScaleKey, number> = { ph: 0, qx: 0, yx: 0, yin: 0, ts: 0, sr: 0, xy: 0, qy: 0, tb: 0 };
  const counts: Record<ScaleKey, number> = { ph: 0, qx: 0, yx: 0, yin: 0, ts: 0, sr: 0, xy: 0, qy: 0, tb: 0 };
  items.forEach((item, i) => {
    const v = answers[i] ?? 1;
    for (const [k, dir] of Object.entries(item.s)) {
      const key = k as ScaleKey;
      sums[key] += dir === -1 ? 6 - v : v;
      counts[key] += 1;
    }
  });
  const raw = SCALE_ORDER.map((key) => {
    const n = counts[key] || SCALE_COUNT[key];
    return {
      key,
      name: SCALE_NAMES[key],
      score: Math.round(((sums[key] - n) / (n * 4)) * 100),
    };
  });
  const others = raw.filter((r) => r.key !== "ph");
  const allBelow40 = others.every((r) => r.score < 40);
  const allBelow30 = others.every((r) => r.score < 30);
  return raw.map((r) => {
    let verdict: Verdict = "否";
    if (r.key === "ph") {
      if (r.score >= 60 && allBelow30) verdict = "是";
      else if (r.score >= 60 && allBelow40) verdict = "基本是";
    } else {
      if (r.score >= 40) verdict = "是";
      else if (r.score >= 30) verdict = "倾向是";
    }
    return { ...r, verdict };
  });
}

/** 主结论文案：平和质是 / 基本是 → 平和质；否则取转化分最高的偏颇体质 */
export function mainResult(results: ScaleResult[]): string {
  const ph = results.find((r) => r.key === "ph")!;
  if (ph.verdict === "是" || ph.verdict === "基本是") return "平和质";
  const sorted = results
    .filter((r) => r.key !== "ph")
    .sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (top.verdict === "是") return top.name;
  if (top.verdict === "倾向是") return `倾向${top.name}`;
  return "平和质";
}

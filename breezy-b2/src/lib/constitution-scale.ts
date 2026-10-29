/**
 * 中医体质自评量表（依据国家标准《中医体质分类与判定》GB/T 46939-2025，
 * 2026-04-01 实施，沿用原中华中医药学会 ZYYXH/T157-2009 的九分法与计分规则）
 * 60 题，五点计分（没有1/很少2/有时3/经常4/总是5），九种体质转化分判定
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

/** 各体质条目数（判定标准规定） */
export const SCALE_COUNT: Record<ScaleKey, number> = {
  ph: 8, qx: 8, yx: 7, yin: 8, ts: 8, sr: 6, xy: 7, qy: 7, tb: 7,
};

export const OPTIONS = [
  { label: "没有", value: 1 },
  { label: "很少", value: 2 },
  { label: "有时", value: 3 },
  { label: "经常", value: 4 },
  { label: "总是", value: 5 },
];

/** 每题归属的体质分量表；1=正向计分，-1=反向计分 */
export interface ScaleItem {
  t: string;
  s: Partial<Record<ScaleKey, 1 | -1>>;
}

export const ITEMS: ScaleItem[] = [
  { t: "您精力充沛吗？", s: { ph: 1 } },
  { t: "您能适应外界自然和社会环境的变化吗？", s: { ph: 1 } },
  { t: "您容易疲乏吗？", s: { qx: 1, ph: -1 } },
  { t: "您容易气短（呼吸短促，接不上气）吗？", s: { qx: 1 } },
  { t: "您容易心慌吗？", s: { qx: 1 } },
  { t: "您容易头晕或站起时眩晕吗？", s: { qx: 1 } },
  { t: "您比别人容易患感冒吗？", s: { qx: 1, yx: 1 } },
  { t: "您喜欢安静、懒得说话吗？", s: { qx: 1 } },
  { t: "您说话声音低弱无力吗？", s: { qx: 1, ph: -1 } },
  { t: "您活动量稍大就容易出虚汗吗？", s: { qx: 1 } },
  { t: "您手脚发凉吗？", s: { yx: 1 } },
  { t: "您胃脘部、背部或腰膝部怕冷吗？", s: { yx: 1 } },
  { t: "您感到怕冷、衣服比别人穿得多吗？", s: { yx: 1 } },
  { t: "您比一般人耐受不了寒冷（冬天的寒冷、夏天的冷空调、电扇等）吗？", s: { yx: 1, ph: -1 } },
  { t: "您吃（喝）凉的东西会感到不舒服，或者怕吃（喝）凉的东西吗？", s: { yx: 1 } },
  { t: "您受凉或吃（喝）凉的东西后，容易腹泻（拉肚子）吗？", s: { yx: 1 } },
  { t: "您感到手脚心发热吗？", s: { yin: 1 } },
  { t: "您感觉身体、脸上发热吗？", s: { yin: 1 } },
  { t: "您皮肤或口唇干吗？", s: { yin: 1 } },
  { t: "您口唇的颜色比一般人红吗？", s: { yin: 1 } },
  { t: "您容易便秘或大便干燥吗？", s: { yin: 1 } },
  { t: "您面部两颧潮红或偏红吗？", s: { yin: 1 } },
  { t: "您感到眼睛干涩吗？", s: { yin: 1 } },
  { t: "您感到口干咽燥、总想喝水吗？", s: { yin: 1 } },
  { t: "您感到胸闷或腹部胀满吗？", s: { ts: 1 } },
  { t: "您感到身体沉重、不轻松或不爽快吗？", s: { ts: 1 } },
  { t: "您腹部肥满松软吗？", s: { ts: 1 } },
  { t: "您有额部油脂分泌多的现象吗？", s: { ts: 1 } },
  { t: "您上眼睑比别人肿（上眼睑轻微隆起）吗？", s: { ts: 1 } },
  { t: "您嘴里有黏黏的感觉吗？", s: { ts: 1 } },
  { t: "您平时痰多，特别是咽喉部总感到有痰堵着吗？", s: { ts: 1 } },
  { t: "您舌苔厚腻，或有舌苔厚厚的感觉吗？", s: { ts: 1 } },
  { t: "您面部或鼻部有油腻感，或者油亮发光吗？", s: { sr: 1 } },
  { t: "您容易生痤疮或疮疖吗？", s: { sr: 1 } },
  { t: "您感到口苦或嘴里有异味吗？", s: { sr: 1 } },
  { t: "您大便黏滞不爽、有解不尽的感觉吗？", s: { sr: 1 } },
  { t: "您小便时尿道有发热感、尿色浓（深）吗？", s: { sr: 1 } },
  { t: "您带下色黄（女性），或阴囊部位潮湿（男性）吗？", s: { sr: 1 } },
  { t: "您的皮肤在不知不觉中会出现青紫瘀斑（皮下出血）吗？", s: { xy: 1 } },
  { t: "您两颧部有细微红丝吗？", s: { xy: 1 } },
  { t: "您身体上有哪里疼痛吗？", s: { xy: 1 } },
  { t: "您面色晦暗或容易出现褐斑吗？", s: { xy: 1 } },
  { t: "您容易有黑眼圈吗？", s: { xy: 1 } },
  { t: "您容易忘事（健忘）吗？", s: { xy: 1, ph: -1 } },
  { t: "您口唇颜色偏黯吗？", s: { xy: 1 } },
  { t: "您感到闷闷不乐、情绪低沉吗？", s: { qy: 1, ph: -1 } },
  { t: "您容易精神紧张、焦虑不安吗？", s: { qy: 1 } },
  { t: "您多愁善感、感情脆弱吗？", s: { qy: 1 } },
  { t: "您容易感到害怕或受到惊吓吗？", s: { qy: 1 } },
  { t: "您胁肋部或乳房胀痛吗？", s: { qy: 1 } },
  { t: "您无缘无故叹气吗？", s: { qy: 1 } },
  { t: "您咽喉部有异物感，且吐之不出、咽之不下吗？", s: { qy: 1 } },
  { t: "您没有感冒时也会打喷嚏吗？", s: { tb: 1 } },
  { t: "您没有感冒时也会鼻塞、流鼻涕吗？", s: { tb: 1 } },
  { t: "您有因季节变化、温度变化或异味等原因而咳喘的现象吗？", s: { tb: 1 } },
  { t: "您容易过敏（对药物、食物、气味、花粉，或在季节交替、气候变化时）吗？", s: { tb: 1 } },
  { t: "您的皮肤容易起荨麻疹（风团、风疹块、风疙瘩）吗？", s: { tb: 1 } },
  { t: "您的皮肤因过敏出现过紫癜（紫红色瘀点、瘀斑）吗？", s: { tb: 1 } },
  { t: "您的皮肤一抓就红，并出现抓痕吗？", s: { tb: 1 } },
  { t: "您容易失眠吗？", s: { ph: -1 } },
];

export interface ScaleResult {
  key: ScaleKey;
  name: string;
  /** 转化分 0-100 */
  score: number;
  /** 判定：是 / 倾向是 / 否（平和质单独判定逻辑） */
  verdict: "是" | "倾向是" | "否";
}

/** 计分：原始分 → 转化分 = (原始分 − 条目数) / (条目数×4) × 100 */
export function scoreAll(answers: number[]): ScaleResult[] {
  const sums: Record<ScaleKey, number> = { ph: 0, qx: 0, yx: 0, yin: 0, ts: 0, sr: 0, xy: 0, qy: 0, tb: 0 };
  ITEMS.forEach((item, i) => {
    const v = answers[i] ?? 1;
    for (const [k, dir] of Object.entries(item.s)) {
      const key = k as ScaleKey;
      sums[key] += dir === -1 ? 6 - v : v;
    }
  });
  const raw = SCALE_ORDER.map((key) => {
    const n = SCALE_COUNT[key];
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
    let verdict: ScaleResult["verdict"] = "否";
    if (r.key === "ph") {
      if (r.score >= 60 && allBelow40) verdict = "是";
      else if (r.score >= 60 && allBelow30) verdict = "倾向是";
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
  if (ph.verdict === "是" || ph.verdict === "倾向是") return "平和质";
  const sorted = results
    .filter((r) => r.key !== "ph")
    .sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (top.verdict === "是") return top.name;
  if (top.verdict === "倾向是") return `倾向${top.name}`;
  return "平和质";
}

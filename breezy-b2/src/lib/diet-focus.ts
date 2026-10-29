/**
 * 今日饮食侧重：综合情绪自评 / 近期症状 / 档案偏好 + 实时天气与节气给一个明确侧重点
 * 仅作日常食养参考，不做体质辨识或诊断
 */

export interface DietFocusInput {
  score?: number | null;
  symptoms?: string[];
  constitution?: string;
  dietPref?: string;
  bodySense?: string;
  temp?: number | null;
  weatherText?: string;
  term?: string;
}

export interface DietFocus {
  label: string;
  keywords: string[];
  basis: string[];
}

const FOCUS = {
  soothe: {
    label: "疏肝理气",
    keywords: ["玫瑰花", "佛手", "陈皮", "萝卜", "芹菜", "菊花", "山楂"],
  },
  calm: {
    label: "养血安神",
    keywords: ["百合", "莲子", "桂圆", "酸枣仁", "银耳", "红枣", "小米"],
  },
  spleen: {
    label: "健脾和胃",
    keywords: ["山药", "小米", "南瓜", "陈皮", "红枣", "白术", "扁豆"],
  },
  qi: {
    label: "补气养身",
    keywords: ["山药", "黄芪", "党参", "红枣", "小米", "莲子"],
  },
  warm: {
    label: "温阳散寒",
    keywords: ["生姜", "羊肉", "桂圆", "红枣", "胡椒", "当归"],
  },
  cool: {
    label: "清润生津",
    keywords: ["雪梨", "银耳", "莲藕", "白萝卜", "菊花", "绿豆", "百合"],
  },
};

export function buildDietFocus(input: DietFocusInput): DietFocus {
  const s = (input.symptoms ?? []).join(" ");
  const basis: string[] = [];

  if (input.score != null) basis.push(`情绪自评 ${input.score} 分`);
  if (input.symptoms?.length) basis.push(`近期记录 ${input.symptoms.slice(0, 3).join("、")}`);
  if (input.bodySense && input.bodySense !== "正常") basis.push(`体感 ${input.bodySense}`);
  if (input.temp != null)
    basis.push(`本地 ${input.temp}°C${input.weatherText ? ` ${input.weatherText}` : ""}`);
  if (input.term) basis.push(`节气 ${input.term}`);

  // 侧重点优先级：近期症状 → 体感/气温 → 情绪自评 → 自述体质
  let key: keyof typeof FOCUS = "soothe";
  if (/失眠|睡|梦|易醒|早醒/.test(s)) key = "calm";
  else if (/胃|胀|食欲|消化|反酸|便溏|腹泻/.test(s)) key = "spleen";
  else if (/乏力|疲|累|气短|头晕/.test(s)) key = "qi";
  else if (input.bodySense === "怕冷" || (input.temp != null && input.temp <= 10)) key = "warm";
  else if (input.bodySense === "怕热" || (input.temp != null && input.temp >= 28)) key = "cool";
  else if (input.score != null && input.score >= 60) key = "soothe";
  else if (/气郁|湿热/.test(input.constitution ?? "")) key = "soothe";
  else if (/阳虚|气虚/.test(input.constitution ?? "")) key = "warm";

  if (!basis.length) basis.push("未填档案，按通用疏肝食养给建议");

  return { ...FOCUS[key], basis };
}

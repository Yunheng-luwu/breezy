/**
 * 时令/天气联动文案（全站共用同一套规则）
 * 气温按 7 档划分，季节按月份划分，天气按实况关键词判断，
 * 各板块（首页调养 / 穿衣 / 饮食 / 情绪）都从这里取提示，避免各写各的。
 */

export type Season = "春" | "夏" | "秋" | "冬";

export function seasonOf(now = new Date()): Season {
  const m = now.getMonth() + 1;
  if (m >= 3 && m <= 5) return "春";
  if (m >= 6 && m <= 8) return "夏";
  if (m >= 9 && m <= 11) return "秋";
  return "冬";
}

/** 气温档：炎热 / 偏热 / 舒适 / 凉爽 / 微凉 / 偏冷 / 寒冷 */
export function tempBandOf(t: number): string {
  if (Number.isNaN(t)) return "未知";
  if (t >= 30) return "炎热";
  if (t >= 26) return "偏热";
  if (t >= 21) return "舒适";
  if (t >= 16) return "凉爽";
  if (t >= 11) return "微凉";
  if (t >= 6) return "偏冷";
  return "寒冷";
}

/** 季节饮食重点 */
export const SEASON_DIET: Record<Season, string> = {
  春: "春季肝气升发，饮食宜疏肝理气：多绿叶菜、少酸多甘，别贪辛辣",
  夏: "夏季湿热，饮食宜清淡祛湿：绿豆、冬瓜、薏米，少冰饮贪凉",
  秋: "秋季燥气重，饮食宜润燥养肺：银耳、百合、梨，少辛辣烧烤",
  冬: "冬季寒冷，饮食宜温补藏精：羊肉、山药、黑豆，热汤热粥为主",
};

/** 季节穿衣重点 */
export const SEASON_CLOTHING: Record<Season, string> = {
  春: "春季风大，防风护颈，别急于减衣",
  夏: "夏季湿热，轻薄透气，防晒为主",
  秋: "秋季燥凉，早晚添衣，护住背部",
  冬: "冬季严寒，重点护住颈背脚踝",
};

/** 季节情绪重点 */
export const SEASON_MOOD: Record<Season, string> = {
  春: "春季情绪易起伏，多做舒展和户外走动，别把气憋在胸口",
  夏: "夏季心火易旺，午后小憩 20 分钟，少熬夜、少动怒",
  秋: "秋季易生悲忧，多晒太阳、多和人说话，别把情绪闷着",
  冬: "冬季阳气内收，情绪偏低是常态，规律作息、晒背十分钟",
};

/** 按实况温度给饮食侧重 */
export function tempDietTip(t: number): string {
  if (Number.isNaN(t)) return "";
  if (t >= 26) return "天气偏热，以清淡为主，汤品可选绿豆汤、冬瓜汤，少油炸";
  if (t >= 16) return "温度适宜，三餐规律即可，荤素搭配、七八分饱";
  return "气温偏低，适合温热汤粥，少吃生冷瓜果与冰饮";
}

/** 按实况天气给情绪/放松建议 */
export function weatherMoodTip(dayWeather = "", t = 20): string {
  if (/雪/.test(dayWeather)) return "雪天路滑少外出，室内拉伸加热饮更合适";
  if (/雨|雷/.test(dayWeather)) return "雨天湿气重、肩颈易紧，先做 5 分钟舒展再放松";
  if (t >= 30) return "高温天情绪易躁，避开午后暴晒，先补水再静心";
  if (t <= 8) return "寒冷天血管收缩，先暖手脚再做呼吸练习";
  return "天气平稳，适合做一轮 478 呼吸，把节奏慢下来";
}

/** 按实况天气给作息/泡脚建议 */
export function weatherSleepTip(dayWeather = "", t = 20): string {
  if (/雨|雪/.test(dayWeather)) return "今日湿冷，睡前温水泡脚 15 分钟，祛湿又助眠";
  if (t <= 10) return "夜间偏冷，睡前泡脚到微微出汗，别带着凉意入睡";
  if (t >= 28) return "夜间偏热，泡脚水温别过高，10 分钟即可";
  return "睡前半小时放下手机，温水泡脚更易入睡";
}

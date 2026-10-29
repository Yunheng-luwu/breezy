/**
 * 食材介绍库（对应冻结版 app.js 的 FOOD_LIB）
 */
import foodLibJson from "@/../public/knowledge/food-lib.json";

export interface FoodInfo {
  emoji: string;
  tag: string;
  desc: string;
  tip: string;
}

export const foodLib = foodLibJson as Record<string, FoodInfo>;

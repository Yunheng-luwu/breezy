/**
 * 加载饮食知识库（从 public/knowledge/diet.json）
 */
import dietJson from "@/../public/knowledge/diet.json";

interface DietItem {
  name: string;
  ingredients?: string;
  method?: string;
  effect: string;
  suitable?: string;
  contraindication?: string;
  frequency?: string;
}

export interface DietData {
  teas: DietItem[];
  porridges: DietItem[];
  dishes: DietItem[];
  [key: string]: DietItem[] | undefined;
}

export const dietData = dietJson as DietData;

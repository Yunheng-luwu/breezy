/**
 * 加载穴位知识库（从 public/knowledge/acupoints.json）
 */
import acupointsJson from "@/../public/knowledge/acupoints.json";

export interface Acupoint {
  name: string;
  meridian?: string;
  location_std?: string;
  location_easy: string;
  effect: string;
  method?: string;
  duration?: string;
  indications?: string;
  contraindication?: string;
  icon: string;
  categories: string[];
  tag?: string;
}

export const acupoints = acupointsJson as Acupoint[];

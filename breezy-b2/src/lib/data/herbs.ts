/**
 * 加载本草图鉴知识库（从 public/knowledge/herbs.json）
 */
import herbsJson from "@/../public/knowledge/herbs.json";

export interface Herb {
  name: string;
  emoji: string;
  effect: string;
  nature: string;
  desc: string;
  usage: string;
}

export const herbs = herbsJson as Herb[];

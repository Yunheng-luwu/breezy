/**
 * 加载功法知识库（从 public/knowledge/practices.json）
 */
import practicesJson from "@/../public/knowledge/practices.json";

export interface BaduanjinMove {
  name: string;
  steps?: string;
  breath?: string;
  duration?: string;
  mistakes?: string;
  effect: string;
  cautions?: string;
}

export const baduanjinMoves = (practicesJson as { baduanjin: BaduanjinMove[] })
  .baduanjin;

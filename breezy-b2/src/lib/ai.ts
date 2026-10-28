import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * DeepSeek 大模型客户端
 * 通过 @ai-sdk/openai-compatible 接入（DeepSeek 兼容 OpenAI 协议）
 */
export const deepseek = createOpenAICompatible({
  baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
  name: "deepseek",
});

/** 默认对话模型 */
export const chatModel = deepseek.chatModel(
  process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
);

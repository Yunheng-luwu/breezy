import { streamText } from "ai";
import { chatModel } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * 将客户端发来的 UIMessage（parts 结构）转换为 streamText 所需的 CoreMessage（content 结构）
 */
function toCoreMessages(
  messages: Array<{
    role: string;
    parts?: Array<{ type: string; text?: string }>;
  }>,
) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const text = (m.parts ?? [])
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      return { role: m.role as "user" | "assistant", content: text };
    })
    .filter((m) => m.content.length > 0);
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: chatModel,
    system:
      "你是 Breezy（松序）的 AI 健康助手，专注中医轻养生、八段锦、食疗和日常调理。" +
      "回答温和、贴心、实用，避免过度承诺医疗效果，必要时建议就医。",
    messages: toCoreMessages(messages ?? []),
  });

  return result.toTextStreamResponse();
}

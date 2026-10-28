"use client";

import { useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { Send, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new TextStreamChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      {/* 消息列表 */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-muted-foreground">
              你好，我是 Breezy 健康助手 🌿
              <br />
              有什么养生、八段锦或食疗问题想问我吗？
            </p>
          </div>
        )}
        {messages.map((m) => {
          const text = getMessageText(m.parts);
          if (!text) return null;
          return (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {text}
              </div>
            </div>
          );
        })}
        {error && (
          <div className="flex justify-center">
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              出错了：{error.message}
            </p>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入你的问题..."
            className="min-h-[44px] resize-none"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {isLoading ? (
            <Button type="button" variant="outline" onClick={stop}>
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

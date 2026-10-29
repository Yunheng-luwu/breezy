import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "松序 Breezy · 轻养生 AI 助手",
  description:
    "松序 Breezy — 中式中医轻养生 Web 应用。八段锦 AI 跟练、AI 健康对话、食疗调理、穴位推荐，让养生融入日常。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="paper-texture">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Breezy · 轻养生 AI 助手",
  description:
    "Breezy 是一款中医轻养生 Web 应用，提供八段锦跟练、AI 健康对话、食疗建议等功能，让养生融入日常。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

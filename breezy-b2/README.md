# Breezy · 中医轻养生 Web App

> 传智杯 AI+前端赛道 参赛作品
> 让中医养生融入日常，AI 守护你的轻健康。

## ✨ 项目简介

Breezy 是一款面向现代人的中医轻养生 Web 应用，融合 **AI 大模型对话**、**八段锦跟练**、**食疗建议**与**健康档案**四大核心能力，帮助用户在碎片化时间里获得专业、温和、可执行的养生指导。

- 🤖 **AI 健康助手** — 基于 DeepSeek 大模型，提供中医养生、八段锦、食疗、日常调理等问答
- 🧘 **八段锦跟练** — 姿态识别辅助，分步跟练传统八段锦
- 🍵 **食疗建议** — AI 根据体质与时节推荐食疗方案
- 📋 **健康档案** — 记录与追踪个人健康数据

## 🛠 技术架构

| 分类 | 技术选型 |
|------|----------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS + shadcn/ui |
| AI | Vercel AI SDK (ai@5) + DeepSeek |
| 状态管理 | Zustand |
| 数据请求 | @tanstack/react-query |
| 工具链 | ESLint + Prettier + pnpm |
| 部署 | Next.js standalone + Nginx + systemd |

### 目录结构

```
breezy-b2/
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts    # AI 对话 API（流式）
│   │   ├── layout.tsx            # 根布局
│   │   ├── page.tsx              # 首页
│   │   └── globals.css           # 全局样式
│   ├── components/
│   │   ├── chat.tsx              # AI 对话组件
│   │   └── ui/                   # shadcn/ui 组件
│   └── lib/
│       ├── ai.ts                 # DeepSeek 客户端
│       └── utils.ts              # 工具函数
├── .env.example                  # 环境变量模板
├── .prettierrc.json              # Prettier 配置
├── next.config.mjs               # Next.js 配置（standalone 输出）
├── tailwind.config.ts
└── tsconfig.json
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 9

### 安装与运行

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入你的 DeepSeek API Key

# 3. 启动开发服务器
pnpm dev

# 4. 构建生产版本
pnpm build

# 5. 启动生产服务
pnpm start
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | — |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 对话模型 | `deepseek-chat` |
| `PORT` | 服务端口 | `3101` |

> ⚠️ **安全提示**：API 密钥等敏感信息必须通过环境变量注入，**严禁提交到公开仓库**。`.env.local` 已被 `.gitignore` 忽略。

## 📦 部署

本项目采用 Next.js `output: "standalone"` 模式，构建产物仅包含运行时所需的最小依赖，适合低内存服务器部署。

```bash
pnpm build
# 产物位于 .next/standalone/
node .next/standalone/server.js
```

## 📜 许可证

MIT License

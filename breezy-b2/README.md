# Breezy · 中医轻养生 Web App

> 让中医养生融入日常，AI 守护你的轻健康。

- **在线演示（B2 版）**：<http://b2.songxu-breezy.xin>
- **评审体验账号**：`xiaosong` / `songxu2026`
- **隐私说明**：<http://b2.songxu-breezy.xin/privacy>

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
| 工具链 | ESLint + Prettier + npm |
| 部署 | Next.js standalone + Nginx + systemd |

### 目录结构

```
breezy-b2/
├── src/
│   ├── app/
│   │   ├── (main)/               # 主站页面（首页 / 居家 / 饮食 / 功法 / 节律 / 情绪 / 记录 / 我的）
│   │   ├── (auth)/               # 登录与注册
│   │   ├── api/                  # 接口：agent 对话、会话、动作、头像、天气、定位等
│   │   └── globals.css           # 全局样式与主题变量
│   ├── components/               # 页面组件与解压小游戏
│   └── lib/
│       ├── agent/                # 提示词、工具集、上下文、安全兜底
│       ├── data/                 # 穴位、食疗、功法、节气等知识数据
│       ├── db.ts / queries.ts    # 数据库连接与查询
│       └── weather.ts            # 高德天气与定位
├── public/
│   ├── anims/                    # 八段锦示范视频（不入库）
│   ├── ai-models/                # MediaPipe 模型与 wasm（不入库）
│   ├── knowledge/                # 食疗与本草知识库 JSON
│   └── js/ai-pose.js             # 姿态识别引擎
├── schema/songxu_b2.sql          # 建库脚本（含演示数据）
├── scripts/fetch-assets.mjs      # 素材下载与自检（npm run models）
├── .env.example                  # 环境变量模板
├── next.config.mjs               # Next.js 配置（standalone 输出）
├── tailwind.config.ts
└── tsconfig.json
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- MySQL >= 8.0
- npm >= 9（仓库自带 `package-lock.json`）

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库（建库 + 建表 + 演示数据）
mysql -u root -p < schema/songxu_b2.sql

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local：填入 DEEPSEEK_API_KEY、AMAP_KEY、数据库账号密码

# 4. 拉取 AI 模型并自检素材（模型约 17MB，从官方地址下载）
npm run models

# 5. 启动开发服务器
npm run dev

# 6. 构建生产版本
npm run build

# 7. 启动生产服务
npm start
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3101` |
| `HOST` | 监听地址 | `127.0.0.1` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | — |
| `DEEPSEEK_BASE_URL` | DeepSeek API 地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 对话模型 | `deepseek-chat` |
| `DB_HOST` / `DB_PORT` | MySQL 地址与端口 | `127.0.0.1` / `3306` |
| `DB_USER` / `DB_PASSWORD` | MySQL 账号与密码 | — |
| `DB_NAME` | 数据库名 | `songxu_b2` |
| `AMAP_KEY` | 高德地图 Key（定位、天气、穿衣建议） | — |
| `JWT_SECRET` | 登录态签名密钥 | — |
| `JWT_EXPIRES` | 登录有效期 | `7d` |

> ⚠️ **安全提示**：API 密钥、数据库密码等敏感信息必须通过环境变量注入，**严禁提交到公开仓库**。`.env.local` 已被 `.gitignore` 忽略。

### 演示素材（不入库，需单独放置）

以下两类大文件未纳入版本库，`npm run models` 会做校验并提示缺失项：

| 目录 | 内容 | 体积 | 获取方式 |
|------|------|------|----------|
| `public/ai-models/` | MediaPipe 姿态/手部模型（`.task`） | 约 17MB | `npm run models` 自动下载 |
| `public/ai-models/` | `vision_bundle.mjs` + `wasm/` 运行时 | 约 9.3MB | 随《演示素材包》提供 |
| `public/anims/` | 八段锦十式示范视频（10 个 mp4） | 约 83MB | 随《演示素材包》提供 |
| `public/uploads/` | 用户头像等运行时上传文件 | — | 运行后自动生成 |

缺失时的表现：`public/anims/` 缺失会导致功法带练视频 404；`public/ai-models/` 缺失会导致 AI 跟练无法加载识别引擎。

## 📦 部署

本项目采用 Next.js `output: "standalone"` 模式，构建产物仅包含运行时所需的最小依赖，适合低内存服务器部署。

```bash
npm run build

# 静态资源需并入 standalone（standalone 不会自动复制 public 与 .next/static）
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

# 部署时把 standalone 内的内容铺到部署根目录，而不是保留 standalone 这一层目录
cp -r .next/standalone/* /opt/breezith-b2/

# 在部署根目录启动（systemd 指向同一路径）
node server.js
```

## 📜 许可证

MIT License

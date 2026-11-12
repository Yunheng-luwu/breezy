# 松序 Breezith B2 — 项目交接文档

> 本文档供接手开发的 Agent / 工程师使用，包含项目全貌、技术栈、核心模块、部署流程、已知坑点。

---

## 一、项目概述

**松序 Breezith B2** 是一款面向中老年群体的中医养生健康管理 Web 应用，传智杯省赛作品。核心功能：

- **AI 八段锦跟练**：MediaPipe 姿态识别，实时打分 + 语音播报
- **中医体质测评**：国标 GB/T 46939-2025 九种体质量表（27 条）
- **AI 养生助手**：DeepSeek 大模型对话，结合用户健康档案
- **养生食谱 & 药膳视频**：16 个真实药膳做法视频
- **起居节律、情绪打卡、慢病档案、节气养生、穴位图谱** 等

线上地址：`https://b2.songxu-breezy.xin`

---

## 二、技术栈

| 类别 | 选型 |
|------|------|
| 框架 | Next.js 14.2.35（App Router） |
| 语言 | TypeScript 5 + React 18 |
| 样式 | Tailwind CSS 3.4.1 |
| 数据库 | MySQL（mysql2/promise 连接池） |
| 认证 | JWT（jose）+ bcryptjs |
| AI | Vercel AI SDK 5 + DeepSeek（@ai-sdk/openai-compatible） |
| 姿态识别 | MediaPipe Tasks Vision（纯前端，模型在 public/ai-models） |
| 语音播报 | Web Speech API（speechSynthesis，zh-CN） |
| 部署 | Next.js standalone + systemd |

---

## 三、目录结构

```
breezy-b2/
├── src/
│   ├── app/
│   │   ├── (auth)/login, register      # 登录注册
│   │   ├── (main)/                     # 主应用（带侧边栏布局）
│   │   │   ├── home/                   # 首页
│   │   │   ├── rhythm/                 # 起居节律
│   │   │   ├── diet/                   # 养生食谱（含视频专区）
│   │   │   ├── practice/baduanjin/     # 八段锦跟练
│   │   │   ├── mood/                   # 情绪打卡
│   │   │   ├── care/                   # 慢病关怀
│   │   │   ├── clothing/               # 穿衣建议
│   │   │   ├── assistant/              # AI 助手
│   │   │   ├── record/                 # 健康记录
│   │   │   ├── rank/ profile/ privacy/
│   │   ├── api/                        # API 路由（agent, weather, practice-scores 等）
│   │   └── layout.tsx, globals.css
│   ├── components/
│   │   ├── ai-practice.tsx             # ⭐ AI 跟练主组件
│   │   ├── constitution-test.tsx       # 体质测评
│   │   ├── diet-board.tsx              # 食谱卡片墙
│   │   ├── recipe-video-section.tsx    # 药膳视频横滑专区
│   │   ├── recipe-video.tsx            # 视频播放器
│   │   ├── chat.tsx, chat-sidebar.tsx  # AI 对话
│   │   ├── layout/sidebar.tsx          # 侧边栏
│   │   ├── games/                      # 解压小游戏（钢琴、刮刮卡等）
│   │   ├── first-aid/                  # 急救指南
│   │   └── ui/                         # 基础 UI 组件
│   └── lib/
│       ├── db.ts                       # MySQL 连接池
│       ├── auth.ts, auth-actions.ts     # JWT 认证
│       ├── constitution-scale.ts       # ⭐ 国标 27 条体质量表
│       ├── ai.ts                       # DeepSeek 客户端
│       ├── agent/                      # AI 助手 prompt / tools / 安全
│       ├── data/                       # 静态数据（食谱、穴位、草药、视频清单）
│       ├── queries.ts                  # 数据库查询封装
│       ├── weather.ts                  # 高德天气
│       └── utils.ts
├── public/
│   ├── ai-models/                      # MediaPipe 模型 + wasm
│   ├── anims/                          # 八段锦 10 式示范动画 mp4
│   ├── audio/piano/                    # 钢琴音效
│   ├── img/                            # 图片（banners, food, herbs, scene）
│   ├── js/ai-pose.js                   # ⭐ 姿态识别引擎（挂载 window.AIPose）
│   ├── knowledge/                      # 知识库 JSON（diet, herbs, acupoints...）
│   └── recipe-videos/                  # 16 个药膳视频 mp4
├── schema/songxu_b2.sql                # 数据库建表脚本
├── deploy.py                           # 部署脚本（sftp + systemd）
├── tar_deploy.py                       # 打包脚本（standalone + static）
├── next.config.mjs                     # output: "standalone"
└── .env.local                          # 环境变量（见下方）
```

---

## 四、环境配置（.env.local）

```env
PORT=3101

# DeepSeek 大模型
DEEPSEEK_API_KEY=sk-xxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# MySQL
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=breezith_b2
DB_PASSWORD=******        # 实际值见服务器 /opt/breezith-b2/.env.local
DB_NAME=songxu_b2

# 认证
JWT_SECRET=******
JWT_EXPIRES=7d

# 高德天气
AMAP_KEY=******
```

> ⚠️ `.env.local` 不入 Git，且**不打进部署包**。`deploy.py` 会在清空目录前备份 `.env.local`，解压后恢复。切勿手动删除服务器上的 `.env.local`。

---

## 五、数据库

- **库名**：`songxu_b2`（与旧版 `songxu` 库独立，互不影响）
- **建表脚本**：`schema/songxu_b2.sql`
- **10 张核心表**：`users`, `health_profiles`, `chronic_profiles`, `chat_sessions`, `chat_messages`, `practice_scores`, `mood_checkins`, `sleep_checkins`, `notes`, `feedback`, `todos`, `user_favorites`, `symptoms`
- **连接**：`src/lib/db.ts` 全局单例连接池（connectionLimit=5，utf8mb4，timezone +08:00）
- 查询封装：`query<T>(sql, params)` / `queryOne<T>` / `execute(sql, params)`

---

## 六、核心模块详解

### 6.1 AI 八段锦跟练（最核心）

**引擎**：`public/js/ai-pose.js`，纯前端 MediaPipe Pose Landmarker，挂载到 `window.AIPose`。

对外接口：
```js
window.AIPose.start(videoEl, canvasEl, {
  action: "双手托天理三焦",   // 当前招式名
  onScore: (score) => {},      // 实时分数 0-100
  onRep: (count) => {},        // 完成次数
  onStatus: (text) => {},      // 状态提示文字
})
window.AIPose.stop()
window.AIPose.setAction(name)           // 切换招式
window.AIPose.setVoiceEnabled(bool)     // 语音开关
window.AIPose.diag()                    // 诊断信息
```

**语音播报**（Speech 模块，ai-pose.js 内）：
- Web Speech API，中文 `zh-CN`
- 串行队列 + 高低优先级：
  - **高优先级**（可打断低优先级）：计次「N次」、换式「接下来：XX」、就绪/失败/CPU 降级提示
  - **低优先级**（6 秒节流去重）：逐帧动作要领提示
- `stop()` 时清空队列

**React 组件**：`src/components/ai-practice.tsx`，HUD 含分数、次数、状态、语音开关按钮。

> MediaPipe 模型文件在 `public/ai-models/`，首次加载需联网下载 wasm。

### 6.2 体质测评（国标 GB/T 46939-2025）

- 文件：`src/lib/constitution-scale.ts`
- **27 条** = 九种体质（4/3/3/3/3/3/3/3/4），湿热质第 3 条按性别二选一，实际作答 26 条
- 判定结果含「是 / 基本是 / 否」三档
- 组件：`src/components/constitution-test.tsx`（含性别选择）

### 6.3 药膳视频

- 视频清单：`src/lib/data/recipe-videos.ts`（16 条，含 name / src / category / suitable / duration）
- 视频文件：`public/recipe-videos/*.mp4`（拼音命名，如 `meigui-huacha.mp4`）
- 专区组件：`src/components/recipe-video-section.tsx`（横滑卡片，封面用 `<video preload="auto">` 显示首帧）
- 播放器：`src/components/recipe-video.tsx`
- 食谱详情弹窗通过 `videoOfRecipe(name)` 按菜名挂载视频
- ⚠️ 有 7 个菜（清蒸鲈鱼、番茄炖豆腐、红枣山药粥、莲藕排骨汤、菠菜猪肝汤、西兰花炒胡萝卜、银耳百合粥）在 `public/knowledge/diet.json` 里**没有食谱条目**，所以视频专区能播，但食谱详情弹窗里不会出现视频按钮。如需补齐，要往 `diet.json` 加条目。

### 6.4 AI 养生助手

- API：`src/app/api/agent/route.ts`（Vercel AI SDK stream）
- 配置：`src/lib/ai.ts`（DeepSeek 兼容端点）
- Prompt & 工具：`src/lib/agent/`（prompt.ts, tools.ts, safety.ts, health-context.ts）
- 对话历史存 `chat_sessions` / `chat_messages` 表

### 6.5 认证

- JWT（jose 库），Cookie `breezy_token`
- 密码：bcryptjs
- 中间件校验在各 page 的 `getServerSession`（`src/lib/auth.ts`）

---

## 七、部署流程

### 7.1 本地构建

```bash
npm install        # 或 pnpm install
npm run build      # 产物在 .next/standalone + .next/static
```

### 7.2 打包（tar_deploy.py）

将以下内容打包为 `breezith-b2.tar.gz`：
- `.next/standalone/`
- `.next/static/` → `standalone/.next/static/`
- `public/` → `standalone/public/`

### 7.3 部署（deploy.py）

```bash
python tar_deploy.py && python deploy.py
```

流程：
1. sftp 上传 tar.gz 到服务器 `/tmp/`
2. 备份 `/opt/breezith-b2/.env.local` → 清空目录 → 解压 → 恢复 `.env.local`
3. `systemctl restart breezith-b2`
4. 冒烟测试 `curl http://127.0.0.1:3101/privacy` 期望 200

### 7.4 服务器信息

| 项 | 值 |
|----|-----|
| 服务器 | 阿里云 ECS `182.92.204.189` |
| 系统 | Alibaba Cloud Linux 3 |
| 部署目录 | `/opt/breezith-b2` |
| 服务名 | `breezith-b2`（systemd） |
| 端口 | 3101（Nginx 反代到 443） |
| 数据库 | MySQL，库 `songxu_b2`，用户 `breezith_b2` |
| 服务命令 | `systemctl status/restart breezith-b2` |
| 查日志 | `journalctl -u breezith-b2 -n 50 --no-pager` |

---

## 八、开发规范

- **包管理器**：项目用 pnpm（`pnpm-lock.yaml`），但 `npm` 也能用
- **代码风格**：Prettier（`.prettierrc.json`），`npm run format`
- **Lint**：`npm run lint`（ESLint + next/core-web-vitals）
- **组件**：`src/components/ui/` 用 shadcn/ui 风格（Radix + class-variance-authority）
- **工具函数**：`cn()` 来自 `tailwind-merge` + `clsx`
- **数据获取**：服务端组件直接 `query()`，客户端用 `@tanstack/react-query`

---

## 九、已知坑点 & 注意事项

1. **部署必保留 `.env.local`**：`deploy.py` 已自动备份恢复，但若手动 `rm -rf` 目录会丢失数据库配置，导致首页 500（`Access denied ... using password: NO`）。
2. **数据库名是 `songxu_b2` 不是 `breezith_b2`**：本地 `.env.local` 若写成 `breezith_b2` 会连到空库，报 `Table doesn't exist`。
3. **`breezith_b2` MySQL 用户需授权 `songxu_b2` 库**：`GRANT ALL PRIVILEGES ON songxu_b2.* TO 'breezith_b2'@'localhost';`
4. **MediaPipe 模型需静态托管**：`public/ai-models/` 里的 `vision_bundle.mjs` 和 wasm 文件必须随部署带上，否则 AI 跟练无法启动。
5. **语音播报依赖浏览器 TTS**：`speechSynthesis` 是客户端 API，无需服务器。移动端需系统装中文语音包。
6. **药膳视频首帧用 `<video preload="auto">`**：不生成静态封面图，靠浏览器加载视频首帧。视频共 16 个约 45MB。
7. **视频时长是真实值**：`recipe-videos.ts` 里的 `duration` 字段已通过解析 mp4 的 `moov/mvhd` box 校准（10-15 秒），不要随便改占位值。
8. **`next.config.mjs` 是 `output: "standalone"`**：构建产物是独立 Node 服务，部署时不需要在服务器装 node_modules（standalone 自带）。
9. **`.next/` 目录不入 Git**：已在 `.gitignore`。

---

## 十、常用命令速查

```bash
# 本地开发
npm run dev

# 构建
npm run build

# 打包 + 部署
python tar_deploy.py
python deploy.py

# 服务器查日志
ssh root@182.92.204.189 "journalctl -u breezith-b2 -n 50 --no-pager"

# 服务器重启服务
ssh root@182.92.204.189 "systemctl restart breezith-b2"

# 数据库连接
mysql -ubreezith_b2 -p songxu_b2
```

---

*文档生成时间：2026-11-12*

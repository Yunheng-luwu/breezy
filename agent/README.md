# 松序 AI（SongXu AI）

> 顺气舒心，慢养日常 —— 面向年轻人的疏肝解郁轻养生 AI 助手独立服务。

本仓库是「松序」产品的 **AI 后端独立服务**，与主前端项目完全解耦：主前端未完成期间，本服务可独立开发、调试与演示，并通过统一的 HTTP 接口为未来任意前端提供对话能力。

## 功能特性

- **真实多轮对话**：接入 DeepSeek 大模型，支持上下文理解、指代消解与连续追问
- **短期记忆**：自动携带最近若干轮对话历史（可配置，默认 10 轮）
- **数据持久化**：用户、会话、消息等数据存入 MySQL，数据库不可用时自动降级为内存模式
- **安全护栏**：在调用大模型之前进行规则预检
  - 急症红旗症状 → 直接给出就医/急救指引
  - 自伤自杀倾向 → 危机干预并提供心理援助热线
  - 处方药自行停换调量 → 拒绝越权，建议咨询医生
- **自带测试台**：内置极简对话页面，无需前端即可体验完整链路

## 技术栈

| 层级 | 技术 |
|---|---|
| 运行时 | Node.js（>= 18） |
| Web 框架 | Express 4 |
| 大模型 | DeepSeek（deepseek-chat，OpenAI 兼容接口） |
| 数据库 | MySQL 8（mysql2 驱动，兼容 MariaDB） |
| 配置管理 | dotenv（密钥仅存于本地 `.env`，不入库） |

## 目录结构

```text
songxu-ai/
├── public/                     # 自带测试台（静态页面）
│   ├── index.html
│   ├── app.js
│   └── style.css
├── server/
│   ├── index.js                # 服务入口（默认端口 3100）
│   ├── config/index.js         # 环境变量与配置加载
│   ├── db/
│   │   ├── pool.js             # MySQL 连接池
│   │   └── schema.sql          # 建库建表脚本
│   ├── agent/
│   │   ├── orchestrator.js     # 对话编排（安全检查→记忆→调模型→落库）
│   │   ├── chatStore.js        # 会话与消息存取
│   │   ├── safety.js           # 安全护栏规则
│   │   ├── prompts/system.js   # AI 人设与系统提示词
│   │   └── providers/deepseek.js  # DeepSeek 接口封装
│   └── routes/chat.js          # /api/chat 路由与参数校验
├── .env.example                # 配置模板
└── package.json
```

## 快速开始

### 1. 环境要求

- Node.js 18 及以上
- MySQL 8（或 MariaDB），服务运行中

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入真实配置：

```text
PORT=3100
DEEPSEEK_API_KEY=sk-你的DeepSeek密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的数据库密码
DB_NAME=songxu_ai
MEMORY_TURNS=10
```

> DeepSeek 密钥可在 platform.deepseek.com 控制台创建。`.env` 已被 `.gitignore` 忽略，请勿提交。

### 4. 初始化数据库

```bash
mysql -u root -p < server/db/schema.sql
```

### 5. 启动服务

```bash
npm start
```

启动成功后：

- 测试台：http://localhost:3100
- 健康检查：http://localhost:3100/api/health

开发时可使用 `npm run dev` 启用文件改动自动重启。

## API

### 健康检查

```text
GET /api/health
```

### 发送对话消息

```text
POST /api/chat
Content-Type: application/json
```

请求体：

```json
{
  "message": "今天生气后胸闷，怎么办？",
  "sessionId": null
}
```

- `message`：用户消息（必填，不超过 500 字）
- `sessionId`：会话 ID；首次对话传 `null` 或不传，服务端创建后会在响应中返回，后续多轮对话持续携带即可

成功响应：

```json
{
  "success": true,
  "data": {
    "reply": "……（AI 回复内容）",
    "sessionId": 1,
    "storage": "db",
    "safetyLevel": "normal"
  }
}
```

- `storage`：`db`（MySQL）或 `memory`（内存降级）
- `safetyLevel`：`normal` / `emergency` / `self_harm` / `medication`

## 对话处理流程

```text
前端请求
  → 参数校验
  → 解析/创建用户与会话，保存用户消息
  → 安全护栏预检（命中红线则直接拦截，不调用大模型）
  → 读取历史记忆，组装「系统人设 + 历史对话 + 当前问题」
  → 调用 DeepSeek 生成回复
  → 保存 AI 回复并返回
```

## 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| 阶段 0 | 工程地基：目录独立、配置隔离、数据库设计 | 已完成 |
| 阶段 1 | 真实对话：DeepSeek 接入、记忆、持久化、安全护栏 | 已完成 |
| Sprint 1 | 最小调理闭环：方案任务、工具调用、主动随访、效果反馈与方案迭代 | 进行中 |
| 阶段 2 | RAG 知识库（经专业审核、回答带出处）+ Function Calling 工具扩充 | 计划中 |
| 阶段 3 | 长期个性化记忆、主动智能、结构化卡片、界面外化 | 计划中 |

## 安全与免责声明

- 本服务提供的养生建议仅供健康科普与日常参考，**不能替代医生的面诊与诊断**；
- 如出现急症红旗症状，请立即线下就医或拨打急救电话；
- 涉及处方药的使用、停用或剂量调整，请遵从专业医师指导；
- 请勿将 `.env`、数据库密码或 API 密钥提交到版本库或发送给不可信第三方。

## License

私有项目，版权所有，未经授权不得对外传播或商用。

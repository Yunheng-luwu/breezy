/**
 * Agent 流式对话接口（AI SDK v5）
 * 对应冻结版 server/agent/orchestrator.js 的 handleStream
 *
 * 流程：用户解析 → 存用户消息 → 安全预检 → 组装记忆 + 健康背景
 *       → streamText 多轮工具调用循环（卡片收集）→ 下发卡片 → 存回复
 */
import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { chatModel } from "@/lib/ai";
import { SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { detectSafety } from "@/lib/agent/safety";
import { buildTools, type AgentCard } from "@/lib/agent/tools";
import { buildAgentContext } from "@/lib/agent/health-context";
import { getSessionUser } from "@/lib/auth";
import { getClientIp } from "@/lib/weather";
import {
  resolveSession,
  appendMessage,
  renameSessionIfDefault,
  loadHistory,
} from "@/lib/agent/chat-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 从 UIMessage 中提取纯文本 */
function uiText(m: UIMessage): string {
  return (m.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** 意图补卡映射：模型没调工具但用户消息命中卡片意图时，后端强制补卡 */
const INTENT_CARD_MAP: Array<{
  re: RegExp;
  tool: string;
  args?: (text: string) => Record<string, unknown>;
  guide: string;
}> = [
  {
    re: /八段锦|功法带练|带练|整套动作|整套|十式|预备式|两手托天|左右开弓|调理脾胃|五劳七伤|摇头摆尾|两手攀足|攥拳怒目|背后七颠|收式/,
    tool: "get_practice_moves",
    guide: "\n\n下面也为你整理了八段锦十式的可点击卡片，点任意招式就能跳转到功法带练面板，查看分步要领、呼吸配合与易错点～",
  },
  {
    re: /按揉|穴位|按哪|按哪里|按压|揉哪里|太冲|内关|合谷|足三里|三阴交|肩井/,
    tool: "query_acupoints",
    args: (t) => ({
      category: /睡|失眠|熬夜|多梦/.test(t)
        ? "sleep"
        : /肩|颈|僵|久坐/.test(t)
          ? "neck"
          : /办公|电脑|加班/.test(t)
            ? "office"
            : "stress",
    }),
    guide:
      "\n\n下面也为你整理了可按揉的穴位卡片，点「查看穴位详情」进居家保健看准确定位和手法～",
  },
  {
    re: /泡脚|足浴|泡足/,
    tool: "match_footbath",
    args: (t) => ({ status: t.slice(0, 50) }),
    guide: "\n\n下面也为你整理了泡脚方卡片，药材、水温、禁忌可以在居家保健里对照～",
  },
  {
    re: /养生茶|花茶|茶饮|粥|汤|食疗|药膳|炖/,
    tool: "get_diet_therapy",
    args: (t) => ({
      type: /汤|炖/.test(t) ? "soup" : /粥/.test(t) ? "porridge" : /菜|炒|蒸/.test(t) ? "dish" : "tea",
    }),
    guide: "\n\n下面也为你整理了食疗方卡片，完整做法在饮食推荐板块里～",
  },
  {
    re: /今天.*(?:吃|饮食|食谱|菜谱)|吃什么|饮食建议|今日饮食|三餐怎么吃/,
    tool: "get_diet",
    guide: "\n\n下面也为你整理了今日饮食建议卡片，包含疏肝推荐食材与避雷清单～",
  },
  {
    re: /轻运动|运动建议|做什么运动|拉伸|微动|疏肝.*运动/,
    tool: "get_exercises",
    guide: "\n\n下面也为你整理了疏肝轻运动建议卡片，含时长与功效，可直接跟练～",
  },
  {
    re: /穿什么|穿衣建议|今天.*天气|降温|保暖|出门.*穿/,
    tool: "get_clothing",
    guide: "\n\n下面也为你整理了实时天气与穿衣建议卡片～",
  },
  {
    re: /今天.*状态|今日.*概览|今日调理|今天.*怎么样|情绪自评|PHQ|GAD|肝郁指数|今日.*待办/,
    tool: "get_today_overview",
    guide: "\n\n下面也为你整理了今日健康概览卡片，含情绪自评与调理待办完成情况～",
  },
  {
    re: /症状记录|哪里不舒服|之前.*症状|症状历史|最近.*不适/,
    tool: "list_symptoms",
    guide: "\n\n下面也为你整理了最近的症状记录卡片～",
  },
  {
    re: /用药提醒|吃药提醒|药.*清单|保健品.*提醒|该吃什么药/,
    tool: "list_medicines",
    guide: "\n\n下面也为你整理了用药/保健品提醒清单卡片～",
  },
  {
    re: /待办清单|提醒.*事项|今天.*待办|调理待办|有什么.*待办/,
    tool: "list_todos",
    guide: "\n\n下面也为你整理了今日调理待办卡片～",
  },
  {
    re: /健康档案|我的档案|我.*体质|过敏史|作息规律|个人.*健康/,
    tool: "get_profile",
    guide: "\n\n下面也为你整理了你的健康档案卡片～",
  },
];

/** 板块入口：保证每轮回答都能点到对应板块，不依赖模型是否记得给 */
const BOARD_LINKS: Array<{ re: RegExp; label: string; href: string }> = [
  { re: /首页|今日调养|今日状态|概览|总览/, label: "今日调养", href: "/home" },
  { re: /穴位|按揉|按哪|按压|泡脚|足浴|保健|经络|太冲|合谷|足三里|三阴交/, label: "居家保健", href: "/care" },
  { re: /吃|饮食|食谱|茶|粥|汤|食疗|药膳|食材|忌口|图鉴|本草|买菜|购物/, label: "饮食推荐", href: "/diet" },
  { re: /天气|穿衣|降温|保暖|穿什么|下雨|大风|体感|怕冷|怕热/, label: "穿衣建议", href: "/clothing" },
  { re: /八段锦|功法|呼吸|拉伸|运动|跟练|锻炼|AI\s*跟练/, label: "功法带练", href: "/practice" },
  { re: /作息|入睡|睡眠|待办|打卡|几点睡|早起|熬夜|起床/, label: "生活节律", href: "/rhythm" },
  { re: /情绪|心情|烦|焦虑|压力|生气|郁闷|不开心|解压|小游戏/, label: "情绪解压", href: "/mood" },
  { re: /症状|记录|历史|不舒服|随手记/, label: "健康记录", href: "/record" },
  { re: /体质|过敏|档案|偏好|我的|测评|自评|量表|用药|提醒/, label: "个人中心", href: "/profile" },
];

const CARD_BOARD: Record<string, { label: string; href: string }> = {
  acupoint_list: { label: "居家保健", href: "/care" },
  acupoint_detail: { label: "居家保健", href: "/care" },
  footbath: { label: "居家保健", href: "/care" },
  diet: { label: "饮食推荐", href: "/diet" },
  clothing: { label: "穿衣建议", href: "/clothing" },
  exercise: { label: "功法带练", href: "/practice" },
  practice: { label: "功法带练", href: "/practice" },
  practice_detail: { label: "功法带练", href: "/practice" },
  overview: { label: "今日调养", href: "/home" },
  symptom_list: { label: "健康记录", href: "/record" },
  medicine_list: { label: "健康记录", href: "/record" },
  todo_list: { label: "生活节律", href: "/rhythm" },
  profile: { label: "个人中心", href: "/profile" },
};

function pickBoardLinks(userText: string, cards: AgentCard[]) {
  const picked = new Map<string, string>();
  for (const b of BOARD_LINKS) if (b.re.test(userText)) picked.set(b.href, b.label);
  for (const c of cards) {
    const b = CARD_BOARD[c.type];
    if (b) picked.set(b.href, b.label);
  }
  const links: Array<{ href: string; label: string }> = [];
  picked.forEach((label, href) => links.push({ href, label }));
  return links.slice(0, 3);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages?: UIMessage[];
    sessionId?: number;
  };
  const uiMessages = body.messages ?? [];
  const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
  const userText = lastUser ? uiText(lastUser).trim() : "";

  const user = await getSessionUser(req);
  if (!user) {
    return new Response("请先登录后使用 AI 助手", { status: 401 });
  }

  const session = await resolveSession(user.id, body.sessionId);
  if (userText) {
    await appendMessage(session.id, "user", userText);
    await renameSessionIfDefault(session.id, userText);
  }

  // ---- 安全预检 ----
  const guard = detectSafety(userText);
  if (guard.level !== "normal" && guard.reply) {
    const reply = guard.reply;
    await appendMessage(session.id, "assistant", reply);
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = `safe-${Date.now()}`;
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: reply });
        writer.write({ type: "text-end", id });
        writer.write({ type: "data-safety", data: { level: guard.level } });
        writer.write({ type: "data-session", data: { sessionId: session.id } });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // ---- 组装上下文 ----
  const history = await loadHistory(session.id);
  // 历史里已含本轮 user 消息，去掉最后一条避免重复
  const priorHistory = history.slice(0, -1);
  const agentCtx = await buildAgentContext(user.id);
  const systemContent = agentCtx ? `${SYSTEM_PROMPT}\n\n${agentCtx}` : SYSTEM_PROMPT;

  const cards: AgentCard[] = [];
  // 穿衣页定位/手动选择的城市（cookie），让 AI 查天气与页面保持一致
  const cityCookie = /(?:^|;\s*)sx_city=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
  const rememberedCity = cityCookie ? decodeURIComponent(cityCookie) : undefined;
  const tools = buildTools(
    { userId: user.id, clientIp: getClientIp(req), city: rememberedCity },
    cards,
  );
  let reply = "";

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: chatModel,
        system: systemContent,
        messages: [
          ...priorHistory.map((h) => ({ role: h.role, content: h.content })),
          { role: "user" as const, content: userText },
        ],
        tools,
        // 对齐冻结版风格参数：temperature 略高于 0.7 保温柔克制，同时限制长度维持陪玩短句节奏
        temperature: 0.75,
        maxOutputTokens: 900,
        stopWhen: stepCountIs(3),
        onFinish: ({ text }) => {
          reply = text;
        },
      });

      writer.merge(result.toUIMessageStream({ sendReasoning: false }));

      // 等待流结束（工具已执行、cards 已填充）
      await result.text;

      // 意图补卡：模型没调工具但命中卡片意图
      if (cards.length === 0) {
        for (const item of INTENT_CARD_MAP) {
          if (item.re.test(userText)) {
            const t = (tools as Record<string, unknown>)[item.tool] as
              | { execute?: (args: unknown, opts: unknown) => Promise<unknown> }
              | undefined;
            if (t?.execute) {
              try {
                await t.execute(item.args ? item.args(userText) : {}, {
                  toolCallId: "fallback",
                  messages: [],
                });
                if (cards.length) {
                  const id = `guide-${Date.now()}`;
                  writer.write({ type: "text-start", id });
                  writer.write({ type: "text-delta", id, delta: item.guide });
                  writer.write({ type: "text-end", id });
                  reply = (reply || "").trim() + item.guide;
                }
              } catch {
                /* 补卡失败不影响主流程 */
              }
            }
            break;
          }
        }
      }

      // 板块导航：无论模型是否给了入口，都补一组可点击的板块链接
      const nav = pickBoardLinks(userText, cards);
      if (nav.length) cards.push({ type: "nav", links: nav });

      if (cards.length) {
        writer.write({ type: "data-cards", data: { cards } });
      }
      writer.write({ type: "data-session", data: { sessionId: session.id } });

      if (reply.trim()) await appendMessage(session.id, "assistant", reply.trim(), cards);
    },
    onError: (e) => {
      console.error("[agent] stream error:", e);
      return "助手暂时走神了，请稍后再试一次～";
    },
  });

  return createUIMessageStreamResponse({ stream });
}

/**
 * AI 工具层：把七大板块的查询/记录能力注册为大模型可调用的函数工具
 * AI SDK v5 版（对应冻结版 server/agent/tools/index.js）
 * - 只读工具：查库/查天气，结果既返回给模型（summary），也产出结构化卡片（card）
 * - 写操作提案工具：不直接写库，只产出 confirm_* 确认卡，由用户在前端确认后走 REST 接口
 */
import { tool } from "ai";
import { z } from "zod";
import { query } from "@/lib/db";
import { getClothingSmart } from "@/lib/weather";
import { dietData, exerciseData } from "@/lib/content-data";
import * as kb from "@/lib/knowledge";

export interface ToolContext {
  userId: number;
  clientIp: string;
  /** 用户在穿衣页定位/手动选择记住的城市（cookie），优先于 IP 定位 */
  city?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AgentCard = { type: string; [k: string]: any };

const TODO_TYPES = ["med", "ai", "sleep", "diet"] as const;
const SEVERITIES = ["轻度", "中度", "重度"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 构建工具集
 * @param ctx 执行上下文（用户、IP）
 * @param cards 卡片收集数组：工具执行时把结构化卡片推入，供流结束后下发给前端
 */
export function buildTools(ctx: ToolContext, cards: AgentCard[]) {
  return {
    // ---- 居家保健 ----
    query_acupoints: tool({
      description:
        "按症状分组查询推荐穴位。分组：stress=压力大生气胸闷疏肝组，neck=久坐肩颈僵硬组，sleep=熬夜失眠安神组，office=办公随手按组。用户描述不适时优先调用，再按结果给出按揉建议。",
      inputSchema: z.object({
        category: z.enum(["stress", "neck", "sleep", "office"]).describe("症状分组"),
      }),
      execute: async ({ category }) => {
        const rows = kb.listAcupoints(category);
        cards.push({
          type: "acupoint_list",
          category,
          items: rows.map((r) => ({
            id: r.id,
            name: r.name,
            tag: r.tag,
            effect: kb.firstSentence(r.effect),
            icon: r.icon,
          })),
        });
        return (
          rows
            .map((r) => `${r.id}.${r.name}（${r.tag}）：${kb.firstSentence(r.effect, 50)}`)
            .join("\n") || "该分组暂无穴位数据"
        );
      },
    }),

    get_acupoint_detail: tool({
      description:
        "查询单个穴位的归经、标准/简易定位、按揉手法、时长频率、适用症状与禁忌。需先用 query_acupoints 拿到穴位 id。",
      inputSchema: z.object({ id: z.number().int().describe("穴位 id（来自 query_acupoints）") }),
      execute: async ({ id }) => {
        const r = kb.getAcupoint(id);
        if (!r) return `穴位 id=${id} 不存在，请先用 query_acupoints 查询`;
        cards.push({
          type: "acupoint_detail",
          item: {
            id: r.id,
            name: r.name,
            tag: r.tag,
            effect: kb.firstSentence(r.effect, 60),
            icon: r.icon,
            location: r.location_easy,
            method: r.method,
            duration: r.duration,
            frequency: "",
          },
        });
        return [
          `${r.name}（${r.meridian}）`,
          `标准定位：${r.location_std}`,
          `简易找法：${r.location_easy}`,
          `手法：${r.method}`,
          `时长频率：${r.duration}`,
          `适用症状：${r.indications}`,
          `禁忌：${r.contraindication}`,
        ].join("\n");
      },
    }),

    match_footbath: tool({
      description:
        "根据用户当前状态（如失眠、手脚冰凉、压力大）匹配中药泡脚配方，给出药材、水温和时长。",
      inputSchema: z.object({
        status: z.string().describe("用户自述的当前状态，如“失眠多梦、手脚冰凉”"),
      }),
      execute: async ({ status }) => {
        const recipe = kb.matchFootbath(status);
        if (!recipe) return "泡脚配方数据暂不可用";
        const payload = {
          name: recipe.name,
          herbs: recipe.herbs,
          temp: recipe.temp,
          duration: recipe.duration,
        };
        cards.push({ type: "footbath", recipe: payload });
        return [
          payload.name,
          `药材：${payload.herbs}`,
          `煎法：${recipe.method}`,
          `水温${payload.temp}，泡${payload.duration}`,
          `功效：${recipe.effect}`,
          `禁忌：${recipe.contraindication}`,
        ].join("\n");
      },
    }),

    // ---- 饮食调理 ----
    get_diet: tool({
      description:
        "获取今日饮食原则、疏肝推荐食材红榜、肝郁避雷黑榜与一日食谱。用户问吃什么、饮食建议时调用。",
      inputSchema: z.object({}),
      execute: async () => {
        cards.push({ type: "diet", data: dietData });
        return [
          `今日原则：${dietData.recommend.principle}`,
          `推荐茶饮：${dietData.goodFoods.tea.join("、")}`,
          `推荐主食：${dietData.goodFoods.staple.join("、")}`,
          `推荐蔬菜：${dietData.goodFoods.vegetable.join("、")}`,
          `推荐水果：${dietData.goodFoods.fruit.join("、")}`,
          `避雷生冷：${dietData.badFoods.cold.join("、")}`,
          `避雷辛辣油炸：${dietData.badFoods.spicy.join("、")}`,
          `避雷过酸：${dietData.badFoods.sour.join("、")}`,
          `食谱：${dietData.recipes.map((r) => `${r.time}${r.name}（${r.ingredients}）`).join("；")}`,
        ].join("\n");
      },
    }),

    get_diet_therapy: tool({
      description:
        "按类别查询疏肝养生药膳食疗方：tea=茶饮方，porridge=汤粥方，dish=食疗菜，soup=药膳汤谱。每款含材料用量、做法、功效、适用体质、禁忌、频率。用户问喝茶/养生茶/粥/汤/食疗菜/炖汤药膳时调用。",
      inputSchema: z.object({
        type: z.enum(["tea", "porridge", "dish", "soup"]).describe("茶饮/汤粥/食疗菜/药膳汤谱"),
      }),
      execute: async ({ type }) => {
        const list = kb.getDietTherapy(type);
        if (!list) return "该类别暂无数据";
        const label = { tea: "茶饮方", porridge: "汤粥方", dish: "食疗菜", soup: "药膳汤谱" }[type];
        const summary = list
          .map((r, i) =>
            [
              `${i + 1}.${r.name}`,
              `材料：${r.ingredients}`,
              `做法：${r.method}`,
              `功效：${r.effect}`,
              `适用：${r.suitable}`,
              `禁忌：${r.contraindication}`,
              `频率：${r.frequency}`,
              r.note ? `注意：${r.note}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n");
        return `【${label}】\n${summary}`;
      },
    }),

    query_medicine_info: tool({
      description:
        "查询逍遥丸、加味逍遥丸、柴胡疏肝散、越鞠丸、归脾丸、酸枣仁丸等中成药的说明书层面信息：成分、功能主治、适用证候、用法用量、禁忌慎用、相互作用。仅作科普。用户问某中成药是什么/成分/主治/禁忌/能否吃时调用；涉及停药、换药、调剂量时不要据此给方案，应建议咨询开方医生或药师。",
      inputSchema: z.object({
        name: z.string().describe("中成药名称或关键词，如 逍遥丸/归脾丸/酸枣仁"),
      }),
      execute: async ({ name }) => {
        const m = kb.findMedicine(name);
        if (!m) return `未找到与“${name}”相关的中成药，可选：${kb.listMedicineNames().join("、")}`;
        return [
          `${m.name}（说明书层面科普，不构成用药建议）`,
          `主要成分：${m.ingredients}`,
          `功能主治：${m.effect}`,
          `适用证候：${m.syndrome}`,
          `用法用量：${m.dosage}`,
          `禁忌与慎用：${m.caution}`,
          `药物相互作用：${m.interaction}`,
        ].join("\n");
      },
    }),

    query_formula_info: tool({
      description:
        "查询四君子汤、玉屏风散、当归补血丸、六味地黄丸、麦门冬汤等经典调养方剂的科普信息：出处、组成、功效、适应证候、用法、禁忌注意。仅作养生科普，不做处方。用户问某方剂是什么/组成/功效/适不适合自己时调用；最终使用必须建议用户咨询中医师。",
      inputSchema: z.object({
        name: z.string().describe("方剂名称或关键词，如 四君子汤/玉屏风/地黄丸"),
      }),
      execute: async ({ name }) => {
        const f = kb.findFormula(name);
        if (!f)
          return `未找到与“${name}”相关的方剂，可选：${kb.listFormulaNames().join("、")}`;
        return [
          `${f.name}（出自${f.source}；养生科普，使用前请咨询中医师）`,
          `组成：${f.ingredients}`,
          `功效：${f.effect}`,
          `适应证候：${f.syndrome}`,
          `用法：${f.dosage}`,
          `禁忌与注意：${f.caution}`,
          `提示：${f.note}`,
        ].join("\n");
      },
    }),

    // ---- 穿衣建议 ----
    get_clothing: tool({
      description:
        "获取用户所在城市的实时天气与穿衣、重点保暖部位建议。用户问出门穿什么、天气、降温保暖时调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const data = await getClothingSmart(ctx.city, ctx.clientIp);
        if (!data) {
          return "暂时获取不到实时天气（定位或天气服务不可用），请稍后重试，或在穿衣页手动选择城市后再问。";
        }
        cards.push({ type: "clothing", data });
        return [
          `${data.city} ${data.weather ?? ""} ${data.temp}°C（最高${data.high}°C/最低${data.low}°C，温差${data.diff}°C）`,
          `风：${data.wind}；湿度：${data.humidity}%`,
          `穿衣原则：${data.principle}`,
          `内搭：${data.inner}；外套：${data.outer}；鞋子：${data.shoes}`,
        ].join("\n");
      },
    }),

    // ---- 生活节律 ----
    get_exercises: tool({
      description: "获取疏肝轻运动建议列表（八段锦单式、梳头功、扩胸、拉伸、478呼吸等），含时长与功效。",
      inputSchema: z.object({}),
      execute: async () => {
        cards.push({ type: "exercise", items: exerciseData });
        return exerciseData.map((e) => `${e.name}（${e.duration}，${e.tag}）`).join("\n");
      },
    }),

    // ---- 功法带练 ----
    get_practice_moves: tool({
      description:
        "获取八段锦完整十式动作序列（预备式+八式+收式，含名称、每式时长），用于带练或讲解。用户问八段锦、功法带练、整套动作时调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = kb.getPracticeMoves();
        cards.push({ type: "practice", items: rows });
        return rows.map((m) => `${m.id}.${m.name} ${m.duration}`).join("\n") || "功法数据暂不可用";
      },
    }),

    get_practice_detail: tool({
      description:
        "查询八段锦某一式的分步要领、呼吸配合、次数时长、常见错误、功效与注意事项；传入“478/呼吸”可查 478 呼吸法（含不适应人群）。需先用 get_practice_moves 拿到式名。",
      inputSchema: z.object({
        name: z.string().describe("八段锦式名（如 两手托天理三焦）或 478呼吸"),
      }),
      execute: async ({ name }) => {
        const d = kb.getPracticeDetail(name);
        if (!d) return `未找到“${name}”，请用 get_practice_moves 查询十式名称，或传“478呼吸”`;
        const lines = [`${d.name}`];
        if (d.steps) lines.push(`分步要领：${d.steps}`);
        if (d.breath) lines.push(`呼吸配合：${d.breath}`);
        if (d.duration) lines.push(`次数时长：${d.duration}`);
        if (d.mistakes) lines.push(`常见错误：${d.mistakes}`);
        if (d.effect) lines.push(`功效：${d.effect}`);
        if (d.cautions) lines.push(`注意事项：${d.cautions}`);
        if (d.rounds) lines.push(`轮次：${d.rounds}`);
        if (d.unsuitable) lines.push(`不适应人群：${d.unsuitable}`);
        cards.push({
          type: "practice_detail",
          item: {
            name: d.name,
            steps: d.steps || "",
            breath: d.breath || "",
            duration: d.duration || "",
            mistakes: d.mistakes || "",
            effect: d.effect || "",
            cautions: d.cautions || "",
            rounds: d.rounds || "",
            unsuitable: d.unsuitable || "",
          },
        });
        return lines.join("\n");
      },
    }),

    // ---- 体质与症状 ----
    get_constitution_guide: tool({
      description:
        "查询气郁质的体质特征、常见表现、与气虚/阴虚/痰湿的夹杂关系、核心疏肝调理方向与判断依据。用户问自己是不是气郁质、气郁怎么调理时调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const c = kb.getConstitution();
        if (!c) return "体质数据暂不可用";
        return [
          `${c.name}`,
          `体质特征：${c.features}`,
          `常见表现：${c.manifestations}`,
          `夹杂关系：\n${c.mixed_relations}`,
          `核心方法：${c.core_method}`,
          `调理方向：${c.care_guide}`,
          `判断依据：${c.diagnosis}`,
        ].join("\n");
      },
    }),

    query_symptom_guide: tool({
      description:
        "查询高频症状的权威调理与就医指引：胸闷、两胁胀痛、失眠多梦、易怒、头晕、咽喉异物感（梅核气）、肩颈僵硬、叹气、口苦。返回表现、常见诱因、可能关联证型、日常调理方向、何时必须就医（红线）。用户描述具体不适时优先调用，并把就医红线传达给用户。",
      inputSchema: z.object({
        name: z.string().describe("症状名称，如 胸闷/失眠/梅核气/肩颈/口苦"),
      }),
      execute: async ({ name }) => {
        const s = kb.findSymptom(name);
        if (!s) return `未收录症状“${name}”，目前支持：${kb.listSymptomNames().join("、")}`;
        return [
          `${s.name}`,
          `表现：${s.manifestation}`,
          `常见诱因：${s.causes}`,
          `可能关联证型：${s.syndromes}`,
          `日常调理方向：${s.care_guide}`,
          `何时异常需就医：${s.seek_doctor}`,
        ].join("\n");
      },
    }),

    // ---- 首页/我的 ----
    get_today_overview: tool({
      description:
        "获取用户今日健康概览：情绪自评（PHQ-9/GAD-7 得分与等级）与今日调理待办及完成情况。用户问今天状态、今日调理、概览时调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const users = await query<{ score: number | null; level: string | null }>(
          "SELECT score, level FROM users WHERE id = ?",
          [ctx.userId],
        );
        const todos = await query<{
          id: number;
          text: string;
          time: string;
          done: number;
          type: string;
        }>(
          `SELECT id, content AS text, todo_time AS time, is_done AS done, type
             FROM todos WHERE user_id = ? AND todo_date = CURDATE() ORDER BY todo_time`,
          [ctx.userId],
        );
        const u = users[0] ?? { score: null, level: "暂无评估" };
        const items = todos.map((t) => ({ ...t, done: !!t.done }));
        const doneCount = items.filter((t) => t.done).length;
        cards.push({ type: "overview", score: u.score, level: u.level, todos: items });
        return (
          `情绪自评${u.score == null ? "未评估" : u.score}（${u.level}，用户自评量表得分，非诊断）；今日待办${items.length}条，已完成${doneCount}条` +
          (items.length
            ? `：${items.map((t) => `${t.done ? "✔" : "○"}${t.text}`).join("；")}`
            : "")
        );
      },
    }),

    // ---- 健康记录（读） ----
    list_symptoms: tool({
      description:
        "查询用户历史症状记录（症状、程度、原因、时间），默认最近10条。用户问最近记录、之前哪里不舒服时调用。",
      inputSchema: z.object({
        limit: z.number().int().optional().describe("返回条数，默认10，最大20"),
      }),
      execute: async ({ limit }) => {
        const n = Math.min(Math.max(Number(limit ?? 10), 1), 20);
        const rows = await query<{
          symptom: string;
          severity: string;
          time: string;
          cause: string;
        }>(
          `SELECT symptom, severity,
                  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS time,
                  IFNULL(cause, '') AS cause
             FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
          [ctx.userId, n],
        );
        cards.push({ type: "symptom_list", items: rows });
        return rows.length
          ? rows
              .map(
                (r) =>
                  `${r.time} ${r.symptom}（${r.severity}${r.cause ? "，原因：" + r.cause : ""}）`,
              )
              .join("\n")
          : "还没有症状记录";
      },
    }),

    list_medicines: tool({
      description:
        "查询用户的用药/保健品提醒清单（名称、剂量、服用时间、注意事项及id）。用户问药、吃药提醒、用药打卡前调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await query<{
          id: number;
          name: string;
          dose: string;
          time: string;
          note: string | null;
        }>(
          `SELECT id, name, dose, med_time AS time, note
             FROM medicines WHERE user_id = ? ORDER BY id`,
          [ctx.userId],
        );
        cards.push({ type: "medicine_list", items: rows });
        return rows.length
          ? rows
              .map(
                (m) =>
                  `${m.id}.${m.name} ${m.dose} ${m.time}${m.note ? "（" + m.note + "）" : ""}`,
              )
              .join("\n")
          : "还没有用药提醒";
      },
    }),

    list_todos: tool({
      description: "查询调理待办，可指定日期（YYYY-MM-DD），默认今天。",
      inputSchema: z.object({
        date: z.string().optional().describe("日期 YYYY-MM-DD，默认今天"),
      }),
      execute: async ({ date }) => {
        const d = date && DATE_RE.test(date) ? date : null;
        const rows = await query<{
          id: number;
          text: string;
          time: string;
          done: number;
          type: string;
        }>(
          `SELECT id, content AS text, todo_time AS time, is_done AS done, type
             FROM todos WHERE user_id = ? AND todo_date = COALESCE(?, CURDATE()) ORDER BY todo_time`,
          [ctx.userId, d],
        );
        const items = rows.map((t) => ({ ...t, done: !!t.done }));
        cards.push({ type: "todo_list", date: d, items });
        return items.length
          ? items.map((t) => `${t.done ? "✔" : "○"}${t.time ? t.time + " " : ""}${t.text}`).join("\n")
          : d
            ? `${d} 没有待办`
            : "今天还没有待办";
      },
    }),

    // ---- 我的（读） ----
    get_profile: tool({
      description:
        "获取用户健康档案：中医体质（自述）、过敏史、饮食/运动/作息偏好、体感敏感度与情绪自评结果。给个性化建议前可先调用。",
      inputSchema: z.object({}),
      execute: async () => {
        const users = await query<{ name: string; score: number | null; level: string | null }>(
          "SELECT name, score, level FROM users WHERE id = ?",
          [ctx.userId],
        );
        const rows = await query<Record<string, string | null>>(
          `SELECT constitution, allergy, diet_pref, exercise_pref, sleep_pref, body_sense,
                  wake_time, nap_time, bed_time
             FROM health_profiles WHERE user_id = ?`,
          [ctx.userId],
        );
        const u = users[0] ?? { name: "", score: null, level: null };
        const p = rows[0] ?? {};
        const data = {
          name: u.name || "",
          score: u.score,
          level: u.level,
          constitution: p.constitution,
          allergy: p.allergy,
          dietPref: p.diet_pref,
          exercisePref: p.exercise_pref,
          sleepPref: p.sleep_pref,
          bodySense: p.body_sense,
          wakeTime: p.wake_time,
          napTime: p.nap_time,
          bedTime: p.bed_time,
        };
        const targetRhythm =
          p.wake_time || p.nap_time || p.bed_time
            ? `目标起床${p.wake_time || "未设"} / 午憩${p.nap_time || "未设"} / 入睡${p.bed_time || "未设"}`
            : "未设置目标作息时间";
        cards.push({ type: "profile", data });
        return [
          `昵称：${data.name || "未设置"}；情绪自评${data.score == null ? "未评估" : data.score}（${data.level}，自评量表，非诊断）`,
          `用户自述体质：${data.constitution || "未填"}（用户自填，非辨识结果）；过敏史：${data.allergy || "未填"}`,
          `饮食偏好：${data.dietPref || "未填"}；运动习惯：${data.exercisePref || "未填"}`,
          `作息规律：${data.sleepPref || "未填"}；体感敏感度：${data.bodySense || "未填"}`,
          targetRhythm,
        ].join("\n");
      },
    }),

    // ---- 写操作提案（只出确认卡，不写库） ----
    propose_record_symptom: tool({
      description:
        "用户明确要求记录症状时调用。生成症状记录确认卡（不直接写入），并在回复中提示用户点击确认按钮。",
      inputSchema: z.object({
        symptom: z.string().describe("症状名称，如 头疼/胸闷/失眠/易怒/腹胀/口苦"),
        severity: z.enum(SEVERITIES).optional().describe("程度，默认轻度"),
        cause: z.string().optional().describe("可能原因，如 熬夜、压力大"),
      }),
      execute: async ({ symptom, severity, cause }) => {
        cards.push({
          type: "confirm_symptom",
          payload: {
            symptom,
            severity: severity ?? "轻度",
            cause: cause ?? null,
          },
        });
        return `已生成症状记录确认卡（${symptom}/${severity ?? "轻度"}${cause ? "/" + cause : ""}），等待用户确认。请提示用户点击卡片上的确认按钮，不要声称已经记录成功。`;
      },
    }),

    propose_mood_checkin: tool({
      description:
        "用户明确要求记录心情/情绪打卡时调用。生成情绪打卡确认卡（不直接写入），提示用户点击确认。",
      inputSchema: z.object({
        mood: z.string().describe("情绪：舒畅/一般/烦躁/焦虑/低落/疲惫"),
      }),
      execute: async ({ mood }) => {
        cards.push({ type: "confirm_mood", payload: { mood } });
        return `已生成情绪打卡确认卡（${mood}），等待用户确认。请提示用户点击确认按钮，不要声称已经打卡成功。`;
      },
    }),

    propose_add_todo: tool({
      description:
        "用户明确要求提醒/待办（如“提醒我晚上10点泡脚”）时调用。生成待办确认卡（不直接写入），提示用户确认。",
      inputSchema: z.object({
        content: z.string().describe("待办内容，如 泡脚20分钟"),
        time: z.string().optional().describe("提醒时刻 HH:mm"),
        type: z.enum(TODO_TYPES).optional().describe("类型：med用药/ai养生/sleep作息/diet饮食"),
        date: z.string().optional().describe("日期 YYYY-MM-DD，默认今天"),
      }),
      execute: async ({ content, time, type, date }) => {
        const t = time && TIME_RE.test(time) ? time : "";
        const d = date && DATE_RE.test(date) ? date : "";
        cards.push({
          type: "confirm_todo",
          payload: { content, time: t, type: type ?? "ai", date: d },
        });
        return `已生成待办确认卡（${content}${t ? " " + t : ""}），等待用户确认。请提示用户点击确认按钮，不要声称已经添加成功。`;
      },
    }),

    propose_update_profile: tool({
      description:
        "用户明确提供体质、过敏史、饮食/运动/作息偏好、体感敏感度等个人信息并要求保存时调用。生成档案更新确认卡（不直接写入）。至少传一个字段。",
      inputSchema: z.object({
        constitution: z
          .string()
          .optional()
          .describe("用户自述的中医体质，如 气郁质/阳虚质（仅记录，不得据此判定体质）"),
        allergy: z.string().optional().describe("过敏史"),
        dietPref: z.string().optional().describe("饮食偏好"),
        exercisePref: z.string().optional().describe("运动习惯"),
        sleepPref: z.string().optional().describe("作息规律"),
        bodySense: z.string().optional().describe("体感敏感度，如 怕冷/正常/怕热"),
      }),
      execute: async (args) => {
        const payload: Record<string, string> = {};
        for (const [k, v] of Object.entries(args)) {
          if (typeof v === "string" && v.trim()) payload[k] = v.trim();
        }
        if (!Object.keys(payload).length) return "至少需要提供一个档案字段，请向用户确认要保存的内容";
        cards.push({ type: "confirm_profile", payload });
        return `已生成档案更新确认卡（${Object.keys(payload).join("、")}），等待用户确认。请提示用户点击确认按钮，不要声称已经保存成功。`;
      },
    }),

    propose_medicine_punch: tool({
      description:
        "用户明确表示已服用某个药/保健品并要打卡时调用。需先用 list_medicines 拿到 medicineId 与名称。生成用药打卡确认卡（不直接写入）。",
      inputSchema: z.object({
        medicineId: z.number().int().describe("药品 id（来自 list_medicines）"),
        medicineName: z.string().describe("药品名称，用于卡片展示"),
      }),
      execute: async ({ medicineId, medicineName }) => {
        cards.push({ type: "confirm_medicine", payload: { medicineId, medicineName } });
        return `已生成用药打卡确认卡（${medicineName}），等待用户确认。请提示用户点击确认按钮，不要声称已经打卡成功。`;
      },
    }),
  };
}

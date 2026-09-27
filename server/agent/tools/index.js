/**
 * AI 工具层：把七大板块的查询/记录能力注册为大模型可调用的函数工具
 * - 只读工具：查库/查天气，结果既返回给模型（summary），也产出结构化卡片（card）
 * - 写操作提案工具：不直接写库，只产出 confirm_* 确认卡，由用户在前端确认后走现有 REST 接口
 * 执行上下文 ctx: { userId, clientIp }
 */
const { pool } = require('../../db/pool');
const { getClothingByIp } = require('../../services/weather');
const { dietData, clothingData, exerciseData } = require('../../services/contentData');
const kb = require('../../services/knowledge');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TODO_TYPES = ['med', 'ai', 'sleep', 'diet'];
const SEVERITIES = ['轻度', '中度', '重度'];

// 工具入参校验失败时抛出，编排器会把错误信息喂回模型让其自我纠正
class ToolArgError extends Error {}

function requireStr(args, key, max = 100) {
  const v = (args[key] == null ? '' : String(args[key])).trim();
  if (!v) throw new ToolArgError(`参数 ${key} 不能为空`);
  return v.slice(0, max);
}

function optionalStr(args, key, max) {
  if (args[key] == null || args[key] === '') return null;
  return String(args[key]).trim().slice(0, max);
}

function toInt(args, key) {
  const v = Number(args[key]);
  if (!Number.isInteger(v)) throw new ToolArgError(`参数 ${key} 必须是整数`);
  return v;
}

// ============ 工具定义 ============

const TOOL_DEFS = [
  // ---- 居家保健 ----
  {
    name: 'query_acupoints',
    description: '按症状分组查询推荐穴位。分组：stress=压力大生气胸闷疏肝组，neck=久坐肩颈僵硬组，sleep=熬夜失眠安神组，office=办公随手按组。用户描述不适时优先调用，再按结果给出按揉建议。',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['stress', 'neck', 'sleep', 'office'], description: '症状分组' },
      },
      required: ['category'],
    },
    run: async (args) => {
      const category = requireStr(args, 'category', 20);
      if (!['stress', 'neck', 'sleep', 'office'].includes(category)) {
        throw new ToolArgError('category 只能是 stress/neck/sleep/office');
      }
      const rows = kb.listAcupoints(category);
      return {
        card: {
          type: 'acupoint_list',
          category,
          items: rows.map(r => ({ id: r.id, name: r.name, tag: r.tag, effect: kb.firstSentence(r.effect), icon: r.icon })),
        },
        summary: rows.map(r => `${r.id}.${r.name}（${r.tag}）：${kb.firstSentence(r.effect, 50)}`).join('\n') || '该分组暂无穴位数据',
      };
    },
  },
  {
    name: 'get_acupoint_detail',
    description: '查询单个穴位的归经、标准/简易定位、按揉手法、时长频率、适用症状与禁忌。需先用 query_acupoints 拿到穴位 id。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer', description: '穴位 id（来自 query_acupoints）' } },
      required: ['id'],
    },
    run: async (args) => {
      const id = toInt(args, 'id');
      const r = kb.getAcupoint(id);
      if (!r) throw new ToolArgError(`穴位 id=${id} 不存在，请先用 query_acupoints 查询`);
      return {
        card: {
          type: 'acupoint_detail',
          item: {
            id: r.id, name: r.name, tag: r.tag, effect: kb.firstSentence(r.effect, 60), icon: r.icon,
            location: r.location_easy, method: r.method, duration: r.duration, frequency: '',
          },
        },
        summary: [
          `${r.name}（${r.meridian}）`,
          `标准定位：${r.location_std}`,
          `简易找法：${r.location_easy}`,
          `手法：${r.method}`,
          `时长频率：${r.duration}`,
          `适用症状：${r.indications}`,
          `禁忌：${r.contraindication}`,
        ].join('\n'),
      };
    },
  },
  {
    name: 'match_footbath',
    description: '根据用户当前状态（如失眠、手脚冰凉、压力大）匹配中药泡脚配方，给出药材、水温和时长。',
    parameters: {
      type: 'object',
      properties: { status: { type: 'string', description: '用户自述的当前状态，如“失眠多梦、手脚冰凉”' } },
      required: ['status'],
    },
    run: async (args) => {
      const status = requireStr(args, 'status', 200);
      const recipe = kb.matchFootbath(status);
      if (!recipe) throw new ToolArgError('泡脚配方数据暂不可用');
      const payload = { name: recipe.name, herbs: recipe.herbs, temp: recipe.temp, duration: recipe.duration };
      return {
        card: { type: 'footbath', recipe: payload },
        summary: [
          `${payload.name}`,
          `药材：${payload.herbs}`,
          `煎法：${recipe.method}`,
          `水温${payload.temp}，泡${payload.duration}`,
          `功效：${recipe.effect}`,
          `禁忌：${recipe.contraindication}`,
        ].join('\n'),
      };
    },
  },

  // ---- 饮食调理 ----
  {
    name: 'get_diet',
    description: '获取今日饮食原则、疏肝推荐食材红榜、肝郁避雷黑榜与一日食谱。用户问吃什么、饮食建议时调用。',
    parameters: { type: 'object', properties: {} },
    run: async () => ({
      card: { type: 'diet', data: dietData },
      summary: [
        `今日原则：${dietData.recommend.principle}`,
        `推荐茶饮：${dietData.goodFoods.tea.join('、')}`,
        `推荐主食：${dietData.goodFoods.staple.join('、')}`,
        `推荐蔬菜：${dietData.goodFoods.vegetable.join('、')}`,
        `推荐水果：${dietData.goodFoods.fruit.join('、')}`,
        `避雷生冷：${dietData.badFoods.cold.join('、')}`,
        `避雷辛辣油炸：${dietData.badFoods.spicy.join('、')}`,
        `避雷过酸：${dietData.badFoods.sour.join('、')}`,
        `食谱：${dietData.recipes.map(r => `${r.time}${r.name}（${r.ingredients}）`).join('；')}`,
      ].join('\n'),
    }),
  },

  // ---- 药膳食疗（知识库） ----
  {
    name: 'get_diet_therapy',
    description: '按类别查询疏肝养生药膳食疗方：tea=茶饮方（5款），porridge=汤粥方（3款），dish=食疗菜（2款）。每款含材料用量、做法、功效、适用体质、禁忌、频率。用户问喝茶/养生茶/粥/汤/食疗菜时调用。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['tea', 'porridge', 'dish'], description: '茶饮/汤粥/食疗菜' },
      },
      required: ['type'],
    },
    run: async (args) => {
      const type = requireStr(args, 'type', 10);
      const list = kb.getDietTherapy(type);
      if (!list) throw new ToolArgError('type 只能是 tea/porridge/dish');
      const label = { tea: '茶饮方', porridge: '汤粥方', dish: '食疗菜' }[type];
      const summary = list.map((r, i) => [
        `${i + 1}.${r.name}`,
        `材料：${r.ingredients}`,
        `做法：${r.method}`,
        `功效：${r.effect}`,
        `适用：${r.suitable}`,
        `禁忌：${r.contraindication}`,
        `频率：${r.frequency}`,
      ].join('\n')).join('\n\n');
      return { summary: `【${label}】\n${summary}` };
    },
  },

  // ---- 中成药说明书科普（知识库；只做说明书层面信息，不做用药决策） ----
  {
    name: 'query_medicine_info',
    description: '查询逍遥丸、加味逍遥丸、柴胡疏肝散、越鞠丸、归脾丸、酸枣仁丸等中成药的说明书层面信息：成分、功能主治、适用证候、用法用量、禁忌慎用、相互作用。仅作科普。用户问某中成药是什么/成分/主治/禁忌/能否吃时调用；涉及停药、换药、调剂量时不要据此给方案，应建议咨询开方医生或药师。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '中成药名称或关键词，如 逍遥丸/归脾丸/酸枣仁' } },
      required: ['name'],
    },
    run: async (args) => {
      const name = requireStr(args, 'name', 30);
      const m = kb.findMedicine(name);
      if (!m) {
        throw new ToolArgError(`未找到与“${name}”相关的中成药，可选：${kb.listMedicineNames().join('、')}`);
      }
      return {
        summary: [
          `${m.name}（说明书层面科普，不构成用药建议）`,
          `主要成分：${m.ingredients}`,
          `功能主治：${m.effect}`,
          `适用证候：${m.syndrome}`,
          `用法用量：${m.dosage}`,
          `禁忌与慎用：${m.caution}`,
          `药物相互作用：${m.interaction}`,
        ].join('\n'),
      };
    },
  },

  // ---- 穿衣建议 ----
  {
    name: 'get_clothing',
    description: '获取用户所在城市的实时天气与穿衣、重点保暖部位建议。用户问出门穿什么、天气、降温保暖时调用。',
    parameters: { type: 'object', properties: {} },
    run: async (args, ctx) => {
      const data = (await getClothingByIp(ctx.clientIp)) || clothingData;
      return {
        card: { type: 'clothing', data },
        summary: [
          `${data.city} ${data.weather || ''} ${data.temp}°C（最高${data.high}°C/最低${data.low}°C，温差${data.diff}°C）`,
          `风：${data.wind}；湿度：${data.humidity}%`,
          `穿衣原则：${data.principle}`,
          `内搭：${data.inner}；外套：${data.outer}；鞋子：${data.shoes}`,
        ].join('\n'),
      };
    },
  },

  // ---- 生活节律 ----
  {
    name: 'get_exercises',
    description: '获取疏肝轻运动建议列表（八段锦单式、梳头功、扩胸、拉伸、478呼吸等），含时长与功效。',
    parameters: { type: 'object', properties: {} },
    run: async () => ({
      card: { type: 'exercise', items: exerciseData },
      summary: exerciseData.map(e => `${e.name}（${e.duration}，${e.tag}）`).join('\n'),
    }),
  },

  // ---- 功法带练 ----
  {
    name: 'get_practice_moves',
    description: '获取八段锦完整八式动作序列（名称、每式时长），用于带练或讲解。用户问八段锦、功法带练、整套动作时调用。',
    parameters: { type: 'object', properties: {} },
    run: async () => {
      const rows = kb.getPracticeMoves();
      return {
        card: { type: 'practice', items: rows },
        summary: rows.map(m => `${m.id}.${m.name} ${m.duration}`).join('\n') || '功法数据暂不可用',
      };
    },
  },
  {
    name: 'get_practice_detail',
    description: '查询八段锦某一式的分步要领、呼吸配合、次数时长、常见错误、功效与注意事项；传入“478/呼吸”可查 478 呼吸法（含不适应人群）。需先用 get_practice_moves 拿到式名。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '八段锦式名（如 两手托天理三焦）或 478呼吸' } },
      required: ['name'],
    },
    run: async (args) => {
      const name = requireStr(args, 'name', 30);
      const d = kb.getPracticeDetail(name);
      if (!d) throw new ToolArgError(`未找到“${name}”，请用 get_practice_moves 查询八式名称，或传“478呼吸”`);
      const lines = [`${d.name}`];
      if (d.steps) lines.push(`分步要领：${d.steps}`);
      if (d.breath) lines.push(`呼吸配合：${d.breath}`);
      if (d.duration) lines.push(`次数时长：${d.duration}`);
      if (d.mistakes) lines.push(`常见错误：${d.mistakes}`);
      if (d.effect) lines.push(`功效：${d.effect}`);
      if (d.cautions) lines.push(`注意事项：${d.cautions}`);
      if (d.rounds) lines.push(`轮次：${d.rounds}`);
      if (d.unsuitable) lines.push(`不适应人群：${d.unsuitable}`);
      return { summary: lines.join('\n') };
    },
  },

  // ---- 体质与高频症状（知识库，含就医红线） ----
  {
    name: 'get_constitution_guide',
    description: '查询气郁质的体质特征、常见表现、与气虚/阴虚/痰湿的夹杂关系、核心疏肝调理方向（运动/心理/中医）与判断依据。用户问自己是不是气郁质、气郁怎么调理时调用。',
    parameters: { type: 'object', properties: {} },
    run: async () => {
      const c = kb.getConstitution();
      if (!c) throw new ToolArgError('体质数据暂不可用');
      return {
        summary: [
          `${c.name}`,
          `体质特征：${c.features}`,
          `常见表现：${c.manifestations}`,
          `夹杂关系：\n${c.mixed_relations}`,
          `核心方法：${c.core_method}`,
          `调理方向：${c.care_guide}`,
          `判断依据：${c.diagnosis}`,
        ].join('\n'),
      };
    },
  },
  {
    name: 'query_symptom_guide',
    description: '查询高频症状的权威调理与就医指引：胸闷、两胁胀痛、失眠多梦、易怒、头晕、咽喉异物感（梅核气）、肩颈僵硬、叹气、口苦。返回表现、常见诱因、可能关联证型、日常调理方向、何时必须就医（红线）。用户描述具体不适时优先调用，并把就医红线传达给用户。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '症状名称，如 胸闷/失眠/梅核气/肩颈/口苦' } },
      required: ['name'],
    },
    run: async (args) => {
      const name = requireStr(args, 'name', 20);
      const s = kb.findSymptom(name);
      if (!s) {
        throw new ToolArgError(`未收录症状“${name}”，目前支持：${kb.listSymptomNames().join('、')}`);
      }
      return {
        summary: [
          `${s.name}`,
          `表现：${s.manifestation}`,
          `常见诱因：${s.causes}`,
          `可能关联证型：${s.syndromes}`,
          `日常调理方向：${s.care_guide}`,
          `何时异常需就医：${s.seek_doctor}`,
        ].join('\n'),
      };
    },
  },

  // ---- 首页/我的 ----
  {
    name: 'get_today_overview',
    description: '获取用户今日健康概览：肝郁指数、等级与今日调理待办及完成情况。用户问今天状态、今日调理、概览时调用。',
    parameters: { type: 'object', properties: {} },
    run: async (args, ctx) => {
      const [users] = await pool.query('SELECT score, level FROM users WHERE id = ?', [ctx.userId]);
      const [todos] = await pool.query(
        `SELECT id, content AS text, todo_time AS time, is_done AS done, type
           FROM todos WHERE user_id = ? AND todo_date = CURDATE() ORDER BY todo_time`,
        [ctx.userId],
      );
      const u = users[0] || { score: null, level: '暂无评估' };
      const items = todos.map(t => ({ ...t, done: !!t.done }));
      const doneCount = items.filter(t => t.done).length;
      return {
        card: { type: 'overview', score: u.score, level: u.level, todos: items },
        summary: `肝郁指数${u.score == null ? '未评估' : u.score}（${u.level}）；今日待办${items.length}条，已完成${doneCount}条`
          + (items.length ? `：${items.map(t => `${t.done ? '✔' : '○'}${t.text}`).join('；')}` : ''),
      };
    },
  },

  // ---- 健康记录（读） ----
  {
    name: 'list_symptoms',
    description: '查询用户历史症状记录（症状、程度、原因、时间），默认最近10条。用户问最近记录、之前哪里不舒服时调用。',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '返回条数，默认10，最大20' } },
    },
    run: async (args, ctx) => {
      let limit = args.limit == null ? 10 : Number(args.limit);
      if (!Number.isInteger(limit) || limit <= 0) throw new ToolArgError('limit 必须是正整数');
      limit = Math.min(limit, 20);
      const [rows] = await pool.query(
        `SELECT symptom, severity,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS time,
                IFNULL(cause, '') AS cause
           FROM symptoms WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [ctx.userId, limit],
      );
      return {
        card: { type: 'symptom_list', items: rows },
        summary: rows.length
          ? rows.map(r => `${r.time} ${r.symptom}（${r.severity}${r.cause ? '，原因：' + r.cause : ''}）`).join('\n')
          : '还没有症状记录',
      };
    },
  },
  {
    name: 'list_medicines',
    description: '查询用户的用药/保健品提醒清单（名称、剂量、服用时间、注意事项及id）。用户问药、吃药提醒、用药打卡前调用。',
    parameters: { type: 'object', properties: {} },
    run: async (args, ctx) => {
      const [rows] = await pool.query(
        `SELECT id, name, dose, med_time AS time, note,
                DATE_FORMAT(last_punch_at, '%Y-%m-%d %H:%i') AS lastPunch
           FROM medicines WHERE user_id = ? ORDER BY id`, [ctx.userId],
      );
      return {
        card: { type: 'medicine_list', items: rows },
        summary: rows.length
          ? rows.map(m => `${m.id}.${m.name} ${m.dose} ${m.time}${m.note ? '（' + m.note + '）' : ''}`).join('\n')
          : '还没有用药提醒',
      };
    },
  },
  {
    name: 'list_todos',
    description: '查询调理待办，可指定日期（YYYY-MM-DD），默认今天。',
    parameters: {
      type: 'object',
      properties: { date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' } },
    },
    run: async (args, ctx) => {
      const date = args.date == null || args.date === '' ? null : String(args.date).trim();
      if (date && !DATE_RE.test(date)) throw new ToolArgError('日期格式应为 YYYY-MM-DD');
      const [rows] = await pool.query(
        `SELECT id, content AS text, todo_time AS time, is_done AS done, type
           FROM todos WHERE user_id = ? AND todo_date = COALESCE(?, CURDATE()) ORDER BY todo_time`,
        [ctx.userId, date],
      );
      const items = rows.map(t => ({ ...t, done: !!t.done }));
      return {
        card: { type: 'todo_list', date, items },
        summary: items.length
          ? items.map(t => `${t.done ? '✔' : '○'}${t.time ? t.time + ' ' : ''}${t.text}`).join('\n')
          : (date ? `${date} 没有待办` : '今天还没有待办'),
      };
    },
  },

  // ---- 我的（读） ----
  {
    name: 'get_profile',
    description: '获取用户健康档案：中医体质、过敏史、饮食/运动/作息偏好、体感敏感度与肝郁指数。给个性化建议前可先调用。',
    parameters: { type: 'object', properties: {} },
    run: async (args, ctx) => {
      const [users] = await pool.query(
        'SELECT name, score, level FROM users WHERE id = ?', [ctx.userId],
      );
      const [rows] = await pool.query(
        `SELECT constitution, allergy, diet_pref, exercise_pref, sleep_pref, body_sense,
                wake_time, nap_time, bed_time
           FROM health_profiles WHERE user_id = ?`, [ctx.userId],
      );
      const u = users[0] || {};
      const p = rows[0] || {};
      const data = {
        name: u.name || '', score: u.score, level: u.level,
        constitution: p.constitution, allergy: p.allergy,
        dietPref: p.diet_pref, exercisePref: p.exercise_pref,
        sleepPref: p.sleep_pref, bodySense: p.body_sense,
        wakeTime: p.wake_time, napTime: p.nap_time, bedTime: p.bed_time,
      };
      const targetRhythm = (p.wake_time || p.nap_time || p.bed_time)
        ? `目标起床${p.wake_time || '未设'} / 午憩${p.nap_time || '未设'} / 入睡${p.bed_time || '未设'}`
        : '未设置目标作息时间';
      return {
        card: { type: 'profile', data },
        summary: [
          `昵称：${data.name || '未设置'}；肝郁指数${data.score == null ? '未评估' : data.score}（${data.level}）`,
          `体质：${data.constitution || '未填'}；过敏史：${data.allergy || '未填'}`,
          `饮食偏好：${data.dietPref || '未填'}；运动习惯：${data.exercisePref || '未填'}`,
          `作息规律：${data.sleepPref || '未填'}；体感敏感度：${data.bodySense || '未填'}`,
          targetRhythm,
        ].join('\n'),
      };
    },
  },

  // ---- 写操作提案（只出确认卡，不写库） ----
  {
    name: 'propose_record_symptom',
    description: '用户明确要求记录症状时调用。生成症状记录确认卡（不直接写入），并在回复中提示用户点击确认按钮。',
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        symptom: { type: 'string', description: '症状名称，如 头疼/胸闷/失眠/易怒/腹胀/口苦' },
        severity: { type: 'string', enum: SEVERITIES, description: '程度，默认轻度' },
        cause: { type: 'string', description: '可能原因，如 熬夜、压力大（可选）' },
      },
      required: ['symptom'],
    },
    run: async (args) => {
      const symptom = requireStr(args, 'symptom', 50);
      const severity = SEVERITIES.includes(args.severity) ? args.severity : '轻度';
      const cause = optionalStr(args, 'cause', 255);
      return {
        card: { type: 'confirm_symptom', payload: { symptom, severity, cause } },
        summary: `已生成症状记录确认卡（${symptom}/${severity}${cause ? '/' + cause : ''}），等待用户确认。请提示用户点击卡片上的确认按钮，不要声称已经记录成功。`,
      };
    },
  },
  {
    name: 'propose_mood_checkin',
    description: '用户明确要求记录心情/情绪打卡时调用。生成情绪打卡确认卡（不直接写入），提示用户点击确认。',
    mutating: true,
    parameters: {
      type: 'object',
      properties: { mood: { type: 'string', description: '情绪：舒畅/一般/烦躁/焦虑/低落/疲惫' } },
      required: ['mood'],
    },
    run: async (args) => {
      const mood = requireStr(args, 'mood', 20);
      return {
        card: { type: 'confirm_mood', payload: { mood } },
        summary: `已生成情绪打卡确认卡（${mood}），等待用户确认。请提示用户点击确认按钮，不要声称已经打卡成功。`,
      };
    },
  },
  {
    name: 'propose_add_todo',
    description: '用户明确要求提醒/待办（如“提醒我晚上10点泡脚”）时调用。生成待办确认卡（不直接写入），提示用户确认。',
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '待办内容，如 泡脚20分钟' },
        time: { type: 'string', description: '提醒时刻 HH:mm（可选）' },
        type: { type: 'string', enum: TODO_TYPES, description: '类型：med用药/ai养生/sleep作息/diet饮食，默认ai' },
        date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天（可选）' },
      },
      required: ['content'],
    },
    run: async (args) => {
      const content = requireStr(args, 'content', 255);
      const time = optionalStr(args, 'time', 10);
      if (time && !TIME_RE.test(time)) throw new ToolArgError('提醒时间格式应为 HH:mm');
      const type = TODO_TYPES.includes(args.type) ? args.type : 'ai';
      const date = optionalStr(args, 'date', 10);
      if (date && !DATE_RE.test(date)) throw new ToolArgError('日期格式应为 YYYY-MM-DD');
      return {
        card: { type: 'confirm_todo', payload: { content, time: time || '', type, date: date || '' } },
        summary: `已生成待办确认卡（${content}${time ? ' ' + time : ''}），等待用户确认。请提示用户点击确认按钮，不要声称已经添加成功。`,
      };
    },
  },
  {
    name: 'propose_update_profile',
    description: '用户明确提供体质、过敏史、饮食/运动/作息偏好、体感敏感度等个人信息并要求保存时调用。生成档案更新确认卡（不直接写入）。至少传一个字段。',
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        constitution: { type: 'string', description: '中医体质，如 气郁质/阳虚质' },
        allergy: { type: 'string', description: '过敏史' },
        dietPref: { type: 'string', description: '饮食偏好' },
        exercisePref: { type: 'string', description: '运动习惯' },
        sleepPref: { type: 'string', description: '作息规律' },
        bodySense: { type: 'string', description: '体感敏感度，如 怕冷/正常/怕热' },
      },
    },
    run: async (args) => {
      const payload = {};
      for (const [k, max] of Object.entries({
        constitution: 50, allergy: 255, dietPref: 50, exercisePref: 50, sleepPref: 50, bodySense: 50,
      })) {
        const v = optionalStr(args, k, max);
        if (v) payload[k] = v;
      }
      if (!Object.keys(payload).length) throw new ToolArgError('至少需要提供一个档案字段');
      return {
        card: { type: 'confirm_profile', payload },
        summary: `已生成档案更新确认卡（${Object.keys(payload).join('、')}），等待用户确认。请提示用户点击确认按钮，不要声称已经保存成功。`,
      };
    },
  },
  {
    name: 'propose_medicine_punch',
    description: '用户明确表示已服用某个药/保健品并要打卡时调用。需先用 list_medicines 拿到 medicineId 与名称。生成用药打卡确认卡（不直接写入）。',
    mutating: true,
    parameters: {
      type: 'object',
      properties: {
        medicineId: { type: 'integer', description: '药品 id（来自 list_medicines）' },
        medicineName: { type: 'string', description: '药品名称，用于卡片展示' },
      },
      required: ['medicineId', 'medicineName'],
    },
    run: async (args) => {
      const medicineId = toInt(args, 'medicineId');
      const medicineName = requireStr(args, 'medicineName', 100);
      return {
        card: { type: 'confirm_medicine', payload: { medicineId, medicineName } },
        summary: `已生成用药打卡确认卡（${medicineName}），等待用户确认。请提示用户点击确认按钮，不要声称已经打卡成功。`,
      };
    },
  },
];

// 对外暴露的 OpenAI/DeepSeek 兼容 tools 结构
const TOOLS = TOOL_DEFS.map(d => ({
  type: 'function',
  function: { name: d.name, description: d.description, parameters: d.parameters },
}));

const TOOL_MAP = new Map(TOOL_DEFS.map(d => [d.name, d]));

/**
 * 执行一个工具调用
 * @returns {Promise<{ok:true, card?:object, summary:string} | {ok:false, summary:string}>}
 */
async function execute(name, args, ctx) {
  const def = TOOL_MAP.get(name);
  if (!def) return { ok: false, summary: `工具 ${name} 不存在` };
  try {
    const result = await def.run(args || {}, ctx);
    return { ok: true, card: result.card, summary: result.summary };
  } catch (err) {
    if (err instanceof ToolArgError) return { ok: false, summary: `参数错误：${err.message}` };
    console.error(`[tools] 执行 ${name} 失败:`, err.message);
    return { ok: false, summary: '该数据暂时不可用，请改为基于一般养生知识回答，并告知用户稍后可在对应板块查看' };
  }
}

module.exports = { TOOLS, TOOL_MAP, execute };

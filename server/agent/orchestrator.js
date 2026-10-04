/**
 * 对话编排器
 * 流程：用户/会话解析 → 保存用户消息 → 安全预检 → 组装记忆
 *       → 大模型函数调用循环（只读工具自动执行；写操作只产出确认卡）→ 保存回复
 */
const store = require('./chatStore');
const safety = require('./safety');
const provider = require('./providers/deepseek');
const { SYSTEM_PROMPT } = require('./prompts/system');
const { TOOLS, execute } = require('./tools');
const { buildHealthContext } = require('../services/chronicProfile');

// 最多两轮工具调用，防止模型反复调工具拖慢响应
const MAX_TOOL_ROUNDS = 2;

// 模型“没用工具却声称卡片/记录已生成”的幻觉信号（多轮会话模仿历史措辞时会出现）
const CARD_HALLUCINATION_RE = /确认卡|确认按钮|已经帮你(?:记录|添加|设置|生成|打卡|保存)|已(?:帮你)?(?:记录|添加|设置|生成|打卡|保存)(?:了|好)?(?:一条|一个|一张)?(?:提醒|待办|症状|卡片|心情|档案|用药)?/;

async function handle({ userId, sessionId, message, clientIp }) {
  const user = await store.resolveUser(userId);
  const session = await store.resolveSession(user, sessionId);

  // 先保存用户消息，并用首条消息自动命名会话
  await store.appendMessage(session.id, 'user', message);
  await store.renameSessionIfDefault(session.id, message.slice(0, 20));

  // 安全预检
  const guard = safety.detect(message);

  let reply;
  let cards = [];

  if (guard.level === 'normal') {
    const history = await store.loadHistory(session.id);
    // 用户慢病/孕哺/过敏背景：仅在有档案时追加到系统提示词，用于禁忌提醒
    const healthCtx = await buildHealthContext(user.id);
    const systemContent = healthCtx
      ? SYSTEM_PROMPT + '\n\n' + healthCtx
      : SYSTEM_PROMPT;
    // 工具调用过程只存在于本次请求内存，不写库，避免污染历史记忆
    const messages = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: message },
    ];
    const ctx = { userId: user.id, clientIp: clientIp || '' };

    let result;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      result = await provider.chat(messages, { tools: TOOLS });
      if (!result.toolCalls.length) break; // 模型给出最终文字回复

      // 回传带 tool_calls 的 assistant 消息
      messages.push(result.rawAssistant);

      // 逐个执行工具，并把结果作为 tool 消息喂回模型
      for (const call of result.toolCalls) {
        const out = await execute(call.name, call.args, ctx);
        if (out.ok && out.card) cards.push(out.card);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: out.summary,
        });
      }

      // 最后一轮仍在调工具：再请求一次且不再带工具，迫使模型输出文字总结
      if (round === MAX_TOOL_ROUNDS - 1) {
        result = await provider.chat(messages);
      }
    }

    reply = (result.content || '').trim()
      || '我已经把相关建议整理在下面的卡片里啦，点开看看哪条适合今天的你～';

    // 幻觉兜底：模型没用工具却在文字里声称卡片已生成/已记录时，强制纠偏一轮，真正调用 propose_* 工具
    if (cards.length === 0 && CARD_HALLUCINATION_RE.test(reply)) {
      messages.push({ role: 'assistant', content: reply });
      messages.push({
        role: 'user',
        content: '系统提醒：你本轮没有调用任何工具，却声称已经生成确认卡片或完成记录，这是不允许的。请立即针对用户本轮的原始请求，调用对应的 propose_* 工具生成确认卡；若用户意图不属于可记录范围，则正常用文字回复，不要提及卡片。',
      });
      const corrected = await provider.chat(messages, { tools: TOOLS });
      if (corrected.toolCalls.length) {
        messages.push(corrected.rawAssistant);
        for (const call of corrected.toolCalls) {
          const out = await execute(call.name, call.args, ctx);
          if (out.ok && out.card) cards.push(out.card);
          messages.push({ role: 'tool', tool_call_id: call.id, content: out.summary });
        }
        const finalRes = await provider.chat(messages);
        const finalText = (finalRes.content || '').trim();
        if (finalText) reply = finalText;
      }
    }
  } else {
    reply = guard.reply;
  }

  await store.appendMessage(session.id, 'assistant', reply);

  return {
    reply,
    cards,
    sessionId: session.id,
    userId: user.id,
    storage: store.getStorageMode(),
    safetyLevel: guard.level,
  };
}

/**
 * 流式对话（SSE）
 * 与 handle() 逻辑等价，区别：
 *  - 首轮直接流式请求（带工具），文字增量实时 emit('delta', text) 给前端，
 *    保证「不调工具直接回答」这一最常见路径逐字输出；
 *  - 模型若决定调工具，调工具前通常不输出文字；万一已吐出引导语，
 *    通过 emit('reset') 通知前端清空气泡，再走工具轮次；
 *  - 工具执行轮次保持非流式（工具完成前不产生面向用户的文字）；
 *  - 工具完成后的最终总结用流式输出。
 * @param {Function} emit (event, payload) => void，事件：delta / reset
 */
async function handleStream({ userId, sessionId, message, clientIp }, emit) {
  const user = await store.resolveUser(userId);
  const session = await store.resolveSession(user, sessionId);

  // 先保存用户消息，并用首条消息自动命名会话
  await store.appendMessage(session.id, 'user', message);
  await store.renameSessionIfDefault(session.id, message.slice(0, 20));

  // 安全预检
  const guard = safety.detect(message);

  let reply = '';
  let cards = [];

  if (guard.level !== 'normal') {
    // 安全拦截：一次性给出拦截话术
    reply = guard.reply;
    emit('delta', reply);
  } else {
    const history = await store.loadHistory(session.id);
    const healthCtx = await buildHealthContext(user.id);
    const systemContent = healthCtx
      ? SYSTEM_PROMPT + '\n\n' + healthCtx
      : SYSTEM_PROMPT;
    const messages = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: message },
    ];
    const ctx = { userId: user.id, clientIp: clientIp || '' };

    // 首轮流式：文字增量直接透传给用户
    let result = await provider.chatStream(messages, { tools: TOOLS }, {
      onDelta: (t) => emit('delta', t),
    });

    let settled = false; // 是否已拿到最终文字回复
    if (!result.toolCalls.length) {
      settled = true;
    } else {
      // 模型调了工具：清掉流中可能已吐出的引导语（DeepSeek 调工具时 content 一般为空）
      emit('reset');
      messages.push(result.rawAssistant);
      for (const call of result.toolCalls) {
        const out = await execute(call.name, call.args, ctx);
        if (out.ok && out.card) cards.push(out.card);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: out.summary,
        });
      }

      // 后续工具轮次（非流式），与 handle() 一致最多 MAX_TOOL_ROUNDS 轮
      for (let round = 1; round < MAX_TOOL_ROUNDS && !settled; round++) {
        result = await provider.chat(messages, { tools: TOOLS });
        if (!result.toolCalls.length) {
          // 模型给出最终文字（此路径为非流式拿到，整块透传）
          if (result.content) emit('delta', result.content);
          settled = true;
          break;
        }

        messages.push(result.rawAssistant);
        for (const call of result.toolCalls) {
          const out = await execute(call.name, call.args, ctx);
          if (out.ok && out.card) cards.push(out.card);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: out.summary,
          });
        }

        // 最后一轮仍在调工具：不带工具再请求一次，流式输出文字总结
        if (round === MAX_TOOL_ROUNDS - 1) {
          result = await provider.chatStream(messages, {}, {
            onDelta: (t) => emit('delta', t),
          });
          settled = true;
        }
      }

      // 防御：工具已执行但尚未拿到文字总结（如 MAX_TOOL_ROUNDS 调整为 1）
      if (!settled) {
        result = await provider.chatStream(messages, {}, {
          onDelta: (t) => emit('delta', t),
        });
      }
    }

    reply = (result.content || '').trim()
      || '我已经把相关建议整理在下面的卡片里啦，点开看看哪条适合今天的你～';

    // 幻觉兜底：模型没用工具却声称卡片已生成，强制纠偏一轮（与 handle() 一致）
    if (cards.length === 0 && CARD_HALLUCINATION_RE.test(reply)) {
      const oldReply = reply;
      messages.push({ role: 'assistant', content: reply });
      messages.push({
        role: 'user',
        content: '系统提醒：你本轮没有调用任何工具，却声称已经生成确认卡片或完成记录，这是不允许的。请立即针对用户本轮的原始请求，调用对应的 propose_* 工具生成确认卡；若用户意图不属于可记录范围，则正常用文字回复，不要提及卡片。',
      });
      const corrected = await provider.chat(messages, { tools: TOOLS });
      if (corrected.toolCalls.length) {
        messages.push(corrected.rawAssistant);
        for (const call of corrected.toolCalls) {
          const out = await execute(call.name, call.args, ctx);
          if (out.ok && out.card) cards.push(out.card);
          messages.push({ role: 'tool', tool_call_id: call.id, content: out.summary });
        }
        // 清空已流出的幻觉文字，改为流式输出纠偏后的总结
        emit('reset');
        const finalRes = await provider.chatStream(messages, {}, {
          onDelta: (t) => emit('delta', t),
        });
        const finalText = (finalRes.content || '').trim();
        reply = finalText || oldReply;
        if (!finalText) emit('delta', oldReply);
      }
    }
  }

  await store.appendMessage(session.id, 'assistant', reply);

  return {
    reply,
    cards,
    sessionId: session.id,
    userId: user.id,
    storage: store.getStorageMode(),
    safetyLevel: guard.level,
  };
}

module.exports = { handle, handleStream };

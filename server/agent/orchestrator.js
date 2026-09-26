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

// 最多两轮工具调用，防止模型反复调工具拖慢响应
const MAX_TOOL_ROUNDS = 2;

// 模型“没用工具却声称卡片/记录已生成”的幻觉信号（多轮会话模仿历史措辞时会出现）
const CARD_HALLUCINATION_RE = /确认卡|确认按钮|已经帮你(?:记录|添加|设置|生成|打卡|保存)|已(?:帮你)?(?:记录|添加|设置|生成|打卡|保存)(?:了|好)?(?:一条|一个|一张)?(?:提醒|待办|症状|卡片|心情|档案|用药)?/;

async function handle({ userId, sessionId, message, clientIp }) {
  const user = await store.resolveUser(userId);
  const session = await store.resolveSession(user, sessionId);

  // 先保存用户消息
  await store.appendMessage(session.id, 'user', message);

  // 安全预检
  const guard = safety.detect(message);

  let reply;
  let cards = [];

  if (guard.level === 'normal') {
    const history = await store.loadHistory(session.id);
    // 工具调用过程只存在于本次请求内存，不写库，避免污染历史记忆
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
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

module.exports = { handle };

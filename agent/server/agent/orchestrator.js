/**
 * 对话编排器
 * 流程：用户/会话解析 → 保存用户消息 → 安全预检 → 组装记忆 → 调用大模型 → 保存回复
 */
const store = require('./chatStore');
const safety = require('./safety');
const provider = require('./providers/deepseek');
const { SYSTEM_PROMPT } = require('./prompts/system');

async function handle({ userId, sessionId, message }) {
  const user = await store.resolveUser(userId);
  const session = await store.resolveSession(user, sessionId);

  await store.appendMessage(session.id, 'user', message);

  const guard = safety.detect(message);

  let reply;
  if (guard.level === 'normal') {
    const history = await store.loadHistory(session.id);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ];
    reply = await provider.chat(messages);
  } else {
    reply = guard.reply;
  }

  await store.appendMessage(session.id, 'assistant', reply);

  return {
    reply,
    sessionId: session.id,
    userId: user.id,
    storage: store.getStorageMode(),
    safetyLevel: guard.level,
  };
}

module.exports = { handle };

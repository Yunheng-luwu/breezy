/**
 * DeepSeek 大模型 Provider
 * 使用 Node 原生 fetch 调用 Chat Completions 接口
 * 支持函数调用（tools / tool_calls，OpenAI 兼容格式）
 */
const config = require('../../config');

const DEFAULT_TIMEOUT_MS = 45000;

class ProviderError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/**
 * 调用大模型生成回复
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts]
 * @param {Array}  [opts.tools]  OpenAI 兼容工具定义
 * @returns {Promise<{content:string, toolCalls:Array, rawAssistant:object}>}
 *   toolCalls: [{ id, name, args }] 参数已解析为对象
 *   rawAssistant: 可直接追加到 messages 的 assistant 消息（含 tool_calls）
 */
async function chat(messages, opts = {}) {
  const { apiKey, baseURL, model } = config.deepseek;
  const tools = opts.tools || null;

  if (!apiKey || apiKey.startsWith('sk-在这里')) {
    throw new ProviderError('尚未配置有效的 DEEPSEEK_API_KEY，请在 .env 中填写', 'missing_api_key');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const payload = {
    model,
    messages,
    temperature: 0.7,
    max_tokens: 900,
    stream: false,
  };
  if (tools) payload.tools = tools;

  let res;
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ProviderError('大模型响应超时，请稍后再试', 'timeout');
    }
    throw new ProviderError('无法连接大模型服务，请检查网络', 'network');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    throw new ProviderError('DeepSeek API Key 无效或已过期', 'invalid_api_key');
  }
  if (res.status === 429) {
    throw new ProviderError('请求过于频繁，请稍后再试', 'rate_limited');
  }
  if (!res.ok) {
    throw new ProviderError(`大模型服务异常（${res.status}）`, 'upstream_error');
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (!message) {
    throw new ProviderError('大模型返回内容为空', 'empty_response');
  }

  const content = (message.content || '').trim();
  const apiToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  const toolCalls = apiToolCalls.map(tc => {
    let args = {};
    try {
      args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      args = { __parse_error: true };
    }
    return { id: tc.id, name: tc.function?.name || '', args };
  });

  // 回传给 API 的 assistant 消息必须保留原始 tool_calls 结构
  const rawAssistant = { role: 'assistant', content: message.content || '', tool_calls: apiToolCalls };

  if (!content && !toolCalls.length) {
    throw new ProviderError('大模型返回内容为空', 'empty_response');
  }
  return { content, toolCalls, rawAssistant };
}

module.exports = { chat, ProviderError };

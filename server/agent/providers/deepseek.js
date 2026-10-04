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

/**
 * 流式调用大模型（SSE）
 * @param {Array} messages
 * @param {object} [opts] 同 chat()
 * @param {object} handlers
 * @param {(text:string)=>void} [handlers.onDelta] 每收到一段文字增量时回调
 * @returns {Promise<{content:string, toolCalls:Array, rawAssistant:object}>}
 *
 * 说明：支持 tools。tool_calls 的 id/name/arguments 在 SSE 中按分片到达，
 *       这里按 index 缓存拼接，流结束后一次性解析。
 *       模型决定调用工具时通常不输出文字；若同时输出了文字，content 照常累积返回，
 *       由编排器决定是否已把增量透传给用户。
 */
async function chatStream(messages, opts = {}, handlers = {}) {
  const { apiKey, baseURL, model } = config.deepseek;
  const tools = opts.tools || null;
  const onDelta = typeof handlers.onDelta === 'function' ? handlers.onDelta : null;

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
    stream: true,
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
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ProviderError('大模型响应超时，请稍后再试', 'timeout');
    }
    throw new ProviderError('无法连接大模型服务，请检查网络', 'network');
  }

  if (res.status === 401) {
    clearTimeout(timer);
    throw new ProviderError('DeepSeek API Key 无效或已过期', 'invalid_api_key');
  }
  if (res.status === 429) {
    clearTimeout(timer);
    throw new ProviderError('请求过于频繁，请稍后再试', 'rate_limited');
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    throw new ProviderError(`大模型服务异常（${res.status}）`, 'upstream_error');
  }

  let fullContent = '';
  const tcSlots = new Map(); // index -> { id, name, argsText }
  let finishReason = null;

  // 上游 SSE：行式协议，data: {...} / data: [DONE]
  // 注意：Node 全局 fetch(undici) 的迭代块是 Uint8Array 而非 Buffer，
  //       不能直接 chunk.toString('utf8')（会变成逗号数字串），必须 Buffer.from()
  let buf = '';
  try {
    for await (const chunk of res.body) {
      buf += Buffer.from(chunk).toString('utf8');
      let nl;
      // 兼容 \n 与 \r\n
      while ((nl = buf.search(/\r?\n/)) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl).replace(/^\r?\n/, '');
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { buf = ''; break; }
        let evt;
        try {
          evt = JSON.parse(data);
        } catch {
          continue; // 半个 JSON（理论上按行不会出现），跳过
        }
        const choice = evt?.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta || {};
        if (delta.content) {
          fullContent += delta.content;
          if (onDelta) onDelta(delta.content);
        }
        const frags = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
        frags.forEach((f) => {
          const slot = tcSlots.get(f.index) || { id: '', name: '', argsText: '' };
          if (f.id) slot.id = f.id;
          if (f.function?.name) slot.name += f.function.name;
          if (f.function?.arguments) slot.argsText += f.function.arguments;
          tcSlots.set(f.index, slot);
        });
      }
    }
  } catch (streamErr) {
    clearTimeout(timer);
    if (streamErr && streamErr.name === 'AbortError') {
      throw new ProviderError('大模型响应超时，请稍后再试', 'timeout');
    }
    throw streamErr;
  }
  clearTimeout(timer);

  const apiToolCalls = [...tcSlots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, s]) => ({
      id: s.id,
      type: 'function',
      function: { name: s.name, arguments: s.argsText },
    }))
    .filter(tc => tc.function.name);

  const toolCalls = apiToolCalls.map(tc => {
    let args = {};
    try {
      args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
    } catch {
      args = { __parse_error: true };
    }
    return { id: tc.id, name: tc.function.name, args };
  });

  const content = fullContent.trim();
  const rawAssistant = { role: 'assistant', content: fullContent, tool_calls: apiToolCalls };

  if (!content && !toolCalls.length && finishReason !== 'stop') {
    throw new ProviderError('大模型返回内容为空', 'empty_response');
  }
  return { content, toolCalls, rawAssistant };
}

module.exports = { chat, chatStream, ProviderError };

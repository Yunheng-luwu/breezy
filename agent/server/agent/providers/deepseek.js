/**
 * DeepSeek 大模型 Provider
 * 使用 Node 原生 fetch 调用 Chat Completions 接口
 */
const config = require('../../config');

const DEFAULT_TIMEOUT_MS = 30000;

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
 * @returns {Promise<string>}
 */
async function chat(messages) {
  const { apiKey, baseURL, model } = config.deepseek;

  if (!apiKey || apiKey.startsWith('sk-在这里')) {
    throw new ProviderError('尚未配置有效的 DEEPSEEK_API_KEY，请在 .env 中填写', 'missing_api_key');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 800,
        stream: false,
      }),
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
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new ProviderError('大模型返回内容为空', 'empty_response');
  }
  return reply;
}

module.exports = { chat, ProviderError };

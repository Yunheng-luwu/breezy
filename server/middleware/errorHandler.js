/**
 * 全局错误处理（be-8 API 标准化）
 * - /api 下未匹配路由统一返回 JSON 404，避免回落到静态页返回 HTML
 * - ApiError 按其 status 响应；非法 JSON 请求体返回 400；其余 500
 */
const { ApiError } = require('../utils/http');

function notFoundApi(req, res) {
  res.status(404).json({ success: false, message: '接口不存在' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    const body = { success: false, message: err.message };
    if (err.code) body.code = err.code;
    return res.status(err.status).json(body);
  }
  // express.json() 解析失败
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: '请求体不是合法的 JSON' });
  }
  console.error('[error] 未预期错误：', err);
  res.status(500).json({ success: false, message: '服务内部错误，请稍后重试' });
}

module.exports = { notFoundApi, errorHandler };

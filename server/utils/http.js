/**
 * HTTP 层统一约定（be-8 API 标准化）
 * - 成功响应信封：{ success: true, data?, message? }
 * - 失败响应信封：{ success: false, message, code? }
 * - 业务错误一律 throw new ApiError(status, message)，由全局错误中间件兜底
 */

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (code) this.code = code;
  }
}

// 成功响应：data 为 undefined 时不出现在信封中
function ok(res, data, message) {
  const body = { success: true };
  if (data !== undefined) body.data = data;
  if (message) body.message = message;
  return res.json(body);
}

// 异步路由包装：抛错统一交给全局错误中间件
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ============ 输入校验工具 ============

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// 去空白 + 限长；非字符串安全降级为空串
function cleanStr(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// YYYY-MM-DD，允许空串（表示“不传”）；非法直接抛 400
function optionalDate(value, label = '日期') {
  const v = String(value || '').trim();
  if (v && !DATE_RE.test(v)) {
    throw new ApiError(400, `${label}格式应为 YYYY-MM-DD`);
  }
  return v;
}

// HH:mm，required=true 时空值抛 400
function timeField(value, required = true, label = '时间') {
  const v = String(value || '').trim();
  if (!v) {
    if (required) throw new ApiError(400, `请选择${label}（HH:mm）`);
    return '';
  }
  if (!TIME_RE.test(v)) {
    throw new ApiError(400, `${label}格式应为 HH:mm`);
  }
  return v;
}

// 枚举校验：不在白名单时返回默认值
function enumOr(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

module.exports = {
  ApiError,
  ok,
  wrap,
  DATE_RE,
  TIME_RE,
  cleanStr,
  optionalDate,
  timeField,
  enumOr,
};

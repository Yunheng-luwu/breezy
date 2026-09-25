/**
 * 认证中间件
 * - JWT 签发与校验
 * - optionalAuth：有 token 就解析，无 token 放行（演示数据用默认用户）
 * - requireAuth：无有效 token 返回 401
 */

const jwt = require('jsonwebtoken');
const config = require('../config');

// 开发期固定验证码；接入短信服务后替换为动态验证码
const DEV_CODE = '1234';

function signToken(userId) {
  return jwt.sign({ uid: userId }, config.jwt.secret, { expiresIn: config.jwt.expires });
}

// 从请求头解析 Bearer token，成功则挂载 req.userId
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      req.userId = payload.uid;
    } catch (err) {
      // token 无效/过期：不阻断，按未登录处理
      req.authError = err.name; // TokenExpiredError / JsonWebTokenError
    }
  }
  next();
}

// 强制登录
function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  next();
}

module.exports = { signToken, optionalAuth, requireAuth, DEV_CODE };

/**
 * 认证中间件
 * - JWT 签发与校验
 * - 密码哈希（scrypt）
 * - optionalAuth：有 token 就解析，无 token 放行（演示数据用默认用户）
 * - requireAuth：无有效 token 返回 401
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(userId) {
  return jwt.sign({ uid: userId }, config.jwt.secret, { expiresIn: config.jwt.expires });
}

// 密码哈希：scrypt:salt:hash（无第三方依赖）
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(password, salt, 32);
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
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

// 强制管理员：需先经 optionalAuth 解析 token，再查库校验 role
async function requireAdmin(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  try {
    const { pool } = require('../db/pool');
    const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (!rows[0] || rows[0].role !== 'admin') {
      return res.status(403).json({ success: false, message: '无管理员权限' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { signToken, optionalAuth, requireAuth, requireAdmin, hashPassword, verifyPassword };

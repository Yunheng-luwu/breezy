/**
 * AI 对话统一入口
 * POST /api/chat { userId?, sessionId?, message }
 */
const express = require('express');
const router = express.Router();
const orchestrator = require('../agent/orchestrator');
const store = require('../agent/chatStore');
const { ProviderError } = require('../agent/providers/deepseek');
const { ApiError, wrap, ok } = require('../utils/http');

// 当前用户的会话列表（未登录时走演示用户，与 POST /api/chat 行为一致）
router.get('/sessions', wrap(async (req, res) => {
  const user = await store.resolveUser(req.userId);
  const sessions = await store.listSessions(user);
  res.json({ success: true, data: sessions });
}));

// 某个会话的完整消息（回看，校验归属）
router.get('/sessions/:id/messages', wrap(async (req, res) => {
  const user = await store.resolveUser(req.userId);
  const data = await store.loadMessages(Number(req.params.id), user);
  if (!data) {
    throw new ApiError(404, '会话不存在');
  }
  res.json({ success: true, data });
}));

// 删除会话（校验归属，连带删除消息）
router.delete('/sessions/:id', wrap(async (req, res) => {
  const user = await store.resolveUser(req.userId);
  const deleted = await store.deleteSession(Number(req.params.id), user);
  if (!deleted) {
    throw new ApiError(404, '会话不存在');
  }
  ok(res, undefined, '会话已删除');
}));

router.post('/', async (req, res, next) => {
  const userId = req.userId;
  const { sessionId } = req.body;
  const message = (req.body.message || '').trim();

  if (!message) {
    return res.status(400).json({ success: false, message: '消息不能为空' });
  }
  if (message.length > 500) {
    return res.status(400).json({ success: false, message: '消息过长，请控制在 500 字以内' });
  }

  try {
    // 透传客户端 IP，供 get_clothing 工具做天气定位（内网 IP 时天气服务按出口 IP 定位）
    const fwd = req.headers['x-forwarded-for'];
    const clientIp = ((fwd ? fwd.split(',')[0].trim() : '') || req.ip || req.socket?.remoteAddress || '')
      .replace(/^::ffff:/, '');
    const data = await orchestrator.handle({ userId, sessionId, message, clientIp });
    res.json({ success: true, data });
  } catch (err) {
    if (err instanceof ProviderError) {
      return res.status(503).json({ success: false, code: err.code, message: err.message });
    }
    next(err);
  }
});

module.exports = router;

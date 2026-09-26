/**
 * AI 对话统一入口
 * POST /api/chat { userId?, sessionId?, message }
 */
const express = require('express');
const router = express.Router();
const orchestrator = require('../agent/orchestrator');
const { ProviderError } = require('../agent/providers/deepseek');
const { optionalAuth } = require('../middleware/auth');

// 有登录 token 时 AI 工具读写本人数据；无 token 时回退演示用户
router.use(optionalAuth);

router.post('/', async (req, res) => {
  // JWT 身份优先，body.userId 仅作无登录场景的兼容兜底
  const userId = req.userId || req.body.userId;
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
    console.error('[chat] 未预期错误：', err);
    res.status(500).json({ success: false, message: '服务暂时不可用，请稍后再试' });
  }
});

module.exports = router;

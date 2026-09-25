/**
 * AI 对话统一入口
 * POST /api/chat { userId?, sessionId?, message }
 */
const express = require('express');
const router = express.Router();
const orchestrator = require('../agent/orchestrator');
const { ProviderError } = require('../agent/providers/deepseek');

router.post('/', async (req, res) => {
  const { userId, sessionId } = req.body;
  const message = (req.body.message || '').trim();

  if (!message) {
    return res.status(400).json({ success: false, message: '消息不能为空' });
  }
  if (message.length > 500) {
    return res.status(400).json({ success: false, message: '消息过长，请控制在 500 字以内' });
  }

  try {
    const data = await orchestrator.handle({ userId, sessionId, message });
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

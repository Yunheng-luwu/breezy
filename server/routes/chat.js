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

// SSE 流式对话
// POST /api/chat/stream { userId?, sessionId?, message }
// 事件协议：event: delta  data: {text}        文字增量（可多次）
//           event: reset  data: {}            清空已输出文字（模型转去调工具/纠偏）
//           event: done   data: {reply,cards,sessionId,userId,storage,safetyLevel}
//           event: error  data: {code,message}
router.post('/stream', async (req, res) => {
  const userId = req.userId;
  const { sessionId } = req.body;
  const message = (req.body.message || '').trim();

  // 头未写出前的参数错误仍按普通 JSON 400 返回
  if (!message) {
    return res.status(400).json({ success: false, message: '消息不能为空' });
  }
  if (message.length > 500) {
    return res.status(400).json({ success: false, message: '消息过长，请控制在 500 字以内' });
  }

  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx 反代时禁止缓冲
  });
  res.flushHeaders?.();

  // 客户端断开标记。
  // 关键坑：不能监听 req 的 close —— Node 16+ 下 POST 请求体一旦读取完毕
  // （keep-alive 连接与该请求解绑）就会触发，并不代表客户端断开；
  // 误用会导致全部事件被丢弃且永不 res.end()。
  // 正确做法：监听 res 的 close，并用 writableFinished 区分「正常结束后的关闭」
  // 与「响应未完成时连接被提前终止」。
  let aborted = false;
  res.on('close', () => {
    if (!res.writableFinished) aborted = true;
  });

  const sendEvent = (event, data) => {
    if (aborted || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 透传客户端 IP，供 get_clothing 工具做天气定位
    const fwd = req.headers['x-forwarded-for'];
    const clientIp = ((fwd ? fwd.split(',')[0].trim() : '') || req.ip || req.socket?.remoteAddress || '')
      .replace(/^::ffff:/, '');

    const data = await orchestrator.handleStream(
      { userId, sessionId, message, clientIp },
      (event, payload) => {
        if (event === 'delta') sendEvent('delta', { text: payload });
        else if (event === 'reset') sendEvent('reset', {});
      },
    );

    sendEvent('done', data);
    if (!aborted) res.end();
  } catch (err) {
    // 流式开始后状态码已无法修改，错误通过 error 事件下发
    if (err instanceof ProviderError) {
      sendEvent('error', { code: err.code, message: err.message });
    } else {
      console.error('[chat/stream]', err);
      sendEvent('error', { code: 'internal_error', message: '服务开小差了，请稍后再试' });
    }
    if (!aborted) res.end();
  }
});

module.exports = router;

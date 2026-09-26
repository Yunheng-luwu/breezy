/**
 * 松序 SongXu - 服务入口
 * 仅负责启动、中间件装配与路由挂载
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const apiRoutes = require('./routes/api');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const chatStore = require('./agent/chatStore');
const { optionalAuth } = require('./middleware/auth');
const { notFoundApi, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务：仅开放 public 目录，不暴露 server/ 源码与 package.json
app.use(express.static(path.join(__dirname, '..', 'public')));

// 所有 /api 接口先做可选认证：有 token 解析出 req.userId，无 token 放行（由各接口决定是否强制登录）
app.use('/api', optionalAuth);

// 路由
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// /api 下未匹配路由：JSON 404（必须在静态兜底之前）
app.use('/api', notFoundApi);

// 全局错误处理（含非法 JSON 请求体、异步路由抛错）
app.use(errorHandler);

// 默认路由 - 返回首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(config.port, config.host, async () => {
  const mode = await chatStore.init();
  console.log('\n  松序服务器已启动');
  console.log('  地址: http://' + config.host + ':' + config.port);
  console.log('  存储模式: ' + (mode ? 'MySQL 数据库' : '内存（未连接到 MySQL）'));
  console.log('  大模型: DeepSeek ' + config.deepseek.model);
  console.log('\n  在浏览器中打开以上地址即可访问\n');
});

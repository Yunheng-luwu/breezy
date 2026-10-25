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

// 关键配置校验：生产环境缺 JWT_SECRET / DB_PASSWORD 直接拒绝启动
config.validate();

app.use(cors());
// 1mb：容纳头像上传的 base64 dataURL（前端已压缩，一般 < 60KB）
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件服务：仅开放 public 目录，不暴露 server/ 源码与 package.json
// maxAge 7 天：图片/js/css 均带版本号（?v=）或文件名不变，长缓存安全；二次访问走本地缓存秒开
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '7d' }));

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

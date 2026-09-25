/**
 * 松序 AI 独立服务 - 入口
 * 端口默认 3100，与主前端项目完全解耦
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const chatRoutes = require('./routes/chat');
const chatStore = require('./agent/chatStore');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查：供未来主前端或运维探测
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'songxu-ai',
      storage: chatStore.getStorageMode(),
      model: config.deepseek.model,
      keyConfigured: Boolean(config.deepseek.apiKey) && !config.deepseek.apiKey.startsWith('sk-在这里'),
    },
  });
});

// 对话接口
app.use('/api/chat', chatRoutes);

// 自带的极简测试页（仅用于独立开发/演示）
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(config.port, async () => {
  const dbMode = await chatStore.init();
  console.log('\n  松序 AI 服务已启动');
  console.log('  地址: http://localhost:' + config.port);
  console.log('  存储模式: ' + (dbMode ? 'MySQL 数据库' : '内存（未连接 MySQL）'));
  console.log('  大模型: DeepSeek ' + config.deepseek.model);
  console.log('\n  测试页: http://localhost:' + config.port + '\n');
});

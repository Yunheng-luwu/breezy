/**
 * 松序 SongXu - 后端服务入口（模拟接口）
 * 仅负责静态托管与 Mock API，AI 能力由独立的 agent 服务（songxu-ai）提供
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 前端静态文件：与同级 frontend 目录对应
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 模拟接口
app.use('/api', apiRoutes);

// 默认路由 - 返回前端首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log('\n  松序后端已启动');
  console.log('  地址: http://localhost:' + PORT);
  console.log('  AI 服务: http://localhost:3100（独立运行）\n');
});

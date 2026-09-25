/**
 * 全局配置：统一从环境变量读取，禁止在代码中硬编码密钥
 */
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3100,

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'songxu_ai',
  },

  memoryTurns: Number(process.env.MEMORY_TURNS || 10),
};

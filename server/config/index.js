/**
 * 全局配置：统一从环境变量读取，禁止在代码中硬编码密钥
 */
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,

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
    database: process.env.DB_NAME || 'songxu',
  },

  memoryTurns: Number(process.env.MEMORY_TURNS || 10),

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expires: process.env.JWT_EXPIRES || '7d',
  },

  amap: {
    key: process.env.AMAP_KEY || '',
    // IP 定位失败（内网/机房网络）时回退的默认城市 adcode，默认杭州 330100
    defaultAdcode: process.env.AMAP_DEFAULT_ADCODE || '330100',
    defaultCity: process.env.AMAP_DEFAULT_CITY || '杭州',
  },
};

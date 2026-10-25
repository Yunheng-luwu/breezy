/**
 * 全局配置：统一从环境变量读取，禁止在代码中硬编码密钥
 */
require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 3100),
  // 生产环境设为 127.0.0.1，仅允许本机（Nginx 反代）访问，不暴露公网
  host: process.env.HOST || '0.0.0.0',

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

/**
 * 启动前校验关键配置
 * JWT_SECRET 为空时用空密钥签发 token，任何人都能伪造登录态，必须拦住。
 * 生产环境缺配置直接拒绝启动；开发环境仅告警，便于本地快速试跑。
 */
function validate() {
  const isProd = process.env.NODE_ENV === 'production';
  const missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.DB_PASSWORD) missing.push('DB_PASSWORD');
  if (!missing.length) return true;

  if (isProd) {
    console.error('\n  [启动失败] 缺少必需的环境变量: ' + missing.join(', '));
    console.error('  请参考 .env.example 配置后再启动。\n');
    process.exit(1);
  }
  console.warn('  [警告] 未配置 ' + missing.join(', ') + '，仅适用于本地调试');
  return false;
}

config.validate = validate;

module.exports = config;

/**
 * MySQL 连接池
 */
const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 5, // 云服务器 2G 内存，控制连接数
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true,
});

/**
 * 检查数据库是否可连接
 */
async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

module.exports = { pool, ping };

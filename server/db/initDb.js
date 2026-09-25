/**
 * 业务数据库初始化：执行 schema.sql（建库、建表、种子数据）
 * 用法：node server/db/initDb.js
 * 可重复执行（幂等），不会覆盖已有数据
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');

async function main() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // 不指定 database，建库语句包含在 schema.sql 中
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('[initDb] 业务数据库 songxu 初始化完成');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[initDb] 初始化失败：', err.message);
  process.exit(1);
});

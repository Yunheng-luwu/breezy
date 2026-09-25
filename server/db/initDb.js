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
    await migrateHealthProfiles(conn);
    await migrateUsers(conn);
    console.log('[initDb] 业务数据库 songxu 初始化完成');
  } finally {
    await conn.end();
  }
}

// 迁移用户表：手机号登录 → 账号密码登录（补列、放开 phone 非空约束、补唯一索引）
async function migrateUsers(conn) {
  const colExists = async (name) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'songxu' AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
      [name],
    );
    return rows.length > 0;
  };
  const indexExists = async (name) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = 'songxu' AND TABLE_NAME = 'users' AND INDEX_NAME = ?`,
      [name],
    );
    return rows.length > 0;
  };

  const newCols = [
    ['username', "VARCHAR(50) NULL AFTER id"],
    ['email', "VARCHAR(100) NULL AFTER username"],
    ['password_hash', "VARCHAR(120) NULL COMMENT 'scrypt:salt:hash' AFTER email"],
  ];
  for (const [name, ddl] of newCols) {
    if (!(await colExists(name))) {
      await conn.query(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
      console.log(`[initDb] users 新增字段 ${name}`);
    }
  }

  // phone 改为可空（新用户不再依赖手机号）
  const [phoneRows] = await conn.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'songxu' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'`,
  );
  if (phoneRows[0] && phoneRows[0].IS_NULLABLE === 'NO') {
    await conn.query("ALTER TABLE users MODIFY phone VARCHAR(20) NULL");
    console.log('[initDb] users.phone 已改为可空');
  }

  for (const idx of ['uk_username', 'uk_email']) {
    if (!(await indexExists(idx))) {
      const col = idx === 'uk_username' ? 'username' : 'email';
      await conn.query(`ALTER TABLE users ADD UNIQUE KEY ${idx} (${col})`);
      console.log(`[initDb] users 新增唯一索引 ${idx}`);
    }
  }
}

// 迁移早期版本 health_profiles：补结构化偏好字段，移除通用 preference 字段
async function migrateHealthProfiles(conn) {
  const newCols = [
    ['diet_pref', "VARCHAR(50) NULL COMMENT '饮食偏好' AFTER allergy"],
    ['exercise_pref', "VARCHAR(50) NULL COMMENT '运动习惯' AFTER diet_pref"],
    ['sleep_pref', "VARCHAR(50) NULL COMMENT '作息规律' AFTER exercise_pref"],
    ['body_sense', "VARCHAR(50) NULL COMMENT '体感敏感度' AFTER sleep_pref"],
  ];
  const hasColumn = async (name) => {
    const [rows] = await conn.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = 'songxu' AND TABLE_NAME = 'health_profiles' AND COLUMN_NAME = ?`,
      [name],
    );
    return rows.length > 0;
  };
  for (const [name, ddl] of newCols) {
    if (!(await hasColumn(name))) {
      await conn.query(`ALTER TABLE health_profiles ADD COLUMN ${name} ${ddl}`);
      console.log(`[initDb] health_profiles 新增字段 ${name}`);
    }
  }
  if (await hasColumn('preference')) {
    await conn.query('ALTER TABLE health_profiles DROP COLUMN preference');
    console.log('[initDb] health_profiles 移除旧字段 preference');
  }
}

main().catch((err) => {
  console.error('[initDb] 初始化失败：', err.message);
  process.exit(1);
});

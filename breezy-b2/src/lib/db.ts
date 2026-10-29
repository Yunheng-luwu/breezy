import mysql, { type QueryValues } from "mysql2/promise";

/**
 * MySQL 连接池（songxu_b2 独立库）
 * 全局单例，避免 Next.js dev 热重载反复建池
 */
const globalForDb = globalThis as unknown as {
  __breezyPool?: mysql.Pool;
};

export const pool =
  globalForDb.__breezyPool ??
  mysql.createPool({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "songxu_b2",
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "+08:00",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__breezyPool = pool;
}

/** 查询并返回行数组 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: QueryValues = [],
): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** 查询单行 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: QueryValues = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** 写入，返回 insertId */
export async function execute(
  sql: string,
  params: QueryValues = [],
): Promise<number> {
  const [result] = await pool.query(sql, params);
  return (result as mysql.ResultSetHeader).insertId;
}

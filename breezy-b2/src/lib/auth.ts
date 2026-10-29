/**
 * 认证：bcrypt 密码哈希 + jose JWT（HttpOnly Cookie）
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { queryOne } from "@/lib/db";

export const AUTH_COOKIE = "breezy_token";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "breezy-dev-secret-change-me",
);
const EXPIRES = process.env.JWT_EXPIRES ?? "7d";

export interface SessionUser {
  id: number;
  name: string;
  role: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signToken(userId: number): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES)
    .sign(SECRET);
}

export async function readToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const uid = Number(payload.uid);
    return Number.isFinite(uid) ? uid : null;
  } catch {
    return null;
  }
}

/** 从 cookie 或 Authorization 中取当前用户 */
export async function getSessionUser(req?: Request): Promise<SessionUser | null> {
  let token: string | undefined;
  if (req) {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
    else {
      const cookieHeader = req.headers.get("cookie") ?? "";
      const m = cookieHeader.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
      if (m) token = decodeURIComponent(m[1]);
    }
  }
  if (!token) {
    const store = await cookies();
    token = store.get(AUTH_COOKIE)?.value;
  }
  if (!token) return null;

  const uid = await readToken(token);
  if (!uid) return null;

  const row = await queryOne<{ id: number; name: string; role: string }>(
    "SELECT id, name, role FROM users WHERE id = ?",
    [uid],
  );
  return row ?? null;
}

/** 未登录用户标识（0）：所有查询都查不到数据，写入统一拒绝 */
export const GUEST_USER_ID = 0;

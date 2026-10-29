"use server";

/**
 * 登录 / 注册 / 退出（Server Actions）
 * - 登录成功写入 HttpOnly Cookie（JWT）
 * - 失败通过 ?error= 回跳提示
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { queryOne, execute } from "@/lib/db";
import { AUTH_COOKIE, hashPassword, verifyPassword, signToken } from "@/lib/auth";
import { currentUserId } from "@/lib/queries";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export async function loginAction(fd: FormData) {
  const account = String(fd.get("account") ?? "").trim().slice(0, 100);
  const password = String(fd.get("password") ?? "").slice(0, 100);
  if (!account || !password) redirect("/login?error=" + encodeURIComponent("请填写账号和密码"));

  const row = await queryOne<{ id: number; password_hash: string | null }>(
    "SELECT id, password_hash FROM users WHERE phone = ? OR username = ? OR email = ? LIMIT 1",
    [account, account, account],
  );
  if (!row || !row.password_hash) {
    redirect("/login?error=" + encodeURIComponent("账号不存在或未设置密码"));
  }
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) redirect("/login?error=" + encodeURIComponent("密码不正确"));

  const token = await signToken(row.id);
  cookies().set(AUTH_COOKIE, token, COOKIE_OPTS);
  redirect("/assistant");
}

export async function registerAction(fd: FormData) {
  const account = String(fd.get("account") ?? "").trim().slice(0, 100);
  const password = String(fd.get("password") ?? "").slice(0, 100);
  const name = String(fd.get("name") ?? "").trim().slice(0, 50) || "松友";

  if (!/^1\d{10}$/.test(account) && !/^[\w.@+-]{3,100}$/.test(account)) {
    redirect("/register?error=" + encodeURIComponent("请填写手机号或用户名（3 位以上）"));
  }
  if (password.length < 6) {
    redirect("/register?error=" + encodeURIComponent("密码至少 6 位"));
  }

  const isPhone = /^1\d{10}$/.test(account);
  const exists = await queryOne<{ id: number }>(
    `SELECT id FROM users WHERE ${isPhone ? "phone" : "username"} = ? LIMIT 1`,
    [account],
  );
  if (exists) redirect("/register?error=" + encodeURIComponent("该账号已注册，请直接登录"));

  const hash = await hashPassword(password);
  const uid = await execute(
    `INSERT INTO users (phone, username, password_hash, name) VALUES (?, ?, ?, ?)`,
    [isPhone ? account : null, isPhone ? null : account, hash, name],
  );
  await execute("INSERT INTO health_profiles (user_id) VALUES (?)", [uid]);
  await execute("INSERT INTO chronic_profiles (user_id) VALUES (?)", [uid]);

  const token = await signToken(uid);
  cookies().set(AUTH_COOKIE, token, COOKIE_OPTS);
  redirect("/profile");
}

export async function logoutAction() {
  cookies().delete(AUTH_COOKIE);
  redirect("/login");
}

/** 修改密码（个人中心-账号与安全） */
export async function changePasswordAction(
  oldPwd: string,
  newPwd: string,
): Promise<{ ok: boolean; message: string }> {
  const uid = await currentUserId();
  const oldP = String(oldPwd ?? "").slice(0, 100);
  const newP = String(newPwd ?? "").slice(0, 100);
  if (newP.length < 6) return { ok: false, message: "新密码至少 6 位" };
  const row = await queryOne<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE id = ?",
    [uid],
  );
  if (!row?.password_hash) return { ok: false, message: "当前账号未设置密码" };
  if (!(await verifyPassword(oldP, row.password_hash))) {
    return { ok: false, message: "原密码不正确" };
  }
  const hash = await hashPassword(newP);
  await execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, uid]);
  return { ok: true, message: "密码已更新" };
}

/** 意见反馈（个人中心） */
export async function submitFeedbackAction(
  content: string,
): Promise<{ ok: boolean; message: string }> {
  const uid = await currentUserId();
  const text = String(content ?? "").trim().slice(0, 500);
  if (text.length < 5) return { ok: false, message: "多写两句吧（至少 5 个字）" };
  try {
    await execute("INSERT INTO feedback (user_id, content) VALUES (?, ?)", [uid, text]);
    return { ok: true, message: "感谢反馈，我们会认真看每一条" };
  } catch (e) {
    console.error("[feedback]", e);
    return { ok: false, message: "提交失败，请稍后再试" };
  }
}

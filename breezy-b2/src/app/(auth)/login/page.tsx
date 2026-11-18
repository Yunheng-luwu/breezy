import Link from "next/link";
import { Leaf, Sprout } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoginMist } from "@/components/login-mist";
import { loginAction } from "@/lib/auth-actions";

export const metadata = { title: "登录 · 松序 Breezy" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* 背景层：水墨晕染 + 推镜 + 漂移雾气 */}
      <div className="absolute inset-0">
        <div
          className="login-stage-bg absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/img/login-bg.jpg')" }}
        />
        <div
          className="login-mist login-mist-a pointer-events-none absolute left-[-10%] top-[18%] h-[430px] w-[535px] rounded-full blur-[40px]"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.7), rgba(255,255,255,0))",
          }}
        />
        <div
          className="login-mist login-mist-b pointer-events-none absolute bottom-[10%] right-[-15%] h-[350px] w-[430px] rounded-full blur-[40px]"
          style={{
            background:
              "radial-gradient(closest-side, rgba(210,228,214,0.55), rgba(210,228,214,0))",
          }}
        />
        {/* 浅色水彩背景上压一层薄雾，保证表单与文字可读 */}
        <div className="pointer-events-none absolute inset-0 bg-background/30" />
        {/* 跟随鼠标的雾气光斑 */}
        <LoginMist />
      </div>

      {/* 飘落的两片叶子 */}
      <Leaf className="login-leaf login-leaf-1 pointer-events-none absolute left-[36%] z-[3] h-[26px] w-[22px] text-primary" />
      <Leaf className="login-leaf login-leaf-2 pointer-events-none absolute left-[60%] z-[3] h-[21px] w-[16px] text-[#C97B6A]" />

      <div className="login-content relative z-[2] w-full max-w-[476px]">
        <div className="mb-6 text-center">
          <span className="login-logo mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-[17px] bg-primary text-primary-foreground">
            <Sprout className="h-[30px] w-[30px]" />
          </span>
          <h1 className="login-title mt-3 font-brush text-[32px] font-bold leading-tight text-ink">
            松序 Breezy
          </h1>
          <p className="login-slogan mt-1.5 text-[15px] text-muted-foreground">
            中式轻养生 · AI 陪伴每一天
          </p>
        </div>

        <div className="login-card rounded-[13px] border bg-card p-6">
          <form action={loginAction} className="space-y-4">
            {searchParams.notice === "assistant" && (
              <p className="login-item rounded-[11px] bg-primary/10 px-3 py-2 text-sm text-primary">
                登录后才能使用 AI 对话：对话内容和历史会话会保存在你的账号下。
              </p>
            )}
            <div className="login-item" style={{ animationDelay: "1.95s" }}>
              <label className="mb-1.5 block text-[15px] font-medium">手机号 / 用户名</label>
              <Input
                name="account"
                placeholder="请输入手机号或用户名"
                autoComplete="username"
                className="h-[43px] rounded-[11px] bg-background"
              />
            </div>
            <div className="login-item" style={{ animationDelay: "2.02s" }}>
              <label className="mb-1.5 block text-[15px] font-medium">密码</label>
              <Input
                name="password"
                type="password"
                placeholder="至少 6 位"
                autoComplete="current-password"
                className="h-[43px] rounded-[11px] bg-background"
              />
            </div>
            {searchParams.error && (
              <p className="rounded-[11px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {searchParams.error}
              </p>
            )}
            <Button
              type="submit"
              className="login-item h-[43px] w-full rounded-[11px] text-[15px] font-medium"
              style={{ animationDelay: "2.09s" }}
            >
              登录
            </Button>
          </form>

          <div
            className="login-item mt-4 flex items-center justify-between text-[15px]"
            style={{ animationDelay: "2.16s" }}
          >
            <Link href="/register" className="text-primary hover:underline">
              注册新账号
            </Link>
            <Link href="/home" className="text-muted-foreground hover:underline">
              先体验一下 →
            </Link>
          </div>
          <p
            className="login-item mt-3 text-center text-[11px] text-muted-foreground"
            style={{ animationDelay: "2.23s" }}
          >
            登录即表示你已阅读
            <Link href="/privacy" className="mx-1 text-primary hover:underline">
              隐私说明
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

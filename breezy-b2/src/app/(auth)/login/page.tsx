import Link from "next/link";
import { Sprout } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
      {/* 背景层：缓慢推拉的水墨山水 + 漂移雾气 */}
      <div className="absolute inset-0">
        <div
          className="login-bg-pan absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/img/login-bg.jpg')" }}
        />
        <div
          className="login-bg-mist pointer-events-none absolute left-[-10%] top-[18%] h-[55vh] w-[75vw] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.7), rgba(255,255,255,0))",
          }}
        />
        <div
          className="login-bg-mist pointer-events-none absolute right-[-15%] bottom-[10%] h-[45vh] w-[60vw] rounded-full blur-3xl [animation-direction:reverse] [animation-duration:34s]"
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
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sprout className="h-7 w-7" />
          </span>
          <h1 className="mt-3 font-brush text-3xl font-bold text-ink">松序 Breezy</h1>
          <p className="mt-1 text-sm text-muted-foreground">中式轻养生 · AI 陪伴每一天</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form action={loginAction} className="space-y-4">
              {searchParams.notice === "assistant" && (
                <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                  登录后才能使用 AI 对话：对话内容和历史会话会保存在你的账号下。
                </p>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium">手机号 / 用户名</label>
                <Input name="account" placeholder="请输入手机号或用户名" autoComplete="username" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">密码</label>
                <Input
                  name="password"
                  type="password"
                  placeholder="至少 6 位"
                  autoComplete="current-password"
                />
              </div>
              {searchParams.error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {searchParams.error}
                </p>
              )}
              <Button type="submit" className="w-full">
                登录
              </Button>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm">
              <Link href="/register" className="text-primary hover:underline">
                注册新账号
              </Link>
              <Link href="/home" className="text-muted-foreground hover:underline">
                先体验一下 →
              </Link>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              登录即表示你已阅读
              <Link href="/privacy" className="mx-1 text-primary hover:underline">
                隐私说明
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

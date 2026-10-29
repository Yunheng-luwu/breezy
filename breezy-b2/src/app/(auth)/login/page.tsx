import Link from "next/link";
import { Sprout } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loginAction } from "@/lib/auth-actions";

export const metadata = { title: "登录 · 松序 Breezy" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; notice?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
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

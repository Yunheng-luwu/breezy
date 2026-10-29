import Link from "next/link";
import { Sprout } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { registerAction } from "@/lib/auth-actions";

export const metadata = { title: "注册 · 松序 Breezy" };

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sprout className="h-7 w-7" />
          </span>
          <h1 className="mt-3 font-brush text-3xl font-bold text-ink">创建账号</h1>
          <p className="mt-1 text-sm text-muted-foreground">你的调理记录只属于你</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form action={registerAction} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">昵称</label>
                <Input name="name" placeholder="怎么称呼你？" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">手机号 / 用户名</label>
                <Input name="account" placeholder="手机号或 3 位以上用户名" autoComplete="username" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">密码</label>
                <Input
                  name="password"
                  type="password"
                  placeholder="至少 6 位"
                  autoComplete="new-password"
                />
              </div>
              {searchParams.error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {searchParams.error}
                </p>
              )}
              <Button type="submit" className="w-full">
                注册并开始
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <Link href="/login" className="text-primary hover:underline">
                已有账号，去登录
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

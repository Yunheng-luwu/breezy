"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Sparkles, Utensils, Shirt, Moon, Dumbbell,
  Heart, ClipboardList, User, Leaf,
  Pencil, Eye, X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// icon 字符串 → lucide 组件映射（在 Client Component 内部完成）
const iconMap: Record<string, LucideIcon> = {
  home: Home,
  sparkles: Sparkles,
  utensils: Utensils,
  shirt: Shirt,
  moon: Moon,
  dumbbell: Dumbbell,
  heart: Heart,
  "clipboard-list": ClipboardList,
  user: User,
  leaf: Leaf,
};

interface NavItem {
  href: string;
  label: string;
  icon: string; // 字符串 key，不是函数组件
}

export default function Sidebar({
  items,
  user,
}: {
  items: NavItem[];
  user?: { name: string; avatar: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [avatarView, setAvatarView] = useState(false);

  const renderAvatar = (a?: string | null, size = "h-8 w-8") => {
    if (!a)
      return (
        <div
          className={`${size} flex items-center justify-center rounded-full bg-primary/15 text-sm text-primary`}
        >
          🌿
        </div>
      );
    if (a.startsWith("/uploads/avatars/")) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img src={a} alt="头像" className={`${size} rounded-full object-cover`} />
      );
    }
    return (
      <div className={`${size} flex items-center justify-center rounded-full bg-primary/15 text-sm`}>
        {a}
      </div>
    );
  };

  return (
    <aside className="flex w-56 flex-col border-r bg-card">
      {/* Logo */}
      <Link
        href="/assistant"
        className="flex items-center gap-2 border-b px-5 py-5 hover:bg-accent/50 transition-colors"
      >
        <Leaf className="h-6 w-6 text-primary" />
        <div className="leading-tight">
          <div className="font-brush text-xl font-bold text-ink">松序</div>
          <div className="text-xs text-muted-foreground">Breezy · 轻养生</div>
        </div>
      </Link>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-3">
        {items.map((item) => {
          const Icon = iconMap[item.icon] ?? Home;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer：点头像可查看 / 更换，右侧跳个人中心 */}
      <div className="relative border-t p-3">
        {user ? (
          <div className="flex items-center gap-3 rounded-lg p-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAvatarMenu((v) => !v)}
                title="点击查看或更换头像"
                aria-label="头像"
                aria-expanded={avatarMenu}
                className="block rounded-full transition hover:ring-2 hover:ring-primary/40 hover:ring-offset-2"
              >
                {renderAvatar(user.avatar)}
              </button>
              {avatarMenu && (
                <>
                  {/* 点空白处收起 */}
                  <button
                    type="button"
                    aria-label="关闭菜单"
                    onClick={() => setAvatarMenu(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-36 overflow-hidden rounded-xl border bg-card py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarMenu(false);
                        router.push("/profile?edit=identity");
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink transition-colors hover:bg-accent"
                    >
                      <Pencil className="h-3.5 w-3.5 text-primary" /> 更换头像
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarMenu(false);
                        setAvatarView(true);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink transition-colors hover:bg-accent"
                    >
                      <Eye className="h-3.5 w-3.5 text-primary" /> 查看头像
                    </button>
                  </div>
                </>
              )}
            </div>
            <Link href="/profile" className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {user.name || "松友"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                点击左侧头像可更换 →
              </p>
            </Link>
          </div>
        ) : (
          <p className="py-2 text-center text-xs text-muted-foreground">
            顺气舒心 · 慢养日常
          </p>
        )}
        <Link
          href="/privacy"
          className="mt-1 block text-center text-[11px] text-muted-foreground transition-colors hover:text-primary"
        >
          隐私说明
        </Link>

        {/* 查看头像：放大预览 */}
        {avatarView && user && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
            onClick={() => setAvatarView(false)}
          >
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              {user.avatar?.startsWith("/uploads/avatars/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar}
                  alt="头像"
                  className="h-56 w-56 rounded-full object-cover shadow-2xl"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-full bg-primary/15 text-8xl shadow-2xl">
                  {user.avatar || "🌿"}
                </div>
              )}
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setAvatarView(false)}
                className="absolute -right-2 -top-2 rounded-full bg-card p-1.5 text-muted-foreground shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

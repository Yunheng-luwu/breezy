"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Sparkles, Utensils, Shirt, Moon, Dumbbell,
  Heart, ClipboardList, User, Leaf,
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

      {/* Footer：头像 + 跳转个人中心 */}
      <div className="border-t p-3">
        {user ? (
          <Link
            href="/profile"
            title="点击去个人中心编辑资料"
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {renderAvatar(user.avatar)}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {user.name || "松友"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                点我编辑资料 →
              </p>
            </div>
          </Link>
        ) : (
          <p className="py-2 text-center text-xs text-muted-foreground">
            顺气舒心 · 慢养日常
          </p>
        )}
      </div>
    </aside>
  );
}

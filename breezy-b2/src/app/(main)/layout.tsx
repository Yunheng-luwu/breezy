import Link from "next/link";
import dynamic from "next/dynamic";
import { AssessmentPrompt } from "@/components/assessment-prompt";
import { NotifyBell } from "@/components/notify-bell";
import { currentUserId, getHealthProfile, getUser } from "@/lib/queries";

// 注意：navItems 的 icon 必须是字符串名称（不是 React 组件），
// 因为 Client Component 无法序列化 Server Component 传入的函数。
// Sidebar 内部会把 icon 字符串映射到 lucide-react 组件。
const navItems: { href: string; label: string; icon: string }[] = [
  { href: "/assistant", label: "AI 助手", icon: "sparkles" },
  { href: "/home", label: "今日调养", icon: "home" },
  { href: "/care", label: "居家保健", icon: "leaf" },
  { href: "/diet", label: "饮食推荐", icon: "utensils" },
  { href: "/clothing", label: "穿衣建议", icon: "shirt" },
  { href: "/rhythm", label: "生活节律", icon: "moon" },
  { href: "/practice", label: "功法带练", icon: "dumbbell" },
  { href: "/mood", label: "情绪解压", icon: "heart" },
  { href: "/record", label: "健康记录", icon: "clipboard-list" },
  { href: "/profile", label: "个人中心", icon: "user" },
];

// 侧边导航是客户端组件（需要 usePathname）
const Sidebar = dynamic(() => import("@/components/layout/sidebar"), {
  ssr: false,
  loading: () => <aside className="w-60 border-r bg-card" />,
});

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = await currentUserId();
  const loggedIn = uid > 0;
  const me = loggedIn ? await getUser(uid) : null;
  const profile = loggedIn ? await getHealthProfile(uid) : null;
  const needsAssessment = loggedIn && me?.score == null;
  const needsConstitution = loggedIn && !profile?.constitution;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar items={navItems} user={loggedIn ? { name: me?.name ?? "", avatar: me?.avatar ?? "" } : null} />
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <NotifyBell />
        {!loggedIn && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-2 border-b border-primary/20 bg-accent/60 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
            <span>您还未登录，登录一下解锁更多功能呀~</span>
            <Link
              href="/login"
              className="rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
            >
              去登录
            </Link>
          </div>
        )}
        <div className="mx-auto max-w-5xl p-6">{children}</div>
        <AssessmentPrompt show={needsAssessment} showConstitution={needsConstitution} />
      </main>
    </div>
  );
}

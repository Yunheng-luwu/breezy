import { Chat } from "@/components/chat";
import { Home, Wind, MessageCircle, User, Leaf } from "lucide-react";

const navItems = [
  { icon: Home, label: "首页", active: true },
  { icon: Wind, label: "八段锦", active: false },
  { icon: MessageCircle, label: "AI 助手", active: false },
  { icon: User, label: "健康档案", active: false },
];

export default function HomePage() {
  return (
    <div className="flex h-screen bg-background">
      {/* 侧边导航 */}
      <aside className="flex w-60 flex-col border-r bg-card">
        <div className="flex items-center gap-2 border-b px-6 py-5">
          <Leaf className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold tracking-tight">Breezy</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                item.active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t p-4">
          <p className="text-xs text-muted-foreground">
            传智杯 AI+前端赛道作品
          </p>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">AI 健康助手</h1>
            <p className="text-sm text-muted-foreground">
              基于 Vercel AI SDK · DeepSeek 大模型
            </p>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          <Chat />
        </div>
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { isLoggedIn } from "@/lib/queries";

export const metadata = {
  title: "AI 健康助手 · 松序 Breezy",
};

export const dynamic = "force-dynamic";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] };
}) {
  // 对话与历史都写库，未登录不进入，避免看到别人的会话
  if (!(await isLoggedIn())) redirect("/login?notice=assistant");
  const raw = searchParams?.q;
  const q = Array.isArray(raw) ? raw[0] : raw;
  return (
    <div className="h-[calc(100vh-3rem)] -mx-6">
      <div className="h-full">
        <Chat initialText={q} />
      </div>
    </div>
  );
}

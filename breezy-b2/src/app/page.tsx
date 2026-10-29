import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  // 未登录第一屏就是登录页；已登录才直接进 AI 对话
  redirect((await isLoggedIn()) ? "/assistant" : "/login");
}

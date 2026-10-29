import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "隐私说明 · 松序 Breezy" };

const sections: { title: string; items: string[] }[] = [
  {
    title: "一、我们收集哪些信息",
    items: [
      "账号信息：手机号或用户名、密码（仅保存不可逆的 bcrypt 哈希）、昵称与头像。",
      "健康记录：情绪自评（PHQ-9 / GAD-7）得分、体质问卷结果、症状记录、作息与跟练打卡、随手记、收藏。",
      "对话内容：你在 AI 助手中输入的文本与模型回复，用于保持会话连续与生成个人化建议。",
      "设备本地信息：体感偏好、提醒开关、界面位置等设置保存在浏览器 localStorage，不上传服务器。",
    ],
  },
  {
    title: "二、信息的用途",
    items: [
      "生成个人化的调养建议：节气、天气、体质、近期症状与情绪共同构成推荐依据。",
      "保存你的记录与历史会话，使你下次登录后仍能查看与继续。",
      "改进产品：仅以聚合、去标识的方式统计功能使用情况，不用于广告投放。",
    ],
  },
  {
    title: "三、存储与安全",
    items: [
      "数据存储在本项目自建的 MySQL 数据库中，服务器位于中国境内（阿里云华北2）。",
      "登录态使用 HS256 JWT，写入 HttpOnly Cookie，有效期 7 天；密码采用 bcrypt（10 轮）加盐哈希，明文密码不落库。",
      "所有查询与写入都以当前登录用户 ID 为条件，未登录状态查不到任何个人数据。",
    ],
  },
  {
    title: "四、我们不做的事",
    items: [
      "姿态识别（AI 跟练）全部在浏览器本地完成，摄像头画面帧不上传、不录制、不落盘，服务端也没有接收视频的接口。",
      "不向任何第三方出售、出租或交换你的个人信息。",
      "不将你的健康记录用于保险、信贷、招聘等与产品无关的用途。",
    ],
  },
  {
    title: "五、第三方服务",
    items: [
      "DeepSeek：AI 对话能力由 DeepSeek API 提供。调用时仅发送对话文本与必要的健康摘要，不发送账号、密码与摄像头画面。",
      "高德地图 Web 服务：用于 IP 定位与实时天气，仅传递网络出口 IP 与城市编码，用于确定所在城市与气温。",
      "上述第三方仅在其提供服务所必需的范围内处理数据，具体以其隐私政策为准。",
    ],
  },
  {
    title: "六、保存期限与删除",
    items: [
      "账号与记录在你使用期间保存；你可随时在个人中心修改或清空对应记录。",
      "如需注销账号并删除全部数据，可在「个人中心 - 意见反馈」提交申请，我们核实后删除。",
    ],
  },
  {
    title: "七、未成年人",
    items: [
      "本产品面向成年人与在校学生提供日常养生参考。未满 14 周岁的用户请在监护人陪同下使用。",
    ],
  },
  {
    title: "八、健康内容边界",
    items: [
      "本站内容为健康生活方式参考，不构成医疗诊断或治疗建议。量表结果（PHQ-9 / GAD-7、九种体质）均为自评工具，不作为临床诊断依据。",
      "出现急症、持续加重或自伤念头时，请立即就医或拨打 120 / 心理援助热线 12356。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-brush text-2xl font-bold text-ink">隐私说明</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          本说明适用于松序 Breezy（B2 版）在线演示环境。我们尽量只收集为你提供调养建议所必需的信息，并让每一类数据都有明确用途。
        </p>
        <p className="mt-1 text-xs text-muted-foreground">最近更新：2026-10-29</p>
      </div>

      {sections.map((s) => (
        <Card key={s.title}>
          <CardContent className="pt-6">
            <h2 className="mb-3 text-base font-semibold text-ink">{s.title}</h2>
            <ul className="space-y-2">
              {s.items.map((t) => (
                <li key={t} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 text-base font-semibold text-ink">九、联系与变更</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            对本说明有疑问，或希望查询、更正、删除你的数据，可通过
            <Link href="/profile" className="mx-1 text-primary hover:underline">
              个人中心 · 意见反馈
            </Link>
            联系我们。本说明如有更新，会在本页标注日期并在站内提示。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

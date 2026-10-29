import { Card, CardContent } from "@/components/ui/card";
import {
  ChronicPanel,
  NotePanel,
  QuickSymptoms,
  RecordTabs,
  SymptomCalendar,
  SymptomHistoryList,
} from "@/components/record-extras";
import { MoodPicker } from "@/components/mood-picker";
import { PageHero } from "@/components/page-hero";
import {
  addMedicineAction,
  deleteMedicineAction,
  punchMedicineAction,
} from "@/lib/actions";
import {
  currentUserId,
  getMedicines,
  getNotes,
  getRecentMood,
  getRecentSleep,
  getSleepCheckin,
  getSymptomMonth,
  getSymptoms,
  getSymptomWeeklyStats,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const fieldCls =
  "w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary";
const labelCls = "text-xs text-muted-foreground";

const MOOD_META: Record<string, { label: string; emoji: string }> = {
  happy: { label: "开心", emoji: "🥰" },
  calm: { label: "平静", emoji: "😌" },
  tired: { label: "疲倦", emoji: "😴" },
  irritated: { label: "烦躁", emoji: "😤" },
  sad: { label: "低落", emoji: "😔" },
};

const MED_TIPS = [
  "逍遥丸经期停服，感冒发热时暂停",
  "柴胡疏肝散忌辛辣油腻，服药期间戒酒",
  "归脾丸宜温水送服，不宜与浓茶同服",
];

function todayStamp(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function RecordPage() {
  const uid = await currentUserId();
  const nowYm = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [symptoms, medicines, sleep, moods, recentSleep, calMonth, weeks, notes] =
    await Promise.all([
      getSymptoms(uid),
      getMedicines(uid),
      getSleepCheckin(uid),
      getRecentMood(uid),
      getRecentSleep(uid),
      getSymptomMonth(uid, nowYm),
      getSymptomWeeklyStats(uid),
      getNotes(uid, 20),
    ]);
  const moodToday = moods.some((m) => m.time.startsWith(todayStamp()));

  const stats = [
    { label: "症状记录", icon: "🩺", value: `${symptoms.length} 条` },
    { label: "用药提醒", icon: "💊", value: `${medicines.length} 种` },
    { label: "今日作息", icon: "🌙", value: sleep ? "已打卡" : "未打卡" },
    { label: "今日情绪", icon: "💭", value: moodToday ? "已打卡" : "未打卡" },
  ];

  const symptomTab = (
    <div className="space-y-6">
      <QuickSymptoms />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* 症状历史 + 随手记 */}
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-ink">症状历史</h3>
              <span className="text-xs text-muted-foreground">
                最近 {symptoms.length} 条 · 列表内滚动 · 可加载更早
              </span>
            </div>
            <SymptomHistoryList initial={symptoms} />
          </div>

          <NotePanel initial={notes} />
        </div>
        {/* 记录日历 */}
        <SymptomCalendar initial={calMonth} />
      </div>
    </div>
  );

  const medicineTab = (
    <div className="space-y-6">
      <div className="space-y-3">
        {medicines.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              暂无用药提醒，在下方添加一条
            </CardContent>
          </Card>
        ) : (
          medicines.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.dose || "剂量未填"} · {m.time || "时间未填"}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  上次打卡 {m.lastPunchAt ?? "未打卡"}
                </span>
                <div className="flex items-center gap-2">
                  <form action={punchMedicineAction.bind(null, m.id)}>
                    <button
                      type="submit"
                      className="rounded-lg border border-jade/40 bg-jade/10 px-3 py-1.5 text-xs text-jade transition-colors hover:bg-jade/20"
                    >
                      打卡
                    </button>
                  </form>
                  <form action={deleteMedicineAction.bind(null, m.id)}>
                    <button
                      type="submit"
                      className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                    >
                      删除
                    </button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-6">
          <form
            action={addMedicineAction}
            className="grid gap-3 md:grid-cols-[1.5fr_1fr_1.2fr_2fr_auto] md:items-end"
          >
            <div className="space-y-1">
              <label htmlFor="med-name" className={labelCls}>
                名称
              </label>
              <input
                id="med-name"
                name="name"
                required
                maxLength={100}
                placeholder="如：逍遥丸"
                className={fieldCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="med-dose" className={labelCls}>
                剂量
              </label>
              <input
                id="med-dose"
                name="dose"
                maxLength={50}
                placeholder="如：8 丸"
                className={fieldCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="med-time" className={labelCls}>
                服用时间
              </label>
              <input
                id="med-time"
                name="medTime"
                maxLength={50}
                placeholder="如：饭后 / 21:00"
                className={fieldCls}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="med-note" className={labelCls}>
                备注
              </label>
              <input
                id="med-note"
                name="note"
                maxLength={255}
                placeholder="如：温水送服"
                className={fieldCls}
              />
            </div>
            <button
              type="submit"
              className="h-10 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              添加
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-3 font-semibold text-ink">用药常识提示</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {MED_TIPS.map((t) => (
              <p key={t}>⚠️ {t}</p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHero
        img="/img/banners/record.jpg"
        title="健康记录"
        subtitle="症状追踪 · 用药提醒 · 慢病调理"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6 text-center">
              <span className="text-3xl">{s.icon}</span>
              <p className="mt-2 text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <RecordTabs
        symptom={symptomTab}
        medicine={medicineTab}
        chronic={<ChronicPanel weeks={weeks} />}
      />

      {/* 作息与情绪 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">作息与情绪</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm font-medium">近 7 天作息</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-2 text-left font-normal">日期</th>
                    <th className="py-2 text-left font-normal">入睡</th>
                    <th className="py-2 text-left font-normal">起床</th>
                    <th className="py-2 text-right font-normal">午憩</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSleep.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-6 text-center text-muted-foreground"
                      >
                        还没有作息打卡
                      </td>
                    </tr>
                  ) : (
                    recentSleep.map((row) => (
                      <tr key={row.date} className="border-t">
                        <td className="py-2">{row.date}</td>
                        <td className="py-2 text-muted-foreground">
                          {row.sleepTime || "—"}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {row.wakeTime || "—"}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {row.napTime || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm font-medium">情绪打卡 · 最近记录</p>
              <MoodPicker />
              <div className="mt-3 max-h-56 overflow-y-auto scrollbar-thin border-t pt-1">
                {moods.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">还没有情绪打卡</p>
                ) : (
                  <ul className="divide-y">
                    {moods.map((m, i) => {
                      const meta = MOOD_META[m.mood];
                      return (
                        <li
                          key={`${m.time}-${i}`}
                          className="flex items-center gap-3 py-2.5 text-sm"
                        >
                          <span className="text-lg">{meta?.emoji ?? "🌿"}</span>
                          <span className="flex-1">{meta?.label ?? m.mood}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.time}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

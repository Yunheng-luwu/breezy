import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TodoToggle } from "@/components/todo-toggle";
import {
  ExercisePanel,
  NightRepairCard,
  RhythmTabs,
  RhythmTimeline,
  SleepTrendCard,
} from "@/components/rhythm-extras";
import { PageHero } from "@/components/page-hero";
import { addTodoAction, saveSleepAction } from "@/lib/actions";
import { exerciseData } from "@/lib/content-data";
import {
  currentUserId,
  getHealthProfile,
  getRecentSleep,
  getSleepCheckin,
  getTodos,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  med: "用药",
  ai: "关怀",
  sleep: "睡眠",
  diet: "饮食",
};

const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];

export default async function RhythmPage() {
  const userId = await currentUserId();
  const [todos, today, recent, profile] = await Promise.all([
    getTodos(userId),
    getSleepCheckin(userId),
    getRecentSleep(userId, 7),
    getHealthProfile(userId),
  ]);

  // 时间轴目标（默认与冻结版一致）
  const goals = [
    {
      key: "wakeTime" as const,
      punchField: "wakeTime" as const,
      label: "起床",
      emoji: "⏰",
      time: profile.wakeTime || "07:00",
      done: !!today?.wakeTime,
    },
    {
      key: "napTime" as const,
      punchField: "napTime" as const,
      label: "午憩",
      emoji: "😴",
      time: profile.napTime || "13:00",
      done: !!today?.napTime,
    },
    {
      key: "bedTime" as const,
      punchField: "sleepTime" as const,
      label: "入睡",
      emoji: "🌙",
      time: profile.bedTime || "23:00",
      done: !!today?.sleepTime,
    },
  ];

  // 补齐近 7 天（含无记录空位），供趋势图使用（recent 的 date 为 MM-DD）
  const map = new Map(recent.map((d) => [d.date, d]));
  const fullWeek: Array<{
    key: string;
    week: string;
    sleepTime: string | null;
    wakeTime: string | null;
    napTime: string | null;
  }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const hit = map.get(key);
    fullWeek.push({
      key,
      week: WEEK_CN[d.getDay()],
      sleepTime: hit?.sleepTime ?? null,
      wakeTime: hit?.wakeTime ?? null,
      napTime: hit?.napTime ?? null,
    });
  }
  const days = fullWeek.filter((d) => d.sleepTime || d.wakeTime || d.napTime);

  const doneCount = todos.filter((t) => t.done).length;

  const sleepTab = (
    <div className="space-y-6">
      {/* 目标作息时间轴 */}
      <RhythmTimeline goals={goals} />

      <div className="grid gap-6 md:grid-cols-2">
        {/* 今日作息打卡 */}
        <section>
          <h2 className="mb-4 font-brush text-2xl font-bold text-ink">作息打卡</h2>
          <Card>
            <CardContent className="pt-6">
              <form action={saveSleepAction} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">入睡</span>
                    <Input
                      type="time"
                      name="sleepTime"
                      defaultValue={today?.sleepTime ?? ""}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">起床</span>
                    <Input
                      type="time"
                      name="wakeTime"
                      defaultValue={today?.wakeTime ?? ""}
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">午憩</span>
                    <Input
                      type="time"
                      name="napTime"
                      defaultValue={today?.napTime ?? ""}
                    />
                  </label>
                </div>
                <Button type="submit" className="w-full">
                  今日打卡
                </Button>
                <p className="text-xs text-muted-foreground">
                  {days.length
                    ? `近7天已打卡 ${days.length} 天${today ? " · 今天已完成" : " · 今天还没打卡"}`
                    : "近7天还没有打卡，从今晚开始吧"}
                </p>
              </form>
            </CardContent>
          </Card>
        </section>

        {/* 熬夜补救 */}
        <section>
          <h2 className="mb-4 font-brush text-2xl font-bold text-ink">应急调理</h2>
          <NightRepairCard
            sleepTime={today?.sleepTime ?? undefined}
            wakeTime={today?.wakeTime ?? undefined}
          />
        </section>
      </div>

      {/* 周作息趋势（入睡 / 起床 / 午憩 可切换对比） */}
      <SleepTrendCard week={fullWeek} />

      {/* 今日待办（查看 + 添加，同卡片承接） */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-brush text-2xl font-bold text-ink">今日待办</h2>
          <span className="text-xs text-muted-foreground">
            完成 {doneCount}/{todos.length}
          </span>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            {/* 待办列表 */}
            <div className="space-y-3">
              {todos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  今天还没有待办，在下面添加一条小目标吧。
                </p>
              ) : (
                todos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <div className="flex-1">
                      <TodoToggle id={t.id} done={t.done} label={t.text} time={t.time} />
                    </div>
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {TYPE_LABELS[t.type] ?? t.type}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* 添加待办 */}
            <form
              action={addTodoAction}
              className="space-y-3 border-t border-border pt-4"
            >
              <Input
                name="content"
                maxLength={255}
                required
                placeholder="想加什么？如：太冲穴按揉 5 分钟"
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">提醒时间</span>
                  <Input type="time" name="time" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">类型</span>
                  <select
                    name="type"
                    defaultValue="ai"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="ai">AI 关怀</option>
                    <option value="med">用药</option>
                    <option value="sleep">睡眠</option>
                    <option value="diet">饮食</option>
                  </select>
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  className="self-end sm:w-28"
                >
                  + 添加
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHero
        img="/img/banners/rhythm.jpg"
        title="生活节律"
        subtitle="顺时起居 · 轻动疏肝"
      />
      <RhythmTabs sleep={sleepTab} exercise={<ExercisePanel items={exerciseData} />} />
    </div>
  );
}

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Assessment } from "@/components/assessment";
import { ConstitutionTest } from "@/components/constitution-test";
import { PageHero } from "@/components/page-hero";
import { StatsPanel } from "@/components/stats-panel";
import {
  ChangePasswordForm,
  FavoriteList,
  FeedbackForm,
  ProfileIdentityEditor,
  ReminderSwitches,
} from "@/components/profile-extras";
import { saveChronicAction, saveProfileAction } from "@/lib/actions";
import { logoutAction } from "@/lib/auth-actions";
import {
  currentUserId,
  getChronicProfile,
  getDashboard,
  getFavorites,
  getHealthProfile,
  getUser,
  isLoggedIn,
} from "@/lib/queries";

const fieldCls =
  "w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary";
const labelCls = "text-xs text-muted-foreground";

const FAV_TYPE_LABEL: Record<string, string> = {
  recipe: "食疗",
  acupoint: "穴位",
  diet: "饮食",
};

// 中医体质为「用户自述」选项，本应用不做体质辨识或诊断
const CONSTITUTION_OPTIONS = [
  "平和质",
  "气虚质",
  "阳虚质",
  "阴虚质",
  "痰湿质",
  "湿热质",
  "血瘀质",
  "气郁质",
  "特禀质",
];

export default async function ProfilePage() {
  const uid = await currentUserId();
  const [loggedIn, user, profile, favorites, dashboard, chronic] = await Promise.all([
    isLoggedIn(),
    getUser(uid),
    getHealthProfile(uid),
    getFavorites(uid),
    getDashboard(uid),
    getChronicProfile(uid),
  ]);

  return (
    <div className="space-y-8">
      <PageHero
        img="/img/banners/profile.jpg"
        title="个人中心"
        subtitle="健康档案 · 体质测评 · 偏好设置"
      />

      {/* 用户信息头 */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 pt-6">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary text-4xl text-primary-foreground">
            {user?.avatar?.startsWith("/uploads/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar}
                alt="头像"
                className="h-full w-full object-cover"
              />
            ) : (
              user?.avatar || "🌿"
            )}
          </div>
          <div className="flex-1">
            <h1 className="font-brush text-2xl font-bold text-ink">
              {user?.name ?? "松友"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {user?.level ?? "未测评"} · 加入于 {user?.created_at ?? "—"}
            </p>
          </div>
          {loggedIn && (
            <ProfileIdentityEditor
              initialName={user?.name ?? ""}
              initialAvatar={user?.avatar ?? "🌿"}
            />
          )}
        </CardContent>
      </Card>

      {!loggedIn && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              未登录：个人数据为空。登录后可查看并保存属于你的记录。
            </p>
            <Link
              href="/login"
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              去登录
            </Link>
          </CardContent>
        </Card>
      )}

      {/* 数据概览（可点击展开详情） */}
      <StatsPanel
        score={user?.score ?? null}
        level={user?.level ?? null}
        todos={dashboard.todos}
        favList={dashboard.favList}
        chatSessions={dashboard.chatSessions}
        moods={dashboard.moods}
      />

      {/* 情绪自评（PHQ-9 / GAD-7） */}
      <section id="assessment" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">情绪自评（PHQ-9 / GAD-7）</h2>
          <span className="text-xs text-muted-foreground">
            {user?.score == null ? "未测评 · 会影响 AI 判断的贴合度" : "16 题 · 约 2 分钟"}
          </span>
        </div>
        <Assessment />
      </section>

      {/* 健康档案 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">健康档案</h2>
        <Card>
          <CardContent className="pt-6">
            <form action={saveProfileAction} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="constitution" className={labelCls}>
                    中医体质
                  </label>
                  <select
                    id="constitution"
                    name="constitution"
                    defaultValue={profile.constitution}
                    className={fieldCls}
                  >
                    <option value="">不清楚</option>
                    {profile.constitution &&
                      !CONSTITUTION_OPTIONS.includes(profile.constitution) && (
                        <option value={profile.constitution}>
                          {profile.constitution}（原有记录）
                        </option>
                      )}
                    {CONSTITUTION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    已知道自己体质的直接选择即可；不确定的可做下方标准问卷。
                  </p>
                  <ConstitutionTest current={profile.constitution} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="allergy" className={labelCls}>
                    过敏史
                  </label>
                  <input
                    id="allergy"
                    name="allergy"
                    maxLength={255}
                    defaultValue={profile.allergy}
                    placeholder="如：花粉、海鲜"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="dietPref" className={labelCls}>
                    饮食偏好
                  </label>
                  <input
                    id="dietPref"
                    name="dietPref"
                    maxLength={200}
                    defaultValue={profile.dietPref}
                    placeholder="如：清淡少辣"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="exercisePref" className={labelCls}>
                    运动习惯
                  </label>
                  <input
                    id="exercisePref"
                    name="exercisePref"
                    maxLength={200}
                    defaultValue={profile.exercisePref}
                    placeholder="如：每周三次八段锦"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="sleepPref" className={labelCls}>
                    作息规律
                  </label>
                  <input
                    id="sleepPref"
                    name="sleepPref"
                    maxLength={200}
                    defaultValue={profile.sleepPref}
                    placeholder="如：23 点前入睡"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="bodySense" className={labelCls}>
                    体感敏感度
                  </label>
                  <select
                    id="bodySense"
                    name="bodySense"
                    defaultValue={
                      ["怕冷", "正常", "怕热"].includes(profile.bodySense)
                        ? profile.bodySense
                        : ""
                    }
                    className={fieldCls}
                  >
                    <option value="">不清楚</option>
                    {profile.bodySense &&
                      !["怕冷", "正常", "怕热"].includes(profile.bodySense) && (
                        <option value={profile.bodySense}>
                          {profile.bodySense}（原有记录）
                        </option>
                      )}
                    <option value="怕冷">怕冷</option>
                    <option value="正常">正常</option>
                    <option value="怕热">怕热</option>
                  </select>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    用于穿衣页场景提醒与实时天气联动。
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="wakeTime" className={labelCls}>
                    目标起床时间
                  </label>
                  <input
                    id="wakeTime"
                    name="wakeTime"
                    type="time"
                    defaultValue={profile.wakeTime}
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="napTime" className={labelCls}>
                    目标午憩时间
                  </label>
                  <input
                    id="napTime"
                    name="napTime"
                    type="time"
                    defaultValue={profile.napTime}
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="bedTime" className={labelCls}>
                    目标入睡时间
                  </label>
                  <input
                    id="bedTime"
                    name="bedTime"
                    type="time"
                    defaultValue={profile.bedTime}
                    className={fieldCls}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                保存档案
              </button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* 慢病与用药档案 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">慢病与用药档案</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4 text-sm text-muted-foreground">
              填写后，AI 助手会在建议中主动避开与你情况相冲突的内容（如孕期慎用的穴位/食材）
            </p>
            <form action={saveChronicAction} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <span className={labelCls}>慢病情况</span>
                  <div className="flex items-center gap-4 text-sm text-ink">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="hasDisease"
                        value="0"
                        defaultChecked={!chronic?.hasDisease}
                        className="accent-primary"
                      />
                      无
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="hasDisease"
                        value="1"
                        defaultChecked={chronic?.hasDisease ?? false}
                        className="accent-primary"
                      />
                      有
                    </label>
                  </div>
                  <input
                    name="diseases"
                    maxLength={500}
                    defaultValue={chronic?.diseases ?? ""}
                    placeholder="如：高血压、糖尿病，多个用顿号分隔"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-2">
                  <span className={labelCls}>在服药物</span>
                  <div className="flex items-center gap-4 text-sm text-ink">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="hasMeds"
                        value="0"
                        defaultChecked={!chronic?.hasMeds}
                        className="accent-primary"
                      />
                      无
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="hasMeds"
                        value="1"
                        defaultChecked={chronic?.hasMeds ?? false}
                        className="accent-primary"
                      />
                      有
                    </label>
                  </div>
                  <input
                    name="meds"
                    maxLength={500}
                    defaultValue={chronic?.meds ?? ""}
                    placeholder="如：二甲双胍、降压药，多个用顿号分隔"
                    className={fieldCls}
                  />
                </div>
              </div>

              <div className="space-y-1 md:max-w-xs">
                <label htmlFor="pregnancy" className={labelCls}>
                  孕期状态
                </label>
                <select
                  id="pregnancy"
                  name="pregnancy"
                  defaultValue={chronic?.pregnancy ?? "none"}
                  className={fieldCls}
                >
                  <option value="none">无</option>
                  <option value="trying">备孕</option>
                  <option value="pregnant">孕期</option>
                  <option value="breastfeeding">哺乳期</option>
                </select>
              </div>

              <button
                type="submit"
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                保存慢病档案
              </button>
              <p className="text-xs text-muted-foreground">
                以上信息仅用于养生建议的个性化安全过滤，不作为医疗用途
              </p>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* 我的收藏 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">我的收藏</h2>
        <Card>
          <CardContent className="pt-6">
            <FavoriteList items={favorites} typeLabel={FAV_TYPE_LABEL} />
          </CardContent>
        </Card>
      </section>

      {/* 账号与安全 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">账号与安全</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2 text-sm">
              <p className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">账号</span>
                <span className="text-ink">{user?.username ?? "—"}</span>
              </p>
              <p className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">昵称</span>
                <span className="text-ink">{user?.name ?? "—"}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">注册时间</span>
                <span className="text-ink">{user?.created_at ?? "—"}</span>
              </p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-sm font-semibold text-ink">修改密码</p>
              <ChangePasswordForm />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 提醒设置 + 意见反馈（组件自带卡片与标题） */}
      <ReminderSwitches />
      <FeedbackForm />

      {/* 设置 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">设置</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">退出登录</p>
              <p className="text-xs text-muted-foreground">
                清除本地会话，返回登录页
              </p>
            </div>
            {loggedIn ? (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-lg border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                >
                  退出登录
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
              >
                去登录
              </Link>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

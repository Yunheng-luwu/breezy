"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { changePasswordAction, submitFeedbackAction } from "@/lib/auth-actions";
import { cn } from "@/lib/utils";

/* ============ 提醒设置（localStorage，本设备生效） ============ */

const TODO_KEY = "songxu_todo_alert";
const WEATHER_KEY = "songxu_weather_alert";

function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/40",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
          on ? "right-0.5" : "left-0.5",
        )}
      />
    </button>
  );
}

export function ReminderSwitches() {
  const [todoOn, setTodoOn] = useState(true);
  const [weatherOn, setWeatherOn] = useState(true);

  useEffect(() => {
    setTodoOn(localStorage.getItem(TODO_KEY) !== "0");
    setWeatherOn(localStorage.getItem(WEATHER_KEY) !== "0");
  }, []);

  const toggleTodo = () => {
    const next = !todoOn;
    localStorage.setItem(TODO_KEY, next ? "1" : "0");
    setTodoOn(next);
  };
  const toggleWeather = () => {
    const next = !weatherOn;
    localStorage.setItem(WEATHER_KEY, next ? "1" : "0");
    setWeatherOn(next);
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-2 font-semibold text-ink">提醒设置</h3>
      <div className="flex items-center justify-between gap-4 border-b border-border py-3">
        <div>
          <p className="text-sm text-ink">每日待办提醒</p>
          <p className="text-xs text-muted-foreground">临近待办时间时弹窗与系统通知</p>
        </div>
        <Switch on={todoOn} onToggle={toggleTodo} label="每日待办提醒" />
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <div>
          <p className="text-sm text-ink">天气提醒</p>
          <p className="text-xs text-muted-foreground">降温、大风等天气变化时自动提示</p>
        </div>
        <Switch on={weatherOn} onToggle={toggleWeather} label="天气提醒" />
      </div>
      <p className="text-xs text-muted-foreground">
        偏好保存在本设备上，与「穿衣建议」页的天气开关同步
      </p>
    </div>
  );
}

/* ============ 修改密码 ============ */

const pwdCls =
  "w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary";

export function ChangePasswordForm() {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (newPwd !== newPwd2) {
      setMsg({ ok: false, text: "两次输入的新密码不一致" });
      return;
    }
    start(async () => {
      const r = await changePasswordAction(oldPwd, newPwd);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setOldPwd("");
        setNewPwd("");
        setNewPwd2("");
      }
    });
  };

  return (
    <div className="space-y-2">
      <input
        type="password"
        value={oldPwd}
        onChange={(e) => setOldPwd(e.target.value)}
        placeholder="原密码"
        className={pwdCls}
      />
      <input
        type="password"
        value={newPwd}
        onChange={(e) => setNewPwd(e.target.value)}
        placeholder="新密码（至少 6 位）"
        className={pwdCls}
      />
      <input
        type="password"
        value={newPwd2}
        onChange={(e) => setNewPwd2(e.target.value)}
        placeholder="确认新密码"
        className={pwdCls}
      />
      {msg && (
        <p className={cn("text-xs", msg.ok ? "text-jade" : "text-destructive")}>
          {msg.text}
        </p>
      )}
      <button
        type="button"
        disabled={pending || !oldPwd || !newPwd}
        onClick={submit}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        保存新密码
      </button>
    </div>
  );
}

/* ============ 意见反馈 ============ */

export function FeedbackForm() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    start(async () => {
      const r = await submitFeedbackAction(text);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setText("");
    });
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-3 font-semibold text-ink">意见反馈</h3>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        placeholder="说说你的建议或遇到的问题（5~500 字），我们会认真看每一条"
        className="min-h-[110px] w-full resize-y rounded-lg border bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{text.length}/500</span>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          提交反馈
        </button>
      </div>
      {msg && (
        <p className={cn("mt-2 text-xs", msg.ok ? "text-jade" : "text-destructive")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/* ============ 我的收藏管理：删除 / 清空 ============ */

import { useRouter } from "next/navigation";
import { toggleFavoriteAction } from "@/lib/actions";

export interface FavItem {
  id: number;
  favType: string;
  targetName: string;
  meta?: string;
}

export function FavoriteList({
  items,
  typeLabel,
}: {
  items: FavItem[];
  typeLabel: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmClear, setConfirmClear] = useState(false);

  const removeOne = (f: FavItem) => {
    start(async () => {
      await toggleFavoriteAction(f.favType, f.targetName);
      router.refresh();
    });
  };

  const clearAll = () => {
    start(async () => {
      for (const f of items) {
        await toggleFavoriteAction(f.favType, f.targetName);
      }
      setConfirmClear(false);
      router.refresh();
    });
  };

  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        还没有收藏，在食疗/穴位卡片里点收藏即可加入。
      </p>
    );
  }

  return (
    <div className={pending ? "opacity-60" : ""}>
      <div className="mb-2 flex justify-end">
        {confirmClear ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">确认清空全部 {items.length} 条？</span>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md bg-destructive px-2.5 py-1 text-xs text-destructive-foreground transition hover:opacity-90"
            >
              确认清空
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition hover:text-ink"
            >
              取消
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-xs text-muted-foreground transition hover:text-destructive"
          >
            清空全部
          </button>
        )}
      </div>
      <ul className="divide-y">
        {items.map((f) => (
          <li key={f.id} className="group flex items-center gap-3 py-3">
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
              {typeLabel[f.favType] ?? f.favType}
            </span>
            <span className="flex-1 text-sm">{f.targetName}</span>
            {f.meta && (
              <span className="text-xs text-muted-foreground">{f.meta}</span>
            )}
            <button
              type="button"
              onClick={() => removeOne(f)}
              disabled={pending}
              title="取消收藏"
              aria-label={`删除收藏 ${f.targetName}`}
              className="rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground opacity-60 transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive hover:opacity-100 group-hover:opacity-100"
            >
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============ 昵称与头像编辑（预设 emoji 或上传图片） ============ */

import { saveIdentityAction } from "@/lib/actions";

export const AVATAR_PRESETS = ["🌿", "🌸", "🍵", "🌙", "☀️", "🌧️", "🍊", "🎋", "🐈", "🦉"];

/** 头像是否为本站上传的图片路径 */
const isUploadedAvatar = (a: string) => a.startsWith("/uploads/avatars/");

export function ProfileIdentityEditor({
  initialName,
  initialAvatar,
}: {
  initialName: string;
  initialAvatar: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar || "🌿");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const n = name.trim();
    if (!n) return;
    start(async () => {
      await saveIdentityAction(n, avatar);
      setOpen(false);
      router.refresh();
    });
  };

  const upload = async (file: File) => {
    setUploadErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/avatar", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setUploadErr(json.error ?? "上传失败，请重试");
        return;
      }
      setAvatar(json.url);
    } catch {
      setUploadErr("网络异常，上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(initialName);
          setAvatar(initialAvatar || "🌿");
          setUploadErr("");
          setOpen(true);
        }}
        className="rounded-lg border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        编辑资料
      </button>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-3 rounded-xl border bg-card p-4">
      {/* 实时预览：大头像 + 昵称 */}
      <div className="flex items-center gap-3 rounded-lg bg-accent/50 p-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-3xl text-primary-foreground">
          {isUploadedAvatar(avatar) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="头像预览" className="h-full w-full object-cover" />
          ) : (
            avatar
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-brush text-lg font-bold text-ink">
            {name.trim() || "（昵称不能为空）"}
          </p>
          <p className="text-[11px] text-muted-foreground">实时预览 · 保存后生效</p>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">昵称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">头像</label>
        <div className="flex flex-wrap items-center gap-2">
          {AVATAR_PRESETS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border text-xl transition",
                avatar === a
                  ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              {a}
            </button>
          ))}
          {/* 自定义上传 */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="上传自定义头像（JPG/PNG/WebP，≤2MB）"
            className={cn(
              "relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border transition",
              isUploadedAvatar(avatar)
                ? "border-primary ring-2 ring-primary/30"
                : "border-dashed border-border hover:border-primary/50",
            )}
          >
            {isUploadedAvatar(avatar) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="自定义头像" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg text-muted-foreground">{uploading ? "…" : "＋"}</span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </div>
        {uploadErr && <p className="text-xs text-destructive">{uploadErr}</p>}
        <p className="text-[11px] text-muted-foreground">
          点「＋」上传自己的图片（JPG / PNG / WebP，不超过 2MB）
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || uploading || !name.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border px-4 py-2 text-sm text-muted-foreground transition hover:text-ink"
        >
          取消
        </button>
      </div>
    </div>
  );
}

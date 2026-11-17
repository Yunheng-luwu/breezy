"use client";

/** 点击头像时通知资料编辑器展开（个人中心页内联动） */
export const IDENTITY_EDIT_EVENT = "breezy:edit-identity";

export function IdentityAvatar({
  avatar,
  name,
  interactive = true,
}: {
  avatar?: string | null;
  name: string;
  /** 未登录时只展示，不可点击 */
  interactive?: boolean;
}) {
  const uploaded = avatar?.startsWith("/uploads/");
  const inner = uploaded ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar ?? ""} alt={`${name}的头像`} className="h-full w-full object-cover" />
  ) : (
    avatar || "🌿"
  );

  if (!interactive) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-4xl text-primary-foreground">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(IDENTITY_EDIT_EVENT))}
      title="点击更换头像"
      aria-label="更换头像"
      className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-4xl text-primary-foreground transition hover:ring-2 hover:ring-primary/40 hover:ring-offset-2"
    >
      {inner}
      <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-xs text-white group-hover:flex">
        更换
      </span>
    </button>
  );
}

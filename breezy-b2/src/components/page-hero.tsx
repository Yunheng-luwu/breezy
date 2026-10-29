/**
 * 页面顶部 title 图（对齐冻结版 .page-banner：大图 + 渐变遮罩 + 标题/副标题）
 * 图片为本地化资源 public/img/banners/*.jpg
 */
export function PageHero({
  img,
  title,
  subtitle,
  seal,
}: {
  img: string;
  title: string;
  subtitle?: string;
  /** 首页右上角印章字样 */
  seal?: string;
}) {
  return (
    <div className="relative -mx-6 -mt-6 mb-8 h-44 overflow-hidden md:h-56">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#2b241d]/85 via-[#2b241d]/25 to-transparent" />
      {seal && (
        <span className="absolute right-6 top-5 flex h-11 w-11 items-center justify-center rounded-md border border-white/60 font-brush text-sm text-white/90">
          {seal}
        </span>
      )}
      <div className="absolute inset-x-6 bottom-5">
        <h1 className="font-brush text-3xl font-bold text-white drop-shadow-sm">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-white/85">{subtitle}</p>
        )}
        <span className="mt-2 block h-px w-10 bg-white/60" />
      </div>
    </div>
  );
}

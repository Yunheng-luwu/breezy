/**
 * 页面顶部横幅轮播素材
 * 图片位于 public/img/banners/<key>/1.jpg … 5.jpg（由「松序横幅轮播素材-web版」整理而来）
 */
const BANNER_COUNT = 5;

function bannerSet(dir: string, count = BANNER_COUNT): string[] {
  return Array.from({ length: count }, (_, i) => `/img/banners/${dir}/${i + 1}.jpg`);
}

export const bannerSets = {
  home: bannerSet("home"),
  care: bannerSet("care"),
  diet: bannerSet("diet"),
  clothing: bannerSet("clothing"),
  rhythm: bannerSet("rhythm"),
  practice: bannerSet("practice", 4),
  mood: bannerSet("mood"),
  record: bannerSet("record"),
};

/**
 * 个别横幅的裁切焦点（object-position）
 * 人物主体靠上的图，默认居中裁切会把头部切掉，这里单独上移取景
 */
export const bannerFocus: Record<string, string> = {
  "/img/banners/practice/2.jpg": "center 20%",
};

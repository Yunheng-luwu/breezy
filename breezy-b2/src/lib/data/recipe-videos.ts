/**
 * 养生食谱视频清单
 * 视频文件统一放在 public/recipe-videos/ 下；尚未录制的条目也先占位，
 * 播放器在视频加载失败时会显示「视频制作中」的占位卡片，不影响布局演示。
 */

export interface RecipeVideo {
  /** 食谱名称（需与 diet.json 中的 name 对应，详情弹窗会自动挂载视频） */
  name: string;
  /** 视频文件路径，/public/recipe-videos/xxx.mp4 */
  src: string;
  /** 封面 emoji（占位用，真实视频可换首帧截图） */
  poster: string;
  /** 分类：茶饮 / 药粥 / 养生汤 / 家常药膳 / 节气特辑 */
  category: string;
  /** 适合体质标签（与体质测评联动展示） */
  suitable: string[];
  /** 视频时长（占位，录制后替换） */
  duration: string;
}

export const RECIPE_VIDEOS: RecipeVideo[] = [
  {
    name: "玫瑰花茶",
    src: "/recipe-videos/meigui-huacha.mp4",
    poster: "🌹",
    category: "茶饮",
    suitable: ["气郁质", "平和质"],
    duration: "00:15",
  },
  {
    name: "山药小米粥",
    src: "/recipe-videos/shanyao-xiaomi-zhou.mp4",
    poster: "🍚",
    category: "药粥",
    suitable: ["气虚质", "平和质"],
    duration: "00:15",
  },
  {
    name: "健脾山药汤",
    src: "/recipe-videos/jianpi-shanyao-tang.mp4",
    poster: "🍲",
    category: "养生汤",
    suitable: ["气虚质", "阳虚质"],
    duration: "00:15",
  },
  {
    name: "芹菜炒香菇",
    src: "/recipe-videos/qincai-chaoxianggu.mp4",
    poster: "🥘",
    category: "家常药膳",
    suitable: ["痰湿质", "湿热质"],
    duration: "00:15",
  },
  {
    name: "枸杞蒸蛋",
    src: "/recipe-videos/gouqi-zhengdan.mp4",
    poster: "🍳",
    category: "家常药膳",
    suitable: ["阴虚质", "气虚质"],
    duration: "00:15",
  },
  {
    name: "当归生姜羊肉汤",
    src: "/recipe-videos/danggui-shengjiang-yangrou-tang.mp4",
    poster: "🍲",
    category: "养生汤",
    suitable: ["阳虚质", "气虚质"],
    duration: "00:15",
  },
  {
    name: "佛手瘦肉汤",
    src: "/recipe-videos/foshou-shourou-tang.mp4",
    poster: "🍲",
    category: "养生汤",
    suitable: ["气郁质", "痰湿质"],
    duration: "00:15",
  },
  {
    name: "白术陈皮粥",
    src: "/recipe-videos/baizhu-chenpi-zhou.mp4",
    poster: "🍚",
    category: "药粥",
    suitable: ["痰湿质", "气虚质"],
    duration: "00:10",
  },
  {
    name: "百合莲子粥",
    src: "/recipe-videos/baihe-lianzi-zhou.mp4",
    poster: "🍚",
    category: "药粥",
    suitable: ["阴虚质", "平和质"],
    duration: "00:14",
  },
  {
    name: "红枣山药粥",
    src: "/recipe-videos/hongzao-shanyao-zhou.mp4",
    poster: "🍚",
    category: "药粥",
    suitable: ["气虚质", "阴虚质"],
    duration: "00:15",
  },
  {
    name: "银耳百合粥",
    src: "/recipe-videos/yiner-baihe-zhou.mp4",
    poster: "🍚",
    category: "药粥",
    suitable: ["阴虚质", "平和质"],
    duration: "00:15",
  },
  {
    name: "清蒸鲈鱼",
    src: "/recipe-videos/qingzheng-luyu.mp4",
    poster: "🐟",
    category: "家常药膳",
    suitable: ["气虚质", "平和质"],
    duration: "00:15",
  },
  {
    name: "番茄炖豆腐",
    src: "/recipe-videos/fanqie-dun-doufu.mp4",
    poster: "🥘",
    category: "家常药膳",
    suitable: ["平和质", "阴虚质"],
    duration: "00:15",
  },
  {
    name: "西兰花炒胡萝卜",
    src: "/recipe-videos/xilanhua-chaohuluobo.mp4",
    poster: "🥦",
    category: "家常药膳",
    suitable: ["平和质", "湿热质"],
    duration: "00:10",
  },
  {
    name: "莲藕排骨汤",
    src: "/recipe-videos/lianou-paigu-tang.mp4",
    poster: "🍲",
    category: "养生汤",
    suitable: ["阴虚质", "平和质"],
    duration: "00:15",
  },
  {
    name: "菠菜猪肝汤",
    src: "/recipe-videos/bocai-zhugan-tang.mp4",
    poster: "🍲",
    category: "养生汤",
    suitable: ["阴虚质", "气虚质"],
    duration: "00:15",
  },
];

/** 按食谱名查视频（供详情弹窗使用） */
export function videoOfRecipe(name: string): RecipeVideo | undefined {
  return RECIPE_VIDEOS.find((v) => v.name === name);
}

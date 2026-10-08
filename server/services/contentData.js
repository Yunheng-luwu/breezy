/**
 * 静态内容数据（与数据库无关）
 * 供 REST 路由（routes/api.js）与 AI 工具层（agent/tools）共用，避免两处维护
 */

const dietData = {
  recommend: {
    // principle 供 AI 工具引用；principles 供前端「换一批」轮换
    principle: '今日阴雨湿重，宜喝陈皮红枣茶，忌冰饮',
    principles: [
      '今日阴雨湿重，宜喝陈皮红枣茶，忌冰饮',
      '肝郁易气滞，多食玫瑰花、佛手疏肝理气，少碰油腻',
      '脾胃喜温恶寒，三餐定时，晨起一杯温水唤醒脾胃',
      '怒后勿急食，先深呼吸缓一缓，再用一碗小米粥养胃',
      '晚餐七分饱，给脾胃留余地，也助一夜好眠',
      '青色入肝，今天给餐桌添一盘菠菜或西兰花',
      '甜食生湿碍脾，嘴馋时用几颗红枣代替奶茶蛋糕',
      '久坐伤脾，饭后散步一刻钟，比消食片更养人',
    ],
    foods: ['陈皮', '红枣', '玫瑰花', '山药', '枸杞'],
  },
  goodFoods: {
    tea: ['玫瑰花茶', '陈皮茶', '菊花茶', '枸杞茶', '茉莉花茶', '荷叶茶', '桂花茶', '大麦茶'],
    staple: ['山药粥', '小米粥', '红枣饭', '薏米饭', '燕麦粥', '南瓜小米粥', '红豆薏米饭', '黑芝麻饭'],
    vegetable: ['菠菜', '芹菜', '西兰花', '胡萝卜', '山药', '冬瓜', '白萝卜', '莲藕'],
    fruit: ['苹果', '橙子', '葡萄', '猕猴桃', '雪梨', '柑橘', '香蕉', '红枣'],
  },
  badFoods: {
    cold: ['冰饮', '冰淇淋', '生鱼片', '凉拌菜', '冰西瓜', '冷咖啡'],
    spicy: ['辣椒', '花椒', '烧烤', '炸鸡', '麻辣烫', '薯条'],
    sour: ['柠檬', '醋', '酸梅', '山楂(过量)', '泡椒', '酸辣粉'],
  },
  recipes: [
    { time: '早餐', name: '红枣山药粥', ingredients: '山药100g, 红枣5颗, 大米50g' },
    { time: '午餐', name: '芹菜炒香干', ingredients: '芹菜200g, 香干100g, 木耳适量' },
    { time: '晚餐', name: '菠菜猪肝汤', ingredients: '菠菜150g, 猪肝100g, 姜片3片' },
    { time: '加餐', name: '玫瑰花茶', ingredients: '玫瑰花5朵, 枸杞10粒, 蜂蜜适量' },
  ],
  // 食谱池：前端“换一批”从各餐池中随机抽取，保证每次有变化
  recipePool: {
    breakfast: [
      { name: '红枣山药粥', ingredients: '山药100g, 红枣5颗, 大米50g' },
      { name: '小米枸杞粥', ingredients: '小米60g, 枸杞15粒' },
      { name: '百合莲子羹', ingredients: '百合20g, 莲子30g, 冰糖少许' },
      { name: '陈皮红豆沙', ingredients: '红豆50g, 陈皮3g' },
    ],
    lunch: [
      { name: '芹菜炒香干', ingredients: '芹菜200g, 香干100g, 木耳适量' },
      { name: '西兰花炒胡萝卜', ingredients: '西兰花200g, 胡萝卜半根' },
      { name: '番茄炖豆腐', ingredients: '番茄2个, 嫩豆腐1盒' },
      { name: '清蒸鲈鱼', ingredients: '鲈鱼1条, 葱姜丝适量' },
    ],
    dinner: [
      { name: '菠菜猪肝汤', ingredients: '菠菜150g, 猪肝100g, 姜片3片' },
      { name: '莲藕排骨汤', ingredients: '莲藕200g, 排骨150g' },
      { name: '山药菌菇汤', ingredients: '山药150g, 香菇/金针菇各50g' },
      { name: '银耳百合羹', ingredients: '银耳半朵, 百合20g' },
    ],
    snack: [
      { name: '玫瑰花茶', ingredients: '玫瑰花5朵, 枸杞10粒, 蜂蜜适量' },
      { name: '陈皮红枣茶', ingredients: '陈皮3g, 红枣5颗' },
      { name: '枸杞菊花茶', ingredients: '枸杞15粒, 菊花5朵' },
      { name: '佛手柑茶', ingredients: '佛手柑5g, 热水冲泡' },
    ],
  },
};

const clothingData = {
  temp: 18, weather: '\u{1F327}', city: '杭州',
  high: 22, low: 14, diff: 8, wind: '北风3级', humidity: 65,
  principle: '今日降温大风，重点护住颈肩脚踝',
  inner: '薄长袖纯棉打底，透气吸汗',
  outer: '薄羽绒或风衣，防风为主',
  shoes: '运动鞋或短靴，不露脚踝',
};

const exerciseData = [
  { name: '八段锦·两手托天', duration: '3分钟', tag: '舒肝理气', icon: '\u{1F9D8}' },
  { name: '梳头功', duration: '2分钟', tag: '疏肝明目', icon: '\u{1F48E}' },
  { name: '扩胸运动', duration: '2分钟', tag: '宽胸理气', icon: '\u{1F4AA}' },
  { name: '侧腰拉伸', duration: '3分钟', tag: '疏通胆经', icon: '\u{1F9D5}' },
  { name: '搓胁肋', duration: '2分钟', tag: '疏肝解郁', icon: '\u{1F9B6}' },
  { name: '深呼吸478', duration: '4分钟', tag: '安神定志', icon: '\u{1F33F}' },
];

// 功法带练：八段锦走数据库，其余两组为静态动作
const practiceStretchData = [
  { name: '搓胁肋', duration: '2分钟', desc: '双手沿肋间隙来回推搓，疏肝解郁' },
  { name: '侧腰拉伸', duration: '3分钟', desc: '左右各15次，疏通两侧胆经' },
  { name: '扩胸展肩', duration: '2分钟', desc: '双手背后交握上提，宽胸理气' },
  { name: '旋腰转脊', duration: '3分钟', desc: '缓慢左右转腰各10圈，放松腰背' },
  { name: '深呼吸478', duration: '4分钟', desc: '吸4秒屏7秒呼8秒，4轮安神' },
];

const practiceOfficeData = [
  { name: '梳头功', duration: '2分钟', desc: '十指微屈如梳，从前额发际梳到后颈，疏肝明目、缓解头胀' },
  { name: '按揉合谷', duration: '2分钟', desc: '左右手各按1分钟，通经活络' },
  { name: '耸肩绕颈', duration: '2分钟', desc: '耸肩10次+缓慢转颈，放松肩颈' },
  { name: '搓掌浴面', duration: '2分钟', desc: '搓热双手干洗脸，提神疏气' },
  { name: '踮脚勾足', duration: '3分钟', desc: '踮脚30次，促进下肢气血' },
  { name: '闭目转睛', duration: '2分钟', desc: '眼球左右各转10圈，缓解视疲劳' },
  { name: '捶打胆经', duration: '3分钟', desc: '空心拳沿大腿外侧轻敲，疏通胆经' },
];

module.exports = {
  dietData, clothingData, exerciseData,
  practiceStretchData, practiceOfficeData,
};

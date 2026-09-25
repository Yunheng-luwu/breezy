/**
 * 松序 - API路由
 * 所有后端接口统一挂载在 /api 下
 */

const express = require('express');
const router = express.Router();

// ============ 模拟数据 ============
const acupoints = {
  stress: [
    { id: 1, name: '太冲穴', tag: '疏肝理气', effect: '生气后按5分钟，疏解胸闷', icon: '\u{1F9B6}' },
    { id: 2, name: '期门穴', tag: '肝经募穴', effect: '胸胁胀痛时按揉3分钟', icon: '\u{1F4AC}' },
    { id: 3, name: '阳陵泉', tag: '胆经合穴', effect: '口苦烦躁时按压5分钟', icon: '\u{1FAB5}' },
    { id: 4, name: '行间穴', tag: '清肝泻火', effect: '急躁易怒时掐按3分钟', icon: '\u{1F331}' },
    { id: 5, name: '膻中穴', tag: '宽胸理气', effect: '胸闷时掌根揉2分钟', icon: '\u{1F9B4}' },
    { id: 6, name: '合谷穴', tag: '通经活络', effect: '头痛牙痛时按压3分钟', icon: '\u270A' },
  ],
  neck: [
    { id: 7, name: '风池穴', tag: '祛风解表', effect: '肩颈僵硬时揉按5分钟', icon: '\u{1F9D0}' },
    { id: 8, name: '肩井穴', tag: '舒筋活络', effect: '久坐肩酸时捏按3分钟', icon: '\u{1F9D8}' },
    { id: 9, name: '大椎穴', tag: '振奋阳气', effect: '怕冷时搓热2分钟', icon: '\u{1F311}' },
  ],
  sleep: [
    { id: 10, name: '神门穴', tag: '安神定志', effect: '失眠时按揉3分钟助眠', icon: '\u{1F4A4}' },
    { id: 11, name: '三阴交', tag: '滋阴养血', effect: '睡前按5分钟改善睡眠', icon: '\u{1F337}' },
    { id: 12, name: '涌泉穴', tag: '引火归元', effect: '搓脚心100下助深度睡眠', icon: '\u{1F9B6}' },
  ],
  office: [
    { id: 13, name: '内关穴', tag: '和胃降逆', effect: '恶心时按压2分钟', icon: '\u{1F44B}' },
    { id: 14, name: '列缺穴', tag: '宣肺利窍', effect: '头痛时掐按1分钟', icon: '\u{1FAB0}' },
    { id: 15, name: '后溪穴', tag: '舒筋止痛', effect: '手腕酸痛时按揉2分钟', icon: '\u{1F4AA}' },
  ],
};

const footbathRecipes = [
  { name: '玫瑰疏肝方', herbs: '玫瑰花10g + 柴胡6g + 薄荷5g', temp: '40-42°C', duration: '20分钟' },
  { name: '艾草温通方', herbs: '艾叶15g + 生姜3片 + 红花5g', temp: '38-40°C', duration: '15分钟' },
  { name: '合欢安神方', herbs: '合欢皮10g + 夜交藤15g + 柏子仁5g', temp: '40°C', duration: '20分钟' },
];

const dietData = {
  recommend: {
    principle: '今日阴雨湿重，宜喝陈皮红枣茶，忌冰饮',
    foods: ['陈皮', '红枣', '玫瑰花', '山药', '枸杞'],
  },
  goodFoods: {
    tea: ['玫瑰花茶', '陈皮茶', '菊花茶', '枸杞茶'],
    staple: ['山药粥', '小米粥', '红枣饭', '薏米饭'],
    vegetable: ['菠菜', '芹菜', '西兰花', '胡萝卜'],
    fruit: ['苹果', '橙子', '葡萄', '猕猴桃'],
  },
  badFoods: {
    cold: ['冰饮', '冰淇淋', '生鱼片', '凉拌菜'],
    spicy: ['辣椒', '花椒', '烧烤', '炸鸡'],
    sour: ['柠檬', '醋', '酸梅', '山楂(过量)'],
  },
  recipes: [
    { time: '早餐', name: '红枣山药粥', ingredients: '山药100g, 红枣5颗, 大米50g' },
    { time: '午餐', name: '芹菜炒香干', ingredients: '芹菜200g, 香干100g, 木耳适量' },
    { time: '晚餐', name: '菠菜猪肝汤', ingredients: '菠菜150g, 猪肝100g, 姜片3片' },
    { time: '加餐', name: '玫瑰花茶', ingredients: '玫瑰花5朵, 枸杞10粒, 蜂蜜适量' },
  ],
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

const movesData = [
  { id: 1, name: '两手托天理三焦', duration: '30s' },
  { id: 2, name: '左右开弓似射雕', duration: '30s' },
  { id: 3, name: '调理脾胃须单举', duration: '30s' },
  { id: 4, name: '五劳七伤往后瞧', duration: '30s' },
  { id: 5, name: '摇头摆尾去心火', duration: '30s' },
  { id: 6, name: '两手攀足固肾腰', duration: '30s' },
  { id: 7, name: '攒拳怒目增气力', duration: '30s' },
  { id: 8, name: '背后七颠百病消', duration: '30s' },
];

const symptoms = [
  { symptom: '胸闷', severity: '轻度', time: '2026-09-12 14:30', cause: '工作压力' },
  { symptom: '失眠', severity: '中度', time: '2026-09-11 23:00', cause: '熬夜刷手机' },
  { symptom: '易怒', severity: '轻度', time: '2026-09-11 10:00', cause: '会议冲突' },
  { symptom: '头痛', severity: '轻度', time: '2026-09-10 16:00', cause: '空调直吹' },
];

const medicines = [
  { name: '逍遥丸', dose: '8粒/次', time: '饭后30分钟', note: '经期停服' },
  { name: '柴胡疏肝散', dose: '1袋/次', time: '早晚饭后', note: '忌辛辣' },
  { name: '归脾丸', dose: '10粒/次', time: '睡前1小时', note: '感冒时停服' },
  { name: '玫瑰花茶', dose: '5朵/杯', time: '下午3点', note: '孕妇慎用' },
];

// ============ 接口定义 ============

// 健康仪表盘
router.get('/health/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      score: 62,
      level: '轻度肝郁',
      desc: '气机略滞，适合按揉太冲穴疏解',
      weather: '阴 18°C',
      city: '杭州',
      todos: [
        { id: 1, text: '逍遥丸 · 饭后30分钟', time: '12:30', done: false, type: 'med' },
        { id: 2, text: '太冲穴按揉5分钟', time: '15:00', done: false, type: 'ai' },
        { id: 3, text: '23点前放下手机', time: '22:30', done: false, type: 'sleep' },
        { id: 4, text: '玫瑰花茶一杯', time: '16:00', done: true, type: 'diet' },
      ],
    },
  });
});

// 穴位数据
router.get('/care/acupoints', (req, res) => {
  const cat = req.query.category || 'stress';
  const data = acupoints[cat] || acupoints.stress;
  res.json({ success: true, data });
});

// 穴位详情
router.get('/care/acupoints/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const all = [...acupoints.stress, ...acupoints.neck, ...acupoints.sleep, ...acupoints.office];
  const point = all.find(p => p.id === id);
  if (point) {
    res.json({
      success: true,
      data: {
        ...point,
        location: '足背侧，第一、二跖骨结合部前方凹陷处',
        method: '拇指按揉，力度以酸胀为度',
        duration: '5分钟',
        frequency: '每日2-3次',
      },
    });
  } else {
    res.status(404).json({ success: false, message: '穴位不存在' });
  }
});

// 泡脚配方生成
router.post('/care/footbath', (req, res) => {
  const status = (req.body.status || '').trim();
  if (!status) {
    return res.status(400).json({ success: false, message: '请输入你今天的状态' });
  }
  let recipe;
  if (status.includes('失眠') || status.includes('睡不着')) {
    recipe = footbathRecipes[2];
  } else if (status.includes('怕冷') || status.includes('手脚凉')) {
    recipe = footbathRecipes[1];
  } else {
    recipe = footbathRecipes[0];
  }
  res.json({ success: true, data: recipe });
});

// 饮食推荐
router.get('/diet/recommend', (req, res) => {
  res.json({ success: true, data: dietData.recommend });
});

router.get('/diet/foods', (req, res) => {
  res.json({ success: true, data: { good: dietData.goodFoods, bad: dietData.badFoods } });
});

router.get('/diet/recipes', (req, res) => {
  res.json({ success: true, data: dietData.recipes });
});

// 穿衣建议
router.get('/clothing', (req, res) => {
  res.json({ success: true, data: clothingData });
});

// 运动建议
router.get('/rhythm/exercise', (req, res) => {
  res.json({ success: true, data: exerciseData });
});

// 情绪打卡
router.post('/rhythm/mood', (req, res) => {
  res.json({ success: true, message: '情绪已记录: ' + (req.body.mood || '未知') });
});

// AI对话
const aiReplies = {
  '睡不着': '建议睡前按揉神门穴和三阴交各3分钟，配合478呼吸法（吸气4秒、屏息7秒、呼气8秒），重复4轮。另外23点前放下手机，让肝胆经正常排毒。',
  '生气': '生气后肝气上逆，建议立刻按揉太冲穴（足背第一二跖骨间）5分钟，配合深呼吸。再泡一杯玫瑰花茶疏肝理气。记住：生气伤肝，疏解比压抑好。',
  '肩颈': '肩颈僵硬多因久坐气滞，建议按揉风池穴和肩井穴各3分钟。每小时起身做扩胸运动2分钟，疏通胆经气血运行。',
  '吃什么': '今日适合喝陈皮红枣茶（陈皮3g+红枣5颗），午餐搭配菠菜猪肝汤养血疏肝。忌冰饮和辛辣，避免加重肝郁。',
};

router.post('/chat/message', (req, res) => {
  const msg = req.body.message || '';
  let reply = '';
  for (const key in aiReplies) {
    if (msg.includes(key)) {
      reply = aiReplies[key];
      break;
    }
  }
  if (!reply) {
    reply = '我理解你的感受。建议你先做一个深呼吸，然后告诉我具体的不适症状，我可以为你推荐对应的穴位或饮食调理方案~';
  }
  res.json({ success: true, data: { reply } });
});

// AI疏肝处方
router.get('/chat/prescription', (req, res) => {
  res.json({
    success: true,
    data: {
      emotion: '今日肝郁指数62，气机略滞。建议午休时到户外走5分钟，让肝气舒展。',
      action: '按揉太冲穴5分钟 + 478呼吸法4轮',
      warm: '身体比你想象的更聪明，给它一点时间和耐心，它会慢慢好起来的 \u{1F49B}',
    },
  });
});

// 症状记录
router.get('/record/symptoms', (req, res) => {
  res.json({ success: true, data: symptoms });
});

router.post('/record/symptoms', (req, res) => {
  symptoms.unshift({
    symptom: req.body.symptom || '未知',
    severity: req.body.severity || '轻度',
    time: new Date().toLocaleString('zh-CN'),
    cause: req.body.cause || '',
  });
  res.json({ success: true, message: '症状已记录' });
});

// 用药提醒
router.get('/record/medicines', (req, res) => {
  res.json({ success: true, data: medicines });
});

router.post('/record/medicines/:id/punch', (req, res) => {
  res.json({ success: true, message: '已打卡' });
});

// 登录
router.post('/auth/login', (req, res) => {
  res.json({
    success: true,
    user: { name: '小松', phone: req.body.phone, score: 62, level: '轻度肝郁' },
    token: 'fake-jwt-token-' + Date.now(),
  });
});

// 功法动作
router.get('/practice/moves', (req, res) => {
  res.json({ success: true, data: movesData });
});

// 导出路由
module.exports = router;

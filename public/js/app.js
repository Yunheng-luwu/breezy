/**
 * 松序 SongXu - 前端应用逻辑（v3 新版界面）
 * 处理页面切换、注册/登录、API 调用与动态渲染
 */

const API_BASE = window.location.origin + '/api';

// ============ 工具函数 ============
const TOKEN_KEY = 'songxu_token';
const USER_KEY = 'songxu_user';

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function saveLogin(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.currentUser = user;
}
function clearLogin() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.currentUser = null;
}

async function fetchAPI(endpoint, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API_BASE + endpoint, { ...options, headers });
    if (res.status === 401 && !endpoint.startsWith('/auth/')) {
      // 登录态失效：清除并回到登录页
      clearLogin();
      showPage('login');
      return { success: false, message: '登录已过期，请重新登录' };
    }
    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    return { success: false, message: '网络请求失败' };
  }
}

// ============ HTML转义 ============
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// ============ 全局轻提示 / 弹窗 ============
function toast(msg, type) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) { alert(msg); return; }
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2400);
}

function openModal(html, opts) {
  opts = opts || {};
  const mask = document.getElementById('modalMask');
  const box = document.getElementById('modalBox');
  if (!mask) return;
  box.innerHTML = html;
  box.classList.remove('afm-fullscreen');
  box.classList.toggle('modal-wide', !!opts.wide);
  // 强制覆盖内联样式，确保弹窗宽度
  if (opts.wide) {
    box.style.width = '1400px';
    box.style.maxWidth = '95vw';
  } else if (opts.width) {
    box.style.width = opts.width + 'px';
    box.style.maxWidth = '95vw';
  } else {
    box.style.width = '';
    box.style.maxWidth = '';
  }
  mask.classList.add('show');
  // 弹窗打开后触发回调
  if (opts.onOpen) requestAnimationFrame(() => opts.onOpen());
}
function closeModal() {
  const mask = document.getElementById('modalMask');
  if (mask) mask.classList.remove('show');
  const box = document.getElementById('modalBox');
  if (box) box.classList.remove('afm-fullscreen');
  // 关闭 AI 跟练摄像头
  stopAICamera();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closePanel(); }
});

// ============ 头像（预设 + 上传） ============
// 预设 key p1-p10 与后端正则保持一致；上传值为 /uploads/avatars/ 路径
const AVATAR_PRESETS = ['🌿', '🍵', '☯️', '🎋', '🌸', '🍃', '🧘', '🌙', '🌼', '🍀'];

// 头像内容 HTML：上传路径 → <img>；预设 key p1-p10 → emoji；空 → 昵称首字
function avatarContentHtml(value, fallbackChar) {
  if (value && value.indexOf('/uploads/') === 0) {
    return '<img src="' + escapeHtml(value) + '" alt="头像">';
  }
  if (/^p(?:[1-9]|10)$/.test(value || '')) {
    return AVATAR_PRESETS[Number(value.slice(1)) - 1];
  }
  return escapeHtml(fallbackChar || '松');
}

// 把当前用户头像渲染到固定元素（侧栏 / 个人页）
function applyAvatar(elId, fallbackName, avatarValue) {
  const el = document.getElementById(elId);
  if (!el) return;
  const name = (window.currentUser && window.currentUser.name) || fallbackName || '小松';
  const val = avatarValue !== undefined ? avatarValue : (window.currentUser && window.currentUser.avatar);
  el.innerHTML = avatarContentHtml(val, name.charAt(0));
}

function openAvatarPicker() {
  if (!window.currentUser) { toast('请先登录'); return; }
  const cur = window.currentUser.avatar || '';
  const cells = AVATAR_PRESETS.map((e, i) => {
    const key = 'p' + (i + 1);
    return '<div class="av-item' + (key === cur ? ' active' : '') + '" onclick="choosePresetAvatar(\'' + key + '\')">' + e + '</div>';
  }).join('');
  openModal(
    '<div class="modal-head"><div class="modal-title">更换头像</div><span class="modal-close" onclick="closeModal()">×</span></div>' +
    '<div class="modal-body">' +
    '<div class="av-grid">' + cells + '</div>' +
    '<div class="av-upload">' +
    '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'avFile\').click()">上传图片</button>' +
    '<input type="file" id="avFile" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="uploadAvatarFile(this)">' +
    '</div>' +
    '<div class="av-hint">上传图片会自动居中裁剪并压缩，仅支持 JPG / PNG / WebP</div>' +
    '</div>'
  );
}

async function choosePresetAvatar(key) {
  const res = await fetchAPI('/user/avatar', { method: 'PUT', body: JSON.stringify({ avatar: key }) });
  if (!res.success) { toast(res.message || '保存失败', 'error'); return; }
  applyNewAvatar(res.data.avatar);
}

async function uploadAvatarFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('图片不能超过 10MB', 'error'); input.value = ''; return; }
  toast('正在处理图片…');
  try {
    const dataUrl = await squareCompressImage(file, 256);
    const res = await fetchAPI('/user/avatar/upload', { method: 'POST', body: JSON.stringify({ data: dataUrl }) });
    if (!res.success) { toast(res.message || '上传失败', 'error'); return; }
    applyNewAvatar(res.data.avatar);
  } catch (e) {
    toast('图片处理失败，请换一张试试', 'error');
  }
}

// 居中裁剪成正方形并缩放到 size×size 的 JPEG dataURL
function squareCompressImage(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        canvas.getContext('2d').drawImage(
          img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size,
        );
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function applyNewAvatar(val) {
  closeModal();
  if (!window.currentUser) return;
  window.currentUser.avatar = val;
  localStorage.setItem(USER_KEY, JSON.stringify(window.currentUser));
  applyAvatar('sbAvatar');
  applyAvatar('pfAvatar');
  toast('头像已更新', 'success');
}


// ============ 退出登录 ============
function logout() {
  if (!confirm('确定退出登录吗？')) return;
  stopTodoReminder();
  clearLogin();
  chatSessionId = null;
  favCache = []; favLoaded = false;
  sessionManageMode = false;
  selectedSessions.clear();
  const sb = document.getElementById('appSidebar');
  if (sb) sb.classList.remove('managing');
  const list = document.getElementById('sessionList');
  if (list) list.innerHTML = '';
  showPage('login');
  toast('已退出登录');
}

// ============ 全局快捷：带问题进入 AI 对话 ============
function askAIWith(text) {
  closePanel();
  const input = document.getElementById('chatInput');
  if (input) input.value = text;
  sendMessage();
}

// ============ 顶部通知铃铛：今日未完成待办 + 用药提醒 ============
function updateNotifDot(count) {
  const dot = document.getElementById('notifDot');
  if (dot) dot.style.display = count > 0 ? '' : 'none';
}
async function toggleNotification(ev) {
  ev.stopPropagation();
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  if (panel.classList.contains('show')) {
    panel.classList.remove('show');
    return;
  }
  panel.innerHTML = '<div style="padding:12px;color:var(--text-light);font-size:13px;">正在加载…</div>';
  panel.classList.add('show');
  const [dash, meds] = await Promise.all([
    fetchAPI('/health/dashboard'),
    fetchAPI('/record/medicines'),
  ]);
  const todos = (dash.success && dash.data && dash.data.todos || []).filter(t => !t.done);
  const medList = meds.success && Array.isArray(meds.data) ? meds.data : [];
  let html = '<div class="notif-title">今日提醒</div>';
  if (!todos.length && !medList.length) {
    html += '<div class="notif-empty">今天没有待办，享受轻松的一天 🌿</div>';
  } else {
    if (todos.length) {
      html += '<div class="notif-group">调理待办</div>' + todos.map(t =>
        `<div class="notif-item" onclick="closeNotification();showPage('home')">⭕ ${escapeHtml((t.time ? t.time + ' ' : '') + t.text)}</div>`).join('');
    }
    if (medList.length) {
      html += '<div class="notif-group">用药</div>' + medList.map(m =>
        `<div class="notif-item" onclick="closeNotification();showPage('record')">💊 ${escapeHtml(m.name)} ${escapeHtml(m.dose || '')} <span style="color:var(--text-light);">${escapeHtml(m.time || '')}</span></div>`).join('');
    }
  }
  panel.innerHTML = html;
  updateNotifDot(todos.length + medList.length);
}
function closeNotification() {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.classList.remove('show');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#notifPanel') && !e.target.closest('.icon-btn')) closeNotification();
});

// ============ 待办到点提醒（浏览器内：页面打开时每 30 秒检查一次，关页面失效） ============
let todoReminderTimer = null;

function reminderToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function getRemindedSet() {
  try { return new Set(JSON.parse(localStorage.getItem('songxu_reminded_' + reminderToday()) || '[]')); }
  catch (e) { return new Set(); }
}
function markReminded(key, set) {
  set.add(key);
  localStorage.setItem('songxu_reminded_' + reminderToday(), JSON.stringify([...set]));
}

async function checkTodoReminders() {
  if (!getToken()) return;
  const dash = await fetchAPI('/health/dashboard');
  const todos = (dash.success && dash.data && dash.data.todos || []).filter(t => !t.done && t.time);
  if (!todos.length) return;
  const d = new Date();
  const nowHm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const fired = getRemindedSet();
  for (const t of todos) {
    const key = t.time + '|' + t.text;
    if (t.time <= nowHm && !fired.has(key)) {
      markReminded(key, fired);
      fireTodoReminder(t);
    }
  }
}

function fireTodoReminder(t) {
  // 浏览器系统通知（已授权时；应用内弹窗始终显示）
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('松序 · 到点提醒', { body: (t.time ? t.time + ' ' : '') + t.text }); } catch (e) {}
  }
  openModal(`
    <div class="modal-head">
      <div class="modal-title">⏰ 到点提醒</div>
      <span class="modal-close" onclick="closeModal()">×</span>
    </div>
    <div class="modal-body">
      <div style="font-size:16px;line-height:1.8;">${escapeHtml((t.time ? t.time + ' ' : '') + t.text)}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" onclick="closeModal()">知道了</button>
    </div>`);
}

function startTodoReminder() {
  stopTodoReminder();
  checkTodoReminders();
  todoReminderTimer = setInterval(checkTodoReminders, 30000);
}
function stopTodoReminder() {
  if (todoReminderTimer) { clearInterval(todoReminderTimer); todoReminderTimer = null; }
}
// 首次点击页面时申请系统通知权限（浏览器要求用户交互后才允许申请）
document.addEventListener('click', function askNotifPerm() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  document.removeEventListener('click', askNotifPerm);
});

// ============ 页面切换（AI 对话常驻主区，其余板块走抽屉） ============
const PANEL_TITLES = {
  home: '首页', care: '居家保健', diet: '饮食调理', clothing: '穿衣建议',
  rhythm: '生活节律', practice: '功法带练', record: '健康记录',
  profile: '我的', assistant: '今日处方与概览', aifollow: 'AI 跟练', rank: '排行榜',
};

function showPage(name) {
  if (name === 'login') {
    closePanel();
    document.getElementById('appShell').style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-login').classList.add('active');
    return;
  }
  if (name === 'chat') {
    closePanel();
    scrollChatToBottom();
    return;
  }
  openPanel(name);
}

// 登录成功后进入应用外壳
function enterApp() {
  closePanel();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('appShell').style.display = 'flex';
  const name = (window.currentUser && window.currentUser.name) || '小松';
  applyAvatar('sbAvatar', name);
  document.getElementById('sbUserName').textContent = name;
  newChat();
  refreshChatOverview();
  loadFavs();
  startTodoReminder();
}

function openPanel(name) {
  const page = document.getElementById('page-' + name);
  if (!page) { toast('该板块暂未开放', 'warn'); return; }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('panelBody').appendChild(page);
  page.classList.add('active');
  document.getElementById('panelTitle').textContent = PANEL_TITLES[name] || '';
  document.getElementById('sidePanel').classList.add('open');
  document.getElementById('panelMask').classList.add('show');
  document.body.classList.remove('sb-open');
  document.querySelectorAll('.sb-nav a').forEach(a => a.classList.toggle('active', a.dataset.page === name));

  if (name === 'home') loadHomeData();
  if (name === 'care') loadAcupoints();
  if (name === 'diet') loadDietData();
  if (name === 'clothing') loadClothing();
  if (name === 'rhythm') { loadExercise(); loadSleep(); loadRhythmPrefs(); }
  if (name === 'practice') loadPracticeMoves();
  // AI 跟练已改为弹窗（openAIFollowModal），进入任何抽屉页时确保摄像头关闭
  stopAICamera();
  if (name === 'record') { loadSymptomRecords(); loadMedicines(); loadSymptomStats(); }
  if (name === 'profile') { loadProfile(); loadProfileStats(); }
  if (name === 'assistant') refreshChatOverview();
}

function closePanel() {
  const panel = document.getElementById('sidePanel');
  if (panel) panel.classList.remove('open');
  const mask = document.getElementById('panelMask');
  if (mask) mask.classList.remove('show');
  // 关闭 AI 跟练摄像头
  stopAICamera();
}

// ============ 注册 / 登录（账号 + 密码） ============
let authMode = 'login'; // login | register

function switchAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  const isLogin = authMode === 'login';
  document.getElementById('loginForm').style.display = isLogin ? 'block' : 'none';
  document.getElementById('regForm').style.display = isLogin ? 'none' : 'block';
  document.getElementById('regAgree').style.display = isLogin ? 'none' : 'block';
  document.getElementById('authTitle').textContent = isLogin ? '欢迎回来' : '注册账号';
  document.getElementById('authSub').textContent = isLogin ? '登录账号 · 开启今天的舒心调理' : '岐黄安康 · 开启中医养生之旅';
  document.getElementById('authSubmitBtn').textContent = isLogin ? '登 录' : '立即注册';
  document.getElementById('authSwitch').innerHTML = isLogin
    ? '<a onclick="switchAuthMode()">没有账号？免费注册</a>'
    : '<a onclick="switchAuthMode()">已有账号？前往登录</a>';
}

function submitAuth() {
  if (authMode === 'login') {
    doLogin();
  } else {
    doRegister();
  }
}

async function doLogin() {
  const account = (document.getElementById('loginAccount').value || '').trim();
  const password = document.getElementById('loginPassword').value || '';
  if (!account) { alert('请输入账号'); return; }
  if (!password) { alert('请输入密码'); return; }

  const res = await fetchAPI('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });
  if (res.success && res.data && res.data.token) {
    saveLogin(res.data.token, res.data.user);
    enterApp();
  } else {
    alert(res.message || '登录失败，请重试');
  }
}

async function doRegister() {
  const username = (document.getElementById('regUsername').value || '').trim();
  const nickname = (document.getElementById('regNickname').value || '').trim();
  const email = (document.getElementById('regEmail').value || '').trim();
  const password = document.getElementById('regPassword').value || '';
  const confirm = document.getElementById('regConfirm').value || '';

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    alert('账号须为 3-20 位字母、数字或下划线');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('请输入正确的邮箱地址');
    return;
  }
  if (!/^[a-zA-Z0-9]{6,16}$/.test(password)) {
    alert('密码须为 6-16 位字母或数字');
    return;
  }
  if (password !== confirm) {
    alert('两次输入的密码不一致');
    return;
  }
  if (!document.getElementById('agree').checked) {
    alert('请先阅读并同意《用户协议》与《隐私政策》');
    return;
  }

  const res = await fetchAPI('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, nickname, email, password }),
  });
  if (res.success && res.data && res.data.token) {
    saveLogin(res.data.token, res.data.user);
    enterApp();
  } else {
    alert(res.message || '注册失败，请重试');
  }
}

// ============ 首页数据加载 ============
function weatherEmoji(text) {
  const s = String(text || '');
  if (s.includes('雨')) return '\u{1F327}';
  if (s.includes('雪')) return '\u{2744}';
  if (s.includes('晴')) return '\u{2600}';
  return '\u{2601}';
}

// ============ 中药图鉴（每日轮换 8 味 + 查看全部 30 味） ============
const HERBS_POOL = [
  { name: '菊花', effect: '清肝明目 · 泡茶', prompt: 'Dried chrysanthemum flowers in a white ceramic bowl on wooden table, soft natural light, traditional Chinese medicine herb photography',
    nature: '辛、甘、苦，微寒；归肺、肝经', desc: '散风清热、平肝明目、清热解毒；常用于风热感冒、头痛眩晕、目赤肿痛、眼目昏花。', usage: '取3~5朵沸水冲泡代茶，可配枸杞、金银花同饮。' },
  { name: '枸杞', effect: '滋补肝肾 · 日常', prompt: 'Goji berries in a small bamboo basket, bright red dried fruits, warm lighting, traditional Chinese medicine',
    nature: '甘，平；归肝、肾经', desc: '滋补肝肾、益精明目；用于虚劳精亏、腰膝酸痛、眩晕耳鸣、目昏不明。', usage: '每日10~20克，可直接嚼食、泡水或煮粥炖汤。' },
  { name: '红枣', effect: '补中益气 · 食疗', prompt: 'Dried red dates jujube in a ceramic dish, warm lighting, traditional Chinese medicine herb photography',
    nature: '甘，温；归脾、胃、心经', desc: '补中益气、养血安神；用于脾胃虚弱、血虚萎黄、疲乏无力。', usage: '煮粥炖汤或去核泡水，每日3~5枚为宜。' },
  { name: '陈皮', effect: '理气健脾 · 泡茶', prompt: 'Dried tangerine peel chenpi in a ceramic bowl, warm amber lighting, traditional Chinese medicine herb photography',
    nature: '苦、辛，温；归肺、脾经', desc: '理气健脾、燥湿化痰；用于胸脘胀满、食少吐泻、咳嗽痰多。', usage: '泡水、入菜或煲汤时放2~3片，陈久者佳。' },
  { name: '玫瑰花', effect: '疏肝解郁 · 茶饮', prompt: 'Dried rose buds in a white porcelain dish, soft pink color, delicate lighting, traditional Chinese medicine',
    nature: '甘、微苦，温；归肝、脾经', desc: '疏肝解郁、和血止痛；用于肝胃气痛、食少呕恶、月经不调。', usage: '取3~6朵沸水冲泡，可配红枣、蜂蜜。' },
  { name: '黄芪', effect: '补气固表 · 炖汤', prompt: 'Astragalus membranaceus huangqi dried root slices on linen cloth, traditional Chinese medicine, warm natural lighting',
    nature: '甘，微温；归脾、肺经', desc: '补气升阳、固表止汗、利水消肿；用于气虚乏力、食少便溏、自汗浮肿。', usage: '炖汤或煮水，常用10~30克；感冒发热时不宜。' },
  { name: '当归', effect: '补血活血 · 调经', prompt: 'Dried angelica sinensis dong quai slices in a wooden bowl, traditional Chinese medicine, warm lighting',
    nature: '甘、辛，温；归肝、心、脾经', desc: '补血活血、调经止痛、润肠通便；用于血虚萎黄、月经不调、肠燥便秘。', usage: '入药膳炖煮（如当归生姜羊肉汤）；孕期使用请先咨询医师。' },
  { name: '金银花', effect: '清热解毒 · 冲泡', prompt: 'Dried honeysuckle flowers in a glass jar, traditional Chinese medicine, soft natural light, herb photography',
    nature: '甘，寒；归肺、心、胃经', desc: '清热解毒、疏散风热；用于风热感冒、咽喉肿痛、痈肿疔疮。', usage: '取5~10克泡茶代饮，脾胃虚寒者不宜多服。' },
  { name: '茯苓', effect: '健脾宁心 · 煮粥', prompt: 'Poria cocos fuling dried white cubes in a ceramic bowl, traditional Chinese medicine, soft lighting',
    nature: '甘、淡，平；归心、肺、脾、肾经', desc: '利水渗湿、健脾、宁心；用于水肿尿少、脾虚食少、便溏泄泻、心神不安、惊悸失眠。', usage: '煮粥炖汤，或磨粉与面粉同做糕点。' },
  { name: '山药', effect: '健脾养胃 · 炖汤', prompt: 'Dried Chinese yam shan yao slices on wooden table, traditional Chinese medicine, natural light',
    nature: '甘，平；归脾、肺、肾经', desc: '既能补脾肺肾之气，又能滋养脾肺肾之阴；常用于脾虚食少、肺虚喘咳、肾虚遗精。', usage: '蒸食、炖汤或煮粥，鲜干品皆宜。' },
  { name: '百合', effect: '润肺安神 · 煮粥', prompt: 'Dried lily bulb bai he scales in a ceramic plate, traditional Chinese medicine, soft warm light',
    nature: '甘，寒；归心、肺经', desc: '养阴润肺、清心安神；用于阴虚燥咳、虚烦惊悸、失眠多梦。', usage: '煮粥、蒸食或炖甜汤，常配银耳、莲子。' },
  { name: '莲子', effect: '养心安神 · 煮粥', prompt: 'Dried lotus seeds lian zi in a small wooden bowl, traditional Chinese medicine, warm lighting',
    nature: '甘、涩，平；归脾、肾、心经', desc: '补脾止泻、益肾涩精、养心安神；用于脾虚泄泻、心悸失眠、肾虚遗精。', usage: '煮粥炖汤；去芯食用口感更佳，带芯则兼可清心。' },
  { name: '桂圆', effect: '补益心脾 · 泡茶', prompt: 'Dried longan gui yuan fruits in a ceramic dish, traditional Chinese medicine, warm brown tones',
    nature: '甘，温；归心、脾经', desc: '补益心脾、养血安神；用于气血不足、心悸怔忡、健忘失眠。', usage: '直接食用或炖甜汤；内有痰火、湿滞者慎食。' },
  { name: '酸枣仁', effect: '养心安神 · 泡茶', prompt: 'Dried sour jujube seeds suan zao ren in a small ceramic dish, traditional Chinese medicine, soft natural light',
    nature: '甘、酸，平；归肝、胆、心经', desc: '养心补肝、宁心安神、敛汗；用于虚烦不眠、惊悸多梦、体虚自汗。', usage: '炒香后研末或煮水，睡前半小时温服。' },
  { name: '决明子', effect: '清肝明目 · 泡茶', prompt: 'Dried cassia seeds jue ming zi in a wooden spoon, traditional Chinese medicine, warm lighting',
    nature: '甘、苦、咸，微寒；归肝、大肠经', desc: '清肝明目、润肠通便；用于目赤涩痛、头痛眩晕、大便秘结。', usage: '炒后取10克左右泡茶；脾虚便溏者不宜。' },
  { name: '薄荷', effect: '疏风清热 · 泡茶', prompt: 'Dried mint leaves bo he in a glass bowl, traditional Chinese medicine, fresh green tones, natural light',
    nature: '辛，凉；归肺、肝经', desc: '疏散风热、清利头目、利咽透疹、疏肝行气；用于风热感冒、咽喉肿痛、胸闷胁胀。', usage: '鲜叶或干叶沸水冲泡，不宜久煮以免香气散失。' },
  { name: '甘草', effect: '调和诸药 · 泡茶', prompt: 'Dried licorice root gan cao slices on linen cloth, traditional Chinese medicine, warm natural light',
    nature: '甘，平；归心、肺、脾、胃经', desc: '补脾益气、清热解毒、祛痰止咳、缓急止痛、调和诸药；用于脾胃虚弱、咳嗽痰多、脘腹挛急。', usage: '泡水或入汤配伍；不宜长期大量服用。' },
  { name: '党参', effect: '健脾益肺 · 炖汤', prompt: 'Dried codonopsis dang shen roots coiled on wooden table, traditional Chinese medicine, warm lighting',
    nature: '甘，平；归脾、肺经', desc: '健脾益肺、养血生津；用于脾肺气虚、食少倦怠、气血不足、津伤口渴。', usage: '炖汤煮粥常用10~30克，宜作平补之品。' },
  { name: '麦冬', effect: '养阴生津 · 泡茶', prompt: 'Dried ophiopogon mai dong root tubers in a ceramic dish, traditional Chinese medicine, soft light',
    nature: '甘、微苦，微寒；归心、肺、胃经', desc: '养阴生津、润肺清心；用于肺燥干咳、喉痹咽痛、津伤口渴、心烦失眠。', usage: '泡茶或炖汤，常与玉竹、沙参同用。' },
  { name: '玉竹', effect: '养阴润燥 · 炖汤', prompt: 'Dried polygonatum yu zhu root segments on wooden board, traditional Chinese medicine, natural tones',
    nature: '甘，微寒；归肺、胃经', desc: '养阴润燥、生津止渴；用于肺胃阴伤、燥热咳嗽、咽干口渴、内热消渴。', usage: '炖汤煮水，常与麦冬同用以养阴生津。' },
  { name: '山楂', effect: '消食化积 · 泡水', prompt: 'Dried hawthorn berry slices shan zha in a ceramic plate, traditional Chinese medicine, warm red tones',
    nature: '酸、甘，微温；归脾、胃、肝经', desc: '消食健胃、行气散瘀；用于肉食积滞、胃脘胀满、泻痢腹痛。', usage: '干片泡水或煮粥；胃酸过多者不宜空腹多食。' },
  { name: '薏苡仁', effect: '健脾祛湿 · 煮粥', prompt: 'White coix seeds yi yi ren in a small bamboo bowl, traditional Chinese medicine, bright natural light',
    nature: '甘、淡，凉；归脾、胃、肺经', desc: '利水渗湿、健脾止泻；用于水肿脚气、小便不利、脾虚泄泻。', usage: '煮粥前浸泡2小时更易煮烂；孕妇食用请先咨询医师。' },
  { name: '黑芝麻', effect: '滋补肝肾 · 佐餐', prompt: 'Black sesame seeds in a small wooden spoon, traditional Chinese medicine food photography, warm light',
    nature: '甘，平；归肝、肾、大肠经', desc: '补肝肾、益精血、润肠燥；用于精血亏虚、头晕眼花、须发早白、肠燥便秘。', usage: '炒熟碾碎后佐餐、冲糊，碾碎更利吸收。' },
  { name: '核桃仁', effect: '补肾健脑 · 佐餐', prompt: 'Walnut kernels in a ceramic dish, traditional Chinese medicine food photography, warm tones',
    nature: '甘，温；归肾、肺、大肠经', desc: '补肾、温肺、润肠；用于肾阳不足、腰膝酸软、肺虚久咳、肠燥便秘。', usage: '每日2~3颗直接食用，或入粥入菜。' },
  { name: '桂花', effect: '温中散寒 · 泡茶', prompt: 'Dried osmanthus flowers gui hua in a small glass dish, traditional Chinese medicine, golden tiny blooms',
    nature: '辛，温；归肺、脾、肾经', desc: '温中散寒、化痰止咳；用于痰饮咳喘、口臭、食欲不振。', usage: '泡茶、酿蜜或做糕点，每次1~3克即可。' },
  { name: '蒲公英', effect: '清热解毒 · 泡茶', prompt: 'Dried dandelion root and leaves in a kraft paper bag, traditional Chinese medicine, natural light',
    nature: '甘、苦，寒；归肝、胃经', desc: '清热解毒、消肿散结、利尿通淋；用于疔疮肿毒、咽喉肿痛、湿热黄疸。', usage: '干品5~10克泡茶；脾胃虚寒者不宜多服。' },
  { name: '胖大海', effect: '清咽利喉 · 泡茶', prompt: 'Dried boat sterculia seeds pang da hai in a ceramic bowl, traditional Chinese medicine, brown tones',
    nature: '甘，寒；归肺、大肠经', desc: '清热润肺、利咽开音、润肠通便；用于肺热声哑、干咳无痰、咽喉干痛、热结便秘。', usage: '取2~3枚沸水泡饮；不宜长期依赖。' },
  { name: '西洋参', effect: '补气养阴 · 泡茶', prompt: 'American ginseng root slices on linen cloth, traditional Chinese medicine, soft lighting',
    nature: '甘、微苦，凉；归心、肺、肾经', desc: '补气养阴、清热生津；用于气虚阴亏、虚热烦倦、咳喘痰血、内热消渴。', usage: '3~6克切片泡水或含服；服用时不宜同时饮浓茶。' },
  { name: '生姜', effect: '温中散寒 · 调味', prompt: 'Fresh ginger root slices on wooden cutting board, traditional Chinese medicine food photography, warm light',
    nature: '辛，微温；归肺、脾、胃经', desc: '解表散寒、温中止呕、温肺止咳；用于风寒感冒、胃寒呕吐、寒痰咳嗽。', usage: '煮汤调味或做姜糖水；阴虚内热者少食。' },
  { name: '莲子心', effect: '清心除烦 · 泡茶', prompt: 'Dried lotus seed embryos lian zi xin green tiny sprouts in a small dish, traditional Chinese medicine, soft light',
    nature: '苦，寒；归心、肾经', desc: '清心安神、交通心肾、涩精止血；用于热入心包、心肾不交、失眠遗精。', usage: '取1~2克泡茶，味苦性寒；脾胃虚寒者不宜。' },
  // ---- 以下 28 味摘自《科普比赛资料.docx》，desc 照抄资料原文 ----
  { name: '白扁豆', effect: '健脾化湿 · 煮粥', prompt: 'Dried white hyacinth beans bai bian dou in a ceramic bowl, traditional Chinese medicine, soft natural light',
    nature: '甘，微温；归脾、胃经', desc: '健脾化湿，和中消暑，对脾虚湿盛、暑湿吐泻有帮助。', usage: '煮粥炖汤常用10~30克；须煮透至软烂，生扁豆有毒。' },
  { name: '赤小豆', effect: '利水消肿 · 煮粥', prompt: 'Dried adzuki red beans chi xiao dou in a small bamboo basket, traditional Chinese medicine, warm lighting',
    nature: '甘、酸，平；归心、小肠经', desc: '有利水消肿、解毒排脓之效。', usage: '煮汤煮粥常用30克左右，可配薏苡仁同煮。' },
  { name: '胡椒', effect: '温中散寒 · 调味', prompt: 'Dried black peppercorns in a small ceramic dish, traditional Chinese medicine spice photography, warm tones',
    nature: '辛，热；归胃、大肠经', desc: '有温中散寒、下气消痰的作用。', usage: '做菜调味少许即可；阴虚有火、咽喉口干者少食。' },
  { name: '甜杏仁', effect: '润肺止咳 · 炖羹', prompt: 'Dried sweet apricot kernels in a white ceramic plate, traditional Chinese medicine, soft lighting',
    nature: '甘，平；归肺、大肠经', desc: '润肺止咳、润肠通便。', usage: '炖甜品或打浆，一次10克左右为宜，勿过量。' },
  { name: '蜂蜜', effect: '润肺通便 · 冲调', prompt: 'Honey jar with wooden dipper on wooden table with dried herbs, traditional Chinese medicine, warm golden lighting',
    nature: '甘，平；归肺、脾、大肠经', desc: '可补中缓急、润肺止咳、润肠通便等。', usage: '温水冲服，水温不宜过高；一岁以下婴儿不宜。' },
  { name: '白芍', effect: '养血柔肝 · 配伍', prompt: 'Dried white peony root bai shao slices on linen cloth, traditional Chinese medicine, soft natural light',
    nature: '苦、酸，微寒；归肝、脾经', desc: '养血调经、敛阴止汗、柔肝止痛、平抑肝阳。', usage: '多作配伍煎服，常用6~15克；不宜与藜芦同用。' },
  { name: '川贝母', effect: '润肺止咳 · 炖梨', prompt: 'Dried fritillaria chuan bei mu small white bulbs in a ceramic dish, traditional Chinese medicine, soft lighting',
    nature: '苦、甘，微寒；归肺、心经', desc: '润肺止咳、化痰散结。', usage: '研粉炖梨或冲服，常用3~10克；不宜与乌头类同用。' },
  { name: '天门冬', effect: '养阴润燥 · 炖汤', prompt: 'Dried asparagus root tian men dong spindle-shaped roots on wooden board, traditional Chinese medicine, natural tones',
    nature: '甘、苦，寒；归肺、肾经', desc: '养阴润燥、清肺生津。', usage: '炖汤或煮水；虚寒腹泻者不宜多服。' },
  { name: '桔梗', effect: '宣肺利咽 · 泡茶', prompt: 'Dried platycodon jie geng root slices in a kraft paper bag, traditional Chinese medicine, natural light',
    nature: '苦、辛，平；归肺经', desc: '宣肺、利咽、祛痰、排脓。', usage: '泡水或入汤剂，常用3~10克；阴虚久咳者慎用。' },
  { name: '银耳', effect: '滋阴润肺 · 炖羹', prompt: 'Dried white snow fungus tremella in a ceramic bowl, traditional Chinese medicine, bright soft lighting',
    nature: '甘，平；归肺、胃、肾经', desc: '有滋阴润肺等功效。', usage: '泡发后炖羹，常配红枣、莲子、冰糖。' },
  { name: '白茅根', effect: '凉血利尿 · 煮水', prompt: 'Dried imperata bai mao gen white grass roots bundled on linen cloth, traditional Chinese medicine, natural light',
    nature: '甘，寒；归肺、胃、膀胱经', desc: '凉血止血、清热利尿。', usage: '鲜品或干品煮水代茶，常用15~30克；脾胃虚寒者不宜多服。' },
  { name: '桂枝', effect: '温通经脉 · 配伍', prompt: 'Dried cassia twig gui zhi thin bark sticks on wooden table, traditional Chinese medicine, warm tones',
    nature: '辛、甘，温；归心、肺、膀胱经', desc: '发汗解肌、温通经脉、助阳化气。', usage: '多作配伍煎服，常用3~10克；温热病及阴虚阳盛者忌用。' },
  { name: '荆芥', effect: '解表散风 · 配伍', prompt: 'Dried jing jie herb with green stems and leaves in a paper bag, traditional Chinese medicine, natural light',
    nature: '辛，微温；归肺、肝经', desc: '解表散风、透疹消疮。', usage: '多入汤剂，常用5~10克，不宜久煎。' },
  { name: '砂仁', effect: '化湿开胃 · 炖汤', prompt: 'Dried amomum sha ren round brown seeds in a small ceramic dish, traditional Chinese medicine, warm lighting',
    nature: '辛，温；归脾、胃、肾经', desc: '化湿开胃、温脾止泻、理气安胎。', usage: '炖汤宜后下，或研末冲服，常用3~6克。' },
  { name: '桑叶', effect: '清肝明目 · 泡茶', prompt: 'Dried mulberry leaves sang ye in a glass bowl, traditional Chinese medicine, green tones, natural light',
    nature: '甘、苦，寒；归肺、肝经', desc: '疏散风热、清肺润燥、清肝明目。', usage: '取10克左右泡茶，可配菊花同饮。' },
  { name: '芦根', effect: '生津止渴 · 煮水', prompt: 'Dried reed rhizome lu gen pale bamboo-like root segments on wooden board, traditional Chinese medicine, natural tones',
    nature: '甘，寒；归肺、胃经', desc: '清热泻火、生津止渴、除烦止呕、利尿。', usage: '鲜干品均可煮水代茶，常用15~30克；脾胃虚寒者慎用。' },
  { name: '枇杷叶', effect: '清肺止咳 · 煮水', prompt: 'Dried loquat leaf pi pa ye in a kraft paper bundle, traditional Chinese medicine, green brown tones',
    nature: '苦，微寒；归肺、胃经', desc: '清肺止咳、和胃降逆。', usage: '刷去叶背绒毛后煮水，常用6~10克。' },
  { name: '牡丹皮', effect: '清热凉血 · 配伍', prompt: 'Dried moutan cortex mu dan pi bark curls on linen cloth, traditional Chinese medicine, soft reddish brown tones',
    nature: '苦、辛，微寒；归心、肝、肾经', desc: '清热凉血、活血化瘀。', usage: '多作配伍煎服，常用6~12克；孕妇及月经过多者慎用。' },
  { name: '五味子', effect: '益气生津 · 泡茶', prompt: 'Dried schisandra berries wu wei zi in a small ceramic dish, traditional Chinese medicine, deep red tones',
    nature: '酸、甘，温；归肺、心、肾经', desc: '收敛固涩、益气生津、补肾宁心。', usage: '3~6克泡水或入汤剂；感冒初起、有实热者不宜。' },
  { name: '竹叶', effect: '清热除烦 · 泡茶', prompt: 'Dried bamboo leaves zhu ye in a glass jar, traditional Chinese medicine, fresh green tones, natural light',
    nature: '甘、淡，寒；归心、胃、小肠经', desc: '清热泻火、除烦、利尿。', usage: '干品6~10克泡茶或煮水；体寒者不宜多饮。' },
  { name: '泽泻', effect: '利水渗湿 · 配伍', prompt: 'Dried alisma ze xie round white rhizome slices in a ceramic bowl, traditional Chinese medicine, soft light',
    nature: '甘、淡，寒；归肾、膀胱经', desc: '利水渗湿、泄热、化浊降脂。', usage: '多作配伍煎服，常用6~10克。' },
  { name: '山茱萸', effect: '补益肝肾 · 配伍', prompt: 'Dried cornus shan zhu yu deep red berries in a ceramic dish, traditional Chinese medicine, warm red tones',
    nature: '酸、涩，微温；归肝、肾经', desc: '补益肝肾、收涩固脱。', usage: '多作配伍煎服，常用6~12克；湿热淋证者不宜。' },
  { name: '熟地黄', effect: '补血滋阴 · 配伍', prompt: 'Dried prepared rehmannia shu di huang dark brown root segments on wooden board, traditional Chinese medicine, soft light',
    nature: '甘，微温；归肝、肾经', desc: '补血滋阴、益精填髓。', usage: '多作配伍煎服，常用9~15克；滋腻碍胃，脾虚食少者慎用。' },
  { name: '川芎', effect: '活血行气 · 配伍', prompt: 'Dried chuanxiong ligusticum irregular root slices in a kraft paper bag, traditional Chinese medicine, warm natural light',
    nature: '辛，温；归肝、胆、心包经', desc: '活血行气、祛风止痛。', usage: '多作配伍煎服，常用3~10克；阴虚火旺者慎用。' },
  { name: '乌药', effect: '行气止痛 · 配伍', prompt: 'Dried lindera wu yao round root slices in a ceramic bowl, traditional Chinese medicine, warm brown tones',
    nature: '辛，温；归肺、脾、肾、膀胱经', desc: '行气止痛、温肾散寒。', usage: '多作配伍煎服，常用6~10克。' },
  { name: '益智仁', effect: '暖肾缩尿 · 炖汤', prompt: 'Dried alpinia yi zhi ren oblong seeds in a small ceramic dish, traditional Chinese medicine, warm tones',
    nature: '辛，温；归脾、肾经', desc: '暖肾固精缩尿、温脾止泻摄唾。', usage: '炖汤或配伍，常用3~9克；阴虚火旺者慎用。' },
  { name: '防风', effect: '祛风解表 · 配伍', prompt: 'Dried saposhnikovia fang feng root slices on linen cloth, traditional Chinese medicine, natural light',
    nature: '辛、甘，微温；归膀胱、肝、脾经', desc: '祛风解表、胜湿止痛、止痉。', usage: '多作配伍煎服，常用5~10克。' },
  { name: '高丽参', effect: '大补元气 · 炖汤', prompt: 'Dried korean ginseng whole roots in an elegant wooden box, traditional Chinese medicine, warm amber lighting',
    nature: '甘、微苦，微温；归脾、肺、心、肾经', desc: '大补元气、复脉固脱、益气摄血。', usage: '切片炖服或含服，常用3~6克；感冒发热时不宜，忌与萝卜、浓茶同服。' },
];

function herbImg(prompt) {
  return 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=' + encodeURIComponent(prompt) + '&image_size=square';
}

// 药材图加载完成/失败 → 淡入显示（load/error 不冒泡，用捕获）
document.addEventListener('load', function (e) {
  if (e.target && e.target.classList && e.target.classList.contains('ha-img')) e.target.classList.add('loaded');
}, true);
document.addEventListener('error', function (e) {
  if (e.target && e.target.classList && e.target.classList.contains('ha-img')) e.target.classList.add('error');
}, true);

function renderHerbAtlas() {
  const el = document.getElementById('herbAtlas');
  if (!el) return;
  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const n = HERBS_POOL.length;
  const pick = [];
  for (let i = 0; i < 8; i++) { const idx = (doy + i) % n; pick.push([idx, HERBS_POOL[idx]]); }
  el.innerHTML = pick.map(function (p) {
    return '<div class="herb-atlas-item" onclick="openHerbDetail(' + p[0] + ')" style="cursor:pointer">' +
      '<img src="' + herbImg(p[1].prompt) + '" alt="' + p[1].name + '" class="ha-img">' +
      '<div class="ha-body"><h5>' + p[1].name + '</h5><div class="ha-tag">' + p[1].effect + '</div></div></div>';
  }).join('');
  const d = new Date();
  const lbl = document.getElementById('herbDailyTag');
  if (lbl) lbl.textContent = '今日精选 · ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  // 3 秒后后台分批预热全部药材图（避免瞬时并发触发限流；弹窗打开时已基本生成好）
  setTimeout(function () {
    let queue = HERBS_POOL.slice();
    const step = function () {
      queue.splice(0, 6).forEach(function (h) { const im = new Image(); im.src = herbImg(h.prompt); });
      if (queue.length) setTimeout(step, 1500);
    };
    step();
  }, 3000);
}

function openHerbAtlas() {
  const cards = HERBS_POOL.map(function (h, i) {
    return '<div class="herb-atlas-item" onclick="openHerbDetail(' + i + ')" style="cursor:pointer">' +
      '<img loading="lazy" src="' + herbImg(h.prompt) + '" alt="' + h.name + '" class="ha-img">' +
      '<div class="ha-body"><h5>' + h.name + '</h5><div class="ha-tag">' + h.effect + '</div></div></div>';
  }).join('');
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 10px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<h3 style="margin:0;">中药图鉴 · ' + HERBS_POOL.length + ' 味药食同源</h3>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<p style="color:var(--text-mid);font-size:14px;margin-bottom:20px;">日常调理以「药食同源」为原则，适量为宜；体质特殊或正在服药者，请先咨询医师。</p>' +
    '<div class="herb-atlas herb-atlas-modal" style="margin-bottom:0;">' + cards + '</div>' +
    '</div>',
    { width: 1000 }
  );
}

// 药材详情弹窗（点击药材卡片进入）
function openHerbDetail(idx) {
  const h = HERBS_POOL[idx];
  if (!h) return;
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 16px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<span onclick="openHerbAtlas()" style="cursor:pointer;color:var(--accent);font-size:14px;font-weight:600;">&larr; 返回图鉴</span>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<div style="text-align:center;margin-bottom:20px;">' +
    '<img src="' + herbImg(h.prompt) + '" alt="' + h.name + '" class="ha-img" style="width:220px;height:220px;border-radius:18px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.10);">' +
    '<h3 style="margin:16px 0 8px;">' + h.name + '</h3>' +
    '<span class="ha-tag" style="display:inline-block;">' + h.effect + '</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:14px;text-align:left;font-size:15px;">' +
    '<div><b>性味归经</b><p style="color:var(--text-mid);margin-top:4px;">' + (h.nature || '—') + '</p></div>' +
    '<div><b>功效描述</b><p style="color:var(--text-mid);margin-top:4px;">' + (h.desc || '—') + '</p></div>' +
    '<div><b>常见用法</b><p style="color:var(--text-mid);margin-top:4px;">' + (h.usage || '—') + '</p></div>' +
    '</div>' +
    '<p style="margin-top:20px;padding:12px 14px;background:rgba(139,0,0,.06);border-radius:10px;font-size:13px;color:var(--text-mid);">以上内容仅供养生科普参考，不构成医疗建议；体质特殊、孕期或正在服药者，请先咨询医师或药师。</p>' +
    '</div>',
    { width: 640 }
  );
}

// ============ 药膳汤谱（饮食调理页入口，数据与 AI 工具共用 knowledge 库） ============
let soupCache = null;
async function fetchSoups() {
  if (soupCache) return soupCache;
  const res = await fetchAPI('/diet/soups');
  if (res.success && res.data && Array.isArray(res.data.items)) soupCache = res.data.items;
  return soupCache;
}

async function openSoupAtlas() {
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 10px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<h3 style="margin:0;">药膳汤谱</h3>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<p style="color:var(--text-mid);font-size:14px;margin-bottom:16px;">常见家常药膳，材料平和易得；点击汤谱查看做法与禁忌。</p>' +
    '<div id="soupList" style="display:flex;flex-direction:column;gap:12px;"><div style="text-align:center;color:var(--text-light);padding:24px 0;">正在加载汤谱…</div></div>' +
    '</div>',
    { width: 640 }
  );
  const items = await fetchSoups();
  const list = document.getElementById('soupList');
  if (!list) return;
  if (!items || !items.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:24px 0;">汤谱数据暂时不可用，请稍后再试。</div>';
    return;
  }
  list.innerHTML = items.map(function (s, i) {
    return '<div onclick="openSoupDetail(' + i + ')" style="cursor:pointer;padding:14px 16px;border:1px solid var(--line,#eee);border-radius:12px;transition:box-shadow .2s;" onmouseover="this.style.boxShadow=\'0 4px 14px rgba(0,0,0,.07)\'" onmouseout="this.style.boxShadow=\'none\'">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
      '<h4 style="margin:0;">' + s.name + '</h4>' +
      '<span class="tag tag-primary">' + String(s.effect || '').replace(/[。；]$/, '') + '</span></div>' +
      '<div style="font-size:13px;color:var(--text-light);margin-top:6px;">适用：' + (s.suitable || '一般人群') + '</div></div>';
  }).join('');
}

async function openSoupDetail(i) {
  const items = await fetchSoups();
  const s = items && items[i];
  if (!s) return;
  const row = function (label, text) {
    return text ? '<div><b>' + label + '</b><p style="color:var(--text-mid);margin-top:4px;">' + text + '</p></div>' : '';
  };
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 16px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<span onclick="openSoupAtlas()" style="cursor:pointer;color:var(--accent);font-size:14px;font-weight:600;">&larr; 返回汤谱</span>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<div style="text-align:center;margin-bottom:20px;"><h3 style="margin-bottom:8px;">' + s.name + '</h3>' +
    '<span class="tag tag-primary">' + String(s.effect || '').replace(/[。；]$/, '') + '</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:14px;text-align:left;font-size:15px;">' +
    row('材料', s.ingredients) + row('做法', s.method) + row('适用', s.suitable) +
    row('禁忌', s.contraindication) + row('建议频率', s.frequency) +
    '</div>' +
    '<p style="margin-top:20px;padding:12px 14px;background:rgba(139,0,0,.06);border-radius:10px;font-size:13px;color:var(--text-mid);">' + (s.note || '药膳使用请咨询中医师，孕妇、儿童及慢性病患者遵医嘱。') + '</p>' +
    '</div>',
    { width: 640 }
  );
}

async function loadHomeData() {
  const [dash, meds, acuDay, clothing] = await Promise.all([
    fetchAPI('/health/dashboard'),
    fetchAPI('/record/medicines').catch(() => null),
    fetchAPI('/care/acupoint-of-day').catch(() => null),
    fetchAPI('/clothing').catch(() => null),
  ]);
  if (dash.success && dash.data) {
    const d = dash.data;
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('homeScore', d.score !== undefined ? d.score : '--');
    set('homeLevel', d.level || '--');
    set('homeDesc', d.desc || '');
    set('homeWeather', weatherEmoji(d.weather) + ' ' + (d.weather || ''));
    set('homeCity', '\u{1F4CD} ' + (d.city || '--'));
    // AI对话页概览
    set('chScore', d.score !== undefined ? d.score : '--');
    const done = (d.todos || []).filter(t => t.done).length;
    set('chTodos', (d.todos || []).length ? done + '/' + d.todos.length : '0');
    const pending = (d.todos || []).filter(t => !t.done).length;
    const medCount = (meds && meds.success && Array.isArray(meds.data)) ? meds.data.length : 0;
    updateNotifDot(pending + medCount);
  }
  // 每日一穴智能推荐（节气+肝郁指数+近期症状）
  if (acuDay && acuDay.success && acuDay.data && acuDay.data.acu) {
    const a = acuDay.data.acu;
    set('acuOfDayName', (a.icon ? a.icon + ' ' : '') + a.name);
    set('acuOfDayDesc', acuDay.data.reason || a.effect);
    const btn = document.getElementById('acuOfDayBtn');
    if (btn) btn.onclick = () => openAcuDetail(a.id);
  }
  // 场景提醒随实时天气动态生成（雨雪/大风/温差/高温空调等）；接口失败保留页面静态兜底
  const reminders = clothing && clothing.success && clothing.data && clothing.data.reminders;
  if (Array.isArray(reminders) && reminders.length) {
    const box = document.getElementById('sceneReminders');
    if (box) {
      box.innerHTML = reminders.map((r, i) =>
        `<div style="font-size:14px;color:var(--text-mid);${i < reminders.length - 1 ? 'margin-bottom:8px;' : ''}">${r.icon} ${escapeHtml(r.text)}</div>`
      ).join('');
    }
  }
  renderHerbAtlas();
  loadTodos();
}

// ============ 待办事项（be-4） ============
async function loadTodos() {
  const list = document.getElementById('todoList');
  if (!list) return;
  const res = await fetchAPI('/todos');
  if (!res.success || !res.data) return;
  if (!res.data.length) {
    list.innerHTML = '<div class="todo-empty">今天还没有待办，点下方“+ 添加待办”创建</div>';
    return;
  }
  list.innerHTML = res.data.map(t => `
    <div class="todo-item" data-id="${t.id}">
      <div class="check${t.done ? ' done' : ''}" onclick="toggleTodo(this)">${t.done ? '\u2713' : ''}</div>
      <div class="text${t.done ? ' done' : ''}">${escapeHtml(t.text)}</div>
      <span class="todo-del" onclick="deleteTodo(this)" title="删除">&times;</span>
      <div class="time">${escapeHtml(t.time || '')}</div>
    </div>`).join('');
}

async function toggleTodo(el) {
  const item = el.closest('.todo-item');
  const id = item && item.dataset.id;
  if (!id) return;
  const res = await fetchAPI('/todos/' + id + '/toggle', { method: 'POST' });
  if (!res.success) {
    alert(res.message || '操作失败，请重试');
    loadTodos();
    return;
  }
  el.classList.toggle('done');
  el.textContent = el.classList.contains('done') ? '\u2713' : '';
  const text = el.parentElement.querySelector('.text');
  if (text) text.classList.toggle('done');
}

async function deleteTodo(el) {
  const item = el.closest('.todo-item');
  const id = item && item.dataset.id;
  if (!id) return;
  const text = item.querySelector('.text');
  if (!confirm('删除待办「' + (text ? text.textContent : '') + '」？')) return;
  const res = await fetchAPI('/todos/' + id, { method: 'DELETE' });
  if (!res.success) {
    alert(res.message || '删除失败，请重试');
    return;
  }
  loadTodos();
}

async function markAllDone() {
  const res = await fetchAPI('/todos/toggle-all', {
    method: 'POST',
    body: JSON.stringify({ done: true }),
  });
  if (!res.success) {
    alert(res.message || '操作失败，请重试');
    return;
  }
  loadTodos();
}

function showAddTodo() {
  const row = document.getElementById('todoAddRow');
  if (!row) return;
  row.style.display = 'flex';
  const input = document.getElementById('todoNewText');
  if (input) input.focus();
}

function hideAddTodo() {
  const row = document.getElementById('todoAddRow');
  if (row) row.style.display = 'none';
  ['todoNewText', 'todoNewTime'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function confirmAddTodo() {
  const content = (document.getElementById('todoNewText').value || '').trim();
  if (!content) {
    alert('请输入待办内容');
    return;
  }
  const time = (document.getElementById('todoNewTime').value || '').trim();
  const res = await fetchAPI('/todos', {
    method: 'POST',
    body: JSON.stringify({ content, time }),
  });
  if (!res.success) {
    alert(res.message || '添加失败，请重试');
    return;
  }
  hideAddTodo();
  loadTodos();
}

// ============ 居家保健 ============
function switchCareTab(tab, ev) {
  document.querySelectorAll('#page-care .tab-bar .tab').forEach(t => t.classList.remove('active'));
  if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
  document.getElementById('careTab1').style.display = tab === 'acupoint' ? 'block' : 'none';
  document.getElementById('careTab2').style.display = tab === 'footbath' ? 'block' : 'none';
}

let currentAcuCategory = 'stress';

async function loadAcupoints(category, chip) {
  if (category) currentAcuCategory = category;
  if (chip) {
    chip.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  }
  const grid = document.getElementById('acuGrid');
  if (!grid) return;
  const res = await fetchAPI('/care/acupoints?category=' + currentAcuCategory);
  if (!res.success || !res.data) return;
  grid.innerHTML = res.data.map(a => `
    <div class="acu-card-grid" onclick="openAcuDetail(${a.id})">
      <div class="img-area">${escapeHtml(a.icon || '\u{1F9B6}')}</div>
      <div class="card-body">
        <h4>${escapeHtml(a.name)}</h4>
        <span class="tag tag-primary">${escapeHtml(a.tag)}</span>
        <div class="effect">${escapeHtml(a.effect)}</div>
        <button class="btn btn-sm btn-outline btn-block" onclick="event.stopPropagation();openAcuDetail(${a.id})">按揉指南</button>
      </div>
    </div>
  `).join('');
}

async function openAcuDetail(id) {
  const res = await fetchAPI('/care/acupoints/' + id);
  if (!res.success || !res.data) {
    toast('穴位详情加载失败，请稍后重试', 'error');
    return;
  }
  const a = res.data;
  openModal(`
    <div class="modal-head">
      <div><div class="modal-title">${escapeHtml(a.name)} <span class="tag tag-primary">${escapeHtml(a.tag)}</span></div></div>
      <span class="modal-close" onclick="closeModal()">×</span>
    </div>
    <div class="modal-body">
      <div class="cc-row"><span class="cc-label">功效</span><span class="cc-value">${escapeHtml(a.effect)}</span></div>
      <div class="cc-row"><span class="cc-label">定位</span><span class="cc-value">${escapeHtml(a.location)}</span></div>
      <div class="cc-row"><span class="cc-label">手法</span><span class="cc-value">${escapeHtml(a.method)}</span></div>
      <div class="cc-row"><span class="cc-label">时长</span><span class="cc-value">${escapeHtml(a.duration)}</span></div>
      <div class="cc-row"><span class="cc-label">频次</span><span class="cc-value">${escapeHtml(a.frequency)}</span></div>
      <div class="modal-tip">按揉以局部有酸胀感为度，皮肤破损处不按，孕期请先咨询医生。</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-outline" onclick="closeModal()">知道了</button>
      <button class="btn btn-primary" onclick="acuToTodo('${escapeHtml(a.name)}','${escapeHtml(a.duration || '')}')">加入今日待办</button>
    </div>`);
}

async function acuToTodo(name, duration) {
  closeModal();
  const res = await fetchAPI('/todos', {
    method: 'POST',
    body: JSON.stringify({ content: `按揉${name}${duration ? ' ' + duration : ''}`, type: 'ai' }),
  });
  toast(res.success ? `已把「按揉${name}」加入今日待办` : (res.message || '添加待办失败'), res.success ? 'success' : 'error');
  if (res.success && document.getElementById('page-home').classList.contains('active')) loadHomeData();
}

async function footbathToTodo(name, duration) {
  const res = await fetchAPI('/todos', {
    method: 'POST',
    body: JSON.stringify({ content: `${name}（${duration}）`, type: 'ai' }),
  });
  toast(res.success ? `已把「${name}」加入今日待办` : (res.message || '添加待办失败'), res.success ? 'success' : 'error');
  if (res.success && document.getElementById('page-home').classList.contains('active')) loadHomeData();
}

async function generateRecipe() {
  const input = document.getElementById('footbathInput');
  const status = input ? input.value.trim() : '';
  if (!status) {
    toast('请输入你今天的状态，如：失眠多梦、手脚冰凉');
    return;
  }
  const area = document.getElementById('footbathResult');
  const res = await fetchAPI('/care/footbath', {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
  if (res.success && res.data && area) {
    const d = res.data;
    area.style.display = 'block';
    area.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span class="tag tag-primary">为你推荐</span>
        <b style="font-size:16px;">${escapeHtml(d.name)}</b>
        <span style="font-size:13px;color:var(--text-mid);">${escapeHtml(d.herbs)}</span>
        <span style="font-size:12px;color:var(--text-light);">水温${escapeHtml(d.temp)} / ${escapeHtml(d.duration)}</span>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="footbathToTodo('${escapeHtml(d.name)}泡脚','${escapeHtml(d.duration)}')">加入今日待办</button>`;
  } else {
    toast(res.message || '配方生成失败，请稍后重试', 'error');
  }
}

// ============ 饮食调理 ============
// 红黑榜标签渲染：兼容旧字符串数组与新的 {items, topName, topReason, tip} 结构
function renderFoodTags(el, data, cls) {
  if (!el) return;
  const items = Array.isArray(data) ? data.map(f => ({ name: f }))
    : (data && Array.isArray(data.items) ? data.items.map(f => (typeof f === 'string' ? { name: f } : f)) : []);
  let head = '';
  if (data && data.topReason) {
    head = `<div style="font-size:12px;color:var(--accent);margin-bottom:6px;">${escapeHtml(data.topReason)}</div>`;
  }
  const tags = items.map(f =>
    `<span class="food-tag ${cls}${data && data.topName === f.name ? ' top-pick' : ''}">${escapeHtml(f.name)}</span>`).join('');
  let tail = '';
  if (data && data.tip) {
    tail = `<div style="font-size:12px;color:#c05656;margin-top:6px;">${escapeHtml(data.tip)}</div>`;
  }
  el.innerHTML = head + tags + tail;
}

async function loadDietData() {
  if (!favLoaded) await loadFavs();
  const [r1, r2, r3] = await Promise.all([
    fetchAPI('/diet/recommend'),
    fetchAPI('/diet/foods'),
    fetchAPI('/diet/recipes'),
  ]);
  if (r1.success && r1.data) {
    const el = document.getElementById('dietPrinciple');
    if (el && r1.data.principle) el.textContent = r1.data.principle;
    if (Array.isArray(r1.data.principles) && r1.data.principles.length) {
      principlePool = r1.data.principles;
    }
  }
  if (r2.success && r2.data) {
    const good = r2.data.good || {};
    const bad = r2.data.bad || {};
    renderFoodTags(document.getElementById('dfTea'), good.tea, 'good');
    renderFoodTags(document.getElementById('dfStaple'), good.staple, 'good');
    renderFoodTags(document.getElementById('dfVegetable'), good.vegetable, 'good');
    renderFoodTags(document.getElementById('dfFruit'), good.fruit, 'good');
    renderFoodTags(document.getElementById('dbCold'), bad.cold, 'bad');
    renderFoodTags(document.getElementById('dbSpicy'), bad.spicy, 'bad');
    renderFoodTags(document.getElementById('dbSour'), bad.sour, 'bad');
  }
  if (r3.success && r3.data) {
    recipePoolCache = r3.data.pool || recipePoolCache;
    renderRecipes(r3.data.items || []);
  }
}

// ---- 食谱：换一批 / 收藏 / 购物清单 ----
let recipePoolCache = null;
let principlePool = [];
let currentRecipes = [];
const RECIPE_EMOJI = { '早餐': '\u{1F963}', '午餐': '\u{1F962}', '晚餐': '\u{1F372}', '加餐': '\u{1F375}' };
const POOL_KEY = { '早餐': 'breakfast', '午餐': 'lunch', '晚餐': 'dinner', '加餐': 'snack' };
const FAV_KEY = 'songxu_favs'; // 旧版本地收藏键：登录后一次性迁移到账号，随后清除
let favCache = [];
let favLoaded = false;
function getFavs() { return favCache; }
function isFav(name) { return favCache.some(f => f.name === name); }

// 拉取账号收藏；首次拉取时把旧版本地收藏迁移到服务端
async function loadFavs() {
  if (!getToken()) { favCache = []; favLoaded = false; return; }
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { legacy = []; }
  try {
    if (legacy.length) {
      await fetchAPI('/favorites', {
        method: 'POST',
        body: JSON.stringify({ items: legacy.map(f => ({ type: 'recipe', name: f.name, time: f.time || '', ingredients: f.ingredients || '' })) }),
      });
      localStorage.removeItem(FAV_KEY);
    }
    const res = await fetchAPI('/favorites');
    if (res.success) { favCache = res.data || []; favLoaded = true; }
  } catch (e) {
    favCache = legacy; // 网络异常时至少保留本地可见
  }
}

function paintFavBtn(el, name) {
  if (!el) return;
  el.classList.toggle('faved', isFav(name));
  el.textContent = isFav(name) ? '\u2764 已收藏' : '\u{1F90D} 收藏';
}

async function toggleFav(time, name, ingredients, el) {
  if (!getToken()) { toast('登录后收藏才能多端同步哦', 'warn'); return; }
  const existed = isFav(name);
  // 乐观更新，接口失败再回滚
  if (existed) favCache = favCache.filter(f => f.name !== name);
  else favCache.unshift({ type: 'recipe', time, name, ingredients });
  paintFavBtn(el, name);
  try {
    const res = existed
      ? await fetchAPI('/favorites', { method: 'DELETE', body: JSON.stringify({ type: 'recipe', name }) })
      : await fetchAPI('/favorites', { method: 'POST', body: JSON.stringify({ type: 'recipe', name, time, ingredients }) });
    if (!res.success) throw new Error(res.message || '操作失败');
    toast(existed ? '已取消收藏' : '已收藏，可在「我的-我的收藏」查看', existed ? 'info' : 'success');
  } catch (e) {
    if (existed) favCache.unshift({ type: 'recipe', time, name, ingredients });
    else favCache = favCache.filter(f => f.name !== name);
    paintFavBtn(el, name);
    toast(e.message || '操作失败，请稍后再试', 'error');
  }
}
function renderRecipes(items) {
  currentRecipes = items;
  const grid = document.getElementById('recipeGrid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div style="color:var(--text-light);font-size:14px;">食谱加载失败，点击「换一批」重试</div>';
    return;
  }
  grid.innerHTML = items.map(r => {
    const fav = isFav(r.name);
    return `
    <div class="recipe-card">
      <div class="time-tag">${escapeHtml(r.time)}</div>
      <div style="height:110px;background:var(--card-beige);display:flex;align-items:center;justify-content:center;font-size:40px;">${RECIPE_EMOJI[r.time] || '\u{1F372}'}</div>
      <div class="recipe-body">
        <h4>${escapeHtml(r.name)}</h4>
        <div class="ingr">${escapeHtml(r.ingredients)}</div>
        <div class="recipe-bottom">
          ${r.reason ? `<div class="recipe-reason">${escapeHtml(r.reason)}</div>` : ''}
          <div class="footer">
            <span class="recipe-action ${fav ? 'faved' : ''}" onclick="toggleFav('${escapeHtml(r.time)}','${escapeHtml(r.name)}','${escapeHtml(r.ingredients)}',this)">${fav ? '\u2764 已收藏' : '\u{1F90D} 收藏'}</span>
            <span class="recipe-action" onclick="showShoppingList()">购物清单</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
function shuffleRecipes() {
  if (!recipePoolCache) { loadDietData(); return; }
  // 轮换「今日饮食原则」（避免和当前相同）
  const principleEl = document.getElementById('dietPrinciple');
  if (principleEl && principlePool.length > 1) {
    const current = principleEl.textContent;
    let candidates = principlePool.filter(p => p !== current);
    principleEl.textContent = candidates[Math.floor(Math.random() * candidates.length)];
  }
  const picked = [];
  Object.keys(POOL_KEY).forEach(time => {
    const pool = recipePoolCache[POOL_KEY[time]] || [];
    if (!pool.length) return;
    const cur = currentRecipes.find(r => r.time === time);
    let candidates = pool.slice();
    if (cur && pool.length > 1) candidates = pool.filter(r => r.name !== cur.name);
    const r = candidates[Math.floor(Math.random() * candidates.length)];
    picked.push({ time, name: r.name, ingredients: r.ingredients });
  });
  renderRecipes(picked);
  toast('原则和食谱都换了一批～');
}
function showShoppingList() {
  const set = new Set();
  currentRecipes.forEach(r => {
    String(r.ingredients || '').split(/[,，]/).forEach(s => {
      s = s.trim().replace(/\d+\s*g?$/i, '').replace(/\d+颗?/, '').replace(/适量|片|粒$/, '').trim();
      if (s) set.add(s);
    });
  });
  const list = Array.from(set);
  openModal(`
    <div class="modal-head">
      <div class="modal-title">本期购物清单</div>
      <span class="modal-close" onclick="closeModal()">×</span>
    </div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">已按当前 4 个食谱汇总，去掉了用量，按份买即可</div>
      <div class="shop-list">${list.map(x => `<label><input type="checkbox"> ${escapeHtml(x)}</label>`).join('')}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" onclick="closeModal()">去采购</button>
    </div>`);
}

// ============ 穿衣建议 ============
// 接口失败时保留页面默认静态内容，不影响浏览
// 城市选择优先级：用户手动选择(localStorage) > IP 定位 > 后端默认城市
const CITY_STORE_KEY = 'songxu_weather_city';

function getSavedCity() {
  try { return JSON.parse(localStorage.getItem(CITY_STORE_KEY) || 'null'); }
  catch (e) { return null; }
}
function saveCity(city) {
  localStorage.setItem(CITY_STORE_KEY, JSON.stringify(city));
}

async function loadClothing() {
  const saved = getSavedCity();
  const qs = saved && saved.adcode
    ? '/clothing?adcode=' + encodeURIComponent(saved.adcode) + '&city=' + encodeURIComponent(saved.name || '')
    : '/clothing';
  const res = await fetchAPI(qs);
  if (!res.success || !res.data) return;
  const d = res.data;
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el && text !== undefined && text !== null) el.textContent = text;
  };
  set('wcEmoji', weatherEmoji(d.weatherText || d.weather));
  set('wcTemp', d.temp + '°C');
  // located=false 表示 IP 定位失败走了默认城市，提示用户可手动切换
  const locatedTag = (d.located === false && !saved) ? '（定位失败，可手动切换）' : '';
  set('wcCity', d.city + ' · ' + (d.weatherText || d.weather || '') + locatedTag);
  set('wcHighLow', '\u{1F321} 最高' + d.high + '°C / 最低' + d.low + '°C');
  set('wcDiff', '\u{1F4CF} 温差' + d.diff + '°C');
  set('wcWind', '\u{1F32A} ' + d.wind);
  set('wcHumidity', '\u{1F4A7} 湿度' + d.humidity + '%');
  set('caPrinciple', d.principle);
  set('caInner', d.inner);
  set('caOuter', d.outer);
  set('caShoes', d.shoes);
  const btn = document.getElementById('wcCityBtn');
  if (btn) btn.style.display = 'inline-block';
  initCityPickerSearch();
  initBodySensePrefs();
}

// ---- 手动切换城市 ----
function toggleCityPicker(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById('cityPicker');
  if (!panel) return;
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'block' : 'none';
  if (opening) {
    const input = document.getElementById('cpInput');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 0); }
    const tip = document.getElementById('cpTip');
    if (tip) tip.textContent = '';
    const results = document.getElementById('cpResults');
    if (results) results.innerHTML = '';
  }
}

let cpSearchTimer = null;
function initCityPickerSearch() {
  const input = document.getElementById('cpInput');
  if (!input || input.dataset.bound) return;
  input.dataset.bound = '1';
  input.addEventListener('input', () => {
    clearTimeout(cpSearchTimer);
    const kw = input.value.trim();
    const tip = document.getElementById('cpTip');
    const results = document.getElementById('cpResults');
    if (kw.length === 0) {
      results.innerHTML = '';
      if (tip) tip.textContent = '';
      return;
    }
    if (tip) tip.textContent = '搜索中…';
    cpSearchTimer = setTimeout(() => doCitySearch(kw), 350);
  });
}

async function doCitySearch(keyword) {
  const results = document.getElementById('cpResults');
  const tip = document.getElementById('cpTip');
  try {
    const res = await fetchAPI('/weather/cities?keyword=' + encodeURIComponent(keyword));
    const items = (res.success && res.data && res.data.items) || [];
    if (!items.length) {
      results.innerHTML = '';
      if (tip) tip.textContent = '没找到这个城市，换个名称试试（如：杭州、西安）';
      return;
    }
    if (tip) tip.textContent = '';
    results.innerHTML = items.map(c =>
      '<div class="cp-item" data-adcode="' + escapeHtml(c.adcode) + '" data-name="' + escapeHtml(c.name) + '">'
      + '<span class="cp-name">📍 ' + escapeHtml(c.name) + '</span><span class="cp-code">' + c.adcode + '</span></div>'
    ).join('');
    results.querySelectorAll('.cp-item').forEach(el => {
      el.addEventListener('click', () => pickCity(el.dataset.adcode, el.dataset.name));
    });
  } catch (e) {
    if (tip) tip.textContent = '城市搜索失败，请稍后再试';
  }
}

function pickCity(adcode, name) {
  saveCity({ adcode, name });
  document.getElementById('cityPicker').style.display = 'none';
  loadClothing();
  toast('已切换到 ' + name);
}

// 浏览器精确定位（需用户授权；非 HTTPS / 拒绝授权时提示用手动搜索）
function locateByBrowser() {
  const tip = document.getElementById('cpTip');
  if (!navigator.geolocation) {
    if (tip) tip.textContent = '当前浏览器不支持定位，请直接输入城市名';
    return;
  }
  if (tip) tip.textContent = '正在获取定位，请在浏览器弹窗中点「允许」…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const qs = '/weather/locate?lng=' + pos.coords.longitude + '&lat=' + pos.coords.latitude;
      const res = await fetchAPI(qs);
      if (res.success && res.data && res.data.adcode) {
        pickCity(res.data.adcode, res.data.city);
      } else if (tip) {
        tip.textContent = res.message || '定位失败，请直接输入城市名';
      }
    } catch (e) {
      if (tip) tip.textContent = '定位失败，请直接输入城市名';
    }
  }, (err) => {
    if (tip) {
      tip.textContent = err.code === 1
        ? '你拒绝了定位授权，可直接输入城市名搜索'
        : '定位不可用，请直接输入城市名';
    }
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
}

// ---- 冷暖偏好 / 天气提醒（本地存储）----
const SENSE_TIP = {
  '怕冷': '🧣 你平时怕冷：比推荐搭配多备一件薄马甲或披肩，重点护住颈背、小腹和脚踝',
  '正常': '按今日推荐穿即可，早晚出门记得加件外套',
  '怕热': '☀️ 你平时怕热：内搭可选薄款，但肩颈、脚踝别露，空调房备件薄外套',
};
function initBodySensePrefs() {
  const sense = localStorage.getItem('songxu_body_sense') || '正常';
  document.querySelectorAll('#bodySenseTags .tag').forEach(t => {
    t.classList.toggle('tag-primary', t.textContent === sense);
    t.classList.toggle('tag-gray', t.textContent !== sense);
  });
  const tip = document.getElementById('caSenseTip');
  if (tip) {
    tip.textContent = SENSE_TIP[sense] || '';
    tip.style.display = 'block';
  }
  const alertOn = localStorage.getItem('songxu_weather_alert') !== '0';
  applyWeatherSwitch(alertOn);
}
function setBodySense(val) {
  localStorage.setItem('songxu_body_sense', val);
  initBodySensePrefs();
  toast('已记住你的冷暖偏好：' + val);
}
function toggleWeatherAlert() {
  const next = localStorage.getItem('songxu_weather_alert') === '0';
  localStorage.setItem('songxu_weather_alert', next ? '1' : '0');
  applyWeatherSwitch(next);
  toast(next ? '已开启降温/大风提醒' : '已关闭天气提醒');
}
function applyWeatherSwitch(on) {
  const sw = document.getElementById('weatherAlertSwitch');
  if (!sw) return;
  sw.setAttribute('aria-checked', on ? 'true' : 'false');
  sw.style.background = on ? 'var(--primary)' : '#C7BCA8';
  const knob = sw.firstElementChild;
  if (knob) {
    knob.style.right = on ? '2px' : '';
    knob.style.left = on ? '' : '2px';
  }
}

// ============ 生活节律 ============
function switchRhythmTab(tab, ev) {
  document.querySelectorAll('#page-rhythm .tab-bar .tab').forEach(t => t.classList.remove('active'));
  if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
  const tabs = ['sleep', 'exercise', 'mood'];
  tabs.forEach((t, i) => {
    const el = document.getElementById('rhythmTab' + (i + 1));
    if (el) el.style.display = tab === t ? 'block' : 'none';
  });
}

let exerciseCache = [];
const EXERCISE_SCENE = {
  '梳头功': 'office', '扩胸运动': 'office', '深呼吸478': 'office', '侧腰拉伸': 'office',
  '八段锦·两手托天': 'home', '搓胁肋': 'home',
};
// 轻动「跟着做」→ 功法带练页分组与组内动作匹配关键字
const EXERCISE_TO_PRACTICE = {
  '八段锦·两手托天': { group: 'baduanjin', match: '托天' },
  '搓胁肋':           { group: 'stretch',   match: '搓胁肋' },
  '侧腰拉伸':         { group: 'stretch',   match: '侧腰' },
  '扩胸运动':         { group: 'stretch',   match: '扩胸' },
  '梳头功':           { group: 'office',    match: '梳头' },
};
const PRACTICE_TAB_INDEX = { baduanjin: 0, stretch: 1, office: 2 };
async function loadExercise() {
  const grid = document.getElementById('exerciseGrid');
  if (!grid) return;
  const res = await fetchAPI('/rhythm/exercise');
  if (!res.success || !Array.isArray(res.data)) return;
  exerciseCache = res.data;
  renderExercise('all');
}
function renderExercise(scene) {
  const grid = document.getElementById('exerciseGrid');
  if (!grid) return;
  const list = exerciseCache.filter(e => scene === 'all' || EXERCISE_SCENE[e.name] === scene);
  if (!list.length) {
    grid.innerHTML = '<div style="color:var(--text-light);font-size:14px;">该场景暂无动作</div>';
    return;
  }
  grid.innerHTML = list.map(e => `
    <div class="acu-card-grid">
      <div class="img-area">${escapeHtml(e.icon || '\u{1F9CD}')}</div>
      <div class="card-body">
        <h4>${escapeHtml(e.name)}</h4>
        <span class="tag tag-primary">${escapeHtml(e.tag)}</span>
        <div class="effect">${escapeHtml(e.duration)}</div>
        <button class="btn btn-sm btn-outline btn-block" onclick="followExercise('${escapeHtml(e.name)}')">跟着做</button>
      </div>
    </div>`).join('');
}
function filterExercise(el, scene) {
  el.parentElement.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderExercise(scene);
}
async function followExercise(name) {
  if (name.indexOf('478') >= 0) { breathingGuide(); return; }
  const map = EXERCISE_TO_PRACTICE[name];
  // 先设定目标分组，使 showPage 触发的自动加载也落在正确分组（幂等，避免竞态）
  if (map) currentPracticeGroup = map.group;
  showPage('practice');
  if (!map) { toast('跟着带练慢慢做，配合自然呼吸～'); return; }
  // 点亮对应分组 tab
  const tabEls = document.querySelectorAll('#page-practice .tab-bar .tab');
  tabEls.forEach(t => t.classList.remove('active'));
  const ti = PRACTICE_TAB_INDEX[map.group];
  if (tabEls[ti]) tabEls[ti].classList.add('active');
  // 明确加载目标分组并等待完成
  await loadPracticeMoves(map.group);
  // 定位到组内对应动作：高亮 + 滚动可见 + 弹出动作详情
  const idx = practiceMovesCache.findIndex(m => m.name && m.name.indexOf(map.match) >= 0);
  if (idx >= 0) {
    highlightMove(idx);
    const item = document.querySelectorAll('#moveList .move-item')[idx];
    if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showPracticeDetail(idx);
    toast('已为你定位到「' + name + '」，跟着慢慢做～');
  } else {
    toast('跟着带练慢慢做，配合自然呼吸～');
  }
}

// ============ 作息打卡 ============
function buildTimeOptions(start, end, stepMin) {
  // 支持跨夜，如 buildTimeOptions('20:00','02:30',30)
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let s = toMin(start);
  let e = toMin(end);
  if (e <= s) e += 24 * 60;
  const out = [];
  for (let t = s; t <= e; t += stepMin) {
    const h = Math.floor(t / 60) % 24;
    const m = t % 60;
    out.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
  }
  return out;
}
function fillSleepSelects() {
  const sSel = document.getElementById('sleepTimeInput');
  const wSel = document.getElementById('wakeTimeInput');
  if (!sSel || sSel.options.length) return;
  buildTimeOptions('20:00', '02:30', 30).forEach(t => {
    sSel.appendChild(new Option(t, t));
  });
  buildTimeOptions('05:00', '11:30', 30).forEach(t => {
    wSel.appendChild(new Option(t, t));
  });
}
async function submitSleep(ev) {
  fillSleepSelects();
  const sleepTime = document.getElementById('sleepTimeInput').value;
  const wakeTime = document.getElementById('wakeTimeInput').value;
  if (!sleepTime || !wakeTime) {
    toast('请选择入睡和起床时间');
    return;
  }
  const btn = ev ? ev.target : null;
  if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
  const res = await fetchAPI('/rhythm/sleep', {
    method: 'POST',
    body: JSON.stringify({ sleepTime, wakeTime }),
  });
  if (btn) { btn.disabled = false; btn.textContent = '今日打卡'; }
  if (!res.success) {
    toast(res.message || '打卡失败，请稍后重试', 'error');
    return;
  }
  toast('作息已打卡，早睡是最好的养肝药 🌿', 'success');
  loadSleep();
}
function sleepMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h < 12 ? h * 60 + m + 1440 : h * 60 + m;
}

// ============ 目标作息时间（起床/午憩/入睡，存健康档案，跟随账号） ============
const RHYTHM_DEFAULTS = { wakeTime: '07:00', napTime: '13:00', bedTime: '23:00' };
const RHYTHM_LABELS = { wakeTime: '起床', napTime: '午憩', bedTime: '入睡' };
// 时间轴元素 id 后缀
const RHYTHM_EL = { wakeTime: 'tlWakeTime', napTime: 'tlNapTime', bedTime: 'tlBedTime' };
// 各项目可选范围（分钟，入睡跨午夜用 24:xx 表示）
const RHYTHM_RANGES = {
  wakeTime: [5 * 60, 11 * 60 + 30],
  napTime: [12 * 60, 15 * 60],
  bedTime: [20 * 60, 26 * 60 + 30],
};
// 时间轴快捷打卡：按钮 / 目标时间元素 / 提交字段 / 称呼
const RHYTHM_PUNCH = {
  wake: { btn: 'punchWake', timeEl: 'tlWakeTime', field: 'wakeTime', label: '起床' },
  nap: { btn: 'punchNap', timeEl: 'tlNapTime', field: 'napTime', label: '午憩' },
  bed: { btn: 'punchBed', timeEl: 'tlBedTime', field: 'sleepTime', label: '入睡' },
};

// 按当日记录回显三个打卡按钮状态
function renderRhythmPunchStates(today) {
  for (const key of Object.keys(RHYTHM_PUNCH)) {
    const cfg = RHYTHM_PUNCH[key];
    const btn = document.getElementById(cfg.btn);
    if (!btn) continue;
    const done = !!(today && today[cfg.field]);
    btn.classList.toggle('done', done);
    btn.textContent = done ? '已打卡' : '打卡';
  }
}

// 时间轴快捷打卡：按当前目标时间一键记录
async function quickRhythmPunch(key) {
  if (!getToken()) { toast('登录后才能打卡哦', 'warn'); return; }
  const cfg = RHYTHM_PUNCH[key];
  const btn = document.getElementById(cfg.btn);
  if (btn.classList.contains('done')) {
    toast(`今天的${cfg.label}已经打过卡了`, 'warn');
    return;
  }
  const time = document.getElementById(cfg.timeEl).textContent.trim();
  btn.classList.add('disabled');
  const res = await fetchAPI('/rhythm/sleep', {
    method: 'POST', body: JSON.stringify({ [cfg.field]: time }),
  });
  btn.classList.remove('disabled');
  if (res.success) {
    btn.classList.add('done');
    btn.textContent = '已打卡';
    toast(`${cfg.label}打卡成功 · ${time}`, 'success');
  } else {
    toast(res.message || '打卡失败，请稍后重试', 'error');
  }
}

function fmtHM(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// 打开作息抽屉时拉取个性化目标时间；未登录或没设置时显示默认值
async function loadRhythmPrefs() {
  const apply = (prefs) => {
    for (const key of Object.keys(RHYTHM_EL)) {
      const el = document.getElementById(RHYTHM_EL[key]);
      if (el) el.textContent = prefs[key] || RHYTHM_DEFAULTS[key];
    }
  };
  apply(RHYTHM_DEFAULTS);
  if (!getToken()) return;
  const res = await fetchAPI('/profile');
  if (res.success && res.data) apply(res.data);
}

function editRhythmTime(key, label) {
  if (!getToken()) { toast('登录后才能调整你的专属作息时间哦', 'warn'); return; }
  const curEl = document.getElementById(RHYTHM_EL[key]);
  const cur = curEl ? curEl.textContent.trim() : RHYTHM_DEFAULTS[key];
  const [start, end] = RHYTHM_RANGES[key];
  let options = '';
  for (let m = start; m <= end; m += 30) {
    const v = fmtHM(m);
    options += `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`;
  }
  openModal(`
    <h3 style="margin:0 0 4px;">调整${label}时间</h3>
    <div style="font-size:13px;color:var(--text-light);margin-bottom:16px;">保存后会同步到你的健康档案，AI 建议也会参考它</div>
    <select id="rhythmTimeSelect" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);font-size:15px;background:#fff;">${options}</select>
    <div style="display:flex;gap:10px;margin-top:20px;">
      <button class="btn btn-outline" style="flex:1;" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" style="flex:1;" id="rhythmTimeSave">保存</button>
    </div>`);
  document.getElementById('rhythmTimeSave').onclick = () => saveRhythmTime(key);
}

async function saveRhythmTime(key) {
  const value = document.getElementById('rhythmTimeSelect').value;
  const btn = document.getElementById('rhythmTimeSave');
  btn.disabled = true;
  btn.textContent = '保存中…';
  const res = await fetchAPI('/profile', { method: 'PUT', body: JSON.stringify({ [key]: value }) });
  if (res.success) {
    const el = document.getElementById(RHYTHM_EL[key]);
    if (el) el.textContent = value;
    closeModal();
    toast(`${RHYTHM_LABELS[key]}时间已调整为 ${value}`, 'success');
  } else {
    btn.disabled = false;
    btn.textContent = '保存';
    toast(res.message || '保存失败，请重试', 'error');
  }
}

async function loadSleep() {
  fillSleepSelects();
  const res = await fetchAPI('/rhythm/sleep');
  if (!res.success || !res.data) return;
  const { week = [], today } = res.data;
  renderRhythmPunchStates(today);
  if (today) {
    const sSel = document.getElementById('sleepTimeInput');
    const wSel = document.getElementById('wakeTimeInput');
    if (sSel && today.sleepTime) sSel.value = today.sleepTime;
    if (wSel && today.wakeTime) wSel.value = today.wakeTime;
  }
  // 后端只返回有记录的日期，前端补齐近 7 天空位
  const fmtDay = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const map = new Map(week.map(d => [d.date, d]));
  const fullWeek = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = fmtDay(d);
    fullWeek.push(map.get(key) || { date: key, sleepTime: null, wakeTime: null });
  }
  const days = fullWeek.filter(d => d.sleepTime);
  const streakEl = document.getElementById('sleepStreak');
  if (streakEl) {
    streakEl.textContent = days.length
      ? `近7天已打卡 ${days.length} 天${today ? ' · 今天已完成' : ' · 今天还没打卡'}`
      : '近7天还没有打卡，从今晚开始吧';
  }
  const trend = document.getElementById('sleepTrend');
  if (trend) {
    {
      const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
      const MIN_MIN = 20 * 60, MAX_MIN = 26 * 60 + 30; // 20:00 ~ 02:30
      trend.innerHTML = fullWeek.map(d => {
        if (!d.sleepTime) {
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
            <div style="width:22px;height:14%;border-radius:4px 4px 0 0;background:repeating-linear-gradient(45deg,var(--border),var(--border) 4px,transparent 4px,transparent 8px);"></div>
            <div style="font-size:12px;color:var(--text-light);">${WEEK_CN[new Date(d.date + 'T00:00:00').getDay()]}</div>
          </div>`;
        }
        const mins = sleepMinutes(d.sleepTime);
        const pct = Math.max(18, Math.min(100, ((mins - MIN_MIN) / (MAX_MIN - MIN_MIN)) * 82 + 18));
        const color = mins <= 22 * 60 + 30 ? 'var(--success)' : mins <= 24 * 60 ? 'var(--primary)' : mins <= 25 * 60 ? 'var(--warn)' : 'var(--danger)';
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <div style="font-size:11px;color:var(--text-mid);">${d.sleepTime}</div>
          <div style="width:22px;height:${pct}%;border-radius:4px 4px 0 0;background:${color};"></div>
          <div style="font-size:12px;color:var(--text-light);">${WEEK_CN[new Date(d.date + 'T00:00:00').getDay()]}</div>
        </div>`;
      }).join('');
    }
  }
  const tip = document.getElementById('sleepTrendTip');
  if (tip && days.length) {
    const late = days.filter(d => sleepMinutes(d.sleepTime) > 24 * 60).length;
    tip.innerHTML = late === 0
      ? '\u{1F49A} 最近入睡很规律，肝胆得到充分休养，继续保持'
      : `\u{1F56F} 近7天有 ${late} 天过了零点才睡，尽量在 23 点前躺下，养肝效果更好`;
  }
}

// ============ 478 呼吸引导 ============
let breathTimer = null;
function breathingGuide() {
  openModal(`
    <div class="modal-head">
      <div class="modal-title">478 疏肝呼吸</div>
      <span class="modal-close" onclick="stopBreathing()">×</span>
    </div>
    <div class="modal-body" style="text-align:center;padding:24px 16px;">
      <div class="breath-guide-circle" id="breathCircle"><span id="breathText">准备</span></div>
      <div style="font-size:15px;margin-top:16px;" id="breathSub">鼻吸 4 秒 · 屏息 7 秒 · 嘴呼 8 秒</div>
      <div style="font-size:13px;color:var(--text-light);margin-top:6px;" id="breathRound">第 1 / 4 轮</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-outline" onclick="stopBreathing()">结束引导</button>
      <button class="btn btn-primary" id="breathStartBtn" onclick="runBreathRound(1)">开始</button>
    </div>`);
}
function breathPhase(label, secs, cls, after) {
  const circle = document.getElementById('breathCircle');
  const text = document.getElementById('breathText');
  const sub = document.getElementById('breathSub');
  if (!circle) return;
  circle.className = 'breath-guide-circle ' + cls;
  if (text) text.textContent = secs;
  if (sub) sub.textContent = label;
  let left = secs;
  breathTimer = setInterval(() => {
    left -= 1;
    if (text) text.textContent = left > 0 ? left : label;
    if (left <= 0) {
      clearInterval(breathTimer);
      breathTimer = null;
      after && after();
    }
  }, 1000);
}
function runBreathRound(round) {
  const startBtn = document.getElementById('breathStartBtn');
  if (startBtn) startBtn.style.display = 'none';
  const roundEl = document.getElementById('breathRound');
  if (roundEl) roundEl.textContent = `第 ${Math.min(round, 4)} / 4 轮`;
  if (round > 4) {
    const circle = document.getElementById('breathCircle');
    if (circle) circle.className = 'breath-guide-circle';
    const text = document.getElementById('breathText');
    if (text) text.textContent = '完成';
    const sub = document.getElementById('breathSub');
    if (sub) sub.textContent = '4 轮完成，是否感觉放松了一些？';
    if (roundEl) roundEl.textContent = '做得很好 🌿';
    if (startBtn) { startBtn.textContent = '再来一轮'; startBtn.style.display = ''; startBtn.onclick = () => runBreathRound(1); }
    return;
  }
  breathPhase('用鼻子慢慢吸气', 4, 'breath-in', () =>
    breathPhase('屏住呼吸，放松肩膀', 7, 'breath-hold', () =>
      breathPhase('噘嘴缓缓呼气', 8, 'breath-out', () => runBreathRound(round + 1))
    )
  );
}
function stopBreathing() {
  if (breathTimer) { clearInterval(breathTimer); breathTimer = null; }
  const circle = document.getElementById('breathCircle');
  const text = document.getElementById('breathText');
  const sub = document.getElementById('breathSub');
  const round = document.getElementById('breathRound');
  const startBtn = document.getElementById('breathStartBtn');
  if (circle) circle.className = 'breath-guide-circle';
  if (text) text.textContent = '准备';
  if (sub) sub.textContent = '鼻吸 4 秒 · 屏息 7 秒 · 嘴呼 8 秒';
  if (round) round.textContent = '第 1 / 4 轮';
  if (startBtn) { startBtn.textContent = '开始'; startBtn.style.display = ''; startBtn.onclick = () => runBreathRound(1); }
  closeModal();
}

async function selectMood(el) {
  el.parentElement.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const mood = el.querySelector('.text').textContent;
  const res = await fetchAPI('/rhythm/mood', {
    method: 'POST',
    body: JSON.stringify({ mood }),
  });
  if (!res.success) {
    toast(res.message || '情绪记录失败，请稍后重试', 'error');
  } else {
    toast(`已记录今天的心情：${mood}，继续照顾好自己 🌿`, 'success');
  }
}

// ============ AI对话 ============
let chatSessionId = null;

// 会话提问目录：以用户的每条提问为条目，点击跳转到对应问答
let chatMsgSeq = 0;

function renderChatBubble(role, text, cardsHtml) {
  let avatar = '🌿';
  if (role === 'user') {
    avatar = window.currentUser
      ? avatarContentHtml(window.currentUser.avatar, (window.currentUser.name || '松').charAt(0))
      : '🧑';
  }
  const safeText = escapeHtml(text).replace(/\n/g, '<br>');
  const extra = cardsHtml ? `<div class="ai-cards">${cardsHtml}</div>` : '';
  if (role === 'user') {
    const uid = ++chatMsgSeq;
    return `<div class="chat-msg user" id="qturn${uid}"><div class="avatar">${avatar}</div><div class="bubble">${safeText}${extra}</div></div>`;
  }
  return `<div class="chat-msg ai"><div class="avatar">${avatar}</div><div class="bubble">${safeText}${extra}</div></div>`;
}

// 在聊天区左侧构建/刷新「本次提问」目录（≥2 条提问、宽屏时显示）
let qTocScroll = null; // {area, fn} 当前滚动监听
function buildChatQToc() {
  const view = document.querySelector('.chat-view');
  const area = document.getElementById('chatMessages');
  if (!view || !area) return;
  let toc = document.getElementById('chatQToc');
  const userMsgs = [...area.querySelectorAll('.chat-msg.user')];

  if (userMsgs.length < 2) {
    if (toc) toc.remove();
    view.classList.remove('has-qtoc');
    if (qTocScroll) { qTocScroll.area.removeEventListener('scroll', qTocScroll.fn); qTocScroll = null; }
    return;
  }

  if (!toc) {
    toc = document.createElement('nav');
    toc.id = 'chatQToc';
    toc.className = 'chat-q-toc';
    view.appendChild(toc);
  }
  view.classList.add('has-qtoc');
  toc.innerHTML = userMsgs.map((m) => {
    const raw = (m.querySelector('.bubble') || m).textContent.trim().replace(/\s+/g, ' ');
    const label = raw.length > 24 ? raw.slice(0, 24) + '…' : raw;
    return `<a class="cqt-dot" data-target="${m.id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></a>`;
  }).join('');

  // 正态分布波动：波峰为选中圆点，邻近圆点按高斯曲线渐次放大，随鼠标平滑流动
  const dots = [...toc.querySelectorAll('.cqt-dot')];
  const n = dots.length;
  const SIGMA = 0.85;   // 曲线宽度
  const AMP = 0.9;      // 波峰额外放大量
  const setPeak = (center) => {
    dots.forEach((d, i) => {
      const dist = i - center;
      const s = 1 + AMP * Math.exp(-(dist * dist) / (2 * SIGMA * SIGMA));
      d.style.transform = `scale(${s.toFixed(3)})`;
    });
    const idx = Math.max(0, Math.min(n - 1, Math.round(center)));
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  };
  const centerFromY = (clientY) => {
    const first = dots[0].getBoundingClientRect();
    const last = dots[n - 1].getBoundingClientRect();
    const firstC = first.top + first.height / 2;
    const lastC = last.top + last.height / 2;
    const spacing = (lastC - firstC) / (n - 1) || 1;
    return Math.max(0, Math.min(n - 1, (clientY - firstC) / spacing));
  };
  // 阅读位置独立记录，鼠标滑过不污染；移出导轨后波峰回到它
  let spyIdx = n - 1;
  toc.onmousemove = (e) => setPeak(centerFromY(e.clientY));
  toc.onmouseleave = () => setPeak(spyIdx);
  // 滚动联动：取「最后一条顶部越过阅读线（视口约 25% 高）」的提问为当前阅读位置；
  // 滚到底部时直接锁定最后一条（长回复场景提问气泡会停在判定线上方，穿线判定会失效）
  if (qTocScroll) { qTocScroll.area.removeEventListener('scroll', qTocScroll.fn); qTocScroll = null; }
  const onScroll = () => {
    const line = area.getBoundingClientRect().top + area.clientHeight * 0.25;
    let idx = 0;
    userMsgs.forEach((m, i) => {
      if (m.getBoundingClientRect().top <= line) idx = i;
    });
    if (area.scrollTop + area.clientHeight >= area.scrollHeight - 40) idx = n - 1;
    spyIdx = idx;
    if (!toc.matches(':hover')) setPeak(spyIdx);
  };
  area.addEventListener('scroll', onScroll, { passive: true });
  qTocScroll = { area, fn: onScroll };
  onScroll(); // 初始同步（加载/发送后视图位于底部 → 自动锁定最新提问）
}

// 目录点击：在消息容器内平滑跳转到对应提问（事件委托，重渲染后仍有效）
document.addEventListener('click', (e) => {
  const item = e.target.closest && e.target.closest('.cqt-dot');
  if (!item) return;
  const target = document.getElementById(item.dataset.target);
  if (!target) return;
  const area = document.getElementById('chatMessages');
  if (area) {
    // 显式对滚动容器定位，并预留顶部间距
    const top = target.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - 84;
    area.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

let chatSending = false; // 流式回答进行中，防止重复发送

async function sendMessage() {
  if (chatSending) return;
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  const chatArea = document.getElementById('chatMessages');
  chatArea.innerHTML += renderChatBubble('user', msg);
  input.value = '';
  scrollChatToBottom();

  // 空的 AI 气泡：思考提示 + 流式文本容器 + 卡片容器
  const aiId = 'chatAI_' + (++chatMsgSeq);
  chatArea.innerHTML += `<div class="chat-msg ai" id="${aiId}"><div class="avatar">\u{1F33F}</div>`
    + '<div class="bubble">'
    + '<span class="ai-thinking">正在思考…</span>'
    + '<span class="ai-stream-text"></span>'
    + '<div class="ai-cards" style="display:none"></div>'
    + '</div></div>';
  scrollChatToBottom();

  const aiEl = document.getElementById(aiId);
  const paintError = (text) => {
    if (!aiEl) return;
    aiEl.querySelector('.bubble').innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  };

  chatSending = true;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API_BASE + '/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: msg, sessionId: chatSessionId }),
    });

    // 流建立前的错误（400/401 等）仍是普通 JSON
    if (!res.ok || !res.body) {
      let errMsg = '抱歉，我暂时无法回复，请稍后再试~';
      try {
        const j = await res.json();
        errMsg = j.message || errMsg;
      } catch { /* 忽略解析失败 */ }
      if (res.status === 401) {
        clearLogin();
        showPage('login');
      }
      paintError(errMsg);
      return;
    }

    const thinkEl = aiEl.querySelector('.ai-thinking');
    const textEl = aiEl.querySelector('.ai-stream-text');
    const cardsEl = aiEl.querySelector('.ai-cards');
    let fullText = '';
    const renderStreamText = () => {
      if (fullText) {
        thinkEl.style.display = 'none';
        textEl.innerHTML = escapeHtml(fullText).replace(/\n/g, '<br>');
      } else {
        // reset 后回到思考态（工具执行中）
        thinkEl.style.display = '';
        textEl.innerHTML = '';
      }
      scrollChatToBottom();
    };

    // 解析一帧 SSE（event: xxx / data: {...}）
    const handleFrame = (frame) => {
      let event = 'message';
      const dataLines = [];
      frame.split('\n').forEach((line) => {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      });
      if (!dataLines.length) return null;
      try {
        return { event, data: JSON.parse(dataLines.join('\n')) };
      } catch {
        return null;
      }
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    let doneData = null;
    let errData = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      buf = buf.replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const parsed = handleFrame(frame);
        if (!parsed) continue;
        if (parsed.event === 'delta') {
          fullText += parsed.data.text || '';
          renderStreamText();
        } else if (parsed.event === 'reset') {
          fullText = '';
          renderStreamText();
        } else if (parsed.event === 'done') {
          doneData = parsed.data;
        } else if (parsed.event === 'error') {
          errData = parsed.data;
        }
      }
    }
    if (buf.trim()) {
      const parsed = handleFrame(buf);
      if (parsed && parsed.event === 'done') doneData = parsed.data;
      if (parsed && parsed.event === 'error') errData = parsed.data;
    }

    if (errData) {
      paintError(errData.message || '抱歉，我暂时无法回复，请稍后再试~');
      return;
    }

    if (doneData) {
      chatSessionId = doneData.sessionId;
      // 以服务端持久化的完整文本为准，再渲染一次（修正 trim/兜底差异）
      fullText = doneData.reply || fullText;
      renderStreamText();
      if (Array.isArray(doneData.cards) && doneData.cards.length) {
        cardsEl.innerHTML = doneData.cards.map(renderChatCard).join('');
        cardsEl.style.display = '';
      }
      buildChatQToc();
      loadSessionList();
    }
  } catch (err) {
    console.error('chat stream error:', err);
    paintError('网络开小差了，请稍后再试~');
  } finally {
    chatSending = false;
    scrollChatToBottom();
  }
}

// ============ 会话历史（新对话 / 列表 / 回看续聊 / 管理删除） ============
const WELCOME_HTML = '<div class="chat-msg ai"><div class="avatar">🌿</div><div class="bubble">你好呀，我是小松 🌿 今天感觉怎么样？有什么不舒服可以跟我说~</div></div>';

let sessionManageMode = false;
let sessionListCache = [];
const selectedSessions = new Set();

function newChat() {
  chatSessionId = null;
  document.getElementById('chatMessages').innerHTML = WELCOME_HTML;
  buildChatQToc();
  document.body.classList.remove('sb-open');
  loadSessionList();
  const input = document.getElementById('chatInput');
  if (input) input.focus();
}

async function loadSessionList() {
  const box = document.getElementById('sessionList');
  if (!box) return;
  const res = await fetchAPI('/chat/sessions');
  if (!res.success || !Array.isArray(res.data)) return;
  sessionListCache = res.data;
  if (!res.data.length) {
    box.innerHTML = '<div class="sb-empty">还没有对话，和小松聊聊吧</div>';
    updateManageBar();
    return;
  }
  box.innerHTML = res.data.map(s => {
    if (sessionManageMode) {
      const on = selectedSessions.has(s.id);
      return `<div class="sb-session sb-session-pick${on ? ' picked' : ''}" data-sid="${s.id}" onclick="toggleSessionPick(${s.id})" title="${escapeHtml(s.lastMessage || '')}">
        <input type="checkbox" class="sb-session-check" ${on ? 'checked' : ''} tabindex="-1">
        <span class="sb-session-title">${escapeHtml(s.title || '新的对话')}</span>
      </div>`;
    }
    return `<div class="sb-session${s.id === chatSessionId ? ' active' : ''}" onclick="loadSession(${s.id})" title="${escapeHtml(s.lastMessage || '')}">
      <span class="sb-session-title">${escapeHtml(s.title || '新的对话')}</span>
    </div>`;
  }).join('');
  updateManageBar();
}

function updateManageBar() {
  const cnt = selectedSessions.size;
  const countEl = document.getElementById('sbSelCount');
  if (countEl) countEl.textContent = cnt ? ' (' + cnt + ')' : '';
  const all = document.getElementById('sbSelAll');
  if (all) all.checked = sessionListCache.length > 0 && cnt === sessionListCache.length;
}

// 进入/退出「管理对话」模式
function toggleSessionManage(force) {
  sessionManageMode = typeof force === 'boolean' ? force : !sessionManageMode;
  selectedSessions.clear();
  document.getElementById('appSidebar').classList.toggle('managing', sessionManageMode);
  const btn = document.getElementById('sbManageBtn');
  if (btn) {
    btn.textContent = sessionManageMode ? '完成' : '⚙';
    btn.title = sessionManageMode ? '完成管理' : '管理对话';
    btn.classList.toggle('active', sessionManageMode);
  }
  loadSessionList();
}

function toggleSessionPick(id) {
  if (selectedSessions.has(id)) selectedSessions.delete(id);
  else selectedSessions.add(id);
  loadSessionList();
}

function toggleSelAllSessions() {
  const allPicked = sessionListCache.length > 0 && selectedSessions.size === sessionListCache.length;
  selectedSessions.clear();
  if (!allPicked) sessionListCache.forEach(s => selectedSessions.add(s.id));
  loadSessionList();
}

async function deleteSelectedSessions() {
  const ids = [...selectedSessions];
  if (!ids.length) {
    toast('请先勾选要删除的对话', 'warn');
    return;
  }
  if (!confirm(`确定删除选中的 ${ids.length} 条对话吗？删除后不可恢复`)) return;
  let okCount = 0;
  let failCount = 0;
  for (const id of ids) {
    const res = await fetchAPI('/chat/sessions/' + id, { method: 'DELETE' });
    if (res.success) okCount++; else failCount++;
  }
  const currentDeleted = selectedSessions.has(chatSessionId);
  selectedSessions.clear();
  toast(failCount ? `已删除 ${okCount} 条，${failCount} 条失败` : `已删除 ${okCount} 条对话`);
  if (currentDeleted) newChat();
  else loadSessionList();
}

async function loadSession(id) {
  const res = await fetchAPI('/chat/sessions/' + id + '/messages');
  if (!res.success || !res.data) {
    toast(res.message || '会话加载失败', 'error');
    return;
  }
  chatSessionId = id;
  const chatArea = document.getElementById('chatMessages');
  chatArea.innerHTML = res.data.messages.length
    ? res.data.messages.map(m => renderChatBubble(m.role === 'user' ? 'user' : 'ai', m.content)).join('')
    : WELCOME_HTML;
  buildChatQToc();
  scrollChatToBottom();
  document.body.classList.remove('sb-open');
  loadSessionList();
}

function quickAsk(q) {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = q;
    sendMessage();
  }
}

function scrollChatToBottom() {
  const chat = document.getElementById('chatMessages');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

// ============ AI 对话内卡片（函数调用结果渲染） ============

const chatPending = new Map(); // 确认卡待提交 payload
let chatPendingSeq = 0;

function ccShell(title, icon, body, page) {
  const nav = page ? `<button class="cc-link" onclick="showPage('${page}')">去板块查看 →</button>` : '';
  return `<div class="cc-card"><div class="cc-head"><span class="cc-title">${icon} ${escapeHtml(title)}</span>${nav}</div><div class="cc-body">${body}</div></div>`;
}

function ccConfirmShell(kind, key, title, bodyHtml) {
  return `<div class="cc-card cc-confirm" data-confirm="${kind}" data-key="${key}">
    <div class="cc-head"><span class="cc-title">📝 ${escapeHtml(title)}</span></div>
    <div class="cc-body">${bodyHtml}</div>
    <div class="cc-actions">
      <button class="cc-btn cc-btn-primary" onclick="chatConfirm(this)">✅ 确认</button>
      <button class="cc-btn cc-btn-ghost" onclick="chatCancel(this)">取消</button>
    </div>
  </div>`;
}

function kvRow(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="cc-row"><span class="cc-label">${escapeHtml(label)}</span><span class="cc-value">${escapeHtml(value)}</span></div>`;
}

function renderChatCard(card) {
  if (!card || !card.type) return '';
  switch (card.type) {
    case 'acupoint_list':
      return ccShell('推荐穴位', '🦶',
        (card.items || []).map(a =>
          `<div class="cc-item"><span class="cc-item-icon">${escapeHtml(a.icon || '📍')}</span><span class="cc-item-main"><b>${escapeHtml(a.name)}</b><span class="cc-sub">${escapeHtml(a.tag)} · ${escapeHtml(a.effect)}</span></span></div>`
        ).join('') || '<div class="cc-empty">暂无数据</div>', 'care');
    case 'acupoint_detail': {
      const a = card.item || {};
      return ccShell(a.name || '穴位详情', a.icon || '📍',
        kvRow('功效', a.effect) + kvRow('定位', a.location) + kvRow('手法', a.method)
        + kvRow('时长', a.duration) + kvRow('频率', a.frequency), 'care');
    }
    case 'footbath': {
      const r = card.recipe || {};
      return ccShell('AI 定制泡脚方', '🪣',
        `<div class="cc-recipe-name">${escapeHtml(r.name)}</div>`
        + kvRow('药材', r.herbs) + kvRow('水温', r.temp) + kvRow('时长', r.duration), 'care');
    }
    case 'diet': {
      const d = card.data || {};
      const g = d.goodFoods || {};
      const b = d.badFoods || {};
      const section = (label, arr) => (arr && arr.length ? `<div class="cc-row"><span class="cc-label">${label}</span><span class="cc-value">${arr.map(escapeHtml).join('、')}</span></div>` : '');
      return ccShell('今日饮食建议', '🍵',
        `<div class="cc-principle">${escapeHtml((d.recommend || {}).principle || '')}</div>`
        + section('推荐茶饮', g.tea) + section('推荐主食', g.staple) + section('推荐蔬菜', g.vegetable) + section('推荐水果', g.fruit)
        + section('忌生冷', b.cold) + section('忌辛辣油炸', b.spicy) + section('忌过酸', b.sour), 'diet');
    }
    case 'clothing': {
      const d = card.data || {};
      return ccShell('实时天气 · 穿衣建议', d.weather || '🌤️',
        `<div class="cc-weather-line"><b>${escapeHtml(d.city)}</b> ${escapeHtml(d.weatherText || '')} ${escapeHtml(d.temp)}°C　最高${escapeHtml(d.high)}° / 最低${escapeHtml(d.low)}°　温差${escapeHtml(d.diff)}°</div>`
        + `<div class="cc-principle">${escapeHtml(d.principle)}</div>`
        + kvRow('内搭', d.inner) + kvRow('外套', d.outer) + kvRow('鞋子', d.shoes)
        + kvRow('风', d.wind) + kvRow('湿度', (d.humidity == null ? '' : d.humidity + '%')), 'clothing');
    }
    case 'exercise':
      return ccShell('疏肝轻运动', '🧘',
        (card.items || []).map(e =>
          `<div class="cc-item"><span class="cc-item-icon">${escapeHtml(e.icon || '')}</span><span class="cc-item-main"><b>${escapeHtml(e.name)}</b><span class="cc-sub">${escapeHtml(e.duration)} · ${escapeHtml(e.tag)}</span></span></div>`
        ).join(''), 'rhythm');
    case 'practice':
      return ccShell('八段锦 · 动作序列', '🤸',
        (card.items || []).map((m, i) =>
          `<div class="cc-item"><span class="cc-step">${i + 1}</span><span class="cc-item-main"><b>${escapeHtml(m.name)}</b><span class="cc-sub">${escapeHtml(m.duration || '')}</span></span></div>`
        ).join(''), 'practice');
    case 'practice_detail': {
      const p = card.item || {};
      const sec = (label, text) => text
        ? `<div class="cc-sec"><div class="cc-sec-label">${escapeHtml(label)}</div><div class="cc-sec-text">${escapeHtml(text)}</div></div>`
        : '';
      return ccShell(p.name || '功法详解', '🤸',
        sec('分步要领', p.steps) + sec('呼吸配合', p.breath) + sec('次数时长', p.duration)
        + sec('常见错误', p.mistakes) + sec('功效', p.effect) + sec('注意事项', p.cautions)
        + sec('练习轮次', p.rounds) + sec('不适应人群', p.unsuitable), 'practice');
    }
    case 'overview': {
      const todos = card.todos || [];
      const done = todos.filter(t => t.done).length;
      return ccShell('今日健康概览', '📊',
        `<div class="cc-score-line">肝郁指数 <b>${card.score == null ? '未评估' : escapeHtml(card.score)}</b> <span class="cc-sub">${escapeHtml(card.level || '')}</span></div>`
        + `<div class="cc-sub" style="margin:6px 0;">今日待办 ${done}/${todos.length}</div>`
        + todos.map(t => `<div class="cc-row"><span class="cc-value">${t.done ? '✔️' : '⭕'} ${escapeHtml((t.time ? t.time + ' ' : '') + t.text)}</span></div>`).join(''), 'home');
    }
    case 'symptom_list':
      return ccShell('我的历史症状', '🩺',
        (card.items || []).map(s =>
          `<div class="cc-row"><span class="cc-value">${escapeHtml(s.time)} ${escapeHtml(s.symptom)}（${escapeHtml(s.severity)}${s.cause ? '，' + escapeHtml(s.cause) : ''}）</span></div>`
        ).join('') || '<div class="cc-empty">还没有症状记录</div>', 'record');
    case 'medicine_list':
      return ccShell('我的用药提醒', '💊',
        (card.items || []).map(m =>
          `<div class="cc-row"><span class="cc-value"><b>${escapeHtml(m.name)}</b> ${escapeHtml(m.dose)} · ${escapeHtml(m.time)}${m.note ? '（' + escapeHtml(m.note) + '）' : ''}</span></div>`
        ).join('') || '<div class="cc-empty">还没有用药提醒</div>', 'record');
    case 'todo_list':
      return ccShell(card.date ? `${card.date} 待办` : '今日调理待办', '✅',
        (card.items || []).map(t =>
          `<div class="cc-row"><span class="cc-value">${t.done ? '✔️' : '⭕'} ${escapeHtml((t.time ? t.time + ' ' : '') + t.text)}</span></div>`
        ).join('') || '<div class="cc-empty">暂无待办</div>', 'home');
    case 'profile': {
      const d = card.data || {};
      return ccShell('我的健康档案', '👤',
        kvRow('体质', d.constitution) + kvRow('过敏史', d.allergy) + kvRow('饮食偏好', d.dietPref)
        + kvRow('运动习惯', d.exercisePref) + kvRow('作息规律', d.sleepPref) + kvRow('体感敏感度', d.bodySense)
        + kvRow('肝郁指数', d.score == null ? '' : `${d.score}（${d.level || ''}）`), 'profile');
    }
    // ---- 写操作确认卡（不落库，等用户点击） ----
    case 'confirm_symptom': {
      const p = card.payload || {};
      const key = ++chatPendingSeq;
      chatPending.set(key, { kind: 'symptom', payload: p });
      return ccConfirmShell('symptom', key, '确认记录这条症状？',
        kvRow('症状', p.symptom) + kvRow('程度', p.severity) + kvRow('可能原因', p.cause));
    }
    case 'confirm_mood': {
      const p = card.payload || {};
      const key = ++chatPendingSeq;
      chatPending.set(key, { kind: 'mood', payload: p });
      return ccConfirmShell('mood', key, '确认今日情绪打卡？', kvRow('心情', p.mood));
    }
    case 'confirm_todo': {
      const p = card.payload || {};
      const key = ++chatPendingSeq;
      chatPending.set(key, { kind: 'todo', payload: p });
      return ccConfirmShell('todo', key, '确认添加这条提醒？',
        kvRow('内容', p.content) + kvRow('提醒时间', p.time) + kvRow('日期', p.date || '今天'));
    }
    case 'confirm_profile': {
      const p = card.payload || {};
      const key = ++chatPendingSeq;
      chatPending.set(key, { kind: 'profile', payload: p });
      const labels = { constitution: '体质', allergy: '过敏史', dietPref: '饮食偏好', exercisePref: '运动习惯', sleepPref: '作息规律', bodySense: '体感敏感度' };
      return ccConfirmShell('profile', key, '确认更新健康档案？',
        Object.keys(p).map(k => kvRow(labels[k] || k, p[k])).join(''));
    }
    case 'confirm_medicine': {
      const p = card.payload || {};
      const key = ++chatPendingSeq;
      chatPending.set(key, { kind: 'medicine', payload: p });
      return ccConfirmShell('medicine', key, '确认用药打卡？', kvRow('药品', p.medicineName));
    }
    default:
      return '';
  }
}

// 确认卡：提交到现有 REST 接口落库
async function chatConfirm(btn) {
  const cardEl = btn.closest('.cc-confirm');
  if (!cardEl) return;
  const key = Number(cardEl.dataset.key);
  const pending = chatPending.get(key);
  if (!pending) return;
  btn.disabled = true;
  btn.textContent = '提交中…';
  let res;
  try {
    if (pending.kind === 'symptom') {
      res = await fetchAPI('/record/symptoms', { method: 'POST', body: JSON.stringify(pending.payload) });
    } else if (pending.kind === 'mood') {
      res = await fetchAPI('/rhythm/mood', { method: 'POST', body: JSON.stringify({ mood: pending.payload.mood }) });
    } else if (pending.kind === 'todo') {
      res = await fetchAPI('/todos', { method: 'POST', body: JSON.stringify(pending.payload) });
    } else if (pending.kind === 'profile') {
      res = await fetchAPI('/profile', { method: 'PUT', body: JSON.stringify(pending.payload) });
    } else if (pending.kind === 'medicine') {
      res = await fetchAPI('/record/medicines/' + encodeURIComponent(pending.payload.medicineId) + '/punch', { method: 'POST' });
    }
  } finally {
    // fetchAPI 已内置异常兜底
  }
  if (res && res.success) {
    chatPending.delete(key);
    cardEl.classList.add('cc-done');
    cardEl.innerHTML = '<div class="cc-done-text">✅ 已确认，' + escapeHtml(res.message || '操作成功') + '</div>';
    refreshChatOverview();
  } else {
    btn.disabled = false;
    btn.textContent = '✅ 确认';
    const tip = cardEl.querySelector('.cc-error') || (() => {
      const d = document.createElement('div');
      d.className = 'cc-error';
      cardEl.appendChild(d);
      return d;
    })();
    tip.textContent = (res && res.message) || '提交失败，请稍后再试';
  }
}

function chatCancel(btn) {
  const cardEl = btn.closest('.cc-confirm');
  if (!cardEl) return;
  const key = Number(cardEl.dataset.key);
  chatPending.delete(key);
  cardEl.classList.add('cc-canceled');
  cardEl.innerHTML = '<div class="cc-done-text cc-cancel-text">已取消，没有写入记录</div>';
}

async function refreshChatOverview() {
  const res = await fetchAPI('/health/dashboard');
  if (res.success && res.data) {
    const d = res.data;
    const scoreEl = document.getElementById('chScore');
    const todosEl = document.getElementById('chTodos');
    if (scoreEl && d.score !== undefined) scoreEl.textContent = d.score;
    if (todosEl) {
      const done = (d.todos || []).filter(t => t.done).length;
      todosEl.textContent = (d.todos || []).length ? done + '/' + d.todos.length : '0';
    }
  }
}

// ============ 功法带练 ============
let currentPracticeGroup = 'baduanjin';
let practiceMovesCache = [];
let practiceTimer = null;
const PRACTICE_META = {
  baduanjin: { title: '八段锦 · 动作序列', hint: '每式约 30 秒，整套约 4 分钟，循序渐进、不憋气' },
  stretch: { title: '疏肝拉伸序列', hint: '拉伸到有牵拉感即可，不要疼痛，每侧动作左右都做' },
  office: { title: '办公室微运动', hint: '坐在工位上也能完成，每工作 1 小时起来做一组' },
};
// 动作 → 视频文件映射（用户上传后补充路径）
const VIDEO_MAP = {
  '两手托天理三焦': 'img/anims/tuotian.mp4',
};
// 从 duration 字符串解析循环次数，如 "6次，1分40秒" → 6
function parseReps(durationStr) {
  const m = String(durationStr || '').match(/(\d+)\s*次/);
  return m ? parseInt(m[1], 10) : 6;
}
let currentDetailIndex = -1;

async function switchPracticeTab(group, ev) {
  document.querySelectorAll('#page-practice .tab-bar .tab').forEach(t => t.classList.remove('active'));
  if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
  currentPracticeGroup = group;
  await loadPracticeMoves(group);
}

async function loadPracticeMoves(group) {
  group = group || currentPracticeGroup;
  currentPracticeGroup = group;
  stopPractice(false);
  const [r1] = await Promise.all([
    fetchAPI('/practice/moves?group=' + group),
  ]);
  const moves = r1.success && Array.isArray(r1.data) ? r1.data : [];
  // 对有视频的动作，预加载视频并用真实时长×次数覆盖 m.secs，随后刷新 DOM
  const videoUpdates = [];
  for (const m of moves) {
    const vsrc = VIDEO_MAP[m.name];
    if (vsrc) {
      videoUpdates.push(new Promise((resolve) => {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.src = vsrc;
        const onMeta = () => {
          const reps = parseReps(m.duration);
          const newSecs = Math.round(v.duration * reps);
          if (Number.isFinite(newSecs) && newSecs > 0) m.secs = newSecs;
          resolve();
        };
        const onErr = () => resolve();
        v.addEventListener('loadedmetadata', onMeta, { once: true });
        v.addEventListener('error', onErr, { once: true });
        setTimeout(onErr, 5000);
      }));
    }
  }
  if (videoUpdates.length) await Promise.all(videoUpdates);

  practiceMovesCache = moves;
  const list = document.getElementById('moveList');
  if (list) {
    list.innerHTML = moves.length ? moves.map((m, i) => `
      <div class="move-item${i === 0 ? ' active' : ''}" onclick="seekPractice(${i})">
        <div class="num">${i + 1}</div>
        <div class="name">${escapeHtml(m.name)}</div>
        <div class="duration">${escapeHtml(fmtPracticeTime(m.secs || 30))}</div>
      </div>`).join('') : '<div style="color:var(--text-light);font-size:13px;">动作加载失败</div>';
  }
  const explain = document.getElementById('practiceExplain');
  if (explain) {
    explain.innerHTML = moves.length ? moves.map((m, i) => `
      <div class="card-beige" style="min-width:210px;max-width:260px;text-align:center;cursor:pointer;" onclick="showPracticeDetail(${i})">
        <div style="font-size:28px;color:var(--accent);font-weight:600;">${i + 1}</div>
        <div style="font-weight:500;">${escapeHtml(m.name)}</div>
        <div style="font-size:13px;color:var(--text-light);">${escapeHtml(m.duration || '')}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:4px;line-height:1.5;">${escapeHtml(m.breath || m.desc || '配合自然呼吸，动作缓慢舒展')}</div>
        <div style="font-size:11px;color:var(--accent);margin-top:6px;">${m.steps ? '查看分步与易错点 →' : '查看动作说明 →'}</div>
      </div>`).join('') : '';
  }
  const total = moves.reduce((s, m) => s + (m.secs || 30), 0);
  practiceTotal = total;
  const meta = PRACTICE_META[group];
  const titleEl = document.getElementById('practiceSeqTitle');
  if (titleEl && meta) titleEl.textContent = meta.title;
  const hintEl = document.getElementById('practiceSeqHint');
  if (hintEl) {
    hintEl.textContent = group === 'baduanjin' && moves.length
      ? `每式练习 6 次、约 1-2 分钟，整套约 ${Math.round(total / 60)} 分钟，循序渐进、不憋气`
      : (meta ? meta.hint : '');
  }
  const timeEl = document.getElementById('practiceTime');
  if (timeEl) timeEl.textContent = moves.length ? `0:00 / ${fmtPracticeTime(total)}` : '0:00 / 0:00';
  const bar = document.getElementById('practiceBar');
  if (bar) bar.style.width = '0%';
}

let practiceTotal = 0;
function fmtPracticeTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function practiceTotalSecs() {
  return practiceTotal || practiceMovesCache.reduce((s, m) => s + (m.secs || 30), 0);
}
function practiceIndexAt(elapsed) {
  let acc = 0;
  for (let i = 0; i < practiceMovesCache.length; i++) {
    acc += practiceMovesCache[i].secs || 30;
    if (elapsed < acc) return i;
  }
  return practiceMovesCache.length - 1;
}
// 从指定秒数开始/继续带练
function runPractice(elapsed) {
  const total = practiceTotalSecs();
  setPracticePlaying(true);
  practiceTimer = setInterval(() => {
    elapsed += 1;
    const bar = document.getElementById('practiceBar');
    if (bar) bar.style.width = Math.min(100, (elapsed / total) * 100) + '%';
    const timeEl = document.getElementById('practiceTime');
    if (timeEl) timeEl.textContent = fmtPracticeTime(Math.min(elapsed, total)) + ' / ' + fmtPracticeTime(total);
    if (elapsed >= total) {
      stopPractice();
      toast('完成一遍，气血舒展，给自己点个赞 🌿', 'success');
    }
  }, 1000);
}
function startPractice() {
  if (!practiceMovesCache.length) { toast('动作还在加载，请稍候'); return; }
  if (practiceTimer) { stopPractice(); return; }
  toast('开始跟练，配合呼吸慢慢来 🌿');
  runPractice(0);
}
function seekPractice(i) {
  // 右侧动作序列是独立目录，点击只打开详情弹窗，不控制左侧播放器
  highlightMove(i);
  showPracticeDetail(i);
}
// 动作详解弹窗（八段锦含分步/呼吸/易错点；拉伸与微动显示动作说明）
function showPracticeDetail(i) {
  currentDetailIndex = i;
  const m = practiceMovesCache[i];
  if (!m) return;
  // 展示层优化：把连续的“（1）…（2）…”步骤拆成多行，缓解长段落拥挤
  const fmtSteps = s => escapeHtml(String(s || '').replace(/（(\d+)）/g, '\n（$1）').replace(/^\n/, ''));
  const sec = (label, text, multiline) => text
    ? `<div class="pd-sec"><div class="pd-sec-label">${label}</div><div class="pd-sec-text${multiline ? ' pd-steps' : ''}">${multiline ? fmtSteps(text) : escapeHtml(text)}</div></div>`
    : '';
  // 深呼吸478：专属呼吸引导入口
  if (m.name && m.name.indexOf('478') > -1) {
    const navItems = practiceMovesCache.map((mv, idx) => `
      <div class="move-item${idx === i ? ' active' : ''}" onclick="showPracticeDetail(${idx})">
        <div class="num">${idx + 1}</div>
        <div class="name">${escapeHtml(mv.name)}</div>
        <div class="duration">${escapeHtml(fmtPracticeTime(mv.secs || 30))}</div>
      </div>`).join('');
    openModal(`
      <div class="pd-modal pd-video-modal">
        <div class="pd-head">
          <h3>🤸 ${escapeHtml(m.name)}</h3>
          <button class="pd-close" onclick="closeModal()" aria-label="关闭">✕</button>
        </div>
        <div class="pd-duration">${escapeHtml((m.duration || '').replace(/，?\d+分\d*秒?/g, '').replace(/，$/, ''))}，共${m.secs || 30}s</div>
        <div class="pd-body">
          <div class="pd-left">
            <div class="move-list-modal">${navItems}</div>
          </div>
          <div class="pd-center" style="display:flex;align-items:center;justify-content:center;min-width:0;">
            <div style="text-align:center;max-width:100%;">
              <div class="breath-guide-circle" id="breathCircle"><span id="breathText">准备</span></div>
              <div style="font-size:15px;margin-top:16px;white-space:nowrap;" id="breathSub">鼻吸 4 秒 · 屏息 7 秒 · 嘴呼 8 秒</div>
              <div style="font-size:13px;color:var(--text-light);margin-top:6px;white-space:nowrap;" id="breathRound">第 1 / 4 轮</div>
              <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
                <button class="btn btn-outline" onclick="stopBreathing()">结束引导</button>
                <button class="btn btn-primary" id="breathStartBtn" onclick="runBreathRound(1)">开始</button>
              </div>
            </div>
          </div>
          <div class="pd-right">
            <div class="pd-text">
              ${sec('分步要领', m.steps, true)}
              ${sec('呼吸配合', m.breath)}
              ${sec('常见错误', m.mistakes)}
              ${sec('功效', m.effect)}
              ${sec('注意事项', m.cautions)}
              ${sec('动作说明', m.desc)}
            </div>
          </div>
        </div>
      </div>
    `, { wide: true });
    return;
  }
  // 统一三段式弹窗：左目录 / 中视频或动画或占位图 / 右文字
  const videoSrc = VIDEO_MAP[m.name];
  const animKey = window.getStickmanKey ? getStickmanKey(m.name) : null;
  const reps = parseReps(m.duration);
  const navItems = practiceMovesCache.map((mv, idx) => `
    <div class="move-item${idx === i ? ' active' : ''}" onclick="showPracticeDetail(${idx})">
      <div class="num">${idx + 1}</div>
      <div class="name">${escapeHtml(mv.name)}</div>
      <div class="duration">${escapeHtml(fmtPracticeTime(mv.secs || 30))}</div>
    </div>`).join('');

  // 中栏内容：视频 > 简笔画 > 占位图
  let centerContent = '';
  if (videoSrc) {
    centerContent = `
      <div class="pd-video-wrap">
        <video id="pdVideo" src="${videoSrc}" muted playsinline style="width:100%;display:block;border-radius:10px;background:#f8f5ef"></video>
        <div class="pd-video-bar">
          <button type="button" class="pd-anim-btn" id="pdVideoBtn">⏸ 暂停</button>
          <span class="pd-video-info" id="pdVideoInfo">第 1 / ${reps} 次</span>
        </div>
      </div>`;
  } else if (animKey) {
    centerContent = `<div class="pd-anim" id="pdAnim" style="display:flex;align-items:center;justify-content:center;min-height:280px;"></div>`;
  } else {
    centerContent = `<div class="pd-placeholder" style="display:flex;align-items:center;justify-content:center;min-height:280px;background:#f8f5ef;border-radius:10px;"><span style="color:var(--text-light);font-size:14px;">视频制作中，敬请期待</span></div>`;
  }

  openModal(`
    <div class="pd-modal pd-video-modal">
      <div class="pd-head">
        <h3>🤸 ${escapeHtml(m.name)}</h3>
        <button class="pd-close" onclick="closeModal()" aria-label="关闭">✕</button>
      </div>
      <div class="pd-duration">${escapeHtml((m.duration || '').replace(/，?\d+分\d*秒?/g, '').replace(/，$/, ''))}，共${m.secs || 30}s</div>
      <div class="pd-body">
        <div class="pd-left">
          <div class="move-list-modal">${navItems}</div>
          <div class="pd-play-mode">
            <button type="button" class="pd-mode-btn" id="pdModeBtn">🔂 单集循环</button>
            <div class="pd-mode-drawer" id="pdModeDrawer">
              <div class="pd-mode-option active" data-mode="single">🔂 单集循环</div>
              <div class="pd-mode-option" data-mode="sequence">⏬ 顺序播放</div>
              <div class="pd-mode-option" data-mode="reverse">⏫ 倒序播放</div>
            </div>
          </div>
        </div>
        <div class="pd-center">
          ${centerContent}
        </div>
        <div class="pd-right">
          <div class="pd-text">
            ${sec('分步要领', m.steps, true)}
            ${sec('呼吸配合', m.breath)}
            ${sec('常见错误', m.mistakes)}
            ${sec('功效', m.effect)}
            ${sec('注意事项', m.cautions)}
            ${sec('动作说明', m.desc)}
          </div>
        </div>
      </div>
    </div>
  `, { wide: true, onOpen: () => {
    if (videoSrc) initPracticeVideo(reps, i);
    else if (animKey && window.Stickman) Stickman.mount(document.getElementById('pdAnim'), animKey);
    // 播放模式按钮：无论有无视频都绑定
    initPlayModeSelector();
  }});
}

// AI 跟练摄像头
let afCameraStream = null;
function startAICamera() {
  const video = document.getElementById('afCameraVideo');
  const overlay = document.getElementById('afCameraOverlay');
  if (!video) return;
  const setTip = (main, sub) => {
    if (overlay) overlay.innerHTML =
      '<div class="ai-camera-icon">📷</div><div>' + main + '</div><div class="ai-camera-sub">' + sub + '</div>';
  };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (window.isSecureContext === false || location.protocol === 'http:') {
      setTip('摄像头需在 HTTPS 下使用', '当前为 http 访问，请用 https 或 localhost 打开');
    } else {
      setTip('浏览器不支持摄像头', '请使用最新版 Chrome / Edge / Safari');
    }
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })
    .then(stream => {
      afCameraStream = stream;
      // 暗光环境下尝试连续自动曝光（不强制亮度值，避免部分摄像头偏色）
      const track = stream.getVideoTracks && stream.getVideoTracks()[0];
      if (track && track.applyConstraints) {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
          track.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] }).catch(() => {});
        }
      }
      video.srcObject = stream;
      if (overlay) overlay.style.display = 'none';
      video.play().then(() => startAIPoseEngine()).catch(() => startAIPoseEngine());
    })
    .catch(err => {
      console.log('摄像头开启失败:', err);
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setTip('摄像头权限被拒绝', '请在浏览器地址栏允许摄像头后重试');
      } else if (err && err.name === 'NotFoundError') {
        setTip('未检测到摄像头', '请确认设备摄像头可用');
      } else {
        setTip('摄像头开启失败', (err && err.message) ? err.message : '请检查设备与权限');
      }
    });
}
function stopAICamera() {
  if (window.AIPose) window.AIPose.stop();
  if (afCameraStream) {
    afCameraStream.getTracks().forEach(t => t.stop());
    afCameraStream = null;
  }
}

// 当前 AI 跟练选中的动作
let aiCurrentAction = '两手托天理三焦';

// 摄像头出画后启动 MediaPipe 姿态识别
function startAIPoseEngine() {
  const video = document.getElementById('afCameraVideo');
  const canvas = document.getElementById('afPoseCanvas');
  const statusEl = document.getElementById('afPoseStatus');
  if (!video || !canvas || !window.AIPose) return;
  window.AIPose.start(video, canvas, {
    action: aiCurrentAction,
    onScore: setAIScore,
    onStatus: (msg) => { if (statusEl) statusEl.textContent = msg; },
    onRep: (done, total, problems) => {
      const repEl = document.getElementById('afReps');
      if (repEl) repEl.textContent = Math.min(done, total) + ' / ' + total + ' 次';
      if (done <= total && problems && problems.length) {
        const s = document.getElementById('afPoseStatus');
        if (s) s.textContent = '第 ' + done + ' 次：' + problems.join('、');
      }
    },
  });
}
// ============ AI 跟练弹窗（左：演示+易错点 / 中：摄像头实时画面 / 右：选动作+文字提醒） ============
const AI_ACTION_GROUPS = {
  baduanjin: ['两手托天理三焦', '左右开弓似射雕', '调理脾胃须单举', '五劳七伤往后瞧', '摇头摆尾去心火', '两手攀足固肾腰', '攥拳怒目增气力', '背后七颠百病消'],
  stretch: ['搓胁肋', '侧腰拉伸', '扩胸展肩', '旋腰转脊', '深呼吸478'],
  office: ['颈部放松', '肩部环绕', '腰部扭转', '手腕伸展'],
};
const AI_GUIDE_MAP = {
  '两手托天理三焦': { tip: '上托时吸气，手臂贴近耳侧垂直向上，掌根发力如托重物；下落时呼气，双肩下沉不耸肩。', mistakes: ['上托时手臂向前推，而非垂直向上', '手掌到顶后大拇指分开', '呼吸与动作脱节、憋气耸肩'] },
  '左右开弓似射雕': { tip: '开弓展胸时吸气，沉肩坠肘，马步站稳；收回还原时呼气，切忌憋气。', mistakes: ['开弓时端肩、塌腰、重心偏移', '马步跪腿、收脚时脚擦地晃动', '拉弓手臂与肩部没有放松'] },
};
function aiGuide(name) {
  return AI_GUIDE_MAP[name] || { tip: '请跟随左侧演示动作，保持呼吸均匀、缓慢到位，肩颈放松不要憋气。', mistakes: ['动作过快、幅度过小', '憋气或呼吸急促', '耸肩、身体僵硬代偿'] };
}

// 演示区内容：有视频用视频（静音循环自动播放），否则占位
function aiDemoHtml(name) {
  const src = VIDEO_MAP[name];
  if (src) {
    return '<video class="afm-demo-video" src="' + src + '" autoplay loop muted playsinline></video>';
  }
  return '<div class="afm-demo-ph">▶ 演示视频制作中</div>';
}

// 弹窗全屏切换
function toggleAIFollowFullscreen() {
  const box = document.getElementById('modalBox');
  const btn = document.getElementById('afmFsBtn');
  if (!box) return;
  const fs = box.classList.toggle('afm-fullscreen');
  if (btn) btn.innerHTML = fs ? '🗗 退出全屏' : '⛶ 全屏';
}

function openAIFollowModal() {
  const itemsHtml = AI_ACTION_GROUPS.baduanjin.map((n, i) =>
    `<div class="ai-action-item${i === 0 ? ' active' : ''}" onclick="selectAIAction('${n}', this)">${n}</div>`).join('');
  const g = aiGuide('两手托天理三焦');
  const demoHtml = aiDemoHtml('两手托天理三焦');
  const html =
    '<div class="afm">' +
      '<div class="modal-head"><div class="modal-title">🤖 AI 跟练</div>' +
        '<div class="afm-head-actions">' +
          '<span class="afm-fullscreen-btn" id="afmFsBtn" title="全屏" onclick="toggleAIFollowFullscreen()">⛶ 全屏</span>' +
          '<span class="modal-close" onclick="closeModal()">×</span>' +
        '</div>' +
      '</div>' +
      '<div class="afm-body">' +
        '<div class="afm-col afm-left">' +
          '<div class="afm-block afm-block-demo"><div class="afm-label">动作演示</div>' +
            '<div class="afm-demo" id="afmDemo">' + demoHtml + '</div>' +
          '</div>' +
          '<div class="afm-block afm-block-flex"><div class="afm-label">⚠️ 易错点</div>' +
            '<ul class="afm-mistakes" id="afMistakes">' + g.mistakes.map(m => `<li>${m}</li>`).join('') + '</ul>' +
          '</div>' +
        '</div>' +
        '<div class="afm-col afm-center">' +
          '<div class="afm-camera-box">' +
            '<video id="afCameraVideo" autoplay playsinline muted></video>' +
            '<canvas id="afPoseCanvas" class="af-pose-canvas"></canvas>' +
            '<div class="afm-pose-status" id="afPoseStatus">正在初始化…</div>' +
            '<div class="ai-camera-overlay" id="afCameraOverlay">' +
              '<div class="ai-camera-icon">📷</div><div>摄像头实时画面</div><div class="ai-camera-sub">正在开启…</div>' +
            '</div>' +
          '</div>' +
          '<div class="afm-score"><span class="afm-score-label">实时得分</span>' +
            '<span class="ai-score-value" id="afScore">100</span>' +
            '<div class="ai-score-bar" style="flex:1;"><div class="ai-score-fill" id="afScoreFill" style="width:100%"></div></div>' +
            '<span class="afm-reps" id="afReps">0 / 6 次</span>' +
          '</div>' +
        '</div>' +
        '<div class="afm-col afm-right">' +
          '<div class="afm-block afm-block-flex"><div class="afm-label">选择动作</div>' +
            '<div class="ai-action-tabs">' +
              '<div class="ai-action-tab active" onclick="switchAIFollowTab(\'baduanjin\', this)">八段锦</div>' +
              '<div class="ai-action-tab" onclick="switchAIFollowTab(\'stretch\', this)">拉伸</div>' +
              '<div class="ai-action-tab" onclick="switchAIFollowTab(\'office\', this)">办公室</div>' +
            '</div>' +
            '<div class="ai-action-items afm-action-items" id="aiActionItems">' + itemsHtml + '</div>' +
          '</div>' +
          '<div class="afm-block"><div class="afm-label">💡 文字提醒</div>' +
            '<div class="afm-tip-text" id="afTipText">' + g.tip + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  openModal(html, { wide: true, onOpen: startAICamera });
}

// 切换动作分类
function switchAIFollowTab(tab, el) {
  document.querySelectorAll('.afm-body .ai-action-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const items = document.getElementById('aiActionItems');
  const list = AI_ACTION_GROUPS[tab] || [];
  items.innerHTML = list.map((n, i) =>
    `<div class="ai-action-item${i === 0 ? ' active' : ''}" onclick="selectAIAction('${n}', this)">${n}</div>`).join('');
  selectAIAction(list[0], items.querySelector('.ai-action-item'));
}

// 选中某个动作：更新文字提醒、易错点与演示视频
function selectAIAction(name, el) {
  if (el) {
    const box = document.getElementById('aiActionItems');
    box.querySelectorAll('.ai-action-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
  }
  const g = aiGuide(name);
  const tip = document.getElementById('afTipText');
  const mis = document.getElementById('afMistakes');
  const demo = document.getElementById('afmDemo');
  if (tip) tip.textContent = g.tip;
  if (mis) mis.innerHTML = g.mistakes.map(m => `<li>${m}</li>`).join('');
  if (demo) demo.innerHTML = aiDemoHtml(name);
  // 换动作后重置评分：默认 100，采用减分制
  aiCurrentAction = name;
  if (window.AIPose) window.AIPose.setAction(name);
  else setAIScore(100);
}

// 更新实时得分（减分制：0-100）。后续 MediaPipe 识别到不标准动作时调用此函数扣分
function setAIScore(score) {
  score = Math.max(0, Math.min(100, Math.round(score)));
  const val = document.getElementById('afScore');
  const fill = document.getElementById('afScoreFill');
  if (val) val.textContent = score;
  if (fill) fill.style.width = score + '%';
}

// 播放模式选择器：独立绑定，有无视频都可用
function initPlayModeSelector() {
  const modeBtn = document.getElementById('pdModeBtn');
  const modeDrawer = document.getElementById('pdModeDrawer');
  if (!modeBtn || !modeDrawer) return;
  const modeLabels = { single: '🔂 单集循环', sequence: '⏬ 顺序播放', reverse: '⏫ 倒序播放' };
  const modeWrap = modeBtn.closest('.pd-play-mode');
  modeBtn.textContent = modeLabels[videoPlayMode] || '🔂 单集循环';

  // 抽屉改为 fixed 定位，显示在按钮上方空白处
  function positionDrawer() {
    const rect = modeBtn.getBoundingClientRect();
    modeDrawer.style.position = 'fixed';
    modeDrawer.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    modeDrawer.style.left = rect.left + 'px';
    modeDrawer.style.width = rect.width + 'px';
    modeDrawer.style.top = 'auto';
    modeDrawer.style.right = 'auto';
    modeDrawer.style.marginTop = '0';
  }

  modeWrap.addEventListener('mouseenter', () => {
    positionDrawer();
    modeDrawer.classList.add('show');
  });
  modeWrap.addEventListener('mouseleave', () => modeDrawer.classList.remove('show'));
  modeDrawer.querySelectorAll('.pd-mode-option').forEach(opt => {
    opt.addEventListener('click', () => {
      videoPlayMode = opt.dataset.mode;
      modeBtn.textContent = modeLabels[videoPlayMode] || '🔂 单集循环';
      modeDrawer.querySelectorAll('.pd-mode-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      modeDrawer.classList.remove('show');
      toast('已切换：' + modeLabels[videoPlayMode]);
    });
  });
}
// 视频带练弹窗：初始化循环播放 + 次数统计 + 播放模式
let videoPlayMode = 'single'; // single | sequence | reverse
function initPracticeVideo(reps, moveIndex) {
  const video = document.getElementById('pdVideo');
  const btn = document.getElementById('pdVideoBtn');
  const info = document.getElementById('pdVideoInfo');
  if (!video) return;

  let repCount = 0;
  video.play().catch(() => {});
  video.addEventListener('ended', () => {
    repCount++;
    if (repCount < reps) {
      video.currentTime = 0;
      video.play().catch(() => {});
      if (info) info.textContent = `第 ${repCount + 1} / ${reps} 次`;
    } else {
      // 已播完一轮 N 次
      if (videoPlayMode === 'single') {
        // 单集循环：重置次数，从头再来
        repCount = 0;
        video.currentTime = 0;
        video.play().catch(() => {});
        if (info) info.textContent = `第 1 / ${reps} 次`;
      } else {
        // 顺序或倒序：自动切换
        let nextIndex;
        // 找下一个有视频的动作
        let found = false;
        for (let k = 0; k < practiceMovesCache.length; k++) {
          const idx = videoPlayMode === 'sequence'
            ? (moveIndex + 1 + k) % practiceMovesCache.length
            : (moveIndex - 1 - k + practiceMovesCache.length * 2) % practiceMovesCache.length;
          if (VIDEO_MAP[practiceMovesCache[idx].name]) {
            nextIndex = idx;
            found = true;
            break;
          }
        }
        if (found) {
          if (info) info.textContent = '即将播放：' + practiceMovesCache[nextIndex].name;
          setTimeout(() => showPracticeDetail(nextIndex), 1500);
        } else {
          // 没找到下一个视频，停在当前
          repCount = 0;
          video.currentTime = 0;
          video.play().catch(() => {});
          if (info) info.textContent = `第 1 / ${reps} 次`;
        }
      }
    }
  });
  if (btn) {
    btn.onclick = () => {
      if (video.paused) {
        if (repCount >= reps) {
          repCount = 0;
          if (info) info.textContent = `第 1 / ${reps} 次`;
        }
        video.play().catch(() => {});
        btn.textContent = '⏸ 暂停';
      } else {
        video.pause();
        btn.textContent = '▶ 播放';
      }
    };
  }
  // 弹窗关闭时暂停视频
  const mask = document.getElementById('modalMask');
  const obs = new MutationObserver(() => {
    if (!mask.classList.contains('show')) { video.pause(); obs.disconnect(); }
  });
  obs.observe(mask, { attributes: true, attributeFilter: ['class'] });
}
function highlightMove(i) {
  document.querySelectorAll('#moveList .move-item').forEach((el, idx) => {
    el.classList.toggle('active', idx === i);
    const num = el.querySelector('.num');
    if (num) num.textContent = idx === i ? '\u25B6' : (idx + 1);
  });
}
function setPracticePlaying(on) {
  document.querySelectorAll('#practicePlayer .play-btn').forEach(b => { b.textContent = on ? '\u23F8' : '\u25B6'; });
}
function stopPractice(withToast) {
  if (practiceTimer) { clearInterval(practiceTimer); practiceTimer = null; setPracticePlaying(false); }
  if (withToast !== false) toast('已停止带练');
}

// ============ 健康记录 ============
function switchRecordTab(tab, ev) {
  document.querySelectorAll('#page-record .tab-bar .tab').forEach(t => t.classList.remove('active'));
  const trigger = (ev && ev.currentTarget) || document.querySelector(`#page-record .tab-bar .tab[data-rkey="${tab}"]`);
  if (trigger) trigger.classList.add('active');
  const tabs = ['symptom', 'medicine', 'chronic'];
  tabs.forEach((t, i) => {
    const el = document.getElementById('recordTab' + (i + 1));
    if (el) el.style.display = tab === t ? 'block' : 'none';
  });
  if (tab === 'chronic') switchChronic(currentChronic);
}

// 「＋ 添加记录」入口：选择记录类型
function openRecordMenu() {
  if (!getToken()) { toast('登录后才能记录健康数据哦', 'warn'); return; }
  openModal(`
    <h3 style="margin:0 0 16px;">添加记录</h3>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <button class="record-menu-item" onclick="pickRecordType('symptom')">
        <span class="rmi-icon">&#129658;</span>
        <span style="text-align:left;"><b>记录症状</b><span style="display:block;font-size:12px;color:var(--text-light);font-weight:400;">头疼、失眠等，可自定义症状名</span></span>
      </button>
      <button class="record-menu-item" onclick="pickRecordType('medicine')">
        <span class="rmi-icon">&#128138;</span>
        <span style="text-align:left;"><b>添加用药提醒</b><span style="display:block;font-size:12px;color:var(--text-light);font-weight:400;">药品、剂量、提醒时间</span></span>
      </button>
    </div>
    <button class="btn btn-outline btn-block" style="margin-top:16px;" onclick="closeModal()">取消</button>`);
}

function pickRecordType(type) {
  closeModal();
  if (type === 'symptom') {
    switchRecordTab('symptom');
    setTimeout(openSymptomModal, 120);
  } else if (type === 'medicine') {
    switchRecordTab('medicine');
    setTimeout(openMedForm, 120);
  }
}

// 自定义症状记录弹窗（预设标签也可复用）
const SYMPTOM_QUICK = ['头疼', '胸闷', '失眠', '易怒', '腹胀', '口苦'];
function openSymptomModal(presetName) {
  const tags = SYMPTOM_QUICK.map(n =>
    `<div class="st${n === presetName ? ' selected' : ''}" onclick="pickSymptomSuggestion(this, '${n}')">${n}</div>`).join('');
  openModal(`
    <div class="modal-head"><div class="modal-title">记录症状</div><span class="modal-close" onclick="closeModal()">×</span></div>
    <div class="modal-body sym-modal-body">
      <label class="form-label">症状名称 *</label>
      <input class="form-input" id="symModalName" maxlength="50" placeholder="直接输入症状，或点下方常用项" value="${escapeHtml(presetName || '')}">
      <div class="symptom-tags sym-modal-tags">${tags}</div>
      <label class="form-label">程度</label>
      <select class="form-input" id="symModalSeverity"><option>轻度</option><option>中度</option><option>重度</option></select>
      <label class="form-label">可能原因</label>
      <input class="form-input" id="symModalCause" maxlength="50" placeholder="如：熬夜、压力大（选填）">
      <div class="sym-modal-btns">
        <button class="btn btn-outline" style="flex:1;" onclick="closeModal()">取消</button>
        <button class="btn btn-primary" style="flex:1;" id="symModalSave">记录</button>
      </div>
    </div>`);
  setTimeout(() => {
    const input = document.getElementById('symModalName');
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    const btn = document.getElementById('symModalSave');
    if (btn) btn.onclick = submitSymptomModal;
  }, 50);
}

function pickSymptomSuggestion(el, name) {
  document.querySelectorAll('#modalBox .symptom-tags .st').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  const input = document.getElementById('symModalName');
  if (input) input.value = name;
}

async function submitSymptomModal() {
  const name = (document.getElementById('symModalName').value || '').trim();
  if (!name) { toast('请输入症状名称'); return; }
  const btn = document.getElementById('symModalSave');
  btn.disabled = true;
  btn.textContent = '记录中…';
  const res = await fetchAPI('/record/symptoms', {
    method: 'POST',
    body: JSON.stringify({
      symptom: name,
      severity: document.getElementById('symModalSeverity').value,
      cause: (document.getElementById('symModalCause').value || '').trim(),
    }),
  });
  if (res.success) {
    closeModal();
    toast('症状已记录，小松会持续帮你关注 🌿', 'success');
    loadSymptomRecords();
    loadSymptomStats();
  } else {
    btn.disabled = false;
    btn.textContent = '记录';
    toast(res.message || '记录失败，请稍后重试', 'error');
  }
}

function quickSymptom(name) {
  const form = document.getElementById('symptomForm');
  const nameEl = document.getElementById('sfName');
  if (!form || !nameEl) return;
  nameEl.textContent = name;
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideSymptomForm() {
  const form = document.getElementById('symptomForm');
  if (form) form.style.display = 'none';
}

async function submitSymptom() {
  const name = (document.getElementById('sfName').textContent || '').trim();
  const severity = document.getElementById('sfSeverity').value;
  const cause = (document.getElementById('sfCause').value || '').trim();
  if (!name) { toast('请先选择症状'); return; }
  const res = await fetchAPI('/record/symptoms', {
    method: 'POST',
    body: JSON.stringify({ symptom: name, severity, cause }),
  });
  if (!res.success) {
    toast(res.message || '记录失败，请稍后重试', 'error');
    return;
  }
  toast('症状已记录，小松会持续帮你关注 🌿', 'success');
  hideSymptomForm();
  const causeEl = document.getElementById('sfCause');
  if (causeEl) causeEl.value = '';
  loadSymptomRecords();
  loadSymptomStats();
}

async function loadSymptomRecords() {
  const res = await fetchAPI('/record/symptoms');
  const list = document.getElementById('symptomList');
  if (!res.success || !res.data || !list) return;
  if (!res.data.length) {
    list.innerHTML = '<div style="color:var(--text-light);font-size:14px;">还没有症状记录，点右上角「＋ 添加记录」开始</div>';
    return;
  }
  list.innerHTML = res.data.map(r => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div><b>${escapeHtml(r.symptom)}</b> · ${escapeHtml(r.severity)}</div>
      <div style="color:var(--text-light);white-space:nowrap;">${escapeHtml(r.time)}${r.cause ? ' · ' + escapeHtml(r.cause) : ''}</div>
    </div>
  `).join('');
}

async function loadMedicines() {
  const list = document.getElementById('medList');
  if (!list) return;
  const res = await fetchAPI('/record/medicines');
  if (!res.success || !res.data) return;
  if (!res.data.length) {
    list.innerHTML = '<div style="color:var(--text-light);font-size:14px;">还没有用药提醒</div>';
    return;
  }
  list.innerHTML = res.data.map(m => `
    <div class="med-card">
      <div class="mc-left">
        <div class="name">${escapeHtml(m.name)}${m.note ? `<span style="font-size:12px;color:var(--text-light);font-weight:400;"> · ${escapeHtml(m.note)}</span>` : ''}</div>
        <div class="dose">${escapeHtml(m.dose || '按说明书服用')}${m.time ? ' · ' + escapeHtml(m.time) : ''}</div>
        <div class="med-last">${m.lastPunch ? '上次打卡 ' + escapeHtml(m.lastPunch.slice(5)) : '今天还没打卡'}</div>
      </div>
      <div class="mc-right">
        <div class="punch" data-id="${m.id}" onclick="punchMed(this)" title="服药打卡">&#10003;</div>
        <div class="med-del" data-id="${m.id}" data-name="${escapeHtml(m.name)}" onclick="deleteMed(this)" title="删除提醒">&#128465;</div>
      </div>
    </div>`).join('');
}

function openMedForm() {
  openModal(`
    <div class="modal-head">
      <div class="modal-title">添加用药提醒</div>
      <span class="modal-close" onclick="closeModal()">×</span>
    </div>
    <div class="modal-body">
      <label class="form-label">药品名称 *</label>
      <input class="form-input" id="medFormName" placeholder="如：逍遥丸" maxlength="100">
      <label class="form-label">剂量</label>
      <input class="form-input" id="medFormDose" placeholder="如：一次8丸" maxlength="50">
      <label class="form-label">提醒时间</label>
      <input class="form-input" id="medFormTime" type="time">
      <label class="form-label">备注</label>
      <input class="form-input" id="medFormNote" placeholder="如：饭后温水送服" maxlength="200">
    </div>
    <div class="modal-foot">
      <button class="btn btn-outline" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="submitMedForm()">保存提醒</button>
    </div>`);
  setTimeout(() => { const n = document.getElementById('medFormName'); if (n) n.focus(); }, 50);
}
async function submitMedForm() {
  const name = document.getElementById('medFormName').value.trim();
  if (!name) { toast('请输入药品名称'); return; }
  const payload = {
    name,
    dose: document.getElementById('medFormDose').value.trim(),
    time: document.getElementById('medFormTime').value.trim(),
    note: document.getElementById('medFormNote').value.trim(),
  };
  const res = await fetchAPI('/record/medicines', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.success) { toast(res.message || '添加失败', 'error'); return; }
  closeModal();
  toast('用药提醒已添加', 'success');
  loadMedicines();
}
async function deleteMed(el) {
  const id = el.dataset.id;
  const name = el.dataset.name || '该用药提醒';
  if (!confirm(`确定删除「${name}」的用药提醒吗？`)) return;
  const res = await fetchAPI('/record/medicines/' + id, { method: 'DELETE' });
  if (!res.success) { toast(res.message || '删除失败', 'error'); return; }
  toast('已删除用药提醒');
  loadMedicines();
}

async function punchMed(el) {
  const id = el.dataset.id;
  if (!id) return;
  const res = await fetchAPI('/record/medicines/' + id + '/punch', { method: 'POST' });
  if (!res.success) {
    toast(res.message || '打卡失败，请稍后重试', 'error');
    return;
  }
  toast('服药打卡成功，按时吃药很棒 🌿', 'success');
  loadMedicines();
}

// 症状近 7 天柱状趋势
async function loadSymptomStats() {
  const el = document.getElementById('symptomTrend');
  if (!el) return;
  const res = await fetchAPI('/record/symptoms/stats');
  if (!res.success || !res.data) return;
  const days = res.data.days || [];
  const max = Math.max(1, ...days.map(d => d.count));
  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  el.innerHTML = days.map(d => {
    const pct = d.count ? Math.max(12, (d.count / max) * 90) : 4;
    const color = d.count === 0 ? 'var(--border)' : d.count >= max && max >= 3 ? 'var(--danger)' : d.count >= 2 ? 'var(--warn)' : 'var(--primary)';
    const dow = WEEK_CN[new Date(d.date + 'T00:00:00').getDay()];
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div style="font-size:11px;color:var(--text-mid);">${d.count || ''}</div>
      <div style="width:22px;height:${pct}%;border-radius:4px 4px 0 0;background:${color};"></div>
      <div style="font-size:12px;color:var(--text-light);">${dow}</div>
    </div>`;
  }).join('');
  const tip = document.getElementById('symptomTrendTip');
  const total = days.reduce((a, b) => a + b.count, 0);
  if (tip) {
    tip.innerHTML = total === 0
      ? '\u{1F49A} 近 7 天没有不适记录，状态保持得不错'
      : `\u{1F9FE} 近 7 天共记录 ${total} 次，本月累计 ${res.data.monthCount} 次，留意发作当天的作息和饮食`;
  }
}

// ============ 慢病养护（静态常识 + AI 计划） ============
let currentChronic = '偏头痛';
const CHRONIC_DATA = {
  '偏头痛': {
    methods: [
      ['🧘 穴位', '风池、太阳、合谷，每个穴位轻柔按揉 2-3 分钟'],
      ['🍵 饮食', '天麻炖鱼头、菊花茶；少红酒、奶酪、浓咖啡'],
      ['🛌 作息', '尽量 23 点前入睡，午休 15-20 分钟，不睡太久'],
    ],
    signals: [
      ['调理周期', '以 4 周为一个观察周期，记录发作频率与程度'],
      ['加重信号', '发作频率增加、持续时间变长、疼痛程度加重'],
      ['就医指征', '伴呕吐、视觉异常或肢体麻木，或“最严重的一次头痛”，请及时就诊'],
    ],
  },
  '慢性咽炎': {
    methods: [
      ['🧘 穴位', '列缺、照海、天突（轻揉，勿重按），每日 2-3 次'],
      ['🍵 饮食', '胖大海枸杞茶、百合银耳羹；忌辛辣油炸、烟酒'],
      ['🗣️ 习惯', '少清嗓子、多喝温水，空调房注意加湿'],
    ],
    signals: [
      ['调理周期', '养护以 4-8 周为周期，减少反复刺激最重要'],
      ['加重信号', '咽痛明显、吞咽困难、反复清嗓带血'],
      ['就医指征', '持续超过 2 周不缓解或伴发热、声音嘶哑，请耳鼻喉科就诊'],
    ],
  },
  '月经不调': {
    methods: [
      ['🧘 穴位', '三阴交、太冲、血海，经前一周开始轻揉'],
      ['🍵 饮食', '玫瑰枸杞茶、当归红枣蛋；经前忌生冷'],
      ['🛌 作息', '规律睡眠、注意腰腹保暖，情绪波动时做 478 呼吸'],
    ],
    signals: [
      ['调理周期', '连续观察 2-3 个月经周期，记录周期、经期、经量'],
      ['加重信号', '周期紊乱加重、经量明显变化、经前情绪剧烈波动'],
      ['就医指征', '停经、非经期出血、剧痛或周期长期紊乱，请妇科就诊'],
    ],
  },
  '功能性消化不良': {
    methods: [
      ['🧘 穴位', '中脘、足三里、内关，饭后 1 小时轻揉'],
      ['🍵 饮食', '山药小米粥、陈皮茶；少食多餐，细嚼慢咽'],
      ['🚶 习惯', '饭后散步 10-15 分钟，避免立刻躺下'],
    ],
    signals: [
      ['调理周期', '以 2-4 周为周期，观察腹胀、嗳气变化'],
      ['加重信号', '餐后腹胀持续加重、食欲明显下降、体重减轻'],
      ['就医指征', '黑便、持续呕吐、夜间痛醒或症状超过 4 周，请消化科就诊'],
    ],
  },
};
function switchChronic(name, ev) {
  currentChronic = name;
  const chips = document.querySelectorAll('#recordTab3 .tag-chip');
  chips.forEach(c => c.classList.remove('active'));
  if (ev && ev.currentTarget) {
    ev.currentTarget.classList.add('active');
  } else {
    chips.forEach(c => { if (c.textContent.trim() === name) c.classList.add('active'); });
  }
  const d = CHRONIC_DATA[name];
  if (!d) return;
  const mEl = document.getElementById('chronicMethods');
  const sEl = document.getElementById('chronicSignals');
  if (mEl) {
    mEl.innerHTML = d.methods.map(([k, v]) =>
      `<div style="font-size:14px;margin-bottom:8px;line-height:1.6;"><b>${escapeHtml(k)}：</b>${escapeHtml(v)}</div>`).join('');
  }
  if (sEl) {
    sEl.innerHTML = d.signals.map(([k, v], i) =>
      `<div style="font-size:14px;margin-bottom:8px;line-height:1.6;"><b${i === 2 ? ' style="color:var(--danger);"' : ''}>${escapeHtml(k)}：</b>${escapeHtml(v)}</div>`).join('');
  }
}
function genChronicPlan() {
  askAIWith(`我最近在调理「${currentChronic}」，请结合疏肝解郁的思路，为我生成一份本周可执行的调理计划：每天 1 个养生动作、饮食注意和作息安排，并提醒我什么情况下需要就医。`);
}

// ============ 个人中心（健康档案，be-3） ============
let profileCache = null;

async function loadProfile() {
  const res = await fetchAPI('/profile');
  if (!res.success || !res.data) return;
  const p = res.data;
  profileCache = p;
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('pfNick', p.name || '小松');
  set('pfLevelTag', p.level || '未测评');
  applyAvatar('pfAvatar', p.name || '松', p.avatar);
  set('pfName', p.name || '小松');
  set('pfUsername', p.username || '--');
  set('pfEmail', p.email || '--');
  set('pfAllergy', p.allergy || '无');
  set('pfScore', (p.score === null || p.score === undefined ? '—' : p.score) + ' / ' + (p.level || '未测评'));
  set('pfUpdated', p.updatedAt ? String(p.updatedAt).slice(0, 10) : '—');
  set('pfDiet', p.dietPref || '未设置');
  set('pfExercise', p.exercisePref || '未设置');
  set('pfSleep', p.sleepPref || '未设置');
  set('pfBody', p.bodySense || '未设置');
}

// 我的-数据总览（真实统计）
async function loadProfileStats() {
  const res = await fetchAPI('/profile/stats');
  if (!res.success || !res.data) return;
  const d = res.data;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('pfStatSleep', d.avgSleep || '--');
  set('pfStatScore', d.score === null || d.score === undefined ? '未测评' : d.score);
  set('pfStatSymptom', (d.monthSymptomCount || 0) + ' 次');
  set('pfStatSleepDays', (d.sleepDays || 0) + ' 天');
}

// 我的：档案 / 慢病 / 收藏视图切换
function switchProfileView(view, mi) {
  document.querySelectorAll('.profile-menu .mi').forEach(m => m.classList.remove('active'));
  if (mi) mi.classList.add('active');
  const favCard = document.getElementById('viewFavorites');
  const chronicCard = document.getElementById('viewChronic');
  const cards = document.querySelectorAll('.pf-view-card');
  if (view === 'favorites') {
    if (favCard) favCard.style.display = '';
    if (chronicCard) chronicCard.style.display = 'none';
    cards.forEach(c => c.style.display = 'none');
    renderFavList();
  } else if (view === 'chronic') {
    if (favCard) favCard.style.display = 'none';
    if (chronicCard) chronicCard.style.display = '';
    cards.forEach(c => c.style.display = 'none');
    loadChronicProfile();
  } else {
    if (favCard) favCard.style.display = 'none';
    if (chronicCard) chronicCard.style.display = 'none';
    cards.forEach(c => c.style.display = '');
    if (view === 'stats') {
      setTimeout(() => {
        const statCard = document.getElementById('pfStatCard');
        if (statCard) statCard.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }
  }
}
// ============ 慢病档案（分步问卷） ============
let chronicCache = null;
const CHRONIC_DISEASE_OPTS = [
  '高血压', '糖尿病', '冠心病/心脏病', '胃病（胃炎/胃溃疡）', '肝病',
  '甲状腺疾病（甲亢/甲减）', '哮喘/慢阻肺', '长期失眠', '焦虑/抑郁',
  '颈椎病/腰椎病', '其他',
];
const CHRONIC_YEARS_OPTS = [
  { v: 'lt1', t: '1年以内' }, { v: '1to3', t: '1-3年' },
  { v: '3to5', t: '3-5年' }, { v: 'gt5', t: '5年以上' },
];
const CHRONIC_PREG_OPTS = [
  { v: 'none', t: '无' }, { v: 'trying', t: '备孕中' },
  { v: 'pregnant', t: '孕期' }, { v: 'breastfeeding', t: '哺乳期' },
];
const CHRONIC_YEARS_LABEL = Object.fromEntries(CHRONIC_YEARS_OPTS.map(o => [o.v, o.t]));
const CHRONIC_PREG_LABEL = Object.fromEntries(CHRONIC_PREG_OPTS.map(o => [o.v, o.t]));

async function loadChronicProfile() {
  const box = document.getElementById('chronicBox');
  if (!box) return;
  if (!getToken()) {
    box.innerHTML = '<div style="color:var(--text-light);font-size:14px;">登录后可建立慢病档案，获取更安全的调理建议</div>';
    return;
  }
  box.innerHTML = '<div style="color:var(--text-light);font-size:14px;">正在加载慢病档案…</div>';
  try {
    const res = await fetchAPI('/chronic-profile');
    if (!res.success) {
      box.innerHTML = `<div style="color:var(--warn);font-size:14px;">${escapeHtml(res.message || '加载失败，请稍后重试')}</div>`;
      return;
    }
    chronicCache = res.data;
  } catch {
    box.innerHTML = '<div style="color:var(--warn);font-size:14px;">网络异常，请稍后重试</div>';
    return;
  }
  renderChronicBox();
}

function renderChronicBox() {
  const box = document.getElementById('chronicBox');
  if (!box) return;
  const d = chronicCache;
  if (!d) {
    box.innerHTML = `
      <h3 style="margin-bottom:12px;">慢病档案</h3>
      <div class="cp-empty">
        <div class="cp-emoji">🩺</div>
        <div class="cp-title">花 1 分钟完成慢病问卷</div>
        <div class="cp-sub">有高血压、糖尿病等情况时，小松会在泡脚水温、功法幅度、用药提醒上主动给你安全提示</div>
        <button class="btn btn-primary" style="margin-top:16px;" onclick="openChronicSurvey()">开始问卷</button>
        <div class="cp-privacy">🔒 信息仅你本人可见，仅用于调理安全提醒，不做诊断</div>
      </div>`;
    return;
  }
  const diseaseHtml = d.hasDisease && d.diseases.length
    ? d.diseases.map(x => `<span class="cp-tag">${escapeHtml(x.name)}<i>${escapeHtml(CHRONIC_YEARS_LABEL[x.years] || '')}</i></span>`).join('')
    : '<span class="cp-none">无已确诊慢病</span>';
  const medHtml = d.hasMeds && d.meds.length
    ? d.meds.map(x => `<span class="cp-tag">${escapeHtml(x.name)}${x.dose ? `<i>${escapeHtml(x.dose)}</i>` : ''}</span>`).join('')
    : '<span class="cp-none">无长期用药</span>';
  const updated = (d.updatedAt || '').replace('T', ' ').slice(0, 16);
  box.innerHTML = `
    <h3 style="margin-bottom:12px;">慢病档案</h3>
    <div class="cp-note">信息仅你本人可见，小松会在泡脚、功法、穴位与食疗建议中参考它，主动规避风险，但不会据此做诊断。</div>
    <div class="cp-sec">
      <div class="cp-label">慢病情况</div>
      <div class="cp-tags">${diseaseHtml}</div>
    </div>
    <div class="cp-sec">
      <div class="cp-label">长期用药</div>
      <div class="cp-tags">${medHtml}</div>
    </div>
    <div class="cp-sec">
      <div class="cp-label">孕哺状态</div>
      <div class="cp-tags"><span class="cp-tag">${escapeHtml(CHRONIC_PREG_LABEL[d.pregnancy] || '无')}</span></div>
    </div>
    <div class="cp-updated">更新于 ${escapeHtml(updated || '--')}</div>
    <button class="btn btn-outline btn-sm" style="margin-top:14px;" onclick="openChronicSurvey()">重新填写</button>`;
}

// ---- 分步问卷状态机 ----
let sv = null;

function openChronicSurvey() {
  const c = chronicCache;
  const picked = {};
  let otherText = '';
  if (c && c.hasDisease) {
    for (const x of c.diseases) {
      const m = /^其他[:：]([\s\S]+)$/.exec(x.name);
      if (m) { picked['其他'] = x.years; otherText = m[1]; }
      else picked[x.name] = x.years;
    }
  }
  sv = {
    step: 0,
    hasDisease: c ? c.hasDisease : null,
    picked,
    otherText,
    hasMeds: c ? c.hasMeds : null,
    meds: (c && c.hasMeds && c.meds.length)
      ? c.meds.map(x => ({ name: x.name, dose: x.dose || '' }))
      : [{ name: '', dose: '' }],
    pregnancy: c ? (c.pregnancy || 'none') : 'none',
    saving: false,
  };
  renderSurvey();
}

function svSetDisease(v) { sv.hasDisease = v; renderSurvey(); }
function svSetMeds(v) {
  sv.hasMeds = v;
  if (v && !sv.meds.some(m => m.name.trim())) sv.meds = [{ name: '', dose: '' }];
  renderSurvey();
}
function svToggleDisease(name) {
  if (sv.picked[name]) delete sv.picked[name];
  else sv.picked[name] = '';
  renderSurvey();
}
function svSetYears(name, v) { sv.picked[name] = v; renderSurvey(); }
function svSetPreg(v) { sv.pregnancy = v; renderSurvey(); }
function svMedInput(i, key, val) { if (sv.meds[i]) sv.meds[i][key] = val; }
function svAddMed() { sv.meds.push({ name: '', dose: '' }); renderSurvey(); }
function svRemoveMed(i) {
  sv.meds.splice(i, 1);
  if (!sv.meds.length) sv.meds.push({ name: '', dose: '' });
  renderSurvey();
}

function svPrev() {
  const s = sv.step;
  if (s === 1) sv.step = 0;
  else if (s === 2) sv.step = 1;
  else if (s === 3) sv.step = sv.hasDisease ? 2 : 1;
  else if (s === 4) sv.step = 3;
  else if (s === 5) sv.step = 4;
  renderSurvey();
}

function svNext() {
  const s = sv.step;
  if (s === 0) { sv.step = 1; renderSurvey(); return; }
  if (s === 1) {
    if (sv.hasDisease === null) { toast('请选择一项', 'warn'); return; }
    sv.step = sv.hasDisease ? 2 : 3;
    renderSurvey();
    return;
  }
  if (s === 2) {
    const names = Object.keys(sv.picked);
    if (!names.length) { toast('请至少选择一种慢病', 'warn'); return; }
    if (sv.picked['其他'] && !sv.otherText.trim()) { toast('请填写其他慢病名称', 'warn'); return; }
    if (names.some(n => !sv.picked[n])) { toast('请为每种慢病选择患病年限', 'warn'); return; }
    sv.step = 3; renderSurvey(); return;
  }
  if (s === 3) {
    if (sv.hasMeds === null) { toast('请选择一项', 'warn'); return; }
    if (sv.hasMeds && !sv.meds.some(m => m.name.trim())) { toast('请填写至少一种长期药物，或选择“没有”', 'warn'); return; }
    sv.step = 4; renderSurvey(); return;
  }
  if (s === 4) { sv.step = 5; renderSurvey(); return; }
  if (s === 5) { svSubmit(); }
}

async function svSubmit() {
  if (sv.saving) return;
  sv.saving = true;
  renderSurvey();
  const body = {
    hasDisease: sv.hasDisease === true,
    diseases: sv.hasDisease
      ? Object.entries(sv.picked).map(([name, years]) => ({
        name: name === '其他' ? '其他：' + sv.otherText.trim() : name,
        years,
      }))
      : [],
    hasMeds: sv.hasMeds === true,
    meds: sv.hasMeds
      ? sv.meds.filter(m => m.name.trim()).map(m => ({ name: m.name.trim(), dose: (m.dose || '').trim() }))
      : [],
    pregnancy: sv.pregnancy || 'none',
  };
  let res;
  try {
    res = await fetchAPI('/chronic-profile', { method: 'PUT', body: JSON.stringify(body) });
  } catch {
    res = { success: false, message: '网络异常，请稍后重试' };
  }
  if (res.success) {
    closeModal();
    toast('慢病档案已保存', 'success');
    chronicCache = null;
    loadChronicProfile();
  } else {
    sv.saving = false;
    renderSurvey();
    toast(res.message || '保存失败，请重试', 'error');
  }
}

function renderSurvey() {
  const s = sv.step;
  const progress = [0, 25, 25, 50, 75, 100][s];
  let body = '';
  let nextText = '下一步';
  let showPrev = s > 0;

  if (s === 0) {
    body = `
      <div class="sv-intro">
        <div class="sv-emoji">🩺</div>
        <h4>用 1 分钟，让调理建议更安全</h4>
        <ul>
          <li>了解慢病情况，泡脚与功法建议会主动控制水温和动作幅度</li>
          <li>了解长期用药，规避中成药与西药相互作用的风险</li>
          <li>了解孕哺状态，自动避开活血穴位与药材</li>
        </ul>
        <div class="sv-tip">共 4 个小问题，可随时修改；信息仅你本人可见，不做诊断。</div>
      </div>`;
    showPrev = false;
    nextText = '开始填写';
  } else if (s === 1) {
    body = `
      <h4 class="sv-q">是否有医生已确诊的慢性疾病？</h4>
      <div class="sv-opts">
        <button type="button" class="sv-opt ${sv.hasDisease === true ? 'active' : ''}" onclick="svSetDisease(true)">
          <span class="sv-opt-ico">🩺</span><span>有</span>
        </button>
        <button type="button" class="sv-opt ${sv.hasDisease === false ? 'active' : ''}" onclick="svSetDisease(false)">
          <span class="sv-opt-ico">🌿</span><span>没有</span>
        </button>
      </div>`;
  } else if (s === 2) {
    const chips = CHRONIC_DISEASE_OPTS.map(n =>
      `<button type="button" class="sv-chip ${sv.picked[n] !== undefined ? 'active' : ''}" onclick="svToggleDisease('${n}')">${n}</button>`
    ).join('');
    const rows = Object.keys(sv.picked).map(n => `
      <div class="sv-years-row">
        <span class="sv-dname">${n}</span>
        <div class="sv-segs">
          ${CHRONIC_YEARS_OPTS.map(o =>
            `<button type="button" class="sv-seg ${sv.picked[n] === o.v ? 'active' : ''}" onclick="svSetYears('${n}','${o.v}')">${o.t}</button>`
          ).join('')}
        </div>
      </div>`).join('');
    body = `
      <h4 class="sv-q">选择已确诊的慢病（可多选）</h4>
      <div class="sv-chips">${chips}</div>
      ${sv.picked['其他'] !== undefined ? `
        <input class="sv-input" id="svOtherInput" maxlength="14" placeholder="请填写其他慢病名称（14字内）"
          value="${escapeHtml(sv.otherText)}">
      ` : ''}
      <div class="sv-years-wrap">
        <div class="sv-years-hint">每种慢病患病多久了？</div>
        ${rows || '<div class="sv-tip">先在上方选择慢病</div>'}
      </div>`;
    // 其他输入框直接写状态，避免重绘失焦
    setTimeout(() => {
      const inp = document.getElementById('svOtherInput');
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
        inp.oninput = () => { sv.otherText = inp.value; };
      }
    }, 0);
  } else if (s === 3) {
    body = `
      <h4 class="sv-q">是否长期服药（持续 3 个月以上）？</h4>
      <div class="sv-opts">
        <button type="button" class="sv-opt ${sv.hasMeds === true ? 'active' : ''}" onclick="svSetMeds(true)">
          <span class="sv-opt-ico">💊</span><span>有</span>
        </button>
        <button type="button" class="sv-opt ${sv.hasMeds === false ? 'active' : ''}" onclick="svSetMeds(false)">
          <span class="sv-opt-ico">🌿</span><span>没有</span>
        </button>
      </div>
      ${sv.hasMeds === true ? `
        <div class="sv-meds">
          <div class="sv-years-hint">药物名称与剂量（剂量选填）</div>
          ${sv.meds.map((m, i) => `
            <div class="sv-med-row">
              <input class="sv-input" maxlength="50" placeholder="如：硝苯地平" value="${escapeHtml(m.name)}"
                oninput="svMedInput(${i},'name',this.value)">
              <input class="sv-input sv-dose" maxlength="50" placeholder="剂量" value="${escapeHtml(m.dose)}"
                oninput="svMedInput(${i},'dose',this.value)">
              <button type="button" class="sv-med-del" onclick="svRemoveMed(${i})">✕</button>
            </div>`).join('')}
          <button type="button" class="sv-add" onclick="svAddMed()">＋ 添加一种</button>
        </div>` : ''}`;
  } else if (s === 4) {
    body = `
      <h4 class="sv-q">当前孕哺状态？</h4>
      <div class="sv-opts sv-opts-4">
        ${CHRONIC_PREG_OPTS.map(o => `
          <button type="button" class="sv-opt ${sv.pregnancy === o.v ? 'active' : ''}" onclick="svSetPreg('${o.v}')">
            <span>${o.t}</span>
          </button>`).join('')}
      </div>
      <div class="sv-tip">孕期/备孕/哺乳期中，穴位与泡脚建议会自动规避活血类内容。</div>`;
  } else {
    const diseaseHtml = sv.hasDisease
      ? Object.entries(sv.picked).map(([n, y]) => {
          const name = n === '其他' ? '其他：' + sv.otherText.trim() : n;
          return `<span class="cp-tag">${escapeHtml(name)}<i>${CHRONIC_YEARS_LABEL[y] || ''}</i></span>`;
        }).join('')
      : '<span class="cp-none">无已确诊慢病</span>';
    const medHtml = sv.hasMeds
      ? sv.meds.filter(m => m.name.trim()).map(m =>
        `<span class="cp-tag">${escapeHtml(m.name.trim())}${m.dose ? `<i>${escapeHtml(m.dose.trim())}</i>` : ''}</span>`).join('')
      : '<span class="cp-none">无长期用药</span>';
    body = `
      <h4 class="sv-q">确认你的慢病档案</h4>
      <div class="cp-sec">
        <div class="cp-label">慢病情况</div>
        <div class="cp-tags">${diseaseHtml}</div>
      </div>
      <div class="cp-sec">
        <div class="cp-label">长期用药</div>
        <div class="cp-tags">${medHtml}</div>
      </div>
      <div class="cp-sec">
        <div class="cp-label">孕哺状态</div>
        <div class="cp-tags"><span class="cp-tag">${CHRONIC_PREG_LABEL[sv.pregnancy] || '无'}</span></div>
      </div>
      <div class="sv-tip">保存后，小松会在相关调理建议中自动参考这些信息。</div>`;
    nextText = '确认保存';
  }

  openModal(`
    <div class="sv-modal">
      <div class="sv-head">
        <h3>慢病档案问卷</h3>
        <button class="pd-close" onclick="closeModal()" aria-label="关闭">✕</button>
      </div>
      <div class="sv-progress"><div class="sv-bar" style="width:${progress}%"></div></div>
      <div class="sv-body">${body}</div>
      <div class="sv-foot">
        ${showPrev ? '<button type="button" class="btn btn-outline" style="flex:1;" onclick="svPrev()">上一步</button>' : '<span style="flex:1;"></span>'}
        <button type="button" class="btn btn-primary" style="flex:1.4;" id="svNextBtn" onclick="svNext()">${sv.saving ? '保存中…' : nextText}</button>
      </div>
    </div>`);
}

// ============ 肝郁指数测评问卷 ============
const SCORE_QUESTIONS = [
  { k: 'mood',    t: '最近两周，您是否感到情绪低落、闷闷不乐？' },
  { k: 'sigh',    t: '您是否经常感到胸口发闷，想深呼吸或叹气才舒服？' },
  { k: 'hypo',    t: '您是否两侧肋骨下方（胁肋）有胀闷或胀痛感？' },
  { k: 'anger',   t: '您是否容易生气、烦躁，一点小事就发火？' },
  { k: 'sleep',   t: '您的睡眠质量如何（入睡困难、多梦、早醒）？' },
  { k: 'throat',  t: '您是否感到咽喉有异物感，吐之不出、咽之不下？' },
  { k: 'neck',    t: '您是否经常感到肩颈僵硬、紧绷？' },
  { k: 'bitter',  t: '您是否感到口苦、口干？' },
  { k: 'fatigue', t: '您是否感到疲倦乏力、提不起精神？' },
  { k: 'bloat',   t: '您是否感到腹部胀满、消化不畅？' },
];
const SCORE_OPTIONS = [
  { v: 0, t: '从不' }, { v: 1, t: '偶尔' }, { v: 2, t: '有时' },
  { v: 3, t: '经常' }, { v: 4, t: '总是' },
];

function scoreLevel(s) {
  if (s <= 25) return '气机平和';
  if (s <= 50) return '轻微肝郁';
  if (s <= 75) return '轻度肝郁';
  return '中度肝郁';
}
function scoreInterpret(s) {
  if (s <= 25) return '气机调畅，状态不错～继续保持规律作息和心情舒畅。';
  if (s <= 50) return '有轻微肝郁迹象，偶尔的情绪波动很常见，可以试试太冲穴按揉和玫瑰花茶。';
  if (s <= 75) return '轻度肝郁，建议每天八段锦或散步 30 分钟，配合膻中穴按揉疏通气机。';
  return '肝郁较明显，建议优先调整作息、减少熬夜；如胸闷、胁痛持续，请到中医科或心理科就诊。';
}
function scoreColor(s) {
  if (s <= 25) return 'var(--success)';
  if (s <= 50) return 'var(--primary)';
  if (s <= 75) return 'var(--accent)';
  return 'var(--warn)';
}

let scoreAnswers = null;

function openScoreSurvey() {
  if (!getToken()) { toast('登录后才能测评哦', 'warn'); return; }
  scoreAnswers = {};
  renderScoreSurvey();
}
function scorePick(k, v) {
  scoreAnswers[k] = v;
  // 记录滚动位置，避免局部更新后浏览器跳回顶部
  const scoreBody = document.querySelector('.score-body');
  const modalBox = document.getElementById('modalBox');
  const stBody = scoreBody ? scoreBody.scrollTop : 0;
  const stBox = modalBox ? modalBox.scrollTop : 0;
  // 局部更新，避免重建整个模态框导致滚动跳回顶部
  const answered = Object.keys(scoreAnswers).length;
  const allDone = answered === SCORE_QUESTIONS.length;
  const qWrap = document.querySelector(`.score-q[data-q="${k}"]`);
  if (qWrap) {
    qWrap.querySelectorAll('.score-opt').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.v) === v);
    });
  }
  const bar = document.getElementById('scoreBar');
  if (bar) bar.style.width = Math.round(answered / SCORE_QUESTIONS.length * 100) + '%';
  const cnt = document.getElementById('scoreCount');
  if (cnt) cnt.textContent = answered;
  const btn = document.getElementById('scoreSubmitBtn');
  if (btn) {
    btn.disabled = !allDone;
    btn.textContent = allDone ? '查看结果' : `还有 ${SCORE_QUESTIONS.length - answered} 题`;
  }
  // 恢复滚动位置
  if (scoreBody) scoreBody.scrollTop = stBody;
  if (modalBox) modalBox.scrollTop = stBox;
}

function renderScoreSurvey() {
  const answered = Object.keys(scoreAnswers).length;
  const allDone = answered === SCORE_QUESTIONS.length;
  const rows = SCORE_QUESTIONS.map((q, i) => {
    const v = scoreAnswers[q.k];
    const opts = SCORE_OPTIONS.map(o =>
      `<button type="button" class="score-opt ${v === o.v ? 'active' : ''}" data-v="${o.v}" onclick="scorePick('${q.k}',${o.v})">${o.t}</button>`
    ).join('');
    return `
      <div class="score-q" data-q="${q.k}">
        <div class="score-qt"><span class="score-idx">${i + 1}</span>${escapeHtml(q.t)}</div>
        <div class="score-opts">${opts}</div>
      </div>`;
  }).join('');
  openModal(`
    <div class="sv-modal">
      <div class="sv-head">
        <h3>肝郁指数测评</h3>
        <button class="pd-close" onclick="closeModal()" aria-label="关闭">✕</button>
      </div>
      <div class="sv-progress"><div class="sv-bar" id="scoreBar" style="width:${Math.round(answered / SCORE_QUESTIONS.length * 100)}%"></div></div>
      <div style="font-size:13px;color:var(--text-light);margin:10px 0 6px;">请根据最近两周的真实感受选择，共 ${SCORE_QUESTIONS.length} 题，已完成 <span id="scoreCount">${answered}</span> 题</div>
      <div class="sv-body score-body">${rows}</div>
      <div class="sv-foot">
        <button type="button" class="btn btn-outline" style="flex:1;" onclick="closeModal()">取消</button>
        <button type="button" class="btn btn-primary" style="flex:1.4;" id="scoreSubmitBtn" onclick="scoreSubmit()" ${allDone ? '' : 'disabled'}>${allDone ? '查看结果' : `还有 ${SCORE_QUESTIONS.length - answered} 题`}</button>
      </div>
    </div>`);
}

async function scoreSubmit() {
  const sum = Object.values(scoreAnswers).reduce((a, b) => a + b, 0);
  const score = Math.round(sum / (SCORE_QUESTIONS.length * 4) * 100);
  const level = scoreLevel(score);
  const color = scoreColor(score);
  const interp = scoreInterpret(score);

  openModal(`
    <div class="sv-modal">
      <div class="sv-head">
        <h3>测评结果</h3>
        <button class="pd-close" onclick="closeModal()" aria-label="关闭">✕</button>
      </div>
      <div class="score-result">
        <div class="score-ring" style="color:${color};border-color:${color};">
          <div class="score-num">${score}</div>
          <div class="score-sub">肝郁指数</div>
        </div>
        <div class="score-level" style="color:${color};">${escapeHtml(level)}</div>
        <div class="score-interp">${escapeHtml(interp)}</div>
      </div>
      <div class="sv-foot">
        <button type="button" class="btn btn-outline" style="flex:1;" onclick="openScoreSurvey()">重新测评</button>
        <button type="button" class="btn btn-primary" style="flex:1.4;" id="scoreSaveBtn" onclick="scoreSave(${score})">保存到档案</button>
      </div>
    </div>`);
}

async function scoreSave(score) {
  const btn = document.getElementById('scoreSaveBtn');
  btn.disabled = true;
  btn.textContent = '保存中…';
  const level = scoreLevel(score);
  const res = await fetchAPI('/profile', { method: 'PUT', body: JSON.stringify({ score, level }) });
  if (res.success) {
    closeModal();
    toast('肝郁指数已更新为 ' + score + '（' + level + '）', 'success');
    profileCache = null;
    loadProfile();
  } else {
    btn.disabled = false;
    btn.textContent = '保存到档案';
    toast(res.message || '保存失败，请重试', 'error');
  }
}

async function renderFavList() {
  const el = document.getElementById('favList');
  if (!el) return;
  if (!favLoaded) {
    el.innerHTML = '<div style="color:var(--text-light);font-size:14px;">正在加载收藏…</div>';
    await loadFavs();
  }
  const favs = getFavs();
  if (!favs.length) {
    el.innerHTML = '<div style="color:var(--text-light);font-size:14px;">还没有收藏，去「饮食调理」点亮食谱的收藏吧</div>';
    return;
  }
  el.innerHTML = '<div class="fav-grid">' + favs.map(f => `
    <div class="fav-item">
      <span class="time-tag">${escapeHtml(f.time || '')}</span>
      <div style="font-weight:500;margin:6px 0 2px;">${escapeHtml(f.name)}</div>
      <div style="font-size:13px;color:var(--text-light);">${escapeHtml(f.ingredients || '')}</div>
      <span class="fav-del" onclick="removeFav('${escapeHtml(f.name)}')">移除收藏</span>
    </div>`).join('') + '</div>';
}
async function removeFav(name) {
  if (!getToken()) { toast('登录后才能管理收藏', 'warn'); return; }
  const backup = getFavs().slice();
  favCache = favCache.filter(f => f.name !== name);
  renderFavList();
  const el = document.getElementById('favList');
  try {
    const res = await fetchAPI('/favorites', { method: 'DELETE', body: JSON.stringify({ type: 'recipe', name }) });
    if (!res.success) throw new Error(res.message || '移除失败');
    toast('已移除收藏');
  } catch (e) {
    favCache = backup;
    if (el) renderFavList();
    toast(e.message || '移除失败，请稍后再试', 'error');
  }
}

// 卡片内编辑：点“编辑”把字段变为输入框，点“保存”提交 PUT /profile
// fields: [{ id, key, label }]；key 为 score 时按 0-100 整数校验
async function toggleProfileEdit(btn, fields) {
  if (btn.dataset.editing !== '1') {
    if (!profileCache) await loadProfile();
    fields.forEach((f) => {
      const el = document.getElementById(f.id);
      if (!el) return;
      el.textContent = '';
      const input = document.createElement('input');
      input.id = f.id + 'Input';
      input.className = 'profile-input';
      input.placeholder = f.label || '';
      const v = profileCache ? profileCache[f.key] : '';
      input.value = v === null || v === undefined ? '' : v;
      el.appendChild(input);
    });
    btn.textContent = '保存';
    btn.dataset.editing = '1';
    return;
  }
  const payload = {};
  for (const f of fields) {
    const input = document.getElementById(f.id + 'Input');
    if (!input) return;
    payload[f.key] = input.value.trim();
  }
  if (payload.score !== undefined) {
    const s = Number(payload.score);
    if (!Number.isInteger(s) || s < 0 || s > 100) {
      alert('肝郁指数须为 0-100 的整数');
      return;
    }
    payload.score = s;
  }
  const res = await fetchAPI('/profile', { method: 'PUT', body: JSON.stringify(payload) });
  if (!res.success) {
    alert(res.message || '保存失败，请稍后重试');
    return;
  }
  btn.textContent = '编辑';
  btn.dataset.editing = '0';
  await loadProfile();
  // 昵称变更后同步侧边栏与本地登录信息
  if (payload.name !== undefined && window.currentUser) {
    window.currentUser.name = payload.name;
    localStorage.setItem(USER_KEY, JSON.stringify(window.currentUser));
    document.getElementById('sbUserName').textContent = payload.name;
    applyAvatar('sbAvatar');
  }
}

// ============ 标签切换通用 ============
function initTagRows() {
  document.querySelectorAll('.tag-row').forEach(row => {
    row.querySelectorAll('.tag-chip').forEach(chip => {
      // 已有 onclick 的标签（如穴位分类）不重复绑定高亮以外的逻辑
      if (chip.getAttribute('onclick')) return;
      chip.addEventListener('click', () => {
        row.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  });
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  initTagRows();

  // 侧边栏功能板块 → 抽屉打开
  document.querySelectorAll('.sb-nav a').forEach(a => {
    a.addEventListener('click', () => showPage(a.dataset.page));
  });

  // 登录态持久化：有 token 时自动恢复登录，失效则留在登录页
  if (getToken()) {
    const res = await fetchAPI('/auth/me');
    if (res.success && res.data) {
      window.currentUser = res.data;
      enterApp();
    } else {
      clearLogin();
    }
  }
});

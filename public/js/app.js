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
  home: '首页', care: '居家保健', diet: '饮食推荐', clothing: '穿衣建议',
  rhythm: '生活节律', practice: '功法带练', record: '健康记录',
  mood: '情绪解压',
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
  if (localStorage.getItem('songxu_todo_alert') !== '0') startTodoReminder();
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
  { name: '菊花', emoji: '🌼', effect: '清肝明目 · 泡茶', prompt: 'Dried chrysanthemum flowers in a white ceramic bowl on wooden table, soft natural light, traditional Chinese medicine herb photography',
    nature: '辛、甘、苦，微寒；归肺、肝经', desc: '散风清热、平肝明目、清热解毒；常用于风热感冒、头痛眩晕、目赤肿痛、眼目昏花。', usage: '取3~5朵沸水冲泡代茶，可配枸杞、金银花同饮。' },
  { name: '枸杞', emoji: '🔴', effect: '滋补肝肾 · 日常', prompt: 'Goji berries in a small bamboo basket, bright red dried fruits, warm lighting, traditional Chinese medicine',
    nature: '甘，平；归肝、肾经', desc: '滋补肝肾、益精明目；用于虚劳精亏、腰膝酸痛、眩晕耳鸣、目昏不明。', usage: '每日10~20克，可直接嚼食、泡水或煮粥炖汤。' },
  { name: '红枣', effect: '补中益气 · 食疗', prompt: 'Dried red dates jujube in a ceramic dish, warm lighting, traditional Chinese medicine herb photography',
    nature: '甘，温；归脾、胃、心经', desc: '补中益气、养血安神；用于脾胃虚弱、血虚萎黄、疲乏无力。', usage: '煮粥炖汤或去核泡水，每日3~5枚为宜。' },
  { name: '陈皮', emoji: '🍊', effect: '理气健脾 · 泡茶', prompt: 'Dried tangerine peel chenpi in a ceramic bowl, warm amber lighting, traditional Chinese medicine herb photography',
    nature: '苦、辛，温；归肺、脾经', desc: '理气健脾、燥湿化痰；用于胸脘胀满、食少吐泻、咳嗽痰多。', usage: '泡水、入菜或煲汤时放2~3片，陈久者佳。' },
  { name: '玫瑰花', emoji: '🌹', effect: '疏肝解郁 · 茶饮', prompt: 'Dried rose buds in a white porcelain dish, soft pink color, delicate lighting, traditional Chinese medicine',
    nature: '甘、微苦，温；归肝、脾经', desc: '疏肝解郁、和血止痛；用于肝胃气痛、食少呕恶、月经不调。', usage: '取3~6朵沸水冲泡，可配红枣、蜂蜜。' },
  { name: '黄芪', effect: '补气固表 · 炖汤', prompt: 'Astragalus membranaceus huangqi dried root slices on linen cloth, traditional Chinese medicine, warm natural lighting',
    nature: '甘，微温；归脾、肺经', desc: '补气升阳、固表止汗、利水消肿；用于气虚乏力、食少便溏、自汗浮肿。', usage: '炖汤或煮水，常用10~30克；感冒发热时不宜。' },
  { name: '当归', emoji: '🌿', effect: '补血活血 · 调经', prompt: 'Dried angelica sinensis dong quai slices in a wooden bowl, traditional Chinese medicine, warm lighting',
    nature: '甘、辛，温；归肝、心、脾经', desc: '补血活血、调经止痛、润肠通便；用于血虚萎黄、月经不调、肠燥便秘。', usage: '入药膳炖煮（如当归生姜羊肉汤）；孕期使用请先咨询医师。' },
  { name: '金银花', emoji: '🌼', effect: '清热解毒 · 冲泡', prompt: 'Dried honeysuckle flowers in a glass jar, traditional Chinese medicine, soft natural light, herb photography',
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

// 图鉴图片全部本地化（600x600 WebP，服务器 /img/herbs|food|soups/），缺失时以 emoji 兜底
function pad2(n) { return String(n).padStart(2, '0'); }
// IMG_VER：图片同名覆盖更新后 bump 一次，即可让浏览器绕过 7 天强缓存拉新图
const IMG_VER = '20261007-2';
function herbImg(i) { return 'img/herbs/' + pad2(i) + '.webp?v=' + IMG_VER; }

// 药材图加载完成 → 淡入显示；加载失败 → 替换为 emoji 占位块（load/error 不冒泡，用捕获）
document.addEventListener('load', function (e) {
  if (e.target && e.target.classList && e.target.classList.contains('ha-img')) e.target.classList.add('loaded');
}, true);
document.addEventListener('error', function (e) {
  const t = e.target;
  if (!(t && t.classList)) return;
  if (t.classList.contains('ha-img')) {
    const fb = t.getAttribute('data-fb');
    if (fb) {
      t.outerHTML = '<div class="ha-img-fb" style="height:' + (t.style.height || t.offsetHeight + 'px') + ';">' + fb + '</div>';
    } else {
      t.classList.add('error');
    }
  } else if (t.tagName === 'IMG' && t.src && t.src.indexOf('text_to_image') > -1) {
    // 首页 banner 等远程生成图：服务异常时隐藏，露出容器渐变底色（本地化后再移除本兜底）
    t.style.visibility = 'hidden';
  }
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
      '<img src="' + herbImg(p[0]) + '" alt="' + p[1].name + '" class="ha-img" data-fb="' + (p[1].emoji || '🌿') + '">' +
      '<div class="ha-body"><h5>' + p[1].name + '</h5><div class="ha-tag">' + p[1].effect + '</div></div></div>';
  }).join('');
  const d = new Date();
  const lbl = document.getElementById('herbDailyTag');
  if (lbl) lbl.textContent = '今日精选 · ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  // 3 秒后分批预载全部图鉴图（本地 webp，共约 90 张 3MB），用户打开图鉴时基本已在浏览器缓存
  setTimeout(function () {
    let queue = HERBS_POOL.map(function (h, i) { return herbImg(i); })
      .concat(Object.keys(FOOD_LIB).map(function (n, j) { return 'img/food/' + pad2(j) + '.webp'; }))
      .concat(SOUP_ORDER.map(function (n, k) { return 'img/soups/' + (k + 1) + '.webp'; }));
    const step = function () {
      queue.splice(0, 8).forEach(function (src) { const im = new Image(); im.src = src; });
      if (queue.length) setTimeout(step, 400);
    };
    step();
  }, 3000);
}

// 药膳配图（与 diet.json 汤谱顺序一一对应：1~6）
const SOUP_ORDER = ['人参滋补汤', '健脾山药汤', '当归生姜羊肉汤', '龙眼红枣银耳炖鸡蛋', '白术陈皮粥', '姜汁豆浆'];
function soupIdx(name) { return SOUP_ORDER.indexOf(name) + 1; }
function soupImgHTML(name, fbH, extraStyle) {
  const k = soupIdx(name);
  if (k > 0) return '<img loading="lazy" src="img/soups/' + k + '.webp?v=' + IMG_VER + '" alt="' + name + '" class="ha-img" data-fb="🍲"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>';
  return '<div class="ha-img-fb" style="height:' + fbH + 'px;">🍲</div>';
}
function soupTag(effect) {
  return String(effect || '').replace(/[。；]$/, '').split(/[，,]/)[0] || '调养药膳';
}

// ============ 食材图鉴（红黑榜推荐条目的介绍库，emoji 配图） ============
const FOOD_LIB = {
  '玫瑰花茶': { emoji: '🌹', tag: '疏肝解郁', desc: '玫瑰花性温，善于疏肝解郁、和血止痛，适合情绪紧绷、胸闷叹气时饮用。', tip: '经量偏多者经期少喝。' },
  '陈皮茶': { emoji: '🍊', tag: '理气健脾', desc: '陈皮理气健脾、燥湿化痰，饭后一杯助消化，适合腹胀、食欲不振。', tip: '胃酸过多者宜泡淡一些。' },
  '菊花茶': { emoji: '🌼', tag: '清肝明目', desc: '菊花清肝明目、平抑肝阳，适合用眼多、易烦躁上火的人。', tip: '脾胃虚寒者不宜长期饮用。' },
  '枸杞茶': { emoji: '🔴', tag: '滋补肝肾', desc: '枸杞滋补肝肾、益精明目，适合熬夜多、用眼过度的人。', tip: '感冒发热时暂停饮用。' },
  '茉莉花茶': { emoji: '🌸', tag: '理气开郁', desc: '茉莉花理气开郁、芳香辟秽，花气温润，适合情绪低落、压力大时。', tip: '睡前浓茶影响入睡，宜淡泡。' },
  '荷叶茶': { emoji: '🍃', tag: '清暑祛湿', desc: '荷叶清暑祛湿，夏天或湿重困倦、久坐水肿时合适。', tip: '体瘦气血虚弱者不宜多喝。' },
  '桂花茶': { emoji: '🌾', tag: '温中散寒', desc: '桂花温中散寒、暖胃化痰，秋冬手脚发凉、胃部怕冷的人合适。', tip: '无明显禁忌，适量为宜。' },
  '大麦茶': { emoji: '🌾', tag: '健脾消食', desc: '大麦茶健脾消食、去油解腻，饭后解腻首选，性平和不上火。', tip: '哺乳期不宜大量饮用（传统认为有回乳之说）。' },
  '山药粥': { emoji: '🥔', tag: '健脾益气', desc: '山药健脾益气、补肺固肾，煮粥温和好吸收，适合脾胃虚弱、大便溏稀。', tip: '大便干结者适量。' },
  '小米粥': { emoji: '🥣', tag: '健脾安神', desc: '小米健脾和胃、安神助眠，晚上一碗养胃又安神，老少皆宜。', tip: '无特殊禁忌。' },
  '红枣饭': { emoji: '🍚', tag: '补气养血', desc: '红枣补中益气、养血安神，蒸饭时放几颗自然回甜。', tip: '含糖较高，血糖偏高者控量。' },
  '薏米饭': { emoji: '🍚', tag: '健脾祛湿', desc: '薏苡仁利水渗湿、健脾止泻，适合湿重困倦、舌苔厚腻的人。', tip: '孕妇不宜多食薏米。' },
  '燕麦粥': { emoji: '🥣', tag: '健脾通便', desc: '燕麦健脾益气、富含膳食纤维，早餐耐饿、升糖平缓。', tip: '无特殊禁忌。' },
  '南瓜小米粥': { emoji: '🎃', tag: '和胃暖身', desc: '南瓜补中益气，配小米暖胃安神，秋冬早晨尤其合适。', tip: '无特殊禁忌。' },
  '红豆薏米饭': { emoji: '🫘', tag: '祛湿消肿', desc: '赤小豆配薏米是经典祛湿组合，适合久坐水肿、湿气偏重的人群。', tip: '孕妇不宜多食薏米。' },
  '黑芝麻饭': { emoji: '⚫', tag: '润燥养血', desc: '黑芝麻润燥滑肠、补益精血，适合秋燥便秘、头发干枯。', tip: '大便溏稀者少食。' },
  '菠菜': { emoji: '🥬', tag: '清肝补血', desc: '菠菜清肝热、养血润燥，叶酸与铁质丰富，适合面色差、易烦躁的人。', tip: '肾结石人群建议焯水后食用。' },
  '芹菜': { emoji: '🥬', tag: '清肝平肝', desc: '芹菜清肝热、平肝阳，适合易怒头胀、血压偏高的人群。', tip: '血压偏低者适量。' },
  '西兰花': { emoji: '🥦', tag: '平和滋养', desc: '西兰花维生素C与膳食纤维丰富，性平和，日常蔬菜优选。', tip: '无特殊禁忌。' },
  '胡萝卜': { emoji: '🥕', tag: '健脾明目', desc: '胡萝卜健脾化滞，富含胡萝卜素，用眼多的人合适。', tip: '短期过量食用皮肤会暂时发黄，停食即恢复。' },
  '冬瓜': { emoji: '🥒', tag: '利水祛湿', desc: '冬瓜利水消肿、清热祛湿，适合湿热困重、水肿的人群。', tip: '体质虚寒者不宜常吃生冷冬瓜。' },
  '白萝卜': { emoji: '🥕', tag: '理气消食', desc: '白萝卜下气消食、化痰生津，吃撑腹胀时最合适。', tip: '服人参、党参等补气药时不宜同食（传统认为削弱补力）。' },
  '莲藕': { emoji: '🪷', tag: '生津润燥', desc: '熟藕健脾开胃、生藕清热生津，秋冬吃藕润燥养阴。', tip: '无特殊禁忌。' },
  '苹果': { emoji: '🍎', tag: '平和生津', desc: '苹果生津润肺、健脾开胃，是最平和的水果，每天一个刚好。', tip: '无特殊禁忌。' },
  '橙子': { emoji: '🍊', tag: '生津止渴', desc: '橙子生津止渴、开胃下气，维生素C丰富。', tip: '不宜空腹大量吃酸味水果。' },
  '葡萄': { emoji: '🍇', tag: '补气血', desc: '葡萄补气血、强筋骨，适合疲劳乏力、面色差的人。', tip: '含糖偏高，控量。' },
  '猕猴桃': { emoji: '🥝', tag: '清热生津', desc: '猕猴桃清热生津、助消化，维生素C极高。', tip: '脾胃虚寒、易腹泻者少食。' },
  '雪梨': { emoji: '🍐', tag: '润燥清热', desc: '雪梨润肺清燥、生津止咳，秋燥咽干、干咳时的首选。', tip: '脾胃虚寒易腹泻者少吃生梨，可以炖煮后吃。' },
  '柑橘': { emoji: '🍊', tag: '生津理气', desc: '柑橘生津润肺、理气开胃。', tip: '一天2~3个为宜，多吃易上火、皮肤暂黄。' },
  '香蕉': { emoji: '🍌', tag: '润肠通便', desc: '香蕉清热润肠，适合便秘、熬夜后虚火偏旺的人。', tip: '脾胃虚寒者少食，不宜空腹多吃。' },
  '红枣': { emoji: '🔴', tag: '补气养血', desc: '红枣补中益气、养血安神，可直接吃或煮粥蒸饭。', tip: '含糖较高，血糖偏高者控量。' },
};

// 食材分组：顺序与 FOOD_LIB 键顺序严格一致（图片按索引对应，不可乱序）
const FOOD_GROUPS = [
  { title: '🍵 茶饮', from: 0, to: 8 },
  { title: '🍚 主食粥饭', from: 8, to: 16 },
  { title: '🥬 蔬菜', from: 16, to: 23 },
  { title: '🍎 水果', from: 23, to: 31 },
];

function renderDishGrid() {
  const body = document.getElementById('atlasBody');
  if (!body || atlasTab !== 'dish') return;
  const names = Object.keys(FOOD_LIB);
  body.innerHTML = FOOD_GROUPS.map(function (g) {
    return '<div style="grid-column:1/-1;font-size:15px;font-weight:700;color:var(--text-dark);margin:10px 0 2px;">' + g.title +
      '<span style="font-weight:400;font-size:12px;color:var(--text-light);margin-left:8px;">' + (g.to - g.from) + ' 项</span></div>' +
      names.slice(g.from, g.to).map(function (n) {
        const j = names.indexOf(n);
        const f = FOOD_LIB[n];
        return '<div class="herb-atlas-item" onclick="openFoodDetail(\'' + n + '\')" style="cursor:pointer">' +
          '<img loading="lazy" src="img/food/' + pad2(j) + '.webp?v=' + IMG_VER + '" alt="' + n + '" class="ha-img" data-fb="' + f.emoji + '">' +
          '<div class="ha-body"><h5>' + n + '</h5><div class="ha-tag">' + f.tag + '</div></div></div>';
      }).join('');
  }).join('');
}

function foodDetailImgHTML(name, f, size) {
  const j = Object.keys(FOOD_LIB).indexOf(name);
  if (j < 0) return '<div style="width:' + size + 'px;height:' + size + 'px;margin:0 auto;border-radius:18px;background:var(--card-beige,#f7f1e5);display:flex;align-items:center;justify-content:center;font-size:' + Math.round(size * 0.53) + 'px;box-shadow:0 8px 24px rgba(0,0,0,.08);">' + f.emoji + '</div>';
  return '<img src="img/food/' + pad2(j) + '.webp?v=' + IMG_VER + '" alt="' + name + '" class="ha-img" data-fb="' + f.emoji + '" style="width:' + size + 'px;height:' + size + 'px;border-radius:18px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.10);">';
}

function openFoodDetail(name) {
  const f = FOOD_LIB[name];
  if (!f) return;
  saveAtlasScroll();
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 16px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<span onclick="openHerbAtlas(\'dish\', true)" style="cursor:pointer;color:var(--accent);font-size:14px;font-weight:600;">&larr; 返回图鉴</span>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<div style="text-align:center;margin-bottom:20px;">' +
    foodDetailImgHTML(name, f, 180) +
    '<h3 style="margin:16px 0 8px;">' + name + '</h3>' +
    '<span class="ha-tag" style="display:inline-block;">' + f.tag + '</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:14px;text-align:left;font-size:15px;">' +
    '<div><b>食材介绍</b><p style="color:var(--text-mid);margin-top:4px;">' + f.desc + '</p></div>' +
    (f.tip ? '<div><b>食用提示</b><p style="color:var(--text-mid);margin-top:4px;">' + f.tip + '</p></div>' : '') +
    '</div>' +
    '<p style="margin-top:20px;padding:12px 14px;background:rgba(139,0,0,.06);border-radius:10px;font-size:13px;color:var(--text-mid);">以上内容仅供养生科普参考，不构成医疗建议；体质特殊或正在服药者，请先咨询医师。</p>' +
    '</div>',
    { width: 640 }
  );
}

function herbCardsHTML() {
  return HERBS_POOL.map(function (h, i) {
    return '<div class="herb-atlas-item" onclick="openHerbDetail(' + i + ')" style="cursor:pointer">' +
      '<img loading="lazy" src="' + herbImg(i) + '" alt="' + h.name + '" class="ha-img" data-fb="' + (h.emoji || '🌿') + '">' +
      '<div class="ha-body"><h5>' + h.name + '</h5><div class="ha-tag">' + h.effect + '</div></div></div>';
  }).join('');
}

// ============ 图鉴（中药 / 药膳 双 tab 统一入口） ============
let atlasTab = 'herb';
let atlasScroll = 0; // 图鉴滚动位置：进详情时保存，返回时恢复，避免每次回到顶部
function saveAtlasScroll() {
  const mb = document.querySelector('.modal-box');
  if (mb) atlasScroll = mb.scrollTop;
}
function restoreAtlasScroll() {
  const mb = document.querySelector('.modal-box');
  if (mb) mb.scrollTop = atlasScroll;
}
const ATLAS_TAB_ON = 'flex:1;padding:9px 0;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
const ATLAS_TAB_OFF = 'flex:1;padding:9px 0;border:none;border-radius:999px;background:transparent;color:var(--text-mid);font-size:14px;cursor:pointer;';

async function renderSoupGrid() {
  const items = await fetchSoups();
  const body = document.getElementById('atlasBody');
  if (!body || atlasTab !== 'soup') return; // 用户已切走
  if (!items || !items.length) {
    body.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-light);padding:24px 0;">药膳数据暂时不可用，请稍后再试。</div>';
    return;
  }
  body.innerHTML = items.map(function (s, i) {
    return '<div class="herb-atlas-item" onclick="openSoupDetail(' + i + ')" style="cursor:pointer">' +
      soupImgHTML(s.name, 150) +
      '<div class="ha-body"><h5>' + s.name + '</h5><div class="ha-tag">' + soupTag(s.effect) + '</div></div></div>';
  }).join('');
}

function switchAtlasTab(tab) {
  atlasTab = tab;
  atlasScroll = 0; // 手动切换 tab 是新内容，从顶部开始
  const body = document.getElementById('atlasBody');
  const t1 = document.getElementById('atlasTabHerb');
  const t2 = document.getElementById('atlasTabSoup');
  const t3 = document.getElementById('atlasTabDish');
  if (!body || !t1 || !t2 || !t3) return;
  t1.style.cssText = tab === 'herb' ? ATLAS_TAB_ON : ATLAS_TAB_OFF;
  t2.style.cssText = tab === 'soup' ? ATLAS_TAB_ON : ATLAS_TAB_OFF;
  t3.style.cssText = tab === 'dish' ? ATLAS_TAB_ON : ATLAS_TAB_OFF;
  if (tab === 'herb') {
    body.innerHTML = herbCardsHTML();
  } else if (tab === 'soup') {
    body.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-light);padding:24px 0;">正在加载药膳…</div>';
    renderSoupGrid();
  } else {
    renderDishGrid();
  }
}

function openHerbAtlas(tab, keepScroll) {
  atlasTab = (tab === 'soup' || tab === 'dish') ? tab : 'herb';
  if (!keepScroll) atlasScroll = 0; // 全新打开从顶部开始；从详情返回则恢复原位置
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="margin:-24px -28px 12px;padding:12px 28px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
    '<h3 style="margin:0;">本草图鉴</h3>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<div style="display:flex;gap:8px;background:rgba(0,0,0,.05);border-radius:999px;padding:4px;margin-top:10px;">' +
    '<button id="atlasTabHerb" onclick="switchAtlasTab(\'herb\')">中药</button>' +
    '<button id="atlasTabSoup" onclick="switchAtlasTab(\'soup\')">药膳</button>' +
    '<button id="atlasTabDish" onclick="switchAtlasTab(\'dish\')">食材</button></div>' +
    '</div>' +
    '<p style="color:var(--text-mid);font-size:14px;margin-bottom:20px;">日常调理以「药食同源」为原则，适量为宜；体质特殊或正在服药者，请先咨询医师。</p>' +
    '<div id="atlasBody" class="herb-atlas herb-atlas-modal" style="margin-bottom:0;">' +
    (atlasTab === 'herb' ? herbCardsHTML()
      : atlasTab === 'soup' ? '<div style="grid-column:1/-1;text-align:center;color:var(--text-light);padding:24px 0;">正在加载药膳…</div>'
      : '') +
    '</div>' +
    '</div>',
    { width: 1000 }
  );
  if (atlasTab === 'soup') {
    renderSoupGrid().then(restoreAtlasScroll);
  } else {
    // 等浏览器完成布局后再恢复滚动位置
    requestAnimationFrame(restoreAtlasScroll);
  }
  // 初始化 tab 按钮态
  const t1 = document.getElementById('atlasTabHerb');
  const t2 = document.getElementById('atlasTabSoup');
  const t3 = document.getElementById('atlasTabDish');
  if (t1) t1.style.cssText = atlasTab === 'herb' ? ATLAS_TAB_ON : ATLAS_TAB_OFF;
  if (t2) t2.style.cssText = atlasTab === 'soup' ? ATLAS_TAB_ON : ATLAS_TAB_OFF;
  if (t3) t3.style.cssText = atlasTab === 'dish' ? ATLAS_TAB_ON : ATLAS_TAB_OFF;
}

// 药材详情弹窗（点击药材卡片进入）
function openHerbDetail(idx) {
  const h = HERBS_POOL[idx];
  if (!h) return;
  saveAtlasScroll();
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 16px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<span onclick="openHerbAtlas(\'herb\', true)" style="cursor:pointer;color:var(--accent);font-size:14px;font-weight:600;">&larr; 返回图鉴</span>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<div style="text-align:center;margin-bottom:20px;">' +
    '<img src="' + herbImg(idx) + '" alt="' + h.name + '" class="ha-img" data-fb="' + (h.emoji || '🌿') + '" style="width:220px;height:220px;border-radius:18px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.10);">' +
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

// ============ 家常药膳（饮食推荐页入口，数据与 AI 工具共用 knowledge 库） ============
let soupCache = null;
async function fetchSoups() {
  if (soupCache) return soupCache;
  const res = await fetchAPI('/diet/soups');
  if (res.success && res.data && Array.isArray(res.data.items)) soupCache = res.data.items;
  return soupCache;
}

// 家常药膳入口（饮食推荐页）：统一并入本草图鉴的药膳 tab
function openSoupAtlas() {
  openHerbAtlas('soup');
}

async function openSoupDetail(i) {
  const items = await fetchSoups();
  const s = items && items[i];
  if (!s) return;
  saveAtlasScroll();
  const row = function (label, text) {
    return text ? '<div><b>' + label + '</b><p style="color:var(--text-mid);margin-top:4px;">' + text + '</p></div>' : '';
  };
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 16px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<span onclick="openHerbAtlas(\'soup\', true)" style="cursor:pointer;color:var(--accent);font-size:14px;font-weight:600;">&larr; 返回图鉴</span>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<div style="text-align:center;margin-bottom:20px;">' +
    soupImgHTML(s.name, 220, 'width:220px;height:220px;border-radius:18px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,.10);') +
    '<h3 style="margin:16px 0 8px;">' + s.name + '</h3>' +
    '<span class="tag tag-primary">' + soupTag(s.effect) + '</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:14px;text-align:left;font-size:15px;">' +
    row('功效', String(s.effect || '').replace(/^[^，,]*[，,]/, '')) +
    row('材料', s.ingredients) + row('做法', s.method) + row('适用', s.suitable) +
    row('禁忌', s.contraindication) + row('建议频率', s.frequency) +
    '</div>' +
    '<p style="margin-top:20px;padding:12px 14px;background:rgba(139,0,0,.06);border-radius:10px;font-size:13px;color:var(--text-mid);">' + (s.note || '药膳使用请咨询中医师，孕妇、儿童及慢性病患者遵医嘱。') + '</p>' +
    '</div>',
    { width: 640 }
  );
}

// ============ 节气板块：首页badge + 饮食页banner + 本期节气食方（公开接口，失败时保留静态兜底） ============
let solarTermData = null;

async function renderSolarTerm() {
  try {
    const res = await fetchAPI('/diet/solar-term');
    if (!res.success || !res.data) return;
    solarTermData = res.data;
    const d = solarTermData;
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('homeTermBadge', d.name + '时节 · ' + d.theme);
    set('termBannerSeason', '二十四节气 · ' + d.name);
    set('termBannerTitle', d.theme + ' · ' + d.name + '时令食方');
    set('termBannerDesc', d.principle);
    set('termFoodsTag', d.name);
    const grid = document.getElementById('termFoods');
    if (grid && d.foods && d.foods.length) {
      grid.innerHTML = d.foods.map((f, i) =>
        '<div class="card-beige term-food-card" style="text-align:center;cursor:pointer;" onclick="openSolarFood(' + i + ')">' +
        '<div style="font-size:32px;">' + f.emoji + '</div>' +
        '<div style="font-weight:500;">' + f.name + '</div>' +
        '<div class="term-food-sub" style="font-size:13px;color:var(--text-light);">' + f.tag + '·' + d.name + '时令</div></div>'
      ).join('');
    }
  } catch (e) { /* 接口失败保留页面静态白露兜底 */ }
}

function openSolarFood(i) {
  if (!solarTermData || !solarTermData.foods || !solarTermData.foods[i]) return;
  const d = solarTermData;
  const f = d.foods[i];
  const row = function (label, text) {
    return text ? '<div><b>' + label + '</b><p style="color:var(--text-mid);margin-top:4px;">' + text + '</p></div>' : '';
  };
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 16px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<span style="color:var(--text-light);font-size:14px;">' + d.name + ' · ' + d.theme + '</span>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    '<div style="text-align:center;margin-bottom:20px;">' +
    '<div style="font-size:56px;line-height:1.2;">' + f.emoji + '</div>' +
    '<h3 style="margin:16px 0 8px;">' + f.name + '</h3>' +
    '<span class="tag tag-primary">' + f.tag + '</span></div>' +
    '<div style="display:flex;flex-direction:column;gap:14px;text-align:left;font-size:15px;">' +
    row('节气导语', d.tip) + row('功效', f.effect) + row('食材', f.ingredients) + row('做法', f.method) +
    '</div>' +
    '<p style="margin-top:20px;padding:12px 14px;background:rgba(139,0,0,.06);border-radius:10px;font-size:13px;color:var(--text-mid);">食方为节气养生科普参考，体质特殊或有基础疾病者请遵医嘱。</p>' +
    '</div>',
    { width: 640 }
  );
}

// 首页天气/场景提醒：失败后 2 秒重试一次（避开后端重启窗口，防止静态默认文案假退化）
async function fetchClothingWithRetry() {
  const first = await fetchAPI('/clothing').catch(() => null);
  if (first) return first;
  await new Promise(res => setTimeout(res, 2000));
  return fetchAPI('/clothing').catch(() => null);
}

async function loadHomeData() {
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const [dash, meds, acuDay, clothing] = await Promise.all([
    fetchAPI('/health/dashboard').catch(() => null),
    fetchAPI('/record/medicines').catch(() => null),
    fetchAPI('/care/acupoint-of-day').catch(() => null),
    fetchClothingWithRetry(),
  ]);
  if (dash && dash.success && dash.data) {
    const d = dash.data;
    const unassessed = d.score == null;
    const hs = document.getElementById('homeScore');
    if (hs) {
      hs.textContent = unassessed ? '未测' : d.score;
      hs.onclick = unassessed ? () => openScoreSurvey() : null;
      hs.style.cursor = unassessed ? 'pointer' : '';
      hs.title = unassessed ? '点击开始肝郁指数测评' : '';
    }
    set('homeLevel', d.level || '--');
    set('homeDesc', d.desc || '');
    set('homeWeather', weatherEmoji(d.weather) + ' ' + (d.weather || ''));
    set('homeCity', '\u{1F4CD} ' + (d.city || '--'));
    // AI对话页概览
    set('chScore', d.score == null ? '未测' : d.score);
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
      box.innerHTML = reminders.map((r) =>
        `<div style="font-size:14px;color:var(--text-mid);">${r.icon} ${escapeHtml(r.text)}</div>`
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
  closeModal();
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
  const res = await fetchAPI('/care/footbath', {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
  if (res.success && res.data) {
    const d = res.data;
    openModal(`
      <div class="modal-head">
        <div><div class="modal-title">\u{1F6C3} ${escapeHtml(d.name)} <span class="tag tag-primary">为你推荐</span></div></div>
        <span class="modal-close" onclick="closeModal()">×</span>
      </div>
      <div class="modal-body">
        <div class="cc-row"><span class="cc-label">状态</span><span class="cc-value">${escapeHtml(status)}</span></div>
        <div class="cc-row"><span class="cc-label">配伍</span><span class="cc-value">${escapeHtml(d.herbs)}</span></div>
        <div class="cc-row"><span class="cc-label">水温</span><span class="cc-value">${escapeHtml(d.temp)}</span></div>
        <div class="cc-row"><span class="cc-label">时长</span><span class="cc-value">${escapeHtml(d.duration)}</span></div>
        <div class="modal-tip">经期、皮肤破损、糖尿病周围神经病变者慎用；水温先试后加，泡后头晕不适立即停止。</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-outline" onclick="closeModal()">关闭</button>
        <button class="btn btn-primary" onclick="footbathToTodo('${escapeHtml(d.name)}泡脚','${escapeHtml(d.duration)}')">加入今日待办</button>
      </div>`);
  } else {
    toast(res.message || '配方生成失败，请稍后重试', 'error');
  }
}

// ============ 饮食推荐 ============
// 红黑榜标签渲染：兼容旧字符串数组与新的 {items, topName, topReason, tip} 结构
function renderFoodTags(el, data, cls) {
  if (!el) return;
  const items = Array.isArray(data) ? data.map(f => ({ name: f }))
    : (data && Array.isArray(data.items) ? data.items.map(f => (typeof f === 'string' ? { name: f } : f)) : []);
  let head = '';
  if (data && data.topReason) {
    head = `<div style="font-size:12px;color:var(--accent);margin-bottom:6px;">${escapeHtml(data.topReason)}</div>`;
  }
  const tags = items.map(f => {
    const pickCls = data && data.topName === f.name ? ' top-pick' : '';
    const whyTxt = f.reason ? `<i class="food-why">${escapeHtml(f.reason)}</i>` : '';
    if (FOOD_LIB[f.name]) {
      return `<span class="food-tag ${cls}${pickCls}" style="cursor:pointer;" title="查看介绍" onclick="openFoodDetail('${f.name}')">${escapeHtml(f.name)}${whyTxt}</span>`;
    }
    return `<span class="food-tag ${cls}${pickCls}">${escapeHtml(f.name)}${whyTxt}</span>`;
  }).join('');
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
    fetchSoups().catch(() => null), // 预热药膳库，供餐卡匹配「药膳做法」入口
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
    // 推荐的这一餐若属于药膳食疗库，给出直达做法/禁忌详情的入口
    const soupIdx = soupCache ? soupCache.findIndex(s => s.name === r.name) : -1;
    return `
    <div class="recipe-card">
      <div class="time-tag">${escapeHtml(r.time)}</div>
      <div style="height:110px;background:var(--card-beige);display:flex;align-items:center;justify-content:center;font-size:40px;">${RECIPE_EMOJI[r.time] || '\u{1F372}'}</div>
      <div class="recipe-body">
        <h4>${escapeHtml(r.name)}</h4>
        <div class="ingr">${escapeHtml(r.ingredients)}</div>
        <div class="recipe-bottom">
          ${r.reason ? `<div class="recipe-reason">\u{1F4AC} ${escapeHtml(r.reason)}</div>` : ''}
          <div class="footer">
            <span class="recipe-action ${fav ? 'faved' : ''}" onclick="toggleFav('${escapeHtml(r.time)}','${escapeHtml(r.name)}','${escapeHtml(r.ingredients)}',this)">${fav ? '\u2764 已收藏' : '\u{1F90D} 收藏'}</span>
            ${soupIdx >= 0 ? `<span class="recipe-action" onclick="openSoupDetail(${soupIdx})">\u{1F4D6} 药膳做法</span>` : ''}
            <span class="recipe-action" onclick="showShoppingList()">🧺 购物清单</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
async function shuffleRecipes() {
  if (!recipePoolCache) { loadDietData(); return; }
  // 轮换「今日饮食原则」（避免和当前相同）
  const principleEl = document.getElementById('dietPrinciple');
  if (principleEl && principlePool.length > 1) {
    const current = principleEl.textContent;
    let candidates = principlePool.filter(p => p !== current);
    principleEl.textContent = candidates[Math.floor(Math.random() * candidates.length)];
  }
  // 换一批走后端推荐引擎：排除当前菜，理由照常生成（不再前端随机裸挑）
  const exclude = currentRecipes.map(r => encodeURIComponent(r.time) + ':' + encodeURIComponent(r.name)).join(',');
  try {
    const res = await fetchAPI('/diet/recipes?shuffle=1&salt=' + Date.now() + '&exclude=' + encodeURIComponent(exclude));
    if (res.success && res.data && res.data.items && res.data.items.length) {
      recipePoolCache = res.data.pool || recipePoolCache;
      renderRecipes(res.data.items);
      toast('原则和食谱都换了一批～');
      return;
    }
  } catch (e) { /* 走下方兜底 */ }
  // 接口失败兜底：本地随机换（无理由）
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

// 浏览器精确定位失败时，降级到 IP 粗定位（HTTP 站点下 Chrome 禁用浏览器定位，必须兜底）
async function locateByIpFallback(msg) {
  const tip = document.getElementById('cpTip');
  if (tip && msg) tip.textContent = msg;
  try {
    const res = await fetchAPI('/weather/ip-locate');
    if (res.success && res.data && res.data.adcode) {
      pickCity(res.data.adcode, res.data.city);
      return;
    }
    if (tip) tip.textContent = res.message || '自动定位失败，请直接输入城市名';
  } catch (e) {
    if (tip) tip.textContent = '自动定位失败，请直接输入城市名';
  }
}

// 浏览器精确定位（需用户授权；非 HTTPS / 拒绝授权时自动降级 IP 粗定位）
function locateByBrowser() {
  const tip = document.getElementById('cpTip');
  if (!navigator.geolocation) {
    locateByIpFallback('当前浏览器不支持精确定位，正在用 IP 粗定位…');
    return;
  }
  if (tip) tip.textContent = '正在获取定位，请在浏览器弹窗中点「允许」…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const qs = '/weather/locate?lng=' + pos.coords.longitude + '&lat=' + pos.coords.latitude;
      const res = await fetchAPI(qs);
      if (res.success && res.data && res.data.adcode) {
        pickCity(res.data.adcode, res.data.city);
      } else {
        locateByIpFallback(res.message || '精确定位失败，正在用 IP 粗定位…');
      }
    } catch (e) {
      locateByIpFallback('精确定位失败，正在用 IP 粗定位…');
    }
  }, (err) => {
    locateByIpFallback(err.code === 1
      ? '浏览器定位未授权（HTTP 站点浏览器默认禁止），正在用 IP 粗定位…'
      : '精确定位不可用，正在用 IP 粗定位…');
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
  const tabs = ['sleep', 'exercise'];
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
  window._sleepToday = today || null;
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

// ============ 熬夜补救方案（按当天实际打卡动态生成） ============
function openNightRepair() {
  const today = window._sleepToday;
  let statusRow = '';
  const items = [];
  let title = '🌙 睡眠小建议';
  let foot = '以上建议仅供健康参考，规律作息才是养肝的根本。';

  if (today && today.sleepTime && today.wakeTime) {
    const sm = sleepMinutes(today.sleepTime);
    const wm = sleepMinutes(today.wakeTime);
    let dur = wm - sm;
    if (dur <= 0) dur += 24 * 60;             // 跨零点修正
    const durText = Math.floor(dur / 60) + ' 小时 ' + (dur % 60) + ' 分';
    const late = sm > 24 * 60;                // 过了零点才睡（真熬夜）
    const deep = sm > 25 * 60;                // 凌晨 1 点后
    // 五分类：熬夜 / 熬夜+睡过多 / 睡过长(≥9.5h) / 睡不足(<6.5h) / 作息正常
    const long = dur >= 9.5 * 60;
    const short = dur < 6.5 * 60;
    const kind = late ? (long ? 'lateLong' : 'late') : long ? 'long' : short ? 'short' : 'ok';
    const verdict = {
      late: '昨晚熬了夜，今天好好补一补',
      lateLong: '睡得晚又睡得久，重点是今天把节律拉回来',
      long: '睡得有点多，白天反而容易昏沉乏力',
      short: '睡得偏少，今天温和地补一补',
      ok: '睡眠时长很健康，继续保持',
    }[kind];
    statusRow = `<div style="background:var(--bg,#f7f5f0);border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:14px;color:var(--text-mid);">
      今日 <b style="color:var(--text,#333)">${today.sleepTime}</b> 入睡 · <b style="color:var(--text,#333)">${today.wakeTime}</b> 起床 · 睡了约 <b style="color:var(--primary)">${durText}</b><br>${verdict}
    </div>`;

    if (kind === 'late') {
      title = '🌙 熬夜补救方案';
      foot = '补救只是应急，规律作息才是养肝的根本。以上建议仅供健康参考。';
      items.push(['☀️', '起床后先补水', '一杯温开水，简单拉伸 5 分钟，别立刻刷手机']);
      items.push(['🍚', '早餐吃温热易消化的', '小米粥、山药粥都好，少油炸生冷' + (dur < 6 * 60 ? '；昨晚睡眠不足，今天别空腹' : '')]);
      items.push(['☕', '咖啡因只在上午', '可以来一杯咖啡或淡茶提神，14 点后别再碰，免得晚上又睡不着']);
      items.push(['😴', '午间小憩补回来', '13 点前后睡 20~30 分钟，定个闹钟，超过半小时反而影响晚上入睡']);
      items.push(['🚶', '今天运动降档', '只安排散步、八段锦这类和缓的，别做高强度训练加重身体负担']);
      items.push(['💆', '午休或睡前按揉穴位', '太冲穴（足背第1、2趾间上）2~3 分钟，酸胀为度，疏肝理气']);
      items.push(['🛁', '今晚温水泡脚', '40℃ 左右泡 15 分钟，微微发热即可，睡前 1 小时做']);
      items.push(['🌙', '今晚提前躺下', `比平时提前 30~60 分钟入睡（${deep ? '昨晚过了 1 点，今晚尽量 23 点前' : '今晚争取 23 点前'}），睡前 1 小时放下手机`]);
    } else if (kind === 'lateLong') {
      title = '🔄 节律后移的调整';
      foot = '晚睡又久睡会让节律整体后移，今天的目标不是补觉，而是把入睡点拉回来。以上建议仅供健康参考。';
      items.push(['🌅', '起床后晒晒太阳', '到窗边或户外接触阳光 10 分钟，帮生物钟重新对时']);
      items.push(['⏰', '今天别再补觉', '午憩跳过或闭目养神 15 分钟以内，困意留给今晚']);
      items.push(['🍚', '午餐正常吃', '别因为起得晚就省掉，温热易消化为主']);
      items.push(['🚶', '下午轻度活动', '散步 20 分钟或一组八段锦，别久躺刷手机']);
      items.push(['☕', '咖啡因只在上午', '14 点后别再碰，避免今晚又推迟入睡']);
      items.push(['🛁', '今晚温水泡脚', '40℃ 左右泡 15 分钟，睡前 1 小时做']);
      items.push(['🌙', '今晚 23 点前躺下', '这是把节律拉回来的关键一步，睡前 1 小时放下手机']);
    } else if (kind === 'long') {
      title = '🌅 睡眠过长的调整';
      foot = '睡得多不等于睡得好，把节律拉回来比补觉更重要。以上建议仅供健康参考。';
      items.push(['🌅', '起床后晒晒太阳', '到窗边或户外接触阳光 10 分钟，帮生物钟重新对时']);
      items.push(['⏰', '固定起床时间', '比睡眠总时长更重要的是节律，明天同一闹钟起床']);
      items.push(['🛋️', '白天别赖床久躺', '躺得越久越乏，起来活动，困意留给今晚']);
      items.push(['😴', '午憩跳过或缩短', '今天不建议再补觉，最多闭目养神 15~20 分钟']);
      items.push(['🚶', '轻度运动提神', '散步 20 分钟或做一组八段锦，比咖啡更解昏沉']);
      items.push(['🍵', '下午之后少碰咖啡因', '避免影响今晚入睡，晚上睡前 1 小时放下手机']);
    } else if (kind === 'short') {
      title = '💤 睡眠不足的补救';
      foot = '偶尔一晚没睡够不用焦虑，补对节奏就能缓过来。以上建议仅供健康参考。';
      items.push(['☀️', '起床后先补水', '一杯温开水，简单拉伸 5 分钟再开始一天']);
      items.push(['🍚', '早餐别空腹', '温热易消化的小米粥、鸡蛋都好，给身体供上能量']);
      items.push(['☕', '咖啡因只在上午', '提神可以，但 14 点后别再碰，免得今晚又睡不着']);
      items.push(['😴', '午间小憩 20~30 分钟', '13 点前后最佳，定个闹钟，超过半小时反而头昏']);
      items.push(['🚶', '今天运动降档', '和缓为主，别硬撑高强度训练']);
      items.push(['🌙', '今晚提前躺下', '比平时提前 30~60 分钟入睡，睡前 1 小时放下手机']);
      items.push(['⚠️', '犯困别硬撑', '今天尽量避免长时间开车或高危操作']);
    } else {
      title = '🌿 睡眠状况小结';
      foot = '规律作息是最好的养肝药，偶尔波动也别有心理负担。以上建议仅供健康参考。';
      items.push(['⏰', '固定作息继续保持', '保持同一时间起床，周末浮动尽量不超过 1 小时']);
      items.push(['🌅', '早晨晒晒太阳', '起床后接触阳光，让生物钟更稳定']);
      items.push(['💆', '常规养生别落下', '睡前温水泡脚 15 分钟，或按揉太冲穴 2~3 分钟疏肝理气']);
      items.push(['🧘', '睡前 1 小时静下来', '放下手机，做几组 478 呼吸更容易入睡']);
    }
  } else {
    statusRow = `<div style="background:var(--bg,#f7f5f0);border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:14px;color:var(--text-mid);">
      今天还没有睡眠打卡，<b style="color:var(--text,#333)">在上方打卡后</b>，这里会按你的实际入睡和起床时间生成专属方案。先给你一份通用版：
    </div>`;
    items.push(['☀️', '起床后先补水', '一杯温开水，简单拉伸 5 分钟再开始一天']);
    items.push(['😴', '午间小憩', '13 点前后睡 20~30 分钟，别超过半小时']);
    items.push(['🌙', '今晚 23 点前躺下', '睡前 1 小时放下手机，温水泡脚 15 分钟更好入睡']);
  }

  openModal(`
    <div class="modal-head">
      <div class="modal-title">${title}</div>
      <span class="modal-close" onclick="closeModal()">×</span>
    </div>
    <div class="modal-body" style="padding:20px 24px 24px;">
      ${statusRow}
      ${items.map(it => `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px dashed var(--border);">
          <span style="font-size:20px;line-height:1.2;">${it[0]}</span>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text,#333);">${it[1]}</div>
            <div style="font-size:13px;color:var(--text-mid);margin-top:2px;">${it[2]}</div>
          </div>
        </div>`).join('')}
      <div style="font-size:12px;color:var(--text-light);margin-top:12px;">补救只是应急，规律作息才是养肝的根本。以上建议仅供健康参考。</div>
    </div>
  `);
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

// ============ 情绪急救包：生理性叹息 / 情绪粉碎机 / AI树洞 ============
let sighTimers = [];
function openSighGuide() {
  document.getElementById('sighOverlay').style.display = 'flex';
  const circle = document.getElementById('sighCircle');
  const phase = document.getElementById('sighPhase');
  const count = document.getElementById('sighCount');
  circle.style.transitionDuration = '0.5s';
  circle.style.transform = 'scale(0.85)';
  phase.textContent = '准备…';
  count.textContent = '\u00A0';
  let round = 0;
  const total = 5;
  const step = (fn, ms) => sighTimers.push(setTimeout(fn, ms));
  const runRound = () => {
    round++;
    count.textContent = `第 ${round} / ${total} 轮`;
    phase.textContent = '吸气…';
    circle.style.transitionDuration = '2s';
    circle.style.transform = 'scale(1.12)';
    step(() => { phase.textContent = '再吸一口…'; circle.style.transitionDuration = '1s'; circle.style.transform = 'scale(1.22)'; }, 2000);
    step(() => { phase.textContent = '缓缓呼——'; circle.style.transitionDuration = '8s'; circle.style.transform = 'scale(0.85)'; }, 3000);
    step(() => {
      if (round < total) runRound();
      else { phase.textContent = '完成 ✨ 感觉好点了吗'; count.textContent = '\u00A0'; }
    }, 11000);
  };
  step(runRound, 600);
}
function stopSighGuide() {
  sighTimers.forEach(clearTimeout);
  sighTimers = [];
  document.getElementById('sighOverlay').style.display = 'none';
}

function openShredder() {
  const ov = document.getElementById('shredOverlay');
  ov.style.display = 'flex';
  const ta = document.getElementById('shredInput');
  ta.value = '';
  ta.style.display = '';
  const stage = document.getElementById('shredStage');
  stage.style.display = 'none';
  stage.innerHTML = '';
  delete stage.dataset.done;
  setTimeout(() => ta.focus(), 80);
}
// 粉碎后飘来的安慰语（随机一条）
const SHRED_COMFORTS = [
  '烦恼烦恼，消失喽～',
  '把它留在风里吧，你现在轻多了',
  '碎掉的烦恼，不会再长回来',
  '今天已经辛苦很久了，剩下的明天再说～',
  '你的努力和坚持，一直都值得被认可',
  '呼——都散啦，辛苦你了',
  '这一件，就到这儿为止吧',
];
// ==== 轻量合成音效（Web Audio，无需音频文件；首次用户点击后自动激活） ====
let _sfxCtx = null, _lastPopSfx = 0;
function sfxCtx() {
  if (!_sfxCtx) { try { _sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
  if (_sfxCtx.state === 'suspended') _sfxCtx.resume();
  return _sfxCtx;
}
function sfxPop() { // 泡泡：低频「噗噜」为主 + 极轻低通噪声衬底，圆润不尖锐；连划时 30ms 节流
  const ctx = sfxCtx(); if (!ctx) return;
  const now = performance.now();
  if (now - _lastPopSfx < 30) return;
  _lastPopSfx = now;
  const t = ctx.currentTime;
  // 主音：低频正弦下滑（像水泡破开），软起音避免「咔」
  const o = ctx.createOscillator(), g = ctx.createGain();
  const f = 220 + Math.random() * 120;
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.14, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.12);
  // 衬底：极轻的低通噪声蹭一下（破膜质感，不抢主音）
  const dur = 0.03, buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur | 0), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850;
  const ng = ctx.createGain(); ng.gain.value = 0.045;
  src.connect(lp).connect(ng).connect(ctx.destination); src.start(t);
}
function sfxNote(f) { // 数字舒压格：钢琴音色（泛音列+快起音+自然衰减），柔和电钢质感
  const ctx = sfxCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  // 钢琴音色：基频+2/3次谐波（泛音列）、6ms 快起音、0.9s 自然衰减，3000Hz 低通控亮度
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.linearRampToValueAtTime(0.16, t + 0.006);
  master.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
  master.connect(lp).connect(ctx.destination);
  [[1, 1], [2, 0.32], [3, 0.12]].forEach(([mult, amp]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f * mult;
    g.gain.value = amp;
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.95);
  });
}
function sfxChime() { // 完成：三个上行音，轻轻收尾
  const ctx = sfxCtx(); if (!ctx) return;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const t = ctx.currentTime + i * 0.12;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.36);
  });
}
function sfxBurst() { // 粉碎机：低沉砰一声 + 高频碎裂沙
  const ctx = sfxCtx(); if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.21);
  const dur = 0.22, buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur | 0), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
  const g2 = ctx.createGain(); g2.gain.value = 0.1;
  src.connect(hp).connect(g2).connect(ctx.destination); src.start(t);
}

function shredIt() {
  const ta = document.getElementById('shredInput');
  const stage = document.getElementById('shredStage');
  const text = ta.value.trim();
  if (!text) {
    if (stage.dataset.done === '1') { // 上一次已碎完：回到输入态，方便再写一件
      stage.style.display = 'none';
      stage.innerHTML = '';
      delete stage.dataset.done;
      ta.style.display = '';
      ta.focus();
      toast('写下新的烦心事吧');
    } else {
      toast('先把烦心事写出来，再粉碎它');
    }
    return;
  }
  ta.style.display = 'none';
  stage.style.display = 'block';
  stage.innerHTML = '';
  const chars = [...text];
  const block = document.createElement('div');
  block.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:2px;';
  chars.forEach(ch => {
    const s = document.createElement('span');
    s.textContent = ch;
    s.style.cssText = 'display:inline-block;white-space:pre;will-change:transform;';
    block.appendChild(s);
  });
  stage.appendChild(block);
  // 1) 话从输入框位置挪到屏幕中间
  block.animate(
    [{ transform: 'translateY(110px) scale(0.92)', opacity: '0.4' }, { transform: 'translateY(0) scale(1)', opacity: '1' }],
    { duration: 550, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }
  );
  // 2) 颤抖（幅度越抖越大）
  const kf = [];
  for (let i = 0; i < 14; i++) {
    const a = 1 + (i / 14) * 6;
    kf.push({
      transform: `translate(${((Math.random() * 2 - 1) * a).toFixed(1)}px, ${((Math.random() * 2 - 1) * a).toFixed(1)}px) rotate(${((Math.random() * 2 - 1) * a * 0.35).toFixed(2)}deg)`,
    });
  }
  kf.push({ transform: 'translate(0,0)' });
  setTimeout(() => block.animate(kf, { duration: 950, easing: 'linear' }), 620);
  // 3) 粉碎：文字四散 + 金色粒子迸开
  const shatterAt = 1550;
  setTimeout(() => {
    sfxBurst();
    const sr = stage.getBoundingClientRect();
    const PCOLORS = ['#D4A017', '#F5EFE4', '#C4651F'];
    block.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 170 });
    [...block.children].forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const x = r.left - sr.left + r.width / 2, y = r.top - sr.top + r.height / 2;
      s.animate(
        [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${((Math.random() - 0.5) * 260).toFixed(0)}px, ${(((Math.random() - 0.5) * 200) - 30).toFixed(0)}px) rotate(${((Math.random() * 440 - 220) | 0)}deg) scale(0.3)`, opacity: 0 }],
        { duration: 680, delay: i * 10, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'forwards' }
      );
      if (i * 6 > 160) return; // 粒子总量兜底，长文本不卡顿
      for (let p = 0; p < 6; p++) {
        const d = document.createElement('span');
        const sz = (2 + Math.random() * 3).toFixed(1);
        d.style.cssText = `position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${PCOLORS[(Math.random() * 3) | 0]};pointer-events:none;box-shadow:0 0 6px rgba(212,160,23,.5);`;
        stage.appendChild(d);
        const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 110;
        d.animate(
          [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${(Math.cos(ang) * dist).toFixed(0)}px, ${(Math.sin(ang) * dist + 26).toFixed(0)}px)`, opacity: 0 }],
          { duration: 620 + Math.random() * 480, easing: 'cubic-bezier(.2,.7,.4,1)' }
        ).onfinish = () => d.remove();
      }
    });
  }, shatterAt);
  // 4) 粒子渐散时，安慰语飘来
  const comfortAt = shatterAt + 780 + Math.min(chars.length * 8, 380);
  setTimeout(() => {
    const msg = SHRED_COMFORTS[(Math.random() * SHRED_COMFORTS.length) | 0];
    const c = document.createElement('div');
    c.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;';
    c.innerHTML = `<div style="font-size:19px;font-weight:500;color:#F5EFE4;letter-spacing:1px;">${msg}</div><div style="font-size:12px;color:rgba(245,239,228,0.55);">还想碎下一件？再点一次「粉碎它」 · 或点「先不说了」轻轻回去</div>`;
    stage.appendChild(c);
    c.animate(
      [{ opacity: 0, transform: 'translateY(26px) scale(0.94)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' }],
      { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' }
    );
    stage.dataset.done = '1';
    ta.value = ''; // 清空旧内容，再点「粉碎它」时回到输入态写下一件
  }, comfortAt);
}
function stopShredder() {
  document.getElementById('shredOverlay').style.display = 'none';
  const stage = document.getElementById('shredStage');
  stage.style.display = 'none';
  stage.innerHTML = '';
  delete stage.dataset.done;
  const ta = document.getElementById('shredInput');
  ta.value = '';
  ta.style.display = '';
}

// 情绪急救包「低落了」：跳 AI 树洞，自动发出吐槽开场
function aiVent() {
  showPage('chat');
  const input = document.getElementById('chatInput');
  if (!input) return;
  if (input.value.trim()) return; // 用户在打字就不打扰
  input.value = '我现在情绪很差，想找个树洞吐吐槽。先别急着给建议，接住我的情绪听我说就好。';
  sendMessage();
}

// 解压一刻 AI 互动游戏：复用对话流，开场白带完整游戏规则
const AI_GAME_OPENERS = {
  guess: '我们来玩「情绪猜猜猜」：我心里藏着一件最近让我不舒服的事或一种情绪。请你扮演猜心师，每次只问我一个二选一的小问题（比如“这件事更多跟人有关，还是跟事有关？”），根据我的回答逐步收窄，最多问 5 个问题，然后给出你的猜测：我在烦什么、现在是什么情绪，并用一两句话安慰我。规则：一次只问一个问题，语气轻松像朋友猜心，不要同时给建议。开始吧，先问第一个问题。',
  theater: '我们来玩「减压小剧场」：请给我生成一个治愈放松的小情境（山间茶馆、雨夜小屋、海边清晨等，随机选一个），先用两三句描述画面，然后给我 2-3 个选项让我选。我选之后你继续推进剧情，每次 1-2 句描述 + 新选项，玩 5-6 轮后把我带到一个特别放松的结局（比如泡好一壶茶、看完一场日落），结尾用一句话总结这次小旅行。语气温柔、画面感强，每次回复保持短小。开始吧。',
  story: '我们来玩「故事接龙」：规则是我说一句、你接一句，共建一个温暖治愈的小故事，每人每次只说一句话，一共接 10 轮。你来开个头（设定一个轻松的开场，比如“清晨的古镇，一只橘猫跳上了屋顶”），然后等我接。记住：你每次只说一句，别把故事讲完，把空间留给我。',
  praise: '现在你是「夸夸解忧机」：接下来我说的每一件烦心事，你都用幽默脱口秀的角度帮我「歪解」——找到它好笑、荒诞或可以自嘲的一面，逗我笑，最后再用一句话真诚地夸夸我。每次回复控制在 3 句话以内，语气俏皮但温暖，不讲大道理。准备好了就回我一句开场白，然后等我来吐槽。',
};
function aiGame(key) {
  showPage('chat');
  const input = document.getElementById('chatInput');
  if (!input) return;
  if (input.value.trim()) return; // 用户在打字就不打扰
  input.value = AI_GAME_OPENERS[key] || '';
  if (input.value) sendMessage();
}

// ============ 解压一刻：捏泡泡纸 / 舒尔特方格 / 烦恼刮刮乐 / 涂鸦减压板 ============
let schulteTimer = null;
let currentGameKey = '';
const GAME_GUIDE = {
  bubble: '按住鼠标拖动，划过的泡泡会「啵」地破掉，连划可以一次破一串。49 个全破完，会浮现一幅放晴的小画，算一局完成。没有计时、没有失败，慢慢戳、慢慢松。',
  schulte: '格子从 1 开始按顺序点。每个格子是一个音符，点对了会发声并自动进入下一个。引导模式下，下一个该点的格子会微微加深放大，方便跟弹。整首点完会自动回放一遍，可按进度条重播或换下一首。点右上「引导」可关掉提示。',
  scratch: '灰色涂层下面藏着一句安慰话。用鼠标在涂层上划动，被划到的地方会变透明、露出下面的字（轻点一下涂层也能切到擦除模式，再点一下取消）。擦到一定比例会自动全部显出来，并响起一小段提示音。',
  doodle: '一块大画布，10 种颜色，按住鼠标就能画线条。画笔停不下来？松开鼠标就停。全屏模式下也能换颜色。没有题目、没有评判，想画什么画什么，画完清空再来一张也行。',
  piano: '8 个白键对应键盘 A S D F G H J K（屏幕上也会标字母和简谱数字）。按下按键就响一个钢琴音。上方可以选一首曲子，会显示对应简谱和每个音该按的键，点「试听」让 AI 弹一遍，然后自己跟着弹。'
};
function openGame(key) {
  const titles = { bubble: '\u{1FAE7} 捏泡泡纸', schulte: '\u26A1 数字舒压格', scratch: '\u{1F3F1} 烦恼刮刮乐', doodle: '\u{1F3A8} 涂鸦减压板', piano: '\u{1F3B9} 自由弹琴' };
  document.getElementById('gameTitle').textContent = titles[key] || '解压一刻';
  document.getElementById('gameOverlay').style.display = 'flex';
  const box = document.getElementById('gameBody');
  box.innerHTML = '';
  currentGameKey = key;
  const gBtn = document.getElementById('gameGuideBtn');
  if (gBtn) gBtn.style.display = GAME_GUIDE[key] ? 'inline-block' : 'none';
  if (key === 'bubble') gameBubble(box);
  else if (key === 'schulte') gameSchulte(box);
  else if (key === 'scratch') gameScratch(box);
  else if (key === 'doodle') gameDoodle(box);
  else if (key === 'piano') gamePiano(box);
}
function closeGame() {
  if (schulteTimer) { clearInterval(schulteTimer); schulteTimer = null; }
  document.getElementById('gameBody').innerHTML = '';
  document.getElementById('gameOverlay').style.display = 'none';
  const gBtn = document.getElementById('gameGuideBtn');
  if (gBtn) gBtn.style.display = 'none';
  const gModal = document.getElementById('gameGuideModal');
  if (gModal) gModal.style.display = 'none';
  currentGameKey = '';
}
function showGameGuide() {
  const txt = GAME_GUIDE[currentGameKey];
  if (!txt) return;
  const el = document.getElementById('gameGuideText');
  if (el) el.textContent = txt;
  const m = document.getElementById('gameGuideModal');
  if (m) m.style.display = 'flex';
}

// 1) 捏泡泡纸：每破一个冒鼓励小字；全破后浮现放晴小画
const BUBBLE_CHEERS = ['啵～好爽', '压力-1', '烦恼-1', '继续继续', '很解压吧', '呼，松了', '干得漂亮', '就这么戳', '气都散了', '顺气了', '痛快！', '又少一烦'];

// 捏泡泡完成页：按 节日 > 天气 > 季节 匹配场景图与邀约文案（每场景多条文案随机，避免重复）
const BUBBLE_HOLIDAYS = [
  { from: [12, 20], to: [12, 26], img: 'christmas', texts: ['圣诞快到啦，一起去看灯吧~', '听说圣诞的灯会很好看，一起去吧~', '想在圣诞树下许个愿，你陪我吗~'] },
  { from: [12, 30], to: [1, 2], img: 'festival', texts: ['新的一年开始，一起出去走走吧~', '新年第一天，一起去晒晒太阳吧~', '新的一年，第一站想和你一起去~'] },
  { from: [2, 10], to: [2, 20], img: 'festival', texts: ['过年啦，一起去逛逛灯会吧~', '年味正浓，一起去热闹热闹吧~', '春节的庙会，一起去看看呀~'] },
  { from: [5, 1], to: [5, 5], img: 'festival', texts: ['小长假，一起出去走走吧~', '难得的假期，一起去透透气吧~', '五一的阳光正好，出去走走呀~'] },
  { from: [10, 1], to: [10, 7], img: 'festival', texts: ['国庆啦，一起去看看秋天吧~', '假期模式开启，一起去逛逛吧~', '十一长假，找个好地方走走呀~'] },
];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function bubbleScene(weather) {
  const now = new Date();
  const m = now.getMonth() + 1, d = now.getDate();
  const inRange = (f, t) => (f[0] === t[0]) ? (m === f[0] && d >= f[1] && d <= t[1]) : ((m === f[0] && d >= f[1]) || (m === t[0] && d <= t[1]));
  for (const h of BUBBLE_HOLIDAYS) {
    if (inRange(h.from, h.to)) return { img: 'scene/' + h.img + '.jpg', text: pick(h.texts) };
  }
  const wt = weather && weather.weatherText || '';
  const t = weather && weather.temp != null ? parseFloat(weather.temp) : NaN;
  const temp = isNaN(t) ? null : t;
  if (/雪/.test(wt)) return { img: 'scene/snow.jpg', text: pick(['下雪啦，我们一起去踩雪吧~', '外面飘雪了，一起去看雪吧~', '雪天的世界好安静，一起去走走吧~']) };
  if (/雨/.test(wt)) return { img: 'scene/rain.jpg', text: pick(['下雨天，一起窝在窗边喝杯热茶吧~', '雨声很治愈，一起听听雨吧~', '下雨了，一起喝杯热茶暖暖吧~']) };
  if (/晴|多云/.test(wt) && temp !== null && temp >= 20) return { img: 'scene/sea.jpg', text: pick(['天气正好，有时间我们一起去海边吧~', '这么好的天气，适合去海边吹吹风~', '阳光暖暖，一起去看海吧~']) };
  if (m === 3 || m === 4) return { img: 'scene/sakura.jpg', text: pick(['花都开好了，一起去看樱花吧~', '樱花季到了，错过要等明年啦~', '春风正好，一起去赏花吧~']) };
  if (m >= 9 && m <= 11) return { img: 'scene/leaves.jpg', text: pick(['秋天到了，我们一起去看落叶吧~', '银杏黄了，一起去踩落叶吧~', '秋天的颜色最美了，一起去看看吧~']) };
  if (m === 12 || m <= 2) return { img: 'scene/snow.jpg', text: pick(['冬天啦，一起去看雪吧~', '冬天适合找个暖和的地方待着，一起吗~', '等一场雪，一起去看吧~']) };
  return { img: 'scene/sea.jpg', text: pick(['有时间我们一起去海边吧~', '想去看海了，一起吗~']) };
}
let bubbleWeatherCache = null;
let lastBubbleImg = '';
async function loadBubbleWeather() {
  if (bubbleWeatherCache) return bubbleWeatherCache;
  try {
    const r = await fetch('/api/clothing');
    const j = await r.json();
    bubbleWeatherCache = (j && j.data) || null;
  } catch (_) { bubbleWeatherCache = null; }
  return bubbleWeatherCache;
}
// 通用励志图：避开上次出现的那张
function genericBubblePick() {
  let src;
  do {
    src = 'img/scratch/s' + (1 + Math.floor(Math.random() * 11)) + '.jpg';
  } while (src === lastBubbleImg);
  return {
    src, fit: 'contain',
    text: pick(['烦恼全戳破啦 · 心情放晴', '破完啦，给自己点个赞吧~', '压力戳光光，今天也要开心呀~', '啵啵啵，烦恼都跑掉了~']),
  };
}
// 完成页选图：场景/通用随机；若与上次相同则换另一类，保证不重复
async function pickBubbleDone() {
  if (Math.random() < 0.5) {
    const w = await loadBubbleWeather();
    const sc = bubbleScene(w);
    const src = 'img/' + sc.img;
    if (src === lastBubbleImg) return genericBubblePick();
    return { src, fit: 'cover', text: sc.text };
  }
  return genericBubblePick();
}

function gameBubble(box) {
  const imgIdx = 1 + Math.floor(Math.random() * 11);
  box.innerHTML = `
    <div style="font-size:13px;color:var(--text-mid);margin:6px auto 14px;text-align:center;">按住划过，连着破 · 剩 <b id="bubbleLeft">49</b> 个</div>
    <div id="bubbleDoneText" style="display:none;font-size:17px;font-weight:600;color:var(--text-dark);text-align:center;margin-bottom:12px;"></div>
    <div id="bubbleWrap" style="position:relative;max-width:440px;margin:0 auto;">
      <div id="bubbleGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:10px;touch-action:none;user-select:none;"></div>
      <div id="bubbleReveal" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;border-radius:16px;background:linear-gradient(180deg,#FDF6E9,#F5E9D2);opacity:0;transition:opacity .8s ease;overflow:hidden;">
        <img src="img/scratch/s${imgIdx}.jpg" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:16px;">
      </div>
    </div>
    <div id="bubbleDoneWrap" style="display:none;justify-content:center;margin-top:12px;">
      <button class="btn btn-primary btn-sm" id="bubbleAgain">再捏一张</button>
    </div>`;
  const grid = box.querySelector('#bubbleGrid');
  const wrap = box.querySelector('#bubbleWrap');
  const reveal = box.querySelector('#bubbleReveal');
  const leftEl = box.querySelector('#bubbleLeft');
  let left = 49;
  const build = () => {
    left = 49; leftEl.textContent = left;
    reveal.style.display = 'none';
    reveal.style.opacity = '0';
    reveal.style.position = 'absolute';
    reveal.style.aspectRatio = '';
    grid.style.display = 'grid';
    box.querySelector('#bubbleDoneText').style.display = 'none';
    box.querySelector('#bubbleDoneWrap').style.display = 'none';
    grid.innerHTML = '';
    for (let i = 0; i < 49; i++) {
      const b = document.createElement('div');
      b.style.cssText = 'aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 32% 30%,rgba(255,255,255,.95),#EFE6D4 45%,#D3C09D);box-shadow:inset -2px -3px 6px rgba(0,0,0,0.06);cursor:pointer;transition:transform .12s ease;';
      b.dataset.alive = '1';
      grid.appendChild(b);
    }
  };
  const pop = (b) => {
    if (!b || b.dataset.alive !== '1' || b.parentElement !== grid) return;
    b.dataset.alive = '0';
    sfxPop();
    b.style.background = 'var(--card-beige)';
    b.style.boxShadow = 'inset 2px 3px 8px rgba(0,0,0,0.08)';
    b.style.transform = 'scale(0.82)';
    leftEl.textContent = --left;
    // 冒鼓励小字：从泡泡位置上浮消散
    const tip = document.createElement('span');
    tip.textContent = BUBBLE_CHEERS[Math.floor(Math.random() * BUBBLE_CHEERS.length)];
    tip.style.cssText = 'position:absolute;font-size:13px;font-weight:600;color:var(--primary);pointer-events:none;white-space:nowrap;z-index:5;';
    tip.style.left = (b.offsetLeft + b.offsetWidth / 2 - 24) + 'px';
    tip.style.top = b.offsetTop + 'px';
    wrap.appendChild(tip);
    tip.animate([
      { transform: 'translateY(0)', opacity: 1 },
      { transform: 'translateY(-26px)', opacity: 0 },
    ], { duration: 900, easing: 'ease-out' }).onfinish = () => tip.remove();
    // 全破：隐藏网格，图片放大为 4:3 满宽；图片与文案保证和上次不同
    if (left === 0) {
      sfxChime();
      pickBubbleDone().then(p => {
        lastBubbleImg = p.src;
        const im = reveal.querySelector('img');
        im.src = p.src;
        im.style.objectFit = p.fit;
        const dt = box.querySelector('#bubbleDoneText');
        dt.textContent = p.text;
        dt.style.display = 'block';
      });
      setTimeout(() => {
        grid.style.display = 'none';
        reveal.style.position = 'relative';
        reveal.style.aspectRatio = '4 / 3';
        reveal.style.display = 'flex';
        requestAnimationFrame(() => { reveal.style.opacity = '1'; });
        box.querySelector('#bubbleDoneWrap').style.display = 'flex';
      }, 500);
    }
  };
  grid.addEventListener('click', (e) => pop(e.target));
  // 按住拖动：划过的泡泡连着破；指针锁定后划出网格再回来继续破，松开左键才停
  let dragging = false, lastPos = null;
  grid.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastPos = { x: e.clientX, y: e.clientY };
    try { grid.setPointerCapture(e.pointerId); } catch (_) {}
    pop(e.target);
  });
  grid.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // 两点间距大时按 ~18px 步长插值补采样，快速连划不漏泡
    const from = lastPos, to = { x: e.clientX, y: e.clientY };
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 18));
    for (let i = 1; i <= steps; i++) {
      const el = document.elementFromPoint(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
      if (el && el.parentElement === grid) pop(el);
    }
    lastPos = to;
  });
  ['pointerup', 'pointercancel'].forEach(ev => grid.addEventListener(ev, () => { dragging = false; lastPos = null; }));
  box.querySelector('#bubbleAgain').addEventListener('click', () => {
    reveal.querySelector('img').src = 'img/scratch/s' + (1 + Math.floor(Math.random() * 11)) + '.jpg';
    build();
  });
  build();
}

// 2) 舒尔特方格：1→25 按顺序点，注意力强制转移
function gameSchulte(box) {
  // 音符版：每局一首小曲，格子数 = 节拍数，按顺序点 = 弹出整首曲子
  // 完成后出现播放条（重播/暂停/点进度跳拍）；底部「重玩」= 同曲洗牌，「下一首」= 换关
  const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00 };
  const MELODIES = [ // 完整版曲谱：「音名:拍数」（默认 1 拍，2=二拍长音，.5=半拍），beat = 一拍毫秒
    { name: '小星星', beat: 400, notes: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
    { name: '两只老虎', beat: 300, notes: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4 A4 G4 F4 E4 C4 G4 A4 G4 F4 E4 C4 C4 G4 C4:2 C4 G4 C4:2' },
    { name: '生日快乐', beat: 420, notes: 'G4:.5 G4:.5 A4 G4 C5 B4:2 G4:.5 G4:.5 A4 G4 D5 C5:2 G4:.5 G4:.5 G5 E5 C5 B4 A4:2 F5:.5 F5:.5 E5 C5 D5 C5:2' },
    { name: '小蜜蜂', beat: 300, notes: 'G4 E4 E4:2 F4 D4 D4:2 C4:.5 D4:.5 E4:.5 F4:.5 G4 G4 G4:2 G4 E4 E4:2 F4 D4 D4:2 C4:.5 E4:.5 G4 G4 E4:2' },
    { name: '欢乐颂', beat: 380, notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2' },
    { name: '粉刷匠', beat: 300, notes: 'G4 E4 G4 E4 G4 E4 C4:2 D4 F4 E4 D4 G4:2 G4 E4 G4 E4 G4 E4 C4:2 D4 F4 E4 D4 C4:2' },
    { name: '铃儿响叮当', beat: 340, notes: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4 D4 E4:3 F4 F4 F4 F4 F4 E4 E4 E4 E4 D4 D4 E4 D4:2' },
    { name: '卡农', beat: 340, notes: 'E5:2 D5:2 C5 B4 A4 G4 A4 B4 C5 B4 A4 G4 A4 G4 E4 F4 F5 G5 A5 G5 F5 E5 D5 C5 B4 C5 D5 C5 B4 A4 G4 F4' },
    { name: '青花瓷', beat: 360, notes: 'E4 G4 A4 C5 A4 G4 E4 D4:2 E4 G4 A4 C5 A4 G4 E4 D4:2 E4 G4 A4 C5 D5 C5 A4 G4 E4 D4 C4:2 C5 A4 G4 E4 D4:2' },
    { name: '康康舞曲', beat: 260, notes: 'C5 C5 C5 C5 F5 F5 E5 E5 D5 D5 D5 D5 G5 G5 F5 E5 D5 C5 D5 E5 F5 E5 D5 C5:2' },
    { name: '婚礼进行曲', beat: 400, notes: 'C5 F5 F5 G5 A5 A5 F5:2 G5 A5 G5 F5 E5:2 C5 F5 F5 G5 A5 A5 F5:2 E5 F5 G5 E5 C5:2' },
    { name: 'Do-Re-Mi', beat: 380, notes: 'C4 D4 E4 C4 E4 C4 E4:2 D4 E4 F4 D4 F4 D4 F4:2 E4 F4 G4 E4 G4 E4 G4:2 G4 A4 B4 G4 B4 G4 B4:2' },
  ].map(m => {
    const notes = m.notes.split(' ').map(s => { const [k, b] = s.split(':'); return { f: NOTE[k], b: b ? parseFloat(b) : 1 }; });
    const cum = []; let acc = 0;
    notes.forEach(n => { cum.push(acc); acc += n.b; }); // 每个音符的起始拍，用于按时值排播
    return { name: m.name, beat: m.beat, notes, cum, total: acc };
  });
  let mi = (Math.random() * MELODIES.length) | 0;
  box.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:6px 0 14px;flex-wrap:wrap;">
      <span style="font-size:14px;color:var(--text-mid);">按顺序点数字，弹出小曲 · 下一个是 <b id="schulteNext" style="font-size:20px;color:var(--primary);">1</b></span>
      <button class="btn btn-outline btn-sm" id="schulteGuide" style="padding:3px 12px;font-size:12px;border-radius:999px;">引导模式：开</button>
    </div>
    <div id="schulteGrid" style="display:grid;gap:9px;margin:0 auto;"></div>
    <div id="schultePlayer" style="display:none;max-width:400px;margin:16px auto 0;padding:10px 14px;border-radius:999px;background:var(--card-beige);align-items:center;gap:10px;">
      <button id="schultePlay" style="width:34px;height:34px;border-radius:50%;border:none;background:var(--primary);color:#fff;font-size:14px;cursor:pointer;flex:none;">▶</button>
      <span id="schulteSong" style="font-size:13px;font-weight:600;color:var(--text-dark);flex:none;"></span>
      <div id="schulteBar" style="flex:1;height:18px;display:flex;align-items:center;cursor:pointer;">
        <div style="width:100%;height:6px;border-radius:999px;background:rgba(107,78,46,.15);overflow:hidden;">
          <div id="schulteFill" style="width:0%;height:100%;background:var(--primary);border-radius:999px;transition:width .28s linear;"></div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;">
      <button class="btn btn-outline btn-sm" id="schulteReplay">🔀 重玩（打乱重排）</button>
      <button class="btn btn-primary btn-sm" id="schulteNextSong">🎵 下一首</button>
    </div>`;
  const grid = box.querySelector('#schulteGrid');
  const nextEl = box.querySelector('#schulteNext');
  const gbtn = box.querySelector('#schulteGuide');
  const playerBox = box.querySelector('#schultePlayer');
  const playBtn = box.querySelector('#schultePlay');
  const songEl = box.querySelector('#schulteSong');
  const bar = box.querySelector('#schulteBar');
  const fill = box.querySelector('#schulteFill');
  let next = 1, guide = true, guideEl = null, cells = {}, melody = MELODIES[mi], N = 0;
  let playTimers = [], playing = false;
  const setGuideHighlight = () => {
    if (guideEl) { guideEl.style.background = 'var(--card-beige)'; guideEl.style.transform = 'scale(1)'; guideEl = null; }
    if (guide && next <= N) {
      const c = cells[next];
      if (c) { guideEl = c; c.style.background = '#E4D3B4'; c.style.transform = 'scale(1.06)'; }
    }
  };
  const stopPlayback = () => {
    playTimers.forEach(clearTimeout); playTimers = [];
    playing = false; playBtn.textContent = '▶';
  };
  const playFrom = (startIdx) => { // 从第 startIdx 个音符起播，按曲谱时值（长音长、半拍短）
    stopPlayback();
    playing = true; playBtn.textContent = '⏸';
    melody.notes.forEach((n, i) => {
      if (i < startIdx) return;
      const delay = (melody.cum[i] - melody.cum[startIdx]) * melody.beat;
      playTimers.push(setTimeout(() => {
        sfxNote(n.f);
        fill.style.width = ((melody.cum[i] + n.b) / melody.total * 100).toFixed(1) + '%';
      }, delay));
    });
    playTimers.push(setTimeout(() => { playing = false; playBtn.textContent = '▶'; }, (melody.total - melody.cum[startIdx]) * melody.beat));
  };
  const build = () => { // 重玩/下一首都走这里：重建格子
    melody = MELODIES[mi]; N = melody.notes.length;
    next = 1; guideEl = null; cells = {};
    stopPlayback();
    fill.style.width = '0%';
    playerBox.style.display = 'none';
    // 选最整齐的行列：优先整除且接近正方形（42→7×6、32→8×4、25→5×5、24→6×4、30→6×5）
    let cols = 0;
    for (let c = Math.ceil(Math.sqrt(N)); c <= Math.ceil(Math.sqrt(N)) + 6; c++) { if (N % c === 0) { cols = c; break; } }
    if (!cols) cols = Math.ceil(Math.sqrt(N));
    const rows = Math.ceil(N / cols);
    grid.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    grid.style.maxWidth = Math.min(cols * 54, 680) + 'px';
    grid.innerHTML = '';
    nextEl.style.fontSize = '20px';
    nextEl.textContent = '1';
    [...Array(N).keys()].map(i => i + 1).sort(() => Math.random() - 0.5).forEach(n => {
      const c = document.createElement('div');
      c.textContent = n;
      c.style.cssText = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:12px;background:var(--card-beige);font-size:18px;font-weight:600;color:var(--text-dark);cursor:pointer;user-select:none;transition:transform .15s ease, background .15s ease;';
      cells[n] = c;
      c.addEventListener('click', () => {
        if (n !== next) return; // 点错：无任何反应
        if (guideEl === c) guideEl = null;
        stopPlayback();
        const note = melody.notes[n - 1];
        sfxNote(note.f);
        fill.style.width = ((melody.cum[n - 1] + note.b) / melody.total * 100).toFixed(1) + '%';
        c.style.background = 'var(--primary)';
        c.style.color = '#fff';
        c.style.cursor = 'default';
        c.style.transform = 'scale(1)';
        next++;
        if (next > N) {
          nextEl.textContent = '✓';
          nextEl.style.fontSize = '16px';
          // 完整弹完：播放条亮出曲名，自动重播一遍，之后可反复重播/拖进度
          songEl.textContent = `《${melody.name}》`;
          playerBox.style.display = 'flex';
          playFrom(0);
          toast(`🎵 你弹出了《${melody.name}》，真好听`);
          return;
        }
        nextEl.textContent = next;
        setGuideHighlight();
      });
      grid.appendChild(c);
    });
    setGuideHighlight();
  };
  gbtn.addEventListener('click', () => {
    guide = !guide;
    gbtn.textContent = guide ? '引导模式：开' : '引导模式：关';
    gbtn.classList.toggle('btn-primary', guide);
    gbtn.classList.toggle('btn-outline', !guide);
    setGuideHighlight();
  });
  playBtn.addEventListener('click', () => { playing ? stopPlayback() : playFrom(0); });
  bar.addEventListener('click', (e) => { // 点进度条任意位置，按节拍定位到对应音符接着播
    const r = bar.getBoundingClientRect();
    const target = Math.min(melody.total - 0.01, Math.max(0, (e.clientX - r.left) / r.width * melody.total));
    let idx = 0;
    for (let i = 0; i < N; i++) { if (melody.cum[i] <= target) idx = i; else break; }
    playFrom(idx);
  });
  box.querySelector('#schulteReplay').addEventListener('click', build); // 同一首，数字重新洗牌
  box.querySelector('#schulteNextSong').addEventListener('click', () => { mi = (mi + 1) % MELODIES.length; build(); }); // 换下一关
  build();
}

// 3) 烦恼刮刮乐：刮开涂层露出温柔句子
const SCRATCH_QUOTES = [
  '情绪不是敌人呀，它只是提醒你：该歇歇啦～',
  '允许自己什么都不想做，一会儿就好啦～',
  '肝喜条达，人也一样——顺一点，松一点嘛～',
  '今天已经很努力了鸭，先吃饭，再说别的～',
  '深呼吸三次，事情没有想的那么急哒～',
  '你不用立刻好起来，慢慢来就好呀～',
  '睡个好觉，比想通更重要哦～',
  '花有花期，人有节奏，不急的呀～',
  '把肩膀放下来嘛，你一直端着呢～',
  '吃口热乎的，胃暖了，心就暖啦～',
  '今天的太阳落了，明天照常升起鸭～',
  '允许一切发生，也允许自己休息一下嘛～',
  '你已经撑了很久了鸭，辛苦啦～',
  '情绪降一档就好，不用一步到晴天哒～',
  '烦的时候，先把手头的事放十秒嘛～',
  '天凉了，记得照顾好自己鸭～',
  '照顾别人之前，先给自己留一点温柔呀～',
  '不用每一次难过都自己消化，说出来就轻了呀～',
  '允许自己不完美，你已经做得非常好啦～',
  '慢慢来就好，你的节奏就是对的。',
  '先吃饭，再睡觉，天大的事明天再说。',
  '事情会一件一件理顺的，急不来。',
  '你不必时刻坚强，累了就说出来。',
  '此刻的不开心，就停在今天吧。',
  '你已经迈出最难的一步了，剩下的交给我。',
  '世界偶尔刻薄，但你值得被温柔以待。',
  '你的努力和坚持，值得被看见。',
];
function gameScratch(box) {
  const quote = SCRATCH_QUOTES[Math.floor(Math.random() * SCRATCH_QUOTES.length)];
  box.innerHTML = `
    <div style="font-size:13px;color:var(--text-mid);margin:6px 0 12px;text-align:center;">用手指刮开涂层，看看今天想对你说什么<br><span style="font-size:11px;color:var(--text-light);">轻点涂层，随时开关擦除模式</span></div>
    <div style="position:relative;max-width:420px;margin:0 auto;min-height:220px;border-radius:16px;background:var(--card-beige);display:flex;align-items:center;justify-content:center;padding:28px;">
      <div style="font-size:17px;color:var(--text-dark);line-height:2;text-align:center;text-wrap:balance;">${quote.replace(/(.)(～)$/, '<span style="white-space:nowrap">$1～</span>')}</div>
      <canvas id="scratchCv" style="position:absolute;inset:0;width:100%;height:100%;border-radius:16px;cursor:crosshair;transition:opacity .6s;"></canvas>
    </div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;">
      <button class="btn btn-outline btn-sm" onclick="openGame('scratch')">再来一张</button>
    </div>`;
  const cv = box.querySelector('#scratchCv');
  const rect = cv.parentElement.getBoundingClientRect();
  cv.width = rect.width; cv.height = rect.height;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#D3C09D';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('刮 我', cv.width / 2, cv.height / 2);
  let down = false, moves = 0, erasing = false, downPos = null;
  const scratch = (x, y) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000'; // destination-out 只看 alpha；用不透明填充，一刮即透（之前残留 0.35 导致要蹭很多遍）
    ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
    if (++moves % 6 === 0) {
      const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let clear = 0, total = 0;
      for (let i = 3; i < img.length; i += 4 * 24) { total++; if (img[i] === 0) clear++; }
      if (clear / total > 0.55) { cv.style.opacity = '0'; cv.style.pointerEvents = 'none'; sfxChime(); }
    }
  };
  const at = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const setErase = on => {
    erasing = on;
    cv.style.cursor = on ? 'cell' : 'crosshair';
    toast(on ? '擦除模式开：划过去就擦，不用按住' : '擦除模式关：按住再刮');
  };
  const stopDraw = () => { down = false; downPos = null; };
  cv.addEventListener('pointerdown', e => {
    down = true; downPos = { x: e.clientX, y: e.clientY };
    const p = at(e); scratch(p.x, p.y);
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cv.addEventListener('pointermove', e => {
    if (!down && !erasing) return;
    const p = at(e); scratch(p.x, p.y);
  });
  cv.addEventListener('pointerup', e => {
    // 轻点涂层（几乎没移动）= 开关擦除模式，不用去点按钮
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 8) setErase(!erasing);
    stopDraw();
  });
  cv.addEventListener('pointercancel', stopDraw);
}

// 4) 涂鸦减压板：随手乱画，可清空/保存
function gameDoodle(box) {
  const COLORS = ['#6B4E2E','#B08968','#C4651F','#D4A017','#7A9B6E','#4E7A6A','#6B7FA3','#8E6B9B','#C47A8E','#3F3B37'];
  box.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin:6px 0 12px;flex-wrap:wrap;">
      ${COLORS.map((c, i) => `<span data-c="${c}" class="doodle-c" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${i === 0 ? 'var(--primary)' : 'transparent'};"></span>`).join('')}
      <span style="flex:1;"></span>
      <button class="btn btn-outline btn-sm" onclick="openGame('doodle')">清空</button>
      <button class="btn btn-outline btn-sm" id="doodleFull">全屏</button>
      <button class="btn btn-primary btn-sm" id="doodleSave">保存图片</button>
    </div>
    <canvas id="doodleCv" style="width:100%;border-radius:16px;background:#fff;touch-action:none;cursor:crosshair;max-width:680px;display:block;margin:0 auto;"></canvas>
    <div style="font-size:12px;color:var(--text-light);margin-top:10px;text-align:center;">说不出的烦，就让线条替你说</div>`;
  const cv = box.querySelector('#doodleCv');
  const ctx = cv.getContext('2d');
  let color = COLORS[0], down = false, last = null;
  const resetCtx = () => { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 4; };
  // 改变画布尺寸并保留已画内容（缩放铺回）
  const resizeCv = (w, h) => {
    if (w < 50 || h < 50) return;
    let snap = null;
    if (cv.width && cv.height) {
      snap = document.createElement('canvas');
      snap.width = cv.width; snap.height = cv.height;
      snap.getContext('2d').drawImage(cv, 0, 0);
    }
    cv.width = w; cv.height = h;
    resetCtx();
    if (snap) ctx.drawImage(snap, 0, 0, w, h);
  };
  const fitCanvas = () => {
    if (box.dataset.full === '1') {
      cv.style.maxWidth = '1200px';
      resizeCv(cv.clientWidth, Math.max(300, window.innerHeight - 120));
    } else {
      cv.style.maxWidth = '680px';
      resizeCv(cv.clientWidth, Math.round(cv.clientWidth * 0.85));
    }
  };
  fitCanvas();
  // 全屏：把整个画板挂到覆盖层，工具栏照常可用；Esc 或按钮退出
  const fullBtn = box.querySelector('#doodleFull');
  const setFull = on => {
    box.dataset.full = on ? '1' : '0';
    let ov = document.getElementById('doodleOverlay');
    if (on) {
      if (!ov) {
        ov = document.createElement('div');
        ov.id = 'doodleOverlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#F5EFE4;padding:14px 16px;overflow:auto;';
        document.body.appendChild(ov);
      }
      box._doodleParent = box.parentNode; box._doodleNext = box.nextSibling;
      ov.appendChild(box);
      document.body.style.overflow = 'hidden';
    } else if (ov) {
      box._doodleParent.insertBefore(box, box._doodleNext);
      ov.remove();
      document.body.style.overflow = '';
    }
    fullBtn.textContent = on ? '退出全屏' : '全屏';
    fitCanvas();
  };
  fullBtn.addEventListener('click', () => setFull(box.dataset.full !== '1'));
  if (!window._doodleEsc) {
    window._doodleEsc = e => {
      if (e.key === 'Escape' && document.getElementById('doodleOverlay')) {
        const cur = document.getElementById('doodleOverlay').firstChild;
        if (cur && cur._doodleParent) {
          cur._doodleParent.insertBefore(cur, cur._doodleNext);
          document.getElementById('doodleOverlay').remove();
          document.body.style.overflow = '';
          cur.dataset.full = '0';
          const b = cur.querySelector('#doodleFull'); if (b) b.textContent = '全屏';
        }
      }
    };
    document.addEventListener('keydown', window._doodleEsc);
  }
  box.querySelectorAll('.doodle-c').forEach(dot => dot.addEventListener('click', () => {
    color = dot.dataset.c;
    box.querySelectorAll('.doodle-c').forEach(d => d.style.border = '3px solid transparent');
    dot.style.border = '3px solid var(--primary)';
  }));
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  const stopDraw = () => { down = false; last = null; };
  cv.addEventListener('pointerdown', e => {
    down = true; last = pos(e);
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cv.addEventListener('pointermove', e => {
    if (!down || !last) return;
    const p = pos(e);
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  cv.addEventListener('pointerup', stopDraw);
  cv.addEventListener('pointercancel', stopDraw);
  box.querySelector('#doodleSave').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'breezith-doodle.png';
    a.href = cv.toDataURL('image/png');
    a.click();
    toast('已保存涂鸦');
  });
}
// 5) 自由弹琴：音高/按键可自定义，多首曲谱
function gamePiano(box) {
  const ALL_NOTES = [
    {note:'C4',f:261.63},{note:'D4',f:293.66},{note:'E4',f:329.63},{note:'F4',f:349.23},
    {note:'G4',f:392.00},{note:'A4',f:440.00},{note:'B4',f:493.88},{note:'C5',f:523.25},
    {note:'D5',f:587.33},{note:'E5',f:659.25},{note:'F5',f:698.46},{note:'G5',f:783.99},
    {note:'A5',f:880.00},{note:'B5',f:987.77},{note:'C6',f:1046.50},
  ];
  // 音名 -> 简谱数字（1=C 体系）
  const N2NUM = {'C4':'1','D4':'2','E4':'3','F4':'4','G4':'5','A4':'6','B4':'7','C5':'1·','D5':'2·','E5':'3·','F5':'4·','G5':'5·','A5':'6·','B5':'7·','C6':'1··'};
  const DEFAULT_BIND = {0:'a',1:'s',2:'d',3:'f',4:'g',5:'h',6:'j',7:'k',8:'q',9:'w',10:'e',11:'r',12:'t',13:'y',14:'u'};
  let keys = [], semis = 0, keyCount = 8, si = 0, demoTimers = [], bindIdx = -1, notePicker = null, curHi = null, practiceMode = false, practiceIdx = 0, demoSpeed = 1, practiceTimer = null;
  const SCORES = [
    {name:'自由弹奏', nums:''},
    {name:'小星星', nums:'1:1 1:1 5:1 5:1 6:1 6:1 5:2 4:1 4:1 3:1 3:1 2:1 2:1 1:2 5:1 5:1 4:1 4:1 3:1 3:1 2:2 5:1 5:1 4:1 4:1 3:1 3:1 2:2 1:1 1:1 5:1 5:1 6:1 6:1 5:2 4:1 4:1 3:1 3:1 2:1 2:1 1:2'},
    {name:'两只老虎', nums:'1:1 2:1 3:1 1:1 1:1 2:1 3:1 1:1 3:1 4:1 5:2 3:1 4:1 5:2 5:.5 6:.5 5:.5 4:.5 3:1 1:1 5:.5 6:.5 5:.5 4:.5 3:1 1:1 2:1 5:1 1:2 2:1 5:1 1:2'},
    {name:'生日快乐', nums:'5:.5 5:.5 6:1 5:1 1·:2 7:1 5:.5 5:.5 6:1 5:1 2·:2 1·:1 5:.5 5:.5 5·:1 3·:1 1·:1 7:1 6:1.5 4·:.5 4·:1 3·:1 1·:1 2·:1 1·:2'},
    {name:'欢乐颂', nums:'3:1 3:1 4:1 5:1 5:1 4:1 3:1 2:1 1:1 1:1 2:1 3:1 3:1.5 1:.5 1:2 2:1 2:1 3:1 3:1 4:1 4:1 5:1 5:1 5:1 4:1 3:1 2:1 1:1 1:1 2:1 3:1 2:1.5 1:.5 1:2'},
    {name:'粉刷匠', nums:'5:1 3:1 5:1 3:1 5:1 3:1 1:2 2:1 4:1 3:1 2:1 5:2 5:1 3:1 5:1 3:1 5:1 3:1 1:2 2:1 4:1 3:1 2:1 1:2'},
    {name:'送别', nums:'5:1 6:.5 5:.5 3:.5 5:.5 1·:2 6:1 1·:.5 6:.5 5:.5 6:.5 3:2 2:1.5 3:.5 5:1 4:1 3:1 2:1 7:1 1:3 r:1 5:1 3:.5 5:.5 1·:2 6:1 1·:1 5:2 5:1 1:.5 2:.5 3:1 2:.5 1:.5 2:3 r:1 5:1 3:.5 5:.5 1·:1.5 7:.5 6:1 1·:1 5:2 5:1 2:.5 3:.5 4:1.5 7:.5 1:3 r:1 6:1 1·:1 1·:2 7:1 6:.5 7:.5 1·:2 6:.5 7:.5 1·:1 6:1 6:.5 5:.5 3:1 1:1 2:3 r:1 5:1 3:.5 5:.5 1·:1.5 7:.5 6:1 1·:1 5:2 5:1 2:.5 3:.5 4:1.5 7:.5 1:3 r:1 5:1 3:.5 5:.5 1·:2 6:1 1·:1 5:2 5:1 1:.5 2:.5 3:1 2:.5 1:.5 2:3 r:1 5:1 3:.5 5:.5 1·:1.5 7:.5 6:1 1·:1 5:2 5:1 2:.5 3:.5 4:1.5 7:.5 1:3'},
    {name:'虫儿飞', nums:'3·:1 3·:.5 3·:.5 4·:1 5·:1 3·:1.5 2·:.5 2·:2 1·:1 1·:.5 1·:.5 2·:1 3·:1 3·:1.5 7:.5 7:2 6:1 3·:1 2·:2 6:1 3·:1 2·:2 6:1 3·:1 2·:1.5 1·:.5 1·:4 3·:1 3·:.5 3·:.5 4·:1 5·:1 3·:1.5 2·:.5 2·:2 1·:1 1·:.5 1·:.5 2·:1 3·:1 3·:1.5 7:.5 7:2 6:1 3·:1 2·:2 6:1 3·:1 2·:2 6:1 3·:1 2·:1.5 1·:.5 1·:3 3·:.5 2·:.5 5·:3 4·:.5 3·:.5 3·:.5 2·:.5 2·:2 5·:.5 4·:.5 3·:1 4·:.5 5·:1.5 3·:1 2·:3.5 1·:.5 6:1 3·:1 2·:1.5 1·:.5 5·:1 2·:.5 1·:.5 1·:2 4·:.5 3·:.5 4·:.5 3·:.5 1·:2 4·:.5 3·:.5 4·:.5 3·:.5 1·:1.5 2·:.5 1·:4'},
    {name:'青花瓷', nums:'5·:3 2·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 6:1 5:1 2·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 1·:1 3·:1 2·:1 1·:1 1·:1 5:1 6:1 3·:1 3·:1 3·:1 2·:1 3·:1 3·:1 2·:1 3·:1 5·:1 3·:1 3·:1 3·:1 3·:1 2·:1 2·:1 2·:1 2·:1 1·:1 3·:1 3·:1 2·:2 2·:1 1·:1 6:1 1·:1 1·:1 6:1 1·:1 6:1 5:1 5·:1 6:1 3·:1 5·:1 5·:1 3·:1 5·:1 5·:1 3·:1 2·:1 1·:1 1·:1 2·:1 1·:1 2·:1 3·:1 2·:1 2·:1 1·:1 2·:1 1·:1 6:1 2·:1 1·:1 1·:1 6:1 1··:1 2·:1 2·:1 1·:3'},
    {name:'铃儿响叮当', nums:'3:.5 3:.5 3:1 3:.5 3:.5 3:1 3:.5 5:.5 1:.5 2:.5 3:2 4:.5 4:.5 4:1 4:.5 3:.5 3:.5 3:.5 2:.5 2:.5 3:.5 2:.5 2:1 5:1 3:.5 3:.5 3:1 3:.5 3:.5 3:1 3:.5 5:.5 1:.5 2:.5 3:2 4:.5 4:.5 4:1 4:.5 3:.5 3:.5 3:.5 2:.5 2:.5 3:.5 2:.5 2:1 5:1 5:2 1:2'},
    {name:'平安夜', nums:'5:1 6:1 5:2 5:1 6:1 5:2 1·:2 3·:2 2·:1 3·:1 2·:1 1·:1 5:1 6:1 5:1 6:1 5:2 3:2 5:1 6:1 5:2'},
  ];

  box.innerHTML = `
    <div style="max-width:720px;margin:0 auto;">
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <button id="pianoPrev" class="btn btn-outline" style="padding:4px 10px;font-size:16px;">‹</button>
        <span id="pianoSongName" style="font-size:16px;font-weight:600;color:var(--text-dark);min-width:80px;text-align:center;"></span>
        <button id="pianoNext" class="btn btn-outline" style="padding:4px 10px;font-size:16px;">›</button>
        <button id="pianoDemo" class="btn btn-outline" style="padding:4px 12px;font-size:13px;margin-left:8px;">试听</button>
        <button id="pianoPractice" class="btn btn-outline" style="padding:4px 12px;font-size:13px;margin-left:8px;">跟练</button>
        <select id="pianoSpeed" style="margin-left:8px;padding:3px 6px;font-size:12px;border:1px solid var(--border-light);border-radius:8px;background:#fff;color:var(--text-dark);">
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1" selected>1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
        </select>
      </div>
      <div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--text-mid);">调音</span>
        <input id="pianoTune" type="range" min="-12" max="12" step="1" value="0" style="width:120px;vertical-align:middle;">
        <span id="pianoTuneVal" style="font-size:12px;color:var(--text-dark);min-width:56px;">原调</span>
        <span style="font-size:12px;color:var(--text-mid);margin-left:6px;">键数</span>
        <button data-kc="8" class="kc-btn btn btn-primary" style="padding:2px 9px;font-size:12px;">8</button>
        <button data-kc="15" class="kc-btn btn btn-outline" style="padding:2px 9px;font-size:12px;">15</button>
        <button id="pianoReset" class="btn btn-outline" style="padding:2px 9px;font-size:12px;margin-left:6px;">恢复默认</button>
      </div>
      <div id="pianoScore" style="background:var(--card-beige);border-radius:10px;padding:10px 8px;min-height:56px;display:flex;flex-wrap:wrap;justify-content:center;gap:2px 6px;align-content:center;"></div>
      <div id="pianoKeys" style="display:flex;justify-content:center;gap:2px;margin:18px 0 10px;flex-wrap:wrap;"></div>
      <div style="text-align:center;font-size:12px;color:var(--text-light);">点键上字母重新绑定按键 · 点音名改音高 · 按键盘弹琴</div>
    </div>
  `;

  const keysEl = box.querySelector('#pianoKeys');

  function renderKeys() {
    keys = []; keysEl.innerHTML = '';
    for (let i = 0; i < keyCount; i++) {
      const base = ALL_NOTES[i] || ALL_NOTES[ALL_NOTES.length - 1];
      const k = { note: base.note, f: base.f, key: DEFAULT_BIND[i] || '', el: null };
      const el = document.createElement('div');
      el.style.cssText = 'width:clamp(34px,7vw,52px);height:138px;background:#fff;border:1px solid var(--border-light);border-radius:0 0 8px 8px;display:flex;flex-direction:column;align-items:center;padding:6px 0 8px;cursor:pointer;user-select:none;transition:background .03s,transform .03s;flex-shrink:0;';
      el.innerHTML = '<div class="pk-note" style="font-size:10px;color:var(--text-light);cursor:pointer;padding:1px 3px;border-radius:4px;">' + k.note + '</div>' +
        '<div class="pk-num" style="font-size:9px;color:var(--text-light);margin-top:1px;">' + (N2NUM[k.note] || '') + '</div>' +
        '<div style="flex:1;"></div>' +
        '<div class="pk-key" style="font-size:17px;font-weight:700;color:var(--text-dark);text-transform:uppercase;padding:2px 5px;border-radius:4px;">' + (k.key || '·') + '</div>';
      el.addEventListener('pointerdown', e => { if (e.target.classList.contains('pk-note') || e.target.classList.contains('pk-key')) return; e.preventDefault(); playKey(k, -1); });
      el.addEventListener('pointerup', () => stopKey(k));
      el.addEventListener('pointerleave', () => stopKey(k));
      el.querySelector('.pk-note').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openNotePicker(k); });
      el.querySelector('.pk-key').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); startBind(k); });
      keysEl.appendChild(el);
      k.el = el;
      keys.push(k);
    }
  }

  // 真钢琴采样（Salamander，CC授权真实三角钢琴录音）：
  // 采样库每八度只有 A/C/D#/F# 四个真实录音，其余音由播放速率变调生成（±2半音内听感无损）
  const SAMPLE_MAP = {
    C4:['C4',0], D4:['Ds4',-1], E4:['Ds4',1], F4:['Fs4',-1], G4:['Fs4',1], A4:['A4',0], B4:['A4',2],
    C5:['C5',0], D5:['Ds5',-1], E5:['Ds5',1], F5:['Fs5',-1], G5:['Fs5',1], A5:['A5',0], B5:['A5',2], C6:['C6',0],
  };
  const pianoBufs = {};
  let pianoTried = false;
  function loadPianoSamples() {
    if (pianoTried) return; pianoTried = true;
    Object.keys(SAMPLE_MAP).map(n => SAMPLE_MAP[n][0]).filter((v, i, a) => a.indexOf(v) === i).forEach(base => {
      pianoBufs[base] = null;  // null = 加载中
      fetch('audio/piano/' + base + '.mp3')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(ab => sfxCtx().decodeAudioData(ab))
        .then(buf => { pianoBufs[base] = buf; })
        .catch(() => { delete pianoBufs[base]; });  // 加载失败回落合成音色
    });
  }
  function curFreq(k) { return k.f * Math.pow(2, semis / 12); }
  function playKey(k, holdMs) {
    const ctx = sfxCtx(); if (!ctx) return;
    if (k._master) stopKey(k);  // 重复按先停旧音，避免叠音
    const t = ctx.currentTime;
    // 真钢琴采样优先：真实录音音色，变调用播放速率实现；未加载完成时回落下方合成音色
    const sm = SAMPLE_MAP[k.note];
    const buf = sm && pianoBufs[sm[0]];
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (sm[1] + semis) / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.85, t);
      src.connect(g).connect(ctx.destination);
      src.start(t);
      if (holdMs === -1) {
        // 手动按住：采样自然衰减，松手时 stopKey 淡出收尾（stopKey 对 BufferSource 同样适用）
        k._master = g; k._oscs = [src];
      } else {
        const dur = Math.max((holdMs || 380) / 1000, 0.15);
        g.gain.setTargetAtTime(0.001, t + Math.max(dur - 0.1, 0.03), 0.06);
        src.stop(t + dur + 0.3);
        setTimeout(() => { k.el.style.background = '#fff'; k.el.style.transform = ''; }, dur * 1000);
      }
      k.el.style.background = 'var(--primary)';
      k.el.style.transform = 'translateY(3px)';
      if (practiceMode) checkPractice(k);
      return;
    }
    const f = curFreq(k);
    const PEAK = 0.14;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(PEAK, t + 0.004);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500; lp.Q.value = 0.5;
    master.connect(lp).connect(ctx.destination);
    const oscs = [];
    // 仿钢琴：正弦泛音叠加，越高频的泛音衰减越快（钢琴余音“越来越柔”的来源）
    // [倍频, 起振幅度, 衰减到30%所需秒数]
    [[1, 1.0, 2.4], [2, 0.42, 1.1], [3, 0.18, 0.5], [4, 0.08, 0.22], [5, 0.03, 0.12]].forEach(([mult, amp, dec]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * mult;
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(Math.max(amp * 0.3, 0.001), t + dec);
      o.connect(g).connect(master); o.start(t);
      oscs.push(o);
    });
    // 琴槌敲击声：8ms 短噪声，给音头“敲下去”的感觉
    const nlen = Math.floor(ctx.sampleRate * 0.008);
    const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nlen);
    const nsrc = ctx.createBufferSource(); nsrc.buffer = nbuf;
    const ng = ctx.createGain(); ng.gain.value = 0.25;
    const nhp = ctx.createBiquadFilter(); nhp.type = 'highpass'; nhp.frequency.value = 1800;
    nsrc.connect(nhp).connect(ng).connect(master); nsrc.start(t);
    // 音头之后整体缓慢回落到延音量，模拟琴弦自然衰减
    master.gain.setTargetAtTime(PEAK * 0.55, t + 0.04, 0.35);
    if (holdMs === -1) {
      // 手动按住模式：不自动停，存起来等 stopKey（音量按自然衰减走，松手时 stopKey 收尾）
      k._master = master; k._oscs = oscs;
    } else {
      const dur = Math.max((holdMs || 380) / 1000, 0.15);
      const rel = t + Math.max(dur - 0.12, 0.05);
      master.gain.setTargetAtTime(0.001, rel, 0.045);
      oscs.forEach(o => o.stop(t + dur + 0.05));
      // 试听/定时模式：按键高亮与声音同长，音停才恢复
      setTimeout(() => { k.el.style.background = '#fff'; k.el.style.transform = ''; }, dur * 1000);
    }
    k.el.style.background = 'var(--primary)';
    k.el.style.transform = 'translateY(3px)';
    if (practiceMode) checkPractice(k);
  }
  function stopKey(k) {
    if (k._master) {
      const ctx = sfxCtx(), t = ctx.currentTime;
      k._master.gain.cancelScheduledValues(t);
      k._master.gain.setValueAtTime(k._master.gain.value, t);
      k._master.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      k._oscs.forEach(o => o.stop(t + 0.15));
      k._master = null; k._oscs = null;
    }
    k.el.style.background = '#fff';
    k.el.style.transform = '';
    if (practiceMode) advancePractice(k);
  }

  function startBind(k) {
    bindIdx = keys.indexOf(k);
    const kl = k.el.querySelector('.pk-key');
    kl.textContent = '按…'; kl.style.background = 'var(--primary)'; kl.style.color = '#fff';
  }
  function cancelBind() {
    if (bindIdx < 0) return;
    const k = keys[bindIdx], kl = k.el.querySelector('.pk-key');
    kl.textContent = k.key || '·'; kl.style.background = ''; kl.style.color = '';
    bindIdx = -1;
  }
  function onKeyDown(e) {
    if (e.repeat) return;
    if (!document.body.contains(keysEl)) { document.removeEventListener('keydown', onKeyDown); return; }
    if (bindIdx >= 0) {
      if (e.key === 'Escape') { cancelBind(); return; }
      const kk = e.key.toLowerCase();
      if (kk.length === 1 && /[a-z0-9]/.test(kk)) {
        e.preventDefault();
        const k = keys[bindIdx];
        keys.forEach(o => { if (o !== k && o.key === kk) { o.key = ''; o.el.querySelector('.pk-key').textContent = '·'; } });
        k.key = kk;
        const kl = k.el.querySelector('.pk-key');
        kl.textContent = kk; kl.style.background = ''; kl.style.color = '';
        bindIdx = -1;
        renderScore();
      }
      return;
    }
    const k = keys.find(o => o.key === e.key.toLowerCase());
    if (k) { e.preventDefault(); playKey(k, -1); }
  }
  function onKeyUp(e) {
    const k = keys.find(o => o.key === e.key.toLowerCase());
    if (k) stopKey(k);
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  // 绑定模式下，点击非字母区域（空白/琴键主体/音名）即取消绑定
  document.addEventListener('click', function onDocClick(e) {
    if (!document.body.contains(keysEl)) { document.removeEventListener('click', onDocClick); return; }
    if (bindIdx >= 0 && !e.target.closest('.pk-key')) cancelBind();
  }, true);

  function openNotePicker(k) {
    closeNotePicker(); cancelBind();
    notePicker = document.createElement('div');
    notePicker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:2100;display:flex;align-items:center;justify-content:center;';
    notePicker.innerHTML = '<div style="background:#FDFAF3;border-radius:12px;padding:14px 16px;max-width:360px;width:calc(100% - 32px);"><div style="font-size:13px;color:var(--text-mid);margin-bottom:10px;">选音高（当前 ' + k.note + '）</div><div id="npGrid" style="display:flex;flex-wrap:wrap;gap:4px;"></div></div>';
    notePicker.addEventListener('pointerdown', e => { if (e.target === notePicker) closeNotePicker(); });
    document.body.appendChild(notePicker);
    const grid = notePicker.querySelector('#npGrid');
    ALL_NOTES.forEach(n => {
      const b = document.createElement('button');
      b.textContent = n.note + (N2NUM[n.note] ? ' ' + N2NUM[n.note] : '');
      b.className = 'btn ' + (n.note === k.note ? 'btn-primary' : 'btn-outline');
      b.style.cssText = 'padding:4px 8px;font-size:11px;';
      b.addEventListener('click', () => {
        k.note = n.note; k.f = n.f;
        k.el.querySelector('.pk-note').textContent = n.note;
        k.el.querySelector('.pk-num').textContent = N2NUM[n.note] || '';
        renderScore(); closeNotePicker();
      });
      grid.appendChild(b);
    });
  }
  function closeNotePicker() { if (notePicker) { notePicker.remove(); notePicker = null; } }

  function hiNote(idx) {
    if (curHi) { curHi.style.background = ''; curHi.style.transform = ''; }
    const ns = box.querySelector('#pianoScore')._notes;
    if (ns && ns[idx]) { ns[idx].style.background = 'var(--primary)'; ns[idx].style.transform = 'scale(1.18)'; curHi = ns[idx]; }
  }
  function num2key(num) { const k = keys.find(o => N2NUM[o.note] === num); return k ? (k.key || '') : ''; }
  function setKeyNote(k, note, f) {
    k.note = note; k.f = f;
    if (k.el) { k.el.querySelector('.pk-note').textContent = note; k.el.querySelector('.pk-num').textContent = N2NUM[note] || ''; }
  }
  // 解析曲谱：每项 { num: 简谱数字, beats: 拍数 }，格式 "音名:拍数"（拍数默认1）
  function parseScore(score) {
    if (!score.nums) return null;
    return score.nums.split(' ').map(t => {
      const [n, b] = t.split(':');
      return { num: n, beats: b ? parseFloat(b) : 1 };
    });
  }
  // 统计曲目需要多少个不同的键（不含休止符 r）
  function songNeedKeys(score) {
    if (!score.nums) return 0;
    const nums = parseScore(score).map(n => n.num).filter(n => n !== 'r');
    const uniq = []; nums.forEach(n => { if (uniq.indexOf(n) < 0) uniq.push(n); });
    return uniq.length;
  }
  // 若当前曲目音名超过 8 个且处于 8 键模式，自动切到 15 键并提示
  function ensureKeyCountForSong() {
    const score = SCORES[si];
    const need = songNeedKeys(score);
    if (keyCount === 8 && need > 8) {
      keyCount = 15;
      box.querySelectorAll('.kc-btn').forEach(x => { x.classList.remove('btn-primary'); x.classList.add('btn-outline'); });
      const b15 = box.querySelector('.kc-btn[data-kc="15"]');
      if (b15) { b15.classList.remove('btn-outline'); b15.classList.add('btn-primary'); }
      cancelBind(); closeNotePicker();
      renderKeys();
      toast('「' + score.name + '」用了 ' + need + ' 个不同的音，8 键放不下，已自动切到 15 键');
    }
  }
  // 8键模式：按当前曲目自动调整8个键的音高，避免试听断点；自由弹奏时恢复默认C4-C5
  function adaptKeysToSong() {
    if (keyCount !== 8) return;
    const score = SCORES[si];
    let used;
    if (!score.nums) {
      used = ALL_NOTES.slice(0, 8).map(o => o.note);
    } else {
      // 过滤休止符 r，避免它挤占真实音名的键位
      const nums = parseScore(score).map(n => n.num).filter(n => n !== 'r');
      const uniq = []; nums.forEach(n => { if (uniq.indexOf(n) < 0) uniq.push(n); });
      const order = ALL_NOTES.map(o => N2NUM[o.note]);
      uniq.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      used = uniq.slice(0, 8).map(num => Object.keys(N2NUM).find(nt => N2NUM[nt] === num));
      const rest = ALL_NOTES.filter(o => used.indexOf(o.note) < 0);
      while (used.length < 8 && rest.length) used.push(rest.shift().note);
    }
    for (let i = 0; i < 8 && i < used.length; i++) {
      const base = ALL_NOTES.find(o => o.note === used[i]);
      if (base) setKeyNote(keys[i], base.note, base.f);
    }
  }
  // 按曲谱标定的调自动移调（score.shift：相对C调需升高的半音数，如1=F → 5）
  function applySongShift() {
    const sh = SCORES[si].shift || 0;
    if (semis === sh) return;
    semis = sh;
    const tune = box.querySelector('#pianoTune'); if (tune) tune.value = semis;
    const tv = box.querySelector('#pianoTuneVal');
    if (tv) tv.textContent = semis === 0 ? '原调' : '已按曲谱移调 +' + semis;
  }
  function renderScore() {
    const score = SCORES[si];
    applySongShift();
    adaptKeysToSong();
    box.querySelector('#pianoSongName').textContent = score.name;
    const el = box.querySelector('#pianoScore');
    if (!score.nums) { el.innerHTML = '<span style="color:var(--text-mid);font-size:14px;width:100%;text-align:center;line-height:36px;">自由弹奏，想弹什么就弹什么</span>'; el._notes = null; return; }
    if (practiceMode) {
      const notes = parseScore(score);
      const rowSize = 12;
      const startIdx = Math.floor(practiceIdx / rowSize) * rowSize;
      const endIdx = Math.min(startIdx + rowSize, notes.length);
      const rowNotes = [];
      for (let i = startIdx; i < endIdx; i++) rowNotes.push({ ...notes[i], _i: i });
      el.innerHTML = rowNotes.map(n => {
        const kl = num2key(n.num);
        const hold = n.beats > 1;
        const isCurrent = n._i === practiceIdx;
        const isDone = n._i < practiceIdx;
        const bg = isCurrent ? 'var(--primary)' : (isDone ? 'rgba(180,160,130,0.15)' : 'transparent');
        const numColor = isCurrent ? '#fff' : 'var(--text-dark)';
        const klColor = isCurrent ? 'rgba(255,255,255,0.8)' : (isDone ? 'var(--text-light)' : (kl ? 'var(--text-light)' : '#d49a9a'));
        const scale = isCurrent ? 'transform:scale(1.15);' : '';
        return '<div class="pnote" data-idx="' + n._i + '" style="display:inline-flex;flex-direction:column;align-items:center;min-width:30px;border-radius:6px;padding:3px 2px;transition:all .15s;background:' + bg + ';' + scale + '">' +
          '<span style="font-size:16px;font-weight:600;color:' + numColor + ';line-height:24px;">' + (n.num === 'r' ? '0' : n.num) + (hold ? '<span style="opacity:.6;">—</span>'.repeat(Math.max(1, Math.ceil(n.beats) - 1)) : '') + '</span>' +
          '<span style="font-size:11px;color:' + klColor + ';text-transform:uppercase;margin-top:1px;">' + (kl || (n.num === 'r' ? '休' : '?')) + '</span></div>';
      }).join('');
      el._notes = el.querySelectorAll('.pnote');
      return;
    }
    el.innerHTML = parseScore(score).map((n, i) => {
      const kl = num2key(n.num);
      const hold = n.beats > 1;
      return '<div class="pnote" data-idx="' + i + '" style="display:inline-flex;flex-direction:column;align-items:center;min-width:26px;border-radius:6px;padding:2px 1px;transition:background .04s,transform .04s;">' +
        '<span style="font-size:16px;font-weight:600;color:var(--text-dark);line-height:24px;">' + (n.num === 'r' ? '0' : n.num) + (hold ? '<span style="color:var(--text-light);">—</span>'.repeat(Math.max(1, Math.ceil(n.beats) - 1)) : '') + '</span>' +
        '<span style="font-size:11px;color:' + (kl ? 'var(--text-light)' : '#d49a9a') + ';text-transform:uppercase;margin-top:1px;">' + (kl || (n.num === 'r' ? '休' : '?')) + '</span></div>';
    }).join('');
    el._notes = el.querySelectorAll('.pnote');
  }

  function stopDemo() {
    demoTimers.forEach(clearTimeout); demoTimers = [];
    if (curHi) { curHi.style.background = ''; curHi.style.transform = ''; curHi = null; }
  }
  function startPractice() {
    stopDemo();
    practiceMode = true; practiceIdx = 0;
    const btn = box.querySelector('#pianoPractice');
    if (btn) { btn.textContent = '退出跟练'; btn.classList.remove('btn-outline'); btn.classList.add('btn-primary'); }
    renderScore();
    skipRestIfNeeded();  // 开局若遇到休止符，自动等待后进位
  }
  function stopPractice() {
    if (practiceTimer) { clearTimeout(practiceTimer); practiceTimer = null; }
    practiceMode = false; practiceIdx = 0;
    const btn = box.querySelector('#pianoPractice');
    if (btn) { btn.textContent = '跟练'; btn.classList.remove('btn-primary'); btn.classList.add('btn-outline'); }
    renderScore();
  }
  // 跟练遇休止符 r：不要求按键，按其拍数等待后自动进位
  function skipRestIfNeeded() {
    if (practiceTimer) { clearTimeout(practiceTimer); practiceTimer = null; }
    if (!practiceMode) return;
    const score = SCORES[si];
    if (!score.nums) return;
    const notes = parseScore(score);
    if (practiceIdx >= notes.length) return;
    const cur = notes[practiceIdx];
    if (cur.num === 'r') {
      const beat = 420 / demoSpeed;
      const wait = cur.beats * beat;
      practiceTimer = setTimeout(() => {
        practiceIdx++;
        if (practiceIdx >= notes.length) {
          toast('整曲完成！' + score.name);
          setTimeout(() => stopPractice(), 1500);
        } else {
          skipRestIfNeeded();  // 连续休止符继续跳
        }
        renderScore();
      }, wait);
    }
  }
  function checkPractice(k) {
    if (!practiceMode) return;
    const score = SCORES[si];
    if (!score.nums) return;
    const notes = parseScore(score);
    if (practiceIdx >= notes.length) return;
    if (N2NUM[k.note] === notes[practiceIdx].num) {
      k._hit = true;  // 按对先记录，等松手再进位
    }
  }
  function advancePractice(k) {
    if (!practiceMode || !k._hit) return;
    k._hit = false;
    const score = SCORES[si];
    const notes = parseScore(score);
    practiceIdx++;
    if (practiceIdx >= notes.length) {
      toast('整曲完成！' + score.name);
      setTimeout(() => stopPractice(), 1500);
    }
    renderScore();
    skipRestIfNeeded();  // 下一个是休止符则自动等待进位
  }
  function playDemo() {
    stopDemo();
    if (practiceMode) stopPractice();
    const score = SCORES[si];
    if (!score.nums) return;
    const beat = 420 / demoSpeed;
    let delay = 0;
    parseScore(score).forEach((n, i) => {
      const k = keys.find(o => N2NUM[o.note] === n.num);
      const holdMs = n.beats * beat;
      // 画面高亮与发声放同一个定时器回调，保证起音与高亮同一帧、不漂移
      demoTimers.push(setTimeout(() => { hiNote(i); if (k) playKey(k, holdMs); }, delay));
      delay += holdMs;
    });
    demoTimers.push(setTimeout(() => { if (curHi) { curHi.style.background = ''; curHi.style.transform = ''; curHi = null; } }, delay));
  }

  box.querySelector('#pianoTune').addEventListener('input', e => {
    semis = parseInt(e.target.value);
    box.querySelector('#pianoTuneVal').textContent = semis === 0 ? '原调' : (semis > 0 ? '+' + semis + ' 升' : semis + ' 降') + ' 半音';
  });
  box.querySelectorAll('.kc-btn').forEach(b => {
    b.addEventListener('click', () => {
      const wantKc = parseInt(b.dataset.kc);
      if (wantKc === 8) {
        const need = songNeedKeys(SCORES[si]);
        if (need > 8) {
          toast('「' + SCORES[si].name + '」用了 ' + need + ' 个不同的音，8 键放不下，请用 15 键');
          return;
        }
      }
      keyCount = wantKc;
      box.querySelectorAll('.kc-btn').forEach(x => { x.classList.remove('btn-primary'); x.classList.add('btn-outline'); });
      b.classList.remove('btn-outline'); b.classList.add('btn-primary');
      cancelBind(); closeNotePicker();
      renderKeys(); renderScore();
    });
  });
  box.querySelector('#pianoReset').addEventListener('click', () => {
    semis = 0; si = 0;
    const tune = box.querySelector('#pianoTune'); if (tune) tune.value = 0;
    const tv = box.querySelector('#pianoTuneVal'); if (tv) tv.textContent = '原调';
    cancelBind(); closeNotePicker();
    renderKeys(); renderScore();
    toast('已恢复默认设置');
  });
  box.querySelector('#pianoPrev').addEventListener('click', () => { stopDemo(); if (practiceMode) stopPractice(); si = (si - 1 + SCORES.length) % SCORES.length; ensureKeyCountForSong(); renderScore(); });
  box.querySelector('#pianoNext').addEventListener('click', () => { stopDemo(); if (practiceMode) stopPractice(); si = (si + 1) % SCORES.length; ensureKeyCountForSong(); renderScore(); });
  box.querySelector('#pianoDemo').addEventListener('click', playDemo);
  box.querySelector('#pianoSpeed').addEventListener('change', e => { demoSpeed = parseFloat(e.target.value); if (demoTimers.length) playDemo(); });
  box.querySelector('#pianoPractice').addEventListener('click', () => { practiceMode ? stopPractice() : startPractice(); });
  loadPianoSamples();
  renderKeys();
  ensureKeyCountForSong();
  renderScore();
}

function aiCustomize() {
  showPage('chat');
  const input = document.getElementById('chatInput');
  if (!input || input.value.trim()) return;
  input.value = '请根据我的健康档案和今日状态，定制一套调理方案（作息 / 饮食 / 穴位）';
  sendMessage();
}

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
    if (scoreEl && d.score !== undefined) scoreEl.textContent = d.score == null ? '未测' : d.score;
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
  baduanjin: { title: '八段锦 · 动作序列', hint: '含预备式与收式共 10 式，循序渐进、不憋气' },
  stretch: { title: '疏肝拉伸序列', hint: '拉伸到有牵拉感即可，不要疼痛，每侧动作左右都做' },
  office: { title: '办公室微运动', hint: '坐在工位上也能完成，每工作 1 小时起来做一组' },
};
// 动作 → 视频文件映射（用户上传后补充路径）
const VIDEO_MAP = {
  '预备式': 'img/anims/yubeishi.mp4',
  '两手托天理三焦': 'img/anims/tuotian.mp4',
  '左右开弓似射雕': 'img/anims/shediao.mp4',
  '调理脾胃须单举': 'img/anims/danju.mp4',
  '五劳七伤往后瞧': 'img/anims/houqiao.mp4',
  '摇头摆尾去心火': 'img/anims/baiwei.mp4',
  '两手攀足固肾腰': 'img/anims/panzu.mp4',
  '攥拳怒目增气力': 'img/anims/numu.mp4',
  '背后七颠百病消': 'img/anims/qidian.mp4',
  '收式': 'img/anims/shoushi.mp4',
};
// 视频真实时长（秒），实测后写死：列表时间 = 时长 × 次数，避免现场探测受网络波动影响
// 换视频文件后须同步更新此表（浏览器对 mp4 缓存 7 天，替换文件时给 VIDEO_MAP 的 URL 加 ?v=2 等穿透）
const VIDEO_DUR = {
  yubeishi: 16.18, tuotian: 19.39, shediao: 28.89, danju: 24.17,
  houqiao: 24.82, baiwei: 37.11, panzu: 17.79, numu: 17.44,
  qidian: 4.39, shoushi: 10.54,
};
// 从 duration 字符串解析循环次数，如 "6次，1分40秒" → 6；无"次"字样（如"30秒"）视为 1 次
function parseReps(durationStr) {
  const m = String(durationStr || '').match(/(\d+)\s*次/);
  return m ? parseInt(m[1], 10) : 1;
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
  // 有视频的动作：用实测时长表（VIDEO_DUR）× 次数覆盖 m.secs，确定性计算无网络依赖
  for (const m of moves) {
    const vsrc = VIDEO_MAP[m.name];
    if (vsrc) {
      const key = vsrc.split('/').pop().replace(/\.mp4.*$/i, '');
      const dur = VIDEO_DUR[key];
      if (dur) {
        const newSecs = Math.round(dur * parseReps(m.duration));
        if (Number.isFinite(newSecs) && newSecs > 0) m.secs = newSecs;
      }
    }
  }

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
      ? `预备式与收式各练 1 次，其余每式约 6 次，整套约 ${Math.round(total / 60)} 分钟，循序渐进、不憋气`
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
  baduanjin: ['预备式', '两手托天理三焦', '左右开弓似射雕', '调理脾胃须单举', '五劳七伤往后瞧', '摇头摆尾去心火', '两手攀足固肾腰', '攥拳怒目增气力', '背后七颠百病消', '收式'],
  stretch: ['搓胁肋', '侧腰拉伸', '扩胸展肩', '旋腰转脊', '深呼吸478'],
  office: ['颈部放松', '肩部环绕', '腰部扭转', '手腕伸展'],
};
const AI_GUIDE_MAP = {
  '预备式': { tip: '两脚与肩同宽，屈膝合抱如捧球，肩肘下沉全身放松，平稳呼吸2-3次，心静下来再开始。', mistakes: ['开步过大重心不稳', '合抱时耸肩抬肘', '急于开始、忽略调息静心'] },
  '收式': { tip: '两掌相叠轻贴丹田，闭目静养片刻，意想气息归入丹田；搓热双手浴面，缓缓收功。', mistakes: ['收式仓促、立即走动', '忽略静养直接结束', '呼吸急促、气未归元'] },
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

// ============ 排行榜（演示数据；待 AI 打分落库后替换为真实成绩） ============
const RANK_DATA = [
  { user: '松友_01', action: '两手托天理三焦', score: 98, date: '2026-10-04', cat: 'baduanjin' },
  { user: '松友_02', action: '左右开弓似射雕', score: 95, date: '2026-10-04', cat: 'baduanjin' },
  { user: '松友_03', action: '调理脾胃须单举', score: 92, date: '2026-10-03', cat: 'baduanjin' },
  { user: '松友_04', action: '五劳七伤往后瞧', score: 88, date: '2026-10-03', cat: 'baduanjin' },
  { user: '松友_05', action: '两手攀足固肾腰', score: 85, date: '2026-10-02', cat: 'baduanjin' },
  { user: '松友_06', action: '扩胸展背式', score: 94, date: '2026-10-05', cat: 'stretch' },
  { user: '松友_07', action: '侧腰伸展式', score: 91, date: '2026-10-05', cat: 'stretch' },
  { user: '松友_08', action: '肩背开合式', score: 89, date: '2026-10-04', cat: 'stretch' },
  { user: '松友_09', action: '颈部缓旋式', score: 85, date: '2026-10-03', cat: 'stretch' },
  { user: '松友_10', action: '体侧拉伸式', score: 83, date: '2026-10-02', cat: 'stretch' },
  { user: '松友_11', action: '肩颈绕环', score: 93, date: '2026-10-06', cat: 'office' },
  { user: '松友_12', action: '腕指放松操', score: 90, date: '2026-10-05', cat: 'office' },
  { user: '松友_13', action: '坐姿转体', score: 87, date: '2026-10-05', cat: 'office' },
  { user: '松友_14', action: '踮脚提踵', score: 84, date: '2026-10-04', cat: 'office' },
  { user: '松友_15', action: '眼周按压操', score: 82, date: '2026-10-03', cat: 'office' },
];

function switchRankTab(cat, ev) {
  document.querySelectorAll('#page-rank .tab-bar .tab').forEach(t => t.classList.remove('active'));
  const trigger = (ev && ev.currentTarget) || document.querySelector('#page-rank .tab-bar .tab[data-rank="' + cat + '"]');
  if (trigger) trigger.classList.add('active');
  renderRankBody(cat);
}

function renderRankBody(cat) {
  const body = document.getElementById('aiRankBody');
  if (!body) return;
  const list = (cat === 'all' ? RANK_DATA.slice() : RANK_DATA.filter(r => r.cat === cat))
    .sort((a, b) => b.score - a.score).slice(0, 8);
  const badge = (i) => i === 0 ? '<span class="ai-rank-badge gold">1</span>'
    : i === 1 ? '<span class="ai-rank-badge silver">2</span>'
      : i === 2 ? '<span class="ai-rank-badge bronze">3</span>' : String(i + 1);
  body.innerHTML = list.length ? list.map((r, i) =>
    '<div class="ai-rank-row">'
    + '<div class="ai-rank-col rank">' + badge(i) + '</div>'
    + '<div class="ai-rank-col user">' + r.user + '</div>'
    + '<div class="ai-rank-col action">' + r.action + '</div>'
    + '<div class="ai-rank-col score">' + r.score + '</div>'
    + '<div class="ai-rank-col date">' + r.date + '</div></div>'
  ).join('') : '<div style="padding:24px;text-align:center;color:var(--text-mid);">该分类暂无成绩，快来打第一个分～</div>';
}
renderRankBody('all');

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
  if (tab === 'chronic') { switchChronic(currentChronic); loadChronicTrack(); }
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

// ===== 健康记录页「记录日历」：可翻月，有记录/无记录分色，今天圈出 =====
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1; // 1-12
const calCache = {}; // 'YYYY-MM' -> Map(date -> count)

async function loadSymptomStats() {
  delete calCache[`${calYear}-${String(calMonth).padStart(2, '0')}`]; // 新增记录后强制刷新当前月
  renderSymptomCalendar();
}

async function renderSymptomCalendar() {
  const el = document.getElementById('symptomCal');
  if (!el) return;
  const title = document.getElementById('calTitle');
  if (title) title.textContent = `${calYear}年${calMonth}月`;
  const key = `${calYear}-${String(calMonth).padStart(2, '0')}`;
  let dayMap = calCache[key];
  if (!dayMap) {
    el.innerHTML = '<div style="color:var(--text-light);font-size:13px;margin:auto;">加载中…</div>';
    const res = await fetchAPI(`/record/symptoms/calendar?year=${calYear}&month=${calMonth}`);
    if (!res.success || !res.data) {
      el.innerHTML = '<div style="color:var(--text-light);font-size:13px;margin:auto;">日历加载失败，稍后再试</div>';
      return;
    }
    dayMap = new Map((res.data.days || []).map(d => [d.date, d.count]));
    calCache[key] = dayMap;
  }
  const todayStr = new Date().toLocaleDateString('sv'); // 本地日期 YYYY-MM-DD
  const startPad = new Date(calYear, calMonth - 1, 1).getDay(); // 首日前的空白格
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px 4px;">';
  ['日', '一', '二', '三', '四', '五', '六'].forEach(w => {
    html += `<div style="text-align:center;font-size:12px;color:var(--text-light);padding:2px 0;">${w}</div>`;
  });
  for (let i = 0; i < startPad; i++) html += '<div></div>';
  for (let n = 1; n <= daysInMonth; n++) {
    const ds = `${key}-${String(n).padStart(2, '0')}`;
    const cnt = dayMap.get(ds) || 0;
    const isToday = ds === todayStr;
    const isFuture = ds > todayStr;
    // 圆点式：有记录=实心圆（悬停气泡+点击详情）；今天=「今」字圆；无记录=灰数字；未来=淡数字
    const circle = 'width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;';
    let inner = '';
    if (cnt) {
      inner = `<div class="cal-day" style="position:relative;cursor:pointer;" onclick="openDayRecords('${ds}')">
        <div class="cal-dot" style="${circle}background:var(--primary);color:#fff;font-weight:600;">${n}</div>
        <span class="cal-tip">${cnt}条记录</span>
      </div>`;
    } else if (isToday) {
      inner = `<div style="${circle}background:var(--accent);color:#fff;font-weight:600;">今</div>`;
    } else {
      const color = isFuture ? 'var(--border)' : 'var(--text-light)';
      inner = `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:14px;color:${color};">${n}</div>`;
    }
    html += `<div style="display:flex;align-items:center;justify-content:center;height:44px;">${inner}</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

// 点击日历有记录的日期：弹窗展示当天全部症状记录
async function openDayRecords(ds) {
  const res = await fetchAPI('/record/symptoms');
  if (!res.success || !Array.isArray(res.data)) {
    toast('记录加载失败，请稍后重试', 'error');
    return;
  }
  const day = res.data.filter(r => String(r.time).slice(0, 10) === ds);
  const rows = day.length ? day.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
      <div>
        <b style="font-size:14px;color:var(--text-dark);">${escapeHtml(r.symptom)}</b>
        <div style="font-size:12px;color:var(--text-light);margin-top:2px;">${escapeHtml(r.time)}${r.cause ? ' · ' + escapeHtml(r.cause) : ''}</div>
      </div>
      <span class="tag tag-gray" style="flex-shrink:0;">${escapeHtml(r.severity)}</span>
    </div>`).join('')
    : '<div style="color:var(--text-light);font-size:14px;">这一天没有记录</div>';
  openModal(`
    <div class="modal-head">
      <div><div class="modal-title">\u{1F4C5} ${calMonth}月${Number(ds.slice(8, 10))}日记录 <span class="tag tag-primary">${day.length}条</span></div></div>
      <span class="modal-close" onclick="closeModal()">×</span>
    </div>
    <div class="modal-body">${rows}</div>
    <div class="modal-foot">
      <button class="btn btn-outline" onclick="closeModal()">关闭</button>
    </div>`);
}

function calShift(delta) {
  calMonth += delta;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  if (calMonth < 1) { calMonth = 12; calYear--; }
  renderSymptomCalendar();
}

// 月份快选面板：点标题「2026年10月」弹出，年份步进 + 12月宫格，一步跳转
let pickerYear = calYear;
function openMonthPicker() {
  pickerYear = calYear;
  renderMonthPicker();
}
function renderMonthPicker() {
  const now = new Date();
  const nowY = now.getFullYear(), nowM = now.getMonth() + 1;
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const isCur = pickerYear === calYear && m === calMonth;
    const isFuture = pickerYear > nowY || (pickerYear === nowY && m > nowM);
    const style = isCur
      ? 'background:var(--primary);color:#fff;font-weight:600;'
      : isFuture
        ? 'color:var(--border);'
        : 'background:var(--card-beige);color:var(--text-dark);';
    return `<div ${isFuture ? '' : `onclick="pickMonth(${m})"`} style="height:40px;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:14px;cursor:${isFuture ? 'default' : 'pointer'};${style}">${m}月</div>`;
  }).join('');
  openModal(`
    <div class="modal-head">
      <div><div class="modal-title">选择年月</div></div>
      <span class="modal-close" onclick="closeModal()">×</span>
    </div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-bottom:14px;">
        <span onclick="pickerYear--;renderMonthPicker()" style="cursor:pointer;font-size:20px;color:var(--text-mid);user-select:none;">&#8249;</span>
        <b style="font-size:16px;color:var(--text-dark);">${pickerYear}年</b>
        <span onclick="pickerYear++;renderMonthPicker()" style="cursor:pointer;font-size:20px;color:var(--text-mid);user-select:none;">&#8250;</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">${months}</div>
    </div>
    <div class="modal-foot"><button class="btn btn-outline" onclick="closeModal()">取消</button></div>`);
}
function pickMonth(m) {
  calYear = pickerYear;
  calMonth = m;
  closeModal();
  renderSymptomCalendar();
}

// 慢病页「调理跟踪」：近4周（滚动7天窗口）症状发作次数柱状图
async function loadChronicTrack() {
  const el = document.getElementById('chronicTrack');
  if (!el) return;
  const res = await fetchAPI('/record/symptoms/stats');
  if (!res.success || !res.data || !res.data.weeks) return;
  const weeks = res.data.weeks;
  const total = weeks.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...weeks.map(w => w.count));
  el.innerHTML = weeks.map(w => {
    const pct = w.count ? Math.max(12, (w.count / max) * 88) : 4;
    const color = w.count === 0 ? 'var(--border)' : w.count >= max && max >= 3 ? 'var(--danger)' : w.count >= 2 ? 'var(--warn)' : 'var(--primary)';
    const range = w.start.slice(5).replace('-', '/') + '~' + w.end.slice(5).replace('-', '/');
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;">
      <div style="font-size:12px;color:var(--text-mid);font-weight:600;">${w.count || ''}</div>
      <div style="width:34px;height:${pct}%;border-radius:4px 4px 0 0;background:${color};"></div>
      <div style="font-size:12px;color:var(--text-mid);">${w.label}</div>
      <div style="font-size:10px;color:var(--text-light);white-space:nowrap;">${range}</div>
    </div>`;
  }).join('');
  const tip = document.getElementById('chronicTrackTip');
  if (tip) {
    const first = weeks[0].count; const last = weeks[weeks.length - 1].count;
    tip.innerHTML = total === 0
      ? '\u{1F4DD} 近4周还没有症状记录，去「症状打卡」记一记，才能看出调理趋势'
      : first > last
        ? '\u{1F9E0} 近4周发作频率在下降，当前调理方向是对的，继续保持'
        : first < last
          ? '\u{1F9E0} 本周发作比之前频繁，留意发作当天的作息、饮食和情绪，必要时调整方案'
          : `\u{1F9E0} 近4周共记录 ${total} 次发作，频率基本持平，坚持记录观察变化`;
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

// ============ 健康偏好编辑（标签化点选，替代自由文本；多选以「、」入库） ============
const PREF_DEFS = [
  { key: 'dietPref', label: '饮食偏好', multi: true, options: ['清淡', '少辣', '少甜', '忌生冷', '素食', '爱喝汤'] },
  { key: 'exercisePref', label: '运动习惯', multi: false, options: ['几乎不动', '偶尔散步', '每周1~2次', '每周3次以上', '爱练功法'] },
  { key: 'sleepPref', label: '作息规律', multi: false, options: ['早睡早起', '夜猫子', '作息不规律', '常轮班'] },
  { key: 'bodySense', label: '体感敏感度', multi: false, options: ['怕冷', '怕热', '易口干咽燥', '不太明显'] },
];

async function openPrefEditor() {
  if (!profileCache) await loadProfile();
  const p = profileCache || {};
  const groups = PREF_DEFS.map(g => {
    const cur = (p[g.key] || '').split('、').filter(Boolean);
    // 早先手填的自由文本若不在选项里，动态补成可选 chip，避免丢数据
    const opts = [...g.options];
    cur.forEach(v => { if (!opts.includes(v)) opts.push(v); });
    const chips = opts.map(o =>
      `<span class="tag-chip${cur.includes(o) ? ' active' : ''}" data-multi="${g.multi ? 1 : 0}" onclick="togglePrefChip(this)">${escapeHtml(o)}</span>`
    ).join('');
    return '<div style="margin-bottom:18px;">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:8px;">' + g.label +
      (g.multi ? '<span style="font-weight:400;color:var(--text-light);font-size:12px;">（可多选）</span>' : '') + '</div>' +
      '<div class="tag-row" style="margin-bottom:0;" data-group="' + g.key + '">' + chips + '</div></div>';
  }).join('');
  openModal(
    '<div style="padding:24px 28px 28px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin:-24px -28px 16px;padding:16px 28px 12px;position:sticky;top:0;background:var(--card,#fff);z-index:10;">' +
    '<b style="font-size:16px;">编辑健康偏好</b>' +
    '<span class="modal-close" onclick="closeModal()" style="font-size:26px;cursor:pointer;color:var(--text-mid);padding:0 8px;">&times;</span></div>' +
    groups +
    '<button class="btn btn-primary btn-block" style="margin-top:8px;" onclick="savePrefEditor()">保存</button>' +
    '</div>', { width: 560 }
  );
}

function togglePrefChip(el) {
  const row = el.parentElement;
  if (!row) return;
  if (el.dataset.multi === '1') {
    el.classList.toggle('active');
  } else {
    const wasActive = el.classList.contains('active');
    row.querySelectorAll('.tag-chip').forEach(c => c.classList.remove('active'));
    if (!wasActive) el.classList.add('active');
  }
}

async function savePrefEditor() {
  const payload = {};
  for (const g of PREF_DEFS) {
    const row = document.querySelector('[data-group="' + g.key + '"]');
    if (!row) return;
    payload[g.key] = Array.from(row.querySelectorAll('.tag-chip.active')).map(c => c.textContent.trim()).join('、') || null;
  }
  const res = await fetchAPI('/profile', { method: 'PUT', body: JSON.stringify(payload) });
  if (!res.success) { toast(res.message || '保存失败，请稍后重试', 'error'); return; }
  closeModal();
  toast('健康偏好已保存，推荐会更懂你 🌿', 'success');
  loadProfile();
}

async function loadProfile() {
  document.getElementById('profileMenuView').style.display = '';
  const dv = document.getElementById('profileDetailView');
  if (dv) dv.style.display = 'none';
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
function switchProfileView(view) {
  document.getElementById('profileMenuView').style.display = 'none';
  document.getElementById('profileDetailView').style.display = '';
  // 隐藏所有详情卡
  ['viewFavorites','viewChronic','viewReminders','viewSecurity','viewFeedback'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.querySelectorAll('.pf-view-card').forEach(c => c.style.display = 'none');
  // 显示当前视图
  if (view === 'profile') {
    document.querySelectorAll('.pf-view-card').forEach(c => { if (c.id !== 'pfStatCard') c.style.display = ''; });
  } else if (view === 'stats') {
    const sc = document.getElementById('pfStatCard');
    if (sc) sc.style.display = '';
  } else {
    const MAP = { favorites:'viewFavorites', chronic:'viewChronic', reminders:'viewReminders', security:'viewSecurity', feedback:'viewFeedback' };
    const el = document.getElementById(MAP[view]);
    if (el) el.style.display = '';
  }
  if (view === 'favorites') renderFavList();
  if (view === 'chronic') loadChronicProfile();
  if (view === 'security') loadSecurityInfo();
  window.scrollTo(0, 0);
}

function backToProfileMenu() {
  document.getElementById('profileMenuView').style.display = '';
  document.getElementById('profileDetailView').style.display = 'none';
  window.scrollTo(0, 0);
}

function showProfileSection(view) {
  openPanel('profile');
  switchProfileView(view);
}

// ============ 提醒设置（本地存储，与穿衣建议页天气开关同步） ============
function syncReminderSwitches() {
  const todoOn = localStorage.getItem('songxu_todo_alert') !== '0';
  const weatherOn = localStorage.getItem('songxu_weather_alert') !== '0';
  [[todoOn, 'todoRemindSwitch'], [weatherOn, 'remWeatherSwitch']].forEach(([on, id]) => {
    const sw = document.getElementById(id);
    if (!sw) return;
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.style.background = on ? 'var(--primary)' : '#C7BCA8';
    const knob = sw.firstElementChild;
    if (knob) {
      knob.style.right = on ? '2px' : '';
      knob.style.left = on ? '' : '2px';
    }
  });
}
function toggleTodoRemind() {
  const on = localStorage.getItem('songxu_todo_alert') === '0';
  localStorage.setItem('songxu_todo_alert', on ? '1' : '0');
  if (on) startTodoReminder(); else stopTodoReminder();
  syncReminderSwitches();
  toast(on ? '已开启每日待办提醒' : '已关闭每日待办提醒');
}
function toggleRemWeather() {
  toggleWeatherAlert(); // 本地存储切换 + 穿衣建议页开关同步 + toast
  syncReminderSwitches();
}

// ============ 账号与安全 ============
function loadSecurityInfo() {
  fetchAPI('/auth/me').then(res => {
    if (!res.success || !res.data) return;
    const d = res.data;
    const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    put('pfSecUsername', d.username || '--');
    put('pfSecName', d.name || '--');
    put('pfSecCreated', d.created_at ? String(d.created_at).slice(0, 10) : '--');
  });
}
async function changePassword() {
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const oldPwd = val('secOldPwd'), newPwd = val('secNewPwd'), newPwd2 = val('secNewPwd2');
  if (!oldPwd || !newPwd) return toast('请填写原密码和新密码', 'warn');
  if (newPwd.length < 6) return toast('新密码至少 6 位', 'warn');
  if (newPwd !== newPwd2) return toast('两次输入的新密码不一致', 'warn');
  const res = await fetchAPI('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }) });
  if (res.success) {
    ['secOldPwd', 'secNewPwd', 'secNewPwd2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    toast('密码已更新，下次登录请使用新密码');
  } else {
    toast(res.message || '修改失败，稍后再试', 'error');
  }
}

// ============ 意见反馈 ============
async function submitFeedback() {
  const el = document.getElementById('feedbackText');
  const content = ((el && el.value) || '').trim();
  if (content.length < 5) return toast('反馈内容至少 5 个字', 'warn');
  const res = await fetchAPI('/feedback', { method: 'POST', body: JSON.stringify({ content }) });
  if (res.success) {
    if (el) el.value = '';
    const c = document.getElementById('feedbackCount');
    if (c) c.textContent = '0';
    toast('已收到你的反馈，谢谢～');
  } else {
    toast(res.message || '提交失败，稍后再试', 'error');
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
    el.innerHTML = '<div style="color:var(--text-light);font-size:14px;">还没有收藏，去「饮食推荐」点亮食谱的收藏吧</div>';
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
  renderSolarTerm();
  // 意见反馈字数统计
  const fbText = document.getElementById('feedbackText');
  if (fbText) fbText.addEventListener('input', () => {
    const c = document.getElementById('feedbackCount');
    if (c) c.textContent = String(fbText.value.length);
  });
  syncReminderSwitches();

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

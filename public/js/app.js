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

function openModal(html) {
  const mask = document.getElementById('modalMask');
  const box = document.getElementById('modalBox');
  if (!mask) return;
  box.innerHTML = html;
  mask.classList.add('show');
}
function closeModal() {
  const mask = document.getElementById('modalMask');
  if (mask) mask.classList.remove('show');
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closePanel(); }
});

// ============ 退出登录 ============
function logout() {
  if (!confirm('确定退出登录吗？')) return;
  clearLogin();
  chatSessionId = null;
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
}
function closeNotification() {
  const panel = document.getElementById('notifPanel');
  if (panel) panel.classList.remove('show');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#notifPanel') && !e.target.closest('.icon-btn')) closeNotification();
});

// ============ 页面切换（AI 对话常驻主区，其余板块走抽屉） ============
const PANEL_TITLES = {
  home: '首页', care: '居家保健', diet: '饮食调理', clothing: '穿衣建议',
  rhythm: '生活节律', practice: '功法带练', record: '健康记录',
  profile: '我的', assistant: '今日处方与概览',
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
  document.getElementById('sbAvatar').textContent = name.charAt(0);
  document.getElementById('sbUserName').textContent = name;
  newChat();
  refreshChatOverview();
}

function openPanel(name) {
  const page = document.getElementById('page-' + name);
  if (!page) return;
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
  if (name === 'rhythm') { loadExercise(); loadSleep(); }
  if (name === 'practice') loadPracticeMoves();
  if (name === 'record') { loadSymptomRecords(); loadMedicines(); loadSymptomStats(); }
  if (name === 'profile') { loadProfile(); loadProfileStats(); }
  if (name === 'assistant') refreshChatOverview();
}

function closePanel() {
  const panel = document.getElementById('sidePanel');
  if (panel) panel.classList.remove('open');
  const mask = document.getElementById('panelMask');
  if (mask) mask.classList.remove('show');
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
  if (res.success && res.token) {
    saveLogin(res.token, res.user);
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
  if (res.success && res.token) {
    saveLogin(res.token, res.user);
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

async function loadHomeData() {
  const res = await fetchAPI('/health/dashboard');
  if (res.success && res.data) {
    const d = res.data;
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
  }
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
function renderFoodTags(el, items, cls) {
  if (!el || !Array.isArray(items)) return;
  el.innerHTML = items.map(f => `<span class="food-tag ${cls}">${escapeHtml(f)}</span>`).join('');
}

async function loadDietData() {
  const [r1, r2, r3] = await Promise.all([
    fetchAPI('/diet/recommend'),
    fetchAPI('/diet/foods'),
    fetchAPI('/diet/recipes'),
  ]);
  if (r1.success && r1.data) {
    const el = document.getElementById('dietPrinciple');
    if (el && r1.data.principle) el.textContent = r1.data.principle;
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
let currentRecipes = [];
const RECIPE_EMOJI = { '早餐': '\u{1F963}', '午餐': '\u{1F962}', '晚餐': '\u{1F372}', '加餐': '\u{1F375}' };
const POOL_KEY = { '早餐': 'breakfast', '午餐': 'lunch', '晚餐': 'dinner', '加餐': 'snack' };
const FAV_KEY = 'songxu_favs';
function getFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
}
function saveFavs(list) { localStorage.setItem(FAV_KEY, JSON.stringify(list)); }
function isFav(name) { return getFavs().some(f => f.name === name); }
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
        <div class="footer">
          <span class="recipe-action ${fav ? 'faved' : ''}" onclick="toggleFav('${escapeHtml(r.time)}','${escapeHtml(r.name)}','${escapeHtml(r.ingredients)}',this)">${fav ? '\u2764 已收藏' : '\u{1F90D} 收藏'}</span>
          <span class="recipe-action" onclick="showShoppingList()">购物清单</span>
        </div>
      </div>
    </div>`;
  }).join('');
}
function toggleFav(time, name, ingredients, el) {
  let favs = getFavs();
  const idx = favs.findIndex(f => f.name === name);
  if (idx >= 0) {
    favs.splice(idx, 1);
    toast('已取消收藏');
  } else {
    favs.push({ time, name, ingredients });
    toast('已收藏，可在「我的-我的收藏」查看', 'success');
  }
  saveFavs(favs);
  if (el) {
    el.classList.toggle('faved', idx < 0);
    el.textContent = idx < 0 ? '\u2764 已收藏' : '\u{1F90D} 收藏';
  }
}
function shuffleRecipes() {
  if (!recipePoolCache) { loadDietData(); return; }
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
  toast('换了一批新食谱～');
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
async function loadClothing() {
  const res = await fetchAPI('/clothing');
  if (!res.success || !res.data) return;
  const d = res.data;
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el && text !== undefined && text !== null) el.textContent = text;
  };
  set('wcEmoji', weatherEmoji(d.weatherText || d.weather));
  set('wcTemp', d.temp + '°C');
  set('wcCity', d.city + ' · ' + (d.weatherText || d.weather || ''));
  set('wcHighLow', '\u{1F321} 最高' + d.high + '°C / 最低' + d.low + '°C');
  set('wcDiff', '\u{1F4CF} 温差' + d.diff + '°C');
  set('wcWind', '\u{1F32A} ' + d.wind);
  set('wcHumidity', '\u{1F4A7} 湿度' + d.humidity + '%');
  set('caPrinciple', d.principle);
  set('caInner', d.inner);
  set('caOuter', d.outer);
  set('caShoes', d.shoes);
  initBodySensePrefs();
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
function followExercise(name) {
  if (name.indexOf('478') >= 0) { breathingGuide(); return; }
  showPage('practice');
  toast('跟着带练慢慢做，配合自然呼吸～');
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
async function loadSleep() {
  fillSleepSelects();
  const res = await fetchAPI('/rhythm/sleep');
  if (!res.success || !res.data) return;
  const { week = [], today } = res.data;
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

function renderChatBubble(role, text, cardsHtml) {
  const avatar = role === 'user' ? '🧑' : '🌿';
  const safeText = escapeHtml(text).replace(/\n/g, '<br>');
  const extra = cardsHtml ? `<div class="ai-cards">${cardsHtml}</div>` : '';
  return `<div class="chat-msg ${role}"><div class="avatar">${avatar}</div><div class="bubble">${safeText}${extra}</div></div>`;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  const chatArea = document.getElementById('chatMessages');
  chatArea.innerHTML += renderChatBubble('user', msg);
  input.value = '';
  scrollChatToBottom();

  // 加载状态
  const loadingId = 'chatLoading_' + Date.now();
  chatArea.innerHTML += `<div class="chat-msg ai" id="${loadingId}"><div class="avatar">\u{1F33F}</div><div class="bubble">正在思考…</div></div>`;
  scrollChatToBottom();

  const res = await fetchAPI('/chat', {
    method: 'POST',
    body: JSON.stringify({ message: msg, sessionId: chatSessionId }),
  });

  const loadingEl = document.getElementById(loadingId);
  if (loadingEl) loadingEl.remove();

  if (res.success && res.data) {
    chatSessionId = res.data.sessionId;
    const cardsHtml = Array.isArray(res.data.cards) && res.data.cards.length
      ? res.data.cards.map(renderChatCard).join('')
      : '';
    chatArea.innerHTML += renderChatBubble('ai', res.data.reply, cardsHtml);
    loadSessionList();
  } else {
    chatArea.innerHTML += renderChatBubble('ai', res.message || '抱歉，我暂时无法回复，请稍后再试~');
  }
  scrollChatToBottom();
}

// ============ 会话历史（新对话 / 列表 / 回看续聊） ============
const WELCOME_HTML = '<div class="chat-msg ai"><div class="avatar">🌿</div><div class="bubble">你好呀，我是小松 🌿 今天感觉怎么样？有什么不舒服可以跟我说~</div></div>';

function newChat() {
  chatSessionId = null;
  document.getElementById('chatMessages').innerHTML = WELCOME_HTML;
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
  if (!res.data.length) {
    box.innerHTML = '<div class="sb-empty">还没有对话，和小松聊聊吧</div>';
    return;
  }
  box.innerHTML = res.data.map(s =>
    `<div class="sb-session${s.id === chatSessionId ? ' active' : ''}" onclick="loadSession(${s.id})" title="${escapeHtml(s.lastMessage || '')}">
      <span class="sb-session-title">${escapeHtml(s.title || '新的对话')}</span>
    </div>`).join('');
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
  practiceMovesCache = moves;
  const list = document.getElementById('moveList');
  if (list) {
    list.innerHTML = moves.length ? moves.map((m, i) => `
      <div class="move-item${i === 0 ? ' active' : ''}" onclick="seekPractice(${i})">
        <div class="num">${i + 1}</div>
        <div class="name">${escapeHtml(m.name)}</div>
        <div class="duration">${escapeHtml(m.duration || '')}</div>
      </div>`).join('') : '<div style="color:var(--text-light);font-size:13px;">动作加载失败</div>';
  }
  const explain = document.getElementById('practiceExplain');
  if (explain) {
    explain.innerHTML = moves.map((m, i) => `
      <div class="card-beige" style="min-width:200px;text-align:center;">
        <div style="font-size:28px;color:var(--accent);font-weight:600;">${i + 1}</div>
        <div style="font-weight:500;">${escapeHtml(m.name)}</div>
        <div style="font-size:13px;color:var(--text-light);">${escapeHtml(m.duration || '')}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:4px;line-height:1.5;">${escapeHtml(m.desc || '配合自然呼吸，动作缓慢舒展')}</div>
      </div>`).join('');
  }
  const meta = PRACTICE_META[group];
  const titleEl = document.getElementById('practiceSeqTitle');
  if (titleEl && meta) titleEl.textContent = meta.title;
  const hintEl = document.getElementById('practiceSeqHint');
  if (hintEl && meta) hintEl.textContent = meta.hint;
  const timeEl = document.getElementById('practiceTime');
  if (timeEl) timeEl.textContent = moves.length ? `0:00 / ${fmtPracticeTime(moves.length * PRACTICE_STEP)}` : '0:00 / 0:00';
  const bar = document.getElementById('practiceBar');
  if (bar) bar.style.width = '0%';
}

const PRACTICE_STEP = 15; // 带练引导中每式停留 15 秒（原型节奏）
function fmtPracticeTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function startPractice() {
  if (!practiceMovesCache.length) { toast('动作还在加载，请稍候'); return; }
  if (practiceTimer) { stopPractice(); return; }
  const total = practiceMovesCache.length * PRACTICE_STEP;
  let elapsed = 0;
  highlightMove(0);
  setPracticePlaying(true);
  toast('开始跟练，配合呼吸慢慢来 🌿');
  practiceTimer = setInterval(() => {
    elapsed += 1;
    const bar = document.getElementById('practiceBar');
    if (bar) bar.style.width = Math.min(100, (elapsed / total) * 100) + '%';
    const timeEl = document.getElementById('practiceTime');
    if (timeEl) timeEl.textContent = fmtPracticeTime(Math.min(elapsed, total)) + ' / ' + fmtPracticeTime(total);
    const idx = Math.min(practiceMovesCache.length - 1, Math.floor(elapsed / PRACTICE_STEP));
    highlightMove(idx);
    if (elapsed >= total) {
      stopPractice();
      toast('完成一遍，气血舒展，给自己点个赞 🌿', 'success');
    }
  }, 1000);
}
function seekPractice(i) {
  if (!practiceTimer || !practiceMovesCache.length) return;
  // 带练中点击动作：从该式重新计时较复杂，这里仅做高亮提示
  highlightMove(i);
  toast(`当前动作：${practiceMovesCache[i].name}`);
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
  if (ev && ev.currentTarget) ev.currentTarget.classList.add('active');
  const tabs = ['symptom', 'medicine', 'chronic'];
  tabs.forEach((t, i) => {
    const el = document.getElementById('recordTab' + (i + 1));
    if (el) el.style.display = tab === t ? 'block' : 'none';
  });
  if (tab === 'chronic') switchChronic(currentChronic);
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
    list.innerHTML = '<div style="color:var(--text-light);font-size:14px;">还没有症状记录，点上方症状标签快速记录</div>';
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
  set('pfAvatar', (p.name || '松').charAt(0));
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

// 我的：档案 / 收藏视图切换
function switchProfileView(view, mi) {
  document.querySelectorAll('.profile-menu .mi').forEach(m => m.classList.remove('active'));
  if (mi) mi.classList.add('active');
  const favCard = document.getElementById('viewFavorites');
  const cards = document.querySelectorAll('.pf-view-card');
  if (view === 'favorites') {
    if (favCard) favCard.style.display = '';
    cards.forEach(c => c.style.display = 'none');
    renderFavList();
  } else {
    if (favCard) favCard.style.display = 'none';
    cards.forEach(c => c.style.display = '');
  }
}
function renderFavList() {
  const el = document.getElementById('favList');
  if (!el) return;
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
function removeFav(name) {
  saveFavs(getFavs().filter(f => f.name !== name));
  toast('已移除收藏');
  renderFavList();
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

// ============ 菜单切换 ============
function initProfileMenu() {
  document.querySelectorAll('.profile-menu .mi').forEach(mi => {
    mi.addEventListener('click', () => {
      document.querySelectorAll('.profile-menu .mi').forEach(m => m.classList.remove('active'));
      mi.classList.add('active');
    });
  });
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  initTagRows();
  initProfileMenu();

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

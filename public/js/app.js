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

// ============ 页面切换 ============
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) {
    page.classList.add('active');
  }
  if (name !== 'login') {
    document.getElementById('navbar').style.display = 'block';
    const navItems = document.querySelectorAll(`#navMenu a[data-page="${name}"], #mobileDrawer a[data-page="${name}"]`);
    document.querySelectorAll('#navMenu a, #mobileDrawer a').forEach(a => a.classList.remove('active'));
    navItems.forEach(a => a.classList.add('active'));
  }
  document.body.classList.remove('drawer-open');
  window.scrollTo(0, 0);

  if (name === 'home') loadHomeData();
  if (name === 'care') loadAcupoints();
  if (name === 'diet') loadDietData();
  if (name === 'clothing') loadClothing();
  if (name === 'rhythm') loadExercise();
  if (name === 'practice') loadPracticeMoves();
  if (name === 'chat') { scrollChatToBottom(); refreshChatOverview(); }
  if (name === 'record') { loadSymptomRecords(); loadMedicines(); }
  if (name === 'profile') loadProfile();
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
    showPage('home');
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
    showPage('home');
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
        <button class="btn btn-sm btn-outline btn-block">开始按揉</button>
      </div>
    </div>
  `).join('');
}

async function openAcuDetail(id) {
  const res = await fetchAPI('/care/acupoints/' + id);
  if (!res.success || !res.data) {
    alert('穴位详情加载失败，请稍后重试');
    return;
  }
  const a = res.data;
  alert(
    a.name + '（' + a.tag + '）\n\n'
    + '功效：' + a.effect + '\n'
    + '定位：' + a.location + '\n'
    + '手法：' + a.method + '\n'
    + '时长：' + a.duration + '\n'
    + '频次：' + a.frequency
  );
}

async function generateRecipe() {
  const input = document.getElementById('footbathInput');
  const status = input ? input.value.trim() : '';
  if (!status) {
    // 前端拦截空输入
    alert('请输入你今天的状态，如：失眠多梦、手脚冰凉');
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
      </div>`;
  } else {
    alert(res.message || '配方生成失败，请稍后重试');
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
    const grid = document.getElementById('recipeGrid');
    if (grid) {
      grid.innerHTML = r3.data.map(r => `
        <div class="recipe-card">
          <div class="time-tag">${escapeHtml(r.time)}</div>
          <div style="height:110px;background:var(--card-beige);display:flex;align-items:center;justify-content:center;font-size:40px;">\u{1F372}</div>
          <div class="recipe-body">
            <h4>${escapeHtml(r.name)}</h4>
            <div class="ingr">${escapeHtml(r.ingredients)}</div>
          </div>
        </div>`).join('');
    }
  }
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

async function loadExercise() {
  const grid = document.getElementById('exerciseGrid');
  if (!grid) return;
  const res = await fetchAPI('/rhythm/exercise');
  if (!res.success || !Array.isArray(res.data)) return;
  grid.innerHTML = res.data.map(e => `
    <div class="acu-card-grid">
      <div class="img-area">${escapeHtml(e.icon || '\u{1F9CD}')}</div>
      <div class="card-body">
        <h4>${escapeHtml(e.name)}</h4>
        <span class="tag tag-primary">${escapeHtml(e.tag)}</span>
        <div class="effect">${escapeHtml(e.duration)}</div>
        <button class="btn btn-sm btn-outline btn-block">跟着做</button>
      </div>
    </div>`).join('');
}

async function selectMood(el) {
  el.parentElement.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const mood = el.querySelector('.text').textContent;
  const res = await fetchAPI('/rhythm/mood', {
    method: 'POST',
    body: JSON.stringify({ mood }),
  });
  if (!res.success) alert(res.message || '情绪记录失败，请稍后重试');
}

// ============ AI对话 ============
let chatSessionId = null;

function renderChatBubble(role, text) {
  const avatar = role === 'user' ? '\u{1F9D1}' : '\u{1F33F}';
  const safeText = escapeHtml(text).replace(/\n/g, '<br>');
  return `<div class="chat-msg ${role}"><div class="avatar">${avatar}</div><div class="bubble">${safeText}</div></div>`;
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
    chatArea.innerHTML += renderChatBubble('ai', res.data.reply);
  } else {
    chatArea.innerHTML += renderChatBubble('ai', res.message || '抱歉，我暂时无法回复，请稍后再试~');
  }
  scrollChatToBottom();
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

async function generatePrescription() {
  const res = await fetchAPI('/chat/prescription');
  const area = document.getElementById('prescriptionArea');
  if (res.success && res.data && area) {
    const d = res.data;
    area.innerHTML = `
      <div style="background:var(--card-beige);border-radius:8px;padding:12px;margin-bottom:8px;">
        <b>\u{1F33F} 情绪建议</b><br>${escapeHtml(d.emotion)}
      </div>
      <div style="background:var(--card-beige);border-radius:8px;padding:12px;margin-bottom:8px;">
        <b>\u{1F450} 养生动作</b><br>${escapeHtml(d.action)}
      </div>
      <div style="background:var(--card-beige);border-radius:8px;padding:12px;">
        <b>\u{1F49B} 暖心话</b><br>${escapeHtml(d.warm)}
      </div>
    `;
  } else if (area) {
    area.innerHTML = '<div style="color:var(--text-light);font-size:14px;">' + escapeHtml(res.message || '处方生成失败，请稍后重试') + '</div>';
  }
}

// ============ 功法带练 ============
async function loadPracticeMoves() {
  const list = document.getElementById('moveList');
  if (!list) return;
  const res = await fetchAPI('/practice/moves');
  if (!res.success || !Array.isArray(res.data)) return;
  list.innerHTML = res.data.map((m, i) => `
    <div class="move-item${i === 0 ? ' active' : ''}">
      <div class="num">${i === 0 ? '\u25B6' : i + 1}</div>
      <div class="name">${escapeHtml(m.name)}</div>
      <div class="duration">${escapeHtml(m.duration)}</div>
    </div>`).join('');
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
  if (!name) { alert('请先选择症状'); return; }
  const res = await fetchAPI('/record/symptoms', {
    method: 'POST',
    body: JSON.stringify({ symptom: name, severity, cause }),
  });
  if (!res.success) {
    alert(res.message || '记录失败，请稍后重试');
    return;
  }
  hideSymptomForm();
  const causeEl = document.getElementById('sfCause');
  if (causeEl) causeEl.value = '';
  loadSymptomRecords();
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
      <div class="mc-left"><div class="name">${escapeHtml(m.name)}</div><div class="dose">${escapeHtml(m.dose)}</div></div>
      <div class="mc-right">
        <div style="font-size:13px;color:var(--text-light);margin-bottom:4px;">${escapeHtml(m.time)}</div>
        <div class="punch" data-id="${m.id}" onclick="punchMed(this)" title="打卡">&nbsp;</div>
      </div>
    </div>`).join('');
}

async function punchMed(el) {
  const id = el.dataset.id;
  if (!id) return;
  const res = await fetchAPI('/record/medicines/' + id + '/punch', { method: 'POST' });
  if (!res.success) {
    alert(res.message || '打卡失败，请稍后重试');
    return;
  }
  el.classList.add('done');
  el.textContent = '\u2713';
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

// ============ 移动端抽屉导航 ============
function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const mask = document.getElementById('drawerMask');
  const closeDrawer = () => document.body.classList.remove('drawer-open');

  toggle?.addEventListener('click', () => {
    document.body.classList.toggle('drawer-open');
  });
  mask?.addEventListener('click', closeDrawer);
  document.querySelectorAll('#mobileDrawer a').forEach(a => {
    a.addEventListener('click', () => {
      closeDrawer();
      showPage(a.dataset.page);
    });
  });
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  initTagRows();
  initProfileMenu();
  initMobileNav();

  document.querySelectorAll('#navMenu a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showPage(a.dataset.page);
    });
  });

  // 登录态持久化：有 token 时自动恢复登录，失效则留在登录页
  if (getToken()) {
    const res = await fetchAPI('/auth/me');
    if (res.success && res.data) {
      window.currentUser = res.data;
      showPage('home');
    } else {
      clearLogin();
    }
  }
});

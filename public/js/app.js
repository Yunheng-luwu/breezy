/**
 * 松序 - 前端应用逻辑
 * 处理页面切换、用户交互、API调用
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

// ============ 页面切换 ============
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) {
    page.classList.add('active');
    page.classList.add('fade-in');
  }
  if (name !== 'login') {
    document.getElementById('navbar').style.display = 'flex';
    document.querySelectorAll('#navMenu a, #mobileDrawer a').forEach(a => a.classList.remove('active'));
    const navItems = document.querySelectorAll(`#navMenu a[data-page="${name}"], #mobileDrawer a[data-page="${name}"]`);
    navItems.forEach(navItem => navItem.classList.add('active'));
  }
  window.scrollTo(0, 0);

  if (name === 'home') loadHomeData();
  if (name === 'care') loadAcupoints();
  if (name === 'diet') loadDietData();
  if (name === 'clothing') loadClothing();
  if (name === 'chat') scrollChatToBottom();
  if (name === 'record') loadSymptomRecords();
}

// ============ 登录 ============
const loginTips = [
  '按揉太冲穴5分钟可疏解生气后的胸闷感',
  '玫瑰花茶疏肝理气，适合日常饮用',
  '23点前入睡，让肝胆经正常排毒',
  '每天散步15分钟，气机自然通畅'
];
let tipIdx = 0;

function rotateTips() {
  const el = document.getElementById('loginTips');
  if (!el) return;
  tipIdx = (tipIdx + 1) % loginTips.length;
  el.style.opacity = 0;
  setTimeout(() => {
    el.textContent = '\u{1F4A1} ' + loginTips[tipIdx];
    el.style.opacity = 1;
  }, 300);
}

function countdown(btn) {
  let s = 60;
  btn.disabled = true;
  btn.textContent = s + '秒后重发';
  const timer = setInterval(() => {
    s--;
    btn.textContent = s + '秒后重发';
    if (s <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = '获取验证码';
    }
  }, 1000);
}

async function sendCode(btn) {
  const phone = document.getElementById('loginPhone').value.trim();
  if (!/^1\d{10}$/.test(phone)) {
    alert('请输入正确的手机号');
    return;
  }
  const res = await fetchAPI('/auth/send-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
  if (res.success) {
    if (res.devCode) {
      const codeInput = document.getElementById('loginCode');
      if (codeInput && !codeInput.value) codeInput.value = res.devCode;
    }
    countdown(btn);
  } else {
    alert(res.message || '验证码发送失败');
  }
}

async function loginSuccess() {
  const phone = document.getElementById('loginPhone').value.trim();
  const code = document.getElementById('loginCode').value.trim();
  if (!/^1\d{10}$/.test(phone)) { alert('请输入正确的手机号'); return; }
  if (!code) { alert('请输入验证码'); return; }

  const res = await fetchAPI('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
  if (res.success && res.token) {
    saveLogin(res.token, res.user);
    showPage('home');
  } else {
    alert(res.message || '登录失败，请重试');
  }
}

// ============ 首页数据加载 ============
async function loadHomeData() {
  const res = await fetchAPI('/health/dashboard');
  if (res.success && res.data) {
    const d = res.data;
    const scoreEl = document.querySelector('.ts-left .score');
    const descEl = document.querySelector('.ts-left .desc');
    if (scoreEl && d.score !== undefined) scoreEl.textContent = d.score;
    if (descEl && d.desc) descEl.textContent = d.desc;
  }
}

// ============ 待办事项 ============
function toggleTodo(el) {
  el.classList.toggle('done');
  el.textContent = el.classList.contains('done') ? '\u2713' : '';
  const text = el.parentElement.querySelector('.text');
  if (text) text.classList.toggle('done');
}

function markAllDone() {
  document.querySelectorAll('#todoList .check').forEach(c => {
    c.classList.add('done');
    c.textContent = '\u2713';
    const text = c.parentElement.querySelector('.text');
    if (text) text.classList.add('done');
  });
}

// ============ 居家保健 ============
function switchCareTab(tab, ev) {
  document.querySelectorAll('#page-care .tab-bar .tab').forEach(t => t.classList.remove('active'));
  ev.currentTarget.classList.add('active');
  document.getElementById('careTab1').style.display = tab === 'acupoint' ? 'block' : 'none';
  document.getElementById('careTab2').style.display = tab === 'footbath' ? 'block' : 'none';
}

async function loadAcupoints() {
  const res = await fetchAPI('/care/acupoints?category=stress');
  if (res.success && res.data && res.data.length > 0) {
    const grid = document.querySelector('#careTab1 .card-grid-3');
    if (!grid) return;
    grid.innerHTML = res.data.map(a => `
      <div class="acu-card-grid" onclick="openAcuDetail(${a.id})">
        <div class="img-area">${a.icon || '\u{1F9B6}'}</div>
        <div class="card-body">
          <h4>${a.name}</h4>
          <span class="tag tag-primary">${a.tag}</span>
          <div class="effect">${a.effect}</div>
          <button class="btn btn-sm btn-outline btn-block">开始按揉</button>
        </div>
      </div>
    `).join('');
  }
}

function openAcuDetail(id) {
  alert('穴位详情面板：定位图 + 取穴说明 + 按揉手法 + 语音引导');
}

async function generateRecipe() {
  const input = document.getElementById('footbathInput');
  const status = input ? input.value.trim() : '';
  if (!status) {
    alert('请输入你今天的状态');
    return;
  }
  const res = await fetchAPI('/care/footbath', {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
  if (res.success && res.data) {
    alert('AI已根据「' + status + '」为你生成：' + res.data.name);
  } else {
    alert(res.message || '生成失败，请稍后再试');
  }
}

function startTimer(btn) {
  let seconds = 1200;
  btn.textContent = '泡脚中...';
  btn.disabled = true;
  const timer = setInterval(() => {
    seconds -= 60;
    if (seconds <= 0) {
      clearInterval(timer);
      btn.textContent = '泡脚完成';
      btn.disabled = false;
      alert('泡脚时间到！请擦干双脚，准备休息~');
    }
  }, 60000);
}

// ============ 饮食调理 ============
async function loadDietData() {
  const res = await fetchAPI('/diet/recommend');
  if (res.success && res.data) {
    const el = document.querySelector('.diet-recommend .dr-left');
    if (el && res.data.principle) {
      el.querySelector('div[style*="font-size:18px"]').textContent = res.data.principle;
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
  set('wcEmoji', d.weather);
  set('wcTemp', d.temp + '°C');
  set('wcCity', d.city + ' · ' + (d.weatherText || ''));
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
  ev.currentTarget.classList.add('active');
  const tabs = ['sleep', 'exercise', 'mood'];
  tabs.forEach((t, i) => {
    const el = document.getElementById('rhythmTab' + (i + 1));
    if (el) el.style.display = tab === t ? 'block' : 'none';
  });
}

function selectMood(el) {
  el.parentElement.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  const mood = el.querySelector('.text').textContent;
  fetchAPI('/rhythm/mood', {
    method: 'POST',
    body: JSON.stringify({ mood }),
  });
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

async function generatePrescription() {
  const res = await fetchAPI('/chat/prescription');
  const area = document.getElementById('prescriptionArea');
  if (res.success && res.data && area) {
    const d = res.data;
    area.innerHTML = `
      <div style="background:var(--bg-beige);border-radius:8px;padding:12px;margin-bottom:8px;">
        <b>\u{1F33F} 情绪建议</b><br>${d.emotion}
      </div>
      <div style="background:var(--bg-beige);border-radius:8px;padding:12px;margin-bottom:8px;">
        <b>\u{1F450} 养生动作</b><br>${d.action}
      </div>
      <div style="background:var(--bg-beige);border-radius:8px;padding:12px;">
        <b>\u{1F49B} 暖心话</b><br>${d.warm}
      </div>
    `;
  }
}

// ============ 功法带练 ============
const practicePanelMap = {
  baduanjin: ['practiceTab1', 'practiceTab1Extra'],
  stretch: ['practiceTab2'],
  office: ['practiceTab3'],
};

function switchPracticeTab(tab, ev) {
  document.querySelectorAll('#page-practice .tab-bar .tab').forEach(t => t.classList.remove('active'));
  ev.currentTarget.classList.add('active');
  const visiblePanels = practicePanelMap[tab] || [];
  ['practiceTab1', 'practiceTab1Extra', 'practiceTab2', 'practiceTab3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = visiblePanels.includes(id) ? 'block' : 'none';
  });
}

// ============ 健康记录 ============
function switchRecordTab(tab, ev) {
  document.querySelectorAll('#page-record .tab-bar .tab').forEach(t => t.classList.remove('active'));
  ev.currentTarget.classList.add('active');
  const tabs = ['symptom', 'medicine', 'chronic'];
  tabs.forEach((t, i) => {
    const el = document.getElementById('recordTab' + (i + 1));
    if (el) el.style.display = tab === t ? 'block' : 'none';
  });
}

async function loadSymptomRecords() {
  const res = await fetchAPI('/record/symptoms');
  if (res.success && res.data) {
    const list = document.querySelector('#recordTab1 .col-8 .card');
    if (!list) return;
    const items = res.data.map(r => `
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
        <div><b>${r.symptom}</b> · ${r.severity}</div>
        <div style="color:var(--text-light);">${r.time} · ${r.cause}</div>
      </div>
    `).join('');
    const existing = list.querySelector('h3');
    if (existing) {
      let next = existing.nextElementSibling;
      while (next) {
        const tmp = next.nextElementSibling;
        if (next.tagName !== 'H3') next.remove();
        next = tmp;
      }
      existing.insertAdjacentHTML('afterend', items);
    }
  }
}

// ============ 标签切换通用 ============
function initTagRows() {
  document.querySelectorAll('.tag-row').forEach(row => {
    row.querySelectorAll('.tag-chip').forEach(chip => {
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

// ============ 导航栏滚动 ============
function initNavScroll() {
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (!nav) return;
    if (window.scrollY > 20) {
      nav.style.background = 'rgba(255,255,255,0.95)';
      nav.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
    } else {
      nav.style.background = 'rgba(255,255,255,0.85)';
      nav.style.boxShadow = 'none';
    }
  });
}

// ============ HTML转义 ============
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  initTagRows();
  initProfileMenu();
  initNavScroll();
  initMobileNav();

  document.querySelectorAll('#navMenu a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showPage(a.dataset.page);
    });
  });

  setInterval(rotateTips, 3000);

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

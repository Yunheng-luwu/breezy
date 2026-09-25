/**
 * 松序 AI 测试台前端逻辑
 * 只负责与独立服务 /api/chat 通信，不含任何回复逻辑
 */

const API_BASE = window.location.origin;

let sessionId = null;
let sending = false;

const chatBox = document.getElementById('chatBox');
const input = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addMessage(role, text, options = {}) {
  const { guardType = '', isError = false } = options;
  const avatar = role === 'user' ? '🧑' : '🌿';
  let extra = '';
  if (guardType) {
    const labelMap = {
      emergency: '安全拦截 · 急症提示',
      self_harm: '安全拦截 · 危机干预',
      medication: '安全拦截 · 用药边界',
    };
    extra = `<span class="guard-tag">${labelMap[guardType] || '安全拦截'}</span><br>`;
  }
  const cls = ['msg', role];
  if (guardType) cls.push('guard');
  if (isError) cls.push('error');

  const div = document.createElement('div');
  div.className = cls.join(' ');
  div.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble">${extra}${escapeHtml(text)}</div>`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
  return div;
}

function setSending(state) {
  sending = state;
  sendBtn.disabled = state;
  input.disabled = state;
}

async function send(text) {
  const message = text.trim();
  if (!message || sending) return;

  addMessage('user', message);
  input.value = '';
  setSending(true);

  const loading = addMessage('ai', '正在思考…');

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId }),
    });
    const json = await res.json();
    loading.remove();

    if (json.success && json.data) {
      sessionId = json.data.sessionId;
      document.getElementById('storageBadge').textContent =
        `存储：${json.data.storage === 'db' ? 'MySQL' : '内存（重启丢失）'}`;
      addMessage('ai', json.data.reply, {
        guardType: json.data.safetyLevel === 'normal' ? '' : json.data.safetyLevel,
      });
    } else {
      addMessage('ai', json.message || '服务暂时不可用，请稍后再试', { isError: true });
    }
  } catch (err) {
    loading.remove();
    addMessage('ai', '网络连接失败，请确认 AI 服务已启动', { isError: true });
  } finally {
    setSending(false);
    input.focus();
  }
}

function newChat() {
  sessionId = null;
  chatBox.innerHTML = `
    <div class="msg ai">
      <div class="avatar">🌿</div>
      <div class="bubble">新的对话开始了，跟我说说你现在的状态吧。
        <div class="meta">会话将在你发出第一条消息后创建</div>
      </div>
    </div>`;
  input.focus();
}

async function loadHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const json = await res.json();
    if (json.success) {
      const d = json.data;
      document.getElementById('storageBadge').textContent =
        `存储：${d.storage === 'db' ? 'MySQL' : '内存（重启丢失）'}`;
      document.getElementById('keyBadge').textContent =
        `模型：${d.keyConfigured ? 'Key 已配置' : 'Key 未配置'}`;
      document.getElementById('keyBadge').style.color = d.keyConfigured ? '' : 'var(--danger)';
    }
  } catch (err) {
    document.getElementById('storageBadge').textContent = '服务离线';
  }
}

sendBtn.addEventListener('click', () => send(input.value));
input.addEventListener('keydown', e => {
  if (e.key === 'Enter') send(input.value);
});
document.getElementById('newChatBtn').addEventListener('click', newChat);
document.querySelectorAll('.quick button').forEach(btn => {
  btn.addEventListener('click', () => send(btn.textContent));
});

loadHealth();
input.focus();

/**
 * AI 跟练姿态识别模块（MediaPipe tasks-vision：Pose Full + Hands）
 * 纯前端推理，视频不上传。模型/wasm 全部走本站路径，后期上线前把 AI_MODEL_BASE 改成 OSS/CDN 即可。
 *
 * 对外接口（挂载在 window.AIPose）：
 *   AIPose.start(video, canvas, opts)  启动识别循环
 *   AIPose.stop()                       停止循环并释放
 *   AIPose.setAction(name)              切换当前动作（评分规则按动作分发）
 */

// ===== 资源路径（集中配置，换 CDN 只改这里）=====
const AI_MODEL_BASE = 'ai-models/';
const AI_WASM_PATH = AI_MODEL_BASE + 'wasm';
const POSE_MODEL_URL = AI_MODEL_BASE + 'pose_landmarker_full.task';
const HAND_MODEL_URL = AI_MODEL_BASE + 'hand_landmarker.task';

// ===== MediaPipe Pose 33 关键点索引 =====
const P = {
  LS: 11, RS: 12, LE: 13, RE: 14, LW: 15, RW: 16,
  LH: 23, RH: 24, LK: 25, RK: 26, LA: 27, RA: 28,
  LTOE: 31, RTOE: 32,
  LEAR: 7, REAR: 8,
};

// 预备式门禁阈值（2026-10-23 按实测采样校准：稳定帧 脚宽比1.29~1.47 / 手对髋-0.06~0.03 / 手前z0.28~0.38 / 手距0.090~0.096）
const PREP = {
  feetRatioLo: 1.10,   // 踝距 / 肩宽 下限（实测稳定值≥1.29）
  feetRatioHi: 1.60,   // 上限（实测稳定值≤1.47）
  handYLo: -0.09,      // 腕相对髋的 y 差范围（实测 -0.06~0.03）
  handYHi: 0.10,
  frontZ: 0.12,        // 肩z-腕z，越大手越靠前（实测稳定0.28~0.38，过渡帧≤0.05）
  wristDistLo: 0.06,   // 实测稳定 0.090~0.096
  wristDistHi: 0.15,
  holdMs: 800,         // 预备姿势稳定多久才放行
};

// 收式阈值（2026-10-25 按实测采样校准：丹田叠放时 手髋差 -0.078~-0.110 / 腕距 0.039~0.050）
const SHOUSHI = {
  handBelowLo: -0.20,  // 腕 y - 髋 y 下限（负=手在髋上方，实测 -0.078~-0.110）
  handBelowHi: 0.05,   // 上限（允许略低于髋）
  handDistHi: 0.10,    // 双手叠放间距上限（实测 0.039~0.050）
  holdMs: 2000,        // 收式静养保持时长
};

// 调试面板：URL 带 ?posebug=1 时显示实测数值，用于核对打分阈值
const POSE_DEBUG = /[?&]posebug=1\b/.test(location.search);
let debugEl = null;
function ensureDebugPanel() {
  if (!POSE_DEBUG || debugEl || !canvasEl || !canvasEl.parentElement) return;
  debugEl = document.createElement('div');
  debugEl.className = 'af-pose-debug';
  debugEl.style.cssText =
    'position:absolute;top:8px;right:8px;z-index:3;' +
    'background:rgba(0,0,0,.78);color:#d8ffe9;font:12px/1.55 ui-monospace,Consolas,monospace;' +
    'padding:8px 10px;border-radius:8px;max-width:52%;max-height:92%;overflow:auto;' +
    'text-shadow:0 1px 2px #000;';
  debugEl.innerHTML =
    '<div style="margin-bottom:4px;white-space:nowrap">' +
    '<button type="button" data-act="copy" data-bodyonly style="pointer-events:auto;cursor:pointer;margin-right:6px;padding:2px 8px;border:0;border-radius:4px;background:#3ee6a8;color:#063;font-weight:bold">复制数据</button>' +
    '<button type="button" data-act="clear" data-bodyonly style="pointer-events:auto;cursor:pointer;margin-right:6px;padding:2px 8px;border:0;border-radius:4px;background:#444;color:#eee">清空</button>' +
    '<button type="button" data-act="toggle" style="pointer-events:auto;cursor:pointer;padding:2px 8px;border:0;border-radius:4px;background:#2a6f86;color:#d8ffe9">收起</button>' +
    '<span data-msg style="margin-left:8px;color:#ffd166"></span></div>' +
    '<div data-body>' +
    '<div data-live style="white-space:pre"></div>' +
    '<div data-rows style="white-space:pre;margin-top:6px;border-top:1px solid #345;padding-top:4px"></div>' +
    '</div>';
  debugEl.addEventListener('click', (e) => {
    const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
    if (act === 'copy') copyDebugData();
    if (act === 'clear') { tuotian.records.length = 0; staticSamples.length = 0; renderLastDebug = null; }
    if (act === 'toggle') {
      const collapsed = debugEl.classList.toggle('af-pose-debug-collapsed');
      const body = debugEl.querySelector('[data-body]');
      e.target.textContent = collapsed ? '展开面板' : '收起';
      if (body) body.style.display = collapsed ? 'none' : '';
      debugEl.style.maxWidth = collapsed ? 'none' : '52%';
      debugEl.querySelectorAll('[data-bodyonly]').forEach(btn => {
        btn.style.display = collapsed ? 'none' : '';
      });
      const msgEl = debugEl.querySelector('[data-msg]');
      if (msgEl && collapsed) {
        msgEl.textContent = tuotian.records.length ? ('已记' + tuotian.records.length + '次') : '';
      } else if (msgEl) {
        msgEl.textContent = '';
      }
    }
  });
  canvasEl.parentElement.appendChild(debugEl);
}
// 非安全上下文（http IP）下 clipboard API 可能不可用，用 execCommand 兜底
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); }
    catch (err) { reject(err); }
    finally { ta.remove(); }
  });
}
function copyDebugData() {
  const msgEl = debugEl.querySelector('[data-msg]');
  const say = (t) => { if (msgEl) { msgEl.textContent = t; setTimeout(() => msgEl.textContent = '', 2500); } };
  // 预备式 / 收式：导出采样帧
  if (currentAction === '预备式' || currentAction === '收式') {
    if (!staticSamples.length) { say('还没有采到数据，先让骨架出现并摆好姿势'); return; }
    let header, lines;
    if (currentAction === '预备式') {
      header = '预备式\tt(s)\tok\t脚宽比\t手对髋L\t手对髋R\t手前zL\t手前zR\t手距\t脚宽\t高度\t前伸\t间距';
      lines = staticSamples.map(s => [s.t, s.ok, s.ratio, s.yL, s.yR, s.zL, s.zR, s.wd,
        s.feetOk, s.heightOk, s.frontOk, s.spaceOk].join('\t'));
    } else {
      header = '收式\tt(s)\tok\t手髋下L\t手髋下R\t腕距\t手距H\t手数\t位置\t叠放';
      lines = staticSamples.map(s => [s.t, s.ok, s.belowL, s.belowR, s.wrist, s.hand,
        s.hands, s.belowOk, s.closeOk].join('\t'));
    }
    copyText(header + '\n' + lines.join('\n')).then(
      () => say('已复制 ' + lines.length + ' 帧，去聊天框粘贴'),
      () => { if (msgEl) msgEl.textContent = '复制失败，请手动选择文本'; }
    );
    return;
  }
  // 其余 7 式：通用测量模式，导出全部指标
  if (GENERIC_ACTIONS.indexOf(currentAction) >= 0) {
    if (!staticSamples.length) { say('还没有采到数据，先让骨架出现并按标准动作做'); return; }
    const header = currentAction + '\tt(s)\t腕高\t前推z\t手距\t肘L\t肘R\t膝L\t膝R\t脚宽比\t髋高\t手踝L\t手踝R\t手髋距\t侧倾\t前倾\t重心\t头偏\t髋脚尖\t髋y';
    const lines = staticSamples.map(s => [s.t, s.wY, s.pushZ, s.gap, s.elbL, s.elbR, s.kneeL, s.kneeR,
      s.feet, s.hipH, s.ankL, s.ankR, s.handHip, s.leanS, s.leanF, s.cog, s.yaw, s.hipToe, s.hipY].join('\t'));
    copyText(header + '\n' + lines.join('\n')).then(
      () => say('已复制 ' + lines.length + ' 帧，去聊天框粘贴'),
      () => { if (msgEl) msgEl.textContent = '复制失败，请手动选择文本'; }
    );
    return;
  }
  if (!tuotian.records.length) {
    if (msgEl) { msgEl.textContent = '还没有完成一次上托，先让骨架出现再做动作'; setTimeout(() => msgEl.textContent = '', 2500); }
    return;
  }
  const header = '次 时长 腕高过耳 前推z 肘角 比肩 手距H 腕距P 头宽比 膝上 膝下 抬头 腕偏移 顶端肘角 到位s |判:垂 直 交 停';
  const lines = tuotian.records.map(r =>
    [r.i, r.dur.toFixed(2), nz(r.topMin), nz(r.pushMax), Math.round(r.angMin),
     nz(r.raiseMin), nz(r.handMin), nz(r.wristMin), r.xInRatio.toFixed(2),
     r.kneeBefore === null || r.kneeBefore === undefined ? '-' : Math.round(r.kneeBefore),
     r.kneeAfter === null || r.kneeAfter === undefined ? '-' : Math.round(r.kneeAfter),
     nz(r.faceMin),
     r.xDevMax === undefined ? '-' : r.xDevMax.toFixed(2),
     r.angTop === null || r.angTop === undefined ? '-' : Math.round(r.angTop),
     r.holdTop === undefined ? '-' : r.holdTop.toFixed(2),
     '|', r.v, r.s, r.c, r.h].join('\t'));
  copyText(header + '\n' + lines.join('\n')).then(
    () => { const m = debugEl.querySelector('[data-msg]'); if (m) { m.textContent = '已复制，去聊天框粘贴'; setTimeout(() => m.textContent = '', 2500); } },
    () => { const m = debugEl.querySelector('[data-msg]'); if (m) m.textContent = '复制失败，请手动选择文本'; }
  );
}
function nz(v) { return (v === null || v === undefined) ? '-' : v.toFixed(2); }
function dbg(ok) { return ok ? '<span style="color:#3ee6a8">✓</span>' : '<span style="color:#ff7676">✗</span>'; }
function fmt(n, len = 5) {
  if (n === null || n === undefined || Number.isNaN(n)) return '  -  ';
  return (n >= 0 ? '+' : '') + n.toFixed(2).padStart(len, ' ');
}
let renderLastDebug = null;
function renderDebug(m, actionType) {
  if (!POSE_DEBUG) return;
  ensureDebugPanel();
  if (!debugEl) return;
  const live = debugEl.querySelector('[data-live]');
  const rows = debugEl.querySelector('[data-rows]');
  if (!live) return;
  const diagLine =
    `推理 ${diag.delegate} 帧${diag.frames} 检出${diag.detOK} 点${diag.lastPts || 0} canvas${diag.canvasSize || '-'}` +
    (diag.switching ? ' [切换中…]' : '') + '\n' +
    (diag.handErr ? `手部异常(兜底中)\n` : '') +
    (diag.drawErr ? `绘制错误: ${String(diag.drawErr).slice(0, 60)}\n` : '') +
    (diag.inferErr ? `错误: ${String(diag.inferErr).slice(0, 70)}\n` : '');
  if (!m) {
    live.innerHTML = diagLine + (diag.inferErr
      ? '推理持续异常，等待自动恢复…如长时间无改善请截图发我'
      : `当前帧未检出人体\n请正对摄像头、光线明亮、与背景有反差`);
    return;
  }
  // ===== 预备式：只显示 checkPrep 指标，供阈值校准 =====
  if (actionType === 'prep' && m.prep) {
    const p = m.prep;
    live.innerHTML = diagLine +
      `【预备式】阈值待校准（候选值见右侧 ✓/✗）\n` +
      `位置y 髋${p.hYL === null ? '-' : p.hYL.toFixed(2)}/${p.hYR === null ? '-' : p.hYR.toFixed(2)} 膝${p.kYL === null ? '-' : p.kYL.toFixed(2)}/${p.kYR === null ? '-' : p.kYR.toFixed(2)} 踝${p.aYL === null ? '-' : p.aYL.toFixed(2)}/${p.aYR === null ? '-' : p.aYR.toFixed(2)}\n` +
      `踝vis L${p.aVisL === null ? '  - ' : p.aVisL.toFixed(2)} R${p.aVisR === null ? '  - ' : p.aVisR.toFixed(2)} ${p.feetSkipped ? ' 脚宽:跳过' : ''}\n` +
      `脚宽比 ${p.ratio === null ? '  - ' : p.ratio.toFixed(2)}${dbg(p.feetOk)}  候选 ${PREP.feetRatioLo}~${PREP.feetRatioHi}\n` +
      `手对髋 L${fmt(p.yL)} R${fmt(p.yR)}${dbg(p.heightOk)}  候选 ${PREP.handYLo}~${PREP.handYHi}\n` +
      `手在前 L${fmt(p.zL)} R${fmt(p.zR)}${dbg(p.frontOk)}  候选 >${PREP.frontZ}\n` +
      `手距 ${fmt(p.wd)}${dbg(p.spaceOk)}  候选 ${PREP.wristDistLo}~${PREP.wristDistHi}\n` +
      `稳住 ${(p.holdMs / 1000).toFixed(2)}s${dbg(p.holdMs >= PREP.holdMs)}  候选 ${(PREP.holdMs / 1000).toFixed(1)}s${staticHold.done ? '  ✓已完成' : ''}`;
    if (rows) rows.innerHTML = '已采样 ' + staticSamples.length + ' 帧（每 0.5s 一帧）\n点上方「复制数据」导出，粘贴到聊天框发我';
    return;
  }
  // ===== 收式：手在丹田 + 双手叠放指标 =====
  if (actionType === 'shoushi') {
    const s = m;
    live.innerHTML = diagLine +
      `【收式】阈值已校准\n` +
      `手在髋下 L${fmt(s.handBelowHipL)}${dbg(s.belowOk)} R${fmt(s.handBelowHipR)}${dbg(s.belowOk)}  候选 ${SHOUSHI.handBelowLo}~${SHOUSHI.handBelowHi}\n` +
      `腕距 Pose ${fmt(s.wristDist)}${dbg(s.closeOk)}  (Hands ${s.handsCount}只)  候选 <${SHOUSHI.handDistHi}\n` +
      `稳住 ${(s.holdMs / 1000).toFixed(2)}s${dbg(s.holdMs >= SHOUSHI.holdMs)}  候选 ${(SHOUSHI.holdMs / 1000).toFixed(1)}s${staticHold.done ? '  ✓已完成' : ''}\n` +
      `达标时双手叠放于小腹丹田，记录上述数值范围`;
    if (rows) rows.innerHTML = '已采样 ' + staticSamples.length + ' 帧（每 0.5s 一帧）\n点上方「复制数据」导出，粘贴到聊天框发我';
    return;
  }
  // ===== 通用测量模式（其余 7 式）：只采集指标 =====
  if (actionType === 'generic' && m) {
    const rate = currentAction === '背后七颠百病消' ? '0.25s' : '0.5s';
    live.innerHTML = diagLine +
      `【${currentAction}】测量模式 · 每 ${rate} 记录一帧\n` +
      `腕高/躯干 ${fmt(m.wY)} (负=高于肩)  前推z ${fmt(m.pushZ)}\n` +
      `手距 ${fmt(m.handGap)}  手髋距 ${fmt(m.handHip)}\n` +
      `肘角 L ${degFmt(m.elbL)} R ${degFmt(m.elbR)}\n` +
      `膝角 L ${degFmt(m.kneeL)} R ${degFmt(m.kneeR)}\n` +
      `脚宽比 ${fmt(m.feetRatio)}  髋高 ${fmt(m.hipH)}\n` +
      `髋脚尖 ${fmt(m.hipToeH)}  髋y ${fmt(m.hipY)} (越小=越高)\n` +
      `手踝 L ${fmt(m.wAnkL)} R ${fmt(m.wAnkR)}\n` +
      `侧倾 ${degFmt(m.leanSide)}  前倾 ${fmt(m.leanFwd)}  重心 ${fmt(m.cog)}\n` +
      `头偏 ${fmt(m.yaw)}  耳vis差 ${fmt(m.earVisDiff)}\n` +
      `要点：${GENERIC_TIPS[currentAction] || ''}`;
    if (rows) rows.innerHTML = '已采样 ' + staticSamples.length + ' 帧（每 ' + rate + ' 一帧）\n点上方「复制数据」导出，粘贴到聊天框发我';
    return;
  }
  let prepLine = '';
  if (m.prep) {
    const p = m.prep;
    prepLine =
      `位置y(大=靠下) 髋${p.hYL === null ? '-' : p.hYL.toFixed(2)}/${p.hYR === null ? '-' : p.hYR.toFixed(2)} 膝${p.kYL === null ? '-' : p.kYL.toFixed(2)}/${p.kYR === null ? '-' : p.kYR.toFixed(2)} 踝${p.aYL === null ? '-' : p.aYL.toFixed(2)}/${p.aYR === null ? '-' : p.aYR.toFixed(2)}\n` +
      `踝vis L${p.aVisL === null ? '  - ' : p.aVisL.toFixed(2)} R${p.aVisR === null ? '  - ' : p.aVisR.toFixed(2)} ${p.feetSkipped ? ' 脚宽检查:跳过' : ''}\n` +
      `预备 脚宽比 ${p.ratio === null ? '  - ' : p.ratio.toFixed(2)}${dbg(p.feetOk)}  手对髋 L${fmt(p.yL)} R${fmt(p.yR)}${dbg(p.heightOk)}\n` +
      `      手在前 L${fmt(p.zL)} R${fmt(p.zR)}${dbg(p.frontOk)}  手距${fmt(p.wd)}${dbg(p.spaceOk)}  稳住 ${(p.holdMs / 1000).toFixed(2)}s\n`;
  }
  live.innerHTML = diagLine + prepLine +
    `腕高过耳     L${fmt(m.topL)} R${fmt(m.topR)}  参考值（负=腕高于耳）\n` +
    `垂直偏移     ${nz(m.xDev)}${dbg(m.xDev < 0.14)}  腕与肩水平偏移 阈值<0.14（判「垂」）\n` +
    `腕比肩高     L${fmt(m.raiseL)}${dbg(m.raiseL > 0.03)} R${fmt(m.raiseR)}${dbg(m.raiseR > 0.03)}  当前区间线>0.03\n` +
    `肘角          ${String(Math.round(m.angL)).padStart(3)}°${dbg(m.angL > 150)}   ${String(Math.round(m.angR)).padStart(3)}°${dbg(m.angR > 150)}   仅提示，不扣分\n` +
    `手距  Hands ${fmt(m.handDist)}${dbg(m.handDist !== null && m.handDist < 0.09)} (${m.handsCount}只)  Pose ${fmt(m.wristDist)}${dbg(m.wristDist < 0.08)}  判「交」阈值<0.08\n` +
    `前推(耳z-腕z)L${fmt(m.pushL)}${dbg(m.pushL < 0.12)} R${fmt(m.pushR)}${dbg(m.pushR < 0.12)}  正=手前伸 阈值<0.12\n` +
    `腕在头宽内    L${dbg(m.xInL)} R${dbg(m.xInR)}\n` +
    `膝角          ${m.kneeAng === null || m.kneeAng === undefined ? ' -  ' : String(Math.round(m.kneeAng)).padStart(3)}°   抬头比 ${nz(m.faceRatio)}  (直立≥165° 抬头看手时抬头比变小)\n` +
    `停留 ${(m.heldMs / 1000).toFixed(2)}s${dbg(m.heldMs >= 700)}  up=${m.up ? 1 : 0} 已计次=${m.reps}`;
  if (tuotian.records.length !== (renderLastDebug || 0)) {
    renderLastDebug = tuotian.records.length;
    rows.innerHTML = '已记录 ' + tuotian.records.length + ' 次上托（做完点上方“复制数据”）\n' +
      tuotian.records.slice(-8).map(r =>
        `#${r.i} ${r.dur.toFixed(1)}s 高${nz(r.topMin)} 推${nz(r.pushMax)} 肘${Math.round(r.angMin)} 交${nz(r.handMin)}/${nz(r.wristMin)} 膝${r.kneeBefore === null || r.kneeBefore === undefined ? '-' : Math.round(r.kneeBefore)}/${r.kneeAfter === null || r.kneeAfter === undefined ? '-' : Math.round(r.kneeAfter)} 抬${nz(r.faceMin)} 宽${r.xInRatio.toFixed(2)} [${r.v}${r.s}${r.c}${r.h}]`
      ).join('\n');
  }
}

// 各动作目标次数（与 practices.json 一致；后续可由调用方传入）
const ACTION_TARGET_REPS = {
  '预备式': 1,
  '收式': 1,
  '两手托天理三焦': 6,
  '左右开弓似射雕': 6,
  '调理脾胃须单举': 6,
  '五劳七伤往后瞧': 6,
  '摇头摆尾去心火': 6,
  '两手攀足固肾腰': 6,
  '攥拳怒目增气力': 6,
  '背后七颠百病消': 7,
};

// ===== 运行时状态 =====
let tv = null;           // tasks-vision 模块
let poseLM = null;
let handLM = null;
let videoEl = null;
let canvasEl = null;
let ctx = null;
let rafId = null;
let running = false;
let lastVideoTime = -1;
let currentAction = '两手托天理三焦';
// 换式冷却：刚开始新动作时，身体还停留在上一式的收势姿态，直接评测会把过渡动作误判成一次有效计次。
// 冷却期内只画骨架、不评测，给人时间回到起始位。
const ACTION_ARM_DELAY_MS = 2200;
let armedAt = 0;
let scoreCb = null;
let repCb = null;
let statusCb = null;

// 托天动作状态机
const tuotian = {
  phase: 'prep',      // 'prep'=预备式门禁中，'go'=可以开始计次
  prepOkStart: 0,     // 预备姿势连续达标的起始时间
  up: false,          // 是否处于“上托到位”区间
  upStart: 0,
  heldLongEnough: false,
  best: null,         // 上托区间内最佳一帧的达标情况
  reps: 0,
  deduction: 0,
  cur: null,          // 调试用：当前上托区间的指标极值
  records: [],        // 调试用：每次上托结算后的记录
};

// 静态动作（预备式/收式）：姿势达标并保持够时长即算完成一次
const staticHold = { start: 0, done: false, everDone: false };
// 静态动作的指标采样（每 500ms 一帧，供"复制数据"导出）
const staticSamples = [];
let staticLastSampleAt = 0;
function pushStaticSample(obj, minMs) {
  const now = performance.now();
  const gapMs = minMs || 500;
  if (now - staticLastSampleAt < gapMs) return;
  staticLastSampleAt = now;
  staticSamples.push(obj);
  if (staticSamples.length > 200) staticSamples.shift();
}

function visOK(p) {
  return !!p && (p.visibility === undefined || p.visibility > 0.4);
}
// 任意点是否落在画面内（脚尖等无需判断上下关系的部位用）
function pointOK(p) {
  if (!p) return false;
  return p.x > -0.03 && p.x < 1.03 && p.y > 0 && p.y < 0.995 &&
         (p.visibility === undefined || p.visibility > 0.15);
}
// 脚部放宽：MediaPipe 对脚踝可见度估计常偏低，只要点落在画面内、
// 位置在膝下方，且可见度不是极低（>0.15），即认为脚已入镜
function footOK(ankle, knee) {
  if (!ankle) return false;
  const inFrame = ankle.x > -0.03 && ankle.x < 1.03 &&
                  ankle.y > 0 && ankle.y < 0.995;
  const vis = ankle.visibility === undefined || ankle.visibility > 0.15;
  const belowKnee = !knee || ankle.y > knee.y - 0.02;
  return inFrame && vis && belowKnee;
}
// 膝盖可见即认为“躯干+大部分下肢”已入镜（笔记本前置摄像头常拍不到脚，降级依据）
function kneeOK(knee, hip) {
  if (!knee) return false;
  const inFrame = knee.x > -0.03 && knee.x < 1.03 && knee.y > 0 && knee.y < 0.995;
  const vis = knee.visibility === undefined || knee.visibility > 0.2;
  const belowHip = !hip || knee.y > hip.y - 0.02;
  return inFrame && vis && belowHip;
}

// 预备式检查：站姿（尽力而为）+ 双手腹前抱球
// 双脚可见 → 检查与肩同宽；双脚不可见但双膝可见 → 跳过脚宽（软提示），不拦截
// 返回 { ok, hint, p }，p 为调试指标
function checkPrep(lm) {
  const ls = lm[P.LS], rs = lm[P.RS], lw = lm[P.LW], rw = lm[P.RW];
  const lh = lm[P.LH], rh = lm[P.RH], la = lm[P.LA], ra = lm[P.RA];
  const lk = lm[P.LK], rk = lm[P.RK];
  const p = { ratio: null, yL: null, yR: null, zL: null, zR: null, wd: null,
              feetOk: false, feetSkipped: false, heightOk: false, frontOk: false, spaceOk: false, holdMs: 0,
              aVisL: la && la.visibility !== undefined ? la.visibility : null,
              aVisR: ra && ra.visibility !== undefined ? ra.visibility : null,
              aYL: la ? la.y : null, aYR: ra ? ra.y : null,
              kYL: lk ? lk.y : null, kYR: rk ? rk.y : null,
              hYL: lh ? lh.y : null, hYR: rh ? rh.y : null };

  const feetSeen = footOK(la, lk) && footOK(ra, rk);
  const kneesSeen = kneeOK(lk, lh) && kneeOK(rk, rh);
  if (!feetSeen && !kneesSeen) {
    return { ok: false, hint: '请退后一些，让腰部和双手进入画面', p };
  }

  if (feetSeen) {
    const shoulderDx = Math.abs(ls.x - rs.x);
    p.ratio = shoulderDx > 1e-6 ? Math.abs(la.x - ra.x) / shoulderDx : 0;
    p.feetOk = p.ratio >= PREP.feetRatioLo && p.ratio <= PREP.feetRatioHi;
  } else {
    // 脚没入镜：不拦截，标记跳过（条件允许时再退后可获得站姿评分）
    p.feetSkipped = true;
    p.feetOk = true;
  }

  p.yL = lw.y - lh.y; p.yR = rw.y - rh.y;
  p.heightOk = p.yL > PREP.handYLo && p.yL < PREP.handYHi &&
               p.yR > PREP.handYLo && p.yR < PREP.handYHi;

  // z：MediaPipe 中越靠近相机 z 越小，肩z-腕z 为正说明手在身体前方
  p.zL = ls.z - lw.z; p.zR = rs.z - rw.z;
  p.frontOk = p.zL > PREP.frontZ && p.zR > PREP.frontZ;

  p.wd = dist(lw, rw);
  p.spaceOk = p.wd > PREP.wristDistLo && p.wd < PREP.wristDistHi;

  if (!p.feetOk) return { ok: false, hint: '请双脚分开与肩同宽，脚尖朝前', p };
  if (!p.heightOk || !p.spaceOk) {
    return { ok: false, hint: '请在小腹前双手合抱，掌心向上，指尖相对，如抱球状', p };
  }
  if (!p.frontOk) return { ok: false, hint: '双手在小腹前抱球，不要贴在身上', p };
  return {
    ok: true,
    hint: p.feetSkipped ? '抱球姿势正确（空间允许请退后露出双脚），稳住调匀呼吸…'
                        : '预备姿势很好，稳住，调匀呼吸…',
    p,
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function angleDeg(a, b, c) {
  // b 为顶点的夹角（度）
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-6 || m2 < 1e-6) return 0;
  let cos = dot / (m1 * m2);
  cos = Math.max(-1, Math.min(1, cos));
  return Math.acos(cos) * 180 / Math.PI;
}

// ===== 模型加载（GPU 优先，失败回退 CPU）=====
// 诊断信息（供调试面板显示）
const diag = { delegate: '-', frames: 0, detOK: 0, inferErr: '', handErr: '', switching: false };
let inferFailCount = 0;

async function createLandmarkers(onStatus, forceDelegate) {
  // 释放旧实例（用于 GPU 推理失败后重建 CPU 实例）
  if (poseLM) { try { poseLM.close(); } catch (e) {} poseLM = null; }
  if (handLM) { try { handLM.close(); } catch (e) {} handLM = null; }
  onStatus && onStatus(forceDelegate
    ? `正在切换到 ${forceDelegate} 推理模式…`
    : '正在加载 AI 模型（首次约 26MB）…');
  if (!tv) {
    tv = await import('../ai-models/vision_bundle.mjs?v=20261005-2');
  }
  const fileset = await tv.FilesetResolver.forVisionTasks(AI_WASM_PATH);

  const tryCreate = (delegate) => Promise.all([
    tv.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL + '?v=1', delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    }),
    tv.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL + '?v=1', delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    }),
  ]);

  // 指定 CPU 时只试 CPU；否则 GPU 重试 2 次后回退 CPU
  const delegates = forceDelegate ? [forceDelegate] : ['GPU', 'GPU', 'CPU'];
  let lastErr = null;
  for (let attempt = 0; attempt < delegates.length; attempt++) {
    const delegate = delegates[attempt];
    try {
      if (!forceDelegate && attempt > 0) onStatus && onStatus(`GPU 不可用，切换 CPU 重试（${attempt}/${delegates.length - 1}）…`);
      [poseLM, handLM] = await tryCreate(delegate);
      diag.delegate = delegate;
      diag.inferErr = '';
      return;
    } catch (e) {
      lastErr = e;
      console.warn(`AI 模型加载第 ${attempt} 次失败：`, e);
      // GPU delegate 不支持时（创建阶段报 GPU 相关错误）下一轮换 CPU
      await new Promise(r => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

// ===== 骨架绘制（canvas 与 video 同样 scaleX(-1)，直接用原始归一化坐标即可对齐）=====
const SKEL_COLOR = '#3ee6a8';
const JOINT_COLOR = '#ffffff';
function drawSkeleton(poseLms, handLmsList, w, h) {
  ctx.clearRect(0, 0, w, h);
  if (poseLms && poseLms.length && tv.PoseLandmarker.POSE_CONNECTIONS) {
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.strokeStyle = SKEL_COLOR;
    ctx.shadowColor = 'rgba(62,230,168,.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    tv.PoseLandmarker.POSE_CONNECTIONS.forEach((c) => {
      // 兼容 tasks-vision 两种连接格式：数组 [a,b] 或对象 {start,end}
      const a = Array.isArray(c) ? c[0] : c.start;
      const b = Array.isArray(c) ? c[1] : c.end;
      const pa = poseLms[a], pb = poseLms[b];
      if (!pa || !pb) return;
      // 低可见度（遮挡）的连线不画
      if ((pa.visibility !== undefined && pa.visibility < 0.4) ||
          (pb.visibility !== undefined && pb.visibility < 0.4)) return;
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
    });
    ctx.stroke();
    // 关节点（可见度门槛放宽到 0.2，暗光下也能看到点）
    ctx.shadowBlur = 0;
    ctx.fillStyle = JOINT_COLOR;
    const r = Math.max(2.5, w * 0.005);
    poseLms.forEach(p => {
      if (!p || (p.visibility !== undefined && p.visibility < 0.2)) return;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // 手部 21 点
  if (handLmsList && handLmsList.length) {
    ctx.lineWidth = Math.max(1.5, w * 0.003);
    ctx.strokeStyle = '#ffd166';
    ctx.fillStyle = '#fff';
    const hr = Math.max(2, w * 0.0035);
    handLmsList.forEach(hand => {
      if (tv.HandLandmarker.HAND_CONNECTIONS) {
        ctx.beginPath();
        tv.HandLandmarker.HAND_CONNECTIONS.forEach((c) => {
          const a = Array.isArray(c) ? c[0] : c.start;
          const b = Array.isArray(c) ? c[1] : c.end;
          ctx.moveTo(hand[a].x * w, hand[a].y * h);
          ctx.lineTo(hand[b].x * w, hand[b].y * h);
        });
        ctx.stroke();
      }
      hand.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, hr, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }
}

// ===== 托天理三焦：逐帧评估 =====
// 返回 { up, liveHint }，并在动作下落时完成一次计次与扣分
function evalTuotian(poseLms, handLmsList) {
  const target = ACTION_TARGET_REPS[currentAction] || 6;
  if (!poseLms || poseLms.length < 17) {
    return { liveHint: '请让全身进入画面', m: null };
  }
  const lm = poseLms;
  const ls = lm[P.LS], rs = lm[P.RS], le = lm[P.LE], re = lm[P.RE], lw = lm[P.LW], rw = lm[P.RW];
  const lear = lm[P.LEAR], rear = lm[P.REAR];
  const lh = lm[P.LH], rh = lm[P.RH], lk = lm[P.LK], rk = lm[P.RK], la = lm[P.LA], ra = lm[P.RA];

  // ---- 每帧度量（打分与调试共用）----
  const earOk = !!(lear && rear &&
    (lear.visibility === undefined || lear.visibility > 0.4) &&
    (rear.visibility === undefined || rear.visibility > 0.4));
  const angL = angleDeg(ls, le, lw);
  const angR = angleDeg(rs, re, rw);
  const wristDist = dist(lw, rw);
  const handsCount = handLmsList ? handLmsList.length : 0;
  const handDist = handsCount >= 2 ? dist(handLmsList[0][9], handLmsList[1][9]) : null;
  const topL = earOk ? lear.y - lw.y : null;
  const topR = earOk ? rear.y - rw.y : null;
  const pushL = earOk ? lear.z - lw.z : null;
  const pushR = earOk ? rear.z - rw.z : null;
  const headLo = earOk ? Math.min(lear.x, rear.x) - 0.03 : null;
  const headHi = earOk ? Math.max(lear.x, rear.x) + 0.03 : null;

  // 膝角（髋-膝-踝）：直立≈170°+，屈膝明显变小；可见度差时为 null
  const kneeAngL = (lh && lk && la) ? angleDeg(lh, lk, la) : null;
  const kneeAngR = (rh && rk && ra) ? angleDeg(rh, rk, ra) : null;
  const kneeAng = minOf(kneeAngL, kneeAngR);
  // 抬头近似：鼻-肩线竖直距离 / 肩宽，抬头看手时变小，低头平视时偏大
  const nose = lm[0];
  const shoulderW = Math.abs(ls.x - rs.x);
  const faceRatio = (nose && nose.visibility > 0.3)
    ? ((ls.y + rs.y) / 2 - nose.y) / (shoulderW || 0.2) : null;

  // 1) 双臂举过肩（画面 y 向下，越小越高）
  const raised = lw.y < ls.y - 0.03 && rw.y < rs.y - 0.03;
  // 2) 垂直上托而非前推（手腕基本在肩正上方）：实测稳定偏移 0.10，阈值放到 0.14 留容错
  const vertical = Math.abs(lw.x - ls.x) < 0.14 && Math.abs(rw.x - rs.x) < 0.14;
  // 3) 肘伸直
  const leftStraight = angL > 150;
  const rightStraight = angR > 150;
  const straight = leftStraight && rightStraight;
  // 4) 双手在头顶靠近（交叉相扣）：实测腕距 0.00~0.01，兜底阈值收到 0.08
  const close = handDist !== null ? handDist < 0.09 : wristDist < 0.08;

  const m = {
    topL, topR,
    raiseL: ls.y - lw.y, raiseR: rs.y - rw.y,
    angL, angR,
    xDev: Math.max(Math.abs(lw.x - ls.x), Math.abs(rw.x - rs.x)),
    handDist, handsCount, wristDist,
    pushL, pushR,
    xInL: headLo !== null && lw.x >= headLo && lw.x <= headHi,
    xInR: headLo !== null && rw.x >= headLo && rw.x <= headHi,
    kneeAng, faceRatio,
    heldMs: 0, up: false, reps: tuotian.reps, prep: null,
  };

  // ---- 预备式门禁：没站好预备姿势不开始计次（不扣分）----
  if (tuotian.phase === 'prep') {
    const prep = checkPrep(lm);
    m.prep = prep.p;
    if (prep.ok) {
      if (!tuotian.prepOkStart) tuotian.prepOkStart = performance.now();
      m.prep.holdMs = performance.now() - tuotian.prepOkStart;
      if (m.prep.holdMs >= PREP.holdMs) {
        tuotian.phase = 'go';
        return { liveHint: '预备姿势正确，双手交叉上托，开始第 1 次', m };
      }
      return { liveHint: prep.hint, m };
    }
    tuotian.prepOkStart = 0;
    return { liveHint: prep.hint, m };
  }

  let liveHint = '';

  if (raised && !tuotian.up) {
    // 进入上托区间
    tuotian.up = true;
    tuotian.upStart = performance.now();
    tuotian.heldLongEnough = false;
    tuotian.best = { vertical, straight, close };
    if (POSE_DEBUG) {
      tuotian.cur = {
        topMin: minOf(topL, topR), pushMax: maxOf(pushL, pushR),
        angMin: Math.min(angL, angR), raiseMin: Math.min(ls.y - lw.y, rs.y - rw.y),
        handMin: handDist, wristMin: wristDist,
        kneeBefore: null, kneeAfter: null, faceMin: null,
        xInFrames: 0, raisedFrames: 0,
        xDevMax: 0, angTop: null, holdTop: 0, lastTopAt: 0,
      };
    }
  }

  if (tuotian.up) {
    // 记录区间内“最好的一次”
    tuotian.best.vertical = tuotian.best.vertical || vertical;
    tuotian.best.straight = tuotian.best.straight || straight;
    tuotian.best.close = tuotian.best.close || close;
    if (performance.now() - tuotian.upStart >= 700) tuotian.heldLongEnough = true;

    // 调试：累计本区间极值
    if (POSE_DEBUG && tuotian.cur) {
      const c = tuotian.cur;
      c.raisedFrames++;
      if (minOf(topL, topR) !== null) c.topMin = Math.min(c.topMin, minOf(topL, topR));
      if (maxOf(pushL, pushR) !== null) c.pushMax = Math.max(c.pushMax, maxOf(pushL, pushR));
      c.angMin = Math.min(c.angMin, angL, angR);
      c.raiseMin = Math.min(c.raiseMin, ls.y - lw.y, rs.y - rw.y);
      c.wristMin = Math.min(c.wristMin, wristDist);
      if (handDist !== null) c.handMin = c.handMin === null ? handDist : Math.min(c.handMin, handDist);
      // 膝角分窗：双腕距收到肩宽之前（上托+停留+下落前半）vs 之后（下落后半）
      if (kneeAng !== null) {
        if (wristDist < shoulderW - 0.02) c.kneeBefore = c.kneeBefore === null ? kneeAng : Math.min(c.kneeBefore, kneeAng);
        else c.kneeAfter = c.kneeAfter === null ? kneeAng : Math.min(c.kneeAfter, kneeAng);
      }
      if (faceRatio !== null) c.faceMin = c.faceMin === null ? faceRatio : Math.min(c.faceMin, faceRatio);
      const xInL = headLo !== null && lw.x >= headLo && lw.x <= headHi;
      const xInR = headLo !== null && rw.x >= headLo && rw.x <= headHi;
      if (xInL && xInR) c.xInFrames++;
      // 垂直判据实测：腕相对肩的水平偏移（阈值 0.12）
      c.xDevMax = Math.max(c.xDevMax, Math.abs(lw.x - ls.x), Math.abs(rw.x - rs.x));
      // 顶端姿态实测：仅统计「手臂举起且双腕高于耳」的帧，避免起手过渡帧污染
      const nowT = performance.now();
      const topY = minOf(topL, topR);
      const atTop = raised && topY !== null && topY < -0.02;
      if (atTop) {
        if (c.lastTopAt) c.holdTop += nowT - c.lastTopAt;
        c.lastTopAt = nowT;
        const aTop = minOf(angL, angR);
        if (aTop !== null && aTop !== undefined) c.angTop = c.angTop === null ? aTop : Math.min(c.angTop, aTop);
      } else {
        c.lastTopAt = 0;
      }
    }

    if (raised) {
      // 仍在上托：实时提示最需要改进的一项
      if (!close) liveHint = '双手在头顶交叉相扣';
      else if (!straight) liveHint = '手臂再伸直一些';
      else if (!vertical) liveHint = '垂直向上托，不要向前推';
      else if (!tuotian.heldLongEnough) liveHint = '到位，保持一会儿…';
      else liveHint = '很好，缓慢下落呼气';
    } else {
      // 下落 → 结算这一次
      const b = tuotian.best;
      let minus = 0;
      const problems = [];
      if (!b.vertical) { minus += 10; problems.push('未垂直上托'); }
      // 「手臂伸直」实测肘角在头顶交叉时被遮挡失真，改为仅提示不扣分
      if (!b.straight) problems.push('手臂可以再伸直一点（不扣分）');
      if (!b.close) { minus += 8; problems.push('双手未交叉'); }
      if (!tuotian.heldLongEnough) { minus += 6; problems.push('停留时间不足'); }
      tuotian.deduction += minus;
      tuotian.reps += 1;
      const score = Math.max(0, 100 - tuotian.deduction);
      // 先落盘本次记录，再回调（回调可能触发自动结束并停止识别）
      if (POSE_DEBUG && tuotian.cur) {
        const c = tuotian.cur;
        tuotian.records.push({
          i: tuotian.reps,
          dur: (performance.now() - tuotian.upStart) / 1000,
          topMin: c.topMin, pushMax: c.pushMax, angMin: c.angMin,
          raiseMin: c.raiseMin, handMin: c.handMin, wristMin: c.wristMin,
          kneeBefore: c.kneeBefore, kneeAfter: c.kneeAfter, faceMin: c.faceMin,
          xInRatio: c.raisedFrames ? c.xInFrames / c.raisedFrames : 0,
          xDevMax: c.xDevMax, angTop: c.angTop, holdTop: c.holdTop / 1000,
          v: b.vertical ? 1 : 0, s: b.straight ? 1 : 0,
          c: b.close ? 1 : 0, h: tuotian.heldLongEnough ? 1 : 0,
        });
        if (tuotian.records.length > 30) tuotian.records.shift();
        tuotian.cur = null;
      }
      scoreCb && scoreCb(score);
      repCb && repCb(tuotian.reps, target, problems);
      tuotian.up = false;
      liveHint = tuotian.reps >= target
        ? `已完成 ${target} 次，当前得分 ${score}`
        : `第 ${tuotian.reps} 次完成${problems.length ? '：' + problems.join('、') + '（' + minus + '分）' : '，标准'}，继续`;
    }
  } else if (!raised) {
    liveHint = '双手上托至头顶，开始第 ' + Math.min(tuotian.reps + 1, target) + ' 次';
  }

  m.heldMs = tuotian.up ? performance.now() - tuotian.upStart : 0;
  m.up = tuotian.up;
  return { liveHint, m };
}

// ===== 预备式：输出实测指标供阈值校准 + 达标保持计次 =====
function evalPrep(poseLms, handLmsList) {
  if (!poseLms || poseLms.length < 17) {
    staticHold.start = 0;
    return { liveHint: '请让全身进入画面', m: null };
  }
  const prep = checkPrep(poseLms);
  const p = prep.p;
  if (!prep.ok) {
    staticHold.start = 0;
    staticHold.done = false;   // 姿势离开后重置，方便反复测
    p.holdMs = 0;
  } else {
    if (!staticHold.start) staticHold.start = performance.now();
    p.holdMs = performance.now() - staticHold.start;
  }
  pushStaticSample({
    t: (p.holdMs / 1000).toFixed(2), ok: prep.ok ? 1 : 0,
    ratio: p.ratio === null ? '' : p.ratio.toFixed(3),
    yL: p.yL.toFixed(3), yR: p.yR.toFixed(3),
    zL: p.zL.toFixed(3), zR: p.zR.toFixed(3),
    wd: p.wd.toFixed(3),
    feetOk: p.feetOk ? 1 : 0, heightOk: p.heightOk ? 1 : 0,
    frontOk: p.frontOk ? 1 : 0, spaceOk: p.spaceOk ? 1 : 0,
  });
  let liveHint = prep.hint;
  if (staticHold.done) {
    liveHint = '预备式已完成 ✓ 调匀呼吸，可以开始第一式';
  } else if (p.holdMs >= PREP.holdMs) {
    staticHold.done = true;
    staticHold.everDone = true;
    if (repCb) repCb(1, ACTION_TARGET_REPS[currentAction] || 1, []);
    liveHint = '预备式完成 ✓ 调匀呼吸，准备开始第一式';
  } else if (staticHold.everDone) {
    liveHint = '预备式已完成 ✓ ｜ 当前：' + prep.hint;
  }
  return { liveHint, m: { prep: p } };
}

// ===== 收式：手在丹田（小腹）位置，双手叠放 + 达标保持计次 =====
let shoushiEpoch = 0;   // 收式采样起始时刻，用于导出 t 列
function evalShoushi(poseLms, handLmsList) {
  if (!poseLms || poseLms.length < 17) {
    staticHold.start = 0;
    return { liveHint: '请让全身进入画面', m: null };
  }
  const lm = poseLms;
  const ls = lm[P.LS], rs = lm[P.RS], lw = lm[P.LW], rw = lm[P.RW];
  const lh = lm[P.LH], rh = lm[P.RH];
  const wristDist = dist(lw, rw);
  const handsCount = handLmsList ? handLmsList.length : 0;
  const handDist = handsCount >= 2 ? dist(handLmsList[0][9], handLmsList[1][9]) : null;
  const handBelowHipL = lw.y - lh.y;
  const handBelowHipR = rw.y - rh.y;

  const belowOk = handBelowHipL >= SHOUSHI.handBelowLo && handBelowHipL <= SHOUSHI.handBelowHi &&
                  handBelowHipR >= SHOUSHI.handBelowLo && handBelowHipR <= SHOUSHI.handBelowHi;
  // 以 Pose 双腕距为准：叠放时实测 0.039~0.050，Hands 在双手叠合时经常只认出 1 只，不可靠
  const closeOk = wristDist < SHOUSHI.handDistHi;

  const poseOk = belowOk && closeOk;
  if (!poseOk) {
    staticHold.start = 0;
    staticHold.done = false;   // 姿势离开后重置，方便反复测
  } else if (!staticHold.start) {
    staticHold.start = performance.now();
  }
  const holdMs = staticHold.start ? performance.now() - staticHold.start : 0;

  const m = {
    handBelowHipL, handBelowHipR,
    wristDist, handDist, handsCount,
    belowOk, closeOk, holdMs,
  };
  if (!shoushiEpoch) shoushiEpoch = performance.now();
  pushStaticSample({
    t: ((performance.now() - shoushiEpoch) / 1000).toFixed(2), ok: poseOk ? 1 : 0,
    belowL: handBelowHipL.toFixed(3), belowR: handBelowHipR.toFixed(3),
    wrist: wristDist.toFixed(3),
    hand: handDist === null ? '' : handDist.toFixed(3),
    hands: handsCount,
    belowOk: belowOk ? 1 : 0, closeOk: closeOk ? 1 : 0,
  });
  let liveHint = '';
  if (!belowOk) liveHint = '双手放在小腹丹田位置';
  else if (!closeOk) liveHint = '双手相叠，掌心向内';
  else liveHint = '收式到位，静养调息…';
  if (staticHold.done) {
    liveHint = '收式已完成，双手搓热浴面收功';
  } else if (holdMs >= SHOUSHI.holdMs) {
    staticHold.done = true;
    staticHold.everDone = true;
    if (repCb) repCb(1, ACTION_TARGET_REPS[currentAction] || 1, []);
    liveHint = '收式完成 ✓ 双手搓热浴面收功';
  } else if (staticHold.everDone) {
    liveHint = '收式已完成 ✓ ｜ 当前：' + liveHint;
  }
  return { liveHint, m };
}

// ===== 通用测量模式（尚未定打分的 7 式：只采集指标，供阈值测定）=====
const GENERIC_ACTIONS = [
  '左右开弓似射雕', '调理脾胃须单举', '五劳七伤往后瞧',
  '摇头摆尾去心火', '两手攀足固肾腰', '攥拳怒目增气力', '背后七颠百病消',
];
const GENERIC_TIPS = {
  '左右开弓似射雕': '马步下蹲，一手侧平举如拉弓，重点看膝角/肘角/手距',
  '调理脾胃须单举': '一手上举掌心向上、一手下按，重点看腕高与肘角',
  '五劳七伤往后瞧': '身体不动，头尽量向后转，重点看头偏与耳vis差',
  '摇头摆尾去心火': '马步俯身，头与臀反向摆动，重点看侧倾/前倾/重心',
  '两手攀足固肾腰': '直腿俯身，双手够向脚面，重点看手踝距与前倾',
  '攥拳怒目增气力': '马步冲拳，拳握紧目视前方，重点看肘角与手髋距',
  '背后七颠百病消': '踮脚起落，重点看髋脚尖起伏与脚宽比',
};
function degFmt(v) { return (v === null || v === undefined) ? '  -  ' : Math.round(v) + '°'; }
let genericT0 = 0;

// 通用指标计算（7 式测量模式与正式评测共用同一套指标）
function computeMetrics(poseLms) {
  if (!poseLms || poseLms.length < 29) return null;
  const lm = poseLms;
  const ls = lm[P.LS], rs = lm[P.RS], le = lm[P.LE], re = lm[P.RE];
  const lw = lm[P.LW], rw = lm[P.RW];
  const lh = lm[P.LH], rh = lm[P.RH], lk = lm[P.LK], rk = lm[P.RK];
  const la = lm[P.LA], ra = lm[P.RA];
  const ltoe = lm[P.LTOE], rtoe = lm[P.RTOE];
  const nose = lm[0];
  const sw = Math.abs(ls.x - rs.x);
  if (sw < 1e-4) return null;

  const shMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2, z: (lh.z + rh.z) / 2 };
  const wrMid = { x: (lw.x + rw.x) / 2, y: (lw.y + rw.y) / 2 };
  const feetSeen = footOK(la, lk) && footOK(ra, rk);
  const ankMid = feetSeen ? { x: (la.x + ra.x) / 2, y: (la.y + ra.y) / 2 } : null;
  // 脚尖（31/32）离地最少，提踵时髋相对脚尖升高 —— 七颠的"颠"靠这个判
  const toesSeen = pointOK(ltoe) && pointOK(rtoe);
  const toeMid = toesSeen ? { x: (ltoe.x + rtoe.x) / 2, y: (ltoe.y + rtoe.y) / 2 } : null;
  // 归一化基准改用「躯干长」（肩中→髋中）：转身/侧向伸展时肩宽会骤缩导致比值爆掉
  const torso = dist(shMid, hipMid);
  const u = Math.max(torso > 0.05 ? torso : sw, 0.05);

  const m = {
    sw, u,
    wY: (wrMid.y - shMid.y) / u,                                   // 腕相对肩（负=手高于肩）
    pushZ: ((ls.z - lw.z) + (rs.z - rw.z)) / 2,                    // 手在身体前方的程度
    handGap: dist(lw, rw) / u,                                     // 双手间距 / 躯干长
    elbL: visOK(le) && visOK(lw) ? angleDeg(ls, le, lw) : null,
    elbR: visOK(re) && visOK(rw) ? angleDeg(rs, re, rw) : null,
    kneeL: visOK(lk) ? angleDeg(lh, lk, la || lh) : null,
    kneeR: visOK(rk) ? angleDeg(rh, rk, ra || rh) : null,
    feetRatio: feetSeen ? dist(la, ra) / u : null,                 // 踝距 / 躯干长
    hipH: ankMid ? (ankMid.y - hipMid.y) / u : null,               // 髋到踝高度（马步/七颠起伏用）
    hipToeH: toeMid ? (toeMid.y - hipMid.y) / u : null,            // 髋到脚尖高度（提踵时增大）
    hipY: hipMid.y,                                                // 髋的绝对纵坐标（越小=越靠上）
    wAnkL: feetSeen && visOK(lw) ? dist(lw, la) / u : null,        // 手到脚踝（攀足用）
    wAnkR: feetSeen && visOK(rw) ? dist(rw, ra) / u : null,
    handHip: (dist(lw, lh) + dist(rw, rh)) / 2 / u,                // 手到髋
    leanSide: Math.atan2(shMid.x - hipMid.x, Math.abs(hipMid.y - shMid.y)) * 180 / Math.PI,
    leanFwd: (hipMid.z - shMid.z) / u,                             // 正=上身前倾
    cog: ankMid ? (hipMid.x - ankMid.x) / u : null,                // 重心左右偏移
    yaw: (nose.x - shMid.x) / u,                                   // 头部左右偏转（后瞧用）
    earVisDiff: (lm[P.LEAR].visibility || 0) - (lm[P.REAR].visibility || 0),
  };
  return m;
}

function evalGeneric(poseLms, handLmsList) {
  const m = computeMetrics(poseLms);
  if (!m) {
    return {
      liveHint: poseLms && poseLms.length >= 29 ? '请正对摄像头，保持全身入镜' : '请让全身进入画面',
      m: null,
    };
  }

  if (!genericT0) genericT0 = performance.now();
  pushStaticSample({
    t: ((performance.now() - genericT0) / 1000).toFixed(2), ok: 1,
    wY: m.wY.toFixed(3), pushZ: m.pushZ.toFixed(3), gap: m.handGap.toFixed(3),
    elbL: m.elbL === null ? '' : m.elbL.toFixed(1), elbR: m.elbR === null ? '' : m.elbR.toFixed(1),
    kneeL: m.kneeL === null ? '' : m.kneeL.toFixed(1), kneeR: m.kneeR === null ? '' : m.kneeR.toFixed(1),
    feet: m.feetRatio === null ? '' : m.feetRatio.toFixed(3),
    hipH: m.hipH === null ? '' : m.hipH.toFixed(3),
    hipToe: m.hipToeH === null ? '' : m.hipToeH.toFixed(3),
    hipY: m.hipY.toFixed(4),
    ankL: m.wAnkL === null ? '' : m.wAnkL.toFixed(3), ankR: m.wAnkR === null ? '' : m.wAnkR.toFixed(3),
    handHip: m.handHip.toFixed(3),
    leanS: m.leanSide.toFixed(1), leanF: m.leanFwd.toFixed(3),
    cog: m.cog === null ? '' : m.cog.toFixed(3), yaw: m.yaw.toFixed(3),
  }, currentAction === '背后七颠百病消' ? 250 : 500);
  const rate = currentAction === '背后七颠百病消' ? '0.25s' : '0.5s';
  return { liveHint: '测量中 · 按标准动作进行，右侧数值每 ' + rate + ' 记录一帧', m };
}

// ===================================================================
// 八段锦 7 式评测（2026-10-25 按「正对镜头」实测校准）
// 原则：2D 视角下不可靠的指标只提示不扣分（肘角遮挡、马步深度）
// ===================================================================
const BJ_STATE = {};
function bjState(name) {
  if (!BJ_STATE[name]) {
    BJ_STATE[name] = {
      inState: false, inSince: 0, outSince: 0, since: 0,
      lastRep: -1e9, reps: 0, ded: 0, stage: 0, kneeMin: 999,
      hits: 0, buf: [],
    };
  }
  return BJ_STATE[name];
}
function bjClear() { Object.keys(BJ_STATE).forEach(k => delete BJ_STATE[k]); }
function bjScore(e) { return Math.max(0, Math.round(100 - e.ded)); }

// 通用计次引擎：enter 持续 holdMs 计一次；exit（可配 exitMs 持续）后允许下一次
function bjStep(name, m, cfg) {
  if (!m) {
    const e0 = bjState(name);
    e0.inState = false; e0.inSince = 0; e0.outSince = 0; e0.since = 0;
    return { liveHint: '请让全身进入画面', m: null };
  }
  const e = bjState(name);
  const now = performance.now();
  const target = ACTION_TARGET_REPS[name] || 6;
  if (e.reps >= target) return { liveHint: `已完成 ${target} 次，得分 ${bjScore(e)}`, m };

  if (!e.inState) {
    if (!cfg.enter(m)) {
      e.inSince = 0;
      return { liveHint: cfg.prompt ? cfg.prompt(m) : '准备开始', m };
    }
    if (!e.inSince) e.inSince = now;
    const heldEnough = now - e.inSince >= (cfg.holdMs || 400);
    const farEnough = now - e.lastRep >= (cfg.gapMs || 1200);
    if (!heldEnough) return { liveHint: cfg.holdingHint || '保持住…', m };
    if (!farEnough) return { liveHint: cfg.prompt ? cfg.prompt(m) : '准备开始', m };
    // 计次（perRep=2 时左右各到位一次才算一组）
    e.inState = true; e.inSince = 0; e.lastRep = now;
    e.hits += 1;
    const per = cfg.perRep || 1;
    const counted = e.hits % per === 0;
    if (!counted) return { liveHint: cfg.halfHint || '换另一侧', m };
    e.reps += 1;
    const issues = (cfg.judge && cfg.judge(m)) || [];
    let minus = 0;
    const real = [];
    issues.forEach(it => { if (it.minus > 0) { minus += it.minus; real.push(it.text); } });
    e.ded += minus;
    const score = bjScore(e);
    scoreCb && scoreCb(score);
    repCb && repCb(e.reps, target, real);
    return {
      liveHint: e.reps >= target
        ? `已完成 ${target} 次，当前得分 ${score}`
        : `第 ${e.reps} 次完成${real.length ? '：' + real.join('、') + '（-' + minus + '分）' : '，标准'}，继续`,
      m,
    };
  }
  if (cfg.exit(m)) {
    if (!e.outSince) e.outSince = now;
    if (now - e.outSince >= (cfg.exitMs || 0)) { e.inState = false; e.outSince = 0; }
  } else {
    e.outSince = 0;
  }
  return { liveHint: cfg.inHint || '动作到位，回位准备下一次', m };
}

const CFG_SHEDIAO = {
  holdMs: 400, gapMs: 1200,
  // 手距是射雕最稳的特征（开弓 0.88~1.65 / 收弓 0.05~0.20），肘角在正视角下会漏检，只作辅助
  // 降级：两肘都被遮挡（正视角开弓常见）时不要求肘角，改用更高的手距门槛替代 —— 只放宽进入，不扣分
  enter: m => {
    if (!(m.handGap > 0.85)) return false;
    if (m.elbL === null && m.elbR === null) return m.handGap > 1.05;
    return Math.max(m.elbL || 0, m.elbR || 0) > 130;
  },
  exit: m => m.handGap < 0.60,
  judge: m => {
    const out = [];
    if (m.elbL !== null && m.elbR !== null && Math.min(m.elbL, m.elbR) > 90) out.push({ text: '拉弓的肘再屈一些', minus: 6 });
    if (m.hipH !== null && m.hipH > 1.45) out.push({ text: '马步再蹲低些（不扣分）', minus: 0 });
    if (m.feetRatio !== null && m.feetRatio < 0.75) out.push({ text: '两脚再开大些（不扣分）', minus: 0 });
    return out;
  },
  // 进入条件未满足时给出实时数值，避免"一直不计数却不知道差多少"
  prompt: m => {
    if (!m) return '请让全身进入画面（含双臂）';
    if (m.handGap <= 0.85) return '双手再拉开：当前 ' + m.handGap.toFixed(2) + '，需 > 0.85';
    if (m.elbL === null && m.elbR === null) return '把推直的手臂伸出去（肘部被遮挡，手距需 > 1.05，当前 ' + m.handGap.toFixed(2) + '）';
    return '推直的手臂再伸展：肘角 ' + Math.round(Math.max(m.elbL || 0, m.elbR || 0)) + '°，需 > 130°';
  },
  inHint: '开弓到位，收回准备换另一侧',
};

const CFG_DANJU = {
  holdMs: 800, gapMs: 1500,
  // 上手离对侧脚踝远（>3.0）、下手离脚踝近（<1.9）、双手间距大（>1.6）
  enter: m => {
    const a = [m.wAnkL, m.wAnkR].filter(v => v !== null);
    if (a.length < 2) return false;
    return Math.max(a[0], a[1]) > 3.0 && Math.min(a[0], a[1]) < 1.9 && m.handGap > 1.6;
  },
  exit: m => {
    const a = [m.wAnkL, m.wAnkR].filter(v => v !== null);
    return a.length < 2 || Math.max(a[0], a[1]) < 2.4;
  },
  judge: m => {
    const out = [];
    const upElb = (m.wAnkL !== null && m.wAnkR !== null && m.wAnkL > m.wAnkR) ? m.elbL : m.elbR;
    if (upElb !== null && upElb < 155) out.push({ text: '上举手臂再伸直些（不扣分）', minus: 0 });
    return out;
  },
  prompt: () => '一手上举、一手下按，两臂上下对拉',
  inHint: '单举到位，保持上下对拉',
};

const CFG_HOUQIAO = {
  holdMs: 500, gapMs: 900, perRep: 2,
  // 头转向一侧（|头偏|≥0.04）且双手在身后（手髋距≥0.35）；左右各转一次算一组
  enter: m => Math.abs(m.yaw) >= 0.04 && m.handHip >= 0.35,
  exit: m => Math.abs(m.yaw) <= 0.02,
  judge: m => (Math.abs(m.yaw) < 0.055 ? [{ text: '头再往后转一点', minus: 5 }] : []),
  prompt: () => '双臂在身后撑直，头向一侧后方转',
  halfHint: '已转一侧，回正后换另一侧',
  inHint: '已转到位，回正后换另一侧',
};

const CFG_BAIWEI = {
  holdMs: 1000, exitMs: 1000, gapMs: 1500,
  // 侧倾 ≥12° 保持 1s；回到 ±6° 内持续 1s 才允许再计
  enter: m => Math.abs(m.leanSide) >= 12,
  exit: m => Math.abs(m.leanSide) <= 6,
  judge: m => (Math.abs(m.leanSide) < 16 ? [{ text: '侧摆幅度再大一些', minus: 5 }] : []),
  prompt: () => '扎马步，上身前俯并向一侧摇摆',
  inHint: '已摆到最大幅度，回中再摆',
};

const CFG_ZUANQUAN = {
  holdMs: 300, gapMs: 1500,
  // 左臂前推（肘≥150 且手离髋≥0.50）；左臂屈肘≤45 后解除
  enter: m => m.elbL !== null && m.elbL >= 150 && m.handHip >= 0.50,
  exit: m => m.elbL !== null && m.elbL <= 45,
  judge: m => {
    const out = [];
    if (m.elbR !== null && m.elbR < 140) out.push({ text: '右臂在正前方伸直（不扣分）', minus: 0 });
    if (m.feetRatio !== null && m.feetRatio < 0.75) out.push({ text: '马步再开大些（不扣分）', minus: 0 });
    return out;
  },
  prompt: () => '左拳向前缓慢推出，力达拳面',
  inHint: '左拳已出，旋腕收回再发右拳',
};

function evalShediao(lm) { return bjStep('左右开弓似射雕', computeMetrics(lm), CFG_SHEDIAO); }
function evalDanju(lm) { return bjStep('调理脾胃须单举', computeMetrics(lm), CFG_DANJU); }
function evalHouqiao(lm) { return bjStep('五劳七伤往后瞧', computeMetrics(lm), CFG_HOUQIAO); }
function evalBaiwei(lm) { return bjStep('摇头摆尾去心火', computeMetrics(lm), CFG_BAIWEI); }
function evalZuanquan(lm) { return bjStep('攥拳怒目增气力', computeMetrics(lm), CFG_ZUANQUAN); }

// 背后七颠：脚尖不离地 → 用「髋到脚尖」的滚动最低值做基线，+0.05 记一次
const QIDIAN_GATE = { feetHi: 0.30, kneeLo: 165, elbLo: 155, handHipHi: 0.40, leanHi: 8 };
function evalQidian(lm) {
  const name = '背后七颠百病消';
  const m = computeMetrics(lm);
  const e = bjState(name);
  const target = ACTION_TARGET_REPS[name] || 7;
  if (!m || m.hipToeH === null) {
    e.inState = false; e.buf.length = 0;
    return { liveHint: '请让脚尖也进入画面（全身入镜）', m: null };
  }
  const bad = [];
  if (m.feetRatio !== null && m.feetRatio > QIDIAN_GATE.feetHi) bad.push('两脚并拢');
  if (m.kneeL !== null && m.kneeR !== null && Math.min(m.kneeL, m.kneeR) < QIDIAN_GATE.kneeLo) bad.push('两腿伸直');
  if (m.elbL !== null && m.elbR !== null && Math.min(m.elbL, m.elbR) < QIDIAN_GATE.elbLo) bad.push('手臂自然下垂');
  if (m.handHip > QIDIAN_GATE.handHipHi) bad.push('双手贴身');
  if (Math.abs(m.leanSide) > QIDIAN_GATE.leanHi) bad.push('身体中正');
  if (bad.length) {
    e.inState = false; e.buf.length = 0;
    return { liveHint: '调整姿势：' + bad.join('、'), m };
  }
  const now = performance.now();
  e.buf.push([now, m.hipToeH]);
  while (e.buf.length && now - e.buf[0][0] > 2000) e.buf.shift();
  let base = Infinity;
  for (let i = 0; i < e.buf.length; i++) if (e.buf[i][1] < base) base = e.buf[i][1];
  if (e.reps >= target) return { liveHint: `已完成 ${target} 次，得分 ${bjScore(e)}`, m };

  const lift = m.hipToeH - base;
  if (!e.inState) {
    if (lift >= 0.05 && now - e.lastRep >= 500) {
      e.inState = true; e.lastRep = now; e.reps += 1;
      let minus = 0;
      const real = [];
      if (lift < 0.08) { minus += 5; real.push('提踵幅度再大些'); }
      e.ded += minus;
      scoreCb && scoreCb(bjScore(e));
      repCb && repCb(e.reps, target, real);
      return {
        liveHint: e.reps >= target
          ? `已完成 ${target} 次，当前得分 ${bjScore(e)}`
          : `第 ${e.reps} 次：脚跟提起 ${(lift * 100).toFixed(0)}% 躯干高${real.length ? '，' + real.join('、') : ''}`,
        m,
      };
    }
    return { liveHint: '并步站好，脚跟缓缓提起再落下', m };
  }
  if (lift <= 0.03) e.inState = false;
  return { liveHint: '提踵到位，脚跟缓缓落下', m };
}

// 两手攀足：上举 → 俯身触脚（计次）→ 起身（解除）
function evalPanzhu(lm) {
  const name = '两手攀足固肾腰';
  const m = computeMetrics(lm);
  const e = bjState(name);
  const target = ACTION_TARGET_REPS[name] || 6;
  if (!m) {
    e.stage = 0; e.since = 0;
    return { liveHint: '请让全身进入画面', m: null };
  }
  const now = performance.now();
  if (e.reps >= target) return { liveHint: `已完成 ${target} 次，得分 ${bjScore(e)}`, m };
  const reach = [m.wAnkL, m.wAnkR].filter(v => v !== null);
  const maxAnk = reach.length ? Math.max.apply(null, reach) : null;
  const minAnk = reach.length ? Math.min.apply(null, reach) : null;

  if (e.stage === 0) {
    if (m.wY <= -0.55) {
      if (!e.since) e.since = now;
      if (now - e.since < 800) return { liveHint: '双手上举到位，保持…', m };
      e.stage = 1; e.since = 0; e.kneeMin = 999;
    } else {
      e.since = 0;
      return { liveHint: '双手上举过头，开始第 ' + Math.min(e.reps + 1, target) + ' 次', m };
    }
  }
  if (e.stage === 1) {
    if (m.kneeL !== null) e.kneeMin = Math.min(e.kneeMin, m.kneeL);
    if (m.kneeR !== null) e.kneeMin = Math.min(e.kneeMin, m.kneeR);
    if (maxAnk !== null && maxAnk <= 0.70) {
      e.stage = 2; e.reps += 1;
      let minus = 0;
      const real = [];
      if (e.kneeMin < 165) { minus += 8; real.push('屈膝了，腿要伸直'); }
      if (minAnk !== null && maxAnk - minAnk > 0.40) { minus += 6; real.push('双手触脚不同步'); }
      e.ded += minus;
      scoreCb && scoreCb(bjScore(e));
      repCb && repCb(e.reps, target, real);
      return {
        liveHint: e.reps >= target
          ? `已完成 ${target} 次，当前得分 ${bjScore(e)}`
          : `第 ${e.reps} 次触脚完成${real.length ? '：' + real.join('、') + '（-' + minus + '分）' : ''}`,
        m,
      };
    }
    return { liveHint: '俯身向下，双手攀住脚面', m };
  }
  if (maxAnk !== null && maxAnk >= 1.30) { e.stage = 0; e.since = 0; }
  return { liveHint: '缓缓起身，准备下一次上举', m };
}

const BADUANJIN_EVAL = {
  '左右开弓似射雕': evalShediao,
  '调理脾胃须单举': evalDanju,
  '五劳七伤往后瞧': evalHouqiao,
  '摇头摆尾去心火': evalBaiwei,
  '两手攀足固肾腰': evalPanzhu,
  '攥拳怒目增气力': evalZuanquan,
  '背后七颠百病消': evalQidian,
};

function minOf(a, b) {
  if (a === null || a === undefined) return (b === null || b === undefined) ? null : b;
  if (b === null || b === undefined) return a;
  return Math.min(a, b);
}
function maxOf(a, b) {
  if (a === null || a === undefined) return (b === null || b === undefined) ? null : b;
  if (b === null || b === undefined) return a;
  return Math.max(a, b);
}

// ===== 帧循环 =====
function loop() {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  if (!videoEl || videoEl.readyState < 2 || !videoEl.videoWidth) return;
  if (videoEl.currentTime === lastVideoTime) return;
  lastVideoTime = videoEl.currentTime;
  const ts = performance.now();

  // 画布分辨率跟随视频（CSS 用 object-fit:cover 与视频保持一致的裁切）
  if (canvasEl.width !== videoEl.videoWidth) {
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
  }

  let poseLms = null;
  let handLms = null;
  let poseErr = null;
  if (!poseLM || !handLM) {
    // 模型重建中（如切换 delegate），等下一帧
    renderDebug(null);
    return;
  }
  try {
    const pr = poseLM.detectForVideo(videoEl, ts);
    poseLms = pr && pr.landmarks && pr.landmarks.length ? pr.landmarks[0] : null;
  } catch (e) { poseErr = e; }
  // 手部单独 try：手部推理失败不应拖垮身体识别（评分有 Pose 兜底）
  try {
    const hr = handLM.detectForVideo(videoEl, ts + 1); // 时间戳必须严格递增
    handLms = hr && hr.landmarks ? hr.landmarks : null;
  } catch (e) { diag.handErr = (e && e.message) ? e.message : String(e); }

  diag.frames++;
  if (poseLms) diag.detOK++;

  if (poseErr) {
    // GPU 创建成功但逐帧推理失败（常见于集显/驱动兼容问题）：连续 5 帧后自动重建 CPU 实例
    diag.inferErr = 'pose推理: ' + ((poseErr && poseErr.message) ? poseErr.message : String(poseErr));
    inferFailCount++;
    renderDebug(null);
    if (inferFailCount >= 5 && !diag.switching && diag.delegate !== 'CPU') {
      diag.switching = true;
      createLandmarkers(statusCb, 'CPU')
        .then(() => {
          inferFailCount = 0;
          diag.switching = false;
          statusCb && statusCb('已自动切换为 CPU 推理，请站到画面中');
        })
        .catch(err => {
          diag.switching = false;
          diag.inferErr = 'CPU 重建失败: ' + ((err && err.message) ? err.message : String(err));
        });
    }
    return;
  }
  inferFailCount = 0;

  try {
    drawSkeleton(poseLms, handLms, canvasEl.width, canvasEl.height);
  } catch (e) {
    diag.drawErr = (e && e.message) ? e.message : String(e);
  }
  diag.lastPts = poseLms ? poseLms.length : 0;
  diag.canvasSize = canvasEl.width + 'x' + canvasEl.height;

  // 换式静默期：刚切到新动作时姿态仍在上一式收势位，直接评测会白送一次计次
  if (performance.now() < armedAt) {
    if (statusCb) statusCb('请回到起始位置，调整呼吸…');
    return;
  }

  if (currentAction === '两手托天理三焦') {
    const { liveHint, m } = evalTuotian(poseLms, handLms);
    if (liveHint && statusCb) statusCb(liveHint);
    renderDebug(m, 'tuotian');
  } else if (currentAction === '预备式') {
    const { liveHint, m } = evalPrep(poseLms, handLms);
    if (liveHint && statusCb) statusCb(liveHint);
    renderDebug(m, 'prep');
  } else if (currentAction === '收式') {
    const { liveHint, m } = evalShoushi(poseLms, handLms);
    if (liveHint && statusCb) statusCb(liveHint);
    renderDebug(m, 'shoushi');
  } else if (GENERIC_ACTIONS.indexOf(currentAction) >= 0 && POSE_DEBUG) {
    const { liveHint, m } = evalGeneric(poseLms, handLms);
    if (liveHint && statusCb) statusCb(liveHint);
    renderDebug(m, 'generic');
  } else if (BADUANJIN_EVAL[currentAction]) {
    const { liveHint } = BADUANJIN_EVAL[currentAction](poseLms);
    if (liveHint && statusCb) statusCb(liveHint);
  } else if (statusCb) {
    statusCb(poseLms ? '跟练中…（该动作评分规则即将上线）' : '请让全身进入画面');
  }
}

// ===== 对外接口 =====
window.AIPose = {
  async start(video, canvas, opts) {
    videoEl = video;
    canvasEl = canvas;
    ctx = canvas.getContext('2d');
    scoreCb = opts && opts.onScore;
    repCb = opts && opts.onRep;
    statusCb = opts && opts.onStatus;
    currentAction = (opts && opts.action) || '两手托天理三焦';
    armedAt = performance.now() + (opts && opts.armDelay != null ? opts.armDelay : ACTION_ARM_DELAY_MS);
    tuotian.phase = 'prep'; tuotian.prepOkStart = 0;
    tuotian.up = false; tuotian.reps = 0; tuotian.deduction = 0;
    tuotian.records = []; tuotian.cur = null; renderLastDebug = 0;
    staticHold.start = 0; staticHold.done = false; staticHold.everDone = false;
    staticSamples.length = 0; staticLastSampleAt = 0;
    genericT0 = 0;
    bjClear();
    inferFailCount = 0;
    diag.frames = 0; diag.detOK = 0; diag.inferErr = ''; diag.handErr = '';
    diag.switching = false;
    try {
      await createLandmarkers(statusCb);
    } catch (e) {
      console.error('AI 模型加载失败：', e);
      statusCb && statusCb('AI 模型加载失败：' + ((e && e.message) ? e.message : '网络异常') + '，请重试');
      return;
    }
    if (!running) {
      running = true;
      lastVideoTime = -1;
      statusCb && statusCb('AI 已就绪，请全身入镜');
      loop();
    }
  },
  stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (ctx && canvasEl) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (debugEl) { debugEl.remove(); debugEl = null; }
  },
  setAction(name) {
    currentAction = name;
    armedAt = performance.now() + ACTION_ARM_DELAY_MS;
    tuotian.phase = 'prep'; tuotian.prepOkStart = 0;
    tuotian.up = false; tuotian.reps = 0; tuotian.deduction = 0;
    tuotian.records = []; tuotian.cur = null; renderLastDebug = 0;
    staticHold.start = 0; staticHold.done = false; staticHold.everDone = false;
    staticSamples.length = 0; staticLastSampleAt = 0;
    genericT0 = 0;
    bjClear();
    if (scoreCb) scoreCb(100);
    if (repCb) repCb(0, ACTION_TARGET_REPS[name] || 6, []);
  },
};

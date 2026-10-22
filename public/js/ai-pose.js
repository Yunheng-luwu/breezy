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
  LEAR: 7, REAR: 8,
};

// 预备式门禁阈值（第一版候选值，随 ?posebug=1 实测数据一起校准）
const PREP = {
  feetRatioLo: 0.70,   // 踝距 / 肩宽 下限
  feetRatioHi: 1.70,   // 上限
  handYLo: -0.08,      // 腕相对髋的 y 差范围（画面 y 向下，0≈与髋同高）
  handYHi: 0.20,
  frontZ: 0.02,        // 肩z-腕z，越大手越靠前（MediaPipe z 负方向朝镜头）
  wristDistLo: 0.03,
  wristDistHi: 0.22,
  holdMs: 800,         // 预备姿势稳定多久才放行
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
    if (act === 'clear') { tuotian.records.length = 0; renderLastDebug = null; }
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
  if (!tuotian.records.length) {
    if (msgEl) { msgEl.textContent = '还没有完成一次上托，先让骨架出现再做动作'; setTimeout(() => msgEl.textContent = '', 2500); }
    return;
  }
  const header = '次 时长 腕高过耳 前推z 肘角 比肩 手距H 腕距P 头宽比 膝上 膝下 抬头 |判:垂 直 交 停';
  const lines = tuotian.records.map(r =>
    [r.i, r.dur.toFixed(2), nz(r.topMin), nz(r.pushMax), Math.round(r.angMin),
     nz(r.raiseMin), nz(r.handMin), nz(r.wristMin), r.xInRatio.toFixed(2),
     r.kneeBefore === null || r.kneeBefore === undefined ? '-' : Math.round(r.kneeBefore),
     r.kneeAfter === null || r.kneeAfter === undefined ? '-' : Math.round(r.kneeAfter),
     nz(r.faceMin),
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
function renderDebug(m) {
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
    `上托(腕高过耳) L${fmt(m.topL)}${dbg(m.topL > 0.02)} R${fmt(m.topR)}${dbg(m.topR > 0.02)}  候选阈值>0.02\n` +
    `腕比肩高     L${fmt(m.raiseL)}${dbg(m.raiseL > 0.03)} R${fmt(m.raiseR)}${dbg(m.raiseR > 0.03)}  当前区间线>0.03\n` +
    `肘角          ${String(Math.round(m.angL)).padStart(3)}°${dbg(m.angL > 150)}   ${String(Math.round(m.angR)).padStart(3)}°${dbg(m.angR > 150)}   阈值>150\n` +
    `手距  Hands ${fmt(m.handDist)}${dbg(m.handDist !== null && m.handDist < 0.09)} (${m.handsCount}只)  Pose ${fmt(m.wristDist)}${dbg(m.wristDist < 0.11)}\n` +
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
  '背后七颠百病消': 6,
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

function visOK(p) {
  return !!p && (p.visibility === undefined || p.visibility > 0.4);
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
  // 2) 垂直上托而非前推（手腕基本在肩正上方）
  const vertical = Math.abs(lw.x - ls.x) < 0.12 && Math.abs(rw.x - rs.x) < 0.12;
  // 3) 肘伸直
  const leftStraight = angL > 150;
  const rightStraight = angR > 150;
  const straight = leftStraight && rightStraight;
  // 4) 双手在头顶靠近（交叉相扣）：优先用手部中指根，没有则用 Pose 手腕点
  const close = handDist !== null ? handDist < 0.09 : wristDist < 0.11;

  const m = {
    topL, topR,
    raiseL: ls.y - lw.y, raiseR: rs.y - rw.y,
    angL, angR,
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
      if (!b.straight) { minus += 8; problems.push('手臂未伸直'); }
      if (!b.close) { minus += 8; problems.push('双手未交叉'); }
      if (!tuotian.heldLongEnough) { minus += 6; problems.push('停留时间不足'); }
      tuotian.deduction += minus;
      tuotian.reps += 1;
      const score = Math.max(0, 100 - tuotian.deduction);
      scoreCb && scoreCb(score);
      repCb && repCb(tuotian.reps, target, problems);
      if (POSE_DEBUG && tuotian.cur) {
        const c = tuotian.cur;
        tuotian.records.push({
          i: tuotian.reps,
          dur: (performance.now() - tuotian.upStart) / 1000,
          topMin: c.topMin, pushMax: c.pushMax, angMin: c.angMin,
          raiseMin: c.raiseMin, handMin: c.handMin, wristMin: c.wristMin,
          kneeBefore: c.kneeBefore, kneeAfter: c.kneeAfter, faceMin: c.faceMin,
          xInRatio: c.raisedFrames ? c.xInFrames / c.raisedFrames : 0,
          v: b.vertical ? 1 : 0, s: b.straight ? 1 : 0,
          c: b.close ? 1 : 0, h: tuotian.heldLongEnough ? 1 : 0,
        });
        if (tuotian.records.length > 30) tuotian.records.shift();
        tuotian.cur = null;
      }
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

  if (currentAction === '两手托天理三焦') {
    const { liveHint, m } = evalTuotian(poseLms, handLms);
    if (liveHint && statusCb) statusCb(liveHint);
    renderDebug(m);
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
    tuotian.phase = 'prep'; tuotian.prepOkStart = 0;
    tuotian.up = false; tuotian.reps = 0; tuotian.deduction = 0;
    tuotian.records = []; tuotian.cur = null; renderLastDebug = 0;
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
    tuotian.phase = 'prep'; tuotian.prepOkStart = 0;
    tuotian.up = false; tuotian.reps = 0; tuotian.deduction = 0;
    tuotian.records = []; tuotian.cur = null; renderLastDebug = 0;
    if (scoreCb) scoreCb(100);
    if (repCb) repCb(0, ACTION_TARGET_REPS[name] || 6, []);
  },
};

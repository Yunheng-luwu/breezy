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
  LH: 23, RH: 24,
};

// 各动作目标次数（与 practices.json 一致；后续可由调用方传入）
const ACTION_TARGET_REPS = {
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
  up: false,          // 是否处于“上托到位”区间
  upStart: 0,
  heldLongEnough: false,
  best: null,         // 上托区间内最佳一帧的达标情况
  reps: 0,
  deduction: 0,
};

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
async function createLandmarkers(onStatus) {
  if (poseLM && handLM) return;
  onStatus && onStatus('正在加载 AI 模型（首次约 20MB）…');
  if (!tv) {
    tv = await import('../ai-models/vision_bundle.mjs?v=20261004-1');
  }
  const fileset = await tv.FilesetResolver.forVisionTasks(AI_WASM_PATH);

  const tryCreate = (delegate) => Promise.all([
    tv.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_MODEL_URL + '?v=1', delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
    tv.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL + '?v=1', delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }),
  ]);

  try {
    [poseLM, handLM] = await tryCreate('GPU');
  } catch (e) {
    console.warn('GPU 推理初始化失败，回退 CPU：', e);
    onStatus && onStatus('GPU 不可用，切换 CPU 模式…');
    [poseLM, handLM] = await tryCreate('CPU');
  }
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
    tv.PoseLandmarker.POSE_CONNECTIONS.forEach(([a, b]) => {
      const pa = poseLms[a], pb = poseLms[b];
      if (!pa || !pb) return;
      // 低可见度（遮挡）的连线不画
      if ((pa.visibility !== undefined && pa.visibility < 0.4) ||
          (pb.visibility !== undefined && pb.visibility < 0.4)) return;
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
    });
    ctx.stroke();
    // 关节点
    ctx.shadowBlur = 0;
    ctx.fillStyle = JOINT_COLOR;
    const r = Math.max(2.5, w * 0.005);
    poseLms.forEach(p => {
      if (p.visibility !== undefined && p.visibility < 0.4) return;
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
        tv.HandLandmarker.HAND_CONNECTIONS.forEach(([a, b]) => {
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
    return { liveHint: '请让全身进入画面' };
  }
  const lm = poseLms;
  const ls = lm[P.LS], rs = lm[P.RS], le = lm[P.LE], re = lm[P.RE], lw = lm[P.LW], rw = lm[P.RW];

  // 1) 双臂举过肩（画面 y 向下，越小越高）
  const raised = lw.y < ls.y - 0.03 && rw.y < rs.y - 0.03;
  // 2) 垂直上托而非前推（手腕基本在肩正上方）
  const vertical = Math.abs(lw.x - ls.x) < 0.12 && Math.abs(rw.x - rs.x) < 0.12;
  // 3) 肘伸直
  const leftStraight = angleDeg(ls, le, lw) > 150;
  const rightStraight = angleDeg(rs, re, rw) > 150;
  const straight = leftStraight && rightStraight;
  // 4) 双手在头顶靠近（交叉相扣）：优先用手部中指根，没有则用 Pose 手腕点
  let close = false;
  if (handLmsList && handLmsList.length >= 2) {
    const a = handLmsList[0][9], b = handLmsList[1][9];
    close = dist(a, b) < 0.09;
  } else {
    close = dist(lw, rw) < 0.11;
  }

  const allGood = raised && vertical && straight && close;
  let liveHint = '';

  if (raised && !tuotian.up) {
    // 进入上托区间
    tuotian.up = true;
    tuotian.upStart = performance.now();
    tuotian.heldLongEnough = false;
    tuotian.best = { vertical, straight, close };
  }

  if (tuotian.up) {
    // 记录区间内“最好的一次”
    tuotian.best.vertical = tuotian.best.vertical || vertical;
    tuotian.best.straight = tuotian.best.straight || straight;
    tuotian.best.close = tuotian.best.close || close;
    if (performance.now() - tuotian.upStart >= 700) tuotian.heldLongEnough = true;

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
      tuotian.up = false;
      liveHint = tuotian.reps >= target
        ? `已完成 ${target} 次，当前得分 ${score}`
        : `第 ${tuotian.reps} 次完成${problems.length ? '：' + problems.join('、') : '，标准'}，继续`;
    }
  } else if (!raised) {
    liveHint = '双手上托至头顶，开始第 ' + Math.min(tuotian.reps + 1, target) + ' 次';
  }
  return { liveHint };
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
  try {
    const pr = poseLM.detectForVideo(videoEl, ts);
    poseLms = pr && pr.landmarks && pr.landmarks.length ? pr.landmarks[0] : null;
    const hr = handLM.detectForVideo(videoEl, ts + 1); // 时间戳必须严格递增
    handLms = hr && hr.landmarks ? hr.landmarks : null;
  } catch (e) {
    // 单帧推理失败不中断循环
    return;
  }

  drawSkeleton(poseLms, handLms, canvasEl.width, canvasEl.height);

  if (currentAction === '两手托天理三焦') {
    const { liveHint } = evalTuotian(poseLms, handLms);
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
    tuotian.up = false; tuotian.reps = 0; tuotian.deduction = 0;
    try {
      await createLandmarkers(statusCb);
    } catch (e) {
      console.error('AI 模型加载失败：', e);
      statusCb && statusCb('AI 模型加载失败，请刷新重试');
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
  },
  setAction(name) {
    currentAction = name;
    tuotian.up = false; tuotian.reps = 0; tuotian.deduction = 0;
    if (scoreCb) scoreCb(100);
    if (repCb) repCb(0, ACTION_TARGET_REPS[name] || 6, []);
  },
};

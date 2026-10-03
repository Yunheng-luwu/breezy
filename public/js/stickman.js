/* 松序 · 功法简笔画带练动画（SVG 关键帧引擎）
   动作 = 一组关键帧姿势，两点插值平滑过渡、循环播放；
   姿势由 髋部位置/躯干前倾/头部倾角/双手落点(两段骨骼IK反解肘部) 描述。 */
window.Stickman = (function () {
  'use strict';

  var INK = '#6B4E2E';        // 近侧肢体（主墨色）
  var INK_FAR = '#CDB694';    // 远侧肢体
  var PANEL = '#F2EAD8';      // 面板底色（头部填充用，遮挡远侧手臂）
  var TORSO = 52, NECK = 8, HEADR = 14, UP = 26, FORE = 24;

  /* ---------- 几何 ---------- */
  // 两段骨骼 IK：已知肩、手，反解肘部；bend 决定肘朝向
  function ik(sx, sy, wx, wy, l1, l2, bend) {
    var dx = wx - sx, dy = wy - sy, d = Math.hypot(dx, dy);
    var max = l1 + l2 - 0.6, min = Math.abs(l1 - l2) + 0.6;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    if (d < min) { var k = d ? min / d : 1; dx *= k; dy *= k; d = min; }
    var a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    var h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    var ux = dx / d, uy = dy / d;
    return {
      ex: sx + ux * a - uy * h * bend,
      ey: sy + uy * a + ux * h * bend,
      wx: sx + dx, wy: sy + dy
    };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpArr(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
  function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

  function lerpPose(p0, p1, t) {
    return {
      hip: lerpArr(p0.hip, p1.hip, t),
      lean: lerp(p0.lean || 0, p1.lean || 0, t),
      headTilt: lerp(p0.headTilt || 0, p1.headTilt || 0, t),
      headDy: lerp(p0.headDy || 0, p1.headDy || 0, t),
      handR: lerpArr(p0.handR, p1.handR, t),
      handL: lerpArr(p0.handL, p1.handL, t),
      bendR: (t < 0.5 ? p0 : p1).bendR,
      bendL: (t < 0.5 ? p0 : p1).bendL
    };
  }

  function fig(pose, view) {
    var hx = pose.hip[0], hy = pose.hip[1];
    var lr = (pose.lean || 0) * Math.PI / 180;
    var sdx = Math.sin(lr), sdy = -Math.cos(lr);
    var sh = [hx + sdx * TORSO, hy + sdy * TORSO];
    var hr = (pose.lean + (pose.headTilt || 0)) * Math.PI / 180;
    var head = [sh[0] + Math.sin(hr) * (NECK + HEADR),
                sh[1] - Math.cos(hr) * (NECK + HEADR) + (pose.headDy || 0)];
    var sR, sL;
    if (view === 'front') { sR = [sh[0] + 17, sh[1]]; sL = [sh[0] - 17, sh[1]]; }
    else { sR = sh; sL = [sh[0] - 3, sh[1] + 2]; }
    var aR = ik(sR[0], sR[1], pose.handR[0], pose.handR[1], UP, FORE, pose.bendR == null ? 1 : pose.bendR);
    var aL = ik(sL[0], sL[1], pose.handL[0], pose.handL[1], UP, FORE, pose.bendL == null ? 1 : pose.bendL);
    return { hx: hx, hy: hy, sh: sh, sR: sR, sL: sL, head: head, aR: aR, aL: aL };
  }

  function tag(s) { return s.toFixed(1); }
  function line(x1, y1, x2, y2, c, w) {
    return '<line x1="' + tag(x1) + '" y1="' + tag(y1) + '" x2="' + tag(x2) + '" y2="' + tag(y2) +
      '" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round"/>';
  }
  function poly(pts, c, w) {
    return '<polyline points="' + pts.map(function (p) { return tag(p[0]) + ',' + tag(p[1]); }).join(' ') +
      '" fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function legsSide(hx, hy) {
    var y1 = hy + 32, y2 = hy + 64;
    return poly([[hx - 2, y1 - 2], [hx - 8, y1], [hx - 6, y2]], INK, 6) +
           poly([[hx + 4, y1 - 2], [hx + 10, y1], [hx + 12, y2]], INK, 6) +
           line(hx - 6, y2, hx + 3, y2, INK, 6) +
           line(hx + 12, y2, hx + 21, y2, INK, 6);
  }
  function legsFront(hx, hy) {
    var y1 = hy + 32, y2 = hy + 64;
    return poly([[hx - 9, y1 - 2], [hx - 11, y1], [hx - 12, y2]], INK, 6) +
           poly([[hx + 9, y1 - 2], [hx + 11, y1], [hx + 12, y2]], INK, 6) +
           line(hx - 19, y2, hx - 10, y2, INK, 6) +
           line(hx + 10, y2, hx + 19, y2, INK, 6);
  }

  function renderSVG(pose, view) {
    var f = fig(pose, view);
    var ground = line(46, 218, 154, 218, 'rgba(107,78,46,.18)', 3);
    var s = '';
    if (view === 'front') {
      s += legsFront(f.hx, f.hy);
      s += line(f.hx, f.hy, f.sh[0], f.sh[1], INK, 7);
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1]) + '" r="' + HEADR +
           '" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="5"/>';
      s += poly([f.sL, [f.aL.ex, f.aL.ey], [f.aL.wx, f.aL.wy]], INK, 6);
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], INK, 6);
      s += '<circle cx="' + tag(f.aL.wx) + '" cy="' + tag(f.aL.wy) + '" r="4" fill="' + INK + '"/>';
      s += '<circle cx="' + tag(f.aR.wx) + '" cy="' + tag(f.aR.wy) + '" r="4" fill="' + INK + '"/>';
    } else {
      s += poly([f.sL, [f.aL.ex, f.aL.ey], [f.aL.wx, f.aL.wy]], INK_FAR, 4.5);
      s += '<circle cx="' + tag(f.aL.wx) + '" cy="' + tag(f.aL.wy) + '" r="3.2" fill="' + INK_FAR + '"/>';
      s += legsSide(f.hx, f.hy);
      s += line(f.hx, f.hy, f.sh[0], f.sh[1], INK, 7);
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1]) + '" r="' + HEADR +
           '" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="5"/>';
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], INK, 6);
      s += '<circle cx="' + tag(f.aR.wx) + '" cy="' + tag(f.aR.wy) + '" r="4.2" fill="' + INK + '"/>';
    }
    return '<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + ground + s + '</svg>';
  }

  /* ---------- 动作关键帧库 ---------- */
  var ANIMS = {
    // 梳头功（侧视，面朝右）：手沿头部弧线 前→上→后
    shutou: {
      view: 'side', cycle: 4.0,
      keys: [
        { t: 0.0, cap: '十指微屈，如梳齿张开', pose: { hip: [100, 150], lean: 8, headTilt: 4, handR: [115, 72], handL: [94, 132], bendR: -1, bendL: 1 } },
        { t: 0.9, cap: '从前额发际梳入，缓缓后梳', pose: { hip: [100, 150], lean: 5, headTilt: 0, handR: [104, 58], handL: [94, 132], bendR: -1, bendL: 1 } },
        { t: 1.8, cap: '梳到后颈，稍作按揉', pose: { hip: [100, 150], lean: 4, headTilt: -8, handR: [88, 86], handL: [94, 132], bendR: -1, bendL: 1 } },
        { t: 2.3, cap: '梳到后颈，稍作按揉', pose: { hip: [100, 150], lean: 4, headTilt: -6, handR: [85, 97], handL: [94, 132], bendR: -1, bendL: 1 } },
        { t: 3.0, cap: '轻收抬起，回到发际', pose: { hip: [100, 150], lean: 5, headTilt: 2, handR: [98, 50], handL: [94, 132], bendR: -1, bendL: 1 } },
        { t: 3.6, cap: '再梳 · 共 15~20 次', pose: { hip: [100, 150], lean: 8, headTilt: 4, handR: [115, 72], handL: [94, 132], bendR: -1, bendL: 1 } }
      ]
    },
    // 两手托天理三焦（正视，双臂对称）
    tuotian: {
      view: 'front', cycle: 5.7,
      keys: [
        { t: 0.0, cap: '十指交叉，掌心向上置于腹前', pose: { hip: [100, 150], handR: [100, 140], handL: [100, 140], bendR: -1, bendL: 1 } },
        { t: 1.1, cap: '沿胸前缓缓上托', pose: { hip: [100, 150], handR: [100, 106], handL: [100, 106], bendR: -1, bendL: 1 } },
        { t: 2.1, cap: '翻掌上举过头，掌心朝天，缓缓抬头', pose: { hip: [100, 150], headDy: 3, handR: [97, 40], handL: [103, 40], bendR: -1, bendL: 1 } },
        { t: 3.0, cap: '保持拉伸，舒展三焦', pose: { hip: [100, 147], headDy: 3, handR: [97, 38], handL: [103, 38], bendR: -1, bendL: 1 } },
        { t: 3.9, cap: '两臂分开，沿体前缓缓下落', pose: { hip: [100, 150], handR: [142, 78], handL: [58, 78], bendR: -1, bendL: 1 } },
        { t: 4.9, cap: '上托吸气 · 下落呼气 · 重复 6~8 次', pose: { hip: [100, 150], handR: [100, 140], handL: [100, 140], bendR: -1, bendL: 1 } }
      ]
    }
  };

  function getKey(name) {
    var n = String(name || '');
    if (n.indexOf('梳头') > -1) return 'shutou';
    if (n.indexOf('托天') > -1) return 'tuotian';
    return null;
  }

  /* ---------- 播放器 ---------- */
  var registry = new Set();
  var SPEEDS = [1, 1.5, 0.5];

  function mount(container, key) {
    var def = ANIMS[key];
    if (!container || !def) return null;

    container.innerHTML =
      '<div class="pd-anim-stage"></div>' +
      '<div class="pd-anim-cap"></div>' +
      '<div class="pd-anim-bar">' +
      '  <button type="button" class="pd-anim-btn" data-act="pause">⏸ 暂停</button>' +
      '  <button type="button" class="pd-anim-btn" data-act="speed">速度 ×1</button>' +
      '</div>';
    var stage = container.querySelector('.pd-anim-stage');
    var cap = container.querySelector('.pd-anim-cap');
    var st = { t0: performance.now(), paused: false, pauseAt: 0, speed: 1, lastCap: null, raf: 0, dead: false };

    function frame(now) {
      if (st.dead) return;
      if (!st.paused) {
        var tt = ((now - st.t0) / 1000 * st.speed) % def.cycle;
        var ks = def.keys, i = 0, j;
        for (j = 0; j < ks.length; j++) { if (tt >= ks[j].t) i = j; }
        var k0 = ks[i], k1 = ks[(i + 1) % ks.length];
        var end = (i + 1 < ks.length) ? k1.t : def.cycle + ks[0].t;
        var e = smooth((tt - k0.t) / Math.max(end - k0.t, 0.0001));
        stage.innerHTML = renderSVG(lerpPose(k0.pose, k1.pose, e), def.view);
        if (k0.cap !== st.lastCap) {
          st.lastCap = k0.cap;
          cap.style.opacity = 0;
          setTimeout(function () {
            if (!st.dead) { cap.textContent = k0.cap; cap.style.opacity = 1; }
          }, 160);
        }
      }
      st.raf = requestAnimationFrame(frame);
    }

    container.querySelector('[data-act="pause"]').addEventListener('click', function () {
      if (st.paused) {
        st.t0 = performance.now() - st.pauseAt; st.paused = false;
        this.textContent = '⏸ 暂停';
      } else {
        st.paused = true; st.pauseAt = performance.now() - st.t0;
        this.textContent = '▶ 播放';
      }
    });
    container.querySelector('[data-act="speed"]').addEventListener('click', function () {
      var idx = (SPEEDS.indexOf(st.speed) + 1) % SPEEDS.length;
      st.speed = SPEEDS[idx];
      this.textContent = '速度 ×' + st.speed;
    });

    st.raf = requestAnimationFrame(frame);
    var player = {
      destroy: function () {
        if (st.dead) return;
        st.dead = true;
        cancelAnimationFrame(st.raf);
        registry.delete(player);
      }
    };
    registry.add(player);
    return player;
  }

  function destroyAll() {
    registry.forEach(function (p) { p.destroy(); });
  }

  // 弹窗内容被替换/关闭时自动销毁播放器，防止后台空转
  function initObserver() {
    var box = document.getElementById('modalBox');
    if (!box || typeof MutationObserver === 'undefined') return;
    new MutationObserver(function () {
      registry.forEach(function (p) { if (!p._c || !p._c.isConnected) p.destroy(); });
    }).observe(box, { childList: true, subtree: true });
  }
  // 包装 closeModal：关闭即停
  if (typeof window.closeModal === 'function') {
    var _cm = window.closeModal;
    window.closeModal = function () { destroyAll(); _cm(); };
  }

  function mountTracked(container, key) {
    var p = mount(container, key);
    if (p) p._c = container;
    return p;
  }

  return {
    mount: mountTracked,
    destroyAll: destroyAll,
    getKey: getKey,
    initObserver: initObserver
  };
})();

window.getStickmanKey = function (name) { return window.Stickman.getKey(name); };
window.Stickman.initObserver();

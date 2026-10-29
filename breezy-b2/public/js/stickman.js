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
      spin: lerp(p0.spin || 0, p1.spin || 0, t),   // 旋腰转脊旋转方向标记（1=右 -1=左 0=无）
      headTilt: lerp(p0.headTilt || 0, p1.headTilt || 0, t),
      headDy: lerp(p0.headDy || 0, p1.headDy || 0, t),
      shoulderDy: lerp(p0.shoulderDy || 0, p1.shoulderDy || 0, t),
      heel: lerp(p0.heel || 0, p1.heel || 0, t),
      heelF: lerp(p0.heelF || 0, p1.heelF || 0, t),
      handR: lerpArr(p0.handR, p1.handR, t),
      handL: lerpArr(p0.handL, p1.handL, t),
      bendR: lerp(p0.bendR || 0, p1.bendR || 0, t),
      bendL: lerp(p0.bendL || 0, p1.bendL || 0, t)
    };
  }

  function fig(pose, view) {
    var hx = pose.hip[0], hy = pose.hip[1];
    var lr = (pose.lean || 0) * Math.PI / 180;
    var sdx = Math.sin(lr), sdy = -Math.cos(lr);
    var sh = [hx + sdx * TORSO, hy + sdy * TORSO + (pose.shoulderDy || 0)];
    var hr = (pose.lean + (pose.headTilt || 0)) * Math.PI / 180;
    var head = [sh[0] + Math.sin(hr) * (NECK + HEADR),
                sh[1] - Math.cos(hr) * (NECK + HEADR) + (pose.headDy || 0)];
    var sR, sL;
    if (view === 'front' || view === 'back') { sR = [sh[0] + 17, sh[1]]; sL = [sh[0] - 17, sh[1]]; }
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

  function legsSide(hx, hy, heel, heelF) {
    var yK = hy + 34;
    var yg = 218;
    var hd = heel || 0, hdF = heelF || 0;
    var lift = Math.max(hd, 0), hook = Math.min(hd, 0);
    var liftF = Math.max(hdF, 0), hookF = Math.min(hdF, 0);
    return poly([[hx + 2, hy + 4], [hx + 8, yK], [hx + 5, yg - lift]], INK, 6) +
           poly([[hx - 6, hy + 6], [hx - 10, yK + 2], [hx - 8, yg - liftF]], INK, 6) +
           line(hx - 8, yg - liftF, hx + 1, yg + hookF, INK, 6) +
           line(hx + 5, yg - lift, hx + 16, yg + hook, INK, 6);
  }
  function legsFront(hx, hy) {
    var yK = hy + 34, yA = hy + 64;
    return poly([[hx - 8, hy + 4], [hx - 11, yK], [hx - 12, yA]], INK, 6) +
           poly([[hx + 8, hy + 4], [hx + 11, yK], [hx + 12, yA]], INK, 6) +
           line(hx - 19, yA, hx - 10, yA, INK, 6) +
           line(hx + 10, yA, hx + 19, yA, INK, 6);
  }

  /* ---------- 精致化渲染：简笔画骨架 + 衣物细节 ---------- */
  function renderRefined(pose, view, time) {
    var baseView = view.replace('refined-', '');
    var f = fig(pose, baseView);
    var ground = line(46, 218, 154, 218, 'rgba(107,78,46,.18)', 3);
    var s = '';
    // 地面阴影（椭圆渐变）
    s += '<ellipse cx="' + tag(f.hx) + '" cy="218" rx="40" ry="5" fill="rgba(107,78,46,0.10)"/>';
    s += '<ellipse cx="' + tag(f.hx) + '" cy="218" rx="28" ry="3.5" fill="rgba(107,78,46,0.08)"/>';

    if (baseView === 'front' || baseView === 'back') {
      // 宽裤：腿外侧加粗平行线（暗示裤腿宽度）
      var yK = f.hy + 34, yA = f.hy + 64;
      s += poly([[f.hx - 11, f.hy + 5], [f.hx - 14, yK], [f.hx - 15, yA]], 'rgba(107,78,46,0.35)', 3.5);
      s += poly([[f.hx + 11, f.hy + 5], [f.hx + 14, yK], [f.hx + 15, yA]], 'rgba(107,78,46,0.35)', 3.5);
      // 上衣轮廓：梯形包裹躯干（收腰 + 下摆微张）
      s += '<path d="M ' + tag(f.hx - 16) + ' ' + tag(f.hy + 2) + ' L ' + tag(f.hx + 16) + ' ' + tag(f.hy + 2) +
           ' L ' + tag(f.sh[0] + 13) + ' ' + tag(f.sh[1] + 4) + ' L ' + tag(f.sh[0] - 13) + ' ' + tag(f.sh[1] + 4) +
           ' Z" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="2.8" stroke-linejoin="round" opacity="0.92"/>';
      // 宽袖：手臂外侧加粗线（暗示袖口）
      s += poly([f.sL, [f.aL.ex, f.aL.ey], [f.aL.wx, f.aL.wy]], 'rgba(107,78,46,0.28)', 4.5);
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], 'rgba(107,78,46,0.28)', 4.5);
      // 原有骨架（稍细一点，让衣物层更突出）
      s += legsFront(f.hx, f.hy);
      s += line(f.hx, f.hy, f.sh[0], f.sh[1], INK, 5.5);
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1]) + '" r="' + HEADR +
           '" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="4.5"/>';
      // 发髻（太极服标志性）
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1] - 16) + '" r="5" fill="' + INK + '"/>';
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1] - 16) + '" r="2.5" fill="' + PANEL + '"/>';
      if (baseView === 'front') {
        s += '<circle cx="' + tag(f.head[0] - 4.5) + '" cy="' + tag(f.head[1] - 2) + '" r="1.8" fill="' + INK + '"/>' +
             '<circle cx="' + tag(f.head[0] + 4.5) + '" cy="' + tag(f.head[1] - 2) + '" r="1.8" fill="' + INK + '"/>';
      }
      s += poly([f.sL, [f.aL.ex, f.aL.ey], [f.aL.wx, f.aL.wy]], INK, 5);
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], INK, 5);
      s += '<circle cx="' + tag(f.aL.wx) + '" cy="' + tag(f.aL.wy) + '" r="4" fill="' + INK + '"/>';
      s += '<circle cx="' + tag(f.aR.wx) + '" cy="' + tag(f.aR.wy) + '" r="4" fill="' + INK + '"/>';
      // 盘扣（上衣装饰）
      for (var i = 0; i < 4; i++) {
        var btnY = f.sh[1] + 10 + i * 10;
        s += '<circle cx="' + tag(f.sh[0]) + '" cy="' + tag(btnY) + '" r="1.5" fill="' + INK + '" opacity="0.5"/>';
      }
    } else {
      // 侧视：只加阴影和宽袖，不加盘扣（避免混乱）
      s += legsSide(f.hx, f.hy, pose.heel, pose.heelF);
      s += line(f.hx, f.hy, f.sh[0], f.sh[1], INK, 5.5);
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1]) + '" r="' + HEADR +
           '" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="4.5"/>';
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1] - 16) + '" r="5" fill="' + INK + '"/>';
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1] - 16) + '" r="2.5" fill="' + PANEL + '"/>';
      s += '<circle cx="' + tag(f.head[0] + 6.5) + '" cy="' + tag(f.head[1] - 2) + '" r="1.8" fill="' + INK + '"/>';
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], 'rgba(107,78,46,0.28)', 4.5);
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], INK, 5);
      s += '<circle cx="' + tag(f.aR.wx) + '" cy="' + tag(f.aR.wy) + '" r="4.2" fill="' + INK + '"/>';
    }
    return '<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + ground + s + '</svg>';
  }

  function renderSVG(pose, view, time) {
    if (view.indexOf('refined-') === 0) return renderRefined(pose, view, time);
    var f = fig(pose, view);
    var ground = line(46, 218, 154, 218, 'rgba(107,78,46,.18)', 3);
    var s = '';
    if (view === 'front' || view === 'back') {
      s += legsFront(f.hx, f.hy);
      s += line(f.hx, f.hy, f.sh[0], f.sh[1], INK, 7);
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1]) + '" r="' + HEADR +
           '" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="5"/>';
      if (view === 'front') {
        s += '<circle cx="' + tag(f.head[0] - 4.5) + '" cy="' + tag(f.head[1] - 2) + '" r="1.8" fill="' + INK + '"/>' +
             '<circle cx="' + tag(f.head[0] + 4.5) + '" cy="' + tag(f.head[1] - 2) + '" r="1.8" fill="' + INK + '"/>';
      } else {
        s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1] - 12) + '" r="4" fill="' + INK + '"/>';
      }
      s += poly([f.sL, [f.aL.ex, f.aL.ey], [f.aL.wx, f.aL.wy]], INK, 6);
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], INK, 6);
      s += '<circle cx="' + tag(f.aL.wx) + '" cy="' + tag(f.aL.wy) + '" r="4" fill="' + INK + '"/>';
      s += '<circle cx="' + tag(f.aR.wx) + '" cy="' + tag(f.aR.wy) + '" r="4" fill="' + INK + '"/>';
      // 旋腰转脊：腰部两侧各一个 90° 小弧箭头，沿弧方向虚线流动（|spin|>0.15 即显示）
      if (pose.spin && Math.abs(pose.spin) > 0.15) {
        var dir = pose.spin > 0 ? 1 : -1;   // spin>0=向右转
        var wy = f.hy - 16;                 // 腰部高度
        var r = 10;                         // 小弧半径
        var lx = f.hx - 26, rxx = f.hx + 26;
        // 右转：左弧 下点→左点（经左下），箭头在左点朝上；右弧 上点→右点（经右上），箭头在右点朝下
        // 左转：全部镜像（sweep 反转）
        var sw = dir > 0 ? 1 : 0;
        var arcL = dir > 0
          ? 'M ' + tag(lx) + ' ' + tag(wy + r) + ' A ' + tag(r) + ' ' + tag(r) + ' 0 0 ' + sw + ' ' + tag(lx - r) + ' ' + tag(wy)
          : 'M ' + tag(lx) + ' ' + tag(wy - r) + ' A ' + tag(r) + ' ' + tag(r) + ' 0 0 ' + sw + ' ' + tag(lx - r) + ' ' + tag(wy);
        var arcR = dir > 0
          ? 'M ' + tag(rxx) + ' ' + tag(wy - r) + ' A ' + tag(r) + ' ' + tag(r) + ' 0 0 ' + sw + ' ' + tag(rxx + r) + ' ' + tag(wy)
          : 'M ' + tag(rxx) + ' ' + tag(wy + r) + ' A ' + tag(r) + ' ' + tag(r) + ' 0 0 ' + sw + ' ' + tag(rxx + r) + ' ' + tag(wy);
        // 虚线沿路径流动：JS 时间驱动 dashoffset（SMIL 在 innerHTML 重渲染时会被重置）
        var dashOff = time != null ? (16 - (time * 8.9) % 16).toFixed(1) : '16';
        s += '<path d="' + arcL + '" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="5 3" stroke-dashoffset="' + dashOff + '" opacity="0.7"/>';
        s += '<path d="' + arcR + '" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="5 3" stroke-dashoffset="' + dashOff + '" opacity="0.7"/>';
        // 箭头：实心三角，精确接在弧末端，指向切线方向
        // 右转：左箭头在 (lx-r, wy) 朝上；右箭头在 (rxx+r, wy) 朝下
        var tipL = dir > 0 ? -1 : 1;  // 左箭头朝向：右转朝上(-1) 左转朝下(+1)
        var tipR = -tipL;             // 右箭头相反
        s += '<polygon points="' + tag(lx - r) + ',' + tag(wy + tipL * 4.5) + ' ' +
             tag(lx - r - 3.5) + ',' + tag(wy - tipL * 3) + ' ' +
             tag(lx - r + 3.5) + ',' + tag(wy - tipL * 3) + '" fill="' + INK + '" opacity="0.7"/>';
        s += '<polygon points="' + tag(rxx + r) + ',' + tag(wy + tipR * 4.5) + ' ' +
             tag(rxx + r - 3.5) + ',' + tag(wy - tipR * 3) + ' ' +
             tag(rxx + r + 3.5) + ',' + tag(wy - tipR * 3) + '" fill="' + INK + '" opacity="0.7"/>';
      }
    } else {
      s += legsSide(f.hx, f.hy, pose.heel, pose.heelF);
      s += line(f.hx, f.hy, f.sh[0], f.sh[1], INK, 7);
      s += '<circle cx="' + tag(f.head[0]) + '" cy="' + tag(f.head[1]) + '" r="' + HEADR +
           '" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="5"/>';
      s += '<circle cx="' + tag(f.head[0] + 6.5) + '" cy="' + tag(f.head[1] - 2) + '" r="1.8" fill="' + INK + '"/>';
      s += poly([f.sR, [f.aR.ex, f.aR.ey], [f.aR.wx, f.aR.wy]], INK, 6);
      s += '<circle cx="' + tag(f.aR.wx) + '" cy="' + tag(f.aR.wy) + '" r="4.2" fill="' + INK + '"/>';
    }
    return '<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + ground + s + '</svg>';
  }

  /* ---------- 太极服人物渲染（精致版） ---------- */
  function _q(x, y) { return x.toFixed(1) + ',' + y.toFixed(1); }
  function renderTaiji(pose) {
    var f = fig(pose, 'front');
    var hx = f.hx, hy = f.hy, sh = f.sh, head = f.head;
    var h0 = head[0] || sh[0], h1 = head[1] || (sh[1] - 22);  // 防 NaN
    var s = '', W = 2.0;                                     // 统一线宽

    function path(d, sw) {
      return '<path d="' + d + '" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="' + (sw || W) + '" stroke-linejoin="round" stroke-linecap="round"/>';
    }

    /* 地面阴影 */
    s += '<ellipse cx="' + hx + '" cy="219" rx="36" ry="3" fill="rgba(107,78,46,.10)"/>';

    /* 裤腿：带膝弯的贝塞尔曲线 */
    var lk = [hx - 14, hy + 36], rk = [hx + 14, hy + 36];
    var la = [hx - 12, hy + 64], ra = [hx + 12, hy + 64];
    s += path('M' + _q(hx - 10, hy + 4) + ' Q' + _q(hx - 18, hy + 20) + ' ' + _q(lk[0], lk[1]) +
              ' Q' + _q(hx - 16, hy + 50) + ' ' + _q(la[0], la[1]) + ' L' + _q(hx - 4, la[1]) +
              ' Q' + _q(hx - 8, hy + 50) + ' ' + _q(hx - 6, hy + 36) + ' Q' + _q(hx - 4, hy + 20) + ' ' + _q(hx - 2, hy + 4) + ' Z');
    s += path('M' + _q(hx + 2, hy + 4) + ' Q' + _q(hx + 4, hy + 20) + ' ' + _q(hx + 6, hy + 36) +
              ' Q' + _q(hx + 8, hy + 50) + ' ' + _q(hx + 4, la[1]) + ' L' + _q(ra[0], ra[1]) +
              ' Q' + _q(hx + 16, hy + 50) + ' ' + _q(rk[0], rk[1]) + ' Q' + _q(hx + 18, hy + 20) + ' ' + _q(hx + 10, hy + 4) + ' Z');

    /* 布鞋 */
    s += path('M' + _q(hx - 22, hy + 64) + ' L' + _q(hx - 6, hy + 64) + ' Q' + _q(hx - 4, hy + 69) + ' ' + _q(hx - 20, hy + 69) + ' Z', 1.6);
    s += path('M' + _q(hx + 6, hy + 64) + ' L' + _q(hx + 22, hy + 64) + ' Q' + _q(hx + 20, hy + 69) + ' ' + _q(hx + 4, hy + 69) + ' Z', 1.6);

    /* 上衣：收腰梯形 + 下摆微弧 */
    var waistY = sh[1] + 28;
    s += path('M' + _q(sh[0] - 14, sh[1] - 2) + ' Q' + _q(sh[0] - 16, waistY) + ' ' + _q(hx - 22, hy + 6) +
              ' Q' + _q(hx - 10, hy + 14) + ' ' + _q(hx, hy + 10) + ' Q' + _q(hx + 10, hy + 14) + ' ' + _q(hx + 22, hy + 6) +
              ' Q' + _q(sh[0] + 16, waistY) + ' ' + _q(sh[0] + 14, sh[1] - 2) + ' Z');

    /* 立领 */
    s += '<path d="M' + _q(sh[0] - 7, sh[1] - 3) + ' Q' + _q(sh[0], sh[1] - 8) + ' ' + _q(sh[0] + 7, sh[1] - 3) +
         '" fill="none" stroke="' + INK + '" stroke-width="' + W + '" stroke-linecap="round"/>';

    /* 盘扣（6 颗） */
    for (var i = 0; i < 6; i++) {
      var by = sh[1] + 8 + i * 10;
      s += '<circle cx="' + sh[0] + '" cy="' + by + '" r="1.8" fill="' + INK + '"/>';
    }

    /* 袖子：贝塞尔曲线模拟宽袖 + 袖口 */
    function sleeve(sx, sy, ex, ey, wx, wy, side) {
      var d = Math.hypot(ex - sx, ey - sy) || 1;
      var nx = -(ey - sy) / d, ny = (ex - sx) / d;
      var sa = 7, ea = 9.5, ca = 5.5;   // 肩宽、肘宽、袖口宽
      var d1 = 'M' + _q(sx + nx * sa, sy + ny * sa) + ' Q' + _q(sx + nx * (sa + 2) + (ex - sx) * 0.3, sy + ny * (sa + 2) + (ey - sy) * 0.3) +
               ' ' + _q(ex + nx * ea, ey + ny * ea) + ' L' + _q(wx + nx * ca, wy + ny * ca);
      var d2 = ' L' + _q(wx - nx * ca, wy - ny * ca) + ' L' + _q(ex - nx * ea, ey - ny * ea) +
               ' Q' + _q(sx - nx * (sa + 2) + (ex - sx) * 0.3, sy - ny * (sa + 2) + (ey - sy) * 0.3) +
               ' ' + _q(sx - nx * sa, sy - ny * sa) + ' Z';
      return path(d1 + d2);
    }
    s += sleeve(f.sL[0], f.sL[1], f.aL.ex, f.aL.ey, f.aL.wx, f.aL.wy, -1);
    s += sleeve(f.sR[0], f.sR[1], f.aR.ex, f.aR.ey, f.aR.wx, f.aR.wy, 1);

    /* 手 */
    s += '<circle cx="' + tag(f.aL.wx) + '" cy="' + tag(f.aL.wy) + '" r="4" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="' + W + '"/>';
    s += '<circle cx="' + tag(f.aR.wx) + '" cy="' + tag(f.aR.wy) + '" r="4" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="' + W + '"/>';

    /* 头部 */
    // 脸型（鹅蛋）
    s += path('M' + _q(h0, h1 - 15) + ' C' + _q(h0 - 12, h1 - 15) + ' ' + _q(h0 - 12, h1 + 8) + ' ' + _q(h0, h1 + 12) +
              ' C' + _q(h0 + 12, h1 + 8) + ' ' + _q(h0 + 12, h1 - 15) + ' ' + _q(h0, h1 - 15) + ' Z');
    // 耳朵
    s += '<ellipse cx="' + tag(h0 - 12) + '" cy="' + tag(h1 - 1) + '" rx="2.5" ry="4" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="' + W + '"/>';
    s += '<ellipse cx="' + tag(h0 + 12) + '" cy="' + tag(h1 - 1) + '" rx="2.5" ry="4" fill="' + PANEL + '" stroke="' + INK + '" stroke-width="' + W + '"/>';
    // 眉毛（微弧）
    s += '<path d="M' + _q(h0 - 7, h1 - 5) + ' Q' + _q(h0 - 4, h1 - 7) + ' ' + _q(h0 - 1, h1 - 5) + '" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    s += '<path d="M' + _q(h0 + 1, h1 - 5) + ' Q' + _q(h0 + 4, h1 - 7) + ' ' + _q(h0 + 7, h1 - 5) + '" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    // 眼睛（闭目，微弯下眼线）
    s += '<path d="M' + _q(h0 - 6, h1 - 1) + ' Q' + _q(h0 - 4, h1 + 1) + ' ' + _q(h0 - 2, h1 - 1) + '" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    s += '<path d="M' + _q(h0 + 2, h1 - 1) + ' Q' + _q(h0 + 4, h1 + 1) + ' ' + _q(h0 + 6, h1 - 1) + '" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    // 鼻子（简洁竖线）
    s += line(h0, h1 + 1, h0, h1 + 5, INK, 1);
    // 嘴（微笑微弧）
    s += '<path d="M' + _q(h0 - 3, h1 + 7) + ' Q' + _q(h0, h1 + 9) + ' ' + _q(h0 + 3, h1 + 7) + '" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round"/>';
    // 头顶发线（简化寸头/光顶）
    s += '<path d="M' + _q(h0 - 10, h1 - 12) + ' Q' + _q(h0, h1 - 16) + ' ' + _q(h0 + 10, h1 - 12) + '" fill="none" stroke="' + INK + '" stroke-width="1.4" stroke-linecap="round"/>';

    return '<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
  }

  /* ---------- 动作关键帧库 ---------- */
  var ANIMS = {
    shutou: {
      views: ['back', 'side'], cycle: 9.6,
      keys: [
        { t: 0.0, cap: '双手十指微屈，如梳齿张开', p: {
            back:  { hip: [100, 150], handR: [112, 70], handL: [88, 70], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 3, headTilt: 4, handR: [112, 70], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 1.4, cap: '从前额发际梳入，缓缓后梳', p: {
            back:  { hip: [100, 150], handR: [112, 70], handL: [88, 70], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 3, headTilt: 4, handR: [112, 70], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 3.2, cap: '经百会，缓缓后梳', p: {
            back:  { hip: [100, 150], handR: [108, 62], handL: [92, 62], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 2, headTilt: 0, handR: [104, 62], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 5.0, cap: '梳至后颈，顺势按揉风池', p: {
            back:  { hip: [100, 150], handR: [108, 66], handL: [92, 66], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 2, headTilt: -8, handR: [90, 66], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 6.2, cap: '梳至后颈，顺势按揉风池', p: {
            back:  { hip: [100, 150], handR: [110, 78], handL: [90, 78], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 2, headTilt: -6, handR: [88, 78], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 7.4, cap: '轻收抬起，回到发际', p: {
            back:  { hip: [100, 150], handR: [111, 70], handL: [89, 70], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 2, headTilt: 2, handR: [98, 70], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 8.6, cap: '再梳 · 共 15~20 次', p: {
            back:  { hip: [100, 150], handR: [108, 62], handL: [92, 62], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 3, headTilt: 4, handR: [112, 62], handL: [94, 132], bendR: 1, bendL: 1 } } }
      ]
    },
    tuotian: {
      views: ['video'], videoSrc: 'img/anims/tuotian.mp4', cycle: 9.0,
      keys: [
        { t: 0.0, cap: '十指交叉，掌心向上置于腹前', p: {
            front: { hip: [100, 150], handR: [100, 140], handL: [100, 140], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], handR: [112, 138], handL: [106, 140], bendR: 1, bendL: 1 } } },
        { t: 1.5, cap: '沿胸前缓缓上托', p: {
            front: { hip: [100, 150], handR: [100, 140], handL: [100, 140], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], handR: [112, 138], handL: [106, 140], bendR: 1, bendL: 1 } } },
        { t: 3.2, cap: '胸前翻掌，上举过头，缓缓抬头', p: {
            front: { hip: [100, 150], handR: [94, 108], handL: [106, 108], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], handR: [116, 106], handL: [110, 108], bendR: 1, bendL: 1 } } },
        { t: 4.7, cap: '保持拉伸，舒展三焦', p: {
            front: { hip: [100, 150], headDy: 3, handR: [96, 36], handL: [104, 36], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], headTilt: -10, handR: [106, 42], handL: [100, 44], bendR: 1, bendL: 1 } } },
        { t: 5.8, cap: '两臂分开，沿体前缓缓下落', p: {
            front: { hip: [100, 147], headDy: 3, handR: [95, 34], handL: [105, 34], bendR: 1, bendL: -1 },
            side:  { hip: [100, 147], headTilt: -10, handR: [106, 40], handL: [100, 42], bendR: 1, bendL: 1 } } },
        { t: 6.6, cap: '两臂分开，沿体前缓缓下落', p: {
            front: { hip: [100, 150], handR: [140, 80], handL: [60, 80], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], headTilt: 0, handR: [124, 96], handL: [78, 100], bendR: 1, bendL: 1 } } },
        { t: 7.7, cap: '上托吸气 · 下落呼气 · 重复 6~8 次', p: {
            front: { hip: [100, 150], handR: [100, 140], handL: [100, 140], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], handR: [112, 138], handL: [106, 140], bendR: 1, bendL: 1 } } }
      ]
    },
    cuoxielei: {
      views: ['front', 'side'], cycle: 9.0,
      keys: [
        { t: 0.0, cap: '双手掌贴紧两侧胁肋', p: {
            front: { hip: [100, 150], handR: [112, 110], handL: [88, 110], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [110, 112], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 1.5, cap: '沿肋间隙来回推搓', p: {
            front: { hip: [100, 150], handR: [112, 110], handL: [88, 110], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [110, 112], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 2.6, cap: '沿肋间隙来回推搓', p: {
            front: { hip: [100, 150], handR: [112, 101], handL: [88, 101], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [117, 122], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 3.7, cap: '沿肋间隙来回推搓', p: {
            front: { hip: [100, 150], handR: [112, 118], handL: [88, 118], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [104, 107], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 4.8, cap: '沿肋间隙来回推搓', p: {
            front: { hip: [100, 150], handR: [112, 101], handL: [88, 101], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [117, 122], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 5.9, cap: '力度均匀，搓至微微发热', p: {
            front: { hip: [100, 150], handR: [112, 118], handL: [88, 118], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [104, 107], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 7.2, cap: '疏肝解郁 · 来回 30 次', p: {
            front: { hip: [100, 150], handR: [112, 110], handL: [88, 110], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [112, 115], handL: [94, 132], bendR: 1, bendL: 1 } } }
      ]
    },
    ceyao: {
      views: ['front'], cycle: 14.0,
      keys: [
        { t: 0.0, cap: '站直放松，双脚与肩同宽', p: { front: { hip: [100, 150], handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 } } },
        { t: 1.3, cap: '右手上举，身体向左侧弯', p: { front: { hip: [100, 150], handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 } } },
        { t: 2.6, cap: '右手上举，身体向左侧弯', p: { front: { hip: [100, 150], handR: [160, 118], handL: [80, 145], bendR: 1, bendL: 1 } } },
        { t: 3.9, cap: '右手上举，身体向左侧弯', p: { front: { hip: [100, 150], lean: -16, handR: [100, 52], handL: [78, 140], bendR: 1, bendL: 1 } } },
        { t: 5.3, cap: '保持拉伸，感受腰侧牵拉', p: { front: { hip: [100, 150], lean: -16, handR: [100, 52], handL: [78, 140], bendR: 1, bendL: 1 } } },
        { t: 6.6, cap: '吸气还原，换另一边', p: { front: { hip: [100, 150], handR: [160, 118], handL: [80, 145], bendR: 1, bendL: 1 } } },
        { t: 7.9, cap: '吸气还原，换另一边', p: { front: { hip: [100, 150], handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 } } },
        { t: 9.2, cap: '左手上举，身体向右侧弯', p: { front: { hip: [100, 150], handR: [120, 145], handL: [40, 118], bendR: -1, bendL: -1 } } },
        { t: 10.5, cap: '左手上举，身体向右侧弯', p: { front: { hip: [100, 150], lean: 16, handR: [122, 140], handL: [100, 52], bendR: -1, bendL: -1 } } },
        { t: 11.9, cap: '保持拉伸，感受腰侧牵拉', p: { front: { hip: [100, 150], lean: 16, handR: [122, 140], handL: [100, 52], bendR: -1, bendL: -1 } } },
        { t: 13.0, cap: '吸气还原 · 左右各 15 次', p: { front: { hip: [100, 150], handR: [120, 145], handL: [40, 118], bendR: -1, bendL: -1 } } }
      ]
    },
    kuoxiong: {
      views: ['back', 'side'], cycle: 10.0,
      keys: [
        { t: 0.0, cap: '双手背后，十指交叉', p: {
            back:  { hip: [100, 150], handR: [106, 136], handL: [94, 136], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [86, 136], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 1.5, cap: '双手背后，十指交叉', p: {
            back:  { hip: [100, 150], handR: [106, 136], handL: [94, 136], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [86, 136], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 2.5, cap: '握手上提，展开肩背', p: {
            back:  { hip: [100, 150], shoulderDy: -4, handR: [104, 122], handL: [96, 122], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 1, handR: [88, 133], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 3.5, cap: '握手上提，展开肩背', p: {
            back:  { hip: [100, 150], shoulderDy: -4, handR: [104, 120], handL: [96, 120], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 0, handR: [89, 131], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 5.5, cap: '保持拉伸 · 舒展胸部', p: {
            back:  { hip: [100, 150], shoulderDy: -4, handR: [104, 118], handL: [96, 118], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: -1, handR: [90, 129], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 7.0, cap: '呼气松手，自然下垂', p: {
            back:  { hip: [100, 150], handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [96, 146], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 7.8, cap: '上提 8~10 次', p: {
            back:  { hip: [100, 150], handR: [112, 141], handL: [88, 141], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [92, 142], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 8.5, cap: '上提 8~10 次', p: {
            back:  { hip: [100, 150], handR: [106, 136], handL: [94, 136], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 2, handR: [88, 138], handL: [94, 132], bendR: 1, bendL: 1 } } }
      ]
    },
    xuanyao: {
      views: ['front'], cycle: 12.0,
      keys: [
        { t: 0.0, cap: '双臂侧平举，双脚站稳', p: {
            front: { hip: [100, 150], handR: [164, 99], handL: [36, 99], bendR: 1, bendL: -1 } } },
        { t: 3.0, cap: '腰腹缓缓向右转', p: {
            front: { hip: [100, 150], lean: 14, spin: 1, headTilt: 10, handR: [168, 115], handL: [44, 88], bendR: 1, bendL: -1 } } },
        { t: 6.0, cap: '腰腹缓缓向左转', p: {
            front: { hip: [100, 150], lean: -14, spin: -1, headTilt: -10, handR: [156, 88], handL: [32, 115], bendR: 1, bendL: -1 } } },
        { t: 9.0, cap: '左右各转 10 圈 · 放松腰背', p: {
            front: { hip: [100, 150], handR: [164, 99], handL: [36, 99], bendR: 1, bendL: -1 } } }
      ]
    },
    anrou: {
      views: ['hands'], cycle: 9.0,
      keys: [
        { t: 0.0, cap: '拇指按于合谷穴（虎口肌肉最高点）', p: {} },
        { t: 1.5, cap: '拇指打圈按揉，酸胀为度', p: {} },
        { t: 6.8, cap: '换手 · 左右各按 1 分钟', p: {} }
      ]
    },
    songjian: {
      views: ['front', 'side'], cycle: 10.0,
      keys: [
        { t: 0.0, cap: '双肩缓缓上提耸起', p: {
            front: { hip: [100, 150], handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 2.0, cap: '双肩缓缓上提耸起', p: {
            front: { hip: [100, 150], shoulderDy: -5, handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], shoulderDy: -5, handR: [114, 123], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 4.0, cap: '呼气落下，彻底放松', p: {
            front: { hip: [100, 150], handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 5.5, cap: '头部缓慢侧向绕转', p: {
            front: { hip: [100, 150], headTilt: 10, handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], headTilt: 9, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 7.0, cap: '头部缓慢侧向绕转', p: {
            front: { hip: [100, 150], headTilt: -10, handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], headTilt: -9, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 8.5, cap: '耸肩 10 次 · 绕颈 5 圈', p: {
            front: { hip: [100, 150], headTilt: 0, handR: [120, 145], handL: [80, 145], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], headTilt: 0, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } }
      ]
    },
    cuozhang: {
      views: ['front', 'side'], cycle: 10.0,
      keys: [
        { t: 0.0, cap: '双手快速对搓至掌心发热', p: {
            front: { hip: [100, 150], handR: [106, 116], handL: [94, 116], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 4, handR: [110, 116], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 1.2, cap: '双手快速对搓至掌心发热', p: {
            front: { hip: [100, 150], handR: [110, 118], handL: [90, 114], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 4, handR: [114, 118], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 2.4, cap: '双手快速对搓至掌心发热', p: {
            front: { hip: [100, 150], handR: [106, 116], handL: [94, 116], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 4, handR: [107, 114], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 3.6, cap: '双手快速对搓至掌心发热', p: {
            front: { hip: [100, 150], handR: [110, 118], handL: [90, 114], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 4, handR: [114, 118], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 4.8, cap: '轻闭双眼，双手捂面', p: {
            front: { hip: [100, 150], handR: [106, 116], handL: [94, 116], bendR: -1, bendL: 1 },
            side:  { hip: [100, 150], lean: 4, handR: [110, 116], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 6.2, cap: '自下而上轻抚，如干洗脸', p: {
            front: { hip: [100, 150], handR: [112, 62], handL: [88, 62], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 2, headTilt: 4, handR: [114, 72], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 8.0, cap: '提神疏气 · 搓 20 次', p: {
            front: { hip: [100, 150], handR: [114, 70], handL: [86, 70], bendR: 1, bendL: -1 },
            side:  { hip: [100, 150], lean: 2, headTilt: 2, handR: [115, 80], handL: [94, 132], bendR: 1, bendL: 1 } } }
      ]
    },
    dianjiao: {
      views: ['side'], cycle: 12.0,
      keys: [
        { t: 0.0, cap: '双脚前后开立，站稳放松', p: { side: { hip: [100, 150], heel: 0, heelF: 0, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 1.4, cap: '前脚踮起，脚跟缓缓上抬', p: { side: { hip: [100, 149], heel: 9, heelF: 0, handR: [114, 127], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 2.8, cap: '提至最高，稍作停顿', p: { side: { hip: [100, 148], heel: 9, heelF: 0, handR: [114, 126], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 4.0, cap: '呼气落下，换后脚', p: { side: { hip: [100, 150], heel: 0, heelF: 0, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 5.4, cap: '后脚踮起，脚跟缓缓上抬', p: { side: { hip: [100, 149], heel: 0, heelF: 9, handR: [114, 127], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 6.8, cap: '保持，感受小腿发力', p: { side: { hip: [100, 148], heel: 0, heelF: 9, handR: [114, 126], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 8.0, cap: '呼气落下，双脚放松', p: { side: { hip: [100, 150], heel: 0, heelF: 0, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 9.2, cap: '前脚尖翘起勾足，拉伸小腿', p: { side: { hip: [100, 150], heel: -5, heelF: 0, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 10.4, cap: '换后脚尖翘起勾足', p: { side: { hip: [100, 150], heel: 0, heelF: -5, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 11.5, cap: '踮脚 30 次 · 促进下肢气血', p: { side: { hip: [100, 150], heel: 0, heelF: 0, handR: [114, 128], handL: [94, 132], bendR: 1, bendL: 1 } } }
      ]
    },
    chuida: {
      views: ['side'], cycle: 10.0,
      keys: [
        { t: 0.0, cap: '双手握空拳，缓缓前倾弯腰', p: { side: { hip: [100, 150], lean: 10, handR: [122, 128], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 1.5, cap: '空拳沿大腿外侧，从髋向下敲', p: { side: { hip: [100, 150], lean: 32, handR: [107, 146], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 2.7, cap: '空拳沿大腿外侧，从髋向下敲', p: { side: { hip: [100, 150], lean: 32, handR: [109, 150], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 3.9, cap: '力度放松，节奏均匀', p: { side: { hip: [100, 150], lean: 32, handR: [110, 147], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 5.1, cap: '力度放松，节奏均匀', p: { side: { hip: [100, 150], lean: 32, handR: [108, 144], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 6.3, cap: '沿大腿外侧，上下往返', p: { side: { hip: [100, 150], lean: 32, handR: [109, 149], handL: [94, 132], bendR: 1, bendL: 1 } } },
        { t: 7.5, cap: '疏通胆经 · 往返 3 遍', p: { side: { hip: [100, 150], lean: 10, handR: [122, 128], handL: [94, 132], bendR: 1, bendL: 1 } } }
      ]
    }
  };

  function getKey(name) {
    var n = String(name || '');
    if (n.indexOf('梳头') > -1) return 'shutou';
    if (n.indexOf('托天') > -1) return 'tuotian';
    if (n.indexOf('搓胁') > -1) return 'cuoxielei';
    if (n.indexOf('侧腰') > -1) return 'ceyao';
    if (n.indexOf('扩胸') > -1) return 'kuoxiong';
    if (n.indexOf('旋腰') > -1) return 'xuanyao';
    if (n.indexOf('合谷') > -1) return 'anrou';
    if (n.indexOf('耸肩') > -1) return 'songjian';
    if (n.indexOf('搓掌') > -1 || n.indexOf('浴面') > -1) return 'cuozhang';
    if (n.indexOf('踮脚') > -1 || n.indexOf('勾足') > -1) return 'dianjiao';
    if (n.indexOf('捶打') > -1 || n.indexOf('胆经') > -1) return 'chuida';
    return null;
  }

  /* ---------- 手部特写（按揉合谷） ---------- */
  // 左手背朝上（拇指张开），右手拇指按压合谷穴并打圈，按压点带波纹扩散
  function renderHands(tt) {
    var px = 84, py = 136;                       // 合谷穴（虎口肌肉最高点）
    var ang = tt / 1.5 * Math.PI * 2;            // 每 1.5s 打圈一周
    var tipX = px + Math.cos(ang) * 2.5;         // 右手拇指尖（绕穴小圈）
    var tipY = py + Math.sin(ang) * 2.5;
    var s = '';
    // 左手：手背视角，四指朝上，拇指向左张开
    s += '<rect x="86" y="128" width="30" height="58" rx="13" fill="' + PANEL +
         '" stroke="' + INK + '" stroke-width="5"/>';
    s += line(92, 130, 90, 94, INK, 5);          // 食指
    s += line(99, 128, 99, 88, INK, 5);          // 中指
    s += line(106, 128, 107, 90, INK, 5);        // 无名指
    s += line(113, 132, 116, 102, INK, 5);       // 小指
    s += poly([[88, 152], [74, 146], [64, 136]], INK, 5);   // 拇指（张开）
    s += line(94, 186, 92, 208, INK, 5);         // 手腕
    s += line(108, 186, 110, 208, INK, 5);
    // 合谷穴标注：红点 + 引线 + 文字
    s += '<circle cx="' + px + '" cy="' + py + '" r="3.5" fill="#C0392B"/>';
    s += line(px - 20, py + 22, px - 3, py + 4, '#C0392B', 1.5);
    s += '<text x="' + (px - 58) + '" y="' + (py + 30) + '" font-size="11" fill="#8A6D3B">合谷穴</text>';
    // 右手：前臂从右上进入，拇指按压穴位
    s += poly([[186, 30], [146, 84], [114, 116]], INK, 7);
    s += poly([[114, 116], [tipX + 8, tipY - 12], [tipX, tipY]], INK, 6);
    s += '<circle cx="' + tag(tipX) + '" cy="' + tag(tipY) + '" r="4.5" fill="' + INK + '"/>';
    // 按压波纹：由小到大、由深到浅循环扩散
    var ph = (tt % 1.5) / 1.5;
    s += '<circle cx="' + px + '" cy="' + py + '" r="' + (5 + ph * 12).toFixed(1) +
         '" fill="none" stroke="#C0392B" stroke-width="1.5" opacity="' + (0.4 * (1 - ph)).toFixed(2) + '"/>';
    return '<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + s + '</svg>';
  }

  /* ---------- 播放器 ---------- */
  var registry = new Set();
  var SPEEDS = [1, 1.5, 0.5];
  var VIEW_NAMES = { front: '正面', side: '侧面', back: '背面', hands: '手部特写', taiji: '太极服', 'refined-front': '正面', 'refined-side': '侧面' };

  function mount(container, key) {
    var def = ANIMS[key];
    if (!container || !def) return null;

    container.innerHTML =
      '<div class="pd-anim-stage' + (def.views.length > 1 ? ' multi' : '') + '">' +
      def.views.map(function (v) {
        var figHtml = (v === 'video' && def.videoSrc)
          ? '<div class="pd-anim-fig"><video src="' + def.videoSrc + '" muted loop autoplay playsinline style="width:100%;max-width:230px;display:block;margin:0 auto;border-radius:8px;background:#f8f5ef"></video></div>'
          : '<div class="pd-anim-fig"></div>';
        return '<div class="pd-anim-col">' + figHtml +
               '<div class="pd-anim-view">' + (VIEW_NAMES[v] || '') + '</div></div>';
      }).join('') +
      '</div>' +
      '<div class="pd-anim-cap"></div>' +
      '<div class="pd-anim-bar">' +
      '  <button type="button" class="pd-anim-btn" data-act="pause">⏸ 暂停</button>' +
      '  <button type="button" class="pd-anim-btn" data-act="speed">速度 ×1</button>' +
      '</div>';
    var stages = Array.prototype.slice.call(container.querySelectorAll('.pd-anim-fig'));
    var cap = container.querySelector('.pd-anim-cap');
    var st = { t0: performance.now(), paused: false, pauseAt: 0, speed: 1, lastCap: null, raf: 0, dead: false };
    // 视频模式：速率对齐文案时间轴（视频放慢/加快到 def.cycle 一个循环）
    var videoEl = def.videoSrc ? container.querySelector('video') : null;
    var videoBase = 1;
    if (videoEl) {
      videoEl.addEventListener('loadedmetadata', function () {
        videoBase = videoEl.duration / def.cycle;
        videoEl.playbackRate = videoBase * st.speed;
      });
    }
    function syncVideo() {
      if (!videoEl) return;
      videoEl.playbackRate = videoBase * st.speed;
      if (st.paused) videoEl.pause(); else videoEl.play().catch(function () {});
    }

    function frame(now) {
      if (st.dead) return;
      if (!st.paused) {
        var tt = ((now - st.t0) / 1000 * st.speed) % def.cycle;
        var ks = def.keys, i = 0, j;
        for (j = 0; j < ks.length; j++) { if (tt >= ks[j].t) i = j; }
        var k0 = ks[i], k1 = ks[(i + 1) % ks.length];
        var end = (i + 1 < ks.length) ? k1.t : def.cycle + ks[0].t;
        var e = smooth((tt - k0.t) / Math.max(end - k0.t, 0.0001));
        for (var v = 0; v < def.views.length; v++) {
          var view = def.views[v];
          if (view === 'video') { /* 视频自播放，文案仍由时间轴驱动 */ }
          else if (view === 'hands') { stages[v].innerHTML = renderHands(tt); }
          else if (view === 'taiji') { stages[v].innerHTML = renderTaiji(lerpPose(k0.p.front, k1.p.front, e)); }
          else { var bv = view.replace('refined-', ''); stages[v].innerHTML = renderSVG(lerpPose(k0.p[bv], k1.p[bv], e), view, tt); }
        }
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
      syncVideo();
    });
    container.querySelector('[data-act="speed"]').addEventListener('click', function () {
      var idx = (SPEEDS.indexOf(st.speed) + 1) % SPEEDS.length;
      st.speed = SPEEDS[idx];
      this.textContent = '速度 ×' + st.speed;
      syncVideo();
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

  function initObserver() {
    var box = document.getElementById('modalBox');
    if (!box || typeof MutationObserver === 'undefined') return;
    new MutationObserver(function () {
      registry.forEach(function (p) { if (!p._c || !p._c.isConnected) p.destroy(); });
    }).observe(box, { childList: true, subtree: true });
  }
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

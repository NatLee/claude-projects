/* ==========================================================================
 * physics.js —— 純函式：重力滑降時間、擺線求解、等時線
 * 世界座標：x 向右，y 向下（與 canvas 同向），重力 g 沿 +y。
 * 珠子從路徑起點靜止釋放，無摩擦，能量守恆：v = sqrt(2 g Δy)。
 * 同時給瀏覽器（<script src>，掛全域）與 node（require，跑斷言）使用。
 * ========================================================================== */
'use strict';

var G = 9.80665;

/* 高度 h（相對起點，往下為正）處的速率 */
function speedAt(h, g) {
  return h <= 0 ? 0 : Math.sqrt(2 * (g === undefined ? G : g) * h);
}

/* --------------------------------------------------------------------------
 * 一條折線路徑的滑降總時間。
 * pts：[{x,y}, …]，第一點為釋放點。
 * 單一線段內加速度沿線段方向為定值，故 t = 2·ds/(v1+v2) 是「精確」而非近似；
 * 誤差只來自把曲線切成折線。
 * 回傳 { time, cum:[每點累計時間], ok, reason }
 *   ok=false：路徑爬升超過起點高度（珠子上不去）或長度為零。
 * ------------------------------------------------------------------------ */
function descentTime(pts, g) {
  g = g === undefined ? G : g;
  var cum = [0];
  if (!pts || pts.length < 2) return { time: Infinity, cum: cum, ok: false, reason: 'too-short' };
  var y0 = pts[0].y;
  var t = 0;
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1], b = pts[i];
    var h1 = a.y - y0, h2 = b.y - y0;
    if (h2 < -1e-9) return { time: Infinity, cum: cum, ok: false, reason: 'uphill' };
    var dx = b.x - a.x, dy = b.y - a.y;
    var ds = Math.hypot(dx, dy);
    if (ds < 1e-12) { cum.push(t); continue; }
    var v1 = speedAt(h1, g), v2 = speedAt(h2, g);
    if (v1 + v2 <= 1e-12) return { time: Infinity, cum: cum, ok: false, reason: 'flat-start' };
    t += 2 * ds / (v1 + v2);
    cum.push(t);
  }
  return { time: t, cum: cum, ok: true, reason: '' };
}

/* 沿路徑走 arc-length s 的位置（線性內插），給動畫用 */
function pointAtTime(pts, cum, t) {
  var n = cum.length;
  if (t <= 0) return { x: pts[0].x, y: pts[0].y, i: 0, done: false };
  if (t >= cum[n - 1]) return { x: pts[n - 1].x, y: pts[n - 1].y, i: n - 1, done: true };
  var lo = 0, hi = n - 1;
  while (lo + 1 < hi) {
    var mid = (lo + hi) >> 1;
    if (cum[mid] <= t) lo = mid; else hi = mid;
  }
  var span = cum[hi] - cum[lo];
  var f = span > 1e-12 ? (t - cum[lo]) / span : 0;
  return {
    x: pts[lo].x + (pts[hi].x - pts[lo].x) * f,
    y: pts[lo].y + (pts[hi].y - pts[lo].y) * f,
    i: lo, done: false
  };
}

/* --------------------------------------------------------------------------
 * 擺線（cycloid）：x = r(θ − sinθ)，y = r(1 − cosθ)，θ ∈ [0, Θ]
 * 已知終點位移 (dx, dy)（皆為正，y 向下），解出 Θ 與 r。
 * f(Θ) = (Θ − sinΘ)/(1 − cosΘ) 在 (0, 2π) 嚴格遞增，0 → ∞，用二分法。
 * ------------------------------------------------------------------------ */
function solveCycloid(dx, dy) {
  var K = dx / dy;
  var lo = 1e-9, hi = 2 * Math.PI - 1e-9;
  for (var i = 0; i < 200; i++) {
    var mid = (lo + hi) / 2;
    var f = (mid - Math.sin(mid)) / (1 - Math.cos(mid));
    if (f < K) lo = mid; else hi = mid;
  }
  var theta = (lo + hi) / 2;
  var r = dy / (1 - Math.cos(theta));
  return { theta: theta, r: r };
}

/* 擺線的解析滑降時間：T = Θ·sqrt(r/g) */
function cycloidTime(r, theta, g) {
  return theta * Math.sqrt(r / (g === undefined ? G : g));
}

/* 取樣擺線成折線（起點 x0,y0 → 終點 x0+dx, y0+dy） */
function cycloidPoints(x0, y0, dx, dy, n) {
  var s = solveCycloid(dx, dy);
  var pts = [];
  n = n || 400;
  for (var i = 0; i <= n; i++) {
    var th = s.theta * i / n;
    pts.push({ x: x0 + s.r * (th - Math.sin(th)), y: y0 + s.r * (1 - Math.cos(th)) });
  }
  return { pts: pts, r: s.r, theta: s.theta };
}

/* --------------------------------------------------------------------------
 * 等時線（tautochrone）：同一條擺線碗，從任一高度靜止釋放，
 * 抵達最低點的時間都是 T = π·sqrt(r/g)（與釋放高度完全無關）。
 * 碗（把擺線拱門翻過來，最低點擺在 φ=0）：φ ∈ [−π, π]
 *   x = r(φ + sinφ)      y = r(1 + cosφ)   （y 向下為正，φ=0 時 y=2r 最低）
 * 沿弧長 s = 4r·sin(φ/2) 的運動是「嚴格」簡諧：s(t) = s0·cos(ωt)，ω = sqrt(g/4r)。
 * 所以 sin(φ/2) = sin(φ0/2)·cos(ωt)——注意不是 φ 本身做簡諧。
 * ------------------------------------------------------------------------ */
function tautochroneBowl(r, n) {
  var pts = [];
  n = n || 400;
  for (var i = 0; i <= n; i++) {
    var ph = -Math.PI + 2 * Math.PI * i / n;
    pts.push({ x: r * (ph + Math.sin(ph)), y: r * (1 + Math.cos(ph)) });
  }
  return pts;
}
function tautochroneOmega(r, g) { return Math.sqrt((g === undefined ? G : g) / (4 * r)); }
function tautochroneAt(r, phi0, t, g) {
  var s = Math.sin(phi0 / 2) * Math.cos(tautochroneOmega(r, g) * t);
  var ph = 2 * Math.asin(Math.max(-1, Math.min(1, s)));
  return { x: r * (ph + Math.sin(ph)), y: r * (1 + Math.cos(ph)), phi: ph };
}
function tautochronePeriodQuarter(r, g) { return Math.PI / (2 * tautochroneOmega(r, g)); }

/* 直線滑降時間（純解析，給斷言對照） */
function straightTime(dx, dy, g) {
  g = g === undefined ? G : g;
  if (dy <= 0) return Infinity;
  var L = Math.hypot(dx, dy);
  return L * Math.sqrt(2 / (g * dy));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    G: G, speedAt: speedAt, descentTime: descentTime, pointAtTime: pointAtTime,
    solveCycloid: solveCycloid, cycloidTime: cycloidTime, cycloidPoints: cycloidPoints,
    tautochroneBowl: tautochroneBowl, tautochroneAt: tautochroneAt,
    tautochroneOmega: tautochroneOmega, tautochronePeriodQuarter: tautochronePeriodQuarter,
    straightTime: straightTime
  };
}

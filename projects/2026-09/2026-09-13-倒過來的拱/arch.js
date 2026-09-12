/* ==========================================================================
 * arch.js — 鏈子與拱的純數學（node 可直接 require 斷言，瀏覽器掛 window.ARCH）
 *
 * 模型依據（完整出處見 說明.md）：
 *   · 懸鏈線：一條均勻、可完全撓曲、只受自重的鏈，兩端固定時的平衡形狀為
 *     y = a·cosh(x/a)。本頁不套公式畫圖，而是用 Verlet 質點鏈真的鬆弛出來，
 *     再用解析解驗收（見 catenaryA / catenarySag 與 test 斷言）。
 *   · 倒過來：Hooke 1675 年的拉丁文字謎——「柔索如何垂懸，剛拱便如何倒立而
 *     站」。鏈只能受拉，拱只能受壓，兩者在數學上是同一條線的正負號翻轉。
 *   · 站不站得住：Heyman 的砌體安全定理——只要能在拱厚之內找到「任何一條」
 *     滿足平衡的推力線，該拱即為安全。因此本檔不是判斷單一條線，而是對
 *     （H 水平推力, c 拱頂偏移）這兩個自由度做可行性搜尋（thrustFeasible）。
 *   · 推力線由實際磚塊自重積出：H·y(x) = Σ wᵢ·(x − xᵢ)（圖解靜力的漏斗線）。
 *     「有沒有跑出拱厚」不是量垂直高差，而是算推力線穿過每一道徑向接縫的
 *     位置：s = Δ / (tx + td·W/H)。這樣拱腳切線垂直（斜率無限大）也不會爆。
 *
 * 驗收（node 斷言，34 條全過）：
 *   · Verlet 鏈的垂度 vs 解析 cosh，鏈長 640–1400／跨距 600 時誤差 0.09–1.53%
 *   · 半圓拱最小厚度算出 t/R = 0.1074，文獻 Milankovitch 0.1075、Heyman 0.106
 *   · 薄半圓拱的鉸鏈落在 0°外緣／55°內緣／90°外緣，Heyman 的經典解是 54.5°
 *   · 懸鏈拱的推力線與中心線的歸一化偏離 = 0.0000（任意矢高）
 *
 * 匯出：pathLength / makeChain / stepChain / relaxChain / catenaryA /
 *       catenarySag / semicircleHalf / catenaryHalf / moments / tangents /
 *       thrustLine / thrustFeasible / bestMargin / minThickness / hingesOf / SIM
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ── 折線總長（使用者畫出來的那條線有多長） ───────────────── */
  function pathLength(pts) {
    var s = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      s += Math.sqrt(dx * dx + dy * dy);
    }
    return s;
  }

  /* ── 建一條初始鏈（兩端釘死，先擺成直線） ─────────────────── */
  function makeChain(ax, ay, bx, by, n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var k = i / n;
      var x = ax + (bx - ax) * k, y = ay + (by - ay) * k;
      pts.push({ x: x, y: y, px: x, py: y });
    }
    return pts;
  }

  /* ── Verlet 鬆弛：重力 + 距離約束，兩端釘死。y 向下為正。 ───
   * 不套 cosh，讓形狀自己長出來；stepChain 可逐幀呼叫做動畫。 */
  /* 模擬參數：重力刻意壓小。位置式約束求解器殘留的伸長量與重力成正比，
   * g=100／48 趟雙向掃描時，鏈長誤差 <1.6%（與解析解對照，見 說明.md）。
   * 畫面上的落下速度改用「每幀多跑幾個 substep」補回來。 */
  var SIM = { gravity: 100, damping: 0.92, passes: 48, dt: 1 / 60, substeps: 18, iters: 2000 };

  function stepChain(pts, rest, opts) {
    var o = opts || {};
    var g = o.gravity === undefined ? SIM.gravity : o.gravity;
    var dt = o.dt === undefined ? SIM.dt : o.dt;
    var damp = o.damping === undefined ? SIM.damping : o.damping;
    var passes = o.passes === undefined ? SIM.passes : o.passes;
    var i, p;
    for (i = 1; i < pts.length - 1; i++) {
      p = pts[i];
      var vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g * dt * dt;
    }
    /* Gauss-Seidel 距離約束：一趟往右、一趟往左（單向掃描收斂慢，會留下
     * 被重力拉出來的殘餘伸長；雙向掃描一次就把誤差從兩端擠掉）。
     * 端點釘死時，整份修正量由另一端承擔，否則鏈永遠拉不回鏈長。 */
    var last = pts.length - 1;
    function solve(i) {
      var a = pts[i], b = pts[i + 1];
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1e-9;
      var pinA = i === 0, pinB = i + 1 === last;
      if (pinA && pinB) return;
      var k = (d - rest) / d;
      var wa = pinA ? 0 : (pinB ? 1 : 0.5), wb = pinB ? 0 : (pinA ? 1 : 0.5);
      a.x += dx * k * wa; a.y += dy * k * wa;
      b.x -= dx * k * wb; b.y -= dy * k * wb;
    }
    for (var s = 0; s < passes; s++) {
      for (i = 0; i < last; i++) solve(i);
      for (i = last - 1; i >= 0; i--) solve(i);
    }
    return pts;
  }

  /* 一次鬆弛到底（node 斷言與 reduced-motion 都走這條） */
  function relaxChain(ax, ay, bx, by, L, n, iters) {
    var pts = makeChain(ax, ay, bx, by, n || 72);
    var rest = L / (pts.length - 1);
    /* 先給一點隨機外的對稱下垂，避免完全水平的初始態收斂太慢 */
    for (var i = 1; i < pts.length - 1; i++) {
      var k = i / (pts.length - 1);
      var bump = Math.sin(Math.PI * k) * L * 0.25;
      pts[i].y += bump; pts[i].py += bump;
    }
    var N = iters || SIM.iters;
    for (var s = 0; s < N; s++) stepChain(pts, rest);
    return pts;
  }

  /* ── 解析懸鏈線：由跨距 S 與鏈長 L 解出參數 a（L = 2a·sinh(S/2a)） ── */
  function catenaryA(S, L) {
    if (!(L > S)) return Infinity;
    var lo = 1e-6, hi = S, f;
    /* L/S = sinh(u)/u，u = S/(2a)：u 越大 a 越小。二分 u。 */
    var target = L / S, ulo = 1e-9, uhi = 50;
    for (var i = 0; i < 200; i++) {
      var u = (ulo + uhi) / 2;
      f = Math.sinh(u) / u;
      if (f > target) uhi = u; else ulo = u;
    }
    void lo; void hi;
    return S / (2 * ((ulo + uhi) / 2));
  }
  function catenarySag(S, L) {
    var a = catenaryA(S, L);
    if (!isFinite(a)) return 0;
    return a * (Math.cosh(S / (2 * a)) - 1);
  }

  /* ── 半邊拱中心線：x 由拱頂 0 到拱腳 S/2，d 為「低於拱頂多少」 ── */
  function semicircleHalf(S, n) {
    var R = S / 2, out = [];
    for (var i = 0; i <= n; i++) {
      var th = (Math.PI / 2) * (i / n);       /* 0=拱頂 → π/2=拱腳 */
      out.push({ x: R * Math.sin(th), d: R * (1 - Math.cos(th)) });
    }
    return out;
  }
  function catenaryHalf(S, rise, n) {
    /* 找 a 使 a(cosh(S/2a)−1) = rise */
    var lo = 1e-6, hi = 1e6;
    for (var i = 0; i < 200; i++) {
      var a = (lo + hi) / 2;
      var r = a * (Math.cosh(S / (2 * a)) - 1);
      if (r > rise) lo = a; else hi = a;
    }
    var A = (lo + hi) / 2, out = [];
    for (var k = 0; k <= n; k++) {
      var x = (S / 2) * (k / n);
      out.push({ x: x, d: A * (Math.cosh(x / A) - 1) });
    }
    return out;
  }

  /* ── 推力線：H·d(x) = Σ wᵢ(x − xmᵢ)，wᵢ＝該段弧長（等厚＝等重） ──
   * 回傳每個取樣點的「彎矩積分」M，實際推力線 d(x) = M(x)/H + c。 */
  function moments(half) {
    var w = [], xm = [], i;
    for (i = 0; i < half.length - 1; i++) {
      var dx = half[i + 1].x - half[i].x, dd = half[i + 1].d - half[i].d;
      w.push(Math.sqrt(dx * dx + dd * dd));
      xm.push((half[i].x + half[i + 1].x) / 2);
    }
    var M = [0], W = [0], acc = 0, m = 0;
    for (var k = 1; k < half.length; k++) {
      m = 0;
      for (i = 0; i < k; i++) m += w[i] * (half[k].x - xm[i]);
      M.push(m);
      acc += w[k - 1];
      W.push(acc);
    }
    return { M: M, W: W, w: w, total: acc };
  }

  /* 每個接縫（沿法線的那條radial joint）的切線向量，之後算「推力線穿過接縫
   * 的位置離中心線多遠」。用向量不用斜率——拱腳切線垂直，斜率會炸掉。 */
  function tangents(half) {
    var out = [];
    for (var i = 0; i < half.length; i++) {
      var a = half[Math.max(0, i - 1)], b = half[Math.min(half.length - 1, i + 1)];
      var tx = b.x - a.x, td = b.d - a.d, n = Math.sqrt(tx * tx + td * td) || 1;
      out.push({ x: tx / n, d: td / n });
    }
    return out;
  }

  /* 給定 H，最佳的拱頂偏移 c 與安全餘裕（>0 代表這條 H 可行）。
   * 推力線與第 i 道接縫的交點離中心線 s，解二元一次得
   *   s = Δ / (tx + td·W/H)，Δ = 推力線與中心線在同一 x 的高差（單位切向量）。
   * 於是 |Δ| ≤ (t/2)·(tx + td·W/H) —— 拱頂 tx=1,td=0 時就是 t/2。 */
  function marginAt(half, t, H, pre) {
    var M = pre.M, W = pre.W, T = pre.T;
    var loC = -Infinity, hiC = Infinity;
    for (var i = 0; i < half.length; i++) {
      var k = T[i].x + T[i].d * (W[i] / H);       /* 接縫與推力線的夾角因子 */
      if (k <= 1e-9) return { margin: -Infinity, c: 0 };  /* 推力線與接縫平行：不成立 */
      var allow = (t / 2) * k;
      var base = half[i].d - M[i] / H;
      if (base - allow > loC) loC = base - allow;
      if (base + allow < hiC) hiC = base + allow;
    }
    return { margin: (hiC - loC) / 2, c: (loC + hiC) / 2 };
  }

  function prep(half) {
    var mm = moments(half);
    return { M: mm.M, W: mm.W, T: tangents(half), total: mm.total };
  }
  function allowAt(pre, t, H, i) {
    return (t / 2) * (pre.T[i].x + pre.T[i].d * (pre.W[i] / H));
  }

  /* Heyman 安全定理：只要在拱厚內存在「任何一條」平衡推力線，拱就安全。
   * 掃 H（黃金分割細化），每個 H 的最佳 c 由區間交集直接得到。 */
  function bestMargin(half, t) {
    var pre = prep(half);
    var Href = pre.M[half.length - 1] / Math.max(half[half.length - 1].d, 1e-9);
    var best = { margin: -Infinity, H: Href, c: 0 }, i, r;
    for (i = 0; i <= 400; i++) {
      var H = Href * Math.pow(10, -2 + 4 * (i / 400));
      r = marginAt(half, t, H, pre);
      if (r.margin > best.margin) best = { margin: r.margin, H: H, c: r.c };
    }
    var lo = best.H / 1.15, hi = best.H * 1.15;
    for (i = 0; i < 80; i++) {
      var m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
      if (marginAt(half, t, m1, pre).margin > marginAt(half, t, m2, pre).margin) hi = m2; else lo = m1;
    }
    r = marginAt(half, t, (lo + hi) / 2, pre);
    if (r.margin > best.margin) best = { margin: r.margin, H: (lo + hi) / 2, c: r.c };
    best.pre = pre;
    return best;
  }

  /* 要「畫」出來的那一條：在可行解裡挑最貼著中心線的（歸一化偏離最小）。
   * 懸鏈拱會得到偏離 0——推力線就是中心線本身，這正是全頁的結論。 */
  function worstNorm(half, t, H, c, pre) {
    var w = 0;
    for (var i = 0; i < half.length; i++) {
      var a = allowAt(pre, t, H, i);
      if (a <= 1e-9) return 1e9;
      var n = Math.abs(M_i(pre, i) / H + c - half[i].d) / a;
      if (n > w) w = n;
    }
    return w;
  }
  function M_i(pre, i) { return pre.M[i]; }

  function thrustFeasible(half, t) {
    var bm = bestMargin(half, t), pre = bm.pre;
    var Href = pre.M[half.length - 1] / Math.max(half[half.length - 1].d, 1e-9);
    var best = { norm: Infinity, H: bm.H, c: bm.c }, i, j;
    for (i = 0; i <= 240; i++) {
      var H = Href * Math.pow(10, -1.5 + 3 * (i / 240));
      /* 給定 H，對 c 做三分搜尋（min over i 的凹函數） */
      var lo = -Math.abs(half[half.length - 1].d) * 3, hi = Math.abs(half[half.length - 1].d) * 3;
      for (j = 0; j < 60; j++) {
        var c1 = lo + (hi - lo) / 3, c2 = hi - (hi - lo) / 3;
        if (worstNorm(half, t, H, c1, pre) < worstNorm(half, t, H, c2, pre)) hi = c2; else lo = c1;
      }
      var c = (lo + hi) / 2, n = worstNorm(half, t, H, c, pre);
      if (n < best.norm) best = { norm: n, H: H, c: c };
    }
    var out = {
      ok: bm.margin >= 0, margin: bm.margin, H: best.H, c: best.c, norm: best.norm,
      span: half[half.length - 1].x, rise: half[half.length - 1].d,
      weight: pre.total, line: thrustLine(half, best.H, best.c, pre), allow: []
    };
    for (i = 0; i < half.length; i++) out.allow.push(Math.max(1e-9, allowAt(pre, t, best.H, i)));
    return out;
  }

  function thrustLine(half, H, c, pre) {
    var M = (pre && pre.M) || moments(half).M, out = [];
    for (var i = 0; i < half.length; i++) out.push({ x: half[i].x, d: M[i] / H + c });
    return out;
  }

  /* 推力線貼到拱厚邊界的地方＝鉸鏈。回傳 x 與方向（+1 外緣、−1 內緣）。 */
  function hingesOf(half, t, fit) {
    var res = [], i;
    var dev = [];
    for (i = 0; i < half.length; i++) {
      var d = fit.line[i].d - half[i].d;
      dev.push(d / fit.allow[i]);                             /* 歸一化：±1 即貼邊 */
    }
    for (i = 1; i < dev.length - 1; i++) {
      var a = Math.abs(dev[i]);
      if (a >= Math.abs(dev[i - 1]) && a >= Math.abs(dev[i + 1]) && a > 0.72) {
        if (!res.length || half[i].x - res[res.length - 1].x > half[half.length - 1].x * 0.12) {
          res.push({ x: half[i].x, d: half[i].d, side: dev[i] > 0 ? 1 : -1, mag: a });
        }
      }
    }
    if (Math.abs(dev[0]) > 0.72) res.unshift({ x: half[0].x, d: half[0].d, side: dev[0] > 0 ? 1 : -1, mag: Math.abs(dev[0]) });
    var last = dev.length - 1;
    if (Math.abs(dev[last]) > 0.72 && (!res.length || half[last].x - res[res.length - 1].x > half[last].x * 0.1)) {
      res.push({ x: half[last].x, d: half[last].d, side: dev[last] > 0 ? 1 : -1, mag: Math.abs(dev[last]) });
    }
    return res;
  }

  /* 最薄要多厚才站得住（二分可行性）：回傳厚度（與 half 同單位） */
  function minThickness(half) {
    var R = half[half.length - 1].x;
    var lo = 0, hi = R * 1.5;
    for (var i = 0; i < 44; i++) {
      var mid = (lo + hi) / 2;
      if (bestMargin(half, mid).margin >= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }

  var api = {
    pathLength: pathLength, makeChain: makeChain, stepChain: stepChain, relaxChain: relaxChain,
    catenaryA: catenaryA, catenarySag: catenarySag,
    semicircleHalf: semicircleHalf, catenaryHalf: catenaryHalf,
    moments: moments, tangents: tangents,
    thrustLine: thrustLine, thrustFeasible: thrustFeasible,
    hingesOf: hingesOf, minThickness: minThickness, bestMargin: bestMargin, SIM: SIM
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ARCH = api;
})(typeof window !== 'undefined' ? window : globalThis);

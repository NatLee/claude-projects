/* 從雜訊生形 — 在瀏覽器裡當場訓練一個真正的擴散模型（2D 點雲版）。
 *
 * 零外部資源：形狀是程序化生成的，去噪網路是純 JS 寫的，梯度是自己反向傳播算的，
 * 反向採樣完全依 DDPM 的公式一步步跑。核心（CORE）不碰 DOM，可在 node 裡 require 進來測試。
 *
 * 演算法骨架（跟真實的圖像擴散一模一樣，只是這裡的資料是 2D 點）：
 *   前向：x_t = √ᾱ_t · x_0 + √(1-ᾱ_t) · ε        （逐步加高斯雜訊，Sohl-Dickstein 2015 / Ho 2020）
 *   目標：訓練 ε_θ(x_t, t) 去預測那個 ε         （DDPM 的簡化損失 ‖ε − ε_θ‖²）
 *   反向：x_{t-1} = 1/√α_t · (x_t − β_t/√(1-ᾱ_t)·ε_θ) + σ_t·z   （從純雜訊一步步還原）
 *   雜訊排程用 cosine schedule（Nichol & Dhariwal 2021），對任何 T 都能把 ᾱ_T 帶到 ≈0。
 */
(function (global) {
  'use strict';

  /* ==========================================================
   *  CORE：形狀 / 排程 / 去噪 MLP / 反向傳播 / 訓練 / 反向採樣
   * ========================================================== */

  var TAU = Math.PI * 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  /* ---- 目標形狀：回傳一堆原始 2D 點 [[x,y],...] ---- */
  function pointInPoly(px, py, poly) {
    var inside = false, n = poly.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  var SHAPES = {
    heart: function (rng, n) {                       // 實心愛心：用隱函數做拒絕採樣
      var p = [], guard = 0;
      while (p.length < n && guard < n * 90) {
        guard++;
        var x = (rng() * 2 - 1) * 1.35, y = (rng() * 2 - 1) * 1.5;
        var f = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
        if (f <= 0) p.push([x, y + 0.15]);
      }
      return p;
    },
    ring: function (rng, n) {                         // 圓環：中間留一個洞
      var p = [];
      for (var i = 0; i < n; i++) {
        var a = rng() * TAU, r = 1 + gauss(rng) * 0.085;
        p.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return p;
    },
    moons: function (rng, n) {                        // 雙月：機器學習經典玩具資料集
      var p = [];
      for (var i = 0; i < n; i++) {
        var arm = i % 2, t = rng() * Math.PI, x, y;
        if (arm === 0) { x = Math.cos(t); y = Math.sin(t); }
        else { x = 1 - Math.cos(t); y = 1 - Math.sin(t) - 0.5; }
        p.push([x - 0.5 + gauss(rng) * 0.05, y - 0.25 + gauss(rng) * 0.05]);
      }
      return p;
    },
    star: function (rng, n) {                         // 實心五角星
      var poly = [];
      for (var k = 0; k < 10; k++) {
        var R = (k % 2 === 0) ? 1.0 : 0.42, a = -Math.PI / 2 + k * Math.PI / 5;
        poly.push([R * Math.cos(a), R * Math.sin(a)]);
      }
      var p = [], guard = 0;
      while (p.length < n && guard < n * 90) {
        guard++;
        var x = (rng() * 2 - 1) * 1.05, y = (rng() * 2 - 1) * 1.05;
        if (pointInPoly(x, y, poly)) p.push([x, y]);
      }
      return p;
    }
  };

  // 把任意點雲標準化到「零均值、平均每維變異數 ≈ 1」，讓它跟 N(0,I) 先驗對得上。
  // 用等向縮放（單一 scale）以保留長寬比。回傳映射回原座標所需的 mean 與 scale。
  function standardize(pts) {
    var n = pts.length, mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += pts[i][0]; my += pts[i][1]; }
    mx /= n; my /= n;
    var vx = 0, vy = 0;
    for (i = 0; i < n; i++) { var dx = pts[i][0] - mx, dy = pts[i][1] - my; vx += dx * dx; vy += dy * dy; }
    vx /= n; vy /= n;
    var sc = Math.sqrt((vx + vy) / 2) || 1;
    var out = new Float64Array(n * 2);
    for (i = 0; i < n; i++) { out[i * 2] = (pts[i][0] - mx) / sc; out[i * 2 + 1] = (pts[i][1] - my) / sc; }
    return { pts: out, n: n, mean: [mx, my], scale: sc };
  }

  /* ---- 雜訊排程：cosine schedule（Nichol & Dhariwal 2021） ---- */
  // ᾱ_t = f(t)/f(0)，f(t)=cos²(((t/T+s)/(1+s))·π/2)，s=0.008。
  // 由 ᾱ 反推 β_t = 1 − ᾱ_t/ᾱ_{t-1}（夾住上限避免奇異），σ_t² = 後驗變異數 β̃_t。
  function makeSchedule(T) {
    var s = 0.008;
    function fbar(k) { var v = Math.cos(((k / T + s) / (1 + s)) * Math.PI / 2); return v * v; }
    var f0 = fbar(0);
    var abar = new Float64Array(T), abarPrev = new Float64Array(T),
        beta = new Float64Array(T), alpha = new Float64Array(T), sigma = new Float64Array(T);
    for (var i = 0; i < T; i++) {
      abar[i] = fbar(i + 1) / f0;
      abarPrev[i] = fbar(i) / f0;
      var b = 1 - abar[i] / abarPrev[i];
      if (b > 0.999) b = 0.999; if (b < 1e-8) b = 1e-8;
      beta[i] = b; alpha[i] = 1 - b;
      var bt = (1 - abarPrev[i]) / (1 - abar[i]) * beta[i];
      sigma[i] = Math.sqrt(bt > 0 ? bt : 0);
    }
    return { T: T, abar: abar, abarPrev: abarPrev, beta: beta, alpha: alpha, sigma: sigma };
  }

  /* ---- 時間嵌入：把步數 t 編成一組傅立葉特徵，讓網路知道「現在雜訊多重」 ---- */
  var NF = 8;                 // 頻率數
  var TD = 1 + 2 * NF;        // 時間嵌入維度 = 17
  var DIN = 2 + TD;           // 網路輸入維度 = (x, y) + 時間嵌入 = 19
  function timeEmb(i, T, out) {
    var tn = T > 1 ? i / (T - 1) : 0;   // 正規化到 [0,1]
    out[0] = tn * 2 - 1;
    for (var k = 0; k < NF; k++) {
      var w = Math.PI * (k + 1);
      out[1 + 2 * k] = Math.sin(w * tn);
      out[2 + 2 * k] = Math.cos(w * tn);
    }
  }

  /* ---- 去噪網路 ε_θ：MLP  (x,y,t) → (εx, εy)，兩層隱藏、SiLU 激活 ---- */
  // SiLU（x·σ(x)）是平滑、不飽和的激活，實測比 tanh 穩定非常多
  // （tanh 版在高雜訊會外插爆炸、反向採樣直接發散）。
  function silu(z) { var s = 1 / (1 + Math.exp(-z)); return z * s; }
  function siluGrad(z) { var s = 1 / (1 + Math.exp(-z)); return s * (1 + z * (1 - s)); }

  function paramSet(H) {
    return {
      H: H,
      W1: new Float64Array(H * DIN), b1: new Float64Array(H),
      W2: new Float64Array(H * H), b2: new Float64Array(H),
      W3: new Float64Array(2 * H), b3: new Float64Array(2)
    };
  }
  var PKEYS = ['W1', 'b1', 'W2', 'b2', 'W3', 'b3'];
  function createNet(rng, H) {
    var net = paramSet(H);
    var s1 = Math.sqrt(2 / DIN), s2 = Math.sqrt(2 / H), s3 = Math.sqrt(1 / H) * 0.3;
    for (var i = 0; i < net.W1.length; i++) net.W1[i] = gauss(rng) * s1;
    for (i = 0; i < net.W2.length; i++) net.W2[i] = gauss(rng) * s2;
    for (i = 0; i < net.W3.length; i++) net.W3[i] = gauss(rng) * s3;  // 輸出層小初始 → 初始 loss≈1
    return net;
  }
  function copyParams(src) {
    var d = paramSet(src.H);
    for (var k = 0; k < PKEYS.length; k++) d[PKEYS[k]].set(src[PKEYS[k]]);
    return d;
  }
  function zeroGrad(g) { for (var k = 0; k < PKEYS.length; k++) g[PKEYS[k]].fill(0); }

  // 前向：z1=W1·in+b1, a1=silu(z1); z2=W2·a1+b2, a2=silu(z2); o=W3·a2+b3（線性輸出）
  function forward(net, inp) {
    var H = net.H, z1 = new Float64Array(H), a1 = new Float64Array(H),
        z2 = new Float64Array(H), a2 = new Float64Array(H), o = new Float64Array(2);
    var h, i, s, off;
    for (h = 0; h < H; h++) {
      s = net.b1[h]; off = h * DIN;
      for (i = 0; i < DIN; i++) s += net.W1[off + i] * inp[i];
      z1[h] = s; a1[h] = silu(s);
    }
    for (h = 0; h < H; h++) {
      s = net.b2[h]; off = h * H;
      for (i = 0; i < H; i++) s += net.W2[off + i] * a1[i];
      z2[h] = s; a2[h] = silu(s);
    }
    for (var c = 0; c < 2; c++) {
      s = net.b3[c]; off = c * H;
      for (h = 0; h < H; h++) s += net.W3[off + h] * a2[h];
      o[c] = s;
    }
    return { z1: z1, a1: a1, z2: z2, a2: a2, o: o };
  }

  // 反向傳播：損失 L = ½‖o − ε‖²，把梯度累加進 g，回傳這一筆的 loss。
  function backward(net, inp, f, ex, ey, g) {
    var H = net.H, h, i, off, c;
    var d0 = f.o[0] - ex, d1 = f.o[1] - ey;
    var doo = [d0, d1];
    var da2 = new Float64Array(H);
    for (c = 0; c < 2; c++) {
      g.b3[c] += doo[c]; off = c * H;
      for (h = 0; h < H; h++) { g.W3[off + h] += doo[c] * f.a2[h]; da2[h] += net.W3[off + h] * doo[c]; }
    }
    var dz2 = new Float64Array(H);
    for (h = 0; h < H; h++) dz2[h] = da2[h] * siluGrad(f.z2[h]);
    var da1 = new Float64Array(H);
    for (h = 0; h < H; h++) {
      var d = dz2[h]; g.b2[h] += d; off = h * H;
      for (i = 0; i < H; i++) { g.W2[off + i] += d * f.a1[i]; da1[i] += net.W2[off + i] * d; }
    }
    var dz1 = new Float64Array(H);
    for (h = 0; h < H; h++) dz1[h] = da1[h] * siluGrad(f.z1[h]);
    for (h = 0; h < H; h++) {
      var dd = dz1[h]; g.b1[h] += dd; off = h * DIN;
      for (i = 0; i < DIN; i++) g.W1[off + i] += dd * inp[i];
    }
    return 0.5 * (d0 * d0 + d1 * d1);
  }

  // Adam
  function makeAdam(H) { return { m: paramSet(H), v: paramSet(H), t: 0 }; }
  function adamStep(net, g, opt, n, lr) {
    opt.t++;
    var b1 = 0.9, b2 = 0.999, eps = 1e-8;
    var c1 = 1 - Math.pow(b1, opt.t), c2 = 1 - Math.pow(b2, opt.t);
    for (var k = 0; k < PKEYS.length; k++) {
      var key = PKEYS[k], P = net[key], G = g[key], M = opt.m[key], V = opt.v[key];
      for (var i = 0; i < P.length; i++) {
        var gi = G[i] / n;
        M[i] = b1 * M[i] + (1 - b1) * gi;
        V[i] = b2 * V[i] + (1 - b2) * gi * gi;
        P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + eps);
      }
    }
  }

  // 前向加噪：由 x0 + 指定 ε 得到 x_t（測試與「前向面板」共用）
  function forwardNoise(x0x, x0y, i, sched, ex, ey) {
    var sa = Math.sqrt(sched.abar[i]), sb = Math.sqrt(1 - sched.abar[i]);
    return [sa * x0x + sb * ex, sa * x0y + sb * ey];
  }

  // 給一筆 (x,y,step) 造出網路輸入向量
  function buildInput(x, y, i, T) {
    var inp = new Float64Array(DIN);
    inp[0] = x; inp[1] = y;
    var emb = new Float64Array(TD); timeEmb(i, T, emb);
    for (var e = 0; e < TD; e++) inp[2 + e] = emb[e];
    return inp;
  }

  /* ---- 訓練器：每呼叫一次 step() 就做一個 minibatch 的 Adam 更新，並更新 EMA ---- */
  // EMA（指數移動平均）權重讓採樣明顯乾淨（少很多離群點）——這是擴散實務常見技巧。
  function makeTrainer(cfg) {
    var H = cfg.H, sched = cfg.sched, data = cfg.data, rng = cfg.rng;
    var net = createNet(cfg.netRng || rng, H);
    var ema = copyParams(net);
    var opt = makeAdam(H);
    var g = paramSet(H);
    var emb = new Float64Array(TD);
    var inp = new Float64Array(DIN);
    var T = sched.T, N = data.n, B = cfg.batch, jit = cfg.jitter, decay = cfg.emaDecay;
    var total = cfg.totalSteps, baseLr = cfg.lr;
    var st = { net: net, ema: ema, done: 0, total: total, lastLoss: 0, lossEMA: 0 };

    st.step = function () {
      zeroGrad(g);
      var L = 0, frac = st.done / total;
      var lr = baseLr * (0.15 + 0.85 * (0.5 + 0.5 * Math.cos(Math.PI * frac)));  // cosine 衰減到 15%
      for (var b = 0; b < B; b++) {
        var idx = (rng() * N) | 0;
        var x0 = data.pts[idx * 2] + gauss(rng) * jit;
        var y0 = data.pts[idx * 2 + 1] + gauss(rng) * jit;
        var i = (rng() * T) | 0;
        var ex = gauss(rng), ey = gauss(rng);
        var sa = Math.sqrt(sched.abar[i]), sb = Math.sqrt(1 - sched.abar[i]);
        inp[0] = sa * x0 + sb * ex; inp[1] = sa * y0 + sb * ey;
        timeEmb(i, T, emb);
        for (var e = 0; e < TD; e++) inp[2 + e] = emb[e];
        var f = forward(net, inp);
        L += backward(net, inp, f, ex, ey, g);
      }
      adamStep(net, g, opt, B, lr);
      for (var k = 0; k < PKEYS.length; k++) {                 // EMA
        var P = net[PKEYS[k]], E = ema[PKEYS[k]];
        for (var q = 0; q < P.length; q++) E[q] = decay * E[q] + (1 - decay) * P[q];
      }
      st.done++;
      st.lastLoss = L / B;
      st.lossEMA = st.lossEMA ? st.lossEMA * 0.9 + st.lastLoss * 0.1 : st.lastLoss;
      return st.lastLoss;
    };
    return st;
  }

  /* ---- 反向採樣器（DDPM ancestral sampling） ---- */
  // 從純雜訊 x_T ~ N(0,I) 出發，每呼叫 next() 走一個反向步 t → t-1，並把整條軌跡存起來供重播/拖曳。
  function makeReverse(params, sched, M, rng) {
    var T = sched.T, X = new Float64Array(M * 2), m;
    for (m = 0; m < M * 2; m++) X[m] = gauss(rng);
    var levels = new Array(T + 1);
    levels[T] = Float32Array.from(X);
    var inp = new Float64Array(DIN), emb = new Float64Array(TD);
    var s = { M: M, T: T, level: T, levels: levels, X: X, done: false };
    s.next = function () {
      if (s.level <= 0) { s.done = true; return null; }
      var i = s.level - 1;
      timeEmb(i, T, emb);
      var coef1 = 1 / Math.sqrt(sched.alpha[i]);
      var coef2 = sched.beta[i] / Math.sqrt(1 - sched.abar[i]);
      var sig = sched.sigma[i], addNoise = i > 0;
      for (var e = 0; e < TD; e++) inp[2 + e] = emb[e];
      for (m = 0; m < M; m++) {
        var x = X[m * 2], y = X[m * 2 + 1];
        inp[0] = x; inp[1] = y;
        var f = forward(params, inp);
        var zx = addNoise ? gauss(rng) : 0, zy = addNoise ? gauss(rng) : 0;
        X[m * 2] = coef1 * (x - coef2 * f.o[0]) + sig * zx;
        X[m * 2 + 1] = coef1 * (y - coef2 * f.o[1]) + sig * zy;
      }
      s.level = i;
      levels[i] = Float32Array.from(X);
      return { level: i, X: X };
    };
    s.runAll = function () { while (!s.done) s.next(); return levels; };
    return s;
  }

  var CORE = {
    TAU: TAU, NF: NF, TD: TD, DIN: DIN,
    mulberry32: mulberry32, gauss: gauss,
    SHAPES: SHAPES, standardize: standardize, makeSchedule: makeSchedule,
    timeEmb: timeEmb, buildInput: buildInput,
    createNet: createNet, copyParams: copyParams, paramSet: paramSet, zeroGrad: zeroGrad,
    forward: forward, backward: backward, makeAdam: makeAdam, adamStep: adamStep,
    forwardNoise: forwardNoise, makeTrainer: makeTrainer, makeReverse: makeReverse,
    PKEYS: PKEYS
  };
  global.DIFF_CORE = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;

  // node 測試時沒有 DOM，核心載完就收工
  if (typeof document === 'undefined') return;

  /* ==========================================================
   *  UI
   * ========================================================== */

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var LS = 'diff.';

  function store(key, val) {
    try {
      if (val === undefined) { var raw = localStorage.getItem(LS + key); return raw === null ? null : JSON.parse(raw); }
      localStorage.setItem(LS + key, JSON.stringify(val));
    } catch (e) { /* 隱私模式：忽略 */ }
    return null;
  }

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = motionQuery.matches;
  function onMotionChange() {
    reduced = motionQuery.matches;
    document.documentElement.classList.toggle('reduced', reduced);
  }
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
  onMotionChange();

  /* ---- 設定表 ---- */
  var SHAPE_LABELS = { heart: '愛心', ring: '圓環', moons: '雙月', star: '五角星', draw: '自己畫' };
  var EFFORT = { fast: { steps: 1500 }, std: { steps: 2800 }, fine: { steps: 4200 } };
  var SPEED = { slow: { per: 1, hold: 4 }, normal: { per: 1, hold: 1 }, fast: { per: 3, hold: 1 } };
  var NPTS = 900;              // 目標點雲點數
  function genCount() { return window.innerWidth < 560 ? 420 : 620; }  // 生成時撒的點數

  /* ---- 全域狀態 ---- */
  var rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  var shapeName = store('shape') || 'heart';
  var T = store('T') || 50;
  var effort = store('effort') || 'std';
  var speed = store('speed') || 'normal';

  var target = null;          // standardize 後的目標點雲 {pts,n,mean,scale}
  var sched = makeSchedule(T);
  var trainer = null, net = null;
  var training = false, trained = false, stale = false;
  var lossHist = [];
  var runCount = store('runCount') || 0;

  // 採樣狀態
  var rev = null;                       // makeReverse 實例
  var fwdX0 = null, fwdEps = null;      // 前向面板參考
  var maxLevel = T, viewLevel = T;      // maxLevel：軌跡已算到的最深 level；viewLevel：目前顯示
  var genActive = false;                // 已按過生成、面板有內容
  var playing = false, replaying = false, holdCtr = 0, replayLvl = 0;

  // rAF 控制：三個獨立迴圈，各自被「分頁可見 + 對應卡片在視窗內」把關
  var trainRaf = 0, sampleRaf = 0, replayRaf = 0;
  var trainVis = true, genVis = true;

  // 自己畫
  var drawPts = [];
  var drawing = false;

  var el = {};

  /* ---- 進場 stagger ---- */
  function stagger() {
    $$('[data-stagger]').forEach(function (n, i) {
      n.style.transitionDelay = (reduced ? 0 : Math.min(i * 70, 1150)) + 'ms';
      requestAnimationFrame(function () { n.classList.add('in'); });
    });
  }

  /* ---- 座標映射 ---- */
  function viewScale(cv) { return Math.min(cv.width, cv.height) / 2 / 3.1; }

  /* ---- 光點 sprite（一次做好，之後 drawImage 疊加，快又漂亮） ---- */
  var spriteForm = null, spriteNoise = null, SPR = 26;
  function makeSprite(rgb) {
    var c = document.createElement('canvas'); c.width = c.height = SPR;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    grd.addColorStop(0, 'rgba(' + rgb + ',0.95)');
    grd.addColorStop(0.35, 'rgba(' + rgb + ',0.45)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd; g.fillRect(0, 0, SPR, SPR);
    return c;
  }
  function buildSprites() {
    spriteForm = makeSprite('86,224,200');     // 形（cyan-green）
    spriteNoise = makeSprite('167,139,250');    // 雜訊（violet）
  }

  function fitCanvas(cv, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || cv.parentNode.clientWidth;
    var h = cssH || w;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  // 畫一團點；noiseFrac 0=完全成形(cyan) 1=純雜訊(violet)
  function drawCloud(cv, arr, count, noiseFrac, dotScale) {
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter';
    var vs = viewScale(cv), cx = cv.width / 2, cy = cv.height / 2;
    var sz = SPR * (dotScale || 1) * Math.min(cv.width, cv.height) / 340;
    var aForm = (1 - noiseFrac), aNoise = noiseFrac, half = sz / 2, i, px, py;
    if (aForm > 0.01) {
      ctx.globalAlpha = 0.85 * aForm;
      for (i = 0; i < count; i++) { px = cx + arr[i * 2] * vs; py = cy - arr[i * 2 + 1] * vs; ctx.drawImage(spriteForm, px - half, py - half, sz, sz); }
    }
    if (aNoise > 0.01) {
      ctx.globalAlpha = 0.85 * aNoise;
      for (i = 0; i < count; i++) { px = cx + arr[i * 2] * vs; py = cy - arr[i * 2 + 1] * vs; ctx.drawImage(spriteNoise, px - half, py - half, sz, sz); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---- 目標點雲預覽 ---- */
  function drawTargetPreview() {
    var cv = el.targetCv; fitCanvas(cv);
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    var arr, count, i;
    if (shapeName === 'draw') {
      if (drawPts.length < 12) { drawDrawHint(); return; }
      arr = new Float64Array(drawPts.length * 2);        // 直接畫原始塗點，讓點穩定停在游標下
      for (i = 0; i < drawPts.length; i++) { arr[i * 2] = drawPts[i][0]; arr[i * 2 + 1] = drawPts[i][1]; }
      count = drawPts.length;
    } else {
      if (!target) return; arr = target.pts; count = target.n;
    }
    ctx.globalCompositeOperation = 'lighter';
    var vs = viewScale(cv), cx = cv.width / 2, cy = cv.height / 2;
    var sz = SPR * 0.7 * Math.min(cv.width, cv.height) / 340, half = sz / 2;
    ctx.globalAlpha = 0.8;
    for (i = 0; i < count; i++) ctx.drawImage(spriteForm, cx + arr[i * 2] * vs - half, cy - arr[i * 2 + 1] * vs - half, sz, sz);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawDrawHint() {
    var cv = el.targetCv, ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(167,139,250,.5)';
    ctx.font = (13 * (Math.min(window.devicePixelRatio || 1, 2))) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('在這裡用滑鼠或手指塗出一團點', cv.width / 2, cv.height / 2);
  }

  /* ---- 學習曲線 ---- */
  function drawCurve() {
    var cv = el.curve; fitCanvas(cv, cv.clientHeight);
    var ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    var dpr = window.devicePixelRatio || 1;
    var pad = 8 * dpr, gw = w - pad * 2, gh = h - pad * 2;
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (var r = 0; r <= 4; r++) { var gy = pad + gh * r / 4; ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(w - pad, gy); ctx.stroke(); }
    if (lossHist.length > 1) {
      var n = lossHist.length - 1;
      var grd = ctx.createLinearGradient(pad, 0, w - pad, 0);
      grd.addColorStop(0, '#a78bfa'); grd.addColorStop(1, '#56e0c8');
      ctx.beginPath(); ctx.strokeStyle = grd; ctx.lineWidth = 2 * dpr; ctx.lineJoin = 'round';
      for (var k = 0; k < lossHist.length; k++) {
        var lx = pad + gw * (k / n), ly = pad + gh * Math.min(1, lossHist[k] / 1.15);
        if (k === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    }
  }

  /* ---- 數字滾動 ---- */
  function tweenNum(node, from, to, fmt, ms) {
    if (reduced) { node.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function step(now) {
      var t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  /* ---- 建立/切換目標形狀 ---- */
  function hashName(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }
  function rebuildTarget() {
    if (shapeName === 'draw') target = drawPts.length >= 12 ? standardize(drawPts) : null;
    else target = standardize(SHAPES[shapeName](mulberry32(0x51ee + hashName(shapeName)), NPTS));
    drawTargetPreview();
  }

  function markStale(why) {
    if (!trained) return;
    stale = true;
    el.trainStatus.textContent = why + ' 模型需要重新訓練，才能反映新設定。';
    el.genBtn.disabled = true;
    el.genCard.classList.add('locked'); el.genCard.classList.remove('unlocked');
  }

  /* ---- rAF 迴圈的把關與同步 ---- */
  function canTrain() { return training && trainer && trainer.done < trainer.total && !document.hidden && trainVis; }
  function canSample() { return playing && genActive && rev && !rev.done && !document.hidden && genVis; }
  function canReplay() { return replaying && genActive && !document.hidden && genVis; }
  function syncLoops() {
    if (canTrain()) { if (!trainRaf) trainRaf = requestAnimationFrame(trainFrame); }
    else if (trainRaf) { cancelAnimationFrame(trainRaf); trainRaf = 0; }
    if (canSample()) { if (!sampleRaf) sampleRaf = requestAnimationFrame(sampleFrame); }
    else if (sampleRaf) { cancelAnimationFrame(sampleRaf); sampleRaf = 0; }
    if (canReplay()) { if (!replayRaf) replayRaf = requestAnimationFrame(replayFrame); }
    else if (replayRaf) { cancelAnimationFrame(replayRaf); replayRaf = 0; }
  }

  /* ---- 訓練 ---- */
  function startTraining() {
    if (training) return;
    playing = false; replaying = false; genActive = false; setPlayIcon();
    sched = makeSchedule(T);
    if (shapeName === 'draw' && (!target || target.n < 40)) {
      el.trainStatus.textContent = '請先在上面塗出至少一小團點（越多越好），再開始訓練。';
      return;
    }
    if (!target) rebuildTarget();
    lossHist = [];
    trainer = makeTrainer({
      H: 72, sched: sched, data: target, rng: rng, netRng: mulberry32((rng() * 1e9) | 0),
      batch: 128, jitter: 0.012, emaDecay: 0.995, totalSteps: EFFORT[effort].steps, lr: 0.003
    });
    net = trainer.ema;
    training = true; trained = false; stale = false;
    el.trainBtn.disabled = true; el.trainBtn.textContent = '訓練中…';
    el.genCard.classList.add('locked'); el.genCard.classList.remove('unlocked');
    el.genBtn.disabled = true;
    el.trainStatus.textContent = '正在做反向傳播：每步一個 128 點的 minibatch，預測雜訊 ε、更新網路權重。';
    document.documentElement.classList.add('busy');
    syncLoops();
  }
  function trainFrame() {
    trainRaf = 0;
    if (!canTrain()) return;
    var t0 = performance.now(), budget = reduced ? 26 : 12;
    while (performance.now() - t0 < budget && trainer.done < trainer.total) {
      var L = trainer.step();
      if (trainer.done % 8 === 0) lossHist.push(L);
    }
    el.statStep.textContent = trainer.done + ' / ' + trainer.total;
    el.statLoss.textContent = trainer.lossEMA.toFixed(3);
    el.trainBar.style.transform = 'scaleX(' + (trainer.done / trainer.total) + ')';
    drawCurve();
    if (trainer.done >= trainer.total) { finishTraining(); return; }
    trainRaf = requestAnimationFrame(trainFrame);
  }
  function finishTraining() {
    training = false; trained = true; stale = false;
    lossHist.push(trainer.lastLoss);
    net = trainer.ema;
    el.trainBtn.disabled = false; el.trainBtn.textContent = '重新訓練';
    tweenNum(el.statLoss, trainer.lossEMA * 1.4, trainer.lossEMA, function (v) { return v.toFixed(3); }, 500);
    el.trainStatus.textContent = '訓練完成：ε 預測損失從約 1.0 降到 ' + trainer.lossEMA.toFixed(3)
      + '。這個網路已經學會「在每個雜訊等級下該往哪裡去噪」——去下面把純雜訊變成形狀。';
    el.genCard.classList.remove('locked'); el.genCard.classList.add('unlocked');
    el.genBtn.disabled = false;
    drawCurve();
    document.documentElement.classList.remove('busy');
    if (!reduced) el.genCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---- 生成（反向擴散） ---- */
  function startSampling() {
    if (!trained || training) return;
    playing = false; replaying = false;
    var M = genCount();
    rev = makeReverse(net, sched, M, mulberry32((rng() * 1e9) | 0));
    fwdX0 = new Float64Array(M * 2); fwdEps = new Float64Array(M * 2);   // 前向面板參考
    for (var m = 0; m < M; m++) {
      var idx = (rng() * target.n) | 0;
      fwdX0[m * 2] = target.pts[idx * 2]; fwdX0[m * 2 + 1] = target.pts[idx * 2 + 1];
      fwdEps[m * 2] = gauss(rng); fwdEps[m * 2 + 1] = gauss(rng);
    }
    maxLevel = T; viewLevel = T; genActive = true;
    runCount++; store('runCount', runCount); el.runCount.textContent = String(runCount);
    el.scrub.max = String(T); el.scrub.value = String(T); el.scrub.disabled = false;
    el.stepBtn.disabled = false; el.replayBtn.disabled = false;
    el.genBtn.textContent = '重新撒雜訊生成';
    fitBothCanvases();
    if (reduced) {                                  // 降低動態：直接算完、顯示成品
      rev.runAll(); maxLevel = 0; viewLevel = 0;
      el.scrub.value = '0'; renderLevel(0); announceLevel(0, true); setPlayIcon();
      return;
    }
    holdCtr = 0; playing = true;
    renderLevel(T); announceLevel(T, false); setPlayIcon();
    syncLoops();
  }
  function sampleFrame() {
    sampleRaf = 0;
    if (!canSample()) return;
    var conf = SPEED[speed]; holdCtr++;
    if (holdCtr >= conf.hold) {
      holdCtr = 0;
      for (var k = 0; k < conf.per && !rev.done; k++) rev.next();
      maxLevel = rev.level; viewLevel = rev.level;
      el.scrub.value = String(viewLevel);
    }
    renderLevel(viewLevel); announceLevel(viewLevel, false);
    if (rev.done) { finishSampling(); return; }
    sampleRaf = requestAnimationFrame(sampleFrame);
  }
  function finishSampling() { playing = false; setPlayIcon(); announceLevel(0, true); }
  function stopSampling() { playing = false; replaying = false; syncLoops(); }
  function togglePlay() {
    if (!genActive) { startSampling(); return; }
    if (rev.done && viewLevel <= 0) { startSampling(); return; }   // 已到底 → 重新生成
    replaying = false;
    playing = !playing;
    setPlayIcon(); syncLoops();
  }
  function setPlayIcon() {
    el.playBtn.textContent = (playing || replaying) ? '⏸ 暫停' : '▶ 播放';
    el.playBtn.setAttribute('aria-label', (playing || replaying) ? '暫停採樣' : '播放採樣');
  }
  function stepOnce() {                              // 單步：往前推一個去噪步
    if (!genActive) { startSampling(); playing = false; setPlayIcon(); syncLoops(); return; }
    playing = false; replaying = false; setPlayIcon(); syncLoops();
    if (!rev.done) { rev.next(); maxLevel = rev.level; }
    viewLevel = Math.max(0, viewLevel - 1);
    if (viewLevel < maxLevel) viewLevel = maxLevel;
    el.scrub.value = String(viewLevel);
    renderLevel(viewLevel); announceLevel(viewLevel, viewLevel === 0);
  }
  function replay() {
    if (!genActive) return;
    if (rev && !rev.done) rev.runAll();
    maxLevel = 0; playing = false;
    replayLvl = T; holdCtr = 0; replaying = true;
    setPlayIcon(); syncLoops();
  }
  function replayFrame() {
    replayRaf = 0;
    if (!canReplay()) return;
    var conf = SPEED[speed]; holdCtr++;
    if (holdCtr >= conf.hold) { holdCtr = 0; replayLvl = Math.max(0, replayLvl - conf.per); }
    viewLevel = replayLvl; el.scrub.value = String(replayLvl);
    renderLevel(replayLvl); announceLevel(replayLvl, replayLvl === 0);
    if (replayLvl <= 0) { replaying = false; setPlayIcon(); return; }
    replayRaf = requestAnimationFrame(replayFrame);
  }

  function forwardAt(level) {                        // 前向面板在 level 的座標
    var M = fwdX0.length / 2, out = new Float64Array(M * 2);
    if (level <= 0) { out.set(fwdX0); return out; }
    var i = level - 1, sa = Math.sqrt(sched.abar[i]), sb = Math.sqrt(1 - sched.abar[i]);
    for (var m = 0; m < M; m++) {
      out[m * 2] = sa * fwdX0[m * 2] + sb * fwdEps[m * 2];
      out[m * 2 + 1] = sa * fwdX0[m * 2 + 1] + sb * fwdEps[m * 2 + 1];
    }
    return out;
  }
  function renderLevel(level) {
    if (!genActive) return;
    var M = rev.M;
    var revArr = rev.levels[level] || rev.levels[maxLevel];
    var revNf = level / T;                           // 反向面板：level 越大越像雜訊
    drawCloud(el.revCv, revArr, M, revNf, 1);
    // 前向面板走相反方向：反向去噪到 level，前向就加噪到 (T−level)，形成「資料溶解 / 雜訊成形」的對照
    var fwdLvl = T - level, fwdNf = fwdLvl / T;
    drawCloud(el.fwdCv, forwardAt(fwdLvl), M, fwdNf, 1);
    el.tCur.textContent = 't = ' + level;
    el.formPct.textContent = Math.round((1 - revNf) * 100) + '%';
    el.fwdLevel.textContent = 't = ' + fwdLvl;
  }
  var lastAnnounce = 0;
  function announceLevel(level, force) {
    var now = performance.now();
    if (!force && now - lastAnnounce < 380) return;
    lastAnnounce = now;
    if (level <= 0) el.genLive.textContent = '生成完成：純雜訊在 ' + T + ' 步反向擴散後，收斂成了「' + SHAPE_LABELS[shapeName] + '」。';
    else el.genLive.textContent = '反向去噪中，第 ' + (T - level) + ' / ' + T + ' 步，雜訊等級 t=' + level + '。';
  }
  function fitBothCanvases() { fitCanvas(el.revCv, el.revCv.clientWidth); fitCanvas(el.fwdCv, el.fwdCv.clientWidth); }

  /* ---- 自己畫 ---- */
  function drawCanvasPos(evt) {
    var cv = el.targetCv, r = cv.getBoundingClientRect();
    var pt = evt.touches ? evt.touches[0] : evt;
    var vs = viewScale(cv), dpr = cv.width / r.width;
    var x = (pt.clientX - r.left) * dpr, y = (pt.clientY - r.top) * dpr;
    return [(x - cv.width / 2) / vs, -(y - cv.height / 2) / vs];   // → 以中心為原點、與 view 同尺度的座標
  }
  function addBrush(p) {
    for (var k = 0; k < 3; k++) drawPts.push([p[0] + gauss(rng) * 0.12, p[1] + gauss(rng) * 0.12]);
    if (drawPts.length > 1400) drawPts.splice(0, drawPts.length - 1400);
    rebuildTarget();
    markStale('你改了「自己畫」的點，');
  }

  /* ---- 綁定 ---- */
  function segClick(container, cur, apply) {
    $$('button', container).forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.v === String(cur)));
      b.addEventListener('click', function () {
        $$('button', container).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        apply(b.dataset.v);
      });
    });
  }

  function init() {
    ['topbar', 'targetCv', 'curve', 'statStep', 'statLoss', 'trainBar', 'trainBtn', 'trainStatus',
      'shapeSeg', 'tSeg', 'effortSeg', 'speedSeg', 'drawTools', 'clearDraw',
      'genCard', 'genBtn', 'playBtn', 'stepBtn', 'replayBtn', 'scrub', 'revCv', 'fwdCv',
      'tCur', 'formPct', 'fwdLevel', 'genLive', 'runCount'
    ].forEach(function (id) { el[id] = $(id); });

    buildSprites();
    el.runCount.textContent = String(runCount);

    segClick(el.shapeSeg, shapeName, function (v) {
      shapeName = v; store('shape', v);
      el.drawTools.hidden = v !== 'draw';
      el.targetCv.classList.toggle('drawable', v === 'draw');
      if (v !== 'draw') drawPts = [];
      rebuildTarget();
      markStale('你換了形狀，');
    });
    segClick(el.tSeg, T, function (v) { T = parseInt(v, 10); store('T', T); sched = makeSchedule(T); markStale('你改了雜訊步數 T，'); });
    segClick(el.effortSeg, effort, function (v) { effort = v; store('effort', v); el.statStep.textContent = '0 / ' + EFFORT[effort].steps; markStale('你改了訓練程度，'); });
    segClick(el.speedSeg, speed, function (v) { speed = v; store('speed', v); });   // 即時生效，不需重訓

    el.trainBtn.addEventListener('click', startTraining);
    el.genBtn.addEventListener('click', startSampling);
    el.playBtn.addEventListener('click', togglePlay);
    el.stepBtn.addEventListener('click', stepOnce);
    el.replayBtn.addEventListener('click', replay);

    el.scrub.addEventListener('input', function () {
      if (!genActive) return;
      stopSampling();                                // 手一碰時間軸，就停下自動播放
      setPlayIcon();
      var v = parseInt(el.scrub.value, 10);
      if (v < maxLevel) { v = maxLevel; el.scrub.value = String(v); }   // 還沒算到的更乾淨層不能拖過去
      viewLevel = v; renderLevel(v); announceLevel(v, v === 0);
    });

    el.clearDraw.addEventListener('click', function () { drawPts = []; rebuildTarget(); markStale('你清空了畫布，'); });

    var cv = el.targetCv;
    function down(e) { if (shapeName !== 'draw') return; drawing = true; addBrush(drawCanvasPos(e)); e.preventDefault(); }
    function move(e) { if (!drawing) return; addBrush(drawCanvasPos(e)); e.preventDefault(); }
    function up() { drawing = false; }
    cv.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', down, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);

    el.drawTools.hidden = shapeName !== 'draw';
    el.targetCv.classList.toggle('drawable', shapeName === 'draw');
    el.statStep.textContent = '0 / ' + EFFORT[effort].steps;
    el.statLoss.textContent = '—';

    // 分頁隱藏 / 卡片離開視窗 → 對應迴圈暫停（各自獨立，互不牽連）
    document.addEventListener('visibilitychange', syncLoops);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (en) { trainVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe($('trainCard'));
      new IntersectionObserver(function (es) { es.forEach(function (en) { genVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe(el.genCard);
    }

    var resizePending = false;
    window.addEventListener('resize', function () {
      if (resizePending) return; resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false;
        drawTargetPreview(); drawCurve();
        if (genActive) { fitBothCanvases(); renderLevel(viewLevel); }
      });
    });

    rebuildTarget();
    drawCurve();
    stagger();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);

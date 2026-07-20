/* 分數生成 — 在瀏覽器裡當場訓練一個 noise-conditional 分數網路，
 * 畫出它的分數場（∇log p 的箭頭場），再用退火 Langevin 讓一群隨機點順著箭頭流回目標形狀。
 * 重現 Song & Ermon（NeurIPS 2019, arXiv:1907.05600）NCSN 的 2D 教學版。
 *
 * 零外部資源：目標形狀是程序化生成的，分數網路是純 JS 寫的，梯度是自己反向傳播算的，
 * 採樣完全依論文的退火 Langevin 公式一步步跑。核心（CORE）不碰 DOM，可在 node 裡 require 進來測試。
 *
 * 演算法骨架（跟真實 NCSN 一模一樣，只是這裡資料是 2D 點、網路是小 MLP）：
 *   分數：s_θ(x,σ) ≈ ∇ₓ log p_σ(x)                         （Stein score，指向密度變高的方向）
 *   訓練：denoising score matching（Vincent 2011）——
 *         對加噪點 x̃ = x + σ·ε，讓網路原始輸出 o 去預測 −ε；則 s_θ = o/σ ≈ −(x̃−x)/σ²
 *         損失 ½‖o − (−ε)‖² 即論文用 λ(σ)=σ² 加權後的 DSM（不需歸一化常數 Z）
 *   採樣：退火 Langevin（annealed Langevin dynamics）——
 *         σ₁>σ₂>…>σ_L 由大到小，α_i = ε·σ_i²/σ_L²，
 *         x ← x + (α_i/2)·s_θ(x,σ_i) + √α_i·z    （先在大噪聲找團塊，再逐級降噪精修）
 */
(function (global) {
  'use strict';

  /* ==========================================================
   *  CORE：形狀 / 噪聲級 / 分數 MLP / 反向傳播 / 訓練 / 退火 Langevin
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

  /* ---- 目標分布：回傳一堆原始 2D 點 [[x,y],...] ---- */
  // 分離、不等重的分布（雙峰）最能凸顯單噪聲級的失敗（低密度鴻溝 + 混不動）；
  // 連通分布（螺旋）則兩法差不多——這正是論文的重點，頁面誠實呈現。
  var SHAPES = {
    twopeak: function (rng, n) {                        // 雙峰：一大一小、彼此分離
      var p = [];
      for (var i = 0; i < n; i++) {
        var heavy = rng() < 0.75;                        // 75% 落在左團（重）、25% 在右團（輕）
        p.push([(heavy ? -1.8 : 1.8) + gauss(rng) * 0.15, gauss(rng) * 0.15]);
      }
      return p;
    },
    blobs: function (rng, n) {                           // 星系：四團分離的高斯
      var c = [[-1.7, -1.7], [1.7, -1.7], [-1.7, 1.7], [1.7, 1.7]], p = [];
      for (var i = 0; i < n; i++) { var k = i & 3; p.push([c[k][0] + gauss(rng) * 0.18, c[k][1] + gauss(rng) * 0.18]); }
      return p;
    },
    moons: function (rng, n) {                           // 雙月：兩條交錯的弧，機器學習經典玩具集
      var p = [];
      for (var i = 0; i < n; i++) {
        var arm = i % 2, t = rng() * Math.PI, x, y;
        if (arm === 0) { x = Math.cos(t); y = Math.sin(t); }
        else { x = 1 - Math.cos(t); y = 0.5 - Math.sin(t); }
        p.push([x - 0.5 + gauss(rng) * 0.045, y - 0.15 + gauss(rng) * 0.045]);
      }
      return p;
    },
    spiral: function (rng, n) {                          // 螺旋：一條連續彎曲的細帶（連通分布）
      var p = [];
      for (var i = 0; i < n; i++) {
        var f = rng(), a = f * 3.1 * Math.PI, r = 0.18 + f * 1.0;
        p.push([r * Math.cos(a) + gauss(rng) * 0.035, r * Math.sin(a) + gauss(rng) * 0.035]);
      }
      return p;
    }
  };

  // 標準化到「零均值、平均每維變異數 ≈ 1」，讓資料尺度與噪聲級對得上（等向縮放保留長寬比）。
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

  /* ---- 噪聲級：幾何等比數列 σ₁>σ₂>…>σ_L（index 0 = 最大） ---- */
  function geomSigmas(sigMin, sigMax, L) {
    var s = new Float64Array(L);
    if (L === 1) { s[0] = sigMin; return s; }
    var lo = Math.log(sigMax), hi = Math.log(sigMin);
    for (var i = 0; i < L; i++) s[i] = Math.exp(lo + (hi - lo) * i / (L - 1));
    return s;
  }

  /* ---- σ 嵌入：把噪聲級編成傅立葉特徵，讓「一個網路」學會所有噪聲級的分數 ---- */
  var NF = 6;                 // 頻率數
  var SD = 1 + 2 * NF;        // σ 嵌入維度 = 13
  var DIN = 2 + SD;           // 網路輸入維度 = (x,y) + σ 嵌入 = 15
  function sigEmb(sigma, lmin, lmax, out) {
    var u = (Math.log(sigma) - lmin) / (lmax - lmin);   // 正規化 log σ 到 [0,1]
    if (u < 0) u = 0; if (u > 1) u = 1;
    out[0] = u * 2 - 1;
    for (var k = 0; k < NF; k++) {
      var w = Math.PI * (k + 1);
      out[1 + 2 * k] = Math.sin(w * u);
      out[2 + 2 * k] = Math.cos(w * u);
    }
  }
  function fillInput(inp, x, y, sigma, lmin, lmax, emb) {
    inp[0] = x; inp[1] = y;
    sigEmb(sigma, lmin, lmax, emb);
    for (var e = 0; e < SD; e++) inp[2 + e] = emb[e];
  }
  function buildInput(x, y, sigma, lmin, lmax) {
    var inp = new Float64Array(DIN), emb = new Float64Array(SD);
    fillInput(inp, x, y, sigma, lmin, lmax, emb);
    return inp;
  }

  /* ---- 分數網路 s_θ：MLP (x,y,σ) → (ox,oy)；兩層隱藏、SiLU 激活 ---- */
  // 原始輸出 o 學的是 −ε（把加噪點推回乾淨點的方向）；真正的分數 s = o/σ。
  // SiLU（x·σ(x)）平滑不飽和，比 tanh 在高噪聲下穩定得多（tanh 版會外插爆炸）。
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
    var s1 = Math.sqrt(2 / DIN), s2 = Math.sqrt(2 / H), s3 = Math.sqrt(1 / H) * 0.4;
    for (var i = 0; i < net.W1.length; i++) net.W1[i] = gauss(rng) * s1;
    for (i = 0; i < net.W2.length; i++) net.W2[i] = gauss(rng) * s2;
    for (i = 0; i < net.W3.length; i++) net.W3[i] = gauss(rng) * s3;    // 小初始 → 初始 loss≈1
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

  // 反向傳播：損失 L = ½‖o − t‖²（t 為目標 −ε），把梯度累加進 g，回傳這一筆的 loss。
  function backward(net, inp, f, tx, ty, g) {
    var H = net.H, h, i, off, c;
    var d0 = f.o[0] - tx, d1 = f.o[1] - ty;
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

  /* ---- 分數估計：回傳網路在 (x,y,σ) 的分數向量 s = o/σ ---- */
  function scoreInto(net, x, y, sigma, lmin, lmax, emb, inp, out) {
    fillInput(inp, x, y, sigma, lmin, lmax, emb);
    var f = forward(net, inp);
    out[0] = f.o[0] / sigma; out[1] = f.o[1] / sigma;   // s = o/σ
    return out;
  }
  // 原始輸出 o（= σ·s = 預測的 −ε）；分數場視覺化用它，尺度在各 σ 間可比。
  function rawInto(net, x, y, sigma, lmin, lmax, emb, inp, out) {
    fillInput(inp, x, y, sigma, lmin, lmax, emb);
    var f = forward(net, inp);
    out[0] = f.o[0]; out[1] = f.o[1];
    return out;
  }

  /* ---- 訓練器：denoising score matching。每 step() 做一個 minibatch 的 Adam 更新 ---- */
  function makeTrainer(cfg) {
    var H = cfg.H, data = cfg.data, rng = cfg.rng;
    var sigMin = cfg.sigMin, sigMax = cfg.sigMax;
    var lmin = Math.log(sigMin), lmax = Math.log(sigMax);
    var net = createNet(cfg.netRng || rng, H);
    var ema = copyParams(net);
    var opt = makeAdam(H);
    var g = paramSet(H);
    var emb = new Float64Array(SD);
    var inp = new Float64Array(DIN);
    var N = data.n, B = cfg.batch, jit = cfg.jitter || 0, decay = cfg.emaDecay;
    var total = cfg.totalSteps, baseLr = cfg.lr;
    var st = { net: net, ema: ema, done: 0, total: total, lastLoss: 0, lossEMA: 0,
               sigMin: sigMin, sigMax: sigMax, lmin: lmin, lmax: lmax };

    st.step = function () {
      zeroGrad(g);
      var L = 0, frac = st.done / total;
      var lr = baseLr * (0.15 + 0.85 * (0.5 + 0.5 * Math.cos(Math.PI * frac)));   // cosine 衰減到 15%
      for (var b = 0; b < B; b++) {
        var idx = (rng() * N) | 0;
        var x0 = data.pts[idx * 2] + gauss(rng) * jit;
        var y0 = data.pts[idx * 2 + 1] + gauss(rng) * jit;
        var sigma = Math.exp(lmin + rng() * (lmax - lmin));   // σ ~ log-uniform[σmin,σmax]
        var ex = gauss(rng), ey = gauss(rng);
        fillInput(inp, x0 + sigma * ex, y0 + sigma * ey, sigma, lmin, lmax, emb);
        var f = forward(net, inp);
        L += backward(net, inp, f, -ex, -ey, g);   // 目標：預測 −ε
      }
      adamStep(net, g, opt, B, lr);
      for (var k = 0; k < PKEYS.length; k++) {                 // EMA 權重，採樣更乾淨
        var P = net[PKEYS[k]], E = ema[PKEYS[k]];
        for (var q = 0; q < P.length; q++) E[q] = decay * E[q] + (1 - decay) * P[q];
      }
      st.done++;
      st.lastLoss = L / B;
      st.lossEMA = st.lossEMA ? st.lossEMA * 0.92 + st.lastLoss * 0.08 : st.lastLoss;
      return st.lastLoss;
    };
    return st;
  }

  /* ---- 初始粒子：從寬高斯 N(0,σmax²) 撒出（一團「隨機噪聲」，集中在原點附近） ---- */
  function initParticles(M, sigmaInit, rng) {
    var X = new Float64Array(M * 2);
    for (var m = 0; m < M * 2; m++) X[m] = gauss(rng) * sigmaInit;
    return X;
  }

  /* ---- 退火 Langevin 採樣器 ---- */
  // mode 'anneal'：走過整條 σ 階梯（σ₁→σ_L），α_i = ε·σ_i²/σ_L²。
  // mode 'single'：只用最小的 σ_L，α = ε，跑同樣多的總步數（算力對等的對照組）。
  function makeSampler(net, sigmas, Tsteps, eps, mode, X, lmin, lmax) {
    var L = sigmas.length, M = X.length / 2;
    var sigL = sigmas[L - 1], sigL2 = sigL * sigL;
    var plan = [];
    if (mode === 'single') {
      for (var s = 0; s < L * Tsteps; s++) plan.push([sigL, eps]);
    } else {
      for (var i = 0; i < L; i++) {
        var al = eps * sigmas[i] * sigmas[i] / sigL2;
        for (var t = 0; t < Tsteps; t++) plan.push([sigmas[i], al]);
      }
    }
    var emb = new Float64Array(SD), inp = new Float64Array(DIN);
    var idx = 0;
    var api = {
      M: M, X: X, total: plan.length, mode: mode,
      curSigma: sigmas[0], phase: 0,
      isDone: function () { return idx >= plan.length; },
      step: function (rng) {                                    // 走一個 Langevin sweep（全部粒子一步）
        if (idx >= plan.length) return false;
        var p = plan[idx], sigma = p[0], alpha = p[1];
        var half = alpha / 2, sq = Math.sqrt(alpha);
        for (var m = 0; m < M; m++) {
          var x = X[2 * m], y = X[2 * m + 1];
          fillInput(inp, x, y, sigma, lmin, lmax, emb);
          var f = forward(net, inp);
          var sx = f.o[0] / sigma, sy = f.o[1] / sigma;
          X[2 * m] = x + half * sx + sq * gauss(rng);
          X[2 * m + 1] = y + half * sy + sq * gauss(rng);
        }
        idx++; api.curSigma = sigma; api.phase = idx / plan.length;
        return true;
      },
      runAll: function (rng) { while (api.step(rng)) { } return X; }
    };
    return api;
  }

  /* ---- 品質指標：生成點雲到目標點雲的平均最近鄰距離（越小越像） ---- */
  function meanNNDist(X, target) {
    var M = X.length / 2, tp = target.pts, n = target.n, sum = 0;
    for (var m = 0; m < M; m++) {
      var x = X[2 * m], y = X[2 * m + 1], best = Infinity;
      for (var i = 0; i < n; i++) {
        var dx = x - tp[i * 2], dy = y - tp[i * 2 + 1], d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      sum += Math.sqrt(best);
    }
    return sum / M;
  }

  var CORE = {
    TAU: TAU, NF: NF, SD: SD, DIN: DIN,
    mulberry32: mulberry32, gauss: gauss,
    SHAPES: SHAPES, standardize: standardize, geomSigmas: geomSigmas,
    sigEmb: sigEmb, fillInput: fillInput, buildInput: buildInput,
    createNet: createNet, copyParams: copyParams, paramSet: paramSet, zeroGrad: zeroGrad,
    forward: forward, backward: backward, makeAdam: makeAdam, adamStep: adamStep,
    scoreInto: scoreInto, rawInto: rawInto,
    makeTrainer: makeTrainer, initParticles: initParticles,
    makeSampler: makeSampler, meanNNDist: meanNNDist, PKEYS: PKEYS
  };
  global.NCSN_CORE = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;

  // node 測試時沒有 DOM，核心載完就收工
  if (typeof document === 'undefined') return;

  /* ==========================================================
   *  UI
   * ========================================================== */

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var LS = 'ncsn.';

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
  var SHAPE_LABELS = { twopeak: '雙峰（一大一小）', blobs: '星系（四團）', moons: '雙月', spiral: '螺旋', glyph: '一個字', draw: '自己畫' };
  var RANGES = {                                    // σ 範圍預設（改它需要重訓）；σmax 要大到能跨越資料最大間距
    narrow: { min: 0.06, max: 1.1, label: '窄' },
    std: { min: 0.04, max: 2.0, label: '標準' },
    wide: { min: 0.03, max: 2.8, label: '寬' }
  };
  var EFFORT = { fast: { steps: 2200 }, std: { steps: 3800 }, fine: { steps: 5400 } };
  var EPSOPT = { small: 0.0003, mid: 0.0006, large: 0.0012 };   // Langevin 步長 ε（小步長最能凸顯單噪聲級迷路）
  var NPTS = 800;                                    // 目標點雲點數
  function particleCount() { return window.innerWidth < 560 ? 170 : 260; }
  var GRID = 19;                                     // 分數場網格解析度

  /* ---- 全域狀態 ---- */
  var rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  var shapeName = store('shape') || 'twopeak';
  var rangeKey = store('range') || 'std';
  var effort = store('effort') || 'std';
  var glyphChar = store('glyph') || '分';
  var Lval = store('L') || 10;
  var stepsVal = store('steps') || 24;
  var epsKey = store('eps') || 'small';

  var target = null;                                 // 標準化後的目標點雲
  var trainer = null, net = null;
  var training = false, trained = false, stale = false;
  var lossHist = [];
  var runCount = store('runCount') || 0;

  // 分數場 / 採樣狀態
  var fieldSigma = 0;                                // 場卡目前顯示的 σ
  var fieldU = 0.5;                                  // 場卡滑桿位置 [0,1]（1=最大σ）
  var tracers = null;                                // 場上的示蹤粒子
  var sampAnneal = null, sampSingle = null;          // 兩個採樣器
  var sampX0 = null;                                 // 兩邊共用的初始雜訊
  var nnAnneal = 0, nnSingle = 0, nnNoise = 0;
  var nearestBuf = { a: null, s: null };             // 粒子到目標的距離（著色用）
  var sampleActive = false, sampling = false;

  // rAF 控制：三個獨立迴圈，各自被「分頁可見 + 對應卡片在視窗內」把關
  var trainRaf = 0, fieldRaf = 0, sampleRaf = 0;
  var trainVis = true, fieldVis = true, sampleVis = true;

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
  var VB = 3.0;                                       // view 半寬（資料座標）；容納 N(0,σmax²) 的初始噪聲雲
  function viewScale(cv) { return Math.min(cv.width, cv.height) / 2 / VB; }
  function fitCanvas(cv, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || cv.parentNode.clientWidth;
    var h = cssH || w;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  /* ---- 光點 sprite ---- */
  var spriteData = null, spriteHot = null, spriteCool = null, SPR = 22;
  function makeSprite(rgb) {
    var c = document.createElement('canvas'); c.width = c.height = SPR;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    grd.addColorStop(0, 'rgba(' + rgb + ',0.95)');
    grd.addColorStop(0.4, 'rgba(' + rgb + ',0.4)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd; g.fillRect(0, 0, SPR, SPR);
    return c;
  }
  function buildSprites() {
    spriteData = makeSprite('94,224,206');    // 目標資料：mint
    spriteHot = makeSprite('167,139,250');    // 迷路 / 高噪聲粒子：violet
    spriteCool = makeSprite('120,232,208');   // 已歸位粒子：cyan
  }

  /* ---- 畫目標點雲（淡背景） ---- */
  function drawTargetCloud(ctx, cv, arr, count, alpha, scale) {
    var vs = viewScale(cv), cx = cv.width / 2, cy = cv.height / 2;
    var sz = SPR * (scale || 0.62) * Math.min(cv.width, cv.height) / 320, half = sz / 2;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
    for (var i = 0; i < count; i++) ctx.drawImage(spriteData, cx + arr[i * 2] * vs - half, cy - arr[i * 2 + 1] * vs - half, sz, sz);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ---- 目標預覽卡 ---- */
  function drawTargetPreview() {
    var cv = el.targetCv; fitCanvas(cv);
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    var arr, count, i;
    if (shapeName === 'draw') {
      if (drawPts.length < 12) { drawHint('在這裡用滑鼠或手指塗出一團點'); return; }
      arr = new Float64Array(drawPts.length * 2);
      for (i = 0; i < drawPts.length; i++) { arr[i * 2] = drawPts[i][0]; arr[i * 2 + 1] = drawPts[i][1]; }
      count = drawPts.length;
    } else {
      if (!target) return; arr = target.pts; count = target.n;
    }
    drawTargetCloud(ctx, cv, arr, count, 0.85, 0.7);
  }
  function drawHint(text) {
    var cv = el.targetCv, ctx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.fillStyle = 'rgba(167,139,250,.55)';
    ctx.font = (13 * dpr) + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(text, cv.width / 2, cv.height / 2);
  }

  /* ---- 學習曲線 ---- */
  function drawCurve() {
    var cv = el.curve; fitCanvas(cv, cv.clientHeight);
    var ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pad = 8 * dpr, gw = w - pad * 2, gh = h - pad * 2;
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (var r = 0; r <= 4; r++) { var gy = pad + gh * r / 4; ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(w - pad, gy); ctx.stroke(); }
    if (lossHist.length > 1) {
      var n = lossHist.length - 1;
      var grd = ctx.createLinearGradient(pad, 0, w - pad, 0);
      grd.addColorStop(0, '#a78bfa'); grd.addColorStop(1, '#5ee0ce');
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

  /* ---- 建立目標 ---- */
  function hashName(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }
  function glyphPoints(ch, n) {
    var S = 200, c = document.createElement('canvas'); c.width = c.height = S;
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 150px "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif';
    g.fillText(ch || '分', S / 2, S / 2 + 6);
    var im = g.getImageData(0, 0, S, S).data, hits = [];
    for (var y = 0; y < S; y += 2) for (var x = 0; x < S; x += 2) {
      if (im[(y * S + x) * 4 + 3] > 100) hits.push([(x / S - 0.5) * 3, -(y / S - 0.5) * 3]);
    }
    if (hits.length < 20) return SHAPES.blobs(mulberry32(1), n);
    var out = [], r = mulberry32(0x9e3 + hashName(ch));
    for (var i = 0; i < n; i++) {
      var p = hits[(r() * hits.length) | 0];
      out.push([p[0] + gauss(r) * 0.02, p[1] + gauss(r) * 0.02]);
    }
    return out;
  }
  function rebuildTarget() {
    if (shapeName === 'draw') target = drawPts.length >= 12 ? standardize(drawPts) : null;
    else if (shapeName === 'glyph') target = standardize(glyphPoints(glyphChar, NPTS));
    else target = standardize(SHAPES[shapeName](mulberry32(0x51ee + hashName(shapeName)), NPTS));
    drawTargetPreview();
  }

  function markStale(why) {
    if (!trained) return;
    stale = true;
    el.trainStatus.textContent = why + ' 分數網路需要重新訓練，才能反映新設定。';
    lockCard(el.fieldCard); lockCard(el.sampleCard);
    el.sampleBtn.disabled = true;
  }
  function lockCard(card) { card.classList.add('locked'); card.classList.remove('unlocked'); }
  function unlockCard(card) { card.classList.remove('locked'); card.classList.add('unlocked'); }

  /* ---- rAF 把關 ---- */
  function canTrain() { return training && trainer && trainer.done < trainer.total && !document.hidden && trainVis; }
  function canField() { return trained && !reduced && tracers && !document.hidden && fieldVis; }
  function canSample() { return sampling && sampleActive && !document.hidden && sampleVis; }
  function syncLoops() {
    if (canTrain()) { if (!trainRaf) trainRaf = requestAnimationFrame(trainFrame); }
    else if (trainRaf) { cancelAnimationFrame(trainRaf); trainRaf = 0; }
    if (canField()) { if (!fieldRaf) fieldRaf = requestAnimationFrame(fieldFrame); }
    else if (fieldRaf) { cancelAnimationFrame(fieldRaf); fieldRaf = 0; }
    if (canSample()) { if (!sampleRaf) sampleRaf = requestAnimationFrame(sampleFrame); }
    else if (sampleRaf) { cancelAnimationFrame(sampleRaf); sampleRaf = 0; }
  }

  /* ---- 訓練 ---- */
  function startTraining() {
    if (training) return;
    sampling = false; sampleActive = false;
    if (shapeName === 'draw' && (!target || target.n < 40)) {
      el.trainStatus.textContent = '請先在上面塗出至少一小團點（越多越好），再開始訓練。';
      return;
    }
    if (!target) rebuildTarget();
    var R = RANGES[rangeKey];
    lossHist = [];
    trainer = makeTrainer({
      H: 64, data: target, rng: rng, netRng: mulberry32((rng() * 1e9) | 0),
      sigMin: R.min, sigMax: R.max, batch: 128, jitter: 0.008,
      emaDecay: 0.996, totalSteps: EFFORT[effort].steps, lr: 0.004
    });
    net = trainer.ema;
    training = true; trained = false; stale = false;
    el.trainBtn.disabled = true; el.trainBtn.textContent = '訓練中…';
    lockCard(el.fieldCard); lockCard(el.sampleCard); el.sampleBtn.disabled = true;
    el.trainStatus.textContent = '正在做 denoising score matching：每步一個 128 點的 minibatch，'
      + '對加了隨機噪聲級的點預測「把它推回乾淨點的方向」，梯度自己反向傳播。';
    document.documentElement.classList.add('busy');
    syncLoops();
  }
  function trainFrame() {
    trainRaf = 0;
    if (!canTrain()) return;
    var t0 = performance.now(), budget = reduced ? 26 : 13;
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
    tweenNum(el.statLoss, trainer.lossEMA * 1.35, trainer.lossEMA, function (v) { return v.toFixed(3); }, 500);
    el.trainStatus.textContent = '訓練完成：DSM 損失從約 1.0 降到 ' + trainer.lossEMA.toFixed(3)
      + '。這一個網路已經同時學會所有噪聲級的分數——往下看它的分數場，再讓隨機點順著它流回家。';
    unlockCard(el.fieldCard); unlockCard(el.sampleCard); el.sampleBtn.disabled = false;
    document.documentElement.classList.remove('busy');
    setupField();
    resetSampler();
    drawCurve();
    if (!reduced) el.fieldCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---- 哇時刻一：分數場 ---- */
  function sigmaFromU(u) {                            // u∈[0,1]，1=σmax
    var R = RANGES[rangeKey], lmin = Math.log(R.min), lmax = Math.log(R.max);
    return Math.exp(lmin + u * (lmax - lmin));
  }
  function setupField() {
    fieldSigma = sigmaFromU(fieldU);
    // 場上的示蹤粒子（沿分數做確定性上升，會往資料聚，離開就重生）
    tracers = new Float64Array(28 * 2);
    for (var i = 0; i < 28 * 2; i++) tracers[i] = gauss(rng) * RANGES[rangeKey].max;
    drawField();
    updateFieldLabels();
    syncLoops();
  }
  function updateFieldLabels() {
    el.sigVal.textContent = fieldSigma.toFixed(3);
    var frac = fieldU;
    el.fieldMode.textContent = frac > 0.66 ? '大噪聲：場很平滑，指向整團資料的重心'
      : frac < 0.34 ? '小噪聲：場很銳利，緊貼形狀的輪廓' : '中噪聲：場開始收攏到各個團塊';
  }
  function drawField() {
    if (!trained) return;
    var cv = el.fieldCv; fitCanvas(cv);
    var ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    // 底：淡淡的目標點雲
    if (el.fieldShowData.getAttribute('aria-pressed') === 'true' && target) drawTargetCloud(ctx, cv, target.pts, target.n, 0.28, 0.6);
    var R = RANGES[rangeKey], lmin = Math.log(R.min), lmax = Math.log(R.max);
    var emb = new Float64Array(SD), inp = new Float64Array(DIN), out = new Float64Array(2);
    var vs = viewScale(cv), cx = w / 2, cy = h / 2, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cell = (2 * VB) / GRID, aLen = cell * 0.62 * vs;
    for (var gy = 0; gy < GRID; gy++) {
      for (var gx = 0; gx < GRID; gx++) {
        var wx = -VB + cell * (gx + 0.5), wy = -VB + cell * (gy + 0.5);
        rawInto(net, wx, wy, fieldSigma, lmin, lmax, emb, inp, out);
        var mag = Math.hypot(out[0], out[1]);
        if (mag < 1e-4) continue;
        var t = Math.min(1, mag / 1.3);
        var px = cx + wx * vs, py = cy - wy * vs;
        var dx = out[0] / mag, dy = -out[1] / mag;
        var len = aLen * (0.28 + 0.72 * t);
        drawArrow(ctx, px, py, dx, dy, len, 0.22 + 0.6 * t, dpr);
      }
    }
    // 示蹤粒子
    if (tracers) {
      ctx.globalCompositeOperation = 'lighter';
      var sz = SPR * 0.5 * Math.min(w, h) / 320, half = sz / 2;
      ctx.globalAlpha = 0.9;
      for (var i = 0; i < tracers.length / 2; i++) ctx.drawImage(spriteCool, cx + tracers[i * 2] * vs - half, cy - tracers[i * 2 + 1] * vs - half, sz, sz);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  function drawArrow(ctx, x, y, dx, dy, len, alpha, dpr) {
    var ex = x + dx * len, ey = y + dy * len;
    ctx.strokeStyle = 'rgba(245,190,110,' + alpha + ')';
    ctx.lineWidth = 1.4 * dpr; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    var ah = len * 0.42, aw = 0.5;
    ctx.fillStyle = 'rgba(245,190,110,' + alpha + ')';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - dx * ah - dy * ah * aw, ey - dy * ah + dx * ah * aw);
    ctx.lineTo(ex - dx * ah + dy * ah * aw, ey - dy * ah - dx * ah * aw);
    ctx.closePath(); ctx.fill();
  }
  function fieldFrame() {
    fieldRaf = 0;
    if (!canField()) return;
    var R = RANGES[rangeKey], lmin = Math.log(R.min), lmax = Math.log(R.max);
    var emb = new Float64Array(SD), inp = new Float64Array(DIN), out = new Float64Array(2);
    var n = tracers.length / 2, k = Math.min(0.09, 0.5 * fieldSigma);
    for (var i = 0; i < n; i++) {
      var x = tracers[i * 2], y = tracers[i * 2 + 1];
      scoreInto(net, x, y, fieldSigma, lmin, lmax, emb, inp, out);
      var nx = x + k * out[0] * fieldSigma, ny = y + k * out[1] * fieldSigma;
      if (Math.abs(nx) > VB || Math.abs(ny) > VB || (Math.hypot(nx - x, ny - y) < 0.002)) {
        nx = gauss(rng) * R.max; ny = gauss(rng) * R.max;   // 聚了或跑出去 → 重生
      }
      tracers[i * 2] = nx; tracers[i * 2 + 1] = ny;
    }
    drawField();
    fieldRaf = requestAnimationFrame(fieldFrame);
  }

  /* ---- 哇時刻二：退火 vs 單一噪聲級 ---- */
  function buildSigmas() { return geomSigmas(RANGES[rangeKey].min, RANGES[rangeKey].max, Lval); }
  function resetSampler() {
    if (!trained) return;
    var M = particleCount();
    sampX0 = initParticles(M, RANGES[rangeKey].max, mulberry32((rng() * 1e9) | 0));
    nnNoise = meanNNDist(sampX0, target);
    var R = RANGES[rangeKey], lmin = Math.log(R.min), lmax = Math.log(R.max);
    var sig = buildSigmas(), eps = EPSOPT[epsKey];
    sampAnneal = makeSampler(net, sig, stepsVal, eps, 'anneal', Float64Array.from(sampX0), lmin, lmax);
    sampSingle = makeSampler(net, sig, stepsVal, eps, 'single', Float64Array.from(sampX0), lmin, lmax);
    nearestBuf.a = new Float64Array(M); nearestBuf.s = new Float64Array(M);
    nnAnneal = nnNoise; nnSingle = nnNoise;
    sampleActive = true; sampling = false;
    el.sampleBtn.textContent = '撒一團隨機點，開始採樣';
    fitSampleCanvases();
    computeNearest(sampAnneal.X, nearestBuf.a); computeNearest(sampSingle.X, nearestBuf.s);
    renderSample(true);
    el.verdict.textContent = '兩邊都從同一團隨機噪聲出發（平均離目標 ' + nnNoise.toFixed(2) + '）。按下採樣，看誰能流回家。';
    el.sampleLive.textContent = '準備好了：左邊只用最小的單一噪聲級，右邊走完整條退火階梯。';
  }
  function startSampling() {
    if (!trained) return;
    if (!sampAnneal || sampAnneal.isDone() || sampSingle.isDone()) resetSampler();
    runCount++; store('runCount', runCount); el.runCount.textContent = String(runCount);
    if (reduced) {                                    // 降低動態：直接算完、顯示結果
      sampAnneal.runAll(mulberry32((rng() * 1e9) | 0));
      sampSingle.runAll(mulberry32((rng() * 1e9) | 0));
      finishSampling(); return;
    }
    sampling = true;
    el.sampleBtn.textContent = '採樣中…';
    el.sampleLive.textContent = '退火 Langevin 進行中：右邊先在大噪聲下找到團塊，再逐級降噪精修。';
    syncLoops();
  }
  var sampRng = null;
  function sampleFrame() {
    sampleRaf = 0;
    if (!canSample()) return;
    if (!sampRng) sampRng = mulberry32((rng() * 1e9) | 0);
    var t0 = performance.now(), budget = 15;
    while (performance.now() - t0 < budget) {
      var moved = false;
      if (!sampAnneal.isDone()) { sampAnneal.step(sampRng); moved = true; }
      if (!sampSingle.isDone()) { sampSingle.step(sampRng); moved = true; }
      if (!moved) break;
    }
    computeNearest(sampAnneal.X, nearestBuf.a); computeNearest(sampSingle.X, nearestBuf.s);
    nnAnneal = avg(nearestBuf.a); nnSingle = avg(nearestBuf.s);
    renderSample(false);
    updateSampleLabels(false);
    if (sampAnneal.isDone() && sampSingle.isDone()) { finishSampling(); return; }
    sampleRaf = requestAnimationFrame(sampleFrame);
  }
  function finishSampling() {
    sampling = false; sampRng = null;
    computeNearest(sampAnneal.X, nearestBuf.a); computeNearest(sampSingle.X, nearestBuf.s);
    nnAnneal = avg(nearestBuf.a); nnSingle = avg(nearestBuf.s);
    renderSample(false); updateSampleLabels(true);
    el.sampleBtn.textContent = '再撒一團，重新採樣';
    var ratio = nnSingle / Math.max(nnAnneal, 1e-6);
    if (ratio >= 1.5) {
      el.verdict.innerHTML = '退火收斂到平均 <b>' + nnAnneal.toFixed(3) + '</b>；單一噪聲級卡在 <b>'
        + nnSingle.toFixed(3) + '</b>——差了約 <b>' + ratio.toFixed(1) + ' 倍</b>。左邊有一群點迷在兩團中間的低密度鴻溝裡，'
        + '而且左右團的比例也錯了。這就是論文要用多噪聲級的原因。';
      el.sampleLive.textContent = '採樣完成。右邊順著分數場流回了「' + SHAPE_LABELS[shapeName]
        + '」；左邊只有靠近資料的點被收攏，一大群在低密度區迷了路。';
    } else {
      el.verdict.innerHTML = '這個分布是連通、沒有低密度鴻溝的，所以單一噪聲級（<b>' + nnSingle.toFixed(3)
        + '</b>）也能收斂，和退火（<b>' + nnAnneal.toFixed(3) + '</b>）差不多——這也是論文誠實的一面。'
        + '換成「<b>雙峰</b>」這種分離、不等重的分布，單一噪聲級立刻就迷路了。';
      el.sampleLive.textContent = '採樣完成。連通的「' + SHAPE_LABELS[shapeName] + '」兩法都收斂了；想看差距，換成「雙峰」再跑一次。';
    }
  }
  function avg(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function computeNearest(X, into) {
    var M = X.length / 2, tp = target.pts, n = target.n;
    for (var m = 0; m < M; m++) {
      var x = X[2 * m], y = X[2 * m + 1], best = Infinity;
      for (var i = 0; i < n; i++) { var dx = x - tp[i * 2], dy = y - tp[i * 2 + 1], d = dx * dx + dy * dy; if (d < best) best = d; }
      into[m] = Math.sqrt(best);
    }
  }
  function renderSampleOne(cv, X, near) {
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (target) drawTargetCloud(ctx, cv, target.pts, target.n, 0.16, 0.6);
    var vs = viewScale(cv), cx = cv.width / 2, cy = cv.height / 2, M = X.length / 2;
    var sz = SPR * 0.72 * Math.min(cv.width, cv.height) / 320, half = sz / 2;
    ctx.globalCompositeOperation = 'lighter';
    for (var m = 0; m < M; m++) {
      var d = near ? near[m] : 1;
      var home = d < 0.16;                              // 夠近 → cyan，否則 violet
      ctx.globalAlpha = home ? 0.9 : 0.72;
      var spr = home ? spriteCool : spriteHot;
      ctx.drawImage(spr, cx + X[m * 2] * vs - half, cy - X[m * 2 + 1] * vs - half, sz, sz);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function renderSample() {
    renderSampleOne(el.singleCv, sampSingle.X, nearestBuf.s);
    renderSampleOne(el.annealCv, sampAnneal.X, nearestBuf.a);
  }
  var lastAnnounce = 0;
  function updateSampleLabels(force) {
    el.nnSingle.textContent = nnSingle.toFixed(3);
    el.nnAnneal.textContent = nnAnneal.toFixed(3);
    if (sampAnneal) el.annealSig.textContent = 'σ = ' + sampAnneal.curSigma.toFixed(3);
    var pct = sampAnneal ? Math.round(sampAnneal.phase * 100) : 0;
    el.annealPct.textContent = pct + '%';
    var now = performance.now();
    if (!force && now - lastAnnounce < 400) return;
    lastAnnounce = now;
    if (!force) el.sampleLive.textContent = '退火進度 ' + pct + '%，目前噪聲級 σ=' + (sampAnneal ? sampAnneal.curSigma.toFixed(3) : '');
  }
  function fitSampleCanvases() { fitCanvas(el.singleCv, el.singleCv.clientWidth); fitCanvas(el.annealCv, el.annealCv.clientWidth); }

  /* ---- 自己畫 ---- */
  function drawCanvasPos(evt) {
    var cv = el.targetCv, r = cv.getBoundingClientRect();
    var pt = evt.touches ? evt.touches[0] : evt;
    var vs = viewScale(cv), dpr = cv.width / r.width;
    var x = (pt.clientX - r.left) * dpr, y = (pt.clientY - r.top) * dpr;
    return [(x - cv.width / 2) / vs, -(y - cv.height / 2) / vs];
  }
  function addBrush(p) {
    for (var k = 0; k < 3; k++) drawPts.push([p[0] + gauss(rng) * 0.1, p[1] + gauss(rng) * 0.1]);
    if (drawPts.length > 1200) drawPts.splice(0, drawPts.length - 1200);
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
    ['targetCv', 'curve', 'statStep', 'statLoss', 'trainBar', 'trainBtn', 'trainStatus',
      'shapeSeg', 'rangeSeg', 'effortSeg', 'glyphWrap', 'glyphInput', 'drawTools', 'clearDraw',
      'fieldCard', 'fieldCv', 'sigSlider', 'sigVal', 'fieldMode', 'fieldShowData',
      'sampleCard', 'sampleBtn', 'replayBtn', 'singleCv', 'annealCv', 'nnSingle', 'nnAnneal',
      'annealSig', 'annealPct', 'verdict', 'sampleLive', 'runCount',
      'lSeg', 'stepsSeg', 'epsSeg'
    ].forEach(function (id) { el[id] = $(id); });

    buildSprites();
    el.runCount.textContent = String(runCount);

    segClick(el.shapeSeg, shapeName, function (v) {
      shapeName = v; store('shape', v);
      el.drawTools.hidden = v !== 'draw';
      el.glyphWrap.hidden = v !== 'glyph';
      el.targetCv.classList.toggle('drawable', v === 'draw');
      if (v !== 'draw') drawPts = [];
      rebuildTarget();
      markStale('你換了目標分布，');
    });
    segClick(el.rangeSeg, rangeKey, function (v) { rangeKey = v; store('range', v); markStale('你改了噪聲範圍 σ，'); });
    segClick(el.effortSeg, effort, function (v) { effort = v; store('effort', v); el.statStep.textContent = '0 / ' + EFFORT[effort].steps; markStale('你改了訓練程度，'); });
    segClick(el.lSeg, Lval, function (v) { Lval = parseInt(v, 10); store('L', Lval); resetSampler(); });
    segClick(el.stepsSeg, stepsVal, function (v) { stepsVal = parseInt(v, 10); store('steps', stepsVal); resetSampler(); });
    segClick(el.epsSeg, epsKey, function (v) { epsKey = v; store('eps', v); resetSampler(); });

    el.glyphInput.value = glyphChar;
    el.glyphInput.addEventListener('input', function () {
      var v = (el.glyphInput.value || '分').slice(0, 1);
      glyphChar = v; store('glyph', v);
      if (shapeName === 'glyph') { rebuildTarget(); markStale('你改了字，'); }
    });

    el.trainBtn.addEventListener('click', startTraining);
    el.sampleBtn.addEventListener('click', startSampling);
    el.replayBtn.addEventListener('click', function () { if (trained) { resetSampler(); startSampling(); } });

    el.sigSlider.addEventListener('input', function () {
      fieldU = parseInt(el.sigSlider.value, 10) / 100;
      fieldSigma = sigmaFromU(fieldU);
      updateFieldLabels();
      if (trained) drawField();
    });
    el.fieldShowData.addEventListener('click', function () {
      var on = el.fieldShowData.getAttribute('aria-pressed') !== 'true';
      el.fieldShowData.setAttribute('aria-pressed', String(on));
      if (trained) drawField();
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
    el.glyphWrap.hidden = shapeName !== 'glyph';
    el.targetCv.classList.toggle('drawable', shapeName === 'draw');
    el.statStep.textContent = '0 / ' + EFFORT[effort].steps;
    el.statLoss.textContent = '—';
    el.sigSlider.value = String(Math.round(fieldU * 100));

    document.addEventListener('visibilitychange', syncLoops);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (en) { trainVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe($('trainCard'));
      new IntersectionObserver(function (es) { es.forEach(function (en) { fieldVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe(el.fieldCard);
      new IntersectionObserver(function (es) { es.forEach(function (en) { sampleVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe(el.sampleCard);
    }

    var resizePending = false;
    window.addEventListener('resize', function () {
      if (resizePending) return; resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false;
        drawTargetPreview(); drawCurve();
        if (trained) { drawField(); if (sampleActive) { fitSampleCanvases(); renderSample(); } }
      });
    });

    rebuildTarget();
    drawCurve();
    stagger();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);

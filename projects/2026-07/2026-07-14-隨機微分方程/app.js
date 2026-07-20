/* 隨機微分方程 — 在瀏覽器裡當場訓練一個「分數網路」，用連續時間的 SDE 把資料溶成雜訊、
 * 再把雜訊變回資料；並把「隨機的逆時間 SDE」和「確定性的機率流 ODE」擺在一起對照。
 *
 * 對應論文：Song, Sohl-Dickstein, Kingma, Kumar, Ermon, Poole,
 *   〈Score-Based Generative Modeling through Stochastic Differential Equations〉
 *   ICLR 2021 傑出論文，arXiv:2011.13456。
 *
 * 零外部資源：形狀是程序化生成的，分數網路是純 JS 寫的，梯度是自己反向傳播算的，
 * 前向 / 逆時間 SDE 與機率流 ODE 全靠 Euler–Maruyama / Euler 數值積分。
 * 核心（CORE）不碰 DOM，可在 node 裡 require 進來做梯度檢查與生成品質測試。
 *
 * 骨架（跟真實圖像上的 Score-SDE 一模一樣，只是這裡資料是 2D 點）：
 *   前向 SDE：dx = f(x,t) dt + g(t) dw                         （把資料一路溶成雜訊）
 *   逆時間 SDE（Anderson 1982）：dx = [f − g²·∇ₓlog pₜ(x)] dt + g(t) dw̄
 *   機率流 ODE：dx = [f − ½ g²·∇ₓlog pₜ(x)] dt                 （確定性、同邊際分布）
 *   VP-SDE（保變異數）≈ DDPM（Ho 2020）；VE-SDE（爆變異數）≈ NCSN（Song & Ermon 2019）。
 *   分數 ∇log pₜ 由 denoising score matching 學到：網路預測加進去的雜訊 z，score = −z_θ / σ_t。
 */
(function (global) {
  'use strict';

  /* ==========================================================
   *  CORE：形狀 / SDE / 分數 MLP / 反向傳播 / 訓練 / 前向 & 逆向積分
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
  var SHAPES = {
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
    spiral: function (rng, n) {                       // 雙臂螺旋
      var p = [];
      for (var i = 0; i < n; i++) {
        var arm = i % 2, u = Math.sqrt(rng());
        var r = 0.12 + u * 1.05;
        var ang = u * 3.1 * Math.PI + arm * Math.PI + gauss(rng) * 0.05;
        p.push([r * Math.cos(ang) + gauss(rng) * 0.03, r * Math.sin(ang) + gauss(rng) * 0.03]);
      }
      return p;
    },
    gaussians: function (rng, n) {                    // 四個高斯團
      var C = [[-0.82, -0.82], [0.82, -0.82], [-0.82, 0.82], [0.82, 0.82]], p = [];
      for (var i = 0; i < n; i++) {
        var c = C[i % 4];
        p.push([c[0] + gauss(rng) * 0.17, c[1] + gauss(rng) * 0.17]);
      }
      return p;
    },
    letterS: function (rng, n) {                      // 字母 S（給 SDE 的小彩蛋）：垂直正弦筆畫加厚度
      var p = [];
      for (var i = 0; i < n; i++) {
        var s = rng();
        var y = 0.95 * (1 - 2 * s);
        var x = -0.62 * Math.sin(TAU * s);
        // 沿筆畫法線方向撒出厚度
        p.push([x + gauss(rng) * 0.075, y + gauss(rng) * 0.055]);
      }
      return p;
    }
  };

  // 把任意點雲標準化到「零均值、平均每維變異數 ≈ 1」，讓它跟單位高斯先驗對得上。
  // 等向縮放（單一 scale）以保留長寬比。回傳映射回原座標所需的 mean 與 scale。
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

  /* ---- SDE：VP（保變異數，≈DDPM）與 VE（爆變異數，≈NCSN）兩個特例 ----
   * 兩者都給出：邊際 kernel p(x_t|x0)=N(a(t)·x0, s(t)²I)、漂移 f、擴散係數平方 g²、先驗標準差。
   * 標準化後資料每維變異數≈1，所以「邊際變異數」用 a²+s² 估計。 */
  function makeSDE(type, cfg) {
    cfg = cfg || {};
    var eps = cfg.eps != null ? cfg.eps : 1e-3;
    if (type === 've') {
      var smin = cfg.sigmaMin != null ? cfg.sigmaMin : 0.01;
      var smax = cfg.sigmaMax != null ? cfg.sigmaMax : 5;
      var logr = Math.log(smax / smin);
      var sigF = function (t) { return smin * Math.pow(smax / smin, t); };            // 擴散尺度 σ(t)
      return {
        type: 've', eps: eps, sigmaMax: smax, sigmaMin: smin,
        a: function () { return 1; },                                                  // 邊際均值係數
        s: function (t) { var v = sigF(t) * sigF(t) - smin * smin; return Math.sqrt(v > 1e-12 ? v : 1e-12); },
        f: function () { return 0; },                                                  // 前向漂移（每維）
        g2: function (t) { var g = sigF(t); return 2 * logr * g * g; },                // g(t)²=d[σ²]/dt
        priorStd: function () { var v = smax * smax - smin * smin; return Math.sqrt(v > 0 ? v : 0); },
        worldExtent: function () { return Math.max(3.4, smax * 2.55); }
      };
    }
    // VP
    var bmin = cfg.betaMin != null ? cfg.betaMin : 0.1;
    var bmax = cfg.betaMax != null ? cfg.betaMax : 20;
    var Bf = function (t) { return bmin * t + 0.5 * (bmax - bmin) * t * t; };          // ∫β
    return {
      type: 'vp', eps: eps, betaMin: bmin, betaMax: bmax,
      a: function (t) { return Math.exp(-0.5 * Bf(t)); },
      s: function (t) { return Math.sqrt(1 - Math.exp(-Bf(t))); },
      f: function (x, t) { return -0.5 * (bmin + t * (bmax - bmin)) * x; },
      g2: function (t) { return bmin + t * (bmax - bmin); },
      priorStd: function () { return Math.sqrt(1 - Math.exp(-Bf(1))); },
      worldExtent: function () { return 3.4; }
    };
  }

  /* ---- 時間嵌入：連續 t∈[0,1] 編成一組傅立葉特徵，讓網路知道「現在雜訊多重」 ---- */
  var NF = 6;                 // 頻率數
  var TD = 1 + 2 * NF;        // 時間嵌入維度 = 13
  var DIN = 2 + TD;           // 網路輸入維度 = (x, y) + 時間嵌入 = 15
  function timeEmb(tn, out) {
    out[0] = tn * 2 - 1;
    for (var k = 0; k < NF; k++) {
      var w = Math.PI * (k + 1);
      out[1 + 2 * k] = Math.sin(w * tn);
      out[2 + 2 * k] = Math.cos(w * tn);
    }
  }

  // 給網路的輸入：把 x_t 依邊際標準差縮放到 O(1)（VE 在大 t 時 x 可達數十，不縮放會爆），再接時間嵌入。
  var _emb = new Float64Array(TD);
  function buildInput(x, y, t, sde, out) {
    var a = sde.a(t), s = sde.s(t);
    var mvar = a * a + s * s;                          // 邊際變異數（資料變異數≈1）
    var isc = 1 / Math.sqrt(mvar > 1e-8 ? mvar : 1e-8);
    out[0] = x * isc; out[1] = y * isc;
    timeEmb(t, _emb);
    for (var e = 0; e < TD; e++) out[2 + e] = _emb[e];
    return out;
  }

  /* ---- 分數網路：MLP (x,y,t) → 兩維輸出（預測雜訊 z），兩層隱藏、SiLU 激活 ---- */
  // SiLU（x·σ(x)）平滑不飽和，在高雜訊區比 tanh 穩定得多。
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

  // 反向傳播：損失 L = ½‖o − z‖²（z 是加進去的雜訊），把梯度累加進 g，回傳這一筆的 loss。
  function backward(net, inp, f, zx, zy, g) {
    var H = net.H, h, i, off, c;
    var d0 = f.o[0] - zx, d1 = f.o[1] - zy;
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

  // 分數估計：score = −z_θ(x,t) / σ_t（denoising score matching 的標準預條件化，等於 ∇log pₜ）。
  var _inpScore = new Float64Array(DIN);
  function scoreAt(net, x, y, t, sde) {
    buildInput(x, y, t, sde, _inpScore);
    var o = forward(net, _inpScore).o;
    var sden = Math.max(sde.s(t), 0.01);
    return [-o[0] / sden, -o[1] / sden];
  }
  // 只回傳網路對雜訊 z 的預測（採樣時內部用）
  function noiseAt(net, x, y, t, sde, inp) {
    buildInput(x, y, t, sde, inp);
    return forward(net, inp).o;
  }

  /* ---- 訓練器：denoising score matching。每 step 做一個 minibatch 的 Adam 更新，並維護 EMA 權重 ---- */
  function makeTrainer(cfg) {
    var H = cfg.H, sde = cfg.sde, data = cfg.data, rng = cfg.rng;
    var net = createNet(cfg.netRng || rng, H);
    var ema = copyParams(net);
    var opt = makeAdam(H);
    var g = paramSet(H);
    var inp = new Float64Array(DIN);
    var eps = sde.eps, N = data.n, B = cfg.batch, jit = cfg.jitter, decay = cfg.emaDecay;
    var total = cfg.totalSteps, baseLr = cfg.lr;
    var st = { net: net, ema: ema, done: 0, total: total, lastLoss: 0, lossEMA: 0 };

    st.step = function () {
      zeroGrad(g);
      var L = 0, frac = st.done / total;
      var lr = baseLr * (0.15 + 0.85 * (0.5 + 0.5 * Math.cos(Math.PI * frac)));   // cosine 衰減到 15%
      for (var b = 0; b < B; b++) {
        var idx = (rng() * N) | 0;
        var x0 = data.pts[idx * 2] + gauss(rng) * jit;
        var y0 = data.pts[idx * 2 + 1] + gauss(rng) * jit;
        var t = eps + (1 - eps) * rng();                 // t ~ U[eps, 1]
        var a = sde.a(t), s = sde.s(t);
        var zx = gauss(rng), zy = gauss(rng);
        var xt = a * x0 + s * zx, yt = a * y0 + s * zy;  // 邊際 kernel 取樣
        buildInput(xt, yt, t, sde, inp);
        var f = forward(net, inp);
        L += backward(net, inp, f, zx, zy, g);           // 目標＝加進去的雜訊 z
      }
      adamStep(net, g, opt, B, lr);
      for (var k = 0; k < PKEYS.length; k++) {           // EMA
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

  /* ---- 前向 SDE 積分器（Euler–Maruyama）：從資料 x0 出發，t: eps→1，看它溶成雜訊 ---- */
  // 時間格點 k=0..N 對應 t_k = eps + (1−eps)·k/N；k=0 是資料、k=N 是純雜訊。
  function makeForward(sde, x0arr, N, rng) {
    var M = x0arr.length / 2, eps = sde.eps, dt = (1 - eps) / N;
    var X = Float64Array.from(x0arr);
    var levels = new Array(N + 1); levels[0] = Float32Array.from(X);
    var s = { M: M, N: N, k: 0, levels: levels, X: X, done: false };
    s.next = function () {
      if (s.k >= N) { s.done = true; return null; }
      var t = eps + (1 - eps) * s.k / N, gn = Math.sqrt(sde.g2(t) * dt);
      for (var m = 0; m < M; m++) {
        var x = X[m * 2], y = X[m * 2 + 1];
        X[m * 2] = x + sde.f(x, t) * dt + gn * gauss(rng);
        X[m * 2 + 1] = y + sde.f(y, t) * dt + gn * gauss(rng);
      }
      s.k++; levels[s.k] = Float32Array.from(X);
      return { k: s.k, X: X };
    };
    s.runAll = function () { while (!s.done) s.next(); return levels; };
    return s;
  }

  /* ---- 逆向積分器：逆時間 SDE（mode='sde'）或機率流 ODE（mode='ode'） ----
   * 從先驗雜訊（k=N，t=1）積分回資料（k=0，t=eps）。可帶入共用的 X0 來做「同起點對照」。
   * 逆 SDE： x ← x − [f − g²·score]·Δt + g·√Δt·z   （隨機，每步撒新雜訊）
   * 機率流 ODE：x ← x − [f − ½ g²·score]·Δt         （確定性，無雜訊項） */
  function makeReverse(net, sde, cfg) {
    var M = cfg.M, N = cfg.N, eps = sde.eps, dt = (1 - eps) / N, mode = cfg.mode || 'sde';
    var X = new Float64Array(M * 2);
    if (cfg.X0) { X.set(cfg.X0); }
    else { var ps = sde.priorStd(); for (var i = 0; i < M * 2; i++) X[i] = gauss(cfg.rng) * ps; }
    var levels = new Array(N + 1); levels[N] = Float32Array.from(X);
    var nTr = cfg.tracers || 0, trails = [];
    for (var q = 0; q < nTr; q++) trails.push([[X[q * 2], X[q * 2 + 1]]]);
    var inp = new Float64Array(M >= 0 ? DIN : DIN);
    var half = (mode === 'ode') ? 0.5 : 1.0;
    var s = { M: M, N: N, k: N, levels: levels, X: X, mode: mode, done: false, trails: trails };
    s.next = function () {
      if (s.k <= 0) { s.done = true; return null; }
      var t = eps + (1 - eps) * s.k / N;
      var g2 = sde.g2(t), st = sde.s(t), sden = Math.max(st, 0.01);
      var gn = (mode === 'sde') ? Math.sqrt(g2 * dt) : 0;
      for (var m = 0; m < M; m++) {
        var x = X[m * 2], y = X[m * 2 + 1];
        var o = noiseAt(net, x, y, t, sde, inp);         // 網路預測的雜訊 z_θ
        var scx = -o[0] / sden, scy = -o[1] / sden;      // score = −z_θ/σ_t
        var drx = sde.f(x, t) - half * g2 * scx;
        var dry = sde.f(y, t) - half * g2 * scy;
        var zx = gn ? gauss(cfg.rng) : 0, zy = gn ? gauss(cfg.rng) : 0;
        X[m * 2] = x - drx * dt + gn * zx;
        X[m * 2 + 1] = y - dry * dt + gn * zy;
      }
      s.k--; levels[s.k] = Float32Array.from(X);
      for (var qq = 0; qq < nTr; qq++) trails[qq].push([X[qq * 2], X[qq * 2 + 1]]);
      return { k: s.k, X: X };
    };
    s.runAll = function () { while (!s.done) s.next(); return levels; };
    return s;
  }

  // 抽先驗雜訊（給對照用：兩個逆向積分器共用同一組起點 X0）
  function samplePrior(sde, M, rng) {
    var ps = sde.priorStd(), X = new Float64Array(M * 2);
    for (var i = 0; i < M * 2; i++) X[i] = gauss(rng) * ps;
    return X;
  }

  var CORE = {
    TAU: TAU, NF: NF, TD: TD, DIN: DIN,
    mulberry32: mulberry32, gauss: gauss,
    SHAPES: SHAPES, standardize: standardize, makeSDE: makeSDE,
    timeEmb: timeEmb, buildInput: buildInput,
    createNet: createNet, copyParams: copyParams, paramSet: paramSet, zeroGrad: zeroGrad,
    forward: forward, backward: backward, makeAdam: makeAdam, adamStep: adamStep,
    scoreAt: scoreAt, noiseAt: noiseAt,
    makeTrainer: makeTrainer, makeForward: makeForward, makeReverse: makeReverse, samplePrior: samplePrior,
    PKEYS: PKEYS
  };
  global.SDE_CORE = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;

  // node 測試時沒有 DOM，核心載完就收工
  if (typeof document === 'undefined') return;

  /* ==========================================================
   *  UI
   * ========================================================== */

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var LS = 'sde.';

  function store(key, val) {
    try {
      if (val === undefined) { var raw = localStorage.getItem(LS + key); return raw === null ? null : JSON.parse(raw); }
      localStorage.setItem(LS + key, JSON.stringify(val));
    } catch (e) { /* 隱私模式：忽略 */ }
    return null;
  }

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = motionQuery.matches;
  function onMotionChange() { reduced = motionQuery.matches; document.documentElement.classList.toggle('reduced', reduced); }
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
  onMotionChange();

  /* ---- 設定表 ---- */
  var SHAPE_LABELS = { moons: '雙月', spiral: '螺旋', gaussians: '四團', letterS: '字母 S', draw: '自己畫' };
  var SDE_CFG = {
    vp: { small: { betaMax: 12 }, mid: { betaMax: 20 }, large: { betaMax: 30 } },
    ve: { small: { sigmaMax: 3 }, mid: { sigmaMax: 5 }, large: { sigmaMax: 8 } }
  };
  var EFFORT = { fast: { steps: 1600 }, std: { steps: 2800 }, fine: { steps: 4200 } };
  var STEPS = { s60: 60, s120: 120, s200: 200 };
  var SPEED = { slow: { per: 1, hold: 3 }, normal: { per: 1, hold: 1 }, fast: { per: 3, hold: 1 } };
  var NPTS = 900;
  function particleCount(v) {
    var base = { few: 260, mid: 460, many: 760 }[v] || 460;
    return window.innerWidth < 560 ? Math.round(base * 0.55) : base;
  }

  /* ---- 全域狀態 ---- */
  var rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  var shapeName = store('shape') || 'moons';
  var sdeType = store('sde') || 'vp';
  var noiseRange = store('noise') || 'mid';
  var effort = store('effort') || 'std';
  var stepsKey = store('steps') || 's120';
  var particlesKey = store('particles') || 'mid';
  var speed = store('speed') || 'normal';
  var genMode = store('genMode') || 'dual';

  var target = null;
  var sde = buildSDE();
  var trainer = null, net = null;
  var training = false, trained = false, stale = false;
  var lossHist = [];
  var runCount = store('runCount') || 0;

  function buildSDE() {
    var extra = SDE_CFG[sdeType][noiseRange] || {};
    return makeSDE(sdeType, extra);
  }
  function nSteps() { return STEPS[stepsKey] || 120; }

  // 前向溶解狀態
  var fwd = null, fwdMaxK = 0, fwdView = 0, fwdPlaying = false, fwdHold = 0, fwdActive = false;
  // 逆向生成狀態
  var sampSde = null, sampOde = null, genMaxK = 0, genView = 0, genActive = false;
  var genPlaying = false, genHold = 0, lastSdeCloud = null, lastOdeCloud = null, prevSdeCloud = null, prevOdeCloud = null;

  // rAF 控制
  var trainRaf = 0, fwdRaf = 0, genRaf = 0;
  var trainVis = true, fwdVis = true, genVis = true;

  // 自己畫
  var drawPts = [], drawing = false;

  var el = {};

  /* ---- 進場 stagger ---- */
  function stagger() {
    $$('[data-stagger]').forEach(function (n, i) {
      n.style.transitionDelay = (reduced ? 0 : Math.min(i * 60, 1150)) + 'ms';
      requestAnimationFrame(function () { n.classList.add('in'); });
    });
  }

  /* ---- sprite 光點 ---- */
  var spriteForm = null, spriteNoise = null, SPR = 26;
  function makeSprite(rgb) {
    var c = document.createElement('canvas'); c.width = c.height = SPR;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    grd.addColorStop(0, 'rgba(' + rgb + ',0.95)');
    grd.addColorStop(0.35, 'rgba(' + rgb + ',0.42)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd; g.fillRect(0, 0, SPR, SPR);
    return c;
  }
  function buildSprites() {
    spriteForm = makeSprite('79,227,193');     // 資料/成形（teal）
    spriteNoise = makeSprite('143,140,249');    // 雜訊（indigo）
  }

  function fitCanvas(cv, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || cv.parentNode.clientWidth;
    var h = cssH || w;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  // 依 SDE 的世界尺度換算：整張圖固定框住 [−ext, ext]
  function extentOf() { return sde.worldExtent(); }
  function viewScale(cv, ext) { return Math.min(cv.width, cv.height) / 2 / ext; }

  // 畫一團點；noiseFrac 0=完全成形(teal) 1=純雜訊(indigo)
  function drawCloud(cv, arr, count, noiseFrac, ext, dotScale) {
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter';
    var vs = viewScale(cv, ext), cx = cv.width / 2, cy = cv.height / 2;
    var sz = SPR * (dotScale || 1) * Math.min(cv.width, cv.height) / 360;
    var aForm = (1 - noiseFrac), aNoise = noiseFrac, half = sz / 2, i, px, py;
    if (aForm > 0.01) {
      ctx.globalAlpha = 0.82 * aForm;
      for (i = 0; i < count; i++) { px = cx + arr[i * 2] * vs; py = cy - arr[i * 2 + 1] * vs; ctx.drawImage(spriteForm, px - half, py - half, sz, sz); }
    }
    if (aNoise > 0.01) {
      ctx.globalAlpha = 0.82 * aNoise;
      for (i = 0; i < count; i++) { px = cx + arr[i * 2] * vs; py = cy - arr[i * 2 + 1] * vs; ctx.drawImage(spriteNoise, px - half, py - half, sz, sz); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // 疊畫 tracer 軌跡（stochastic：抖；deterministic：平滑），trailUpTo = 只畫到第幾點
  function drawTrails(cv, trails, ext, rgb, upTo) {
    if (!trails || !trails.length) return;
    var ctx = cv.getContext('2d');
    var vs = viewScale(cv, ext), cx = cv.width / 2, cy = cv.height / 2, dpr = window.devicePixelRatio || 1;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var q = 0; q < trails.length; q++) {
      var path = trails[q], lim = Math.min(upTo == null ? path.length : upTo, path.length);
      if (lim < 2) continue;
      ctx.beginPath();
      for (var i = 0; i < lim; i++) {
        var px = cx + path[i][0] * vs, py = cy - path[i][1] * vs;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(' + rgb + ',0.5)'; ctx.lineWidth = 1.4 * dpr; ctx.stroke();
      // 頭端亮點
      var hx = cx + path[lim - 1][0] * vs, hy = cy - path[lim - 1][1] * vs;
      ctx.beginPath(); ctx.arc(hx, hy, 3.1 * dpr, 0, TAU);
      ctx.fillStyle = 'rgba(' + rgb + ',0.95)'; ctx.fill();
    }
  }

  /* ---- 目標分布預覽 ---- */
  function drawTargetPreview() {
    var cv = el.targetCv; fitCanvas(cv);
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    var arr, count, i;
    if (shapeName === 'draw') {
      if (drawPts.length < 12) { drawDrawHint(); return; }
      arr = new Float64Array(drawPts.length * 2);
      for (i = 0; i < drawPts.length; i++) { arr[i * 2] = drawPts[i][0]; arr[i * 2 + 1] = drawPts[i][1]; }
      count = drawPts.length;
    } else { if (!target) return; arr = target.pts; count = target.n; }
    ctx.globalCompositeOperation = 'lighter';
    var vs = viewScale(cv, 3.4), cx = cv.width / 2, cy = cv.height / 2;
    var sz = SPR * 0.7 * Math.min(cv.width, cv.height) / 360, half = sz / 2;
    ctx.globalAlpha = 0.8;
    for (i = 0; i < count; i++) ctx.drawImage(spriteForm, cx + arr[i * 2] * vs - half, cy - arr[i * 2 + 1] * vs - half, sz, sz);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawDrawHint() {
    var cv = el.targetCv, ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(143,140,249,.55)';
    ctx.font = (13 * (Math.min(window.devicePixelRatio || 1, 2))) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('在這裡用滑鼠或手指塗出一團點', cv.width / 2, cv.height / 2);
  }

  /* ---- 學習曲線 ---- */
  function drawCurve() {
    var cv = el.curve; fitCanvas(cv, cv.clientHeight);
    var ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    var dpr = window.devicePixelRatio || 1, pad = 8 * dpr, gw = w - pad * 2, gh = h - pad * 2;
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (var r = 0; r <= 4; r++) { var gy = pad + gh * r / 4; ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(w - pad, gy); ctx.stroke(); }
    if (lossHist.length > 1) {
      var n = lossHist.length - 1;
      var grd = ctx.createLinearGradient(pad, 0, w - pad, 0);
      grd.addColorStop(0, '#8f8cf9'); grd.addColorStop(1, '#4fe3c1');
      ctx.beginPath(); ctx.strokeStyle = grd; ctx.lineWidth = 2 * dpr; ctx.lineJoin = 'round';
      for (var k = 0; k < lossHist.length; k++) {
        var lx = pad + gw * (k / n);
        var ly = pad + gh * Math.min(1, lossHist[k] / 1.1);   // loss 高度：0=底、~1.1=頂
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

  /* ---- 目標分布 ---- */
  function hashName(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; }
  function rebuildTarget() {
    if (shapeName === 'draw') target = drawPts.length >= 12 ? standardize(drawPts) : null;
    else target = standardize(SHAPES[shapeName](mulberry32(0x51ee + hashName(shapeName)), NPTS));
    drawTargetPreview();
  }

  function markStale(why) {
    stale = true;
    // 前向溶解不需要訓練，但需要跟著新 SDE 設定重算
    resetForward();
    resetGen();
    if (trained) {
      el.trainStatus.textContent = why + ' 分數網路要重新訓練，才能反映新設定。';
      lockGen();
    }
  }
  function lockGen() {
    el.genCard.classList.add('locked'); el.genCard.classList.remove('unlocked');
    el.genPlay.disabled = true; el.genScrub.disabled = true; el.genReplay.disabled = true; el.genRerun.disabled = true;
  }
  function unlockGen() {
    el.genCard.classList.remove('locked'); el.genCard.classList.add('unlocked');
    el.genPlay.disabled = false;
  }

  /* ---- rAF 迴圈把關 ---- */
  function canTrain() { return training && trainer && trainer.done < trainer.total && !document.hidden && trainVis; }
  function canFwd() { return fwdPlaying && fwdActive && fwd && !document.hidden && fwdVis; }
  function canGen() { return genPlaying && genActive && !document.hidden && genVis; }
  function syncLoops() {
    if (canTrain()) { if (!trainRaf) trainRaf = requestAnimationFrame(trainFrame); }
    else if (trainRaf) { cancelAnimationFrame(trainRaf); trainRaf = 0; }
    if (canFwd()) { if (!fwdRaf) fwdRaf = requestAnimationFrame(fwdFrame); }
    else if (fwdRaf) { cancelAnimationFrame(fwdRaf); fwdRaf = 0; }
    if (canGen()) { if (!genRaf) genRaf = requestAnimationFrame(genFrame); }
    else if (genRaf) { cancelAnimationFrame(genRaf); genRaf = 0; }
  }

  /* ======================= 訓練 ======================= */
  function startTraining() {
    if (training) return;
    fwdPlaying = false; genPlaying = false;
    sde = buildSDE();
    if (shapeName === 'draw' && (!target || target.n < 40)) {
      el.trainStatus.textContent = '請先在上面塗出至少一小團點（越多越好），再開始訓練。';
      return;
    }
    if (!target) rebuildTarget();
    lossHist = [];
    trainer = makeTrainer({
      H: 64, sde: sde, data: target, rng: rng, netRng: mulberry32((rng() * 1e9) | 0),
      batch: 128, jitter: 0.01, emaDecay: 0.995, totalSteps: EFFORT[effort].steps, lr: 0.003
    });
    net = trainer.ema;
    training = true; trained = false; stale = false;
    el.trainBtn.disabled = true; el.trainBtn.textContent = '訓練中…';
    lockGen();
    el.trainStatus.textContent = '正在做 denoising score matching：每步一個 128 點 minibatch，網路學著預測「被加進去的雜訊」。';
    document.documentElement.classList.add('busy');
    resetForward(); resetGen();
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
    tweenNum(el.statLoss, trainer.lossEMA * 1.3, trainer.lossEMA, function (v) { return v.toFixed(3); }, 500);
    el.trainStatus.textContent = '訓練完成：分數網路已經學會在每個時刻該把點往哪裡推（∇log pₜ）。'
      + '到下面先看資料怎麼溶成雜訊，再看雜訊怎麼長回來。';
    unlockGen();
    drawCurve();
    document.documentElement.classList.remove('busy');
    if (!reduced) el.fwdCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ======================= 前向 SDE 溶解 ======================= */
  function pickData(M) {
    if (!target) rebuildTarget();
    var X = new Float64Array(M * 2);
    for (var m = 0; m < M; m++) { var idx = (rng() * target.n) | 0; X[m * 2] = target.pts[idx * 2]; X[m * 2 + 1] = target.pts[idx * 2 + 1]; }
    return X;
  }
  function resetForward() {
    fwd = null; fwdActive = false; fwdPlaying = false; fwdMaxK = 0; fwdView = 0;
    if (el.fwdScrub) { el.fwdScrub.value = '0'; el.fwdScrub.disabled = true; }
    if (el.fwdPlay) el.fwdPlay.textContent = '▶ 溶解';
  }
  function startForward() {
    if (shapeName === 'draw' && (!target || target.n < 40)) {
      fwdActive = false;
      el.fwdLive.textContent = '請先在步驟 01 的畫布上塗出一團點，再回來看它怎麼溶解。';
      return;
    }
    sde = buildSDE();
    var N = nSteps(), M = particleCount(particlesKey);
    fwd = makeForward(sde, pickData(M), N, mulberry32((rng() * 1e9) | 0));
    fwdActive = true; fwdMaxK = 0; fwdView = 0;
    el.fwdScrub.max = String(N); el.fwdScrub.value = '0'; el.fwdScrub.disabled = false;
    fitCanvas(el.fwdCv, el.fwdCv.clientWidth);
    if (reduced) { fwd.runAll(); fwdMaxK = N; fwdView = N; el.fwdScrub.value = String(N); renderForward(N); announceFwd(N, true); el.fwdPlay.textContent = '▶ 重新溶解'; return; }
    fwdHold = 0; fwdPlaying = true; el.fwdPlay.textContent = '⏸ 暫停';
    renderForward(0); announceFwd(0, false); syncLoops();
  }
  function fwdFrame() {
    fwdRaf = 0;
    if (!canFwd()) return;
    var conf = SPEED[speed]; fwdHold++;
    if (fwdHold >= conf.hold) { fwdHold = 0; for (var k = 0; k < conf.per && !fwd.done; k++) fwd.next(); fwdMaxK = fwd.k; fwdView = fwd.k; el.fwdScrub.value = String(fwdView); }
    renderForward(fwdView); announceFwd(fwdView, false);
    if (fwd.done) { fwdPlaying = false; el.fwdPlay.textContent = '▶ 重新溶解'; announceFwd(nSteps(), true); return; }
    fwdRaf = requestAnimationFrame(fwdFrame);
  }
  function renderForward(k) {
    if (!fwdActive) return;
    var N = fwd.N, arr = fwd.levels[k] || fwd.levels[fwdMaxK];
    var nf = k / N;
    drawCloud(el.fwdCv, arr, fwd.M, nf, extentOf(), 1);
    var t = (sde.eps + (1 - sde.eps) * k / N);
    el.fwdT.textContent = 't = ' + t.toFixed(2);
    el.fwdPct.textContent = Math.round(nf * 100) + '%';
  }
  var lastFwdAnn = 0;
  function announceFwd(k, force) {
    var now = performance.now(); if (!force && now - lastFwdAnn < 380) return; lastFwdAnn = now;
    if (k >= fwd.N) el.fwdLive.textContent = '前向 SDE 完成：「' + SHAPE_LABELS[shapeName] + '」已經在連續時間裡溶成一團'
      + (sdeType === 've' ? '爆開的' : '') + '高斯雜訊。';
    else el.fwdLive.textContent = '前向 SDE 積分中，t=' + (sde.eps + (1 - sde.eps) * k / fwd.N).toFixed(2) + '，雜訊比例 ' + Math.round(k / fwd.N * 100) + '%。';
  }

  /* ======================= 逆向生成：逆 SDE / 機率流 ODE / 對照 ======================= */
  function resetGen() {
    sampSde = null; sampOde = null; genActive = false; genPlaying = false; genMaxK = 0; genView = 0;
    if (el.genScrub) { el.genScrub.value = String(nSteps()); el.genScrub.disabled = true; }
    if (el.genPlay) el.genPlay.textContent = '▶ 生成';
    if (el.genReplay) el.genReplay.disabled = true;
    if (el.genRerun) el.genRerun.disabled = true;
  }
  function needSde() { return genMode === 'sde' || genMode === 'dual'; }
  function needOde() { return genMode === 'ode' || genMode === 'dual'; }
  function startGen() {
    if (!trained || training) return;
    sde = buildSDE();
    var N = nSteps(), M = particleCount(particlesKey);
    var X0 = samplePrior(sde, M, mulberry32((rng() * 1e9) | 0));   // 同一組起點
    var trN = reduced ? 0 : 3;
    sampSde = makeReverse(net, sde, { M: M, N: N, mode: 'sde', X0: X0, tracers: trN, rng: mulberry32((rng() * 1e9) | 0) });
    sampOde = makeReverse(net, sde, { M: M, N: N, mode: 'ode', X0: X0, tracers: trN });
    genActive = true; genMaxK = N; genView = N;
    runCount++; store('runCount', runCount); el.runCount.textContent = String(runCount);
    el.genScrub.max = String(N); el.genScrub.value = String(N); el.genScrub.disabled = false;
    el.genReplay.disabled = false; el.genRerun.disabled = false;
    layoutGen(); fitGenCanvases();
    if (reduced) {
      sampSde.runAll(); sampOde.runAll(); genMaxK = 0; genView = 0;
      el.genScrub.value = '0'; renderGen(0); afterGenComplete(); announceGen(0, true); el.genPlay.textContent = '▶ 重新生成';
      return;
    }
    genHold = 0; genPlaying = true; el.genPlay.textContent = '⏸ 暫停';
    renderGen(N); announceGen(N, false); syncLoops();
  }
  function genFrame() {
    genRaf = 0;
    if (!canGen()) return;
    var conf = SPEED[speed]; genHold++;
    if (genHold >= conf.hold) {
      genHold = 0;
      for (var k = 0; k < conf.per; k++) {
        if (sampSde && !sampSde.done) sampSde.next();
        if (sampOde && !sampOde.done) sampOde.next();
      }
      genMaxK = sampSde ? sampSde.k : (sampOde ? sampOde.k : 0);
      genView = genMaxK; el.genScrub.value = String(genView);
    }
    renderGen(genView); announceGen(genView, false);
    var done = (!sampSde || sampSde.done) && (!sampOde || sampOde.done);
    if (done) { genPlaying = false; el.genPlay.textContent = '▶ 重新生成'; afterGenComplete(); announceGen(0, true); return; }
    genRaf = requestAnimationFrame(genFrame);
  }
  function renderGen(k) {
    if (!genActive) return;
    var N = sampSde ? sampSde.N : sampOde.N, ext = extentOf(), nf = k / N;
    var trailUpTo = (N - k) + 1;
    if (needSde() && sampSde) {
      var a = sampSde.levels[k] || sampSde.levels[genMaxK];
      drawCloud(el.sdeCv, a, sampSde.M, nf, ext, 1);
      drawTrails(el.sdeCv, sampSde.trails, ext, '255,134,172', trailUpTo);
    }
    if (needOde() && sampOde) {
      var b = sampOde.levels[k] || sampOde.levels[genMaxK];
      drawCloud(el.odeCv, b, sampOde.M, nf, ext, 1);
      drawTrails(el.odeCv, sampOde.trails, ext, '255,198,92', trailUpTo);
    }
    var t = (sde.eps + (1 - sde.eps) * k / N);
    el.genT.textContent = 't = ' + t.toFixed(2);
    el.genPct.textContent = Math.round((1 - nf) * 100) + '%';
  }
  function meanNN(a, b, M) {         // 從 a 每點到 b 的最近鄰距離平均（估分布接近度）
    var s = 0;
    for (var i = 0; i < M; i++) {
      var ax = a[i * 2], ay = a[i * 2 + 1], best = Infinity;
      for (var j = 0; j < M; j++) { var dx = ax - b[j * 2], dy = ay - b[j * 2 + 1], d = dx * dx + dy * dy; if (d < best) best = d; }
      s += Math.sqrt(best);
    }
    return s / M;
  }
  function afterGenComplete() {
    // 記錄本次與上一次的雲，做「ODE 可重現、SDE 有隨機性」的量化提示
    prevSdeCloud = lastSdeCloud; prevOdeCloud = lastOdeCloud;
    lastSdeCloud = sampSde ? Float32Array.from(sampSde.levels[0]) : null;
    lastOdeCloud = sampOde ? Float32Array.from(sampOde.levels[0]) : null;
    var msg = '';
    if (genMode === 'dual' && lastSdeCloud && lastOdeCloud) {
      var M = Math.min(sampSde.M, 200);
      var d = meanNN(lastSdeCloud, lastOdeCloud, M);
      msg = '兩邊都收斂回同一個分布：逆 SDE 與機率流 ODE 的成品，平均最近鄰距離只差 '
        + d.toFixed(3) + '（同一座山、兩條路）。ODE 是確定性的——同一顆種子再跑一次，會落在完全一樣的位置。';
    } else if (genMode === 'ode') {
      msg = '機率流 ODE 是確定性的：沒有隨機項，同一組起點每次都走出一模一樣、平滑的路徑，可用來做精確似然與可逆的 latent。';
    } else {
      msg = '逆時間 SDE 帶著隨機項：路徑會抖、每次結果略有不同，但分布收斂到同一個資料分布。';
    }
    el.reproNote.textContent = msg;
  }
  var lastGenAnn = 0;
  function announceGen(k, force) {
    var now = performance.now(); if (!force && now - lastGenAnn < 380) return; lastGenAnn = now;
    var N = sampSde ? sampSde.N : sampOde.N;
    if (k <= 0) el.genLive.textContent = '生成完成：純雜訊在 ' + N + ' 步逆向積分後，長回了「' + SHAPE_LABELS[shapeName] + '」。';
    else el.genLive.textContent = '逆向積分中，第 ' + (N - k) + ' / ' + N + ' 步，t=' + (sde.eps + (1 - sde.eps) * k / N).toFixed(2) + '。';
  }
  function layoutGen() {
    var dual = genMode === 'dual';
    el.sdeCol.hidden = !(needSde());
    el.odeCol.hidden = !(needOde());
    el.genView.classList.toggle('single', !dual);
  }
  function fitGenCanvases() {
    if (needSde()) fitCanvas(el.sdeCv, el.sdeCv.clientWidth);
    if (needOde()) fitCanvas(el.odeCv, el.odeCv.clientWidth);
  }

  function togglePlayGen() {
    if (!genActive) { startGen(); return; }
    if (genMaxK <= 0 && genView <= 0) { startGen(); return; }
    genPlaying = !genPlaying;
    el.genPlay.textContent = genPlaying ? '⏸ 暫停' : '▶ 播放';
    syncLoops();
  }
  function replayGen() {
    if (!genActive) return;
    if (sampSde && !sampSde.done) sampSde.runAll();
    if (sampOde && !sampOde.done) sampOde.runAll();
    genMaxK = 0; afterGenComplete();
    // 從頭重播（用已算好的 levels）
    genView = nSteps(); genHold = 0; genPlaying = false;
    el.genScrub.value = String(genView); renderGen(genView);
    replayTick();
  }
  var replayRaf2 = 0, replayK = 0;
  function replayTick() {
    if (replayRaf2) cancelAnimationFrame(replayRaf2);
    replayK = nSteps();
    (function loop() {
      if (document.hidden || !genVis) { replayRaf2 = 0; return; }
      var conf = SPEED[speed];
      replayK = Math.max(0, replayK - conf.per);
      genView = replayK; el.genScrub.value = String(replayK);
      renderGen(replayK); announceGen(replayK, replayK === 0);
      if (replayK <= 0) { replayRaf2 = 0; return; }
      replayRaf2 = requestAnimationFrame(loop);
    })();
  }

  /* ---- 自己畫 ---- */
  function drawCanvasPos(evt) {
    var cv = el.targetCv, r = cv.getBoundingClientRect();
    var pt = evt.touches ? evt.touches[0] : evt;
    var vs = viewScale(cv, 3.4), dpr = cv.width / r.width;
    var x = (pt.clientX - r.left) * dpr, y = (pt.clientY - r.top) * dpr;
    return [(x - cv.width / 2) / vs, -(y - cv.height / 2) / vs];
  }
  function addBrush(p) {
    for (var k = 0; k < 3; k++) drawPts.push([p[0] + gauss(rng) * 0.12, p[1] + gauss(rng) * 0.12]);
    if (drawPts.length > 1400) drawPts.splice(0, drawPts.length - 1400);
    rebuildTarget();
    markStale('你改了「自己畫」的點，');
  }

  /* ---- 分段控制 ---- */
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
      'shapeSeg', 'sdeSeg', 'noiseSeg', 'effortSeg', 'drawTools', 'clearDraw',
      'fwdCard', 'fwdCv', 'fwdPlay', 'fwdScrub', 'fwdT', 'fwdPct', 'fwdLive', 'stepsSeg', 'speedSeg',
      'genCard', 'genModeSeg', 'particleSeg', 'genView', 'sdeCol', 'odeCol', 'sdeCv', 'odeCv',
      'genPlay', 'genScrub', 'genReplay', 'genRerun', 'genT', 'genPct', 'genLive', 'reproNote', 'runCount'
    ].forEach(function (id) { el[id] = $(id); });

    buildSprites();
    el.runCount.textContent = String(runCount);

    segClick(el.shapeSeg, shapeName, function (v) {
      shapeName = v; store('shape', v);
      el.drawTools.hidden = v !== 'draw';
      el.targetCv.classList.toggle('drawable', v === 'draw');
      if (v !== 'draw') drawPts = [];
      rebuildTarget(); markStale('你換了目標分布，');
    });
    segClick(el.sdeSeg, sdeType, function (v) { sdeType = v; store('sde', v); sde = buildSDE(); markStale('你換了 SDE 類型，'); });
    segClick(el.noiseSeg, noiseRange, function (v) { noiseRange = v; store('noise', v); sde = buildSDE(); markStale('你改了噪聲範圍，'); });
    segClick(el.effortSeg, effort, function (v) { effort = v; store('effort', v); el.statStep.textContent = '0 / ' + EFFORT[effort].steps; markStale('你改了訓練程度，'); });
    segClick(el.stepsSeg, stepsKey, function (v) { stepsKey = v; store('steps', v); resetForward(); resetGen(); });
    segClick(el.particleSeg, particlesKey, function (v) { particlesKey = v; store('particles', v); resetForward(); resetGen(); });
    segClick(el.speedSeg, speed, function (v) { speed = v; store('speed', v); });
    segClick(el.genModeSeg, genMode, function (v) { genMode = v; store('genMode', v); resetGen(); layoutGen(); });

    el.trainBtn.addEventListener('click', startTraining);
    el.fwdPlay.addEventListener('click', function () {
      if (!fwdActive || fwd.done) { startForward(); return; }
      fwdPlaying = !fwdPlaying; el.fwdPlay.textContent = fwdPlaying ? '⏸ 暫停' : '▶ 溶解'; syncLoops();
    });
    el.fwdScrub.addEventListener('input', function () {
      if (!fwdActive) return; fwdPlaying = false; el.fwdPlay.textContent = '▶ 溶解';
      var v = parseInt(el.fwdScrub.value, 10); if (v > fwdMaxK) { v = fwdMaxK; el.fwdScrub.value = String(v); }
      fwdView = v; renderForward(v); announceFwd(v, v >= fwd.N); syncLoops();
    });

    el.genPlay.addEventListener('click', togglePlayGen);
    el.genRerun.addEventListener('click', startGen);
    el.genReplay.addEventListener('click', replayGen);
    el.genScrub.addEventListener('input', function () {
      if (!genActive) return; genPlaying = false; el.genPlay.textContent = '▶ 播放';
      if (replayRaf2) { cancelAnimationFrame(replayRaf2); replayRaf2 = 0; }
      var v = parseInt(el.genScrub.value, 10); if (v < genMaxK) { v = genMaxK; el.genScrub.value = String(v); }
      genView = v; renderGen(v); announceGen(v, v <= 0); syncLoops();
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
    lockGen(); layoutGen();

    document.addEventListener('visibilitychange', syncLoops);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { es.forEach(function (en) { trainVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe($('trainCard'));
      new IntersectionObserver(function (es) { es.forEach(function (en) { fwdVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe(el.fwdCard);
      new IntersectionObserver(function (es) { es.forEach(function (en) { genVis = en.isIntersecting; }); syncLoops(); }, { threshold: 0 }).observe(el.genCard);
    }

    var resizePending = false;
    window.addEventListener('resize', function () {
      if (resizePending) return; resizePending = true;
      requestAnimationFrame(function () {
        resizePending = false;
        drawTargetPreview(); drawCurve();
        if (fwdActive) { fitCanvas(el.fwdCv, el.fwdCv.clientWidth); renderForward(fwdView); }
        if (genActive) { fitGenCanvases(); renderGen(genView); }
      });
    });

    rebuildTarget();
    drawCurve();
    stagger();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);

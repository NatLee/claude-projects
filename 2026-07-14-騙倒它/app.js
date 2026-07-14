/* 騙倒它 — 在瀏覽器裡訓練一個真的神經網路，再用真的梯度騙倒它。
 * 零外部資源：資料是程序化生成的，網路是純 JS 寫的，梯度是自己算的。
 * 核心（CORE）不碰 DOM，可以在 node 裡直接 require 進來做測試。
 */
(function (global) {
  'use strict';

  /* ==========================================================
   *  CORE：合成資料 / MLP / 反向傳播 / FGSM / PGD
   * ========================================================== */

  var S = 16;              // 影像邊長
  var DIM = S * S;         // 256 個輸入
  var NC = 3;              // 三類：圓 / 方 / 三角
  var H = 64;              // 隱藏層寬度  →  256 → 64 → 3
  var TAU = Math.PI * 2;
  var LABELS = ['圓形', '方形', '三角形'];

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

  // 隨機的形狀參數：位置、大小（三類面積相同，逼模型看「形狀」而不是「亮度」）、
  // 旋轉、前景/背景亮度、雜訊強度。
  function makeParams(rng, cls) {
    return {
      cls: cls,
      cx: S / 2 + (rng() * 2 - 1) * 1.6,
      cy: S / 2 + (rng() * 2 - 1) * 1.6,
      area: 40 + rng() * 46,
      rot: rng() * TAU,
      fg: 0.74 + rng() * 0.26,
      bg: rng() * 0.14,
      sigma: 0.03 + rng() * 0.05
    };
  }

  function insideFactory(p) {
    var c = Math.cos(-p.rot), s = Math.sin(-p.rot);
    if (p.cls === 0) {                       // 圓：半徑由面積推回來
      var r2 = p.area / Math.PI;
      return function (x, y) {
        var dx = x - p.cx, dy = y - p.cy;
        return dx * dx + dy * dy <= r2;
      };
    }
    if (p.cls === 1) {                       // 方：邊長 = √面積
      var h = Math.sqrt(p.area) / 2;
      return function (x, y) {
        var dx = x - p.cx, dy = y - p.cy;
        var u = dx * c - dy * s, v = dx * s + dy * c;
        return Math.abs(u) <= h && Math.abs(v) <= h;
      };
    }
    // 正三角形：面積 = (3√3/4)R² → R；內切圓半徑 = R/2，三條邊用半平面判斷
    var R = Math.sqrt(4 * p.area / (3 * Math.sqrt(3)));
    var inr = R / 2;
    var n = [150, 270, 30].map(function (d) {
      return [Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180)];
    });
    return function (x, y) {
      var dx = x - p.cx, dy = y - p.cy;
      var u = dx * c - dy * s, v = dx * s + dy * c;
      for (var i = 0; i < 3; i++) if (u * n[i][0] + v * n[i][1] > inr) return false;
      return true;
    };
  }

  // 3×3 超取樣做抗鋸齒 → 灰階邊緣，梯度才有意義
  function render(p, rng) {
    var img = new Float32Array(DIM);
    var inside = insideFactory(p);
    var SS = 3;
    for (var py = 0; py < S; py++) {
      for (var px = 0; px < S; px++) {
        var cov = 0;
        for (var sy = 0; sy < SS; sy++) {
          for (var sx = 0; sx < SS; sx++) {
            if (inside(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)) cov++;
          }
        }
        cov /= SS * SS;
        var val = p.bg + (p.fg - p.bg) * cov;
        if (rng) val += gauss(rng) * p.sigma;
        img[py * S + px] = val < 0 ? 0 : (val > 1 ? 1 : val);
      }
    }
    return img;
  }

  function sample(rng, cls) {
    var c = (cls === undefined || cls === null) ? (rng() * NC) | 0 : cls;
    var p = makeParams(rng, c);
    return { x: render(p, rng), y: c, p: p };
  }
  function makeSet(rng, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(sample(rng, i % NC));  // 三類均衡
    return out;
  }

  /* ---- 網路 ---- */
  function blank() {
    return {
      W1: new Float64Array(H * DIM), b1: new Float64Array(H),
      W2: new Float64Array(NC * H), b2: new Float64Array(NC)
    };
  }
  function createNet(rng) {
    var net = blank();
    var s1 = Math.sqrt(2 / DIM), s2 = Math.sqrt(2 / H);   // He 初始化
    for (var i = 0; i < net.W1.length; i++) net.W1[i] = gauss(rng) * s1;
    for (var j = 0; j < net.W2.length; j++) net.W2[j] = gauss(rng) * s2;
    net.m = blank(); net.v = blank(); net.t = 0;          // Adam 狀態
    return net;
  }

  // z1 = W1·x + b1 ; a1 = relu(z1) ; z2 = W2·a1 + b2 ; p = softmax(z2)
  function forward(net, x) {
    var z1 = new Float64Array(H), a1 = new Float64Array(H), z2 = new Float64Array(NC);
    var h, i, c, s, off;
    for (h = 0; h < H; h++) {
      s = net.b1[h]; off = h * DIM;
      for (i = 0; i < DIM; i++) s += net.W1[off + i] * x[i];
      z1[h] = s; a1[h] = s > 0 ? s : 0;
    }
    var mx = -Infinity;
    for (c = 0; c < NC; c++) {
      s = net.b2[c]; off = c * H;
      for (h = 0; h < H; h++) s += net.W2[off + h] * a1[h];
      z2[c] = s; if (s > mx) mx = s;
    }
    var p = new Float64Array(NC), sum = 0;
    for (c = 0; c < NC; c++) { p[c] = Math.exp(z2[c] - mx); sum += p[c]; }
    for (c = 0; c < NC; c++) p[c] /= sum;
    return { z1: z1, a1: a1, z2: z2, p: p };
  }

  // 交叉熵對每個參數、以及對「輸入像素」的梯度。dx 就是 FGSM 要用的 ∂J/∂x。
  function backward(net, x, y, g, f, wantDx) {
    var c, h, i, off;
    var dz2 = new Float64Array(NC);
    for (c = 0; c < NC; c++) dz2[c] = f.p[c] - (c === y ? 1 : 0);
    var da1 = new Float64Array(H);
    for (c = 0; c < NC; c++) {
      off = c * H;
      if (g) g.b2[c] += dz2[c];
      for (h = 0; h < H; h++) {
        if (g) g.W2[off + h] += dz2[c] * f.a1[h];
        da1[h] += net.W2[off + h] * dz2[c];
      }
    }
    var dz1 = new Float64Array(H);
    for (h = 0; h < H; h++) dz1[h] = f.z1[h] > 0 ? da1[h] : 0;   // ReLU 的導數
    if (g) {
      for (h = 0; h < H; h++) {
        var d = dz1[h];
        g.b1[h] += d;
        if (d === 0) continue;
        off = h * DIM;
        for (i = 0; i < DIM; i++) g.W1[off + i] += d * x[i];
      }
    }
    var dx = null;
    if (wantDx) {
      dx = new Float64Array(DIM);
      for (h = 0; h < H; h++) {
        var dh = dz1[h];
        if (dh === 0) continue;
        off = h * DIM;
        for (i = 0; i < DIM; i++) dx[i] += net.W1[off + i] * dh;
      }
    }
    return dx;
  }

  function loss(f, y) { return -Math.log(Math.max(1e-15, f.p[y])); }
  function argmax(p) { var a = 0; for (var c = 1; c < NC; c++) if (p[c] > p[a]) a = c; return a; }

  function adam(net, g, n, lr) {
    net.t++;
    var b1 = 0.9, b2 = 0.999, eps = 1e-8;
    var c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
    var keys = ['W1', 'b1', 'W2', 'b2'];
    for (var k = 0; k < 4; k++) {
      var key = keys[k], P = net[key], G = g[key], M = net.m[key], V = net.v[key];
      for (var i = 0; i < P.length; i++) {
        var gi = G[i] / n;
        M[i] = b1 * M[i] + (1 - b1) * gi;
        V[i] = b2 * V[i] + (1 - b2) * gi * gi;
        P[i] -= lr * (M[i] / c1) / (Math.sqrt(V[i] / c2) + eps);
      }
    }
  }

  function trainBatch(net, data, idx, start, bs, lr) {
    var g = blank(), L = 0, n = 0;
    for (var k = start; k < start + bs && k < idx.length; k++) {
      var s = data[idx[k]];
      var f = forward(net, s.x);
      L += loss(f, s.y);
      backward(net, s.x, s.y, g, f, false);
      n++;
    }
    if (!n) return 0;
    adam(net, g, n, lr);
    return L / n;
  }
  function accuracy(net, set, limit) {
    var n = limit ? Math.min(limit, set.length) : set.length, ok = 0;
    for (var i = 0; i < n; i++) if (argmax(forward(net, set[i].x).p) === set[i].y) ok++;
    return ok / n;
  }

  /* ---- 攻擊 ---- */
  // FGSM：x_adv = clip( x + ε · sign(∇ₓ J(θ, x, y)) )   —— Goodfellow et al. 2014
  function fgsm(net, x, y, eps) {
    var f = forward(net, x);
    var dx = backward(net, x, y, null, f, true);
    var adv = new Float32Array(DIM);
    for (var i = 0; i < DIM; i++) {
      var v = x[i] + eps * Math.sign(dx[i]);
      adv[i] = v < 0 ? 0 : (v > 1 ? 1 : v);
    }
    return adv;
  }
  // 目標式 PGD：往「目標類別的 loss 變小」的方向走，每步投影回 x₀ 的 L∞ ε 球內
  function pgdTargeted(net, x0, target, eps, steps, alpha) {
    var x = Float32Array.from(x0);
    for (var s = 0; s < steps; s++) {
      var f = forward(net, x);
      var dx = backward(net, x, target, null, f, true);
      for (var i = 0; i < DIM; i++) {
        var v = x[i] - alpha * Math.sign(dx[i]);
        var lo = x0[i] - eps, hi = x0[i] + eps;
        if (v < lo) v = lo; else if (v > hi) v = hi;
        x[i] = v < 0 ? 0 : (v > 1 ? 1 : v);
      }
    }
    return x;
  }
  // 找出這張圖「最小需要多大的 ε」才會翻
  function minFlipEps(net, x, y, hi, step) {
    for (var e = step; e <= hi + 1e-9; e += step) {
      if (argmax(forward(net, fgsm(net, x, y, e)).p) !== y) return e;
    }
    return null;
  }

  var CORE = {
    S: S, DIM: DIM, NC: NC, H: H, LABELS: LABELS,
    mulberry32: mulberry32, makeParams: makeParams, render: render,
    sample: sample, makeSet: makeSet,
    createNet: createNet, forward: forward, backward: backward, blank: blank,
    loss: loss, argmax: argmax, adam: adam, trainBatch: trainBatch, accuracy: accuracy,
    fgsm: fgsm, pgdTargeted: pgdTargeted, minFlipEps: minFlipEps
  };
  global.ADVX_CORE = CORE;
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;

  // node 測試時沒有 DOM，核心載完就收工
  if (typeof document === 'undefined') return;

  /* ==========================================================
   *  UI
   * ========================================================== */

  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  var LS = 'advx.';

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = motionQuery.matches;
  function onMotionChange() {
    reduced = motionQuery.matches;
    document.documentElement.classList.toggle('reduced', reduced);
  }
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
  onMotionChange();

  function store(key, val) {
    try {
      if (val === undefined) {
        var raw = localStorage.getItem(LS + key);
        return raw === null ? null : JSON.parse(raw);
      }
      localStorage.setItem(LS + key, JSON.stringify(val));
    } catch (e) { /* 隱私模式：忽略 */ }
    return null;
  }

  /* ---- 畫圖 ---- */
  function paint(canvas, img) {           // 16×16 灰階
    var ctx = canvas.getContext('2d');
    var d = ctx.createImageData(S, S);
    for (var i = 0; i < DIM; i++) {
      var v = Math.round(Math.max(0, Math.min(1, img[i])) * 255);
      d.data[i * 4] = v; d.data[i * 4 + 1] = v; d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
  }
  function paintDelta(canvas, a, b) {     // 擾動視覺化：正向偏紅、負向偏青，放大到滿格
    var ctx = canvas.getContext('2d');
    var d = ctx.createImageData(S, S);
    var mx = 1e-6, i;
    for (i = 0; i < DIM; i++) mx = Math.max(mx, Math.abs(a[i] - b[i]));
    for (i = 0; i < DIM; i++) {
      var t = (a[i] - b[i]) / mx;         // -1 .. 1
      var r, g, bl;
      if (t > 0) { r = 24 + t * 231; g = 26 + t * 51; bl = 38 + t * 71; }
      else { var u = -t; r = 24 + u * 53; g = 26 + u * 181; bl = 38 + u * 170; }
      d.data[i * 4] = r; d.data[i * 4 + 1] = g; d.data[i * 4 + 2] = bl; d.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    return mx;
  }

  /* ---- 狀態 ---- */
  var rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  var trainSet = null, testSet = null, net = null;
  var order = [], BS = 24, LR = 0.006, EPOCHS = 14;
  var cursor = 0, epoch = 0, batches = 0, totalBatches = 0;
  var lossHist = [], accHist = [], curLoss = 0, testAcc = 0;
  var training = false, trained = false, rafId = 0, pausedByVis = false;
  var current = null, advImg = null, eps = store('eps') || 0.08;
  var scanning = false, scanRaf = 0;
  var foolCount = store('foolCount') || 0;
  var lastFlipKey = '';
  var draw = { img: new Float32Array(DIM), down: false, adv: null };

  var el = {};
  ['trainBtn', 'resetBtn', 'curve', 'statEpoch', 'statLoss', 'statAcc', 'trainBar',
    'samples', 'attackCard', 'origCanvas', 'noiseCanvas', 'advCanvas', 'epsRange',
    'epsVal', 'epsLevels', 'nextBtn', 'scanBtn', 'barsOrig', 'barsAdv', 'flipBadge',
    'attackLive', 'targetSel', 'pgdBtn', 'pgdNote', 'foolCount', 'minEps',
    'drawCanvas', 'clearBtn', 'demoBtns', 'drawClassify', 'drawAttack', 'drawBars',
    'drawLive', 'drawAdvCanvas', 'drawStatus', 'trainStatus', 'gainNote'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var LOCKABLE = ['epsRange', 'nextBtn', 'scanBtn', 'pgdBtn', 'drawClassify', 'drawAttack'];

  /* ---- 進場 stagger ---- */
  function stagger() {
    $$('[data-stagger]').forEach(function (n, i) {
      n.style.transitionDelay = (reduced ? 0 : Math.min(i * 70, 1100)) + 'ms';
      requestAnimationFrame(function () { n.classList.add('in'); });
    });
  }

  /* ---- 資料樣本牆 ---- */
  function buildSamples() {
    el.samples.innerHTML = '';
    for (var i = 0; i < 12; i++) {
      var s = sample(rng, i % NC);
      var fig = document.createElement('figure');
      fig.className = 'chip';
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', '訓練樣本：' + LABELS[s.y]);
      paint(cv, s.x);
      var cap = document.createElement('figcaption');
      cap.textContent = LABELS[s.y];
      fig.appendChild(cv); fig.appendChild(cap);
      el.samples.appendChild(fig);
    }
  }

  /* ---- 學習曲線 ---- */
  function drawCurve() {
    var cv = el.curve, ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var pad = 6, gw = w - pad * 2, gh = h - pad * 2;

    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var gy = pad + gh * i / 4;
      ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(w - pad, gy); ctx.stroke();
    }
    var n = Math.max(totalBatches - 1, 1);

    if (lossHist.length > 1) {              // loss（橘）
      ctx.beginPath();
      ctx.strokeStyle = '#ffb43a';
      ctx.lineWidth = 1.6;
      for (var k = 0; k < lossHist.length; k++) {
        var lx = pad + gw * (k / n);
        var ly = pad + gh * Math.min(1, lossHist[k] / 1.25);
        if (k === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    }
    if (accHist.length) {                   // 測試準確率（青，每個 epoch 一點）
      ctx.beginPath();
      ctx.strokeStyle = '#4de3d0';
      ctx.lineWidth = 2;
      ctx.moveTo(pad, pad + gh);
      for (var j = 0; j < accHist.length; j++) {
        ctx.lineTo(pad + gw * ((j + 1) / EPOCHS), pad + gh * (1 - accHist[j]));
      }
      ctx.stroke();
      ctx.fillStyle = '#4de3d0';
      ctx.beginPath();
      ctx.arc(pad + gw * (accHist.length / EPOCHS), pad + gh * (1 - accHist[accHist.length - 1]), 3, 0, TAU);
      ctx.fill();
    }
  }

  /* ---- 數字滾動 ---- */
  function tweenNum(node, from, to, fmt, ms) {
    if (reduced) { node.textContent = fmt(to); return; }
    var t0 = performance.now();
    function step(now) {
      var t = Math.min(1, (now - t0) / ms);
      var e = 1 - Math.pow(1 - t, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---- 訓練 ---- */
  function initModel() {
    if (scanning) { scanning = false; cancelAnimationFrame(scanRaf); }
    if (training) { training = false; cancelAnimationFrame(rafId); }
    pausedByVis = false;
    net = createNet(mulberry32((rng() * 1e9) | 0));
    trainSet = makeSet(rng, 3000);
    testSet = makeSet(mulberry32((rng() * 1e9) | 0), 900);
    order = trainSet.map(function (_, i) { return i; });
    cursor = 0; epoch = 0; batches = 0;
    totalBatches = EPOCHS * Math.ceil(trainSet.length / BS);
    lossHist = []; accHist = []; curLoss = 0; testAcc = 0;
    trained = false; current = null; advImg = null; lastFlipKey = '';
    el.statEpoch.textContent = '0 / ' + EPOCHS;
    el.statLoss.textContent = '—';
    el.statAcc.textContent = '—';
    el.trainBar.style.transform = 'scaleX(0)';
    el.attackCard.classList.remove('unlocked', 'fooled');
    el.trainBtn.disabled = false;
    el.trainBtn.textContent = '開始訓練';
    el.trainStatus.textContent = '尚未訓練。這個模型現在只會亂猜（約 33%）。';
    el.flipBadge.textContent = '還沒翻';
    el.flipBadge.classList.remove('on');
    el.attackLive.textContent = '';
    el.pgdNote.textContent = '';
    el.gainNote.textContent = '—';
    el.minEps.textContent = '—';
    LOCKABLE.forEach(function (k) { el[k].disabled = true; });
    shuffle();
    drawCurve();
    buildSamples();
  }
  function shuffle() {
    for (var i = order.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0, t = order[i];
      order[i] = order[j]; order[j] = t;
    }
    cursor = 0;
  }
  function stepBatch() {
    curLoss = trainBatch(net, trainSet, order, cursor, BS, LR);
    lossHist.push(curLoss);
    batches++;
    cursor += BS;
    if (cursor >= order.length) {
      epoch++;
      accHist.push(accuracy(net, testSet, 450));   // 訓練途中用子集，快
      shuffle();
    }
  }
  function trainFrame() {
    if (!training) return;
    var budget = reduced ? 24 : 12;
    for (var i = 0; i < budget && batches < totalBatches; i++) stepBatch();
    var acc = accHist.length ? accHist[accHist.length - 1] : 0;
    el.statEpoch.textContent = epoch + ' / ' + EPOCHS;
    el.statLoss.textContent = curLoss.toFixed(3);
    el.statAcc.textContent = (acc * 100).toFixed(1) + '%';
    el.trainBar.style.transform = 'scaleX(' + (batches / totalBatches) + ')';
    drawCurve();
    if (batches >= totalBatches) { finishTraining(); return; }
    rafId = requestAnimationFrame(trainFrame);
  }
  function finishTraining() {
    training = false;
    trained = true;
    testAcc = accuracy(net, testSet);            // 完整 900 張
    if (testAcc > (store('bestAcc') || 0)) store('bestAcc', testAcc);
    el.trainBtn.disabled = false;
    el.trainBtn.textContent = '再訓練一次';
    tweenNum(el.statAcc, 0, testAcc * 100, function (v) { return v.toFixed(1) + '%'; }, 700);
    el.trainStatus.textContent = '訓練完成：在 900 張沒看過的圖上，測試準確率 '
      + (testAcc * 100).toFixed(1) + '%。它現在真的會分辨形狀了 —— 那就來騙它。';
    el.attackCard.classList.add('unlocked');
    LOCKABLE.forEach(function (k) { el[k].disabled = false; });
    drawCurve();
    pickImage();
    classifyDrawing(true);
  }
  function startTraining() {
    if (training) return;
    if (trained) initModel();
    training = true;
    el.trainBtn.disabled = true;
    el.trainBtn.textContent = '訓練中…';
    el.trainStatus.textContent = '正在做反向傳播：每一批 24 張圖，算梯度、更新 16,643 個參數。';
    rafId = requestAnimationFrame(trainFrame);
  }

  /* ---- 信心長條 ---- */
  function buildBars(container) {
    container.innerHTML = '';
    var rows = [];
    for (var c = 0; c < NC; c++) {
      var row = document.createElement('div');
      row.className = 'bar';
      var name = document.createElement('span');
      name.className = 'bar-name';
      name.textContent = LABELS[c];
      var track = document.createElement('span');
      track.className = 'bar-track';
      var fill = document.createElement('span');
      fill.className = 'bar-fill';
      track.appendChild(fill);
      var val = document.createElement('span');
      val.className = 'bar-val';
      val.textContent = '—';
      row.appendChild(name); row.appendChild(track); row.appendChild(val);
      container.appendChild(row);
      rows.push({ row: row, fill: fill, val: val });
    }
    return rows;
  }
  function setBars(rows, p, winner, danger) {
    for (var c = 0; c < NC; c++) {
      rows[c].fill.style.transform = 'scaleX(' + Math.max(0.004, p[c]) + ')';
      rows[c].val.textContent = (p[c] * 100).toFixed(1) + '%';
      rows[c].row.classList.toggle('top', c === winner);
      rows[c].row.classList.toggle('danger', !!danger && c === winner);
    }
  }
  var barsOrig, barsAdv, barsDraw;

  /* ---- 攻擊台 ---- */
  function pickImage() {
    if (!trained) return;
    for (var tries = 0; tries < 80; tries++) {
      var s = testSet[(rng() * testSet.length) | 0];
      var f = forward(net, s.x);
      if (argmax(f.p) === s.y && f.p[s.y] > 0.9) { current = s; break; }
    }
    if (!current) current = testSet[0];
    el.targetSel.innerHTML = '';
    for (var c = 0; c < NC; c++) {
      if (c === current.y) continue;
      var o = document.createElement('option');
      o.value = String(c);
      o.textContent = LABELS[c];
      el.targetSel.appendChild(o);
    }
    var m = minFlipEps(net, current.x, current.y, 0.3, 0.005);
    el.minEps.textContent = m
      ? 'ε ≈ ' + m.toFixed(3) + '（約 ' + Math.round(m * 255) + '/255 階）'
      : '這張特別硬';
    el.pgdNote.textContent = '';
    updateAttack();
  }
  function updateAttack(fromPgd) {
    if (!current || !trained) return;
    if (!fromPgd) advImg = fgsm(net, current.x, current.y, eps);
    var f0 = forward(net, current.x), f1 = forward(net, advImg);
    var a0 = argmax(f0.p), a1 = argmax(f1.p);
    var flipped = a1 !== a0;

    paint(el.origCanvas, current.x);
    var mx = paintDelta(el.noiseCanvas, advImg, current.x);
    paint(el.advCanvas, advImg);
    el.gainNote.textContent = mx > 1e-5
      ? '最大像素改動 ' + (mx * 255).toFixed(1) + '/255，中間那張放大了約 ' + Math.round(1 / mx) + ' 倍才看得見'
      : '目前沒有加任何雜訊';

    setBars(barsOrig, f0.p, a0, false);
    setBars(barsAdv, f1.p, a1, flipped);

    el.attackCard.classList.toggle('fooled', flipped);
    el.flipBadge.textContent = flipped ? '翻轉！' : '還沒翻';
    el.flipBadge.classList.toggle('on', flipped);

    el.attackLive.textContent = flipped
      ? '被騙了：原圖「' + LABELS[a0] + ' ' + (f0.p[a0] * 100).toFixed(1) + '%」→ 對抗圖「'
        + LABELS[a1] + ' ' + (f1.p[a1] * 100).toFixed(1) + '%」，而那兩張圖看起來一模一樣。'
      : '目前還答對：' + LABELS[a1] + ' ' + (f1.p[a1] * 100).toFixed(1) + '%。把 ε 再拉大一點。';

    var key = (current.p ? current.p.rot.toFixed(5) : '') + '|' + a1;
    if (flipped && key !== lastFlipKey) {
      lastFlipKey = key;
      foolCount++;
      store('foolCount', foolCount);
      el.foolCount.textContent = String(foolCount);
    }
  }
  function scanEps() {
    if (scanning || !trained || !current) return;
    scanning = true;
    el.scanBtn.disabled = true;
    var t0 = performance.now(), dur = reduced ? 1 : 1400, hi = 0.16;
    var a0 = argmax(forward(net, current.x).p);
    eps = 0; syncEps(); updateAttack();
    function step(now) {
      if (!scanning || !trained || !current) {
        scanning = false;
        el.scanBtn.disabled = false;
        return;
      }
      var t = Math.min(1, (now - t0) / dur);
      eps = Math.round((t * hi) / 0.005) * 0.005;
      syncEps();
      updateAttack();
      if (!advImg || argmax(forward(net, advImg).p) !== a0 || t >= 1) {
        scanning = false;
        el.scanBtn.disabled = false;
        store('eps', eps);
        return;
      }
      scanRaf = requestAnimationFrame(step);
    }
    scanRaf = requestAnimationFrame(step);
  }
  function syncEps() {
    el.epsRange.value = String(eps);
    el.epsVal.textContent = eps.toFixed(3);
    el.epsLevels.textContent = Math.round(eps * 255) + '/255';
    el.epsRange.setAttribute('aria-valuetext',
      'ε 等於 ' + eps.toFixed(3) + '，相當於每個像素最多改動 ' + Math.round(eps * 255) + ' 個灰階');
  }
  function runPgd() {
    if (!trained || !current) return;
    var target = parseInt(el.targetSel.value, 10);
    advImg = pgdTargeted(net, current.x, target, eps, 40, eps / 8);
    var f = forward(net, advImg);
    var got = argmax(f.p);
    updateAttack(true);
    el.pgdNote.textContent = got === target
      ? '40 步 PGD 完成 → 它現在認為這是「' + LABELS[target] + '」，信心 ' + (f.p[target] * 100).toFixed(1) + '%。'
      : '在 ε=' + eps.toFixed(3) + ' 的預算內沒逼成功（它答「' + LABELS[got] + '」）。把 ε 拉大一點再試。';
    el.attackLive.textContent = el.pgdNote.textContent;
  }

  /* ---- 自己畫 ---- */
  function clearDraw() {
    for (var i = 0; i < DIM; i++) draw.img[i] = 0.04;
    draw.adv = null;
    paint(el.drawCanvas, draw.img);
    paint(el.drawAdvCanvas, draw.img);
    el.drawStatus.textContent = '畫一個形狀，然後按「讓它分類」。';
    setBars(barsDraw, [0, 0, 0], -1, false);
    el.drawBars.classList.remove('shown');
  }
  function brush(cx, cy) {
    var r = 1.35;
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var ddx = x + 0.5 - cx, ddy = y + 0.5 - cy;
        var d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < r) {
          var i = y * S + x;
          var v = 1 - (d / r) * 0.55;
          if (v > draw.img[i]) draw.img[i] = v > 1 ? 1 : v;
        }
      }
    }
    paint(el.drawCanvas, draw.img);
  }
  function canvasPos(evt) {
    var r = el.drawCanvas.getBoundingClientRect();
    var pt = evt.touches ? evt.touches[0] : evt;
    return {
      x: (pt.clientX - r.left) / r.width * S,
      y: (pt.clientY - r.top) / r.height * S
    };
  }
  function classifyDrawing(silent) {
    if (!trained) return;
    var f = forward(net, draw.img);
    var a = argmax(f.p);
    setBars(barsDraw, f.p, a, false);
    el.drawBars.classList.add('shown');
    draw.adv = null;
    paint(el.drawAdvCanvas, draw.img);
    if (!silent) {
      el.drawStatus.textContent = '它說這是「' + LABELS[a] + '」，信心 ' + (f.p[a] * 100).toFixed(1) + '%。現在騙它。';
      el.drawLive.textContent = el.drawStatus.textContent;
    }
  }
  function attackDrawing() {
    if (!trained) return;
    var f0 = forward(net, draw.img);
    var y = argmax(f0.p);
    var e = eps;
    var adv = fgsm(net, draw.img, y, e);
    // 手繪的圖有時比較硬，逐步加預算直到翻（上限 0.25）
    while (argmax(forward(net, adv).p) === y && e < 0.25) {
      e = Math.round((e + 0.01) * 1000) / 1000;
      adv = fgsm(net, draw.img, y, e);
    }
    draw.adv = adv;
    paint(el.drawAdvCanvas, adv);
    var f1 = forward(net, adv);
    var a1 = argmax(f1.p);
    setBars(barsDraw, f1.p, a1, a1 !== y);
    var txt = a1 !== y
      ? '加上 ε=' + e.toFixed(3) + ' 的雜訊 → 它改口說是「' + LABELS[a1] + '」，信心 '
        + (f1.p[a1] * 100).toFixed(1) + '%（原本是「' + LABELS[y] + '」' + (f0.p[y] * 100).toFixed(1) + '%）。'
      : '這張圖硬得很，ε 加到 0.25 都沒翻。換個形狀試試。';
    el.drawStatus.textContent = txt;
    el.drawLive.textContent = txt;
    if (a1 !== y) {
      foolCount++;
      store('foolCount', foolCount);
      el.foolCount.textContent = String(foolCount);
    }
  }
  function demoShape(cls) {
    var p = makeParams(rng, cls);
    p.sigma = 0.02;
    draw.img.set(render(p, rng));
    paint(el.drawCanvas, draw.img);
    if (trained) classifyDrawing(false);
    else el.drawStatus.textContent = '形狀放好了 —— 先去上面把模型訓練完，它才有意見可以發表。';
  }

  /* ---- 暫停：分頁隱藏 / 卡片離開視窗 ---- */
  function pauseAll() {
    if (training) {
      pausedByVis = true;
      training = false;
      cancelAnimationFrame(rafId);
    }
    if (scanning) {
      scanning = false;
      cancelAnimationFrame(scanRaf);
      el.scanBtn.disabled = false;
    }
  }
  function resumeAll() {
    if (pausedByVis && !trained) {
      pausedByVis = false;
      training = true;
      rafId = requestAnimationFrame(trainFrame);
    }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pauseAll(); else resumeAll();
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) pauseAll();
        else if (!document.hidden) resumeAll();
      });
    }, { threshold: 0 });
    io.observe(document.getElementById('trainCard'));
  }

  /* ---- 綁定 ---- */
  function init() {
    barsOrig = buildBars(el.barsOrig);
    barsAdv = buildBars(el.barsAdv);
    barsDraw = buildBars(el.drawBars);
    el.foolCount.textContent = String(foolCount);

    eps = Math.min(0.3, Math.max(0, eps));
    syncEps();

    el.trainBtn.addEventListener('click', startTraining);
    el.resetBtn.addEventListener('click', initModel);
    el.nextBtn.addEventListener('click', function () { lastFlipKey = ''; pickImage(); });
    el.scanBtn.addEventListener('click', scanEps);
    el.pgdBtn.addEventListener('click', runPgd);

    var epsPending = false;
    el.epsRange.addEventListener('input', function () {
      eps = parseFloat(el.epsRange.value);
      syncEps();
      store('eps', eps);
      if (epsPending) return;
      epsPending = true;
      requestAnimationFrame(function () { epsPending = false; updateAttack(); });
    });

    el.clearBtn.addEventListener('click', clearDraw);
    $$('button', el.demoBtns).forEach(function (b) {
      b.addEventListener('click', function () { demoShape(parseInt(b.getAttribute('data-cls'), 10)); });
    });
    el.drawClassify.addEventListener('click', function () { classifyDrawing(false); });
    el.drawAttack.addEventListener('click', attackDrawing);

    var dc = el.drawCanvas;
    function down(e) { draw.down = true; var p = canvasPos(e); brush(p.x, p.y); e.preventDefault(); }
    function move(e) { if (!draw.down) return; var p = canvasPos(e); brush(p.x, p.y); e.preventDefault(); }
    function up() { draw.down = false; }
    dc.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    dc.addEventListener('touchstart', down, { passive: false });
    dc.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);

    var resizePending = false;
    window.addEventListener('resize', function () {
      if (training || resizePending) return;
      resizePending = true;
      requestAnimationFrame(function () { resizePending = false; drawCurve(); });
    });

    clearDraw();
    initModel();
    stagger();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);

/* =====================================================================
   專家會診 — app.js
   兆級參數，每次只醒來一小撮：一個「真的在跑」的教學版小 MoE。

   本檔分兩個 IIFE：
     #1 純數學引擎（可被 node require、可被 moe-test.js 驗證）
     #2 前端 UI（僅在瀏覽器執行）

   引擎裡沒有任何 fetch / 外部資源 / AI API：路由（linear gating + softmax）、
   top-k 選擇、稀疏加總、梯度訓練、負載平衡都是當場算出來的。
   動畫紀律（見 #2）：轉場只用 transform / opacity（canvas 內部除外）。
   ===================================================================== */

/* ============================ IIFE #1：引擎 ============================ */
(function () {
  'use strict';

  /* ---------- 決定性亂數（mulberry32）+ 高斯 ---------- */
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
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function hashInt(x) {
    x = (x ^ 61) ^ (x >>> 16);
    x = x + (x << 3);
    x = x ^ (x >>> 4);
    x = Math.imul(x, 0x27d4eb2d);
    x = x ^ (x >>> 15);
    return x >>> 0;
  }

  /* ---------- 向量小工具 ---------- */
  function zeros(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; }
  function zeros2(r, c) { var a = new Array(r); for (var i = 0; i < r; i++) a[i] = zeros(c); return a; }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function matVec(W, x) { var o = new Array(W.length); for (var i = 0; i < W.length; i++) o[i] = dot(W[i], x); return o; }
  function normalize(v) {
    var s = 0, i; for (i = 0; i < v.length; i++) s += v[i] * v[i];
    s = Math.sqrt(s) || 1; var o = new Array(v.length);
    for (i = 0; i < v.length; i++) o[i] = v[i] / s; return o;
  }
  function softmax(z) {
    var mx = -Infinity, i; for (i = 0; i < z.length; i++) if (z[i] > mx) mx = z[i];
    var s = 0, e = new Array(z.length);
    for (i = 0; i < z.length; i++) { e[i] = Math.exp(z[i] - mx); s += e[i]; }
    for (i = 0; i < z.length; i++) e[i] /= s; return e;
  }
  /* 取 top-k 的索引（依值由大到小），tie 以索引小者優先，決定性 */
  function topKIndices(vals, k) {
    var idx = vals.map(function (v, i) { return i; });
    idx.sort(function (a, b) { return vals[b] - vals[a] || a - b; });
    return idx.slice(0, k);
  }

  /* ---------- 預設設定 ---------- */
  var CONFIG = { E: 8, d: 6, m: 8, G: 8, k: 2, seed: 20260715 };

  /* ---------- 世界：特徵族中心、目標、字→(向量,族) ----------
     每個 token（中文以字為單位）決定性地對應到：
       - 一個「特徵族」g（用字碼雜湊；純合成、與人類語意無關）
       - 一個嵌入向量 x = normalize(族中心 + 小雜訊)
       - 訓練目標 y = 該族的目標向量
     這模擬「上游層已經把 token 整理成、依某種特徵分群的隱藏狀態」。
     ── 老實說：這裡的「族」是我們合成出來的，真實模型的分群是學出來、常無法解讀。 */
  function buildWorld(cfg) {
    cfg = cfg || CONFIG;
    var rng = mulberry32(cfg.seed);
    var centers = [], targets = [], g, j;
    for (g = 0; g < cfg.G; g++) {
      var c = new Array(cfg.d); for (j = 0; j < cfg.d; j++) c[j] = gauss(rng);
      centers.push(normalize(c));
      var t = new Array(cfg.m); for (j = 0; j < cfg.m; j++) t[j] = (j === g ? 1 : 0) + 0.12 * gauss(rng);
      targets.push(t);
    }
    function groupOf(ch) {
      var code = typeof ch === 'number' ? ch : ch.charCodeAt(0);
      return hashInt(code ^ cfg.seed) % cfg.G;
    }
    function embed(ch) {
      var code = typeof ch === 'number' ? ch : ch.charCodeAt(0);
      var g = groupOf(code);
      var rc = mulberry32((hashInt(code) ^ (cfg.seed * 2654435761)) | 0);
      var v = new Array(cfg.d);
      for (var j = 0; j < cfg.d; j++) v[j] = centers[g][j] + 0.28 * gauss(rc);
      return { vec: normalize(v), g: g };
    }
    return { cfg: cfg, centers: centers, targets: targets, groupOf: groupOf, embed: embed };
  }

  /* ---------- 內建示範句（供 UI 與測試共用） ---------- */
  var DEMO_SENTENCES = [
    '貓咪在屋頂上曬太陽',
    '量子電腦運算快得驚人',
    '今天下午好想喝咖啡',
    '海浪拍打金色的沙灘',
    '程式碼裡藏著一個漏洞',
    '深夜的城市燈火通明'
  ];

  /* 蒐集所有不重複的字，建成訓練資料集 */
  function buildDataset(world, sentences) {
    sentences = sentences || DEMO_SENTENCES;
    var seen = {}, tokens = [], i, j;
    for (i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      for (j = 0; j < s.length; j++) {
        var ch = s[j];
        if (!seen[ch]) { seen[ch] = 1; tokens.push(ch); }
      }
    }
    var X = [], Y = [], groups = [];
    for (i = 0; i < tokens.length; i++) {
      var e = world.embed(tokens[i]);
      X.push(e.vec); groups.push(e.g); Y.push(world.targets[e.g]);
    }
    return { tokens: tokens, X: X, Y: Y, groups: groups };
  }

  /* ---------- 模型：gate 一層線性 + 每個 expert 一層線性 ---------- */
  function initModel(cfg, seed) {
    cfg = cfg || CONFIG;
    var rng = mulberry32(seed == null ? cfg.seed + 7 : seed);
    var Wg = zeros2(cfg.E, cfg.d), e, i, j;
    for (e = 0; e < cfg.E; e++) for (j = 0; j < cfg.d; j++) Wg[e][j] = gauss(rng) * 0.5;
    var We = [];
    for (e = 0; e < cfg.E; e++) {
      var w = zeros2(cfg.m, cfg.d);
      for (i = 0; i < cfg.m; i++) for (j = 0; j < cfg.d; j++) w[i][j] = gauss(rng) * 0.5;
      We.push(w);
    }
    return { E: cfg.E, d: cfg.d, m: cfg.m, Wg: Wg, We: We };
  }

  /* ---------- 前向：路由 + top-k + 稀疏加總（真的稀疏，只算被選中的 expert） ----------
     opts.k：每個 token 送去幾個 expert
     opts.bias：長度 E 的偏置（負載平衡用；可省略）
     回傳 selected（被選中的 expert 索引）、gates（歸一化後的權重，長度 E，未選為 0）、
          out（只對被選中 expert 計算的輸出）、pred（稀疏加總後的輸出向量） */
  function forward(model, x, opts) {
    opts = opts || {};
    var k = opts.k || CONFIG.k;
    var bias = opts.bias;
    var E = model.E, i;
    var logits = matVec(model.Wg, x);
    var routed = logits;
    if (bias) { routed = new Array(E); for (i = 0; i < E; i++) routed[i] = logits[i] + bias[i]; }
    var probs = softmax(routed);
    var selected = topKIndices(routed, k);
    /* 被選中專家的機率歸一化，權重總和 = 1 */
    var sumS = 0; for (i = 0; i < selected.length; i++) sumS += probs[selected[i]];
    var gates = zeros(E);
    var out = new Array(E);
    var pred = zeros(model.m);
    for (i = 0; i < selected.length; i++) {
      var e = selected[i];
      var g = probs[e] / sumS;
      gates[e] = g;
      var oe = matVec(model.We[e], x);   /* 只有被選中的 expert 才算 —— 這就是稀疏計算 */
      out[e] = oe;
      for (var t = 0; t < model.m; t++) pred[t] += g * oe[t];
    }
    return {
      logits: logits, routed: routed, probs: probs, selected: selected,
      gates: gates, sumS: sumS, out: out, pred: pred, activeCount: selected.length, k: k
    };
  }

  /* ---------- 對照組：全算再遮罩（用來證明「稀疏加總 == 全算後只保留被選中的」） ---------- */
  function forwardDenseMasked(model, x, opts) {
    opts = opts || {};
    var k = opts.k || CONFIG.k;
    var bias = opts.bias;
    var E = model.E, i;
    var logits = matVec(model.Wg, x);
    var routed = logits;
    if (bias) { routed = new Array(E); for (i = 0; i < E; i++) routed[i] = logits[i] + bias[i]; }
    var probs = softmax(routed);
    var selected = topKIndices(routed, k);
    var mask = zeros(E); for (i = 0; i < selected.length; i++) mask[selected[i]] = 1;
    var sumS = 0; for (i = 0; i < E; i++) sumS += mask[i] * probs[i];
    var pred = zeros(model.m);
    for (var e = 0; e < E; e++) {
      var oe = matVec(model.We[e], x);            /* 全部都算 */
      var g = mask[e] * probs[e] / sumS;          /* 沒被選中的 gate = 0 */
      for (var t = 0; t < model.m; t++) pred[t] += g * oe[t];
    }
    return { pred: pred, selected: selected };
  }

  /* ---------- 損失與梯度（MSE + Switch 式負載平衡輔助損失） ----------
     L = MSE + alpha * E * sum_e f_e * P_e
       P_e = 該 batch 平均分配到 expert e 的 softmax 機率
       f_e = 被路由到 expert e 的 token 比例（top-k 計數 / N；視為常數，Switch 慣例）
     回傳 loss/mse/balance 與對 Wg、We 的梯度，供 trainStep 使用，並可用數值梯度檢查。 */
  function lossAndGrad(model, X, Y, opts) {
    opts = opts || {};
    var k = opts.k || CONFIG.k, alpha = opts.alpha || 0;
    var E = model.E, d = model.d, m = model.m, N = X.length;
    var dWg = zeros2(E, d);
    var dWe = []; for (var e = 0; e < E; e++) dWe.push(zeros2(m, d));
    var fwd = [], Psum = zeros(E), fCount = zeros(E);
    var mse = 0, n, i, j;
    for (n = 0; n < N; n++) {
      var f = forward(model, X[n], { k: k });
      fwd.push(f);
      for (e = 0; e < E; e++) Psum[e] += f.probs[e];
      for (i = 0; i < f.selected.length; i++) fCount[f.selected[i]] += 1;
      for (i = 0; i < m; i++) { var diff = f.pred[i] - Y[n][i]; mse += (diff * diff) / m; }
    }
    mse /= N;
    var P = Psum.map(function (v) { return v / N; });
    var fFrac = fCount.map(function (v) { return v / N; });
    var balance = 0; for (e = 0; e < E; e++) balance += fFrac[e] * P[e];
    balance *= alpha * E;

    for (n = 0; n < N; n++) {
      var fn = fwd[n];
      var dpred = new Array(m);
      for (i = 0; i < m; i++) dpred[i] = (2 / m) * (fn.pred[i] - Y[n][i]) / N;
      var dp = zeros(E);
      /* MSE 經由被選中專家：更新 dWe，並算對「歸一化 gate」的梯度 dgSel */
      var dgSel = {}, S = fn.selected;
      for (i = 0; i < S.length; i++) {
        var eSel = S[i], oe = fn.out[eSel], gSel = fn.gates[eSel], dg = 0, tt;
        for (tt = 0; tt < m; tt++) {
          var c = gSel * dpred[tt];
          for (j = 0; j < d; j++) dWe[eSel][tt][j] += c * X[n][j];
          dg += dpred[tt] * oe[tt];
        }
        dgSel[eSel] = dg;
      }
      /* 歸一化 gate → 機率 p（只在被選中集合內耦合，sumS 相依） */
      var dotag = 0; for (i = 0; i < S.length; i++) dotag += dgSel[S[i]] * fn.gates[S[i]];
      for (i = 0; i < S.length; i++) dp[S[i]] += (dgSel[S[i]] - dotag) / fn.sumS;
      /* 負載平衡輔助損失經由 P_e：對所有 e 的機率都有梯度 */
      if (alpha) for (e = 0; e < E; e++) dp[e] += alpha * E * fFrac[e] / N;
      /* softmax 反傳：dz_e = p_e (dp_e - sum_f dp_f p_f) */
      var dpp = 0; for (e = 0; e < E; e++) dpp += dp[e] * fn.probs[e];
      for (e = 0; e < E; e++) {
        var dz = fn.probs[e] * (dp[e] - dpp);
        for (j = 0; j < d; j++) dWg[e][j] += dz * X[n][j];
      }
    }
    return { loss: mse + balance, mse: mse, balance: balance, dWg: dWg, dWe: dWe, P: P, fFrac: fFrac };
  }

  function applyGrads(model, grads, lr) {
    var e, i, j;
    for (e = 0; e < model.E; e++)
      for (j = 0; j < model.d; j++) model.Wg[e][j] -= lr * grads.dWg[e][j];
    for (e = 0; e < model.E; e++)
      for (i = 0; i < model.m; i++)
        for (j = 0; j < model.d; j++) model.We[e][i][j] -= lr * grads.dWe[e][i][j];
  }

  function train(model, X, Y, opts) {
    opts = opts || {};
    var steps = opts.steps || 300, lr = opts.lr || 0.4;
    var k = opts.k || CONFIG.k, alpha = opts.alpha || 0;
    var hist = [];
    for (var s = 0; s < steps; s++) {
      var g = lossAndGrad(model, X, Y, { k: k, alpha: alpha });
      applyGrads(model, g, lr);
      hist.push(g.loss);
    }
    return hist;
  }

  /* ---------- 分布度量 ---------- */
  function variance(counts) {
    var n = counts.length, i, mean = 0;
    for (i = 0; i < n; i++) mean += counts[i]; mean /= n;
    var v = 0; for (i = 0; i < n; i++) v += (counts[i] - mean) * (counts[i] - mean);
    return v / n;
  }
  function entropy(counts) {
    var tot = 0, i; for (i = 0; i < counts.length; i++) tot += counts[i];
    if (tot === 0) return 0;
    var h = 0; for (i = 0; i < counts.length; i++) {
      var p = counts[i] / tot; if (p > 0) h -= p * Math.log2(p);
    }
    return h; /* 單位 bit；上限 = log2(E) */
  }

  /* ---------- 一批 token 的路由（含可切換的「無損失負載平衡」偏置） ----------
     balance=true 時，依「目前各專家累積負載」動態調整偏置：
        bias_e = -gamma * (load_e/processed - 1/E)
     負載高的專家被壓低 logit，把後續 token 擠去比較閒的專家。
     這正是 DeepSeek-V3「auxiliary-loss-free load balancing」的核心點子。
     回傳每個 token 的分派、各專家負載、entropy、variance —— 全部可被 node 驗證。 */
  function routeBatch(model, Xlist, opts) {
    opts = opts || {};
    var k = opts.k || CONFIG.k, balance = !!opts.balance, gamma = opts.gamma == null ? 6 : opts.gamma;
    var E = model.E, loads = zeros(E), assign = [], processed = 0, i, e;
    for (i = 0; i < Xlist.length; i++) {
      var bias = null;
      if (balance && processed > 0) {
        bias = new Array(E);
        for (e = 0; e < E; e++) bias[e] = -gamma * (loads[e] / processed - 1 / E);
      }
      var f = forward(model, Xlist[i], { k: k, bias: bias });
      assign.push(f.selected.slice());
      for (var s = 0; s < f.selected.length; s++) loads[f.selected[s]] += 1;
      processed += 1;
    }
    return {
      assign: assign, loads: loads,
      entropy: entropy(loads), variance: variance(loads),
      maxLoadRatio: Math.max.apply(null, loads) / (processed * k / E)
    };
  }

  /* ---------- 真實模型的數字（查證過，供「參數 vs 啟動」對照） ----------
     只放公開、可查的數字；GPT-4 明確標為「傳聞・非官方」。 */
  var REAL_MODELS = [
    { id: 'mixtral', name: 'Mixtral 8x7B', experts: 8, perToken: 2,
      totalB: 47, activeB: 13, official: true,
      note: 'Mistral AI。每層 8 個專家，router 每個 token 選 2 個；總參數約 47B，每 token 只動用約 13B。' },
    { id: 'deepseek', name: 'DeepSeek-V3', experts: 257, perToken: 9,
      totalB: 671, activeB: 37, official: true,
      note: '256 個路由專家 + 1 個共享專家，每 token 啟動 8 個路由專家 + 1 共享；總 671B，每 token 只動用 37B。採無輔助損失負載平衡。' },
    { id: 'switch', name: 'Switch-C (Switch Transformer)', experts: 2048, perToken: 1,
      totalB: 1571, activeB: null, official: true,
      note: 'Google，2021。把路由簡化成 top-1（每 token 只 1 個專家），首度穩定訓練到兆級——Switch-C 約 1.6 兆（1.571T）參數。' },
    { id: 'gpt4', name: 'GPT-4（傳聞）', experts: 8, perToken: 2,
      totalB: 1760, activeB: 280, official: false,
      note: '非官方傳聞（George Hotz 等，2023）：約 8 個 220B 專家、每 token 選 2；估總 ~1.76T、每 token ~280B。OpenAI 從未證實。' }
  ];

  var API = {
    mulberry32: mulberry32, gauss: gauss, hashInt: hashInt,
    softmax: softmax, topKIndices: topKIndices, normalize: normalize,
    CONFIG: CONFIG, DEMO_SENTENCES: DEMO_SENTENCES, REAL_MODELS: REAL_MODELS,
    buildWorld: buildWorld, buildDataset: buildDataset,
    initModel: initModel, forward: forward, forwardDenseMasked: forwardDenseMasked,
    lossAndGrad: lossAndGrad, applyGrads: applyGrads, train: train,
    routeBatch: routeBatch, variance: variance, entropy: entropy
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.MoE = API;
})();

/* ============================ IIFE #2：前端 UI ============================ */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var MoE = window.MoE;
  if (!MoE) return;

  var SVGNS = 'http://www.w3.org/2000/svg';
  var HUES = ['#6ea8ff', '#b58cff', '#ff8ac4', '#ff8f7a', '#ffc24d', '#8fe07a', '#4fd6c4', '#7fd0ff'];

  /* ---------- 小工具 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function lsGet(k, d) { try { var v = localStorage.getItem('moe.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('moe.' + k, JSON.stringify(v)); } catch (e) {} }

  var mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = mql.matches;
  function applyMotion() { document.documentElement.classList.toggle('reduce-motion', reduceMotion); }
  if (mql.addEventListener) mql.addEventListener('change', function (e) {
    reduceMotion = e.matches; applyMotion();
    if (reduceMotion) stopHero(); else startHero();
  });
  applyMotion();

  function animateNumber(node, from, to, dur, fmt) {
    fmt = fmt || function (x) { return Math.round(x) + ''; };
    if (reduceMotion || dur <= 0) { node.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function tick(now) {
      var p = clamp01((now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }

  /* ---------- 建世界 + 訓練小 MoE（載入時當場訓練，router 真的學路由） ---------- */
  var cfg = MoE.CONFIG;
  var world = MoE.buildWorld(cfg);
  var ds = MoE.buildDataset(world);
  var model = MoE.initModel(cfg, 4);
  MoE.train(model, ds.X, ds.Y, { k: 2, alpha: 0, lr: 0.4, steps: 500 });

  function embedOf(ch) { return world.embed(ch); }

  /* ================================================================== *
   * 01 路由台                                                           *
   * ================================================================== */
  var stage, routerEl, routerTok, wiresEl, expertNodes = [], expLoadEl = [], expBarEl = [], expWeightEl = [];
  var bench = {
    tokens: [], ptr: 0, loadedText: null, running: false, timer: 0,
    loads: null, distinct: null, processed: 0, k: lsGet('k', 2), prevCurChip: null
  };

  function buildExperts() {
    var host = $('#experts'); if (!host) return;
    host.textContent = '';
    expertNodes = []; expLoadEl = []; expBarEl = []; expWeightEl = [];
    for (var e = 0; e < cfg.E; e++) {
      var card = el('div', 'expert'); card.setAttribute('role', 'listitem');
      card.style.setProperty('--hue', HUES[e]); card.dataset.e = e;
      var weight = el('span', 'ex-weight'); weight.textContent = '';
      var core = el('div', 'ex-core'); core.appendChild(el('span', 'ex-id', '#' + e));
      var meta = el('div', 'ex-meta');
      var load = el('span', 'ex-load', '0'); meta.appendChild(load);
      meta.appendChild(el('span', 'ex-loadcap', ' 次'));
      var bar = el('div', 'ex-bar'); var fill = el('span', 'ex-bar-fill'); bar.appendChild(fill);
      card.appendChild(weight); card.appendChild(core); card.appendChild(meta); card.appendChild(bar);
      card.setAttribute('aria-label', '專家 ' + e + '，目前被叫到 0 次');
      host.appendChild(card);
      expertNodes.push(card); expLoadEl.push(load); expBarEl.push(fill); expWeightEl.push(weight);
    }
  }

  function resetBenchState() {
    bench.loads = new Array(cfg.E).fill(0);
    bench.distinct = {}; bench.processed = 0; bench.ptr = 0; bench.prevCurChip = null;
    for (var e = 0; e < cfg.E; e++) {
      expertNodes[e].classList.remove('is-awake');
      expLoadEl[e].textContent = '0';
      expBarEl[e].style.transform = 'scaleX(0)';
      expWeightEl[e].textContent = '';
      expertNodes[e].setAttribute('aria-label', '專家 ' + e + '，目前被叫到 0 次');
    }
    if (wiresEl) wiresEl.textContent = '';
    if (routerTok) { routerTok.textContent = '·'; routerTok.classList.remove('live'); }
    updateStats(0, null);
  }

  function loadSentence(text) {
    var toks = Array.prototype.filter.call(text || '', function (c) { return c.trim() !== ''; });
    bench.tokens = toks; bench.loadedText = text;
    resetBenchState();
    var strip = $('#tok-strip'); strip.textContent = '';
    toks.forEach(function (ch, i) {
      var c = el('div', 'tok-chip', ch); c.dataset.i = i; c.setAttribute('role', 'button');
      c.setAttribute('tabindex', '0'); c.setAttribute('aria-label', '第 ' + (i + 1) + ' 個 token：' + ch);
      strip.appendChild(c);
    });
    if (!toks.length) setReadout(null);
  }

  function drawWires(selected, gates) {
    if (!wiresEl) return;
    wiresEl.textContent = '';
    if (!selected || !selected.length) return;
    var sRect = stage.getBoundingClientRect(), rRect = routerEl.getBoundingClientRect();
    var rx = rRect.left + rRect.width / 2 - sRect.left, ry = rRect.bottom - sRect.top;
    selected.forEach(function (e) {
      var eRect = expertNodes[e].getBoundingClientRect();
      var exx = eRect.left + eRect.width / 2 - sRect.left, eyy = eRect.top - sRect.top;
      var midy = (ry + eyy) / 2;
      var d = 'M' + rx + ',' + ry + ' C' + rx + ',' + midy + ' ' + exx + ',' + midy + ' ' + exx + ',' + eyy;
      var p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d); p.setAttribute('class', 'wire');
      p.style.stroke = HUES[e];
      p.setAttribute('stroke-width', (1.4 + 3 * (gates[e] || 0.4)).toFixed(2));
      wiresEl.appendChild(p);
      if (!reduceMotion) {
        var len = p.getTotalLength();
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
        p.getBoundingClientRect();
        p.style.transition = 'stroke-dashoffset .5s ease, opacity .35s ease';
        requestAnimationFrame(function () { p.classList.add('on'); p.style.strokeDashoffset = '0'; });
      } else { p.classList.add('on'); }
    });
  }

  function setReadout(info) {
    var box = $('#route-readout'); box.textContent = '';
    if (!info) { box.textContent = bench.tokens.length ? '按「整句送入」或「下一個字」開始。' : '請先輸入一些字，或選一句範例。'; return; }
    box.appendChild(document.createTextNode('token「'));
    var b0 = el('b'); b0.textContent = info.ch; box.appendChild(b0);
    box.appendChild(document.createTextNode('」→ '));
    info.selected.forEach(function (e, i) {
      var s = el('span'); s.style.color = HUES[e]; s.style.fontWeight = '700';
      s.textContent = '#' + e + '（' + info.gates[e].toFixed(2) + '）';
      box.appendChild(s);
      if (i < info.selected.length - 1) box.appendChild(document.createTextNode('、'));
    });
    box.appendChild(document.createTextNode('　｜　' + cfg.E + ' 選 ' + info.selected.length + '，只叫醒 '));
    var bk = el('b'); bk.textContent = info.selected.length; box.appendChild(bk);
    box.appendChild(document.createTextNode(' 個專家（其餘 ' + (cfg.E - info.selected.length) + ' 個這一步完全沒算）。'));
  }

  function updateStats(k, distinctCount) {
    $('#stat-active').textContent = k ? k : '—';
    $('#stat-ratio').textContent = k ? (k + '/' + cfg.E + ' = ' + Math.round(100 * k / cfg.E) + '%') : '—';
    if (distinctCount != null) $('#stat-distinct').textContent = distinctCount;
    $('#stat-total').textContent = bench.processed;
  }

  function routeToken(ch, chipEl) {
    var r = MoE.forward(model, embedOf(ch).vec, { k: bench.k });
    for (var e = 0; e < cfg.E; e++) {
      var on = r.gates[e] > 0;
      expertNodes[e].classList.toggle('is-awake', on);
      expWeightEl[e].textContent = on ? r.gates[e].toFixed(2) : '';
      if (on) { bench.loads[e] += 1; bench.distinct[e] = 1; }
    }
    var maxLoad = Math.max.apply(null, bench.loads) || 1;
    for (e = 0; e < cfg.E; e++) {
      expLoadEl[e].textContent = bench.loads[e];
      expBarEl[e].style.transform = 'scaleX(' + (bench.loads[e] / maxLoad).toFixed(3) + ')';
      expertNodes[e].setAttribute('aria-label', '專家 ' + e + '，目前被叫到 ' + bench.loads[e] + ' 次' + (r.gates[e] > 0 ? '（這個 token 有啟動）' : ''));
    }
    if (routerTok) { routerTok.textContent = ch; routerTok.classList.add('live'); }
    drawWires(r.selected, r.gates);
    bench.processed += 1;
    setReadout({ ch: ch, selected: r.selected.slice().sort(function (a, b) { return r.gates[b] - r.gates[a]; }), gates: r.gates });
    updateStats(r.selected.length, Object.keys(bench.distinct).length);
    if (chipEl) {
      if (bench.prevCurChip) bench.prevCurChip.classList.remove('cur');
      chipEl.classList.add('done', 'cur');
      chipEl.style.setProperty('--hue', HUES[r.selected[0]]);
      bench.prevCurChip = chipEl;
    }
  }

  function stepOne() {
    if (bench.ptr >= bench.tokens.length) return false;
    var i = bench.ptr, ch = bench.tokens[i];
    var chip = $('#tok-strip').children[i];
    routeToken(ch, chip);
    bench.ptr += 1;
    return bench.ptr < bench.tokens.length;
  }

  function stopRun() {
    bench.running = false;
    if (bench.timer) { clearTimeout(bench.timer); bench.timer = 0; }
    var ab = $('#btn-auto'); if (ab) { ab.setAttribute('aria-pressed', 'false'); ab.textContent = '自動播放'; }
  }
  function startRun(speed, isAuto) {
    stopRun();
    if (bench.ptr >= bench.tokens.length) { if (!bench.tokens.length) return; bench.ptr = 0; resetChipStates(); }
    bench.running = true;
    if (isAuto) { var ab = $('#btn-auto'); ab.setAttribute('aria-pressed', 'true'); ab.textContent = '暫停'; }
    if (reduceMotion) { while (stepOne()) {} stopRun(); return; }
    (function tick() {
      var more = stepOne();
      if (more && bench.running) bench.timer = setTimeout(tick, speed);
      else stopRun();
    })();
  }
  function resetChipStates() {
    $$('#tok-strip .tok-chip').forEach(function (c) { c.classList.remove('done', 'cur'); c.style.removeProperty('--hue'); });
    for (var e = 0; e < cfg.E; e++) { bench.loads[e] = 0; expLoadEl[e].textContent = '0'; expBarEl[e].style.transform = 'scaleX(0)'; expertNodes[e].classList.remove('is-awake'); }
    bench.distinct = {}; bench.processed = 0; bench.prevCurChip = null;
  }

  function ensureLoaded() {
    var text = $('#tok-input').value;
    if (bench.loadedText !== text || !bench.tokens.length) loadSentence(text);
  }

  function setupBench() {
    stage = $('#stage'); routerEl = $('#router'); routerTok = $('#router-token'); wiresEl = $('#wires');
    buildExperts();

    /* 範例句 */
    var chipHost = $('#preset-chips');
    (MoE.DEMO_SENTENCES || []).forEach(function (s) {
      var b = el('button', 'chip', s); b.type = 'button'; b.dataset.sentence = s;
      b.addEventListener('click', function () { $('#tok-input').value = s; lsSet('input', s); loadSentence(s); startRun(150, false); });
      chipHost.appendChild(b);
    });

    /* top-k 切換 */
    $$('#k-seg .kbtn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(+btn.dataset.k === bench.k));
      btn.addEventListener('click', function () {
        bench.k = +btn.dataset.k; lsSet('k', bench.k);
        $$('#k-seg .kbtn').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        ensureLoaded(); bench.ptr = 0; resetChipStates(); startRun(120, false);
      });
    });

    $('#btn-step').addEventListener('click', function () { stopRun(); ensureLoaded(); if (bench.ptr >= bench.tokens.length) { bench.ptr = 0; resetChipStates(); } stepOne(); });
    $('#btn-send').addEventListener('click', function () { loadSentence($('#tok-input').value); lsSet('input', $('#tok-input').value); startRun(150, false); });
    $('#btn-auto').addEventListener('click', function () { if (bench.running) stopRun(); else { ensureLoaded(); startRun(650, true); } });
    $('#btn-clear').addEventListener('click', function () { stopRun(); $('#tok-input').value = ''; loadSentence(''); });
    $('#tok-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { loadSentence(this.value); lsSet('input', this.value); startRun(150, false); } });

    /* 點 token 卷軸重看該字的路由 */
    $('#tok-strip').addEventListener('click', function (e) {
      var chip = e.target.closest('.tok-chip'); if (!chip) return;
      stopRun(); routeToken(chip.textContent, chip);
    });
    $('#tok-strip').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var chip = e.target.closest('.tok-chip'); if (!chip) return;
      e.preventDefault(); stopRun(); routeToken(chip.textContent, chip);
    });

    var savedInput = lsGet('input', null);
    if (savedInput != null) $('#tok-input').value = savedInput;
    loadSentence($('#tok-input').value);

    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (wiresEl) wiresEl.textContent = ''; }, 120); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopRun(); });
  }

  /* ================================================================== *
   * 02 參數 vs 啟動                                                     *
   * ================================================================== */
  function fmtB(b) { return b >= 1000 ? (b / 1000).toFixed(2) + 'T' : Math.round(b) + 'B'; }
  function toyModelStats() {
    var gate = cfg.E * cfg.d, per = cfg.m * cfg.d, total = gate + cfg.E * per, active = gate + 2 * per;
    return { id: 'toy', name: '本頁教學版小 MoE', experts: cfg.E, perToken: 2, totalRaw: total, activeRaw: active,
      note: '這頁真的在跑的小 MoE：' + cfg.E + ' 個專家、每專家 ' + per + ' 參數、路由器 ' + gate + ' 參數，共 ' + total +
            ' 個；每 token（top-2）只醒來 路由器 ' + gate + ' + 2 專家 ' + 2 * per + ' = ' + active + ' 個。' };
  }
  function setupScale() {
    var models = {};
    (MoE.REAL_MODELS || []).forEach(function (m) { models[m.id] = m; });
    models.toy = toyModelStats();

    function show(id) {
      var m = models[id]; if (!m) return;
      var isToy = id === 'toy';
      var totalV = isToy ? m.totalRaw : m.totalB;
      var activeV = isToy ? m.activeRaw : m.activeB;
      var unit = isToy ? ' 個' : '';
      var totalStr = isToy ? totalV + ' 個' : fmtB(totalV);
      /* 總參數滾動 */
      animateNumber($('#p-total'), 0, totalV, 900, isToy ? function (x) { return Math.round(x) + ' 個'; } : function (x) { return fmtB(x); });
      /* 啟動參數 */
      var pAct = $('#p-active'), pRatio = $('#p-ratio'), pbar = $('#p-bar');
      if (activeV == null) {
        pAct.textContent = 'top-1'; pRatio.textContent = '每步 1 個專家';
      } else {
        animateNumber(pAct, 0, activeV, 900, isToy ? function (x) { return Math.round(x) + ' 個'; } : function (x) { return fmtB(x); });
        var ratio = activeV / totalV;
        animateNumber(pRatio, 0, ratio * 100, 900, function (x) { return x.toFixed(1) + '%'; });
      }
      /* 條 */
      var barRatio = activeV != null ? activeV / totalV : (m.perToken / m.experts);
      var shown = Math.max(barRatio, 0.012);
      requestAnimationFrame(function () { pbar.style.transform = 'scaleX(' + shown.toFixed(4) + ')'; });
      /* 專家格 */
      var grid = $('#p-grid'); grid.textContent = '';
      var cap = Math.min(m.experts, 48);
      var litCount = Math.max(1, Math.round(cap * m.perToken / m.experts));
      for (var i = 0; i < cap; i++) { var c = el('span', 'pcell'); if (i < litCount) c.classList.add('lit'); grid.appendChild(c); }
      $('#p-gridcap').textContent = m.experts + ' 個專家' + (m.experts > cap ? '（示意 ' + cap + ' 格）' : '') +
        '，每個 token 亮 ' + m.perToken + ' 個' + (m.experts > cap ? '（示意約 ' + litCount + ' 格）' : '') + '。';
      $('#p-note').textContent = m.note;
    }

    var seg = $('#model-seg');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('.mbtn'); if (!b) return;
      $$('.mbtn', seg).forEach(function (x) { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      lsSet('model', b.dataset.model); show(b.dataset.model);
    });
    var saved = lsGet('model', 'mixtral');
    var target = $$('.mbtn', seg).filter(function (x) { return x.dataset.model === saved; })[0] || $$('.mbtn', seg)[0];
    $$('.mbtn', seg).forEach(function (x) { x.classList.toggle('is-on', x === target); x.setAttribute('aria-pressed', String(x === target)); });
    show(target.dataset.model);
  }

  /* ================================================================== *
   * 03 負載平衡                                                         *
   * ================================================================== */
  var lb = { seq: [], balance: lsGet('lbBalance', false), k: 2, cols: [], bars: [], vals: [] };
  var famToks = {};
  (function () { ds.tokens.forEach(function (ch, i) { var g = ds.groups[i]; (famToks[g] = famToks[g] || []).push(world.embed(ch).vec); }); })();
  var HOT = [ds.groups[0], ds.groups[1]];

  function buildLBBars() {
    var host = $('#lb-bars'); if (!host) return; host.textContent = '';
    lb.cols = []; lb.bars = []; lb.vals = [];
    for (var e = 0; e < cfg.E; e++) {
      var col = el('div', 'lb-col');
      var val = el('div', 'lb-col-val', '');
      var bar = el('div', 'lb-bar'); bar.style.background = HUES[e];
      var capn = el('div', 'lb-col-cap', '#' + e);
      col.appendChild(val); col.appendChild(bar); col.appendChild(capn);
      host.appendChild(col);
      lb.cols.push(col); lb.bars.push(bar); lb.vals.push(val);
    }
  }
  function genToken() {
    var pool;
    if (Math.random() < 0.7) { var g = HOT[Math.random() < 0.5 ? 0 : 1]; pool = famToks[g] || ds.X; }
    else pool = ds.X;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function simulateLB() {
    var loads = new Array(cfg.E).fill(0), processed = 0, gamma = 6;
    lb.seq.forEach(function (x) {
      var bias = null;
      if (lb.balance && processed > 0) { bias = new Array(cfg.E); for (var e = 0; e < cfg.E; e++) bias[e] = -gamma * (loads[e] / processed - 1 / cfg.E); }
      var r = MoE.forward(model, x, { k: lb.k, bias: bias });
      for (var s = 0; s < r.selected.length; s++) loads[r.selected[s]] += 1;
      processed += 1;
    });
    return loads;
  }
  function renderLB() {
    var loads = simulateLB();
    var maxLoad = Math.max.apply(null, loads) || 1;
    for (var e = 0; e < cfg.E; e++) {
      lb.bars[e].style.transform = 'scaleY(' + (loads[e] / maxLoad).toFixed(3) + ')';
      lb.vals[e].textContent = loads[e] || '';
      lb.cols[e].setAttribute('title', '專家 #' + e + '：' + loads[e] + ' 次');
    }
    var count = lb.seq.length;
    $('#lb-count').textContent = count;
    if (count === 0) { $('#lb-entropy').textContent = '—'; $('#lb-variance').textContent = '—'; $('#lb-max').textContent = '—'; return; }
    var H = MoE.entropy(loads), V = MoE.variance(loads);
    var maxRatio = Math.max.apply(null, loads) / (count * lb.k / cfg.E);
    animateNumber($('#lb-entropy'), 0, H, 500, function (x) { return x.toFixed(2); });
    animateNumber($('#lb-variance'), 0, V, 500, function (x) { return x.toFixed(1); });
    animateNumber($('#lb-max'), 0, maxRatio, 500, function (x) { return x.toFixed(2) + '×'; });
  }
  function setupBalance() {
    buildLBBars();
    var tog = $('#lb-toggle'); tog.checked = lb.balance; tog.setAttribute('aria-checked', String(lb.balance));
    tog.addEventListener('change', function () { lb.balance = tog.checked; tog.setAttribute('aria-checked', String(lb.balance)); lsSet('lbBalance', lb.balance); renderLB(); });
    $('#lb-feed').addEventListener('click', function () { for (var i = 0; i < 40; i++) lb.seq.push(genToken()); renderLB(); });
    $('#lb-reset').addEventListener('click', function () { lb.seq = []; renderLB(); });
    /* 先灌一批當作起始畫面 */
    for (var i = 0; i < 40; i++) lb.seq.push(genToken());
    renderLB();
  }

  /* ================================================================== *
   * 進場 reveal                                                         *
   * ================================================================== */
  function setupReveal() {
    var items = $$('[data-reveal]');
    if (reduceMotion || !('IntersectionObserver' in window)) { items.forEach(function (n) { n.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en, i) { if (en.isIntersecting) { var t = Math.min(i * 90, 400); setTimeout(function () { en.target.classList.add('in'); }, t); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ================================================================== *
   * HERO canvas：暗場專家點 + 偶發路由火花（rAF，隱藏/離屏/減動時暫停）     *
   * ================================================================== */
  var heroCv, heroCtx, heroRAF = 0, heroNodes = [], heroLast = 0, heroVisible = true, heroSparks = [], heroT = 0;
  function initHero() {
    heroCv = $('#bg-canvas'); if (!heroCv) return;
    heroCtx = heroCv.getContext('2d');
    sizeHero(); buildHeroNodes();
    var io = new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; if (heroVisible && !reduceMotion) startHero(); else stopHero(); });
    io.observe(heroCv);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopHero(); else if (heroVisible && !reduceMotion) startHero(); });
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { sizeHero(); buildHeroNodes(); if (reduceMotion) drawHeroStatic(); }, 150); });
    if (reduceMotion) drawHeroStatic(); else startHero();
  }
  function sizeHero() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = heroCv.getBoundingClientRect();
    heroCv.width = Math.max(1, Math.floor(r.width * dpr)); heroCv.height = Math.max(1, Math.floor(r.height * dpr));
    heroCtx.setTransform(dpr, 0, 0, dpr, 0, 0); heroCv._w = r.width; heroCv._h = r.height;
  }
  function buildHeroNodes() {
    heroNodes = []; var W = heroCv._w, H = heroCv._h;
    var cols = 7, rows = 4;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      heroNodes.push({ x: (c + 0.5) / cols * W + (Math.random() - 0.5) * 26, y: (r + 0.5) / rows * H + (Math.random() - 0.5) * 26,
        hue: HUES[(r * cols + c) % HUES.length], ph: Math.random() * Math.PI * 2 });
    }
  }
  function drawHeroStatic() {
    if (!heroCtx) return; var W = heroCv._w, H = heroCv._h; heroCtx.clearRect(0, 0, W, H);
    heroNodes.forEach(function (n) { heroCtx.beginPath(); heroCtx.arc(n.x, n.y, 2.4, 0, 6.2832); heroCtx.fillStyle = 'rgba(150,165,200,0.5)'; heroCtx.fill(); });
  }
  function spawnSpark() {
    if (!heroNodes.length) return;
    var src = heroNodes[Math.floor(Math.random() * heroNodes.length)];
    var targets = [];
    var pool = heroNodes.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    pool.forEach(function (t) { if (t !== src) targets.push(t); });
    heroSparks.push({ src: src, targets: targets, t: 0, life: 1 });
  }
  function heroLoop(now) {
    if (!heroVisible || reduceMotion || document.hidden) { heroRAF = 0; return; }
    var dt = heroLast ? Math.min((now - heroLast) / 1000, 0.05) : 0.016; heroLast = now; heroT += dt;
    var W = heroCv._w, H = heroCv._h; heroCtx.clearRect(0, 0, W, H);
    /* 節點呼吸 */
    heroNodes.forEach(function (n) {
      var pulse = 0.5 + 0.5 * Math.sin(heroT * 1.2 + n.ph);
      heroCtx.beginPath(); heroCtx.arc(n.x, n.y, 2 + pulse * 1.1, 0, 6.2832);
      heroCtx.fillStyle = 'rgba(150,165,200,' + (0.28 + pulse * 0.22).toFixed(3) + ')'; heroCtx.fill();
    });
    if (Math.random() < dt * 1.6) spawnSpark();
    heroSparks = heroSparks.filter(function (s) {
      s.t += dt / 1.1; if (s.t >= 1) return false;
      var a = Math.sin(Math.PI * s.t);
      s.targets.forEach(function (tg) {
        heroCtx.beginPath(); heroCtx.moveTo(s.src.x, s.src.y); heroCtx.lineTo(tg.x, tg.y);
        heroCtx.strokeStyle = 'rgba(120,190,255,' + (a * 0.5).toFixed(3) + ')'; heroCtx.lineWidth = 1.2; heroCtx.stroke();
        var px = s.src.x + (tg.x - s.src.x) * s.t, py = s.src.y + (tg.y - s.src.y) * s.t;
        heroCtx.beginPath(); heroCtx.arc(px, py, 2.6, 0, 6.2832); heroCtx.fillStyle = tg.hue; heroCtx.globalAlpha = a; heroCtx.fill(); heroCtx.globalAlpha = 1;
        heroCtx.beginPath(); heroCtx.arc(tg.x, tg.y, 3 + a * 2, 0, 6.2832); heroCtx.fillStyle = tg.hue; heroCtx.globalAlpha = a * 0.7; heroCtx.fill(); heroCtx.globalAlpha = 1;
      });
      return true;
    });
    heroRAF = requestAnimationFrame(heroLoop);
  }
  function startHero() { if (!heroRAF && heroCtx && !reduceMotion) { heroLast = 0; heroRAF = requestAnimationFrame(heroLoop); } }
  function stopHero() { if (heroRAF) { cancelAnimationFrame(heroRAF); heroRAF = 0; } }

  /* ================================================================== *
   * 啟動                                                                *
   * ================================================================== */
  function init() {
    setupBench(); setupScale(); setupBalance(); setupReveal(); initHero();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

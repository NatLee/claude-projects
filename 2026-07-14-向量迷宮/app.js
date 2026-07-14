/* ============================================================
   向量迷宮 · HNSW 近似最近鄰搜尋（教學用簡化版，2D）
   純靜態、零外部資源、可離線。所有計算當場在瀏覽器完成。

   真的做的事：
     - 真的建一個多層 HNSW 圖（隨機分層、啟發式選鄰居、雙向連邊、超額裁剪）
     - 真的做貪婪圖走訪查詢，並逐步記錄「路徑 / 掃過哪些點」
     - 真的做暴力精確搜尋當對照，量化 recall 與掃描比例

   骨架（多層圖 + 由頂層貪婪下降 + 啟發式選鄰居）與 FAISS / Qdrant 等真實庫一致；
   差別只在此處維度低（2D）、規模小（數百點），是為了看得清楚。
   ============================================================ */
(function () {
  'use strict';

  var LS = 'hnsw.';

  /* ---------- 基本工具 ---------- */
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (kids) for (var i = 0; i < kids.length; i++) {
      var c = kids[i]; if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lsGet(k, d) { try { var v = localStorage.getItem(LS + k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) { } }
  function lsNum(k, d) { var v = parseFloat(lsGet(k, d)); return isFinite(v) ? v : d; }

  /* 可重現的 PRNG（給分層用，讓相同參數建出相同的圖） */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 動態偏好：prefers-reduced-motion（含 change 監聽） */
  var reduceMotion = false;
  (function () {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mq.matches;
    var h = function (e) { reduceMotion = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', h);
    else if (mq.addListener) mq.addListener(h);
  })();

  /* 進場 reveal：IntersectionObserver + stagger（≤1.2s） */
  function initReveal() {
    var items = [].slice.call(document.querySelectorAll('[data-reveal]'));
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('in'); });
      return;
    }
    items.forEach(function (n) {
      var d = parseFloat(n.getAttribute('data-delay') || '0');
      n.style.setProperty('--reveal-delay', Math.min(d, 1.2) + 's');
    });
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  /* 數字滾動 */
  function rollNumber(node, to, opt) {
    opt = opt || {};
    var fmt = opt.fmt || function (v) { return Math.round(v).toString(); };
    var from = (typeof node._rv === 'number') ? node._rv : (opt.from || 0);
    node._rv = to;
    if (reduceMotion) { node.textContent = fmt(to); return; }
    var dur = opt.dur || 620, t0 = performance.now();
    if (node._raf) cancelAnimationFrame(node._raf);
    (function frame(t) {
      var p = clamp((t - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (p < 1) node._raf = requestAnimationFrame(frame);
    })(t0);
  }

  /* ---------- 二元堆 ---------- */
  function Heap(cmp) { this.a = []; this.cmp = cmp; }
  Heap.prototype.size = function () { return this.a.length; };
  Heap.prototype.peek = function () { return this.a[0]; };
  Heap.prototype.push = function (x) {
    var a = this.a, i = a.length; a.push(x);
    while (i > 0) { var p = (i - 1) >> 1; if (this.cmp(a[i], a[p]) < 0) { var t = a[i]; a[i] = a[p]; a[p] = t; i = p; } else break; }
  };
  Heap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0, n = a.length;
      while (true) {
        var l = 2 * i + 1, r = 2 * i + 2, s = i;
        if (l < n && this.cmp(a[l], a[s]) < 0) s = l;
        if (r < n && this.cmp(a[r], a[s]) < 0) s = r;
        if (s !== i) { var t = a[i]; a[i] = a[s]; a[s] = t; i = s; } else break;
      }
    }
    return top;
  };

  /* ---------- HNSW ---------- */
  function HNSW(opts) {
    this.M = opts.M;
    this.Mmax = opts.M;
    this.Mmax0 = opts.M * 2;
    this.efc = opts.efConstruction;
    this.mL = 1 / Math.log(Math.max(2, opts.M));
    this.rng = makeRng(opts.seed || 1);
    this.pts = [];       // {id,x,y}
    this.levels = [];    // top level of each node
    this.links = [];     // links[id][layer] = [neighborIds]
    this.entry = -1;
    this.maxLevel = -1;
  }
  HNSW.prototype.d2 = function (a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  HNSW.prototype.randomLevel = function () {
    var r = this.rng(); if (r < 1e-12) r = 1e-12;
    return Math.floor(-Math.log(r) * this.mL);
  };

  // 圖層貪婪搜尋（論文 Algorithm 2）。ctx: {scanned, cnt, onScan}
  HNSW.prototype.searchLayer = function (q, epIds, ef, layer, ctx) {
    var self = this, visited = {};
    var cand = new Heap(function (a, b) { return a.d - b.d; }); // 最近優先
    var res = new Heap(function (a, b) { return b.d - a.d; });  // 最遠優先
    var i, id, d;
    for (i = 0; i < epIds.length; i++) {
      id = epIds[i]; if (visited[id]) continue; visited[id] = 1;
      d = self.d2(q, self.pts[id]);
      if (ctx) { ctx.cnt++; if (ctx.scanned) ctx.scanned[id] = 1; if (ctx.onScan) ctx.onScan(id, -1, layer, d); }
      cand.push({ id: id, d: d }); res.push({ id: id, d: d });
    }
    while (cand.size()) {
      var c = cand.pop(), f = res.peek();
      if (c.d > f.d) break;
      var nb = self.links[c.id][layer];
      if (nb) for (var j = 0; j < nb.length; j++) {
        var e = nb[j]; if (visited[e]) continue; visited[e] = 1;
        var de = self.d2(q, self.pts[e]);
        if (ctx) { ctx.cnt++; if (ctx.scanned) ctx.scanned[e] = 1; if (ctx.onScan) ctx.onScan(e, c.id, layer, de); }
        var fr = res.peek();
        if (de < fr.d || res.size() < ef) {
          cand.push({ id: e, d: de }); res.push({ id: e, d: de });
          if (res.size() > ef) res.pop();
        }
      }
    }
    var out = []; while (res.size()) out.push(res.pop()); out.reverse(); // 最近優先
    return out;
  };

  // 啟發式選鄰居（論文 Algorithm 4：偏好方向多樣的鄰居，撐出「高速公路」）
  HNSW.prototype.selectHeuristic = function (q, C, M) {
    var self = this;
    var W = new Heap(function (a, b) { return a.d - b.d; });
    for (var i = 0; i < C.length; i++) W.push({ id: C[i].id, d: C[i].d });
    var R = [], discarded = [];
    while (W.size() && R.length < M) {
      var e = W.pop(), good = true;
      for (var r = 0; r < R.length; r++) {
        if (self.d2(self.pts[e.id], self.pts[R[r].id]) < e.d) { good = false; break; }
      }
      if (good) R.push(e); else discarded.push(e);
    }
    var di = 0;
    while (R.length < M && di < discarded.length) R.push(discarded[di++]);
    return R;
  };

  HNSW.prototype.insert = function (pt) {
    var id = pt.id;
    this.pts[id] = pt;
    var l = this.randomLevel();
    this.levels[id] = l;
    this.links[id] = [];
    for (var i = 0; i <= l; i++) this.links[id][i] = [];
    if (this.entry === -1) { this.entry = id; this.maxLevel = l; return; }

    var curEp = [this.entry], L = this.maxLevel, lc, W;
    for (lc = L; lc > l; lc--) { W = this.searchLayer(pt, curEp, 1, lc, null); curEp = [W[0].id]; }

    var start = Math.min(L, l);
    for (lc = start; lc >= 0; lc--) {
      var Wc = this.searchLayer(pt, curEp, this.efc, lc, null);
      var Mmax = lc === 0 ? this.Mmax0 : this.Mmax;
      var neigh = this.selectHeuristic(pt, Wc, this.M);
      for (var n = 0; n < neigh.length; n++) {
        var e = neigh[n].id;
        this.links[id][lc].push(e);
        this.links[e][lc].push(id);
        if (this.links[e][lc].length > Mmax) {
          var self = this, ep = e, lyr = lc;
          var cand = this.links[e][lc].map(function (x) { return { id: x, d: self.d2(self.pts[ep], self.pts[x]) }; });
          var kept = this.selectHeuristic(this.pts[e], cand, Mmax);
          this.links[e][lc] = kept.map(function (x) { return x.id; });
          void lyr;
        }
      }
      curEp = Wc.map(function (w) { return w.id; });
    }
    if (l > this.maxLevel) { this.maxLevel = l; this.entry = id; }
  };

  HNSW.prototype.build = function (points) {
    for (var i = 0; i < points.length; i++) this.insert(points[i]);
  };

  // 有記錄的 k-NN 查詢（論文 Algorithm 5 + 逐步事件）
  HNSW.prototype.query = function (q, k, efSearch, instrument) {
    var scanned = {}, events = instrument ? [] : null;
    var best = { id: -1, d: Infinity };
    var onScan = instrument ? function (id, from, layer, d) {
      events.push({ t: 'scan', id: id, from: from, layer: layer });
      if (d < best.d - 1e-15) { events.push({ t: 'hop', from: best.id, to: id, layer: layer }); best = { id: id, d: d }; }
    } : null;
    var ctx = { scanned: scanned, cnt: 0, onScan: onScan };

    var curEp = [this.entry], L = this.maxLevel, lc, W;
    for (lc = L; lc >= 1; lc--) {
      if (events) events.push({ t: 'layer', layer: lc, ep: curEp.slice() });
      W = this.searchLayer(q, curEp, 1, lc, ctx);
      curEp = [W[0].id];
      if (events) events.push({ t: 'descend', from: lc, to: lc - 1, node: curEp[0] });
    }
    if (events) events.push({ t: 'layer', layer: 0, ep: curEp.slice() });
    var ef = Math.max(efSearch, k);
    var W0 = this.searchLayer(q, curEp, ef, 0, ctx);
    var result = W0.slice(0, k);
    if (events) events.push({ t: 'result', nodes: result.map(function (w) { return w.id; }) });

    var cnt = 0; for (var key in scanned) if (scanned.hasOwnProperty(key)) cnt++;
    return { result: result, scanned: scanned, scannedCount: cnt, events: events, distCalcs: ctx.cnt, entry: this.entry, topLevel: L };
  };

  /* ---------- 暴力精確搜尋 ---------- */
  function bruteSearch(pts, q, k) {
    var arr = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i]; if (!p) continue;
      var dx = p.x - q.x, dy = p.y - q.y;
      arr.push({ id: p.id, d: dx * dx + dy * dy });
    }
    arr.sort(function (a, b) { return a.d - b.d; });
    return arr.slice(0, k);
  }

  /* ---------- 撒點分布 ---------- */
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function generate(kind, N) {
    var pts = [], i, x, y, lo = 0.05, hi = 0.95, span = hi - lo;
    function push(px, py) { pts.push({ id: pts.length, x: clamp(px, 0.02, 0.98), y: clamp(py, 0.02, 0.98) }); }
    if (kind === 'uniform') {
      for (i = 0; i < N; i++) push(lo + Math.random() * span, lo + Math.random() * span);
    } else if (kind === 'spiral') {
      for (i = 0; i < N; i++) {
        var tt = i / N, ang = tt * Math.PI * 5.4, rad = 0.06 + tt * 0.42;
        push(0.5 + Math.cos(ang) * rad + gauss() * 0.018, 0.5 + Math.sin(ang) * rad + gauss() * 0.018);
      }
    } else if (kind === 'ring') {
      for (i = 0; i < N; i++) {
        var a = Math.random() * Math.PI * 2, rr = 0.34 + gauss() * 0.045;
        push(0.5 + Math.cos(a) * rr, 0.5 + Math.sin(a) * rr * 0.86);
      }
    } else { // clusters
      var nc = 5, centers = [];
      for (i = 0; i < nc; i++) centers.push({ x: lo + 0.08 + Math.random() * (span - 0.16), y: lo + 0.08 + Math.random() * (span - 0.16) });
      for (i = 0; i < N; i++) {
        var c = centers[i % nc];
        push(c.x + gauss() * 0.058, c.y + gauss() * 0.058);
      }
    }
    return pts;
  }

  /* ============================================================
     App 狀態
     ============================================================ */
  var PAL = { teal: '#57e0d0', violet: '#a99bf5', gold: '#f6c66a', rose: '#f58fb0', green: '#7ee0a6', ink: '#eaf0ff' };
  var SPEED = { slow: 1.7, mid: 1.0, fast: 0.58 };

  var App = {
    params: {
      N: clamp(Math.round(lsNum('N', 240) / 20) * 20, 120, 520),
      M: clamp(Math.round(lsNum('M', 8)), 4, 16),
      efC: clamp(Math.round(lsNum('efC', 40)), 16, 80),
      efS: clamp(Math.round(lsNum('efS', 24)), 8, 64),
      k: clamp(Math.round(lsNum('k', 5)), 1, 10),
      dist: lsGet('dist', 'clusters'),
      view: lsGet('view', 'blend'),
      speed: lsGet('speed', 'mid')
    },
    points: [],
    index: null,
    edgesByLayer: [],  // edgesByLayer[layer] = [{a,b}]
    maxLevel: 0,
    lastQuery: null,   // {x,y}
    lastRun: null,     // query result + brute
    batch: null
  };

  /* ---------- 建索引 ---------- */
  var seedCounter = 1;
  function rebuildIndex(regenPoints) {
    var p = App.params;
    if (regenPoints || App.points.length !== p.N) {
      App.points = generate(p.dist, p.N);
    }
    var idx = new HNSW({ M: p.M, efConstruction: p.efC, seed: (seedCounter++ & 0x7fffffff) || 1 });
    idx.build(App.points);
    App.index = idx;
    App.maxLevel = idx.maxLevel;

    // 建立各層邊清單（去重）
    var byLayer = [];
    for (var id = 0; id < App.points.length; id++) {
      var ls = idx.links[id]; if (!ls) continue;
      for (var lc = 0; lc < ls.length; lc++) {
        if (!byLayer[lc]) byLayer[lc] = [];
        var nb = ls[lc];
        for (var j = 0; j < nb.length; j++) { var b = nb[j]; if (b > id) byLayer[lc].push({ a: id, b: b }); }
      }
    }
    App.edgesByLayer = byLayer;
    runBatch();
  }

  /* ---------- 批次 recall / 掃描比例（誠實儀表板） ---------- */
  function runBatch() {
    var idx = App.index, p = App.params, pts = App.points, N = pts.length;
    var trials = Math.min(60, Math.max(24, Math.round(N / 6)));
    var sumScan = 0, sumTop1 = 0, sumTopK = 0, valid = 0;
    for (var t = 0; t < trials; t++) {
      var q = { x: 0.05 + Math.random() * 0.9, y: 0.05 + Math.random() * 0.9 };
      var h = idx.query(q, p.k, p.efS, false);
      var b = bruteSearch(pts, q, p.k);
      if (!h.result.length || !b.length) continue;
      valid++;
      sumScan += h.scannedCount / N;
      if (h.result[0].id === b[0].id) sumTop1 += 1;
      var bset = {}; for (var i = 0; i < b.length; i++) bset[b[i].id] = 1;
      var hit = 0; for (var j = 0; j < h.result.length; j++) if (bset[h.result[j].id]) hit++;
      sumTopK += hit / b.length;
    }
    valid = valid || 1;
    App.batch = {
      scanFrac: sumScan / valid,
      top1: sumTop1 / valid,
      topK: sumTopK / valid,
      trials: valid,
      N: N,
      avgScan: (sumScan / valid) * N,
      speedup: 1 / (sumScan / valid)
    };
    updateHonest();
  }

  /* ============================================================
     渲染
     ============================================================ */
  var cv, ctx, DPR = 1, CW = 0, CH = 0, PAD = 24;
  function fitCanvas() {
    if (!cv) return;
    var rect = cv.getBoundingClientRect();
    var cssW = Math.max(240, rect.width);
    var cssH = Math.round(cssW * 0.64);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cssW * DPR);
    cv.height = Math.round(cssH * DPR);
    cv.style.height = cssH + 'px';
    CW = cssW; CH = cssH;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function px(pt) { return { x: PAD + pt.x * (CW - 2 * PAD), y: PAD + pt.y * (CH - 2 * PAD) }; }

  // 視覺狀態
  var V = {
    reveal: -1,
    glow: {},        // id -> {c,t}
    hopEdges: [],    // {a,b,c,t}
    pathNodes: [],
    resultIds: [],
    trueNearest: -1,
    hnswNearest: -1,
    hit: false,
    query: null,
    crosshair: null,
    brute: null,     // {prog}
    caption: '點一下畫布放下查詢點，或用鍵盤方向鍵移動準星、按 Enter 放點。'
  };
  function resetReveal() {
    V.reveal = -1; V.glow = {}; V.hopEdges = []; V.pathNodes = [];
    V.resultIds = []; V.hit = false;
  }

  var TL = null; // timeline {events, evTime, end, scans}
  function buildTimeline(events) {
    var scans = 0, i;
    for (i = 0; i < events.length; i++) if (events[i].t === 'scan') scans++;
    var scanDelay = 62;
    if (scans * scanDelay > 2200) scanDelay = Math.max(16, 2200 / scans);
    var mult = SPEED[App.params.speed] || 1;
    var evTime = [], t = 0;
    for (i = 0; i < events.length; i++) {
      var ev = events[i], d;
      if (ev.t === 'layer') d = 300;
      else if (ev.t === 'descend') d = 340;
      else if (ev.t === 'hop') d = 175;
      else if (ev.t === 'scan') d = scanDelay;
      else if (ev.t === 'result') d = 420;
      else d = 60;
      t += d * mult; evTime[i] = t;
    }
    return { events: events, evTime: evTime, end: t + 500, scans: scans };
  }

  function layerName(l) { return l === 0 ? '第 0 層（市區道路）' : '第 ' + l + ' 層（高速公路）'; }
  function applyEvent(ev, playing) {
    if (ev.t === 'scan') {
      if (!V.glow[ev.id]) V.glow[ev.id] = { c: playing ? 0 : 1, t: 1 };
      else V.glow[ev.id].t = 1;
    } else if (ev.t === 'hop') {
      if (ev.from >= 0) V.hopEdges.push({ a: ev.from, b: ev.to, c: playing ? 0 : 1, t: 1 });
      if (!V.pathNodes.length && ev.from >= 0) V.pathNodes.push(ev.from);
      V.pathNodes.push(ev.to);
      V.hnswNearest = ev.to;
    } else if (ev.t === 'layer') {
      if (ev.ep && ev.ep.length && !V.pathNodes.length) V.pathNodes.push(ev.ep[0]);
      V.caption = (ev.layer === App.maxLevel ? '從最頂層入口出發 · ' : '') + '在 ' + layerName(ev.layer) + ' 沿邊往更近的鄰居跳。';
    } else if (ev.t === 'descend') {
      V.caption = '走不動了 → 下降到 ' + layerName(ev.to) + '，用剛才的落點當新入口繼續。';
    } else if (ev.t === 'result') {
      V.resultIds = ev.nodes.slice();
      V.hnswNearest = ev.nodes.length ? ev.nodes[0] : -1;
      V.hit = (V.hnswNearest === V.trueNearest);
      finalizeCaption();
      announce();
    }
  }
  function finalizeCaption() {
    var r = App.lastRun; if (!r) return;
    var s = '鎖定最近鄰。這次只比對了 ' + r.hnsw.scannedCount + ' 個點（共 ' + App.points.length + ' 個）。';
    s += V.hit ? '與精確答案一致。' : '⚠ 這次錯過了真正的最近鄰——這正是「近似」的代價。';
    V.caption = s;
  }

  function revealTo(idx, playing) {
    if (idx < V.reveal) resetReveal();
    for (var i = V.reveal + 1; i <= idx && i < TL.events.length; i++) applyEvent(TL.events[i], playing);
    V.reveal = idx;
  }

  /* ---------- 畫 ---------- */
  function clear() { ctx.clearRect(0, 0, CW, CH); }
  function nodeRadius(lvl) { return 2.4 + Math.min(lvl, 4) * 0.9; }

  function drawEdges() {
    var view = App.params.view, byLayer = App.edgesByLayer, pts = App.points;
    function drawLayer(lc, color, alpha, width) {
      var es = byLayer[lc]; if (!es) return;
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width;
      ctx.beginPath();
      for (var i = 0; i < es.length; i++) {
        var a = px(pts[es[i].a]), b = px(pts[es[i].b]);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    if (view === 'l0') {
      drawLayer(0, PAL.teal, 0.16, 1);
    } else if (view === 'up') {
      for (var lc = 1; lc < byLayer.length; lc++) drawLayer(lc, PAL.violet, 0.24 + lc * 0.12, 1.1 + lc * 0.25);
    } else { // blend
      drawLayer(0, PAL.teal, 0.10, 1);
      for (var lu = 1; lu < byLayer.length; lu++) drawLayer(lu, PAL.violet, 0.20 + lu * 0.13, 1.1 + lu * 0.3);
    }
    ctx.globalAlpha = 1;
  }

  function drawSearchOverlay() {
    var pts = App.points, i;
    // 已走過的圖邊（探索扇形）
    ctx.lineWidth = 1.1;
    for (i = 0; i < V.hopEdges.length; i++) {
      var h = V.hopEdges[i], a = px(pts[h.a]), b = px(pts[h.b]);
      ctx.strokeStyle = PAL.gold; ctx.globalAlpha = 0.34 * h.c;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 掃過的點：暖色光暈
    for (var id in V.glow) {
      if (!V.glow.hasOwnProperty(id)) continue;
      var g = V.glow[id], p = px(pts[id]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, 6.283);
      ctx.fillStyle = PAL.gold; ctx.globalAlpha = 0.14 * g.c; ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 最佳路徑（貪婪走訪的軌跡）
    if (V.pathNodes.length > 1) {
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.92;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      var p0 = px(pts[V.pathNodes[0]]); ctx.moveTo(p0.x, p0.y);
      for (i = 1; i < V.pathNodes.length; i++) { var pn = px(pts[V.pathNodes[i]]); ctx.lineTo(pn.x, pn.y); }
      ctx.stroke(); ctx.globalAlpha = 1;
      // 入口標記
      ctx.beginPath(); ctx.arc(p0.x, p0.y, 5.5, 0, 6.283);
      ctx.strokeStyle = PAL.violet; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function drawNodes() {
    var pts = App.points, lv = App.index ? App.index.levels : [];
    for (var i = 0; i < pts.length; i++) {
      var p = px(pts[i]), lvl = lv[i] || 0, r = nodeRadius(lvl);
      var scanned = V.glow[i];
      if (lvl >= 1) { ctx.fillStyle = PAL.violet; ctx.globalAlpha = 0.55 + Math.min(lvl, 3) * 0.14; }
      else { ctx.fillStyle = PAL.teal; ctx.globalAlpha = 0.5; }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
      if (scanned) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 0.6, 0, 6.283);
        ctx.fillStyle = PAL.gold; ctx.globalAlpha = 0.9 * scanned.c; ctx.fill();
      }
      // 暴力掃描波
      if (V.brute) {
        var w = clamp(1 - Math.abs(V.brute.prog - pts[i].x) * 6, 0, 1);
        if (w > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.5, 0, 6.283); ctx.fillStyle = PAL.rose; ctx.globalAlpha = 0.75 * w; ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  }

  function ring(p, rad, color, w) { ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.283); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); }
  function drawResults() {
    var pts = App.points, i, p;
    for (i = 0; i < V.resultIds.length; i++) { p = px(pts[V.resultIds[i]]); ring(p, 8, PAL.gold, 2); }
    if (V.trueNearest >= 0 && V.resultIds.length) {
      p = px(pts[V.trueNearest]);
      ring(p, 11.5, V.hit ? PAL.green : PAL.rose, 2.4);
    }
  }
  function drawQuery() {
    if (V.crosshair) {
      var c = px(V.crosshair);
      ctx.strokeStyle = PAL.gold; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x + 10, c.y); ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y + 10); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (V.query) {
      var q = px(V.query), t = (performance.now() % 1600) / 1600, pr = reduceMotion ? 0.5 : t;
      ctx.beginPath(); ctx.arc(q.x, q.y, 6 + pr * 12, 0, 6.283);
      ctx.strokeStyle = PAL.gold; ctx.globalAlpha = 0.5 * (1 - pr); ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
      // 菱形
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PAL.gold; ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = '#0a0f20'; ctx.lineWidth = 1.5; ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
    }
  }

  function draw() {
    if (!ctx) return;
    clear();
    drawEdges();
    drawSearchOverlay();
    drawNodes();
    drawResults();
    drawQuery();
  }

  /* ============================================================
     動畫迴圈（rAF；隱藏 / 離屏 / reduced-motion 時暫停）
     ============================================================ */
  var alive = true, rafId = 0, lastT = 0, animTime = 0, wantPlay = false;
  function needLoop() {
    if (V.brute) return true;
    if (wantPlay && TL && animTime < TL.end) return true;
    // 光暈或路徑的淡入尚未收斂時（查詢脈動不獨立驅動迴圈，以免閒置時空轉）
    for (var id in V.glow) if (V.glow.hasOwnProperty(id) && Math.abs(V.glow[id].c - V.glow[id].t) > 0.01) return true;
    for (var i = 0; i < V.hopEdges.length; i++) if (Math.abs(V.hopEdges[i].c - V.hopEdges[i].t) > 0.01) return true;
    return false;
  }
  function ease(o, dt) { o.c += (o.t - o.c) * Math.min(1, dt / 150); }
  function tick(now) {
    rafId = 0;
    var dt = Math.min(64, now - lastT); lastT = now;
    if (wantPlay && TL) {
      animTime += dt;
      var idx = V.reveal;
      while (idx + 1 < TL.events.length && TL.evTime[idx + 1] <= animTime) idx++;
      if (idx !== V.reveal) revealTo(idx, true);
      if (animTime >= TL.end) { wantPlay = false; syncPlayBtn(); }
    }
    var id;
    for (id in V.glow) if (V.glow.hasOwnProperty(id)) ease(V.glow[id], dt);
    for (var i = 0; i < V.hopEdges.length; i++) ease(V.hopEdges[i], dt);
    if (V.brute) {
      V.brute.prog += dt / 900;
      if (V.brute.prog > 1.25) { V.brute = null; }
    }
    draw();
    ensureLoop();
  }
  function ensureLoop() {
    if (!alive) return;
    if (!rafId && needLoop()) { lastT = performance.now(); rafId = requestAnimationFrame(tick); }
  }
  function stopLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }

  /* ---------- 執行搜尋 ---------- */
  function runQuery(qx, qy, doPlay) {
    if (!App.index) return;
    V.query = { x: qx, y: qy };
    var p = App.params, q = V.query;
    var brute = bruteSearch(App.points, q, p.k);
    var hnsw = App.index.query(q, p.k, p.efS, true);
    App.lastQuery = { x: qx, y: qy };
    App.lastRun = { hnsw: hnsw, brute: brute };
    V.trueNearest = brute.length ? brute[0].id : -1;
    V.brute = null;

    resetReveal();
    TL = buildTimeline(hnsw.events);
    animTime = 0;

    updatePanel(hnsw, brute);

    if (reduceMotion || !doPlay) {
      revealTo(TL.events.length - 1, false);
      wantPlay = false; syncPlayBtn(); draw(); ensureLoop();
    } else {
      wantPlay = true; syncPlayBtn(); ensureLoop();
    }
  }

  function nextSignificant(from) {
    for (var i = from + 1; i < TL.events.length; i++) {
      var tt = TL.events[i].t;
      if (tt === 'hop' || tt === 'descend' || tt === 'layer' || tt === 'result') return i;
    }
    return TL.events.length - 1;
  }

  /* ============================================================
     面板統計（本次查詢）
     ============================================================ */
  var elBig, elOf, elPct, elHops, elCmpH, elCmpB, elCmpHn, elCmpBn, elVerdict, elLive;
  function updatePanel(hnsw, brute) {
    var N = App.points.length;
    rollNumber(elBig, hnsw.scannedCount, { fmt: function (v) { return Math.round(v).toString(); } });
    elOf.textContent = '／ 共 ' + N + ' 個點';
    rollNumber(elPct, hnsw.scannedCount / N * 100, { fmt: function (v) { return v.toFixed(1) + '%'; } });
    var hops = Math.max(0, V.pathNodes.length ? V.pathNodes.length - 1 : 0);
    // pathNodes 尚未於逐步前建好；用事件推估
    var hopCount = 0; for (var i = 0; i < hnsw.events.length; i++) if (hnsw.events[i].t === 'hop') hopCount++;
    rollNumber(elHops, hopCount, { fmt: function (v) { return Math.round(v).toString(); } });
    void hops;
    // 比較條
    var hFrac = hnsw.scannedCount / N;
    setBar(elCmpH, hFrac); setBar(elCmpB, 1);
    elCmpHn.textContent = hnsw.scannedCount; elCmpBn.textContent = N;
    // 判定
    var hit = brute.length && hnsw.result.length && hnsw.result[0].id === brute[0].id;
    elVerdict.className = 'verdict ' + (hit ? 'hit' : 'miss');
    elVerdict.querySelector('.ic').textContent = hit ? '✓' : '⚠';
    elVerdict.querySelector('.txt').innerHTML = hit
      ? 'HNSW 找到的最近鄰<b>與精確答案一致</b>。'
      : 'HNSW 這次<b>錯過了真正的最近鄰</b>——近似的代價。';
  }
  function setBar(node, frac) {
    if (reduceMotion) { node.style.transform = 'scaleX(' + frac + ')'; return; }
    node.style.transform = 'scaleX(0)';
    requestAnimationFrame(function () { node.style.transform = 'scaleX(' + clamp(frac, 0, 1) + ')'; });
  }
  function announce() {
    if (!elLive || !App.lastRun) return;
    var r = App.lastRun, N = App.points.length;
    var msg = 'HNSW 從第 ' + r.hnsw.topLevel + ' 層入口出發，比對了 ' + r.hnsw.scannedCount + ' 個點，共 ' + N + ' 個。';
    msg += V.hit ? '找到的最近鄰與精確搜尋一致。' : '這次錯過了真正的最近鄰，示範了近似搜尋的代價。';
    elLive.textContent = msg;
  }

  /* ---------- 暴力對照動畫 ---------- */
  function runBrute() {
    if (!V.query) { var qx = 0.2 + Math.random() * 0.6, qy = 0.2 + Math.random() * 0.6; runQuery(qx, qy, false); }
    var N = App.points.length;
    V.caption = '暴力精確搜尋：把 ' + N + ' 個點全部掃一遍，保證找到真正的最近鄰。';
    if (reduceMotion) { setBar(elCmpB, 1); elCmpBn.textContent = N; draw(); return; }
    V.brute = { prog: -0.15 };
    ensureLoop();
  }

  /* ============================================================
     UI 組裝：迷宮卡
     ============================================================ */
  var playBtn;
  function syncPlayBtn() {
    if (!playBtn) return;
    playBtn.textContent = (wantPlay ? '⏸ 暫停' : '▶ 播放搜尋');
    playBtn.setAttribute('aria-pressed', wantPlay ? 'true' : 'false');
  }

  function seg(label, opts, current, onPick) {
    var box = el('div', { class: 'seg', role: 'group', 'aria-label': label });
    opts.forEach(function (o) {
      var b = el('button', { type: 'button', text: o.label, 'aria-pressed': (o.v === current) ? 'true' : 'false' });
      b.addEventListener('click', function () {
        [].forEach.call(box.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        onPick(o.v);
      });
      box.appendChild(b);
    });
    return box;
  }
  function slider(id, label, min, max, step, val, unit, onInput) {
    var valEl = el('span', { class: 'val', text: val + (unit || '') });
    var input = el('input', { type: 'range', id: id, min: min, max: max, step: step, value: val, 'aria-label': label });
    var lab = el('label', { class: 'ctl-label', 'for': id }, [document.createTextNode(label), valEl]);
    var group = el('div', { class: 'ctl-group' }, [lab, input]);
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      valEl.textContent = v + (unit || '');
      onInput(v);
    });
    return { group: group, input: input, valEl: valEl, unit: unit };
  }

  var debounceTimer = 0;
  function debounce(fn, ms) { clearTimeout(debounceTimer); debounceTimer = setTimeout(fn, ms); }

  function buildMaze(mount) {
    var p = App.params;

    /* stage */
    cv = el('canvas', { tabindex: '0', role: 'application', 'aria-label': '向量迷宮：HNSW 圖與搜尋動畫。用方向鍵移動查詢準星，Enter 放下查詢點並搜尋。' });
    ctx = cv.getContext('2d');
    var badges = el('div', { class: 'stage-badges' }, [
      el('span', { class: 'badge l0' }, [el('span', { class: 'dot' }), '第0層 · 市區短邊']),
      el('span', { class: 'badge lup' }, [el('span', { class: 'dot' }), '上層 · 高速公路']),
      el('span', { class: 'badge q' }, [el('span', { class: 'dot' }), '查詢點與路徑'])
    ]);
    var caption = el('div', { class: 'stage-caption', id: 'maze-cap', text: V.caption });
    var stage = el('div', { class: 'maze-stage' }, [cv, badges, caption]);

    /* 面板 */
    var distSeg = seg('點的分布', [
      { v: 'clusters', label: '群聚' }, { v: 'uniform', label: '均勻' },
      { v: 'spiral', label: '螺旋' }, { v: 'ring', label: '環形' }
    ], p.dist, function (v) { p.dist = v; lsSet('dist', v); rebuildIndex(true); redrawIdle(); });

    var viewSeg = seg('圖層檢視', [
      { v: 'blend', label: '疊合' }, { v: 'l0', label: '第0層' }, { v: 'up', label: '上層' }
    ], p.view, function (v) { p.view = v; lsSet('view', v); draw(); });

    var speedSeg = seg('播放速度', [
      { v: 'slow', label: '慢' }, { v: 'mid', label: '中' }, { v: 'fast', label: '快' }
    ], p.speed, function (v) { p.speed = v; lsSet('speed', v); if (App.lastRun) { TL = buildTimeline(App.lastRun.hnsw.events); } });

    var sN = slider('s-n', '點數 N', 120, 520, 20, p.N, '', function (v) { p.N = v; lsSet('N', v); debounce(function () { rebuildIndex(true); redrawIdle(); }, 110); });
    var sM = slider('s-m', '每點鄰居 M', 4, 16, 1, p.M, '', function (v) { p.M = v; lsSet('M', v); debounce(function () { rebuildIndex(false); redrawIdle(); }, 110); });
    var sEfc = slider('s-efc', '建圖 efConstruction', 16, 80, 4, p.efC, '', function (v) { p.efC = v; lsSet('efC', v); debounce(function () { rebuildIndex(false); redrawIdle(); }, 110); });
    var sEfs = slider('s-efs', '查詢 efSearch', 8, 64, 2, p.efS, '', function (v) { p.efS = v; lsSet('efS', v); debounce(function () { runBatch(); rerunLast(); }, 90); });
    var sK = slider('s-k', '要找幾個 k', 1, 10, 1, p.k, '', function (v) { p.k = v; lsSet('k', v); debounce(function () { runBatch(); rerunLast(); }, 90); });

    /* 按鈕 */
    var bRandom = el('button', { class: 'btn primary', type: 'button' }, ['🎯 放隨機查詢點']);
    playBtn = el('button', { class: 'btn', type: 'button', 'aria-pressed': 'false' }, ['▶ 播放搜尋']);
    var bStep = el('button', { class: 'btn', type: 'button' }, ['⏭ 步進']);
    var bReplay = el('button', { class: 'btn ghost', type: 'button', 'aria-label': '重播' }, ['↺']);
    var bBrute = el('button', { class: 'btn rose', type: 'button' }, ['🐌 暴力精確搜尋']);
    var bRescatter = el('button', { class: 'btn ghost', type: 'button' }, ['🔀 重新撒點']);

    bRandom.addEventListener('click', function () { runQuery(0.14 + Math.random() * 0.72, 0.14 + Math.random() * 0.72, true); cv.focus(); });
    playBtn.addEventListener('click', function () {
      if (!TL) { runQuery(0.14 + Math.random() * 0.72, 0.14 + Math.random() * 0.72, true); return; }
      if (!wantPlay) { if (animTime >= TL.end) { resetReveal(); animTime = 0; } wantPlay = true; } else wantPlay = false;
      syncPlayBtn(); ensureLoop();
    });
    bStep.addEventListener('click', function () {
      if (!TL) { runQuery(0.14 + Math.random() * 0.72, 0.14 + Math.random() * 0.72, false); }
      wantPlay = false; syncPlayBtn();
      if (V.reveal >= TL.events.length - 1) { resetReveal(); }
      var ni = nextSignificant(V.reveal);
      revealTo(ni, false); animTime = TL.evTime[ni]; draw(); ensureLoop();
    });
    bReplay.addEventListener('click', function () { if (!TL) return; resetReveal(); animTime = 0; wantPlay = !reduceMotion; if (reduceMotion) revealTo(TL.events.length - 1, false); syncPlayBtn(); draw(); ensureLoop(); });
    bBrute.addEventListener('click', function () { runBrute(); });
    bRescatter.addEventListener('click', function () { rebuildIndex(true); V.query = null; V.crosshair = null; TL = null; App.lastRun = null; resetReveal(); resetPanel(); redrawIdle(); });

    /* 統計區 */
    elBig = el('span', { class: 'big', text: '—' });
    elOf = el('span', { class: 'of', text: '／ 共 ' + p.N + ' 個點' });
    elPct = el('span', { class: 'pct', text: '—' });
    var statHero = el('div', { class: 'stat-hero' }, [elBig, elOf, elPct]);
    var statLabel = el('div', { class: 'stat-label', text: '這次查詢 · HNSW 比對過的點' });

    elHops = el('span', { class: 'val', text: '—' });
    var hopsLine = el('div', { class: 'ctl-label' }, [document.createTextNode('貪婪路徑跳了幾步'), elHops]);

    elCmpH = el('div', { class: 'cmp-fill h' }); elCmpB = el('div', { class: 'cmp-fill b' });
    elCmpHn = el('span', { class: 'n', text: '—' }); elCmpBn = el('span', { class: 'n', text: '—' });
    var compare = el('div', { class: 'compare' }, [
      el('div', { class: 'cmp-row' }, [el('span', { class: 'tag h', text: 'HNSW' }), el('div', { class: 'cmp-track' }, [elCmpH]), elCmpHn]),
      el('div', { class: 'cmp-row' }, [el('span', { class: 'tag b', text: '暴力' }), el('div', { class: 'cmp-track' }, [elCmpB]), elCmpBn])
    ]);

    elVerdict = el('div', { class: 'verdict' }, [el('span', { class: 'ic', text: '·' }), el('span', { class: 'txt', html: '放下查詢點，看 HNSW 找得對不對。' })]);
    elLive = el('div', { class: 'sr-only', 'aria-live': 'polite' });

    var stats = el('div', { class: 'stats' }, [statLabel, statHero, hopsLine, compare, elVerdict, elLive]);

    var panel = el('div', { class: 'maze-panel' }, [
      distSeg,
      el('div', { class: 'btn-row' }, [bRandom]),
      el('div', { class: 'btn-row' }, [playBtn, bStep, bReplay]),
      el('div', { class: 'btn-row' }, [bBrute, bRescatter]),
      sN.group, sM.group, sEfc.group, sEfs.group, sK.group,
      el('div', { class: 'ctl-group' }, [el('div', { class: 'ctl-label', text: '圖層檢視' }), viewSeg]),
      el('div', { class: 'ctl-group' }, [el('div', { class: 'ctl-label', text: '播放速度' }), speedSeg]),
      stats
    ]);

    mount.appendChild(el('div', { class: 'maze', 'data-reveal': '1' }, [stage, panel]));

    /* 互動：點擊放點 */
    function toNorm(cx, cy) {
      var rect = cv.getBoundingClientRect();
      var x = (cx - rect.left - PAD) / (CW - 2 * PAD);
      var y = (cy - rect.top - PAD) / (CH - 2 * PAD);
      return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    }
    cv.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); var n = toNorm(ev.clientX, ev.clientY);
      V.crosshair = null; runQuery(n.x, n.y, true); cv.focus();
    });
    /* 鍵盤：方向鍵移動準星、Enter 放點、空白鍵播放/暫停、句號步進 */
    cv.addEventListener('keydown', function (ev) {
      var stepPx = ev.shiftKey ? 0.08 : 0.025;
      if (!V.crosshair) V.crosshair = V.query ? { x: V.query.x, y: V.query.y } : { x: 0.5, y: 0.5 };
      var handled = true;
      switch (ev.key) {
        case 'ArrowLeft': V.crosshair.x = clamp(V.crosshair.x - stepPx, 0, 1); break;
        case 'ArrowRight': V.crosshair.x = clamp(V.crosshair.x + stepPx, 0, 1); break;
        case 'ArrowUp': V.crosshair.y = clamp(V.crosshair.y - stepPx, 0, 1); break;
        case 'ArrowDown': V.crosshair.y = clamp(V.crosshair.y + stepPx, 0, 1); break;
        case 'Enter': case ' ':
          if (ev.key === ' ' && V.query && TL) { wantPlay = !wantPlay; syncPlayBtn(); ensureLoop(); }
          else { var c = V.crosshair; V.crosshair = null; runQuery(c.x, c.y, true); }
          break;
        case '.': bStepTrigger(); break;
        default: handled = false;
      }
      if (handled) { ev.preventDefault(); draw(); ensureLoop(); }
    });
    function bStepTrigger() { bStep.click(); }

    // 對外
    App._redrawIdle = redrawIdle;
    App._sliders = { N: sN, M: sM, efc: sEfc, efs: sEfs, k: sK };
    App._resetPanel = resetPanel;

    function resetPanel() {
      elBig.textContent = '—'; elBig._rv = 0; elPct.textContent = '—'; elPct._rv = 0;
      elHops.textContent = '—'; elHops._rv = 0;
      elCmpHn.textContent = '—'; elCmpBn.textContent = '—';
      setBar(elCmpH, 0); setBar(elCmpB, 0);
      elVerdict.className = 'verdict';
      elVerdict.querySelector('.ic').textContent = '·';
      elVerdict.querySelector('.txt').innerHTML = '放下查詢點，看 HNSW 找得對不對。';
      elOf.textContent = '／ 共 ' + App.points.length + ' 個點';
    }

    /* 可見性：離屏 / 分頁隱藏時暫停 rAF */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (e) {
        alive = e[0].isIntersecting && !document.hidden;
        if (alive) ensureLoop(); else stopLoop();
      }, { threshold: 0 });
      io.observe(stage);
    }
    document.addEventListener('visibilitychange', function () {
      alive = !document.hidden;
      if (alive) { fitCanvas(); draw(); ensureLoop(); } else stopLoop();
    });
    window.addEventListener('resize', function () { debounce(function () { fitCanvas(); draw(); }, 120); });
  }
  var resetPanel; // hoisted reference set below
  function redrawIdle() {
    // 重建後：若有上次查詢就重跑，否則畫靜態
    if (App._sliders) { App._sliders.N.valEl.textContent = App.params.N; }
    fitCanvas();
    if (App.lastQuery) runQuery(App.lastQuery.x, App.lastQuery.y, false);
    else { V.caption = '點一下畫布放下查詢點，或用鍵盤方向鍵移動準星、按 Enter 放點。'; draw(); }
    updateCaptionEl();
  }
  function rerunLast() { if (App.lastQuery) runQuery(App.lastQuery.x, App.lastQuery.y, false); }
  function resetPanelWrap() { if (App._resetPanel) App._resetPanel(); }
  resetPanel = resetPanelWrap;

  function updateCaptionEl() {
    var capEl = document.getElementById('maze-cap');
    if (capEl) { capEl.textContent = V.caption; }
  }

  /* 每幀同步 caption（低頻） */
  var lastCap = '';
  function capLoop() {
    if (V.caption !== lastCap) {
      lastCap = V.caption; var capEl = document.getElementById('maze-cap');
      if (capEl) { capEl.textContent = V.caption; capEl.classList.toggle('pulse', /鎖定|錯過/.test(V.caption)); }
    }
    setTimeout(capLoop, 120);
  }

  /* ============================================================
     誠實儀表板（批次 recall / 掃描比例）
     ============================================================ */
  var hTileScan, hTileScanSub, hTileSpeed, hTop1, hTopK, hTake;
  function buildHonest(mount) {
    hTileScan = el('div', { class: 'rc' }, [
      el('div', { class: 'k', text: 'HNSW 平均掃描' }),
      hTileScanSub = el('div', { class: 'v', text: '—' })
    ]);
    var tileBrute = el('div', { class: 'rc' }, [
      el('div', { class: 'k', text: '暴力精確掃描' }),
      el('div', { class: 'v', text: '100%' })
    ]);
    hTileSpeed = el('div', { class: 'rc' }, [
      el('div', { class: 'k', text: '少比對倍數' }),
      el('div', { class: 'v' }, [el('span', { id: 'h-speed', text: '—' })])
    ]);
    var tileTrials = el('div', { class: 'rc' }, [
      el('div', { class: 'k', text: '本批次查詢數' }),
      el('div', { class: 'v', id: 'h-trials', text: '—' })
    ]);
    var row1 = el('div', { class: 'recall' }, [hTileScan, tileBrute, hTileSpeed, tileTrials]);

    hTop1 = el('div', { class: 'rc' }, [
      el('div', { class: 'k', text: 'top-1 recall' }),
      el('div', { class: 'v', id: 'h-top1', text: '—' })
    ]);
    hTopK = el('div', { class: 'rc' }, [
      el('div', { class: 'k', text: 'top-k recall' }),
      el('div', { class: 'v', id: 'h-topk', text: '—' })
    ]);
    var row2 = el('div', { class: 'recall' }, [hTop1, hTopK]);

    hTake = el('p', { class: 'recall-note', text: '調整上面的參數，這裡會即時重算。' });

    mount.appendChild(el('div', { class: 'maze-panel', 'data-reveal': '1', style: 'gap:14px' }, [
      el('div', { class: 'stat-label', text: '對目前這批點與參數，隨機丟數十個查詢的平均表現' }),
      row1, row2, hTake
    ]));
  }
  function updateHonest() {
    if (!hTileScanSub || !App.batch) return;
    var b = App.batch;
    var elScan = hTileScanSub;
    rollNumber(elScan, b.scanFrac * 100, { fmt: function (v) { return v.toFixed(1) + '%'; } });
    var elSpeed = document.getElementById('h-speed');
    if (elSpeed) rollNumber(elSpeed, b.speedup, { fmt: function (v) { return '× ' + (v >= 10 ? Math.round(v) : v.toFixed(1)); } });
    var elTrials = document.getElementById('h-trials'); if (elTrials) elTrials.textContent = b.trials + ' 個';
    var elT1 = document.getElementById('h-top1'); if (elT1) rollNumber(elT1, b.top1 * 100, { fmt: function (v) { return v.toFixed(0) + '%'; } });
    var elTk = document.getElementById('h-topk'); if (elTk) rollNumber(elTk, b.topK * 100, { fmt: function (v) { return v.toFixed(0) + '%'; } });
    if (hTake) {
      hTake.innerHTML = '意思是：HNSW 平均只比對了約 <b>' + Math.round(b.avgScan) + '</b> 個點（總共 ' + b.N +
        ' 個），卻在 <b>' + (b.top1 * 100).toFixed(0) + '%</b> 的查詢裡拿到和暴力搜尋一模一樣的最近鄰。' +
        '把點數 N 調大，掃描比例會繼續往下掉。';
    }
  }

  /* ============================================================
     Boot
     ============================================================ */
  function boot() {
    var mazeMount = document.getElementById('maze-mount');
    var honestMount = document.getElementById('honest-mount');
    if (!mazeMount) return;

    buildMaze(mazeMount);
    if (honestMount) buildHonest(honestMount);

    rebuildIndex(true);
    fitCanvas();
    draw(); // 先把整座圖畫出來
    // 開場：放一個示範查詢（尊重 reduced-motion）
    setTimeout(function () {
      fitCanvas();
      runQuery(0.7, 0.32, !reduceMotion);
    }, reduceMotion ? 0 : 520);

    initReveal();
    startCapLoop();
  }
  function startCapLoop() { capLoop(); }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  /* 供 Node 測試取用純演算法核心（瀏覽器端不受影響） */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HNSW: HNSW, Heap: Heap, bruteSearch: bruteSearch, generate: generate, makeRng: makeRng };
  }
})();

/* ══════════════════════════════════════════════════════
   遺忘曲線 · Recall
   Ebbinghaus (1885) + SuperMemo SM-2 (Woźniak, 1987)
   純前端 · 零外部資源 · 資料只存 localStorage（前綴 recall.）
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────── 常數 ─────────── */
  var NS = 'recall.';
  var K_CARDS = NS + 'cards';
  var K_SEEN = NS + 'seenDemo';
  var EF_INIT = 2.5;
  var EF_MIN = 1.3;
  var TARGET_R = 0.9;                 // SM-2 的排程目標：下次複習時約剩 90%
  var LN_TARGET = -Math.log(TARGET_R); // ≈ 0.10536
  var FC_DAYS = 45;

  /* ─────────── 動態偏好：減少動態 ─────────── */
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mqReduce.matches;
  function onReduceChange(e) {
    reduce = e.matches;
    document.body.classList.toggle('no-motion', reduce);
    drawAll(); // 立刻以最終狀態重畫
  }
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduceChange);
  else if (mqReduce.addListener) mqReduce.addListener(onReduceChange);

  /* ─────────── 本地日期工具（不碰 UTC，避免差一天） ─────────── */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function keyOf(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayKey() { return keyOf(new Date()); }

  function parseKey(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);          // 本地午夜
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  // 以本地日曆日加天數；跨月、跨年、跨日光節約都正確
  function addDays(key, n) {
    var d = parseKey(key);
    if (!d) return null;
    return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }
  // b - a，以「日曆日」為單位（用 UTC 常數化避免 DST 造成 23/25 小時誤差）
  function daysBetween(a, b) {
    var da = parseKey(a), db = parseKey(b);
    if (!da || !db) return 0;
    var ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
    var ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
    return Math.round((ub - ua) / 86400000);
  }
  function fmtDue(key) {
    var d = daysBetween(todayKey(), key);
    if (d === 0) return '今天';
    if (d === 1) return '明天';
    if (d < 0) return '逾期 ' + (-d) + ' 天';
    if (d < 7) return d + ' 天後';
    var p = parseKey(key);
    return (p.getMonth() + 1) + '/' + p.getDate() + '（' + d + ' 天後）';
  }

  /* ═════════════════════════════════════════
     SM-2（Woźniak 1987）
     I(1)=1, I(2)=6, I(n)=I(n-1)×EF（有小數進位）
     EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02))，下限 1.3
     q < 3 → 間隔與複習次數歸零重來（EF 仍更新）
     ═════════════════════════════════════════ */
  function efDelta(q) {
    return 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  }
  function round3(x) { return Math.round(x * 1000) / 1000; }

  function sm2(state, q) {
    var prevEF = state.ef, prevInt = state.interval, prevReps = state.reps;
    var reps, interval;
    if (q >= 3) {
      if (prevReps === 0) interval = 1;
      else if (prevReps === 1) interval = 6;
      else interval = Math.ceil(prevInt * prevEF);   // 原文：round it up
      reps = prevReps + 1;
    } else {
      reps = 0;
      interval = 1;
    }
    var ef = prevEF + efDelta(q);
    if (ef < EF_MIN) ef = EF_MIN;
    return {
      ef: round3(ef), interval: interval, reps: reps,
      prevEF: prevEF, prevInt: prevInt, prevReps: prevReps,
      delta: round3(efDelta(q)), lapsed: q < 3
    };
  }

  /* 教學用留存模型：R(t)=e^(−t/S)，令 R(I)=0.9 → S = I / −ln0.9 */
  function stability(interval, ef) {
    var i = Math.max(interval || 0, 0.6);
    return i / LN_TARGET;
  }
  function retention(elapsed, S) {
    if (elapsed <= 0) return 1;
    return Math.exp(-elapsed / S);
  }
  function halfLife(S) { return S * Math.LN2; }

  /* ═════════════════════════════════════════
     儲存（防呆：解析失敗絕不覆蓋原始位元組）
     ═════════════════════════════════════════ */
  var cards = [];
  var storeNote = '';

  function normCard(o) {
    if (!o || typeof o !== 'object') return null;
    var front = String(o.front == null ? '' : o.front).slice(0, 400).trim();
    var back = String(o.back == null ? '' : o.back).slice(0, 400).trim();
    if (!front || !back) return null;
    var ef = Number(o.ef);
    if (!isFinite(ef) || ef < EF_MIN) ef = (isFinite(ef) && ef > 0) ? EF_MIN : EF_INIT;
    var reps = Math.max(0, Math.floor(Number(o.reps) || 0));
    var interval = Math.max(0, Math.floor(Number(o.interval) || 0));
    var due = parseKey(o.due) ? o.due : todayKey();
    var last = parseKey(o.last) ? o.last : null;
    var lapses = Math.max(0, Math.floor(Number(o.lapses) || 0));
    return {
      id: String(o.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8))),
      front: front, back: back,
      ef: round3(ef), reps: reps, interval: interval,
      due: due, last: last, lapses: lapses,
      created: parseKey(o.created) ? o.created : todayKey()
    };
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(K_CARDS); }
    catch (e) { storeNote = '瀏覽器不允許讀取 localStorage（無痕模式？）——這一輪的卡片不會被保存。'; return []; }
    if (raw === null || raw === '') return [];
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      // 絕不覆蓋：先把原始字串完整搬到備份鍵，再從空牌組開始
      var bk = NS + 'corrupt.' + Date.now();
      try { localStorage.setItem(bk, raw); } catch (e2) { /* 空間不足也不動原檔 */ }
      storeNote = '偵測到儲存資料損毀，已原封不動備份到 localStorage 的「' + bk + '」，未覆蓋任何原始位元組。';
      return [];
    }
    var arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.cards) ? parsed.cards : null);
    if (!arr) {
      var bk2 = NS + 'corrupt.' + Date.now();
      try { localStorage.setItem(bk2, raw); } catch (e3) { /* noop */ }
      storeNote = '儲存資料格式不符，已備份到「' + bk2 + '」。';
      return [];
    }
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var c = normCard(arr[i]);
      if (c) out.push(c);
    }
    return out;
  }

  function save() {
    try {
      localStorage.setItem(K_CARDS, JSON.stringify(cards));
      return true;
    } catch (e) {
      msg('存不進去了（空間不足或瀏覽器封鎖）。請立刻「匯出 JSON 備份」，資料還在畫面上。', true);
      return false;
    }
  }

  /* ═════════════════════════════════════════
     DOM
     ═════════════════════════════════════════ */
  var $ = function (id) { return document.getElementById(id); };
  var elDue = $('s-due'), elLate = $('s-late'), elTotal = $('s-total'), elHealth = $('s-health');
  var elFcEmpty = $('forecast-empty'), elFcNote = $('forecast-note');
  var elReview = $('review'), elFlip = $('flip'), elFlipInner = $('flip-inner');
  var elFront = $('face-front'), elBack = $('face-back');
  var elGrades = $('grades'), elResult = $('result'), elDone = $('done');
  var elPos = $('rv-pos'), elFill = $('rv-fill');
  var elMEf = $('m-ef'), elMInt = $('m-int'), elMNext = $('m-next');
  var elResLive = $('res-live'), elResFlat = $('res-flat'), elDoneSub = $('done-sub');
  var elTbody = $('tbody'), elDeckEmpty = $('deck-empty'), elDataMsg = $('data-msg');
  var cvFc = $('c-forecast'), cvCard = $('c-card'), cvEbb = $('c-ebb');

  function msg(t, isErr) {
    elDataMsg.textContent = t;
    elDataMsg.classList.toggle('err', !!isErr);
    if (t) {
      clearTimeout(msg._t);
      msg._t = setTimeout(function () { elDataMsg.textContent = ''; elDataMsg.classList.remove('err'); }, 6500);
    }
  }

  /* ═════════════════════════════════════════
     Canvas 基礎
     ═════════════════════════════════════════ */
  var COL = {
    grid: 'rgba(255,255,255,.07)',
    axis: 'rgba(255,255,255,.16)',
    dim: '#6c7488',
    ink: '#e9ecf3',
    amber: '#f4a94a',
    cyan: '#57dcc0',
    red: '#f2686b',
    violet: '#8f83f5'
  };

  function ctxOf(cv) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = cv.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return { c: c, w: w, h: h };
  }

  // rAF 動畫；分頁隱藏 / 離屏 / reduce-motion 一律直接跳到最終狀態
  var rafs = {};
  function anim(name, dur, step) {
    if (rafs[name]) { cancelAnimationFrame(rafs[name]); rafs[name] = 0; }
    if (reduce || document.hidden) { step(1); return; }
    var t0 = 0;
    function frame(t) {
      if (!t0) t0 = t;
      if (document.hidden) { step(1); rafs[name] = 0; return; }
      var p = Math.min(1, (t - t0) / dur);
      step(p < 1 ? 1 - Math.pow(1 - p, 3) : 1);   // easeOutCubic
      if (p < 1) rafs[name] = requestAnimationFrame(frame);
      else rafs[name] = 0;
    }
    rafs[name] = requestAnimationFrame(frame);
  }
  function stopAll() {
    for (var k in rafs) if (rafs[k]) { cancelAnimationFrame(rafs[k]); rafs[k] = 0; }
  }

  /* ─────────── 圖 1：整體留存預測 ─────────── */
  function simulate(list, days) {
    var A = [], B = [], reviews = [], d, i;
    for (d = 0; d <= days; d++) { A.push(0); B.push(0); reviews.push(0); }
    var n = list.length;
    if (!n) return { A: A, B: B, reviews: reviews, health: 0 };

    var today = todayKey();
    for (i = 0; i < n; i++) {
      var c = list[i];
      var dueOff = daysBetween(today, c.due);
      var lastOff = c.last ? daysBetween(today, c.last) : null;   // 負值＝過去

      // 分支 A：照排程複習（假設每次都 q=4：想得起來、猶豫一下）
      var sEF = c.ef, sReps = c.reps, sInt = c.interval, sDue = dueOff, sLast = lastOff;
      // 分支 B：從今天起完全不複習
      var bS = stability(c.interval || 1, c.ef);

      for (d = 0; d <= days; d++) {
        if (d >= sDue) {
          var r = sm2({ ef: sEF, reps: sReps, interval: sInt }, 4);
          sEF = r.ef; sReps = r.reps; sInt = r.interval;
          sLast = d; sDue = d + r.interval;
          reviews[d]++;
        }
        A[d] += (sLast === null) ? 0 : retention(d - sLast, stability(sInt, sEF));
        B[d] += (lastOff === null) ? 0 : retention(d - lastOff, bS);
      }
    }
    for (d = 0; d <= days; d++) { A[d] /= n; B[d] /= n; }
    return { A: A, B: B, reviews: reviews, health: B[0] };
  }

  var fcData = null;
  function drawForecast(p) {
    if (!fcData || !cards.length) return;
    var g = ctxOf(cvFc), c = g.c, w = g.w, h = g.h;
    var padL = 34, padR = 10, padT = 12, padB = 24;
    var W = w - padL - padR, H = h - padT - padB;
    var X = function (d) { return padL + (d / FC_DAYS) * W; };
    var Y = function (v) { return padT + (1 - v) * H; };

    // 網格
    c.lineWidth = 1;
    c.font = '10px ui-monospace,Menlo,Consolas,monospace';
    c.textBaseline = 'middle';
    var ys = [0, 0.25, 0.5, 0.75, 1];
    for (var i = 0; i < ys.length; i++) {
      var y = Y(ys[i]);
      c.strokeStyle = COL.grid;
      c.beginPath(); c.moveTo(padL, y); c.lineTo(w - padR, y); c.stroke();
      c.fillStyle = COL.dim; c.textAlign = 'right';
      c.fillText(Math.round(ys[i] * 100) + '%', padL - 7, y);
    }
    // x 標
    c.textAlign = 'center'; c.textBaseline = 'top';
    var xs = [0, 7, 14, 21, 28, 35, 45];
    for (var j = 0; j < xs.length; j++) {
      c.fillStyle = COL.dim;
      c.fillText(xs[j] === 0 ? '今天' : '+' + xs[j] + 'd', X(xs[j]), h - padB + 6);
    }

    var lim = Math.max(1, Math.round(FC_DAYS * p));

    // B：不複習（虛線 + 紅色淡填）
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = COL.red; c.lineWidth = 1.8; c.lineJoin = 'round';
    c.beginPath();
    for (var d1 = 0; d1 <= lim; d1++) {
      var yy = Y(fcData.B[d1]);
      if (d1 === 0) c.moveTo(X(0), yy); else c.lineTo(X(d1), yy);
    }
    c.stroke();
    c.restore();

    // A：照排程（實線 + 漸層填）
    var grad = c.createLinearGradient(0, padT, 0, padT + H);
    grad.addColorStop(0, 'rgba(87,220,192,.22)');
    grad.addColorStop(1, 'rgba(87,220,192,0)');
    c.beginPath();
    c.moveTo(X(0), Y(fcData.A[0]));
    for (var d2 = 1; d2 <= lim; d2++) c.lineTo(X(d2), Y(fcData.A[d2]));
    c.lineTo(X(lim), Y(0)); c.lineTo(X(0), Y(0)); c.closePath();
    c.fillStyle = grad; c.fill();

    c.beginPath();
    for (var d3 = 0; d3 <= lim; d3++) {
      var y3 = Y(fcData.A[d3]);
      if (d3 === 0) c.moveTo(X(0), y3); else c.lineTo(X(d3), y3);
    }
    c.strokeStyle = COL.cyan; c.lineWidth = 2.2; c.lineJoin = 'round';
    c.stroke();

    // 今天的點
    if (p > 0.15) {
      c.beginPath(); c.arc(X(0), Y(fcData.A[0]), 3.4, 0, 6.2832);
      c.fillStyle = COL.cyan; c.fill();
    }
  }

  /* ─────────── 圖 2：單卡記憶強度曲線 ─────────── */
  var cardCurve = null;
  function drawCardCurve(p) {
    if (!cardCurve) return;
    var g = ctxOf(cvCard), c = g.c, w = g.w, h = g.h;
    var padL = 30, padR = 12, padT = 12, padB = 22;
    var W = w - padL - padR, H = h - padT - padB;
    var span = cardCurve.span;
    var X = function (t) { return padL + (t / span) * W; };
    var Y = function (v) { return padT + (1 - v) * H; };

    c.lineWidth = 1;
    c.font = '10px ui-monospace,Menlo,Consolas,monospace';
    c.textBaseline = 'middle'; c.textAlign = 'right';
    var ys = [0, 0.5, 0.9, 1];
    for (var i = 0; i < ys.length; i++) {
      var y = Y(ys[i]);
      c.strokeStyle = (ys[i] === 0.9) ? 'rgba(244,169,74,.20)' : COL.grid;
      c.beginPath();
      if (ys[i] === 0.9) c.setLineDash([3, 3]); else c.setLineDash([]);
      c.moveTo(padL, y); c.lineTo(w - padR, y); c.stroke();
      c.setLineDash([]);
      c.fillStyle = (ys[i] === 0.9) ? 'rgba(244,169,74,.75)' : COL.dim;
      c.fillText(Math.round(ys[i] * 100) + '%', padL - 6, y);
    }

    var N = 90;
    var lim = Math.max(1, Math.round(N * p));

    function curve(S, col, dash, wid) {
      c.save();
      c.setLineDash(dash);
      c.beginPath();
      for (var k = 0; k <= lim; k++) {
        var t = (k / N) * span;
        var yy = Y(retention(t, S));
        if (k === 0) c.moveTo(X(t), yy); else c.lineTo(X(t), yy);
      }
      c.strokeStyle = col; c.lineWidth = wid; c.lineJoin = 'round';
      c.stroke();
      c.restore();
    }

    // 舊曲線（複習前的衰減速度）
    curve(cardCurve.sOld, 'rgba(255,255,255,.28)', [4, 4], 1.6);
    // 新曲線
    curve(cardCurve.sNew, cardCurve.lapsed ? COL.red : COL.cyan, [], 2.4);

    // 下次複習日標記
    if (p > 0.6 && cardCurve.next <= span) {
      var nx = X(cardCurve.next), ny = Y(TARGET_R);
      c.strokeStyle = 'rgba(244,169,74,.5)'; c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.beginPath(); c.moveTo(nx, Y(0)); c.lineTo(nx, ny); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.arc(nx, ny, 4, 0, 6.2832);
      c.fillStyle = COL.amber; c.fill();
      c.fillStyle = COL.amber; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.font = '10px ui-monospace,Menlo,Consolas,monospace';
      c.fillText('+' + cardCurve.next + 'd', nx, ny - 8);
    }

    // x 軸刻度
    c.fillStyle = COL.dim; c.textAlign = 'center'; c.textBaseline = 'top';
    var ticks = [0, span / 2, span];
    for (var t2 = 0; t2 < ticks.length; t2++) {
      c.fillText(Math.round(ticks[t2]) + 'd', X(ticks[t2]), h - padB + 5);
    }
  }

  /* ─────────── 圖 3：Ebbinghaus 1885 原始曲線 ─────────── */
  // 節省率（savings %）。時間換算成小時。
  var EBB = [
    { h: 19 / 60, v: 58.2, l: '19分' },
    { h: 63 / 60, v: 44.2, l: '63分' },
    { h: 8.8, v: 35.8, l: '8.8時' },
    { h: 24, v: 33.7, l: '1天' },
    { h: 48, v: 27.8, l: '2天' },
    { h: 144, v: 25.4, l: '6天' },
    { h: 744, v: 21.1, l: '31天' }
  ];

  function drawEbb(p) {
    var g = ctxOf(cvEbb), c = g.c, w = g.w, h = g.h;
    var padL = 34, padR = 14, padT = 16, padB = 26;
    var W = w - padL - padR, H = h - padT - padB;
    var lo = Math.log(0.25), hi = Math.log(900);
    var X = function (hr) { return padL + ((Math.log(hr) - lo) / (hi - lo)) * W; };
    var Y = function (v) { return padT + (1 - v / 70) * H; };

    c.lineWidth = 1;
    c.font = '10px ui-monospace,Menlo,Consolas,monospace';
    c.textBaseline = 'middle'; c.textAlign = 'right';
    for (var v = 0; v <= 70; v += 20) {
      var y = Y(v);
      c.strokeStyle = COL.grid;
      c.beginPath(); c.moveTo(padL, y); c.lineTo(w - padR, y); c.stroke();
      c.fillStyle = COL.dim; c.fillText(v + '%', padL - 6, y);
    }
    var xt = [{ h: 1, l: '1時' }, { h: 24, l: '1天' }, { h: 168, l: '1週' }, { h: 744, l: '31天' }];
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (var i = 0; i < xt.length; i++) {
      var xx = X(xt[i].h);
      c.strokeStyle = 'rgba(255,255,255,.05)';
      c.beginPath(); c.moveTo(xx, padT); c.lineTo(xx, padT + H); c.stroke();
      c.fillStyle = COL.dim; c.fillText(xt[i].l, xx, h - padB + 5);
    }

    // 折線（在對數時間軸上逐段畫出）
    var total = EBB.length - 1;
    var prog = p * total;
    c.beginPath();
    c.moveTo(X(EBB[0].h), Y(EBB[0].v));
    for (var s = 0; s < total; s++) {
      var f = Math.max(0, Math.min(1, prog - s));
      if (f <= 0) break;
      var x0 = X(EBB[s].h), y0 = Y(EBB[s].v);
      var x1 = X(EBB[s + 1].h), y1 = Y(EBB[s + 1].v);
      c.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
    }
    c.strokeStyle = COL.amber; c.lineWidth = 2.2; c.lineJoin = 'round';
    c.stroke();

    // 點 + 標
    c.font = '10px ui-monospace,Menlo,Consolas,monospace';
    for (var k = 0; k < EBB.length; k++) {
      if (prog < k - 0.02) break;
      var px = X(EBB[k].h), py = Y(EBB[k].v);
      c.beginPath(); c.arc(px, py, 3.6, 0, 6.2832);
      c.fillStyle = '#0a0c11'; c.fill();
      c.strokeStyle = COL.amber; c.lineWidth = 2; c.stroke();
      c.fillStyle = COL.ink; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText(EBB[k].v + '', px, py - 8);
    }
  }

  /* ─────────── 統一重畫 ─────────── */
  function drawAll() {
    if (cards.length) anim('fc', 800, drawForecast);
    else ctxOf(cvFc);                    // 清空
    if (ebbPlayed) drawEbb(1);           // 已播過就直接畫最終狀態，不重播
    if (cardCurve && !elResult.hidden) anim('cc', 750, drawCardCurve);
  }

  /* ═════════════════════════════════════════
     數字滾動
     ═════════════════════════════════════════ */
  function rollTo(el, to, suffix) {
    var from = Number(el.getAttribute('data-count')) || 0;
    el.setAttribute('data-count', to);
    var pct = suffix ? '<span class="pct">%</span>' : '';
    if (reduce || document.hidden || from === to) {
      el.innerHTML = to + pct;
      return;
    }
    var t0 = 0, dur = 620;
    function frame(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.innerHTML = Math.round(from + (to - from) * e) + pct;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ═════════════════════════════════════════
     儀表板 / 牌組渲染
     ═════════════════════════════════════════ */
  function dueList() {
    var t = todayKey();
    return cards.filter(function (c) { return daysBetween(t, c.due) <= 0; })
      .sort(function (a, b) { return daysBetween(b.due, a.due); });   // 逾期最久的先來
  }

  function render() {
    var t = todayKey();
    var due = dueList();
    var late = cards.filter(function (c) { return daysBetween(t, c.due) < 0; }).length;

    fcData = simulate(cards, FC_DAYS);

    rollTo(elDue, due.length);
    rollTo(elLate, late);
    rollTo(elTotal, cards.length);
    rollTo(elHealth, Math.round((fcData.health || 0) * 100), true);

    elFcEmpty.hidden = cards.length > 0;
    $('btn-start').disabled = due.length === 0;
    $('btn-start').textContent = due.length ? ('開始複習（' + due.length + ' 張）') : '今天沒有到期的卡片';

    if (cards.length) {
      var dropNo = Math.round((fcData.B[0] - fcData.B[FC_DAYS]) * 100);
      var endA = Math.round(fcData.A[FC_DAYS] * 100);
      var endB = Math.round(fcData.B[FC_DAYS] * 100);
      elFcNote.textContent = '45 天後：照排程複習約留 ' + endA + '%，完全不複習約留 ' + endB +
        '%（掉了 ' + dropNo + ' 個百分點）。曲線用 R(t)=e^(−t/S) 估算，S 對齊 SM-2 的排程間隔；'
        + '尚未複習過的新卡留存率視為 0。';
    } else {
      elFcNote.textContent = '';
    }

    renderTable();
    drawAll();
  }

  function renderTable() {
    elTbody.innerHTML = '';
    elDeckEmpty.hidden = cards.length > 0;
    var t = todayKey();
    var sorted = cards.slice().sort(function (a, b) {
      return daysBetween(t, a.due) - daysBetween(t, b.due);
    });
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      var off = daysBetween(t, c.due);
      var tr = document.createElement('tr');

      var td1 = document.createElement('td');
      td1.className = 'c-front';
      td1.textContent = c.front;
      var sm = document.createElement('small');
      sm.textContent = c.back;
      td1.appendChild(sm);

      var td2 = document.createElement('td');
      td2.className = 'c-num'; td2.setAttribute('data-l', '下次');
      td2.textContent = fmtDue(c.due);
      if (off < 0) td2.classList.add('due-late');
      else if (off === 0) td2.classList.add('due-now');

      var td3 = document.createElement('td');
      td3.className = 'c-num'; td3.setAttribute('data-l', '間隔');
      td3.textContent = c.interval ? c.interval + ' 天' : '—';

      var td4 = document.createElement('td');
      td4.className = 'c-num'; td4.setAttribute('data-l', 'EF');
      td4.textContent = c.ef.toFixed(2);

      var td5 = document.createElement('td');
      td5.className = 'c-num'; td5.setAttribute('data-l', '複習');
      td5.textContent = c.reps + (c.lapses ? '（忘 ' + c.lapses + '）' : '');

      var td6 = document.createElement('td');
      td6.className = 'c-act';
      var del = document.createElement('button');
      del.className = 'del'; del.type = 'button';
      del.textContent = '✕';
      del.setAttribute('aria-label', '刪除卡片：' + c.front);
      del.setAttribute('data-id', c.id);
      td6.appendChild(del);

      tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
      tr.appendChild(td4); tr.appendChild(td5); tr.appendChild(td6);
      elTbody.appendChild(tr);
    }
  }

  elTbody.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.del') : null;
    if (!b) return;
    var id = b.getAttribute('data-id');
    var c = cards.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    if (!window.confirm('刪除這張卡片？\n\n「' + c.front + '」\n\n這個動作沒辦法復原（建議先匯出備份）。')) return;
    cards = cards.filter(function (x) { return x.id !== id; });
    save(); render();
    msg('已刪除 1 張卡片。');
  });

  /* ═════════════════════════════════════════
     複習流程
     ═════════════════════════════════════════ */
  var queue = [], qi = 0, flipped = false, sessionCount = 0, activeCard = null;

  function startSession() {
    queue = dueList();
    if (!queue.length) return;
    qi = 0; sessionCount = 0;
    elReview.hidden = false;
    elDone.hidden = true;
    elReview.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    showCard();
  }

  function showCard() {
    if (qi >= queue.length) return finish();
    activeCard = queue[qi];
    flipped = false;
    elFlip.classList.remove('flipped');
    elFlipInner.setAttribute('aria-label', '卡片正面：' + activeCard.front + '。按空白鍵翻牌看答案。');
    elFront.textContent = activeCard.front;
    elBack.textContent = activeCard.back;
    elGrades.hidden = true;
    elResult.hidden = true;
    elDone.hidden = true;
    elFlip.hidden = false;
    elPos.textContent = (qi + 1) + ' / ' + queue.length;
    elFill.style.width = (qi / queue.length * 100) + '%';
  }

  function doFlip() {
    if (flipped || !activeCard || !elResult.hidden) return;
    flipped = true;
    elFlip.classList.add('flipped');
    elFlipInner.setAttribute('aria-label', '卡片背面：' + activeCard.back + '。請用 0 到 5 給分。');
    elGrades.hidden = false;
    setTimeout(function () {
      var b = elGrades.querySelector('.g5');
      if (b && document.activeElement === elFlipInner) b.focus();
    }, reduce ? 0 : 380);
  }

  function grade(q) {
    if (!flipped || !activeCard || !elResult.hidden) return;
    var c = activeCard;
    var r = sm2({ ef: c.ef, reps: c.reps, interval: c.interval }, q);
    var today = todayKey();

    c.ef = r.ef;
    c.reps = r.reps;
    c.interval = r.interval;
    c.last = today;
    c.due = addDays(today, r.interval);
    if (r.lapsed) c.lapses++;
    save();
    sessionCount++;

    // ── 公式當場算給你看 ──
    var d = (5 - q);
    var deltaStr = (r.delta >= 0 ? '+' : '−') + Math.abs(r.delta).toFixed(2);
    elMEf.innerHTML =
      'EF′ = ' + r.prevEF.toFixed(2) + ' + (0.1 − (5−<span class="hi">' + q + '</span>)×(0.08 + (5−<span class="hi">' + q + '</span>)×0.02))<br>' +
      '　　= ' + r.prevEF.toFixed(2) + ' + (0.1 − ' + d + '×' + (0.08 + d * 0.02).toFixed(2) + ')' +
      ' = ' + r.prevEF.toFixed(2) + ' ' + deltaStr + ' = <b>' + r.ef.toFixed(2) + '</b>' +
      (r.ef === EF_MIN && r.prevEF + r.delta < EF_MIN ? '　<span class="hi3">（已觸底 1.3）</span>' : '');

    if (r.lapsed) {
      elMInt.innerHTML = '<span class="hi3">q = ' + q + ' &lt; 3 → 沒想起來</span>：複習次數歸零，間隔打回 <b>I(1) = 1</b> 天。';
    } else if (r.prevReps === 0) {
      elMInt.innerHTML = 'n = 1 → <b>I(1) = 1</b> 天（SM-2 規定的第一個間隔）';
    } else if (r.prevReps === 1) {
      elMInt.innerHTML = 'n = 2 → <b>I(2) = 6</b> 天（SM-2 規定的第二個間隔）';
    } else {
      elMInt.innerHTML = 'n = ' + (r.prevReps + 1) + ' → I(n) = I(n−1) × EF = ' + r.prevInt +
        ' × ' + r.prevEF.toFixed(2) + ' = ' + (r.prevInt * r.prevEF).toFixed(2) +
        ' → 進位 <b>' + r.interval + '</b> 天';
    }

    var nd = parseKey(c.due);
    elMNext.innerHTML = '下次複習：<b class="hi">' + (nd.getMonth() + 1) + ' 月 ' + nd.getDate() + ' 日</b>' +
      '（' + r.interval + ' 天後）　EF <b>' + r.ef.toFixed(2) + '</b>　累積複習 <b>' + r.reps + '</b> 次';

    // ── 曲線 ──
    var sOld = stability(r.prevInt || 1, r.prevEF);
    var sNew = stability(r.interval, r.ef);
    cardCurve = {
      sOld: sOld, sNew: sNew, next: r.interval,
      span: Math.max(r.interval * 1.8, 12, halfLife(sOld) * 2.2),
      lapsed: r.lapsed
    };

    var hOld = halfLife(sOld), hNew = halfLife(sNew);
    if (r.lapsed) {
      elResFlat.innerHTML = '曲線被打回起點——記憶半衰期從 ' + hOld.toFixed(1) + ' 天回到 <strong>' + hNew.toFixed(1) + ' 天</strong>。明天再見。';
      elResLive.textContent = '沒想起來（q=' + q + '）。SM-2 把間隔重設為 1 天，EF 降到 ' + r.ef.toFixed(2) + '。這不是懲罰，是校準。';
    } else {
      elResFlat.innerHTML = '曲線被壓平了：記憶半衰期 ' + hOld.toFixed(1) + ' 天 → <strong>' + hNew.toFixed(1) + ' 天</strong>（×' + (hNew / hOld).toFixed(2) + '）。';
      elResLive.textContent = '記住了（q=' + q + '）。下次複習排在 ' + r.interval + ' 天後——那時你的預測留存率剛好掉到約 90%，正是最划算的攔截點。';
    }

    elGrades.hidden = true;
    elResult.hidden = false;
    anim('cc', 800, drawCardCurve);
    elFill.style.width = ((qi + 1) / queue.length * 100) + '%';
    $('btn-next').textContent = (qi + 1 >= queue.length) ? '看今天的成果 →' : '下一張 →';
    $('btn-next').focus();

    render();
  }

  function nextCard() {
    qi++;
    if (qi >= queue.length) finish();
    else showCard();
  }

  function finish() {
    activeCard = null;
    elFlip.hidden = true;
    elGrades.hidden = true;
    elResult.hidden = true;
    elDone.hidden = false;
    elPos.textContent = queue.length + ' / ' + queue.length;
    elFill.style.width = '100%';

    var t = todayKey();
    var stillDue = dueList().length;
    var future = cards.filter(function (c) { return daysBetween(t, c.due) > 0; })
      .sort(function (a, b) { return daysBetween(b.due, a.due); });
    elDoneSub.textContent = '這一輪複習了 ' + sessionCount + ' 張。' +
      (stillDue ? '還有 ' + stillDue + ' 張到期——再開一輪吧。' :
        (future.length ? '下一張到期是 ' + fmtDue(future[0].due) + '——在那之前，別碰它。提早複習等於浪費。' : ''));
    render();
  }

  function quitSession() {
    elReview.hidden = true;
    activeCard = null;
    render();
    document.querySelector('.board').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /* ─────────── 事件 ─────────── */
  $('btn-start').addEventListener('click', startSession);
  $('btn-quit').addEventListener('click', quitSession);
  $('btn-done-back').addEventListener('click', quitSession);
  $('btn-next').addEventListener('click', nextCard);
  elFlipInner.addEventListener('click', doFlip);

  elGrades.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.g') : null;
    if (!b) return;
    grade(Number(b.getAttribute('data-q')));
  });

  document.addEventListener('keydown', function (e) {
    if (elReview.hidden || !activeCard) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      if (!flipped) { e.preventDefault(); doFlip(); }
      else if (!elResult.hidden) { e.preventDefault(); nextCard(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); quitSession(); return; }
    if (/^[0-5]$/.test(e.key) && flipped && elResult.hidden) {
      e.preventDefault();
      grade(Number(e.key));
    }
  });

  /* ═════════════════════════════════════════
     新增卡片
     ═════════════════════════════════════════ */
  $('new-card').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = $('in-front').value.trim(), b = $('in-back').value.trim();
    if (!f || !b) return;
    var c = normCard({ front: f, back: b, ef: EF_INIT, reps: 0, interval: 0, due: todayKey(), last: null });
    if (!c) return;
    cards.push(c);
    save();
    $('in-front').value = ''; $('in-back').value = '';
    $('in-front').focus();
    render();
    msg('已加入 1 張新卡——今天就到期，馬上複習它。');
  });
  ['in-front', 'in-back'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        var ev = document.createEvent('Event');
        ev.initEvent('submit', true, true);
        $('new-card').dispatchEvent(ev);
      }
    });
  });
  $('btn-jump-new').addEventListener('click', function () {
    document.querySelector('.deck').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () { $('in-front').focus(); }, reduce ? 0 : 420);
  });

  /* ═════════════════════════════════════════
     示範牌組（含合理的複習史，讓圖表一開始就有內容）
     ═════════════════════════════════════════ */
  var DEMO = [
    ['遺忘曲線是誰、在哪一年畫出來的？', 'Hermann Ebbinghaus，1885 年《Über das Gedächtnis》。他拿自己當唯一受試者，背了幾千個無意義音節。', 3, 2.6, 17, -12, 5],
    ['Ebbinghaus 用什麼方法「量」記憶？', '節省法（savings method）：隔一段時間後重學同一串，看這次比第一次省下多少學習時間。', 2, 2.5, 6, -8, -2],
    ['SM-2 的 EF 初始值與下限是多少？', '初始 2.5，下限 1.3。低於 1.3 的卡片會複習到煩人——Woźniak 說那通常代表題目本身寫壞了。', 4, 2.7, 48, -20, 28],
    ['SM-2 的前兩個間隔是幾天？', 'I(1)=1 天、I(2)=6 天。從第三次起 I(n)=I(n−1)×EF，有小數就進位。', 1, 2.36, 1, -1, 0],
    ['q 等於多少時，EF 剛好不變？', 'q=4。把 4 代入 EF+(0.1−(5−q)(0.08+(5−q)×0.02))，增減剛好是 0——這是設計出來的平衡點。', 2, 2.22, 6, -6, 0],
    ['什麼是「測驗效應」？', 'Roediger & Karpicke (2006)：做回想測驗比重讀更能鞏固長期記憶。重讀只在「5 分鐘後就考」時贏；2 天、1 週後測驗組大勝。', 0, 2.5, 0, null, 0],
    ['什麼是「流暢性錯覺」？', '重讀時字句很順、認得出來，大腦誤把「處理很流暢」當成「我記得」。認得出 ≠ 提取得出。', 3, 2.08, 14, -10, 4],
    ['2015 年誰重現了遺忘曲線？結果如何？', 'Murre & Dros，PLOS ONE 10(7): e0120644。單一受試者花約 70 小時重做，結果與 1885 年的原始曲線高度相符。', 1, 2.5, 1, -3, -2],
    ['為什麼「背完就去睡」有科學根據？', '睡眠中的記憶固化（consolidation）。Murre & Dros 發現曲線在 24 小時附近似乎往上跳一下——中間剛好隔了一次睡眠。', 0, 2.5, 0, null, 0],
    ['間隔效應，一句話。', '同樣的總時數，攤開成多次、在「快忘記時」複習，長期留存遠勝一次念完。太早複習浪費，太晚複習等於重學。', 2, 2.6, 6, -5, 1]
  ];

  $('btn-demo').addEventListener('click', function () {
    if (cards.length && !window.confirm('載入示範牌組會「取代」目前的 ' + cards.length + ' 張卡片。\n\n建議先匯出備份。確定要繼續嗎？')) return;
    var t = todayKey();
    cards = DEMO.map(function (d) {
      return normCard({
        front: d[0], back: d[1],
        reps: d[2], ef: d[3], interval: d[4],
        last: d[5] === null ? null : addDays(t, d[5]),
        due: addDays(t, d[6]),
        created: addDays(t, -30)
      });
    });
    save();
    try { localStorage.setItem(K_SEEN, '1'); } catch (e) { /* noop */ }
    render();
    msg('已載入 10 張示範卡（附模擬複習史）。按「開始複習」試試看。');
  });

  /* ═════════════════════════════════════════
     匯出 / 匯入 / 清空
     ═════════════════════════════════════════ */
  $('btn-export').addEventListener('click', function () {
    if (!cards.length) { msg('牌組是空的，沒東西可以匯出。', true); return; }
    var payload = {
      app: 'recall',
      version: 1,
      algorithm: 'SM-2 (Wozniak 1987)',
      exportedAt: new Date().toString(),
      cards: cards
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'recall-cards-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    msg('已匯出 ' + cards.length + ' 張卡片。');
  });

  $('in-import').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var parsed;
      try { parsed = JSON.parse(String(rd.result)); }
      catch (err) {
        msg('這個檔案不是合法的 JSON——你現有的卡片一張都沒動。', true);
        e.target.value = '';
        return;
      }
      var arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.cards) ? parsed.cards : null);
      if (!arr) {
        msg('JSON 格式不符（找不到 cards 陣列）——現有卡片未被更動。', true);
        e.target.value = '';
        return;
      }
      var incoming = [];
      for (var i = 0; i < arr.length; i++) {
        var c = normCard(arr[i]);
        if (c) incoming.push(c);
      }
      if (!incoming.length) {
        msg('檔案裡沒有任何有效卡片——現有卡片未被更動。', true);
        e.target.value = '';
        return;
      }
      if (cards.length && !window.confirm('匯入 ' + incoming.length + ' 張卡片，會取代目前的 ' + cards.length + ' 張。\n\n建議先匯出備份。確定嗎？')) {
        e.target.value = '';
        return;
      }
      cards = incoming;
      save();
      render();
      msg('已匯入 ' + incoming.length + ' 張卡片。');
      e.target.value = '';
    };
    rd.onerror = function () { msg('檔案讀取失敗——現有卡片未被更動。', true); e.target.value = ''; };
    rd.readAsText(f);
  });

  $('btn-clear').addEventListener('click', function () {
    if (!cards.length) { msg('已經是空的了。'); return; }
    if (!window.confirm('清空全部 ' + cards.length + ' 張卡片？\n\n這個動作沒辦法復原。強烈建議先「匯出 JSON 備份」。')) return;
    if (!window.confirm('真的確定？最後一次確認。')) return;
    cards = [];
    save();
    elReview.hidden = true;
    render();
    msg('牌組已清空。');
  });

  /* ═════════════════════════════════════════
     生命週期
     ═════════════════════════════════════════ */
  var lastDay = todayKey();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stopAll(); return; }
    if (todayKey() !== lastDay) { lastDay = todayKey(); render(); }
    else drawAll();
  });

  var ro = null;
  if (window.ResizeObserver) {
    var rt = 0;
    ro = new ResizeObserver(function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (document.hidden) return;
        if (cards.length) drawForecast(1);
        drawEbb(1);
        if (cardCurve && !elResult.hidden) drawCardCurve(1);
      }, 140);
    });
    ro.observe(document.body);
  } else {
    window.addEventListener('resize', function () {
      if (document.hidden) return;
      if (cards.length) drawForecast(1);
      drawEbb(1);
    });
  }

  // 離屏就別畫（教學區的 Ebbinghaus 圖只在進入視窗時才動一次）
  var ebbPlayed = false;
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (ents) {
      for (var i = 0; i < ents.length; i++) {
        if (ents[i].isIntersecting && !ebbPlayed) {
          ebbPlayed = true;
          anim('ebb', 1200, drawEbb);
          io.disconnect();
        }
      }
    }, { threshold: 0.25 });
    io.observe(cvEbb);
  } else {
    ebbPlayed = true;
  }

  /* ─────────── 啟動 ─────────── */
  cards = load();
  if (reduce) document.body.classList.add('no-motion');
  requestAnimationFrame(function () {
    document.body.classList.add('ready');
    render();
    if (!ebbPlayed) {
      // 若 IO 不可用，直接畫最終狀態
      var g = cvEbb.getBoundingClientRect();
      if (g.top < window.innerHeight) { ebbPlayed = true; anim('ebb', 1200, drawEbb); }
    }
    if (storeNote) msg(storeNote, true);
  });

})();

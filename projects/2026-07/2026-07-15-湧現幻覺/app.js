/* 湧現幻覺 — 突然開竅，是真的湧現還是你選錯了尺？
   純靜態、零外部資源、不呼叫任何 AI／網路。localStorage 前綴：emg.
   核心數學寫成純函式，並在檔尾 export 給 node 測試。
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  /* ================= 核心數學（純函式，node 可測） =================
     底層「真實改善」：每一步（每個 token）的正確機率 p 隨規模平滑上升。
     x = log10(模型規模)。p(x) 是一條平滑、單調的 logistic 曲線——這一條
     不會變，使用者只能換一把「尺」（指標）來量它。 */
  var P = { xmin: 6, xmax: 12, x0: 8.5, s: 1.4 };

  function pUnderlying(x, cfg) {
    cfg = cfg || P;
    return 1 / (1 + Math.exp(-cfg.s * (x - cfg.x0)));
  }
  // Exact match（整題全對）：k 步各自獨立正確，全對才算對 → p^k（非線性尺）
  function metricExact(p, k) { return Math.pow(p, k); }
  // 連續指標（部分給分／每步正確率／1−正規化編輯距離）：期望正確比例 ≈ p，與 k 無關
  function metricContinuous(p) { return p; }

  // 在 [xmin,xmax] 取樣一條曲線；kind：'under' | 'exact' | 'cont'
  function sample(kind, k, n, cfg) {
    cfg = cfg || P; n = n || 240;
    var xs = new Array(n + 1), ys = new Array(n + 1), i, x, p;
    for (i = 0; i <= n; i++) {
      x = cfg.xmin + (cfg.xmax - cfg.xmin) * i / n;
      p = pUnderlying(x, cfg);
      xs[i] = x;
      ys[i] = kind === 'exact' ? metricExact(p, k)
            : kind === 'cont' ? metricContinuous(p)
            : p;
    }
    return { xs: xs, ys: ys };
  }
  // 最大斜率（每單位 x，即每 decade 規模的表現變化，0~1）
  function maxSlope(xs, ys) {
    var m = 0, i, d;
    for (i = 1; i < xs.length; i++) {
      d = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
      if (d > m) m = d;
    }
    return m;
  }
  // 曲線達到「自身最大值 × frac」的 x（線性內插）；達不到回傳 null
  function crossingX(xs, ys, frac) {
    var last = ys.length - 1, target = frac * ys[last], i, t;
    for (i = 1; i < xs.length; i++) {
      if (ys[i - 1] < target && ys[i] >= target) {
        t = (target - ys[i - 1]) / (ys[i] - ys[i - 1]);
        return xs[i - 1] + t * (xs[i] - xs[i - 1]);
      }
    }
    return null;
  }
  // 平坦區佔比：ys < thr×max 的 x 範圍佔總範圍比例（門檻感之一）
  function flatFraction(xs, ys, thr) {
    var last = ys.length - 1, target = thr * ys[last], below = 0,
        total = xs[last] - xs[0], i;
    for (i = 1; i < xs.length; i++) {
      if (ys[i] < target) below += (xs[i] - xs[i - 1]);
    }
    return below / total;
  }

  var CORE = {
    P: P, pUnderlying: pUnderlying, metricExact: metricExact,
    metricContinuous: metricContinuous, sample: sample, maxSlope: maxSlope,
    crossingX: crossingX, flatFraction: flatFraction
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  root.EMG = CORE;

  /* ================= 以下只在瀏覽器執行 UI ================= */
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  var KEY = 'emg.';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} }
  };
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mq.matches;
  if (mq.addEventListener) mq.addEventListener('change', function (e) { reduce = e.matches; requestDraw(); });

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('chart'), ctx = canvas.getContext('2d');
  var els = {
    legend: $('legend'), kRange: $('kRange'), kOut: $('kOut'), kNote: $('kNote'),
    sweepBtn: $('sweepBtn'), sweepText: $('sweepText'), resetBtn: $('resetBtn'),
    rMetric: $('rMetric'), rThresh: $('rThresh'), rSlope: $('rSlope'), rDelay: $('rDelay'),
    verdict: $('verdict'),
    chain: $('chain'), cP: $('cP'), cK: $('cK'), cPk: $('cPk'), cNote: $('cNote'),
    segExact: $('segExact'), segCont: $('segCont'), segBoth: $('segBoth')
  };

  var N = 240;                    // 取樣點數
  var state = {
    mode: store.get('mode', 'exact'),   // exact | cont | both
    k: +store.get('k', 10)
  };
  if (['exact', 'cont', 'both'].indexOf(state.mode) < 0) state.mode = 'exact';
  if (!(state.k >= 1 && state.k <= 40)) state.k = 10;

  // 顯示用（會被 morph 動畫逐格逼近目標）
  var under = sample('under', 1, N).ys;         // 底層固定不變
  var disp = { exact: sample('exact', state.k, N).ys, cont: sample('cont', 1, N).ys };
  var target = { exact: disp.exact.slice(), cont: disp.cont.slice() };
  var alpha = { exact: state.mode !== 'cont' ? 1 : 0, cont: state.mode !== 'exact' ? 1 : 0 };
  var alphaT = { exact: alpha.exact, cont: alpha.cont };

  // ---------- 幾何 / DPI ----------
  var dpr = 1, W = 0, H = 0, pad = { l: 46, r: 14, t: 16, b: 30 };
  function resize() {
    var box = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(box.width));
    H = Math.max(1, Math.round(box.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (W < 420) pad.l = 38; else pad.l = 46;
    requestDraw();
  }
  function PX(x) { return pad.l + (x - P.xmin) / (P.xmax - P.xmin) * (W - pad.l - pad.r); }
  function PY(v) { return pad.t + (1 - v) * (H - pad.t - pad.b); }

  // ---------- 繪圖 ----------
  var SUP = { 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', 10: '¹⁰', 11: '¹¹', 12: '¹²' };
  function drawCurve(ys, color, width, a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i <= N; i++) {
      var x = PX(P.xmin + (P.xmax - P.xmin) * i / N), y = PY(ys[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  function marker(ys, color, a) {
    if (a <= 0.01) return;
    var xc = crossingX(sampleXs, ys, 0.5);
    if (xc === null) return;
    var px = PX(xc);
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, PY(0.5)); ctx.lineTo(px, H - pad.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px, PY(0.5), 4.2, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  var sampleXs = (function () { var a = []; for (var i = 0; i <= N; i++) a.push(P.xmin + (P.xmax - P.xmin) * i / N); return a; })();

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var gx, v;
    // 網格 + y 軸標籤
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (v = 0; v <= 1.0001; v += 0.25) {
      var gy = PY(v);
      ctx.strokeStyle = 'rgba(154,163,199,0.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(W - pad.r, gy); ctx.stroke();
      ctx.fillStyle = 'rgba(154,163,199,0.7)'; ctx.textAlign = 'right';
      ctx.fillText(Math.round(v * 100) + '%', pad.l - 7, gy);
    }
    // x 軸刻度（10^6 .. 10^12）
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (gx = P.xmin; gx <= P.xmax + 0.001; gx += 1) {
      var pxx = PX(gx);
      ctx.strokeStyle = 'rgba(154,163,199,0.06)';
      ctx.beginPath(); ctx.moveTo(pxx, pad.t); ctx.lineTo(pxx, H - pad.b); ctx.stroke();
      ctx.fillStyle = 'rgba(154,163,199,0.7)';
      ctx.fillText('10' + (SUP[gx] || ''), pxx, H - pad.b + 6);
    }
    // 軸說明
    ctx.fillStyle = 'rgba(154,163,199,0.55)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText('模型規模（參數量，對數軸）→', W - pad.r, pad.t + 2);

    // 底層 p（永遠淡淡地畫著）
    drawCurve(under, 'rgba(167,139,250,0.85)', 1.6, 0.5);
    // 依模式畫指標曲線 + 湧現點標記
    if (alpha.cont > 0.01) { drawCurve(disp.cont, '#5ee7d0', 3, alpha.cont); }
    if (alpha.exact > 0.01) { drawCurve(disp.exact, '#ff7a9c', 3.2, alpha.exact); }
    if (state.mode === 'exact') marker(disp.exact, '#ff7a9c', alpha.exact);
    else if (state.mode === 'cont') marker(disp.cont, '#5ee7d0', alpha.cont);
    else { marker(disp.exact, '#ff7a9c', alpha.exact * 0.8); marker(disp.cont, '#5ee7d0', alpha.cont * 0.8); }
  }

  // ---------- rAF 排程（閒置即停；分頁隱藏／離屏／reduce 不跑動畫） ----------
  var rafId = 0, animating = false, tweenStart = 0, tweenDur = 620;
  var fromExact = null, fromCont = null, fromA = null;
  var visible = true;

  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(frame); }

  function startTween() {
    if (reduce || !visible) { // 直接跳到最終狀態
      disp.exact = target.exact.slice();
      disp.cont = target.cont.slice();
      alpha.exact = alphaT.exact; alpha.cont = alphaT.cont;
      updateLegend(); requestDraw(); return;
    }
    fromExact = disp.exact.slice();
    fromCont = disp.cont.slice();
    fromA = { exact: alpha.exact, cont: alpha.cont };
    tweenStart = performance.now();
    animating = true;
    requestDraw();
  }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function frame(now) {
    rafId = 0;
    var keep = false;
    if (animating) {
      var t = Math.min(1, (now - tweenStart) / tweenDur), e = easeInOut(t), i;
      for (i = 0; i <= N; i++) {
        disp.exact[i] = fromExact[i] + (target.exact[i] - fromExact[i]) * e;
        disp.cont[i] = fromCont[i] + (target.cont[i] - fromCont[i]) * e;
      }
      alpha.exact = fromA.exact + (alphaT.exact - fromA.exact) * e;
      alpha.cont = fromA.cont + (alphaT.cont - fromA.cont) * e;
      if (t < 1) keep = true; else animating = false;
    }
    if (sweep.on) { keep = stepSweep(now) || keep; }
    draw();
    if (keep) requestDraw();
  }

  // ---------- 自動示範：k 從 1 掃到 40 再回來，看斷崖長出來 ----------
  var sweep = { on: false, t0: 0, dur: 3600 };
  function stepSweep(now) {
    if (reduce) { setK(40, false); stopSweep(); return false; }
    var phase = ((now - sweep.t0) % (sweep.dur * 2)) / sweep.dur; // 0..2
    var frac = phase < 1 ? phase : 2 - phase;                     // 三角波 0..1..0
    var k = 1 + easeInOut(frac) * 39;
    applyK(k, false);
    els.kRange.value = Math.round(k);
    els.kOut.textContent = Math.round(k);
    return true;
  }
  function startSweep() {
    if (reduce) { setK(40, true); return; }
    sweep.on = true; sweep.t0 = performance.now();
    els.sweepBtn.setAttribute('aria-pressed', 'true');
    els.sweepText.textContent = '暫停示範';
    requestDraw();
  }
  function stopSweep() {
    sweep.on = false;
    els.sweepBtn.setAttribute('aria-pressed', 'false');
    els.sweepText.textContent = '看門檻長出來';
    setK(Math.round(+els.kRange.value), true); // 收斂到整數 k
  }

  // ---------- 套用 k（更新 target，不一定 morph） ----------
  function applyK(k, tween) {
    state.k = k;
    target.exact = sample('exact', k, N).ys;
    target.cont = sample('cont', 1, N).ys;
    if (tween) startTween();
    else { disp.exact = target.exact.slice(); disp.cont = target.cont.slice(); requestDraw(); }
    updateReadout();
    updateChain();
  }
  function setK(k, tween) {
    k = Math.max(1, Math.min(40, Math.round(k)));
    els.kRange.value = k; els.kOut.textContent = k;
    store.set('k', k);
    applyK(k, tween);
  }

  // ---------- 模式切換 ----------
  function setMode(mode, tween) {
    state.mode = mode;
    store.set('mode', mode);
    [['exact', els.segExact], ['cont', els.segCont], ['both', els.segBoth]].forEach(function (pair) {
      pair[1].setAttribute('aria-checked', pair[0] === mode ? 'true' : 'false');
    });
    alphaT.exact = mode !== 'cont' ? 1 : 0;
    alphaT.cont = mode !== 'exact' ? 1 : 0;
    els.legend.className = 'legend m-' + mode;
    els.kNote.textContent = mode === 'cont'
      ? '連續指標與 k 無關——這正是重點：門檻消失了'
      : '一題有 k 步，Exact match 要每步都對';
    if (tween) startTween(); else { alpha.exact = alphaT.exact; alpha.cont = alphaT.cont; requestDraw(); }
    updateReadout();
  }

  // ---------- 數字滾動 ----------
  function roll(el, to, dur, fmt) {
    fmt = fmt || function (v) { return v.toFixed(1); };
    var from = parseFloat(el.getAttribute('data-v')) || 0;
    if (reduce || !visible) { el.textContent = fmt(to); el.setAttribute('data-v', to); return; }
    var t0 = performance.now();
    (function tick(now) {
      var t = Math.min(1, (now - t0) / dur), e = easeInOut(t), v = from + (to - from) * e;
      el.textContent = fmt(v);
      if (t < 1) requestAnimationFrame(tick); else el.setAttribute('data-v', to);
    })(t0);
  }

  // ---------- 讀數 / 結論 ----------
  function updateReadout() {
    var xsExact = sample('exact', state.k, 480), xsCont = sample('cont', 1, 480);
    var mode = state.mode;
    var showCont = mode === 'cont';
    var xs = showCont ? xsCont : xsExact;
    var x50 = crossingX(xs.xs, xs.ys, 0.5);
    var slope = maxSlope(xs.xs, xs.ys) * 100; // pp / decade
    var delay = (x50 === null ? P.xmax : x50) - P.x0;

    els.rMetric.textContent = mode === 'exact' ? 'Exact match'
      : mode === 'cont' ? '連續指標' : '並排對照';
    els.rMetric.style.color = mode === 'cont' ? 'var(--cy)' : 'var(--hot)';

    if (mode === 'cont') {
      els.rThresh.innerHTML = '無明顯門檻<small> 平滑穿越 50%</small>';
      roll(els.rSlope, slope, 500, function (v) { return v.toFixed(0) + ' pp/dec'; });
      els.rDelay.innerHTML = '0 個數量級<small> 與 k 無關</small>';
    } else {
      if (x50 === null) els.rThresh.innerHTML = '＞10<sup>12</sup><small> 尚未越過門檻</small>';
      else els.rThresh.innerHTML = '10^' + x50.toFixed(1).replace(/^(\d+)\.(\d)$/, '$1.$2') + '<small> 參數規模</small>';
      roll(els.rSlope, slope, 500, function (v) { return v.toFixed(0) + ' pp/dec'; });
      roll(els.rDelay, delay, 500, function (v) { return v.toFixed(1) + ' 個數量級'; });
    }
    // verdict
    var vtext;
    if (mode === 'exact') {
      vtext = '<strong>這把不連續的尺，把平滑的底層改善壓成一道斷崖。</strong>k 越大，斷崖出現得越晚、越陡——「湧現」是從指標裡長出來的。';
      els.verdict.style.borderColor = 'var(--hot)';
    } else if (mode === 'cont') {
      vtext = '<strong>同一個底層改善，換上連續的尺，就是一條平滑可預測的緩坡。</strong>沒有門檻，也和 k 無關——進步一直都在，只是之前被尺藏起來了。';
      els.verdict.style.borderColor = 'var(--cy)';
    } else {
      vtext = '<strong>同一個模型、同一份進步。</strong>紅線（整題全對）看起來像斷崖，青線（部分給分）是緩坡——差別只在你把哪把尺舉起來。';
      els.verdict.style.borderColor = 'var(--vi)';
    }
    els.verdict.innerHTML = vtext;

    // 更新 canvas 的 aria 文字替代
    canvas.setAttribute('aria-label',
      '表現對模型規模（10^6 至 10^12 參數）的曲線。目前指標：' + els.rMetric.textContent +
      '，步數 k=' + state.k + '。' +
      (mode === 'cont'
        ? '曲線為平滑緩坡，最大斜率約 ' + slope.toFixed(0) + ' 百分點／數量級，無明顯門檻。'
        : '看起來的湧現點約在 10 的 ' + (x50 === null ? '12 以上' : x50.toFixed(1)) +
          ' 次方參數，最大斜率約 ' + slope.toFixed(0) + ' 百分點／數量級，比底層改善晚約 ' + delay.toFixed(1) + ' 個數量級。') +
      '底層真實改善 p 是一條固定的平滑曲線。');
  }

  // ---------- 鏈：整題全對 p^k ----------
  var CHAIN_P = 0.9;
  function updateChain() {
    var k = state.k, pk = Math.pow(CHAIN_P, k);
    // 畫 k 顆 pip，其中約 pk 比例點亮（示意「整條鏈都對」的機會）
    var want = k;
    if (els.chain.childElementCount !== want) {
      els.chain.innerHTML = '';
      for (var i = 0; i < want; i++) {
        var d = document.createElement('span'); d.className = 'pip'; els.chain.appendChild(d);
      }
    }
    var pips = els.chain.children;
    // 點亮的顆數 = 期望「連續全對」的視覺化：越多步、越難全綠
    var lit = Math.round(pk * k);
    for (var j = 0; j < pips.length; j++) {
      pips[j].classList.toggle('ok', j < lit);
      pips[j].style.opacity = j < lit ? '1' : (0.35 + 0.4 * (1 - j / Math.max(1, k)));
    }
    els.cK.textContent = k;
    els.cP.textContent = CHAIN_P.toFixed(2);
    if (reduce || !visible) els.cPk.textContent = pk.toFixed(pk < 0.1 ? 3 : 2);
    else roll(els.cPk, pk, 450, function (v) { return v.toFixed(pk < 0.1 ? 3 : 2); });
    els.cNote.textContent = k <= 3
      ? '步數少，整題全對的機會還很高——斷崖感很弱。'
      : k <= 12
      ? '每步 9 成、看似很強，整題卻只剩約 ' + Math.round(pk * 100) + '% 會對。'
      : '每步都 9 成，整題全對卻只剩 ' + (pk * 100).toFixed(1) + '%——這就是 exact match 把平滑壓成斷崖的力道。';
  }

  // ---------- 事件 ----------
  els.kRange.addEventListener('input', function () {
    if (sweep.on) stopSweep();
    setK(+els.kRange.value, true);
  });
  function segClick(mode) { return function () { if (sweep.on && mode === 'cont') stopSweep(); setMode(mode, true); }; }
  els.segExact.addEventListener('click', segClick('exact'));
  els.segCont.addEventListener('click', segClick('cont'));
  els.segBoth.addEventListener('click', segClick('both'));
  // 方向鍵在 segmented control 間移動
  var segList = [els.segExact, els.segCont, els.segBoth];
  segList.forEach(function (btn, idx) {
    btn.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var next = segList[(idx + d + segList.length) % segList.length];
      next.focus(); next.click();
    });
  });
  els.sweepBtn.addEventListener('click', function () { sweep.on ? stopSweep() : startSweep(); });
  els.resetBtn.addEventListener('click', function () {
    if (sweep.on) stopSweep();
    setMode('exact', true); setK(10, true);
  });

  // 可見性 / 離屏 / resize
  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (!visible && sweep.on) stopSweep();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting && !document.hidden;
      if (!es[0].isIntersecting && sweep.on) stopSweep();
    }, { threshold: 0.01 }).observe(canvas);
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { resize(); }).observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }

  // ---------- 開機 ----------
  (function boot() {
    els.kRange.value = state.k; els.kOut.textContent = state.k;
    resize();
    setMode(state.mode, false);
    applyK(state.k, false);
    updateChain();
    // 首屏輕輕 morph 一下，讓曲線「畫」出來
    if (!reduce) {
      disp.exact = under.slice(); disp.cont = under.slice();
      target.exact = sample('exact', state.k, N).ys;
      target.cont = sample('cont', 1, N).ys;
      alpha.exact = alphaT.exact; alpha.cont = alphaT.cont;
      startTween();
    }
  })();

})(typeof globalThis !== 'undefined' ? globalThis : this);

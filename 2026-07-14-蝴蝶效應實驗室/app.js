/* ═══════════════════════════════════════════════════════════
   蝴蝶效應實驗室 · app.js
   真實雙擺運動方程式（RK4）＋ 分身發散實驗 ＋ 預言挑戰
   純靜態、零相依、離線可用。localStorage 前綴：chaos.
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // ── 物理常數（兩根 1 公尺、等重的擺臂）──
  const G = 9.81, L1 = 1, L2 = 1, M1 = 1, M2 = 1;
  const DT = 0.002;          // 積分步長（秒）
  const SUB = 8;             // 每幀最多 8 步 → 每幀 16 ms
  const TRIG_SEP = 3 * Math.PI / 180;  // 分歧判定：3°
  const PREDICT_T = 3.0;     // 預言挑戰的時間點（秒）
  const HIT_M = 0.2;         // 進圈門檻（公尺）
  const LS = 'chaos.';

  // ── DOM ──
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const trailCv = $('trailCv'), stageCv = $('stageCv'), chartCv = $('chartCv');
  const tctx = trailCv.getContext('2d');
  const sctx = stageCv.getContext('2d');
  const cctx = chartCv.getContext('2d');

  const btnPlay = $('btnPlay'), playIco = $('playIco'), playTxt = $('playTxt');
  const btnReset = $('btnReset'), btnStep = $('btnStep');
  const rngDelta = $('rngDelta'), rngN = $('rngN');
  const valDelta = $('valDelta'), valN = $('valN');
  const hudTime = $('hudTime'), hudN = $('hudN'), hudSeed = $('hudSeed'), hudSep = $('hudSep');
  const flash = $('flash'), stageHint = $('stageHint'), live = $('live'), heroDelta = $('heroDelta');
  const stDiverge = $('stDiverge'), stDouble = $('stDouble'), stLam = $('stLam'),
        stAmp = $('stAmp'), stPrec = $('stPrec');
  const predictLayer = $('predictLayer'), crosshair = $('crosshair'),
        truthDot = $('truthDot'), predictMsg = $('predictMsg');
  const btnPredict = $('btnPredict'), btnRun = $('btnRun'), predResult = $('predResult');
  const scRounds = $('scRounds'), scHits = $('scHits'), scBest = $('scBest');

  // ── 狀態 ──
  const S = {
    mode: 'sandbox',        // 'sandbox' | 'predict'
    running: false,
    t: 0,
    clones: [],             // 每個是 Float64Array [θ1, ω1, θ2, ω2]
    d0: [],                 // 每個分身的初始擾動大小（弧度）
    tips: [],               // 上一幀的擺錘座標（畫軌跡用）
    base: { th1: 2.35, th2: 2.35 },
    deltaDeg: 1e-3,
    deltaExp: -3,
    n: 48,
    sep: 0,
    diverged: null,
    hist: [],               // [t, log10(放大倍數)]
    fit: [],                // λ 擬合樣本
    lam: null,
    predictPhase: 'idle',   // idle | await | ready | running | done
    guess: null,
    W: 0, H: 0, px: 0, py: 0, scale: 0
  };

  const reduceQ = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reduceQ.matches;

  // ═══ 物理：雙擺運動方程式 ═══
  function deriv(s, out) {
    const t1 = s[0], w1 = s[1], t2 = s[2], w2 = s[3];
    const d = t1 - t2, sd = Math.sin(d), cd = Math.cos(d);
    const den = 2 * M1 + M2 - M2 * Math.cos(2 * d);
    out[0] = w1;
    out[1] = (-G * (2 * M1 + M2) * Math.sin(t1)
              - M2 * G * Math.sin(t1 - 2 * t2)
              - 2 * sd * M2 * (w2 * w2 * L2 + w1 * w1 * L1 * cd)) / (L1 * den);
    out[2] = w2;
    out[3] = (2 * sd * (w1 * w1 * L1 * (M1 + M2)
              + G * (M1 + M2) * Math.cos(t1)
              + w2 * w2 * L2 * M2 * cd)) / (L2 * den);
  }

  const k1 = new Float64Array(4), k2 = new Float64Array(4),
        k3 = new Float64Array(4), k4 = new Float64Array(4), tmp = new Float64Array(4);

  function rk4(s, h) {
    deriv(s, k1);
    for (let i = 0; i < 4; i++) tmp[i] = s[i] + h / 2 * k1[i];
    deriv(tmp, k2);
    for (let i = 0; i < 4; i++) tmp[i] = s[i] + h / 2 * k2[i];
    deriv(tmp, k3);
    for (let i = 0; i < 4; i++) tmp[i] = s[i] + h * k3[i];
    deriv(tmp, k4);
    for (let i = 0; i < 4; i++) s[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }

  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));   // 角度差取最短路徑

  // ═══ 版面 ═══
  function layout() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.W = r.width; S.H = r.height;
    for (const cv of [trailCv, stageCv]) {
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
    }
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S.px = S.W / 2;
    S.py = S.H * 0.30;
    S.scale = Math.min(S.W * 0.42, (S.H - S.py) * 0.92) / (L1 + L2);
    clearTrails();
    layoutChart();
    render();
  }

  function layoutChart() {
    const r = chartCv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    chartCv.width = Math.round(r.width * dpr);
    chartCv.height = Math.round(r.height * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart();
  }

  function clearTrails() {
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, trailCv.width, trailCv.height);
    tctx.restore();
  }

  // 由角度算出兩個擺錘的螢幕座標
  function bobs(s) {
    const x1 = S.px + S.scale * L1 * Math.sin(s[0]);
    const y1 = S.py + S.scale * L1 * Math.cos(s[0]);
    return {
      x1, y1,
      x2: x1 + S.scale * L2 * Math.sin(s[2]),
      y2: y1 + S.scale * L2 * Math.cos(s[2])
    };
  }

  // ═══ 初始化模擬 ═══
  function initSim() {
    const n = S.mode === 'predict' ? 1 : S.n;
    const delta = S.deltaDeg * Math.PI / 180;
    S.clones = []; S.d0 = []; S.tips = [];
    for (let i = 0; i < n; i++) {
      const s = new Float64Array([S.base.th1 + i * delta, 0, S.base.th2, 0]);
      S.clones.push(s);
      S.d0.push(i * delta);
      const b = bobs(s);
      S.tips.push([b.x2, b.y2]);
    }
    S.t = 0; S.sep = 0; S.diverged = null;
    S.hist = []; S.fit = []; S.lam = null;
    clearTrails();
    flash.classList.remove('go');
    hudSep.classList.remove('hot');
    updateStats();
    render();
    drawChart();
  }

  // ═══ 推進物理 ═══
  function advance(seconds) {
    const steps = Math.round(seconds / DT);
    for (let k = 0; k < steps; k++) {
      for (const s of S.clones) rk4(s, DT);
      S.t += DT;
    }
    measure();
  }

  function measure() {
    if (S.clones.length < 2) { updateStats(); return; }
    const ref = S.clones[0];
    let maxSep = 0, ampSum = 0, cnt = 0;
    for (let i = 1; i < S.clones.length; i++) {
      const s = S.clones[i];
      const a = wrap(s[0] - ref[0]), b = wrap(s[2] - ref[2]);
      const d = Math.hypot(a, b);
      if (d > maxSep) maxSep = d;
      if (S.d0[i] > 0) { ampSum += d / S.d0[i]; cnt++; }
    }
    S.sep = maxSep;
    const amp = cnt ? ampSum / cnt : 1;

    // 歷史（每 0.05 秒取樣一次）
    const last = S.hist.length ? S.hist[S.hist.length - 1][0] : -1;
    if (S.t - last >= 0.05) S.hist.push([S.t, Math.log10(Math.max(amp, 1e-3))]);

    // λ 擬合：只取「指數成長段」（放大 10 倍 ~ 1 萬倍之間）
    if (amp > 10 && amp < 1e4) S.fit.push([S.t, Math.log(amp)]);
    if (S.fit.length > 6 && !S.lamLocked) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [x, y] of S.fit) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const m = S.fit.length;
      const den = m * sxx - sx * sx;
      if (den > 1e-9) S.lam = (m * sxy - sx * sy) / den;
    }
    if (amp >= 1e4) S.lamLocked = true;

    if (!S.diverged && maxSep > TRIG_SEP) {
      S.diverged = S.t;
      if (!reduced) flash.classList.add('go');
      hudSep.classList.add('hot');
      live.textContent = `分歧！第 ${S.t.toFixed(2)} 秒，分身之間已經差了 3 度。`;
    }
    S.amp = amp;
    updateStats();
  }

  // ═══ 讀數 ═══
  const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function sci(v, digits = 1) {
    if (!isFinite(v) || v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    const m = v / Math.pow(10, e);
    const es = String(Math.abs(e)).split('').map(c => sup[+c]).join('');
    return `${m.toFixed(digits)}×10${e < 0 ? '⁻' : ''}${es}`;
  }
  // 直接用滑桿的次方值排版，避免浮點數 log10 的邊界誤差
  function deltaLabel(exp) {
    if (exp >= -3) return `${Math.pow(10, exp).toFixed(-exp)}°`;
    const es = String(-exp).split('').map(c => sup[+c]).join('');
    return `10⁻${es}°`;
  }
  const fmtDelta = () => deltaLabel(S.deltaExp);

  function updateStats() {
    hudTime.innerHTML = `${S.t.toFixed(2)}<i>s</i>`;
    hudN.textContent = S.clones.length;
    hudSeed.textContent = S.mode === 'predict' ? '—' : fmtDelta();
    const sepDeg = S.sep * 180 / Math.PI;
    hudSep.innerHTML = `${sepDeg < 10 ? sepDeg.toFixed(2) : sepDeg.toFixed(0)}<i>°</i>`;

    stDiverge.textContent = S.diverged ? `${S.diverged.toFixed(2)} 秒` : '—';
    if (S.lam && S.lam > 0) {
      stLam.textContent = `${S.lam.toFixed(2)} s⁻¹`;
      stDouble.textContent = `${(Math.LN2 / S.lam).toFixed(3)} 秒`;
      const need = (1 * Math.PI / 180) / Math.exp(S.lam * 20) * 180 / Math.PI;
      stPrec.innerHTML = `想讓 <b>20 秒</b>後的預測誤差還在 1° 以內，一開始的角度必須準到 <b>${sci(need)}°</b>。` +
        `每多撐 1 秒，要求就再嚴苛 <b>${Math.round(Math.exp(S.lam))}</b> 倍——這就是為什麼天氣預報有天花板。`;
    } else {
      stLam.textContent = '—';
      stDouble.textContent = '—';
      stPrec.innerHTML = '按下「開始」，讓分歧長到夠大，這裡就會算出你這一組初始條件的 Lyapunov 指數 λ。';
    }
    stAmp.textContent = S.amp && S.amp > 1.5 ? `×${sci(S.amp)}` : '—';
  }

  // ═══ 繪圖：舞台 ═══
  function render() {
    sctx.clearRect(0, 0, S.W, S.H);

    // 天花板
    sctx.strokeStyle = 'rgba(140,160,220,.18)';
    sctx.lineWidth = 1;
    sctx.beginPath();
    sctx.moveTo(S.px - 46, S.py); sctx.lineTo(S.px + 46, S.py);
    sctx.stroke();
    sctx.fillStyle = 'rgba(140,160,220,.10)';
    for (let i = -4; i <= 4; i++) {
      sctx.beginPath();
      sctx.moveTo(S.px + i * 11, S.py);
      sctx.lineTo(S.px + i * 11 - 7, S.py - 8);
      sctx.lineTo(S.px + i * 11 + 1, S.py - 8);
      sctx.closePath(); sctx.fill();
    }

    const n = S.clones.length;
    // 先畫分身（淡），最後畫 0 號（亮）
    for (let i = n - 1; i >= 0; i--) {
      const s = S.clones[i];
      const b = bobs(s);
      const hue = 168 + (n > 1 ? (i / (n - 1)) * 122 : 0);
      const lead = i === 0;
      sctx.strokeStyle = lead ? 'rgba(255,255,255,.85)' : `hsla(${hue},80%,68%,.20)`;
      sctx.lineWidth = lead ? 1.6 : 1;
      sctx.beginPath();
      sctx.moveTo(S.px, S.py); sctx.lineTo(b.x1, b.y1); sctx.lineTo(b.x2, b.y2);
      sctx.stroke();

      sctx.fillStyle = lead ? '#fff' : `hsla(${hue},85%,66%,.5)`;
      sctx.beginPath(); sctx.arc(b.x1, b.y1, lead ? 4 : 2, 0, 7); sctx.fill();

      if (lead) {
        sctx.shadowColor = 'rgba(255,107,139,.9)';
        sctx.shadowBlur = 16;
        sctx.fillStyle = '#ff6b8b';
        sctx.beginPath(); sctx.arc(b.x2, b.y2, 6, 0, 7); sctx.fill();
        sctx.shadowBlur = 0;
      } else {
        sctx.fillStyle = `hsla(${hue},90%,66%,.75)`;
        sctx.beginPath(); sctx.arc(b.x2, b.y2, 3, 0, 7); sctx.fill();
      }
    }
    sctx.fillStyle = '#8a93ad';
    sctx.beginPath(); sctx.arc(S.px, S.py, 3.5, 0, 7); sctx.fill();
  }

  // ═══ 繪圖：磷光軌跡 ═══
  function paintTrails() {
    tctx.save();
    tctx.globalCompositeOperation = 'source-over';
    tctx.fillStyle = 'rgba(8,11,22,.055)';
    tctx.fillRect(0, 0, S.W, S.H);
    tctx.lineCap = 'round';
    const n = S.clones.length;
    for (let i = 0; i < n; i++) {
      const b = bobs(S.clones[i]);
      const p = S.tips[i];
      const hue = 168 + (n > 1 ? (i / (n - 1)) * 122 : 0);
      tctx.strokeStyle = i === 0 && n > 1 ? 'rgba(255,255,255,.5)' : `hsla(${hue},88%,66%,.45)`;
      tctx.lineWidth = i === 0 ? 1.6 : 1.1;
      tctx.beginPath();
      tctx.moveTo(p[0], p[1]); tctx.lineTo(b.x2, b.y2);
      tctx.stroke();
      p[0] = b.x2; p[1] = b.y2;
    }
    tctx.restore();
  }

  // ═══ 繪圖：分歧曲線 ═══
  function drawChart() {
    const w = chartCv.getBoundingClientRect().width;
    const h = chartCv.getBoundingClientRect().height;
    if (!w || !h) return;
    cctx.clearRect(0, 0, w, h);
    const pad = { l: 42, r: 12, t: 14, b: 26 };
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const maxT = Math.max(20, Math.ceil((S.t + 2) / 10) * 10);
    const decades = 9;
    const X = t => pad.l + (t / maxT) * iw;
    const Y = ly => pad.t + ih - (Math.min(Math.max(ly, 0), decades) / decades) * ih;

    // 格線
    cctx.font = '10px ui-monospace, monospace';
    cctx.textBaseline = 'middle';
    for (let d = 0; d <= decades; d += 3) {
      cctx.strokeStyle = 'rgba(140,160,220,.10)';
      cctx.beginPath(); cctx.moveTo(pad.l, Y(d)); cctx.lineTo(w - pad.r, Y(d)); cctx.stroke();
      cctx.fillStyle = '#4b5270';
      cctx.textAlign = 'right';
      cctx.fillText(d === 0 ? '×1' : `×10${String(d).split('').map(c => sup[+c]).join('')}`, pad.l - 8, Y(d));
    }
    cctx.textAlign = 'center';
    for (let t = 0; t <= maxT; t += maxT / 4) {
      cctx.strokeStyle = 'rgba(140,160,220,.06)';
      cctx.beginPath(); cctx.moveTo(X(t), pad.t); cctx.lineTo(X(t), pad.t + ih); cctx.stroke();
      cctx.fillStyle = '#4b5270';
      cctx.fillText(`${t.toFixed(0)}s`, X(t), h - 10);
    }

    // 曲線
    if (S.hist.length > 1) {
      const grd = cctx.createLinearGradient(pad.l, 0, w - pad.r, 0);
      grd.addColorStop(0, '#9a7cff'); grd.addColorStop(1, '#4fe3d0');
      cctx.strokeStyle = grd; cctx.lineWidth = 2; cctx.lineJoin = 'round';
      cctx.beginPath();
      S.hist.forEach(([t, ly], i) => i ? cctx.lineTo(X(t), Y(ly)) : cctx.moveTo(X(t), Y(ly)));
      cctx.stroke();
      const [lt, lly] = S.hist[S.hist.length - 1];
      cctx.fillStyle = '#4fe3d0';
      cctx.beginPath(); cctx.arc(X(lt), Y(lly), 3, 0, 7); cctx.fill();
    }

    // 分歧時刻標線
    if (S.diverged) {
      cctx.strokeStyle = 'rgba(255,107,139,.55)';
      cctx.setLineDash([3, 3]); cctx.lineWidth = 1;
      cctx.beginPath(); cctx.moveTo(X(S.diverged), pad.t); cctx.lineTo(X(S.diverged), pad.t + ih); cctx.stroke();
      cctx.setLineDash([]);
      cctx.fillStyle = '#ff6b8b'; cctx.textAlign = 'left';
      cctx.fillText('分歧', X(S.diverged) + 5, pad.t + 8);
    }
  }

  // ═══ 主迴圈 ═══
  let raf = 0, visible = true, onScreen = true;
  function loop() {
    raf = 0;
    if (!S.running) return;
    for (let k = 0; k < SUB; k++) {
      for (const s of S.clones) rk4(s, DT);
      S.t += DT;
    }
    if (S.mode === 'predict' && S.t >= PREDICT_T) { finishPredict(); return; }
    measure();
    paintTrails();
    render();
    drawChart();
    schedule();
  }
  function schedule() {
    if (!raf && S.running && visible && onScreen) raf = requestAnimationFrame(loop);
  }

  function setRunning(on) {
    S.running = on;
    playIco.textContent = on ? '❚❚' : '▶';
    playTxt.textContent = on ? '暫停' : (S.t > 0 ? '繼續' : '開始');
    if (on) { stageHint.classList.add('hide'); schedule(); }
  }

  // ═══ 控制 ═══
  btnPlay.addEventListener('click', () => {
    if (S.mode === 'predict') exitPredict();
    setRunning(!S.running);
  });
  btnReset.addEventListener('click', () => {
    setRunning(false);
    if (S.mode === 'predict') exitPredict();
    S.lamLocked = false;
    initSim();
    live.textContent = '已重設。';
  });
  btnStep.addEventListener('click', () => {
    advance(0.5);
    paintTrails(); render(); drawChart();
  });

  rngDelta.addEventListener('input', () => {
    S.deltaExp = +rngDelta.value;
    S.deltaDeg = Math.pow(10, S.deltaExp);
    valDelta.textContent = fmtDelta();
    heroDelta.textContent = fmtDelta();
    S.lamLocked = false;
    setRunning(false);
    initSim();
  });
  rngN.addEventListener('input', () => {
    S.n = +rngN.value;
    valN.textContent = S.n;
    S.lamLocked = false;
    setRunning(false);
    initSim();
  });

  // ═══ 拖曳擺臂 ═══
  let drag = null;
  function pt(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  stage.addEventListener('pointerdown', e => {
    const p = pt(e);
    if (S.mode === 'predict') { placeGuess(p); return; }
    const b = bobs(S.clones[0]);
    const d1 = Math.hypot(p.x - b.x1, p.y - b.y1);
    const d2 = Math.hypot(p.x - b.x2, p.y - b.y2);
    drag = d2 <= d1 ? 2 : 1;
    setRunning(false);
    stage.setPointerCapture(e.pointerId);
    dragTo(p);
  });
  stage.addEventListener('pointermove', e => { if (drag) dragTo(pt(e)); });
  stage.addEventListener('pointerup', () => { drag = null; });
  stage.addEventListener('pointercancel', () => { drag = null; });

  function dragTo(p) {
    if (drag === 1) {
      S.base.th1 = Math.atan2(p.x - S.px, p.y - S.py);
    } else {
      const x1 = S.px + S.scale * L1 * Math.sin(S.base.th1);
      const y1 = S.py + S.scale * L1 * Math.cos(S.base.th1);
      S.base.th2 = Math.atan2(p.x - x1, p.y - y1);
    }
    S.lamLocked = false;
    initSim();
    stageHint.classList.add('hide');
  }

  // ═══ 預言挑戰 ═══
  // localStorage 在 file:// 或無痕模式下可能丟 SecurityError——一律包起來，
  // 絕不能讓「存分數」這種小事把整個模擬器打掛。
  const read = k => { try { return localStorage.getItem(LS + k); } catch (_) { return null; } };
  const store = {
    get rounds() { return +(read('rounds') || 0); },
    get hits() { return +(read('hits') || 0); },
    get best() { const v = read('best'); return v === null ? null : +v; },
    save(rounds, hits, best) {
      try {
        localStorage.setItem(LS + 'rounds', rounds);
        localStorage.setItem(LS + 'hits', hits);
        if (best !== null) localStorage.setItem(LS + 'best', best);
      } catch (_) { /* 無痕模式：忽略 */ }
    }
  };
  function paintScore() {
    scRounds.textContent = store.rounds;
    scHits.textContent = store.hits;
    scBest.textContent = store.best === null ? '—' : `${store.best.toFixed(2)} m`;
  }

  btnPredict.addEventListener('click', () => {
    S.mode = 'predict';
    setRunning(false);
    S.lamLocked = false;
    const sgn = () => (Math.random() < .5 ? -1 : 1);
    S.base.th1 = sgn() * (1.5 + Math.random() * 1.4);
    S.base.th2 = sgn() * (1.5 + Math.random() * 1.4);
    initSim();
    predictLayer.hidden = false;
    crosshair.hidden = true; truthDot.hidden = true;
    predictMsg.hidden = false;
    predictMsg.innerHTML = '點一下畫面：猜猜 <b>3 秒後</b>擺錘的紅點會在哪裡';
    S.predictPhase = 'await';
    S.guess = null;
    btnRun.disabled = true;
    predResult.className = 'pred-result';
    predResult.textContent = '起始姿勢已隨機擺好。方程式已經知道 3 秒後的答案了——你呢？';
    stage.style.cursor = 'crosshair';
    stage.scrollIntoView({ block: 'center' });
    live.textContent = '預言挑戰：請在畫面上點選你預測的落點。';
  });

  function placeGuess(p) {
    if (S.predictPhase !== 'await' && S.predictPhase !== 'ready') return;
    S.guess = p;
    crosshair.hidden = false;
    crosshair.style.left = p.x + 'px';
    crosshair.style.top = p.y + 'px';
    if (!crosshair.querySelector('span')) crosshair.appendChild(document.createElement('span'));
    S.predictPhase = 'ready';
    btnRun.disabled = false;
    predictMsg.innerHTML = '按下 <b>驗證 ▶</b>，讓時間跑 3 秒';
  }

  btnRun.addEventListener('click', () => {
    if (S.predictPhase !== 'ready') return;
    S.predictPhase = 'running';
    btnRun.disabled = true;
    predictMsg.hidden = true;
    if (reduced) { advance(PREDICT_T); paintTrails(); render(); finishPredict(); }
    else setRunning(true);
  });

  function finishPredict() {
    // 精準走到 3.0 秒
    while (S.t < PREDICT_T - 1e-9) { rk4(S.clones[0], DT); S.t += DT; }
    setRunning(false);
    paintTrails(); render();

    const b = bobs(S.clones[0]);
    truthDot.hidden = false;
    truthDot.style.left = b.x2 + 'px';
    truthDot.style.top = b.y2 + 'px';
    truthDot.innerHTML = '<span></span><i>它真的在這</i>';

    const errM = Math.hypot(b.x2 - S.guess.x, b.y2 - S.guess.y) / S.scale;
    const hit = errM <= HIT_M;
    const rounds = store.rounds + 1;
    const hits = store.hits + (hit ? 1 : 0);
    const best = store.best === null ? errM : Math.min(store.best, errM);
    store.save(rounds, hits, best);
    paintScore();

    predResult.className = 'pred-result ' + (hit ? 'hit' : 'miss');
    predResult.innerHTML = hit
      ? `🎯 <strong>進圈了！</strong>你的誤差只有 <strong>${errM.toFixed(2)} 公尺</strong>。恭喜——不過再多給它 3 秒，同樣的直覺大概就不管用了：混沌不是難，是<strong>會越來越難</strong>。`
      : `你猜的地方離真正的落點差了 <strong>${errM.toFixed(2)} 公尺</strong>（門檻 0.2 m）。別難過：這條軌跡是<strong>完全決定論</strong>的，方程式一行不差；只是要「算」而不是「猜」，而且初始角度要準到小數點後很多位才行。`;
    S.predictPhase = 'done';
    stage.style.cursor = '';
    live.textContent = `誤差 ${errM.toFixed(2)} 公尺。${hit ? '進圈！' : '沒進圈。'}`;
  }

  function exitPredict() {
    if (S.mode !== 'predict') return;
    S.mode = 'sandbox';
    predictLayer.hidden = true;
    S.predictPhase = 'idle';
    stage.style.cursor = '';
    S.base.th1 = 2.35; S.base.th2 = 2.35;
    S.lamLocked = false;
    initSim();
  }

  // ═══ 節能：離開視線／分頁就停 ═══
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    schedule();
  });
  let autoStarted = false;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      onScreen = es[0].isIntersecting;
      // 第一次捲進視線就自動開跑（尊重 prefers-reduced-motion）
      if (onScreen && !autoStarted && !reduced && S.mode === 'sandbox') {
        autoStarted = true;
        setRunning(true);
      }
      schedule();
    }, { threshold: 0.25 }).observe(stage);
  } else if (!reduced) {
    setRunning(true);
  }

  // ═══ 動態降級 ═══
  // 降級：偵測到 prefers-reduced-motion 就「不自動播、不閃光」，並多給一顆單步按鈕；
  // 但擺盪本身是這一頁的內容，使用者主動按下播放時仍然要能動。
  function applyReduced() {
    reduced = reduceQ.matches;
    btnStep.hidden = !reduced;
    if (reduced && S.running) { setRunning(false); if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  }
  if (reduceQ.addEventListener) reduceQ.addEventListener('change', applyReduced);
  else if (reduceQ.addListener) reduceQ.addListener(applyReduced);

  // ═══ 啟動 ═══
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(layout, 150);
  });

  S.deltaExp = +rngDelta.value;
  S.deltaDeg = Math.pow(10, S.deltaExp);
  S.n = +rngN.value;
  valDelta.textContent = fmtDelta();
  valN.textContent = S.n;
  heroDelta.textContent = fmtDelta();
  applyReduced();
  paintScore();
  layout();
  initSim();
})();

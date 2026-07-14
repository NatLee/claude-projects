/* 神經元點火 — Hodgkin–Huxley (1952) 即時積分
   純靜態、零依賴、離線可用。localStorage 前綴：neuron. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let REDUCE = mqReduce.matches;
  mqReduce.addEventListener('change', e => { REDUCE = e.matches; });

  /* ═══ Hodgkin–Huxley：1952 年原始參數 ═══ */
  const C = 1.0, gNa = 120, gK = 36, gL = 0.3;
  const ENa = 50, EK = -77, EL = -54.387;
  const DT = 0.01;                                  // ms
  const safe = (num, den) => Math.abs(den) < 1e-7 ? num / 1e-7 : num / den;
  const aM = V => safe(0.1 * (V + 40), 1 - Math.exp(-(V + 40) / 10));
  const bM = V => 4 * Math.exp(-(V + 65) / 18);
  const aH = V => 0.07 * Math.exp(-(V + 65) / 20);
  const bH = V => 1 / (1 + Math.exp(-(V + 35) / 10));
  const aN = V => safe(0.01 * (V + 55), 1 - Math.exp(-(V + 55) / 10));
  const bN = V => 0.125 * Math.exp(-(V + 65) / 80);
  const inf = (a, b) => a / (a + b);

  const rest = () => {
    const V = -65;
    return { V, m: inf(aM(V), bM(V)), h: inf(aH(V), bH(V)), n: inf(aN(V), bN(V)) };
  };
  function step(st, I) {
    const { V, m, h, n } = st;
    const iNa = gNa * m * m * m * h * (V - ENa);
    const iK = gK * n * n * n * n * (V - EK);
    const iL = gL * (V - EL);
    st.V = V + DT * (I - iNa - iK - iL) / C;
    st.m = m + DT * (aM(V) * (1 - m) - bM(V) * m);
    st.h = h + DT * (aH(V) * (1 - h) - bH(V) * h);
    st.n = n + DT * (aN(V) * (1 - n) - bN(V) * n);
    return { iNa, iK };
  }

  /* ═══ 狀態 ═══ */
  const WIN = 60, SAMPLE = 0.1, NPTS = Math.round(WIN / SAMPLE);
  const SPEEDS = [0.25, 1, 2, 4];

  let s = rest(), t = 0, acc = 0;
  let buf = [], pulses = [], spikes = [];
  let spikeTotal = 0, lastAbove = false, flash = 0;
  let curSpike = null;                               // 追蹤中的尖峰 {amp, peak}
  const spikePeaks = [];                             // 已完成的尖峰 {amp, peak}
  const checks = [];                                 // 模擬時間排程的檢查
  const rateSamples = {};                            // hold → Hz
  let lastStimAmp = 0;
  let speed = 1, hold = 0, amp = 10, gap = 6;

  /* ═══ 發現清單 ═══ */
  const FINDS = [
    { id: 'sub', t: '閾下什麼都沒有', d: '弱刺激只讓膜電位鼓一下就回去——世界上沒有「一點點的動作電位」。' },
    { id: 'allornone', t: '全有全無', d: '刺激加倍，尖峰高度幾乎不變（約 +37 mV vs +42 mV）。它不是類比訊號，是數位的 1。' },
    { id: 'refract', t: '不應期', d: '第二個脈衝來得太快，神經元完全不理你——h 閘門還沒回復。' },
    { id: 'rate', t: '頻率編碼', d: '電流越大，放電越快。強度不寫在高度裡，寫在頻率裡。' }
  ];
  const LSF = 'neuron.found', LSP = 'neuron.prefs';
  const loadJSON = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) || f; } catch (e) { return f; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } };
  let found = loadJSON(LSF, {});

  function renderFinds(just) {
    $('findList').innerHTML = FINDS.map(f =>
      `<li class="${found[f.id] ? 'on' : ''}${just === f.id ? ' pop' : ''}">
         <b>${f.t}</b>${found[f.id] ? f.d : '尚未發現'}</li>`).join('');
  }
  const unlock = id => {
    if (found[id]) return;
    found[id] = true; saveJSON(LSF, found); renderFinds(id);
  };

  /* ═══ 繪圖 ═══ */
  const cv = $('scope'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const PAD = { l: 46, r: 12, t: 16, b: 26 };
  const VMIN = -95, VMAX = 55;
  const px = ms => PAD.l + ms / WIN * (W - PAD.l - PAD.r);
  const py = v => PAD.t + (VMAX - v) / (VMAX - VMIN) * (H - PAD.t - PAD.b);

  function draw() {
    g.fillStyle = '#070a0e'; g.fillRect(0, 0, W, H);
    g.font = '11px ui-monospace,monospace';

    for (let v = -80; v <= 40; v += 20) {
      g.strokeStyle = '#141c25'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD.l, py(v)); g.lineTo(W - PAD.r, py(v)); g.stroke();
      g.fillStyle = '#5d6d7c'; g.fillText(String(v), 8, py(v) + 4);
    }
    for (let ms = 0; ms <= WIN; ms += 10) {
      g.strokeStyle = '#111820';
      g.beginPath(); g.moveTo(px(ms), PAD.t); g.lineTo(px(ms), H - PAD.b); g.stroke();
      g.fillStyle = '#5d6d7c'; g.fillText(ms + (ms === WIN ? ' ms' : ''), px(ms) - 6, H - 8);
    }
    dashed(py(-65), '#2a3a44', '靜止 −65 mV');
    dashed(py(-55), '#6b5227', '約略閾值 −55 mV');

    if (buf.length > 1) {
      const t0 = buf[0].t;

      g.fillStyle = 'rgba(255,200,97,.55)';
      buf.forEach(p => { if (p.I > 0.01) g.fillRect(px(p.t - t0), PAD.t, 2, 6); });

      if ($('showCur').checked) {
        const cs = 1 / 34;                            // µA/cm² → px
        trace(t0, p => clampY(py(-78) + p.iNa * cs), 'rgba(255,107,92,.8)', 1.6);
        trace(t0, p => clampY(py(-78) + p.iK * cs), 'rgba(90,169,255,.8)', 1.6);
        g.fillStyle = '#5d6d7c'; g.font = '10px ui-monospace,monospace';
        g.fillText('離子電流：Na⁺（紅，往上＝內流）／K⁺（藍，往下＝外流）', PAD.l + 6, H - PAD.b - 4);
      }
      if ($('showGate').checked) {
        trace(t0, p => py(48) + (1 - p.m) * 20, 'rgba(255,107,92,.6)', 1.3);
        trace(t0, p => py(48) + (1 - p.h) * 20, 'rgba(255,200,97,.6)', 1.3);
        trace(t0, p => py(48) + (1 - p.n) * 20, 'rgba(90,169,255,.6)', 1.3);
        g.fillStyle = '#5d6d7c'; g.font = '10px ui-monospace,monospace';
        g.fillText('閘門：m 紅・h 黃・n 藍', W - PAD.r - 150, py(52));
      }

      if (!REDUCE) { g.shadowColor = 'rgba(94,240,176,.6)'; g.shadowBlur = 10; }
      trace(t0, p => py(p.V), '#5ef0b0', 2.4);
      g.shadowBlur = 0;

      g.fillStyle = 'rgba(94,240,176,.95)'; g.font = '11px ui-monospace,monospace';
      spikes.forEach(st => { if (st >= t0) g.fillText('⚡', px(st - t0) - 4, PAD.t + 18); });
    }

    if (flash > 0) {
      if (!REDUCE) { g.fillStyle = `rgba(94,240,176,${flash * 0.09})`; g.fillRect(0, 0, W, H); }
      flash = Math.max(0, flash - 0.06);
    }

    function clampY(y) { return Math.max(PAD.t, Math.min(H - PAD.b, y)); }
    function trace(t0, fy, color, lw) {
      g.strokeStyle = color; g.lineWidth = lw; g.beginPath();
      buf.forEach((p, i) => {
        const x = px(p.t - t0), y = fy(p);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    }
    function dashed(y, color, label) {
      g.save(); g.setLineDash([4, 6]); g.strokeStyle = color; g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD.l, y); g.lineTo(W - PAD.r, y); g.stroke(); g.restore();
      g.fillStyle = color; g.font = '10px ui-monospace,monospace';
      g.fillText(label, W - PAD.r - 96, y - 4);
    }
  }

  /* ═══ 主迴圈 ═══ */
  const pulseAt = time => {
    let a = 0;
    for (const p of pulses) if (time >= p.t0 && time < p.t1) a += p.amp;
    return a;
  };

  let last = performance.now();
  function frame(now) {
    const real = Math.min(50, now - last); last = now;
    if (!document.hidden) {
      const simMs = real * 0.06 * SPEEDS[speed];      // 1× 時：每秒約 60 ms 模擬時間
      const nSteps = Math.max(1, Math.round(simMs / DT));
      for (let i = 0; i < nSteps; i++) {
        const I = hold + pulseAt(t);
        const { iNa, iK } = step(s, I);
        t += DT; acc += DT;

        const above = s.V > -20;
        if (above && !lastAbove) {                     // 尖峰起始
          spikeTotal++; spikes.push(t); flash = 1;
          curSpike = { amp: lastStimAmp, peak: s.V };
        }
        if (curSpike) {
          curSpike.peak = Math.max(curSpike.peak, s.V);
          if (!above && lastAbove) { spikePeaks.push(curSpike); checkAllOrNone(); curSpike = null; }
        }
        lastAbove = above;

        if (acc >= SAMPLE) {
          acc = 0;
          buf.push({ t, V: s.V, iNa, iK, m: s.m, h: s.h, n: s.n, I });
          if (buf.length > NPTS) buf.shift();
        }
        while (checks.length && t >= checks[0].at) checks.shift().run();
      }
      spikes = spikes.filter(x => x > t - WIN - 5);
      pulses = pulses.filter(p => p.t1 > t - WIN - 5);
      updateReadouts();
      draw();
    }
    requestAnimationFrame(frame);
  }

  function updateReadouts() {
    $('rV').textContent = s.V.toFixed(1);
    $('rI').textContent = (hold + pulseAt(t)).toFixed(1);
    $('rN').textContent = spikeTotal;
    const recent = spikes.filter(x => x > t - 250);
    let hz = 0;
    if (recent.length >= 2) {
      const isi = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
      hz = Math.round(1000 / isi);
    }
    $('rHz').textContent = hz;
    $('mNa').style.width = (Math.pow(s.m, 3) * s.h * 100).toFixed(1) + '%';
    $('mK').style.width = (Math.pow(s.n, 4) * 100).toFixed(1) + '%';

    if (hz > 0 && hold > 0) {
      rateSamples[hold] = hz;
      const hs = Object.values(rateSamples);
      if (hs.length >= 2 && Math.max(...hs) - Math.min(...hs) >= 8) unlock('rate');
    }
  }

  function checkAllOrNone() {
    const withAmp = spikePeaks.filter(p => p.amp > 0);
    for (let i = 0; i < withAmp.length; i++) {
      for (let j = i + 1; j < withAmp.length; j++) {
        const a = withAmp[i], b = withAmp[j];
        if (Math.max(a.amp, b.amp) >= 1.8 * Math.min(a.amp, b.amp) && Math.abs(a.peak - b.peak) < 6) {
          unlock('allornone'); return;
        }
      }
    }
  }

  /* ═══ 刺激 ═══ */
  function zap(a, at = t + 1) {
    pulses.push({ t0: at, t1: at + 1, amp: a });
    lastStimAmp = a;
    const before = spikeTotal;
    checks.push({ at: at + 8, run: () => { if (spikeTotal === before) unlock('sub'); } });
    checks.sort((x, y) => x.at - y.at);
  }

  $('zap').addEventListener('click', () => zap(amp));

  $('double').addEventListener('click', () => {
    const a = Math.max(amp, 15);                       // 保證單發一定會點火
    const before = spikeTotal, at = t + 1, g2 = gap;
    pulses.push({ t0: at, t1: at + 1, amp: a });
    pulses.push({ t0: at + g2, t1: at + g2 + 1, amp: a });
    lastStimAmp = a;
    checks.push({
      at: at + g2 + 10,
      run: () => { if (spikeTotal - before === 1) unlock('refract'); }
    });
    checks.sort((x, y) => x.at - y.at);
  });

  $('reset').addEventListener('click', () => {
    s = rest(); buf = []; spikes = []; spikeTotal = 0; pulses = []; checks.length = 0;
    spikePeaks.length = 0; curSpike = null; lastAbove = false;
    $('hold').value = 0; hold = 0; $('holdV').textContent = '0'; savePrefs();
  });

  /* ═══ 控制項 ═══ */
  const bind = (id, labId, fn, fmt = v => v) => {
    const el = $(id);
    const on = () => { fn(+el.value); $(labId).textContent = fmt(+el.value); savePrefs(); };
    el.addEventListener('input', on); on();
  };
  function savePrefs() {
    saveJSON(LSP, { amp, hold, gap, speed, cur: $('showCur').checked, gate: $('showGate').checked });
  }
  (function restorePrefs() {
    const p = loadJSON(LSP, null);
    if (!p) return;
    if (p.amp != null) $('amp').value = p.amp;
    if (p.gap != null) $('gap').value = p.gap;
    if (p.speed != null) $('speed').value = p.speed;
    $('showCur').checked = p.cur !== false;
    $('showGate').checked = !!p.gate;
  })();
  bind('amp', 'ampV', v => { amp = v; });
  bind('hold', 'holdV', v => { hold = v; });
  bind('gap', 'gapV', v => { gap = v; });
  bind('speed', 'speedV', v => { speed = v; }, v => SPEEDS[v] + '×');
  $('showCur').addEventListener('change', savePrefs);
  $('showGate').addEventListener('change', savePrefs);
  $('clear').addEventListener('click', () => {
    try { localStorage.removeItem(LSF); } catch (e) { /* 忽略 */ }
    found = {}; renderFinds();
  });

  /* ═══ f–I 曲線（離線快掃） ═══ */
  $('sweep').addEventListener('click', () => {
    const btn = $('sweep');
    btn.textContent = '計算中…'; btn.disabled = true;
    setTimeout(() => {
      const pts = [];
      for (let I = 0; I <= 20.0001; I += 0.5) {
        const st = rest();
        let count = 0, prev = false;
        const steps = Math.round(400 / DT);
        for (let i = 0; i < steps; i++) {
          step(st, I);
          const ab = st.V > -20;
          if (ab && !prev && i * DT > 100) count++;    // 丟掉前 100 ms 暫態
          prev = ab;
        }
        pts.push({ I, hz: count / 0.3 });
      }
      drawFI(pts);
      unlock('rate');
      $('fiPanel').hidden = false;
      $('fiPanel').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
      btn.textContent = '重新掃描 f–I 曲線'; btn.disabled = false;
    }, 30);
  });

  function drawFI(pts) {
    const W2 = 620, H2 = 220, L = 46, R = 16, T = 16, B = 34;
    const maxHz = Math.max(60, Math.ceil(Math.max(...pts.map(p => p.hz)) / 20) * 20);
    const X = I => L + I / 20 * (W2 - L - R);
    const Y = hz => T + (H2 - T - B) * (1 - hz / maxHz);
    const first = pts.find(p => p.hz > 0);
    let out = '';
    for (let k = 0; k <= 4; k++) {
      const hz = maxHz * k / 4;
      out += `<line class="ax" x1="${L}" x2="${W2 - R}" y1="${Y(hz).toFixed(1)}" y2="${Y(hz).toFixed(1)}"/>
              <text class="ax-t" x="${L - 6}" y="${(Y(hz) + 3).toFixed(1)}" text-anchor="end">${Math.round(hz)}</text>`;
    }
    for (let I = 0; I <= 20; I += 5) {
      out += `<text class="ax-t" x="${X(I)}" y="${H2 - 12}" text-anchor="middle">${I}</text>`;
    }
    out += `<polyline class="fi-line" points="${pts.map(p => `${X(p.I).toFixed(1)},${Y(p.hz).toFixed(1)}`).join(' ')}"/>`;
    if (first) {
      out += `<circle class="fi-dot" cx="${X(first.I).toFixed(1)}" cy="${Y(first.hz).toFixed(1)}" r="4"/>
              <text class="ax-t" x="${(X(first.I) + 9).toFixed(1)}" y="${(Y(first.hz) - 7).toFixed(1)}" fill="#ffc861">
                突然起跳：I ≈ ${first.I.toFixed(1)} → ${Math.round(first.hz)} Hz</text>`;
    }
    out += `<text class="ax-t" x="${W2 / 2}" y="${H2 - 1}" text-anchor="middle">注入電流 I（µA/cm²）</text>
            <text class="ax-t" x="10" y="11">放電頻率（Hz）</text>`;
    $('fiChart').innerHTML = out;
  }

  /* ═══ 啟動 ═══ */
  renderFinds();
  requestAnimationFrame(frame);
})();

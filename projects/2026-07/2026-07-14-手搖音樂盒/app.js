/* 手搖音樂盒 — 打孔紙卷 × 曲柄 × Web Audio 合成的鋼齒
   純靜態、零外部資源。localStorage 前綴：mbox.
   ------------------------------------------------------------------ */
(() => {
  'use strict';

  // ---------- 常數 ----------
  const ROWS = 15;                 // 15 音：C5–C7 大調音階（真實 DIY 機芯規格）
  const STEPS = 96;                // 96 格 ＝ 12 小節（每格一個八分音符）
  const BAR = 8;                   // 每小節 8 格
  const START = -1;                // 紙卷起點（留一格引紙）
  const SPT = 8;                   // 曲柄轉一圈走 8 格
  const KEY = 'mbox.';

  const MIDI = [72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96];
  const NAMES = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6', 'E6', 'F6', 'G6', 'A6', 'B6', 'C7'];
  const FREQ = MIDI.map(m => 440 * Math.pow(2, (m - 69) / 12));

  // 懸臂樑（單邊固定的鋼齒）的振動模態比：1 : 6.267 : 17.55 — 音樂盒之所以像鈴不像鋼琴
  const PARTIALS = [
    { r: 1, g: 1.00, d: 1.00 },
    { r: 6.267, g: 0.26, d: 0.30 },
    { r: 17.55, g: 0.10, d: 0.14 }
  ];

  // ---------- DOM ----------
  const cv = document.getElementById('stage');
  const ctx2d = cv.getContext('2d');
  const crankSvg = document.getElementById('crank');
  const crankGear = document.getElementById('crankGear');
  const crankTeeth = document.getElementById('crankTeeth');
  const crankLabel = document.getElementById('crankLabel');
  const turnsEl = document.getElementById('turns');
  const railFill = document.getElementById('railFill');
  const statusEl = document.getElementById('status');
  const motorBtn = document.getElementById('motorBtn');
  const motorText = document.getElementById('motorText');
  const rewindBtn = document.getElementById('rewindBtn');
  const loopChk = document.getElementById('loopChk');
  const tempoEl = document.getElementById('tempo');
  const tempoOut = document.getElementById('tempoOut');
  const volEl = document.getElementById('vol');
  const volOut = document.getElementById('volOut');
  const roomChk = document.getElementById('roomChk');
  const gearChk = document.getElementById('gearChk');
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const presetsEl = document.getElementById('presets');
  const saveBtn = document.getElementById('saveBtn');
  const drawerList = document.getElementById('drawerList');
  const drawerEmpty = document.getElementById('drawerEmpty');
  const cursorHint = document.getElementById('cursorHint');

  // ---------- 動效偏好 ----------
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = mqReduce.matches;
  const onReduce = e => { reduce = e.matches; if (reduce) particles.length = 0; dirty = true; };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduce);
  else if (mqReduce.addListener) mqReduce.addListener(onReduce);

  // ---------- 狀態 ----------
  const holes = new Uint8Array(ROWS * STEPS);
  const idx = (s, r) => s * ROWS + r;

  let pos = START;
  let motor = false;
  let tempo = 6;
  let volume = 0.7;
  let cursor = { s: 0, r: 7 };
  let showCursor = false;
  let dirty = true;
  let running = false;
  let visible = true;
  let onScreen = true;

  const vib = new Float32Array(ROWS);      // 鋼齒振幅
  const vibPh = new Float32Array(ROWS);    // 鋼齒相位
  const particles = [];
  const undoStack = [];

  // ---------- 版面尺寸 ----------
  let W = 0, H = 0, cellW = 30, cellH = 22, combW = 128, padY = 22, dpr = 1;

  function layout() {
    const wrap = cv.parentElement;
    const cssW = Math.max(280, wrap.clientWidth);
    const small = cssW < 560;
    cellW = small ? 22 : 30;
    cellH = small ? 17 : 22;
    combW = small ? 86 : 128;
    padY = small ? 18 : 22;
    W = cssW;
    H = ROWS * cellH + padY * 2;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  const readX = () => combW;                     // 讀取線＝梳齒尖端
  const rowY = r => padY + (ROWS - 1 - r) * cellH + cellH / 2;
  const stepX = s => readX() + (s - pos) * cellW;
  const visSteps = () => Math.floor((W - combW) / cellW);

  // ---------- 紙纖維紋理 ----------
  let fiber = null;
  function makeFiber() {
    const c = document.createElement('canvas');
    c.width = c.height = 90;
    const g = c.getContext('2d');
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * 0.06;
      g.fillStyle = Math.random() < 0.5 ? `rgba(120,92,52,${a})` : `rgba(255,246,224,${a})`;
      g.fillRect(Math.random() * 90, Math.random() * 90, 1 + Math.random() * 2, 1);
    }
    fiber = ctx2d.createPattern(c, 'repeat');
  }

  // ---------- 音訊 ----------
  let ac = null, master = null, dry = null, wet = null, conv = null;

  function audio() {
    if (ac) return ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = volume;
    master.connect(ac.destination);

    dry = ac.createGain(); dry.gain.value = 1; dry.connect(master);
    wet = ac.createGain(); wet.gain.value = roomChk.checked ? 0.34 : 0;
    conv = ac.createConvolver();
    conv.buffer = impulse(1.5, 2.6);
    conv.connect(wet); wet.connect(master);
    return ac;
  }

  function impulse(sec, decay) {
    const n = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(2, n, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * 0.7;
      }
    }
    return buf;
  }

  function send(node, pan) {
    let out = node;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      out = p;
    }
    out.connect(dry);
    out.connect(conv);
  }

  function pluck(row, vel) {
    const a = audio();
    if (!a) return;
    if (a.state === 'suspended') a.resume();
    const t = a.currentTime + 0.005;
    const f0 = FREQ[row];
    const bright = 1 - row / (ROWS * 1.6);      // 高音齒短、餘韻短
    const life = (1.05 + bright * 1.1);

    const bus = a.createGain();
    bus.gain.value = vel * 0.26;
    send(bus, (row / (ROWS - 1) - 0.5) * 0.55);

    PARTIALS.forEach((p, i) => {
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.value = f0 * p.r;
      o.detune.value = (Math.random() * 8 - 4) + (i ? Math.random() * 14 - 7 : 0);
      const g = a.createGain();
      const dur = life * p.d;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p.g, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus);
      o.start(t);
      o.stop(t + dur + 0.05);
    });

    // 齒尖被撥開的那一下「喀」
    const n = a.createBufferSource();
    const nb = a.createBuffer(1, 512, a.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < 512; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / 512, 3);
    n.buffer = nb;
    const nf = a.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = f0 * 4; nf.Q.value = 1.1;
    const ng = a.createGain(); ng.gain.value = 0.1 * vel;
    n.connect(nf); nf.connect(ng); ng.connect(bus);
    n.start(t);

    setTimeout(() => { try { bus.disconnect(); } catch (e) { /* 已釋放 */ } }, (life + 0.4) * 1000);
  }

  let lastGear = 0;
  function gearClick() {
    if (!gearChk.checked) return;
    const a = audio();
    if (!a) return;
    const now = a.currentTime;
    if (now - lastGear < 0.03) return;
    lastGear = now;
    const n = a.createBufferSource();
    const nb = a.createBuffer(1, 900, a.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < 900; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / 900, 6);
    n.buffer = nb;
    const f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400;
    const g = a.createGain(); g.gain.value = 0.05;
    n.connect(f); f.connect(g); g.connect(master);
    n.start(now);
  }

  // ---------- 走紙 ----------
  function advance(delta) {
    if (delta === 0) return;
    if (delta < 0) {                       // 倒轉：不發聲
      pos = Math.max(START, pos + delta);
      dirty = true;
      syncCrank();
      return;
    }
    let target = pos + delta;
    while (true) {
      const cap = Math.min(target, STEPS);
      trigger(pos, cap);
      pos = cap;
      if (target < STEPS) break;
      if (!loopChk.checked) { motorOff('紙卷走到底了。倒回開頭，或繼續打洞。'); break; }
      target -= (STEPS - START);
      pos = START;
      if (target <= START) break;
    }
    syncCrank();
    dirty = true;
  }

  function trigger(from, to) {
    const first = Math.floor(from) + 1;
    const last = Math.floor(to);
    for (let s = first; s <= last; s++) {
      if (s < 0 || s >= STEPS) continue;
      for (let r = 0; r < ROWS; r++) {
        if (holes[idx(s, r)]) {
          pluck(r, 1);
          vib[r] = 1; vibPh[r] = 0;
          spawnNote(r);
        }
      }
      gearClick();
    }
  }

  function spawnNote(r) {
    if (reduce || particles.length > 60) return;
    particles.push({
      x: readX() + 2, y: rowY(r), vx: 0.35 + Math.random() * 0.5,
      vy: -(0.55 + Math.random() * 0.5), life: 1,
      ch: Math.random() < 0.5 ? '♪' : '♫',
      size: 16 - r * 0.35, rot: (Math.random() - 0.5) * 0.5, kind: 'note'
    });
  }

  function spawnChip(x, y) {
    if (reduce) return;
    for (let i = 0; i < 5; i++) {
      particles.push({
        x, y, vx: (Math.random() - 0.2) * 1.6, vy: -(0.6 + Math.random() * 1.4),
        life: 1, size: 2 + Math.random() * 2, rot: 0, kind: 'chip'
      });
    }
  }

  // ---------- 曲柄 ----------
  const TEETH = 24;
  (function buildTeeth() {
    let s = '';
    for (let i = 0; i < TEETH; i++) {
      const a = (i / TEETH) * Math.PI * 2;
      const x = 80 + Math.cos(a) * 51.5, y = 80 + Math.sin(a) * 51.5;
      s += `<rect class="crank-tooth" x="${(x - 3).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="6" height="6" rx="1.5" transform="rotate(${(a * 180 / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    crankTeeth.innerHTML = s;
  })();

  function syncCrank() {
    const deg = ((pos - START) / SPT) * 360;
    crankGear.setAttribute('transform', `rotate(${deg.toFixed(2)} 80 80)`);
    crankSvg.setAttribute('aria-valuenow', String(Math.max(0, Math.round(pos))));
    turnsEl.textContent = Math.max(0, (pos - START) / SPT).toFixed(1);
    const p = Math.max(0, Math.min(1, (pos - START) / (STEPS - START)));
    railFill.style.width = (p * 100).toFixed(2) + '%';
  }

  let dragging = false, prevAng = 0;
  const angOf = e => {
    const b = crankSvg.getBoundingClientRect();
    return Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2));
  };

  crankSvg.addEventListener('pointerdown', e => {
    audio();
    dragging = true;
    prevAng = angOf(e);
    crankSvg.setPointerCapture(e.pointerId);
    crankSvg.classList.add('spinning');
    crankLabel.textContent = '轉！';
    motorOff();
    e.preventDefault();
  });
  crankSvg.addEventListener('pointermove', e => {
    if (!dragging) return;
    const a = angOf(e);
    let d = a - prevAng;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    prevAng = a;
    advance((d / (Math.PI * 2)) * SPT);
    kick();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    crankSvg.classList.remove('spinning');
    crankLabel.textContent = '拖著把手畫圈';
  };
  crankSvg.addEventListener('pointerup', endDrag);
  crankSvg.addEventListener('pointercancel', endDrag);
  crankSvg.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { audio(); advance(0.5); kick(); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { advance(-0.5); kick(); e.preventDefault(); }
  });

  // ---------- 馬達 ----------
  function motorOn() {
    audio();
    motor = true;
    motorBtn.setAttribute('aria-pressed', 'true');
    motorText.textContent = '停下來';
    say('發條轉起來了 · 隨時可以繼續打洞');
    kick();
  }
  function motorOff(msg) {
    if (!motor && !msg) return;
    motor = false;
    motorBtn.setAttribute('aria-pressed', 'false');
    motorText.textContent = '上發條自動轉';
    if (msg) say(msg);
  }
  motorBtn.addEventListener('click', () => (motor ? motorOff('停了。') : motorOn()));
  rewindBtn.addEventListener('click', () => {
    pos = START; syncCrank(); dirty = true; kick();
    say('紙卷倒回開頭。');
  });

  // ---------- 打洞 ----------
  let painting = false, paintVal = 1;

  function cellAt(e) {
    const b = cv.getBoundingClientRect();
    const x = (e.clientX - b.left) * (W / b.width);
    const y = (e.clientY - b.top) * (H / b.height);
    if (x < readX() - cellW * 0.5) return null;
    const s = Math.round(pos + (x - readX()) / cellW);
    const r = ROWS - 1 - Math.floor((y - padY) / cellH);
    if (s < 0 || s >= STEPS || r < 0 || r >= ROWS) return null;
    return { s, r };
  }

  function setHole(s, r, v, quiet) {
    const i = idx(s, r);
    if (holes[i] === v) return;
    holes[i] = v;
    if (v) {
      if (!quiet) { pluck(r, 0.85); vib[r] = 1; vibPh[r] = 0; }
      spawnChip(stepX(s), rowY(r));
    }
    dirty = true;
    kick();
    saveRoll();
  }

  function snapshot() {
    undoStack.push(holes.slice());
    if (undoStack.length > 24) undoStack.shift();
    undoBtn.disabled = false;
  }

  cv.addEventListener('pointerdown', e => {
    audio();
    const c = cellAt(e);
    if (!c) return;
    snapshot();
    painting = true;
    paintVal = holes[idx(c.s, c.r)] ? 0 : 1;
    cursor = { s: c.s, r: c.r };
    setHole(c.s, c.r, paintVal);
    cv.setPointerCapture(e.pointerId);
    say(`${paintVal ? '打洞' : '補起來'}：${NAMES[c.r]} · 第 ${c.s + 1} 格`);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (!painting) return;
    const c = cellAt(e);
    if (c) setHole(c.s, c.r, paintVal, true);
  });
  const endPaint = () => { painting = false; };
  cv.addEventListener('pointerup', endPaint);
  cv.addEventListener('pointercancel', endPaint);

  cv.addEventListener('focus', () => { showCursor = true; dirty = true; kick(); });
  cv.addEventListener('blur', () => { showCursor = false; dirty = true; kick(); });
  cv.addEventListener('keydown', e => {
    const k = e.key;
    let used = true;
    if (k === 'ArrowUp') cursor.r = Math.min(ROWS - 1, cursor.r + 1);
    else if (k === 'ArrowDown') cursor.r = Math.max(0, cursor.r - 1);
    else if (k === 'ArrowRight') cursor.s = Math.min(STEPS - 1, cursor.s + 1);
    else if (k === 'ArrowLeft') cursor.s = Math.max(0, cursor.s - 1);
    else if (k === 'Enter') {
      audio();
      snapshot();
      const v = holes[idx(cursor.s, cursor.r)] ? 0 : 1;
      setHole(cursor.s, cursor.r, v);
      say(`${v ? '打洞' : '補起來'}：${NAMES[cursor.r]} · 第 ${cursor.s + 1} 格`);
    } else used = false;
    if (!used) return;
    e.preventDefault();
    showCursor = true;
    const vs = visSteps();
    if (cursor.s < pos + 1) pos = Math.max(START, cursor.s - 1);
    if (cursor.s > pos + vs - 2) pos = cursor.s - vs + 2;
    syncCrank();
    dirty = true;
    kick();
  });

  // ---------- 控制 ----------
  tempoEl.addEventListener('input', () => {
    tempo = parseFloat(tempoEl.value);
    tempoOut.textContent = tempo.toFixed(1) + ' 格/秒';
    saveSettings();
  });
  volEl.addEventListener('input', () => {
    volume = parseInt(volEl.value, 10) / 100;
    volOut.textContent = volEl.value;
    if (master) master.gain.value = volume;
    saveSettings();
  });
  roomChk.addEventListener('change', () => {
    if (wet) wet.gain.value = roomChk.checked ? 0.34 : 0;
    saveSettings();
  });
  gearChk.addEventListener('change', saveSettings);
  loopChk.addEventListener('change', saveSettings);

  undoBtn.addEventListener('click', () => {
    const prev = undoStack.pop();
    if (!prev) return;
    holes.set(prev);
    undoBtn.disabled = undoStack.length === 0;
    dirty = true; kick(); saveRoll();
    say('復原了上一步。');
  });
  clearBtn.addEventListener('click', () => {
    snapshot();
    holes.fill(0);
    dirty = true; kick(); saveRoll();
    markPreset(null);
    say('紙卷清空了。從一個洞開始。');
  });

  document.addEventListener('keydown', e => {
    const t = e.target;
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'button' || t === crankSvg) return;
    if (e.key === ' ') {
      e.preventDefault();
      motor ? motorOff('停了。') : motorOn();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoBtn.click();
    }
  });

  // ---------- 曲子 ----------
  const P = { C5: 0, D5: 1, E5: 2, F5: 3, G5: 4, A5: 5, B5: 6, C6: 7, D6: 8, E6: 9, F6: 10, G6: 11, A6: 12, B6: 13, C7: 14 };

  function twinkle() {
    const n = [];
    const phrase = (o, a, b, c, d, e, f, g) => {
      n.push([o, a], [o + 2, b], [o + 4, c], [o + 6, d], [o + 8, e], [o + 10, f], [o + 12, g]);
    };
    phrase(0, P.C5, P.C5, P.G5, P.G5, P.A5, P.A5, P.G5);
    phrase(16, P.F5, P.F5, P.E5, P.E5, P.D5, P.D5, P.C5);
    phrase(32, P.G5, P.G5, P.F5, P.F5, P.E5, P.E5, P.D5);
    phrase(48, P.G5, P.G5, P.F5, P.F5, P.E5, P.E5, P.D5);
    phrase(64, P.C5, P.C5, P.G5, P.G5, P.A5, P.A5, P.G5);
    phrase(80, P.F5, P.F5, P.E5, P.E5, P.D5, P.D5, P.C5);
    return n;
  }

  function joy() {
    const half = [
      [0, P.E5], [2, P.E5], [4, P.F5], [6, P.G5],
      [8, P.G5], [10, P.F5], [12, P.E5], [14, P.D5],
      [16, P.C5], [18, P.C5], [20, P.D5], [22, P.E5],
      [24, P.E5], [27, P.D5], [28, P.D5]
    ];
    const n = half.slice();
    half.forEach(([s, r]) => n.push([s + 32, r]));
    // 後半句收在主音
    n[n.length - 3] = [56, P.D5];
    n[n.length - 2] = [59, P.C5];
    n[n.length - 1] = [60, P.C5];
    return n;
  }

  function tigers() {   // 兩隻老虎（Frère Jacques）
    const n = [];
    const a = [[0, P.C6], [2, P.D6], [4, P.E6], [6, P.C6]];
    a.forEach(([s, r]) => { n.push([s, r]); n.push([s + 8, r]); });
    const b = [[16, P.E6], [18, P.F6], [20, P.G6]];
    b.forEach(([s, r]) => { n.push([s, r]); n.push([s + 8, r]); });
    const c = [[32, P.G6], [33, P.A6], [34, P.G6], [35, P.F6], [36, P.E6], [38, P.C6]];
    c.forEach(([s, r]) => { n.push([s, r]); n.push([s + 8, r]); });
    const d = [[48, P.C6], [50, P.G5], [52, P.C6]];
    d.forEach(([s, r]) => { n.push([s, r]); n.push([s + 8, r]); });
    return n;
  }

  function canon() {    // 帕海貝爾《卡農》的和弦進行（C G Am Em F C F G）的分解和弦
    const chords = [
      [P.C5, P.E5, P.G5, P.C6],
      [P.G5, P.B5, P.D6, P.G6],
      [P.A5, P.C6, P.E6, P.A6],
      [P.E5, P.G5, P.B5, P.E6],
      [P.F5, P.A5, P.C6, P.F6],
      [P.C5, P.E5, P.G5, P.C6],
      [P.F5, P.A5, P.C6, P.F6],
      [P.G5, P.B5, P.D6, P.G6]
    ];
    const shape = [0, 1, 2, 3, 2, 1, 2, 3];
    const n = [];
    chords.forEach((ch, b) => {
      shape.forEach((k, i) => n.push([b * BAR + i, ch[k]]));
    });
    return n;
  }

  function improvise() {  // 五聲音階隨機曲：怎麼打都不會走音
    const pent = [P.C5, P.D5, P.E5, P.G5, P.A5, P.C6, P.D6, P.E6, P.G6, P.A6, P.C7];
    const n = [];
    let i = 4, s = 0;
    while (s < STEPS) {
      i = Math.max(0, Math.min(pent.length - 1, i + (Math.floor(Math.random() * 5) - 2)));
      n.push([s, pent[i]]);
      if (Math.random() < 0.28) n.push([s, pent[Math.max(0, i - 2)]]);   // 偶爾疊個和音
      s += [1, 2, 2, 2, 3, 4][Math.floor(Math.random() * 6)];
    }
    return n;
  }

  const PRESETS = [
    { id: 'blank', name: '空白紙卷', sub: '從第一個洞開始', gen: () => [] },
    { id: 'twinkle', name: '小星星', sub: '莫札特也變奏過', gen: twinkle },
    { id: 'joy', name: '快樂頌', sub: '貝多芬 1824', gen: joy },
    { id: 'tigers', name: '兩隻老虎', sub: '法國童謠', gen: tigers },
    { id: 'canon', name: '卡農和弦', sub: '分解和弦版', gen: canon },
    { id: 'improv', name: '即興五聲', sub: '每次都不一樣', gen: improvise }
  ];

  PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset';
    b.type = 'button';
    b.dataset.id = p.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<b>${p.name}</b><span>${p.sub}</span>`;
    b.addEventListener('click', () => loadPreset(p));
    presetsEl.appendChild(b);
  });

  function markPreset(id) {
    presetsEl.querySelectorAll('.preset').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.id === id));
    });
  }

  function loadPreset(p) {
    audio();
    snapshot();
    holes.fill(0);
    p.gen().forEach(([s, r]) => { if (s >= 0 && s < STEPS && r >= 0 && r < ROWS) holes[idx(s, r)] = 1; });
    pos = START;
    syncCrank();
    markPreset(p.id);
    dirty = true; kick(); saveRoll();
    say(`換上《${p.name}》——轉曲柄，或按「上發條」。`);
  }

  // ---------- 抽屜（localStorage） ----------
  function encode() {
    let out = '';
    for (let s = 0; s < STEPS; s++) {
      let m = 0;
      for (let r = 0; r < ROWS; r++) if (holes[idx(s, r)]) m |= (1 << r);
      out += m.toString(16).padStart(4, '0');
    }
    return out;
  }
  function decode(str) {
    if (typeof str !== 'string' || str.length < STEPS * 4) return false;
    holes.fill(0);
    for (let s = 0; s < STEPS; s++) {
      const m = parseInt(str.slice(s * 4, s * 4 + 4), 16) || 0;
      for (let r = 0; r < ROWS; r++) if (m & (1 << r)) holes[idx(s, r)] = 1;
    }
    return true;
  }

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(KEY + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* 隱私模式 */ }
    }
  };

  let saveT = 0;
  function saveRoll() {
    clearTimeout(saveT);
    saveT = setTimeout(() => store.set('roll', encode()), 300);
  }
  function saveSettings() {
    store.set('settings', {
      tempo: tempoEl.value, vol: volEl.value,
      room: roomChk.checked, gear: gearChk.checked, loop: loopChk.checked
    });
  }

  function drawer() { return store.get('drawer', []); }

  function renderDrawer() {
    const d = drawer();
    drawerList.innerHTML = '';
    drawerEmpty.style.display = d.length ? 'none' : 'block';
    d.forEach((roll, i) => {
      const li = document.createElement('li');
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = roll.name;
      open.setAttribute('aria-label', `載入紙卷 ${roll.name}`);
      open.addEventListener('click', () => {
        snapshot();
        if (decode(roll.data)) {
          pos = START; syncCrank(); markPreset(null);
          dirty = true; kick(); saveRoll();
          say(`從抽屜裡拿出《${roll.name}》。`);
        }
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '✕';
      del.setAttribute('aria-label', `刪除紙卷 ${roll.name}`);
      del.addEventListener('click', () => {
        const arr = drawer();
        arr.splice(i, 1);
        store.set('drawer', arr);
        renderDrawer();
        say(`《${roll.name}》丟掉了。`);
      });
      li.appendChild(open);
      li.appendChild(del);
      drawerList.appendChild(li);
    });
  }

  saveBtn.addEventListener('click', () => {
    let count = 0;
    for (let i = 0; i < holes.length; i++) if (holes[i]) count++;
    if (!count) { say('紙上一個洞都沒有，先打幾個吧。'); return; }
    const arr = drawer();
    if (arr.length >= 8) arr.pop();
    const label = '紙卷 ' + String.fromCharCode(65 + (store.get('seq', 0) % 26));
    store.set('seq', store.get('seq', 0) + 1);
    arr.unshift({ name: label, data: encode(), n: count });
    store.set('drawer', arr);
    renderDrawer();
    say(`《${label}》收進抽屜（${count} 個洞）。`);
  });

  // ---------- 狀態列 ----------
  let sayT = 0;
  function say(msg) {
    clearTimeout(sayT);
    statusEl.textContent = msg;
    sayT = setTimeout(() => {
      if (statusEl.textContent === msg) statusEl.textContent = motor ? '轉動中……' : '';
    }, 4200);
  }

  // ---------- 繪製 ----------
  function draw(t) {
    const g = ctx2d;
    const rx = readX();
    g.clearRect(0, 0, W, H);

    // 紙卷（裁到讀取線右邊：紙從梳齒底下鑽進機芯）
    g.save();
    g.beginPath();
    g.rect(rx, 0, W - rx, H);
    g.clip();

    const pg = g.createLinearGradient(0, 0, 0, H);
    pg.addColorStop(0, '#dcc79e');
    pg.addColorStop(0.12, '#eddcba');
    pg.addColorStop(0.88, '#e6d3ab');
    pg.addColorStop(1, '#cfb890');
    g.fillStyle = pg;
    g.fillRect(rx, 0, W - rx, H);
    if (fiber) { g.fillStyle = fiber; g.fillRect(rx, 0, W - rx, H); }

    // 紙緣
    g.fillStyle = 'rgba(140,108,64,.28)';
    g.fillRect(rx, 0, W - rx, 1.5);
    g.fillRect(rx, H - 1.5, W - rx, 1.5);

    const s0 = Math.max(0, Math.floor(pos) - 1);
    const s1 = Math.min(STEPS - 1, Math.ceil(pos + visSteps()) + 1);

    // 橫線（每一音一條軌）
    g.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
      const y = rowY(r);
      g.strokeStyle = (r % 7 === 0) ? 'rgba(120,88,48,.34)' : 'rgba(140,110,70,.16)';
      g.beginPath();
      g.moveTo(rx, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }

    // 小節線
    for (let s = s0; s <= s1; s++) {
      if (s % BAR !== 0) continue;
      const x = stepX(s) - cellW / 2;
      if (x < rx - 2 || x > W) continue;
      g.strokeStyle = (s % (BAR * 4) === 0) ? 'rgba(120,88,48,.42)' : 'rgba(140,110,70,.2)';
      g.beginPath();
      g.moveTo(x + 0.5, padY * 0.5);
      g.lineTo(x + 0.5, H - padY * 0.5);
      g.stroke();
      if (s % (BAR * 4) === 0) {
        g.fillStyle = 'rgba(110,80,44,.5)';
        g.font = '10px ui-monospace,monospace';
        g.fillText(String(s / BAR + 1), x + 4, padY * 0.5 + 9);
      }
    }

    // 格點與孔
    for (let s = s0; s <= s1; s++) {
      const x = stepX(s);
      if (x < rx - cellW || x > W + cellW) continue;
      for (let r = 0; r < ROWS; r++) {
        const y = rowY(r);
        if (holes[idx(s, r)]) {
          const rr = Math.min(cellW, cellH) * 0.3;
          g.beginPath();
          g.arc(x, y, rr, 0, Math.PI * 2);
          g.fillStyle = '#2a1c0f';
          g.fill();
          g.beginPath();
          g.arc(x - rr * 0.22, y - rr * 0.22, rr * 0.72, 0, Math.PI * 2);
          g.fillStyle = 'rgba(0,0,0,.55)';
          g.fill();
          g.beginPath();
          g.arc(x, y, rr + 1, Math.PI * 0.9, Math.PI * 1.9);
          g.strokeStyle = 'rgba(255,248,228,.5)';
          g.lineWidth = 1;
          g.stroke();
        } else {
          g.beginPath();
          g.arc(x, y, 1.2, 0, Math.PI * 2);
          g.fillStyle = 'rgba(120,90,50,.28)';
          g.fill();
        }
      }
    }

    // 鍵盤游標
    if (showCursor) {
      const cx = stepX(cursor.s), cy = rowY(cursor.r);
      g.strokeStyle = 'rgba(180,60,40,.85)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(cx, cy, Math.min(cellW, cellH) * 0.44, 0, Math.PI * 2);
      g.stroke();
    }

    // 右緣：紙還很長
    const eg = g.createLinearGradient(W - 46, 0, W, 0);
    eg.addColorStop(0, 'rgba(40,26,14,0)');
    eg.addColorStop(1, 'rgba(30,20,10,.42)');
    g.fillStyle = eg;
    g.fillRect(W - 46, 0, 46, H);
    g.restore();

    // 機芯底座
    const bg = g.createLinearGradient(0, 0, rx, 0);
    bg.addColorStop(0, '#1d1309');
    bg.addColorStop(0.72, '#2a1c10');
    bg.addColorStop(1, '#120c06');
    g.fillStyle = bg;
    g.fillRect(0, 0, rx, H);

    drawComb(g, t, rx);

    // 讀取線
    g.strokeStyle = 'rgba(255,228,160,.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(rx + 0.5, 4);
    g.lineTo(rx + 0.5, H - 4);
    g.stroke();
    g.fillStyle = 'rgba(255,228,160,.1)';
    g.fillRect(rx - 3, 0, 6, H);

    drawParticles(g);
  }

  function drawComb(g, t, rx) {
    const spineX = 14;
    for (let r = 0; r < ROWS; r++) {
      const y = rowY(r);
      const th = Math.max(3, cellH * 0.46 - r * (cellH * 0.012));
      const a = vib[r];
      const wob = reduce ? 0 : Math.sin(vibPh[r]) * a * (cellH * 0.28);

      // 齒身
      g.beginPath();
      g.moveTo(spineX, y - th / 2);
      g.quadraticCurveTo((spineX + rx) / 2, y - th / 2 + wob * 0.5, rx, y - th / 2 + wob);
      g.lineTo(rx, y + th / 2 + wob);
      g.quadraticCurveTo((spineX + rx) / 2, y + th / 2 + wob * 0.5, spineX, y + th / 2);
      g.closePath();
      const tg = g.createLinearGradient(spineX, y - th, rx, y + th);
      tg.addColorStop(0, '#8f6a2a');
      tg.addColorStop(0.35, '#e8c471');
      tg.addColorStop(0.6, '#c99a3c');
      tg.addColorStop(1, '#8a642a');
      g.fillStyle = tg;
      g.fill();
      g.strokeStyle = 'rgba(60,40,12,.7)';
      g.lineWidth = 0.7;
      g.stroke();

      // 低音齒背後的鉛配重（真實音樂盒的做法）
      if (r < 5) {
        g.beginPath();
        g.ellipse(spineX + (rx - spineX) * 0.34, y + wob * 0.35, Math.max(3, th * 0.5), th * 0.42, 0, 0, Math.PI * 2);
        g.fillStyle = '#6d6f76';
        g.fill();
        g.strokeStyle = 'rgba(20,20,24,.6)';
        g.stroke();
      }

      // 被撥響時的光
      if (a > 0.02) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const glow = g.createRadialGradient(rx - 6, y + wob, 0, rx - 6, y + wob, 26);
        glow.addColorStop(0, `rgba(255,236,180,${0.5 * a})`);
        glow.addColorStop(1, 'rgba(255,236,180,0)');
        g.fillStyle = glow;
        g.fillRect(rx - 34, y - 26, 40, 52);
        g.restore();
      }

      // 音名
      g.fillStyle = a > 0.05 ? 'rgba(255,240,200,.95)' : 'rgba(233,215,178,.34)';
      g.font = `${Math.max(8, cellH * 0.4)}px ui-monospace,monospace`;
      g.textAlign = 'left';
      g.fillText(NAMES[r], 1, y + 3);
    }

    // 梳背
    const sg = g.createLinearGradient(0, 0, spineX, 0);
    sg.addColorStop(0, '#5a4116');
    sg.addColorStop(0.6, '#caa049');
    sg.addColorStop(1, '#7d5a1e');
    g.fillStyle = sg;
    g.fillRect(spineX - 8, padY * 0.4, 9, H - padY * 0.8);
    g.strokeStyle = 'rgba(255,240,200,.25)';
    g.lineWidth = 1;
    g.strokeRect(spineX - 8.5, padY * 0.4, 9, H - padY * 0.8);
  }

  function drawParticles(g) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      g.save();
      g.globalAlpha = Math.max(0, p.life);
      if (p.kind === 'note') {
        g.fillStyle = '#ffe6a8';
        g.shadowColor = 'rgba(255,220,150,.8)';
        g.shadowBlur = 10;
        g.font = `${p.size}px serif`;
        g.textAlign = 'center';
        g.fillText(p.ch, p.x, p.y);
      } else {
        g.fillStyle = '#e9d7b2';
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  // ---------- 迴圈 ----------
  let last = 0;
  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;

    if (motor) advance(tempo * dt);

    let animating = motor || dragging;
    for (let r = 0; r < ROWS; r++) {
      if (vib[r] > 0.001) {
        vib[r] *= Math.exp(-dt * 3.4);
        vibPh[r] += dt * (34 + r * 3.2);
        animating = true;
      } else if (vib[r]) { vib[r] = 0; dirty = true; }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      if (p.kind === 'chip') p.vy += 0.14;
      p.life -= dt * (p.kind === 'chip' ? 1.6 : 0.9);
      if (p.life <= 0) particles.splice(i, 1);
      animating = true;
    }

    if (dirty || animating) { draw(t / 1000); dirty = false; }
    requestAnimationFrame(loop);
  }

  function kick() {
    dirty = true;
    startLoop();
  }

  function startLoop() {
    if (running || !visible || !onScreen) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
  function stopLoop() {
    running = false;
    if (motor) motorOff();
  }

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible) startLoop(); else stopLoop();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      onScreen = entries[0].isIntersecting;
      if (onScreen) startLoop(); else stopLoop();
    }, { threshold: 0.05 }).observe(cv);
  }

  let rzT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { layout(); makeFiber(); draw(0); }, 120);
  });

  // ---------- 開機 ----------
  function boot() {
    layout();
    makeFiber();

    const st = store.get('settings', null);
    if (st) {
      tempoEl.value = st.tempo != null ? st.tempo : 6;
      volEl.value = st.vol != null ? st.vol : 70;
      roomChk.checked = st.room !== false;
      gearChk.checked = st.gear !== false;
      loopChk.checked = st.loop !== false;
    }
    tempo = parseFloat(tempoEl.value);
    volume = parseInt(volEl.value, 10) / 100;
    tempoOut.textContent = tempo.toFixed(1) + ' 格/秒';
    volOut.textContent = volEl.value;
    undoBtn.disabled = true;

    const saved = store.get('roll', null);
    if (!saved || !decode(saved)) {
      loadPresetSilently(PRESETS[1]);       // 第一次來：紙上已經刻好《小星星》
      markPreset('twinkle');
      store.set('roll', encode());
    }
    cursorHint.textContent = '點紙就是打洞 · 拖著曲柄畫圈';

    renderDrawer();
    syncCrank();
    startLoop();
    draw(0);
  }

  function loadPresetSilently(p) {
    holes.fill(0);
    p.gen().forEach(([s, r]) => { if (s >= 0 && s < STEPS && r >= 0 && r < ROWS) holes[idx(s, r)] = 1; });
  }

  boot();
})();

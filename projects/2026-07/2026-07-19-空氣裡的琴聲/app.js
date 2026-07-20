/* ══════════════════════════════════════════════════════
   空氣裡的琴聲 · 特雷門琴
   Web Audio 即時合成 · 零錄音檔 · 離線可用
   localStorage 前綴：theremin.
   ══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ---------- 常數 ---------- */
  var LS = 'theremin.';
  var FMIN = 65.41;      // C2
  var OCT = 4;           // 到 C6
  var NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  /* ---------- 偏好（localStorage） ---------- */
  var prefs = { wave: 'sine', scale: false, vib: 28, reverb: true };
  try {
    var raw = localStorage.getItem(LS + 'prefs');
    if (raw) { var p = JSON.parse(raw); if (p && typeof p === 'object') {
      if (p.wave) prefs.wave = p.wave;
      if (typeof p.scale === 'boolean') prefs.scale = p.scale;
      if (typeof p.vib === 'number') prefs.vib = p.vib;
      if (typeof p.reverb === 'boolean') prefs.reverb = p.reverb;
    } }
  } catch (e) {}
  function savePrefs() { try { localStorage.setItem(LS + 'prefs', JSON.stringify(prefs)); } catch (e) {} }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), playfield = $('playfield'), handEl = $('hand');
  var fieldCv = $('field'), scopeCv = $('scope');
  var roNote = $('roNote'), roFreq = $('roFreq'), roVol = $('roVol');
  var antPitch = $('antPitch'), antVol = $('antVol');
  var startVeil = $('startVeil'), startBtn = $('startBtn');
  var ghostBtn = $('ghostBtn'), scaleChk = $('scaleChk'), revChk = $('revChk'), vibSlider = $('vibSlider');
  var segBtns = Array.prototype.slice.call(document.querySelectorAll('.seg'));
  var playTip = $('playTip');

  /* ---------- 動態偏好套用 UI ---------- */
  scaleChk.checked = prefs.scale;
  revChk.checked = prefs.reverb;
  vibSlider.value = String(prefs.vib);
  segBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.wave === prefs.wave ? 'true' : 'false'); });

  /* ---------- reduced-motion ---------- */
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  var reduced = mqReduce.matches;
  function onReduceChange() {
    reduced = mqReduce.matches;
    if (reduced) {
      ripples.length = 0;
      var bs = document.querySelectorAll('.beat, .reveal');
      for (var i = 0; i < bs.length; i++) bs[i].classList.add('in');
    } else if (audioReady) { ensureLoop(); }
  }
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduceChange);
  else if (mqReduce.addListener) mqReduce.addListener(onReduceChange);

  /* ══════════════════════════════════════════
     音訊
     ══════════════════════════════════════════ */
  var actx = null, osc = null, filter = null, ampGain = null, master = null,
      analyser = null, vibOsc = null, vibGain = null, conv = null, wetGain = null, dryGain = null;
  var audioReady = false, scopeBuf = null;

  function makeReverbIR(ctx) {
    var len = Math.floor(ctx.sampleRate * 2.2);
    var ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      }
    }
    return ir;
  }

  function initAudio() {
    if (audioReady) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { if (playTip) playTip.textContent = '你的瀏覽器不支援 Web Audio，無法演奏 😢'; return false; }
    actx = new AC();

    osc = actx.createOscillator();
    osc.type = prefs.wave;
    osc.frequency.value = FMIN * Math.pow(2, 0.5 * OCT);

    // 顫音 LFO → detune（音分）
    vibOsc = actx.createOscillator();
    vibOsc.type = 'sine';
    vibOsc.frequency.value = 5.6;
    vibGain = actx.createGain();
    vibGain.gain.value = prefs.vib;
    vibOsc.connect(vibGain);
    vibGain.connect(osc.detune);

    filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 3600;
    filter.Q.value = 0.6;

    ampGain = actx.createGain();
    ampGain.gain.value = 0;

    master = actx.createGain();
    master.gain.value = 0.9;

    // 殘響（程序生成脈衝響應，無外部檔）
    conv = actx.createConvolver();
    conv.buffer = makeReverbIR(actx);
    wetGain = actx.createGain();
    wetGain.gain.value = prefs.reverb ? 0.32 : 0;
    dryGain = actx.createGain();
    dryGain.gain.value = 0.92;

    analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    scopeBuf = new Uint8Array(analyser.fftSize);

    // 接線：osc → filter → amp →(dry)→ master ; amp → conv → wet → master
    osc.connect(filter);
    filter.connect(ampGain);
    ampGain.connect(dryGain);
    dryGain.connect(master);
    ampGain.connect(conv);
    conv.connect(wetGain);
    wetGain.connect(master);
    master.connect(analyser);
    master.connect(actx.destination);

    osc.start();
    vibOsc.start();
    audioReady = true;
    return true;
  }

  function nowT() { return actx ? actx.currentTime : 0; }

  /* ---------- 音高／音量映射 ---------- */
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }

  // 音階吸附：A 小調五聲（A C D E G）
  var scaleMidis = (function () {
    var pc = { 9: 1, 0: 1, 2: 1, 4: 1, 7: 1 }, arr = [];
    for (var m = 36; m <= 84; m++) if (pc[((m % 12) + 12) % 12]) arr.push(m);
    return arr;
  })();
  function snapFreq(f) {
    var m = freqToMidi(f), best = scaleMidis[0], bd = Infinity;
    for (var i = 0; i < scaleMidis.length; i++) {
      var dd = Math.abs(scaleMidis[i] - m);
      if (dd < bd) { bd = dd; best = scaleMidis[i]; }
    }
    return midiToFreq(best);
  }
  // 鍵盤數字鍵用的 8 音
  var kbScale = [57, 60, 62, 64, 67, 69, 72, 76].map(midiToFreq); // A3 C4 D4 E4 G4 A4 C5 E5

  function freqFromX(x) {
    x = Math.max(0, Math.min(1, x));
    var base = FMIN * Math.pow(2, x * OCT);
    return prefs.scale ? snapFreq(base) : base;
  }
  function xFromFreq(f) { return Math.max(0, Math.min(1, Math.log2(f / FMIN) / OCT)); }
  function noteName(f) {
    var mr = Math.round(freqToMidi(f));
    return NAMES[((mr % 12) + 12) % 12] + (Math.floor(mr / 12) - 1);
  }

  /* ══════════════════════════════════════════
     演奏狀態
     ══════════════════════════════════════════ */
  var hand = { x: 0.5, y: 0.5 };     // 0..1，y：0 上（靜）1 下（響）
  var pointerEngaged = false, sustain = false, ghostOn = false;

  function sounding() { return pointerEngaged || sustain || ghostOn; }

  function applyAudio(glide) {
    if (!audioReady) return;
    var f = freqFromX(hand.x);
    osc.frequency.setTargetAtTime(f, nowT(), glide == null ? 0.045 : glide);
    var vol = sounding() ? Math.pow(Math.max(0, Math.min(1, hand.y)), 1.4) * 0.82 : 0;
    ampGain.gain.setTargetAtTime(vol, nowT(), sounding() ? 0.03 : 0.07);
    updateReadout(f, sounding() ? hand.y : 0);
    updateGlow(hand.x, sounding() ? hand.y : 0);
  }

  function updateReadout(f, vol01) {
    if (sounding() && isFinite(f) && f > 0) {
      roNote.textContent = noteName(f);
      roFreq.textContent = Math.round(f) + ' Hz';
      roVol.textContent = '音量 ' + Math.round(Math.pow(Math.max(0, vol01), 1.4) * 100) + '%';
      roNote.style.color = '';
    } else {
      roNote.textContent = '—';
      roFreq.textContent = '靜默';
      roVol.textContent = '音量 0%';
    }
  }

  function updateGlow(x, vol01) {
    var pb = 1 + x * 1.6;                       // 音高天線亮度
    var vb = 1 + Math.max(0, vol01) * 1.4;      // 音量天線亮度
    antPitch.style.filter = 'brightness(' + pb.toFixed(2) + ')';
    antVol.style.filter = 'brightness(' + vb.toFixed(2) + ')';
  }

  function placeHand() {
    var w = playfield.clientWidth, h = playfield.clientHeight;
    handEl.style.transform = 'translate(' + (hand.x * w) + 'px,' + (hand.y * h) + 'px)';
  }

  function setHand(x, y, glide) {
    hand.x = Math.max(0, Math.min(1, x));
    hand.y = Math.max(0, Math.min(1, y));
    placeHand();
    applyAudio(glide);
  }

  /* ---------- 指標事件 ---------- */
  function fieldXY(e) {
    var r = playfield.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  function engagePointer() {
    if (ghostOn) stopGhost();
    pointerEngaged = true;
    handEl.classList.add('on');
  }
  function disengagePointer() {
    pointerEngaged = false;
    if (!sustain) { handEl.classList.remove('on'); applyAudio(); }
  }

  playfield.addEventListener('pointermove', function (e) {
    if (!audioReady) return;
    if (!pointerEngaged) engagePointer();
    var p = fieldXY(e);
    setHand(p.x, p.y);
  });
  playfield.addEventListener('pointerdown', function (e) {
    if (!audioReady) return;
    try { playfield.setPointerCapture(e.pointerId); } catch (er) {}
    engagePointer();
    var p = fieldXY(e);
    setHand(p.x, p.y);
    e.preventDefault();
  });
  playfield.addEventListener('pointerup', function (e) {
    if (e.pointerType !== 'mouse') disengagePointer();
  });
  playfield.addEventListener('pointercancel', function () { disengagePointer(); });
  playfield.addEventListener('pointerleave', function (e) {
    if (e.pointerType === 'mouse') disengagePointer();
  });

  /* ---------- 鍵盤 ---------- */
  playfield.addEventListener('keydown', function (e) {
    if (!audioReady) { if (e.key === ' ' || e.key === 'Enter') { startAudio(); e.preventDefault(); } return; }
    var k = e.key, step = 0.035;
    if (k === ' ') {
      sustain = !sustain;
      handEl.classList.toggle('on', sustain || pointerEngaged);
      applyAudio();
      e.preventDefault();
    } else if (k === 'ArrowLeft') { setHand(hand.x - step, hand.y); e.preventDefault(); }
    else if (k === 'ArrowRight') { setHand(hand.x + step, hand.y); e.preventDefault(); }
    else if (k === 'ArrowUp') { setHand(hand.x, hand.y - step); e.preventDefault(); }
    else if (k === 'ArrowDown') { setHand(hand.x, hand.y + step); e.preventDefault(); }
    else if (k === 'Escape') { sustain = false; handEl.classList.toggle('on', pointerEngaged); applyAudio(); }
    else if (k >= '1' && k <= '8') {
      if (ghostOn) stopGhost();
      var f = kbScale[parseInt(k, 10) - 1];
      sustain = true; handEl.classList.add('on');
      setHand(xFromFreq(f), hand.y < 0.15 ? 0.55 : hand.y, 0.05);
      e.preventDefault();
    }
  });

  /* ══════════════════════════════════════════
     幽靈演奏家
     ══════════════════════════════════════════ */
  // 一段飄渺的旋律（音名, 拍長秒）
  var GHOST = [
    ['A4', .95], ['C5', .55], ['E5', .95], ['F5', .5], ['E5', 1.0],
    ['C5', .6], ['B4', .55], ['A4', 1.15], ['REST', .35],
    ['E5', .7], ['D5', .55], ['C5', .6], ['B4', .6], ['A4', .8],
    ['G4', .6], ['A4', 1.5]
  ];
  var NOTE_HZ = { 'G4': midiToFreq(67), 'A4': midiToFreq(69), 'B4': midiToFreq(71),
    'C5': midiToFreq(72), 'D5': midiToFreq(74), 'E5': midiToFreq(76), 'F5': midiToFreq(77) };
  var ghostTimers = [];

  function stopGhost() {
    if (!ghostOn) return;
    ghostOn = false;
    ghostTimers.forEach(clearTimeout); ghostTimers.length = 0;
    ghostBtn.classList.remove('playing');
    ghostBtn.textContent = '👻 幽靈演奏家';
    handEl.style.transition = '';
    if (!pointerEngaged && !sustain) { handEl.classList.remove('on'); }
    if (audioReady) { ampGain.gain.cancelScheduledValues(nowT()); } // 清掉未來的音量排程，避免停止後仍冒音
    applyAudio();
  }

  function startGhost() {
    if (!startAudio()) return;
    if (ghostOn) { stopGhost(); return; }
    pointerEngaged = false; sustain = false;
    ghostOn = true;
    ghostBtn.classList.add('playing');
    ghostBtn.textContent = '⏹ 停止';
    handEl.classList.add('on');
    var t = 0;
    GHOST.forEach(function (step) {
      var name = step[0], dur = step[1];
      ghostTimers.push(setTimeout(function () { ghostStep(name, dur); }, t * 1000));
      t += dur;
    });
    ghostTimers.push(setTimeout(function () { stopGhost(); }, t * 1000 + 200));
  }

  function ghostStep(name, dur) {
    if (!ghostOn) return;
    if (name === 'REST') {
      ampGain.gain.cancelScheduledValues(nowT());
      ampGain.gain.setTargetAtTime(0, nowT(), 0.08);
      roNote.textContent = '·'; roFreq.textContent = '…'; roVol.textContent = '音量 0%';
      return;
    }
    var f = NOTE_HZ[name], gx = xFromFreq(f), gy = 0.62;
    var glide = Math.min(0.28, dur * 0.5);
    // 視覺滑音
    if (!reduced) handEl.style.transition = 'transform ' + glide + 's ease-in-out';
    hand.x = gx; hand.y = gy; placeHand();
    // 音訊：滑音 + 輕微揚起的音量包絡
    osc.frequency.setTargetAtTime(f, nowT(), glide);
    var peak = Math.pow(gy, 1.4) * 0.8;
    ampGain.gain.cancelScheduledValues(nowT());
    ampGain.gain.setTargetAtTime(peak * 0.55, nowT(), 0.04);
    ampGain.gain.setTargetAtTime(peak, nowT() + dur * 0.35, 0.12);
    ampGain.gain.setTargetAtTime(peak * 0.6, nowT() + dur * 0.72, 0.14);
    updateReadout(f, gy);
    updateGlow(gx, gy);
  }

  /* ══════════════════════════════════════════
     控制列
     ══════════════════════════════════════════ */
  segBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      segBtns.forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      prefs.wave = b.dataset.wave; savePrefs();
      if (osc) osc.type = prefs.wave;
    });
  });
  scaleChk.addEventListener('change', function () {
    prefs.scale = scaleChk.checked; savePrefs(); applyAudio();
    if (!running) { fctx.clearRect(0, 0, fw, fh); drawGuides(); } // 靜態畫面下即時更新導引線
  });
  revChk.addEventListener('change', function () {
    prefs.reverb = revChk.checked; savePrefs();
    if (wetGain) wetGain.gain.setTargetAtTime(prefs.reverb ? 0.32 : 0, nowT(), 0.05);
  });
  vibSlider.addEventListener('input', function () {
    prefs.vib = parseInt(vibSlider.value, 10) || 0; savePrefs();
    if (vibGain) vibGain.gain.setTargetAtTime(prefs.vib, nowT(), 0.05);
  });
  ghostBtn.addEventListener('click', startGhost);

  /* ══════════════════════════════════════════
     啟動
     ══════════════════════════════════════════ */
  function startAudio() {
    if (!initAudio()) return false;
    if (actx.state === 'suspended') actx.resume();
    if (!startVeil.classList.contains('hidden')) {
      startVeil.classList.add('hidden');
      placeHand();
      ensureLoop();
      setTimeout(function () { playfield.focus(); }, 40);
    }
    return true;
  }
  startBtn.addEventListener('click', startAudio);

  /* ══════════════════════════════════════════
     畫布：力場 + 示波器
     ══════════════════════════════════════════ */
  var fctx = fieldCv.getContext('2d'), sctx = scopeCv.getContext('2d');
  var DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  var fw = 0, fh = 0, sw = 0, sh = 0;

  function sizeCanvas() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    fw = stage.clientWidth; fh = playfield.clientHeight;
    fieldCv.width = Math.round(fw * DPR); fieldCv.height = Math.round(fh * DPR);
    fieldCv.style.height = fh + 'px';
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sw = scopeCv.clientWidth || stage.clientWidth; sh = 66;
    scopeCv.width = Math.round(sw * DPR); scopeCv.height = Math.round(sh * DPR);
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    placeHand();
    if (!running) { fctx.clearRect(0, 0, fw, fh); drawGuides(); } // 未跑迴圈時也先畫好刻度
  }

  var ripples = [], lastRipple = 0;

  /* 音高導引：八度刻度 + （吸附開啟時）五聲音階線 */
  var OCT_LABELS = ['C2', 'C3', 'C4', 'C5', 'C6'];
  function drawGuides() {
    fctx.save();
    fctx.font = '10px system-ui, -apple-system, sans-serif';
    fctx.textAlign = 'center';
    if (prefs.scale) {
      for (var j = 0; j < scaleMidis.length; j++) {
        var f = midiToFreq(scaleMidis[j]);
        var sx = xFromFreq(f) * fw;
        if (sx < 2 || sx > fw - 2) continue;
        fctx.strokeStyle = 'rgba(94,234,212,.07)';
        fctx.lineWidth = 1;
        fctx.beginPath(); fctx.moveTo(sx, 16); fctx.lineTo(sx, fh - 26); fctx.stroke();
      }
    }
    for (var i = 0; i <= OCT; i++) {
      var x = (i / OCT) * fw;
      fctx.strokeStyle = 'rgba(140,160,210,.11)';
      fctx.lineWidth = 1;
      fctx.beginPath(); fctx.moveTo(x, 12); fctx.lineTo(x, fh - 22); fctx.stroke();
      fctx.fillStyle = 'rgba(138,147,171,.6)';
      fctx.fillText(OCT_LABELS[i], Math.max(12, Math.min(fw - 12, x)), fh - 8);
    }
    fctx.restore();
  }

  function drawField(ts) {
    fctx.clearRect(0, 0, fw, fh);
    drawGuides();
    var hx = hand.x * fw, hy = hand.y * fh;
    if (sounding()) {
      // 到音高天線的能量束
      var ax = fw * 0.95, ay = fh * 0.4;
      var vol = Math.pow(Math.max(0, Math.min(1, hand.y)), 1.4);
      var grad = fctx.createLinearGradient(hx, hy, ax, ay);
      grad.addColorStop(0, 'rgba(56,225,240,' + (0.28 * vol + 0.05).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(217,164,65,0)');
      fctx.strokeStyle = grad; fctx.lineWidth = 1.4;
      fctx.beginPath(); fctx.moveTo(hx, hy); fctx.lineTo(ax, ay); fctx.stroke();
      // 漣漪
      if (!reduced && ts - lastRipple > 130) {
        ripples.push({ x: hx, y: hy, r: 10, a: 0.5 * (vol * 0.7 + 0.3) });
        lastRipple = ts;
      }
      // 手的核心光暈
      var g2 = fctx.createRadialGradient(hx, hy, 0, hx, hy, 46);
      g2.addColorStop(0, 'rgba(120,246,255,' + (0.32 + vol * 0.28).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(56,225,240,0)');
      fctx.fillStyle = g2; fctx.beginPath(); fctx.arc(hx, hy, 46, 0, 6.2832); fctx.fill();
    }
    // 更新漣漪
    for (var i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      rp.r += 1.6; rp.a *= 0.955;
      if (rp.a < 0.02 || rp.r > 260) { ripples.splice(i, 1); continue; }
      fctx.strokeStyle = 'rgba(94,234,212,' + rp.a.toFixed(3) + ')';
      fctx.lineWidth = 1.2;
      fctx.beginPath(); fctx.arc(rp.x, rp.y, rp.r, 0, 6.2832); fctx.stroke();
    }
  }

  function drawScope() {
    sctx.clearRect(0, 0, sw, sh);
    var mid = sh / 2;
    if (!audioReady) {
      sctx.strokeStyle = 'rgba(94,234,212,.28)'; sctx.lineWidth = 1.4;
      sctx.beginPath(); sctx.moveTo(0, mid); sctx.lineTo(sw, mid); sctx.stroke();
      return;
    }
    analyser.getByteTimeDomainData(scopeBuf);
    sctx.lineWidth = 1.8;
    sctx.strokeStyle = sounding() ? 'rgba(94,234,212,.92)' : 'rgba(94,234,212,.3)';
    sctx.shadowColor = 'rgba(56,225,240,.8)';
    sctx.shadowBlur = sounding() ? 8 : 0;
    sctx.beginPath();
    var n = scopeBuf.length, stepX = sw / n;
    for (var i = 0; i < n; i++) {
      var v = (scopeBuf[i] - 128) / 128;
      var y = mid + v * (mid - 4) * 1.3;
      if (i === 0) sctx.moveTo(0, y); else sctx.lineTo(i * stepX, y);
    }
    sctx.stroke();
    sctx.shadowBlur = 0;
  }

  var rafId = 0, running = false;
  function loop(ts) {
    if (!running) return;
    if (!reduced) drawField(ts || 0);
    drawScope();
    rafId = requestAnimationFrame(loop);
  }
  function ensureLoop() {
    if (running || document.hidden) return;
    if (reduced) { fctx.clearRect(0, 0, fw, fh); drawGuides(); drawScope(); return; } // 降級：只畫一次靜態
    running = true; rafId = requestAnimationFrame(loop);
  }
  function stopLoop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopLoop();
    else if (audioReady) ensureLoop();
  });

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz); rz = setTimeout(sizeCanvas, 120);
  });

  /* ══════════════════════════════════════════
     進場動畫
     ══════════════════════════════════════════ */
  function revealAll() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!('IntersectionObserver' in window) || reduced) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* 時間軸卡片逐張進場 */
  function revealBeats() {
    var beats = Array.prototype.slice.call(document.querySelectorAll('.beat'));
    if (!('IntersectionObserver' in window) || reduced) {
      beats.forEach(function (b) { b.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    beats.forEach(function (b) { io.observe(b); });
  }

  /* ---------- init ---------- */
  sizeCanvas();
  drawScope();
  requestAnimationFrame(function () { revealAll(); revealBeats(); });

})();

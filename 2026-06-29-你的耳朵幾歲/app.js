/* 你的耳朵幾歲？— 高頻聽力測試
   全程離線、純前端。使用 Web Audio API 產生純音，
   以自動掃頻找出可聽上限，估算「耳朵年齡」。 */
(function () {
  "use strict";

  // ---------- 設定 ----------
  var SWEEP_LOW = 8000;     // 掃頻起點 Hz
  var SWEEP_HIGH = 20000;   // 掃頻終點 Hz
  var SWEEP_MS = 22000;     // 掃頻時長
  var TONE_GAIN = 0.12;     // 音量（保守，避免高頻刺耳）
  var FADE = 0.02;          // 淡入淡出秒數
  var MOSQUITO_HZ = 17400;  // 蚊子鈴聲頻率（僅供視覺標記）

  var CHECKPOINTS = [
    { hz: 8000,  who: "幾乎人人都聽得到" },
    { hz: 10000, who: "約 65 歲以下" },
    { hz: 12000, who: "約 50 歲以下" },
    { hz: 14000, who: "約 49 歲以下" },
    { hz: 15000, who: "約 40 歲以下" },
    { hz: 16000, who: "約 30 歲以下" },
    { hz: 17400, who: "約 24 歲以下（蚊子鈴聲）" },
    { hz: 18000, who: "約 20 歲以下" },
    { hz: 19000, who: "約 18 歲以下" },
    { hz: 20000, who: "多半只有幼童" }
  ];

  function freqToEar(hz) {
    if (hz >= 19000) return { age: "18 歲以下", note: "哇，你的高頻聽力像青少年一樣靈敏！這個年紀的人大多還聽得到接近 20 kHz 的聲音。" };
    if (hz >= 18000) return { age: "18–24 歲", note: "非常年輕的耳朵——你聽得到連許多大學生都開始聽不見的超高頻。" };
    if (hz >= 17000) return { age: "約 25 歲", note: "你還聽得到 17 kHz 上下的「蚊子鈴聲」，這正是被拿來「驅趕」25 歲以下年輕人的頻率。" };
    if (hz >= 16000) return { age: "約 30 歲", note: "相當不錯。過了 25 歲，多數人就聽不到 16 kHz 以上的聲音了。" };
    if (hz >= 15000) return { age: "約 40 歲", note: "很典型的成年耳朵。15 kHz 以上的高頻通常會在 40 歲前後慢慢告別。" };
    if (hz >= 14000) return { age: "約 50 歲", note: "日常聽力完全不受影響，只是最尖的那一段高頻先去休息了。" };
    if (hz >= 12000) return { age: "約 55–60 歲", note: "高頻上限落在 12 kHz 一帶很常見；說話與音樂的主要頻率都還在範圍內。" };
    if (hz >= 10000) return { age: "約 65 歲", note: "別擔心，10 kHz 仍遠高於人聲，日常溝通通常沒有問題。" };
    if (hz >= 8000)  return { age: "70 歲以上", note: "這個區段的高頻多數長者也聽得到。若想更精確，可找聽力師做正式檢查。" };
    return { age: "—", note: "這次可能音量太小或環境太吵。建議戴上耳機、把音量調高一點再試一次。" };
  }

  function formatHz(n) {
    n = Math.round(n);
    return n >= 1000 ? Math.floor(n / 1000) + " " + ("000" + (n % 1000)).slice(-3) : String(n);
  }

  // ---------- 動態偏好：prefers-reduced-motion（含 change 監聽） ----------
  var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduceMotion = motionQuery ? motionQuery.matches : false;
  function onMotionPref(e) {
    reduceMotion = e.matches;
    ensureLoop();
    if (!shouldLoop()) drawWave(performance.now()); // 停下前補一張靜態畫面
  }
  if (motionQuery) {
    if (motionQuery.addEventListener) motionQuery.addEventListener("change", onMotionPref);
    else if (motionQuery.addListener) motionQuery.addListener(onMotionPref);
  }

  // ---------- 音訊引擎 ----------
  var ctx = null, osc = null, gain = null;

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function startTone(hz) {
    ensureCtx();
    stopTone(true); // 立即清掉舊的
    osc = ctx.createOscillator();
    gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    var t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(TONE_GAIN, t + FADE);
    currentHz = hz;
    playing = true;
    ensureLoop();
  }

  function setToneFreq(hz) {
    if (osc) osc.frequency.setValueAtTime(hz, ctx.currentTime);
    currentHz = hz;
  }

  function stopTone(immediate) {
    if (!osc) { playing = false; return; }
    var o = osc, g = gain;
    osc = null; gain = null; playing = false;
    try {
      var t = ctx.currentTime;
      if (immediate) {
        o.stop(t + 0.001);
      } else {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + FADE);
        o.stop(t + FADE + 0.02);
      }
    } catch (e) { /* 已停止 */ }
  }

  // ---------- 狀態 ----------
  var currentHz = SWEEP_LOW;
  var playing = false;
  var sweeping = false;
  var sweepStart = 0;
  var manualTimer = null;

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var freqValue = $("freqValue"), freqCaption = $("freqCaption");
  var sweepBtn = $("sweepBtn"), cantHearBtn = $("cantHearBtn"), sweepHint = $("sweepHint");
  var resultCard = $("resultCard"), resultFreq = $("resultFreq"), resultAge = $("resultAge"), resultNote = $("resultNote");
  var againBtn = $("againBtn"), manualToggle = $("manualToggle"), manualPanel = $("manualPanel");
  var bestLine = $("bestLine"), freqGrid = $("freqGrid"), stopManual = $("stopManual");
  var rulerTrack = $("rulerTrack"), rulerFill = $("rulerFill"), rulerDot = $("rulerDot");
  var bestValue = $("bestValue");
  var resultAgeBox = document.querySelector(".result-age");

  function scrollBehavior() { return reduceMotion ? "auto" : "smooth"; }

  // ---------- 掃頻 ----------
  function beginSweep() {
    hideResult();
    startTone(SWEEP_LOW);
    sweeping = true;
    sweepStart = performance.now();
    sweepBtn.textContent = "↻ 重新開始";
    cantHearBtn.disabled = false;
    cantHearBtn.classList.add("armed");
    freqCaption.textContent = "聲音正在往上爬……聽不到時馬上按右邊";
    sweepHint.innerHTML = "專心聽。當聲音<b>消失</b>的瞬間，立刻按「我聽不到了」。";
    updateRuler(SWEEP_LOW);
    ensureLoop();
  }

  function finishSweep(hz, towardsTop) {
    sweeping = false;
    stopTone(false);
    cantHearBtn.disabled = true;
    cantHearBtn.classList.remove("armed");
    sweepBtn.textContent = "▶ 開始自動掃頻";
    freqValue.textContent = formatHz(hz);
    freqCaption.textContent = "準備好了就再測一次";
    updateRuler(hz);
    showResult(hz, towardsTop);
  }

  // ---------- 結果（含揭示儀式） ----------
  var numAnimToken = 0;
  function animateNumber(el, target) {
    numAnimToken++;
    var token = numAnimToken;
    if (reduceMotion) { el.textContent = formatHz(target); return; }
    var from = Math.max(0, target * 0.4);
    var t0 = performance.now(), DUR = 800;
    function step(now) {
      if (token !== numAnimToken) return;
      var p = Math.min(1, (now - t0) / DUR);
      var e = 1 - Math.pow(1 - p, 3); // ease-out
      el.textContent = formatHz(from + (target - from) * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function pingRings(host) {
    if (reduceMotion || !host) return;
    for (var i = 0; i < 3; i++) {
      var r = document.createElement("span");
      r.className = "ping-ring";
      r.style.animationDelay = (i * 0.18) + "s";
      r.addEventListener("animationend", function (ev) {
        var n = ev.currentTarget;
        if (n && n.parentNode) n.parentNode.removeChild(n);
      });
      host.appendChild(r);
    }
  }

  var BURST_COLORS = ["#34e0d0", "#48b6ff", "#9b7bff", "#ff7bc8", "#ffe27b"];
  function celebrate() {
    if (reduceMotion) return;
    for (var i = 0; i < 28; i++) {
      var p = document.createElement("span");
      p.className = "burst-p";
      var ang = Math.random() * Math.PI * 2;
      var dist = 90 + Math.random() * 190;
      p.style.setProperty("--tx", (Math.cos(ang) * dist).toFixed(1) + "px");
      p.style.setProperty("--ty", (Math.sin(ang) * dist - 60).toFixed(1) + "px");
      p.style.background = BURST_COLORS[i % BURST_COLORS.length];
      p.style.animationDuration = (0.7 + Math.random() * 0.6).toFixed(2) + "s";
      p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";
      p.addEventListener("animationend", function (ev) {
        var n = ev.currentTarget;
        if (n && n.parentNode) n.parentNode.removeChild(n);
      });
      resultCard.appendChild(p);
    }
  }

  function updateBestTile() {
    var b = 0;
    try { b = parseInt(localStorage.getItem("ear_best_hz") || "0", 10) || 0; } catch (e) {}
    bestValue.textContent = b ? formatHz(b) : "—";
  }

  function showResult(hz, towardsTop) {
    var info = freqToEar(hz);
    animateNumber(resultFreq, hz);
    resultAge.textContent = info.age;
    resultNote.textContent = (towardsTop ? "你聽完了整段掃頻，連最高的 20 kHz 都還在！" + info.note : info.note);
    resultCard.classList.remove("hidden");
    resultCard.classList.remove("pop");
    void resultCard.offsetWidth; // 重新觸發揭示動畫
    resultCard.classList.add("pop");
    pingRings(resultAgeBox);
    resultCard.scrollIntoView({ behavior: scrollBehavior(), block: "center" });

    // 個人紀錄（存最高可聽頻率）
    var best = 0;
    try { best = parseInt(localStorage.getItem("ear_best_hz") || "0", 10) || 0; } catch (e) {}
    if (hz > best) {
      try { localStorage.setItem("ear_best_hz", String(Math.round(hz))); } catch (e) {}
      bestLine.textContent = "🎉 刷新你的個人紀錄！上次最高是 " + (best ? formatHz(best) + " Hz" : "（無）");
      celebrate();
    } else if (best) {
      bestLine.textContent = "你的個人最佳紀錄：" + formatHz(best) + " Hz";
    } else {
      bestLine.textContent = "";
    }
    updateBestTile();
  }

  function hideResult() { resultCard.classList.add("hidden"); }

  // ---------- 手動逐音 ----------
  function buildGrid() {
    CHECKPOINTS.forEach(function (c) {
      var cell = document.createElement("button");
      cell.className = "freq-cell";
      cell.type = "button";
      cell.setAttribute("aria-label", "播放 " + c.hz + " 赫茲");
      cell.innerHTML = '<div class="hz">' + formatHz(c.hz) + ' <small>Hz</small></div>' +
                       '<div class="who">' + c.who + '</div>' +
                       (c.hz === MOSQUITO_HZ ? '<span class="mos" aria-hidden="true">🦟</span>' : '');
      cell.addEventListener("click", function () { playCheckpoint(c.hz, cell); });
      freqGrid.appendChild(cell);
    });
  }

  function clearPlayingCells() {
    var cells = freqGrid.querySelectorAll(".freq-cell.playing");
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove("playing");
  }

  function playCheckpoint(hz, cell) {
    if (sweeping) return; // 掃頻中不干擾
    if (manualTimer) { clearTimeout(manualTimer); manualTimer = null; }
    clearPlayingCells();
    cell.classList.add("playing");
    startTone(hz);
    freqValue.textContent = formatHz(hz);
    freqCaption.textContent = "正在播放 " + formatHz(hz) + " Hz（2 秒）";
    updateRuler(hz);
    stopManual.disabled = false;
    manualTimer = setTimeout(function () {
      stopTone(false);
      cell.classList.remove("playing");
      stopManual.disabled = true;
      freqCaption.textContent = "聽得到嗎？試試更高的一格";
    }, 2000);
  }

  function stopManualNow() {
    if (manualTimer) { clearTimeout(manualTimer); manualTimer = null; }
    stopTone(false);
    clearPlayingCells();
    stopManual.disabled = true;
  }

  // ---------- 頻譜刻度尺 ----------
  var trackW = 0;
  function buildRuler() {
    CHECKPOINTS.forEach(function (c) {
      var pos = (c.hz - SWEEP_LOW) / (SWEEP_HIGH - SWEEP_LOW) * 100;
      var tick = document.createElement("span");
      tick.className = "ruler-tick" + (c.hz === MOSQUITO_HZ ? " ruler-tick-mos" : "");
      tick.style.left = pos + "%";
      rulerTrack.appendChild(tick);
    });
    var mos = document.createElement("span");
    mos.className = "ruler-mos";
    mos.style.left = ((MOSQUITO_HZ - SWEEP_LOW) / (SWEEP_HIGH - SWEEP_LOW) * 100) + "%";
    mos.textContent = "🦟 蚊子鈴聲";
    rulerTrack.appendChild(mos);
  }

  function measureRuler() { trackW = rulerTrack.clientWidth || 0; }

  function updateRuler(hz) {
    if (!trackW) measureRuler();
    var norm = (hz - SWEEP_LOW) / (SWEEP_HIGH - SWEEP_LOW);
    norm = Math.max(0, Math.min(1, norm));
    rulerFill.style.transform = "scaleX(" + norm + ")";
    rulerDot.style.transform = "translateX(" + (norm * trackW).toFixed(1) + "px)";
  }

  // ---------- 視覺化波形 ----------
  var canvas = $("wave"), cctx = canvas.getContext("2d"), cw = 720, ch = 220, dpr = 1;

  function setupCanvas() {
    dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    cw = Math.max(320, rect.width || 720);
    ch = 220;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWave(now) {
    cctx.clearRect(0, 0, cw, ch);
    var mid = ch / 2;
    // 頻率 → 視覺週期數（越高音波越密）
    var norm = (currentHz - SWEEP_LOW) / (SWEEP_HIGH - SWEEP_LOW);
    norm = Math.max(0, Math.min(1, norm));
    var cycles = 5 + norm * 22;
    var amp, phase;
    if (reduceMotion) { // 降級：畫靜態波形，不隨時間晃動
      amp = playing ? 56 : 26;
      phase = 0;
    } else {
      amp = (playing ? 60 : 26) + (playing ? Math.sin(now / 220) * 6 : Math.sin(now / 900) * 4);
      phase = now / (playing ? 120 : 600);
    }

    var grad = cctx.createLinearGradient(0, 0, cw, 0);
    grad.addColorStop(0, "#34e0d0");
    grad.addColorStop(0.5, "#48b6ff");
    grad.addColorStop(1, "#9b7bff");

    // 主波
    cctx.beginPath();
    for (var x = 0; x <= cw; x += 2) {
      var t = x / cw;
      var env = Math.sin(Math.PI * t); // 兩端收斂
      var y = mid + Math.sin(t * cycles * Math.PI * 2 + phase) * amp * env;
      x === 0 ? cctx.moveTo(x, y) : cctx.lineTo(x, y);
    }
    cctx.strokeStyle = grad;
    cctx.lineWidth = playing ? 3 : 2;
    cctx.shadowColor = "rgba(72,182,255,0.6)";
    cctx.shadowBlur = playing ? 16 : 6;
    cctx.stroke();

    // 鏡像淡影
    cctx.globalAlpha = 0.18;
    cctx.beginPath();
    for (var x2 = 0; x2 <= cw; x2 += 2) {
      var t2 = x2 / cw;
      var env2 = Math.sin(Math.PI * t2);
      var y2 = mid - Math.sin(t2 * cycles * Math.PI * 2 + phase) * amp * env2;
      x2 === 0 ? cctx.moveTo(x2, y2) : cctx.lineTo(x2, y2);
    }
    cctx.stroke();
    cctx.globalAlpha = 1;
    cctx.shadowBlur = 0;
  }

  // ---------- rAF 迴圈管理：分頁隱藏 / 離屏 / 降級時暫停 ----------
  var rafId = null;
  var pageVisible = !document.hidden;
  var canvasInView = true;

  function shouldLoop() {
    if (!pageVisible) return false;
    if (sweeping || playing) return true;   // 播放中一定要更新（掃頻計時）
    if (reduceMotion) return false;         // 閒置＋降級 → 靜止
    return canvasInView;                    // 閒置的環境波紋只在可見時跑
  }

  function ensureLoop() {
    if (rafId === null && shouldLoop()) rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    rafId = null;
    if (sweeping) {
      var p = (now - sweepStart) / SWEEP_MS;
      if (p >= 1) {
        // 一路聽到頂
        finishSweep(SWEEP_HIGH, true);
      } else {
        var hz = SWEEP_LOW + p * (SWEEP_HIGH - SWEEP_LOW);
        setToneFreq(hz);
        freqValue.textContent = formatHz(hz);
        updateRuler(hz);
      }
    }
    if (canvasInView) drawWave(now);
    if (shouldLoop()) rafId = requestAnimationFrame(tick);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      canvasInView = entries[0].isIntersecting;
      ensureLoop();
    }, { threshold: 0 });
    io.observe(canvas);
  }

  // ---------- 綁定 ----------
  sweepBtn.addEventListener("click", function () {
    stopManualNow();
    beginSweep();
  });
  cantHearBtn.addEventListener("click", function () {
    if (sweeping) finishSweep(currentHz, false);
  });
  againBtn.addEventListener("click", function () {
    hideResult();
    document.querySelector(".stage").scrollIntoView({ behavior: scrollBehavior(), block: "center" });
  });
  manualToggle.addEventListener("click", function () {
    manualPanel.classList.toggle("hidden");
    var open = !manualPanel.classList.contains("hidden");
    manualToggle.setAttribute("aria-expanded", open ? "true" : "false");
    manualToggle.textContent = open ? "收起逐音檢查 ↑" : "手動逐音檢查 ↓";
    if (open) {
      manualPanel.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  });
  stopManual.addEventListener("click", stopManualNow);

  window.addEventListener("resize", function () {
    setupCanvas();
    measureRuler();
    updateRuler(currentHz);
    if (!shouldLoop()) drawWave(performance.now());
  });
  // 切到背景就停聲，避免惱人
  document.addEventListener("visibilitychange", function () {
    pageVisible = !document.hidden;
    if (document.hidden) { sweeping = false; stopTone(true); stopManualNow();
      cantHearBtn.disabled = true; cantHearBtn.classList.remove("armed");
      sweepBtn.textContent = "▶ 開始自動掃頻"; }
    ensureLoop();
  });

  // ---------- 啟動 ----------
  buildGrid();
  buildRuler();
  setupCanvas();
  measureRuler();
  freqValue.textContent = formatHz(SWEEP_LOW);
  updateRuler(SWEEP_LOW);
  updateBestTile();
  if (shouldLoop()) ensureLoop();
  else requestAnimationFrame(function (now) { drawWave(now); }); // 降級時仍給一張靜態波形

  // 顯示歷史最佳
  try {
    var b = parseInt(localStorage.getItem("ear_best_hz") || "0", 10);
    if (b) bestLine.textContent = "你的個人最佳紀錄：" + formatHz(b) + " Hz";
  } catch (e) {}
})();

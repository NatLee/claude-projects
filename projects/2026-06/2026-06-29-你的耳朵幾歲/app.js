/* 你的耳朵幾歲？— 高頻聽力測試
   全程離線、純前端。使用 Web Audio API 產生純音，
   以自動掃頻找出可聽上限，估算「耳朵年齡」。

   ── 音訊正確性三原則（這頁的命脈）──
   1. 只用 sine：純正弦，沒有泛音，不會讓人「以為」聽到高頻。
   2. 一律淡入淡出：任何起音／停音／換音都經過 gain ramp。
      直接 stop() 會切出一個「喀」的寬頻爆音，那個喀聲低頻成分很重，
      連放不出 18 kHz 的爛喇叭都能發出來 —— 對聽力測試是致命的假陽性。
   3. 誠實面對取樣率：可測上限由 audioCtx.sampleRate 的 Nyquist 決定。
      超過 Nyquist 的正弦會 alias 成完全錯誤的低音，寧可不測、也不騙人。 */
(function () {
  "use strict";

  // ---------- 設定 ----------
  var SWEEP_LOW = 8000;     // 掃頻起點 Hz
  var SWEEP_TOP = 20000;    // 掃頻理想終點 Hz（實際上限見 maxHz，受裝置取樣率限制）
  var SWEEP_MS = 22000;     // 掃頻時長
  var TONE_GAIN = 0.12;     // 音量（保守，避免高頻刺耳；全頻段固定，不做補償才公平）
  var FADE = 0.03;          // 一般淡入淡出秒數（30 ms）
  var CUT = 0.012;          // 換音時的極短淡出（12 ms）——仍足以消除爆音
  var NYQUIST_SAFE = 0.95;  // 只用到 Nyquist 的 95%，留一點餘裕給重建濾波器
                            // （44.1 kHz → 上限 20.9 kHz，20 kHz 仍可正常測；
                            //   但 32 kHz 的藍牙裝置就只會開放到 15.2 kHz）
  var MOSQUITO_HZ = 17400;  // 蚊子鈴聲頻率（僅供視覺標記）

  var CHECKPOINTS = [
    { hz: 8000,  who: "幾乎人人都聽得到" },
    { hz: 10000, who: "約 65 歲以下" },
    { hz: 12000, who: "約 55–60 歲以下" },
    { hz: 14000, who: "約 50 歲以下" },
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

  function formatKHz(n) {
    var v = Math.round(n / 100) / 10;         // 取到 0.1 kHz
    return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + " kHz";
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
  var AC_CTOR = window.AudioContext || window.webkitAudioContext || null;
  var ctx = null, osc = null, gain = null;
  var oscStartAt = 0;       // 目前這顆 oscillator 排定的起音時刻（音訊時鐘）
  var silentUntil = 0;      // 上一顆音「完全淡出」的音訊時刻：新音絕不早於它，才不會疊音
  var maxHz = SWEEP_TOP;    // 這台裝置能誠實播放的最高頻率
  var deviceOk = true;      // 裝置＋取樣率是否足以進行測試
  var uiReady = false;      // DOM 是否已建好（applyDeviceLimits 需要）

  function ensureCtx(resume) {
    if (!ctx) {
      if (!AC_CTOR) return null;
      try { ctx = new AC_CTOR(); } catch (e) { return null; }
      if (uiReady) applyDeviceLimits();   // 一拿到真實 sampleRate 就修正可測範圍
    }
    if (resume && ctx.state === "suspended") {
      var p = ctx.resume();
      if (p && p.catch) p.catch(function () { /* 使用者尚未互動 */ });
    }
    return ctx;
  }

  /* 輸出延遲：喇叭「此刻正在發出」的聲音，其實是音訊執行緒稍早算好的。
     藍牙耳機可以延遲到 100–200 ms，不補償的話畫面數字會領先耳朵好幾百 Hz。 */
  function outputLatency() {
    if (!ctx) return 0;
    var base = typeof ctx.baseLatency === "number" ? ctx.baseLatency : 0;
    var out = typeof ctx.outputLatency === "number" ? ctx.outputLatency : 0;
    var lat = base + out;
    if (!isFinite(lat) || lat < 0) lat = 0;
    return Math.min(lat, 0.5);
  }

  // 現在真正「傳到耳朵」的那一刻，對應的音訊時鐘時間
  function audibleTime() { return ctx ? ctx.currentTime - outputLatency() : 0; }

  function releaseNodes(o, g) {
    o.onended = function () { try { o.disconnect(); g.disconnect(); } catch (e) {} };
  }

  /* 起音：一律 0 → TONE_GAIN 淡入，且排在上一顆音完全靜音之後。
     回傳這顆音實際開始的音訊時刻；失敗回傳 -1。

     ⚠️ 關鍵一行：gain.gain.value = 0
     GainNode.gain 的 defaultValue 是 **1**，不是 0。而這裡的起音時刻 t 可能落在「未來」
     （要等上一顆音淡出完），在 setValueAtTime(0, t) 這個事件「生效之前」，
     依 Web Audio 規格，AudioParam 讀出來的是 intrinsic value = 1.0。
     若此時使用者又觸發一次 startTone/stopTone（快速連點、長按 Enter 的鍵盤自動重複），
     stopTone 的 cancelAndHold 就會 hold 在 1.0，把還沒生效的淡入包絡整條刪掉，
     那顆 oscillator 就會在下降斜線「中途」硬切起音 —— 無淡入的矩形起音＝寬頻爆音，
     而且振幅高達額定值的 8 倍。先把 intrinsic value 壓成 0，任何提早的 cancelAndHold
     都只會 hold 在 0，那顆音全程靜音，不可能有爆音。 */
  function startTone(hz) {
    var c = ensureCtx(true);
    if (!c) return -1;
    stopTone(true);                                   // 舊音先淡出（不是硬切！）
    hz = Math.max(20, Math.min(hz, maxHz));           // 絕不超過 Nyquist 安全上限
    var t = Math.max(c.currentTime, silentUntil);     // 等舊音安靜了再進場，避免疊頻
    osc = c.createOscillator();
    gain = c.createGain();
    gain.gain.value = 0;                              // ← 見上方說明：預設值是 1，必須先歸零
    osc.type = "sine";                                // 純正弦：零泛音
    osc.frequency.value = hz;
    osc.frequency.setValueAtTime(hz, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(TONE_GAIN, t + FADE);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    oscStartAt = t;
    currentHz = hz;
    playing = true;
    ensureLoop();
    return t;
  }

  /* 停音：無論多急，都先把 gain ramp 到 0 再 stop()。
     quick=true 用 12 ms（換音用），false 用 30 ms（正常收音）。
     回傳「完全靜音」的音訊時刻。 */
  function stopTone(quick) {
    if (!ctx) { playing = false; return 0; }
    var t = ctx.currentTime;
    if (!osc) { playing = false; return Math.max(t, silentUntil); }
    var o = osc, g = gain, startAt = oscStartAt;
    osc = null; gain = null; playing = false;

    // 情況 A：這顆音還在排隊、根本還沒起音（t < startAt）。
    // 讓它整條包絡歸零、在起音當下就結束 —— 它一個取樣點都不會發聲，
    // 也就不需要為它白等一段淡出。
    if (t < startAt) {
      try {
        g.gain.cancelScheduledValues(0);   // 整條淡入包絡作廢
        g.gain.value = 0;                  // intrinsic value 也歸零
        o.stop(startAt + 0.001);           // 停在起音後 1 ms（gain 恆為 0，等於沒響過）
        releaseNodes(o, g);
      } catch (e) { /* 已停止 */ }
      // 上一顆音可能還在淡出中（它的淡出終點必定 <= startAt），所以仍以 startAt 為準。
      silentUntil = Math.max(t, startAt);
      return silentUntil;
    }

    // 情況 B：正常播放中（可能正在淡入或已到達額定音量）→ 淡出到 0 再 stop()。
    var fade = quick ? CUT : FADE;
    try {
      var v = g.gain.value;                            // 先讀下當前音量（可能正在淡入）
      if (!isFinite(v) || v < 0) v = 0;
      if (v > TONE_GAIN) v = TONE_GAIN;                // 保險：音量永遠不可能超過額定值
      if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t);
      else { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(v, t); }
      g.gain.linearRampToValueAtTime(0, t + fade);     // 淡出到 0 → 沒有喀聲
      o.stop(t + fade + 0.01);                         // 真正靜音之後才停
      releaseNodes(o, g);
    } catch (e) { /* 已停止 */ }
    silentUntil = t + fade;
    return silentUntil;
  }

  // ---------- 狀態 ----------
  var currentHz = SWEEP_LOW;
  var playing = false;
  var sweeping = false;
  var sweepT0 = 0;          // 掃頻起點（音訊時鐘）
  var sweepT1 = 0;          // 掃頻終點（音訊時鐘）
  var manualTimer = null;

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var freqValue = $("freqValue"), freqCaption = $("freqCaption");
  var sweepBtn = $("sweepBtn"), cantHearBtn = $("cantHearBtn"), sweepHint = $("sweepHint");
  var resultCard = $("resultCard"), resultFreq = $("resultFreq"), resultAge = $("resultAge"), resultNote = $("resultNote");
  var againBtn = $("againBtn"), manualToggle = $("manualToggle"), manualPanel = $("manualPanel");
  var bestLine = $("bestLine"), freqGrid = $("freqGrid"), stopManual = $("stopManual");
  var rulerTrack = $("rulerTrack"), rulerFill = $("rulerFill"), rulerDot = $("rulerDot"), rulerLabels = $("rulerLabels");
  var bestValue = $("bestValue"), deviceNote = $("deviceNote");
  var resultAgeBox = document.querySelector(".result-age");
  var HINT_DEFAULT = sweepHint.innerHTML;

  function scrollBehavior() { return reduceMotion ? "auto" : "smooth"; }
  function sweepSpan() { return Math.max(1, maxHz - SWEEP_LOW); }

  // ---------- 裝置能力：取樣率 → 可測上限 ----------
  /* 44.1 kHz 取樣 → 理論上限（Nyquist）22.05 kHz；48 kHz → 24 kHz。
     但不少藍牙耳機／通話模式會把 AudioContext 壓到 16–32 kHz，
     這時候硬播 20 kHz 只會 alias 成一個「聽得很清楚的低音」，
     使用者就會覺得「聲音跟宣稱的頻率不符」。寧可誠實下修上限。 */
  function applyDeviceLimits() {
    var sr = ctx ? ctx.sampleRate : 0;
    var cap = sr ? Math.floor(sr / 2 * NYQUIST_SAFE / 100) * 100 : SWEEP_TOP;
    // maxHz 一律照實計算，絕不「為了讓 UI 好看」灌水：它是我們對使用者的承諾。
    // 就算低到掃不動（sweepSpan() 會保底成 1），也寧可整個測試停用。
    maxHz = Math.min(SWEEP_TOP, cap);
    // 沒有 ctx（不支援 Web Audio／建立失敗）＝一個音都放不出來，同樣算「不可用」。
    // 少了 !!ctx 這一段，maxHz 會停在預設的 20 kHz、deviceOk 誤判為 true，
    // 按鈕全部維持可按，按下去卻毫無反應。
    deviceOk = !!ctx && maxHz >= SWEEP_LOW + 2000;

    var reason;   // 停用原因（同時給 deviceNote / sweepHint / 格子 aria-label 用）
    if (!AC_CTOR) reason = "這個瀏覽器不支援 Web Audio，無法播放測試音。";
    else if (!ctx) reason = "無法建立音訊環境（可能被瀏覽器阻擋），請重新整理頁面再試一次。";
    else if (!deviceOk) reason = "這台裝置的音訊取樣率只有 " + formatHz(sr) + " Hz，最高只能正確播放到 "
      + formatHz(maxHz) + " Hz，做不了高頻測試。請改用有線耳機、或關閉藍牙通話模式後重新整理。";
    else reason = "";

    if (deviceNote) {
      deviceNote.textContent = deviceOk
        ? "裝置取樣率 " + formatHz(sr) + " Hz，理論上限 " + formatHz(sr / 2)
          + " Hz。為避免超過上限「假裝」成錯誤的低音，本頁最高只測到 " + formatHz(maxHz) + " Hz。"
        : "⚠️ " + reason;
    }

    // 不可用時：掃頻、逐音檢查、停止鍵全部停用，語意一致（不留任何按了沒反應的按鈕）
    sweepBtn.disabled = !deviceOk;
    manualToggle.disabled = !deviceOk;
    if (!deviceOk) {
      sweeping = false;
      cantHearBtn.disabled = true;
      cantHearBtn.classList.remove("armed");
      stopManual.disabled = true;
      sweepHint.textContent = reason + "（測試已停用）";
    } else if (!sweeping) {
      cantHearBtn.disabled = true;
      sweepHint.innerHTML = HINT_DEFAULT;
    }

    buildRuler();
    applyGridLimits(reason);
    updateRuler(Math.min(currentHz, maxHz));
  }

  // ---------- 掃頻 ----------
  /* 頻率變化整段排在「音訊執行緒」上（linearRampToValueAtTime），
     畫面則反過來從音訊時鐘讀出「此刻耳朵聽到的是幾 Hz」。
     這樣顯示值 = 真實播放值，不會被畫面掉幀或輸出延遲拉開。 */
  function beginSweep() {
    if (!deviceOk) return;
    hideResult();
    var t0 = startTone(SWEEP_LOW);
    if (t0 < 0 || !osc) return;                      // 沒有 Web Audio
    sweepT0 = t0 + FADE;                             // 淡入結束後才開始爬升
    sweepT1 = sweepT0 + SWEEP_MS / 1000;
    osc.frequency.setValueAtTime(SWEEP_LOW, sweepT0);
    osc.frequency.linearRampToValueAtTime(maxHz, sweepT1);
    sweeping = true;
    sweepBtn.textContent = "↻ 重新開始";
    cantHearBtn.disabled = false;
    cantHearBtn.classList.add("armed");
    freqCaption.textContent = "聲音正在往上爬……聽不到時馬上按右邊";
    sweepHint.innerHTML = "專心聽。當聲音<b>消失</b>的瞬間，立刻按「我聽不到了」。";
    freqValue.textContent = formatHz(SWEEP_LOW);
    updateRuler(SWEEP_LOW);
    ensureLoop();
  }

  // 依音訊時鐘算出「此刻正在耳朵裡」的頻率
  function sweepHzNow() {
    var p = (audibleTime() - sweepT0) / Math.max(0.001, sweepT1 - sweepT0);
    p = Math.max(0, Math.min(1, p));
    return SWEEP_LOW + p * sweepSpan();
  }

  function resetSweepUI() {
    sweeping = false;
    cantHearBtn.disabled = true;
    cantHearBtn.classList.remove("armed");
    sweepBtn.textContent = "▶ 開始自動掃頻";
    sweepHint.innerHTML = HINT_DEFAULT;
  }

  function finishSweep(hz, towardsTop) {
    resetSweepUI();
    stopTone(false);
    freqValue.textContent = formatHz(hz);
    freqCaption.textContent = "準備好了就再測一次";
    currentHz = hz;
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
    resultNote.textContent = (towardsTop
      ? "你聽完了整段掃頻，連這台裝置能播的最高頻率 " + formatHz(maxHz) + " Hz 都還在！" + info.note
      : info.note);
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
      cell.setAttribute("data-hz", String(c.hz));
      cell.setAttribute("aria-label", "播放 " + c.hz + " 赫茲純音");
      cell.innerHTML = '<div class="hz">' + formatHz(c.hz) + ' <small>Hz</small></div>' +
                       '<div class="who">' + c.who + '</div>' +
                       '<div class="na">此裝置播不出來</div>' +
                       (c.hz === MOSQUITO_HZ ? '<span class="mos" aria-hidden="true">🦟</span>' : '');
      cell.addEventListener("click", function () { playCheckpoint(c.hz, cell); });
      freqGrid.appendChild(cell);
    });
  }

  /* 超過裝置 Nyquist 上限的格子直接停用：播出去也不是那個頻率，不如誠實說明。
     裝置整個不可用（!deviceOk）時，連上限以內的格子也一併停用 ——
     否則會出現「掃頻停用、但 8 kHz 那格還亮著」這種自相矛盾的狀態。 */
  function applyGridLimits(reason) {
    var cells = freqGrid.querySelectorAll(".freq-cell");
    for (var i = 0; i < cells.length; i++) {
      var hz = parseInt(cells[i].getAttribute("data-hz"), 10);
      var ok = deviceOk && hz <= maxHz;
      cells[i].disabled = !ok;
      if (ok) cells[i].classList.remove("unavailable");
      else cells[i].classList.add("unavailable");
      cells[i].setAttribute("aria-label", ok
        ? "播放 " + hz + " 赫茲純音"
        : hz + " 赫茲：" + (deviceOk
            ? "超過此裝置的取樣率上限，無法正確播放，已停用"
            : (reason || "此裝置無法播放測試音") + "（已停用）"));
    }
  }

  function clearPlayingCells() {
    var cells = freqGrid.querySelectorAll(".freq-cell.playing");
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove("playing");
  }

  function playCheckpoint(hz, cell) {
    if (sweeping) return;        // 掃頻中不干擾
    if (!deviceOk) return;       // 裝置不可用（防呆；按鈕本身已 disabled）
    if (hz > maxHz) return;      // 超過裝置上限（防呆；按鈕本身已 disabled）
    if (manualTimer) { clearTimeout(manualTimer); manualTimer = null; }
    clearPlayingCells();
    cell.classList.add("playing");
    startTone(hz);               // 內含舊音淡出 + 新音淡入，不會有喀聲
    freqValue.textContent = formatHz(hz);
    freqCaption.textContent = "正在播放 " + formatHz(hz) + " Hz 純音（2 秒）";
    updateRuler(hz);
    stopManual.disabled = false;
    manualTimer = setTimeout(function () {
      manualTimer = null;
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

  function hzToNorm(hz) {
    var norm = (hz - SWEEP_LOW) / sweepSpan();
    return Math.max(0, Math.min(1, norm));
  }

  // 可重建：裝置上限變動時，刻度與標籤都要跟著改
  function buildRuler() {
    var old = rulerTrack.querySelectorAll(".ruler-tick, .ruler-mos");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

    // 裝置根本不可用時，一根刻度都不畫：否則會留下沒有任何標籤的孤兒刻度，
    // 看起來像「這裡還測得到」，跟停用的按鈕自相矛盾。
    if (deviceOk) {
      CHECKPOINTS.forEach(function (c) {
        if (c.hz > maxHz) return;  // 超出裝置上限的刻度不畫，免得誤導
        var tick = document.createElement("span");
        tick.className = "ruler-tick" + (c.hz === MOSQUITO_HZ ? " ruler-tick-mos" : "");
        tick.style.left = (hzToNorm(c.hz) * 100) + "%";
        rulerTrack.appendChild(tick);
      });

      if (MOSQUITO_HZ <= maxHz) {
        var mos = document.createElement("span");
        mos.className = "ruler-mos";
        mos.style.left = (hzToNorm(MOSQUITO_HZ) * 100) + "%";
        mos.textContent = "🦟 蚊子鈴聲";
        rulerTrack.appendChild(mos);
      }
    }

    rulerLabels.innerHTML = "";
    if (!deviceOk) {
      // 連掃頻都做不了：不要畫出一把假的刻度尺假裝測得到
      var warn = document.createElement("span");
      warn.textContent = ctx
        ? "此裝置最高只能正確播放到 " + formatHz(maxHz) + " Hz"
        : "此瀏覽器無法播放測試音";
      rulerLabels.appendChild(warn);
      rulerFill.style.transform = "scaleX(0)";
      rulerDot.style.transform = "translateX(0px)";
      return;
    }
    for (var k = 0; k < 4; k++) {
      var span = document.createElement("span");
      span.textContent = formatKHz(SWEEP_LOW + sweepSpan() * (k / 3));
      rulerLabels.appendChild(span);
    }
  }

  function measureRuler() { trackW = rulerTrack.clientWidth || 0; }

  function updateRuler(hz) {
    if (!trackW) measureRuler();
    var norm = hzToNorm(hz);
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
    var cycles = 5 + hzToNorm(currentHz) * 22;
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
    if (sweeping || playing) return true;   // 播放中一定要更新（掃頻讀秒）
    if (reduceMotion) return false;         // 閒置＋降級 → 靜止
    return canvasInView;                    // 閒置的環境波紋只在可見時跑
  }

  function ensureLoop() {
    if (rafId === null && shouldLoop()) rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    rafId = null;
    if (sweeping) {
      var hz = sweepHzNow();          // ← 讀的是音訊時鐘，不是畫面時鐘
      currentHz = hz;
      freqValue.textContent = formatHz(hz);
      updateRuler(hz);
      if (audibleTime() >= sweepT1) { // 一路聽到頂
        finishSweep(maxHz, true);
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
    if (sweeping) finishSweep(sweepHzNow(), false);
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
    if (document.hidden) {
      sweeping = false;
      stopManualNow();          // 內含 stopTone(false)：一樣有淡出，不留爆音
      if (deviceOk) resetSweepUI();
      freqCaption.textContent = "已暫停。回到這一頁再重新開始";
    }
    ensureLoop();
  });

  // ---------- 啟動 ----------
  buildGrid();
  uiReady = true;
  ensureCtx(false);        // 先建立（suspended）音訊環境，只為了問出真實 sampleRate
  applyDeviceLimits();     // 沒有 Web Audio 時也要把 UI 設好
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

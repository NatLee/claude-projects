/* 推敲 · 前端邏輯（純靜態版：出題、判定、統計皆在瀏覽器完成） */
(function () {
  "use strict";
  const WL = 4, MAX = 6;
  const HAN = /[一-鿿]/g;
  const HAN_RE = /^[一-鿿]{4}$/;
  const IDIOMS = window.IDIOMS || [];

  // localStorage keys（全站共用網域，一律加前綴 tuiqiao.）
  const PLAYS_KEY = "tuiqiao.plays";
  const DAILY_KEY_PREFIX = "tuiqiao.daily.";

  const $ = (s) => document.querySelector(s);
  const boardEl = $("#board");
  const inputEl = $("#guess");
  const hintBox = $("#hint-box");
  const toastEl = $("#toast");

  let state = null;      // 當前對局
  let composing = false; // IME 組字中

  // ---------- 日期（台灣時間，固定 UTC+8，無夏令時） ----------
  function pad2(n) { return String(n).padStart(2, "0"); }
  function taipeiNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
  function taipeiToday() {
    const d = taipeiNow();
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  function taipeiNowISO() {
    const d = taipeiNow();
    return taipeiToday() + "T" + pad2(d.getUTCHours()) + ":" +
      pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds()) + "+08:00";
  }

  // ---------- 出題 ----------
  function dailyPid(dateStr) {
    // 以 YYYY-MM-DD 換算為天數，穩定地對應到題庫索引：同一天所有人同一題。
    const parts = dateStr.split("-").map(Number);
    const days = Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
    return ((days % IDIOMS.length) + IDIOMS.length) % IDIOMS.length;
  }
  function randomPid() {
    // 練習模式：隨機一題，且避開今日題目
    const todayPid = dailyPid(taipeiToday());
    let pid = todayPid;
    if (IDIOMS.length > 1) {
      while (pid === todayPid) pid = Math.floor(Math.random() * IDIOMS.length);
    }
    return pid;
  }
  function validPid(pid) {
    return Number.isInteger(pid) && pid >= 0 && pid < IDIOMS.length;
  }

  // ---------- 判定（Wordle 兩階段，正確處理重複字；與原後端演算法等價） ----------
  function judge(answer, guess) {
    const result = new Array(WL).fill("absent");
    const remain = {};
    for (const ch of answer) remain[ch] = (remain[ch] || 0) + 1;
    // 第一階段：位置正確
    for (let i = 0; i < WL; i++) {
      if (guess[i] === answer[i]) {
        result[i] = "correct";
        remain[guess[i]] -= 1;
      }
    }
    // 第二階段：字存在但位置不對
    for (let i = 0; i < WL; i++) {
      if (result[i] === "correct") continue;
      const ch = guess[i];
      if ((remain[ch] || 0) > 0) {
        result[i] = "present";
        remain[ch] -= 1;
      }
    }
    return result;
  }

  // ---------- 對局紀錄與統計（localStorage） ----------
  function loadPlays() {
    try {
      const v = JSON.parse(localStorage.getItem(PLAYS_KEY) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function recordResult(pid, mode, won, guesses) {
    if (!validPid(pid)) return collectStats();
    mode = mode === "practice" ? "practice" : "daily";
    let g = parseInt(guesses, 10);
    if (!Number.isFinite(g)) g = MAX + 1;
    g = Math.max(1, Math.min(g, MAX + 1));
    const plays = loadPlays();
    plays.push({
      play_date: taipeiToday(),
      mode: mode,
      pid: pid,
      won: won ? 1 : 0,
      guesses: g,
      created_at: taipeiNowISO(),
    });
    try { localStorage.setItem(PLAYS_KEY, JSON.stringify(plays)); } catch (e) {}
    return collectStats();
  }
  function statsFor(rows) {
    const total = rows.length;
    let won = 0;
    const dist = {};
    for (let i = 1; i <= MAX; i++) dist[String(i)] = 0;
    let streak = 0, bestStreak = 0;
    const sorted = rows.slice().sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
    sorted.forEach((r) => {
      if (r.won) {
        won += 1;
        if (String(r.guesses) in dist) dist[String(r.guesses)] += 1;
        streak += 1;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 0;
      }
    });
    return {
      total: total,
      won: won,
      lost: total - won,
      winRate: total ? Math.round((won / total) * 100) : 0,
      distribution: dist,
      currentStreak: streak,
      bestStreak: bestStreak,
    };
  }
  function collectStats() {
    const daily = loadPlays().filter((r) => r.mode === "daily");
    const today = taipeiToday();
    return {
      all: statsFor(daily),
      today: statsFor(daily.filter((r) => r.play_date === today)),
    };
  }

  // ---------- 對局狀態 ----------
  function newState(pid, mode) {
    return { pid, mode, row: 0, over: false, won: false, rows: [], locked: false };
  }

  function dailyKey() { return DAILY_KEY_PREFIX + taipeiToday(); }

  // ---------- 棋盤 ----------
  function buildBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < MAX; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.r = r;
      for (let c = 0; c < WL; c++) {
        const t = document.createElement("div");
        t.className = "tile";
        row.appendChild(t);
      }
      boardEl.appendChild(row);
    }
    markActiveRow();
  }

  function rowEl(r) { return boardEl.querySelector('.row[data-r="' + r + '"]'); }

  function markActiveRow() {
    boardEl.querySelectorAll(".row").forEach((el) => el.classList.remove("active"));
    if (state && !state.over) {
      const el = rowEl(state.row);
      if (el) el.classList.add("active");
    }
  }

  function renderPreview() {
    if (!state || state.over) return;
    const chars = (inputEl.value.match(HAN) || []).slice(0, WL);
    const tiles = rowEl(state.row).children;
    for (let i = 0; i < WL; i++) {
      const t = tiles[i];
      const ch = chars[i] || "";
      if (t.textContent !== ch) {
        t.textContent = ch;
        t.classList.toggle("filled", !!ch);
      }
    }
  }

  function paintRow(r, guess, feedback, won, cb) {
    const tiles = rowEl(r).children;
    for (let i = 0; i < WL; i++) {
      const t = tiles[i];
      t.textContent = guess[i];
      t.classList.add("filled");
    }
    feedback.forEach((st, i) => {
      const t = tiles[i];
      setTimeout(() => { t.classList.add("reveal"); }, i * 180);
      setTimeout(() => { t.classList.add(st); }, i * 180 + 250); // 翻牌中點上色
    });
    const total = (WL - 1) * 180 + 560;
    setTimeout(() => {
      if (won) rowEl(r).classList.add("win");
      if (cb) cb();
    }, total);
  }

  // ---------- 提交 ----------
  function submitGuess() {
    if (!state || state.over || state.locked) return;
    const chars = (inputEl.value.match(HAN) || []);
    if (chars.length < WL) { shake(); toast("請輸入四個中文字"); return; }
    const guess = chars.slice(0, WL).join("");
    if (!validPid(state.pid)) { shake(); toast("題目不存在"); return; }
    if (!HAN_RE.test(guess)) { shake(); toast("請輸入四個中文字"); return; }
    state.locked = true;

    const answer = IDIOMS[state.pid].word;
    const feedback = judge(answer, guess);
    const solved = feedback.every((s) => s === "correct");

    const r = state.row;
    inputEl.value = "";
    state.rows.push({ guess, feedback });
    paintRow(r, guess, feedback, solved, () => {
      if (solved) {
        state.over = true; state.won = true;
        finishGame();
      } else if (r + 1 >= MAX) {
        state.over = true; state.won = false;
        finishGame();
      } else {
        state.row += 1; state.locked = false;
        markActiveRow();
        inputEl.focus();
      }
    });
  }

  function shake() {
    if (!state) return;
    const el = rowEl(state.row);
    if (!el) return;
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 420);
  }

  // ---------- 結束 ----------
  function finishGame() {
    markActiveRow();
    const guesses = state.won ? state.rows.length : MAX + 1;
    // 每日對局存檔，避免重複計分
    if (state.mode === "daily") {
      try {
        localStorage.setItem(dailyKey(), JSON.stringify({
          won: state.won, guesses, rows: state.rows,
        }));
      } catch (e) {}
    }
    const stats = recordResult(state.pid, state.mode, state.won, guesses);
    renderMiniStats(stats);
    if (state.won) showStamp();
    const item = IDIOMS[state.pid];
    const answer = item
      ? { ok: true, answer: item.word, meaning: item.meaning, hint: item.hint }
      : null;
    setTimeout(() => showResult(stats, answer), state.won ? 900 : 500);
  }

  function showResult(stats, answer) {
    const head = state.won ? "推敲得之！" : "再接再厲";
    const lead = state.won
      ? "恭喜，第 " + state.rows.length + " 次就猜中了。"
      : "六次未中，且看正解。";
    $("#result-title").textContent = head;
    $("#result-lead").textContent = lead;
    const card = $("#answer-card");
    if (answer && answer.ok) {
      card.innerHTML =
        '<div class="word">' + answer.answer + "</div>" +
        '<div class="meaning">' + answer.meaning + "</div>";
      card.style.display = "block";
    } else { card.style.display = "none"; }
    renderStats(stats, "#result-stats");
    openModal("#result-modal");
  }

  // ---------- 統計 ----------
  function renderStats(stats, mountSel) {
    const mount = $(mountSel);
    if (!stats) { mount.innerHTML = '<p class="lead">尚無統計資料</p>'; return; }
    const a = stats.all;
    const dist = a.distribution || {};
    let maxv = 1;
    Object.values(dist).forEach((v) => { if (v > maxv) maxv = v; });
    let bars = "";
    for (let i = 1; i <= MAX; i++) {
      const v = dist[String(i)] || 0;
      const w = Math.round((v / maxv) * 100);
      bars +=
        '<div class="dist-row"><span class="k">' + i + "</span>" +
        '<div class="dist-bar-wrap"><div class="dist-bar" style="width:' +
        Math.max(w, v > 0 ? 12 : 4) + '%">' + (v > 0 ? v : "") + "</div></div></div>";
    }
    mount.innerHTML =
      '<div class="stat-grid">' +
      cell(a.total, "總對局") + cell(a.won, "猜中") +
      cell(a.winRate + "%", "勝率") + cell(a.bestStreak, "最佳連勝") +
      "</div>" +
      '<div class="dist-title">猜中次數分佈</div>' + bars;
  }
  function cell(b, s) {
    return '<div class="stat-cell"><b>' + b + "</b><span>" + s + "</span></div>";
  }

  // 側欄「戰績一覽」摘要（僅呈現既有 daily 統計，不改變任何計分邏輯）
  function renderMiniStats(stats) {
    const el = $("#mini-stats");
    if (!el) return;
    const a = stats && stats.all ? stats.all : null;
    if (!a || !a.total) {
      el.innerHTML = '<div class="empty">尚無每日戰績，先破今日一題</div>';
      return;
    }
    el.innerHTML =
      mcell(a.total, "總對局") + mcell(a.won, "猜中") +
      mcell(a.winRate + "%", "勝率") + mcell(a.currentStreak, "連勝");
  }
  function mcell(b, s) {
    return '<div class="m-cell"><b>' + b + "</b><span>" + s + "</span></div>";
  }

  function openStats() {
    renderStats(collectStats(), "#stats-body");
    openModal("#stats-modal");
  }

  // ---------- 提示 / 揭曉 ----------
  function showHint() {
    if (!state || !validPid(state.pid)) return;
    hintBox.textContent = "提示：" + IDIOMS[state.pid].hint;
  }

  function giveUp() {
    if (!state || state.over) return;
    if (!confirm("確定要看答案嗎？本局將計為未猜中。")) return;
    state.over = true; state.won = false;
    finishGame();
  }

  // ---------- 模式 ----------
  function startDaily() {
    setMode("daily");
    state = newState(dailyPid(taipeiToday()), "daily");
    hintBox.textContent = "";
    buildBoard();
    // 還原今日已完成的對局
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(dailyKey()) || "null"); } catch (e) {}
    if (saved && saved.rows) {
      restoreFinished(saved);
    } else {
      enableInput(true);
      inputEl.value = "";
      inputEl.focus();
    }
  }

  function startPractice() {
    setMode("practice");
    state = newState(randomPid(), "practice");
    hintBox.textContent = "";
    buildBoard();
    enableInput(true);
    inputEl.value = "";
    inputEl.focus();
    toast("練習模式：隨機一題");
  }

  function restoreFinished(saved) {
    saved.rows.forEach((g, idx) => {
      const tiles = rowEl(idx).children;
      for (let i = 0; i < WL; i++) {
        tiles[i].textContent = g.guess[i];
        tiles[i].classList.add("filled", g.feedback[i]);
      }
    });
    state.over = true; state.won = saved.won; state.row = saved.rows.length;
    enableInput(false);
    hintBox.textContent = saved.won
      ? "今日已完成 ✓ 明日再來，或切換練習模式。"
      : "今日已結束，明日再來，或切換練習模式。";
  }

  function enableInput(on) {
    inputEl.disabled = !on;
    $("#submit-btn").disabled = !on;
    $("#hint-btn").disabled = !on;
    $("#giveup-btn").disabled = !on;
  }

  function setMode(m) {
    $("#mode-daily").classList.toggle("active", m === "daily");
    $("#mode-practice").classList.toggle("active", m === "practice");
  }

  // ---------- 共用 ----------
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }
  function openModal(sel) { $(sel).classList.add("show"); }
  function closeModal(sel) { $(sel).classList.remove("show"); }
  // 獲勝時鈐下「得之」朱印，短暫呈現後自動淡出（純視覺）
  function showStamp() {
    const layer = $("#stamp-layer");
    if (!layer) return;
    layer.classList.remove("show");
    void layer.offsetWidth; // 強制重排，讓動畫可重播
    layer.classList.add("show");
    clearTimeout(showStamp._t);
    showStamp._t = setTimeout(() => layer.classList.remove("show"), 1500);
  }

  // ---------- 事件 ----------
  function bind() {
    inputEl.addEventListener("compositionstart", () => { composing = true; });
    inputEl.addEventListener("compositionend", () => { composing = false; renderPreview(); });
    inputEl.addEventListener("input", () => { if (!composing) renderPreview(); });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !composing) { e.preventDefault(); submitGuess(); }
    });
    $("#submit-btn").addEventListener("click", submitGuess);
    $("#hint-btn").addEventListener("click", showHint);
    $("#giveup-btn").addEventListener("click", giveUp);
    $("#stats-btn").addEventListener("click", openStats);
    $("#about-btn").addEventListener("click", () => openModal("#about-modal"));
    $("#mode-daily").addEventListener("click", startDaily);
    $("#mode-practice").addEventListener("click", startPractice);
    $("#play-again").addEventListener("click", () => { closeModal("#result-modal"); startPractice(); });
    document.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(b.getAttribute("data-close")))
    );
    document.querySelectorAll(".overlay").forEach((ov) =>
      ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("show"); })
    );
  }

  // ---------- 頁尾資訊 ----------
  $("#total-idioms").textContent = IDIOMS.length;
  $("#today-str").textContent = taipeiToday();
  renderMiniStats(collectStats());

  bind();
  startDaily();
})();

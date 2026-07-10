/* 推敲 · 前端邏輯 */
(function () {
  "use strict";
  const CFG = window.CONFIG || { wordLen: 4, maxAttempts: 6, today: "" };
  const WL = CFG.wordLen, MAX = CFG.maxAttempts;
  const HAN = /[一-鿿]/g;

  const $ = (s) => document.querySelector(s);
  const boardEl = $("#board");
  const inputEl = $("#guess");
  const hintBox = $("#hint-box");
  const toastEl = $("#toast");

  let state = null;      // 當前對局
  let composing = false; // IME 組字中

  // ---------- 對局狀態 ----------
  function newState(pid, mode) {
    return { pid, mode, row: 0, over: false, won: false, rows: [], locked: false };
  }

  function dailyKey() { return "tuiqiao_daily_" + CFG.today; }

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
  async function submitGuess() {
    if (!state || state.over || state.locked) return;
    const chars = (inputEl.value.match(HAN) || []);
    if (chars.length < WL) { shake(); toast("請輸入四個中文字"); return; }
    const guess = chars.slice(0, WL).join("");
    state.locked = true;
    let data;
    try {
      data = await postJSON("/api/guess", { guess, pid: state.pid });
    } catch (e) { state.locked = false; toast("連線發生問題"); return; }
    if (!data.ok) { state.locked = false; shake(); toast(data.error || "無法判定"); return; }

    const r = state.row;
    inputEl.value = "";
    state.rows.push({ guess, feedback: data.feedback });
    paintRow(r, guess, data.feedback, data.solved, () => {
      if (data.solved) {
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
  async function finishGame() {
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
    let stats = null;
    try {
      const res = await postJSON("/api/result", {
        pid: state.pid, mode: state.mode, won: state.won, guesses,
      });
      stats = res.stats;
    } catch (e) {}

    let answer = null;
    try { answer = await postJSON("/api/reveal", { pid: state.pid }); } catch (e) {}
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

  async function openStats() {
    let stats = null;
    try { const r = await getJSON("/api/stats"); stats = r.stats; } catch (e) {}
    renderStats(stats, "#stats-body");
    openModal("#stats-modal");
  }

  // ---------- 提示 / 揭曉 ----------
  async function showHint() {
    if (!state) return;
    try {
      const r = await getJSON("/api/hint?pid=" + state.pid);
      if (r.ok) hintBox.textContent = "提示：" + r.hint;
    } catch (e) { toast("提示載入失敗"); }
  }

  function giveUp() {
    if (!state || state.over) return;
    if (!confirm("確定要看答案嗎？本局將計為未猜中。")) return;
    state.over = true; state.won = false;
    finishGame();
  }

  // ---------- 模式 ----------
  async function startDaily() {
    setMode("daily");
    let info;
    try { info = await getJSON("/api/puzzle/today"); }
    catch (e) { toast("題目載入失敗"); return; }
    state = newState(info.pid, "daily");
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

  async function startPractice() {
    setMode("practice");
    let info;
    try { info = await getJSON("/api/puzzle/random"); }
    catch (e) { toast("題目載入失敗"); return; }
    state = newState(info.pid, "practice");
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

  async function getJSON(url) {
    const r = await fetch(url);
    return r.json();
  }
  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
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

  bind();
  startDaily();
})();

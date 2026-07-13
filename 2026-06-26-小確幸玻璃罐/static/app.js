/* ===== 小確幸玻璃罐 · app.js（純前端版，資料存 localStorage） ===== */
"use strict";

// 心情對照表（原後端 app.py 的 MOODS 已合併於此，五種心情一筆不少）
const MOODS = {
  warm:     { label: "溫暖",   emoji: "☀️", color: "#f3a45c" },
  calm:     { label: "平靜",   emoji: "🌿", color: "#88bd84" },
  surprise: { label: "小驚喜", emoji: "✨", color: "#ef9ab9" },
  lucky:    { label: "幸運",   emoji: "🍀", color: "#5cb6b0" },
  proud:    { label: "有成就", emoji: "🌟", color: "#b89ce0" },
};
const MOOD_KEYS = Object.keys(MOODS);

const $ = (id) => document.getElementById(id);

let joys = [];          // 全部小確幸（新到舊）
let selectedMood = "warm";
let justAddedId = null; // 剛投入的那則，用來播放掉落動畫

// 是否尊重「減少動態」偏好（會依 matchMedia change 動態更新）
let reduced = false;

// ---------- 本機儲存（取代原本的 Flask + SQLite 後端） ----------
const STORAGE_KEY = "jar.state";

let state = { joys: [], nextId: 1 };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.joys)) {
        const cleaned = s.joys.filter(
          (j) => j && typeof j.content === "string" && typeof j.created_at === "string"
        ).map((j) => ({
          id: Number(j.id) || 0,
          content: j.content,
          mood: MOODS[j.mood] ? j.mood : "warm",
          created_at: j.created_at,
        }));
        let maxId = 0;
        cleaned.forEach((j) => { if (j.id > maxId) maxId = j.id; });
        state = {
          joys: cleaned,
          nextId: Number.isInteger(s.nextId) && s.nextId > maxId ? s.nextId : maxId + 1,
        };
        return;
      }
    }
  } catch (e) { /* 資料損毀時視同空罐 */ }
  state = { joys: [], nextId: 1 };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 等同 Python 的 datetime.now().isoformat(timespec="seconds")
function nowIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 等同原後端「列出全部」：新到舊（時間相同者 id 大的在前）
function storeList() {
  return state.joys.slice().sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return b.id - a.id;
  });
}

// 等同原後端「新增一則」
function storeAdd(rawContent, rawMood) {
  let content = (rawContent || "").trim();
  let mood = rawMood || "warm";
  if (!MOODS[mood]) mood = "warm";
  if (!content) throw new Error("請先寫下一則小確幸 🙂");
  if (content.length > 200) content = content.slice(0, 200);

  const joy = {
    id: state.nextId,
    content: content,
    mood: mood,
    created_at: nowIso(),
  };
  state.nextId += 1;
  state.joys.push(joy);
  saveState();
  return joy;
}

// 等同原後端「隨機回味一則」
function storeRandom() {
  if (!state.joys.length) throw new Error("罐子還是空的，先投一則進去吧 ✨");
  return state.joys[Math.floor(Math.random() * state.joys.length)];
}

// 等同原後端「刪除某一則」
function storeRemove(id) {
  state.joys = state.joys.filter((j) => j.id !== id);
  saveState();
}

// 等同原後端「統計」：總數、本月、連續天數、最常心情
function storeStats() {
  const total = state.joys.length;
  const now = new Date();
  let thisMonth = 0;
  const days = new Set();
  const moodCount = {};

  state.joys.forEach((j) => {
    const dayStr = String(j.created_at).slice(0, 10); // YYYY-MM-DD
    const parts = dayStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => isNaN(n))) return;
    if (parts[0] === now.getFullYear() && parts[1] === now.getMonth() + 1) thisMonth += 1;
    days.add(dayStr);
    moodCount[j.mood] = (moodCount[j.mood] || 0) + 1;
  });

  // 連續天數：從今天（若今天沒有就從最近一筆那天）往回數，連續有紀錄的天數
  let streak = 0;
  if (days.size) {
    const p = (n) => String(n).padStart(2, "0");
    const key = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!days.has(key(cursor))) {
      const latest = Array.from(days).sort().pop();
      const q = latest.split("-").map(Number);
      cursor = new Date(q[0], q[1] - 1, q[2]);
    }
    while (days.has(key(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  let topMood = null;
  const moodKeys = Object.keys(moodCount);
  if (moodKeys.length) {
    let topKey = moodKeys[0];
    moodKeys.forEach((k) => { if (moodCount[k] > moodCount[topKey]) topKey = k; });
    topMood = MOODS[topKey] ? MOODS[topKey].label : topKey;
  }

  return { total: total, this_month: thisMonth, streak: streak, top_mood: topMood };
}

// ---------- 工具 ----------
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const w = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（週${w}）${p(d.getHours())}:${p(d.getMinutes())}`;
}

function showToast(msg, isError) {
  const t = $("toast");
  t.textContent = msg;
  t.style.color = isError ? "#b5483a" : "var(--accent-deep)";
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 2600);
}

// 數字滾動（尊重 reduced-motion；同元素多次呼叫會自動接手）
function rollNumber(el, to) {
  to = Number(to) || 0;
  const from = parseInt(el.textContent, 10) || 0;
  if (el._raf) { cancelAnimationFrame(el._raf); el._raf = null; }
  if (reduced || from === to) {
    el.textContent = to;
    if (from !== to) popEl(el);
    return;
  }
  popEl(el);
  const start = performance.now();
  const dur = 640;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) { el._raf = requestAnimationFrame(step); }
    else { el.textContent = to; el._raf = null; }
  };
  el._raf = requestAnimationFrame(step);
}

function popEl(el) {
  if (reduced) return;
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

// ---------- 心情按鈕 ----------
function buildMoodButtons() {
  const row = $("moodRow");
  MOOD_KEYS.forEach((key) => {
    const m = MOODS[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mood-btn" + (key === selectedMood ? " active" : "");
    btn.dataset.key = key;
    btn.setAttribute("aria-pressed", key === selectedMood ? "true" : "false");
    btn.setAttribute("aria-label", "心情：" + m.label);
    btn.innerHTML = `<span class="dot" style="background:${m.color}"></span>${m.emoji} ${m.label}`;
    btn.addEventListener("click", () => selectMood(key));
    row.appendChild(btn);
  });
  applyActiveMoodStyle();
}

function selectMood(key) {
  selectedMood = key;
  document.querySelectorAll(".mood-btn").forEach((b) => {
    const on = b.dataset.key === key;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  applyActiveMoodStyle();
}

function applyActiveMoodStyle() {
  document.querySelectorAll(".mood-btn").forEach((b) => {
    if (b.classList.contains("active")) {
      b.style.background = MOODS[b.dataset.key].color;
    } else {
      b.style.background = "#fffefb";
    }
  });
}

// ---------- 玻璃罐紙條 ----------
function renderJar() {
  const box = $("slips");
  box.innerHTML = "";
  // 取最近 48 則，舊的在下、新的在上
  const visible = joys.slice(0, 48).slice().reverse();
  const step = Math.min(9, 240 / Math.max(visible.length, 1));

  visible.forEach((j, i) => {
    const m = MOODS[j.mood] || MOODS.warm;
    const slip = document.createElement("div");
    slip.className = "slip" + (j.id === justAddedId ? " dropping" : "");
    const rot = ((j.id * 47) % 21) - 10;
    const leftJit = ((j.id * 53) % 81) - 40;
    const left = Math.max(8, Math.min(132, 70 + leftJit));
    const bottom = 16 + i * step + ((j.id * 29) % 5);
    slip.style.left = left + "px";
    slip.style.bottom = bottom + "px";
    slip.style.transform = `rotate(${rot}deg)`;
    slip.style.background = `linear-gradient(180deg, ${m.color}, ${shade(m.color, -12)})`;
    slip.title = `${m.emoji} ${j.content}`;
    box.appendChild(slip);
  });
  justAddedId = null;
  updateJarFill();
}

// 依收藏數點亮罐底暖光（純視覺，不影響任何資料）
function updateJarFill(pulse) {
  const fill = $("jarFill");
  if (!fill) return;
  const level = Math.min(1, joys.length / 60);
  fill.style.opacity = joys.length ? (0.14 + level * 0.62).toFixed(3) : "0";
  if (pulse && !reduced) {
    fill.classList.remove("pulse");
    void fill.offsetWidth;
    fill.classList.add("pulse");
  }
}

// 讓顏色加深一點，做出紙的層次
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 0xff) + amt, b = (n & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// ---------- 時間軸 ----------
function renderTimeline(opts) {
  opts = opts || {};
  const ul = $("timeline");
  ul.innerHTML = "";
  $("timelineCount").textContent = joys.length ? `共 ${joys.length} 則` : "";
  $("emptyHint").hidden = joys.length > 0;

  joys.forEach((j, idx) => {
    const m = MOODS[j.mood] || MOODS.warm;
    const li = document.createElement("li");
    li.className = "t-item";
    if (!reduced) {
      if (opts.newId === j.id) {
        li.classList.add("t-new");
      } else if (opts.stagger && idx < 12) {
        li.classList.add("enter");
        li.style.setProperty("--td", (idx * 0.045).toFixed(3) + "s");
      }
    }
    li.style.borderLeftColor = m.color;
    li.innerHTML = `
      <span class="t-emoji" aria-hidden="true">${m.emoji}</span>
      <div class="t-body">
        <p class="t-text"></p>
        <p class="t-date">${fmtDate(j.created_at)} · ${m.label}</p>
      </div>
      <button class="t-del" type="button" title="從罐子裡拿走" aria-label="移除這則小確幸">×</button>`;
    li.querySelector(".t-text").textContent = j.content;
    li.querySelector(".t-del").addEventListener("click", () => removeJoy(j.id));
    ul.appendChild(li);
  });
}

// ---------- 統計 ----------
function refreshStats() {
  try {
    const s = storeStats();
    rollNumber($("statTotal"), s.total);
    rollNumber($("statMonth"), s.this_month);
    rollNumber($("statStreak"), s.streak);
    const moodEl = $("statMood");
    const nextMood = s.top_mood || "—";
    if (moodEl.textContent !== nextMood) { moodEl.textContent = nextMood; popEl(moodEl); }
    rollNumber($("jarCount"), s.total);
  } catch (e) { /* 靜默 */ }
}

// ---------- 動作 ----------
function loadAll() {
  loadState();
  joys = storeList();
  renderJar();
  renderTimeline({ stagger: true });
  refreshStats();
}

function addJoy() {
  const ta = $("content");
  const content = ta.value.trim();
  if (!content) { showToast("先寫下一則小確幸吧 🙂", true); ta.focus(); return; }
  try {
    const created = storeAdd(content, selectedMood);
    justAddedId = created.id;
    ta.value = "";
    updateCharCount();
    joys.unshift(created);
    renderJar();
    updateJarFill(true);
    renderTimeline({ newId: created.id });
    refreshStats();
    wiggleJar();
    burstSparkles();
    showToast("投進罐子了，今天又多了一份美好 ✨");
  } catch (e) {
    showToast(e.message, true);
  }
}

function removeJoy(id) {
  try {
    storeRemove(id);
    joys = joys.filter((j) => j.id !== id);
    renderJar();
    renderTimeline();
    refreshStats();
  } catch (e) {
    showToast(e.message, true);
  }
}

function shake() {
  wiggleJar();
  try {
    const j = storeRandom();
    const m = MOODS[j.mood] || MOODS.warm;
    const f = $("featured");
    f.hidden = false; // 先讓 aria-live 區域可見，再更新內容以確保朗讀
    $("featuredText").textContent = j.content;
    $("featuredMeta").textContent = `${m.emoji} ${m.label} · ${fmtDate(j.created_at)}`;
    // 重新觸發進場動畫
    const inner = f.querySelector(".featured-inner");
    inner.style.animation = "none";
    void inner.offsetWidth;
    inner.style.animation = "";
    f.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  } catch (e) {
    showToast(e.message, true);
  }
}

function wiggleJar() {
  if (reduced) return;
  const jar = $("jar");
  jar.classList.remove("shaking");
  void jar.offsetWidth;
  jar.classList.add("shaking");
}

// 投入時：從罐口噴出金色碎屑（純 transform/opacity，播完自動移除）
function burstSparkles() {
  if (reduced) return;
  const layer = $("sparkLayer");
  if (!layer) return;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    s.className = "spark";
    const dx = (Math.random() * 2 - 1) * 62;
    const dy = -(28 + Math.random() * 74);
    s.style.left = "50%";
    s.style.top = "24%";
    s.style.setProperty("--dx", dx.toFixed(1) + "px");
    s.style.setProperty("--dy", dy.toFixed(1) + "px");
    s.style.setProperty("--dur", (720 + Math.random() * 520).toFixed(0) + "ms");
    s.addEventListener("animationend", () => s.remove());
    layer.appendChild(s);
  }
}

function updateCharCount() {
  const v = $("content").value.length;
  $("charCount").textContent = v;
  const counter = $("charCount").parentElement;
  if (counter) counter.classList.toggle("near", v >= 180);
}

function showToday() {
  const d = new Date();
  const w = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  $("today").textContent = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${w}`;
}

// ---------- 背景微光粒子（signature「哇」時刻，離屏／分頁隱藏／減少動態時暫停） ----------
let ambientStart = null, ambientStop = null, ambientClear = null;

function initAmbient() {
  const canvas = $("ambient");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let motes = [];
  let raf = null, running = false;

  // 預先畫一顆柔光精靈，重複貼上以節省效能
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  const sctx = sprite.getContext("2d");
  const g = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(246,208,136,.92)");
  g.addColorStop(0.4, "rgba(240,190,112,.36)");
  g.addColorStop(1, "rgba(240,190,112,0)");
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, 32, 32);

  function seed() {
    const count = Math.max(16, Math.min(52, Math.round((W * H) / 26000)));
    motes = [];
    for (let i = 0; i < count; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: 8 + Math.random() * 16,
        vy: 0.12 + Math.random() * 0.35,
        drift: 0.15 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        tw: 0.5 + Math.random() * 1.1,
        base: 0.16 + Math.random() * 0.34,
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.y -= m.vy;
      m.x += Math.sin(t * 0.0004 + m.phase) * m.drift;
      if (m.y < -20) { m.y = H + 20; m.x = Math.random() * W; }
      const tw = 0.55 + 0.45 * Math.sin(t * 0.001 * m.tw + m.phase);
      ctx.globalAlpha = m.base * tw;
      ctx.drawImage(sprite, m.x - m.size / 2, m.y - m.size / 2, m.size, m.size);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduced || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }
  function clear() { ctx.clearRect(0, 0, W, H); }

  ambientStart = start;
  ambientStop = stop;
  ambientClear = clear;

  // 視窗縮放：以 rAF 節流
  let resizeRaf = null;
  window.addEventListener("resize", () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = null; resize(); });
  });

  // 分頁隱藏時暫停迴圈
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  resize();
  start();
}

// ---------- 啟動 ----------
document.addEventListener("DOMContentLoaded", () => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduced = mq.matches;
  // 以 matchMedia change 動態監聽偏好切換
  const onMotionChange = (e) => {
    reduced = e.matches;
    if (reduced) { if (ambientStop) ambientStop(); if (ambientClear) ambientClear(); }
    else { if (ambientStart) ambientStart(); }
  };
  if (mq.addEventListener) mq.addEventListener("change", onMotionChange);
  else if (mq.addListener) mq.addListener(onMotionChange); // 舊版瀏覽器相容

  showToday();
  buildMoodButtons();
  // 保養 2026-07-14：氛圍動畫是裝飾，就算 canvas 取不到 context 也不該
  // 讓後面的按鈕接線一起陪葬（原本會整頁失效）。
  try {
    initAmbient();
  } catch (err) {
    console.warn("氛圍動畫初始化失敗，不影響玻璃罐功能：", err);
  }

  $("addBtn").addEventListener("click", addJoy);
  $("shakeBtn").addEventListener("click", shake);
  const jar = $("jar");
  jar.addEventListener("click", shake);
  jar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      shake();
    }
  });
  $("content").addEventListener("input", updateCharCount);
  $("content").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addJoy();
  });

  try {
    loadAll();
  } catch (e) {
    showToast("載入失敗：" + e.message, true);
  }

  // 觸發進場 stagger
  requestAnimationFrame(() => document.body.classList.add("ready"));
});

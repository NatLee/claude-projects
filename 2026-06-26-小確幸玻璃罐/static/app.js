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

// ---------- 心情按鈕 ----------
function buildMoodButtons() {
  const row = $("moodRow");
  MOOD_KEYS.forEach((key) => {
    const m = MOODS[key];
    const btn = document.createElement("button");
    btn.className = "mood-btn" + (key === selectedMood ? " active" : "");
    btn.dataset.key = key;
    btn.innerHTML = `<span class="dot" style="background:${m.color}"></span>${m.emoji} ${m.label}`;
    btn.addEventListener("click", () => selectMood(key));
    row.appendChild(btn);
  });
  applyActiveMoodStyle();
}

function selectMood(key) {
  selectedMood = key;
  document.querySelectorAll(".mood-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.key === key);
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
function renderTimeline() {
  const ul = $("timeline");
  ul.innerHTML = "";
  $("timelineCount").textContent = joys.length ? `共 ${joys.length} 則` : "";
  $("emptyHint").hidden = joys.length > 0;

  joys.forEach((j) => {
    const m = MOODS[j.mood] || MOODS.warm;
    const li = document.createElement("li");
    li.className = "t-item";
    li.style.borderLeftColor = m.color;
    li.innerHTML = `
      <span class="t-emoji">${m.emoji}</span>
      <div class="t-body">
        <p class="t-text"></p>
        <p class="t-date">${fmtDate(j.created_at)} · ${m.label}</p>
      </div>
      <button class="t-del" title="從罐子裡拿走">×</button>`;
    li.querySelector(".t-text").textContent = j.content;
    li.querySelector(".t-del").addEventListener("click", () => removeJoy(j.id));
    ul.appendChild(li);
  });
}

// ---------- 統計 ----------
function refreshStats() {
  try {
    const s = storeStats();
    $("statTotal").textContent = s.total;
    $("statMonth").textContent = s.this_month;
    $("statStreak").textContent = s.streak;
    $("statMood").textContent = s.top_mood || "—";
  } catch (e) { /* 靜默 */ }
}

// ---------- 動作 ----------
function loadAll() {
  loadState();
  joys = storeList();
  renderJar();
  renderTimeline();
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
    renderTimeline();
    refreshStats();
    wiggleJar();
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
    $("featuredText").textContent = j.content;
    $("featuredMeta").textContent = `${m.emoji} ${m.label} · ${fmtDate(j.created_at)}`;
    const f = $("featured");
    f.hidden = false;
    // 重新觸發進場動畫
    const inner = f.querySelector(".featured-inner");
    inner.style.animation = "none";
    void inner.offsetWidth;
    inner.style.animation = "";
    f.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    showToast(e.message, true);
  }
}

function wiggleJar() {
  const jar = $("jar");
  jar.classList.remove("shaking");
  void jar.offsetWidth;
  jar.classList.add("shaking");
}

function updateCharCount() {
  $("charCount").textContent = $("content").value.length;
}

function showToday() {
  const d = new Date();
  const w = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  $("today").textContent = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${w}`;
}

// ---------- 啟動 ----------
document.addEventListener("DOMContentLoaded", () => {
  showToday();
  buildMoodButtons();
  $("addBtn").addEventListener("click", addJoy);
  $("shakeBtn").addEventListener("click", shake);
  $("jar").addEventListener("click", shake);
  $("content").addEventListener("input", updateCharCount);
  $("content").addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addJoy();
  });
  try {
    loadAll();
  } catch (e) {
    showToast("載入失敗：" + e.message, true);
  }
});

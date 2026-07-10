/* ===== 小確幸玻璃罐 · app.js ===== */
"use strict";

// 心情對照表（key 必須與後端 app.py 的 MOODS 一致）
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

// ---------- 工具 ----------
async function api(path, opts) {
  const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
  if (!res.ok) {
    let msg = "操作失敗";
    try { msg = (await res.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

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
async function refreshStats() {
  try {
    const s = await api("/api/stats");
    $("statTotal").textContent = s.total;
    $("statMonth").textContent = s.this_month;
    $("statStreak").textContent = s.streak;
    $("statMood").textContent = s.top_mood || "—";
  } catch (e) { /* 靜默 */ }
}

// ---------- 動作 ----------
async function loadAll() {
  joys = await api("/api/joys");
  renderJar();
  renderTimeline();
  await refreshStats();
}

async function addJoy() {
  const ta = $("content");
  const content = ta.value.trim();
  if (!content) { showToast("先寫下一則小確幸吧 🙂", true); ta.focus(); return; }
  try {
    const created = await api("/api/joys", {
      method: "POST",
      body: JSON.stringify({ content, mood: selectedMood }),
    });
    justAddedId = created.id;
    ta.value = "";
    updateCharCount();
    joys.unshift(created);
    renderJar();
    renderTimeline();
    await refreshStats();
    wiggleJar();
    showToast("投進罐子了，今天又多了一份美好 ✨");
  } catch (e) {
    showToast(e.message, true);
  }
}

async function removeJoy(id) {
  try {
    await api("/api/joys/" + id, { method: "DELETE" });
    joys = joys.filter((j) => j.id !== id);
    renderJar();
    renderTimeline();
    await refreshStats();
  } catch (e) {
    showToast(e.message, true);
  }
}

async function shake() {
  wiggleJar();
  try {
    const j = await api("/api/joys/random");
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
  loadAll().catch((e) => showToast("載入失敗：" + e.message, true));
});

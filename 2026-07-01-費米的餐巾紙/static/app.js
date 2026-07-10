/* ───────────────────────────────────────────────────────────
   費米的餐巾紙 — 前端邏輯
   ─────────────────────────────────────────────────────────── */
"use strict";

const $ = (id) => document.getElementById(id);
let currentQ = null;          // 目前題目 {id, prompt, unit, category}
let answered = false;

/* ── 數字格式化 ─────────────────────────────────── */
function sciParts(x){
  if (x <= 0) return { m: 0, e: 0 };
  let e = Math.floor(Math.log10(x));
  let m = x / Math.pow(10, e);
  if (m >= 9.995) { m /= 10; e += 1; }   // 浮點修正
  return { m: Math.round(m * 10) / 10, e };
}
function fmtSci(x){
  const { m, e } = sciParts(x);
  return `${m.toFixed(1)} × 10<sup>${e}</sup>`;
}
function trimNum(x){
  // 取 3 位有效數字、去除尾端 0
  let s = x.toPrecision(3);
  return parseFloat(s).toLocaleString("en-US");
}
function fmtCN(x){
  const units = [[1e16,"京"],[1e12,"兆"],[1e8,"億"],[1e4,"萬"]];
  for (const [v,u] of units){
    if (x >= v && x < 1e20) return trimNum(x / v) + " " + u;
  }
  return null;
}
// 主顯示：小數值用一般寫法，大數值用科學記號（回傳 HTML）
function displayMain(x){
  if (x < 1e4) return Math.round(x).toLocaleString("en-US");
  return fmtSci(x);
}

/* ── 即時讀數 ─────────────────────────────────────── */
function currentGuess(){
  let m = parseFloat($("mantissa").value);
  if (isNaN(m)) m = 1;
  m = Math.min(9.9, Math.max(1, m));
  const e = parseInt($("exponent").value, 10);
  return m * Math.pow(10, e);
}
function updateReadout(){
  const g = currentGuess();
  const e = parseInt($("exponent").value, 10);
  $("expLabel").textContent = e;
  $("readoutSci").innerHTML = displayMain(g);
  $("readoutUnit").textContent = currentQ ? currentQ.unit : "";
  const cn = fmtCN(g);
  $("readoutCN").textContent = cn ? `約 ${cn}` : (g >= 1e20 ? "（天文數字！）" : "");
}

/* ── 載入題目 ─────────────────────────────────────── */
async function loadQuestion(exclude){
  const url = "/api/question" + (exclude ? `?exclude=${exclude}` : "");
  const r = await fetch(url);
  const q = await r.json();
  currentQ = q;
  answered = false;

  $("catChip").textContent = q.category;
  $("qCounter").textContent = `題庫共 ${q.total} 題`;
  $("questionText").textContent = q.prompt;

  // 重置估計器
  $("mantissa").value = 1;
  $("exponent").value = 4;
  $("resultBox").hidden = true;
  $("estimator").style.display = "";
  $("revealBtn").disabled = false;
  updateReadout();
}

/* ── 揭曉答案 ─────────────────────────────────────── */
async function reveal(){
  if (!currentQ || answered) return;
  answered = true;
  $("revealBtn").disabled = true;

  const guess = currentGuess();
  const r = await fetch("/api/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: currentQ.id, guess }),
  });
  const d = await r.json();
  if (d.error){ alert("發生錯誤：" + d.error); answered = false; $("revealBtn").disabled=false; return; }
  renderResult(d);
  loadStats();
}

function renderResult(d){
  $("estimator").style.display = "none";
  const box = $("resultBox");
  box.hidden = false;

  // 評語
  const v = $("verdict");
  v.className = "verdict " + (d.within_order ? (d.ratio < 4 ? "good" : "good") : (d.ratio < 100 ? "mid" : "bad"));
  v.innerHTML = `<span class="v-emoji">${d.emoji}</span>${d.verdict}`;

  // 對數刻度比較軸
  positionPins(d.guess, d.answer);
  const ordersTxt = d.orders < 0.05
    ? "幾乎分毫不差"
    : `相差 <strong>${d.orders}</strong> 個數量級（約 ${trimNum(d.ratio)} 倍）`;
  $("ordersNote").innerHTML = d.within_order
    ? `${ordersTxt} — 落在一個數量級內，這就是好估算！`
    : ordersTxt;

  // 數值對照
  const unit = d.unit;
  $("yourValue").innerHTML = displayMain(d.guess) + " " + unit;
  const cn = fmtCN(d.answer);
  $("trueValue").innerHTML = displayMain(d.answer) + " " + unit + (cn ? `　<small style="color:var(--ink-soft)">≈ ${cn}</small>` : "");

  $("explainBox").innerHTML = d.explanation;
  $("sourceBox").textContent = d.source;
}

// 把「你」與「正解」放到對數軸上
function positionPins(you, truth){
  const ly = Math.log10(Math.max(you, 1e-12));
  const lt = Math.log10(Math.max(truth, 1e-12));
  let lo = Math.min(ly, lt), hi = Math.max(ly, lt);
  const pad = Math.max(0.6, (hi - lo) * 0.35);
  lo -= pad; hi += pad;
  const span = (hi - lo) || 1;
  const pos = (l) => Math.min(97, Math.max(3, ((l - lo) / span) * 100));
  $("pinYou").style.left  = pos(ly) + "%";
  $("pinTrue").style.left = pos(lt) + "%";
}

/* ── 數感檔案 ─────────────────────────────────────── */
async function loadStats(){
  const r = await fetch("/api/stats");
  const s = await r.json();
  $("stTotal").textContent  = s.total;
  $("stHit").textContent    = s.total ? s.hit_rate + "%" : "—";
  $("stErr").textContent    = s.total ? s.avg_log_error : "—";
  $("stStreak").textContent = `${s.current_streak} / ${s.best_streak}`;

  const list = $("recentList");
  if (!s.recent.length){
    list.innerHTML = `<li class="recent-empty">還沒有紀錄，先估一題看看吧。</li>`;
    return;
  }
  list.innerHTML = s.recent.map(it => {
    const mark = it.within_order
      ? `<span class="r-mark hit">✓</span>`
      : `<span class="r-mark miss">✕</span>`;
    return `<li>${mark}<span class="r-prompt">${it.prompt}</span>` +
           `<span class="r-err">差 ${it.log_error} 級</span></li>`;
  }).join("");
}

async function resetStats(){
  if (!confirm("確定要清除所有估算紀錄嗎？")) return;
  await fetch("/api/reset", { method: "POST" });
  loadStats();
}

/* ── 綁定事件 ─────────────────────────────────────── */
function bind(){
  $("mantissa").addEventListener("input", updateReadout);
  $("exponent").addEventListener("input", updateReadout);
  $("revealBtn").addEventListener("click", reveal);
  $("nextBtn").addEventListener("click", () => loadQuestion(currentQ ? currentQ.id : null));
  $("resetBtn").addEventListener("click", resetStats);
  $("aboutToggle").addEventListener("click", () => {
    const box = $("aboutBox");
    box.hidden = !box.hidden;
    $("aboutToggle").innerHTML = box.hidden ? "什麼是費米估算？ ↓" : "收合說明 ↑";
  });
}

window.addEventListener("DOMContentLoaded", () => {
  bind();
  loadQuestion();
  loadStats();
});

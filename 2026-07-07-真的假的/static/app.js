/* ============================================================
   真偽鑑定所 — 前端邏輯
   ============================================================ */
"use strict";

const $ = (id) => document.getElementById(id);

let current = null;     // 目前題目 {id, claim, category}
let lastId = -1;        // 上一題 id，抽題時避開
let caseCount = 0;      // 已處理案件數（用於案號）
let locked = false;     // 揭曉後鎖住按鈕

/* ---------- 工具 ---------- */
async function getJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
async function postJSON(url, body){
  const r = await fetch(url, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: body ? JSON.stringify(body) : null,
  });
  if(!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
const pad3 = (n) => String(n).padStart(3, "0");

/* ---------- 抽題 ---------- */
async function loadQuestion(){
  locked = false;
  // 收起揭曉區、重置印章
  $("reveal").hidden = true;
  const stamp = $("stamp");
  stamp.className = "stamp";
  // 重新啟用按鈕
  $("btnTrue").disabled = false;
  $("btnFalse").disabled = false;
  $("verdictButtons").style.display = "grid";

  $("claim").textContent = "正在調閱卷宗……";
  try{
    const q = await getJSON("/api/question?exclude=" + lastId);
    current = q;
    caseCount += 1;
    $("caseNo").textContent = "第 " + pad3(caseCount) + " 號案件";
    $("categoryTag").textContent = q.category;
    $("claim").textContent = q.claim;
  }catch(e){
    $("claim").textContent = "調閱卷宗失敗，請確認伺服器是否啟動。";
  }
}

/* ---------- 送出判斷 ---------- */
async function submitGuess(guess){
  if(locked || !current) return;
  locked = true;
  $("btnTrue").disabled = true;
  $("btnFalse").disabled = true;

  let res;
  try{
    res = await postJSON("/api/answer", {fact_id: current.id, guess: guess});
  }catch(e){
    locked = false;
    $("btnTrue").disabled = false;
    $("btnFalse").disabled = false;
    return;
  }
  lastId = current.id;

  // 蓋下朱印（顯示「正解」：真=綠印，假=朱印）
  const stamp = $("stamp");
  $("stampChar").textContent = res.verdict === 1 ? "真" : "假";
  stamp.className = "stamp show" + (res.verdict === 1 ? " green" : "");

  // 收起判斷鈕
  $("verdictButtons").style.display = "none";

  // 揭曉內容
  const banner = $("revealBanner");
  if(res.correct){
    banner.textContent = "✓ 鑑定正確";
    banner.className = "reveal-banner ok";
  }else{
    banner.textContent = "✗ 看走眼了";
    banner.className = "reveal-banner no";
  }
  $("explanation").textContent = res.explanation;
  const link = $("sourceLink");
  link.textContent = res.source;
  link.href = res.source_url;

  // 稍候讓印章落下，再滑出解說
  setTimeout(() => { $("reveal").hidden = false; }, 380);

  renderStats(res.stats, true);
}

/* ---------- 統計 ---------- */
function renderStats(s, flash){
  const setNum = (id, val) => {
    const el = $(id);
    el.innerHTML = val;
    if(flash){ el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  };
  setNum("statStreak", s.current_streak);
  $("statSeen").innerHTML = s.seen_facts + "<i>/" + s.total_facts + "</i>";
  $("statAcc").textContent = s.total ? (s.accuracy + "%") : "—";
  $("statBest").textContent = s.best_streak;

  // 檔案面板
  renderDossier(s);
}

function renderDossier(s){
  const insight = $("insight");
  if(s.total === 0){
    insight.innerHTML = "先鑑定幾件，這裡會分析你最容易被哪一類冷知識騙倒。";
  }else if(s.most_fooled){
    insight.innerHTML = "目前你最容易在 <b>「" + s.most_fooled +
      "」</b> 類看走眼——這一類的謠言特別會騙人，多留意！";
  }else{
    insight.innerHTML = "目前為止火眼金睛，各類都沒被騙倒，繼續保持！";
  }

  const bars = $("catBars");
  bars.innerHTML = "";
  s.category_stats.forEach(c => {
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML =
      '<span class="cat-name">' + c.category + '</span>' +
      '<span class="cat-track"><span class="cat-fill" style="width:' + c.accuracy + '%"></span></span>' +
      '<span class="cat-val">' + c.correct + '/' + c.total + '（' + c.accuracy + '%）</span>';
    bars.appendChild(row);
  });
}

async function refreshStats(){
  try{ renderStats(await getJSON("/api/stats"), false); }catch(e){}
}

/* ---------- 事件 ---------- */
$("btnTrue").addEventListener("click", () => submitGuess(1));
$("btnFalse").addEventListener("click", () => submitGuess(0));
$("btnNext").addEventListener("click", loadQuestion);

$("dossierToggle").addEventListener("click", () => {
  const body = $("dossierBody");
  body.hidden = !body.hidden;
});

$("btnReset").addEventListener("click", async () => {
  await postJSON("/api/reset");
  caseCount = 0;
  lastId = -1;
  await refreshStats();
  await loadQuestion();
});

/* ---------- 啟動 ---------- */
(async function init(){
  await refreshStats();
  await loadQuestion();
})();

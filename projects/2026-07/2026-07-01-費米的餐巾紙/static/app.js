/* ───────────────────────────────────────────────────────────
   費米的餐巾紙 — 前端邏輯（純靜態版）
   題庫與判定、統計全部在瀏覽器端完成，
   估算紀錄存於 localStorage（key：fermi.attempts）。
   ─────────────────────────────────────────────────────────── */
"use strict";

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "fermi.attempts";

let currentQ = null;          // 目前題目 {id, prompt, unit, category, ...}
let answered = false;
let swapping = false;         // 換題動畫進行中
let prevStats = null;         // 前一次統計（供數字滾動）
let lastExp = null;           // 前一次的數量級（供讀數彈跳）

/* ── 動態偏好：prefers-reduced-motion（動態監聽） ──── */
const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionMq.matches;
function onMotionPrefChange(e){
  reducedMotion = e.matches;
  if (reducedMotion) fxStop();
}
if (typeof motionMq.addEventListener === "function"){
  motionMq.addEventListener("change", onMotionPrefChange);
} else if (typeof motionMq.addListener === "function"){
  motionMq.addListener(onMotionPrefChange);
}

/* ── 題庫：所有數值皆經查證或可直接計算（見 說明.md 的資料來源）
      answer 一律以「題目單位」的數值表示 ───────────────────── */
const QUESTIONS = [
  {
    id: 1,
    prompt: "一年大約有多少秒？",
    answer: 31557600, unit: "秒", category: "時間量級",
    explanation: "365.25 天 × 24 時 × 60 分 × 60 秒 ≈ 3.16×10⁷。物理學家的口訣是「π×10⁷ 秒 ≈ 一年」，誤差不到 0.5%，超好記。",
    source: "基本換算",
  },
  {
    id: 2,
    prompt: "一個成年人的身體大約由多少個細胞組成？",
    answer: 3.72e13, unit: "個", category: "人體尺度",
    explanation: "把各器官、各類細胞分別估算再加總。Bianconi 等人 2013 年得到約 3.72×10¹³（37.2 兆）個，其中超過 7 成是紅血球。",
    source: "Bianconi et al., 2013, Annals of Human Biology",
  },
  {
    id: 3,
    prompt: "人類大腦大約有多少個神經元（neuron）？",
    answer: 8.6e10, unit: "個", category: "人體尺度",
    explanation: "Herculano-Houzel 用「腦湯」法（把腦組織均質化後數細胞核）算出約 860 億個，遠少於過去常說的「一兆」。",
    source: "Herculano-Houzel, 2009",
  },
  {
    id: 4,
    prompt: "地球到月球的平均距離大約是多少公里？",
    answer: 384400, unit: "公里", category: "天文距離",
    explanation: "約 38.4 萬公里 ≈ 地球直徑的 30 倍。光來回約 2.56 秒，這正是阿波羅任務地月通訊的延遲。",
    source: "天文常數",
  },
  {
    id: 5,
    prompt: "陽光從太陽到地球，大約要走多少秒？",
    answer: 499, unit: "秒", category: "天文距離",
    explanation: "1 天文單位 ÷ 光速 = 1.5×10⁸ km ÷ 3×10⁵ km/s ≈ 500 秒 ≈ 8 分 20 秒。你看到的太陽，是 8 分鐘前的它。",
    source: "天文常數",
  },
  {
    id: 6,
    prompt: "台灣四大超商（7-11、全家、萊爾富、OK）合計大約有多少家門市？",
    answer: 14000, unit: "家", category: "生活密度",
    explanation: "約 2,300 萬人口、每約 1,600 人就有一家超商，密度世界數一數二。四大合計逾 1.4 萬家（7-11 約 8,300、全家約 4,500）。",
    source: "台灣連鎖暨加盟協會 / 經濟日報，2025",
  },
  {
    id: 7,
    prompt: "一個人活到 80 歲，一生大約眨眼幾次？",
    answer: 4.2e8, unit: "次", category: "費米經典",
    explanation: "每分鐘約 15 次 × 清醒 16 時 × 60 分 × 365 天 × 80 年 ≈ 4×10⁸。這是費米估算的經典：拆成可估的小步驟連乘。",
    source: "估算鏈（眨眼頻率 15 次/分）",
  },
  {
    id: 8,
    prompt: "聖母峰（珠穆朗瑪峰）的高度大約是多少公尺？",
    answer: 8849, unit: "公尺", category: "地球尺度",
    explanation: "8,849 公尺（2020 年中尼聯合測量值），約是台北 101（508 公尺）的 17 倍高。",
    source: "2020 中尼聯測",
  },
  {
    id: 9,
    prompt: "台北 101 的高度（含尖頂）大約是多少公尺？",
    answer: 508, unit: "公尺", category: "地球尺度",
    explanation: "508 公尺，2004–2010 年間曾是世界最高樓。內部的 660 公噸調諧質量阻尼器是抗風神器。",
    source: "建築公開資料",
  },
  {
    id: 10,
    prompt: "地球赤道一圈的周長大約是多少公里？",
    answer: 40075, unit: "公里", category: "地球尺度",
    explanation: "40,075 公里。當年「公尺」被定義成『赤道到北極距離的千萬分之一』，所以周長≈4×10⁷ 公尺並非巧合。",
    source: "大地測量",
  },
  {
    id: 11,
    prompt: "空中巴士 A380（全球最大客機）最大起飛重量大約多少公噸？",
    answer: 575, unit: "公噸", category: "工程量級",
    explanation: "約 575 公噸，相當於約 100 頭非洲象。能裝下 800 多位乘客還飛得起來，本身就是工程奇蹟。",
    source: "Airbus 規格",
  },
  {
    id: 12,
    prompt: "全世界現存、已被描述命名的鳥類大約有多少種？",
    answer: 11000, unit: "種", category: "自然萬象",
    explanation: "依不同名錄約 10,800–11,000 種（IOC 約 10,800、Clements 約 10,990），幾乎是哺乳類（約 6,500 種）的兩倍。",
    source: "IOC World Bird List / Clements Checklist, 2024",
  },
  {
    id: 13,
    prompt: "1 公升的水大約含有多少個水分子？",
    answer: 3.34e25, unit: "個", category: "微觀世界",
    explanation: "1000 克 ÷ 18 克/莫耳 × 6.022×10²³ ≈ 3.34×10²⁵ 個。一杯水裡的分子數，比全宇宙的星星還多得多。",
    source: "亞佛加厥常數計算",
  },
  {
    id: 14,
    prompt: "馬里亞納海溝最深處（挑戰者深淵）大約有多深，以公尺計？",
    answer: 10935, unit: "公尺", category: "地球尺度",
    explanation: "約 10,935 公尺，比聖母峰還高出 2 公里多。若把聖母峰丟進去，峰頂離海面仍有 2 公里深。",
    source: "海洋測深",
  },
  {
    id: 15,
    prompt: "地球的年齡大約是多少年？",
    answer: 4.54e9, unit: "年", category: "天文距離",
    explanation: "約 45.4 億年，由隕石與地球岩石的鉛同位素定年得出，誤差約 1%。",
    source: "放射性定年",
  },
  {
    id: 16,
    prompt: "撒哈拉沙漠的面積大約是多少平方公里？",
    answer: 9200000, unit: "平方公里", category: "地球尺度",
    explanation: "約 920 萬平方公里，和整個美國面積相當，約是台灣（3.6 萬）的 250 倍。",
    source: "地理統計",
  },
  {
    id: 17,
    prompt: "從台北到東京的直線距離大約是多少公里？",
    answer: 2100, unit: "公里", category: "生活密度",
    explanation: "直線約 2,100 公里，搭飛機約 3 小時。比直覺想的遠——東京其實沒那麼近。",
    source: "大圓距離計算",
  },
  {
    id: 18,
    prompt: "一隻家貓平均一天大約睡多少小時？",
    answer: 15, unit: "小時", category: "自然萬象",
    explanation: "平均 12–16 小時，幼貓與老貓更多。貓是『兼職掠食者』，沒事就省電待機。",
    source: "動物行為學",
  },
];

/* ── localStorage 存取（估算紀錄） ───────────────────── */
function loadAttempts(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function saveAttempts(attempts){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
  } catch (e) {
    /* 隱私模式等情況下寫入失敗，僅影響紀錄保存，不中斷遊戲 */
  }
}
function nowISO(){
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
         `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ── 出題與判定（原後端邏輯的前端等價版） ───────────── */
function pickQuestion(exclude){
  const candidates = QUESTIONS.filter((q) => q.id !== exclude);
  const pool = candidates.length ? candidates : QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 依『差幾倍』回傳評語。費米估算的金標準是『落在一個數量級內』。
function verdictFor(ratio){
  if (ratio < 2)   return ["神準", "🎯"];
  if (ratio < 4)   return ["非常接近", "✨"];
  if (ratio < 10)  return ["同個數量級，漂亮", "👍"];
  if (ratio < 100) return ["差了一兩個數量級", "🤔"];
  return ["差距不小，再想想", "🌀"];
}

function judgeGuess(q, guess){
  if (guess <= 0) guess = 1e-12;   // 防呆，避免 log 爆掉

  const answer = q.answer;
  const ratio = Math.max(guess / answer, answer / guess);
  const logError = Math.abs(Math.log10(guess / answer));
  const withinOrder = ratio < 10 ? 1 : 0;
  const [verdict, emoji] = verdictFor(ratio);

  const attempts = loadAttempts();
  attempts.push({
    question_id: q.id, guess, answer,
    log_error: logError, within_order: withinOrder,
    created_at: nowISO(),
  });
  saveAttempts(attempts);

  return {
    id: q.id, prompt: q.prompt, unit: q.unit,
    answer, guess,
    ratio, orders: Math.round(logError * 100) / 100,
    within_order: withinOrder, verdict, emoji,
    explanation: q.explanation, source: q.source,
  };
}

function computeStats(){
  const attempts = loadAttempts();
  const total = attempts.length;
  if (total === 0){
    return {
      total: 0, hit_rate: 0, avg_log_error: 0,
      current_streak: 0, best_streak: 0, recent: [],
    };
  }

  const hits = attempts.reduce((s, a) => s + (a.within_order ? 1 : 0), 0);
  const hitRate = Math.round(100 * hits / total);
  const avgLogError = Math.round(
    attempts.reduce((s, a) => s + a.log_error, 0) / total * 100
  ) / 100;

  let best = 0, cur = 0;
  for (const a of attempts){
    if (a.within_order){
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }

  const byId = {};
  for (const q of QUESTIONS) byId[q.id] = q;
  const recent = attempts.slice(-10).map((a) => {
    const q = byId[a.question_id] || {};
    return {
      prompt: q.prompt || "（題目已不存在）",
      guess: a.guess, answer: a.answer,
      within_order: a.within_order,
      log_error: Math.round(a.log_error * 100) / 100,
      unit: q.unit || "",
    };
  }).reverse();

  return {
    total, hit_rate: hitRate, avg_log_error: avgLogError,
    current_streak: cur, best_streak: best, recent,
  };
}

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

/* ── 紙片彩帶（費米撒紙片！）── canvas / rAF ──────── */
const FX_COLORS = ["#fffdf6", "#f6f1e4", "#d9952f", "#3a6ea5", "#b1442f", "#5a7d4f"];
let fxParts = [];
let fxRaf = null;
let fxLast = 0;

function fxCtx(){
  const c = $("fxCanvas");
  if (!c) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (c.width !== w || c.height !== h){ c.width = w; c.height = h; }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function fxBurst(x, y, count){
  if (reducedMotion) return;
  for (let i = 0; i < count; i++){
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.0;
    const spd = 200 + Math.random() * 360;
    fxParts.push({
      x, y,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 10,
      w: 5 + Math.random() * 7, h: 8 + Math.random() * 10,
      color: FX_COLORS[(Math.random() * FX_COLORS.length) | 0],
      life: 0, ttl: 1.2 + Math.random() * 0.7,
      sway: 2 + Math.random() * 3, phase: Math.random() * Math.PI * 2,
    });
  }
  if (!fxRaf && !document.hidden){
    fxLast = performance.now();
    fxRaf = requestAnimationFrame(fxTick);
  }
}

function fxTick(now){
  fxRaf = null;
  const dt = Math.min(0.05, (now - fxLast) / 1000);
  fxLast = now;
  const ctx = fxCtx();
  if (!ctx){ fxParts = []; return; }
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  const g = 620;
  fxParts = fxParts.filter((p) => {
    p.life += dt;
    if (p.life > p.ttl) return false;
    p.vy += g * dt;
    p.vx *= (1 - 1.5 * dt);
    p.x += (p.vx + Math.sin(p.life * p.sway * 4 + p.phase) * 26) * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.y > window.innerHeight + 40) return false;

    const fade = Math.max(0, Math.min(1, (p.ttl - p.life) / 0.45));
    const flip = Math.abs(Math.cos(p.life * 6 + p.phase)) * 0.7 + 0.3; // 翻飛感
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h * flip / 2, p.w, p.h * flip);
    ctx.restore();
    return true;
  });

  if (fxParts.length && !document.hidden){
    fxRaf = requestAnimationFrame(fxTick);
  } else if (!fxParts.length){
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

function fxStop(){
  fxParts = [];
  if (fxRaf){ cancelAnimationFrame(fxRaf); fxRaf = null; }
  const c = $("fxCanvas");
  if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

// 分頁隱藏時暫停 rAF 迴圈，回來再續跑
document.addEventListener("visibilitychange", () => {
  if (document.hidden){
    if (fxRaf){ cancelAnimationFrame(fxRaf); fxRaf = null; }
  } else if (fxParts.length && !fxRaf && !reducedMotion){
    fxLast = performance.now();
    fxRaf = requestAnimationFrame(fxTick);
  }
});

/* ── 動畫小工具 ─────────────────────────────────── */
// 數字滾動（reduced-motion 時直接落定）
function animateNumber(el, from, to, fmt, dur){
  if (reducedMotion || !isFinite(from) || from === to){
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  function step(now){
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  }
  requestAnimationFrame(step);
}
// 彈一下（重新觸發 CSS 動畫）
function pulse(el){
  if (reducedMotion) return;
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
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
  $("exponent").setAttribute("aria-valuetext", `10 的 ${e} 次方`);
  $("readoutSci").innerHTML = displayMain(g);
  $("readoutUnit").textContent = currentQ ? currentQ.unit : "";
  const cn = fmtCN(g);
  $("readoutCN").textContent = cn ? `約 ${cn}` : (g >= 1e20 ? "（天文數字！）" : "");
  if (lastExp !== null && e !== lastExp) pulse($("readoutSci"));
  lastExp = e;
}
// rAF 節流：滑桿快速拖動時每幀最多更新一次
let readoutRaf = null;
function scheduleReadout(){
  if (readoutRaf) return;
  readoutRaf = requestAnimationFrame(() => {
    readoutRaf = null;
    updateReadout();
  });
}

/* ── 載入題目 ─────────────────────────────────────── */
function loadQuestion(exclude){
  const q = pickQuestion(exclude);
  currentQ = q;
  answered = false;

  $("catChip").textContent = q.category;
  $("qCounter").textContent = `題庫共 ${QUESTIONS.length} 題`;
  $("questionText").textContent = q.prompt;

  // 重置估計器
  $("mantissa").value = 1;
  $("exponent").value = 4;
  $("resultBox").hidden = true;
  $("estimator").style.display = "";
  $("revealBtn").disabled = false;
  lastExp = null;
  updateReadout();
}

// 「下一張餐巾紙」：舊卡滑出、新卡滑入
function nextQuestion(){
  if (!answered || swapping) return;
  if (reducedMotion){
    loadQuestion(currentQ ? currentQ.id : null);
    return;
  }
  swapping = true;
  const inner = $("cardInner");
  inner.classList.add("swap-out");
  setTimeout(() => {
    loadQuestion(currentQ ? currentQ.id : null);
    inner.classList.remove("swap-out");
    inner.classList.add("swap-in");
    setTimeout(() => {
      inner.classList.remove("swap-in");
      swapping = false;
    }, 430);
  }, 220);
}

/* ── 揭曉答案 ─────────────────────────────────────── */
function reveal(){
  if (!currentQ || answered) return;
  answered = true;
  $("revealBtn").disabled = true;

  const guess = currentGuess();
  const d = judgeGuess(currentQ, guess);
  renderResult(d);
  loadStats(true);
}

function renderResult(d){
  $("estimator").style.display = "none";
  const box = $("resultBox");
  box.hidden = false;

  // 評語（蓋章）
  const v = $("verdict");
  v.className = "verdict " + (d.within_order ? "good" : (d.ratio < 100 ? "mid" : "bad"));
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

  // 命中：像費米一樣撒紙片慶祝！
  if (d.within_order && !reducedMotion){
    setTimeout(() => {
      const r = $("verdict").getBoundingClientRect();
      fxBurst(r.left + r.width / 2, r.top + r.height / 2, d.ratio < 2 ? 96 : 60);
    }, 320);
  }
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
function loadStats(animate){
  const s = computeStats();
  const prev = prevStats;

  if (s.total === 0){
    $("stTotal").textContent  = "0";
    $("stHit").textContent    = "—";
    $("stErr").textContent    = "—";
    $("stStreak").textContent = "0 / 0";
  } else {
    const round2 = (v) => String(Math.round(v * 100) / 100);
    animateNumber($("stTotal"), prev ? prev.total : 0, s.total,
      (v) => String(Math.round(v)), 500);
    animateNumber($("stHit"), (prev && prev.total) ? prev.hit_rate : 0, s.hit_rate,
      (v) => Math.round(v) + "%", 600);
    animateNumber($("stErr"), (prev && prev.total) ? prev.avg_log_error : 0, s.avg_log_error,
      round2, 600);
    $("stStreak").textContent = `${s.current_streak} / ${s.best_streak}`;
    if (animate) pulse($("stStreak"));
  }

  const list = $("recentList");
  if (!s.recent.length){
    list.innerHTML = `<li class="recent-empty">還沒有紀錄，先估一題看看吧。</li>`;
  } else {
    list.innerHTML = s.recent.map(it => {
      const mark = it.within_order
        ? `<span class="r-mark hit">✓</span>`
        : `<span class="r-mark miss">✕</span>`;
      return `<li>${mark}<span class="r-prompt">${it.prompt}</span>` +
             `<span class="r-err">差 ${it.log_error} 級</span></li>`;
    }).join("");
    if (animate && !reducedMotion && list.firstElementChild){
      list.firstElementChild.classList.add("fresh");
    }
  }

  prevStats = s;
}

function resetStats(){
  if (!confirm("確定要清除所有估算紀錄嗎？")) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* 忽略 */ }
  prevStats = null;
  loadStats(false);
}

/* ── 綁定事件 ─────────────────────────────────────── */
function bind(){
  $("mantissa").addEventListener("input", scheduleReadout);
  $("exponent").addEventListener("input", scheduleReadout);
  $("revealBtn").addEventListener("click", reveal);
  $("nextBtn").addEventListener("click", nextQuestion);
  $("resetBtn").addEventListener("click", resetStats);
  $("aboutToggle").addEventListener("click", () => {
    const box = $("aboutBox");
    box.hidden = !box.hidden;
    const btn = $("aboutToggle");
    btn.innerHTML = box.hidden ? "什麼是費米估算？ ↓" : "收合說明 ↑";
    btn.setAttribute("aria-expanded", box.hidden ? "false" : "true");
  });

  // 鍵盤流：Enter 揭曉 / 下一題（按鈕與連結交給原生行為，避免重複觸發）
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const t = e.target;
    if (t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
    if (!answered) reveal();
    else nextQuestion();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  bind();
  loadQuestion();
  loadStats(false);
});

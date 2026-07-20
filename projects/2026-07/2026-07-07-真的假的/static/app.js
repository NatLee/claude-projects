/* ============================================================
   真偽鑑定所 — 前端邏輯（純靜態版・工藝重整）
   題庫與判定、抽題、統計邏輯皆在前端完成，
   作答紀錄存於瀏覽器 localStorage（key 前綴 truefalse.）。
   —— 核心資料與判定邏輯保持不變；本版新增進場、蓋印濺墨、
      數字滾動、氛圍浮塵等動畫（僅用 transform/opacity，rAF 節流，
      分頁隱藏或 prefers-reduced-motion 時完整降級）。
   ============================================================ */
"use strict";

const $ = (id) => document.getElementById(id);

/* ---------- localStorage ---------- */
const STORE_KEY = "truefalse.answers";   // 作答紀錄（陣列）

function loadAnswers(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    return [];
  }
}
function saveAnswers(arr){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(arr)); }catch(e){}
}

/* ---------------------------------------------------------------------------
   題庫：每則皆經查證。verdict = 1 表示「敘述為真」，0 表示「敘述為假（迷思）」。
   --------------------------------------------------------------------------- */
const FACTS = [
  // ---------- 為真的敘述 ----------
  {
    id: 1,
    claim: "章魚有三顆心臟，而且血液是藍色的。",
    verdict: 1, category: "動物",
    explanation: "真的。章魚用含「銅」的血青蛋白（hemocyanin）運送氧氣，氧合時呈藍色；三顆心臟中，兩顆負責把血液送過鰓部充氧，另一顆再把血送往全身。",
    source: "Smithsonian Magazine",
    source_url: "https://www.smithsonianmag.com/science-nature/ten-wild-facts-about-octopuses-they-have-three-hearts-big-brains-and-blue-blood-7625828/",
  },
  {
    id: 2,
    claim: "世界上有一種動物，會拉出方塊狀的大便。",
    verdict: 1, category: "動物",
    explanation: "真的，就是澳洲的袋熊（wombat）。牠腸道末段肌肉軟硬交錯，蠕動時把糞便擠壓成立方體，方便堆在石頭上做記號而不會滾走——這項研究還拿下 2019 年搞笑諾貝爾獎。",
    source: "Science (AAAS)",
    source_url: "https://www.science.org/content/article/wombats-make-cube-shaped-poop-thanks-unique-intestines",
  },
  {
    id: 3,
    claim: "海獺睡覺時會手牽手，免得漂散走失。",
    verdict: 1, category: "動物",
    explanation: "真的。海獺仰躺在水面成群休息（稱為 raft），會互相牽手或裹上海帶固定位置，以免睡著後被水流沖散。",
    source: "Discover Magazine",
    source_url: "https://www.discovermagazine.com/sea-otters-hold-hands-while-sleeping-and-they-even-cuddle-46115",
  },
  {
    id: 4,
    claim: "考古學家在三千多年前的古埃及墓裡找到的蜂蜜，至今仍然可以吃。",
    verdict: 1, category: "食物",
    explanation: "真的。蜂蜜含水量極低、糖分極高又偏酸，還含微量過氧化氫，細菌與黴菌幾乎無法存活，因此密封良好可保存數千年不壞。",
    source: "History Facts",
    source_url: "https://historyfacts.com/world-history/fact/archaeologists-have-found-3000-year-old-pots-of-honey-that-are-still-edible/",
  },
  {
    id: 5,
    claim: "太空是有「味道」的——太空人形容像燒焦的牛排、灼熱金屬與焊接的煙味。",
    verdict: 1, category: "太空",
    explanation: "真的。太空人結束太空漫步、回到艙內脫下頭盔時，會聞到殘留在裝備上的特殊氣味，多形容為煎牛排、熱金屬與焊接煙味，可能來自附著的原子氧等粒子。",
    source: "The Christian Science Monitor",
    source_url: "https://www.csmonitor.com/Science/2012/0723/Space-smells-like-seared-steak-hot-metal-astronauts-report",
  },
  {
    id: 6,
    claim: "艾菲爾鐵塔在炎熱的夏天，會比冬天「長高」大約 15 公分。",
    verdict: 1, category: "建築",
    explanation: "真的。鐵受熱會膨脹，這座 300 多公尺高的鐵塔在盛夏與寒冬之間，高度大約會差 15 公分左右。",
    source: "Snopes",
    source_url: "https://www.snopes.com/fact-check/eiffel-tower-grows-summer-shrinks-winter/",
  },
  {
    id: 7,
    claim: "史上最短的戰爭，前後只打了大約 38 分鐘。",
    verdict: 1, category: "歷史",
    explanation: "真的。1896 年的「英桑戰爭」（英國對尚吉巴）大約 38 至 45 分鐘就結束，是有紀錄以來最短的戰爭。",
    source: "Britannica",
    source_url: "https://www.britannica.com/event/Anglo-Zanzibar-War",
  },
  {
    id: 8,
    claim: "在植物學上，香蕉算是「漿果（berry）」，草莓反而不算。",
    verdict: 1, category: "植物",
    explanation: "真的。植物學定義的漿果，是由單一子房發育、種子包在果肉裡；香蕉符合，草莓卻是由花托膨大而成的「聚合果」，所以不算漿果。",
    source: "Live Science",
    source_url: "https://www.livescience.com/57477-why-are-bananas-considered-berries.html",
  },
  {
    id: 9,
    claim: "埃及豔后活著的年代，離人類登月比離金字塔落成還要近。",
    verdict: 1, category: "歷史",
    explanation: "真的。吉薩大金字塔約在公元前 2560 年完工，埃及豔后（克麗奧佩脫拉）生於公元前 69 年，相隔約 2500 年；而她距離 1969 年登月只約 2000 年。金字塔對她而言早已是「古蹟」。",
    source: "WorldAtlas",
    source_url: "https://www.worldatlas.com/articles/so-cleopatra-lived-closer-in-time-to-the-first-lunar-landing-than-the-great-pyramids.html",
  },
  // ---------- 為假（迷思）的敘述 ----------
  {
    id: 10,
    claim: "萬里長城是太空中唯一用肉眼就能看見的人造建築。",
    verdict: 0, category: "太空",
    explanation: "假的。NASA 與多位太空人（包括中國首位太空人楊利偉）都證實，在近地軌道用肉眼根本看不到長城——它雖長，最寬處也只有約 9 公尺，且顏色和周遭地表相近。",
    source: "NASA",
    source_url: "https://www.nasa.gov/image-article/great-wall/",
  },
  {
    id: 11,
    claim: "鬥牛時，公牛是被那塊布的「紅色」激怒，才會衝過去。",
    verdict: 0, category: "動物",
    explanation: "假的。牛其實是紅綠色盲，看不太出紅色；真正激怒牠、引牠衝刺的是布的「揮動」。《流言終結者》實驗也證實：換成藍色、白色的布照樣衝。",
    source: "Snopes",
    source_url: "https://www.snopes.com/fact-check/red-triggers-bulls/",
  },
  {
    id: 12,
    claim: "拿破崙是個異常矮小的人。",
    verdict: 0, category: "歷史",
    explanation: "假的。拿破崙身高約 168–170 公分，在當時的法國男性中屬中等甚至略高。「矮個子」印象來自英國諷刺漫畫的醜化，以及法制與英制「吋」換算的誤差。",
    source: "Britannica",
    source_url: "https://www.britannica.com/story/was-napoleon-short",
  },
  {
    id: 13,
    claim: "人類終其一生，其實只用到大腦的 10%。",
    verdict: 0, category: "人體",
    explanation: "假的。fMRI、PET 等腦造影顯示，我們幾乎用到大腦的每一個部位，連睡覺時大腦也在全區運作。大腦只占體重約 2%，卻耗掉約 20% 的能量，不可能大半閒置。",
    source: "Scientific American",
    source_url: "https://www.scientificamerican.com/article/do-people-only-use-10-percent-of-their-brains/",
  },
  {
    id: 14,
    claim: "金魚的記憶只有短短 3 秒。",
    verdict: 0, category: "動物",
    explanation: "假的。研究顯示金魚的記憶至少可維持好幾個月，能被訓練走迷宮、認得餵食的主人，甚至會看時間。3 秒記憶純屬都市傳說。",
    source: "Live Science",
    source_url: "https://www.livescience.com/goldfish-memory.html",
  },
  {
    id: 15,
    claim: "舌頭有分區的「味覺地圖」：舌尖嚐甜、兩側嚐酸、舌根嚐苦。",
    verdict: 0, category: "人體",
    explanation: "假的。整條舌頭其實都能嚐到各種基本味覺。這張「味覺地圖」源自 1901 年一份德國研究被後人誤讀、誇大成分區圖，早已被推翻。",
    source: "Smithsonian Magazine",
    source_url: "https://www.smithsonianmag.com/science-nature/neat-and-tidy-map-tastes-tongue-you-learned-school-all-wrong-180963407/",
  },
  {
    id: 16,
    claim: "維京人打仗時，頭上戴著有角的頭盔。",
    verdict: 0, category: "歷史",
    explanation: "假的。考古上找不到維京人戴角盔的證據。這個經典形象其實出自 1876 年華格納歌劇《尼伯龍根的指環》的服裝設計，之後才被畫進各種插畫流傳開來。",
    source: "History.com",
    source_url: "https://www.history.com/articles/did-vikings-really-wear-horned-helmets",
  },
  {
    id: 17,
    claim: "閃電不會打在同一個地方兩次。",
    verdict: 0, category: "自然",
    explanation: "假的。閃電偏好又高又尖又突出的目標，很常重複打在同一處。光是紐約帝國大廈，平均一年就被雷擊中約 20–25 次。",
    source: "美國國家氣象局（NWS）",
    source_url: "https://www.weather.gov/safety/lightning-myths",
  },
  {
    id: 18,
    claim: "蝙蝠是瞎子，什麼都看不見。",
    verdict: 0, category: "動物",
    explanation: "假的。所有蝙蝠都看得見，有些種類視力還相當好；牠們在黑暗中主要靠「回聲定位」導航，但那是聽覺的本事，不代表眼睛看不到。",
    source: "Britannica",
    source_url: "https://www.britannica.com/story/are-bats-really-blind",
  },
];

const FACT_BY_ID = {};
FACTS.forEach((f) => { FACT_BY_ID[f.id] = f; });

/* ---------- 時間（台灣時區 ISO 字串，等同原後端格式） ---------- */
function nowTaiwanISO(){
  const now = new Date();
  const tw = new Date(now.getTime() + (now.getTimezoneOffset() + 8 * 60) * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return tw.getFullYear() + "-" + p(tw.getMonth() + 1) + "-" + p(tw.getDate()) +
         "T" + p(tw.getHours()) + ":" + p(tw.getMinutes()) + ":" + p(tw.getSeconds()) + "+08:00";
}

/* ---------- 統計（等同原後端 compute_stats） ---------- */
function computeStats(answers){
  const total = answers.length;
  let correct = 0;
  answers.forEach((a) => { correct += a.correct ? 1 : 0; });

  // 連勝：最佳連勝、目前連勝（尾端連續答對）
  let bestStreak = 0, run = 0;
  for (const a of answers){
    if (a.correct){ run += 1; if (run > bestStreak) bestStreak = run; }
    else { run = 0; }
  }
  let currentStreak = 0;
  for (let i = answers.length - 1; i >= 0; i--){
    if (answers[i].correct) currentStreak += 1;
    else break;
  }

  // 各類別（依作答出現順序建立，再依作答數由多到少排序）
  const cats = new Map();
  for (const a of answers){
    const f = FACT_BY_ID[a.fact_id];
    if (!f) continue;
    if (!cats.has(f.category)) cats.set(f.category, { total: 0, correct: 0 });
    const c = cats.get(f.category);
    c.total += 1;
    c.correct += a.correct ? 1 : 0;
  }
  const categoryStats = [];
  cats.forEach((d, name) => {
    const acc = d.total ? Math.round(d.correct / d.total * 100) : 0;
    categoryStats.push({ category: name, total: d.total, correct: d.correct, accuracy: acc });
  });
  categoryStats.sort((a, b) => b.total - a.total);   // 穩定排序，平手維持出現順序

  // 「最容易被騙」的類別：作答數 >= 2 且答對率最低者
  let fooled = null;
  const candidates = categoryStats.filter((c) => c.total >= 2);
  if (candidates.length){
    let worst = candidates[0];
    for (const c of candidates){
      if (c.accuracy < worst.accuracy ||
          (c.accuracy === worst.accuracy && c.total > worst.total)){
        worst = c;
      }
    }
    if (worst.accuracy < 100) fooled = worst.category;
  }

  const seen = new Set();
  answers.forEach((a) => seen.add(a.fact_id));

  return {
    total: total,
    correct: correct,
    accuracy: total ? Math.round(correct / total * 100) : 0,
    current_streak: currentStreak,
    best_streak: bestStreak,
    category_stats: categoryStats,
    most_fooled: fooled,
    total_facts: FACTS.length,
    seen_facts: seen.size,
  };
}

/* ---------- 抽題（等同原後端抽題邏輯）----------
   優先給作答次數最少的題目，並避開上一題（除非只剩它）。 */
function pickQuestion(excludeId){
  const answers = loadAnswers();
  const counts = {};
  answers.forEach((a) => { counts[a.fact_id] = (counts[a.fact_id] || 0) + 1; });

  let pool = FACTS.filter((f) => f.id !== excludeId);
  if (!pool.length) pool = FACTS.slice();

  let minCount = Infinity;
  pool.forEach((f) => { const c = counts[f.id] || 0; if (c < minCount) minCount = c; });
  const least = pool.filter((f) => (counts[f.id] || 0) === minCount);
  const f = least[Math.floor(Math.random() * least.length)];
  return { id: f.id, claim: f.claim, category: f.category };
}

/* ---------- 作答（等同原後端判定邏輯） ---------- */
function recordAnswer(factId, guess){
  const fact = FACT_BY_ID[factId];
  if (!fact) return null;
  const g = (guess === 1 || guess === true) ? 1 : 0;
  const correct = (g === fact.verdict) ? 1 : 0;

  const answers = loadAnswers();
  answers.push({ fact_id: factId, guess: g, correct: correct, created_at: nowTaiwanISO() });
  saveAnswers(answers);

  return {
    correct: !!correct,
    verdict: fact.verdict,          // 1=真, 0=假
    your_guess: g,
    claim: fact.claim,
    category: fact.category,
    explanation: fact.explanation,
    source: fact.source,
    source_url: fact.source_url,
    stats: computeStats(answers),
  };
}

/* ============================================================
   以下為呈現層與動畫（不影響上方任何資料 / 判定 / 統計邏輯）
   ============================================================ */

/* ---------- 減少動態偏好（動態監聽，完整降級） ---------- */
const motionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduceMotion = motionMQ.matches;
function onMotionChange(){
  reduceMotion = motionMQ.matches;
  if (reduceMotion){ ambient.stop(); }
  else if (!document.hidden){ ambient.start(); }
}
if (motionMQ.addEventListener) motionMQ.addEventListener("change", onMotionChange);
else if (motionMQ.addListener) motionMQ.addListener(onMotionChange);

/* ---------- 環境浮塵 canvas（低調氛圍，分頁隱藏即暫停） ---------- */
const ambient = (function(){
  const cv = $("ambient");
  const ctx = cv ? cv.getContext("2d") : null;
  let W = 0, H = 0, dpr = 1, raf = 0, running = false, motes = [];

  function size(){
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function seed(){
    const n = Math.round(Math.min(46, Math.max(20, (W * H) / 42000)));
    motes = [];
    for (let i = 0; i < n; i++){
      const dark = Math.random() < 0.35;
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.8 + Math.random() * 2.4,
        vy: -(0.05 + Math.random() * 0.16),
        drift: 0.2 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2,
        a: (dark ? 0.05 : 0.09) + Math.random() * 0.05,
        dark: dark,
      });
    }
  }
  let t = 0;
  function frame(){
    if (!running) return;
    t += 0.006;
    ctx.clearRect(0, 0, W, H);
    for (const m of motes){
      m.y += m.vy;
      const x = m.x + Math.sin(t + m.ph) * m.drift * 6;
      if (m.y < -8){ m.y = H + 8; m.x = Math.random() * W; }
      ctx.beginPath();
      ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = m.dark
        ? "rgba(70,54,34," + m.a + ")"
        : "rgba(255,250,235," + m.a + ")";
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  function start(){
    if (!ctx || running || reduceMotion) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop(){
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function init(){
    if (!ctx) return;
    size(); seed();
    if (!reduceMotion && !document.hidden) start();
  }
  let rt = 0;
  window.addEventListener("resize", function(){
    clearTimeout(rt);
    rt = setTimeout(function(){ size(); seed(); }, 160);
  });
  return { init: init, start: start, stop: stop };
})();

document.addEventListener("visibilitychange", function(){
  if (document.hidden){ ambient.stop(); ink.stop(); }
  else { ambient.start(); }
});

/* ---------- 蓋印濺墨 canvas（一次性爆發；分頁隱藏或減少動態則跳過） ---------- */
const ink = (function(){
  const card = $("card");
  const cv = $("ink");
  const ctx = cv ? cv.getContext("2d") : null;
  let dpr = 1, raf = 0, running = false, parts = [], cx = 0, cy = 0;

  function size(){
    if (!cv || !card) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = card.clientWidth, h = card.clientHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w * 0.5; cy = h * 0.34;   // 對齊朱印中心
  }
  function frame(){
    if (!running) return;
    const w = cv.width / dpr, h = cv.height / dpr;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of parts){
      if (p.life <= 0) continue;
      alive++;
      p.life -= 0.018;
      p.vy += 0.14;            // 微重力
      p.vx *= 0.985;
      p.x += p.vx; p.y += p.vy;
      const a = Math.max(0, p.life) * p.a0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * Math.max(0.2, p.life), 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace("A", a.toFixed(3));
      ctx.fill();
    }
    if (alive > 0){ raf = requestAnimationFrame(frame); }
    else { stop(); ctx.clearRect(0, 0, w, h); }
  }
  function burst(isGreen){
    if (!ctx || reduceMotion || document.hidden) return;
    size();
    const base = isGreen ? "rgba(63,125,84,A)" : "rgba(181,52,42,A)";
    const n = 26;
    parts = [];
    for (let i = 0; i < n; i++){
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = 2.4 + Math.random() * 4.6;
      parts.push({
        x: cx, y: cy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.2,
        r: 1.5 + Math.random() * 4.5,
        life: 0.75 + Math.random() * 0.4,
        a0: 0.5 + Math.random() * 0.35,
        color: base,
      });
    }
    if (!running){ running = true; raf = requestAnimationFrame(frame); }
  }
  function stop(){
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  return { burst: burst, stop: stop };
})();

/* ---------- 數字滾動（rAF；減少動態時直接設值） ---------- */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function countTo(el, to, opts){
  opts = opts || {};
  const suffix = opts.suffix || "";
  const dur = opts.dur || 650;
  const from = Number(el.dataset.v || 0);
  el.dataset.v = String(to);
  if (reduceMotion || !opts.animate || from === to){
    el.textContent = to + suffix;
    return;
  }
  const t0 = performance.now();
  function step(now){
    const p = Math.min(1, (now - t0) / dur);
    const v = Math.round(from + (to - from) * easeOutCubic(p));
    el.textContent = v + suffix;
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = to + suffix;
  }
  requestAnimationFrame(step);
}
function flashStat(el){
  if (reduceMotion) return;
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

/* ---------- 遊戲狀態 ---------- */
let current = null;     // 目前題目 {id, claim, category}
let lastId = -1;        // 上一題 id，抽題時避開
let caseCount = 0;      // 已處理案件數（用於案號）
let locked = false;     // 揭曉後鎖住按鈕

const pad3 = (n) => String(n).padStart(3, "0");

/* ---------- 抽題（畫面） ---------- */
function loadQuestion(){
  locked = false;
  // 收起揭曉區、重置印章
  $("reveal").hidden = true;
  const stamp = $("stamp");
  stamp.className = "stamp";
  // 重新啟用按鈕
  $("btnTrue").disabled = false;
  $("btnFalse").disabled = false;
  $("verdictButtons").style.display = "grid";

  const q = pickQuestion(lastId);
  current = q;
  caseCount += 1;
  $("caseNo").textContent = "第 " + pad3(caseCount) + " 號案件";
  $("categoryTag").textContent = q.category;
  $("claim").textContent = q.claim;

  // 「發牌／翻卡」進場（純 transform/opacity；減少動態自動略過）
  if (!reduceMotion){
    const claim = $("claim");
    const head = $("cardHead");
    claim.classList.remove("deal"); head.classList.remove("deal");
    void claim.offsetWidth;
    claim.classList.add("deal"); head.classList.add("deal");
  }
}

/* ---------- 送出判斷 ---------- */
function submitGuess(guess){
  if (locked || !current) return;
  locked = true;
  $("btnTrue").disabled = true;
  $("btnFalse").disabled = true;

  const res = recordAnswer(current.id, guess);
  if (!res){
    locked = false;
    $("btnTrue").disabled = false;
    $("btnFalse").disabled = false;
    return;
  }
  lastId = current.id;

  const isGreen = res.verdict === 1;

  // 蓋下朱印（顯示「正解」：真=綠印，假=朱印）
  const stamp = $("stamp");
  $("stampChar").textContent = isGreen ? "真" : "假";
  stamp.className = "stamp show" + (isGreen ? " green" : "");

  // 蓋印落下的瞬間：濺墨 + 卡片受擊震動（「哇」時刻）
  if (!reduceMotion){
    setTimeout(function(){
      ink.burst(isGreen);
      const card = $("card");
      card.classList.remove("impact");
      void card.offsetWidth;
      card.classList.add("impact");
    }, 300);
  }

  // 收起判斷鈕
  $("verdictButtons").style.display = "none";

  // 揭曉內容
  const banner = $("revealBanner");
  if (res.correct){
    banner.textContent = "✓ 鑑定正確";
    banner.className = "reveal-banner ok";
  } else {
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

/* ---------- 統計（畫面） ---------- */
function renderStats(s, flash){
  const total = Number(s.total) || 0;

  countTo($("statStreak"), s.current_streak, { animate: flash });
  countTo($("statSeen"), s.seen_facts, { animate: flash });
  $("statTotal").textContent = "/" + s.total_facts;

  const accEl = $("statAcc");
  if (total){
    countTo(accEl, s.accuracy, { animate: flash, suffix: "%" });
  } else {
    accEl.dataset.v = "0";
    accEl.textContent = "—";
  }
  countTo($("statBest"), s.best_streak, { animate: flash });

  if (flash){
    flashStat($("statStreak"));
    flashStat($("statSeen"));
    if (total) flashStat(accEl);
    flashStat($("statBest"));
  }

  // 檔案面板
  renderDossier(s);
}

function renderDossier(s){
  const insight = $("insight");
  if (s.total === 0){
    insight.innerHTML = "先鑑定幾件，這裡會分析你最容易被哪一類冷知識騙倒。";
  } else if (s.most_fooled){
    insight.innerHTML = "目前你最容易在 <b>「" + s.most_fooled +
      "」</b> 類看走眼——這一類的謠言特別會騙人，多留意！";
  } else {
    insight.innerHTML = "目前為止火眼金睛，各類都沒被騙倒，繼續保持！";
  }

  const bars = $("catBars");
  bars.innerHTML = "";
  const fills = [];
  s.category_stats.forEach((c) => {
    const row = document.createElement("div");
    row.className = "cat-row";
    const fillW = Math.max(0, Math.min(100, c.accuracy));
    row.innerHTML =
      '<span class="cat-name">' + c.category + '</span>' +
      '<span class="cat-track"><span class="cat-fill" data-w="' + fillW + '"></span></span>' +
      '<span class="cat-val">' + c.correct + '/' + c.total + '（' + c.accuracy + '%）</span>';
    bars.appendChild(row);
    fills.push(row.querySelector(".cat-fill"));
  });
  // 長條由左展開（transform:scaleX；減少動態則直接到位）
  const apply = () => fills.forEach((f) => {
    f.style.transform = "scaleX(" + (Number(f.dataset.w) / 100) + ")";
  });
  if (reduceMotion){ apply(); }
  else { requestAnimationFrame(() => requestAnimationFrame(apply)); }
}

function refreshStats(){
  renderStats(computeStats(loadAnswers()), false);
}

/* ---------- 事件 ---------- */
$("btnTrue").addEventListener("click", () => submitGuess(1));
$("btnFalse").addEventListener("click", () => submitGuess(0));
$("btnNext").addEventListener("click", loadQuestion);

$("dossierToggle").addEventListener("click", function(){
  const body = $("dossierBody");
  const open = body.hidden;              // 即將展開？
  body.hidden = !open;
  this.setAttribute("aria-expanded", open ? "true" : "false");
});

$("btnReset").addEventListener("click", () => {
  saveAnswers([]);                 // 清空作答紀錄（保留題庫）
  caseCount = 0;
  lastId = -1;
  refreshStats();
  loadQuestion();
});

/* ---------- 啟動 ---------- */
(function init(){
  ambient.init();
  // 招牌一次性反光
  const seal = $("sealLogo");
  if (seal && !reduceMotion){
    setTimeout(function(){ seal.classList.add("sheen"); }, 500);
  }
  // 進場數字由 0 滾動到現況（回訪者可見戰績動起來）
  const s = computeStats(loadAnswers());
  $("statTotal").textContent = "/" + s.total_facts;   // 先定住分母，避免閃動
  if (!reduceMotion && s.total > 0){
    // 首次渲染即以 flash 模式：dataset.v 尚未設定，預設 0 → 滾動至現況
    setTimeout(function(){ renderStats(s, true); }, 260);
  } else {
    renderStats(s, false);
  }
  loadQuestion();
})();

/* ==========================================================================
 * 懸案調查桌 · 2026-07-12
 * 四樁真實謎團：翻證物 → 拉紅線 → 押推論 → 蓋章揭曉。
 * 純靜態、零相依、離線可用；進度存 localStorage（前綴 cold.）。
 * ========================================================================== */

const CASES = [
  {
    id: "celeste",
    no: "CASE 01",
    title: "瑪麗·賽勒斯特號",
    when: "1872 · 北大西洋，亞速群島以東",
    hook: "一艘航行良好的船被人發現獨自漂流，帆還張著，食物還在，十個人不見了——包括船長 2 歲的女兒。",
    clues: [
      { g: "⛵", face: "海上的發現", label: "1872/12/5，一艘船獨自漂流",
        text: "1872 年 12 月 5 日，英國雙桅船「德格拉西亞號」在亞速群島以東約 400 英里處，發現瑪麗·賽勒斯特號正獨自漂流——她離開紐約才八天，船況仍可航行。" },
      { g: "👨‍👩‍👧", face: "船上的人", label: "十個人，全數消失",
        text: "船上有 7 名船員、布里格斯船長、他的妻子莎拉，以及兩歲的女兒蘇菲亞。這十個人此後再也沒有被任何人見過。" },
      { g: "🛢️", face: "貨艙清點", label: "1,701 桶酒精幾乎原封不動",
        text: "貨艙裡 1,701 桶工業酒精大致完好，船上還有可吃六個月的糧食與飲水——沒有人動過。船員的私人物品也都留在艙房裡。" },
      { g: "🚣", face: "少了什麼", label: "唯一的救生艇不見了",
        text: "船上唯一的救生艇不翼而飛；船底積了約 3.5 英尺的水，兩具抽水機其中一具被拆開了。海圖散落一地。" },
      { g: "⚖️", face: "法庭紀錄", label: "查不到任何暴力痕跡",
        text: "直布羅陀的海事法庭調查了三個多月，找不到任何暴力、海盜或謀財害命的證據——連一滴可疑的血跡都沒有。" },
    ],
    hypos: [
      { k: "A", t: "海盜洗劫，殺光船上的人" },
      { k: "B", t: "船員自願棄船，登上救生艇後失散" },
      { k: "C", t: "巨大海怪或超自然力量把人帶走" },
    ],
    lead: 1,
    status: "仍未解",
    stamp: "未解",
    color: "var(--thread)",
    verdict:
      "沒有人真的知道。但證據把「暴力」與「海怪」都排除了：貨物、財物、糧食全在，兇殺案不會這樣收場。" +
      "最被接受的推論是船員自己走的——事後清點時，1,701 桶酒精中有 9 桶是空的（那幾桶用的是較易滲漏的紅橡木）。" +
      "外洩的酒精蒸氣很可能讓布里格斯船長誤判船要爆炸，於是全員登上救生艇、用繩子繫在船尾等待；" +
      "繩子斷了，帆船繼續往前跑，小艇留在原地。船活了下來，人沒有。" +
      "順帶一提：把這艘船變成傳說的，是 1884 年一位 25 歲的年輕作者寫的短篇小說——亞瑟·柯南·道爾。",
    src: "來源：Smithsonian Magazine〈Abandoned Ship: The Mary Celeste〉、HISTORY〈What Happened to the Mary Celeste?〉、Wikipedia〈Mary Celeste〉",
  },
  {
    id: "tunguska",
    no: "CASE 02",
    title: "通古斯大爆炸",
    when: "1908 · 西伯利亞，通古斯河上空",
    hook: "有紀錄以來最大的一次撞擊事件，摧毀了一片相當於整個大台北的森林——卻沒有留下任何一個洞。",
    clues: [
      { g: "💥", face: "那個早晨", label: "1908/6/30，天空裂開",
        text: "1908 年 6 月 30 日清晨，西伯利亞通古斯河一帶的上空、約 5～10 公里高處，發生一場巨大爆炸。數百公里外的人都感受到熱浪與衝擊波。" },
      { g: "🌲", face: "災區測量", label: "約 2,150 平方公里森林被夷平",
        text: "約 2,150 平方公里的森林被壓倒，估計 8,000 萬棵樹倒下——而且全部從一個中心點呈放射狀朝外倒，像被踩扁的輪輻。" },
      { g: "🧨", face: "威力估算", label: "相當於高達 1,500 萬噸 TNT",
        text: "能量估計相當於高達 1,500 萬噸 TNT（15 百萬噸級），是人類有紀錄以來最大的撞擊事件。" },
      { g: "🕳️", face: "最怪的地方", label: "一個多世紀，找不到撞擊坑",
        text: "後續一百多年的探勘，從來沒有找到撞擊坑，也沒有大塊的隕石殘骸——這正是所有陰謀論的溫床。" },
      { g: "🌌", face: "遠方的目擊", label: "歐洲夜空連著幾晚亮得反常",
        text: "爆炸後幾個夜晚，遠在歐洲的天空出現異常明亮的夜光雲，亮到有人聲稱能在半夜讀報。" },
    ],
    hypos: [
      { k: "A", t: "隕石直接撞上地面（坑一定在某處，只是還沒找到）" },
      { k: "B", t: "物體根本沒落地，在空中就炸開了" },
      { k: "C", t: "反物質、微型黑洞，或墜毀的外星飛船" },
    ],
    lead: 1,
    status: "已大致破解",
    stamp: "已破解",
    color: "var(--green)",
    verdict:
      "沒有坑，是因為沒有東西撞到地面。今天的共識是「空中爆炸（airburst）」：一顆直徑約 50～100 公尺的石質小行星" +
      "（也有科學家主張是彗星，理由正是那幾夜的夜光雲——彗星帶來的水氣）以極高速衝入大氣，被前方壓縮的空氣硬生生撕碎，" +
      "在數公里高空整個炸開。衝擊波向下擴散，於是森林呈放射狀倒下，地面卻毫髮無傷。" +
      "這件事的真正教訓在後頭：一顆連城市大小都不到的石頭，就能抹掉一片森林——而它 1908 年落在無人的西伯利亞，純屬運氣。",
    src: "來源：Britannica〈Tunguska event〉、Royal Observatory Greenwich、EarthSky、Astronomy.com",
  },
  {
    id: "dyatlov",
    no: "CASE 03",
    title: "迪亞特洛夫山口事件",
    when: "1959 · 蘇聯，北烏拉爾山",
    hook: "九名登山者從內側割開帳篷，衣衫不整地衝進零下的雪夜。六十年來，這被當成怪談——直到 2021 年。",
    clues: [
      { g: "⛺", face: "帳篷", label: "從「內側」被割開",
        text: "1959 年 2 月，九名經驗豐富的蘇聯登山者在北烏拉爾山離奇死亡。搜救隊找到他們的帳篷時，帆布是從內側被割開的——他們是自己急著逃出去的。" },
      { g: "🧦", face: "腳印", label: "有人只穿襪子跑進雪地",
        text: "他們衣衫不整，有人只穿著襪子，在零下的低溫中往下坡的樹林跑了約 1.5 公里——沒有人會在那種夜裡自願這樣做。" },
      { g: "🩻", face: "驗屍報告", label: "胸骨顱骨重創，卻沒有外傷",
        text: "部分遺體有嚴重的胸腔與顱骨骨折，但皮膚上幾乎沒有相應的外部傷口——像是被某種巨大而均勻的壓力壓過。" },
      { g: "📕", face: "官方結論", label: "「一股不可抗拒的自然力量」",
        text: "蘇聯當局結案，死因寫著一句含糊到令人不安的話：一股「不可抗拒的自然力量」。檔案隨即封存，傳說開始生長。" },
      { g: "🔬", face: "2021 年的論文", label: "一種罕見的板狀雪崩",
        text: "2021 年，Gaume 與 Puzrin 在《Communications Earth & Environment》（Nature 集團）發表模型：他們為紮營在坡上切出的平台，加上強烈下坡風持續堆雪，足以觸發一種罕見的小型「板狀雪崩」。" },
      { g: "🏔️", face: "後續驗證", label: "同一片坡上，真的拍到雪崩",
        text: "論文引發的兩次冬季考察，在距當年帳篷不到 3 公里的東坡，實際記錄到多次板狀雪崩——這種坡真的會崩。" },
    ],
    hypos: [
      { k: "A", t: "軍方秘密武器測試，滅口封存" },
      { k: "B", t: "一塊雪板從上方壓下來，人在黑暗中撤離後失溫" },
      { k: "C", t: "雪人、UFO 或某種超自然存在" },
    ],
    lead: 1,
    status: "已有最有力的解釋",
    stamp: "最有力",
    color: "var(--amber)",
    verdict:
      "把怪談拆掉的是物理學。一塊厚實的雪板滑下來壓在躺著的人身上，可以造成胸腔與顱骨骨折卻幾乎不留外傷——" +
      "因為施力是均勻的、隔著睡袋的。之後的一切就順了：他們割開帳篷逃出、在全黑的暴風雪中退往樹林、" +
      "傷者無法行動、其餘的人在零下失溫。那句「不可抗拒的自然力量」，其實寫得沒錯，只是當年沒人算得出來。" +
      "注意：這是目前最有力的解釋，不是法庭級的證明——雪崩論也仍有登山界的質疑者。但它把這件事從超自然，帶回了雪的力學。",
    src: "來源：Gaume & Puzrin,《Communications Earth & Environment》(2021)；ETH Zürich／EPFL 後續考察報告 (2022)；Wikipedia〈Dyatlov Pass incident〉",
  },
  {
    id: "roanoke",
    no: "CASE 04",
    title: "羅阿諾克 · 失落的殖民地",
    when: "1587–1590 · 英屬北美，今北卡羅來納州",
    hook: "一整個村子的人消失了，只在柵欄上留下一個字：CROATOAN。四百年後，泥土開始說話。",
    clues: [
      { g: "🏘️", face: "殖民地", label: "1587 年建村，總督返英補給",
        text: "1587 年，英國人在羅阿諾克島建立殖民地。總督約翰·懷特把包含自己外孫女在內的百餘人留下，回英國補給——卻被戰爭困住了三年。" },
      { g: "🪵", face: "1590 年的歸來", label: "只剩柵欄上刻著 CROATOAN",
        text: "1590 年懷特回來時，村子空無一人，房屋被拆解、東西被收走。柵欄上只刻著一個字：CROATOAN——那是南方一座島的名字，也是島上原住民的名字。" },
      { g: "✝️", face: "沒刻的記號", label: "沒有那個代表「遇難」的十字",
        text: "他們出發前約定好：若是被迫離開且遇上危險，就在字旁加刻一個十字。柵欄上沒有十字。也沒有任何戰鬥或屠殺的痕跡。" },
      { g: "🗡️", face: "哈特拉斯島的土", label: "英式器物與原住民陶器同一層",
        text: "近十餘年在哈特拉斯島（即當年的克羅托安）的挖掘，在同一土層裡挖出英式劍柄殘件、戒指、書寫石板、槍械零件與玻璃，和原住民的陶器、箭頭混在一起。" },
      { g: "⚒️", face: "2025 年的新證物", label: "兩堆打鐵才會留下的鐵鱗",
        text: "2025 年 5 月，考古隊在哈特拉斯島挖出兩堆「鐵鱗」（hammer scale）——只有真的在當地打鐵鍛造，才會留下這種副產品。那不是路過，那是住下來。" },
    ],
    hypos: [
      { k: "A", t: "被原住民或西班牙人屠殺、擄走" },
      { k: "B", t: "他們自己搬去克羅托安，與當地人一起生活下去" },
      { k: "C", t: "整村被超自然力量抹除" },
    ],
    lead: 1,
    status: "越來越像「從來沒有失蹤」",
    stamp: "最有力",
    color: "var(--amber)",
    verdict:
      "最新的證據指向一個並不浪漫、卻更動人的答案：他們沒有消失，他們搬家了。柵欄上的 CROATOAN 不是求救，是留言——" +
      "「我們往那裡去了」。哈特拉斯島的土層裡，英國人的劍與原住民的陶器躺在一起，還有他們親手打鐵的痕跡；" +
      "他們很可能與克羅托安人通婚、融合，在這片土地上活了好幾代。" +
      "仍有學者要求更多證據，也有人主張殖民地曾分成兩批以上、往不同方向散去。" +
      "但「失落的殖民地」這個名字，也許從一開始就取錯了。",
    src: "來源：WHRO (2025/01)〈New artifacts on Hatteras point to the real fate of the Lost Colony〉、Smithsonian Magazine、HISTORY、PBS North Carolina",
  },
];

/* 板上的釘位（%）——證物最多 6 件 */
const SPOTS = [
  { x: 15, y: 17, rot: -2.4 },
  { x: 85, y: 16, rot: 2.1 },
  { x: 12, y: 55, rot: 1.6 },
  { x: 88, y: 54, rot: -1.8 },
  { x: 27, y: 87, rot: -1.2 },
  { x: 72, y: 88, rot: 2.6 },
];

/* 下推論的門檻：至少看過這麼多件證物。
   注意這是「門檻」不是「上限」——每樁案件有 5～6 件證物，想全部翻開都可以。 */
const NEED = 3;

const LS = "cold.progress.v1";
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const mReduced = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => mReduced.matches;

const liveEl = $("live");
function announce(msg) {
  liveEl.textContent = "";
  setTimeout(() => { liveEl.textContent = msg; }, 40);
}

/* ── 狀態 ── */
function blank() {
  const s = {};
  for (const c of CASES) s[c.id] = { seen: [], guess: null, closed: false };
  return s;
}
let state = blank();
try {
  const raw = localStorage.getItem(LS);
  if (raw) {
    const saved = JSON.parse(raw);
    for (const c of CASES) {
      const v = saved && saved[c.id];
      if (v && Array.isArray(v.seen)) {
        state[c.id] = {
          seen: v.seen.filter(i => Number.isInteger(i) && i >= 0 && i < c.clues.length),
          guess: Number.isInteger(v.guess) && v.guess >= 0 && v.guess < c.hypos.length ? v.guess : null,
          closed: !!v.closed,
        };
      }
    }
  }
} catch (e) { state = blank(); }

function save() {
  try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {}
}

let current = 0;

/* ── 頁籤 ── */
function renderTabs() {
  const tabs = $("tabs");
  tabs.innerHTML = "";
  CASES.forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tab" + (state[c.id].closed ? " done" : "");
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === current));
    b.innerHTML =
      `<span class="t-no">${esc(c.no)}</span>` +
      `<span>${esc(c.title)}</span>` +
      `<span class="t-seal">${state[c.id].closed ? "已結案" : ""}</span>`;
    b.addEventListener("click", () => openCase(i));
    tabs.appendChild(b);
  });
  tabs.setAttribute("role", "tablist");
}

function updateProgress(bump) {
  const done = CASES.filter(c => state[c.id].closed).length;
  const hit = CASES.filter(c => state[c.id].closed && state[c.id].guess === c.lead).length;
  const dEl = $("pDone"), hEl = $("pHit");
  dEl.textContent = done;
  hEl.textContent = hit;
  if (bump) {
    for (const el of [dEl, hEl]) {
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  }
}

/* ── 開啟一樁案件 ── */
function openCase(i, animate = true) {
  current = i;
  const c = CASES[i];
  const st = state[c.id];

  $("dNo").textContent = c.no;
  $("dTitle").textContent = c.title;
  $("dWhen").textContent = c.when;
  $("dHook").textContent = c.hook;

  /* 證物卡 */
  const wrap = $("clues");
  wrap.innerHTML = "";
  c.clues.forEach((cl, idx) => {
    const spot = SPOTS[idx % SPOTS.length];
    const open = st.seen.includes(idx);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "clue" + (open ? " open" : "");
    b.dataset.idx = idx;
    b.style.left = spot.x + "%";
    b.style.top = spot.y + "%";
    b.style.setProperty("--rot", spot.rot + "deg");
    b.style.setProperty("--pd", animate ? (0.62 + idx * 0.07).toFixed(2) + "s" : "0s");
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", clueLabel(cl, idx, open));
    b.innerHTML =
      `<span class="c-no">證物 ${String(idx + 1).padStart(2, "0")}</span>` +
      `<span class="c-face"><span class="glyph" aria-hidden="true">${esc(cl.g)}</span>${esc(cl.face)}</span>` +
      `<span class="c-label">${esc(cl.label)}</span>`;
    b.addEventListener("click", () => revealClue(idx));
    wrap.appendChild(b);
  });

  /* 朱印 */
  const stamp = $("stamp");
  stamp.className = "stamp";
  stamp.style.opacity = "0";
  stamp.style.setProperty("--sc", c.color);
  $("stampText").textContent = c.stamp;

  renderTabs();
  renderNotes();
  renderDeduce();
  if (st.closed) showVerdict(false);
  else $("verdict").hidden = true;

  requestAnimationFrame(() => drawStrings(false));
  announce(`已開啟 ${c.no}：${c.title}`);
}

/* ── 翻證物 ── */
/* 已翻開的卡就只是一張攤開的紙，點它不會再有事——標籤要說實話 */
function clueLabel(cl, idx, open) {
  return open
    ? `證物 ${idx + 1}：${cl.face}（已翻開）`
    : `翻開證物 ${idx + 1}：${cl.face}`;
}

function revealClue(idx) {
  const c = CASES[current];
  const st = state[c.id];
  if (st.seen.includes(idx)) return;   /* 同一件重複點不重複計數 */
  st.seen.push(idx);
  save();

  const btn = $("clues").querySelector(`.clue[data-idx="${idx}"]`);
  if (btn) {
    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-label", clueLabel(c.clues[idx], idx, true));
  }
  renderNotes();
  renderDeduce();
  requestAnimationFrame(() => drawStrings(true));
  /* 讀出證物內容，順便報進度——螢幕閱讀器也要聽得到計數在動 */
  announce(`證物 ${idx + 1}：${c.clues[idx].text}（已看 ${st.seen.length} / ${c.clues.length} 件）`);
}

/* ── 紅線：由案卷中心連到每一張已翻開的證物 ── */
function drawStrings(animate) {
  const svg = $("strings");
  const board = $("board");
  if (!board || !svg) return;
  const bw = board.clientWidth, bh = board.clientHeight;
  svg.setAttribute("viewBox", `0 0 ${bw} ${bh}`);
  svg.innerHTML = "";
  if (getComputedStyle(svg).display === "none") return;

  const br = board.getBoundingClientRect();
  const dr = $("dossier").getBoundingClientRect();
  const cx = dr.left - br.left + dr.width / 2;
  const cy = dr.top - br.top + dr.height / 2;

  const c = CASES[current];
  const st = state[c.id];
  st.seen.forEach((idx, n) => {
    const el = $("clues").querySelector(`.clue[data-idx="${idx}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = r.left - br.left + r.width / 2;
    const y = r.top - br.top + r.height / 2;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", cx.toFixed(1));
    line.setAttribute("y1", cy.toFixed(1));
    line.setAttribute("x2", x.toFixed(1));
    line.setAttribute("y2", y.toFixed(1));
    if (st.closed) line.classList.add("hot");
    const len = Math.hypot(x - cx, y - cy);
    line.style.strokeDasharray = len.toFixed(1);
    const isNew = animate && n === st.seen.length - 1;
    line.style.strokeDashoffset = (isNew && !reduced()) ? len.toFixed(1) : "0";
    svg.appendChild(line);
    if (isNew && !reduced()) {
      requestAnimationFrame(() => { line.style.strokeDashoffset = "0"; });
    }
  });
}

let rz = null;
addEventListener("resize", () => {
  if (rz) cancelAnimationFrame(rz);
  rz = requestAnimationFrame(() => { rz = null; drawStrings(false); });
});

/* ── 調查筆記 ── */
function renderNotes() {
  const c = CASES[current];
  const st = state[c.id];
  const ol = $("notes");
  ol.innerHTML = st.seen.map(idx =>
    `<li><span class="n-no">${String(idx + 1).padStart(2, "0")}</span><span>${esc(c.clues[idx].text)}</span></li>`
  ).join("");
  $("notesEmpty").hidden = st.seen.length > 0;
}

/* ── 推論區 ── */
function renderDeduce() {
  const c = CASES[current];
  const st = state[c.id];
  const box = $("deduce");
  box.hidden = false;

  const nSeen = st.seen.length;
  const nAll = c.clues.length;
  const enough = nSeen >= NEED;

  /* 計數永遠看得見，分母是這樁案件的證物總數（NEED 是門檻，不是上限——
     以前寫成「已看 x / 3」，讀起來像只能翻三件，翻到第四件時就自相矛盾了）。
     前 NEED 個點畫上紅圈，一眼看出還差幾件才解鎖推論。 */
  $("deduceCount").textContent = `已看 ${nSeen} / ${nAll} 件證物`;
  $("deducePips").innerHTML = c.clues.map((_, i) =>
    `<i class="pip${i < nSeen ? " on" : ""}${i < NEED ? " need" : ""}"></i>`
  ).join("");

  let sub;
  if (st.closed) {
    sub = "本案已結案。你的推論標成紅色，學界最有力的解釋標成綠色。";
  } else if (enough) {
    sub = "可以下推論了。選一個你相信的假說，然後結案——選錯不會怎樣，但先押下去比較好玩。";
    if (nSeen < nAll) sub += `還有 ${nAll - nSeen} 件證物沒翻，想翻完再押也可以。`;
  } else {
    sub = `再翻 ${NEED - nSeen} 件證物就可以下推論。${NEED} 件只是門檻——這樁案子共 ${nAll} 件證物，你想全翻開都行。`;
  }
  $("deduceSub").textContent = sub;

  const hy = $("hypos");
  hy.innerHTML = "";
  c.hypos.forEach((h, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hypo" + (st.closed && i === c.lead ? " lead" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(st.guess === i));
    if (st.closed || !enough) b.disabled = true;
    b.innerHTML = `<span class="h-key" aria-hidden="true">${esc(h.k)}</span><span>${esc(h.t)}</span>`;
    b.addEventListener("click", () => {
      st.guess = i;
      save();
      renderDeduce();
    });
    hy.appendChild(b);
  });

  const btn = $("closeBtn");
  btn.hidden = st.closed;
  btn.disabled = st.closed || !enough || st.guess === null;
}

$("closeBtn").addEventListener("click", () => {
  const c = CASES[current];
  const st = state[c.id];
  if (st.guess === null || st.seen.length < NEED) return;
  st.closed = true;
  save();
  renderTabs();
  renderDeduce();
  drawStrings(false);
  updateProgress(true);
  showVerdict(true);
});

$("againBtn").addEventListener("click", () => {
  const c = CASES[current];
  state[c.id] = { seen: [], guess: null, closed: false };
  save();
  updateProgress(false);
  openCase(current, true);
});

/* ── 揭曉 ── */
function showVerdict(animate) {
  const c = CASES[current];
  const st = state[c.id];
  const v = $("verdict");
  v.hidden = false;

  const hit = st.guess === c.lead;
  const badge = $("vBadge");
  badge.className = "v-badge " + (hit ? "hit" : "miss");
  badge.textContent = hit ? "✓ 你的直覺和學界站在同一邊" : "✕ 你押的不是目前最有力的那個";

  $("vStatus").textContent = c.status;
  $("vText").textContent = c.verdict;
  $("vSrc").textContent = c.src;

  const stamp = $("stamp");
  stamp.style.opacity = "";
  stamp.classList.remove("on");
  void stamp.offsetWidth;
  if (animate && !reduced()) stamp.classList.add("on");
  else stamp.classList.add("on");

  if (animate) {
    announce(`結案。現況：${c.status}。${hit ? "你的推論與學界最有力的解釋一致。" : "學界最有力的解釋是另一個。"}`);
    if (v.scrollIntoView) v.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
  }
}

/* reduced-motion 動態監聽 */
if (mReduced.addEventListener) {
  mReduced.addEventListener("change", () => drawStrings(false));
}

/* ── 啟動 ── */
renderTabs();
updateProgress(false);
const firstOpen = CASES.findIndex(c => !state[c.id].closed);
openCase(firstOpen === -1 ? 0 : firstOpen, true);
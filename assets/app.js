
/* ==========================================================================
 * 索引室渲染引擎：星空圖、搜尋、類別篩選、星軌／星座分組、隨機、進場編排
 * ========================================================================== */
const CAT_META = {
  "網路趣聞・冷知識": { color: "var(--c-trivia)", hex: "#64b5f6" },
  "奇聞軼事":         { color: "var(--c-odd)",    hex: "#f48fb1" },
  "科學趣聞":         { color: "var(--c-sci)",    hex: "#4dd0e1" },
  "學習新知":         { color: "var(--c-learn)",  hex: "#ffb74d" },
  "生活痛點小工具":   { color: "var(--c-tool)",   hex: "#81c784" },
  "創意・娛樂":       { color: "var(--c-fun)",    hex: "#ba9df1" },
};
const CAT_NAMES = Object.keys(CAT_META);
const GOLD_HEX = "#f0c674";
const catColor = c => (CAT_META[c] || {}).color || "var(--gold)";
const catHex   = c => (CAT_META[c] || {}).hex   || GOLD_HEX;

const $ = id => document.getElementById(id);
/* HTML 轉義：所有以 innerHTML 內插的資料欄位一律經過這裡 */
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const mReduced = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => mReduced.matches;

const liveEl = $("live");
function announce(msg) {
  liveEl.textContent = "";
  setTimeout(() => { liveEl.textContent = msg; }, 40);
}

/* 搜尋命中處標上 <mark>（先轉義再插標記） */
function mark(text, q) {
  if (!q) return esc(text);
  const lower = String(text).toLowerCase();
  const needle = q.toLowerCase();
  let out = "", from = 0, i;
  while ((i = lower.indexOf(needle, from)) !== -1) {
    out += esc(text.slice(from, i)) + "<mark>" + esc(text.slice(i, i + needle.length)) + "</mark>";
    from = i + needle.length;
  }
  return out + esc(text.slice(from));
}

const state = { q: "", cat: null, group: "date" };

function matches(p) {
  if (state.cat && p.category !== state.cat) return false;
  if (!state.q) return true;
  const hay = (p.title + " " + p.desc + " " + p.category + " " + p.date).toLowerCase();
  return hay.includes(state.q.toLowerCase());
}

/* 星空連動的安全替身（initSky 啟動後會覆蓋成真實作） */
let updateSky = () => {};
let skyPulse = () => {};

/* ── 今晚最亮的星（永遠是陣列第一筆） ── */
function renderHero() {
  const p = PROJECTS[0];
  if (!p) return;
  const hero = $("hero");
  hero.style.setProperty("--cc", catColor(p.category));
  hero.innerHTML = `
    <a class="h-card" href="./${esc(p.dir)}/index.html">
      <p class="h-kicker"><span class="dot" aria-hidden="true"></span>今晚最亮的星<span class="h-date">${esc(p.date)}</span></p>
      <div class="h-body">
        <span class="h-emoji" aria-hidden="true">${esc(p.emoji)}</span>
        <div class="h-main">
          <span class="c-tag">${esc(p.category)}</span>
          <h2 class="h-title">${esc(p.title)}</h2>
          <p class="h-desc">${esc(p.desc)}</p>
        </div>
        <span class="h-cta">進入作品 <span aria-hidden="true">→</span></span>
      </div>
    </a>`;
}

/* ── 卡片牆：依「星軌（年月）」或「星座（分類）」分組 ── */
function cardHTML(p, gi) {
  const parts = p.date.split("-");
  return `
    <a class="card" href="./${esc(p.dir)}/index.html" data-gi="${gi}" style="--cc:${catColor(p.category)}"
       aria-label="${esc(p.title)}（${esc(p.date)}・${esc(p.category)}）${esc(p.desc)}">
      <span class="c-top">
        <span class="c-emoji" aria-hidden="true">${esc(p.emoji)}</span>
        ${gi === 0 ? '<span class="c-badge">今日之星</span>' : ""}
        <span class="c-date">${esc(parts[1])}／${esc(parts[2])}</span>
      </span>
      <span class="c-title">${mark(p.title, state.q)}</span>
      <span class="c-desc">${mark(p.desc, state.q)}</span>
      <span class="c-foot">
        <span class="c-tag">${esc(p.category)}</span>
        <span class="c-go">✦ 開啟 →</span>
      </span>
    </a>`;
}

function groupsOf(items) {
  const groups = [];
  const byKey = new Map();
  const push = (key, title, color, it) => {
    let g = byKey.get(key);
    if (!g) { g = { key, title, color, items: [] }; byKey.set(key, g); groups.push(g); }
    g.items.push(it);
  };
  if (state.group === "cat") {
    /* 星座模式：固定六類順序，空類別不出現 */
    for (const cat of CAT_NAMES) {
      for (const it of items) if (it.p.category === cat) push(cat, cat, catColor(cat), it);
    }
  } else {
    /* 星軌模式：依陣列順序（新→舊）分月 */
    for (const it of items) {
      const [y, m] = it.p.date.split("-");
      push(y + "-" + m, `${y} 年 ${Number(m)} 月`, "var(--gold)", it);
    }
  }
  return groups;
}

const wallEl = $("wall");
let io = null;

function renderWall() {
  const items = PROJECTS.map((p, gi) => ({ p, gi })).filter(it => matches(it.p));
  document.body.classList.toggle("no-result", items.length === 0);

  const bits = [];
  if (state.cat) bits.push(`星座「${state.cat}」`);
  if (state.q) bits.push(`關鍵字「${state.q}」`);
  $("result").innerHTML = bits.length
    ? `${esc(bits.join(" · "))}　點亮 <b>${items.length}</b> / ${PROJECTS.length} 顆`
    : `依${state.group === "cat" ? "星座" : "星軌"}排列 · 共 <b>${PROJECTS.length}</b> 顆星星`;

  wallEl.innerHTML = groupsOf(items).map(g => `
    <section class="group" style="--cc:${g.color}">
      <header class="g-head">
        <h2 class="g-title">${esc(g.title)}</h2>
        <span class="g-n">${g.items.length} 顆</span>
        <span class="g-rule" aria-hidden="true"></span>
      </header>
      <div class="g-grid">${g.items.map(it => cardHTML(it.p, it.gi)).join("")}</div>
    </section>`).join("");

  revealCards();
  updateSky();
}

/* 進場編排：進入視窗時依序浮現（每批最多疊 8 段延遲，總長 ≤ .4s） */
function revealCards() {
  const cards = wallEl.querySelectorAll(".card");
  if (io) io.disconnect();
  if (reduced() || !("IntersectionObserver" in window)) {
    cards.forEach(c => c.classList.add("in"));
    return;
  }
  io = new IntersectionObserver((entries, obs) => {
    let i = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.style.setProperty("--d", (Math.min(i, 8) * 0.045).toFixed(3) + "s");
      e.target.classList.add("in");
      obs.unobserve(e.target);
      i++;
    }
  }, { rootMargin: "90px 0px" });
  cards.forEach(c => io.observe(c));
}

/* ── 類別籌碼 ── */
function renderChips() {
  const nav = $("chips");
  const all = document.createElement("button");
  all.type = "button";
  all.className = "chip";
  all.innerHTML = `<span class="dot"></span>全部<span class="n">${PROJECTS.length}</span>`;
  all.setAttribute("aria-pressed", "true");
  all.addEventListener("click", () => setCat(null));
  nav.appendChild(all);
  for (const cat of CAT_NAMES) {
    const count = PROJECTS.filter(p => p.category === cat).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.cat = cat;
    btn.style.setProperty("--cc", catColor(cat));
    btn.innerHTML = `<span class="dot"></span>${esc(cat)}<span class="n">${count}</span>`;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => setCat(state.cat === cat ? null : cat));
    nav.appendChild(btn);
  }
}
function syncChips() {
  document.querySelectorAll("#chips .chip").forEach(c => {
    c.setAttribute("aria-pressed", String((c.dataset.cat || null) === state.cat));
  });
}
function setCat(cat) {
  state.cat = cat;
  syncChips();
  renderWall();
  announce(cat
    ? `已篩選「${cat}」，共 ${PROJECTS.filter(p => p.category === cat).length} 件`
    : "已顯示全部作品");
}

/* ── 搜尋 ── */
const qEl = $("q");
let qTimer = null;
qEl.addEventListener("input", () => {
  const v = qEl.value.trim();
  document.body.classList.toggle("searching", qEl.value !== "");
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    state.q = v;
    renderWall();
    if (v) announce(`搜尋「${v}」，找到 ${PROJECTS.filter(matches).length} 件`);
  }, 120);
});
qEl.addEventListener("keydown", e => {
  if (e.key === "Escape") { e.preventDefault(); clearSearch(); }
});
function clearSearch() {
  qEl.value = "";
  state.q = "";
  document.body.classList.remove("searching");
  renderWall();
  qEl.focus();
}
$("qx").addEventListener("click", clearSearch);
$("resetBtn").addEventListener("click", () => {
  qEl.value = "";
  state.q = "";
  state.cat = null;
  document.body.classList.remove("searching");
  syncChips();
  renderWall();
  announce("已顯示全部作品");
});
/* 「/」聚焦搜尋框 */
addEventListener("keydown", e => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  e.preventDefault();
  qEl.focus();
  qEl.select();
});

/* ── 分組切換 ── */
function setGroup(g) {
  state.group = g;
  $("grpDate").setAttribute("aria-pressed", String(g === "date"));
  $("grpCat").setAttribute("aria-pressed", String(g === "cat"));
  try { localStorage.setItem("index.group", g); } catch (e) {}
  renderWall();
}
$("grpDate").addEventListener("click", () => { setGroup("date"); announce("依星軌（時間）排列"); });
$("grpCat").addEventListener("click", () => { setGroup("cat"); announce("依星座（分類）排列"); });

/* ── 隨機觀星：挑一顆星，天上漣漪、地上捲過去亮起來 ── */
let lastPick = -1;
$("rand").addEventListener("click", () => {
  const pool = PROJECTS.map((p, gi) => gi).filter(gi => matches(PROJECTS[gi]));
  if (!pool.length) return;
  let gi = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && gi === lastPick) gi = pool[(pool.indexOf(gi) + 1) % pool.length];
  lastPick = gi;
  skyPulse(gi);
  const card = wallEl.querySelector(`.card[data-gi="${gi}"]`);
  if (!card) return;
  card.classList.add("in");
  card.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
  setTimeout(() => card.classList.remove("flash"), 2000);
  announce(`隨機挑中：${PROJECTS[gi].title}`);
});

/* ── 頁首統計數字滾動 ── */
function countUp(el, to) {
  if (reduced()) { el.textContent = to; return; }
  const dur = 900, t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ==========================================================================
 * 星空圖引擎：每顆星＝一件作品，依日期連成星軌
 *   - 佈局：由舊到新蛇行鋪排（boustrophedon）＋雜湊抖動，任何寬度都成立
 *   - 氛圍：漂移星雲、雙層視差星塵與銀河帶、沿星軌巡行的彗星、
 *           開頁沿星軌依序點燈、隨機星光乍現、流星
 *   - 掃描：金色光束橫掃夜空、沿途星星漣漪應答，減速鎖定一顆隨機星，
 *           準星收束後彈出介紹卡（含開啟連結）
 *   - 互動：滑過發光＋懸浮卡、點擊開啟；觸控先點選看介紹、再點開啟
 *   - 篩選連動：搜尋／類別改變時，不符合的星星與線段一起變暗
 *   - 紀律：全 rAF、離屏或分頁隱藏即停；prefers-reduced-motion 靜態降級
 * ========================================================================== */
(function initSky() {
  const skyWrap = $("skywrap"), cv = $("sky"), tipEl = $("sky-tip"), scanBtn = $("scanBtn");
  const probe = (cv && cv.getContext) ? cv.getContext("2d") : null;
  if (!probe) { if (skyWrap) skyWrap.style.display = "none"; return; }

  const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgba = (h, a) => { const [r, g, b] = hexRGB(h); return `rgba(${r},${g},${b},${a})`; };
  const clamp01 = k => Math.max(0, Math.min(1, k));
  const outCubic = k => 1 - Math.pow(1 - clamp01(k), 3);
  const ioCubic = k => { k = clamp01(k); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
  /* FNV-1a 雜湊 → 0..1：抖動與相位固定，不會每次載入亂跳 */
  const hashStr = s => {
    let h = 2166136261 >>> 0;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h / 4294967295;
  };

  const chrono = PROJECTS.map((p, gi) => ({ p, gi })).reverse(); /* 舊 → 新 */
  let ctx = null, W = 0, H = 0, dpr = 1;
  let farL = null, nearL = null, nebs = [];
  let stars = [], pathPts = [], pathCum = [], pathLen = 1;
  let hoverGi = -1, selGi = -1, lastPT = "mouse";
  let pulses = [], meteor = null, meteorTimer = null, glint = null, glintTimer = null;
  let scan = null, lastScan = -1;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let running = false, inView = true, rafId = 0;
  let visSet = new Set(PROJECTS.map((_, gi) => gi));
  let bornAt = 0; /* 0＝尚未點燈；>0＝點燈中；-1＝完成（resize 不重播） */

  /* 靜態星塵層（離屏，含斜向銀河帶；每幀只 blit） */
  function speckLayer(density, bright) {
    const c = document.createElement("canvas");
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(W * H / density);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W, y = Math.random() * H, k = Math.random();
      g.globalAlpha = (.1 + k * .4) * bright;
      g.fillStyle = k > .85 ? "#d6e4ff" : "#93a5d6";
      g.beginPath(); g.arc(x, y, .3 + k * 1.2, 0, 7); g.fill();
    }
    for (let i = 0; i < Math.round(n * .5); i++) {
      const u = Math.random();
      const cx = W * (.06 + u * .92), cy = H * (.84 - u * .64);
      const spread = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      g.globalAlpha = (.05 + Math.random() * .2) * bright;
      g.fillStyle = "#aebbe8";
      g.beginPath(); g.arc(cx + spread * 46, cy + spread * 92, .3 + Math.random() * .9, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }
  /* 星雲精靈（radial gradient 預烘焙，繪製時 additive 疊亮） */
  function nebSprite(hex) {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 320;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(160, 160, 0, 160, 160, 160);
    rg.addColorStop(0, rgba(hex, .5));
    rg.addColorStop(.4, rgba(hex, .18));
    rg.addColorStop(1, rgba(hex, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 320, 320);
    return c;
  }

  function layoutSky() {
    const rect = skyWrap.getBoundingClientRect();
    W = Math.max(300, rect.width); H = Math.max(260, rect.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = chrono.length;
    const mx = Math.max(30, W * .05), myT = 56, myB = 74;
    const uw = W - mx * 2, uh = H - myT - myB;
    const perRow = Math.max(5, Math.min(14, Math.round(uw / 88)));
    const rows = Math.max(1, Math.ceil(n / perRow));
    const rowH = uh / rows;
    let lastMonth = "";
    stars = chrono.map((it, i) => {
      const r = Math.floor(i / perRow), c = i % perRow;
      const col = (r % 2 === 0) ? c : (perRow - 1 - c);          /* 蛇行 */
      const bx = mx + (perRow === 1 ? uw / 2 : uw * col / (perRow - 1));
      const by = myT + rowH * (r + .5);
      const h1 = hashStr(it.p.dir), h2 = hashStr(it.p.title + it.p.date);
      const x = bx + (h1 - .5) * Math.min(40, uw / perRow * .5);
      /* 底緣留 70px 淨空：最下排星星不被「今晚最亮的星」卡片壓住 */
      const y = Math.min(H - 70, by + (h2 - .5) * Math.min(rowH * .62, 52));
      const mm = it.p.date.slice(5, 7);
      const mkey = it.p.date.slice(0, 7);
      const label = (mkey !== lastMonth) ? `${Number(mm)} 月` : "";
      lastMonth = mkey;
      return {
        gi: it.gi, p: it.p, x, y, idx: i,
        r: 2.1 + h1 * 1.6, hex: catHex(it.p.category),
        ph: h2 * Math.PI * 2, sp: .8 + h1 * 1.6,
        label, today: it.gi === 0,
      };
    });
    /* 星軌折線累積長度（彗星巡行用） */
    pathPts = stars.map(s => [s.x, s.y]);
    pathCum = [0];
    for (let i = 1; i < pathPts.length; i++) {
      pathCum[i] = pathCum[i - 1] + Math.hypot(pathPts[i][0] - pathPts[i - 1][0], pathPts[i][1] - pathPts[i - 1][1]);
    }
    pathLen = pathCum[pathCum.length - 1] || 1;

    farL = speckLayer(5200, .8);
    nearL = speckLayer(9000, 1.15);
    const nebHex = ["#64b5f6", "#ba9df1", "#4dd0e1", "#f48fb1"];
    nebs = nebHex.map((hx, i) => ({
      sp: nebSprite(hx),
      bx: W * [.16, .78, .46, .9][i], by: H * [.3, .22, .74, .66][i],
      size: Math.max(W, H) * [.52, .6, .46, .4][i],
      orb: 16 + i * 7, spd: .00005 + i * .00002, ph: i * 1.7,
    }));
    if (bornAt === 0 && reduced()) bornAt = -1;
  }

  function pathAt(d) {
    if (d <= 0) return pathPts[0];
    if (d >= pathLen) return pathPts[pathPts.length - 1];
    let i = 1;
    while (pathCum[i] < d) i++;
    const t = (d - pathCum[i - 1]) / (pathCum[i] - pathCum[i - 1] || 1);
    return [
      pathPts[i - 1][0] + (pathPts[i][0] - pathPts[i - 1][0]) * t,
      pathPts[i - 1][1] + (pathPts[i][1] - pathPts[i - 1][1]) * t,
    ];
  }

  /* 四芒光 */
  function flare(x, y, L, col, a, rot) {
    ctx.strokeStyle = rgba(col, a);
    ctx.beginPath();
    for (let q = 0; q < 4; q++) {
      const ang = rot + q * Math.PI / 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L);
    }
    ctx.stroke();
  }

  function drawSky(t) {
    if (!ctx) return;
    if (bornAt === 0) bornAt = t; /* 點燈基準取自繪圖時間軸本身，避免時鐘混用 */
    ctx.clearRect(0, 0, W, H);

    /* 星雲層：緩慢漂移＋視差，additive 疊亮 */
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = .5;
    for (const nb of nebs) {
      const dx = reduced() ? 0 : Math.sin(t * nb.spd + nb.ph) * nb.orb;
      const dy = reduced() ? 0 : Math.cos(t * nb.spd * .8 + nb.ph) * nb.orb * .7;
      ctx.drawImage(nb.sp, nb.bx + dx + par.x * 5 - nb.size / 2, nb.by + dy + par.y * 4 - nb.size / 2, nb.size, nb.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    /* 星塵遠近層（視差，超畫避免露邊） */
    ctx.drawImage(farL, par.x * 4 - 8, par.y * 3 - 8, W + 16, H + 16);
    ctx.drawImage(nearL, par.x * 10 - 14, par.y * 7 - 14, W + 28, H + 28);

    /* 彗星：沿星軌巡行一圈、喘口氣再出發 */
    let cometD = null, cometPos = null;
    if (!reduced() && pathLen > 1) {
      const cyc = pathLen / .11 + 3200;
      const d = (t % cyc) * .11;
      if (d <= pathLen) { cometD = d; cometPos = pathAt(d); }
    }

    /* 月份標記 */
    ctx.font = '10.5px "Noto Sans TC", system-ui, sans-serif';
    ctx.textAlign = "center";
    for (const s of stars) {
      if (!s.label) continue;
      const ly = (s.today && s.y > H - 120) ? s.y - 42 : s.y - 18;
      ctx.fillStyle = "rgba(166,174,201,.5)";
      ctx.fillText(s.label, s.x, ly);
    }

    /* 星軌連線（沿線微微呼吸） */
    ctx.lineWidth = 1;
    for (let i = 1; i < stars.length; i++) {
      const a = stars[i - 1], b = stars[i];
      const on = visSet.has(a.gi) && visSet.has(b.gi);
      const puls = reduced() ? .5 : (.5 + .5 * Math.sin(t / 1100 + i * .55));
      ctx.strokeStyle = `rgba(160,175,225,${on ? (.1 + .09 * puls).toFixed(3) : ".04"})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }

    /* 彗星尾跡與頭部 */
    if (cometPos) {
      for (let k = 12; k >= 1; k--) {
        const p = pathAt(cometD - k * 6);
        const fade = 1 - k / 13;
        ctx.fillStyle = `rgba(255,240,200,${(fade * .38).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p[0], p[1], .8 + fade * 1.6, 0, 7); ctx.fill();
      }
      ctx.fillStyle = "rgba(240,198,116,.22)";
      ctx.beginPath(); ctx.arc(cometPos[0], cometPos[1], 8, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,250,230,.95)";
      ctx.beginPath(); ctx.arc(cometPos[0], cometPos[1], 2.2, 0, 7); ctx.fill();
    }

    /* 星星（開頁沿星軌依序點燈；彗星經過時被喚亮） */
    const igniting = bornAt > 0;
    for (const s of stars) {
      const on = visSet.has(s.gi);
      const hot = s.gi === hoverGi || s.gi === selGi;
      const tw = reduced() ? .8 : .55 + .45 * Math.sin(t / 1000 * s.sp + s.ph);
      let a = (on ? 1 : .14) * tw;
      let rr = (s.today ? 4.8 : s.r) * (reduced() ? 1 : .88 + .24 * tw);
      if (hot) { rr *= 1.55; a = Math.min(1, a + .35); }
      if (igniting) {
        const ig = clamp01((t - bornAt - s.idx * 16) / 380);
        a *= ig; rr *= .6 + .4 * ig;
      }
      if (cometPos && on) {
        const dd = Math.hypot(s.x - cometPos[0], s.y - cometPos[1]);
        if (dd < 26) { const bo = 1 - dd / 26; a = Math.min(1, a + bo * .5); rr *= 1 + bo * .35; }
      }
      const col = s.today ? GOLD_HEX : s.hex;
      a = Math.min(1, a);
      ctx.fillStyle = rgba(col, a * .3);
      ctx.beginPath(); ctx.arc(s.x, s.y, rr * 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, 7); ctx.fill();
      if (s.r > 2.9 || s.today || hot) {
        ctx.lineWidth = 1;
        flare(s.x, s.y, hot ? rr * 4.6 : rr * 3.4, col, a * (hot ? .8 : .4), s.today ? t / 2600 : 0);
      }
      if (s.today) {
        const k = reduced() ? .4 : (Math.sin(t / 700) + 1) / 2;
        ctx.strokeStyle = rgba(GOLD_HEX, .55 - k * .3);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(s.x, s.y, 9 + k * 6, 0, 7); ctx.stroke();
        ctx.fillStyle = rgba(GOLD_HEX, .92);
        ctx.font = '11px "Noto Serif TC", serif';
        ctx.fillText("今日之星", s.x, s.y > H - 120 ? s.y - 26 : s.y + 30);
        ctx.font = '10.5px "Noto Sans TC", system-ui, sans-serif';
      }
    }
    if (igniting && t - bornAt > stars.length * 16 + 420) bornAt = -1;

    /* 星光乍現：隨機一顆對你眨眼 */
    if (glint) {
      const k = (t - glint.t0) / 750;
      if (k >= 1) glint = null;
      else {
        const s = stars.find(z => z.gi === glint.gi);
        if (s && visSet.has(s.gi)) {
          const a = Math.sin(Math.PI * clamp01(k));
          ctx.lineWidth = 1;
          flare(s.x, s.y, 5 + k * 17, s.hex, a * .85, Math.PI / 4);
          ctx.strokeStyle = rgba(s.hex, a * .5);
          ctx.beginPath(); ctx.arc(s.x, s.y, 3 + k * 11, 0, 7); ctx.stroke();
        }
      }
    }

    /* 漣漪（大＝隨機／鎖定；小＝掃描光束沿途應答） */
    pulses = pulses.filter(pl => t - pl.t0 < (pl.small ? 520 : 900));
    for (const pl of pulses) {
      const s = stars.find(z => z.gi === pl.gi);
      if (!s) continue;
      const k = (t - pl.t0) / (pl.small ? 520 : 900);
      ctx.strokeStyle = rgba(s.today ? GOLD_HEX : s.hex, ((1 - k) * (pl.small ? .55 : .8)).toFixed(3));
      ctx.lineWidth = pl.small ? 1 : 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, (pl.small ? 3 : 4) + k * (pl.small ? 13 : 26), 0, 7); ctx.stroke();
      ctx.lineWidth = 1;
    }

    /* 流星 */
    if (meteor) {
      const k = (t - meteor.t0) / meteor.dur;
      if (k >= 1) meteor = null;
      else {
        const x = meteor.x0 + meteor.dx * k, y = meteor.y0 + meteor.dy * k;
        const tail = Math.min(k * 110, 74) * (1 - k * .35);
        const g = ctx.createLinearGradient(x, y, x - meteor.ux * tail, y - meteor.uy * tail);
        g.addColorStop(0, `rgba(255,255,255,${(.85 * (1 - k)).toFixed(3)})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - meteor.ux * tail, y - meteor.uy * tail); ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    /* 掃描光束與鎖定準星 */
    if (scan) drawScan(t);
  }

  /* ── 掃描星空：光束橫掃 → 減速鎖定 → 準星收束 → 開介紹卡 ── */
  function drawScan(t) {
    const target = stars.find(z => z.gi === scan.gi);
    if (!target) { scan = null; return; }
    if (scan.phase === "sweep") {
      const k = clamp01((t - scan.t0) / scan.dur);
      let x;
      if (k < .5) x = 10 + (W - 20) * outCubic(k / .5);              /* 先全幅掃過去 */
      else x = (W - 10) + (target.x - (W - 10)) * ioCubic((k - .5) / .5); /* 折返減速鎖定 */
      /* 光束沿途叫醒星星 */
      const lo = Math.min(scan.px, x), hi = Math.max(scan.px, x);
      for (const s of stars) {
        if (!visSet.has(s.gi) || scan.hit.has(s.gi)) continue;
        if (s.x >= lo - 1 && s.x <= hi + 1) { scan.hit.add(s.gi); pulses.push({ gi: s.gi, t0: t, small: true }); }
      }
      scan.px = x;
      const band = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
      band.addColorStop(0, "rgba(240,198,116,0)");
      band.addColorStop(.5, "rgba(240,198,116,.14)");
      band.addColorStop(1, "rgba(240,198,116,0)");
      ctx.fillStyle = band;
      ctx.fillRect(x - 34, 0, 68, H);
      const lg = ctx.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, "rgba(240,198,116,0)");
      lg.addColorStop(.5, "rgba(255,238,196,.9)");
      lg.addColorStop(1, "rgba(240,198,116,0)");
      ctx.strokeStyle = lg; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, H - 8); ctx.stroke();
      ctx.lineWidth = 1;
      if (k >= 1) { scan.phase = "lock"; scan.lockT0 = t; selGi = scan.gi; hoverGi = -1; }
    } else {
      const kk = clamp01((t - scan.lockT0) / 650);
      const rr = 30 - 16 * outCubic(kk);
      const rot = t / 500;
      ctx.strokeStyle = rgba(GOLD_HEX, .35 + .55 * kk);
      ctx.lineWidth = 1.4;
      for (let q = 0; q < 4; q++) {
        ctx.beginPath();
        ctx.arc(target.x, target.y, rr, rot + q * Math.PI / 2, rot + q * Math.PI / 2 + Math.PI / 3.2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      if (kk >= 1) finishScan();
    }
  }
  function resetScanBtn() {
    scanBtn.classList.remove("scanning");
    scanBtn.querySelector(".lbl").textContent = "掃描星空";
  }
  function finishScan() {
    const gi = scan.gi;
    scan = null;
    resetScanBtn();
    pulses.push({ gi, t0: performance.now() });
    selGi = gi; hoverGi = -1;
    showTip(gi, true);
    announce(`掃描鎖定：${PROJECTS[gi].title}`);
    if (!running) drawSky(performance.now());
  }
  function startScan() {
    const pool = [...visSet];
    if (!pool.length) return;
    let gi = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && gi === lastScan) gi = pool[(pool.indexOf(gi) + 1) % pool.length];
    lastScan = gi;
    hideTip(); hoverGi = -1;
    if (reduced()) { scan = { gi }; finishScan(); return; }
    scan = { gi, phase: "sweep", t0: performance.now(), dur: 1500, px: 10, hit: new Set() };
    scanBtn.classList.add("scanning");
    scanBtn.querySelector(".lbl").textContent = "掃描中…";
  }
  scanBtn.addEventListener("click", startScan);

  /* rAF 迴圈：只在「在畫面內＋分頁可見＋允許動態」時運轉 */
  function frame(t) {
    if (!running) return;
    par.x += (par.tx - par.x) * .045;
    par.y += (par.ty - par.y) * .045;
    drawSky(t);
    rafId = requestAnimationFrame(frame);
  }
  function setRunning() {
    const want = inView && !document.hidden && !reduced();
    if (want && !running) { running = true; rafId = requestAnimationFrame(frame); scheduleMeteor(); scheduleGlint(); }
    else if (!want && running) { running = false; cancelAnimationFrame(rafId); clearTimeout(meteorTimer); clearTimeout(glintTimer); }
    if (!running) drawSky(performance.now());
  }
  function scheduleMeteor() {
    clearTimeout(meteorTimer);
    meteorTimer = setTimeout(() => {
      if (!running) return;
      const x0 = W * (.12 + Math.random() * .6), y0 = H * (.06 + Math.random() * .25);
      const ang = (24 + Math.random() * 20) * Math.PI / 180;
      const len = 130 + Math.random() * 170;
      const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      const ul = Math.hypot(dx, dy);
      meteor = { x0, y0, dx, dy, ux: dx / ul, uy: dy / ul, t0: performance.now(), dur: 900 + Math.random() * 500 };
      scheduleMeteor();
    }, 2600 + Math.random() * 4200);
  }
  function scheduleGlint() {
    clearTimeout(glintTimer);
    glintTimer = setTimeout(() => {
      if (!running) return;
      const pool = [...visSet].filter(g => g !== 0);
      if (pool.length) glint = { gi: pool[Math.floor(Math.random() * pool.length)], t0: performance.now() };
      scheduleGlint();
    }, 1400 + Math.random() * 2200);
  }

  /* 命中測試：18px 內最近的可見星星 */
  function starAt(x, y) {
    let best = -1, bd = 18 * 18;
    for (const s of stars) {
      if (!visSet.has(s.gi)) continue;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = s.gi; }
    }
    return best;
  }

  function showTip(gi, withLink) {
    if (gi < 0) { if (selGi < 0) hideTip(); return; }
    const p = PROJECTS[gi];
    const s = stars.find(z => z.gi === gi);
    if (!s) return;
    tipEl.style.setProperty("--cc", catColor(p.category));
    tipEl.classList.toggle("tap", !!withLink);
    tipEl.innerHTML = `
      <span class="t-emoji">${esc(p.emoji)}</span>
      <span class="t-main">
        <b>${esc(p.title)}</b>
        <span class="t-meta">${esc(p.date)}｜${esc(p.category)}</span>
        <span class="t-desc">${esc(p.desc)}</span>
        ${withLink
          ? `<a class="t-open" href="./${esc(p.dir)}/index.html">開啟作品 →</a>`
          : `<span class="t-open">點擊星星開啟 →</span>`}
      </span>`;
    tipEl.classList.add("on");
    const tw = tipEl.offsetWidth || 260, th = tipEl.offsetHeight || 96;
    let lx = s.x + 18, ly = s.y - th / 2;
    if (lx + tw > W - 10) lx = s.x - tw - 18;
    lx = Math.max(8, lx);
    ly = Math.max(8, Math.min(H - th - 8, ly));
    tipEl.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;
  }
  function hideTip() {
    tipEl.classList.remove("on");
    tipEl.classList.remove("tap");
    selGi = -1;
  }

  cv.addEventListener("pointermove", e => {
    const rc = cv.getBoundingClientRect();
    const x = e.clientX - rc.left, y = e.clientY - rc.top;
    if (!reduced()) { par.tx = (x / W - .5) * 2; par.ty = (y / H - .5) * 2; }
    if (e.pointerType === "touch" || scan) return;
    const gi = starAt(x, y);
    if (gi !== hoverGi) {
      hoverGi = gi;
      cv.style.cursor = gi < 0 ? "" : "pointer";
      if (gi >= 0) { selGi = -1; showTip(gi, false); }
      else if (selGi < 0) hideTip();
      if (!running) drawSky(performance.now());
    }
  });
  cv.addEventListener("pointerleave", () => {
    hoverGi = -1; par.tx = par.ty = 0; cv.style.cursor = "";
    if (selGi < 0) hideTip();
    if (!running) drawSky(performance.now());
  });
  cv.addEventListener("pointerdown", e => { lastPT = e.pointerType || "mouse"; });
  cv.addEventListener("click", e => {
    if (scan) { scan = null; resetScanBtn(); }   /* 點天空可中止掃描 */
    const rc = cv.getBoundingClientRect();
    const gi = starAt(e.clientX - rc.left, e.clientY - rc.top);
    if (gi < 0) { hideTip(); if (!running) drawSky(performance.now()); return; }
    if (lastPT === "touch") {
      /* 觸控：第一下點選看介紹，第二下（或按懸浮卡連結）開啟 */
      if (selGi === gi) { location.href = `./${PROJECTS[gi].dir}/index.html`; return; }
      selGi = gi; hoverGi = -1;
      showTip(gi, true);
      if (!running) drawSky(performance.now());
    } else {
      location.href = `./${PROJECTS[gi].dir}/index.html`;
    }
  });

  /* 對外：篩選連動與隨機漣漪 */
  updateSky = function () {
    visSet = new Set(PROJECTS.map((p, gi) => matches(p) ? gi : -1).filter(g => g >= 0));
    if (ctx && !running) drawSky(performance.now());
  };
  skyPulse = function (gi) {
    if (reduced() || !ctx) return;
    pulses.push({ gi, t0: performance.now() });
    if (!running) drawSky(performance.now());
  };

  /* 觀察可見性與尺寸 */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(es => { inView = !!es[0] && es[0].isIntersecting; setRunning(); },
      { rootMargin: "80px 0px" }).observe(cv);
  }
  document.addEventListener("visibilitychange", setRunning);
  mReduced.addEventListener("change", setRunning);
  let rzT = null;
  const onResize = () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => { layoutSky(); drawSky(performance.now()); }, 120);
  };
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(skyWrap);
  else addEventListener("resize", onResize);

  layoutSky();
  drawSky(performance.now());
  setRunning();
})();

/* ── 啟動 ── */
/* 進場淡入：只在 JS 在場且未要求減少動態時才先隱藏，確保內容永遠讀得到 */
if (!reduced()) {
  document.body.classList.add("preload");
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("preload")));
}
countUp($("sN"), PROJECTS.length);
countUp($("sC"), new Set(PROJECTS.map(p => p.category)).size);
countUp($("sD"), new Set(PROJECTS.map(p => p.date)).size);
/* ── 產量面板：年月日熱力圖 / 分類聚合 ── */
function searchFor(v) {
  const el = $("q");
  el.value = v; state.q = v;
  document.body.classList.toggle("searching", v !== "");
  renderWall();
  announce(`篩選 ${v}，找到 ${PROJECTS.filter(matches).length} 件`);
  const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("wall").scrollIntoView({ behavior: rm ? "auto" : "smooth", block: "start" });
}
function setActView(v) {
  $("actCal").setAttribute("aria-pressed", String(v === "cal"));
  $("actCat").setAttribute("aria-pressed", String(v === "cat"));
  $("actViewCal").classList.toggle("on", v === "cal");
  $("actViewCat").classList.toggle("on", v === "cat");
}
function renderActivity() {
  const byDate = new Map(), byMonth = new Map(), byCat = new Map();
  PROJECTS.forEach(p => {
    byDate.set(p.date, (byDate.get(p.date) || 0) + 1);
    const ym = p.date.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) || 0) + 1);
    byCat.set(p.category, (byCat.get(p.category) || 0) + 1);
  });
  const activeDays = byDate.size, total = PROJECTS.length;
  let peak = { d: "", n: 0 };
  byDate.forEach((n, d) => { if (n > peak.n) peak = { d, n }; });
  $("actSum").innerHTML = `<b>${total}</b> 件作品 · 橫跨 <b>${activeDays}</b> 個產出日 · 平均每天 <b>${(total / Math.max(1, activeDays)).toFixed(1)}</b> 件 · 單日最多 <b>${peak.n}</b> 件（${esc(peak.d.slice(5))}）`;

  const lvl = n => n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4;
  let html = "";
  [...byMonth.keys()].sort().forEach(ym => {
    html += `<div class="cal-row"><span class="cal-lab">${esc(ym)}</span><div class="cal-cells">`;
    for (let d = 1; d <= 31; d++) {
      const ds = ym + "-" + String(d).padStart(2, "0");
      const n = byDate.get(ds) || 0;
      html += n
        ? `<button type="button" class="cal-c" data-n="${lvl(n)}" data-date="${ds}" title="${ds}：${n} 件" aria-label="${ds} 有 ${n} 件作品，點擊篩選"></button>`
        : `<span class="cal-c" data-n="0" aria-hidden="true"></span>`;
    }
    html += `</div><span class="cal-lab" style="width:auto;color:var(--dim)">${byMonth.get(ym)}</span></div>`;
  });
  html += `<div class="cal-axis"><span class="cal-lab"></span><div class="cal-ticks">`;
  for (let d = 1; d <= 31; d++) html += `<span>${(d === 1 || d % 5 === 0) ? d : ""}</span>`;
  html += `</div></div><div class="cal-legend">少 <i style="background:rgba(150,165,220,.07)"></i><i style="background:rgba(240,198,116,.32)"></i><i style="background:rgba(240,198,116,.55)"></i><i style="background:rgba(240,198,116,.78)"></i><i style="background:var(--gold)"></i> 多　·　點一天可篩選出當天的作品</div>`;
  $("actViewCal").innerHTML = html;
  $("actViewCal").querySelectorAll(".cal-c[data-date]").forEach(b =>
    b.addEventListener("click", () => searchFor(b.dataset.date)));

  const maxCat = Math.max(...byCat.values(), 1);
  let ch = "";
  [...byCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
    ch += `<div class="cat-row" style="--cc:${catColor(c)}"><button type="button" class="nm" data-cat="${esc(c)}" aria-label="篩選 ${esc(c)}">${esc(c)}</button><span class="track"><span class="fill" style="width:${(n / maxCat * 100).toFixed(1)}%"></span></span><span class="n">${n}</span></div>`;
  });
  $("actViewCat").innerHTML = ch;
  $("actViewCat").querySelectorAll("button.nm").forEach(b =>
    b.addEventListener("click", () => setCat(state.cat === b.dataset.cat ? null : b.dataset.cat)));
}
$("actCal").addEventListener("click", () => { setActView("cal"); announce("依年月日聚合"); });
$("actCat").addEventListener("click", () => { setActView("cat"); announce("依分類聚合"); });

renderHero();
renderChips();
renderActivity();
let savedGroup = "date";
try { savedGroup = localStorage.getItem("index.group") || "date"; } catch (e) {}
setGroup(savedGroup === "cat" ? "cat" : "date");
mReduced.addEventListener("change", revealCards);

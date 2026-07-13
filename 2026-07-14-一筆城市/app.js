'use strict';
/* ============================================================
   一筆城市 One-Stroke City
   畫一條線 → 變成一座會點燈、下雨、有海港的夜城。
   純前端、零依賴；localStorage 一律加 `city.` 前綴。
   ============================================================ */
(() => {

const LS = 'city.';
const $ = (s) => document.querySelector(s);

const canvas  = $('#city');
const ctx     = canvas.getContext('2d');
const frame   = $('.frame');
const hintEl  = $('#hint');
const statsEl = $('#stats');
const liveEl  = $('#live');
const nameEl  = $('#cityname');

/* ---------- 動態偵聽 prefers-reduced-motion ---------- */
let RM = false;
const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
function syncRM() {
  RM = rmq.matches;
  if (RM) { stopLoop(); scheduleRender(); }
  else kickLoop();
}
if (rmq.addEventListener) rmq.addEventListener('change', syncRM);
else if (rmq.addListener) rmq.addListener(syncRM);

/* ---------- 狀態 ---------- */
let W = 0, H = 0, DPR = 1;
let phase = 'draw';            // draw | reveal | alive
let pointsNorm = [];           // 標準化筆跡 [ [x,y], ... ] 0..1
let drawPts = [];              // 畫圖中的即時像素點
let geo = null;                // 幾何：建築、海港、路燈
let skyT = 0.15, skyTarget = 0.15;   // 0.15 黃昏 / 0.5 夜 / 0.85 黎明
let weather = 'clear';
let revealAt = 0, revealEnd = 0;
let hoverI = -1, selI = -1;
let boosted = new Set();       // 被點亮整棟的建築 index
let stars = [], rain = [], meteors = [];
let plane = null;
let nextMeteor = 0, nextPlane = 0, nextLife = 0;
let raf = 0, prevT = 0;
let pageVisible = !document.hidden, onScreen = true;
let renderQueued = false;

/* ---------- 小工具 ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const fmt   = (n) => Math.round(n).toLocaleString('zh-Hant-TW');

function lsGet(k, fb) {
  try { const v = localStorage.getItem(LS + k); return v === null ? fb : v; }
  catch (e) { return fb; }
}
function lsSet(k, v) {
  try { localStorage.setItem(LS + k, v); } catch (e) { /* 私密模式無妨 */ }
}
function lsDel(k) {
  try { localStorage.removeItem(LS + k); } catch (e) {}
}

function announce(msg) { liveEl.textContent = msg; }

/* ============================================================
   幾何：把一條線變成一座城
   ============================================================ */
function buildGeometry(norm, w, h) {
  const gy = h * 0.86;
  const nCols = Math.max(40, Math.floor(w / 9));
  const colW = w / nCols;
  const top = new Array(nCols).fill(null);

  for (let p = 0; p < norm.length; p++) {
    const i = clamp(Math.floor(norm[p][0] * nCols), 0, nCols - 1);
    const y = norm[p][1] * h;
    top[i] = (top[i] === null) ? y : Math.min(top[i], y);
  }

  /* 內部空隙線性補間（頭尾留白 = 空地） */
  let first = -1, last = -1;
  for (let i = 0; i < nCols; i++) if (top[i] !== null) { if (first < 0) first = i; last = i; }
  if (first >= 0) {
    let prev = first;
    for (let i = first + 1; i <= last; i++) {
      if (top[i] === null) continue;
      for (let k = prev + 1; k < i; k++) {
        top[k] = lerp(top[prev], top[i], (k - prev) / (i - prev));
      }
      prev = i;
    }
  }

  /* 低於地平線 → 海港 */
  const water = new Array(nCols).fill(false);
  for (let i = 0; i < nCols; i++) {
    if (top[i] !== null && top[i] > gy + 6) water[i] = true;
  }

  /* 高度平滑（不跨海、不跨空地） */
  const hgt = top.map((t, i) => (t === null || water[i]) ? 0 : Math.max(0, gy - t));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < nCols - 1; i++) {
      if (!hgt[i] || !hgt[i - 1] || !hgt[i + 1]) continue;
      hgt[i] = (hgt[i - 1] + hgt[i] * 2 + hgt[i + 1]) / 4;
    }
  }

  /* 切成建築 */
  const buildings = [];
  let i = 0;
  while (i < nCols) {
    if (water[i] || hgt[i] < 10) { i++; continue; }
    const maxW = 4 + Math.floor(Math.random() * 4);   // 4~7 欄
    let j = i + 1;
    while (j < nCols && j - i < maxW && !water[j] && hgt[j] >= 10 &&
           Math.abs(hgt[j] - hgt[i]) < 16) j++;
    let bh = 0;
    for (let k = i; k < j; k++) bh += hgt[k];
    bh = Math.max(14, bh / (j - i));
    const bx = i * colW + 1;
    const bw = (j - i) * colW - 2;
    buildings.push(makeBuilding(bx, bw, bh, gy));
    i = j;
  }

  /* 天線：比左右鄰居都高一截的樓 */
  for (let b = 0; b < buildings.length; b++) {
    const me = buildings[b].h;
    const l = b > 0 ? buildings[b - 1].h : 0;
    const r = b < buildings.length - 1 ? buildings[b + 1].h : 0;
    buildings[b].antenna = me > l + 22 && me > r + 22 && me > 70;
  }

  /* 海港區段（像素座標） */
  const waterSpans = [];
  i = 0;
  while (i < nCols) {
    if (!water[i]) { i++; continue; }
    let j = i;
    while (j < nCols && water[j]) j++;
    waterSpans.push([i * colW, j * colW]);
    i = j;
  }

  /* 路燈：沒有建築、沒有海的空地 */
  const lamps = [];
  const occupied = (x) => {
    for (const b of buildings) if (x >= b.x - 8 && x <= b.x + b.w + 8) return true;
    for (const s of waterSpans) if (x >= s[0] - 6 && x <= s[1] + 6) return true;
    return false;
  };
  for (let x = 40; x < w - 30; x += 110) {
    if (!occupied(x)) lamps.push(x + rand(-14, 14));
  }

  return { gy, buildings, waterSpans, lamps, w, h };
}

function makeBuilding(bx, bw, bh, gy) {
  const pad = 4;
  const stepX = 7, stepY = 10;
  const wcols = Math.max(1, Math.floor((bw - pad * 2 + (stepX - 4)) / stepX));
  const wrows = Math.max(1, Math.floor((bh - pad - 8 + (stepY - 5)) / stepY));
  const winW = 3.6, winH = 5;
  const x0 = bx + (bw - ((wcols - 1) * stepX + winW)) / 2;
  const y0 = gy - bh + 7;
  const windows = [];
  for (let r = 0; r < wrows; r++) {
    for (let c = 0; c < wcols; c++) {
      windows.push({
        x: x0 + c * stepX,
        y: y0 + r * stepY,
        target: Math.random() < 0.58 ? 1 : 0,
        lit: 0,
        delay: Math.random() * 650,
        flick: Math.random() < 0.05,
        ph: Math.random() * Math.PI * 2
      });
    }
  }
  return { x: bx, w: bw, h: bh, rows: wrows, windows, antenna: false };
}

/* ============================================================
   天空調色：黃昏 → 夜 → 黎明
   ============================================================ */
const SKY_KEYS = [
  { t: 0.15, top: [43, 35, 84],  mid: [110, 62, 106], low: [232, 138, 90] },
  { t: 0.5,  top: [5, 8, 18],    mid: [16, 26, 51],   low: [30, 44, 74]  },
  { t: 0.85, top: [30, 42, 82],  mid: [122, 92, 142], low: [242, 182, 140] }
];
function skyColors(t) {
  let a = SKY_KEYS[0], b = SKY_KEYS[1];
  if (t > 0.5) { a = SKY_KEYS[1]; b = SKY_KEYS[2]; }
  const k = clamp((t - a.t) / (b.t - a.t), 0, 1);
  const mix = (u, v) => u.map((c, i) => Math.round(lerp(c, v[i], k)));
  return { top: mix(a.top, b.top), mid: mix(a.mid, b.mid), low: mix(a.low, b.low) };
}
const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a === undefined ? 1 : a})`;
const nightK = (t) => clamp(1 - Math.abs(t - 0.5) / 0.32, 0, 1);

/* ============================================================
   渲染（view 參數化 → 明信片可重用）
   ============================================================ */
function renderScene(view) {
  const { c, w, h, g, t, now, isStatic } = view;
  const sky = skyColors(t);
  const nk = nightK(t);

  /* 天空 */
  const grad = c.createLinearGradient(0, 0, 0, g ? g.gy : h);
  grad.addColorStop(0, rgb(sky.top));
  grad.addColorStop(0.62, rgb(sky.mid));
  grad.addColorStop(1, rgb(sky.low));
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);

  /* 星星 */
  if (nk > 0.02) {
    for (const s of view.stars) {
      const tw = (RM || isStatic) ? 0.8 : 0.55 + 0.45 * Math.sin(now / 1400 + s.ph);
      c.globalAlpha = nk * tw * s.a;
      c.fillStyle = '#dfe8ff';
      c.fillRect(s.x * w, s.y * (g ? g.gy : h) * 0.85, s.r, s.r);
    }
    c.globalAlpha = 1;
  }

  /* 月亮 */
  if (nk > 0.05) {
    const mx = w * lerp(0.14, 0.86, clamp((t - 0.15) / 0.7, 0, 1));
    const my = (g ? g.gy : h) * (0.22 - 0.1 * Math.sin(Math.PI * clamp((t - 0.15) / 0.7, 0, 1)));
    const glow = c.createRadialGradient(mx, my, 2, mx, my, 46);
    glow.addColorStop(0, `rgba(240,244,255,${0.5 * nk})`);
    glow.addColorStop(1, 'rgba(240,244,255,0)');
    c.fillStyle = glow;
    c.fillRect(mx - 48, my - 48, 96, 96);
    c.globalAlpha = nk;
    c.fillStyle = '#f2f5ff';
    c.beginPath(); c.arc(mx, my, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = rgb(sky.top, 1);
    c.beginPath(); c.arc(mx - 4.5, my - 3, 9, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }

  /* 流星 */
  if (!isStatic) {
    for (const m of meteors) {
      const k = m.life;
      c.globalAlpha = Math.sin(Math.PI * k) * 0.9;
      c.strokeStyle = '#e8f0ff';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(m.x, m.y);
      c.lineTo(m.x - m.vx * 0.09, m.y - m.vy * 0.09);
      c.stroke();
      c.globalAlpha = 1;
    }
    if (plane) {
      const blink = Math.sin(now / 160) > 0.2;
      c.globalAlpha = 0.9;
      c.fillStyle = '#c8d4f0';
      c.fillRect(plane.x, plane.y, 3, 1.6);
      if (blink) { c.fillStyle = '#ff6b6b'; c.fillRect(plane.x - 2.5, plane.y - 0.5, 2, 2); }
      c.globalAlpha = 1;
    }
  }

  if (!g) return;   // 還沒有城市：畫筆跡

  const gy = g.gy;

  /* 地面 */
  c.fillStyle = 'rgba(6,9,18,0.96)';
  c.fillRect(0, gy, w, h - gy);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.fillRect(0, gy, w, 1);

  /* 海港 */
  for (const s of g.waterSpans) {
    const wg = c.createLinearGradient(0, gy, 0, h);
    wg.addColorStop(0, rgb(sky.low, 0.5));
    wg.addColorStop(1, rgb(sky.top, 0.9));
    c.fillStyle = wg;
    c.fillRect(s[0], gy, s[1] - s[0], h - gy);
  }

  /* 建築剪影 + 窗 */
  const silo = skyColors(t);
  const siloCol = `rgba(${Math.round(silo.top[0] * 0.55 + 8)},${Math.round(silo.top[1] * 0.55 + 9)},${Math.round(silo.top[2] * 0.55 + 20)},1)`;
  for (let bi = 0; bi < g.buildings.length; bi++) {
    const b = g.buildings[bi];
    const byTop = gy - b.h;
    c.fillStyle = siloCol;
    c.fillRect(b.x, byTop, b.w, b.h);

    if (b.antenna) {
      c.strokeStyle = siloCol;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(b.x + b.w / 2, byTop);
      c.lineTo(b.x + b.w / 2, byTop - 14);
      c.stroke();
      const on = isStatic || RM ? true : Math.sin(now / 700 + bi) > 0;
      if (on) {
        c.fillStyle = '#ff5d5d';
        c.beginPath(); c.arc(b.x + b.w / 2, byTop - 15.5, 1.8, 0, Math.PI * 2); c.fill();
      }
    }

    /* 窗 */
    const boost = boosted.has(bi);
    for (const win of b.windows) {
      let a = win.lit;
      if (isStatic) a = boost ? 1 : win.target;
      if (a <= 0.01) continue;
      if (win.flick && !RM && !isStatic && !boost) a *= 0.72 + 0.28 * Math.sin(now / 260 + win.ph);
      c.globalAlpha = 0.92 * a;
      c.fillStyle = '#ffc98f';
      c.fillRect(win.x, win.y, 3.6, 5);
    }
    c.globalAlpha = 1;

    /* hover / 鍵盤選取：屋頂描光 */
    if (bi === hoverI || bi === selI) {
      c.strokeStyle = bi === selI ? '#ffd9a8' : 'rgba(255,201,143,0.75)';
      c.lineWidth = 1.5;
      c.strokeRect(b.x + 0.5, byTop + 0.5, b.w - 1, b.h - 1);
    }
  }

  /* 倒影（海面上） */
  if (g.waterSpans.length) {
    c.save();
    c.beginPath();
    for (const s of g.waterSpans) c.rect(s[0], gy, s[1] - s[0], h - gy);
    c.clip();
    const wob = (RM || isStatic) ? 0 : 1;
    for (let bi = 0; bi < g.buildings.length; bi++) {
      const b = g.buildings[bi];
      const boost = boosted.has(bi);
      for (const win of b.windows) {
        let a = isStatic ? (boost ? 1 : win.target) : win.lit;
        if (a <= 0.01) continue;
        const ry = gy + (gy - win.y);
        if (ry > h) continue;
        const dx = wob * Math.sin(now / 900 + win.y * 0.08) * 1.6;
        c.globalAlpha = 0.16 * a;
        c.fillStyle = '#ffc98f';
        c.fillRect(win.x + dx, ry, 3.6, 7);
      }
    }
    c.globalAlpha = 1;
    c.restore();
  }

  /* 路燈 */
  for (const lx of g.lamps) {
    c.strokeStyle = 'rgba(150,160,190,0.5)';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(lx, gy); c.lineTo(lx, gy - 16); c.stroke();
    const lg = c.createRadialGradient(lx, gy - 17, 1, lx, gy - 17, 16);
    lg.addColorStop(0, 'rgba(255,201,143,0.55)');
    lg.addColorStop(1, 'rgba(255,201,143,0)');
    c.fillStyle = lg;
    c.fillRect(lx - 16, gy - 33, 32, 32);
    c.fillStyle = '#ffd9a8';
    c.beginPath(); c.arc(lx, gy - 17, 1.7, 0, Math.PI * 2); c.fill();
  }

  /* 雨 */
  if (weather === 'rain') {
    if (!RM && !isStatic) {
      c.strokeStyle = 'rgba(170,190,230,0.34)';
      c.lineWidth = 1;
      c.beginPath();
      for (const d of rain) {
        c.moveTo(d.x, d.y);
        c.lineTo(d.x - 1.5, d.y + 9);
      }
      c.stroke();
    }
    /* 濕地面反光 */
    c.globalAlpha = 0.1;
    c.fillStyle = '#aebfe8';
    c.fillRect(0, gy, w, 2.5);
    c.globalAlpha = 1;
  }
}

/* ---------- 畫圖中的筆跡 ---------- */
function renderStroke(c) {
  if (drawPts.length < 2) return;
  c.strokeStyle = '#ffca92';
  c.lineWidth = 2.6;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.shadowColor = 'rgba(255,181,107,0.7)';
  c.shadowBlur = 10;
  c.beginPath();
  c.moveTo(drawPts[0].x, drawPts[0].y);
  for (let i = 1; i < drawPts.length; i++) c.lineTo(drawPts[i].x, drawPts[i].y);
  c.stroke();
  c.shadowBlur = 0;
}

/* ============================================================
   主迴圈
   ============================================================ */
function step(now, dt) {
  /* 天色過渡 */
  if (Math.abs(skyT - skyTarget) > 0.001) {
    const k = RM ? 1 : 1 - Math.exp(-dt / 550);
    skyT = lerp(skyT, skyTarget, k);
    if (Math.abs(skyT - skyTarget) <= 0.001) skyT = skyTarget;
  }

  if (geo) {
    /* 窗燈 easing（含揭幕延遲） */
    for (let bi = 0; bi < geo.buildings.length; bi++) {
      const b = geo.buildings[bi];
      const boost = boosted.has(bi);
      const bDelay = b._delay || 0;
      for (const win of b.windows) {
        let target = boost ? 1 : win.target;
        if (phase === 'reveal' && now < revealAt + bDelay + win.delay) target = 0;
        const rate = RM ? 1 : clamp(dt / 340, 0, 1);
        win.lit += (target - win.lit) * rate;
      }
    }
    if (phase === 'reveal' && now >= revealEnd) {
      phase = 'alive';
      canvas.classList.add('alive');
      refreshStats(false);
    }

    /* 城市的呼吸：偶爾有人回家 / 關燈 */
    if (phase === 'alive' && !RM && now > nextLife) {
      nextLife = now + rand(2200, 5200);
      const b = geo.buildings[Math.floor(Math.random() * geo.buildings.length)];
      if (b && b.windows.length && !boosted.size) {
        const win = b.windows[Math.floor(Math.random() * b.windows.length)];
        win.target = win.target ? 0 : 1;
      }
    }
  }

  /* 流星 / 飛機 / 雨（減速模式全部跳過） */
  if (!RM && phase === 'alive' && nightK(skyT) > 0.4) {
    if (now > nextMeteor) {
      nextMeteor = now + rand(16000, 38000);
      meteors.push({ x: rand(W * 0.2, W * 0.9), y: rand(20, H * 0.3), vx: -rand(320, 480), vy: rand(120, 200), life: 0 });
    }
    if (!plane && now > nextPlane) {
      nextPlane = now + rand(24000, 52000);
      plane = { x: -20, y: rand(H * 0.08, H * 0.22), v: rand(28, 40) };
    }
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.life += dt / 900;
    m.x += m.vx * dt / 1000;
    m.y += m.vy * dt / 1000;
    if (m.life >= 1) meteors.splice(i, 1);
  }
  if (plane) {
    plane.x += plane.v * dt / 1000;
    if (plane.x > W + 20) plane = null;
  }
  if (weather === 'rain' && !RM) {
    for (const d of rain) {
      d.y += d.v * dt / 1000;
      d.x -= d.v * 0.16 * dt / 1000;
      if (d.y > H) { d.y = -10; d.x = rand(0, W + 30); }
    }
  }
}

function render(now) {
  ctx.clearRect(0, 0, W, H);
  renderScene({ c: ctx, w: W, h: H, g: geo, t: skyT, now, isStatic: false, stars });
  if (phase === 'draw') renderStroke(ctx);
}

function loop(now) {
  raf = 0;
  const dt = Math.min(64, now - prevT || 16);
  prevT = now;
  step(now, dt);
  render(now);
  if (!RM && pageVisible && onScreen) raf = requestAnimationFrame(loop);
}
function kickLoop() {
  if (RM || raf || !pageVisible || !onScreen) return;
  prevT = performance.now();
  raf = requestAnimationFrame(loop);
}
function stopLoop() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
}
/* 減速模式：事件驅動、單張渲染 */
function scheduleRender() {
  if (!RM) { kickLoop(); return; }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame((now) => {
    renderQueued = false;
    step(now, 1000);          // RM 下所有過渡一步到位
    render(now);
  });
}

document.addEventListener('visibilitychange', () => {
  pageVisible = !document.hidden;
  if (pageVisible) kickLoop(); else stopLoop();
});
if (window.IntersectionObserver) {
  new window.IntersectionObserver((es) => {
    onScreen = es[0].isIntersecting;
    if (onScreen) kickLoop(); else stopLoop();
  }).observe(canvas);
}

/* ============================================================
   建城 & 揭幕
   ============================================================ */
function buildCity(norm, opts) {
  const quick = opts && opts.quick;
  geo = buildGeometry(norm, W, H);
  boosted.clear();
  hoverI = selI = -1;

  const n = geo.buildings.length;
  const stepDelay = quick ? 26 : Math.min(85, 2100 / Math.max(1, n));
  let maxD = 0;
  for (let i = 0; i < n; i++) {
    const d = (quick ? 120 : 420) + i * stepDelay;
    geo.buildings[i]._delay = d;
    maxD = Math.max(maxD, d + 650);
  }

  phase = 'reveal';
  revealAt = performance.now();
  revealEnd = revealAt + (RM ? 0 : maxD + 400);
  skyTarget = 0.5;
  syncSkyButtons();
  if (RM) {
    phase = 'alive';
    skyT = 0.5;
    canvas.classList.add('alive');
  }

  hintEl.classList.add('gone');
  refreshStats(true);
  updateCanvasLabel();
  scheduleRender();
}

function cityStats() {
  if (!geo) return null;
  let lit = 0, total = 0;
  for (let bi = 0; bi < geo.buildings.length; bi++) {
    const boost = boosted.has(bi);
    for (const w of geo.buildings[bi].windows) {
      total++;
      if (boost || w.target >= 0.5) lit++;
    }
  }
  const pop = Math.round(lit * 2.7 + geo.buildings.length * 8);
  return { n: geo.buildings.length, lit, total, pop, harbor: geo.waterSpans.length > 0 };
}

/* 數字滾動 */
let statTween = 0;
const shown = { n: 0, lit: 0, pop: 0 };
function refreshStats(announceIt) {
  const s = cityStats();
  if (!s) { statsEl.textContent = '畫下第一筆，城市就會醒來。'; return; }
  const draw = () => {
    statsEl.innerHTML =
      `<span class="num">${fmt(shown.n)}</span> 棟樓 · ` +
      `<span class="num">${fmt(shown.lit)}</span> 扇窗亮著 · ` +
      `人口約 <span class="num">${fmt(shown.pop)}</span> 人` +
      (s.harbor ? ' · 有一座海港' : '');
  };
  if (RM) {
    shown.n = s.n; shown.lit = s.lit; shown.pop = s.pop;
    draw();
  } else {
    cancelAnimationFrame(statTween);
    const from = { ...shown }, t0 = performance.now();
    const tick = (now) => {
      const k = clamp((now - t0) / 550, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      shown.n = lerp(from.n, s.n, e);
      shown.lit = lerp(from.lit, s.lit, e);
      shown.pop = lerp(from.pop, s.pop, e);
      draw();
      if (k < 1) statTween = requestAnimationFrame(tick);
    };
    statTween = requestAnimationFrame(tick);
  }
  if (announceIt) {
    announce(`城市建成：${s.n} 棟樓、${s.lit} 扇窗亮著、人口約 ${s.pop} 人` + (s.harbor ? '，還有一座海港。' : '。'));
  }
}

function updateCanvasLabel() {
  const s = cityStats();
  const name = (nameEl.value || '無名').trim() || '無名';
  canvas.setAttribute('aria-label', s
    ? `${name}市的夜景：${s.n} 棟建築、${s.lit} 扇亮著的窗` + (s.harbor ? '、一座海港' : '')
    : '空白的畫布，等待你畫下一條天際線');
}

/* ============================================================
   輸入：畫線
   ============================================================ */
let drawing = false;
function evPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: clamp(e.clientX - r.left, 0, r.width), y: clamp(e.clientY - r.top, 0, r.height) };
}
canvas.addEventListener('pointerdown', (e) => {
  if (phase !== 'draw') return;
  drawing = true;
  drawPts = [evPos(e)];
  canvas.setPointerCapture(e.pointerId);
  hintEl.classList.add('gone');
  scheduleRender();
});
canvas.addEventListener('pointermove', (e) => {
  if (drawing) {
    drawPts.push(evPos(e));
    if (RM) scheduleRender();
    return;
  }
  if (phase !== 'alive' || !geo) return;
  const p = evPos(e);
  const before = hoverI;
  hoverI = hitBuilding(p.x, p.y);
  canvas.style.cursor = hoverI >= 0 ? 'pointer' : 'default';
  if (hoverI !== before && RM) scheduleRender();
});
canvas.addEventListener('pointerup', (e) => {
  if (!drawing) return;
  drawing = false;
  const xs = drawPts.map((p) => p.x);
  const span = Math.max(...xs) - Math.min(...xs);
  if (drawPts.length < 8 || span < W * 0.28) {
    announce('再長一點——從左畫到右，畫過整片天空。');
    hintEl.classList.remove('gone');
    drawPts = [];
    scheduleRender();
    return;
  }
  pointsNorm = decimate(drawPts).map((p) => [p.x / W, p.y / H]);
  lsSet('points', JSON.stringify(pointsNorm.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000])));
  drawPts = [];
  buildCity(pointsNorm, {});
});
canvas.addEventListener('pointercancel', () => { drawing = false; drawPts = []; scheduleRender(); });

function decimate(pts) {
  const MAX = 600;
  if (pts.length <= MAX) return pts;
  const out = [];
  const step = pts.length / MAX;
  for (let i = 0; i < MAX; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

function hitBuilding(x, y) {
  if (!geo) return -1;
  for (let i = 0; i < geo.buildings.length; i++) {
    const b = geo.buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= geo.gy - b.h - 6 && y <= geo.gy) return i;
  }
  return -1;
}

/* 點一棟樓 → 整棟點亮 */
canvas.addEventListener('click', (e) => {
  if (phase !== 'alive' || !geo) return;
  const p = evPos(e);
  const i = hitBuilding(p.x, p.y);
  if (i < 0) return;
  toggleBuilding(i);
});
function toggleBuilding(i) {
  const b = geo.buildings[i];
  if (boosted.has(i)) {
    boosted.delete(i);
    announce(`第 ${i + 1} 棟樓恢復平常的燈。`);
  } else {
    boosted.add(i);
    announce(`第 ${i + 1} 棟樓，${b.rows} 層樓的燈全亮了。`);
  }
  refreshStats(false);
  updateCanvasLabel();
  scheduleRender();
}

/* 鍵盤：←→ 選樓、Enter 點燈 */
canvas.addEventListener('keydown', (e) => {
  if (phase !== 'alive' || !geo || !geo.buildings.length) return;
  const n = geo.buildings.length;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    selI = selI < 0 ? (dir > 0 ? 0 : n - 1) : (selI + dir + n) % n;
    const b = geo.buildings[selI];
    announce(`第 ${selI + 1} 棟，共 ${n} 棟，${b.rows} 層樓${boosted.has(selI) ? '，燈全亮' : ''}。Enter 點燈。`);
    scheduleRender();
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (selI >= 0) { e.preventDefault(); toggleBuilding(selI); }
  } else if (e.key === 'Escape') {
    selI = -1;
    scheduleRender();
  }
});

/* ============================================================
   控制列
   ============================================================ */
function syncSkyButtons() {
  document.querySelectorAll('[data-sky]').forEach((b) =>
    b.setAttribute('aria-pressed', Math.abs(parseFloat(b.dataset.sky) - skyTarget) < 0.01 ? 'true' : 'false'));
}
document.querySelectorAll('[data-sky]').forEach((btn) => {
  btn.addEventListener('click', () => {
    skyTarget = parseFloat(btn.dataset.sky);
    syncSkyButtons();
    scheduleRender();
  });
});
document.querySelectorAll('[data-weather]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-weather]').forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    weather = btn.dataset.weather;
    lsSet('weather', weather);
    if (weather === 'rain') initRain();
    scheduleRender();
  });
});

$('#redraw').addEventListener('click', () => {
  phase = 'draw';
  geo = null;
  pointsNorm = [];
  drawPts = [];
  boosted.clear();
  hoverI = selI = -1;
  meteors = []; plane = null;
  canvas.classList.remove('alive');
  lsDel('points');
  skyTarget = 0.15;
  syncSkyButtons();
  hintEl.classList.remove('gone');
  refreshStats(false);
  updateCanvasLabel();
  announce('畫布清空了，畫一條新的天際線吧。');
  scheduleRender();
});

/* 骰子城市：層疊正弦 + 隨機港灣 */
$('#dice').addEventListener('click', () => {
  const pts = [];
  const p1 = rand(0, 6.28), p2 = rand(0, 6.28), p3 = rand(0, 6.28);
  const a1 = rand(0.1, 0.2), a2 = rand(0.05, 0.12), a3 = rand(0.02, 0.06);
  const base = rand(0.5, 0.6);
  const hasHarbor = Math.random() < 0.45;
  const hx = rand(0.15, 0.75), hw = rand(0.1, 0.2);
  for (let x = 0.02; x <= 0.98; x += 0.008) {
    let y = base
      - a1 * Math.sin(x * 5 + p1)
      - a2 * Math.sin(x * 13 + p2)
      - a3 * Math.sin(x * 29 + p3);
    if (hasHarbor && x > hx && x < hx + hw) y = 0.93;   // 探到底 → 海港
    pts.push([x, clamp(y, 0.15, 0.95)]);
  }
  pointsNorm = pts;
  lsSet('points', JSON.stringify(pts.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000])));
  buildCity(pts, {});
});

/* ---------- 城市命名 ---------- */
nameEl.addEventListener('input', () => {
  lsSet('name', nameEl.value.slice(0, 10));
  updateCanvasLabel();
});

/* ============================================================
   明信片（PNG 匯出）
   ============================================================ */
$('#postcard').addEventListener('click', () => {
  const btn = $('#postcard');
  if (!geo || phase === 'draw') {
    announce('先畫一座城市，才能寄明信片。');
    return;
  }
  const PW = 1200, SH = 640, STRIP = 130;
  const off = document.createElement('canvas');
  off.width = PW; off.height = SH + STRIP;
  const c = off.getContext('2d');

  const g2 = buildGeometry(pointsNorm, PW, SH);
  const stars2 = makeStars(PW, SH);
  /* 沿用目前整棟點亮的樓（比例對映） */
  const saveBoost = boosted;
  boosted = new Set([...saveBoost].filter((i) => i < g2.buildings.length));
  renderScene({ c, w: PW, h: SH, g: g2, t: skyT, now: 0, isStatic: true, stars: stars2 });
  boosted = saveBoost;

  /* 底部紙條 */
  c.fillStyle = '#f2e8d5';
  c.fillRect(0, SH, PW, STRIP);
  c.fillStyle = '#d8c9ac';
  c.fillRect(0, SH, PW, 3);
  const name = (nameEl.value.trim() || '無名');
  const s = cityStats();
  const today = new Date();
  const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  c.fillStyle = '#3a3020';
  c.font = '600 34px "Noto Serif TC", Georgia, serif';
  c.fillText(`${name}市`, 48, SH + 62);
  c.font = '20px "PingFang TC", "Microsoft JhengHei", sans-serif';
  c.fillStyle = '#6d6047';
  c.fillText(`${s.n} 棟樓 · ${s.lit} 扇窗亮著 · 人口約 ${fmt(s.pop)} 人${s.harbor ? ' · 臨海' : ''}`, 48, SH + 96);
  /* 郵票 */
  c.strokeStyle = '#b4a582';
  c.lineWidth = 2;
  c.setLineDash([5, 4]);
  c.strokeRect(PW - 180, SH + 24, 132, 82);
  c.setLineDash([]);
  c.fillStyle = '#8d7c58';
  c.font = '15px "PingFang TC", sans-serif';
  c.fillText('一筆城市', PW - 158, SH + 58);
  c.fillText(dateStr, PW - 158, SH + 82);

  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `一筆城市-${name}-${dateStr.replace(/\./g, '')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');

  const sent = Number(lsGet('postcards', '0')) + 1;
  lsSet('postcards', String(sent));
  btn.classList.add('sent');
  btn.textContent = '已寄出 ✓';
  announce(`明信片已存成圖片，這是第 ${sent} 張。`);
  setTimeout(() => { btn.classList.remove('sent'); btn.textContent = '寄出明信片'; }, 1800);
});

/* ============================================================
   星星、雨滴、尺寸
   ============================================================ */
function makeStars(w, h) {
  const arr = [];
  const n = Math.round((w * h) / 9500);
  for (let i = 0; i < n; i++) {
    arr.push({ x: Math.random(), y: Math.random(), r: Math.random() < 0.85 ? 1 : 1.6, a: rand(0.35, 1), ph: rand(0, 6.28) });
  }
  return arr;
}
function initRain() {
  rain = [];
  const n = Math.round(W / 7);
  for (let i = 0; i < n; i++) rain.push({ x: rand(0, W + 30), y: rand(-H, H), v: rand(420, 640) });
}

let resizeTimer = 0;
function resize() {
  const r = frame.getBoundingClientRect();
  const cw = Math.max(280, r.width - 20);
  const ch = Math.round(clamp(cw * 0.56, 220, window.innerHeight * 0.62));
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = cw; H = ch;
  canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * DPR);
  canvas.height = Math.round(ch * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  stars = makeStars(W, H);
  if (weather === 'rain') initRain();
  if (pointsNorm.length && phase !== 'draw') {
    const keep = new Set(boosted);
    geo = buildGeometry(pointsNorm, W, H);
    boosted = new Set([...keep].filter((i) => i < geo.buildings.length));
    for (const b of geo.buildings) { b._delay = 0; for (const win of b.windows) win.lit = win.target; }
    phase = 'alive';
    canvas.classList.add('alive');
  }
  scheduleRender();
}
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 180);
});

/* ============================================================
   啟動：讀回上次的城市
   ============================================================ */
function init() {
  syncRM();
  nameEl.value = lsGet('name', '');
  weather = lsGet('weather', 'clear');
  document.querySelectorAll('[data-weather]').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.weather === weather ? 'true' : 'false'));

  resize();
  if (weather === 'rain') initRain();

  let saved = null;
  try { saved = JSON.parse(lsGet('points', 'null')); } catch (e) { saved = null; }
  if (Array.isArray(saved) && saved.length > 8) {
    pointsNorm = saved;
    buildCity(pointsNorm, { quick: true });
    announce('歡迎回來，你的城市還亮著。');
  } else {
    skyT = skyTarget = 0.15;
    syncSkyButtons();
    refreshStats(false);
  }
  kickLoop();
  scheduleRender();
}
init();

})();

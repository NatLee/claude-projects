#!/usr/bin/env node
/* ==========================================================================
 * 題材軸 — 防重複的共用定義（brief.js／add.js／check.js／題材回填.js 都 require 這一支）
 *
 * 為什麼存在（2026-09-09）：
 *   全站 206 件盤點後發現，真正在重複的不是「類別／emoji／LS 前綴」——那三樣
 *   從來沒撞過——而是沒有任何地方記錄的四件事：
 *     · 體裁：最近 40 件有 37 件是「歷史冷知識 ＋ 揭曉」，六大類只是換題材
 *     · 標題句型：「你／牠／請／那」開頭 7 月 13% → 9 月 58%
 *     · 年代與地理：58% 落在 1900 年前，歐洲 50%＋美國 40%
 *     · 主互動：點擊揭曉 100%
 *   「和最近幾天不同」以前只能靠當天自覺，而自覺會漂。這支檔把那些軸變成
 *   可比對的資料：每件作品在 tools/題材檔案.json 申報六軸，brief.js 每天算出
 *   「今天禁止用」的值，add.js 擋下撞車，check.js 補警告。
 *
 * 紀律：values 只能加不能改字面（改了會讓舊資料對不上）；改動請跑全站健檢。
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOSSIER = path.join(__dirname, '題材檔案.json');

/* ── 軸 ──────────────────────────────────────────────────
 * window = 最近 N 個「發布日」內不得重複（不是日曆天：本站不是每天都發，
 *          用日曆天的話一放假禁用清單就整個清空，等於沒擋）
 * quota  = 最近 of 件裡同一個值最多 max 件，超過就擋
 *
 * 2026-09-09 第一版：體裁只做軟性提醒。
 * 2026-09-09 第二版（使用者複審後）：體裁改硬配額、新增題材領域軸，
 *   並把標題從「只看開頭句型」擴成句型＋長度帶＋用字重疊三管。
 *   原因：句型一個「名詞短語」桶就佔 62%，擋它等於擋掉一半寫法、
 *   不擋又等於沒擋；真正在收斂的是長度（中位 5→8 字）與用字
 *   （近 40 件標題 324 字裡有 145 字次來自同 27 個字）。
 */
const AXES = {
  genre: {
    key: 'genre', label: '體裁', quota: { of: 7, max: 3 },
    values: ['歷史揭曉', '科學機制', '能用的工具', '遊戲玩具', '當代觀察', '動手實驗'],
  },
  domain: {
    key: 'domain', label: '題材領域', window: 7,
    values: ['物理化學', '生物醫學', '心理認知', '語言文字', '工程建築',
             '藝術設計', '社會制度', '數學資訊', '飲食日常', '運動遊戲'],
  },
  container: {
    key: 'container', label: '敘事容器', window: 5,
    values: ['捲動敘事', '分章旅程', '假介面', '假文件', '逐步揭曉', '實驗台',
             '可玩故事', '沉浸全螢幕', '前後對照', '倒數解謎'],
  },
  verb: {
    key: 'verb', label: '主互動', window: 4,
    values: ['點擊揭曉', '拖曳', '滑桿', '輸入文字', '按住', '選分支',
             '繪製', '聆聽', '餵自己的資料', '計時反應'],
  },
  era: {
    key: 'era', label: '年代', window: 3,
    values: ['古代', '1500s', '1600s', '1700s', '1800s', '1900前半', '1900後半',
             '2000後', '當代', '無年代'],
  },
  region: {
    key: 'region', label: '地理', window: 3,
    values: ['歐洲', '美國', '日本', '華語圈', '其他地區', '全球', '無'],
  },
};
/* 標題三軸都不用申報，全部從標題本身推導 */
const TITLE_WINDOW = 5;        /* 句型：5 個發布日內不重複 */
/* 長度帶只擋「和上一件同帶」。窗口設 2 會強迫短→中→長嚴格三循環，
   而「長」（≥11 字）歷來只佔 11%，每三天硬湊一個只會生出灌水標題。
   真正要防的是某一帶整個消失，交給下面的 MIN_MIX 管。 */
const TITLE_LEN_WINDOW = 1;
const TITLE_LEN_MIN_MIX = 2;   /* 近 9 件每帶至少 2 件；掛零才擋，只有 1 件是提醒 */
const TITLE_OVERLAP_LOOKBACK = 10;
const TITLE_OVERLAP_BLOCK = 0.5;   /* 與近 10 件任一標題的實詞重疊率上限 */
const TITLE_OVERLAP_WARN = 0.34;   /* 全站歷史的 90 百分位就在這附近 */

/* ── 標題句型 ──
 * 原本只有一個「名詞短語」大桶，佔 62%——擋它等於擋掉一半寫法。拆成
 * 「主謂句」（有謂語，像「橋自己扭了起來」）與「純名詞」（像「硬幣的鋸齒」），
 * 再補一個「疑問」，最大桶降到 46%；配上 5 天窗口，實際用量上限約 20%。
 */
const TITLE_PRED = /(是|在|會|被|把|了|著|起來|過|要|能|該|都|自己|站|走|飛|燒|長|掉|叫|開|通|插|來|去|沒)/;
function titleForm(title) {
  const t = String(title || '');
  if (/^[「『"]/.test(t)) return '引語';
  if (/^(你|妳)/.test(t)) return '你…';
  if (/^(牠|它|他|她)/.test(t)) return '牠它…';
  if (/^(我|我們)/.test(t)) return '我…';
  if (/(誰|什麼|哪|為什麼|嗎|呢|多少)/.test(t)) return '疑問';
  if (/^(請|把|讓|來|去|拿|按|捏|秤|拉|拔|寫|選|敲|丟|翻|摸|踩|吹|數|換|切|試)/.test(t)) return '祈使';
  if (/^(那|這)/.test(t)) return '指示詞';
  if (/^[第一二三四五六七八九十百千萬零0-9]/.test(t)) return '數字';
  if (/^(沒|不|別|無|還沒|從來)/.test(t)) return '否定';
  if (/[，。？！]/.test(t)) return '完整句';
  return TITLE_PRED.test(t) ? '主謂句' : '純名詞';
}
const TITLE_FORMS = ['你…', '牠它…', '我…', '疑問', '祈使', '指示詞', '數字',
                     '否定', '引語', '完整句', '主謂句', '純名詞'];

/* ── 標題長度帶 ── 中位數從 6 月的 5 字漂到 9 月的 8 字，範圍也從 2–17 縮到 4–13 */
const TITLE_BANDS = ['短', '中', '長'];
function titleBand(title) {
  const n = [...String(title || '')].length;
  return n <= 6 ? '短' : n <= 10 ? '中' : '長';
}

/* ── 標題用字重疊 ──
 * 「RAG 實驗室」↔「指令注入實驗室」重疊 1.00、「記憶實驗室」↔「蝴蝶效應實驗室」0.60，
 * 這種同家族命名句型軸抓不到。虛詞不算，只比實詞字。
 */
const TITLE_STOP = new Set([...'的了一個在是不那這有和與就都又還把被過著我你他她它牠們之其為以於']);
function titleChars(title) {
  const s = new Set();
  for (const ch of String(title || '')) if (/[一-鿿]/.test(ch) && !TITLE_STOP.has(ch)) s.add(ch);
  return s;
}
/* 回傳與「最像的那一個」舊標題的重疊率 */
function titleOverlap(title, recentTitles) {
  const cs = titleChars(title);
  if (!cs.size) return { ratio: 0, against: null };
  let best = { ratio: 0, against: null };
  for (const p of recentTitles) {
    const ps = titleChars(p);
    if (!ps.size) continue;
    let inter = 0;
    for (const c of cs) if (ps.has(c)) inter++;
    const ratio = inter / cs.size;
    if (ratio > best.ratio) best = { ratio, against: p };
  }
  return best;
}

/* ── 口頭禪（依 2026-09-09 全站量測排序，前面的最氾濫） ──
 * 用途有二：check.js 對單頁做密度警告；brief.js 每天輪流點名最氾濫的幾個。
 */
const TICS = ['只是', '這是', '一件事', '沒有人', '答案', '其實', '結果', '一路',
              '整個', '親手', '這不是', '故事', '全世界', '真正的', '一句話',
              '你以為', '當場', '從來沒有', '真相', '刻意不說'];
const TIC_PAGE_BUDGET = 8;   /* 一頁最多命中幾個不同的口頭禪 */
const TIC_REPEAT_MAX = 3;    /* 同一個口頭禪一頁最多出現幾次 */

/* ── 題材檔案讀寫 ── */
function loadDossier() {
  if (!fs.existsSync(DOSSIER)) return [];
  try { return JSON.parse(fs.readFileSync(DOSSIER, 'utf8')); }
  catch (e) { throw new Error(`tools/題材檔案.json 無法解析：${e.message}`); }
}
function saveDossier(rows) {
  fs.writeFileSync(DOSSIER, JSON.stringify(rows, null, 2) + '\n');
}

/* 頁面可見文字（去掉 script／style／標籤）——口頭禪只看讀者真的會讀到的字 */
function visibleText(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}
function ticReport(text) {
  const hits = [];
  for (const t of TICS) {
    const n = text.split(t).length - 1;
    if (n > 0) hits.push({ tic: t, n });
  }
  hits.sort((a, b) => b.n - a.n);
  return { hits, distinct: hits.length, worst: hits[0] || null };
}

/* ── 核心：算出「今天禁止用」 ──
 * rows：題材檔案（每筆要有 dir/date 與各軸）
 * byDir：dir → data.js 那筆（拿 title 推標題句型）
 * 回傳每一軸的 banned Set＋為什麼被擋的說明。
 */
function bans(rows, byDir, today) {
  const sorted = rows.slice().filter(r => r.date && r.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const uniqDays = [...new Set(sorted.map(r => r.date))];   /* 一天可能多件 */
  const withinDays = (n) => {
    const keep = new Set(uniqDays.slice(0, n));
    return sorted.filter(r => keep.has(r.date));
  };

  const out = { axes: {}, title: null, band: null, recentTitles: [], mix: [] };
  for (const ax of Object.values(AXES)) {
    if (ax.quota) {
      /* 配額：最近 of 件裡同一個值最多 max 件。看「件」不看「天」——真正的
         問題是 40 件裡 37 件同體裁，而不是連續幾天。額滿的值就進禁用清單。 */
      const last = sorted.slice(0, ax.quota.of);
      const tally = new Map();
      for (const r of last) if (r[ax.key]) tally.set(r[ax.key], (tally.get(r[ax.key]) || 0) + 1);
      const banned = new Map();
      for (const [v, n] of tally) {
        if (n >= ax.quota.max) banned.set(v, `近 ${last.length} 件已有 ${n} 件，額滿 ${ax.quota.max}`);
      }
      out.axes[ax.key] = { axis: ax, banned, tally, of: last.length,
                           free: ax.values.filter(v => !banned.has(v)) };
      continue;
    }
    const recent = withinDays(ax.window);
    const banned = new Map();               /* 值 → 最近一次用它的日期 */
    for (const r of recent) if (r[ax.key] && r[ax.key] !== '未標註') {
      banned.set(r[ax.key], banned.get(r[ax.key]) || r.date);
    }
    out.axes[ax.key] = { axis: ax, banned, free: ax.values.filter(v => !banned.has(v)) };
  }

  const titleOf = (r) => (byDir && byDir[r.dir] && byDir[r.dir].title) || '';

  /* 標題句型 */
  const bannedT = new Map();
  for (const r of withinDays(TITLE_WINDOW)) {
    const t = titleOf(r);
    if (t) bannedT.set(titleForm(t), bannedT.get(titleForm(t)) || r.date);
  }
  out.title = { banned: bannedT, free: TITLE_FORMS.filter(v => !bannedT.has(v)), window: TITLE_WINDOW };

  /* 標題長度帶 */
  const bannedB = new Map();
  for (const r of withinDays(TITLE_LEN_WINDOW)) {
    const t = titleOf(r);
    if (t) bannedB.set(titleBand(t), bannedB.get(titleBand(t)) || r.date);
  }
  out.band = { banned: bannedB, free: TITLE_BANDS.filter(v => !bannedB.has(v)), window: TITLE_LEN_WINDOW };

  /* 長度帶配比（軟性）：近 9 件裡有哪一帶少於 TITLE_LEN_MIN_MIX */
  const last9 = sorted.slice(0, 9).map(titleOf).filter(Boolean);
  if (last9.length >= 9) {
    const bt = new Map(TITLE_BANDS.map(b => [b, 0]));
    for (const t of last9) bt.set(titleBand(t), bt.get(titleBand(t)) + 1);
    for (const [b, n] of bt) {
      if (n < TITLE_LEN_MIN_MIX) out.mix.push({ band: b, n, of: last9.length, starved: n === 0 });
    }
  }

  /* 用字重疊要比對的近期標題 */
  out.recentTitles = sorted.slice(0, TITLE_OVERLAP_LOOKBACK).map(titleOf).filter(Boolean);

  return out;
}

/* 今天要禁用的口頭禪：取最近 12 件裡最常出現的幾個 */
function hotTics(rows, n = 5, lookback = 12) {
  const recent = rows.slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, lookback);
  const tally = new Map();
  for (const r of recent) {
    const f = path.join(ROOT, r.dir, 'index.html');
    if (!fs.existsSync(f)) continue;
    const txt = visibleText(fs.readFileSync(f, 'utf8'));
    for (const { tic } of ticReport(txt).hits) tally.set(tic, (tally.get(tic) || 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([tic, k]) => ({ tic, seen: k, of: Math.min(lookback, recent.length) }));
}

module.exports = {
  ROOT, DOSSIER, AXES, TICS, TIC_PAGE_BUDGET, TIC_REPEAT_MAX,
  TITLE_WINDOW, TITLE_FORMS, TITLE_BANDS, TITLE_LEN_WINDOW, TITLE_LEN_MIN_MIX,
  TITLE_OVERLAP_LOOKBACK, TITLE_OVERLAP_BLOCK, TITLE_OVERLAP_WARN,
  titleForm, titleBand, titleChars, titleOverlap,
  loadDossier, saveDossier, visibleText, ticReport, bans, hotTics,
};

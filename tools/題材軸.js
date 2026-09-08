#!/usr/bin/env node
/* ==========================================================================
 * 題材軸 — 防重複的共用定義（brief.js／add.js／check.js 都 require 這一支）
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

/* ── 六軸 ────────────────────────────────────────────────
 * window = 幾天內不得重複（0 = 只做軟性提醒，不擋）
 * 依 2026-09-09 使用者裁示：體裁軟性提醒；容器／互動／標題句型／年代／地理硬擋。
 */
const AXES = {
  genre: {
    key: 'genre', label: '體裁', window: 0, soft: 3,
    values: ['歷史揭曉', '科學機制', '能用的工具', '遊戲玩具', '當代觀察', '語言文字'],
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
/* 標題句型不用申報，直接從標題推導 */
const TITLE_WINDOW = 5;

/* ── 標題句型（推導，不用申報） ── */
function titleForm(title) {
  const t = String(title || '');
  if (/^[「『"]/.test(t)) return '引語';
  if (/^(你|妳)/.test(t)) return '你…';
  if (/^(牠|它|他|她)/.test(t)) return '牠它…';
  if (/^我/.test(t)) return '我…';
  if (/^(請|把|讓|來|去|拿|按|捏|秤|拉|拔|寫|選|敲)/.test(t)) return '祈使';
  if (/^(那|這)/.test(t)) return '指示詞';
  if (/^[第一二三四五六七八九十百千萬零0-9]/.test(t)) return '數字';
  if (/^(沒|不|別|無|還沒|從來)/.test(t)) return '否定';
  if (/[，。？！]/.test(t)) return '完整句';
  return '名詞短語';
}
const TITLE_FORMS = ['你…', '牠它…', '我…', '祈使', '指示詞', '數字', '否定',
                     '引語', '完整句', '名詞短語'];

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

  const out = { axes: {}, soft: [], title: null };
  const SOFT_LOOKBACK = 7;                  /* 軟性軸看最近 7 件，不看天 */
  for (const ax of Object.values(AXES)) {
    if (!ax.window) {
      /* 軟性提醒：最近 7 件裡有沒有哪個值一家獨大。看「件」不看「天」——
         真正的問題是 40 件裡 37 件同體裁，而不是連續幾天。 */
      const last = sorted.slice(0, SOFT_LOOKBACK);
      const tally = new Map();
      for (const r of last) if (r[ax.key]) tally.set(r[ax.key], (tally.get(r[ax.key]) || 0) + 1);
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= ax.soft) {
        out.soft.push({ axis: ax, value: top[0], streak: top[1], of: last.length });
      }
      continue;
    }
    const recent = withinDays(ax.window);
    const banned = new Map();               /* 值 → 最近一次用它的日期 */
    for (const r of recent) if (r[ax.key]) banned.set(r[ax.key], banned.get(r[ax.key]) || r.date);
    out.axes[ax.key] = { axis: ax, banned, free: ax.values.filter(v => !banned.has(v)) };
  }

  /* 標題句型（從 data.js 的 title 推導） */
  const recentT = withinDays(TITLE_WINDOW);
  const bannedT = new Map();
  for (const r of recentT) {
    const p = byDir && byDir[r.dir];
    if (p && p.title) bannedT.set(titleForm(p.title), bannedT.get(titleForm(p.title)) || r.date);
  }
  out.title = { banned: bannedT, free: TITLE_FORMS.filter(v => !bannedT.has(v)), window: TITLE_WINDOW };

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
  ROOT, DOSSIER, AXES, TITLE_WINDOW, TITLE_FORMS, TICS,
  TIC_PAGE_BUDGET, TIC_REPEAT_MAX,
  titleForm, loadDossier, saveDossier, visibleText, ticReport, bans, hotTics,
};

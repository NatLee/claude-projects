#!/usr/bin/env node
/* ==========================================================================
 * 一鍵專案簡報：node tools/brief.js
 *
 * 目的：把「每日流程步驟 1 的偵察工作」壓成一次小輸出，取代逐一閱讀
 *   assets/data.js 前 60 行、tools/保養名冊.json、grep emoji／LS 前綴。
 * 輸出刻意精簡（<80 行），供 AI 協作者以最少 token 掌握現況。
 * 只讀不寫。詳細規範見 CLAUDE.md 與 PROMPT.md。
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/data.js'), 'utf8'), ctx);
const P = vm.runInContext('PROJECTS', ctx);

const line = '─'.repeat(56);
console.log(line);
console.log('每日小專案 · 一鍵簡報（只讀。規範見 CLAUDE.md）');
console.log(line);

/* 今日之星與總量 */
const cats = {};
P.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
console.log(`作品 ${P.length} 件｜今日之星 ${P[0].date}「${P[0].title}」${P[0].emoji}`);
console.log('類別 ' + Object.entries(cats).map(([c, n]) => `${c} ${n}`).join('｜'));

/* 近 14 天：去重對照（類別／題材／emoji／六軸） */
const cut = new Date(P[0].date + 'T00:00:00Z');
cut.setUTCDate(cut.getUTCDate() - 13);
const cutStr = cut.toISOString().slice(0, 10);
const T = require('./題材軸.js');
const dossier = T.loadDossier();
const byDirD = Object.fromEntries(dossier.map(r => [r.dir, r]));
console.log(line);
console.log('近 14 天（類別｜體裁｜領域｜容器｜互動｜年代｜地理｜標題句型／長度）');
for (const p of P.filter(p => p.date >= cutStr)) {
  const d = byDirD[p.dir] || {};
  console.log(` ${p.date}｜${p.emoji} ${p.title}`);
  console.log(`   ${p.category}｜${d.genre || '?'}｜${d.domain || '?'}｜${d.container || '?'}｜${d.verb || '?'}` +
              `｜${d.era || '?'}｜${d.region || '?'}｜${T.titleForm(p.title)}／${T.titleBand(p.title)}`);
}

/* ── 今天禁止用（硬規則：撞到就別做，換一個） ── */
const todayForBans = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const byDirP = Object.fromEntries(P.map(p => [p.dir, p]));
const B = T.bans(dossier, byDirP, todayForBans);
console.log(line);
console.log('★ 今天禁止用（這些是「最近幾天已經用過」的，換一個沒用過的）');
const show = (label, banned, free, note) => {
  const b = [...banned.keys()].filter(v => v !== '未標註');
  console.log(`  ${label}（${note}）`);
  console.log(`    ✗ ${b.length ? b.join('、') : '（無）'}`);
  console.log(`    ✓ 可選：${free.join('、')}`);
};
for (const k of Object.keys(T.AXES)) {
  const a = B.axes[k];
  show(a.axis.label, a.banned,
       a.free, a.axis.quota ? `近 ${a.of} 件同一種最多 ${a.axis.quota.max} 件` : `${a.axis.window} 天內不重複`);
  if (a.axis.quota && a.tally.size) {
    console.log(`      近況：${[...a.tally.entries()].sort((x, y) => y[1] - x[1]).map(([v, n]) => `${v}${n}`).join('、')}`);
  }
}
show('標題句型', B.title.banned, B.title.free, `${B.title.window} 天內不重複`);
show('標題長度', B.band.banned, B.band.free, '不得與上一件同帶／短≤6字、中7–10、長≥11');
for (const m of B.mix) {
  console.log(m.starved
    ? `      ✗ 近 ${m.of} 件一件「${m.band}」標題都沒有——今天必須寫這一帶`
    : `      ⚠ 近 ${m.of} 件只有 ${m.n} 件是「${m.band}」標題——今天優先寫這一帶`);
}
if (B.recentTitles.length) {
  console.log(`  標題用字：不得與近 ${B.recentTitles.length} 件任一標題的實詞重疊超過 ` +
              `${Math.round(T.TITLE_OVERLAP_BLOCK * 100)}%（超過 ${Math.round(T.TITLE_OVERLAP_WARN * 100)}% 會提醒）`);
  console.log(`    近期標題：${B.recentTitles.join('、')}`);
}
const hot = T.hotTics(dossier);
if (hot.length) {
  console.log(`  口頭禪：近 ${hot[0].of} 件裡最氾濫的是 ` +
    hot.map(h => `「${h.tic}」${h.seen}次`).join('、') + '——今天這幾個詞盡量一次都別用');
}

/* 已用 emoji（新作品要挑不在此列的） */
const emo = [...new Set(P.map(p => p.emoji))];
console.log(line);
console.log(`已用 emoji ${emo.length} 個（新作避開）：`);
for (let i = 0; i < emo.length; i += 30) console.log(' ' + emo.slice(i, i + 30).join(''));

/* 已用 localStorage 前綴（掃 projects/ 的 const LS='…'） */
const prefixes = new Set();
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    if (n.startsWith('.')) continue;
    const abs = path.join(d, n);
    if (fs.statSync(abs).isDirectory()) walk(abs);
    else if (/\.(html|js)$/.test(n)) {
      const m = fs.readFileSync(abs, 'utf8').match(/const LS\s*=\s*'([^']+)'/g) || [];
      m.forEach(s => prefixes.add(s.match(/'([^']+)'/)[1]));
    }
  }
})(path.join(ROOT, 'projects'));
console.log(line);
console.log('已用 LS 前綴（新作避開）：' + [...prefixes].sort().join(' '));

/* 保養：最久未保養的一件 */
try {
  const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/保養名冊.json'), 'utf8'));
  const mkey = r => (r.lastMaintained || '0000-00-00') + '|' + (r.created || '9999-99-99');
  let oldest = null;
  for (const r of roster) if (!oldest || mkey(r) < mkey(oldest)) oldest = r;
  const done = roster.filter(r => r.lastMaintained).length;
  console.log(line);
  console.log(`保養 ${done}/${roster.length}｜今日保養對象：${oldest.dir}（上次：${oldest.lastMaintained || '從未'}）`);
} catch (e) { console.log('保養名冊讀取失敗：' + e.message); }

const todayTW = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
console.log(line);
console.log(`台灣今天 ${todayTW}｜新頁鷹架：node tools/new-page.js --help｜交付前：node tools/check.js`);
console.log(line);

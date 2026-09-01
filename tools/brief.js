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

/* 近 14 天：去重對照（類別／題材／emoji） */
const cut = new Date(P[0].date + 'T00:00:00Z');
cut.setUTCDate(cut.getUTCDate() - 13);
const cutStr = cut.toISOString().slice(0, 10);
console.log(line);
console.log('近 14 天（構思新題目時避開這些類別輪次、題材與容器）');
for (const p of P.filter(p => p.date >= cutStr)) {
  console.log(` ${p.date}｜${p.emoji} ${p.title}｜${p.category}`);
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

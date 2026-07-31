#!/usr/bin/env node
/*
 * 掛上首頁：node tools/add.js --title "專案名" --emoji "✦" --dir "projects/YYYY-MM/YYYY-MM-DD-專案名" \
 *                             --category "六大類之一" --desc "≤120 字的一句話介紹" [--date YYYY-MM-DD]
 *
 * 取代「手動編輯 assets/data.js 頂端」：先驗證欄位、實體資料夾、desc 長度與
 * 重複疑慮，再對 anchor 做最小插入（不重排全檔，降低與並行 session 互相覆蓋
 * 的機會），寫完自動跑 tools/check.js 收尾。驗證不過就不動檔案。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CATEGORIES = ['網路趣聞・冷知識', '奇聞軼事', '科學趣聞', '學習新知', '生活痛點小工具', '創意・娛樂'];
const chars = (s) => [...String(s)].length;

/* ---- 讀參數 ---- */
const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const m = argv[i].match(/^--(date|title|emoji|dir|category|desc)$/);
  if (!m) { console.error(`不認得的參數：${argv[i]}`); process.exit(1); }
  opts[m[1]] = argv[++i];
}
if (!opts.date) opts.date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

const errors = [];
const warnings = [];

/* ---- 驗證 ---- */
for (const f of ['title', 'emoji', 'dir', 'category', 'desc']) {
  if (!opts[f]) errors.push(`缺 --${f}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) errors.push(`date 格式應為 YYYY-MM-DD：${opts.date}`);
else {
  const d = new Date(opts.date + 'T00:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== opts.date) errors.push(`date 不是真實日曆日：${opts.date}`);
}
if (opts.category && !CATEGORIES.includes(opts.category)) errors.push(`category「${opts.category}」不在六大類中`);
if (opts.desc) {
  const n = chars(opts.desc);
  if (n > 120) errors.push(`desc ${n} 字，超過 120 字上限——卡片只顯示 3 行約 60 字，完整敘事寫進 說明.md`);
  if (n < 20) warnings.push(`desc 只有 ${n} 字，確定夠有鉤子嗎？`);
}
if (opts.dir) {
  if (!/^projects\/\d{4}-\d{2}\/[^/]+$/.test(opts.dir)) errors.push(`dir 應為 projects/YYYY-MM/專案名 完整相對路徑：${opts.dir}`);
  if (/\/[_.]/.test(opts.dir)) errors.push(`dir 的資料夾名不得以 _ 或 . 開頭（Jekyll 會靜默略過）`);
  if (opts.date && opts.dir.indexOf(opts.date.slice(0, 7)) === -1) warnings.push(`dir 的月份資料夾與 date 不一致`);
  const abs = path.join(ROOT, opts.dir);
  if (!fs.existsSync(path.join(abs, 'index.html'))) errors.push(`找不到 ${opts.dir}/index.html——先建好子頁面再掛上首頁`);
  if (!fs.existsSync(path.join(abs, '說明.md'))) errors.push(`缺少 ${opts.dir}/說明.md`);
}

/* ---- 對照既有清單 ---- */
const dataPath = path.join(ROOT, 'assets', 'data.js');
const source = fs.readFileSync(dataPath, 'utf8');
let PROJECTS = [];
try {
  const ctx = vm.createContext({});
  vm.runInContext(source, ctx, { filename: 'assets/data.js' });
  PROJECTS = vm.runInContext('PROJECTS', ctx);
} catch (e) {
  errors.push(`assets/data.js 無法執行：${e.message}`);
}
if (PROJECTS.length) {
  if (PROJECTS.some((p) => p.dir === opts.dir)) errors.push(`${opts.dir} 已經掛在 PROJECTS 上了`);
  if (PROJECTS[0].date > opts.date) errors.push(`新專案日期 ${opts.date} 比現有最新一筆（${PROJECTS[0].date}）還舊——新專案必須是最新的`);
  const hit = PROJECTS.find((p) => p.emoji === opts.emoji);
  if (hit) warnings.push(`emoji ${opts.emoji} 已被「${hit.title}」（${hit.date}）使用——考慮換一個更專屬的`);
  const bigrams = (s) => {
    const t = (String(s).match(/[㐀-鿿]/g) || []).join('');
    const set = new Set();
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  };
  const nb = bigrams(opts.title + opts.desc);
  for (const p of PROJECTS) {
    const pb = bigrams(p.title + p.desc);
    const min = Math.min(nb.size, pb.size);
    if (min < 8) continue;
    let inter = 0;
    for (const g of nb) if (pb.has(g)) inter++;
    if (inter / min > 0.3) warnings.push(`題材與「${p.title}」（${p.date}）重疊度 ${(inter / min).toFixed(2)}——確認不是撞車`);
  }
}

for (const w of warnings) console.warn(`⚠️  ${w}`);
if (errors.length) {
  errors.forEach((e) => console.error(`❌ ${e}`));
  console.error('\n驗證未過，assets/data.js 未修改。');
  process.exit(1);
}

/* ---- 最小插入：只在 anchor 後塞一段，不動其他行 ---- */
const anchor = 'const PROJECTS = [';
const at = source.indexOf(anchor);
if (at === -1) { console.error('找不到 anchor「const PROJECTS = [」'); process.exit(1); }
const J = (s) => JSON.stringify(String(s));
const entry = `\n  { date: ${J(opts.date)}, title: ${J(opts.title)}, emoji: ${J(opts.emoji)}, dir: ${J(opts.dir)},\n    category: ${J(opts.category)}, desc: ${J(opts.desc)} },`;
const next = source.slice(0, at + anchor.length) + entry + source.slice(at + anchor.length);

/* 寫回前先確認結果仍可執行 */
try {
  const ctx = vm.createContext({});
  vm.runInContext(next, ctx, { filename: 'assets/data.js(預演)' });
  const arr = vm.runInContext('PROJECTS', ctx);
  if (!Array.isArray(arr) || arr.length !== PROJECTS.length + 1) throw new Error('插入後筆數不對');
} catch (e) {
  console.error(`❌ 插入預演失敗，未寫回：${e.message}`);
  process.exit(1);
}
fs.writeFileSync(dataPath, next);
console.log(`✅ 已掛上首頁：${opts.date}「${opts.title}」（${opts.category}）→ PROJECTS 最上方`);

/* ---- 收尾：跑全站健檢 ---- */
const r = spawnSync(process.execPath, [path.join(__dirname, 'check.js')], { stdio: 'inherit' });
process.exit(r.status || 0);

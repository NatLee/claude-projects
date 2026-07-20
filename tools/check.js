#!/usr/bin/env node
/* ==========================================================================
 * 全站健檢：node tools/check.js
 *
 * 檢查項目
 *   1. assets/data.js 語法正確、每筆欄位齊全、category 合法、dir 不重複
 *   2. 每筆 dir 都對得上實體資料夾，且有 index.html 與 說明.md
 *   3. 反向檢查：projects/ 底下有資料夾卻沒掛上 PROJECTS 的漏網之魚
 *   4. 全站 .js 與 HTML 內嵌 <script> 一律跑語法檢查
 *   5. 常見踩雷偵測（file:// 會壞的 fetch / ES module、缺前綴的 localStorage）
 *
 * 離開碼 0 = 全過，1 = 有錯。警告不影響離開碼。
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CATEGORIES = ['網路趣聞・冷知識', '奇聞軼事', '科學趣聞', '學習新知', '生活痛點小工具', '創意・娛樂'];

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/* ---------- 1. 讀取並驗證 PROJECTS ---------- */
const dataPath = path.join(ROOT, 'assets', 'data.js');
let PROJECTS = [];
try {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(dataPath, 'utf8'), ctx, { filename: 'assets/data.js' });
  PROJECTS = vm.runInContext('PROJECTS', ctx);
  if (!Array.isArray(PROJECTS)) fail('assets/data.js 沒有匯出陣列 PROJECTS');
} catch (e) {
  fail(`assets/data.js 無法執行：${e.message}`);
}

const seenDir = new Set();
PROJECTS.forEach((p, i) => {
  const at = `PROJECTS[${i}] ${p && p.title ? `「${p.title}」` : ''}`;
  for (const f of ['date', 'title', 'emoji', 'dir', 'category', 'desc']) {
    if (!p[f]) fail(`${at} 缺欄位 ${f}`);
  }
  if (p.date && !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) fail(`${at} date 格式應為 YYYY-MM-DD，實際為 ${p.date}`);
  if (p.category && !CATEGORIES.includes(p.category)) fail(`${at} category「${p.category}」不在六大類中`);
  if (p.dir) {
    if (!/^projects\/\d{4}-\d{2}\//.test(p.dir)) fail(`${at} dir 應為 projects/YYYY-MM/… 完整相對路徑，實際為 ${p.dir}`);
    if (seenDir.has(p.dir)) fail(`${at} dir 重複：${p.dir}`);
    seenDir.add(p.dir);
    if (p.date && p.dir.indexOf(p.date.slice(0, 7)) === -1) warn(`${at} dir 的月份資料夾與 date 不一致：${p.dir}`);
    const abs = path.join(ROOT, p.dir);
    if (!fs.existsSync(path.join(abs, 'index.html'))) fail(`${at} 找不到 ${p.dir}/index.html`);
    if (!fs.existsSync(path.join(abs, '說明.md'))) warn(`${at} 缺少 ${p.dir}/說明.md`);
  }
});

/* ---------- 2. 反向檢查：有資料夾但沒掛上首頁 ---------- */
const projRoot = path.join(ROOT, 'projects');
if (fs.existsSync(projRoot)) {
  for (const month of fs.readdirSync(projRoot)) {
    const mAbs = path.join(projRoot, month);
    if (!fs.statSync(mAbs).isDirectory()) continue;
    for (const proj of fs.readdirSync(mAbs)) {
      const rel = `projects/${month}/${proj}`;
      if (!fs.statSync(path.join(mAbs, proj)).isDirectory()) continue;
      if (!seenDir.has(rel)) fail(`${rel} 有資料夾卻沒掛上 assets/data.js 的 PROJECTS`);
    }
  }
}

/* ---------- 3. 收集所有 JS 與內嵌 script ---------- */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}
const allFiles = walk(ROOT);
const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dpcheck-'));
let jsChecked = 0;

function checkSyntax(code, label) {
  const tmp = path.join(tmpDir, `s${jsChecked}.js`);
  fs.writeFileSync(tmp, code);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter(Boolean).slice(1, 4).join(' | ');
    fail(`語法錯誤 ${label}：${msg}`);
  }
  jsChecked++;
}

for (const abs of allFiles) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (abs.endsWith('.js')) {
    checkSyntax(fs.readFileSync(abs, 'utf8'), rel);
  } else if (abs.endsWith('.html')) {
    const html = fs.readFileSync(abs, 'utf8');
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, n = 0;
    while ((m = re.exec(html))) {
      if (/\bsrc\s*=/i.test(m[1])) continue;          // 外部檔案，另外檢查
      if (/type\s*=\s*["'](?!text\/javascript|module)/i.test(m[1])) continue; // 樣板等非 JS
      checkSyntax(m[2], `${rel} 第 ${++n} 段內嵌 <script>`);
    }
    /* file:// 直接開啟會壞的寫法 */
    if (/\btype\s*=\s*["']module["']/i.test(html)) fail(`${rel} 用了 type="module"，file:// 直接開啟會被 CORS 擋掉`);
    if (/\bfetch\s*\(\s*["'](?!https?:)/.test(html)) warn(`${rel} 對本機路徑用 fetch()，file:// 直接開啟會失敗`);
    /* 會被「載入」的外部資源只允許 cdnjs；<a href> 引用連結不算 */
    const loaded = [
      ...(html.match(/\bsrc\s*=\s*["']https?:\/\/[^"']+/gi) || []),
      ...(html.match(/<link\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']+/gi) || []),
      ...(html.match(/@import\s+(?:url\()?\s*["']https?:\/\/[^"']+/gi) || []),
    ];
    for (const u of loaded) {
      if (!/cdnjs\.cloudflare\.com/i.test(u)) warn(`${rel} 載入了非 cdnjs 的外部資源：${u.slice(0, 90)}`);
    }
  }
}

/* ---------- 4. localStorage key 前綴 ---------- */
for (const abs of allFiles) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (!/^projects\//.test(rel)) continue;
  if (!/\.(html|js)$/.test(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const re = /localStorage\.(?:getItem|setItem|removeItem)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(src))) {
    if (!/[.:_-]/.test(m[1])) warn(`${rel} 的 localStorage key「${m[1]}」沒有專案前綴，可能與其他專案互相覆蓋`);
  }
}

/* ---------- 輸出 ---------- */
const line = '─'.repeat(52);
console.log(line);
console.log(`每日小專案 · 全站健檢`);
console.log(line);
console.log(`  作品數        ${PROJECTS.length}`);
console.log(`  JS 語法檢查   ${jsChecked} 段`);
const byCat = {};
for (const p of PROJECTS) byCat[p.category] = (byCat[p.category] || 0) + 1;
console.log(`  類別分布      ${CATEGORIES.map((c) => `${c} ${byCat[c] || 0}`).join('｜')}`);
console.log(line);

if (warnings.length) {
  console.log(`\n⚠️  提醒 ${warnings.length} 則`);
  warnings.forEach((w) => console.log(`   · ${w}`));
}
if (errors.length) {
  console.log(`\n❌ 錯誤 ${errors.length} 則`);
  errors.forEach((e) => console.log(`   · ${e}`));
  console.log('');
  process.exit(1);
}
console.log(`\n✅ 全部通過${warnings.length ? '（有提醒，但不擋）' : ''}\n`);

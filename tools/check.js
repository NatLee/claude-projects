#!/usr/bin/env node
/* ==========================================================================
 * 全站健檢：node tools/check.js
 *
 * 檢查項目
 *   1. assets/data.js 語法正確、每筆欄位齊全、category 合法、dir 不重複、
 *      date 是真實日曆日且不在未來、desc 長度守「一句話介紹」規格、
 *      陣列必須新→舊排序（首頁 hero／今日之星／星軌都依賴這個順序）
 *   2. 每筆 dir 都對得上實體資料夾，且有 index.html 與 說明.md；
 *      反向檢查漏網之魚；資料夾名不得以 _ 或 . 開頭（Jekyll 會靜默略過）
 *   3. 全站 .js 與 HTML 內嵌 <script> 一律跑語法檢查；
 *      file:// 會壞的寫法；非 cdnjs 外部資源；
 *      本機資源參照（src/href）逐一驗證存在與大小寫（GitHub Pages 區分大小寫）
 *   4. localStorage key 前綴：三階段解析（字面、變數、物件），
 *      缺分隔符即錯誤；跨專案前綴撞名（含 prefix-of 關係）即錯誤
 *   5. 子頁面設計不變量：回首頁連結、<html lang>／charset／viewport／title、
 *      prefers-reduced-motion、footer 註腳規範
 *   6. 跨作品重複偵測：最新一批對照全歷史（emoji 重複、題材 bigram 重疊）
 *   7. 報表：類別分布、近 14 天題材摘要（步驟 1 去重用）、保養名冊狀態
 *
 * 離開碼 0 = 全過，1 = 有錯。警告不影響離開碼（僅提醒，請自行判斷）。
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
const chars = (s) => [...String(s)].length;

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

const todayTW = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const seenDir = new Set();
PROJECTS.forEach((p, i) => {
  const at = `PROJECTS[${i}] ${p && p.title ? `「${p.title}」` : ''}`;
  for (const f of ['date', 'title', 'emoji', 'dir', 'category', 'desc']) {
    if (!p[f]) fail(`${at} 缺欄位 ${f}`);
  }
  if (p.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
      fail(`${at} date 格式應為 YYYY-MM-DD，實際為 ${p.date}`);
    } else {
      const d = new Date(p.date + 'T00:00:00Z');
      if (isNaN(d) || d.toISOString().slice(0, 10) !== p.date) fail(`${at} date 不是真實日曆日：${p.date}`);
      else if (p.date > todayTW) warn(`${at} date ${p.date} 在未來（台灣時區今天是 ${todayTW}），hero 會提前換星`);
    }
  }
  if (p.desc) {
    const n = chars(p.desc);
    if (n > 240) fail(`${at} desc 長達 ${n} 字——規格是「一句話介紹」（≤120 字，卡片只顯示 3 行約 60 字），完整敘事請寫進 說明.md`);
    else if (n > 140) warn(`${at} desc 已 ${n} 字，超過「一句話介紹」規格（建議 ≤120，完整敘事寫進 說明.md）`);
  }
  if (p.category && !CATEGORIES.includes(p.category)) fail(`${at} category「${p.category}」不在六大類中`);
  if (p.dir) {
    if (!/^projects\/\d{4}-\d{2}\//.test(p.dir)) fail(`${at} dir 應為 projects/YYYY-MM/… 完整相對路徑，實際為 ${p.dir}`);
    if (seenDir.has(p.dir)) fail(`${at} dir 重複：${p.dir}`);
    seenDir.add(p.dir);
    if (p.date && p.dir.indexOf(p.date.slice(0, 7)) === -1) warn(`${at} dir 的月份資料夾與 date 不一致：${p.dir}`);
    const abs = path.join(ROOT, p.dir);
    if (!fs.existsSync(path.join(abs, 'index.html'))) fail(`${at} 找不到 ${p.dir}/index.html`);
    if (!fs.existsSync(path.join(abs, '說明.md'))) fail(`${at} 缺少 ${p.dir}/說明.md`);
  }
});

/* 順序不變量：新→舊。首頁 hero（PROJECTS[0]）、今日之星徽章與星軌都依賴它。 */
for (let i = 1; i < PROJECTS.length; i++) {
  const a = PROJECTS[i - 1], b = PROJECTS[i];
  if (a && b && /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') && /^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) {
    if (b.date > a.date) fail(`PROJECTS[${i}]「${b.title}」日期 ${b.date} 比前一筆 ${a.date} 新——新專案必須加在陣列最上方`);
  }
}

/* ---------- 2. 反向檢查：有資料夾但沒掛上首頁；資料夾命名 ---------- */
const projRoot = path.join(ROOT, 'projects');
if (fs.existsSync(projRoot)) {
  for (const month of fs.readdirSync(projRoot)) {
    const mAbs = path.join(projRoot, month);
    if (!fs.statSync(mAbs).isDirectory()) continue;
    if (/^[_.]/.test(month)) fail(`projects/${month} 以 _ 或 . 開頭——GitHub Pages（Jekyll）會靜默略過這種路徑`);
    for (const proj of fs.readdirSync(mAbs)) {
      const rel = `projects/${month}/${proj}`;
      if (!fs.statSync(path.join(mAbs, proj)).isDirectory()) continue;
      if (/^[_.]/.test(proj)) fail(`${rel} 以 _ 或 . 開頭——GitHub Pages（Jekyll）會靜默略過這種路徑`);
      if (!seenDir.has(rel)) fail(`${rel} 有資料夾卻沒掛上 assets/data.js 的 PROJECTS`);
    }
  }
}

/* ---------- 3. 全站語法、file:// 地雷、外部資源、本機參照 ---------- */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue; // .git、.unmounted、.claude 等一律不進閘門
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

/* 本機參照驗證：存在＋逐段大小寫相符（Windows 不分大小寫、GitHub Pages 分） */
const dirListCache = new Map();
function listDir(d) {
  if (!dirListCache.has(d)) {
    try { dirListCache.set(d, fs.readdirSync(d)); } catch { dirListCache.set(d, null); }
  }
  return dirListCache.get(d);
}
let localRefsChecked = 0;
function checkLocalRef(htmlAbs, rel, ref) {
  const clean = ref.replace(/[?#].*$/, '');
  if (!clean || /^(?:https?:|data:|mailto:|javascript:|tel:|\/\/)/i.test(clean) || clean.startsWith('#')) return;
  const abs = path.resolve(path.dirname(htmlAbs), decodeURIComponent(clean));
  localRefsChecked++;
  if (!abs.startsWith(ROOT)) { fail(`${rel} 參照跳出了倉庫根目錄：${ref}`); return; }
  if (!fs.existsSync(abs)) { fail(`${rel} 參照的本機資源不存在：${ref}`); return; }
  let cur = ROOT;
  for (const seg of path.relative(ROOT, abs).split(path.sep)) {
    const entries = listDir(cur);
    if (entries && !entries.includes(seg)) {
      const hit = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
      fail(`${rel} 參照「${ref}」的大小寫與實際檔名不符（實際為「${hit || seg}」）——上了 GitHub Pages 會 404`);
      return;
    }
    cur = path.join(cur, seg);
  }
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
    /* 本機參照：src 與 link href 一律驗證；<a href> 只驗站內文件連結 */
    let r;
    const srcRe = /<(?:script|img|audio|video|source|iframe)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
    while ((r = srcRe.exec(html))) checkLocalRef(abs, rel, r[1]);
    const linkRe = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
    while ((r = linkRe.exec(html))) checkLocalRef(abs, rel, r[1]);
    const aRe = /<a\b[^>]*\bhref\s*=\s*["']([^"':]+\.(?:html?|md)(?:[?#][^"']*)?)["']/gi;
    while ((r = aRe.exec(html))) checkLocalRef(abs, rel, r[1]);
  }
}

/* ---------- 4. localStorage key 前綴（三階段解析＋跨專案撞名） ---------- */
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function resolveStringConst(src, id, depth = 0) {
  if (depth > 3) return null;
  /* const ID = 'literal' */
  let m = src.match(new RegExp(`(?:const|let|var)\\s+${escRe(id)}\\s*=\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1\\s*[;,\\n]`));
  if (m) return m[2];
  /* const ID = OTHER + 'literal'（取得 OTHER 再串接） */
  m = src.match(new RegExp(`(?:const|let|var)\\s+${escRe(id)}\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*\\+\\s*(['"\`])((?:\\\\.|(?!\\2)[^\\\\])*)\\2`));
  if (m) {
    const base = resolveStringConst(src, m[1], depth + 1);
    return base !== null ? base + m[3] : null;
  }
  /* const ID = k => 'literal' + …／function ID(k){ return 'literal' + … }：取開頭字面值當前綴 */
  m = src.match(new RegExp(`(?:const|let|var)\\s+${escRe(id)}\\s*=\\s*\\(?[\\w$,\\s]*\\)?\\s*=>\\s*(['"])((?:\\\\.|(?!\\1)[^\\\\])*)\\1\\s*\\+`))
    || src.match(new RegExp(`function\\s+${escRe(id)}\\s*\\([^)]*\\)\\s*\\{[^{}]*?return\\s+(['"])((?:\\\\.|(?!\\1)[^\\\\])*)\\1\\s*\\+`))
    || src.match(new RegExp(`(?:const|let|var)\\s+${escRe(id)}\\s*=\\s*\\(?[\\w$,\\s]*\\)?\\s*=>\\s*\`([^\`$\\\\]+)\\$\\{`));
  if (m) return m[2] !== undefined ? m[2] : m[1];
  return null;
}
function resolveObjectValues(src, id) {
  const m = src.match(new RegExp(`(?:const|let|var)\\s+${escRe(id)}\\s*=\\s*\\{`));
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  const body = src.slice(m.index + m[0].length, i - 1);
  const vals = [];
  const vRe = /:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let v;
  while ((v = vRe.exec(body))) vals.push(v[2]);
  return vals;
}

const keyOwners = new Map(); // 字面 key／前綴 → Map(專案 → 例示位置)
function projectOf(rel) {
  const m = rel.match(/^(projects\/\d{4}-\d{2}\/[^/]+)/);
  return m ? m[1] : rel;
}
function registerKey(value, rel, form) {
  if (!value) return;
  if (!/[.:_-]/.test(value)) {
    fail(`${rel} 的 localStorage key／前綴「${value}」沒有專案專屬前綴（需含 . : _ - 分隔符），會與其他專案互相覆蓋`);
  }
  const proj = projectOf(rel);
  if (!keyOwners.has(value)) keyOwners.set(value, new Map());
  if (!keyOwners.get(value).has(proj)) keyOwners.get(value).set(proj, `${rel}（${form}）`);
}

let lsCalls = 0, lsResolved = 0;
for (const abs of allFiles) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (!/^projects\//.test(rel) || !/\.(html|js)$/.test(abs)) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const callRe = /localStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*([^,)\n]{1,160})/g;
  const unresolved = new Set();
  let m;
  while ((m = callRe.exec(src))) {
    lsCalls++;
    const arg = m[1].trim();
    let mm;
    if ((mm = arg.match(/^(['"])((?:\\.|(?!\1)[^\\])*)\1$/))) {                 // 'key'
      registerKey(mm[2], rel, '字面'); lsResolved++;
    } else if ((mm = arg.match(/^`([^`$\\]*)`$/))) {                            // `key`（無插值）
      registerKey(mm[1], rel, '字面'); lsResolved++;
    } else if ((mm = arg.match(/^`\$\{\s*([A-Za-z_$][\w$]*)\s*\}([^`]*)`$/))) { // `${LS}rest`
      const base = resolveStringConst(src, mm[1]);
      if (base !== null) { registerKey(base + mm[2], rel, `\`\${${mm[1]}}…\``); lsResolved++; }
      else unresolved.add(arg);
    } else if ((mm = arg.match(/^([A-Za-z_$][\w$]*)\s*\+\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2$/))) { // LS + '…'
      const base = resolveStringConst(src, mm[1]);
      if (base !== null) { registerKey(base + mm[3], rel, `${mm[1]}+字面`); lsResolved++; }
      else unresolved.add(arg);
    } else if ((mm = arg.match(/^(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*\+/))) {     // '…' + x
      registerKey(mm[2], rel, '字面前綴'); lsResolved++;
    } else if ((mm = arg.match(/^([A-Za-z_$][\w$]*)\s*(?:\.[\w$]+|\[)/))) {     // LS.foo / LS[...]
      const vals = resolveObjectValues(src, mm[1]);
      if (vals && vals.length) { vals.forEach((v) => registerKey(v, rel, `${mm[1]}.*`)); lsResolved++; }
      else {
        const base = resolveStringConst(src, mm[1]); // LS['x'] 也可能 LS 是字串？極少見，退回警告
        if (base !== null) { registerKey(base, rel, mm[1]); lsResolved++; }
        else unresolved.add(arg);
      }
    } else if ((mm = arg.match(/^([A-Za-z_$][\w$]*)\s*[+(]/)) ||                // LS + 動態 / LS(k)
               (mm = arg.match(/^`\$\{\s*([A-Za-z_$][\w$]*)\s*\}/))) {          // `${LS}${k}…`
      const base = resolveStringConst(src, mm[1]);
      if (base !== null && /[.:_-]/.test(base)) { registerKey(base, rel, `${mm[1]}+動態`); lsResolved++; }
      else if (base !== null) {
        warn(`${rel} 的 localStorage 前綴常數 ${mm[1]}=「${base}」本身沒有分隔符，動態組合後無法保證隔離——請把分隔符寫進常數（例：'${base}.'）`);
        lsResolved++;
      } else unresolved.add(arg);
    } else if ((mm = arg.match(/^([A-Za-z_$][\w$]*)$/))) {                      // KEY
      const base = resolveStringConst(src, mm[1]);
      if (base !== null) { registerKey(base, rel, mm[1]); lsResolved++; }
      else unresolved.add(arg);
    } else {
      unresolved.add(arg);
    }
  }
  if (unresolved.size) {
    warn(`${rel} 有 ${unresolved.size} 個 localStorage key 無法靜態解析（${[...unresolved].slice(0, 3).map((u) => `「${u.slice(0, 30)}」`).join('、')}${unresolved.size > 3 ? '…' : ''}）——新頁面請把 key／前綴抽成同檔的字面常數（例：const LS='xxx.'）`);
  }
}
/* 跨專案撞名：完全相同或 prefix-of 關係都算 */
{
  const entries = [...keyOwners.entries()]; // [value, Map(proj→loc)]
  for (const [value, owners] of entries) {
    if (owners.size > 1) {
      fail(`localStorage 前綴「${value}」被 ${owners.size} 個專案共用：${[...owners.keys()].join('、')}`);
    }
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [a, aOwn] = entries[i], [b, bOwn] = entries[j];
      if (!a.startsWith(b) && !b.startsWith(a)) continue;
      const projs = new Set([...aOwn.keys(), ...bOwn.keys()]);
      if (projs.size > 1) {
        fail(`localStorage 前綴互為開頭：「${a}」（${[...aOwn.keys()][0]}）與「${b}」（${[...bOwn.keys()][0]}）分屬不同專案，可能互相覆蓋`);
      }
    }
  }
}

/* ---------- 5. 子頁面設計不變量 ---------- */
const filesByProject = new Map();
for (const abs of allFiles) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  const proj = rel.match(/^(projects\/\d{4}-\d{2}\/[^/]+)/);
  if (!proj) continue;
  if (!filesByProject.has(proj[1])) filesByProject.set(proj[1], []);
  filesByProject.get(proj[1]).push(abs);
}
const FOOTER_BANNED = ['說明.md', '只存在你的瀏覽器', '不會上傳', '全程離線', '離線可用', '瀏覽器裡算完'];
for (const dir of seenDir) {
  const idx = path.join(ROOT, dir, 'index.html');
  if (!fs.existsSync(idx)) continue; // 缺檔已在第 1 段 fail
  const html = fs.readFileSync(idx, 'utf8');
  if (!/\.\.\/\.\.\/\.\.\/(?:index\.html)?["'#]/.test(html)) fail(`${dir}/index.html 缺回首頁連結（../../../index.html）`);
  if (!/<html[^>]*\blang\s*=/i.test(html)) fail(`${dir}/index.html 的 <html> 缺 lang 屬性`);
  if (!/<meta[^>]*charset/i.test(html)) fail(`${dir}/index.html 缺 <meta charset>`);
  if (!/name\s*=\s*["']viewport["']/i.test(html)) fail(`${dir}/index.html 缺 viewport meta（手機版面會壞）`);
  if (!/<title>\s*\S/.test(html)) fail(`${dir}/index.html 缺非空的 <title>`);
  const hasRM = (filesByProject.get(dir) || []).some((f) =>
    /\.(html|css|js)$/.test(f) && fs.readFileSync(f, 'utf8').includes('prefers-reduced-motion'));
  if (!hasRM) warn(`${dir} 整個資料夾找不到 prefers-reduced-motion——若頁面有動畫，需要完整降級`);
  const fRe = /<footer\b[\s\S]*?<\/footer>/gi;
  let fm;
  while ((fm = fRe.exec(html))) {
    for (const phrase of FOOTER_BANNED) {
      if (fm[0].includes(phrase)) warn(`${dir}/index.html 的 footer 含「${phrase}」——註腳要克制（規範見 PROMPT.md 設計品質標準），僅攸關信任的告知例外`);
    }
  }
}

/* ---------- 6. 跨作品重複偵測（最新一批 vs 全歷史） ---------- */
function bigrams(s) {
  const t = (String(s).match(/[\u3400-\u9fff]/g) || []).join('');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
if (PROJECTS.length > 1 && PROJECTS[0] && PROJECTS[0].date) {
  const newest = PROJECTS[0].date;
  const batch = PROJECTS.filter((p) => p.date === newest);
  const older = PROJECTS.filter((p) => p.date !== newest);
  for (const p of batch) {
    const pb = bigrams(p.title + p.desc);
    for (const q of older) {
      if (p.emoji && p.emoji === q.emoji) warn(`「${p.title}」的 emoji ${p.emoji} 已被「${q.title}」（${q.date}）使用——換一個更專屬的`);
      const qb = bigrams(q.title + q.desc);
      const min = Math.min(pb.size, qb.size);
      if (min >= 8) {
        let inter = 0;
        for (const g of pb) if (qb.has(g)) inter++;
        const score = inter / min;
        if (score > 0.3) warn(`「${p.title}」與「${q.title}」（${q.date}）題材重疊度 ${score.toFixed(2)}——確認不是同一題材撞車`);
      }
    }
  }
}

/* ---------- 7. 報表 ---------- */
const line = '─'.repeat(52);
console.log(line);
console.log(`每日小專案 · 全站健檢`);
console.log(line);
console.log(`  作品數        ${PROJECTS.length}`);
console.log(`  JS 語法檢查   ${jsChecked} 段`);
console.log(`  本機參照      ${localRefsChecked} 筆`);
console.log(`  localStorage  ${lsCalls} 個呼叫點（靜態解析 ${lsResolved}）`);
const byCat = {};
for (const p of PROJECTS) byCat[p.category] = (byCat[p.category] || 0) + 1;
console.log(`  類別分布      ${CATEGORIES.map((c) => `${c} ${byCat[c] || 0}`).join('｜')}`);

/* 保養名冊狀態 */
const rosterPath = path.join(ROOT, 'tools', '保養名冊.json');
if (fs.existsSync(rosterPath)) {
  try {
    const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
    const done = roster.filter((r) => r.lastMaintained);
    const missing = PROJECTS.filter((p) => !roster.some((r) => r.dir === p.dir)).length;
    /* 排序鍵：先比上次保養日，同日（含「從未」）再比建立日——名冊是新→舊排列，
       只比 lastMaintained 的話一堆 null 會平手，永遠傳回檔案最上面那筆（最新的作品）。 */
    const mkey = (r) => (r.lastMaintained || '0000-00-00') + '|' + (r.created || '9999-99-99');
    let oldest = null;
    for (const r of roster) {
      if (!seenDir.has(r.dir)) continue;
      if (!oldest || mkey(r) < mkey(oldest)) oldest = r;
    }
    console.log(`  保養覆蓋      ${done.length}/${roster.length}${missing ? `（名冊未收錄 ${missing} 筆，請補）` : ''}｜最久未保養：${oldest ? `${oldest.dir.split('/').pop()}（${oldest.lastMaintained || '從未'}）` : '—'}`);
  } catch (e) {
    warn(`tools/保養名冊.json 無法解析：${e.message}`);
  }
} else {
  warn('tools/保養名冊.json 不存在——每日保養將無法輪替（見 PROMPT.md 步驟 8）');
}

/* 近 14 天題材摘要：給每日流程步驟 1 做去重（取代「讀 data.js 前 60 行」） */
if (PROJECTS[0] && PROJECTS[0].date) {
  const cut = new Date(PROJECTS[0].date + 'T00:00:00Z');
  cut.setUTCDate(cut.getUTCDate() - 13);
  const cutStr = cut.toISOString().slice(0, 10);
  const recent = PROJECTS.filter((p) => p.date >= cutStr);
  console.log(line);
  console.log(`  近 14 天題材（去重對照用，共 ${recent.length} 件）`);
  for (const p of recent) console.log(`   ${p.date}｜${p.emoji} ${p.title}｜${p.category}`);
}
console.log(line);

if (warnings.length) {
  console.log(`\n⚠️  提醒 ${warnings.length} 則（不影響離開碼，但請逐條判斷是否要處理）`);
  warnings.forEach((w) => console.log(`   · ${w}`));
}
if (errors.length) {
  console.log(`\n❌ 錯誤 ${errors.length} 則`);
  errors.forEach((e) => console.log(`   · ${e}`));
  console.log('');
  process.exit(1);
}
console.log(`\n✅ 全部通過${warnings.length ? '（有提醒，但不擋）' : ''}\n`);

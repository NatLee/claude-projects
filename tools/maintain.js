#!/usr/bin/env node
/*
 * 倉庫保養：清理 .git 內的歷史殘留並重新打包。
 *
 * 用法：node tools/maintain.js
 *
 * 只在「使用者本機」執行——每日排程的掛載環境可能擋 unlink，
 * git gc 打包後需要刪除鬆散物件，在那種環境會半途失敗並製造更多殘留。
 * 腳本開頭會自測 unlink，不可用就直接中止。
 *
 * 做三件事：
 *   1. 清空歷史垃圾（各 session 發明的垃圾桶、探測殘留、tmp_obj_*）——
 *      目錄本身保留，因為排程 session 的 rename 隔離慣例可能以它們為目的地。
 *   2. 確認與 origin 完全同步後跑 git gc（預設 prune=2.weeks，
 *      不用 --prune=now，避免砍到並行 session 正在寫的物件）。
 *   3. 印出前後對照。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GIT = path.join(ROOT, '.git');

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}
function dirSizeMB(dir) {
  let total = 0;
  (function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { try { total += fs.statSync(p).size; } catch {} }
    }
  })(dir);
  return (total / 1048576).toFixed(1);
}

// ---- 0. unlink 自測：不可用就中止（代表在掛載環境，不該跑這支） ----
const probe = path.join(GIT, '_maintain_probe');
try {
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
} catch (e) {
  console.error('此環境無法 unlink（掛載環境？），中止。請改在使用者本機執行。');
  process.exit(1);
}

// ---- 0b. 有 git 程序在跑就中止 ----
if (fs.existsSync(path.join(GIT, 'index.lock'))) {
  console.error('.git/index.lock 存在——可能有 git 程序在跑，中止。確認後再試。');
  process.exit(1);
}

console.log(`保養前：.git = ${dirSizeMB(GIT)} MB`);
try { console.log(sh('git count-objects -vH')); } catch {}

// ---- 1. 清空垃圾 ----
let removed = 0, failed = 0;
function rmrf(p) {
  try {
    const st = fs.lstatSync(p);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p)) rmrf(path.join(p, e));
      fs.rmdirSync(p);
    } else {
      fs.unlinkSync(p);
    }
    removed++;
  } catch (e) { failed++; }
}
function emptyDir(p) { // 清空內容、保留目錄本身
  let entries;
  try { entries = fs.readdirSync(p); } catch { return; }
  for (const e of entries) rmrf(path.join(p, e));
}

// 各 session 發明的垃圾桶——清空內容、保留目錄
for (const d of ['_stale', '_trash', '_cowork_trash', '.trash', 'lost-found', '_quarantine']) {
  emptyDir(path.join(GIT, d));
}
// Cursor 的程式碼索引快取，刪掉會自動重建（Cursor 開著時可能鎖檔，容忍失敗）
rmrf(path.join(GIT, 'cursor'));
// objects 底下的 tmp_obj_* 孤兒
const objDir = path.join(GIT, 'objects');
for (const fan of fs.readdirSync(objDir)) {
  const fanPath = path.join(objDir, fan);
  let entries;
  try { entries = fs.readdirSync(fanPath); } catch { continue; }
  for (const e of entries) if (/^tmp_obj_/.test(e)) rmrf(path.join(fanPath, e));
}
// .git 根目錄的歷次探測與 lock 殘留
const residue = /^(index\.lock\.stale-|HEAD\.lock\.stale-|.*\.cleared-\d+|testperm$|_probe|__probe|_t$|_rb$|__deltest|_xprobe|_maintain_probe)/;
for (const e of fs.readdirSync(GIT)) {
  if (residue.test(e)) rmrf(path.join(GIT, e));
}
console.log(`清理：移除 ${removed} 個項目${failed ? `（${failed} 個被鎖定，略過）` : ''}`);

// ---- 2. 關掉自動 gc（打包時機收歸受控），同步確認後手動 gc ----
sh('git config gc.auto 0');
sh('git config maintenance.auto false');

let synced = false;
try {
  const [behind, ahead] = sh('git rev-list --left-right --count origin/main...HEAD').split(/\s+/).map(Number);
  synced = behind === 0 && ahead === 0;
  if (!synced) console.log(`與 origin/main 不同步（behind ${behind} / ahead ${ahead}），照常 gc（預設 prune 視窗保護未推送物件）。`);
} catch { console.log('查不到 origin/main，照常 gc。'); }

try {
  sh('git gc', { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log('git gc 完成。');
} catch (e) {
  console.error('git gc 失敗：' + e.message);
}

// ---- 3. 前後對照 ----
console.log(`保養後：.git = ${dirSizeMB(GIT)} MB`);
try { console.log(sh('git count-objects -vH')); } catch {}

#!/usr/bin/env node
/*
 * pre-commit：提交前跑一次全站健檢，把「建了資料夾卻忘記掛上首頁」「語法壞了」
 * 這類問題擋在 commit 當下，而不是等下一次有人想起要跑健檢。
 *
 * 安裝：node tools/hooks/install.js
 *
 * 併發保護：這個倉庫可能有多個排程 session 同時在動（PROMPT.md 步驟 9）。
 * 別的 session 正在做、還沒掛上首頁的資料夾，不該擋住我這次提交——
 * 因此「有資料夾卻沒掛上」這一類錯誤，只有在該資料夾**屬於本次提交**時才擋門，
 * 否則只印一行提示。其餘錯誤一律擋。
 */
'use strict';
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function staged() {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'check.js')], { cwd: ROOT, encoding: 'utf8' });
const output = (r.stdout || '') + (r.stderr || '');
if (r.status === 0) {
  console.log('✅ pre-commit：全站健檢通過');
  process.exit(0);
}

/* 取出錯誤區塊的每一條 */
const lines = output.split('\n');
const start = lines.findIndex((l) => l.includes('❌ 錯誤'));
const errs = start === -1 ? [] : lines.slice(start + 1).map((l) => l.replace(/^\s*·\s*/, '').trim()).filter(Boolean);

const stagedPaths = staged();
const mine = [];
const foreign = [];
for (const e of errs) {
  const m = e.match(/^(projects\/[^\s]+) 有資料夾卻沒掛上/);
  if (m && !stagedPaths.some((p) => p.startsWith(m[1] + '/'))) foreign.push(m[1]);
  else mine.push(e);
}

if (foreign.length) {
  console.log(`ℹ️  pre-commit：略過 ${foreign.length} 個不屬於本次提交的未掛載資料夾（可能是其他 session 進行中）：`);
  foreign.forEach((f) => console.log(`   · ${f}`));
}
if (!mine.length) {
  console.log('✅ pre-commit：本次提交範圍內的健檢通過');
  process.exit(0);
}

console.error(output);
console.error(`\n❌ pre-commit 擋下這次提交：${mine.length} 則錯誤需要先修好。`);
console.error('（不要用 --no-verify 繞過——修好問題才是本意。跑 node tools/check.js 看完整報告。）');
process.exit(1);

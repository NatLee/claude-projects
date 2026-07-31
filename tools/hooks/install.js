#!/usr/bin/env node
/*
 * 安裝 git hooks：node tools/hooks/install.js
 *
 * git hook 本身不會被 clone 帶走，所以正典放在 tools/hooks/（進版控），
 * 這支腳本負責把它接上 .git/hooks/。重新 clone 或換機器後跑一次即可。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const target = path.join(ROOT, '.git', 'hooks', 'pre-commit');
const shim = `#!/bin/sh
# 由 tools/hooks/install.js 產生——正典在 tools/hooks/pre-commit.js
exec node "$(dirname "$0")/../../tools/hooks/pre-commit.js"
`;

if (!fs.existsSync(path.join(ROOT, '.git', 'hooks'))) {
  console.error('找不到 .git/hooks——這裡不是 git 倉庫？');
  process.exit(1);
}
fs.writeFileSync(target, shim);
try { fs.chmodSync(target, 0o755); } catch {}
console.log(`✅ 已安裝 pre-commit hook → ${path.relative(ROOT, target)}`);
console.log('   提交前會跑 node tools/check.js；其他 session 進行中的未掛載資料夾不會擋門。');

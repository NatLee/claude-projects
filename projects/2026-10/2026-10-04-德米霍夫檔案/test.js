/* node test.js —— 「請找德米霍夫教授」核心斷言＋頁面結構檢查 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('./core.js');

/* 1. 那句話：拼回來要一字不差；剛好兩個錯 */
assert.strictEqual(C.joined(), '「我能去向德米霍夫教授，致上最後的敬意嗎？」');
assert.deepStrictEqual(C.ERRORS, ['title', 'alive']);
const iTitle = C.SENTENCE.findIndex((w) => w.t === '教授');
const iAlive = C.SENTENCE.findIndex((w) => w.t === '最後的敬意');
let r = C.pick(0, {});
assert.ok(!r.hit && !r.done, '點對的字不算');
r = C.pick(iTitle, {});
assert.ok(r.hit && r.err === 'title' && !r.done && /教授/.test(r.note));
r = C.pick(iAlive, r.found);
assert.ok(r.hit && r.done, '兩個都找到才算完成');
assert.ok(C.pick(iAlive, {}).done === false, '只找到一個不算');
const before = {}; C.pick(iTitle, before);
assert.deepStrictEqual(before, {}, 'pick 不改動傳入的 found');
assert.strictEqual(C.pick(99, {}).hit, false, '超出範圍安全');

/* 2. 年紀：1916 年 7 月生 */
assert.strictEqual(C.ageAt(1916, 7, 1937, 6), 20, '1937 年的學生');
assert.strictEqual(C.ageAt(1916, 7, 1954, 2), 37, '第一隻雙頭狗那年');
assert.strictEqual(C.ageAt(1916, 7, 1996, 7), 80, '狄貝基來的那年');
assert.strictEqual(C.ageAt(1916, 7, 1998, 11), 82, '過世時');

/* 3. 進度 */
assert.deepStrictEqual(C.progress(3, 10), { n: 3, total: 10, all: false, text: '3／10' });
assert.strictEqual(C.progress(12, 10).all, true, '夾住上限');
assert.strictEqual(C.progress(-1, 0).all, false);

/* 4. 頁面結構：每一道塗黑都是按鈕、有 aria-label、字數短到不會折行（手機寬度） */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const bars = [...html.matchAll(/<button class="rd"[^>]*>([\s\S]*?)<\/button>/g)];
assert.ok(bars.length >= 20, '塗黑要夠多：' + bars.length);
for (const m of bars) {
  const inner = m[1].replace(/<[^>]+>/g, '');
  assert.ok([...inner].length <= 14, '塗黑段落太長會折行：「' + inner + '」');
  assert.ok(/aria-label="/.test(m[0]), '塗黑按鈕要有 aria-label');
}
/* 謎題的詞塊和 core.js 一致 */
const chips = [...html.matchAll(/data-i="(\d+)"/g)].map((m) => +m[1]);
assert.ok(chips.length === 0 || chips.length === C.SENTENCE.length, '詞塊數量一致');

console.log('✓ core.js 與頁面結構斷言通過（塗黑 ' + bars.length + ' 處）');

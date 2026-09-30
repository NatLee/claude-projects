/* node test.js — 紅包規矩斷言 */
'use strict';
const assert = require('assert');
const L = require('./lijin.js');

/* 單雙看百位 */
assert.strictEqual(L.hundreds(1100), 11);
assert.strictEqual(L.hundreds(1200), 12);
assert.ok(L.judge(1100, 'bai', 0).pass, '1100 白包合規');
assert.ok(L.judge(1500, 'bai', 0).pass, '1500 白包合規');
assert.ok(!L.judge(1200, 'bai', 0).pass, '1200 白包犯雙');
assert.ok(!L.judge(1100, 'xi', 0).pass, '1100 喜事犯單');

/* 喜事：成雙、避 4 */
assert.ok(L.judge(2600, 'xi', 2600).pass);
assert.ok(!L.judge(2400, 'xi', 0).pass, '2400 有 4');
assert.ok(!L.judge(1400, 'bai', 0).pass, '1400 白包有 4（且雙）');
assert.ok(!L.judge(0, 'xi', 0).pass, '空紅包不過');
/* 8、5、低於行情＝提醒不擋 */
const j18 = L.judge(1800, 'xi', 0);
assert.ok(j18.pass && j18.checks.some(c => c.id === 'eight' && c.level === 'warn'));
const jLow = L.judge(1200, 'xi', 2600);
assert.ok(jLow.pass && jLow.checks.some(c => c.id === 'base' && c.level === 'warn'));
/* 千里挑一：1001 照百位算＝10（雙），過關但有零頭提醒 */
const j1001 = L.judge(1001, 'xi', 0);
assert.ok(j1001.pass && j1001.checks.some(c => c.id === 'coin' && c.level === 'warn'));

/* 行情表 */
assert.strictEqual(L.baseline('friend', 'hall', 'solo'), 3200);
assert.strictEqual(L.baseline('nod', 'rest', 'absent'), 1200);
assert.strictEqual(L.baseline('close', 'five', 'pair'), 10000);
assert.strictEqual(L.baseline('x', 'hall', 'solo'), 0);
/* 表內每一格本身都要是合規吉數 */
for (const r of Object.keys(L.TABLE)) for (const v of Object.keys(L.TABLE[r]))
  for (const a of L.TABLE[r][v]) assert.ok(L.judge(a, 'xi', 0).pass, `行情 ${a} 應合規`);
/* 清單本身都合規 */
L.XI.forEach(a => assert.ok(L.judge(a, 'xi', 0).pass, `XI ${a}`));
L.BAI.forEach(a => assert.ok(L.judge(a, 'bai', 0).pass, `BAI ${a}`));

/* 下一個吉數 */
assert.strictEqual(L.nextLucky(2300, 'xi'), 2600);
assert.strictEqual(L.nextLucky(1200, 'xi'), 1200);
assert.strictEqual(L.nextLucky(1200, 'bai'), 1500);
assert.strictEqual(L.nextLucky(7000, 'xi'), 10000);
const big = L.nextLucky(123456, 'xi');
assert.ok(big >= 123456 && L.judge(big, 'xi', 0).pass);
const bigB = L.nextLucky(20000, 'bai');
assert.ok(bigB >= 20000 && L.judge(bigB, 'bai', 0).pass);

/* 回包：多 600 起跳 */
assert.strictEqual(L.returnGift(2000), 2600);
assert.strictEqual(L.returnGift(3600), 6000);
assert.strictEqual(L.returnGift(6600), 10000);

/* 拆鈔 */
assert.deepStrictEqual(L.toBills(2600), [1000, 1000, 500, 100]);
assert.strictEqual(L.sum(L.toBills(6600)), 6600);
assert.strictEqual(L.fmt(10000), '10,000');

console.log('✓ lijin 全部斷言通過');

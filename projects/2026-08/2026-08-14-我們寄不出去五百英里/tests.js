/* 核心邏輯斷言：node tests.js（在本資料夾執行） */
'use strict';
const assert = require('assert');
const L = require('./logic.js');

/* 1. 光速換算：3 毫光秒 = 558.84719 英里（Trey Harris 那行 units 的輸出） */
assert.ok(Math.abs(L.radiusForMs(3) - 558.84719) < 0.001, '3 毫光秒應為 558.84719 英里');
assert.ok(Math.abs(L.MILES_PER_MLS - 186.2823970512) < 1e-6, '每毫光秒英里數');

/* 2. 距離資料的內在一致性：ok 的最遠點必須比 fail 的最近點近（排除異常點） */
const s = L.scorableCities();
const farOk = Math.max(...s.filter((c) => c.ok).map((c) => c.dist));
const nearFail = Math.min(...s.filter((c) => !c.ok).map((c) => c.dist));
assert.strictEqual(farOk, 430, '寄得到的最遠點是紐約 430 英里');
assert.strictEqual(nearFail, 579, '寄不到的最近點是普羅維登斯 579 英里');
assert.ok(farOk < nearFail, '存在一個乾淨的邊界');

/* 3. 底特律必須被排除在比分之外，而且任何半徑都解釋不了它 */
const det = L.CITIES.find((c) => c.key === 'det');
assert.strictEqual(det.odd, true);
assert.ok(det.dist > farOk && det.dist < nearFail, '底特律落在邊界帶裡，所以怎麼調都對不上');
assert.strictEqual(s.length, 10, '納入比分的目的地有 10 個');

/* 4. 3 毫秒全對；離譜的值不會全對 */
assert.strictEqual(L.matchCount(3), 10, '3 毫秒應全對');
assert.ok(L.isSolved(3));
assert.ok(!L.isSolved(0.5), '0.5 毫秒（93 英里）連華盛頓都寄不到');
assert.ok(!L.isSolved(12), '12 毫秒（2235 英里）連波士頓都會寄到');
assert.strictEqual(L.matchCount(0), 5, '逾時 0 時只有校內加上 4 個「寄不到」的猜對，共 5 個');

/* 5. 全對區間：解答不唯一，這正是故事的誠實之處 */
const [lo, hi] = L.solvedBand();
assert.ok(Math.abs(lo - 2.31) < 0.011, `區間下限應約 2.31，實際 ${lo}`);
assert.ok(Math.abs(hi - 3.10) < 0.011, `區間上限應約 3.10，實際 ${hi}`);
assert.ok(lo < 3 && 3 < hi, '3 毫秒落在區間內但不是唯一解');

/* 6. 半徑單調遞增 */
for (let ms = 0; ms < 12; ms += 0.37) {
  assert.ok(L.radiusForMs(ms + 0.01) > L.radiusForMs(ms));
}

console.log('✅ tests.js 全數通過（6 組斷言）');
console.log(`   全對區間 = ${lo.toFixed(2)} ~ ${hi.toFixed(2)} 毫秒；3 毫秒 → ${L.radiusForMs(3).toFixed(5)} 英里`);

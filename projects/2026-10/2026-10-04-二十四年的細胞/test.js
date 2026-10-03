/* node test.js —— 「它們在別人的腦裡住了二十四年」核心斷言 */
'use strict';
const assert = require('assert');
const C = require('./core.js');
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

/* 1. 路易氏體比例：剛好落在發表的數字上，其餘單調內插、夾住 */
assert.strictEqual(C.lewy(0), 0);
assert.strictEqual(C.lewy(10), 0, '第 10 年以前沒有');
assert.ok(near(C.lewy(12), 0.02), '第 12 年 2%');
assert.ok(near(C.lewy(16), 0.05), '第 16 年 5%');
assert.ok(near(C.lewy(24), 0.115), '第 24 年 11–12%');
assert.ok(near(C.lewy(99), 0.115) && C.lewy(-5) === 0, '夾住');
for (let y = 0, prev = -1; y <= 24.0001; y += 0.05) { const v = C.lewy(y); assert.ok(v >= prev - 1e-12, '要單調 y=' + y); prev = v; }

/* 2. 示意曲線的形狀 */
assert.strictEqual(C.growth(0), 0);
assert.ok(near(C.growth(3), 1) && near(C.growth(24), 1), '三年長滿、之後維持');
assert.ok(C.signal(24) > 0.9, '第 24 年多巴胺神經支配仍接近正常');
assert.ok(C.benefit(0) < 0.01, '當天沒有改善');
const peak = Math.max(...Array.from({ length: 141 }, (_, i) => C.benefit(i / 10)));
assert.ok(near(C.benefit(10), 1, 1e-6) && near(peak, 1, 1e-6), '中段改善到頂');
assert.ok(C.benefit(14) > 0.99 && C.benefit(18) < C.benefit(14) && C.benefit(24) < C.benefit(18), '第 14 年起消退');
assert.ok(C.benefit(24) > 0.2, '消退但不是歸零（示意）');
/* 對比：第 24 年訊號仍高、改善已退——頁面的重點之一 */
assert.ok(C.signal(24) - C.benefit(24) > 0.4);

/* 3. N 顆細胞裡生病的顆數：單調，第 24 年 100 顆裡約 11–12 顆 */
assert.strictEqual(C.affected(24, 100), 12);
assert.strictEqual(C.affected(12, 100), 2);
assert.strictEqual(C.affected(16, 100), 5);
assert.strictEqual(C.affected(9, 100), 0);
for (let y = 0, prev = 0; y <= 24; y += 0.1) { const k = C.affected(y, 96); assert.ok(k >= prev); prev = k; }

/* 4. 旁白階段：涵蓋 0–24、不重疊、依序 */
for (let y = 0; y <= 24; y += 0.05) assert.ok(C.stageAt(y), '每一年都有旁白 ' + y);
assert.strictEqual(C.stageAt(0).key, 'day0');
assert.strictEqual(C.stageAt(12).key, 'lewy');
assert.strictEqual(C.stageAt(14).key, 'fade');
assert.strictEqual(C.stageAt(24).key, 'y24');
for (let i = 1; i < C.STAGES.length; i++) assert.strictEqual(C.STAGES[i].from, C.STAGES[i - 1].to, '階段要首尾相接');

/* 5. 顯微視野：可重現、生病順序是 0..N-1 的排列、細胞在視野內 */
const a = C.graft(24, 96), b = C.graft(24, 96), c = C.graft(7, 96);
assert.deepStrictEqual(a, b, '同一個 seed 同一片組織');
assert.notDeepStrictEqual(a.map((x) => x.x), c.map((x) => x.x));
assert.deepStrictEqual(a.map((x) => x.rank).sort((p, q) => p - q), Array.from({ length: 96 }, (_, i) => i));
assert.ok(a.every((x) => Math.hypot(x.x, x.y) < 0.75), '移植團塊在視野中間');
assert.ok(a.every((x) => x.fibers.length >= 2 && x.fibers.every((f) => f.length >= 19)));

console.log('✓ core.js 全部斷言通過');

/* node test.js —— 「把剩飯冰起來」核心斷言 */
'use strict';
const assert = require('assert');
const R = require('./core.js');

/* 1. 規則：2 小時；高於 32°C 只剩 1 小時（32 本身仍是 2 小時） */
assert.strictEqual(R.ruleLimit(28), 120);
assert.strictEqual(R.ruleLimit(32), 120);
assert.strictEqual(R.ruleLimit(33), 60);

/* 2. 時間解析與跨午夜 */
assert.strictEqual(R.parseHM('19:05'), 1145);
assert.strictEqual(R.parseHM('24:00'), null);
assert.strictEqual(R.parseHM('abc'), null);
assert.strictEqual(R.fmtHM(1145), '19:05');
assert.strictEqual(R.fmtHM(1440 + 30), '00:30');
assert.strictEqual(R.fmtHM(-30), '23:30');
assert.strictEqual(R.span(23 * 60, 30), 90, '23:00 → 00:30 是 90 分鐘');
assert.strictEqual(R.fmtDur(125), '2 小時 5 分');
assert.strictEqual(R.fmtDur(45), '45 分鐘');
assert.strictEqual(R.fmtDur(60), '1 小時');

/* 3. 判決 */
let v = R.verdict({ cook: 19 * 60, fridge: 20 * 60 + 30, roomC: 28, now: 0 });
assert.ok(v.ok && v.out === 90 && v.mode === 'stored');
v = R.verdict({ cook: 19 * 60, fridge: 21 * 60 + 1, roomC: 28, now: 0 });
assert.ok(!v.ok && v.left === -1, '晚 1 分鐘就不過');
v = R.verdict({ cook: 19 * 60, fridge: 20 * 60 + 30, roomC: 34, now: 0 });
assert.ok(!v.ok && v.limit === 60, '熱廚房只剩 1 小時');
v = R.verdict({ cook: 23 * 60 + 30, fridge: null, roomC: 26, now: 10 });
assert.ok(v.mode === 'waiting' && v.out === 40 && v.left === 80 && v.ok, '跨午夜的等待');
assert.strictEqual(R.fmtHM(v.deadline), '01:30');

v = R.verdict({ cook: 19 * 60 + 10, fridge: null, roomC: 26, now: 19 * 60 + 5 });
assert.ok(v.out === 0 && v.ok, '煮好時間比現在晚幾分鐘＝剛煮好，不是昨天');

/* 4. 冷卻：單調下降、逼近室溫；冰箱裡逼近 4°C；淺盒比整鍋涼得快 */
const o = { roomC: 28, box: 'pot', fridgeAt: null };
assert.strictEqual(R.tempAt(0, o), 95);
for (let t = 1, prev = 95; t < 900; t++) { const T = R.tempAt(t, o); assert.ok(T < prev && T > 28); prev = T; }
assert.ok(R.tempAt(60, { roomC: 28, box: 'flat', fridgeAt: null }) < R.tempAt(60, o));
const f = { roomC: 28, box: 'bowl', fridgeAt: 60 };
assert.ok(Math.abs(R.tempAt(60, f) - R.tempAt(60, { roomC: 28, box: 'bowl', fridgeAt: null })) < 1e-9, '進冰箱那一刻連續');
assert.ok(R.tempAt(1400, f) < 5 && R.tempAt(1400, f) > 4);

/* 5. 生長速率：溫度帶外為 0、37°C 最快 20 分鐘一倍、30°C 落在文獻「最快 20 分」附近 */
assert.strictEqual(R.rate(5), 0); assert.strictEqual(R.rate(4), 0); assert.strictEqual(R.rate(52), 0);
assert.ok(Math.abs(1 / R.rate(37) - 20) < 1e-6);
assert.ok(1 / R.rate(30) > 20 && 1 / R.rate(30) < 30);
for (let T = 9; T <= 49; T++) assert.ok(R.rate(T) <= R.rate(37) + 1e-12);

/* 6. 模擬：故事裡的數字要和模型一致 */
const d = R.simulate({ roomC: 28, box: 'pot', fridgeAt: null }, 720);
assert.strictEqual(d.length, 721);
assert.strictEqual(d[180].log, 2, '22:00 前還在遲滯期');
const start = d.find((p) => p.log > 2.001).t;
assert.ok(start > 200 && start < 260, '十一點左右開始倍增：' + start);
assert.strictEqual(R.fmtCount(d[420].log), '3.3 萬');
const cross = d.find((p) => p.log >= 5).t;
assert.ok(cross >= 450 && cross <= 470, '兩點四十分左右越過十萬：' + R.fmtHM(1140 + cross));
assert.ok(d[720].log > 7.9 && d[720].log <= 8.1, '早上七點約一億');
for (let i = 1; i < d.length; i++) assert.ok(d[i].log >= d[i - 1].log && d[i].log <= R.LOGMAX);
const alt = R.simulate({ roomC: 28, box: 'flat', fridgeAt: 60 }, 720);
assert.ok(alt[720].log < 2.01, '分裝淺盒、20:00 冰：早上還是一個點');
/* 兩小時規則與模型方向一致：2 小時內冰的淺盒/碗幾乎不長；整夜不冰會越過十萬 */
for (const box of ['bowl', 'flat']) assert.ok(Math.max(...R.simulate({ roomC: 28, box, fridgeAt: 120 }, 900).map((p) => p.log)) < 2.1);

/* 7. 數字格式與點數 */
assert.strictEqual(R.fmtCount(2), '100');
assert.strictEqual(R.fmtCount(3.5), '3,200');
assert.strictEqual(R.fmtCount(5), '10 萬');
assert.strictEqual(R.fmtCount(8), '1 億');
assert.strictEqual(R.fmtCount(9), '10 億');
assert.strictEqual(R.dots(2), 1);
assert.strictEqual(R.dots(9), 900);
assert.ok(R.dots(5) > 10 && R.dots(5) < 30);

console.log('✓ 把剩飯冰起來：全部斷言通過');

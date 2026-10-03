/* node test.js —— 「那場手術沒有發生」核心斷言 */
'use strict';
const assert = require('assert');
const C = require('./core.js');

/* 1. 日期差：跨閏年、負數、同一天 */
assert.strictEqual(C.daysBetween('2015-02-25', '2017-02-25'), 731, '兩年（含 2016 閏年）');
assert.strictEqual(C.daysBetween('2015-02-25', '2017-12-31'), 1040);
assert.strictEqual(C.daysBetween('2016-02-28', '2016-03-01'), 2, '2016-02-29 存在');
assert.strictEqual(C.daysBetween('2017-02-28', '2017-03-01'), 1, '2017 不是閏年');
assert.strictEqual(C.daysBetween('2018-01-01', '2017-12-31'), -1);
assert.strictEqual(C.daysBetween('2020-05-05', '2020-05-05'), 0);
assert.throws(() => C.daysBetween('2020/5/5', '2020-05-06'));

/* 2. 時鐘狀態 */
assert.deepStrictEqual(C.clockState('2015-01-01', null), { mode: 'none', days: null });
assert.deepStrictEqual(C.clockState('2017-11-17', 'soon'), { mode: 'soon', days: null });
assert.deepStrictEqual(C.clockState('2017-12-31', '2017-12-31'), { mode: 'count', days: 0 });
assert.deepStrictEqual(C.clockState('2018-01-01', '2017-12-31'), { mode: 'over', days: 1 });

/* 3. 報導序列：日期遞增；承諾都有目標；解謎答案在選項裡；最後一則是今天 */
const S = C.STEPS;
for (let i = 1; i < S.length; i++) {
  if (!S[i].date) { assert.strictEqual(i, S.length - 1, '只有最後一則沒有日期'); continue; }
  assert.ok(C.utc(S[i].date) >= C.utc(S[i - 1].date), '日期要遞增：' + S[i].id);
}
const P = C.promises();
assert.strictEqual(P.length, 6, '六次承諾');
P.forEach((p) => assert.ok(p.target, '承諾要有目標：' + p.id));
const quiz = S.find((s) => s.kind === 'quiz');
assert.ok(quiz.options.some((o) => o.k === quiz.answer), '解謎答案要在選項裡');
assert.strictEqual(S[S.length - 1].kind, 'end');
assert.strictEqual(new Set(S.map((s) => s.id)).size, S.length, 'id 不重複');

/* 4. 目標沿用：解謎那則沿用承諾 3；時間到那則已逾期 */
const idx = (id) => S.findIndex((s) => s.id === id);
assert.strictEqual(C.targetAt(idx('plan')), null, '一開始沒有日期');
assert.strictEqual(C.targetAt(idx('quiz')), '2017-12-25');
assert.strictEqual(C.targetAt(idx('p6')), 'soon');
assert.strictEqual(C.targetAt(idx('zero')), '2017-12-31', '時間到那天回到十二月的期限');
assert.deepStrictEqual(at0('zero'), { mode: 'over', days: 1 });
assert.strictEqual(at0('now').days, 3199);
function at0(id) { return C.clockState(C.dateAt(idx(id), '2026-10-04'), C.targetAt(idx(id))); }
/* 承諾 4 把期限往後推、承諾 5 又拉回來：時鐘真的被「重設」了 */
const at = (id) => C.clockState(C.dateAt(idx(id), '2026-10-04'), C.targetAt(idx(id)));
assert.strictEqual(at('p1').days, 731);
assert.strictEqual(at('p2').days, C.daysBetween('2015-09-10', '2017-12-31'));
assert.ok(at('p4').days > C.daysBetween('2017-04-28', '2017-12-31'), '十個月內＝比十二月更晚');
assert.strictEqual(at('p5').days, 48);
assert.strictEqual(at('p6').mode, 'soon');
/* 到「時間到」那天，承諾 1（兩年內）其實已經逾期 310 天 */
assert.strictEqual(C.clockState('2018-01-01', '2017-02-25').days, 310);

/* 5. 逾期天數與統計 */
assert.strictEqual(C.overdueDays('2017-12-31'), 0);
assert.strictEqual(C.overdueDays('2018-01-01'), 1);
assert.strictEqual(C.overdueDays('2026-10-04'), 3199, '8 年（含 2020、2024 兩個閏年）2922 天＋277 天');
assert.strictEqual(C.overdueDays('2010-01-01'), 0, '不會是負的');
assert.deepStrictEqual(C.tally({}), { trust: 0, doubt: 0, total: 0 });
assert.deepStrictEqual(C.tally({ p1: 'trust', p2: 'doubt', p3: 'trust', x: 'other' }), { trust: 2, doubt: 1, total: 3 });
assert.strictEqual(C.fmt(3199), '3,199');
assert.strictEqual(C.fmt(731), '731');
assert.strictEqual(C.isoOf(new Date(2026, 9, 4)), '2026-10-04');

console.log('✓ core.js 全部斷言通過');

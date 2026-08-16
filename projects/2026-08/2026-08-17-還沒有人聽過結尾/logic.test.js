/* node logic.test.js — 純函式驗證 */
'use strict';
const assert = require('assert');
const A = require('./logic.js');

/* ---- 音名 → 頻率 ---- */
assert.strictEqual(Math.round(A.noteFreq('A4')), 440);
assert.strictEqual(Math.round(A.noteFreq('A3')), 220);
assert.strictEqual(Math.round(A.noteFreq('A5')), 880);
assert.strictEqual(A.noteFreq('C4').toFixed(2), '261.63');   // 中央 C
assert.strictEqual(A.noteFreq('E4').toFixed(2), '329.63');
assert.strictEqual(A.noteFreq('Db3').toFixed(2), '138.59');
assert.strictEqual(A.noteFreq('D#3').toFixed(2), '155.56');
assert.strictEqual(A.noteFreq('A#3').toFixed(2), '233.08');
assert.strictEqual(A.noteFreq('G#3').toFixed(2), '207.65');
assert.strictEqual(A.noteFreq('B3').toFixed(2), '246.94');
/* 同音異名一致 */
assert.strictEqual(A.noteFreq('C#4').toFixed(4), A.noteFreq('Db4').toFixed(4));
assert.strictEqual(A.noteFreq('zzz'), null);
assert.strictEqual(A.noteFreq('H4'), null);
/* 頁面實際會用到的兩組和弦都算得出來 */
['C3', 'Db3', 'D3', 'D#3', 'E3', 'A#3', 'E4', 'A4', 'G#3', 'B3', 'G#4'].forEach((n) => {
  const f = A.noteFreq(n);
  assert.ok(f > 100 && f < 500, n + ' 頻率超出預期範圍：' + f);
});

/* ---- 日期 ---- */
assert.strictEqual(A.daysBetween('2001-09-05', '2001-09-06'), 1);
assert.strictEqual(A.daysBetween('2001-09-05', '2001-09-05'), 0);
assert.strictEqual(A.daysBetween('2024-02-28', '2024-03-01'), 2);   // 2024 閏年
assert.strictEqual(A.daysBetween('2023-02-28', '2023-03-01'), 1);
assert.strictEqual(A.daysBetween('2001-09-05', '2000-09-05'), -365);
assert.strictEqual(A.daysBetween('bad', '2001-01-01'), null);
/* 開場的休止符長度：十七個月，報導稱 518 天 */
const rest = A.daysBetween(A.START, A.FIRST_SOUND);
assert.strictEqual(rest, 518);

/* ---- 全曲進度 ---- */
assert.strictEqual(A.piecePercent('2001-09-05'), 0);
assert.strictEqual(A.piecePercent('2640-09-04'), 1);
assert.strictEqual(A.piecePercent('1990-01-01'), 0);      // 開演前夾到 0
assert.strictEqual(A.piecePercent('3000-01-01'), 1);      // 演完後夾到 1
const p2026 = A.piecePercent('2026-08-05');
assert.ok(p2026 > 0.035 && p2026 < 0.045, '2026 年應該在 4% 上下，實得 ' + p2026);  // 報導：約 4%
/* 單調遞增 */
let prev = -1;
['2001-09-05', '2003-02-05', '2026-08-17', '2100-01-01', '2400-01-01', '2640-09-04'].forEach((d) => {
  const v = A.piecePercent(d);
  assert.ok(v >= prev, '進度必須單調遞增：' + d);
  prev = v;
});

/* ---- 你的那一段 ---- */
const w = A.lifeWindow(1995, 82);
assert.strictEqual(w.deathYear, 2077);
/* 1995 年生的人，曲子 2001 才開演 → 只算 2001–2077 這 76 年，約 11.9% */
assert.ok(w.spanPct > 0.11 && w.spanPct < 0.125, '2001–2077 約佔 639 年的 11.9%，實得 ' + w.spanPct);
assert.strictEqual(w.startPct, 0, '1995 年出生時曲子還沒開演，起點應夾到 0');
assert.ok(w.endPct > w.startPct);
/* 2010 年生的人整段都在演出期內，82 年 ÷ 639 年 ≈ 12.8% */
const w2 = A.lifeWindow(2010, 82);
assert.ok(w2.spanPct > 0.125 && w2.spanPct < 0.131, '82 年應約 12.8%，實得 ' + w2.spanPct);
assert.ok(w2.startPct > 0);
/* 出生越晚，起點越後面；一生佔比不會超過 1 */
assert.ok(A.lifeWindow(2020, 82).startPct > A.lifeWindow(1980, 82).startPct);
assert.ok(A.lifeWindow(1900, 82).spanPct <= 1);
assert.strictEqual(A.lifeWindow(1995, 0), null);
assert.strictEqual(A.lifeWindow('x', 82), null);
/* 1930 年出生、活 82 歲的人，2012 走——只聽得到 11 年 */
assert.strictEqual(A.lifeWindow(1930, 82).heardYears, 11);
/* 1900 年出生的人一秒都沒聽到 */
assert.strictEqual(A.lifeWindow(1900, 82).heardYears, 0);

/* ---- 曲目表 ---- */
const dated = A.MARKS.filter((m) => m.date);
for (let i = 1; i < dated.length; i++) {
  assert.ok(dated[i].date > dated[i - 1].date, '曲目表必須依日期遞增：' + dated[i].date);
}
assert.strictEqual(dated[0].date, A.START);
assert.strictEqual(dated[dated.length - 1].date, A.END);
/* 所有換和弦的日子都在 5 號（Cage 生日是 9 月 5 日） */
dated.forEach((m) => assert.ok(m.date.endsWith('-05') || m.date === A.END, m.date + ' 不在 5 號'));
/* 相對於 2026-08-17，下一個排定的時刻是 2027-10-05 */
assert.strictEqual(A.nextMark('2026-08-17').date, '2027-10-05');
assert.strictEqual(A.nextMark('2001-01-01').date, '2001-09-05');
assert.strictEqual(A.nextMark('3000-01-01'), null);

/* ---- todayISO ---- */
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(A.todayISO()));

console.log('logic.test.js：全數通過（' + (dated.length) + ' 個時刻、休止 ' + rest + ' 天、今天演到 ' +
  (A.piecePercent(A.todayISO()) * 100).toFixed(2) + '%）');

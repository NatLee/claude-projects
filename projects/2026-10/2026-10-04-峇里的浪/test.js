/* node test.js —— 「不准調準」核心斷言 */
'use strict';
const assert = require('assert');
const C = require('./core.js');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}：${a} ≠ ${b}`);

/* 1. 音分：同樣差 7 Hz，每高一個八度，音分差距大約砍半 */
near(C.cents(342, 7), 35.08, 0.05, '中音差 7 Hz');
near(C.cents(171, 7), 69.46, 0.05, '低音差 7 Hz');
near(C.cents(684, 7), 17.63, 0.05, '高音差 7 Hz');
near(C.cents(440, 440), 1200, 1e-9, '兩倍＝1200 音分');
for (const d of [5, 7, 9]) {
  const r = C.cents(171, d) / C.cents(342, d);
  assert.ok(r > 1.95 && r < 2.05, '低／中音分比應約為 2，實得 ' + r);
}
/* 頁面說「低音那對差了快四分之三個半音」——在合格範圍內都要成立 */
for (const d of [6.8, 7.2, 8.4]) {
  const c = C.cents(171, d);
  assert.ok(c > 65 && c < 85, '低音差距應落在 65–85 音分，實得 ' + c);
}

/* 2. 浪速命名：每一區的代表值都要落到對的名字 */
const cases = [[0, 'flat'], [0.3, 'flat'], [1.5, 'angieng'], [3.5, 'pengayun'], [5.5, 'lambat'],
  [6.7, 'lambat'], [6.75, 'sedeng'], [7.5, 'sedeng'], [9.5, 'bulus'], [13, 'pengejer'],
  [18, 'pengetor'], [23, 'rough'], [-2, 'upside']];
for (const [d, id] of cases) assert.strictEqual(C.zoneOf(d).id, id, 'zoneOf(' + d + ')');
/* 分區上界要嚴格遞增，且和每一區自己的標稱範圍相容 */
for (let i = 1; i < C.ZONES.length; i++) {
  assert.ok(C.ZONES[i].max > C.ZONES[i - 1].max, '分區上界遞增');
  if (C.ZONES[i].id !== 'rough') assert.ok(C.ZONES[i].max >= C.ZONES[i].hi, C.ZONES[i].id + ' 上界涵蓋標稱範圍');
}

/* 3. 目標區＝pengumbang sedeng；邊界一致（命名與過關判定不能互相打架） */
for (let d = 0; d <= 24; d += 0.05) {
  assert.strictEqual(C.inTarget(d), C.zoneOf(d).id === 'sedeng', '目標區與 sedeng 一致 d=' + d.toFixed(2));
}

/* 4. 包絡：t=0 最大、半個拍頻週期歸零、一秒內的浪頭數＝d */
near(C.envelope(7, 0), 1, 1e-12, '起點最大');
near(C.envelope(7, 1 / 14), 0, 1e-9, '半週期歸零');
for (const d of [3, 7, 12]) {
  let peaks = 0;
  const N = 20000;
  for (let i = 1; i < N; i++) {
    const a = C.envelope(d, (i - 1) / N), b = C.envelope(d, i / N), c = C.envelope(d, (i + 1) / N);
    if (b >= a && b > c) peaks++;
  }
  /* 端點 t=0 也是一個浪頭（內部掃描不算它） */
  assert.strictEqual(peaks + 1, d, '一秒內浪頭數 d=' + d);
}
assert.ok([0, 0.25, 0.5, 1].every((t) => C.envelope(0, t) === 1), 'd=0 時包絡是平的');

/* 5. 照比例抄：低八度減半、高八度加倍 */
near(C.ratioCopy(7.2, 342, 171), 3.6, 1e-9, '低八度照比例');
near(C.ratioCopy(7.2, 342, 684), 14.4, 1e-9, '高八度照比例');
assert.strictEqual(C.zoneOf(C.ratioCopy(7.2, 342, 171)).id, 'pengayun', '抄出來的低音是 pengayun');
assert.strictEqual(C.zoneOf(C.ratioCopy(7.2, 342, 684)).id, 'pengejer', '抄出來的高音是 pengejer');
/* 照比例抄 ＝ 音分完全相同 */
near(C.cents(171, C.ratioCopy(7.2, 342, 171)), C.cents(342, 7.2), 1e-9, '比例相同→音分相同');

/* 6. 同一口氣的判定 */
assert.ok(C.matched([7.0, 7.6], 7.2, 0.5), '±0.5 內算一致');
assert.ok(!C.matched([3.6, 14.4], 7.2, 0.5), '照比例抄的不一致');
assert.ok(!C.matched([7.2, NaN], 7.2, 0.5), 'NaN 不能過關');

/* 7. 銼刀：磨升、刮降、有上下限、痕跡分開累計 */
let st = { d: 0, up: 0, down: 0 };
st = C.rub(st, 'grind', 200, 0.035); near(st.d, 7, 1e-9, '磨 200px'); near(st.up, 7, 1e-9, '磨痕');
st = C.rub(st, 'scrape', 20, 0.035); near(st.d, 6.3, 1e-9, '刮 20px'); near(st.down, 0.7, 1e-9, '刮痕');
st = C.rub(st, 'grind', 1e6, 0.035); assert.strictEqual(st.d, C.D_MAX, '上限');
st = C.rub(st, 'scrape', 1e6, 0.035); assert.strictEqual(st.d, C.D_MIN, '下限');
assert.strictEqual(C.rub({ d: 3, up: 0, down: 0 }, 'grind', -50).d, 3, '負位移不作用');

/* 8. 音階與分層 */
near(C.freq(0, 0), 171, 1e-9, '低 dong'); near(C.freq(0, 1), 342, 1e-9, '中 dong'); near(C.freq(0, 2), 684, 1e-9, '高 dong');
for (let oct = 0; oct < 3; oct++) for (let deg = 0; deg < 5; deg++) {
  assert.strictEqual(C.bandOf(C.freq(deg, oct)), oct, `第 ${oct} 層第 ${deg} 音歸到第 ${oct} 層`);
}
const tuned = [7.1, 7.2, 6.9];
assert.strictEqual(C.deltaFor('mine', C.freq(3, 0), tuned), 7.1);
assert.strictEqual(C.deltaFor('mine', C.freq(1, 2), tuned), 6.9);
assert.strictEqual(C.deltaFor('flat', 500, tuned), 0);
near(C.deltaFor('ratio', 684, tuned), 14.4, 1e-9, 'ratio 版高八度');

/* 9. 曲子：時間遞增、音都在範圍內、頭尾有鑼、總長合理 */
const ev = C.piece();
for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, '事件時間遞增');
assert.strictEqual(ev[0].kind, 'gong'); assert.strictEqual(ev[0].t, 0);
assert.ok(ev.filter((e) => e.kind === 'gong').length === 2, '頭尾兩聲鑼');
for (const e of ev) if (e.kind === 'key') {
  assert.ok(Number.isInteger(e.deg) && e.deg >= 0 && e.deg < 5, '音級合法');
  assert.ok(e.oct >= 0 && e.oct <= 2, '八度合法');
  assert.ok(e.len > 0, '長度為正');
}
const keys = ev.filter((e) => e.kind === 'key').length;
assert.ok(keys >= 40 && keys <= 70, '「幾十個音」：' + keys);
assert.ok(C.pieceLength() > 8 && C.pieceLength() < 13, '總長 ' + C.pieceLength());
assert.ok(ev[ev.length - 1].t < C.pieceLength(), '最後一個事件在總長之內');

console.log('✓ 不准調準：核心斷言全過（' + ev.length + ' 個事件、' + keys + ' 個音）');

/* node test.js —— 「我握著她的手，鈴還是響了」核心斷言 */
'use strict';
const assert = require('assert');
const C = require('./core.js');

/* 1. 物理：原位出發、最遠約 1.76 吋、最後回到原位 */
for (const n of [1, 3, 5]) {
  const T = C.duration(n);
  assert.strictEqual(C.phys(0, n).d, 0, '起點要在原位');
  assert.ok(Math.abs(C.phys(T, n).d) < 1e-9, '結束要回原位 n=' + n);
  assert.ok(Math.abs(C.phys(T, n).lift) < 1e-9, '結束腳要放回地板');
  const peak = Math.max(...Array.from({ length: 400 }, (_, i) => C.phys(i * T / 399, n).d));
  assert.ok(Math.abs(peak - C.DMAX) < 0.01, '最遠位移 ' + peak);
  /* 踩鈴時腳一定已經抬起來、位移在最遠 */
  for (const tp of C.taps(n)) {
    const p = C.phys(tp, n);
    assert.ok(p.lift > 0.99 && p.d > C.DMAX - 0.01, '踩鈴時要在盒子上 t=' + tp);
    assert.ok(Math.abs(p.tension - 0.6) < 1e-9, '踩鈴瞬間肌腱收緊');
  }
}

/* 2. 兩條腿：同樣的事件，平常的小腿什麼都沒感覺到；腫起來的那條全部感覺到 */
for (const n of [1, 3, 5]) {
  const ord = C.perceive(n, C.ORDINARY);
  const ten = C.perceive(n, C.TENDER);
  assert.ok(ord.felt.every((v) => v === 0), '平常的腿應該完全沒感覺 n=' + n);
  assert.strictEqual(C.countSpikes(ord.spike), 0, '平常的腿不該感覺到肌腱');
  const tmax = Math.max(...ten.felt);
  assert.ok(Math.abs(tmax - C.DMAX) < 0.05, '敏感的腿要追得上真實位移 ' + tmax.toFixed(3));
  assert.ok(Math.abs(ten.felt[ten.felt.length - 1]) < 0.05, '敏感的腿要感覺到她滑回去 ' + ten.felt[ten.felt.length - 1]);
  /* 感覺不會超前真實：任何時刻 felt 都不大於真實位移太多 */
  for (let i = 0; i < ten.felt.length; i++) assert.ok(ten.felt[i] <= ten.real[i] + 0.2, '感覺超前了 t=' + ten.t[i]);
  assert.strictEqual(C.countSpikes(ten.spike), n, '鈴響幾下就要感覺到幾下肌腱 n=' + n);
}

/* 3. 「用力壓我」那一下確實在掩護那半吋：拿掉遮蔽，平常的腿就會察覺 */
{
  const unmasked = C.perceive(3, Object.assign({}, C.ORDINARY, { mask: 1 }));
  assert.ok(Math.max(...unmasked.felt) > 0.3, '沒有遮蔽時那半吋應該被察覺');
  /* 而且是在那一壓的時候才察覺：之前慢慢挪的每一頓都在門檻下 */
  const first = unmasked.felt.findIndex((v) => v !== 0);
  assert.ok(Math.abs(unmasked.t[first] - C.PRESS_T) < 0.5, '第一次察覺要在那一壓附近 t=' + unmasked.t[first]);
}

/* 4. 平面圖路徑：原位 → 鈴盒蓋 → 原位 */
for (const n of [3, 5]) {
  const p0 = C.footPos(0, n), pe = C.footPos(C.duration(n), n);
  assert.deepStrictEqual(p0, C.REST, '起點');
  assert.ok(Math.hypot(pe[0] - C.REST[0], pe[1] - C.REST[1]) < 0.01, '終點回原位');
  for (const tp of C.taps(n)) {
    const q = C.footPos(tp, n);
    assert.ok(Math.hypot(q[0] - C.LID[0], q[1] - C.LID[1]) < 4.5, '踩鈴時腳在盒蓋上 ' + q);
  }
  const d = C.pathD(n, 0, C.TAP0);
  assert.ok(/^M/.test(d) && d.split('L').length > 10, '路徑要有足夠的點');
}

/* 5. 時間軸：不握就不走；每個事件只觸發一次；鈴聲次數＝n */
for (const n of [1, 3, 5]) {
  for (const kind of ['A', 'B']) {
    const ev = C.script(kind, n);
    assert.ok(ev.every((e) => e.t > 0), '事件時間要 > 0');
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, '事件要排序');
    assert.strictEqual(ev.filter((e) => e.type === 'ring').length, n, '鈴聲次數');
    assert.strictEqual(ev[ev.length - 1].type, 'end', '最後一個是 end');
    const end = C.duration(n);
    let st = { t: 0, end, done: false };
    const seen = new Map();
    let r = C.advance(st, 5, false, ev);
    assert.strictEqual(r.t, 0, '放手時時間不能走');
    assert.strictEqual(r.fired.length, 0);
    /* 用不規則的 dt 走完，中途放手幾次 */
    let k = 0;
    while (!st.done && k < 10000) {
      const holding = k % 7 !== 3;
      const dt = [0.016, 0.033, 0.05, 0, 0.0071][k % 5];
      r = C.advance(st, dt, holding, ev);
      for (const e of r.fired) seen.set(e, (seen.get(e) || 0) + 1);
      st = { t: r.t, end, done: r.done };
      k++;
    }
    assert.ok(st.done && st.t === end, '要走得完');
    assert.strictEqual(seen.size, ev.length, '每個事件都要觸發');
    for (const v of seen.values()) assert.strictEqual(v, 1, '事件只能觸發一次');
    r = C.advance(st, 1, true, ev);
    assert.strictEqual(r.fired.length, 0, '結束後不再觸發');
  }
}
/* 第二夜的旁白裡要有那句「用力壓住我的腳踝」，而且就在 press 的時候 */
{
  const ev = C.script('B', 3);
  const say = ev.find((e) => e.cls === 'say');
  assert.ok(say && /用力壓住/.test(say.text));
  assert.ok(Math.abs(say.t - C.PRESS_T) < 0.3, '台詞要對上那一壓');
}

/* 6. 十年：1927–1936，單調、夾住 */
assert.strictEqual(C.yearAt(0), 1927);
assert.strictEqual(C.yearAt(-3), 1927);
assert.strictEqual(C.yearAt(9 * C.YEAR_SEC + 0.01), 1936);
assert.strictEqual(C.yearAt(999), 1936);
for (let s = 0, prev = 0; s < 20; s += 0.05) { const y = C.yearAt(s); assert.ok(y >= prev); prev = y; }

/* 7. 指紋：同一個 seed 同一枚、24 個特徵點都在指紋輪廓裡；換 seed 就不同 */
{
  const a = C.printRidges(1932), b = C.printRidges(1932), c = C.printRidges(1924);
  assert.deepStrictEqual(a, b, '同一個 seed 要畫出同一枚');
  assert.notDeepStrictEqual(a.paths, c.paths, '不同 seed 要不同');
  assert.strictEqual(a.minutiae.length, C.MINUTIAE, '特徵點 24 個');
  assert.ok(a.minutiae.every(([x, y]) => C.inOutline(x, y, 0)), '特徵點在輪廓內');
  assert.ok(a.paths.length > 25, '紋線要夠多 ' + a.paths.length);
  let minGap = Infinity;
  for (let i = 0; i < a.minutiae.length; i++) for (let j = i + 1; j < a.minutiae.length; j++)
    minGap = Math.min(minGap, Math.hypot(a.minutiae[i][0] - a.minutiae[j][0], a.minutiae[i][1] - a.minutiae[j][1]));
  assert.ok(minGap >= 8, '特徵點要分散（最近兩點 ' + minGap.toFixed(1) + '）');
  assert.strictEqual(C.matchCount(0), 0);
  assert.strictEqual(C.matchCount(1), 24);
  assert.strictEqual(C.matchCount(0.5), 12);
  assert.strictEqual(C.matchCount(2), 24);
  for (let p = 0, prev = 0; p <= 1; p += 0.01) { const m = C.matchCount(p); assert.ok(m >= prev); prev = m; }
}

console.log('✓ core.js 全部斷言通過');

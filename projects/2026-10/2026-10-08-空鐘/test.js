/* node test.js —— 「我聽見北京的玩具在打鼾」核心斷言 */
'use strict';
const assert = require('assert');
const C = require('./core.js');

/* 固定亂數，讓模擬可重現 */
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; }; }
function run(sample, holdT, relT, T, seed) {
  const r = rng(seed || 7);
  let s = C.init(), t = 0, max = 0, falls = 0, wasF = false, singT = 0, sang = false;
  const dt = 1 / 60;
  while (t < T) {
    const hold = (t % (holdT + relT)) < holdT;
    s = C.step(s, dt, hold, C.SAMPLES[sample], r());
    t += dt;
    if (s.fallen > 0 && !wasF) falls++;
    wasF = s.fallen > 0;
    max = Math.max(max, s.rpm);
    singT = s.rpm >= C.SING_RPM ? singT + dt : 0;
    if (singT >= C.SING_HOLD) sang = true;
  }
  return { max, falls, sang, s };
}

/* 1. 純函式：不改舊狀態 */
const s0 = C.init();
const s1 = C.step(s0, 0.1, true, C.SAMPLES.A, 0);
assert.strictEqual(s0.rpm, 0); assert.ok(s1.rpm > 0, '按住要加速');

/* 2. 不轉就站不住：不碰它，幾秒內一定掉 */
{
  let s = C.init(), t = 0;
  while (s.fallen === 0 && t < 10) { s = C.step(s, 1 / 60, false, C.SAMPLES.A, 0); t += 1 / 60; }
  assert.ok(s.fallen > 0 && t > 1.2 && t < 4, '靜止要在 1.2–4 秒內掉落，實際 ' + t.toFixed(2));
}

/* 3. 有節奏地拉：北京那顆會唱、不掉；但碰不到 QUIET_RPM */
for (const [h, r] of [[0.6, 0.4], [0.5, 0.3], [0.35, 0.25]]) {
  const a = run('A', h, r, 25);
  assert.ok(a.sang, `A 節奏 ${h}/${r} 應該唱得起來（max ${a.max | 0}）`);
  assert.strictEqual(a.falls, 0, 'A 節奏拉不該掉');
  assert.ok(a.max < C.QUIET_RPM - 150, 'A 應碰不到 QUIET_RPM：' + (a.max | 0));
  const b = run('B', h, r, 25);
  assert.ok(b.max >= C.QUIET_RPM, `B 節奏 ${h}/${r} 要能過 ${C.QUIET_RPM}（max ${b.max | 0}）`);
  assert.ok(b.max > a.max + 300, '無孔款要明顯更快');
}

/* 4. 一直按著不放：繩卡住，轉不起來還會掉 */
{
  const r = run('A', 30, 0, 12);
  assert.ok(r.max < 800 && !r.sang, '死按不該唱：' + (r.max | 0));
  assert.ok(r.falls >= 1, '死按會掉');
}

/* 5. 轉速越高越穩：不同擾動下，高轉速傾角的變化小 */
{
  const drift = (rpm) => {
    const s = { rpm, tilt: 5, stroke: 0, fallen: 0, phase: 0 };
    return C.step(s, 0.05, false, C.SAMPLES.B, 1).tilt - 5;   /* 正＝更往外倒 */
  };
  assert.ok(drift(0) > drift(400) && drift(400) > drift(1200), '轉速越高越穩');
  assert.ok(drift(1200) < 0, '高轉速時歪了會自己回正');
  assert.ok(C.steadiness(0) < .1 && C.steadiness(1500) > .95, '穩定度儀表');
}

/* 6. 聲音：無孔永遠無聲；有孔 低速無聲 → 鼾 → 哨 */
assert.strictEqual(C.sound(2000, C.SAMPLES.B).label, '無聲');
assert.strictEqual(C.sound(100).label, '無聲');
assert.strictEqual(C.sound(500).label, '鼾聲');
assert.strictEqual(C.sound(C.SING_RPM).label, '哨音');
assert.ok(Math.abs(C.sound(600).puff - 20) < 1e-9, '600 轉 × 2 孔＝每秒 20 噗');
for (let w = 0; w <= 2500; w += 50) {
  const x = C.sound(w);
  assert.ok(x.snore >= 0 && x.snore <= 1 && x.whistle >= 0 && x.whistle <= 1, '音量在 0–1');
}

/* 7. 掉了會躺一下再掛回去，轉速歸零 */
{
  let s = { rpm: 50, tilt: 39, stroke: 0, fallen: 0, phase: 0 };
  s = C.step(s, 1 / 60, false, C.SAMPLES.A, 1);
  assert.ok(s.fallen > 0 && s.rpm === 0);
  for (let i = 0; i < 200 && s.fallen > 0; i++) s = C.step(s, 1 / 60, true, C.SAMPLES.A, 1);
  assert.strictEqual(s.fallen, 0); assert.ok(Math.abs(s.tilt) < 5, '重新掛上');
}

console.log('✓ 空鐘 core 全部斷言通過');

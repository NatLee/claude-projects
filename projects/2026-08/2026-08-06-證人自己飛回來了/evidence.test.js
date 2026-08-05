/* 純函式斷言：node projects/2026-08/2026-08-06-證人自己飛回來了/evidence.test.js */
'use strict';
const assert = require('assert');
require('./evidence.js');
const P = globalThis.PFS;

/* --- 大圓距離 --- */
// 同一點
assert.strictEqual(Math.round(P.haversineKm(53.96, 11.16, 53.96, 11.16)), 0);
// 赤道一度 ≈ 111.19 公里
assert.ok(Math.abs(P.haversineKm(0, 0, 0, 1) - 111.19) < 0.3);
// 對蹠點 ≈ 半個地球周長
assert.ok(Math.abs(P.haversineKm(0, 0, 0, 180) - Math.PI * 6371) < 1);
// 本頁引用的數字：Klütz(53.96N,11.16E) → 中非核心（Bangui 4.37N,18.56E）約 5,500 公里
const d = P.haversineKm(53.96, 11.16, 4.37, 18.56);
assert.ok(d > 5400 && d < 5700, '距離應落在 5,400–5,700 公里，實際 ' + d);
assert.strictEqual(Math.round(d / 100) * 100, 5600);   // 四捨五入到百位
assert.strictEqual(Math.round(d / 500) * 500, 5500);   // 頁面標示「約 5,500 公里」

/* --- 天空計數 --- */
const ats = P.makeDepartAts(64, 20220521);
assert.strictEqual(ats.length, 64);
assert.ok(ats.every((v) => v > 0 && v <= 1), '離場刻度必須落在 (0,1]');
assert.strictEqual(P.remaining(ats, 0), 64);           // 八月：一隻都還沒走
assert.strictEqual(P.remaining(ats, 1), 0);            // 十一月：全空
// 單調遞減：時間往前走，剩下的只會變少
let prev = 65;
for (let t = 0; t <= 1.0001; t += 0.05) {
  const r = P.remaining(ats, t);
  assert.ok(r <= prev, `t=${t.toFixed(2)} 時剩餘數不該變多`);
  prev = r;
}
// 同一顆種子要重現同一組順序
assert.deepStrictEqual(P.makeDepartAts(64, 20220521), ats);

/* --- 月份標籤 --- */
assert.strictEqual(P.monthLabel(0), '八月');
assert.strictEqual(P.monthLabel(1), '十一月');
assert.strictEqual(P.monthLabel(-5), '八月');          // 夾住越界值
assert.strictEqual(P.monthLabel(9), '十一月');
assert.strictEqual(P.MONTH_LABELS.length, 6);

/* --- 拔矛長度 --- */
assert.strictEqual(P.pulledCm(0, 75), 0);
assert.strictEqual(P.pulledCm(1, 75), 75);
assert.strictEqual(P.pulledCm(0.5, 75), 38);           // 37.5 → 38
assert.strictEqual(P.pulledCm(-3, 75), 0);             // 夾住
assert.strictEqual(P.pulledCm(7, 75), 75);

/* --- 卷宗狀態 --- */
assert.strictEqual(P.caseStatus(0, 4), 'open');
assert.strictEqual(P.caseStatus(3, 4), 'partial');
assert.strictEqual(P.caseStatus(4, 4), 'cleared');

/* --- 物證鑑定 --- */
assert.strictEqual(P.originVerdict({ wood: 'unknown', head: 'unknown', binding: 'unknown' }).verdict, 'unknown');
assert.strictEqual(P.originVerdict({ wood: 'africa', head: 'africa', binding: 'africa' }).verdict, 'non-european');
assert.strictEqual(P.originVerdict({ wood: 'africa', head: 'unknown', binding: 'unknown' }).verdict, 'non-european');
assert.strictEqual(P.originVerdict({ wood: 'africa', head: 'europe', binding: 'unknown' }).verdict, 'mixed');
assert.strictEqual(P.originVerdict({ wood: 'europe', head: 'europe', binding: 'europe' }).verdict, 'european');
assert.strictEqual(P.originVerdict({ wood: 'africa', head: 'africa', binding: 'unknown' }).africa, 2);

/* --- 緯度換算 --- */
assert.strictEqual(P.latToY(54, 54, 4, 100, 900), 100);
assert.strictEqual(P.latToY(4, 54, 4, 100, 900), 900);
assert.strictEqual(P.latToY(29, 54, 4, 100, 900), 500);   // 中點
// 單調：緯度愈低，y 愈大（愈往南 = 愈往下）
assert.ok(P.latToY(40, 54, 4, 100, 900) < P.latToY(20, 54, 4, 100, 900));

console.log('✅ evidence.js 全部斷言通過（' + 34 + ' 項）');

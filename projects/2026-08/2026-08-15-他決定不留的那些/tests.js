/* 核心邏輯斷言：node tests.js */
'use strict';
const assert = require('assert');
const W = require('./logic.js');

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg}：得到 ${a}，預期 ${b}±${eps}`);

/* ---- A. 裝甲推演機 ---- */

// 面積比例總和必須是 1
near(W.REGIONS.reduce((t, r) => t + r.a, 0), 1, 1e-9, '六區面積總和');
// 命中發數分布總和必須是 1
near(W.HITS.reduce((t, x) => t + x, 0), 1, 1e-9, '命中發數分布總和');

// 基準：四百架出擊，約二十架沒回來（對齊備忘錄那一頁）
const base = W.planesLost(null);
near(base, 20, 0.6, '無裝甲時的損失架數');

// 回收圖：機身＋主翼＋尾翼應占絕大多數彈孔，引擎近乎乾淨
const sv = W.survivorShare();
near(sv.body + sv.wing + sv.tail, 0.888, 0.02, '回收圖上機身/主翼/尾翼的彈孔占比');
assert.ok(sv.engine < 0.03, `回收圖上引擎彈孔占比應 <3%，得到 ${sv.engine}`);
near(Object.values(sv).reduce((a, b) => a + b, 0), 1, 1e-9, '回收圖占比總和');

// 沒回來的那些：致命命中集中在機鼻/引擎/油箱
const ls = W.lostShare();
assert.ok(ls.nose + ls.engine + ls.fuel > 0.8, `沒回來的機上前三區占比應 >80%，得到 ${ls.nose + ls.engine + ls.fuel}`);
near(Object.values(ls).reduce((a, b) => a + b, 0), 1, 1e-9, '沒回來占比總和');

// 直覺方案 vs Wald 方案：兩者都有效，但差一個量級
const naive = ['body', 'wing', 'tail'];
const lostNaive = W.planesLost(naive);
const lostWald = W.planesLost(W.WALD_PICK);
assert.ok(lostNaive < base, '直覺方案應該也有幫助');
assert.ok(lostWald < lostNaive, 'Wald 方案應優於直覺方案');
assert.ok((base - lostWald) > 4 * (base - lostNaive),
  `Wald 方案救回的架數應是直覺方案的四倍以上：${(base - lostWald).toFixed(2)} vs ${(base - lostNaive).toFixed(2)}`);

// 覆蓋率：直覺方案蓋住回收圖上絕大多數彈孔，卻救不了幾架——這正是本頁的反差
near(W.coverage(naive), 0.888, 0.02, '直覺方案的彈孔覆蓋率');
assert.ok(W.coverage(W.WALD_PICK) < 0.12, 'Wald 方案的彈孔覆蓋率應該很低');

// 裝甲只會讓存活率變好，不會變差
W.REGIONS.forEach((r) => assert.ok(W.armoredS(r.s) >= r.s, `${r.name} 加裝甲後存活率不該變差`));
// 加越多塊越好（單調性）
assert.ok(W.planesLost(['engine']) > W.planesLost(['engine', 'nose']), '多加一塊裝甲應更好');
// 沒選任何區塊 = 基準
near(W.planesLost([]), base, 1e-12, '空選等於基準');

/* ---- B. Wald 備忘錄的算式 ---- */

// 備忘錄那一頁本身要自洽：回來的架數加總 = 380
near(W.MEMO.S.reduce((a, b) => a + b, 0), 380, 1e-9, '倖存機架數總和');
near(W.waldTarget(), 0.20, 1e-9, '等式右邊 1 − s₀');

// 等式左邊隨 q 遞減
assert.ok(W.waldBalance(0.7) > W.waldBalance(0.9), 'waldBalance 應隨 q 遞減');

// 解出來的 q 應該落在 0.851 附近（AMS Feature Column 用牛頓法得到同一個值）
const q = W.solveQ();
near(q, 0.851, 0.002, '解出的 q');
near(W.waldBalance(q), W.waldTarget(), 1e-9, '解出的 q 應讓等式平衡');

// 真正的魔術：從「只有倖存者」的資料反推出來的損失，總和必須等於實際損失 20 架
const L = W.waldLosses(q);
near(L.reduce((a, b) => a + b, 0), W.MEMO.N - 380, 0.01, '反推出的損失架數總和');
assert.strictEqual(L[0], 0, 'L₀ 必須是 0（沒中彈就不會掉）');
// 中第一發就掉下來的最多，之後遞減
for (let i = 1; i < L.length - 1; i++) {
  assert.ok(L[i] > L[i + 1], `L${i} 應大於 L${i + 1}`);
}
near(L[1], 11.9, 0.2, '中一發就掉下來的架數');
assert.ok(L[1] / (W.MEMO.N - 380) > 0.55, '過半的損失來自第一發');

console.log('✅ tests.js：全部通過（' + [
  `基準損失 ${base.toFixed(1)} 架`,
  `直覺方案 ${lostNaive.toFixed(1)}`,
  `Wald 方案 ${lostWald.toFixed(1)}`,
  `q=${q.toFixed(3)}`,
  `L₁=${L[1].toFixed(1)}`
].join('｜') + '）');

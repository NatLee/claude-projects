/* ==========================================================================
 * 他決定不留的那些 — 純邏輯（可在 node 直接跑，見 tests.js）
 *
 * 兩套完全獨立的計算：
 *   A. 裝甲推演機（示意模型，不是 1943 年的機密數字）
 *      —— 用「面積 × 中彈後存活率」推回收圖上的彈孔分布、沒回來的飛機的彈孔分布，
 *         以及加了三塊裝甲之後有幾架飛得回來。
 *   B. Wald 備忘錄的實際算式（等 q 近似）
 *      —— 只用倖存機的資料，反推沒回來的飛機各中了幾發。
 * ========================================================================== */
'use strict';
(function (root) {

  /* ---------- A. 裝甲推演機 ---------- */

  // a = 佔全機表面積比例（總和 1）；s = 這一區中一發之後，飛機仍飛得回來的機率
  var REGIONS = [
    { id: 'nose',   name: '機鼻與駕駛艙', a: 0.08, s: 0.25 },
    { id: 'engine', name: '引擎',        a: 0.10, s: 0.15 },
    { id: 'fuel',   name: '油箱與油路',   a: 0.12, s: 0.40 },
    { id: 'body',   name: '機身',        a: 0.30, s: 0.97 },
    { id: 'wing',   name: '主翼',        a: 0.28, s: 0.95 },
    { id: 'tail',   name: '尾翼',        a: 0.12, s: 0.90 }
  ];

  // P(一架飛機這趟中 k 發)，k = 0…5
  var HITS = [0.862, 0.079, 0.039, 0.012, 0.005, 0.003];
  var N = 400;              // 出擊架數（與備忘錄那一頁同數）
  var ARMOR_CUT = 0.25;     // 裝甲把「這一發會把飛機打下來」的機率壓成原本的四分之一
  var BUDGET = 3;           // 只扛得動三塊裝甲
  var WALD_PICK = ['nose', 'engine', 'fuel'];

  function region(id) {
    for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
    return null;
  }
  function armoredS(s) { return 1 - ARMOR_CUT * (1 - s); }
  function has(list, id) { return !!list && list.indexOf(id) >= 0; }

  // 單發命中之後仍飛得回來的機率（把六區依面積加權）
  function perHitSurvival(picked) {
    var t = 0;
    for (var i = 0; i < REGIONS.length; i++) {
      var r = REGIONS[i];
      t += r.a * (has(picked, r.id) ? armoredS(r.s) : r.s);
    }
    return t;
  }
  // 一架飛機整趟活著回來的機率
  function planeSurvival(picked) {
    var h = perHitSurvival(picked), p = 0, pow = 1;
    for (var k = 0; k < HITS.length; k++) { p += HITS[k] * pow; pow *= h; }
    return p;
  }
  function planesLost(picked) { return N * (1 - planeSurvival(picked)); }
  function planesHome(picked) { return N * planeSurvival(picked); }

  // 回收圖上看得到的彈孔，各區佔比（∝ 面積 × 存活率）
  function survivorShare() {
    var w = REGIONS.map(function (r) { return r.a * r.s; });
    var sum = w.reduce(function (x, y) { return x + y; }, 0);
    var out = {};
    REGIONS.forEach(function (r, i) { out[r.id] = w[i] / sum; });
    return out;
  }
  // 沒回來的飛機身上的致命命中，各區佔比（∝ 面積 × (1 − 存活率)）
  function lostShare() {
    var w = REGIONS.map(function (r) { return r.a * (1 - r.s); });
    var sum = w.reduce(function (x, y) { return x + y; }, 0);
    var out = {};
    REGIONS.forEach(function (r, i) { out[r.id] = w[i] / sum; });
    return out;
  }
  // 選定的區塊蓋住了回收圖上多少比例的彈孔
  function coverage(picked, share) {
    share = share || survivorShare();
    var t = 0;
    (picked || []).forEach(function (id) { t += share[id] || 0; });
    return t;
  }

  /* ---------- B. Wald 備忘錄的算式 ---------- */

  // Mangel & Samaniego (1984) 引 Wald 的示例：400 架出擊、380 架回來，
  // 回來的機上各中 0…5 發的架數。
  var MEMO = { N: 400, S: [320, 32, 20, 4, 2, 2] };

  // Wald 基本等式左邊：Σ_{m≥1} s_m / (q₁q₂…q_m)，在「每一發同樣傷」的簡化下 = Σ s_m / q^m
  function waldBalance(q) {
    var t = 0, pow = 1;
    for (var m = 1; m < MEMO.S.length; m++) { pow *= q; t += (MEMO.S[m] / MEMO.N) / pow; }
    return t;
  }
  // 等式右邊：1 − s₀
  function waldTarget() { return 1 - MEMO.S[0] / MEMO.N; }

  // 解出 q（左邊隨 q 遞減，二分法即可）
  function solveQ() {
    var lo = 0.5, hi = 0.9999, target = waldTarget();
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (waldBalance(mid) > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // 由 q 反推：沒回來的飛機裡，中了 i 發才掉下來的有幾架
  //   L_i = p · ( N − Σ_{j<i} S_j − Σ_{j<i} L_j )，L₀ = 0
  function waldLosses(q) {
    var p = 1 - q, L = [0], sumS = MEMO.S[0], sumL = 0;
    for (var i = 1; i < MEMO.S.length; i++) {
      var Li = p * (MEMO.N - sumS - sumL);
      L.push(Li);
      sumL += Li;
      sumS += MEMO.S[i];
    }
    return L;
  }

  var API = {
    REGIONS: REGIONS, HITS: HITS, N: N, BUDGET: BUDGET, ARMOR_CUT: ARMOR_CUT,
    WALD_PICK: WALD_PICK, MEMO: MEMO,
    region: region, armoredS: armoredS,
    perHitSurvival: perHitSurvival, planeSurvival: planeSurvival,
    planesLost: planesLost, planesHome: planesHome,
    survivorShare: survivorShare, lostShare: lostShare, coverage: coverage,
    waldBalance: waldBalance, waldTarget: waldTarget, solveQ: solveQ, waldLosses: waldLosses
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.WALD = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);

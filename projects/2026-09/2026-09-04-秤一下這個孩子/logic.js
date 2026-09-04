/* ==========================================================================
 * logic.js — 1914 年郵局櫃檯的算術
 *
 * 依據：包裹郵遞（Parcel Post）1913-01-01 開辦，起始重量上限 11 磅；
 *       1913-08-15 起第一、二區放寬，1914-01-01 起第一、二區上限 50 磅。
 *       第一、二區費率：第一磅 5 分，之後每磅 1 分（不足一磅進位）。
 *       48.5 磅 → 進位 49 磅 → 5 + 48 = 53 分，與多數記載的「53 分」相符。
 *       （維基百科另有 32 分的說法；原始收據未存世，見 說明.md）
 *
 * 純函式（node 可直接 require 斷言）：
 *   ceilPound / postageCents / minStamps / verdict / lbFromKg
 * ========================================================================== */
(function (root) {
  'use strict';

  /* 1913 年前後流通的常見面值（分） */
  var DENOMS = [10, 5, 3, 2, 1];

  /* 郵局按「進位到整磅」計費 */
  function ceilPound(lbs) {
    var n = Math.ceil(Number(lbs) - 1e-9);
    return n < 1 ? 1 : n;
  }

  /* 第一、二區郵資（分）：第一磅 5 分，之後每磅 1 分 */
  function postageCents(lbs) {
    return 5 + (ceilPound(lbs) - 1);
  }

  /* 湊出 cents 的最少郵票張數（DP，回傳張數與組合，大→小排序） */
  function minStamps(cents, denoms) {
    var ds = (denoms || DENOMS).slice().sort(function (a, b) { return b - a; });
    var n = Math.max(0, Math.round(cents));
    var best = new Array(n + 1), pick = new Array(n + 1);
    best[0] = 0;
    for (var v = 1; v <= n; v++) {
      best[v] = Infinity;
      for (var i = 0; i < ds.length; i++) {
        var d = ds[i];
        if (d <= v && best[v - d] + 1 < best[v]) { best[v] = best[v - d] + 1; pick[v] = d; }
      }
    }
    if (!isFinite(best[n])) return { count: Infinity, combo: [] };
    var combo = [], left = n;
    while (left > 0) { combo.push(pick[left]); left -= pick[left]; }
    combo.sort(function (a, b) { return b - a; });
    return { count: best[n], combo: combo };
  }

  /* 1914 年 2 月的櫃檯判斷：第一、二區上限 50 磅 */
  function verdict(lbs) {
    var LIMIT = 50;
    var ok = Number(lbs) <= LIMIT;
    return {
      ok: ok,
      limit: LIMIT,
      margin: Math.round((LIMIT - Number(lbs)) * 10) / 10,
      cents: ok ? postageCents(lbs) : null
    };
  }

  function lbFromKg(kg) { return Math.round(Number(kg) * 2.2046226 * 10) / 10; }

  var api = {
    DENOMS: DENOMS,
    ceilPound: ceilPound,
    postageCents: postageCents,
    minStamps: minStamps,
    verdict: verdict,
    lbFromKg: lbFromKg
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MAILLOGIC = api;
})(typeof window !== 'undefined' ? window : globalThis);

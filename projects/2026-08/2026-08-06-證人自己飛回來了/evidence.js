/* ==========================================================================
 * 證人自己飛回來了 —— 純函式邏輯
 * 全部無副作用、不碰 DOM，方便用 node 斷言驗證（見 evidence.test.js）。
 * 以 <script src> 載入，掛在 window.PFS 底下（不用 ES module，file:// 才開得起來）。
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- 1. 大圓距離（Haversine），單位公里 ---------- */
  var R_EARTH_KM = 6371;
  function toRad(deg) { return (deg * Math.PI) / 180; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* ---------- 2. 天空還剩幾隻 ----------
   * 每隻鳥有自己的「離場刻度」departAt ∈ [0,1]；時間軸 t ∈ [0,1] 走過它就飛走。
   * remaining() 只做計數，畫面另外處理。
   */
  function remaining(departAts, t) {
    var n = 0;
    for (var i = 0; i < departAts.length; i++) if (departAts[i] > t) n++;
    return n;
  }

  /* 用固定亂數種子產生離場刻度，讓每次載入的「消失順序」一致但不規則。
   * 分布刻意偏後段：大半在時間軸中後段才走，前段只有零星幾隻。 */
  function makeDepartAts(count, seed) {
    var s = seed >>> 0 || 1;
    var out = [];
    for (var i = 0; i < count; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      var u = s / 4294967296;                 // [0,1)
      var base = (i + 0.5) / count;           // 均勻鋪開
      var jitter = (u - 0.5) * 0.34;
      var v = Math.min(0.995, Math.max(0.02, base + jitter));
      out.push(Math.pow(v, 0.78));            // 稍微往後壓，前期空得慢
    }
    return out;
  }

  /* ---------- 3. 把 0–1 的時間軸換成月份標籤 ---------- */
  var MONTH_LABELS = ['八月', '九月上旬', '九月下旬', '十月上旬', '十月下旬', '十一月'];
  function monthLabel(t) {
    var i = Math.round(t * (MONTH_LABELS.length - 1));
    if (i < 0) i = 0;
    if (i > MONTH_LABELS.length - 1) i = MONTH_LABELS.length - 1;
    return MONTH_LABELS[i];
  }

  /* ---------- 4. 拔矛：拉出比例 → 已露出的長度（公分） ---------- */
  function pulledCm(fraction, totalCm) {
    var f = Math.min(1, Math.max(0, fraction));
    return Math.round(f * totalCm);
  }

  /* ---------- 5. 卷宗狀態：四份舊結案報告全被駁回了嗎 ---------- */
  function caseStatus(rejectedCount, total) {
    if (rejectedCount <= 0) return 'open';
    if (rejectedCount < total) return 'partial';
    return 'cleared';   // 全數駁回，但仍然沒有答案
  }

  /* ---------- 6. 物證鑑定：三項特徵指向哪裡 ----------
   * features: { wood, head, binding } 每項是 'europe' | 'africa' | 'unknown'
   * 只要有任一項明確指向非歐洲，結論就是「非歐洲製」。
   */
  function originVerdict(features) {
    var keys = ['wood', 'head', 'binding'];
    var africa = 0, europe = 0, known = 0;
    for (var i = 0; i < keys.length; i++) {
      var v = features[keys[i]];
      if (v === 'africa') { africa++; known++; }
      else if (v === 'europe') { europe++; known++; }
    }
    if (known === 0) return { verdict: 'unknown', africa: africa, europe: europe };
    if (africa > 0 && europe === 0) return { verdict: 'non-european', africa: africa, europe: europe };
    if (africa > 0) return { verdict: 'mixed', africa: africa, europe: europe };
    return { verdict: 'european', africa: africa, europe: europe };
  }

  /* ---------- 7. 緯度 → 剖面圖 y 座標（線性內插，供 SVG 用） ---------- */
  function latToY(lat, topLat, bottomLat, topY, bottomY) {
    var f = (topLat - lat) / (topLat - bottomLat);
    return topY + f * (bottomY - topY);
  }

  root.PFS = {
    haversineKm: haversineKm,
    remaining: remaining,
    makeDepartAts: makeDepartAts,
    monthLabel: monthLabel,
    MONTH_LABELS: MONTH_LABELS,
    pulledCm: pulledCm,
    caseStatus: caseStatus,
    originVerdict: originVerdict,
    latToY: latToY
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

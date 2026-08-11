/* ==========================================================================
 * 沒有人看見它掉下來 —— 純邏輯層
 * 這一支不碰 DOM，瀏覽器裡掛成 window.PitchLogic，node 裡可 require 做斷言。
 * ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PitchLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 九滴的紀錄（間隔月數採 UQ／Wikipedia 表列值，末兩筆由日期推算） ---------- */
  var CUT = '1930-10';                       // 剪開漏斗頸
  var DROPS = [
    { n: 1, ym: '1938-12', text: '1938 年 12 月', gap: 98 },
    { n: 2, ym: '1947-02', text: '1947 年 2 月', gap: 99 },
    { n: 3, ym: '1954-04', text: '1954 年 4 月', gap: 86 },
    { n: 4, ym: '1962-05', text: '1962 年 5 月', gap: 97 },
    { n: 5, ym: '1970-08', text: '1970 年 8 月', gap: 99 },
    { n: 6, ym: '1979-04', text: '1979 年 4 月', gap: 104 },
    { n: 7, ym: '1988-07', text: '1988 年 7 月 3 日 16:45', gap: 111 },
    { n: 8, ym: '2000-11', text: '2000 年 11 月 28 日', gap: 148 },
    { n: 9, ym: '2014-04', text: '2014 年 4 月 24 日', gap: 161 }
  ];

  var LAST_DROP = '2014-04-24';              // 第九滴落下之日，第十滴從這天開始長
  var VIGIL_START = '1979-04-01';            // 守夜起點：第六滴剛落下
  var VIGIL_TARGET_DAYS = 3380;              // 到 1988-07-03 約 3,380 天（九年二個月）

  /* ---------- 日期工具（一律以 UTC 計算，不受時區影響） ---------- */
  function toUTC(iso) {
    var p = String(iso).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +(p[2] || 1));
  }
  function daysBetween(a, b) {
    return Math.round((toUTC(b) - toUTC(a)) / 86400000);
  }
  function monthsBetween(a, b) {
    var x = String(a).split('-'), y = String(b).split('-');
    return (+y[0] - +x[0]) * 12 + (+y[1] - +x[1]);
  }
  /* 以起點加上天數，回傳 { y, m, d }，供守夜時鐘顯示 */
  function addDays(iso, days) {
    var t = new Date(toUTC(iso) + days * 86400000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function zhDate(o) {
    return o.y + ' 年 ' + o.m + ' 月 ' + o.d + ' 日';
  }
  function gapLabel(months) {
    var y = Math.floor(months / 12), m = months % 12;
    return m ? y + ' 年 ' + m + ' 個月' : y + ' 年';
  }
  function comma(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ---------- 守夜換算：按住 1 秒 ＝ 守了 1 天 ---------- */
  function vigilDays(heldSeconds) {
    return Math.max(0, Math.floor(heldSeconds));
  }
  function vigilProgress(heldSeconds) {
    return Math.min(1, vigilDays(heldSeconds) / VIGIL_TARGET_DAYS);
  }
  /* 守夜途中會浮出來的環境紀錄：回傳「剛好跨過」的那一則，沒有就回 null */
  var VIGIL_LOG = [
    { day: 3, text: '有人在玻璃罩上按了一個指紋。' },
    { day: 11, text: '走廊的日光燈換過一次。' },
    { day: 26, text: '第一次覺得它好像變長了。量了，沒有。' },
    { day: 55, text: '暑假。整層樓只剩下你和它。' },
    { day: 96, text: '有學生問這是不是壞掉了。' },
    { day: 160, text: '你開始在筆記本上畫它的側影。' },
    { day: 240, text: '它離杯口還有半個指節。' },
    { day: 365, text: '一年。它還掛在那裡。' }
  ];
  function vigilEntry(prevDay, day) {
    for (var i = 0; i < VIGIL_LOG.length; i++) {
      if (VIGIL_LOG[i].day > prevDay && VIGIL_LOG[i].day <= day) return VIGIL_LOG[i];
    }
    return null;
  }

  /* ---------- 掛在漏斗口那一滴的形狀（t = 0…1） ---------- */
  function dropShape(t) {
    var k = Math.max(0, Math.min(1, t));
    var len = 4 + 30 * k;          // 頸長
    var r = 2.6 + 8.4 * k;         // 球半徑
    return { len: len, r: r, cy: len + r, top: 3.2 };
  }
  function dropPath(t) {
    var s = dropShape(t);
    var w = s.top, r = s.r, cy = s.cy, L = s.len;
    return 'M' + (-w) + ',0' +
      ' C' + (-w) + ',' + L.toFixed(2) + ' ' + (-r).toFixed(2) + ',' + (cy - r * 1.25).toFixed(2) + ' 0,' + cy.toFixed(2) +
      ' C' + r.toFixed(2) + ',' + (cy - r * 1.25).toFixed(2) + ' ' + w + ',' + L.toFixed(2) + ' ' + w + ',0 Z';
  }

  /* ---------- 敲碎用的碎片：把一塊板子切成格狀多邊形（固定擾動，不用亂數） ---------- */
  function shards(w, h, cols, rows) {
    var jitter = [0.37, -0.28, 0.19, -0.41, 0.24, -0.16, 0.44, -0.33, 0.12, -0.47, 0.29, -0.21];
    var pts = [], i = 0;
    for (var r = 0; r <= rows; r++) {
      var row = [];
      for (var c = 0; c <= cols; c++) {
        var x = (w / cols) * c, y = (h / rows) * r;
        if (c > 0 && c < cols) x += jitter[i++ % jitter.length] * (w / cols) * 0.45;
        if (r > 0 && r < rows) y += jitter[i++ % jitter.length] * (h / rows) * 0.45;
        row.push([+x.toFixed(2), +y.toFixed(2)]);
      }
      pts.push(row);
    }
    var out = [];
    for (var rr = 0; rr < rows; rr++) {
      for (var cc = 0; cc < cols; cc++) {
        var quad = [pts[rr][cc], pts[rr][cc + 1], pts[rr + 1][cc + 1], pts[rr + 1][cc]];
        var mx = 0, my = 0;
        for (var k2 = 0; k2 < 4; k2++) { mx += quad[k2][0]; my += quad[k2][1]; }
        out.push({
          points: quad.map(function (p) { return p.join(','); }).join(' '),
          cx: mx / 4, cy: my / 4,
          dx: (mx / 4 - w / 2) / (w / 2),   // 相對中心的方向，碎片往外飛
          dy: (my / 4 - h / 2) / (h / 2)
        });
      }
    }
    return out;
  }

  return {
    CUT: CUT, DROPS: DROPS, LAST_DROP: LAST_DROP,
    VIGIL_START: VIGIL_START, VIGIL_TARGET_DAYS: VIGIL_TARGET_DAYS, VIGIL_LOG: VIGIL_LOG,
    daysBetween: daysBetween, monthsBetween: monthsBetween, addDays: addDays,
    zhDate: zhDate, gapLabel: gapLabel, comma: comma,
    vigilDays: vigilDays, vigilProgress: vigilProgress, vigilEntry: vigilEntry,
    dropShape: dropShape, dropPath: dropPath, shards: shards
  };
});

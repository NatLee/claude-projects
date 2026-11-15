/* 二〇三八：純邏輯（瀏覽器掛 window.Y38；node 可 require 斷言） */
(function (root) {
  'use strict';
  var MAX = 2147483647;          /* 2^31 − 1：32 位元有號整數的天花板 */
  var MIN = -2147483648;
  var TURNS = 10;                /* 從 1970 轉到 2038 的手把圈數 */
  var LOCK = MAX - 10;           /* 最後十秒不歸你轉 */
  var WD = ['日', '一', '二', '三', '四', '五', '六'];

  /* 把任意整數塞進 32 位元有號暫存器（溢位就繞回） */
  function toInt32(n) {
    var m = ((n % 4294967296) + 4294967296) % 4294967296;
    return m >= 2147483648 ? m - 4294967296 : m;
  }
  /* 二補數位元，MSB 在前 */
  function bits32(n) {
    var u = toInt32(n) >>> 0, out = [];
    for (var i = 31; i >= 0; i--) out.push((u >>> i) & 1);
    return out;
  }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  /* 秒數 → 日期字串（offsetH 小時時區；1901 也照算） */
  function fmt(sec, offsetH) {
    var d = new Date((sec + (offsetH || 0) * 3600) * 1000);
    return {
      date: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()),
      time: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()),
      wd: WD[d.getUTCDay()],
      year: d.getUTCFullYear()
    };
  }
  /* 手把累積角度（弧度）→ 虛擬秒數 */
  function angleToSec(a) {
    var k = Math.max(0, Math.min(1, a / (Math.PI * 2 * TURNS)));
    return Math.round(k * LOCK);
  }
  function secToAngle(s) { return s / LOCK * Math.PI * 2 * TURNS; }
  /* 兩個角度的最短差（處理 ±π 接縫） */
  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function breakdown(s) {
    s = Math.max(0, Math.floor(s));
    return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
  }
  /* 路上的里程碑（秒數皆可由 node 驗算） */
  var MILESTONES = [
    { at: 1000000000, key: 'b' },
    { at: 1073741824, key: 'half' },
    { at: MAX - 1000000000, key: 'aol' },
    { at: 1234567890, key: 'seq' }
  ];
  MILESTONES.sort(function (x, y) { return x.at - y.at; });
  /* 從 prev 走到 cur 之間跨過了哪些里程碑 */
  function crossed(prev, cur, list) {
    return (list || MILESTONES).filter(function (m) { return prev < m.at && cur >= m.at; });
  }

  var Y38 = { MAX: MAX, MIN: MIN, TURNS: TURNS, LOCK: LOCK, MILESTONES: MILESTONES,
    toInt32: toInt32, bits32: bits32, fmt: fmt, angleToSec: angleToSec, secToAngle: secToAngle,
    angDiff: angDiff, breakdown: breakdown, crossed: crossed, pad: pad };
  if (typeof module !== 'undefined' && module.exports) module.exports = Y38;
  else root.Y38 = Y38;
})(this);

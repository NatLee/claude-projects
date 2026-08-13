/* ==========================================================================
 * 我們寄不出去五百英里 — 核心邏輯（純函式，無 DOM）
 * 供 index.html 使用，並由同資料夾的 tests.js 以 node 斷言驗證。
 * 刻意不用 ES module，維持 file:// 雙擊可開。
 * ========================================================================== */
'use strict';

/* 1 毫光秒 = 光在真空中跑 1 毫秒的距離，換算成英里 */
var MILES_PER_MLS = (0.001 * 299792458) / 1609.344; // ≈ 186.2824

/* 故事裡實際被寄過的目的地。
 * dist  = 與教堂山（UNC，35.9132N 79.0558W）的大圓距離（英里，實算取整）
 * brg   = 方位角（度，正北為 0）
 * ok    = 1994–97 年那幾天的實測結果：true 寄得到、false 寄不到
 * odd   = 半徑模型永遠解釋不了的那一點（底特律）
 * lx/ly = 標籤位移（px），純排版用
 */
var CITIES = [
  { key: 'unc',  name: '校內信箱',   dist: 0,    brg: 0,   ok: true,  odd: false, lx: 0,   ly: 20,  anchor: 'middle' },
  { key: 'rdu',  name: '里奇蒙',     dist: 144,  brg: 38,  ok: true,  odd: false, lx: 11,  ly: 4,   anchor: 'start' },
  { key: 'dca',  name: '華盛頓',     dist: 235,  brg: 28,  ok: true,  odd: false, lx: -11, ly: 4,   anchor: 'end' },
  { key: 'atl',  name: '亞特蘭大',   dist: 337,  brg: 245, ok: true,  odd: false, lx: -11, ly: 4,   anchor: 'end' },
  { key: 'prn',  name: '普林斯頓',   dist: 389,  brg: 37,  ok: true,  odd: false, lx: -11, ly: 4,   anchor: 'end' },
  { key: 'nyc',  name: '紐約',       dist: 430,  brg: 38,  ok: true,  odd: false, lx: 11,  ly: 4,   anchor: 'start' },
  { key: 'det',  name: '底特律',     dist: 492,  brg: 335, ok: false, odd: true,  lx: -11, ly: 4,   anchor: 'end' },
  { key: 'pvd',  name: '普羅維登斯', dist: 579,  brg: 43,  ok: false, odd: false, lx: 11,  ly: -9,  anchor: 'start' },
  { key: 'bos',  name: '波士頓',     dist: 618,  brg: 41,  ok: false, odd: false, lx: 11,  ly: 15,  anchor: 'start' },
  { key: 'mem',  name: '孟菲斯',     dist: 620,  brg: 268, ok: false, odd: false, lx: -11, ly: 4,   anchor: 'end' },
  { key: 'sea',  name: '西雅圖',     dist: 2337, brg: 304, ok: false, odd: false, lx: 0,   ly: -13, anchor: 'middle', offscope: true }
];

/* 逾時（毫秒）→ 光在真空中跑得到的半徑（英里） */
function radiusForMs(ms) {
  return ms * MILES_PER_MLS;
}

/* 在給定半徑下，這個目的地會不會寄得到 */
function predictOk(city, radius) {
  return city.dist <= radius;
}

/* 納入比對的目的地數（排除底特律那個異常點） */
function scorableCities() {
  return CITIES.filter(function (c) { return !c.odd; });
}

/* 某個逾時值能對上幾個實測結果 */
function matchCount(ms) {
  var r = radiusForMs(ms);
  return scorableCities().reduce(function (n, c) {
    return n + (predictOk(c, r) === c.ok ? 1 : 0);
  }, 0);
}

/* 全對？ */
function isSolved(ms) {
  return matchCount(ms) === scorableCities().length;
}

/* 全對的逾時區間 [下限, 上限]（毫秒，以 0.01 為刻度掃描） */
function solvedBand() {
  var lo = null, hi = null;
  for (var i = 0; i <= 1600; i++) {
    var ms = i / 100;
    if (isSolved(ms)) { if (lo === null) lo = ms; hi = ms; }
  }
  return [lo, hi];
}

/* 讓 node 測試檔可以取用；瀏覽器端則留在全域 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MILES_PER_MLS: MILES_PER_MLS, CITIES: CITIES, radiusForMs: radiusForMs, predictOk: predictOk, scorableCities: scorableCities, matchCount: matchCount, isSolved: isSolved, solvedBand: solvedBand };
}

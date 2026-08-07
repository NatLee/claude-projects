/* ==========================================================================
 * polar.js — 「風正從你要去的方向吹來」的核心數學（純函式，可在 node 下斷言）
 *
 * 這是一條「風格化」的極線圖（polar diagram）：形狀對、數量級對，
 * 但不是任何一艘特定船的實測極線。設計目標（見 說明.md）：
 *   · 死角：真風角 ≤30° 完全沒有推力
 *   · 逆風最佳 VMG 落在 42–48°（實船典型 40–45°）
 *   · 最高船速出現在 95–105°（橫風／偏後風）
 *   · 正後方順風的船速明顯小於風速
 * ========================================================================== */
'use strict';

var NOGO_DEG = 30;      // 死角半角
var RISE_K = 4.5;       // 離開死角後推力回升的陡度（度）
var HUMP_PEAK = 100;    // 最高船速的真風角
var HUMP_DEPTH = 0.45;  // 正後方順風掉多少

/* 把任意角度收斂成 0–180 的「離風角」（左右舷對稱） */
function normTWA(deg) {
  var a = ((deg % 360) + 360) % 360;
  return a > 180 ? 360 - a : a;
}

/* 船速 ÷ 風速 */
function polarFactor(twa) {
  var a = normTWA(twa);
  if (a <= NOGO_DEG) return 0;
  var rise = 1 - Math.exp(-(a - NOGO_DEG) / RISE_K);
  var d = Math.min(Math.abs(a - HUMP_PEAK) / 80, 1);
  var hump = 1 - HUMP_DEPTH * d * d;
  return rise * hump;
}

function boatSpeed(twa, wind) { return wind * polarFactor(twa); }

/* 逆風分速度：真正朝「風來的方向」推進的那一部分 */
function vmgUpwind(twa, wind) {
  var a = normTWA(twa);
  return boatSpeed(a, wind) * Math.cos(a * Math.PI / 180);
}

/* 掃描找極值（步進 0.1 度，夠精細也夠快） */
function argMax(lo, hi, f) {
  var best = lo, bv = -Infinity;
  for (var a = lo; a <= hi + 1e-9; a += 0.1) {
    var v = f(a);
    if (v > bv) { bv = v; best = a; }
  }
  return Math.round(best * 10) / 10;
}
function bestUpwindAngle() { return argMax(0, 90, function (a) { return vmgUpwind(a, 1); }); }
function fastestAngle() { return argMax(0, 180, function (a) { return polarFactor(a); }); }

/* 帆的升力係數：0 度在拍動，約 22 度最有力，過了就失速 */
function liftCoef(alphaDeg) {
  if (alphaDeg <= 0) return 0;
  var a = alphaDeg * Math.PI / 180;
  var base = 1.15 * Math.sin(2 * a);
  var stall = 1 / (1 + Math.exp((alphaDeg - 28) / 2.2));
  return Math.max(0, base * stall);
}

/* 一股垂直於帆面的力，分給「前進」與「側向」各多少（0–1） */
function forceSplit(sailAngleDeg) {
  var s = Math.abs(sailAngleDeg) * Math.PI / 180;
  return { forward: Math.sin(s), lateral: Math.cos(s) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NOGO_DEG: NOGO_DEG, normTWA: normTWA, polarFactor: polarFactor, boatSpeed: boatSpeed,
    vmgUpwind: vmgUpwind, bestUpwindAngle: bestUpwindAngle, fastestAngle: fastestAngle,
    liftCoef: liftCoef, forceSplit: forceSplit
  };
}

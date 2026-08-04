/* ==========================================================================
 * 還醒著的東西 — 純計算核心
 *
 * 台電「住宅用電（非時間電價）」六段累進費率，自 2025-10-01（民國 114 年
 * 10 月 1 日）起實施。夏月為每年 6/1–9/30，其餘為非夏月。
 * 單位：元／度。
 *
 * 這個檔案不碰 DOM，方便用 node 斷言驗證。
 * ========================================================================== */
'use strict';

/* 級距上界（度／月）與各級單價 */
var TIER_BOUNDS = [120, 330, 500, 700, 1000, Infinity];
var RATE_SUMMER = [1.78, 2.55, 3.80, 5.14, 6.44, 8.86];
var RATE_NORMAL = [1.78, 2.26, 3.13, 4.24, 5.27, 7.03];

var SUMMER_MONTHS = 4;   // 6、7、8、9 月
var NORMAL_MONTHS = 8;
var HOURS_PER_YEAR = 8760;

function rates(isSummer) { return isSummer ? RATE_SUMMER : RATE_NORMAL; }

/* 單月流動電費（元）：分段累進，不含基本電費與各項附加費 */
function monthlyEnergyCharge(kwh, isSummer) {
  var r = rates(isSummer);
  var left = Math.max(0, Number(kwh) || 0);
  var prev = 0;
  var sum = 0;
  for (var i = 0; i < TIER_BOUNDS.length && left > 0; i++) {
    var span = TIER_BOUNDS[i] - prev;
    var take = Math.min(left, span);
    sum += take * r[i];
    left -= take;
    prev = TIER_BOUNDS[i];
  }
  return sum;
}

/* 這一戶「最後一度電」落在第幾級（1-based）與該級單價 */
function marginalTier(kwh, isSummer) {
  var k = Math.max(0, Number(kwh) || 0);
  var idx = 0;
  for (var i = 0; i < TIER_BOUNDS.length; i++) {
    if (k <= TIER_BOUNDS[i]) { idx = i; break; }
    idx = i + 1 <= TIER_BOUNDS.length - 1 ? i + 1 : i;
  }
  if (k === 0) idx = 0;
  return { tier: idx + 1, rate: rates(isSummer)[idx] };
}

/* 待機瓦數 → 每年、每月耗電度數 */
function wattsToKwhPerYear(watts) {
  return (Number(watts) || 0) * HOURS_PER_YEAR / 1000;
}
function wattsToKwhPerMonth(watts) {
  return wattsToKwhPerYear(watts) / 12;
}

/*
 * 一年因為這些瓦數而多付的電費。
 * 關鍵：累進電價下，待機電力是「疊在最上面」的那幾度，所以要用
 * 「有它的帳單 − 沒有它的帳單」來算，而不是乘以平均單價。
 * monthlyKwh = 你帳單上的每月用電度數（已包含待機）。
 */
function annualStandbyCost(watts, monthlyKwh) {
  var st = wattsToKwhPerMonth(watts);
  var base = Math.max(0, Number(monthlyKwh) || 0);
  var without = Math.max(0, base - st);
  var s = monthlyEnergyCharge(base, true) - monthlyEnergyCharge(without, true);
  var n = monthlyEnergyCharge(base, false) - monthlyEnergyCharge(without, false);
  return s * SUMMER_MONTHS + n * NORMAL_MONTHS;
}

/* 待機電力占這一戶全年用電的比例（0–1） */
function standbyShare(watts, monthlyKwh) {
  var yearTotal = (Math.max(0, Number(monthlyKwh) || 0)) * 12;
  if (yearTotal <= 0) return 0;
  return Math.min(1, wattsToKwhPerYear(watts) / yearTotal);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIER_BOUNDS: TIER_BOUNDS,
    RATE_SUMMER: RATE_SUMMER,
    RATE_NORMAL: RATE_NORMAL,
    monthlyEnergyCharge: monthlyEnergyCharge,
    marginalTier: marginalTier,
    wattsToKwhPerYear: wattsToKwhPerYear,
    wattsToKwhPerMonth: wattsToKwhPerMonth,
    annualStandbyCost: annualStandbyCost,
    standbyShare: standbyShare
  };
}

/* ==========================================================================
 * 時間的價錢 · 純計算核心
 * 這裡只放不碰 DOM 的純函式，方便用 node 斷言驗證。
 * 瀏覽器以一般 <script src> 載入（不是 ES module，file:// 可直接開）。
 * ========================================================================== */
'use strict';

/* 每週工時 → 每月工時（52 週攤成 12 個月） */
function monthlyHoursFromWeekly(weeklyHours) {
  return (Number(weeklyHours) || 0) * 52 / 12;
}

/* 帳面時薪：月薪 ÷ 打卡工時 */
function nominalHourlyWage(monthlySalary, weeklyHours) {
  const h = monthlyHoursFromWeekly(weeklyHours);
  return h > 0 ? (Number(monthlySalary) || 0) / h : 0;
}

/* 真實時薪：扣掉「為了工作才有的支出」，加上「為了工作才被佔走的時間」
 * o = { monthlySalary, weeklyHours, overtimeHrsPerWeek,
 *       commuteMinPerDay, unwindMinPerDay, jobCostPerMonth, workDaysPerWeek } */
function realHourlyWage(o) {
  o = o || {};
  const workDays = o.workDaysPerWeek == null ? 5 : Number(o.workDaysPerWeek) || 0;
  const perDayMin = (Number(o.commuteMinPerDay) || 0) + (Number(o.unwindMinPerDay) || 0);
  const extraWeekly = (Number(o.overtimeHrsPerWeek) || 0) + perDayMin * workDays / 60;
  const hours = monthlyHoursFromWeekly((Number(o.weeklyHours) || 0) + extraWeekly);
  const net = (Number(o.monthlySalary) || 0) - (Number(o.jobCostPerMonth) || 0);
  if (hours <= 0) return 0;
  return Math.max(0, net) / hours;
}

/* 金額 → 分鐘 */
function priceToMinutes(price, hourlyWage) {
  const w = Number(hourlyWage) || 0;
  if (!(w > 0)) return 0;
  return (Number(price) || 0) / w * 60;
}

/* 分鐘 → 「X 小時 Y 分」 */
function formatDuration(mins) {
  const v = Number(mins) || 0;
  if (v <= 0) return '0 分';
  if (v < 1) return '不到 1 分';
  const total = Math.round(v);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return m + ' 分';
  if (m === 0) return h + ' 小時';
  return h + ' 小時 ' + m + ' 分';
}

/* 分鐘 → 換算成幾個上班日（依每日實際工時） */
function toWorkdays(mins, dailyHours) {
  const d = Number(dailyHours) || 0;
  if (!(d > 0)) return 0;
  return (Number(mins) || 0) / 60 / d;
}

/* 品項加總 */
function sumPrices(items) {
  return (items || []).reduce((a, it) => a + (Number(it && it.price) || 0), 0);
}

/* 兩個時薪的落差百分比（正數＝真實比帳面低幾 %） */
function wageGapPercent(nominal, real) {
  const n = Number(nominal) || 0;
  if (!(n > 0)) return 0;
  return (1 - (Number(real) || 0) / n) * 100;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    monthlyHoursFromWeekly, nominalHourlyWage, realHourlyWage,
    priceToMinutes, formatDuration, toWorkdays, sumPrices, wageGapPercent,
  };
}

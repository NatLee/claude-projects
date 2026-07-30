/* ============================================================
   engine.js — 掉下去的那三秒
   純函式集合：自由落體、知覺計時器的頻率換算與可讀性模型、
   以及「事後估計 vs 實際時長」的高估比例。
   不碰 DOM、不碰時間、不碰隨機數（隨機留給頁面）。
   所有函式對壞輸入一律回傳 null，絕不回傳 NaN / Infinity。
   ============================================================ */

var FallSlow = (function () {
  'use strict';

  /* ---------- 常數 ---------- */
  var G = 9.80665;        // 標準重力加速度 m/s²
  var TOWER_M = 31;       // SCAD 高塔落下高度（公尺）
  var HZ_MIN = 2;         // 使用者可調的最慢交替速度
  var HZ_MAX = 20;        // 使用者可調的最快交替速度
  var HZ_CAP = 30;        // 全域上限：再快也不可能誠實呈現（螢幕更新率）
  var DEFAULT_HZ = 6;     // 跳過校準時給的保守門檻

  /* ---------- 小工具 ---------- */
  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function clamp(v, lo, hi) {
    if (!isNum(v) || !isNum(lo) || !isNum(hi)) return null;
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function round(v, digits) {
    if (!isNum(v)) return null;
    var d = isNum(digits) ? Math.max(0, Math.min(10, Math.floor(digits))) : 0;
    var f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  function gravity(g) {
    return (isNum(g) && g > 0) ? g : G;
  }

  /* ---------- 自由落體 ----------
     t = sqrt(2h/g)。31 公尺實際算出來約 2.51 秒，不寫死。 */

  // 從高度 h 落到地面需要幾秒
  function fallTime(h, g) {
    if (!isNum(h) || h < 0) return null;
    if (h === 0) return 0;
    return Math.sqrt(2 * h / gravity(g));
  }

  // 落了 t 秒之後掉了幾公尺
  function fallDistance(t, g) {
    if (!isNum(t) || t < 0) return null;
    return 0.5 * gravity(g) * t * t;
  }

  // 落了 t 秒之後離地還有幾公尺（不會是負的）
  function altitudeAt(t, h0, g) {
    var d = fallDistance(t, g);
    if (d === null || !isNum(h0) || h0 < 0) return null;
    return clamp(h0 - d, 0, h0);
  }

  // 落了 t 秒的瞬時速度（公尺／秒），忽略空氣阻力
  function fallSpeed(t, g) {
    if (!isNum(t) || t < 0) return null;
    return gravity(g) * t;
  }

  // 公尺／秒 → 公里／小時
  function toKmh(mps) {
    if (!isNum(mps)) return null;
    return mps * 3.6;
  }

  // 墜落進度 0 → 1
  function fallProgress(t, h0, g) {
    if (!isNum(h0) || h0 <= 0) return null;
    var d = fallDistance(t, g);
    if (d === null) return null;
    return clamp(d / h0, 0, 1);
  }

  /* ---------- 知覺計時器 ----------
     數字與它的負片影像交替。交替速度以 Hz 表示：
     每秒切換幾次畫面，每一次畫面就停留 1000/hz 毫秒。 */

  // Hz → 每格顯示毫秒
  function hzToFrameMs(hz) {
    if (!isNum(hz) || hz <= 0) return null;
    return 1000 / hz;
  }

  // 每格顯示毫秒 → Hz（與上式互為反函式）
  function frameMsToHz(ms) {
    if (!isNum(ms) || ms <= 0) return null;
    return 1000 / ms;
  }

  // 一個完整循環（正片＋負片）幾毫秒
  function cycleMs(hz) {
    var f = hzToFrameMs(hz);
    return f === null ? null : f * 2;
  }

  // 在一段時間裡總共會切換幾格
  function framesInWindow(hz, windowMs) {
    var f = hzToFrameMs(hz);
    if (f === null || !isNum(windowMs) || windowMs < 0) return null;
    // 加一點點容差，免得 1000 / (1000/15) 這種浮點誤差把 15 格算成 14 格
    return Math.floor(windowMs / f + 1e-9);
  }

  // 螢幕更新率決定了誠實的上限：一格至少要撐一個更新週期
  function maxHonestHz(refreshHz) {
    var r = (isNum(refreshHz) && refreshHz > 0) ? refreshHz : 60;
    return r / 2;
  }

  // 硬判定：這個速度，這個人讀不讀得出來
  // 越快越讀不出來 —— 對 hz 單調不遞增
  function isReadable(hz, thresholdHz) {
    if (!isNum(hz) || !isNum(thresholdHz)) return null;
    if (hz <= 0 || thresholdHz <= 0) return null;
    return hz <= thresholdHz;
  }

  // 軟判定：讀得出來的機率（logistic），門檻上剛好 0.5
  // 同樣對 hz 單調遞減
  function readProbability(hz, thresholdHz) {
    if (!isNum(hz) || !isNum(thresholdHz)) return null;
    if (hz <= 0 || thresholdHz <= 0) return null;
    var k = Math.max(0.5, thresholdHz * 0.12);
    var p = 1 / (1 + Math.exp((hz - thresholdHz) / k));
    if (!isNum(p)) return (hz > thresholdHz) ? 0 : 1;
    return clamp(p, 0, 1);
  }

  // 墜落中要閃給你看的速度：比你的門檻更快一截
  function challengeHz(thresholdHz, factor) {
    if (!isNum(thresholdHz) || thresholdHz <= 0) return null;
    var f = (isNum(factor) && factor > 1) ? factor : 1.4;
    var raw = Math.max(thresholdHz * f, thresholdHz + 3);
    return clamp(Math.round(raw), HZ_MIN, HZ_CAP);
  }

  // 把速度講成人話
  function speedLabel(hz) {
    if (!isNum(hz) || hz <= 0) return null;
    if (hz < 5) return '慢到看得清楚';
    if (hz < 9) return '開始吃力';
    if (hz < 14) return '快要糊掉';
    return '一團模糊';
  }

  /* ---------- 估計 vs 實際 ---------- */

  // 高估百分比：實際 2.5 秒、你估 5.0 秒 → 100
  function overestimatePercent(actualSec, estimateSec) {
    if (!isNum(actualSec) || !isNum(estimateSec)) return null;
    if (actualSec <= 0) return null;
    if (estimateSec < 0) return null;
    return (estimateSec - actualSec) / actualSec * 100;
  }

  // 估計是實際的幾倍
  function estimateRatio(actualSec, estimateSec) {
    if (!isNum(actualSec) || !isNum(estimateSec)) return null;
    if (actualSec <= 0 || estimateSec < 0) return null;
    return estimateSec / actualSec;
  }

  // 把高估比例翻成一句話
  function describeEstimate(pct) {
    if (!isNum(pct)) return null;
    if (pct >= 60) return { key: 'high', text: '你把它拉長了不只一半。' };
    if (pct > 12) return { key: 'over', text: '你把它估長了。' };
    if (pct >= -12) return { key: 'near', text: '你估得相當準。' };
    if (pct > -40) return { key: 'under', text: '你反而估短了一點。' };
    return { key: 'low', text: '你把它估得比實際短很多。' };
  }

  /* ---------- 顯示格式 ---------- */

  function formatSec(v, digits) {
    var r = round(v, isNum(digits) ? digits : 2);
    if (r === null) return '—';
    return r.toFixed(isNum(digits) ? digits : 2);
  }

  function formatPercent(v) {
    var r = round(v, 0);
    if (r === null) return '—';
    return (r > 0 ? '+' : '') + r + '%';
  }

  return {
    G: G,
    TOWER_M: TOWER_M,
    HZ_MIN: HZ_MIN,
    HZ_MAX: HZ_MAX,
    HZ_CAP: HZ_CAP,
    DEFAULT_HZ: DEFAULT_HZ,
    isNum: isNum,
    clamp: clamp,
    round: round,
    fallTime: fallTime,
    fallDistance: fallDistance,
    altitudeAt: altitudeAt,
    fallSpeed: fallSpeed,
    toKmh: toKmh,
    fallProgress: fallProgress,
    hzToFrameMs: hzToFrameMs,
    frameMsToHz: frameMsToHz,
    cycleMs: cycleMs,
    framesInWindow: framesInWindow,
    maxHonestHz: maxHonestHz,
    isReadable: isReadable,
    readProbability: readProbability,
    challengeHz: challengeHz,
    speedLabel: speedLabel,
    overestimatePercent: overestimatePercent,
    estimateRatio: estimateRatio,
    describeEstimate: describeEstimate,
    formatSec: formatSec,
    formatPercent: formatPercent
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FallSlow;
}

/* ==========================================================================
 * logic.js — 立合的呼吸與判定（純函式，node 可直接 require 斷言）
 *
 * 模型依據（詳見 說明.md）：
 *   · 立合い由兩名力士「呼吸を合わせて」自行成立，不由第三者發令。
 *     ——日本相撲協會 寄附行為細則 勝負規定第五條、ja.wikipedia「立合い」
 *   · 因此本頁把「對手起身的時刻」寫成**你按住並穩住之後的第一個谷底**，
 *     而不是一個固定碼表：對手在等你，你在讀他。這是全頁結尾的回馬槍。
 *   · 唯一可讀線索：起身前的最後一口氣比前面都深（amplitude 放大）。
 *
 * 匯出：wave / riseAt / amplitude / chest / judge / gradeOf / CONST
 * ========================================================================== */
(function (root) {
  'use strict';

  var PERIOD = 2000;      /* 一次呼吸的毫秒數 */
  var TELL = 0.8;         /* 起身前多少個週期開始「吸得比較深」 */
  var TELL_GAIN = 0.5;    /* 最深時比平常深多少（+50%） */
  var AMP_MAX = 1 + TELL_GAIN;
  var WIN = 150;          /* 合上的容許誤差（毫秒） */
  var WIN_REDUCED = 260;  /* reduced-motion 下放寬 */
  var PERFECT = 0.4;      /* 誤差在容許窗的 40% 以內算「気が合った」 */

  /* 呼吸曲線：+1＝吸飽（胸口最高），−1＝吐完（谷底）。phase 以「週期」為單位。 */
  function wave(t, period, phase) {
    return Math.cos(2 * Math.PI * (t / period + phase));
  }

  /* 對手起身的時刻＝ holdStart+settle 之後的第一個谷底。
     谷底條件：t/period + phase = 0.5 + k（k 為整數）。 */
  function riseAt(holdStart, settle, period, phase) {
    var earliest = holdStart + settle;
    var k = Math.ceil(earliest / period + phase - 0.5);
    return period * (0.5 + k - phase);
  }

  /* 最後一口氣的放大倍率（1 → AMP_MAX），只作用在起身前的最後 TELL 個週期。 */
  function amplitude(t, riseT, period, tell, gain) {
    if (tell == null) tell = TELL;
    if (gain == null) gain = TELL_GAIN;
    if (!isFinite(riseT)) return 1;
    var span = period * tell;
    var dt = riseT - t;
    if (dt < 0 || dt > span) return 1;
    return 1 + gain * (1 - dt / span);
  }

  /* 對手胸口高度：畫面與判定共用同一條線，玩家看到的就是玩家要讀的。 */
  function chest(t, riseT, period, phase) {
    return wave(t, period, phase) * amplitude(t, riseT, period);
  }

  /* 判定放開的時機。d<0＝比對手早，d>0＝比對手晚。 */
  function judge(release, riseT, win) {
    if (win == null) win = WIN;
    var d = release - riseT;
    if (d < -win) return { r: 'matta', d: d, perfect: false };
    if (d > win) return { r: 'late', d: d, perfect: false };
    return { r: 'match', d: d, perfect: Math.abs(d) <= win * PERFECT };
  }

  /* 給玩家看的評語鍵（文案留在頁面上） */
  function gradeOf(res) {
    if (res.r !== 'match') return res.r;
    return res.perfect ? 'perfect' : 'ok';
  }

  var api = {
    PERIOD: PERIOD, TELL: TELL, TELL_GAIN: TELL_GAIN, AMP_MAX: AMP_MAX,
    WIN: WIN, WIN_REDUCED: WIN_REDUCED, PERFECT: PERFECT,
    wave: wave, riseAt: riseAt, amplitude: amplitude,
    chest: chest, judge: judge, gradeOf: gradeOf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TACHIAI = api;
})(typeof window !== 'undefined' ? window : globalThis);

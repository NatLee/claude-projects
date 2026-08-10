/* 三十四小時等於一學期 —— 純函式
   同時給瀏覽器 <script src="pure.js"> 與 node require 使用。
   這裡只放「不碰 DOM」的邏輯：翻頁狀態機、螢光筆標記開關、換算。 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) { module.exports = api; }
  if (root) { root.ReportPure = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TOTAL = 6;

  /* ---------- 翻頁 ---------- */

  function clampPage(i, total) {
    var t = (typeof total === 'number' && total > 0) ? Math.floor(total) : TOTAL;
    var n = Math.floor(Number(i));
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > t - 1) return t - 1;
    return n;
  }

  function makeState(total) {
    var t = (typeof total === 'number' && total > 0) ? Math.floor(total) : TOTAL;
    return { page: 0, total: t, seen: [0], marks: [], revealed: false };
  }

  function goTo(state, i) {
    var p = clampPage(i, state.total);
    var seen = state.seen.slice();
    if (seen.indexOf(p) === -1) seen.push(p);
    return {
      page: p, total: state.total, seen: seen,
      marks: state.marks.slice(), revealed: state.revealed
    };
  }

  function step(state, dir) {
    return goTo(state, state.page + (dir > 0 ? 1 : -1));
  }

  function atFirst(state) { return state.page === 0; }
  function atLast(state) { return state.page === state.total - 1; }
  function seenAll(state) { return state.seen.length === state.total; }

  /* 「顯示這一段」只有翻到最後一頁（致謝與資金揭露）才可用 */
  function canReveal(state) { return atLast(state); }

  function reveal(state) {
    if (!canReveal(state)) return state;
    return {
      page: state.page, total: state.total, seen: state.seen.slice(),
      marks: state.marks.slice(), revealed: true
    };
  }

  function pageLabel(state) { return (state.page + 1) + ' / ' + state.total; }

  /* ---------- 螢光筆 ---------- */

  function toggleMark(marks, id) {
    var out = marks.slice();
    var k = out.indexOf(id);
    if (k === -1) out.push(id); else out.splice(k, 1);
    return out;
  }

  function isMarked(marks, id) { return marks.indexOf(id) !== -1; }
  function markCount(marks) { return marks.length; }

  /* ---------- 換算 ----------
     WebCAPE 分級測驗中，270 分是「可被分發到大學第二學期」的門檻。
     報告的做法：門檻 ÷ 每小時進步分數 = 需要的時數（原文向上取整）。 */

  function hoursExact(cutoff, rate) {
    if (!(rate > 0)) return null;
    return Math.round((cutoff / rate) * 10) / 10;
  }

  function hoursCeil(cutoff, rate) {
    if (!(rate > 0)) return null;
    return Math.ceil(cutoff / rate);
  }

  return {
    TOTAL: TOTAL,
    clampPage: clampPage,
    makeState: makeState,
    goTo: goTo,
    step: step,
    atFirst: atFirst,
    atLast: atLast,
    seenAll: seenAll,
    canReveal: canReveal,
    reveal: reveal,
    pageLabel: pageLabel,
    toggleMark: toggleMark,
    isMarked: isMarked,
    markCount: markCount,
    hoursExact: hoursExact,
    hoursCeil: hoursCeil
  };
});

/* ==========================================================================
 * 純邏輯：那十個按鍵的比對器
 * 抽成沒有 DOM 依賴的函式，方便用 node 斷言驗證。
 * ========================================================================== */
'use strict';

(function (root) {
  /* 1986 年橋本和久留在《Gradius》紅白機版裡的順序 */
  const SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];

  /* 把鍵盤事件的 key 或畫面按鈕的 data-token 正規化成上面那六種代號 */
  function normalize(raw) {
    if (raw === null || raw === undefined) return null;
    const k = String(raw);
    if (k === 'ArrowUp' || k === 'Up') return 'up';
    if (k === 'ArrowDown' || k === 'Down') return 'down';
    if (k === 'ArrowLeft' || k === 'Left') return 'left';
    if (k === 'ArrowRight' || k === 'Right') return 'right';
    const low = k.toLowerCase();
    if (low === 'b' || low === 'a') return low;
    if (low === 'up' || low === 'down' || low === 'left' || low === 'right') return low;
    return null;
  }

  /* 餵一個代號進去，回傳新的進度與結果
   * result：advance（對，前進一格）／complete（十下到齊）／
   *         reset（按錯，從頭；若按錯的那下剛好是開頭的 ↑，就當作新的第一下）／
   *         ignore（不是有效按鍵，或已經解開了）
   */
  function feed(progress, token) {
    const p = Math.max(0, Math.min(SEQUENCE.length, Number(progress) | 0));
    if (!token) return { progress: p, result: 'ignore' };
    if (p >= SEQUENCE.length) return { progress: p, result: 'ignore' };
    if (token === SEQUENCE[p]) {
      const np = p + 1;
      return { progress: np, result: np === SEQUENCE.length ? 'complete' : 'advance' };
    }
    return { progress: token === SEQUENCE[0] ? 1 : 0, result: 'reset' };
  }

  /* 給人看的寫法：↑↑↓↓←→←→BA */
  const GLYPH = { up: '↑', down: '↓', left: '←', right: '→', b: 'B', a: 'A' };
  function glyphs() {
    return SEQUENCE.map(function (t) { return GLYPH[t]; });
  }

  root.KonamiLogic = { SEQUENCE: SEQUENCE, GLYPH: GLYPH, normalize: normalize, feed: feed, glyphs: glyphs };
})(typeof globalThis !== 'undefined' ? globalThis : this);

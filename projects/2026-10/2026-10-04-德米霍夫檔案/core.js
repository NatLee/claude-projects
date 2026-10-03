/* core.js — 「請找德米霍夫教授」的純函式（瀏覽器與 node 共用）
 *
 * 1996 年狄貝基在莫斯科問的那句話，被切成可以點的詞塊；其中兩塊是錯的：
 *   「教授」——他一輩子沒有被授予教授頭銜；
 *   「最後的敬意」——他那時還活著。
 * （European Heart Journal 2017, Matskeplishvili：「there were two errors in his short sentence」）
 */
(function (root) {
  'use strict';
  var SENTENCE = [
    { t: '「我' }, { t: '能' }, { t: '去' }, { t: '向' }, { t: '德米霍夫' },
    { t: '教授', err: 'title', note: '他一輩子都沒有被授予教授頭銜。' },
    { t: '，' }, { t: '致上' },
    { t: '最後的敬意', err: 'alive', note: '他還活著，住在莫斯科郊區一間很小的公寓。' },
    { t: '嗎？」' }
  ];
  var ERRORS = SENTENCE.filter(function (w) { return w.err; }).map(function (w) { return w.err; });

  function joined() { return SENTENCE.map(function (w) { return w.t; }).join(''); }
  /* 點了第 i 塊：回傳 {hit, err, note}；不會改動傳進來的 found */
  function pick(i, found) {
    var w = SENTENCE[i];
    if (!w) return { hit: false, err: null, note: null, done: isDone(found) };
    var f = Object.assign({}, found);
    if (w.err) f[w.err] = true;
    return { hit: !!w.err, err: w.err || null, note: w.note || null, found: f, done: isDone(f) };
  }
  function isDone(found) {
    for (var i = 0; i < ERRORS.length; i++) if (!found || !found[ERRORS[i]]) return false;
    return true;
  }

  /* 足歲：出生（年、月）到某一天（年、月） */
  function ageAt(by, bm, y, m) { return (y - by) - (m < bm ? 1 : 0); }

  /* 揭開進度 */
  function progress(opened, total) {
    total = Math.max(0, total | 0);
    var n = Math.max(0, Math.min(total, opened | 0));
    return { n: n, total: total, all: total > 0 && n === total, text: n + '／' + total };
  }

  var CORE = { SENTENCE: SENTENCE, ERRORS: ERRORS, joined: joined, pick: pick, isDone: isDone, ageAt: ageAt, progress: progress };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  else root.DMK = CORE;
})(typeof window !== 'undefined' ? window : globalThis);

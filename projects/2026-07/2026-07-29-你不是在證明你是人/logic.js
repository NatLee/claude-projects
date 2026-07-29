/* ==========================================================================
 * 你不是在證明你是人 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 *
 * reCAPTCHA v1 的核心：一題兩個字。
 *   控制字（control word）—— 系統知道答案，用來確認你是人。
 *   未知字（unknown word）—— OCR 讀不出來的舊報紙掃描，系統也不知道答案。
 * 你打的未知字不會被檢查，而是丟進票箱，跟其他人的答案一起表決。
 * ========================================================================== */
'use strict';

/* 比對前先正規化：去頭尾空白、轉小寫、丟掉標點 */
function normalize(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/* 只有控制字會被檢查 */
function checkControl(input, answer) {
  var a = normalize(input);
  return a.length > 0 && a === normalize(answer);
}

/* 票箱：取眾數；平手時取字母序較小者，結果才可重現 */
function consensus(answers) {
  var tally = Object.create(null), i, k;
  var clean = [];
  for (i = 0; i < answers.length; i++) {
    var n = normalize(answers[i]);
    if (!n) continue;
    clean.push(n);
    tally[n] = (tally[n] || 0) + 1;
  }
  var bestWord = null, bestCount = 0;
  var keys = Object.keys(tally).sort();
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (tally[k] > bestCount) { bestCount = tally[k]; bestWord = k; }
  }
  return {
    word: bestWord,
    votes: bestCount,
    total: clean.length,
    confidence: clean.length ? bestCount / clean.length : 0,
    tally: tally
  };
}

/* 一張票有沒有被票箱採納 */
function accepted(answer, result) {
  return !!result.word && normalize(answer) === result.word;
}

/* ---------- 三道題目 ---------- */
/* source 欄位是示意重建：真實的 reCAPTCHA 早期語料確實來自《紐約時報》
 * 1851 年以後的檔案，但下面這些字與日期的對應是為了說故事而編的。 */
var PUZZLES = [
  {
    control: 'morning',
    unknown: 'wharves',
    source: '《紐約時報》檔案・1873 年 5 月（示意）',
    /* 其他九個人對同一個未知字交出來的答案 */
    crowd: ['wharves', 'wharves', 'wharyes', 'wharves', 'whorves', 'wharves', 'wharves', 'wharvcs', 'wharves']
  },
  {
    control: 'harbour',
    unknown: 'telegraph',
    source: '《紐約時報》檔案・1889 年 11 月（示意）',
    crowd: ['telegraph', 'telegraph', 'telegraph', 'telegroph', 'telegraph', 'telcgraph', 'telegraph', 'telegraph', 'telegraph']
  },
  {
    control: 'signal',
    unknown: 'quarantine',
    source: '《紐約時報》檔案・1904 年 6 月（示意）',
    crowd: ['quarantine', 'quarantine', 'quarantlne', 'quarantine', 'quarantine', 'quarantine', 'quarantine', 'quaranfine', 'quarantine']
  }
];

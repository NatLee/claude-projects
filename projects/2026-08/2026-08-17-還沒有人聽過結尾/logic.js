/* ==========================================================================
 * 還沒有人聽過結尾 — 純函式邏輯
 * 抽出來單獨測試（node logic.test.js），頁面以 <script src> 載入。
 * 不碰 DOM、不碰 Web Audio、沒有副作用。
 * ========================================================================== */
'use strict';

var ASLSP = (function () {
  /* ---- 演出的兩個端點（哈伯斯塔特・聖布爾夏迪教堂） ---- */
  var START = '2001-09-05';   // 音樂會開始，第一個記號是休止符
  var FIRST_SOUND = '2003-02-05'; // 第一個和弦
  var END = '2640-09-04';     // 預定的最後一天

  /* ---- 音名 → 頻率（十二平均律，A4 = 440 Hz） ---- */
  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteFreq(name) {
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name).trim());
    if (!m) return null;
    var semis = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    var midi = semis + (Number(m[3]) + 1) * 12;      // C4 = 60
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /* ---- 日期工具（一律 UTC，避開時區與日光節約） ---- */
  function toUTC(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function daysBetween(a, b) {
    var x = toUTC(a), y = toUTC(b);
    if (isNaN(x) || isNaN(y)) return null;
    return Math.round((y - x) / 86400000);
  }

  /* 曲子演到幾成（0–1）。演出前為 0，演完後為 1。 */
  function piecePercent(iso) {
    var total = daysBetween(START, END);
    var gone = daysBetween(START, iso);
    if (gone === null) return null;
    return Math.max(0, Math.min(1, gone / total));
  }

  /* 一段年份區間佔全曲的哪一截（給「你的一生」用） */
  function lifeWindow(birthYear, lifeYears) {
    var y0 = Number(birthYear), span = Number(lifeYears);
    if (!isFinite(y0) || !isFinite(span) || span <= 0) return null;
    var y1 = y0 + span;
    var startPct = piecePercent(pad(y0) + '-01-01');
    var endPct = piecePercent(pad(y1) + '-01-01');
    return {
      birthYear: y0,
      deathYear: y1,
      startPct: startPct,
      endPct: endPct,
      spanPct: endPct - startPct,
      /* 出生時它還沒開演的話，聽得到的就是從 2001 算起 */
      heardYears: Math.max(0, Math.min(y1, 2640) - Math.max(y0, 2001))
    };
  }

  function pad(y) {
    var s = String(Math.max(0, Math.round(y)));
    while (s.length < 4) s = '0' + s;
    return s;
  }

  /* ---- 有記載的時刻（不是完整總譜，只是查得到的幾個） ---- */
  var MARKS = [
    { date: '2001-09-05', tag: '開演', text: '音樂會開始。風箱在吹，沒有人按鍵——第一個記號是休止符。' },
    { date: '2003-02-05', tag: '第一個聲音', text: '休了十七個月之後，第一個和弦落下：兩個 G♯，一個 B。' },
    { date: '2004-07-05', tag: '換和弦', text: '加進 E——這是它第一次真的「換」了一個和弦。' },
    { date: '2005-07-05', tag: '換和弦', text: '放掉兩根管子。整座教堂變薄了一層。' },
    { date: null, tag: '…', text: '2006 到 2011 之間還換過幾次。沒有人為此請假，日子照過。' },
    { date: '2012-07-05', tag: '換和弦', text: 'Cage 出生滿一百年的那年。' },
    { date: '2013-10-05', tag: '換和弦', text: '換完之後，這個和弦一響就是將近七年。' },
    { date: '2020-09-05', tag: '第 14 次', text: '睽違七年，加進 G♯ 與 E。全世界正在封城，這裡照常換管。' },
    { date: '2022-02-05', tag: '第 15 次', text: '' },
    { date: '2024-02-05', tag: '第 16 次', text: '加進 D，七個音。' },
    { date: '2026-08-05', tag: '第 17 次', text: '加進 A4，七個音變八個。五百個人擠進教堂，看一根管子被插上去。' },
    { date: '2027-10-05', tag: '下一次', text: '預定放掉 E4——那根管子是 2020 年插上去的。' },
    { date: '2028-08-05', tag: '再下一次', text: '' },
    { date: '2029-02-05', tag: '再下一次', text: '之後要等到 2034 年。' },
    { date: '2640-09-04', tag: '終曲', text: '預定的最後一天。屆時沒有一個現在活著的人在場。' }
  ];

  /* 相對於某天，下一個排定的時刻 */
  function nextMark(iso) {
    var t = toUTC(iso);
    for (var i = 0; i < MARKS.length; i++) {
      if (MARKS[i].date && toUTC(MARKS[i].date) > t) return MARKS[i];
    }
    return null;
  }

  /* 今天（台灣時區）的 ISO 日期 */
  function todayISO(now) {
    var d = now || new Date();
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  }

  return {
    START: START, FIRST_SOUND: FIRST_SOUND, END: END, MARKS: MARKS,
    noteFreq: noteFreq, daysBetween: daysBetween, piecePercent: piecePercent,
    lifeWindow: lifeWindow, nextMark: nextMark, todayISO: todayISO
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ASLSP;

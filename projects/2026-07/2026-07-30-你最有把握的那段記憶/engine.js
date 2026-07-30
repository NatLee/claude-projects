/*!
 * 你最有把握的那段記憶 — engine.js
 * 純函式：問卷比對、圖表座標換算、猜測判定。
 * 不使用 ES module 語法，可直接以 <script src> 載入，也可被 Node require。
 */
var Flashbulb = (function () {
  'use strict';

  /* ------------------------------------------------------------------
   * 常數：僅使用 Neisser & Harsch (1992) 已發表的數字
   * ------------------------------------------------------------------ */
  var ACCURACY_MAX = 7;      // 七題，滿分 7 分
  var CONFIDENCE_MIN = 1;    // 信心量表 1–5
  var CONFIDENCE_MAX = 5;
  var MEAN_ACCURACY = 2.95;  // 兩年半後的平均正確分數（滿分 7）
  var MEAN_CONFIDENCE = 4.17;// 兩年半後的平均信心（滿分 5）
  var N_1986 = 106;
  var N_1988 = 44;

  var QUESTIONS = [
    '你人在哪裡？',
    '你當時在做什麼？',
    '你是怎麼知道的？',
    '大概幾點？',
    '旁邊還有誰？',
    '你當下的感覺？',
    '接下來你做了什麼？'
  ];

  /* ------------------------------------------------------------------
   * 示意卡片
   * 注意：以下內容為「依研究描述改寫的示意卡片」，非原始逐字稿，
   * 亦非任何真實受試者的答案。用途僅為呈現研究中所描述的落差型態。
   * ------------------------------------------------------------------ */
  var SUBJECTS = [
    {
      id: 'A',
      label: '受試者 A',
      confidence: 4,
      teaser: '他寫得很順，像在描述一段還在眼前的畫面。',
      rows: [
        { k86: 'dorm-room',  t86: '我自己的宿舍房間',        k88: 'dorm-room',  t88: '我自己的宿舍房間' },
        { k86: 'study',      t86: '在念書，桌燈開著',        k88: 'study',      t88: '在念書' },
        { k86: 'roommate',   t86: '室友推門進來跟我說的',    k88: 'roommate',   t88: '室友衝進房間跟我說的' },
        { k86: 'morning',    t86: '早上',                    k88: 'noon',       t88: '中午前後' },
        { k86: 'roommate-p', t86: '只有室友',                k88: 'roommate-p', t88: '只有室友' },
        { k86: 'speechless', t86: '講不出話',                k88: 'speechless', t88: '整個人講不出話' },
        { k86: 'tv',         t86: '打開電視',                k88: 'call-home',  t88: '打電話回家' }
      ]
    },
    {
      id: 'B',
      label: '受試者 B',
      confidence: 4,
      teaser: '地點、人、聲音，全都有。細節多得不像編的。',
      rows: [
        { k86: 'walkway',    t86: '走去上課的路上',          k88: 'union',      t88: '學生活動中心裡' },
        { k86: 'hurry',      t86: '趕著進教室',              k88: 'eating',     t88: '在吃東西' },
        { k86: 'classmate',  t86: '迎面走來的同學說的',      k88: 'lobby-tv',   t88: '大廳那台電視' },
        { k86: 'morning',    t86: '早上',                    k88: 'morning',    t88: '早上' },
        { k86: 'one-friend', t86: '一個同學',                k88: 'strangers',  t88: '一群不認識的人' },
        { k86: 'disbelief',  t86: '不敢相信',                k88: 'disbelief',  t88: '不敢相信' },
        { k86: 'went-class', t86: '還是進教室上課',          k88: 'went-class', t88: '還是去上了那堂課' }
      ]
    },
    {
      id: 'C',
      label: '受試者 C',
      confidence: 5,
      teaser: '他在信心那欄圈了最高分，一點都沒猶豫。',
      rows: [
        { k86: 'cafeteria',  t86: '餐廳排隊的隊伍裡',        k88: 'lounge',     t88: '宿舍交誼廳' },
        { k86: 'queue',      t86: '排隊等午餐',              k88: 'watch-tv',   t88: '在看電視' },
        { k86: 'overheard',  t86: '聽到前面的人在講',        k88: 'news-break', t88: '新聞插播直接看到' },
        { k86: 'noon',       t86: '中午',                    k88: 'afternoon',  t88: '下午' },
        { k86: 'strangers',  t86: '排隊的陌生人',            k88: 'roommates',  t88: '兩三個室友' },
        { k86: 'numb',       t86: '有點恍惚',                k88: 'numb',       t88: '整個人恍惚' },
        { k86: 'back-dorm',  t86: '回宿舍',                  k88: 'sat-still',  t88: '坐在那裡沒有動' }
      ]
    },
    {
      id: 'D',
      label: '受試者 D',
      confidence: 5,
      teaser: '最高信心。這一張，請你自己看。',
      rows: [
        { k86: 'library',    t86: '圖書館',                  k88: 'dorm-room',  t88: '我的宿舍房間' },
        { k86: 'research',   t86: '在找報告要用的資料',      k88: 'just-woke',  t88: '剛睡醒' },
        { k86: 'next-table', t86: '隔壁桌的人低聲說的',      k88: 'radio',      t88: '收音機播出來的' },
        { k86: 'afternoon',  t86: '下午',                    k88: 'morning',    t88: '早上' },
        { k86: 'strangers',  t86: '幾個不認識的人',          k88: 'alone',      t88: '只有我一個' },
        { k86: 'delayed',    t86: '一時沒反應過來',          k88: 'cried',      t88: '當場就哭了' },
        { k86: 'left',       t86: '收東西離開圖書館',        k88: 'call-home',  t88: '打電話給家人' }
      ]
    }
  ];

  /* ------------------------------------------------------------------
   * 工具
   * ------------------------------------------------------------------ */
  function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  function normalizeAnswer(v) {
    if (typeof v !== 'string') return null;
    var s = v.replace(/\s+/g, '').toLowerCase();
    return s.length ? s : null;
  }

  function clampNumber(v, lo, hi) {
    var n = Number(v);
    if (!isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  /* ------------------------------------------------------------------
   * 1. 比對兩份問卷答案，算出「正確題數」
   *    a / b 為答案鍵陣列。任何非陣列、null、非字串元素都不會拋錯。
   *    長度不一致時只比對重疊的部分（total 為重疊題數）。
   * ------------------------------------------------------------------ */
  function compareAnswers(a, b) {
    if (!isArray(a) || !isArray(b)) {
      return { total: 0, correct: 0, wrong: 0, flags: [] };
    }
    var n = Math.min(a.length, b.length);
    var flags = [];
    var correct = 0;
    for (var i = 0; i < n; i++) {
      var x = normalizeAnswer(a[i]);
      var y = normalizeAnswer(b[i]);
      var ok = (x !== null && y !== null && x === y);
      if (ok) correct++;
      flags.push(ok);
    }
    return { total: n, correct: correct, wrong: n - correct, flags: flags };
  }

  /* 取出某位受試者某一年的答案鍵 */
  function answerKeys(subject, year) {
    if (!subject || !isArray(subject.rows)) return [];
    var field = (String(year) === '1986') ? 'k86' : 'k88';
    var out = [];
    for (var i = 0; i < subject.rows.length; i++) {
      var row = subject.rows[i];
      out.push(row && typeof row[field] === 'string' ? row[field] : null);
    }
    return out;
  }

  /* 直接算出一位受試者的兩份問卷落差 */
  function scoreSubject(subject) {
    return compareAnswers(answerKeys(subject, '1986'), answerKeys(subject, '1988'));
  }

  function findSubject(id) {
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (SUBJECTS[i].id === id) return SUBJECTS[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------
   * 2. 分數 → 圖表座標
   *    normalizeScore：夾在 [min, max] 之間再映射成 0–1，永不回傳 NaN。
   *    toChartX：把值放到 [x0, x1] 這段軸上，兩端不出界。
   * ------------------------------------------------------------------ */
  function normalizeScore(value, min, max) {
    var lo = Number(min);
    var hi = Number(max);
    if (!isFinite(lo) || !isFinite(hi) || hi === lo) return 0;
    var v = clampNumber(value, Math.min(lo, hi), Math.max(lo, hi));
    var r = (v - lo) / (hi - lo);
    if (!isFinite(r)) return 0;
    return r < 0 ? 0 : (r > 1 ? 1 : r);
  }

  function toChartX(value, min, max, x0, x1) {
    var a = Number(x0);
    var b = Number(x1);
    if (!isFinite(a)) a = 0;
    if (!isFinite(b)) b = 0;
    return a + (b - a) * normalizeScore(value, min, max);
  }

  /* 0–7 分的正確分數 */
  function accuracyToX(score, x0, x1) {
    return toChartX(score, 0, ACCURACY_MAX, x0, x1);
  }

  /* 1–5 分的信心（沿 1–5 軸擺放，例如刻度上的指針） */
  function confidenceToX(conf, x0, x1) {
    return toChartX(conf, CONFIDENCE_MIN, CONFIDENCE_MAX, x0, x1);
  }

  /* 條狀圖幾何：以「佔滿分的比例」為長度，讓兩種不同量表可以並排比較 */
  function barGeometry(value, max, x0, width) {
    var ratio = normalizeScore(value, 0, max);
    var start = Number(x0);
    var full = Number(width);
    if (!isFinite(start)) start = 0;
    if (!isFinite(full)) full = 0;
    var w = full * ratio;
    return {
      ratio: ratio,
      percent: Math.round(ratio * 1000) / 10,
      x: start,
      width: w,
      end: start + w
    };
  }

  /* 信心與正確之間的缺口（以百分比計） */
  function gapPercent(accuracy, confidence) {
    var a = normalizeScore(accuracy, 0, ACCURACY_MAX);
    var c = normalizeScore(confidence, 0, CONFIDENCE_MAX);
    return Math.round((c - a) * 1000) / 10;
  }

  /* ------------------------------------------------------------------
   * 3. 依使用者猜測給出判定
   *    guess: 'match'（對得上）或 'drift'（對不上）
   * ------------------------------------------------------------------ */
  function judgeGuess(guess, result) {
    var g = (guess === 'match' || guess === 'drift') ? guess : null;
    var total = (result && isFinite(Number(result.total))) ? Number(result.total) : 0;
    var correct = (result && isFinite(Number(result.correct))) ? Number(result.correct) : 0;
    if (correct < 0) correct = 0;
    if (total < 0) total = 0;
    if (correct > total) correct = total;

    var truth = (total > 0 && correct === total) ? 'match' : 'drift';
    var right = (g !== null && g === truth);

    var verdict;
    if (g === null) {
      verdict = '還沒有猜';
    } else if (right) {
      verdict = '你猜對了';
    } else {
      verdict = '你猜錯了';
    }

    var detail;
    if (total === 0) {
      detail = '這張卡片沒有可以比對的題目。';
    } else if (correct === 0) {
      detail = '七題裡，沒有任何一題對得上。';
    } else if (correct === total) {
      detail = '七題全部對得上。';
    } else {
      detail = '七題裡只有 ' + correct + ' 題對得上，其餘 ' + (total - correct) + ' 題被換掉了。';
    }

    return {
      guess: g,
      truth: truth,
      right: right,
      correct: correct,
      total: total,
      verdict: verdict,
      detail: detail
    };
  }

  /* ------------------------------------------------------------------
   * 4. 圖表的文字版摘要（無障礙用，顏色不是唯一資訊）
   * ------------------------------------------------------------------ */
  function chartSummary() {
    var a = barGeometry(MEAN_ACCURACY, ACCURACY_MAX, 0, 100);
    var c = barGeometry(MEAN_CONFIDENCE, CONFIDENCE_MAX, 0, 100);
    return '兩年半後，平均正確分數為 ' + MEAN_ACCURACY + ' 分（滿分 7 分），約為滿分的 ' +
      a.percent + '%；同一群人對自己記憶的平均信心為 ' + MEAN_CONFIDENCE +
      ' 分（滿分 5 分），約為滿分的 ' + c.percent + '%。信心高出正確約 ' +
      gapPercent(MEAN_ACCURACY, MEAN_CONFIDENCE) + ' 個百分點。';
  }

  return {
    ACCURACY_MAX: ACCURACY_MAX,
    CONFIDENCE_MIN: CONFIDENCE_MIN,
    CONFIDENCE_MAX: CONFIDENCE_MAX,
    MEAN_ACCURACY: MEAN_ACCURACY,
    MEAN_CONFIDENCE: MEAN_CONFIDENCE,
    N_1986: N_1986,
    N_1988: N_1988,
    QUESTIONS: QUESTIONS,
    SUBJECTS: SUBJECTS,
    normalizeAnswer: normalizeAnswer,
    compareAnswers: compareAnswers,
    answerKeys: answerKeys,
    scoreSubject: scoreSubject,
    findSubject: findSubject,
    normalizeScore: normalizeScore,
    toChartX: toChartX,
    accuracyToX: accuracyToX,
    confidenceToX: confidenceToX,
    barGeometry: barGeometry,
    gapPercent: gapPercent,
    judgeGuess: judgeGuess,
    chartSummary: chartSummary
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Flashbulb;
}

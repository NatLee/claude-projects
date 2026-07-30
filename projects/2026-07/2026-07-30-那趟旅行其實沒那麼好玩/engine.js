/*!
 * engine.js — 玫瑰色回憶（rosy retrospection）｜三週加州海岸單車旅行
 *
 * 這裡只放純函式與資料：同樣的輸入永遠得到同樣的輸出，不碰 DOM、不碰時間、不碰亂數。
 *
 * 分數尺度一律 1–10（1 = 慘到想搭便車回家，10 = 這輩子最好的一天）。
 * 約定：
 *   - 沒有資料時回傳 null，不回傳 NaN、不回傳 0（0 會被誤讀成「很糟」）。
 *   - 任何非數字、null、undefined、NaN、Infinity 一律當作「沒填」直接濾掉。
 *   - 除法前一定檢查分母，不會出現 Infinity。
 */
var Rosy = (function () {
  'use strict';

  var SCORE_MIN = 1;
  var SCORE_MAX = 10;

  /* ---------------------------------------------------------------
   * 旅程本身：舊金山 → 聖塔莫尼卡，紙上寫三週，實際只翻十四張日誌卡。
   * tone 只用來決定插圖與配色，不參與任何計算（分數全部由使用者自己給）。
   * ------------------------------------------------------------- */
  var TRIP = {
    title: '加州海岸線',
    from: '舊金山',
    to: '聖塔莫尼卡',
    totalDays: 21,
    totalKm: 790,
    partner: '阿凱'
  };

  var DAYS = [
    { day: 1, place: '舊金山 → 索薩利托', km: 32, icon: 'bridge', tone: 'good',
      text: '金門大橋上人比車多。你停下來拍照，風把你的帽子吹去對向車道。第一天，什麼都是新的，連逆風都覺得有誠意。' },
    { day: 2, place: '半月灣', km: 58, icon: 'saddle', tone: 'bad',
      text: '第二天早上，你坐上坐墊的那一秒才知道：屁股是會記仇的。' },
    { day: 4, place: '聖塔克魯茲', km: 71, icon: 'drink', tone: 'plain',
      text: '下午三點，便利商店的冰紅茶。你坐在停車場的水泥墩上一口氣喝完，冰到講不出話。' },
    { day: 5, place: '內陸繞道', km: 84, icon: 'sun', tone: 'bad',
      text: '一號公路封路，改走內陸。中午三十四度，兩側是杏仁樹，很香，但沒有一棵有影子。' },
    { day: 7, place: '蒙特雷', km: 46, icon: 'joke', tone: 'good',
      text: '阿凱講了一個關於海獺的爛笑話。你笑到必須停下來扶護欄。到現在你還是想不起來笑點是什麼。' },
    { day: 8, place: '大蘇爾', km: 63, icon: 'view', tone: 'peak',
      text: '轉過那個彎，整片太平洋在你左手邊攤開，霧從崖底往上長。你把車靠在路肩站了很久，一張照片都沒拍。' },
    { day: 9, place: '雨裡的路邊', km: 39, icon: 'flat', tone: 'worst',
      text: '今天第三次爆胎。雨，路邊，補片怎麼樣都黏不上去。阿凱說了一句不該說的，你回了一句更不該說的。接下來六公里你們用推的。' },
    { day: 11, place: '聖西蒙（休息日）', km: 0, icon: 'rest', tone: 'plain',
      text: '休息日。洗衣服、睡到十點、把單車翻過來擦鏈條。整天什麼都沒發生——這正是重點。' },
    { day: 12, place: '莫羅灣', km: 77, icon: 'lost', tone: 'bad',
      text: '導航把你帶進一條農路，盡頭是一道上鎖的柵欄。回頭，多騎十八公里。阿凱默默把手機收進口袋。' },
    { day: 14, place: '聖路易斯歐比斯波', km: 55, icon: 'shower', tone: 'bad',
      text: '旅館熱水器壞了，櫃檯說「大概明天」。你洗了這輩子最短的一次澡，短到像在道歉。' },
    { day: 15, place: '海岸線上', km: 92, icon: 'road', tone: 'plain',
      text: '一整天都在同一條海岸線上。沒爆胎、沒絕景、沒吵架。你踩了六個小時，腦子裡什麼都沒有。' },
    { day: 17, place: '聖塔芭芭拉', km: 68, icon: 'taco', tone: 'good',
      text: '海邊那攤的魚塔可。你一口氣吃了四個，老闆多送一個，說你們看起來「很需要」。' },
    { day: 19, place: '文圖拉之後', km: 61, icon: 'wind', tone: 'bad',
      text: '逆風四十公里，下坡也要踩。最後十公里你站著騎，因為坐著更痛。' },
    { day: 21, place: '聖塔莫尼卡', km: 44, icon: 'finish', tone: 'peak',
      text: '碼頭的木棧道，海風是鹹的。你把前輪推進沙裡，這是三週以來第一次覺得腿是自己的。' }
  ];

  /* ---------------------------------------------------------------
   * 基礎工具
   * ------------------------------------------------------------- */

  /** 轉成有限數字；失敗回傳 null（不是 NaN）。 */
  function toNum(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    var n = typeof v === 'number' ? v : Number(v);
    if (typeof n !== 'number' || !isFinite(n)) return null;
    return n;
  }

  /** 四捨五入到小數一位；非數字回傳 null。 */
  function round1(v) {
    var n = toNum(v);
    if (n === null) return null;
    return Math.round(n * 10) / 10;
  }

  /** 把分數夾在 1–10；非數字回傳 null。 */
  function clampScore(v) {
    var n = toNum(v);
    if (n === null) return null;
    if (n < SCORE_MIN) return SCORE_MIN;
    if (n > SCORE_MAX) return SCORE_MAX;
    return n;
  }

  /**
   * 把任意輸入正規化成 [{ index, score, day, place }]。
   * 接受數字陣列，也接受 [{ score, day, place }] 物件陣列。
   * 沒填、填壞的項目直接不收（但 index 保留原始位置，畫圖時橫軸才不會位移）。
   */
  function normalizeEntries(list) {
    var out = [];
    if (!list || typeof list.length !== 'number') return out;
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      var score = null, day = null, place = null;
      if (raw !== null && typeof raw === 'object') {
        score = clampScore(raw.score);
        day = toNum(raw.day);
        place = typeof raw.place === 'string' ? raw.place : null;
      } else {
        score = clampScore(raw);
      }
      if (score === null) continue;
      out.push({ index: i, score: score, day: day, place: place });
    }
    return out;
  }

  /** 只把合格分數抽成純數字陣列。 */
  function validScores(list) {
    var e = normalizeEntries(list);
    var out = [];
    for (var i = 0; i < e.length; i++) out.push(e[i].score);
    return out;
  }

  /* ---------------------------------------------------------------
   * 統計
   * ------------------------------------------------------------- */

  /** 平均。沒有任何合格分數時回傳 null（約定：不是 0、不是 NaN）。 */
  function mean(scores) {
    var v = validScores(scores);
    if (v.length === 0) return null;
    var sum = 0;
    for (var i = 0; i < v.length; i++) sum += v[i];
    return sum / v.length;
  }

  /** 最高分那一天。沒資料回傳 null。並列時取最早的一天。 */
  function peakOf(list) {
    var e = normalizeEntries(list);
    if (e.length === 0) return null;
    var best = e[0];
    for (var i = 1; i < e.length; i++) if (e[i].score > best.score) best = e[i];
    return best;
  }

  /** 最低分那一天。沒資料回傳 null。並列時取最早的一天。 */
  function troughOf(list) {
    var e = normalizeEntries(list);
    if (e.length === 0) return null;
    var worst = e[0];
    for (var i = 1; i < e.length; i++) if (e[i].score < worst.score) worst = e[i];
    return worst;
  }

  /** 最後一個有打分的日子。沒資料回傳 null。 */
  function endOf(list) {
    var e = normalizeEntries(list);
    if (e.length === 0) return null;
    return e[e.length - 1];
  }

  /**
   * 回憶比當下高多少。
   *   gap     = 回憶 − 當下平均（可為負；使用者回憶比當下低時就是負的）
   *   percent = gap / 當下平均 × 100（當下平均為 0 或缺值時回傳 null，絕不除以零）
   *   direction = 'rosy' | 'inverse' | 'flat' | 'unknown'
   */
  function rosyGap(recalled, actualMean) {
    var r = toNum(recalled);
    var a = toNum(actualMean);
    if (r === null || a === null) {
      return { recalled: r, actual: a, gap: null, percent: null, direction: 'unknown' };
    }
    var gap = r - a;
    var percent = (a === 0) ? null : round1((gap / a) * 100);
    var dir = 'flat';
    if (gap > 1e-9) dir = 'rosy';
    else if (gap < -1e-9) dir = 'inverse';
    return {
      recalled: round1(r),
      actual: round1(a),
      gap: round1(gap),
      percent: percent,
      direction: dir
    };
  }

  /** 一次算完整趟旅程的統計。空陣列也不會爆。 */
  function journeyStats(list) {
    var e = normalizeEntries(list);
    var m = mean(list);
    var uniq = {};
    for (var i = 0; i < e.length; i++) uniq[e[i].score] = true;
    var distinct = 0;
    for (var k in uniq) if (Object.prototype.hasOwnProperty.call(uniq, k)) distinct++;
    return {
      count: e.length,
      total: (list && typeof list.length === 'number') ? list.length : 0,
      mean: m,
      meanRounded: round1(m),
      peak: peakOf(list),
      trough: troughOf(list),
      end: endOf(list),
      allSame: e.length > 0 && distinct === 1,
      entries: e
    };
  }

  /**
   * 判斷這位使用者落在哪一種形狀。
   *   'no-data'   一天都沒打分
   *   'classic'   期待 > 當下 且 回憶 > 當下（教科書上的 U 形）
   *   'rosy-only' 只有回憶高於當下
   *   'hyped'     只有期待高於當下
   *   'flat'      三個數字幾乎一樣
   *   'inverse'   回憶低於當下
   */
  function patternOf(expected, actualMean, recalled) {
    var a = toNum(actualMean);
    if (a === null) return 'no-data';
    var ex = toNum(expected);
    var re = toNum(recalled);
    if (re === null) return 'no-data';
    var eps = 0.25;
    var reHigh = (re - a) > eps;
    var reLow = (a - re) > eps;
    var exHigh = (ex !== null) && (ex - a) > eps;
    if (reLow) return 'inverse';
    if (reHigh && exHigh) return 'classic';
    if (reHigh) return 'rosy-only';
    if (exHigh) return 'hyped';
    return 'flat';
  }

  /* ---------------------------------------------------------------
   * 座標換算（給 SVG 折線圖用）
   * ------------------------------------------------------------- */

  /** 分數 → 縱座標。1 分落在 bottom、10 分落在 top，超出範圍先夾住，永遠不出界。 */
  function scoreToY(score, top, bottom) {
    var s = clampScore(score);
    var t = toNum(top);
    var b = toNum(bottom);
    if (s === null || t === null || b === null) return null;
    var ratio = (s - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
    return b - ratio * (b - t);
  }

  /** 第幾天 → 橫座標。只有一天時貼在左端，不會除以零。 */
  function indexToX(index, count, left, right) {
    var i = toNum(index);
    var n = toNum(count);
    var l = toNum(left);
    var r = toNum(right);
    if (i === null || n === null || l === null || r === null) return null;
    if (n <= 1) return l;
    if (i < 0) i = 0;
    if (i > n - 1) i = n - 1;
    return l + (r - l) * (i / (n - 1));
  }

  /**
   * 把整串分數換成 SVG 座標點。
   * box = { left, right, top, bottom }；沒填的日子會被跳過，但橫軸位置照原本的 index。
   */
  function plotPoints(list, box) {
    var out = [];
    if (!box) return out;
    var e = normalizeEntries(list);
    var count = (list && typeof list.length === 'number') ? list.length : e.length;
    for (var i = 0; i < e.length; i++) {
      var x = indexToX(e[i].index, count, box.left, box.right);
      var y = scoreToY(e[i].score, box.top, box.bottom);
      if (x === null || y === null) continue;
      out.push({ x: x, y: y, score: e[i].score, index: e[i].index, day: e[i].day });
    }
    return out;
  }

  /** 點 → path 的 d。零點回傳空字串；單點也給得出一段可畫的路徑。 */
  function toLinePath(points) {
    if (!points || !points.length) return '';
    var d = 'M ' + round1(points[0].x) + ' ' + round1(points[0].y);
    if (points.length === 1) return d + ' L ' + round1(points[0].x) + ' ' + round1(points[0].y);
    for (var i = 1; i < points.length; i++) {
      d += ' L ' + round1(points[i].x) + ' ' + round1(points[i].y);
    }
    return d;
  }

  /** 給 SVG 用的文字版摘要（無障礙、也是圖表的 aria-label）。 */
  function summaryText(state) {
    state = state || {};
    var s = journeyStats(state.scores);
    var parts = [];
    var ex = toNum(state.expected);
    var re = toNum(state.recalled);
    parts.push('行前期待 ' + (ex === null ? '未填' : round1(ex) + ' 分'));
    parts.push('當下平均 ' + (s.meanRounded === null ? '沒有任何當日評分' : s.meanRounded + ' 分（共 ' + s.count + ' 天）'));
    parts.push('事後回憶 ' + (re === null ? '未填' : round1(re) + ' 分'));
    if (s.peak) parts.push('最高的一天是第 ' + (s.peak.day === null ? (s.peak.index + 1) : s.peak.day) + ' 天，' + s.peak.score + ' 分');
    if (s.trough) parts.push('最低的一天是第 ' + (s.trough.day === null ? (s.trough.index + 1) : s.trough.day) + ' 天，' + s.trough.score + ' 分');
    if (s.end) parts.push('最後一天 ' + s.end.score + ' 分');
    var g = rosyGap(re, s.mean);
    if (g.gap !== null) {
      if (g.direction === 'rosy') parts.push('回憶比當下高 ' + g.gap + ' 分' + (g.percent === null ? '' : '（約 ' + g.percent + '%）'));
      else if (g.direction === 'inverse') parts.push('回憶比當下低 ' + Math.abs(g.gap) + ' 分');
      else parts.push('回憶與當下一樣');
    }
    return parts.join('；') + '。';
  }

  return {
    SCORE_MIN: SCORE_MIN,
    SCORE_MAX: SCORE_MAX,
    TRIP: TRIP,
    DAYS: DAYS,
    toNum: toNum,
    round1: round1,
    clampScore: clampScore,
    normalizeEntries: normalizeEntries,
    validScores: validScores,
    mean: mean,
    peakOf: peakOf,
    troughOf: troughOf,
    endOf: endOf,
    rosyGap: rosyGap,
    journeyStats: journeyStats,
    patternOf: patternOf,
    scoreToY: scoreToY,
    indexToX: indexToX,
    plotPoints: plotPoints,
    toLinePath: toLinePath,
    summaryText: summaryText
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rosy;
}

/* ==========================================================================
 * 忘到某個地方就不忘了 · 純函式
 *
 * 這個檔案同時給兩邊用：
 *   瀏覽器 <script src="pure.js">  → 掛在 window.PERMASTORE
 *   node   require('./pure.js')    → module.exports
 *
 * 重要聲明：
 *   Bahrick (1984) 的原始資料是「依訓練程度分組的橫斷面資料點」，
 *   論文裡並沒有給出一條可以直接代入的公式曲線。
 *   底下的 MODEL 參數是「依照論文描述的形狀」重建的示意模型：
 *     · 前 3～6 年指數下降        → 由 tau 控制
 *     · 之後長達 30 年維持不變    → 指數項在第 6 年後已趨近 0
 *     · 最後才再次下降            → lateStart / lateSlope
 *   平台高度隨訓練程度與成績變動，也是示意值，不是論文表格上的數字。
 *   詳見 說明.md 的「方法論與資料註記」。
 * ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PERMASTORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 常數 ---------- */

  var MAX_YEAR = 50;
  var MAX_SCORE = 100;

  /* 主圖與比較圖共用的座標系（對應 viewBox="0 0 800 380"） */
  var GEOM = { x0: 58, x1: 692, y0: 34, y1: 320, maxYear: MAX_YEAR, maxScore: MAX_SCORE };

  /* 示意模型參數 */
  var MODEL = {
    tau: 1.65,        /* 指數衰減時間常數（年）：第 6 年時衰減項只剩 2.6% */
    lateStart: 35,    /* 平台結束、開始最後下降的年份 */
    lateSlope: 0.36,  /* 最後下降的斜率（分／年） */
    flatFrom: 6,      /* 論文描述的「不再變化」區間起點 */
    flatTo: 30        /* 論文描述的「不再變化」區間終點 */
  };

  /* 訓練程度：initial＝剛下課時的水準，plateau＝掉完之後停住的高度 */
  var TRAINING = [
    { id: 1, label: '只修過一年', brief: '1 年', initial: 62, plateau: 21 },
    { id: 2, label: '修過兩到三年', brief: '2–3 年', initial: 77, plateau: 37 },
    { id: 3, label: '三年以上或主修', brief: '3 年以上', initial: 90, plateau: 54 }
  ];

  /* 當年成績：只動平台高度（與起點的一半），不動衰減速度 */
  var GRADE = {
    A: { id: 'A', label: '當年拿 A', delta: 9 },
    B: { id: 'B', label: '當年拿 B', delta: 0 },
    C: { id: 'C', label: '當年拿 C', delta: -9 }
  };

  /* ---------- 小工具 ---------- */

  function clamp(v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) v = lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  function trainingById(id) {
    var n = Number(id);
    for (var i = 0; i < TRAINING.length; i++) {
      if (TRAINING[i].id === n) return TRAINING[i];
    }
    return TRAINING[1];
  }

  /* ---------- 一位受訪者的側寫 ---------- */

  function profile(levelId, gradeId) {
    var lv = trainingById(levelId);
    var g = GRADE[gradeId] || GRADE.B;
    var plateau = clamp(lv.plateau + g.delta, 2, 92);
    var initial = clamp(lv.initial + g.delta * 0.5, plateau + 6, 100);
    return {
      level: lv.id,
      levelLabel: lv.label,
      brief: lv.brief,
      grade: g.id,
      gradeLabel: g.label,
      plateau: plateau,
      initial: initial
    };
  }

  /* ---------- 保留曲線 ---------- */

  /* 第 year 年還剩下的分數（0～100） */
  function retentionAt(year, p) {
    var t = clamp(year, 0, MAX_YEAR);
    var decayed = p.plateau + (p.initial - p.plateau) * Math.exp(-t / MODEL.tau);
    var late = t > MODEL.lateStart ? MODEL.lateSlope * (t - MODEL.lateStart) : 0;
    return clamp(decayed - late, 0, MAX_SCORE);
  }

  /* 把起點對齊成 100 之後的相對保留率——用來證明「掉的比例差不多，停的高度不一樣」 */
  function normalizedAt(year, p) {
    return clamp(retentionAt(year, p) / p.initial * 100, 0, MAX_SCORE);
  }

  /* 由左往右產生路徑點；normalize 為 true 時輸出對齊起點的版本 */
  function curvePoints(p, from, to, step, normalize) {
    var a = clamp(from, 0, MAX_YEAR);
    var b = clamp(to, 0, MAX_YEAR);
    var s = Math.max(0.05, Number(step) || 0.25);
    var out = [];
    if (b < a) return out;
    var val = normalize ? normalizedAt : retentionAt;
    for (var t = a; t < b - 1e-9; t += s) {
      out.push({ year: round2(t), score: round2(val(t, p)) });
    }
    out.push({ year: round2(b), score: round2(val(b, p)) });
    return out;
  }

  /* ---------- 座標換算 ---------- */

  function xOf(year, geom) {
    var g = geom || GEOM;
    return g.x0 + clamp(year, 0, g.maxYear) / g.maxYear * (g.x1 - g.x0);
  }

  function yOf(score, geom) {
    var g = geom || GEOM;
    return g.y1 - clamp(score, 0, g.maxScore) / g.maxScore * (g.y1 - g.y0);
  }

  /* 點陣列 → SVG path 的 d 字串（純折線，由左往右） */
  function toPath(points, geom) {
    if (!points || !points.length) return '';
    var d = '';
    for (var i = 0; i < points.length; i++) {
      d += (i === 0 ? 'M' : 'L') + round2(xOf(points[i].year, geom)) + ' ' + round2(yOf(points[i].score, geom)) + ' ';
    }
    return d.trim();
  }

  /* ---------- 敘事階段（跟著時間軸走） ---------- */

  var STAGES = [
    { key: 'zero', until: 0.01, text: '剛下課。你的西班牙文正停在這輩子的最高點。' },
    { key: 'drop1', until: 1.6, text: '第一年還沒過完，它就開始往下掉了。' },
    { key: 'drop2', until: 3.5, text: '掉得很兇。照這個斜率往下畫，再幾年就撞到底了。' },
    { key: 'drop3', until: 6, text: '還在掉。你已經在心裡替它畫好剩下那一段了——一路到零。' },
    { key: 'turn', until: 10, text: '等一下。它慢下來了。' },
    { key: 'flat1', until: 20, text: '線是平的。十幾年沒說過一句西班牙文，分數沒有再掉。' },
    { key: 'flat2', until: 30, text: '二十幾年。沒有複習、沒有使用、沒有任何一堂課——它就停在這裡。' },
    { key: 'late', until: 42, text: '一直到三十年之後，才又開始緩緩下降。' },
    { key: 'end', until: 999, text: '五十年。剩下的這一層，就是 Bahrick 說的 permastore。' }
  ];

  function stageAt(year) {
    var t = clamp(year, 0, MAX_YEAR);
    for (var i = 0; i < STAGES.length; i++) {
      if (t <= STAGES[i].until) return STAGES[i];
    }
    return STAGES[STAGES.length - 1];
  }

  /* ---------- Ebbinghaus 對照 ---------- */

  /* Ebbinghaus (1885) 自己配適的公式：b = 100k / ((log10 t)^c + k)，t 以分鐘計 */
  var EBB = { k: 1.84, c: 1.25 };

  function ebbinghausSavings(minutes) {
    var t = Math.max(1.0001, Number(minutes) || 1.0001);
    var lg = Math.log(t) / Math.LN10;
    return clamp(100 * EBB.k / (Math.pow(lg, EBB.c) + EBB.k), 0, 100);
  }

  /* Ebbinghaus 整個實驗（最長 31 天）攤在五十年的尺上，只有幾個像素寬 */
  function slitherWidth(days, geom) {
    var g = geom || GEOM;
    var years = Number(days) / 365.25;
    return round2(xOf(years, g) - xOf(0, g));
  }

  /* ---------- 匯出 ---------- */

  return {
    MAX_YEAR: MAX_YEAR,
    MAX_SCORE: MAX_SCORE,
    GEOM: GEOM,
    MODEL: MODEL,
    TRAINING: TRAINING,
    GRADE: GRADE,
    EBB: EBB,
    clamp: clamp,
    profile: profile,
    retentionAt: retentionAt,
    normalizedAt: normalizedAt,
    curvePoints: curvePoints,
    xOf: xOf,
    yOf: yOf,
    toPath: toPath,
    stageAt: stageAt,
    ebbinghausSavings: ebbinghausSavings,
    slitherWidth: slitherWidth
  };
});

/*!
 * engine.js — 峰終定律（peak-end rule）縮時實驗的純函式
 *
 * 兩段實驗（縮時版；原始實驗為 60 秒／再加 30 秒）：
 *   A 段：14 秒，水溫固定 14°C，不適值升到高原後停住。
 *   B 段：前 14 秒與 A 段逐點相同，之後多 7 秒，水溫緩緩升到 15°C，
 *         不適值往下掉但不歸零——還是難受，只是明顯沒那麼糟。
 *
 * 這裡的函式全部是純函式：同樣的輸入永遠得到同樣的輸出，不碰 DOM、不碰時間。
 */
var PeakEnd = (function () {
  'use strict';

  var COLD_TEMP = 14.0;   // °C，冷水段固定水溫
  var WARM_TEMP = 15.0;   // °C，尾段回暖到的水溫
  var PEAK = 8.6;         // 不適指數上限（0–10 尺度）
  var TAIL_FLOOR = 5.6;   // 尾段回暖後不適值趨近的底線（仍然不舒服）
  var RISE_TAU = 2.2;     // 冷痛上升的時間常數（秒）
  var TAIL_K = 2.0;       // 尾段衰減常數
  var SAMPLE_HZ = 64;     // 積分取樣率
  var D_MAX = 10;         // 不適指數尺度上限

  var SEGMENTS = {
    A: { id: 'A', label: 'A 段', cold: 14, tail: 0, duration: 14 },
    B: { id: 'B', label: 'B 段', cold: 14, tail: 7, duration: 21 }
  };

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }

  /* 接受 'A' / 'B' / 段落物件，永遠回傳一個可用的段落 */
  function segmentOf(seg) {
    if (!seg) return SEGMENTS.A;
    if (typeof seg === 'string') return SEGMENTS[seg] || SEGMENTS.A;
    if (typeof seg === 'object' && isFinite(Number(seg.duration))) return seg;
    return SEGMENTS.A;
  }

  /* 把時間夾在 [0, duration]；NaN / undefined / 負數 / 超長都安全 */
  function clampTime(t, seg) {
    t = num(t, 0);
    if (t < 0) t = 0;
    var d = num(seg.duration, 0);
    if (d < 0) d = 0;
    if (t > d) t = d;
    return t;
  }

  /* 經過 t 秒時的不適值（0–10）。t 超過總長度時回傳結尾值，不會是 NaN。 */
  function discomfortAt(t, seg) {
    seg = segmentOf(seg);
    t = clampTime(t, seg);
    var cold = num(seg.cold, 0);
    var tail = num(seg.tail, 0);

    if (t >= cold) {
      if (tail <= 0) return PEAK;
      var u = (t - cold) / tail;
      if (u <= 0) return PEAK;
      if (u > 1) u = 1;
      return TAIL_FLOOR + (PEAK - TAIL_FLOOR) * Math.exp(-TAIL_K * u);
    }

    var norm = 1 - Math.exp(-cold / RISE_TAU);
    if (!(norm > 0)) return PEAK;
    return PEAK * (1 - Math.exp(-t / RISE_TAU)) / norm;
  }

  /* 經過 t 秒時的水溫（°C） */
  function temperatureAt(t, seg) {
    seg = segmentOf(seg);
    t = clampTime(t, seg);
    var cold = num(seg.cold, 0);
    var tail = num(seg.tail, 0);
    if (t <= cold || tail <= 0) return COLD_TEMP;
    var u = (t - cold) / tail;
    if (u > 1) u = 1;
    return COLD_TEMP + (WARM_TEMP - COLD_TEMP) * u;
  }

  /* 以固定取樣率把整段攤成點陣列 */
  function sample(seg, hz) {
    seg = segmentOf(seg);
    hz = num(hz, SAMPLE_HZ);
    if (!(hz > 0)) hz = SAMPLE_HZ;
    var dur = num(seg.duration, 0);
    var n = Math.max(1, Math.round(dur * hz));
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / hz;
      if (t > dur) t = dur;
      out.push({ t: t, d: discomfortAt(t, seg), temp: temperatureAt(t, seg) });
    }
    return out;
  }

  /* 總不適：曲線下的面積（梯形積分），單位「不適指數 × 秒」 */
  function totalDiscomfort(seg, hz) {
    var pts = sample(seg, hz);
    var sum = 0;
    for (var i = 1; i < pts.length; i++) {
      sum += (pts[i].d + pts[i - 1].d) / 2 * (pts[i].t - pts[i - 1].t);
    }
    return sum;
  }

  /* 最難受的那一刻 */
  function peakOf(seg, hz) {
    var pts = sample(seg, hz);
    var m = pts.length ? pts[0].d : 0;
    for (var i = 1; i < pts.length; i++) if (pts[i].d > m) m = pts[i].d;
    return m;
  }

  /* 最後那一刻 */
  function endOf(seg) {
    seg = segmentOf(seg);
    return discomfortAt(num(seg.duration, 0), seg);
  }

  function durationOf(seg) {
    return num(segmentOf(seg).duration, 0);
  }

  /* 峰終定律的預測：事後記憶 ≈（最高點 + 結尾）／2 */
  function peakEndScore(seg, hz) {
    return (peakOf(seg, hz) + endOf(seg)) / 2;
  }

  /* 兩段評分的比較結果（給揭曉段落挑講法用） */
  function compareRatings(ratingA, ratingB) {
    var blank = function (v) { return v === null || v === undefined || v === ''; };
    if (blank(ratingA) || blank(ratingB)) return 'unknown';
    var a = num(ratingA, NaN);
    var b = num(ratingB, NaN);
    if (!isFinite(a) || !isFinite(b)) return 'unknown';
    if (b < a) return 'endWins';    // 比較長、比較痛，卻記得比較不糟
    if (b === a) return 'tie';      // 多受 50% 的罪，記憶裡一樣
    return 'totalWins';             // 少數：評分跟著總量走
  }

  /* ---------- 畫圖用的純函式（回傳座標與 path 字串，不碰 DOM） ---------- */

  /* geom: { x0, x1, y0, y1, tSpan, dMax }  y0 = 不適 dMax 的位置，y1 = 0 的位置 */
  function plotPoints(seg, tMax, geom, hz) {
    seg = segmentOf(seg);
    geom = geom || {};
    var x0 = num(geom.x0, 0), x1 = num(geom.x1, 100);
    var y0 = num(geom.y0, 0), y1 = num(geom.y1, 100);
    var tSpan = num(geom.tSpan, durationOf(seg)) || 1;
    var dMax = num(geom.dMax, D_MAX) || D_MAX;
    var limit = clampTime(num(tMax, durationOf(seg)), seg);
    hz = num(hz, 24);
    if (!(hz > 0)) hz = 24;

    var pts = [];
    var n = Math.max(1, Math.ceil(limit * hz));
    for (var i = 0; i <= n; i++) {
      var t = Math.min(i / hz, limit);
      var d = discomfortAt(t, seg);
      var x = x0 + (x1 - x0) * (t / tSpan);
      var y = y1 - (y1 - y0) * (d / dMax);
      pts.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
      if (t >= limit) break;
    }
    return pts;
  }

  function toLinePath(pts) {
    if (!pts || !pts.length) return '';
    var s = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length; i++) s += 'L' + pts[i][0] + ' ' + pts[i][1];
    return s;
  }

  function toAreaPath(pts, baselineY) {
    if (!pts || pts.length < 2) return '';
    var b = num(baselineY, 0);
    return toLinePath(pts) +
      'L' + pts[pts.length - 1][0] + ' ' + b +
      'L' + pts[0][0] + ' ' + b + 'Z';
  }

  /* 圖表的文字版摘要（給 aria-label 與螢幕上的文字備援） */
  function summaryText(seg) {
    seg = segmentOf(seg);
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    var head = seg.label + '：全長 ' + durationOf(seg) + ' 秒。';
    var body = '不適指數在前幾秒快速升到 ' + r1(PEAK) + '，';
    if (num(seg.tail, 0) > 0) {
      body += '維持到第 ' + seg.cold + ' 秒；接著水溫由 ' + COLD_TEMP + ' 度緩升到 ' +
        WARM_TEMP + ' 度，不適指數在最後 ' + seg.tail + ' 秒降到 ' + r1(endOf(seg)) + '，仍然不舒服。';
    } else {
      body += '並維持到結束，結尾值 ' + r1(endOf(seg)) + '。';
    }
    var tailInfo = '曲線下面積約 ' + Math.round(totalDiscomfort(seg)) + '（不適指數乘以秒）。';
    return head + body + tailInfo;
  }

  return {
    SEGMENTS: SEGMENTS,
    COLD_TEMP: COLD_TEMP,
    WARM_TEMP: WARM_TEMP,
    PEAK: PEAK,
    TAIL_FLOOR: TAIL_FLOOR,
    D_MAX: D_MAX,
    SAMPLE_HZ: SAMPLE_HZ,
    segmentOf: segmentOf,
    discomfortAt: discomfortAt,
    temperatureAt: temperatureAt,
    sample: sample,
    totalDiscomfort: totalDiscomfort,
    peakOf: peakOf,
    endOf: endOf,
    durationOf: durationOf,
    peakEndScore: peakEndScore,
    compareRatings: compareRatings,
    plotPoints: plotPoints,
    toLinePath: toLinePath,
    toAreaPath: toAreaPath,
    summaryText: summaryText
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PeakEnd;
}

/* geometry.js — 硬幣輪廓的極座標幾何（純函式）
 *
 * 模型：把硬幣輪廓當成繞一圈的取樣點，每個角度有一個半徑。
 *   base    = 半徑基準（錘打幣疊上不規則擾動，機製幣為正圓）
 *   teeth   = 在半徑上疊一個週期性的小凸起（滾花／鋸齒）
 *   cut     = 一條弦，把某個角度區間的半徑壓低；取 min 之後
 *             該區間的鋸齒自然被「剪斷」，這正是剪刀在做的事
 *   weight  = 多邊形面積（shoelace）與未剪之前面積的比值
 *
 * 瀏覽器：用一般的 script 標籤載入 geometry.js 之後，取全域的 CoinGeo
 * node  ：require('./geometry.js')
 */
var CoinGeo = (function () {
  'use strict';

  var DEG = Math.PI / 180;

  function clamp(v, lo, hi) {
    if (!isFinite(v)) return lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* 把角度正規化到 (-180, 180] */
  function norm180(deg) {
    var d = deg % 360;
    if (d > 180) d -= 360;
    if (d <= -180) d += 360;
    return d;
  }

  /* 兩個角度的最短差距，跨 0 度不會爆 */
  function angleDiff(a, b) {
    return norm180(a - b);
  }

  /* 錘打幣的不規則：幾個正弦疊起來，由 seed 決定，完全可重現 */
  function wobbleAt(deg, seed, amp) {
    if (!amp) return 0;
    var t = deg * DEG;
    var s = seed || 0;
    return amp * (
      0.52 * Math.sin(3 * t + s * 1.7) +
      0.26 * Math.sin(5 * t + s * 2.9 + 1.1) +
      0.14 * Math.sin(8 * t + s * 0.6 + 2.3) +
      0.08 * Math.sin(13 * t + s * 2.2 + 0.4)
    );
  }

  /* 鋸齒剖面：每 360/teeth 度一齒，圓潤的凸起，值域 [0,1] */
  function toothAt(deg, teeth) {
    if (!teeth || teeth <= 0) return 0;
    var period = 360 / teeth;
    var frac = (deg / period) % 1;
    if (frac < 0) frac += 1;
    return 0.5 * (1 - Math.cos(frac * 2 * Math.PI));
  }

  /* ---------- 硬幣 ---------- */

  function makeCoin(opt) {
    opt = opt || {};
    return {
      radius: opt.radius == null ? 150 : opt.radius,
      samples: opt.samples == null ? 720 : Math.max(24, Math.round(opt.samples)),
      teeth: opt.teeth == null ? 0 : opt.teeth,
      toothDepth: opt.toothDepth == null ? 0.034 : opt.toothDepth,
      wobble: opt.wobble == null ? 0 : opt.wobble,
      seed: opt.seed == null ? 0 : opt.seed,
      cuts: []
    };
  }

  /* 1662 年以前：手工錘打，圓不圓看那一鎚，邊緣沒有任何規則可言 */
  function makeHammered(opt) {
    opt = opt || {};
    return makeCoin({
      radius: opt.radius,
      samples: opt.samples,
      teeth: 0,
      wobble: opt.wobble == null ? 0.052 : opt.wobble,
      seed: opt.seed == null ? 7 : opt.seed
    });
  }

  /* 機器壓製：正圓、一致，邊緣有整齊的滾花 */
  function makeMilled(opt) {
    opt = opt || {};
    return makeCoin({
      radius: opt.radius,
      samples: opt.samples,
      teeth: opt.teeth == null ? 120 : opt.teeth,
      toothDepth: opt.toothDepth,
      wobble: 0,
      seed: 0
    });
  }

  function cloneCoin(coin) {
    var c = makeCoin(coin);
    c.cuts = coin.cuts.slice();
    return c;
  }

  /* 剪一刀：以 centerDeg 為中心切一條弦
   *   sweepDeg   ：這一刀大約吃掉幾度
   *   extraDepth ：再往裡面多咬幾個單位（讓缺口更明顯）
   * 回傳的 cut 物件裡，half 是「這條弦可能影響到的角度半寬」，
   * 故意放寬一點，實際輪廓由 min() 決定，不會有階梯狀假邊。
   */
  function addCut(coin, centerDeg, sweepDeg, extraDepth) {
    var s = clamp(sweepDeg == null ? 40 : sweepDeg, 1, 150);
    var dist = coin.radius * Math.cos(s / 2 * DEG) - (extraDepth || 0);
    dist = clamp(dist, coin.radius * 0.05, coin.radius * 0.999);
    var half = Math.acos(clamp(dist / coin.radius, 0, 1)) / DEG;
    half = clamp(half + 8, 1, 88);
    var cut = { center: norm180(centerDeg), half: half, dist: dist };
    coin.cuts.push(cut);
    return cut;
  }

  function clearCuts(coin) {
    coin.cuts = [];
    return coin;
  }

  /* ---------- 半徑 ---------- */

  function baseRadiusAt(coin, deg) {
    return coin.radius * (1 + wobbleAt(deg, coin.seed, coin.wobble));
  }

  /* 還沒被剪之前的半徑（含鋸齒） */
  function uncutRadiusAt(coin, deg) {
    var r = baseRadiusAt(coin, deg);
    if (coin.teeth > 0) r += coin.radius * coin.toothDepth * toothAt(deg, coin.teeth);
    return r;
  }

  /* 一條弦在某個角度上的半徑；影響範圍外回傳 Infinity（表示不影響） */
  function chordRadiusAt(cut, deg) {
    var d = angleDiff(deg, cut.center);
    if (Math.abs(d) >= cut.half) return Infinity;
    var c = Math.cos(d * DEG);
    if (c <= 1e-6) return Infinity;
    var r = cut.dist / c;
    return isFinite(r) ? r : Infinity;
  }

  function radiusAt(coin, deg) {
    var r = uncutRadiusAt(coin, deg);
    for (var i = 0; i < coin.cuts.length; i++) {
      var cr = chordRadiusAt(coin.cuts[i], deg);
      if (cr < r) r = cr;
    }
    return r;
  }

  /* 這個角度上的金屬有沒有被剪掉 */
  function isCutAt(coin, deg) {
    return radiusAt(coin, deg) < uncutRadiusAt(coin, deg) - 1e-9;
  }

  function sampleRadii(coin) {
    var n = coin.samples;
    var step = 360 / n;
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = radiusAt(coin, i * step);
    return out;
  }

  /* ---------- 幾何 → SVG ---------- */

  function radiiToPoints(radii, cx, cy) {
    var n = radii.length;
    var step = 2 * Math.PI / n;
    var pts = new Array(n);
    for (var i = 0; i < n; i++) {
      var a = i * step;
      pts[i] = [cx + radii[i] * Math.cos(a), cy + radii[i] * Math.sin(a)];
    }
    return pts;
  }

  /* shoelace */
  function polygonArea(pts) {
    var a = 0, n = pts.length;
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  }

  function pointsToPath(pts, dp) {
    var k = dp == null ? 2 : dp;
    var s = '';
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i][0], y = pts[i][1];
      if (!isFinite(x)) x = 0;
      if (!isFinite(y)) y = 0;
      s += (i ? 'L' : 'M') + x.toFixed(k) + ' ' + y.toFixed(k) + ' ';
    }
    return s + 'Z';
  }

  function coinPath(coin, cx, cy) {
    return pointsToPath(radiiToPoints(sampleRadii(coin), cx, cy));
  }

  /* ---------- 重量 ---------- */

  function coinArea(coin) {
    return polygonArea(radiiToPoints(sampleRadii(coin), 0, 0));
  }

  function pristineArea(coin) {
    var c = cloneCoin(coin);
    c.cuts = [];
    return coinArea(c);
  }

  /* 重量 = 面積比。沒剪過就是 1。 */
  function weightRatio(coin) {
    var p = pristineArea(coin);
    if (!(p > 0)) return 1;
    return clamp(coinArea(coin) / p, 0, 1);
  }

  /* 被剪斷的齒數（機製幣才有意義） */
  function brokenTeeth(coin) {
    if (!(coin.teeth > 0) || !coin.cuts.length) return 0;
    var n = coin.samples, step = 360 / n, covered = 0;
    for (var i = 0; i < n; i++) if (isCutAt(coin, i * step)) covered += step;
    return Math.round(covered / (360 / coin.teeth));
  }

  /* 邊緣有沒有被動過手腳：只有整齊的鋸齒被剪斷才看得出來 */
  function isEdgeTampered(coin) {
    return brokenTeeth(coin) > 0;
  }

  /* ---------- 邊緣展開圖 ---------- */

  /* 把整圈邊緣攤平成一條帶子：x = 角度，y = 半徑偏差。
   * 機製幣會看到整齊的鋸齒；被剪掉的區間會出現一段缺口。
   * 產生的是封閉圖形（非零面積），可安全掛陰影。
   */
  function edgeProfilePath(coin, opt) {
    opt = opt || {};
    var w = opt.width == null ? 560 : opt.width;
    var h = opt.height == null ? 92 : opt.height;
    var n = opt.samples == null ? Math.min(coin.samples, 720) : Math.max(8, Math.round(opt.samples));
    var up = opt.exaggerate == null ? 7 : opt.exaggerate;
    var down = opt.exaggerateDown == null ? up : opt.exaggerateDown;
    var baseY = opt.baseY == null ? h * 0.62 : opt.baseY;
    var rot = opt.rotate || 0;
    var s = 'M0 ' + h.toFixed(2) + ' ';
    for (var i = 0; i <= n; i++) {
      var deg = rot + 360 * i / n;
      var dev = radiusAt(coin, deg) - coin.radius;
      var y = baseY - dev * (dev >= 0 ? up : down);
      s += 'L' + (w * i / n).toFixed(2) + ' ' + clamp(y, 1, h - 1).toFixed(2) + ' ';
    }
    s += 'L' + w.toFixed(2) + ' ' + h.toFixed(2) + ' Z';
    return s;
  }

  /* 首屏用：一段放大到看得見刀痕的滾花特寫（純裝飾） */
  function reedStripPath(opt) {
    opt = opt || {};
    var w = opt.width == null ? 1200 : opt.width;
    var h = opt.height == null ? 300 : opt.height;
    var top = opt.top == null ? 96 : opt.top;
    var amp = opt.amp == null ? 46 : opt.amp;
    var period = opt.period == null ? 44 : opt.period;
    var n = opt.samples == null ? 900 : Math.max(8, Math.round(opt.samples));
    var phase = opt.phase || 0;
    var s = 'M0 ' + h.toFixed(2) + ' ';
    for (var i = 0; i <= n; i++) {
      var x = w * i / n;
      var f = ((x + phase) / period) % 1;
      if (f < 0) f += 1;
      var y = (top + amp) - amp * (0.5 * (1 - Math.cos(f * 2 * Math.PI)));
      s += 'L' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    }
    s += 'L' + w.toFixed(2) + ' ' + h.toFixed(2) + ' Z';
    return s;
  }

  return {
    DEG: DEG,
    clamp: clamp,
    norm180: norm180,
    angleDiff: angleDiff,
    wobbleAt: wobbleAt,
    toothAt: toothAt,
    makeCoin: makeCoin,
    makeHammered: makeHammered,
    makeMilled: makeMilled,
    cloneCoin: cloneCoin,
    addCut: addCut,
    clearCuts: clearCuts,
    baseRadiusAt: baseRadiusAt,
    uncutRadiusAt: uncutRadiusAt,
    chordRadiusAt: chordRadiusAt,
    radiusAt: radiusAt,
    isCutAt: isCutAt,
    sampleRadii: sampleRadii,
    radiiToPoints: radiiToPoints,
    polygonArea: polygonArea,
    pointsToPath: pointsToPath,
    coinPath: coinPath,
    coinArea: coinArea,
    pristineArea: pristineArea,
    weightRatio: weightRatio,
    brokenTeeth: brokenTeeth,
    isEdgeTampered: isEdgeTampered,
    edgeProfilePath: edgeProfilePath,
    reedStripPath: reedStripPath
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CoinGeo;

/*!
 * stats.js —「那顆棉花糖」效果量示意模型與圖表輔助（純函式）
 *
 * ⚠ 重要聲明
 * 這裡的數字模型是把 Watts, Duncan & Quan (2018) 的「結論」做成一個可以親手操作的
 * 示意工具，**不是重跑原始統計**，也不是任何真實資料集的重現。
 *
 * 它只忠實編碼兩個查證過的量級：
 *   1. 2018 年重做研究的雙變項關聯（聚焦母親未完成大學學業的孩子）約為
 *      每多等一分鐘對應十五歲時學業表現 0.1 個標準差；這個關聯**只有原始研究
 *      報告的一半大**（故 ORIGINAL_MULTIPLIER = 2）。
 *   2. 在控制家庭背景、幼年認知能力與家庭環境之後，這個關聯**又縮掉約三分之二**
 *      （故 TOTAL_REMAINING = 1/3）。
 *
 * 三個控制變項「各自」分掉多少縮減量，是本模型為了可操作性自行分配的示意權重，
 * 原始論文並未提供這樣的拆解。三者全開時的總殘餘量恆等於 1/3，且與開關順序無關
 * （因為採用乘法因子，各因子的乘積被固定為 1/3）。
 *
 * 載入方式：瀏覽器用 <script src="stats.js">（全域 MarshmallowStats）；
 *           node 用 require('./stats.js')。不是 ES module。
 */
var MarshmallowStats = (function () {
  'use strict';

  /* ---------- 常數 ---------- */

  var BASE_EFFECT = 0.1;          // 個標準差／每多等一分鐘（2018 年的雙變項關聯）
  var ORIGINAL_MULTIPLIER = 2;    // 原始研究報告的關聯約為上面那個的兩倍
  var TOTAL_REMAINING = 1 / 3;    // 三個控制變項全開後的殘餘比例（縮掉約三分之二）

  // weight 只影響「三分之二的縮減量怎麼分給三個開關」，不影響全開後的總量。
  var CONTROLS = [
    { id: 'ses',  label: '家庭社經背景',   note: '父母教育、家庭收入等' , weight: 1.00 },
    { id: 'cog',  label: '幼年認知能力',   note: '四歲時已有的能力差異' , weight: 0.55 },
    { id: 'home', label: '家庭環境',       note: '孩子每天實際生活的樣子', weight: 0.75 }
  ];

  var WEIGHT_SUM = (function () {
    var s = 0;
    for (var i = 0; i < CONTROLS.length; i++) s += CONTROLS[i].weight;
    return s;
  })();

  /* ---------- 小工具 ---------- */

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // 任何進不來的東西都退回 fallback，確保不會漏出 NaN／Infinity
  function safe(v, fallback) {
    var n = (typeof v === 'number') ? v : parseFloat(v);
    return isNum(n) ? n : fallback;
  }

  function clamp(v, lo, hi) {
    var n = safe(v, lo);
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  /* ---------- 控制變項 ---------- */

  function controls() {
    var out = [];
    for (var i = 0; i < CONTROLS.length; i++) {
      out.push({
        id: CONTROLS[i].id,
        label: CONTROLS[i].label,
        note: CONTROLS[i].note,
        weight: CONTROLS[i].weight
      });
    }
    return out;
  }

  function controlIds() {
    var out = [];
    for (var i = 0; i < CONTROLS.length; i++) out.push(CONTROLS[i].id);
    return out;
  }

  function controlById(id) {
    for (var i = 0; i < CONTROLS.length; i++) {
      if (CONTROLS[i].id === id) return CONTROLS[i];
    }
    return null;
  }

  // 單一控制變項的乘法因子（<1）。所有因子的乘積恆等於 TOTAL_REMAINING。
  function controlFactor(id) {
    var c = controlById(id);
    if (!c || WEIGHT_SUM <= 0) return 1;
    var f = Math.pow(TOTAL_REMAINING, c.weight / WEIGHT_SUM);
    return isNum(f) ? clamp(f, 0, 1) : 1;
  }

  // 這個開關單獨會把效果縮掉幾 %（示意分配）
  function controlShrinkPercent(id) {
    return (1 - controlFactor(id)) * 100;
  }

  // 接受 ['ses','cog'] / {ses:true} / Set / 'ses' / null
  function normalizeControls(input) {
    var on = {};
    var i;
    if (!input) return on;

    if (typeof input === 'string') {
      on[input] = true;
      return on;
    }
    if (Object.prototype.toString.call(input) === '[object Array]') {
      for (i = 0; i < input.length; i++) {
        if (typeof input[i] === 'string') on[input[i]] = true;
      }
      return on;
    }
    if (typeof Set !== 'undefined' && input instanceof Set) {
      input.forEach(function (v) { if (typeof v === 'string') on[v] = true; });
      return on;
    }
    if (typeof input === 'object') {
      for (var k in input) {
        if (Object.prototype.hasOwnProperty.call(input, k) && input[k]) on[k] = true;
      }
      return on;
    }
    return on;
  }

  /* ---------- 核心：剩餘效果量 ---------- */

  /**
   * 依「已開啟的控制變項」算出剩餘效果量（個標準差／每多等一分鐘）。
   * 全部關閉 → 回傳 baseEffect 本身（預設 0.1）。
   * 全部開啟 → 回傳 baseEffect / 3（縮掉約三分之二）。
   * 乘法模型 ⇒ 開關順序不影響結果；結果永遠 >= 0 且不會是 NaN。
   */
  function effectAfterControls(baseEffect, activeControls) {
    var base = safe(baseEffect, BASE_EFFECT);
    if (base < 0) base = 0;

    var on = normalizeControls(activeControls);
    var e = base;
    for (var i = 0; i < CONTROLS.length; i++) {
      if (on[CONTROLS[i].id]) e *= controlFactor(CONTROLS[i].id);
    }
    if (!isNum(e) || e < 0) return 0;
    return e;
  }

  // 只看比例：全開時回傳 1/3
  function remainingFraction(activeControls) {
    return effectAfterControls(1, activeControls);
  }

  /**
   * from 縮到 to，縮掉了百分之幾。shrinkPercent(1, 0.5) === 50。
   * 為了畫面安全，結果夾在 0–100，且永不回傳 NaN。
   */
  function shrinkPercent(from, to) {
    var f = safe(from, 0);
    var t = safe(to, 0);
    if (f === 0) return 0;
    var p = (f - t) / f * 100;
    if (!isNum(p)) return 0;
    return clamp(p, 0, 100);
  }

  // 還剩百分之幾
  function remainingPercent(from, to) {
    return 100 - shrinkPercent(from, to);
  }

  // 原始研究報告的關聯：2018 年的雙變項關聯只有它的一半
  function originalReportedEffect(baseEffect) {
    var base = safe(baseEffect, BASE_EFFECT);
    if (base < 0) base = 0;
    return base * ORIGINAL_MULTIPLIER;
  }

  /* ---------- 圖表輔助（把效果量換成 SVG 座標） ---------- */

  var DEFAULT_GEOM = {
    x0: 80,             // 繪圖區左上 x
    y0: 40,             // 繪圖區左上 y
    plotW: 520,
    plotH: 300,
    xSpanMinutes: 10,   // 橫軸：四歲時等待的分鐘數
    ySpanSd: 3          // 縱軸：十五歲學業表現，總跨度 3 個標準差（-1.5 ~ +1.5）
  };

  function geom(g) {
    var out = {};
    for (var k in DEFAULT_GEOM) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_GEOM, k)) {
        out[k] = (g && isNum(safe(g[k], NaN))) ? safe(g[k], DEFAULT_GEOM[k]) : DEFAULT_GEOM[k];
      }
    }
    if (out.plotW <= 0) out.plotW = DEFAULT_GEOM.plotW;
    if (out.plotH <= 0) out.plotH = DEFAULT_GEOM.plotH;
    if (out.xSpanMinutes <= 0) out.xSpanMinutes = DEFAULT_GEOM.xSpanMinutes;
    if (out.ySpanSd <= 0) out.ySpanSd = DEFAULT_GEOM.ySpanSd;
    return out;
  }

  function centerX(g) { var G = geom(g); return G.x0 + G.plotW / 2; }
  function centerY(g) { var G = geom(g); return G.y0 + G.plotH / 2; }  // = 0 個標準差

  function pxPerMinute(g) { var G = geom(g); return G.plotW / G.xSpanMinutes; }
  function pxPerSd(g)     { var G = geom(g); return G.plotH / G.ySpanSd; }

  /** 迴歸線在 SVG 座標下的斜率（dy/dx）。效果為正 → 回傳負值（SVG 的 y 往下）。 */
  function pixelSlope(effect, g) {
    var e = safe(effect, 0);
    var s = -(e * pxPerSd(g)) / pxPerMinute(g);
    if (!isNum(s) || s === 0) return 0;   // 順手把 -0 正規化成 0，字串化時才不會出現 "-0"
    return s;
  }

  /** 同一條斜率換成角度（度）。畫圖時用 rotate(angle, cx, cy) 就能平滑過場。 */
  function slopeAngleDeg(effect, g) {
    var a = Math.atan(pixelSlope(effect, g)) * 180 / Math.PI;
    if (!isNum(a) || a === 0) return 0;
    return a;
  }

  /** 迴歸線兩端點，通過繪圖區中心（平均點）。 */
  function regressionLine(effect, g) {
    var G = geom(g);
    var cx = centerX(G), cy = centerY(G);
    var s = pixelSlope(effect, G);
    var x1 = G.x0, x2 = G.x0 + G.plotW;
    return {
      x1: x1, y1: cy + (x1 - cx) * s,
      x2: x2, y2: cy + (x2 - cx) * s
    };
  }

  /** 確定性亂數（同一個 seed 永遠同一張散布圖，避免每次重繪都在跳）。 */
  function makeRandom(seed) {
    var s = safe(seed, 1) >>> 0;
    if (s === 0) s = 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * 散布圖的點。回傳的是「效果為 0 時」的位置與離中心的水平距離，
   * 之後用 pointOffsetY() 依當前效果量把它們往上／往下推。
   */
  function scatterPoints(count, g, seed) {
    var G = geom(g);
    var n = Math.max(0, Math.round(safe(count, 0)));
    var rnd = makeRandom(seed);
    var cx = centerX(G), cy = centerY(G);
    var noiseSd = 0.55;                 // 示意用的殘差大小
    var out = [];
    for (var i = 0; i < n; i++) {
      var u = rnd();
      var minutes = G.xSpanMinutes * Math.pow(u, 1.6);   // 等待時間偏向短的那頭
      var x = G.x0 + minutes * pxPerMinute(G);
      // Box–Muller 取常態殘差
      var a = rnd() || 1e-9, b = rnd();
      var z = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
      if (!isNum(z)) z = 0;
      out.push({
        minutes: minutes,
        x: x,
        dx: x - cx,
        yFlat: cy + clamp(z, -2.4, 2.4) * noiseSd * pxPerSd(G),
        r: 2.6 + rnd() * 1.6
      });
    }
    return out;
  }

  /** 某個點在目前效果量下要往上／往下位移幾 px。 */
  function pointOffsetY(point, effect, g) {
    if (!point) return 0;
    var v = safe(point.dx, 0) * pixelSlope(effect, g);
    return isNum(v) ? v : 0;
  }

  /** 某個點的最終 y（已夾在繪圖區內）。 */
  function pointY(point, effect, g) {
    var G = geom(g);
    if (!point) return centerY(G);
    var y = safe(point.yFlat, centerY(G)) + pointOffsetY(point, effect, G);
    return clamp(y, G.y0 + 5, G.y0 + G.plotH - 5);
  }

  /* ---------- 顯示格式 ---------- */

  function formatEffect(v) {
    var n = safe(v, 0);
    if (n < 0) n = 0;
    return n.toFixed(3);
  }

  function formatPercent(v) {
    return String(Math.round(clamp(v, 0, 100))) + '%';
  }

  function formatSeconds(v) {
    var n = safe(v, 0);
    if (n < 0) n = 0;
    return n.toFixed(1);
  }

  return {
    BASE_EFFECT: BASE_EFFECT,
    ORIGINAL_MULTIPLIER: ORIGINAL_MULTIPLIER,
    TOTAL_REMAINING: TOTAL_REMAINING,
    DEFAULT_GEOM: DEFAULT_GEOM,

    controls: controls,
    controlIds: controlIds,
    controlById: controlById,
    controlFactor: controlFactor,
    controlShrinkPercent: controlShrinkPercent,
    normalizeControls: normalizeControls,

    effectAfterControls: effectAfterControls,
    remainingFraction: remainingFraction,
    shrinkPercent: shrinkPercent,
    remainingPercent: remainingPercent,
    originalReportedEffect: originalReportedEffect,

    geom: geom,
    centerX: centerX,
    centerY: centerY,
    pxPerMinute: pxPerMinute,
    pxPerSd: pxPerSd,
    pixelSlope: pixelSlope,
    slopeAngleDeg: slopeAngleDeg,
    regressionLine: regressionLine,
    makeRandom: makeRandom,
    scatterPoints: scatterPoints,
    pointOffsetY: pointOffsetY,
    pointY: pointY,

    clamp: clamp,
    formatEffect: formatEffect,
    formatPercent: formatPercent,
    formatSeconds: formatSeconds
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = MarshmallowStats;

/* sim.js — 「砲聲先到，列車後到」的物理核心（純函式，瀏覽器與 node 共用）
 *
 * 模型（線性聲學的簡化版，詳見 說明.md）：
 *   1. 車頭輪廓 r(x) → 斷面積 A(x) = π r²
 *   2. 進洞壓縮波的波前陡度 ∝ U³ · A'(x)／(1−M²)；波前有限厚度 → A' 以高斯核平滑
 *   3. 出口外距離 d 的微氣壓波 Δp ≈ 2ρ U³ max(A') ／ (Ω c d (1−M²))，Ω = 2π
 *   過關線：8 m 拋物面車鼻以 270 km/h 進洞的模型值（「快 10%，砲聲不能變大」）。
 */
(function (root) {
  'use strict';
  var RHO = 1.2, C = 340, D = 20, OMEGA = 2 * Math.PI;
  var AREA = 10.2;                         /* 500 系車身斷面 m² */
  var R = Math.sqrt(AREA / Math.PI);       /* 等效半徑 ≈ 1.80 m */
  var XMAX = 18;                           /* 車頭長度上限 m */
  var DX = 0.1;
  var N = Math.round(XMAX / DX);           /* 取樣 0..N（含） */
  var SIG_R = 0.3, SIG_A = 0.8;            /* 輪廓去抖／波前厚度（m） */

  function kmh(v) { return v / 3.6; }

  function gauss(arr, sigM, edgeL, edgeR) {
    var s = sigM / DX, half = Math.ceil(s * 3), out = new Array(arr.length), w = [];
    for (var k = -half; k <= half; k++) w.push(Math.exp(-k * k / (2 * s * s)));
    for (var i = 0; i < arr.length; i++) {
      var acc = 0, ws = 0;
      for (var j = -half; j <= half; j++) {
        var t = i + j, v;
        if (t < 0) v = edgeL; else if (t >= arr.length) v = edgeR; else v = arr[t];
        acc += v * w[j + half]; ws += w[j + half];
      }
      out[i] = acc / ws;
    }
    return out;
  }

  /* 使用者筆跡（x 公尺, r 公尺）→ 等距 r 陣列。
     沒畫到的鼻尖前方＝0；最後一點之後＝車身 R（若沒畫到 R，會在那裡留下一個台階）。 */
  function resample(points) {
    var bins = new Array(N + 1), i;
    for (i = 0; i < points.length; i++) {
      var p = points[i];
      var b = Math.round(p.x / DX);
      if (b < 0 || b > N) continue;
      bins[b] = Math.max(0, Math.min(R, p.r));
    }
    var idx = [];
    for (i = 0; i <= N; i++) if (bins[i] !== undefined) idx.push(i);
    var r = new Array(N + 1);
    if (!idx.length) { for (i = 0; i <= N; i++) r[i] = R; return r; }
    for (i = 0; i <= N; i++) {
      if (i < idx[0]) r[i] = 0;
      else if (i > idx[idx.length - 1]) r[i] = R;
    }
    for (var k = 0; k < idx.length; k++) {
      var a = idx[k], b2 = idx[k + 1];
      r[a] = bins[a];
      if (b2 === undefined) break;
      for (var q = a + 1; q < b2; q++) r[q] = bins[a] + (bins[b2] - bins[a]) * (q - a) / (b2 - a);
    }
    return r;
  }

  function fromFn(fn, L) {           /* fn(s∈[0,1]) → r/R；L＝鼻長 m */
    var r = new Array(N + 1);
    for (var i = 0; i <= N; i++) {
      var x = i * DX;
      r[i] = x >= L ? R : R * Math.max(0, Math.min(1, fn(x / L)));
    }
    return r;
  }

  var PRESETS = {
    blunt:   function () { return fromFn(function () { return 1; }, 0.0001); },
    round4:  function () { return fromFn(function (s) { return Math.sqrt(1 - (1 - s) * (1 - s)); }, 4); },
    cone15:  function () { return fromFn(function (s) { return s; }, 15); },
    para:    function (L) { return fromFn(function (s) { return Math.sqrt(s); }, L); },
    beak:    function (L) { return fromFn(function (s) { return Math.pow(s, 0.55); }, L); }
  };

  function noseLength(r) {
    var first = -1, last = 0;
    for (var i = 0; i < r.length; i++) {
      if (first < 0 && r[i] > 0.02) first = i;
      if (r[i] < R * 0.98) last = i;
    }
    if (first < 0) return 0;
    return Math.max(0, (last - first + 1) * DX);
  }

  /* 主計算：回傳 Pa、峰值位置、平滑後的 A' 曲線 */
  function analyze(r, speedKmh) {
    var U = kmh(speedKmh), M = U / C;
    var PAD = 20, rp = [], k;                /* 鼻尖前補 2 m 空氣，鼻尖台階才不會被切掉 */
    for (k = 0; k < PAD; k++) rp.push(0);
    rp = rp.concat(r);
    var rs = gauss(rp, SIG_R, 0, R);
    var A = rs.map(function (v) { return Math.PI * v * v; });
    var dA = new Array(A.length + 40);       /* 尾端補 4 m 車身，讓台階也被看見 */
    for (var i = 0; i < dA.length; i++) {
      var a0 = i < A.length ? A[i] : AREA, a1 = i + 1 < A.length ? A[i + 1] : AREA;
      dA[i] = (a1 - a0) / DX;
    }
    var g = gauss(dA, SIG_A, 0, 0);
    var mx = 0, at = 0;
    for (i = 0; i < g.length; i++) if (g[i] > mx) { mx = g[i]; at = i; }
    var pa = 2 * RHO * U * U * U * mx / (OMEGA * C * D * (1 - M * M));
    return { pa: pa, grad: mx, peakX: (at - PAD) * DX, curve: g.slice(PAD), L: noseLength(r) };
  }

  var PASS = analyze(PRESETS.para(8), 270).pa;

  /* 與翠鳥嘴（以使用者自己的鼻長正規化）的吻合度 0..1 */
  function similarity(r) {
    var L = noseLength(r);
    if (L < 1) return 0;
    var first = 0;
    while (first < r.length && r[first] <= 0.02) first++;
    var n = 0, err = 0;
    for (var i = first; i <= N; i++) {
      var s = (i - first) * DX / L;
      if (s > 1) break;
      err += Math.abs(r[i] / R - Math.pow(s, 0.55)); n++;
    }
    return n ? Math.max(0, 1 - 2 * err / n) : 0;
  }

  /* 給台灣日期字串 YYYY-MM-DD，算到目標日還有幾天 */
  function daysUntil(todayStr, targetStr) {
    var a = Date.UTC.apply(null, todayStr.split('-').map(Number).map(function (v, k) { return k === 1 ? v - 1 : v; }));
    var b = Date.UTC.apply(null, targetStr.split('-').map(Number).map(function (v, k) { return k === 1 ? v - 1 : v; }));
    return Math.round((b - a) / 86400000);
  }

  function diagnose(res) {
    if (res.pa <= PASS) return 'pass';
    if (res.L < 10) return 'short';
    if (res.peakX > res.L * 0.7) return 'late';
    return 'kink';
  }

  var SIM = { R: R, AREA: AREA, XMAX: XMAX, DX: DX, N: N, PASS: PASS,
    resample: resample, fromFn: fromFn, PRESETS: PRESETS, analyze: analyze,
    noseLength: noseLength, similarity: similarity, daysUntil: daysUntil, diagnose: diagnose };
  if (typeof module !== 'undefined' && module.exports) module.exports = SIM;
  else root.SIM = SIM;
})(typeof window !== 'undefined' ? window : globalThis);

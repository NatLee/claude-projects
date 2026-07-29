/* ==========================================================================
 * 這是不是一個 7 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 *
 * 1) 用「筆畫」描述十六個手寫樣本，即時點陣化成 16×16 的墨點圖
 * 2) 從點陣圖算出六個人看得懂的特徵（頂橫畫、中橫槓、封閉圈…）
 * 3) 規則引擎：每條規則三態（不管／要有／不能有），最多 3^6 = 729 種組合
 * 4) 感知器：直接吃 256 個像素，什麼特徵都不告訴它，自己學
 * ========================================================================== */
'use strict';

var GRID = 16;

/* ---------- 點陣化 ---------- */
function distToSeg(px, py, x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1;
  var L = dx * dx + dy * dy;
  var t = L === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / L;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  var qx = x1 + t * dx, qy = y1 + t * dy;
  return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
}

/* 二次貝茲取樣成一串線段，讓弧線也能用同一套距離公式 */
function quadToSegs(x1, y1, cx, cy, x2, y2, n) {
  var pts = [], i, t, u;
  for (i = 0; i <= n; i++) {
    t = i / n; u = 1 - t;
    pts.push([u * u * x1 + 2 * u * t * cx + t * t * x2,
              u * u * y1 + 2 * u * t * cy + t * t * y2]);
  }
  var segs = [];
  for (i = 0; i < pts.length - 1; i++) {
    segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  }
  return segs;
}

/* strokes：[x1,y1,x2,y2] 陣列，座標 0~1；r 為筆畫半徑 */
function rasterize(strokes, r) {
  var g = [], y, x, i, cx, cy, best, d;
  for (y = 0; y < GRID; y++) {
    var row = [];
    for (x = 0; x < GRID; x++) {
      cx = (x + 0.5) / GRID; cy = (y + 0.5) / GRID;
      best = 9;
      for (i = 0; i < strokes.length; i++) {
        d = distToSeg(cx, cy, strokes[i][0], strokes[i][1], strokes[i][2], strokes[i][3]);
        if (d < best) best = d;
      }
      row.push(best <= r ? 1 : 0);
    }
    g.push(row);
  }
  return g;
}

/* ---------- 十六個樣本 ---------- */
function L(a, b, c, d) { return [a, b, c, d]; }

var TOPBAR = L(0.16, 0.22, 0.80, 0.22);

var SAMPLES = [
  /* ——— 是 7 ——— */
  { name: '課本上的 7', is7: true, r: 0.055, strokes: [TOPBAR, L(0.80, 0.22, 0.40, 0.86)] },
  { name: '寫得很斜的 7', is7: true, r: 0.055, strokes: [L(0.14, 0.20, 0.82, 0.27), L(0.82, 0.27, 0.28, 0.85)] },
  { name: '歐洲人的 7', is7: true, r: 0.055, strokes: [TOPBAR, L(0.80, 0.22, 0.40, 0.86), L(0.36, 0.56, 0.70, 0.50)] },
  { name: '起筆帶勾的 7', is7: true, r: 0.055, strokes: [TOPBAR, L(0.80, 0.22, 0.40, 0.86), L(0.16, 0.22, 0.23, 0.38)] },
  { name: '橫畫短一截的 7', is7: true, r: 0.055, strokes: [L(0.34, 0.21, 0.79, 0.21), L(0.79, 0.21, 0.42, 0.86)] },
  { name: '寫彎了的 7', is7: true, r: 0.055,
    strokes: [TOPBAR].concat(quadToSegs(0.80, 0.22, 0.46, 0.44, 0.44, 0.86, 8)) },
  { name: '簽名時的 7', is7: true, r: 0.06,
    strokes: [L(0.52, 0.24, 0.79, 0.20), L(0.79, 0.20, 0.34, 0.85)] },
  { name: '又粗又帶槓的 7', is7: true, r: 0.075, strokes: [TOPBAR, L(0.80, 0.22, 0.42, 0.86), L(0.34, 0.54, 0.72, 0.49)] },

  /* ——— 不是 7 ——— */
  { name: '一', is7: false, r: 0.055,
    strokes: [L(0.36, 0.31, 0.52, 0.17), L(0.52, 0.17, 0.52, 0.84), L(0.30, 0.84, 0.74, 0.84)] },
  { name: '光禿禿的 1', is7: false, r: 0.055, strokes: [L(0.50, 0.18, 0.50, 0.84)] },
  { name: '二', is7: false, r: 0.055,
    strokes: quadToSegs(0.24, 0.35, 0.52, 0.09, 0.77, 0.35, 8)
      .concat([L(0.77, 0.35, 0.26, 0.84), L(0.24, 0.84, 0.79, 0.84)]) },
  { name: '九', is7: false, r: 0.055,
    strokes: quadToSegs(0.70, 0.34, 0.70, 0.12, 0.46, 0.12, 6)
      .concat(quadToSegs(0.46, 0.12, 0.24, 0.12, 0.24, 0.34, 6))
      .concat(quadToSegs(0.24, 0.34, 0.24, 0.54, 0.70, 0.46, 8))
      .concat([L(0.70, 0.34, 0.62, 0.86)]) },
  { name: '四', is7: false, r: 0.055,
    strokes: [L(0.64, 0.17, 0.24, 0.61), L(0.24, 0.61, 0.84, 0.61), L(0.64, 0.17, 0.64, 0.86)] },
  { name: '大寫 T', is7: false, r: 0.055, strokes: [TOPBAR, L(0.48, 0.22, 0.48, 0.86)] },
  { name: '五', is7: false, r: 0.055,
    strokes: [L(0.28, 0.19, 0.76, 0.19), L(0.28, 0.19, 0.28, 0.50)]
      .concat(quadToSegs(0.28, 0.50, 0.80, 0.58, 0.40, 0.86, 8)) },
  { name: '一道斜線', is7: false, r: 0.06, strokes: [L(0.79, 0.20, 0.34, 0.85)] }
];

function buildSamples() {
  return SAMPLES.map(function (s) {
    var grid = rasterize(s.strokes, s.r);
    return { name: s.name, is7: s.is7, grid: grid, feat: features(grid) };
  });
}

/* ---------- 六個「人看得懂」的特徵 ---------- */
function widestRun(row) {
  var best = 0, cur = 0;
    for (var x = 0; x < row.length; x++) {
    if (row[x]) { cur++; if (cur > best) best = cur; } else { cur = 0; }
  }
  return best / row.length;
}

/* 數封閉的洞：從邊界灌水，灌不到的空白就是洞 */
function countHoles(g) {
  var seen = [], y, x;
  for (y = 0; y < GRID; y++) { seen.push(new Array(GRID).fill(0)); }
  var stack = [];
  for (x = 0; x < GRID; x++) { stack.push([0, x], [GRID - 1, x]); }
  for (y = 0; y < GRID; y++) { stack.push([y, 0], [y, GRID - 1]); }
  while (stack.length) {
    var p = stack.pop(), py = p[0], px = p[1];
    if (py < 0 || px < 0 || py >= GRID || px >= GRID) continue;
    if (seen[py][px] || g[py][px]) continue;
    seen[py][px] = 1;
    stack.push([py + 1, px], [py - 1, px], [py, px + 1], [py, px - 1]);
  }
  var holes = 0, mark = [];
  for (y = 0; y < GRID; y++) mark.push(new Array(GRID).fill(0));
  for (y = 0; y < GRID; y++) {
    for (x = 0; x < GRID; x++) {
      if (g[y][x] || seen[y][x] || mark[y][x]) continue;
      holes++;
      var st = [[y, x]];
      while (st.length) {
        var q = st.pop(), qy = q[0], qx = q[1];
        if (qy < 0 || qx < 0 || qy >= GRID || qx >= GRID) continue;
        if (g[qy][qx] || seen[qy][qx] || mark[qy][qx]) continue;
        mark[qy][qx] = 1;
        st.push([qy + 1, qx], [qy - 1, qx], [qy, qx + 1], [qy, qx - 1]);
      }
    }
  }
  return holes;
}

function centroidX(g, y0, y1) {
  var sx = 0, n = 0;
  for (var y = y0; y < y1; y++) {
    for (var x = 0; x < GRID; x++) if (g[y][x]) { sx += x; n++; }
  }
  return n ? sx / n : GRID / 2;
}

function features(g) {
  var y, top = 0, mid = 0, bot = 0;
  for (y = 0; y < Math.round(GRID * 0.28); y++) top = Math.max(top, widestRun(g[y]));
  for (y = Math.round(GRID * 0.34); y < Math.round(GRID * 0.70); y++) mid = Math.max(mid, widestRun(g[y]));
  for (y = Math.round(GRID * 0.80); y < GRID; y++) bot = Math.max(bot, widestRun(g[y]));
  var touchesLeft = 0;
  for (y = 0; y < GRID; y++) if (g[y][0] || g[y][1]) touchesLeft = 1;
  var lean = centroidX(g, 0, GRID >> 1) - centroidX(g, GRID >> 1, GRID);
  return {
    topBar: top >= 0.45 ? 1 : 0,
    midBar: mid >= 0.26 ? 1 : 0,
    hole: countHoles(g) > 0 ? 1 : 0,
    bottomBar: bot >= 0.40 ? 1 : 0,
    lean: lean >= 1.6 ? 1 : 0,
    touchesLeft: touchesLeft
  };
}

var RULES = [
  { key: 'topBar', label: '上面有一條橫畫' },
  { key: 'midBar', label: '中間有一條橫槓' },
  { key: 'hole', label: '有封閉的圈' },
  { key: 'bottomBar', label: '下面有一條橫線' },
  { key: 'lean', label: '主筆畫從右上斜到左下' },
  { key: 'touchesLeft', label: '墨跡碰到最左邊' }
];

/* state：{key: 0 不管 / 1 要有 / -1 不能有} */
function judge(feat, state) {
  for (var i = 0; i < RULES.length; i++) {
    var k = RULES[i].key, s = state[k] || 0;
    if (s === 1 && !feat[k]) return false;
    if (s === -1 && feat[k]) return false;
  }
  return true;
}

function score(samples, state) {
  var right = 0, wrong = [];
  samples.forEach(function (s, i) {
    var said = judge(s.feat, state);
    if (said === s.is7) right++; else wrong.push({ i: i, said: said, truth: s.is7 });
  });
  return { right: right, total: samples.length, wrong: wrong };
}

/* 窮舉全部 3^6 = 729 種規則組合，回報最好成績 */
function bestRuleset(samples) {
  var best = { right: -1, state: null }, n = RULES.length, total = Math.pow(3, n);
  for (var c = 0; c < total; c++) {
    var v = c, st = {};
    for (var i = 0; i < n; i++) { st[RULES[i].key] = (v % 3) - 1; v = (v / 3) | 0; }
    var r = score(samples, st);
    if (r.right > best.right) best = { right: r.right, state: st };
  }
  return best;
}

/* 特徵向量完全相同、答案卻相反的一對——規則永遠分不開它們 */
function findTwins(samples) {
  var key = function (f) { return RULES.map(function (r) { return f[r.key]; }).join(''); };
  for (var i = 0; i < samples.length; i++) {
    for (var j = i + 1; j < samples.length; j++) {
      if (samples[i].is7 !== samples[j].is7 && key(samples[i].feat) === key(samples[j].feat)) {
        return [i, j];
      }
    }
  }
  return null;
}

/* ---------- 感知器：只看 256 個像素，沒有任何特徵 ---------- */
function flatten(g) {
  var v = [];
  for (var y = 0; y < GRID; y++) for (var x = 0; x < GRID; x++) v.push(g[y][x]);
  return v;
}

function makeRng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function newModel() {
  return { w: new Array(GRID * GRID).fill(0), b: 0 };
}

function predict(model, vec) {
  var s = model.b;
  for (var i = 0; i < vec.length; i++) if (vec[i]) s += model.w[i];
  return s > 0;
}

/* 跑一輪，回傳這一輪答錯幾個（權重就地更新） */
function trainEpoch(model, data, rng, lr) {
  var order = [], i;
  for (i = 0; i < data.length; i++) order.push(i);
  for (i = order.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t;
  }
  var wrong = 0;
  for (i = 0; i < order.length; i++) {
    var d = data[order[i]];
    var got = predict(model, d.vec);
    if (got !== d.is7) {
      wrong++;
      var sign = d.is7 ? lr : -lr;
      for (var k = 0; k < d.vec.length; k++) if (d.vec[k]) model.w[k] += sign;
      model.b += sign;
    }
  }
  return wrong;
}

function shuffleIdx(n, rng) {
  var a = [], i;
  for (i = 0; i < n; i++) a.push(i);
  for (i = n - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* 給它看一個樣本：答錯就往正確方向挪一點，答對就什麼都不做 */
function trainOne(model, d, lr) {
  var got = predict(model, d.vec);
  if (got === d.is7) return { wrong: false, got: got };
  var sign = d.is7 ? lr : -lr;
  for (var k = 0; k < d.vec.length; k++) if (d.vec[k]) model.w[k] += sign;
  model.b += sign;
  return { wrong: true, got: got };
}

function evaluate(model, data) {
  var right = 0;
  for (var i = 0; i < data.length; i++) if (predict(model, data[i].vec) === data[i].is7) right++;
  return right;
}

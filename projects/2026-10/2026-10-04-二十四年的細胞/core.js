/* core.js — 「它們在別人的腦裡住了二十四年」的純函式（瀏覽器與 node 共用）
 *
 * 滑桿＝移植後第幾年（0–24）。右邊的顯微視野依年份畫出：
 *   growth(y)    移植細胞長出的纖維比例（示意：前三年長滿）
 *   lewy(y)      帶路易氏體的移植細胞比例——只在有發表數字的年份上取值，其餘線性內插：
 *                第 12 年 2%、第 16 年 5%（Li et al. 2010）、第 24 年 11.5%（Li et al. 2016 的 11–12%）；
 *                第 10 年以前為 0（2008 年的病例落在 11–16 年；另一組 9–14 年完全沒看到）
 *   benefit(y)   病人的動作改善（示意）：前幾年上升、維持，第 14 年起慢慢消退（Li et al. 2016）
 *   signal(y)    移植細胞的多巴胺神經支配（示意）：長滿後維持「接近正常」直到第 24 年
 * 除了 lewy 的三個錨點，其他曲線都是示意形狀，不是量測值。
 */
(function (root) {
  'use strict';
  var YMAX = 24;
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  var LEWY_PTS = [[0, 0], [10, 0], [12, 0.02], [16, 0.05], [24, 0.115]];
  function lewy(y) {
    y = clamp(y, 0, YMAX);
    for (var i = 1; i < LEWY_PTS.length; i++) {
      var a = LEWY_PTS[i - 1], b = LEWY_PTS[i];
      if (y <= b[0]) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    return LEWY_PTS[LEWY_PTS.length - 1][1];
  }
  function growth(y) { return smooth(clamp(y, 0, YMAX) / 3); }
  function signal(y) { return 0.92 * growth(y); }
  function benefit(y) {
    y = clamp(y, 0, YMAX);
    var up = smooth((y - 0.5) / 3);
    var down = y <= 14 ? 0 : 0.65 * smooth((y - 14) / 10);
    return clamp(up - down, 0, 1);
  }
  /* N 顆移植細胞裡，有幾顆帶路易氏體（四捨五入；保證單調） */
  function affected(y, N) { return Math.round(lewy(y) * N); }

  /* 各階段的旁白（依年份） */
  var STAGES = [
    { from: 0, to: 0.25, key: 'day0', text: '移植當天：一小撮中腦細胞被注射進殼核——那是原本該有多巴胺、卻快要沒有的地方。它們還沒長出任何纖維。' },
    { from: 0.25, to: 3, key: 'grow', text: '它們開始長出纖維，往四面八方伸進宿主的組織。掃描上，多巴胺的訊號一點一點回來。' },
    { from: 3, to: 11, key: 'good', text: '這幾年，病人的動作明顯變好。新來的細胞住得很穩，免疫系統也沒有找它們麻煩。' },
    { from: 11, to: 14, key: 'lewy', text: '第十一到十六年之間過世的病人，被解剖時，研究者在一部分移植細胞裡看到了不該出現的東西：路易氏體——巴金森病人自己的神經元裡才有的那種團塊。' },
    { from: 14, to: 20, key: 'fade', text: '第十四年起，改善一點一點退去。移植的細胞多半還在工作；但團塊在它們身上，一年比一年多。' },
    { from: 20, to: 24.01, key: 'y24', text: '第二十四年，這位病人過世。移植細胞的纖維幾乎還是正常的密度，免疫系統始終沒有攻擊它們——但其中大約百分之十一到十二，帶著和宿主一樣的團塊。' }
  ];
  function stageAt(y) {
    y = clamp(y, 0, YMAX);
    for (var i = 0; i < STAGES.length; i++) if (y >= STAGES[i].from && y < STAGES[i].to) return STAGES[i];
    return STAGES[STAGES.length - 1];
  }

  /* 可重現的亂數（mulberry32） */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* 顯微視野裡的移植細胞：位置、纖維（隨機遊走折線）、生病的先後順序。
     座標以視野半徑為 1 的單位圓表示，畫的時候再放大。 */
  function graft(seed, N) {
    var R = rng(seed), cells = [];
    for (var i = 0; i < N; i++) {
      /* 注射道：一條斜斜的細長橢圓 */
      var t = (R() - 0.5) * 1.1, w = (R() - 0.5) * 0.22;
      var ang = -0.9;
      var x = t * Math.cos(ang) - w * Math.sin(ang), y = t * Math.sin(ang) + w * Math.cos(ang);
      var fibers = [], nf = 2 + Math.floor(R() * 3);
      for (var f = 0; f < nf; f++) {
        var dir = R() * Math.PI * 2, px = x, py = y, pts = [[px, py]];
        var steps = 18 + Math.floor(R() * 22);
        for (var s = 0; s < steps; s++) {
          dir += (R() - 0.5) * 0.7;
          px += Math.cos(dir) * 0.035; py += Math.sin(dir) * 0.035;
          pts.push([px, py]);
        }
        fibers.push(pts);
      }
      cells.push({ x: x, y: y, r: 0.018 + R() * 0.012, fibers: fibers, order: R() });
    }
    /* 生病的先後：依 order 排名 */
    var rank = cells.map(function (c, i) { return [c.order, i]; }).sort(function (a, b) { return a[0] - b[0]; });
    rank.forEach(function (p, k) { cells[p[1]].rank = k; });
    return cells;
  }

  var CORE = { YMAX: YMAX, LEWY_PTS: LEWY_PTS, lewy: lewy, growth: growth, signal: signal, benefit: benefit,
    affected: affected, STAGES: STAGES, stageAt: stageAt, graft: graft, smooth: smooth, clamp: clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  else root.LUND = CORE;
})(typeof window !== 'undefined' ? window : globalThis);

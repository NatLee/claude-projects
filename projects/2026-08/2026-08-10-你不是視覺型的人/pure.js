/* ==========================================================================
 * 純函式：測驗計分 ＋ 交互作用圖的座標
 * 這一頁畫面上的每個數字都由這裡算出來，沒有一個是手打進 HTML 的。
 * 同時給 <script src="pure.js"> 與 node（測試）使用。
 * ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
 * 一、假測驗
 * 選項權重是三向度向量 [視覺, 聽覺, 動覺]。每個選項都有一個主要傾向（3 分）
 * 與一個次要傾向（1 分）——網路上的學習風格量表大多就是這樣算的，
 * 所以百分比看起來才會是 61／24／15 這種「有小數感」的數字，而不是整齊的三等分。
 * -------------------------------------------------------------------------- */

var STYLES = [
  { key: 'V', name: '視覺型', en: 'Visual' },
  { key: 'A', name: '聽覺型', en: 'Auditory' },
  { key: 'K', name: '動覺型', en: 'Kinesthetic' }
];

var QUIZ = [
  {
    q: '別人跟你講路怎麼走的時候，你會⋯⋯',
    opts: [
      { t: '在腦中把街道畫出來，記住轉彎長什麼樣子', w: [3, 1, 0] },
      { t: '把他講的那串話重複一遍，記住它的順序', w: [1, 3, 0] },
      { t: '想像自己走過去，用身體記住左轉右轉', w: [0, 1, 3] }
    ]
  },
  {
    q: '上週剛認識的人，你現在最先想起的是⋯⋯',
    opts: [
      { t: '他的臉，還有那天穿的衣服', w: [3, 0, 1] },
      { t: '他的聲音，還有講話的節奏', w: [0, 3, 1] },
      { t: '跟他握手、一起做過什麼事的感覺', w: [1, 0, 3] }
    ]
  },
  {
    q: '要組一個新買的層架，你會⋯⋯',
    opts: [
      { t: '先把說明書上的圖從頭看到尾', w: [3, 1, 1] },
      { t: '找一支有人邊做邊講解的影片', w: [1, 3, 1] },
      { t: '直接把零件倒出來，邊拼邊摸索', w: [1, 1, 3] }
    ]
  },
  {
    q: '課堂上聽到一個沒學過的新概念，你的第一個念頭是⋯⋯',
    opts: [
      { t: '想找一張圖或流程圖來對照', w: [3, 1, 0] },
      { t: '想聽老師換個說法再講一次', w: [0, 3, 1] },
      { t: '想馬上做一題來試試看', w: [1, 0, 3] }
    ]
  },
  {
    q: '要背一串陌生的數字，你會⋯⋯',
    opts: [
      { t: '把它寫下來，記住那串字排起來的樣子', w: [3, 0, 1] },
      { t: '唸出聲，記住它唸起來的聲音', w: [1, 3, 0] },
      { t: '用手指在桌上敲，靠按鍵的動作記', w: [0, 1, 3] }
    ]
  },
  {
    q: '讀小說的時候，你腦中主要浮現的是⋯⋯',
    opts: [
      { t: '一幕一幕的畫面', w: [3, 1, 0] },
      { t: '角色講話的聲音和語氣', w: [1, 3, 1] },
      { t: '主角在做什麼、身體怎麼移動', w: [0, 1, 3] }
    ]
  },
  {
    q: '你最受不了的上課方式是⋯⋯',
    opts: [
      { t: '老師整堂只用講的，黑板上什麼都不寫', w: [3, 1, 1] },
      { t: '投影片一直換，但沒有人解釋在換什麼', w: [1, 3, 0] },
      { t: '兩小時坐著不准動，完全沒有動手的環節', w: [0, 0, 3] }
    ]
  }
];

/* 把作答（選項索引陣列）加總成 [視覺, 聽覺, 動覺] 原始分 */
function scoreQuiz(answers, quiz) {
  var Q = quiz || QUIZ;
  var s = [0, 0, 0];
  for (var i = 0; i < answers.length && i < Q.length; i++) {
    var a = answers[i];
    if (a === null || a === undefined) continue;
    var w = Q[i].opts[a].w;
    s[0] += w[0]; s[1] += w[1]; s[2] += w[2];
  }
  return s;
}

/* 原始分 → 整數百分比，用最大餘數法保證加起來剛好 100 */
function toPercents(s) {
  var total = s[0] + s[1] + s[2];
  if (total <= 0) return [0, 0, 0];
  var raw = [s[0] / total * 100, s[1] / total * 100, s[2] / total * 100];
  var out = [Math.floor(raw[0]), Math.floor(raw[1]), Math.floor(raw[2])];
  var left = 100 - (out[0] + out[1] + out[2]);
  var order = [0, 1, 2].sort(function (a, b) {
    var da = raw[a] - Math.floor(raw[a]);
    var db = raw[b] - Math.floor(raw[b]);
    if (db !== da) return db - da;
    return a - b;
  });
  for (var i = 0; i < left; i++) out[order[i % 3]] += 1;
  return out;
}

/* 主要風格的索引（平手時取排在前面的，跟市面上的量表一樣草率） */
function topStyle(s) {
  var best = 0;
  for (var i = 1; i < 3; i++) if (s[i] > s[best]) best = i;
  return best;
}

/* --------------------------------------------------------------------------
 * 二、交互作用實驗
 * 兩組人（視覺型組／聽覺型組）× 兩種教材（圖像式／口語式），格子裡是後測分數。
 * 陣列順序固定為 [圖像式教材, 口語式教材]。
 *
 * mesh ＝ 如果 meshing 假說成立，資料「應該」長成的樣子（示意值）
 * real ＝ 真實研究反覆得到的樣子：教材有主效果，但沒有交互作用（示意值）
 * -------------------------------------------------------------------------- */

var LAB = {
  mesh: { V: [79, 63], A: [62, 78] },
  real: { V: [73, 69], A: [70, 66] }
};

function labCells(mode) {
  var c = LAB[mode] || LAB.real;
  return { V: [c.V[0], c.V[1]], A: [c.A[0], c.A[1]] };
}

/* 各組「配對教材」比「不配對教材」多拿的分數 */
function matchedGain(cells) {
  return {
    V: cells.V[0] - cells.V[1],   // 視覺型組配到圖像式才算配對
    A: cells.A[1] - cells.A[0]    // 聽覺型組配到口語式才算配對
  };
}

/* Pashler 的判準：至少兩種風格都因為「配對」而變好，才叫交叉交互作用 */
function hasCrossover(cells) {
  var g = matchedGain(cells);
  return g.V > 0 && g.A > 0;
}

/* 可重現的偽亂數（mulberry32），讓「隨機分派」每次不同但測得起來 */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 幫每一格加上抽樣誤差（±amp 分），模擬「這一次剛好抽到這些人」 */
function jitterCells(cells, seed, amp) {
  var rnd = mulberry32(seed);
  var a = (amp === undefined) ? 0.7 : amp;
  var bump = function (v) { return Math.round((v + (rnd() * 2 - 1) * a) * 10) / 10; };
  return {
    V: [bump(cells.V[0]), bump(cells.V[1])],
    A: [bump(cells.A[0]), bump(cells.A[1])]
  };
}

/* 這一輪每組分派到幾個人（36～52，只是為了讓實驗室看起來像在跑） */
function runN(seed) {
  return 36 + Math.floor(mulberry32(seed ^ 0x9E3779B9)() * 17);
}

/* --------------------------------------------------------------------------
 * 三、把分數換成 SVG 座標
 * -------------------------------------------------------------------------- */

var GEOM = { x0: 132, x1: 486, yTop: 44, yBot: 292, vmin: 52, vmax: 86 };

function plotX(i, g) {
  var G = g || GEOM;
  return i === 0 ? G.x0 : G.x1;
}

function plotY(v, g) {
  var G = g || GEOM;
  var t = (v - G.vmin) / (G.vmax - G.vmin);
  t = Math.max(0, Math.min(1, t));
  return G.yBot - t * (G.yBot - G.yTop);
}

/* 一條線（某一組跨兩種教材）的兩個端點 */
function linePoints(pair, g) {
  return [
    { x: plotX(0, g), y: plotY(pair[0], g) },
    { x: plotX(1, g), y: plotY(pair[1], g) }
  ];
}

/* 兩條線段的交點；兩條線 x 範圍相同，所以只要看左右兩端誰在上面就知道有沒有交叉 */
function segIntersect(p1, p2, p3, p4) {
  var d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  var t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  var u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return {
    x: Math.round((p1.x + t * (p2.x - p1.x)) * 100) / 100,
    y: Math.round((p1.y + t * (p2.y - p1.y)) * 100) / 100
  };
}

/* 這一輪要畫的所有東西 */
function plotModel(cells, g) {
  var V = linePoints(cells.V, g);
  var A = linePoints(cells.A, g);
  return {
    V: V,
    A: A,
    cross: segIntersect(V[0], V[1], A[0], A[1]),
    crossover: hasCrossover(cells),
    gain: matchedGain(cells)
  };
}

function pathD(pts) {
  return 'M' + pts[0].x + ' ' + pts[0].y + ' L' + pts[1].x + ' ' + pts[1].y;
}

/* 分數顯示成一位小數 */
function score1(v) {
  return (Math.round(v * 10) / 10).toFixed(1);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STYLES: STYLES, QUIZ: QUIZ, scoreQuiz: scoreQuiz, toPercents: toPercents, topStyle: topStyle,
    LAB: LAB, labCells: labCells, matchedGain: matchedGain, hasCrossover: hasCrossover,
    mulberry32: mulberry32, jitterCells: jitterCells, runN: runN,
    GEOM: GEOM, plotX: plotX, plotY: plotY, linePoints: linePoints,
    segIntersect: segIntersect, plotModel: plotModel, pathD: pathD, score1: score1
  };
}

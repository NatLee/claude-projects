/* ==========================================================================
 * 臉的座標 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 *
 * 中心思想：生成模型不是把圖存起來，而是學會一個「座標系」。
 * 這裡的臉住在一個 8 維空間裡：一張臉 = 8 個 0~1 的數字。
 * 任何一點都是一張合理的臉；兩張臉之間的每一點，也都是。
 * ========================================================================== */
'use strict';

var DIMS = [
  { key: 'width',  label: '臉型',   lo: '瘦長', hi: '圓潤' },
  { key: 'eyes',   label: '眼睛',   lo: '瞇瞇', hi: '圓亮' },
  { key: 'space',  label: '眼距',   lo: '靠近', hi: '分開' },
  { key: 'brow',   label: '眉毛',   lo: '下垂', hi: '上挑' },
  { key: 'mouth',  label: '嘴角',   lo: '下撇', hi: '上揚' },
  { key: 'hair',   label: '頭髮',   lo: '服貼', hi: '蓬鬆' },
  { key: 'hue',    label: '髮色',   lo: '深',   hi: '淺' },
  { key: 'skin',   label: '膚色',   lo: '深',   hi: '淺' }
];

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

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* 一個 0~1 向量，長度 = DIMS.length */
function randomVec(seed) {
  var rng = makeRng(seed);
  var v = [];
  for (var i = 0; i < DIMS.length; i++) v.push(Math.round(rng() * 100) / 100);
  return v;
}

/* 線性內插：t=0 → a、t=1 → b，逐維 */
function lerpVec(a, b, t) {
  t = clamp01(t);
  var out = [];
  for (var i = 0; i < a.length; i++) out.push(a[i] + (b[i] - a[i]) * t);
  return out;
}

/* 平均臉 */
function meanVec(vecs) {
  var out = new Array(DIMS.length).fill(0);
  vecs.forEach(function (v) { for (var i = 0; i < v.length; i++) out[i] += v[i]; });
  return out.map(function (s) { return s / vecs.length; });
}

/* 兩點距離（歐氏） */
function dist(a, b) {
  var s = 0;
  for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
  return Math.sqrt(s);
}

/* 顯示用座標字串，例如 [0.42, 0.90, …] */
function coordLabel(v) {
  return '[' + v.map(function (x) { return clamp01(x).toFixed(2); }).join(', ') + ']';
}

/* ---------- 向量 → 具體五官幾何（給 SVG 用的純數值） ----------
 * 全部輸出都被夾在合理範圍內：空間裡的任何一點都是一張「說得過去」的臉。 */
function faceParams(v) {
  var w = clamp01(v[0]), ey = clamp01(v[1]), sp = clamp01(v[2]), br = clamp01(v[3]);
  var mo = clamp01(v[4]), ha = clamp01(v[5]), hu = clamp01(v[6]), sk = clamp01(v[7]);
  /* 膚色與髮色（HSL 數值，不含字串，方便測試） */
  var skinL = 52 + sk * 34;                 /* 52~86 */
  var hairL = 16 + hu * 48;                 /* 16~64 */
  var hairH = 18 + hu * 14;
  return {
    faceRx: 56 + w * 26,                    /* 臉橫半徑 56~82 */
    faceRy: 88 - w * 12,                    /* 臉縱半徑 76~88 */
    eyeR: 4.5 + ey * 6.5,                   /* 眼睛半徑 4.5~11 */
    eyeDx: 24 + sp * 18,                    /* 眼睛離中線 24~42 */
    eyeY: -8,
    browTilt: -8 + br * 16,                 /* 眉毛角度 -8~+8 度 */
    browY: -26 - ey * 4,
    mouthCurve: -14 + mo * 28,              /* 嘴角弧度 -14~+14 */
    mouthW: 30 + w * 8,
    mouthY: 38,
    hairPuff: 6 + ha * 26,                  /* 頭髮蓬度 6~32 */
    hairH: hairH, hairS: 45, hairL: hairL,
    skinH: 28, skinS: 45, skinL: skinL,
    noseLen: 16 + (1 - ey) * 4
  };
}

/* 檢查一組參數是否在「說得過去」的範圍內 */
function paramsSane(p) {
  return p.faceRx >= 50 && p.faceRx <= 90 &&
         p.faceRy >= 70 && p.faceRy <= 95 &&
         p.eyeR >= 3 && p.eyeR <= 13 &&
         p.eyeDx >= 20 && p.eyeDx <= 46 &&
         p.eyeDx + p.eyeR < p.faceRx + 6 &&
         p.mouthW < p.faceRx &&
         p.skinL >= 40 && p.skinL <= 92 &&
         p.hairL >= 10 && p.hairL <= 70;
}

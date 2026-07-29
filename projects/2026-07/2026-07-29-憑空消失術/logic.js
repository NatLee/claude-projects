/* ==========================================================================
 * 憑空消失術 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 *
 * inpainting（內容感知填補）的骨架：
 *   1. 使用者圈出「要消失的東西」
 *   2. 演算法從周圍找最像的補丁，把洞一塊一塊補起來
 * 這一頁的照片是程式畫的，所以「補背景」= 重畫一次沒有那個東西的背景。
 * 真實演算法（PatchMatch）怎麼運作、差在哪，見 說明.md。
 * ========================================================================== */
'use strict';

var W = 340, H = 210;                /* 照片內部解析度 */

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

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ---------- 場景規格：一切由種子決定 ---------- */
function sceneSpec(seed) {
  var rng = makeRng(seed);
  /* 雲：三朵，彼此隔開 */
  var clouds = [];
  var cx0 = 20 + rng() * 30;
  for (var i = 0; i < 3; i++) {
    clouds.push({ x: cx0, y: 22 + rng() * 26, s: 0.8 + rng() * 0.5 });
    cx0 += 90 + rng() * 30;
  }
  var wireY = 88 + rng() * 8;              /* 電線高度 */
  /* 鳥：三隻站在電線上，間距至少 46 */
  var birds = [];
  var bx = 52 + rng() * 24;
  for (var b = 0; b < 3; b++) {
    birds.push({ x: bx });
    bx += 52 + rng() * 26;
  }
  var personX = 52 + rng() * 60;           /* 遊客站草地左半 */
  var signX = 215 + rng() * 70;            /* 告示牌在右半 */
  return {
    sunX: 262 + rng() * 40, sunY: 30 + rng() * 12,
    clouds: clouds,
    hillH: 30 + rng() * 12,
    grassY: 128 + rng() * 8,               /* 草地起點 */
    wireY: wireY,
    birds: birds,
    personX: personX,
    signX: signX
  };
}

/* 鳥站的那條電線（下垂的二次貝茲）在 x 處的高度；繪製端用同一條式子 */
function wireAt(spec, x) {
  var t = (x - 18) / (W - 19 - 18);
  var y0 = spec.wireY - 14, cyy = spec.wireY + 14, y1 = spec.wireY - 16;
  var u = 1 - t;
  return u * u * y0 + 2 * u * t * cyy + t * t * y1;
}

/* ---------- 可移除物件與其外框（與繪製座標一致：
 * 遊客站在 grassY+40、告示牌立在 grassY+34） ---------- */
function objectsOf(spec) {
  var pg = spec.grassY + 40, sg = spec.grassY + 34;
  var list = [
    { id: 'person', label: '那位遊客',
      box: { x: spec.personX - 13, y: pg - 57, w: 26, h: 58 } },
    { id: 'sign', label: '那塊告示牌',
      box: { x: spec.signX - 21, y: sg - 39, w: 42, h: 40 } }
  ];
  spec.birds.forEach(function (b, i) {
    var wy = wireAt(spec, b.x);
    list.push({ id: 'bird' + i, label: '第 ' + (i + 1) + ' 隻鳥',
      box: { x: b.x - 13, y: wy - 16, w: 27, h: 18 } });
  });
  return list;
}

/* 點擊命中：從最上層（陣列後面）往回找，跳過已移除的 */
function hitObject(objects, removed, x, y) {
  for (var i = objects.length - 1; i >= 0; i--) {
    var o = objects[i];
    if (removed.indexOf(o.id) >= 0) continue;
    var b = o.box;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return o;
  }
  return null;
}

/* 遮罩＝外框加 padding、夾在照片內 */
function padMask(box, pad) {
  var x0 = clamp(box.x - pad, 0, W), y0 = clamp(box.y - pad, 0, H);
  var x1 = clamp(box.x + box.w + pad, 0, W), y1 = clamp(box.y + box.h + pad, 0, H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* 填補動畫進度 → 目前應顯示的欄寬（由左往右長回來） */
function wipeWidth(mask, t) {
  t = clamp(t, 0, 1);
  return Math.round(mask.w * t);
}

/* 物件之間不能重疊（場景生成的健全性；鳥與電線除外——鳥本來就站在線上） */
function boxesOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/* 移除進度的旁白 */
function captionFor(removedCount, total, lastId) {
  if (removedCount === 0) return '點照片裡的任何一個東西。';
  if (removedCount >= total) return '好了。這張照片現在什麼都沒發生過。';
  if (lastId === 'person') return '她從來沒去過那裡。至少照片現在是這麼說的。';
  if (lastId === 'sign') return '連告示牌都沒立過。';
  return '天空順手把牠的位置補上了。還有 ' + (total - removedCount) + ' 個。';
}

/* ==========================================================================
 * 六變成八 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 * 模擬 JBIG2 的「符號比對與替換」（Pattern Matching & Substitution）：
 * 把一頁上長得像的墨點群組起來，每一群只存一個代表，其餘全部指過去。
 * 若「長得像」的判準太寬鬆，代表就會蓋掉不該蓋的字。
 * ========================================================================== */
'use strict';

/* ---------- 種子亂數：mulberry32（同種子必得同結果） ---------- */
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

function shuffle(arr, rng) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ---------- 比對寬鬆度 → 哪些字形被判定成「同一個符號」 ----------
 * at：滑桿門檻；member 被 rep 蓋掉。
 * 排序刻意由「最容易混淆」到「最不容易」：6/8 的差別只在左上角那一道缺口。 */
var MERGE_STEPS = [
  { at: 22, member: '6', rep: '8', why: '差別只在左上角那一道缺口' },
  { at: 44, member: '3', rep: '8', why: '把左半邊補起來就是 8' },
  { at: 66, member: '5', rep: '6', why: '下半身一樣圓' },
  { at: 84, member: '1', rep: '7', why: '一樣是一豎' }
];

function mergesAt(t) {
  var out = [];
  for (var i = 0; i < MERGE_STEPS.length; i++) {
    if (t >= MERGE_STEPS[i].at) out.push(MERGE_STEPS[i]);
  }
  return out;
}

/* 解開連鎖：5→6 且 6→8，則 5 最終被 8 蓋掉 */
function symbolMap(t) {
  var raw = Object.create(null);
  mergesAt(t).forEach(function (s) { raw[s.member] = s.rep; });
  var out = Object.create(null);
  Object.keys(raw).forEach(function (k) {
    var v = raw[k], guard = 0;
    while (raw[v] && guard++ < 10) v = raw[v];
    out[k] = v;
  });
  return out;
}

/* 壓縮後相對大小（%）：群組併得越多，字典越小、檔案越小 */
function sizeAt(t) {
  return 58 - mergesAt(t).length * 5;
}

/* ---------- 替換：不是整批換掉，而是零星幾個 ----------
 * 真實案例裡，一頁上大多數的 6 是好的，只有幾個被換成 8——
 * 這正是它難被發現的原因。 */
function substitute(digits, map, rng, rate) {
  var out = digits.slice();
  var swaps = [];
  for (var i = 0; i < digits.length; i++) {
    var d = digits[i];
    var rep = map[d];
    if (rep && rep !== d && rng() < rate) {
      out[i] = rep;
      swaps.push({ i: i, from: d, to: rep });
    }
  }
  return { out: out, swaps: swaps };
}

/* ---------- 產生一頁數字（看起來像成本表） ---------- */
function makePage(seed, rows, cols) {
  var rng = makeRng(seed);
  var page = [];
  for (var r = 0; r < rows; r++) {
    var row = [];
    for (var c = 0; c < cols; c++) {
      var s = '';
      for (var k = 0; k < 4; k++) s += String(Math.floor(rng() * 10));
      row.push(s);
    }
    page.push(row);
  }
  return page;
}

/* ---------- 那張平面圖 ---------- */
var PLAN_TRUE = [
  { key: 'living', name: '客廳', area: '32.60' },
  { key: 'bed', name: '臥室', area: '14.13' },
  { key: 'store', name: '儲藏室', area: '17.42' }
];

/* 隨機把 1～2 間房的數字換成別間的數字（整塊像素搬過來） */
function manglePlan(rng) {
  var out = PLAN_TRUE.map(function (r) {
    return { key: r.key, name: r.name, area: r.area, bad: false, from: null };
  });
  var order = shuffle([0, 1, 2], rng);
  var n = 1 + Math.floor(rng() * 2);
  for (var k = 0; k < n; k++) {
    var i = order[k];
    var others = [0, 1, 2].filter(function (j) { return j !== i; });
    var src = others[Math.floor(rng() * others.length)];
    out[i].area = PLAN_TRUE[src].area;
    out[i].bad = true;
    out[i].from = PLAN_TRUE[src].name;
  }
  return out;
}

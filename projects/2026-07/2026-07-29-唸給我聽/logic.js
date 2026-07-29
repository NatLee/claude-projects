/* ==========================================================================
 * 唸給我聽 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 *
 * 一台 1976 年的閱讀機要做三件事：
 *   1. 把紙上的墨拍成黑白點陣（threshold）
 *   2. 把點陣切成一個一個字元、去掉四周的空白（trim）
 *   3. 認出字元、串成句子，交給合成器唸出來
 * 這裡放的是不需要瀏覽器的那部分。
 * ========================================================================== */
'use strict';

/* ---------- 二值化：灰階資料 → 0/1 點陣 ----------
 * data 為 RGBA 位元組陣列（與 canvas getImageData 相同格式），
 * 只看 alpha：畫上去的字才有 alpha，背景是 0。 */
function thresholdGrid(data, w, h, cutoff) {
  var cut = cutoff == null ? 110 : cutoff;
  var g = [];
  for (var y = 0; y < h; y++) {
    var row = [];
    for (var x = 0; x < w; x++) {
      row.push(data[(y * w + x) * 4 + 3] >= cut ? 1 : 0);
    }
    g.push(row);
  }
  return g;
}

/* ---------- 裁掉四周全白的行列，字元才會置中 ---------- */
function trimGrid(g) {
  var h = g.length, w = h ? g[0].length : 0;
  var top = -1, bottom = -1, left = -1, right = -1, x, y;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      if (!g[y][x]) continue;
      if (top < 0) top = y;
      bottom = y;
      if (left < 0 || x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (top < 0) return { grid: [], w: 0, h: 0, empty: true };
  var out = [];
  for (y = top; y <= bottom; y++) {
    out.push(g[y].slice(left, right + 1));
  }
  return { grid: out, w: right - left + 1, h: bottom - top + 1, empty: false };
}

/* ---------- 把裁好的字元放進固定大小的框，置中 ---------- */
function fitGrid(t, W, H) {
  var out = [], y, x;
  for (y = 0; y < H; y++) out.push(new Array(W).fill(0));
  if (t.empty) return out;
  var scale = Math.min(W / t.w, H / t.h, 1);
  var nw = Math.max(1, Math.round(t.w * scale));
  var nh = Math.max(1, Math.round(t.h * scale));
  var ox = Math.floor((W - nw) / 2), oy = Math.floor((H - nh) / 2);
  for (y = 0; y < nh; y++) {
    var sy = Math.min(t.h - 1, Math.floor(y / scale));
    for (x = 0; x < nw; x++) {
      var sx = Math.min(t.w - 1, Math.floor(x / scale));
      if (t.grid[sy][sx]) out[oy + y][ox + x] = 1;
    }
  }
  return out;
}

/* ---------- 把一行字切成掃描步驟；空白也要走過去，節奏才對 ---------- */
function tokenize(line) {
  var out = [];
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    out.push({ i: i, ch: ch, space: /\s/.test(ch) });
  }
  return out;
}

/* ---------- 交給合成器之前的整理 ---------- */
function speakable(line) {
  return String(line == null ? '' : line)
    .replace(/\s+/g, ' ')
    .trim();
}

/* 進度百分比（0~1），用來推掃描光帶 */
function progress(step, total) {
  if (total <= 0) return 1;
  var p = step / total;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/* ---------- 兩段被唸出來的句子 ---------- */
var LINES = [
  {
    text: 'It was the best of times, it was the worst of times.',
    note: '《雙城記》開頭，1859 年',
    label: '隨手翻到的一頁'
  },
  {
    text: "And that's the way it was, January 13, 1976.",
    note: 'Walter Cronkite 的結語，那一晚由機器唸出',
    label: '那天記者會上的那一句'
  }
];

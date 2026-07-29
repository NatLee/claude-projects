/* ==========================================================================
 * 同一把雜訊 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 *
 * 擴散模型生圖的骨架：
 *   1. 從一片純雜訊開始（種子決定這片雜訊長什麼樣）
 *   2. 一步一步「去噪」，每一步都往提示詞描述的方向修一點
 *   3. 同一片雜訊、不同提示詞 → 完全不同的圖
 *      同一句提示詞、不同雜訊 → 同一題材、不同的一張
 * 這裡的「去噪」是視覺模擬（依時間表混合雜訊與目標圖），不是真的神經網路；
 * 但「雜訊當種子、提示詞當方向」的結構與真擴散一致。細節見 說明.md。
 * ========================================================================== */
'use strict';

var N = 84;                       /* 畫布邊長（像素格） */

/* ---------- 種子亂數 ---------- */
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
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

/* ---------- 雜訊場：RGB 各自亂，長度 N*N*3 ---------- */
function noiseField(seed) {
  var rng = makeRng(seed);
  var out = new Array(N * N * 3);
  for (var i = 0; i < out.length; i++) out[i] = Math.floor(rng() * 256);
  return out;
}

/* ---------- 去噪時間表：cosine，0 → 1、單調、頭尾精確 ---------- */
function schedule(t) {
  t = clamp01(t);
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/* ---------- 一步的畫面：目標與雜訊依 alpha 混合，殘餘雜訊隨步伐衰減 ---------- */
function mixFrame(noise, target, t, flickerSeed) {
  var a = schedule(t);
  var res = (1 - a) * 46;                     /* 殘餘閃爍幅度 */
  var rng = makeRng((flickerSeed >>> 0) + 1);
  var out = new Array(noise.length);
  for (var i = 0; i < noise.length; i++) {
    var v = a * target[i] + (1 - a) * noise[i] + (rng() - 0.5) * res;
    out[i] = clamp255(Math.round(v));
  }
  return out;
}

/* ---------- 小工具：值雜訊（平滑山稜用） ---------- */
function valueNoise1D(rng, n, octaves) {
  var base = [], i;
  for (i = 0; i < 9; i++) base.push(rng());
  var out = [];
  for (i = 0; i < n; i++) {
    var v = 0, amp = 1, freq = 1, tot = 0;
    for (var o = 0; o < octaves; o++) {
      var x = (i / n) * 8 * freq;
      var i0 = Math.floor(x) % 8, f = x - Math.floor(x);
      var s = f * f * (3 - 2 * f);
      v += ((1 - s) * base[(i0 + o) % 9] + s * base[(i0 + o + 1) % 9]) * amp;
      tot += amp; amp *= 0.5; freq *= 2;
    }
    out.push(v / tot);
  }
  return out;
}

/* ---------- 場景一：山與落日 ---------- */
function sceneMountain(seed) {
  var rng = makeRng(seed ^ 0x5151);
  var img = new Array(N * N * 3);
  var sunX = 0.28 + rng() * 0.44, sunY = 0.30 + rng() * 0.18, sunR = 0.07 + rng() * 0.05;
  var ridge1 = valueNoise1D(rng, N, 3), ridge2 = valueNoise1D(rng, N, 3);
  var h1 = 0.52 + rng() * 0.10, h2 = 0.68 + rng() * 0.10;
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      var u = x / N, v = y / N, r, g, b;
      /* 天空漸層 */
      r = 250 - v * 130; g = 150 - v * 60; b = 110 + v * 20;
      /* 太陽 */
      var d = Math.sqrt((u - sunX) * (u - sunX) + (v - sunY) * (v - sunY));
      if (d < sunR) { r = 255; g = 226; b = 168; }
      else if (d < sunR * 1.6) { var f = (d - sunR) / (sunR * 0.6); r = r * f + 255 * (1 - f); g = g * f + 210 * (1 - f); b = b * f + 150 * (1 - f); }
      /* 遠山 */
      var m1 = h1 - ridge1[x] * 0.16;
      if (v > m1) { r = 122 - (v - m1) * 60; g = 78 - (v - m1) * 30; b = 108; }
      /* 近山 */
      var m2 = h2 - ridge2[x] * 0.20;
      if (v > m2) { r = 54 - (v - m2) * 40; g = 38 - (v - m2) * 20; b = 66 - (v - m2) * 30; }
      var i = (y * N + x) * 3;
      img[i] = clamp255(Math.round(r)); img[i + 1] = clamp255(Math.round(g)); img[i + 2] = clamp255(Math.round(b));
    }
  }
  return img;
}

/* ---------- 場景二：夜晚的城市 ---------- */
function sceneCity(seed) {
  var rng = makeRng(seed ^ 0xC171);
  var img = new Array(N * N * 3);
  var moonX = 0.18 + rng() * 0.62, moonY = 0.14 + rng() * 0.12;
  /* 建築物：寬、高、窗點亮率 */
  var bs = [], x0 = 0;
  while (x0 < N) {
    var w = 6 + Math.floor(rng() * 9);
    bs.push({ x0: x0, x1: Math.min(N, x0 + w), top: 0.34 + rng() * 0.38, lit: 0.25 + rng() * 0.45, ph: Math.floor(rng() * 7) });
    x0 += w + 1;
  }
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      var u = x / N, v = y / N;
      var r = 12 + v * 14, g = 14 + v * 16, b = 34 + v * 26;   /* 夜空 */
      var d = Math.sqrt((u - moonX) * (u - moonX) + (v - moonY) * (v - moonY));
      if (d < 0.045) { r = 236; g = 236; b = 214; }
      else if (d < 0.075) { var f = (d - 0.045) / 0.03; r = r * f + 190 * (1 - f); g = g * f + 190 * (1 - f); b = b * f + 176 * (1 - f); }
      for (var k = 0; k < bs.length; k++) {
        var bd = bs[k];
        if (x >= bd.x0 && x < bd.x1 && v > bd.top) {
          r = 22; g = 24; b = 34;
          /* 窗：3×3 週期，用確定性雜湊決定亮不亮 */
          if ((x - bd.x0) % 3 === 1 && (y % 4) === 1) {
            var hsh = ((x * 73856093) ^ (y * 19349663) ^ (seed | 0) ^ (bd.ph * 83492791)) >>> 0;
            if ((hsh % 1000) / 1000 < bd.lit) { r = 255; g = 214; b = 120; }
          }
          break;
        }
      }
      var i = (y * N + x) * 3;
      img[i] = clamp255(Math.round(r)); img[i + 1] = clamp255(Math.round(g)); img[i + 2] = clamp255(Math.round(b));
    }
  }
  return img;
}

/* ---------- 場景三：一隻貓 ---------- */
function sceneCat(seed) {
  var rng = makeRng(seed ^ 0xCA7);
  var img = new Array(N * N * 3);
  var cx = 0.5 + (rng() - 0.5) * 0.14, cy = 0.56 + (rng() - 0.5) * 0.08;
  var R = 0.26 + rng() * 0.05;
  var earT = 0.16 + rng() * 0.06;                      /* 耳朵高度 */
  var furR = 236 - rng() * 120, furG = 150 + rng() * 60, furB = 92 + rng() * 60;
  var eyeHue = rng();                                   /* 0 綠 ~ 1 藍 */
  var tilt = (rng() - 0.5) * 0.10;                      /* 眼睛高低 */
  var bgR = 224 + rng() * 24, bgG = 204 + rng() * 30, bgB = 176 + rng() * 40;
  function inEar(u, v, side) {
    var ex = cx + side * R * 0.62, ey = cy - R * 0.78;
    var w = R * 0.42, h = R * 0.9 + earT;
    var du = (u - ex) / w, dv = (v - ey) / h;
    return dv < 0 && Math.abs(du) < (1 + dv) && dv > -1;
  }
  for (var y = 0; y < N; y++) {
    for (var x = 0; x < N; x++) {
      var u = x / N, v = y / N;
      var r = bgR - v * 26, g = bgG - v * 26, b = bgB - v * 20;
      var du = (u - cx) / R, dv = (v - cy) / (R * 0.92);
      var inHead = du * du + dv * dv < 1;
      if (inHead || inEar(u, v, -1) || inEar(u, v, 1)) {
        r = furR; g = furG; b = furB;
        /* 條紋 */
        if (Math.sin((u * 9 + v * 3) * Math.PI) > 0.72) { r *= 0.82; g *= 0.82; b *= 0.82; }
      }
      if (inHead) {
        /* 眼睛 */
        for (var s = -1; s <= 1; s += 2) {
          var ex = cx + s * R * 0.42, ey = cy - R * 0.10 + s * tilt * R;
          var dd = Math.sqrt((u - ex) * (u - ex) + (v - ey) * (v - ey));
          if (dd < R * 0.13) { r = 40 + (1 - eyeHue) * 60; g = 150 + (1 - eyeHue) * 60; b = 90 + eyeHue * 140; }
          if (dd < R * 0.055) { r = 18; g = 18; b = 20; }
        }
        /* 鼻子與嘴 */
        var nd = Math.abs(u - cx) * 1.6 + Math.abs(v - (cy + R * 0.28));
        if (nd < R * 0.09) { r = 214; g = 110; b = 116; }
        if (Math.abs(v - (cy + R * 0.46)) < 0.008 && Math.abs(u - cx) < R * 0.30) { r *= 0.55; g *= 0.55; b *= 0.55; }
      }
      var i = (y * N + x) * 3;
      img[i] = clamp255(Math.round(r)); img[i + 1] = clamp255(Math.round(g)); img[i + 2] = clamp255(Math.round(b));
    }
  }
  return img;
}

var PROMPTS = [
  { key: 'mountain', label: '山與落日', fn: sceneMountain },
  { key: 'city', label: '夜晚的城市', fn: sceneCity },
  { key: 'cat', label: '一隻貓', fn: sceneCat }
];

function sceneFor(key, seed) {
  for (var i = 0; i < PROMPTS.length; i++) {
    if (PROMPTS[i].key === key) return PROMPTS[i].fn(seed);
  }
  return null;
}

/* 兩張圖的平均絕對差（0~255），用來驗證「不同」 */
function meanAbsDiff(a, b) {
  var s = 0;
  for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

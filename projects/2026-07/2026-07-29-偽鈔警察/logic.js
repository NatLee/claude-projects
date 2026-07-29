/* ==========================================================================
 * 偽鈔警察 —— 純邏輯（無 DOM），瀏覽器與 node 兩邊都能跑
 *
 * GAN 的核心是一場對局：
 *   生成器（印刷工）想騙過鑑別器（你），
 *   鑑別器每退一張假鈔，生成器就照著退件的方向修一次版。
 * 這裡的「鈔票」是一組風格參數；假鈔每回合朝真鈔的參數逼近，
 * 抖動幅度也逐回合縮小——最後一回合，理論上只剩擲硬幣。
 * ========================================================================== */
'use strict';

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

/* ---------- 鈔票的「風格向量」 ----------
 * 六個 0~1 參數，畫鈔票時各自對應一個看得見的特徵 */
var STYLE_KEYS = ['hue', 'waves', 'ink', 'seal', 'serif', 'border'];
var STYLE_LABELS = {
  hue: '紙色',
  waves: '底紋密度',
  ink: '墨色深淺',
  seal: '印章位置',
  serif: '字體',
  border: '邊框花樣'
};

/* 真鈔的標準版 */
var REAL = { hue: 0.58, waves: 0.62, ink: 0.70, seal: 0.74, serif: 0.65, border: 0.55 };

/* 印刷工第一版的起點：處處都差一大截 */
var START = { hue: 0.05, waves: 0.12, ink: 0.20, seal: 0.15, serif: 0.10, border: 0.05 };

var ROUNDS = 7;

/* 回合 r（0-based）的學習進度：前快後慢，最後一回合幾乎貼死 */
function learnT(r, rounds) {
  var n = (rounds || ROUNDS) - 1;
  if (n <= 0) return 1;
  var t = clamp01(r / n);
  return 1 - Math.pow(1 - t, 1.8);
}

/* 回合 r 的假鈔參數：朝 REAL 內插＋逐回合縮小的抖動 */
function fakeStyle(r, seed, rounds) {
  var t = learnT(r, rounds);
  var rng = makeRng(((seed >>> 0) * 37 + r * 101) >>> 0);
  var amp = (1 - t) * 0.16;
  var out = {};
  STYLE_KEYS.forEach(function (k) {
    var v = START[k] + (REAL[k] - START[k]) * t + (rng() - 0.5) * 2 * amp;
    out[k] = clamp01(v);
  });
  return out;
}

/* 與真鈔的平均距離（0~1） */
function styleDist(s) {
  var d = 0;
  STYLE_KEYS.forEach(function (k) { d += Math.abs(s[k] - REAL[k]); });
  return d / STYLE_KEYS.length;
}

/* 這回合最可疑的特徵（距離最大的那一個），給提示用 */
function worstFeature(s) {
  var worst = null, wd = -1;
  STYLE_KEYS.forEach(function (k) {
    var d = Math.abs(s[k] - REAL[k]);
    if (d > wd) { wd = d; worst = k; }
  });
  return { key: worst, label: STYLE_LABELS[worst], dist: wd };
}

/* 假鈔在左還是右（確定性，但看起來隨機；七回合中兩邊都會出現） */
function fakeOnLeft(r, seed) {
  var rng = makeRng(((seed >>> 0) * 131 + r * 17) >>> 0);
  rng(); /* 燒掉一個，去掉低位偏差 */
  return rng() < 0.5;
}

/* 判定結果的一句話評語 */
function verdictText(correct, r, rounds) {
  var t = learnT(r, rounds || ROUNDS);
  if (correct) {
    if (t < 0.45) return '一眼就看穿了。這種等級的假鈔，路邊攤都收不下去。';
    if (t < 0.8) return '抓到了——但你有沒有發現，你這次多看了幾秒？';
    if (t < 0.97) return '抓到了。不過老實說：有一半是猜的吧。';
    return '你答對了——但這一回合，你其實只是猜贏了一枚硬幣。';
  }
  if (t < 0.45) return '這都能看走眼？回去重修。（開玩笑的，再看一次差在哪。)';
  if (t < 0.8) return '被騙過去了。它把上次被你退件的地方修掉了。';
  return '被騙過去了——而且從數據上看，這已經不是你的錯了。';
}

/* 整場的總結：答對率與「後半場答對率」 */
function summarize(records) {
  var n = records.length, right = 0, lateRight = 0, late = 0;
  records.forEach(function (rec, i) {
    if (rec) right++;
    if (i >= Math.floor(n / 2)) { late++; if (rec) lateRight++; }
  });
  return {
    total: n, right: right,
    acc: n ? right / n : 0,
    lateAcc: late ? lateRight / late : 0
  };
}

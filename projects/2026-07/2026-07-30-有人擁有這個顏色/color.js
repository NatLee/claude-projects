/*!
 * 有人擁有這個顏色 · color.js
 * ---------------------------------------------------------------
 * 純函式工具箱：色碼解析、WCAG 相對亮度／對比度、文字色挑選、計分。
 * 沒有任何 DOM 依賴，瀏覽器用 <script src="color.js"> 一般載入，
 * node 也可以 require()（不是 ES module）。
 */

/* ---------- 色碼 ---------- */

/**
 * 把色碼字串轉成 {r,g,b}（0–255）。
 * 接受 3 碼與 6 碼、帶不帶 '#'、大小寫皆可：'#fff'、'fff'、'#FFFFFF'、'ffffff'。
 */
function hexToRgb(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('hexToRgb：需要字串色碼，收到 ' + typeof hex);
  }
  var s = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) {
    throw new Error('hexToRgb：不是合法的色碼「' + hex + '」');
  }
  var n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 把 {r,g,b} 轉回小寫 6 碼色碼。 */
function rgbToHex(rgb) {
  var c = _asRgb(rgb);
  function two(v) {
    var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
    return s.length === 1 ? '0' + s : s;
  }
  return '#' + two(c.r) + two(c.g) + two(c.b);
}

/** 內部：把 hex 字串／陣列／物件統一成 {r,g,b}。 */
function _asRgb(input) {
  if (typeof input === 'string') return hexToRgb(input);
  if (Object.prototype.toString.call(input) === '[object Array]') {
    return { r: input[0], g: input[1], b: input[2] };
  }
  if (input && typeof input.r === 'number' && typeof input.g === 'number' && typeof input.b === 'number') {
    return input;
  }
  throw new TypeError('需要色碼字串、[r,g,b] 或 {r,g,b}');
}

/* ---------- WCAG 對比度 ---------- */

/** 單一通道的線性化（WCAG 2.x 公式）。 */
function _linear(v) {
  var c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 相對亮度 L = 0.2126R + 0.7152G + 0.0722B（線性化後）。
 * 接受 {r,g,b}、[r,g,b] 或色碼字串。
 */
function relativeLuminance(rgb) {
  var c = _asRgb(rgb);
  return 0.2126 * _linear(c.r) + 0.7152 * _linear(c.g) + 0.0722 * _linear(c.b);
}

/**
 * 兩色的對比度 (L1+0.05)/(L2+0.05)，範圍 1–21，對稱。
 * 取到小數第 4 位，避免浮點誤差讓黑白對比變成 21.000000000000004。
 */
function contrastRatio(a, b) {
  var la = relativeLuminance(a);
  var lb = relativeLuminance(b);
  var hi = la > lb ? la : lb;
  var lo = la > lb ? lb : la;
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10000) / 10000;
}

/**
 * 在純黑與純白之間，挑一個和背景色對比度較高的當文字色。
 * 回傳 '#000000' 或 '#ffffff'。
 */
function pickTextColor(bgHex) {
  var onWhite = contrastRatio(bgHex, '#ffffff');
  var onBlack = contrastRatio(bgHex, '#000000');
  return onWhite > onBlack ? '#ffffff' : '#000000';
}

/**
 * 是否通過 WCAG AA：正文 4.5:1，大字（>=18.66px 粗體或 24px）3:1。
 */
function passesAA(bgHex, fgHex, isLargeText) {
  return contrastRatio(bgHex, fgHex) >= (isLargeText ? 3 : 4.5);
}

/** 把色碼轉成 rgba() 字串，給半透明底用。 */
function withAlpha(hex, alpha) {
  var c = hexToRgb(hex);
  var a = typeof alpha === 'number' ? Math.max(0, Math.min(1, alpha)) : 1;
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
}

/* ---------- 計分 ---------- */

/**
 * 計算「你來當審查官」的分數。
 * @param {Array} answers 使用者的作答，每格 'yes' / 'no' / null（未作答）
 * @param {Array} truth   正解，每格 'yes' / 'no' / 'half'
 *   - 'half'（一半一半，例如 Louboutin）：有作答就給 0.5 分，怎麼答都算半對。
 * @returns {{score:number,total:number,full:number,detail:Array}}
 */
function scoreAnswers(answers, truth) {
  if (Object.prototype.toString.call(answers) !== '[object Array]' ||
      Object.prototype.toString.call(truth) !== '[object Array]') {
    throw new TypeError('scoreAnswers：需要兩個陣列');
  }
  var total = truth.length;
  var score = 0;
  var full = 0;
  var detail = [];
  for (var i = 0; i < total; i++) {
    var a = (answers[i] === null || answers[i] === undefined || answers[i] === '') ? null : String(answers[i]);
    var t = String(truth[i]);
    var credit = 0;
    if (t === 'half') {
      credit = a ? 0.5 : 0;
    } else if (a !== null && a === t) {
      credit = 1;
    }
    if (credit === 1) full++;
    score += credit;
    detail.push({ index: i, answer: a, truth: t, credit: credit, correct: credit === 1 });
  }
  return { score: Math.round(score * 100) / 100, total: total, full: full, detail: detail };
}

/** 把分數格式化成字串：5 → '5'，5.5 → '5.5'。 */
function formatScore(n) {
  var v = Math.round(n * 10) / 10;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hexToRgb: hexToRgb,
    rgbToHex: rgbToHex,
    relativeLuminance: relativeLuminance,
    contrastRatio: contrastRatio,
    pickTextColor: pickTextColor,
    passesAA: passesAA,
    withAlpha: withAlpha,
    scoreAnswers: scoreAnswers,
    formatScore: formatScore
  };
}

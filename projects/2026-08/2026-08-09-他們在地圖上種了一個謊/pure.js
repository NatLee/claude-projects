/* ==========================================================================
 * 純函式（給頁面用，也給 node 斷言用）
 * 沒有 DOM、沒有副作用；同樣的輸入永遠給同樣的輸出。
 * ========================================================================== */
'use strict';

/* FNV-1a 32-bit：對任意 Unicode 字串穩定，且分佈夠散 */
function hashStr(s) {
  const str = String(s == null ? '' : s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((c >> 8) & 0xff), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const AGLOE_VOWELS = 'AEIOU';
const AGLOE_CONSON = 'BCDFGHJKLMNPRSTVW';

/* 由任意輸入鑄一個假地名：大寫、4–5 個字母、唸得出來、確定性 */
function coinName(input) {
  const raw = String(input == null ? '' : input).trim();
  let letters = (raw.toUpperCase().match(/[A-Z]/g) || []).slice(0, 5);
  let x = hashStr(raw || 'AGLOE');
  const next = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x; };
  next(); /* 先攪一次，避免短輸入的低位元太規律 */
  while (letters.length < 4) {
    const pool = letters.length % 2 === 0 ? AGLOE_CONSON : AGLOE_VOWELS;
    letters.push(pool[next() % pool.length]);
  }
  for (let i = letters.length - 1; i > 0; i--) {   /* 確定性洗牌 */
    const j = next() % (i + 1);
    const t = letters[i]; letters[i] = letters[j]; letters[j] = t;
  }
  if (!letters.some((c) => AGLOE_VOWELS.indexOf(c) >= 0)) {
    letters[letters.length - 1] = AGLOE_VOWELS[next() % AGLOE_VOWELS.length];
  }
  /* 拆掉三連子音，讓它像個地名而不是車牌 */
  const isV = (c) => AGLOE_VOWELS.indexOf(c) >= 0;
  for (let i = 2; i < letters.length; i++) {
    if (!isV(letters[i]) && !isV(letters[i - 1]) && !isV(letters[i - 2])) {
      letters[i - 1] = AGLOE_VOWELS[next() % AGLOE_VOWELS.length];
    }
  }
  return { letters: letters.slice(), name: letters.join('') };
}

/* 放大鏡離目標多遠（單位：SVG viewBox 座標） */
function distance(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/* 冷熱提示：只給粗略級距，不洩漏方向 */
function proximityLabel(d) {
  if (d <= 30) return '找到了';
  if (d <= 90) return '非常近';
  if (d <= 190) return '接近了';
  if (d <= 330) return '有點遠';
  return '很遠';
}

/* 0（冷）→ 1（熱），給放大鏡邊框上色 */
function heat(d) {
  const t = 1 - (d - 30) / 300;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/* 把螢幕座標換成 viewBox 座標（等比縮放，preserveAspectRatio 預設） */
function toViewBox(px, py, rect, vbW, vbH) {
  const s = Math.min(rect.width / vbW, rect.height / vbH) || 1;
  const offX = (rect.width - vbW * s) / 2;
  const offY = (rect.height - vbH * s) / 2;
  return { x: (px - rect.left - offX) / s, y: (py - rect.top - offY) / s };
}

/* 夾在地圖範圍內，放大鏡不會被拖到紙外面 */
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

if (typeof module === 'object' && module.exports) {
  module.exports = { hashStr, coinName, distance, proximityLabel, heat, toViewBox, clamp };
}

/* ==========================================================================
 * otp.js — 一次性密碼本（One-Time Pad）的純函式核心
 * 沒有任何 DOM 依賴，方便用 node 斷言驗證（見 otp.test.js）
 *
 * 編碼規則（為了好懂而簡化，真實間諜用的是 straddling checkerboard）：
 *   A–Z → 01–26，空白 → 27，每個字元固定兩位數字
 *   加密：密文 = (明文 + 金鑰) mod 10，逐位相加、不進位
 *   解密：明文 = (密文 − 金鑰 + 10) mod 10
 *
 * 關鍵性質（Shannon 1949）：金鑰若真隨機、只用一次、且與訊息等長，
 * 則對任何「等長的另一段明文」都存在一把金鑰，把同一串密文解成它。
 * 也就是說，密文本身不含任何訊息。
 * ========================================================================== */
var OTP = (function () {
  'use strict';

  var ALPHABET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // index 0 未使用

  /** 文字 → 兩位一組的數字陣列 */
  function textToDigits(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i).toUpperCase();
      var n = ch === ' ' ? 27 : ALPHABET.indexOf(ch);
      if (n < 1) n = 27; // 不認得的字元一律當空白
      out.push(Math.floor(n / 10), n % 10);
    }
    return out;
  }

  /** 兩位一組的數字陣列 → 文字（27 = 空白） */
  function digitsToText(digits) {
    var s = '';
    for (var i = 0; i + 1 < digits.length; i += 2) {
      var n = digits[i] * 10 + digits[i + 1];
      s += (n === 27 || n < 1 || n > 26) ? ' ' : ALPHABET.charAt(n);
    }
    return s;
  }

  /** 逐位模十相加（不進位） */
  function addMod10(a, b) {
    return a.map(function (d, i) { return (d + b[i]) % 10; });
  }

  /** 逐位模十相減（不借位） */
  function subMod10(a, b) {
    return a.map(function (d, i) { return (d - b[i] + 10) % 10; });
  }

  function encrypt(plainText, key) { return addMod10(textToDigits(plainText), key); }
  function decrypt(cipher, key) { return digitsToText(subMod10(cipher, key)); }

  /** 給定密文與「想要解出來的明文」，反推出那把讓它成立的金鑰 */
  function keyFor(cipher, wantedText) { return subMod10(cipher, textToDigits(wantedText)); }

  /** 數字陣列 → 五位一組的字串陣列（電台真的就是這樣念的） */
  function toGroups(digits, size) {
    size = size || 5;
    var g = [];
    for (var i = 0; i < digits.length; i += size) g.push(digits.slice(i, i + size).join(''));
    return g;
  }

  return {
    textToDigits: textToDigits,
    digitsToText: digitsToText,
    addMod10: addMod10,
    subMod10: subMod10,
    encrypt: encrypt,
    decrypt: decrypt,
    keyFor: keyFor,
    toGroups: toGroups
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OTP;

#!/usr/bin/env node
/* otp.js 的 node 斷言測試：node otp.test.js */
'use strict';
const assert = require('assert');
const OTP = require('./otp.js');

/* --- 編碼／解碼往返 --- */
assert.deepStrictEqual(OTP.textToDigits('AB Z'), [0, 1, 0, 2, 2, 7, 2, 6]);
assert.strictEqual(OTP.digitsToText(OTP.textToDigits('HELLO WORLD')), 'HELLO WORLD');

/* --- 模十加減不進位 --- */
assert.deepStrictEqual(OTP.addMod10([9, 5, 0], [3, 5, 0]), [2, 0, 0]);
assert.deepStrictEqual(OTP.subMod10([2, 0, 0], [3, 5, 0]), [9, 5, 0]);

/* --- 加密後再解密會回到原文 --- */
const key = OTP.textToDigits('QWERTY').map((d, i) => (d * 7 + i * 3) % 10);
assert.strictEqual(OTP.decrypt(OTP.encrypt('ABCDEF', key), key), 'ABCDEF');

/* --- 頁面實際使用的資料：同一串密文，三把金鑰，三種明文 --- */
const CIPHER = '46206941839159243829118832062515150481952139885357'.split('').map(Number);
const KEYS = {
  k1: '26295144887132212315158924932011989873802834835930',
  k2: '45285433637458103402038312851701988476782938795830',
  k3: '48295335687457252009138431810818070377911838613630'
};
assert.strictEqual(CIPHER.length, 50);
assert.strictEqual(OTP.decrypt(CIPHER, KEYS.k1.split('').map(Number)), 'TARGET CONFIRMED PROCEED ');
assert.strictEqual(OTP.decrypt(CIPHER, KEYS.k2.split('').map(Number)), 'ABORT AND RETURN TO BASE ');
assert.strictEqual(OTP.decrypt(CIPHER, KEYS.k3.split('').map(Number)), 'HAPPY BIRTHDAY GRANDMA   ');

/* --- 完美保密性：任何等長明文都能反推出一把金鑰 --- */
['THE CAT SAT ON THE MAT   ', 'MEET ME AT NOON ON SUNDAY'].forEach((want) => {
  const k = OTP.keyFor(CIPHER, want);
  assert.strictEqual(k.length, 50);
  assert.strictEqual(OTP.decrypt(CIPHER, k), want);
});

/* --- 五位一組 --- */
assert.deepStrictEqual(OTP.toGroups(CIPHER)[0], '46206');
assert.strictEqual(OTP.toGroups(CIPHER).length, 10);

console.log('otp.test.js：全部通過（' + 14 + ' 項斷言）');

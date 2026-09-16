/* ==========================================================================
 * test.js — qr.js 的離線斷言（不需任何相依套件）：node test.js
 *
 * 另外在開發時做過一輪「編碼 → 點陣圖 → 用 jsQR 解碼 → 比對原文」的往返測試
 * （版本 1、2、3、4、5、8 皆通過），那一段需要外部套件，就不留在倉庫裡了。
 * ========================================================================== */
'use strict';
const assert = require('assert');
const QR = require('./qr.js');

/* ── UTF-8 ── */
assert.deepStrictEqual(QR.utf8Bytes('A'), [65]);
assert.deepStrictEqual(QR.utf8Bytes('中'), [0xE4, 0xB8, 0xAD]);
assert.strictEqual(QR.utf8Bytes('定位圖案').length, 12);

/* ── 格式資訊 BCH(15,5)：ISO/IEC 18004 附錄 C，等級 M 的八個遮罩 ── */
const FMT_M = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
FMT_M.forEach((want, m) => assert.strictEqual(QR.formatBits(m), want, '格式資訊 遮罩 ' + m));

/* ── 版本資訊 BCH(18,6)：ISO/IEC 18004 附錄 D ── */
assert.strictEqual(QR.versionBits(7), 0x07C94);
assert.strictEqual(QR.versionBits(8), 0x085BC);
assert.strictEqual(QR.versionBits(9), 0x09A99);

/* ── Reed-Solomon：規格附錄 I 的範例（版本 1 等級 M，10 個糾錯碼字） ── */
const sample = [0x10, 0x20, 0x0C, 0x56, 0x61, 0x80, 0xEC, 0x11,
                0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11];
assert.deepStrictEqual(QR.rsEncode(sample, 10),
  [0xA5, 0x24, 0xD4, 0xC1, 0xED, 0x36, 0xC7, 0x87, 0x2C, 0x55]);

/* ── 版本挑選與容量邊界 ── */
assert.strictEqual(QR.pickVersion(1), 1);
assert.strictEqual(QR.encode('x'.repeat(QR.capacity(9) + 1)), null, '超量要回傳 null');
assert.ok(QR.encode('x'.repeat(QR.capacity(9))), '剛好滿載要編得出來');

/* ── 矩陣結構 ── */
const cases = ['HI', 'https://example.com', '定位圖案', '1994 年，一群人翻遍了印刷品',
               'x'.repeat(50),
               '這一段寫得比較長，把版本推到七以上，順便驗校正圖案的位置、版本資訊那兩塊十八格的區域，' +
               '還有多分塊之後的交錯順序。'];
let maxV = 0;
for (const s of cases) {
  const r = QR.encode(s);
  assert.ok(r, '編碼失敗：' + s);
  maxV = Math.max(maxV, r.version);
  assert.strictEqual(r.size, 17 + r.version * 4, '尺寸公式');
  assert.strictEqual(r.modules.length, r.size * r.size);

  /* 三個角的定位圖案中心必為黑、外圈白邊必為白 */
  for (const [br, bc] of [[0, 0], [0, r.size - 7], [r.size - 7, 0]]) {
    assert.strictEqual(r.modules[(br + 3) * r.size + (bc + 3)], 1, '定位圖案中心應為黑');
    assert.strictEqual(r.modules[(br + 1) * r.size + (bc + 1)], 0, '定位圖案內圈應為白');
  }
  /* 固定暗模組 */
  assert.strictEqual(r.modules[(r.size - 8) * r.size + 8], 1, '固定暗模組應為黑');
  /* 時序圖案交替 */
  for (let i = 8; i < r.size - 8; i++) {
    assert.strictEqual(r.modules[6 * r.size + i], i % 2 === 0 ? 1 : 0, '水平時序');
    assert.strictEqual(r.modules[i * r.size + 6], i % 2 === 0 ? 1 : 0, '垂直時序');
  }

  /* 本頁的主角：穿過定位圖案中心那一列，前五段就是 1:1:3:1:1 */
  const rr = QR.runRatio(QR.findRuns(r.modules, r.size, 3).slice(0, 5));
  assert.ok(rr && rr.ok, 'v' + r.version + ' 第 3 列不是 1:1:3:1:1');
  assert.deepStrictEqual(rr.ratio.map(Math.round), [1, 1, 3, 1, 1]);

  /* 最後三列同理（左下角那個定位圖案） */
  const rb = QR.runRatio(QR.findRuns(r.modules, r.size, r.size - 4).slice(0, 5));
  assert.ok(rb && rb.ok, 'v' + r.version + ' 左下角不是 1:1:3:1:1');
}
assert.ok(maxV >= 7, '測試向量沒涵蓋版本 7 以上（版本資訊區塊沒被驗到）');

console.log('qr.js — 全部斷言通過 ✓（最高驗到版本 ' + maxV + '）');

/* lijin.js — 紅包規矩的純函式核心（瀏覽器 window.LIJIN／node module.exports 共用） */
(function (root) {
  'use strict';

  /* 行情起跳表：104 職場力〈2026 婚禮紅包怎麼包〉（2026-07-06 更新）
     [禮到人不到, 單人出席, 攜伴] × 交情 × 場地；未含喜餅 */
  var TABLE = {
    nod:    { rest: [1200, 1600, 2600], hall: [1600, 2200, 3000], five: [2000, 3200, 6000] },
    work:   { rest: [1600, 2000, 3000], hall: [2000, 2600, 3200], five: [2000, 3200, 6000] },
    friend: { rest: [2000, 2600, 3600], hall: [2600, 3200, 6000], five: [2600, 3600, 6600] },
    close:  { rest: [3000, 3600, 6000], hall: [3000, 6000, 10000], five: [3600, 6600, 10000] }
  };
  var ATTEND = { absent: 0, solo: 1, pair: 2 };

  /* 常見吉數（喜）與常見奠儀（喪） */
  var XI = [1200, 1600, 2000, 2200, 2600, 3000, 3200, 3600, 6000, 6600,
            10000, 12000, 16000, 20000, 26000, 36000, 60000, 66000, 100000];
  var BAI = [1100, 1500, 2100, 3100, 5100, 7100, 10100];

  function baseline(rel, venue, attend) {
    var r = TABLE[rel], a = ATTEND[attend];
    if (!r || !r[venue] || a === undefined) return 0;
    return r[venue][a];
  }

  /* 民俗算單雙，看的是「幾百」：1,100 → 11（單），1,200 → 12（雙） */
  function hundreds(amount) { return Math.floor(amount / 100); }
  function has(amount, d) { return String(amount).indexOf(String(d)) >= 0; }

  /* 逐條審查。level：ok／warn／bad。pass＝有錢、且沒有 bad */
  function judge(amount, occ, base) {
    var c = [];
    if (!(amount > 0)) return { pass: false, checks: [{ id: 'empty', level: 'bad', msg: '紅包還是空的。' }] };
    var h = hundreds(amount), even = h % 2 === 0;
    if (occ === 'bai') {
      c.push(even
        ? { id: 'parity', level: 'bad', msg: '百位算出 ' + h + '，是雙數──喪事忌成雙。' }
        : { id: 'parity', level: 'ok', msg: '百位算出 ' + h + '，單數，一份完整的心意。' });
    } else {
      c.push(even
        ? { id: 'parity', level: 'ok', msg: '百位算出 ' + h + '，雙數，好事成雙。' }
        : { id: 'parity', level: 'bad', msg: '百位算出 ' + h + '，單數──喜事要成雙。' });
    }
    if (has(amount, 4)) c.push({ id: 'four', level: 'bad', msg: '裡面有 4，聽起來像「死」。' });
    if (occ !== 'bai') {
      if (has(amount, 8)) c.push({ id: 'eight', level: 'warn', msg: '有 8：有人聽成「發」，有人聽成「別」。看對方家。' });
      if (has(amount, 5)) c.push({ id: 'five', level: 'warn', msg: '有 5：有些長輩聽成「無」。' });
      if (base > 0) {
        c.push(amount >= base
          ? { id: 'base', level: 'ok', msg: '過了行情起跳 ' + fmt(base) + '。' }
          : { id: 'base', level: 'warn', msg: '比行情起跳 ' + fmt(base) + ' 少 ' + fmt(base - amount) + '。' });
      }
    }
    if (amount % 100 !== 0) c.push({ id: 'coin', level: 'warn', msg: '有零頭。在台灣看起來像找錯錢。' });
    var pass = true;
    for (var i = 0; i < c.length; i++) if (c[i].level === 'bad') pass = false;
    return { pass: pass, checks: c };
  }

  /* ≥ x 的最小常見吉數；超出清單就依規則往上找 */
  function nextLucky(x, occ) {
    var list = occ === 'bai' ? BAI : XI;
    for (var i = 0; i < list.length; i++) if (list[i] >= x) return list[i];
    var a = Math.ceil(x / 100) * 100;
    while (!judge(a, occ, 0).pass || has(a, 8) || has(a, 5)) a += 100;
    return a;
  }

  /* 回包：比對方當初包的多 600 起跳，再落到吉數（104 職場力：+600～1,200） */
  function returnGift(received) { return nextLucky(received + 600, 'xi'); }

  /* 把金額拆成 1000／500／100 鈔（先大後小；零頭丟掉） */
  function toBills(amount) {
    var out = [], left = Math.floor(amount / 100) * 100, dens = [1000, 500, 100];
    for (var i = 0; i < dens.length; i++) while (left >= dens[i]) { out.push(dens[i]); left -= dens[i]; }
    return out;
  }

  function sum(bills) { var s = 0; for (var i = 0; i < bills.length; i++) s += bills[i]; return s; }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var API = { TABLE: TABLE, XI: XI, BAI: BAI, baseline: baseline, hundreds: hundreds, judge: judge,
              nextLucky: nextLucky, returnGift: returnGift, toBills: toBills, sum: sum, fmt: fmt };
  root.LIJIN = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

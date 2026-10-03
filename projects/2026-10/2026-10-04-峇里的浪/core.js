/* core.js — 「不准調準」的純函式核心（瀏覽器與 node 共用）
 *
 * 峇里 gamelan 的樂器成對打造：低的那台叫 pengumbang、高的那台叫 pengisep，
 * 同一個音刻意差幾赫茲。兩個頻率 f 與 f+d 一起響，耳朵聽到的音高是平均值
 * f+d/2，音量則每秒鼓起 d 次——峇里話叫 ombak（浪）。
 *
 *   cents(f, d)            f 與 f+d 相差幾音分（1200·log2）
 *   zoneOf(d)              浪速 d（Hz）落在哪一種峇里命名（Kartawan 2014 詞彙表）
 *   inTarget(d)            第一對的工作目標：pengumbang sedeng（約每秒 7–8 下）
 *   envelope(d, t)         兩個等幅正弦相加後的振幅包絡 |cos(π d t)|（0..1）
 *   ratioCopy(d, fRef, f)  鐵匠「照比例抄」：把 fRef 那對的頻率比搬到 f
 *   matched(ds, ref, tol)  每一對的浪速都在 ref ± tol 之內？
 *   rub(st, mode, px, k)   銼刀：磨兩端（grind）升高、刮鍵腹（scrape）降低
 *   freq(deg, oct)         五聲音階第 deg 音、第 oct 個八度的 pengumbang 頻率
 *   bandOf(f)              這個頻率歸哪一層（0 低、1 中、2 高）
 *   deltaFor(ver, f, t)    三個版本各給 pengisep 加幾赫茲
 *   piece()                「上台」那一段的事件表（原創旋律，不是傳統曲目）
 *
 * 頻率（171／342／684 Hz）與音階音程是示意值：音程取自 Kartawan 量測的
 * tirus 型音程範圍之內，不代表任何一套真實樂器。
 */
(function (root) {
  'use strict';

  var REG = [171, 342, 684];                 /* 三層的 dong（pengumbang） */
  var SCALE = [0, 220, 505, 725, 985];       /* dong deng dung dang ding（相對 dong 的音分） */
  var NOTE = ['dong', 'deng', 'dung', 'dang', 'ding'];
  var D_MIN = -4, D_MAX = 24;                /* 銼刀能把差距推到的範圍（Hz） */

  /* 浪速分類：上界（不含）＋顯示名稱。命名與範圍出自 Kartawan（2014）；
     lambat 取正文的「約 5–6 Hz」（詞彙表寫 5–7，與 sedeng 的 7–8 相接），
     範圍之間的空隙取中點當分界，lambat/sedeng 相鄰處取 6.75。 */
  var ZONES = [
    { id: 'flat',     max: 0.6,      name: '平的',              zh: '沒有浪',        lo: 0,  hi: 0 },
    { id: 'angieng',  max: 2.5,      name: 'angieng',           zh: '最慢的浪',      lo: 1,  hi: 2 },
    { id: 'pengayun', max: 4.5,      name: 'pengayun',          zh: '慢，不拿來配對', lo: 3,  hi: 4 },
    { id: 'lambat',   max: 6.75,     name: 'pengumbang lambat', zh: '偏慢',          lo: 5,  hi: 6 },
    { id: 'sedeng',   max: 8.5,      name: 'pengumbang sedeng', zh: '不快不慢',      lo: 7,  hi: 8 },
    { id: 'bulus',    max: 10.5,     name: 'pengumbang bulus',  zh: '樂器上最快的',  lo: 9,  hi: 10 },
    { id: 'pengejer', max: 15.5,     name: 'pengejer',          zh: '更快',          lo: 11, hi: 15 },
    { id: 'pengetor', max: 20.5,     name: 'pengetor',          zh: '最快',          lo: 16, hi: 20 },
    { id: 'rough',    max: Infinity, name: '沙沙聲',            zh: '快到不像浪',    lo: 21, hi: 24 }
  ];

  function cents(f, d) { return 1200 * Math.log(1 + d / f) / Math.LN2; }

  function zoneOf(d) {
    if (d <= -0.6) return { id: 'upside', name: '顛倒了', zh: '高的那根比低的還低', lo: 0, hi: 0 };
    var a = Math.abs(d);
    for (var i = 0; i < ZONES.length; i++) if (a < ZONES[i].max) return ZONES[i];
    return ZONES[ZONES.length - 1];
  }

  function inTarget(d) { return d >= 6.75 && d < 8.5; }

  function envelope(d, t) { return Math.abs(Math.cos(Math.PI * d * t)); }

  function ratioCopy(d, fRef, f) { return d * f / fRef; }

  function matched(ds, ref, tol) {
    for (var i = 0; i < ds.length; i++) if (!(Math.abs(ds[i] - ref) <= tol)) return false;
    return true;
  }

  /* st = { d, up, down }：d 是目前差距，up／down 是累計磨掉／刮掉的量（畫痕跡用） */
  function rub(st, mode, px, k) {
    var step = Math.max(0, px) * (k || 0.035);
    var sign = mode === 'grind' ? 1 : -1;
    var d = Math.max(D_MIN, Math.min(D_MAX, st.d + sign * step));
    var moved = Math.abs(d - st.d);
    return {
      d: d,
      up: st.up + (sign > 0 ? moved : 0),
      down: st.down + (sign < 0 ? moved : 0)
    };
  }

  function freq(deg, oct) { return REG[0] * Math.pow(2, oct + SCALE[deg] / 1200); }

  function bandOf(f) { return f < REG[1] * 0.999 ? 0 : (f < REG[2] * 0.999 ? 1 : 2); }

  /* tuned = [低, 中, 高] 三對的浪速；ver：mine（你磨的）、ratio（照比例抄）、flat（全部一樣） */
  function deltaFor(ver, f, tuned) {
    if (ver === 'flat') return 0;
    if (ver === 'ratio') return f * tuned[1] / REG[1];
    return tuned[bandOf(f)];
  }

  /* 上台那一段：低音每兩拍一個骨幹音、中音每拍兩個裝飾音、高音在反拍上長響；
     頭尾各一聲大鑼。BEAT 秒一拍，共 16 拍。 */
  var BEAT = 0.42;
  var CORE = [0, 2, 3, 2, 4, 3, 1, 0];
  var FIG = [[0, 1, 2, 1], [1, 0, 4, 0], [0, 2, 1, 2], [2, 1, 0, 1]];
  function piece() {
    var ev = [], i, j, t;
    ev.push({ t: 0, kind: 'gong' });
    for (i = 0; i < CORE.length; i++) {
      t = i * 2 * BEAT;
      ev.push({ t: t, kind: 'key', deg: CORE[i], oct: 0, len: 1.5 });
      var fig = FIG[i % FIG.length];
      for (j = 0; j < 4; j++) {
        ev.push({ t: t + j * BEAT / 2, kind: 'key', deg: (CORE[i] + fig[j]) % 5, oct: 1, len: 0.75, damp: 0.95 });
      }
      ev.push({ t: t + BEAT, kind: 'key', deg: (CORE[i] + 2) % 5, oct: 2, len: 1.1 });
    }
    var end = CORE.length * 2 * BEAT;
    ev.push({ t: end, kind: 'gong' });
    for (j = 0; j < 3; j++) ev.push({ t: end, kind: 'key', deg: 0, oct: j, len: 2.2 });
    ev.sort(function (a, b) { return a.t - b.t; });
    return ev;
  }
  function pieceLength() { return CORE.length * 2 * BEAT + 4.2; }

  var API = {
    REG: REG, SCALE: SCALE, NOTE: NOTE, ZONES: ZONES, D_MIN: D_MIN, D_MAX: D_MAX, BEAT: BEAT,
    cents: cents, zoneOf: zoneOf, inTarget: inTarget, envelope: envelope, ratioCopy: ratioCopy,
    matched: matched, rub: rub, freq: freq, bandOf: bandOf, deltaFor: deltaFor,
    piece: piece, pieceLength: pieceLength
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.OMBAK = API;
})(typeof window !== 'undefined' ? window : globalThis);

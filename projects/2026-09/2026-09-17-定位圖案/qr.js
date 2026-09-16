/* ==========================================================================
 * qr.js — 從零寫的 QR Code 編碼器（ISO/IEC 18004，位元組模式、糾錯等級 M）
 *
 * 為什麼自己寫：這一頁要把「掃描線讀到的黑白比例」攤開給讀者看，
 * 所以需要的不是一張圖片，而是一個貨真價實的模組矩陣（0/1 陣列），
 * 而且要能指出哪些格子屬於定位圖案、哪些屬於資料。現成的函式庫吐圖片，
 * 吐不出這些。支援版本 1–9（21×21 到 53×53），糾錯等級 M（可還原約 15%）。
 *
 * 純函式（node 可直接 require 斷言）：
 *   utf8Bytes / encode / runRatio / findRuns / isFunction
 *   encode(text) → { size, version, modules:Uint8Array(size*size), ... }
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ── 版本表（僅糾錯等級 M）：[總碼字, 每塊糾錯碼字, [組1塊數,組1資料碼字], [組2塊數,組2資料碼字]] ── */
  var VER = {
    1: [26, 10, [1, 16], [0, 0]],
    2: [44, 16, [1, 28], [0, 0]],
    3: [70, 26, [1, 44], [0, 0]],
    4: [100, 18, [2, 32], [0, 0]],
    5: [134, 24, [2, 43], [0, 0]],
    6: [172, 16, [4, 27], [0, 0]],
    7: [196, 18, [4, 31], [0, 0]],
    8: [242, 22, [2, 38], [2, 39]],
    9: [292, 22, [3, 36], [2, 37]]
  };

  /* 校正圖案中心座標（版本 1 沒有） */
  var ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46]
  };

  /* ── GF(256) 對數表，本原多項式 0x11D ── */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  /* 產生器多項式 (x-2^0)(x-2^1)…(x-2^(n-1)) */
  function genPoly(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= gfMul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g;
  }

  /* Reed-Solomon 糾錯碼字 */
  function rsEncode(data, ecLen) {
    var g = genPoly(ecLen);
    var rem = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem[0];
      rem.shift();
      rem.push(0);
      for (var j = 0; j < ecLen; j++) rem[j] ^= gfMul(g[j + 1], factor);
    }
    return rem;
  }

  /* ── UTF-8 位元組（不靠 TextEncoder，node 與瀏覽器都一致） ── */
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i);
      if (c > 0xFFFF) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  /* 某版本在等級 M 能裝幾個位元組（扣掉模式 4 bits + 字數 8 bits + 終止符） */
  function capacity(v) {
    var t = VER[v];
    var dataCw = t[2][0] * t[2][1] + t[3][0] * t[3][1];
    return dataCw - 2; /* 模式與字數共 12 bits，保守算 2 個碼字 */
  }

  function pickVersion(nBytes) {
    for (var v = 1; v <= 9; v++) if (capacity(v) >= nBytes) return v;
    return 0;
  }

  /* ── 位元流 ── */
  function Bits() { this.a = []; }
  Bits.prototype.put = function (val, len) {
    for (var i = len - 1; i >= 0; i--) this.a.push((val >> i) & 1);
  };

  /* ── 資料碼字：模式、字數、內容、終止符、補碼 ── */
  function dataCodewords(bytes, v) {
    var t = VER[v];
    var totalData = t[2][0] * t[2][1] + t[3][0] * t[3][1];
    var b = new Bits();
    b.put(0b0100, 4);        /* 位元組模式 */
    b.put(bytes.length, 8);  /* 版本 1–9 的字數欄位是 8 bits */
    for (var i = 0; i < bytes.length; i++) b.put(bytes[i], 8);
    var room = totalData * 8;
    b.put(0, Math.min(4, room - b.a.length));       /* 終止符 */
    while (b.a.length % 8) b.a.push(0);             /* 補到整碼字 */
    var cw = [];
    for (var j = 0; j < b.a.length; j += 8) {
      var x = 0;
      for (var k = 0; k < 8; k++) x = (x << 1) | b.a[j + k];
      cw.push(x);
    }
    var pad = [0xEC, 0x11], p = 0;
    while (cw.length < totalData) cw.push(pad[p++ % 2]);
    return cw;
  }

  /* ── 分塊、交錯 ── */
  function interleave(cw, v) {
    var t = VER[v], ecLen = t[1];
    var blocks = [], ecBlocks = [], at = 0;
    [t[2], t[3]].forEach(function (g) {
      for (var i = 0; i < g[0]; i++) {
        var d = cw.slice(at, at + g[1]);
        at += g[1];
        blocks.push(d);
        ecBlocks.push(rsEncode(d, ecLen));
      }
    });
    var out = [], maxD = 0, m;
    for (m = 0; m < blocks.length; m++) maxD = Math.max(maxD, blocks[m].length);
    for (var i2 = 0; i2 < maxD; i2++) {
      for (m = 0; m < blocks.length; m++) if (i2 < blocks[m].length) out.push(blocks[m][i2]);
    }
    for (var j = 0; j < ecLen; j++) {
      for (m = 0; m < ecBlocks.length; m++) out.push(ecBlocks[m][j]);
    }
    return out;
  }

  /* ── BCH：格式資訊 15 bits、版本資訊 18 bits ── */
  function bch(data, gen, genBits) {
    var d = data << genBits;
    for (var i = genBits + 5; i >= genBits; i--) {
      if (d & (1 << i)) d ^= gen << (i - genBits);
    }
    return d;
  }
  function formatBits(maskId) {
    /* 等級 M 的兩位元是 00；BCH(15,5) 生成多項式 0x537，最後與 0x5412 遮罩 */
    var data = (0b00 << 3) | maskId;
    var d = data << 10;
    for (var i = 14; i >= 10; i--) if (d & (1 << i)) d ^= 0x537 << (i - 10);
    return ((data << 10) | d) ^ 0x5412;
  }
  function versionBits(v) {
    var d = v << 12;
    for (var i = 17; i >= 12; i--) if (d & (1 << i)) d ^= 0x1F25 << (i - 12);
    return (v << 12) | d;
  }

  /* ── 遮罩 ── */
  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];

  /* ── 骨架：定位、分隔、時序、校正、暗模組、保留區 ── */
  function skeleton(v) {
    var n = 17 + v * 4;
    var mod = new Uint8Array(n * n);      /* 0/1 */
    var fn = new Uint8Array(n * n);       /* 1 = 功能模組，資料不得覆蓋 */
    var at = function (r, c) { return r * n + c; };
    var set = function (r, c, val) { mod[at(r, c)] = val; fn[at(r, c)] = 1; };

    /* 三個定位圖案（含 1 圈分隔白邊） */
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (p) {
      for (var dr = -1; dr <= 7; dr++) {
        for (var dc = -1; dc <= 7; dc++) {
          var r = p[0] + dr, c = p[1] + dc;
          if (r < 0 || c < 0 || r >= n || c >= n) continue;
          var inRing = (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6);
          var dark = inRing &&
            (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
             (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          set(r, c, dark ? 1 : 0);
        }
      }
    });

    /* 時序圖案 */
    for (var i = 8; i < n - 8; i++) {
      set(6, i, i % 2 === 0 ? 1 : 0);
      set(i, 6, i % 2 === 0 ? 1 : 0);
    }

    /* 校正圖案（避開三個定位角） */
    var ac = ALIGN[v];
    for (var a = 0; a < ac.length; a++) {
      for (var b = 0; b < ac.length; b++) {
        var cr = ac[a], cc = ac[b];
        if ((cr <= 8 && cc <= 8) || (cr <= 8 && cc >= n - 9) || (cr >= n - 9 && cc <= 8)) continue;
        for (var dr2 = -2; dr2 <= 2; dr2++) {
          for (var dc2 = -2; dc2 <= 2; dc2++) {
            var ring = Math.max(Math.abs(dr2), Math.abs(dc2));
            set(cr + dr2, cc + dc2, (ring === 1) ? 0 : 1);
          }
        }
      }
    }

    /* 固定的暗模組 */
    set(n - 8, 8, 1);

    /* 格式資訊保留區（值稍後填） */
    for (var k = 0; k <= 8; k++) {
      if (k !== 6) { set(8, k, 0); set(k, 8, 0); }
    }
    for (var k2 = 0; k2 < 8; k2++) { set(8, n - 1 - k2, 0); }
    for (var k3 = 0; k3 < 7; k3++) { set(n - 1 - k3, 8, 0); }

    /* 版本資訊保留區（版本 7 以上） */
    if (v >= 7) {
      for (var r2 = 0; r2 < 6; r2++) {
        for (var c2 = 0; c2 < 3; c2++) { set(r2, n - 11 + c2, 0); set(n - 11 + c2, r2, 0); }
      }
    }
    return { n: n, mod: mod, fn: fn };
  }

  /* ── 之字形放資料 ── */
  function placeData(sk, cw) {
    var n = sk.n, mod = sk.mod, fn = sk.fn;
    var bits = [];
    for (var i = 0; i < cw.length; i++) for (var b = 7; b >= 0; b--) bits.push((cw[i] >> b) & 1);
    var p = 0, up = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;             /* 跳過時序那一行 */
      for (var t = 0; t < n; t++) {
        var row = up ? (n - 1 - t) : t;
        for (var s = 0; s < 2; s++) {
          var c = col - s;
          if (fn[row * n + c]) continue;
          mod[row * n + c] = p < bits.length ? bits[p] : 0;
          p++;
        }
      }
      up = !up;
    }
  }

  /* ── 罰分（ISO 18004 四項） ── */
  function penalty(mod, n) {
    var score = 0, r, c, i;
    var g = function (rr, cc) { return mod[rr * n + cc]; };
    /* 1. 同色連續 5 以上 */
    for (r = 0; r < n; r++) {
      for (var dir = 0; dir < 2; dir++) {
        var run = 1, prev = dir ? g(0, r) : g(r, 0);
        for (c = 1; c < n; c++) {
          var v = dir ? g(c, r) : g(r, c);
          if (v === prev) { run++; } else { if (run >= 5) score += run - 2; run = 1; prev = v; }
        }
        if (run >= 5) score += run - 2;
      }
    }
    /* 2. 2×2 同色 */
    for (r = 0; r < n - 1; r++) {
      for (c = 0; c < n - 1; c++) {
        var a = g(r, c);
        if (a === g(r, c + 1) && a === g(r + 1, c) && a === g(r + 1, c + 1)) score += 3;
      }
    }
    /* 3. 1:1:3:1:1 樣式（含四白）——正是本頁的主角 */
    var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    var pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (r = 0; r < n; r++) {
      for (c = 0; c + 11 <= n; c++) {
        var okA = true, okB = true, okC = true, okD = true;
        for (i = 0; i < 11; i++) {
          if (g(r, c + i) !== pat1[i]) okA = false;
          if (g(r, c + i) !== pat2[i]) okB = false;
          if (g(c + i, r) !== pat1[i]) okC = false;
          if (g(c + i, r) !== pat2[i]) okD = false;
        }
        if (okA) score += 40;
        if (okB) score += 40;
        if (okC) score += 40;
        if (okD) score += 40;
      }
    }
    /* 4. 黑白比例偏離 50% */
    var dark = 0;
    for (i = 0; i < n * n; i++) dark += mod[i];
    var pct = dark * 100 / (n * n);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function applyFormat(sk, maskId) {
    var n = sk.n, mod = sk.mod;
    var f = formatBits(maskId);
    var bit = function (i) { return (f >> i) & 1; };
    /* 左上：第 8 列與第 8 行 */
    for (var i = 0; i <= 5; i++) mod[8 * n + i] = bit(i);
    mod[8 * n + 7] = bit(6);
    mod[8 * n + 8] = bit(7);
    mod[7 * n + 8] = bit(8);
    for (var j = 9; j <= 14; j++) mod[(14 - j) * n + 8] = bit(j);
    /* 右上與左下（重複一份） */
    for (var k = 0; k <= 7; k++) mod[8 * n + (n - 1 - k)] = bit(k);
    for (var m = 8; m <= 14; m++) mod[(n - 15 + m) * n + 8] = bit(m);
    mod[(n - 8) * n + 8] = 1; /* 固定暗模組，別被蓋掉 */
  }

  function applyVersion(sk, v) {
    if (v < 7) return;
    var n = sk.n, mod = sk.mod, vb = versionBits(v);
    for (var i = 0; i < 18; i++) {
      var b = (vb >> i) & 1;
      var r = Math.floor(i / 3), c = i % 3;
      mod[r * n + (n - 11 + c)] = b;
      mod[(n - 11 + c) * n + r] = b;
    }
  }

  /* ── 主入口 ── */
  function encode(text) {
    var bytes = utf8Bytes(String(text));
    var v = pickVersion(bytes.length);
    if (!v) return null;                       /* 超過版本 9 的容量 */
    var cw = interleave(dataCodewords(bytes, v), v);
    var base = skeleton(v);
    placeData(base, cw);

    /* 八種遮罩選罰分最低的 */
    var best = null;
    for (var m = 0; m < 8; m++) {
      var mod = Uint8Array.from(base.mod);
      for (var r = 0; r < base.n; r++) {
        for (var c = 0; c < base.n; c++) {
          if (!base.fn[r * base.n + c] && MASKS[m](r, c)) mod[r * base.n + c] ^= 1;
        }
      }
      var cand = { n: base.n, mod: mod, fn: base.fn };
      applyFormat(cand, m);
      applyVersion(cand, v);
      var s = penalty(mod, base.n);
      if (!best || s < best.score) best = { score: s, mask: m, modules: mod };
    }
    return {
      size: base.n, version: v, mask: best.mask, penalty: best.score,
      bytes: bytes.length, capacity: capacity(v),
      modules: best.modules, fnMask: base.fn
    };
  }

  /* ── 掃描線：把一列 0/1 壓成連續同色的長度序列 ── */
  function findRuns(modules, size, row) {
    var runs = [], cur = modules[row * size], len = 0;
    for (var c = 0; c < size; c++) {
      var v = modules[row * size + c];
      if (v === cur) len++;
      else { runs.push({ v: cur, len: len, end: c }); cur = v; len = 1; }
    }
    runs.push({ v: cur, len: len, end: size });
    return runs;
  }

  /* 從連續 5 段算比例，回傳是否符合 1:1:3:1:1（黑白黑白黑，容差 ±50%） */
  function runRatio(five) {
    if (five.length !== 5) return null;
    if (!(five[0].v === 1 && five[1].v === 0 && five[2].v === 1 && five[3].v === 0 && five[4].v === 1)) return null;
    var total = five.reduce(function (s, x) { return s + x.len; }, 0);
    var unit = total / 7;
    var want = [1, 1, 3, 1, 1];
    var ok = true;
    var ratio = five.map(function (x, i) {
      var r = x.len / unit;
      if (Math.abs(r - want[i]) > want[i] * 0.5) ok = false;
      return r;
    });
    return { ratio: ratio, ok: ok, unit: unit };
  }

  /* 某格是否屬於定位圖案（含分隔白邊） */
  function isFinder(size, r, c) {
    return (r <= 7 && c <= 7) || (r <= 7 && c >= size - 8) || (r >= size - 8 && c <= 7);
  }

  var api = {
    VER: VER, ALIGN: ALIGN,
    utf8Bytes: utf8Bytes, capacity: capacity, pickVersion: pickVersion,
    rsEncode: rsEncode, formatBits: formatBits, versionBits: versionBits,
    encode: encode, findRuns: findRuns, runRatio: runRatio, isFinder: isFinder
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QRLAB = api;
})(typeof window !== 'undefined' ? window : globalThis);

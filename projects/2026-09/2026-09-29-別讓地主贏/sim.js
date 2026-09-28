/* 別讓地主贏 — 核心模擬（純函式，瀏覽器與 node 共用）
 * 簡化自 1904 年 The Landlord's Game：40 格環狀棋盤、36 塊地（12 組 × 3）、
 * 經過起點領工資、踩到別人的地付地租。唯一的旋鈕 tax＝「每筆地租有幾成歸公」，
 * 公庫照 1906 年單一稅規則：每滿 50 元蓋一項公共建設，所有人的工資永久加 10 元。
 */
(function (root) {
  'use strict';

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 棋盤：0 起點（工資）、10 公園、20 濟貧院、30 監獄；其餘 36 格是地 */
  var CORNERS = { 0: 'go', 10: 'park', 20: 'poor', 30: 'jail' };
  function makeBoard() {
    var sq = [], lot = 0;
    for (var i = 0; i < 40; i++) {
      if (CORNERS[i]) { sq.push({ i: i, kind: CORNERS[i] }); continue; }
      var g = Math.floor(lot / 3);
      var price = 60 + g * 30;
      sq.push({ i: i, kind: 'lot', group: g, price: price, rent: price });
      lot++;
    }
    return sq;
  }
  var BOARD = makeBoard();

  var DEFAULTS = { players: 4, start: 800, wage: 100, reserve: 100, growth: 0.03, monoMult: 3, rentRate: 0.15, raiseEvery: 50, raiseBy: 10, maxRounds: 150 };

  function ownsGroup(owner, g, p) {
    for (var i = 0; i < 40; i++) {
      var s = BOARD[i];
      if (s.kind === 'lot' && s.group === g && owner[i] !== p) return false;
    }
    return true;
  }

  /* 身家＝現金＋名下地價 */
  function worth(cash, owner, alive) {
    var w = cash.slice();
    for (var i = 0; i < 40; i++) if (owner[i] >= 0) w[owner[i]] += BOARD[i].price;
    for (var p = 0; p < w.length; p++) if (!alive[p]) w[p] = 0;
    return w;
  }

  function rentFor(owner, i, round, o) {
    var s = BOARD[i];
    var mult = ownsGroup(owner, s.group, owner[i]) ? o.monoMult : 1;
    return Math.round(s.rent * o.rentRate * mult * (1 + o.growth * round));
  }

  /* 跑完一局。回傳 { hist:[[cash...]...], owner, end:'mono'|'prosper'|'stall', rounds, winner, bust:[回合或-1], paidPublic } */
  function simulate(opt) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (opt || {})) o[k] = opt[k];
    var tax = Math.max(0, Math.min(1, o.tax || 0));
    var R = rng(o.seed == null ? 1904 : o.seed);
    var n = o.players;
    var cash = [], pos = [], alive = [], bust = [];
    for (var p = 0; p < n; p++) { cash.push(o.start); pos.push(0); alive.push(true); bust.push(-1); }
    var owner = []; for (var i = 0; i < 40; i++) owner.push(-1);
    var hist = [cash.slice()], poses = [pos.slice()], owners = [owner.slice()], events = [];
    var end = 'stall', winner = -1, round = 0, pot = 0, paidPublic = 0, wage = o.wage, wages = [wage];

    for (round = 1; round <= o.maxRounds; round++) {
      for (p = 0; p < n; p++) {
        /* 骰子永遠照順序擲，確保不同 tax 用的是「同一副骰子」 */
        var d = 2 + Math.floor(R() * 6) + Math.floor(R() * 6);
        if (!alive[p]) continue;
        var np = pos[p] + d;
        if (np >= 40) { np -= 40; cash[p] += wage; }
        pos[p] = np;
        var s = BOARD[np];
        if (s.kind !== 'lot') continue;
        var ow = owner[np];
        if (ow === -1) {
          if (cash[p] - s.price >= o.reserve) {
            cash[p] -= s.price; owner[np] = p;
            if (ownsGroup(owner, s.group, p)) events.push({ r: round, type: 'street', p: p, g: s.group });
          }
        } else if (ow !== p) {
          var rent = rentFor(owner, np, round, o);
          var pay = Math.min(rent, cash[p]);
          cash[p] -= rent;
          var pub = pay * tax;
          pot += pub; paidPublic += pub;
          cash[ow] += pay - pub;
          if (cash[p] < 0) {
            cash[p] = 0; alive[p] = false; bust[p] = round;
            events.push({ r: round, type: 'bust', p: p, by: ow });
            for (i = 0; i < 40; i++) if (owner[i] === p) owner[i] = ow;   /* 破產者的地抵給債主 */
          }
        }
      }
      var live = 0; for (p = 0; p < n; p++) if (alive[p]) live++;
      /* 1906 單一稅規則：公庫每滿 raiseEvery 元，就拿去做公共建設，工資永久調高 raiseBy */
      while (pot >= o.raiseEvery) { pot -= o.raiseEvery; wage += o.raiseBy; }
      wages.push(wage);
      for (p = 0; p < n; p++) cash[p] = Math.round(cash[p]);
      hist.push(worth(cash, owner, alive));
      if (o.trace) { poses.push(pos.slice()); owners.push(owner.slice()); }
      if (live === 1) { end = 'mono'; for (p = 0; p < n; p++) if (alive[p]) winner = p; break; }
      /* Prosperity 規則：最窮的人把本錢翻倍，全體獲勝 */
      var minC = Infinity; for (p = 0; p < n; p++) if (alive[p]) minC = Math.min(minC, cash[p]);
      if (live === n && minC >= o.start * 2) { end = 'prosper'; break; }
    }
    return { hist: hist, poses: poses, owners: owners, events: events, cash: cash.slice(), wages: wages, owner: owner, end: end, rounds: Math.min(round, o.maxRounds), winner: winner, bust: bust, paidPublic: Math.round(paidPublic) };
  }

  function summary(res) {
    var last = res.hist[res.hist.length - 1];
    var alive = 0, busted = 0, max = 0, min = Infinity;
    for (var p = 0; p < last.length; p++) {
      if (res.bust[p] >= 0) busted++; else { alive++; min = Math.min(min, last[p]); }
      max = Math.max(max, last[p]);
    }
    return { busted: busted, alive: alive, richest: max, poorest: alive ? min : 0 };
  }

  /* 這副骰子從幾 % 起不再是「一人獨贏」（0..100 整數；都獨贏回傳 -1） */
  function tipping(seed, base) {
    for (var t = 0; t <= 100; t++) {
      var o = { seed: seed, tax: t / 100 }, k;
      for (k in (base || {})) o[k] = base[k];
      if (simulate(o).end !== 'mono') return t;
    }
    return -1;
  }

  /* 棋盤格 i → 11×11 格線上的 [欄, 列]；0 在右下角，逆時針繞一圈 */
  function tileCell(i) {
    i = ((i % 40) + 40) % 40;
    if (i <= 10) return [10 - i, 10];
    if (i <= 20) return [0, 20 - i];
    if (i <= 30) return [i - 20, 0];
    return [10, i - 30];
  }

  /* 結局分類：mono＝一人獨贏、prosper＝全員勝利、stall＝天黑收攤 */
  function verdict(res) {
    if (res.end === 'mono') return { key: 'mono', label: '一人獨贏' };
    if (res.end === 'prosper') return { key: 'prosper', label: '全員勝利' };
    return { key: 'stall', label: '天黑收攤' };
  }

  var API = { tipping: tipping, tileCell: tileCell, verdict: verdict, rng: rng, BOARD: BOARD, worth: worth, DEFAULTS: DEFAULTS, simulate: simulate, summary: summary, rentFor: rentFor, ownsGroup: ownsGroup };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.LLG = API;
})(typeof window !== 'undefined' ? window : globalThis);

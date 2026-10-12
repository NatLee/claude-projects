/* core.js — 「把剩飯冰起來」的純函式（瀏覽器與 node 共用）
 *
 * 兩套東西，刻意分開：
 *   1) rule*  —— 判決只看官方規則（USDA FSIS）：熟食在室溫最多 2 小時，室溫高於 32°C（90°F）只剩 1 小時。
 *   2) sim*   —— 畫曲線用的教學模型，示意「時間 × 溫度」怎麼變成菌量，不拿來下判決：
 *        食物溫度：牛頓冷卻，室溫中與冰箱中各有一個時間常數（依容器深淺）
 *        生長速率：Rosso 心數溫度模型（CTMI），Tmin 8°C、Topt 37°C、Tmax 50°C，
 *                  最適溫每小時 3 次倍增（≈ 20 分鐘一次，文獻在 30°C 的最快值）
 *        遲滯期：孢子要先發芽，累積「相對速率 × 時間」達 1.5 小時當量才開始倍增
 *        起始量：每克 100 個（生米常見的孢子量級），上限每克 10^9（停滯期）
 * 時間一律用「分鐘」。
 */
(function (root) {
  'use strict';

  /* ── 1) 規則 ── */
  var HOT_ROOM = 32;                        /* 90°F */
  function ruleLimit(roomC) { return roomC > HOT_ROOM ? 60 : 120; }

  /* "HH:MM" → 當天第幾分鐘；不合法回 null */
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function fmtHM(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  /* 從 a 到 b 經過幾分鐘（跨午夜就當隔天） */
  function span(a, b) { return ((b - a) % 1440 + 1440) % 1440; }

  function fmtDur(min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' 分鐘';
    return m ? h + ' 小時 ' + m + ' 分' : h + ' 小時';
  }

  /* 判決：cook、now 是當天分鐘；fridge 為 null 表示「還沒冰」 */
  function verdict(o) {
    var limit = ruleLimit(o.roomC);
    var deadline = o.cook + limit;
    if (o.fridge == null) {
      var out = span(o.cook, o.now);
      if (out > 1380) out = 0;              /* 煮好時間填在「未來一小時內」：當成剛煮好，不當成昨天 */
      return { mode: 'waiting', limit: limit, out: out, deadline: deadline,
               left: limit - out, ok: out <= limit };
    }
    var outF = span(o.cook, o.fridge);
    return { mode: 'stored', limit: limit, out: outF, deadline: deadline,
             left: limit - outF, ok: outF <= limit };
  }

  /* ── 2) 教學模型 ── */
  var T0 = 95, FRIDGE = 4;
  var TAU = {                                 /* 分鐘：室溫中 / 冰箱裡 */
    pot:  { room: 105, fridge: 150 },         /* 一大鍋：中心要很久才涼 */
    bowl: { room: 55,  fridge: 75 },          /* 碗、便當盒 */
    flat: { room: 28,  fridge: 38 }           /* 攤平的淺保鮮盒 */
  };
  var TMIN = 8, TOPT = 37, TMAX = 50, MU_OPT = 3 / 60;   /* 倍增／分鐘 */
  var LAG = 90;                                          /* 最適溫下的分鐘當量 */
  var LOG0 = 2, LOGMAX = 9;

  function cool(Tstart, Tenv, tau, dt) { return Tenv + (Tstart - Tenv) * Math.exp(-dt / tau); }

  /* 冷卻後的食物溫度。t＝煮好後第幾分鐘；fridgeAt＝null 表示一直放室溫 */
  function tempAt(t, o) {
    var tau = TAU[o.box] || TAU.pot;
    if (o.fridgeAt == null || t <= o.fridgeAt) return cool(T0, o.roomC, tau.room, Math.max(0, t));
    var Tf = cool(T0, o.roomC, tau.room, o.fridgeAt);
    return cool(Tf, FRIDGE, tau.fridge, t - o.fridgeAt);
  }

  /* 倍增速率（每分鐘幾次倍增），CTMI */
  function rate(T) {
    if (T <= TMIN || T >= TMAX) return 0;
    var num = (T - TMAX) * (T - TMIN) * (T - TMIN);
    var den = (TOPT - TMIN) * ((TOPT - TMIN) * (T - TOPT) - (TOPT - TMAX) * (TOPT + TMIN - 2 * T));
    var r = MU_OPT * num / den;
    return r > 0 ? r : 0;
  }

  /* 逐分鐘模擬到 horizon，回傳 [{t,T,log}]（log＝log10 每克菌數） */
  function simulate(o, horizon) {
    var pts = [], lag = 0, log = LOG0;
    for (var t = 0; t <= horizon; t++) {
      var T = tempAt(t, o);
      pts.push({ t: t, T: T, log: log });
      var r = rate(T);
      if (lag < LAG) lag += r / MU_OPT;
      else log = Math.min(LOGMAX, log + r * Math.LOG10E * Math.LN2);
    }
    return pts;
  }
  function logAt(pts, t) {
    var i = Math.max(0, Math.min(pts.length - 1, Math.round(t)));
    return pts[i].log;
  }

  /* log10 菌數 → 「每克 ≈ 3.3 萬」這種讀得懂的字；兩位有效數字 */
  function sig2(x) { var p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; }
  function trim(x) { return String(+x.toPrecision(2)); }
  function fmtCount(log) {
    var v = sig2(Math.pow(10, log));
    if (v < 1e4) return String(Math.round(v)).replace(/\B(?=(\d{3})+$)/g, ',');
    if (v < 1e8) return trim(v / 1e4) + ' 萬';
    return trim(v / 1e8) + ' 億';
  }
  /* 畫面上的菌點數：log 2→1 點、9→900 點，指數對應，讓「加速」看得見 */
  function dots(log) {
    var k = Math.max(0, Math.min(1, (log - LOG0) / (LOGMAX - LOG0)));
    return Math.round(Math.pow(900, k));
  }

  var API = { fmtCount: fmtCount, dots: dots, HOT_ROOM: HOT_ROOM, ruleLimit: ruleLimit, parseHM: parseHM, fmtHM: fmtHM, span: span,
              fmtDur: fmtDur, verdict: verdict, TAU: TAU, tempAt: tempAt, rate: rate,
              simulate: simulate, logAt: logAt, LOG0: LOG0, LOGMAX: LOGMAX, TOPT: TOPT, FRIDGE: FRIDGE };
  root.RICE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);

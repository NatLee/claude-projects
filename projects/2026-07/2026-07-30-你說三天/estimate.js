/*!
 * estimate.js — 「你說三天」規劃謬誤估時器的純函式層
 *
 * 這裡只放不碰 DOM 的計算：膨脹係數、單位換算、時間格式化，
 * 以及 Buehler, Griffin & Ross (1994) 的研究基準值常數。
 * 瀏覽器用一般 <script src> 載入（掛在 window.PlanFall），
 * node 用 require() 也拿得到同一份 API。刻意不寫成 ES module。
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------
   * 單位表。一天＝24 小時、一週＝168 小時（曆日，不是工作日）。
   * 論文那組數字算的是「日曆天」，所以這裡跟著用曆日，語意才一致。
   * ------------------------------------------------------------- */
  var UNITS = {
    hour: { hours: 1,   label: '小時' },
    day:  { hours: 24,  label: '天'   },
    week: { hours: 168, label: '週'   }
  };

  var UNIT_ORDER = ['hour', 'day', 'week'];

  /* ---------------------------------------------------------------
   * 研究基準值。只放查證過的數字，不要再往上加。
   * ------------------------------------------------------------- */
  var RESEARCH = {
    // Buehler, Griffin & Ross (1994), Journal of Personality and Social Psychology
    buehler1994: {
      n: 37,                 // 37 位心理系大四生
      predictedDays: 33.9,   // 平均預估完成天數
      actualDays: 55.5,      // 實際平均完成天數
      worstCaseDays: 48.6,   // 「假如一切都不順利」的最壞情況估計
      onTimeRate: 0.30       // 約 30% 的人在自己預測的日期前完成
    },
    // 雪梨歌劇院：1957 年估 700 萬澳幣、1963 年 1 月完工；實際 1973 年完工、1 億 200 萬澳幣
    operaHouse: {
      estimateMadeYear: 1957,
      plannedFinishYear: 1963,
      plannedFinishMonth: 1,
      plannedCostAud: 7000000,
      actualFinishYear: 1973,
      actualCostAud: 102000000
    },
    // 沒有個人歷史紀錄時的備援係數（研究平均值，約 1.6 倍）
    FALLBACK_FACTOR: 1.6
  };

  // 那 37 位學生的膨脹係數：55.5 / 33.9 ≈ 1.637
  RESEARCH.STUDENT_FACTOR =
    RESEARCH.buehler1994.actualDays / RESEARCH.buehler1994.predictedDays;

  /* 極端值護欄：單筆比值夾在 [0.02, 100]。
   * 「預估 1 小時、實際 200 小時」這種紀錄仍然算得出來，
   * 只是不讓一筆離譜的資料把整個係數拉到失去意義。 */
  var MIN_RATIO = 0.02;
  var MAX_RATIO = 100;

  /* --------------------------- 小工具 --------------------------- */

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function clamp(n, lo, hi) {
    return n < lo ? lo : (n > hi ? hi : n);
  }

  function round(n, digits) {
    var p = Math.pow(10, digits);
    return Math.round(n * p) / p;
  }

  function group(n) {
    // 千分位，只給整數用
    var s = String(n);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 把使用者輸入洗成數字。空字串、亂填的文字、NaN、Infinity 一律回 null，
   * 讓上層可以明確分辨「沒填」與「填了 0」。
   */
  function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    if (typeof raw === 'boolean') return null;
    var s = String(raw).trim();
    if (s === '') return null;
    // 全形數字 → 半形；去掉千分位與空白
    s = s.replace(/[０-９．]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[，,\s]/g, '');
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function isUnit(unit) {
    return Object.prototype.hasOwnProperty.call(UNITS, unit);
  }

  function unitLabel(unit) {
    return isUnit(unit) ? UNITS[unit].label : '';
  }

  /* --------------------------- 單位換算 --------------------------- */

  /** value 個 unit → 幾小時。單位不合法或值不是數字都回 null。 */
  function toHours(value, unit) {
    var v = parseAmount(value);
    if (v === null || !isUnit(unit)) return null;
    return round(v * UNITS[unit].hours, 10);
  }

  /** 幾小時 → value 個 unit。 */
  function fromHours(hours, unit) {
    var h = parseAmount(hours);
    if (h === null || !isUnit(unit)) return null;
    return round(h / UNITS[unit].hours, 10);
  }

  /** 任意單位互轉。 */
  function convert(value, fromUnit, toUnit) {
    var h = toHours(value, fromUnit);
    if (h === null) return null;
    return fromHours(h, toUnit);
  }

  /* --------------------------- 膨脹係數 --------------------------- */

  /**
   * 單筆紀錄的比值＝實際 ÷ 預估。
   * predicted 必須 > 0（0 會除爆、負數沒有意義），actual 也必須 > 0。
   * 任何一項不合格就回 null，由呼叫端決定忽略或提示。
   */
  function recordRatio(record) {
    if (!record || typeof record !== 'object') return null;
    var p = parseAmount(record.predicted);
    var a = parseAmount(record.actual);
    if (p === null || a === null) return null;
    if (!(p > 0) || !(a > 0)) return null;
    var r = a / p;
    if (!isFinite(r) || r <= 0) return null;
    return clamp(r, MIN_RATIO, MAX_RATIO);
  }

  /** 取出所有合格紀錄的比值陣列。 */
  function ratios(records) {
    var out = [];
    if (!records || typeof records.length !== 'number') return out;
    for (var i = 0; i < records.length; i++) {
      var r = recordRatio(records[i]);
      if (r !== null) out.push(r);
    }
    return out;
  }

  function countValidRecords(records) {
    return ratios(records).length;
  }

  /**
   * 個人膨脹係數 = 各筆「實際 ÷ 預估」的**幾何平均**。
   *
   * 為什麼不用算術平均？
   * 因為這是比值（倍數），不是數量。比值的世界裡，乘法才是加法。
   *  - 一筆低估 4 倍（4）配一筆高估 4 倍（0.25），直覺上應該互相抵銷、係數＝1。
   *    幾何平均給你 sqrt(4 × 0.25) = 1；算術平均給你 (4 + 0.25) / 2 = 2.125，
   *    憑空多出一倍的膨脹。
   *  - 比值的分布天生右偏：往下最多壓到 0，往上卻可以到 200 倍。
   *    算術平均會被少數幾筆災難級的紀錄綁架，幾何平均對它們溫和得多。
   *  - 幾何平均等於「對數空間的算術平均」，而人對時間的誤判本來就比較接近對數尺度。
   *
   * 回傳約定：沒有任何一筆合格紀錄時回 **null**（不是 NaN、不是 1），
   * 讓呼叫端能明確走「改用研究平均值」的備援路線。
   */
  function inflationFactor(records) {
    var rs = ratios(records);
    if (rs.length === 0) return null;
    var sum = 0;
    for (var i = 0; i < rs.length; i++) sum += Math.log(rs[i]);
    var f = Math.exp(sum / rs.length);
    if (!isFinite(f) || f <= 0) return null;
    return round(f, 6);
  }

  /**
   * 有個人紀錄就用個人的，沒有就退回研究平均值 1.6 倍。
   * 回傳 { factor, source: 'personal' | 'reference', count }
   */
  function factorOrFallback(records) {
    var f = inflationFactor(records);
    if (f === null) {
      return { factor: RESEARCH.FALLBACK_FACTOR, source: 'reference', count: 0 };
    }
    return { factor: f, source: 'personal', count: countValidRecords(records) };
  }

  /**
   * 把係數套到估計值上。對 estimate 單調遞增。
   * 非數字、負的估計、非正的係數都回 null（畫面上絕不出現 NaN／Infinity）。
   */
  function applyFactor(estimate, factor) {
    var e = parseAmount(estimate);
    var f = parseAmount(factor);
    if (e === null || f === null) return null;
    if (e < 0 || !(f > 0)) return null;
    var out = e * f;
    if (!isFinite(out)) return null;
    return round(out, 6);
  }

  /* --------------------------- 顯示格式 --------------------------- */

  /** 係數顯示成「×1.64」。不合法回「—」。 */
  function formatFactor(f) {
    var v = parseAmount(f);
    if (v === null || !(v > 0)) return '—';
    return '×' + v.toFixed(2);
  }

  /**
   * 把 value 個 unit 講成人話。
   * 全程用整數運算做進位，所以不會出現「3 小時 60 分」「2 天 24 小時」這種東西。
   */
  function formatDuration(value, unit) {
    var v = parseAmount(value);
    if (v === null || v < 0 || !isUnit(unit)) return '—';

    if (unit === 'hour') {
      var totalMin = Math.round(v * 60);
      var h = Math.floor(totalMin / 60), m = totalMin % 60;
      if (h === 0) return m + ' 分鐘';
      return m === 0 ? group(h) + ' 小時' : group(h) + ' 小時 ' + m + ' 分';
    }

    if (unit === 'day') {
      var totalH = Math.round(v * 24);
      var d = Math.floor(totalH / 24), hh = totalH % 24;
      if (d === 0) return hh + ' 小時';
      return hh === 0 ? group(d) + ' 天' : group(d) + ' 天 ' + hh + ' 小時';
    }

    var totalD = Math.round(v * 7);
    var w = Math.floor(totalD / 7), dd = totalD % 7;
    if (w === 0) return dd + ' 天';
    return dd === 0 ? group(w) + ' 週' : group(w) + ' 週 ' + dd + ' 天';
  }

  /** 給輸入框用的短數字（最多兩位小數、去掉尾巴的 0）。 */
  function formatNumber(value) {
    var v = parseAmount(value);
    if (v === null) return '';
    var s = round(v, 2).toFixed(2).replace(/\.?0+$/, '');
    return s === '' || s === '-' ? '0' : s;
  }

  /* --------------------------- 匯出 --------------------------- */

  var API = {
    UNITS: UNITS,
    UNIT_ORDER: UNIT_ORDER,
    RESEARCH: RESEARCH,
    MIN_RATIO: MIN_RATIO,
    MAX_RATIO: MAX_RATIO,
    isFiniteNumber: isFiniteNumber,
    parseAmount: parseAmount,
    isUnit: isUnit,
    unitLabel: unitLabel,
    toHours: toHours,
    fromHours: fromHours,
    convert: convert,
    recordRatio: recordRatio,
    countValidRecords: countValidRecords,
    inflationFactor: inflationFactor,
    factorOrFallback: factorOrFallback,
    applyFactor: applyFactor,
    formatFactor: formatFactor,
    formatDuration: formatDuration,
    formatNumber: formatNumber
  };

  root.PlanFall = API;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

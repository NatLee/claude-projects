/* ==========================================================================
 * 腦子裡那件一直在吵的事 · engine.js
 * 純函式引擎：不碰 DOM、不碰 localStorage、不看時鐘。
 *   1. 第二章小任務的產生（可指定亂數種子，結果可重現）
 *   2. 哪幾題會被強制打斷的決定
 *   3. 依使用者勾選算出「被打斷 vs 已完成」各記得幾題與百分比
 *   4. 第四章一則待辦是否算「已排定」的驗證（三格都填了才算）
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- 基礎工具 ---------- */

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function clampInt(v, min, max, dflt) {
    var n = (typeof v === 'string' && v.trim() !== '') ? Number(v) : v;
    if (!isFiniteNumber(n)) n = dflt;
    if (!isFiniteNumber(n)) n = 0;
    n = Math.floor(n);
    if (!isFiniteNumber(min)) min = 0;
    if (!isFiniteNumber(max)) max = 0;
    if (max < min) max = min;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  /* 把任何種子（數字或字串）折成一個 32 位元非零整數 */
  function hashSeed(seed) {
    if (isFiniteNumber(seed)) {
      var i32 = (Math.floor(Math.abs(seed)) >>> 0);
      return i32 === 0 ? 0x9e3779b9 : i32;
    }
    var s = String(seed === null || seed === undefined ? '' : seed);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h === 0 ? 0x9e3779b9 : (h >>> 0);
  }

  /* mulberry32：小、快、可重現 */
  function makeRng(seed) {
    var a = hashSeed(seed) | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(rng, arr) {
    var a = Array.isArray(arr) ? arr.slice() : [];
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      if (j < 0) j = 0;
      if (j > i) j = i;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function intBetween(rng, lo, hi) {
    if (hi < lo) hi = lo;
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  function percent(part, whole) {
    if (!isFiniteNumber(part) || !isFiniteNumber(whole) || whole <= 0) return 0;
    var p = Math.round((part / whole) * 100);
    if (!isFiniteNumber(p)) return 0;
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    return p;
  }

  /* 清理任意輸入：去控制字元、收斂空白、去頭尾、限制長度 */
  function cleanText(v, max) {
    if (v === null || v === undefined) return '';
    var s;
    if (typeof v === 'string') s = v;
    else if (typeof v === 'number') s = isFinite(v) ? String(v) : '';
    else if (typeof v === 'boolean') s = '';
    else if (typeof v === 'object') s = '';
    else if (typeof v === 'function' || typeof v === 'symbol') s = '';
    else s = String(v);
    /* eslint-disable no-control-regex */
    s = s.replace(/[\u0000-\u001f\u007f]/g, ' ');
    /* eslint-enable no-control-regex */
    s = s.replace(/[\s　 ]+/g, ' ').trim();
    if (isFiniteNumber(max) && max > 0 && s.length > max) s = s.slice(0, max);
    return s;
  }

  function isFilled(v) {
    return cleanText(v).length > 0;
  }

  /* ---------- 第二章：題庫 ---------- */

  var KIND_ORDER = ['anagram', 'add', 'count', 'odd'];

  var ANAGRAM_WORDS = [
    '洗衣機', '計程車', '電風扇', '巧克力', '腳踏車', '冰淇淋',
    '垃圾桶', '原子筆', '吹風機', '遙控器', '麥克風', '日光燈'
  ];

  var ADD_PAIRS = [
    [13, 24], [27, 15], [34, 28], [46, 17], [19, 36], [52, 23],
    [38, 44], [25, 31], [41, 18], [29, 26], [16, 47], [33, 22]
  ];

  var DOT_COLORS = [
    { key: 'blue', name: '藍色', hex: '#7fb2e0' },
    { key: 'amber', name: '琥珀色', hex: '#e9a33f' },
    { key: 'green', name: '青綠色', hex: '#6fb79a' },
    { key: 'violet', name: '紫色', hex: '#a291d6' }
  ];

  var ODD_SETS = [
    { same: '▲', diff: '▼', name: '三角形', hint: '朝下的那一個' },
    { same: '●', diff: '○', name: '圓點', hint: '空心的那一個' },
    { same: '■', diff: '□', name: '方塊', hint: '空心的那一個' },
    { same: '★', diff: '☆', name: '星星', hint: '空心的那一個' }
  ];

  var INTERRUPT_MS = 3200;   /* 被打斷的題目撐多久才跳走 */
  var SETTLE_MS = 620;       /* 第四章卡片「安靜下來」的動畫長度 */

  function optionsAround(rng, answer, spread, howMany) {
    var seen = {}, out = [answer];
    seen[String(answer)] = true;
    var guard = 0;
    while (out.length < howMany && guard < 200) {
      guard++;
      var d = intBetween(rng, 1, spread);
      if (rng() < 0.5) d = -d;
      var cand = answer + d;
      if (cand < 0) continue;
      if (seen[String(cand)]) continue;
      seen[String(cand)] = true;
      out.push(cand);
    }
    var bump = 1;
    while (out.length < howMany) {
      var fill = answer + spread + bump;
      if (!seen[String(fill)]) { seen[String(fill)] = true; out.push(fill); }
      bump++;
      if (bump > 100) break;
    }
    return shuffled(rng, out);
  }

  function dotPoints(rng, n) {
    /* viewBox 100 x 62，留 10 的邊距，盡量不重疊 */
    var pts = [], guard = 0;
    while (pts.length < n && guard < 900) {
      guard++;
      var x = 11 + rng() * 78;
      var y = 11 + rng() * 40;
      var ok = true;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i].x - x, dy = pts[i].y - y;
        if (dx * dx + dy * dy < 190) { ok = false; break; }
      }
      if (ok) pts.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    }
    /* 極端狀況下補滿，避免題目與答案對不上 */
    var col = 0;
    while (pts.length < n) {
      pts.push({ x: 11 + (col % 7) * 13, y: 11 + Math.floor(col / 7) * 15 });
      col++;
    }
    return pts;
  }

  function makeTask(kind, index, rng, pick) {
    var id = 'q' + (index + 1);
    var base = { id: id, index: index, kind: kind, interrupted: false };

    if (kind === 'anagram') {
      var word = pick;
      var chars = String(word).split('');
      var mixed = shuffled(rng, chars);
      var guard = 0;
      while (mixed.join('') === word && guard < 12) { mixed = shuffled(rng, chars); guard++; }
      base.title = '重排三個字';
      base.prompt = '照順序點三個字，把它排成一個常見的詞。';
      base.label = '重排三個字：' + mixed.join('／');
      base.data = { word: word, chars: mixed };
      return base;
    }

    if (kind === 'add') {
      var a = pick[0], b = pick[1], sum = a + b;
      base.title = '兩個數字相加';
      base.prompt = a + ' ＋ ' + b + ' 等於多少？';
      base.label = '心算：' + a + ' ＋ ' + b;
      base.data = { a: a, b: b, answer: sum, options: optionsAround(rng, sum, 9, 4) };
      return base;
    }

    if (kind === 'count') {
      var c = pick;
      var total = intBetween(rng, 4, 9);
      base.title = '數一數';
      base.prompt = '畫面上有幾個' + c.name + '圓點？';
      base.label = '數一數有幾個' + c.name + '圓點';
      base.data = {
        colorKey: c.key, colorName: c.name, hex: c.hex,
        total: total, points: dotPoints(rng, total),
        options: optionsAround(rng, total, 3, 4)
      };
      return base;
    }

    /* odd */
    var s = pick;
    var cells = [];
    var len = 6;
    var ans = intBetween(rng, 0, len - 1);
    for (var i = 0; i < len; i++) cells.push(i === ans ? s.diff : s.same);
    base.title = '找出不一樣的';
    base.prompt = '一排' + s.name + '裡，點出' + s.hint + '。';
    base.label = '一排' + s.name + '裡，找出' + s.hint;
    base.data = { same: s.same, diff: s.diff, name: s.name, hint: s.hint, cells: cells, answerIndex: ans };
    return base;
  }

  /**
   * 產生第二章的小任務清單。同一個 seed 一定產生完全相同的題目。
   * @param {number|string} seed
   * @param {number} [count=8]
   */
  function generateTasks(seed, count) {
    var n = clampInt(count, 1, 12, 8);
    var rng = makeRng('tasks|' + hashSeed(seed));

    var kinds = [];
    for (var i = 0; i < n; i++) kinds.push(KIND_ORDER[i % KIND_ORDER.length]);
    kinds = shuffled(rng, kinds);

    var pools = {
      anagram: shuffled(rng, ANAGRAM_WORDS),
      add: shuffled(rng, ADD_PAIRS),
      count: shuffled(rng, DOT_COLORS),
      odd: shuffled(rng, ODD_SETS)
    };
    var used = { anagram: 0, add: 0, count: 0, odd: 0 };

    var tasks = [];
    for (var k = 0; k < n; k++) {
      var kind = kinds[k];
      var pool = pools[kind];
      var pick = pool[used[kind] % pool.length];
      used[kind]++;
      tasks.push(makeTask(kind, k, rng, pick));
    }
    return tasks;
  }

  /**
   * 決定哪幾題會被強制打斷。回傳由小到大排好的索引陣列。
   * 第 0 題盡量留給使用者做完，讓他先熟悉操作。
   */
  function decideInterrupted(seed, count, interruptCount) {
    var total = clampInt(count, 0, 999, 0);
    var want = clampInt(interruptCount, 0, total, 0);
    if (total <= 0 || want <= 0) return [];

    var pool = [];
    for (var i = 1; i < total; i++) pool.push(i);
    if (want > pool.length) pool.unshift(0);
    if (pool.length === 0) return [];

    var rng = makeRng('cut|' + hashSeed(seed));
    var picked = shuffled(rng, pool).slice(0, Math.min(want, pool.length));
    picked.sort(function (a, b) { return a - b; });
    return picked;
  }

  /** 把打斷旗標蓋回題目上（回傳新陣列，不改動原物件的 interrupted 以外欄位） */
  function applyInterrupts(tasks, indexes) {
    var flag = {};
    (Array.isArray(indexes) ? indexes : []).forEach(function (i) {
      if (isFiniteNumber(i)) flag[String(Math.floor(i))] = true;
    });
    return (Array.isArray(tasks) ? tasks : []).map(function (t, i) {
      if (!t || typeof t !== 'object') return t;
      t.interrupted = !!flag[String(i)];
      return t;
    });
  }

  /** 拆成「被打斷」與「已完成」兩組 id：互斥，且聯集就是全部 */
  function splitTasks(tasks) {
    var interrupted = [], completed = [];
    (Array.isArray(tasks) ? tasks : []).forEach(function (t) {
      if (!t || typeof t !== 'object') return;
      if (t.interrupted) interrupted.push(String(t.id));
      else completed.push(String(t.id));
    });
    return { interrupted: interrupted, completed: completed };
  }

  /** 一次組好一輪：題目 + 打斷名單 + 回想清單順序 */
  function buildRun(seed, opts) {
    opts = opts || {};
    var count = clampInt(opts.count, 1, 12, 8);
    var want = isFiniteNumber(opts.interruptCount) || typeof opts.interruptCount === 'string'
      ? clampInt(opts.interruptCount, 0, count, 0)
      : Math.floor(count / 2);
    var tasks = applyInterrupts(generateTasks(seed, count), decideInterrupted(seed, count, want));
    var split = splitTasks(tasks);
    return {
      seed: seed,
      count: tasks.length,
      tasks: tasks,
      interruptedIds: split.interrupted,
      completedIds: split.completed,
      recallOrder: recallOrder(seed, tasks),
      interruptMs: INTERRUPT_MS
    };
  }

  /** 回想清單的呈現順序（跟作答順序刻意不同，但一樣可重現） */
  function recallOrder(seed, tasks) {
    var rng = makeRng('recall|' + hashSeed(seed));
    return shuffled(rng, (Array.isArray(tasks) ? tasks : []).map(function (t) {
      return (t && typeof t === 'object') ? String(t.id) : '';
    }).filter(function (s) { return s !== ''; }));
  }

  /**
   * 依使用者勾選，算出兩組各記得幾題。任何情況都不會回傳 NaN／Infinity。
   */
  function recallStats(tasks, checkedIds) {
    var list = Array.isArray(tasks) ? tasks : [];
    var set = {};
    (Array.isArray(checkedIds) ? checkedIds : []).forEach(function (id) {
      if (id === null || id === undefined) return;
      set[String(id)] = true;
    });

    var iTotal = 0, cTotal = 0, iRecall = 0, cRecall = 0;
    list.forEach(function (t) {
      if (!t || typeof t !== 'object') return;
      var on = !!set[String(t.id)];
      if (t.interrupted) { iTotal++; if (on) iRecall++; }
      else { cTotal++; if (on) cRecall++; }
    });

    var iPct = percent(iRecall, iTotal);
    var cPct = percent(cRecall, cTotal);
    var comparable = iTotal > 0 && cTotal > 0;
    var direction = 'na';
    if (comparable) {
      if (iPct > cPct) direction = 'interrupted';
      else if (cPct > iPct) direction = 'completed';
      else direction = 'tie';
    }

    return {
      total: iTotal + cTotal,
      checkedTotal: iRecall + cRecall,
      interruptedTotal: iTotal,
      completedTotal: cTotal,
      interruptedRecalled: iRecall,
      completedRecalled: cRecall,
      interruptedPct: iPct,
      completedPct: cPct,
      gap: iPct - cPct,
      comparable: comparable,
      direction: direction
    };
  }

  /* ---------- 第四章：清單 ---------- */

  var LIMIT = { title: 80, field: 60, list: 60 };
  var PLAN_FIELDS = ['step', 'when', 'where'];
  var FIELD_LABEL = { step: '下一步', when: '什麼時候', where: '在哪裡' };

  function makeTodo(input, id) {
    var src = (input && typeof input === 'object') ? input : {};
    return {
      id: cleanText(id !== undefined ? id : src.id, 40) || 'n0',
      what: cleanText(src.what, LIMIT.title),
      step: cleanText(src.step, LIMIT.field),
      when: cleanText(src.when, LIMIT.field),
      where: cleanText(src.where, LIMIT.field),
      done: !!src.done
    };
  }

  /** 三格都有實質內容才算「已排定」。只有空白、少填一格都是 false。 */
  function isScheduled(todo) {
    if (!todo || typeof todo !== 'object') return false;
    for (var i = 0; i < PLAN_FIELDS.length; i++) {
      if (!isFilled(todo[PLAN_FIELDS[i]])) return false;
    }
    return true;
  }

  /** 還缺哪幾格（給提示文字用） */
  function missingFields(todo) {
    var out = [];
    var t = (todo && typeof todo === 'object') ? todo : {};
    PLAN_FIELDS.forEach(function (k) { if (!isFilled(t[k])) out.push(k); });
    return out;
  }

  function missingLabel(todo) {
    return missingFields(todo).map(function (k) { return FIELD_LABEL[k]; }).join('、');
  }

  /** 一句話摘要，給已排定的卡片用 */
  function planLine(todo) {
    if (!isScheduled(todo)) return '';
    return '下一步 ' + cleanText(todo.step, LIMIT.field) +
      '｜' + cleanText(todo.when, LIMIT.field) +
      '｜' + cleanText(todo.where, LIMIT.field);
  }

  /** 從 localStorage 讀回來的東西一律先過這裡 */
  function sanitizeTodos(raw) {
    var arr = Array.isArray(raw) ? raw : [];
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      if (out.length >= LIMIT.list) break;
      var item = arr[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      var t = makeTodo(item, item.id);
      if (!t.what) continue;
      var id = t.id;
      if (!id || seen[id]) id = 'n' + i + '_' + out.length;
      if (seen[id]) continue;
      seen[id] = true;
      t.id = id;
      out.push(t);
    }
    return out;
  }

  /** 直接吃字串：壞掉的 JSON 也只會拿到空陣列 */
  function parseStore(text) {
    if (typeof text !== 'string' || text === '') return [];
    var data = null;
    try { data = JSON.parse(text); } catch (e) { return []; }
    if (Array.isArray(data)) return sanitizeTodos(data);
    if (data && typeof data === 'object' && Array.isArray(data.items)) return sanitizeTodos(data.items);
    return [];
  }

  /** 清單統計：吵鬧區幾則、已排定幾則、已完成幾則 */
  function summarize(todos) {
    var list = Array.isArray(todos) ? todos : [];
    var total = 0, noisy = 0, scheduled = 0, done = 0;
    list.forEach(function (t) {
      if (!t || typeof t !== 'object') return;
      total++;
      if (t.done) { done++; return; }
      if (isScheduled(t)) scheduled++;
      else noisy++;
    });
    return {
      total: total, noisy: noisy, scheduled: scheduled, done: done,
      quietPct: percent(scheduled + done, total)
    };
  }

  /* ---------- 匯出 ---------- */

  var API = {
    VERSION: '1.0.0',
    INTERRUPT_MS: INTERRUPT_MS,
    SETTLE_MS: SETTLE_MS,
    LIMIT: LIMIT,
    PLAN_FIELDS: PLAN_FIELDS,
    FIELD_LABEL: FIELD_LABEL,
    KIND_ORDER: KIND_ORDER,

    isFiniteNumber: isFiniteNumber,
    clampInt: clampInt,
    hashSeed: hashSeed,
    makeRng: makeRng,
    shuffled: shuffled,
    percent: percent,
    cleanText: cleanText,
    isFilled: isFilled,

    generateTasks: generateTasks,
    decideInterrupted: decideInterrupted,
    applyInterrupts: applyInterrupts,
    splitTasks: splitTasks,
    recallOrder: recallOrder,
    buildRun: buildRun,
    recallStats: recallStats,

    makeTodo: makeTodo,
    isScheduled: isScheduled,
    missingFields: missingFields,
    missingLabel: missingLabel,
    planLine: planLine,
    sanitizeTodos: sanitizeTodos,
    parseStore: parseStore,
    summarize: summarize
  };

  root.Zeigarnik = API;

  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);

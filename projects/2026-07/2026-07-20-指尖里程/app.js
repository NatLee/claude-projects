/* ==========================================================================
 * 指尖里程表
 * 量測同一段文字在 QWERTY / Dvorak / Colemak 上的手指移動距離。
 *
 * 幾何模型：標準 ANSI 錯位鍵盤，鍵距 19.05 mm。
 *   上排 x 偏移 0、主行 +0.25、下排 +0.75（Tab 1.5u / Caps 1.75u / Shift 2.25u 的差）
 * 移動模型：手指從主行起始鍵出發、按鍵、回到起始鍵，計來回距離。
 *   空白鍵由拇指負責，不計距離，並中斷連擊／換手的計算。
 * ========================================================================== */
'use strict';

var KEY_UNIT_MM = 19.05;
var ROW_X_OFFSET = [0, 0.25, 0.75];

var LAYOUTS = {
  qwerty:  { name: 'QWERTY',  rows: ['qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'] },
  dvorak:  { name: 'Dvorak',  rows: ["',.pyfgcrl/=", 'aoeuidhtns-',  ';qjkxbmwvz'] },
  colemak: { name: 'Colemak', rows: ['qwfpgjluy;[]', "arstdhneio'",  'zxcvbkm,./'] }
};
var LAYOUT_IDS = ['qwerty', 'dvorak', 'colemak'];

/* 標準十指分工：欄位 → 手指（L/R + 1 食指 … 4 小指） */
var FINGER_BY_COL = ['L4', 'L3', 'L2', 'L1', 'L1', 'R1', 'R1', 'R2', 'R3', 'R4'];
var HOME_COL = { L4: 0, L3: 1, L2: 2, L1: 3, R1: 6, R2: 7, R3: 8, R4: 9 };
var FINGERS = ['L4', 'L3', 'L2', 'L1', 'R1', 'R2', 'R3', 'R4'];
var TRAIL_MAX = 28;

function fingerForCol(c) {
  return FINGER_BY_COL[Math.min(c, FINGER_BY_COL.length - 1)];
}
function keyCenter(row, col) {
  return { x: col + ROW_X_OFFSET[row] + 0.5, y: row + 0.5 };
}
function homeCenter(finger) {
  return keyCenter(1, HOME_COL[finger]);
}

function buildIndex(id) {
  var map = new Map();
  LAYOUTS[id].rows.forEach(function (rowStr, r) {
    Array.prototype.forEach.call(rowStr, function (ch, c) {
      var finger = fingerForCol(c);
      var p = keyCenter(r, c);
      var h = homeCenter(finger);
      map.set(ch, {
        ch: ch, row: r, col: c, finger: finger, hand: finger.charAt(0),
        x: p.x, y: p.y,
        travelMm: 2 * Math.hypot(p.x - h.x, p.y - h.y) * KEY_UNIT_MM
      });
    });
  });
  return map;
}

var KEY_INDEX = {
  qwerty: buildIndex('qwerty'),
  dvorak: buildIndex('dvorak'),
  colemak: buildIndex('colemak')
};

/* 單一字元的移動距離（公釐）；打不到的字元回傳 0 */
function travelOf(ch, id) {
  var k = KEY_INDEX[id].get(String(ch).toLowerCase());
  return k ? k.travelMm : 0;
}

/* 核心分析：純函式，可在 node 下單獨驗證 */
function analyze(text, id) {
  var idx = KEY_INDEX[id];
  var mm = 0, mapped = 0, home = 0, sfb = 0, pairs = 0, alt = 0;
  var counts = new Map();
  var trail = [];
  var prev = null;

  for (var i = 0; i < text.length; i++) {
    var k = idx.get(text.charAt(i).toLowerCase());
    if (!k) { prev = null; continue; }   // 空白、換行、數字等：中斷連擊鏈
    mm += k.travelMm;
    mapped++;
    if (k.row === 1) home++;
    counts.set(k.ch, (counts.get(k.ch) || 0) + 1);
    trail.push(k);
    if (trail.length > TRAIL_MAX) trail.shift();
    if (prev) {
      pairs++;
      if (prev.finger === k.finger && prev.ch !== k.ch) sfb++;
      if (prev.hand !== k.hand) alt++;
    }
    prev = k;
  }

  return {
    meters: mm / 1000,
    mapped: mapped,
    homePct: mapped ? (home / mapped) * 100 : 0,
    sfbPct:  pairs  ? (sfb  / pairs)  * 100 : 0,
    altPct:  pairs  ? (alt  / pairs)  * 100 : 0,
    counts: counts,
    trail: trail
  };
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    LAYOUTS: LAYOUTS, KEY_INDEX: KEY_INDEX, FINGERS: FINGERS, HOME_COL: HOME_COL,
    analyze: analyze, travelOf: travelOf, keyCenter: keyCenter,
    homeCenter: homeCenter, fingerForCol: fingerForCol, buildIndex: buildIndex
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 以下為瀏覽器端；node 載入時整段跳過
 * ══════════════════════════════════════════════════════════════════════════ */
if (typeof document !== 'undefined') (function () {

  var LS = 'kbdmile.';
  var U = 60, PAD_X = 18, PAD_Y = 12;

  var ACCENT = { qwerty: [240, 168, 48], dvorak: [167, 139, 250], colemak: [79, 209, 197] };
  var BASE_KEY = [38, 33, 30];

  var PRESETS = [
    'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. ' +
    'How vexingly quick daft zebras jump! Sphinx of black quartz, judge my vow.',

    'Hi Chris, thanks for sending the draft over so quickly. I read it on the train this morning ' +
    'and I think the middle section is much stronger than the last version. My only worry is the ' +
    'budget table on page four, which still assumes the old headcount. Could you take another pass ' +
    'at it before Thursday? Happy to jump on a call if that is easier.',

    'Before the typewriter, a letter was a slow and private thing. The machine made writing loud, ' +
    'mechanical and strangely public, and it put a curious row of levers between the hand and the ' +
    'page. Every one of those levers had to be somewhere, and once they had found their places, ' +
    'nobody could ever afford to move them again.'
  ];

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var srcEl     = $('#src');
  var keysG     = $('#keys');
  var trailsG   = $('#trails');
  var fingersG  = $('#fingers');
  var verdictEl = $('#verdict');
  var odoEl     = $('#odo');
  var odoNumEl  = $('#odo-num');
  var demoBtn   = $('#demo-btn');

  var mReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced  = mReduced.matches;

  var layout = 'qwerty';
  var results = {};
  var keyEls = {};        // ch → { rect, label }
  var fingerEls = {};     // finger → circle
  var trailEls = { L: null, R: null };

  /* ---------- 小工具 ---------- */
  function lerpRGB(a, b, t) {
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
                    Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
                    Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function fmtMeters(v) { return v < 10 ? v.toFixed(2) : v.toFixed(1); }

  function tweener(el, fmt) {
    var cur = 0, target = 0, raf = 0;
    function step() {
      var d = target - cur;
      if (reduced || Math.abs(d) < 0.005) {
        cur = target; el.textContent = fmt(cur); raf = 0; return;
      }
      cur += d * 0.2;
      el.textContent = fmt(cur);
      raf = requestAnimationFrame(step);   // 分頁隱藏時瀏覽器自動暫停
    }
    return function (v) {
      target = v;
      if (!raf) raf = requestAnimationFrame(step);
    };
  }

  var setNum = {};
  LAYOUT_IDS.forEach(function (id) {
    setNum[id] = tweener($('[data-num="' + id + '"]'), fmtMeters);
  });
  var setStat = {};
  ['home', 'sfb', 'alt'].forEach(function (k) {
    setStat[k] = tweener($('[data-stat="' + k + '"]'), function (v) { return v.toFixed(1); });
  });
  var setGap   = tweener($('[data-v="gap"]'), fmtMeters);
  var setKm    = tweener($('[data-v="km"]'), function (v) { return v.toFixed(1); });
  var setOdo   = tweener(odoNumEl, function (v) { return v.toFixed(1); });

  /* ---------- 建鍵盤 ---------- */
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildBoard() {
    keysG.textContent = '';
    trailsG.textContent = '';
    fingersG.textContent = '';
    keyEls = {}; fingerEls = {};

    LAYOUTS[layout].rows.forEach(function (rowStr, r) {
      Array.prototype.forEach.call(rowStr, function (ch, c) {
        var x = PAD_X + (c + ROW_X_OFFSET[r]) * U;
        var y = PAD_Y + r * U;
        var g = el('g', { class: 'key' });
        var rect = el('rect', {
          x: x + 3, y: y + 3, width: U - 6, height: U - 6, rx: 10,
          fill: lerpRGB(BASE_KEY, BASE_KEY, 0), stroke: 'rgba(245,239,230,.09)'
        });
        var label = el('text', {
          x: x + U / 2, y: y + U / 2, 'text-anchor': 'middle',
          'dominant-baseline': 'central', class: 'key-label'
        });
        label.textContent = ch.toUpperCase();
        g.appendChild(rect); g.appendChild(label);
        /* 主行起始鍵下方的小凸點，跟真鍵盤上的定位點一樣 */
        if (r === 1 && [0, 1, 2, 3, 6, 7, 8, 9].indexOf(c) !== -1) {
          g.appendChild(el('rect', {
            x: x + U / 2 - 8, y: y + U - 13, width: 16, height: 2.5, rx: 1.25, class: 'homebump'
          }));
        }
        keysG.appendChild(g);
        keyEls[ch] = { rect: rect, label: label };
      });
    });

    ['L', 'R'].forEach(function (h) {
      var p = el('polyline', { class: 'trail trail-' + h, points: '' });
      trailsG.appendChild(p);
      trailEls[h] = p;
    });

    FINGERS.forEach(function (f) {
      var h = homeCenter(f);
      var dot = el('circle', {
        class: 'finger finger-' + f.charAt(0), r: 11,
        cx: PAD_X + h.x * U, cy: PAD_Y + h.y * U
      });
      fingersG.appendChild(dot);
      fingerEls[f] = dot;
    });
  }

  function keyXY(k) {
    return { cx: PAD_X + k.x * U, cy: PAD_Y + k.y * U };
  }

  /* ---------- 畫面更新 ---------- */
  function paintBoard(res) {
    var accent = ACCENT[layout];
    var max = 0;
    res.counts.forEach(function (v) { if (v > max) max = v; });

    for (var ch in keyEls) {
      var n = res.counts.get(ch) || 0;
      var t = max ? Math.pow(n / max, 0.6) : 0;
      keyEls[ch].rect.setAttribute('fill', lerpRGB(BASE_KEY, accent, t * 0.92));
      keyEls[ch].label.style.fill = t > 0.55 ? '#12100e' : 'rgba(245,239,230,.72)';
      keyEls[ch].label.style.fontWeight = t > 0.35 ? '700' : '500';
    }

    /* 手指軌跡：最近幾步走過的路 */
    ['L', 'R'].forEach(function (h) {
      var pts = res.trail.filter(function (k) { return k.hand === h; })
        .slice(-10)
        .map(function (k) { var p = keyXY(k); return p.cx + ',' + p.cy; });
      trailEls[h].setAttribute('points', pts.join(' '));
    });

    /* 手指位置：最近 4 步用過的手指停在那顆鍵上，其餘回主行 */
    var recent = res.trail.slice(-4);
    FINGERS.forEach(function (f) {
      var target = null;
      for (var i = recent.length - 1; i >= 0; i--) {
        if (recent[i].finger === f) { target = recent[i]; break; }
      }
      var pos = target ? keyXY(target)
                       : (function () { var h = homeCenter(f); return { cx: PAD_X + h.x * U, cy: PAD_Y + h.y * U }; })();
      fingerEls[f].setAttribute('cx', pos.cx);
      fingerEls[f].setAttribute('cy', pos.cy);
      fingerEls[f].classList.toggle('is-away', !!target);
    });
  }

  function update() {
    var text = srcEl.value;
    LAYOUT_IDS.forEach(function (id) { results[id] = analyze(text, id); });

    var maxM = Math.max(0.0001,
      results.qwerty.meters, results.dvorak.meters, results.colemak.meters);

    LAYOUT_IDS.forEach(function (id) {
      var r = results[id];
      setNum[id](r.meters);
      $('[data-bar="' + id + '"]').style.width = (r.meters / maxM * 100) + '%';
      var foot = $('[data-delta="' + id + '"]');
      if (id === 'qwerty') {
        foot.textContent = '基準';
      } else if (results.qwerty.meters > 0.0001) {
        var pct = (1 - r.meters / results.qwerty.meters) * 100;
        foot.textContent = pct >= 0 ? '少走 ' + pct.toFixed(0) + '%' : '多走 ' + (-pct).toFixed(0) + '%';
      } else {
        foot.textContent = '—';
      }
    });

    var cur = results[layout];
    setStat.home(cur.homePct);
    setStat.sfb(cur.sfbPct);
    setStat.alt(cur.altPct);
    paintBoard(cur);

    /* 揭曉 */
    var q = results.qwerty, mapped = q.mapped;
    if (mapped >= 80) {
      var bestId = results.dvorak.meters <= results.colemak.meters ? 'dvorak' : 'colemak';
      var best = results[bestId];
      var gap = q.meters - best.meters;
      $('[data-v="chars"]').textContent = mapped.toLocaleString('zh-TW');
      $('[data-v="best"]').textContent = LAYOUTS[bestId].name;
      $('[data-v="pct"]').textContent = (gap / q.meters * 100).toFixed(0);
      setGap(gap);
      setKm((gap / mapped) * 3000 * 365 / 1000);
      if (verdictEl.hidden) {
        verdictEl.hidden = false;
        requestAnimationFrame(function () { verdictEl.classList.add('is-in'); });
      }
    } else if (!verdictEl.hidden) {
      verdictEl.hidden = true;
      verdictEl.classList.remove('is-in');
    }
  }

  /* ---------- 累積里程（localStorage，前綴 kbdmile.） ---------- */
  var total = 0;
  try { total = parseFloat(localStorage.getItem(LS + 'total')) || 0; } catch (e) {}
  function showOdo() {
    if (total <= 0) return;
    odoEl.hidden = false;
    setOdo(total / 1000);
  }
  function addOdo(mm) {
    total += mm;
    try { localStorage.setItem(LS + 'total', String(total)); } catch (e) {}
    showOdo();
  }

  var prevValue = '';
  srcEl.addEventListener('input', function () {
    var v = srcEl.value;
    /* 只把「真的一個一個敲進去」的字算進累積里程，貼上與示範不算 */
    if (v.length === prevValue.length + 1 && v.indexOf(prevValue.slice(0, prevValue.length)) === 0) {
      addOdo(travelOf(v.charAt(v.length - 1), 'qwerty'));
    }
    prevValue = v;
    update();
  });

  /* ---------- 控制項 ---------- */
  $$('.chip[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      stopDemo();
      srcEl.value = PRESETS[+b.dataset.preset];
      prevValue = srcEl.value;
      update();
    });
  });

  $('#clear-btn').addEventListener('click', function () {
    stopDemo();
    srcEl.value = '';
    prevValue = '';
    update();
    srcEl.focus();
  });

  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      layout = t.dataset.tab;
      $$('.tab').forEach(function (o) {
        var on = o === t;
        o.classList.toggle('is-on', on);
        o.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.body.dataset.layout = layout;
      try { localStorage.setItem(LS + 'layout', layout); } catch (e) {}
      buildBoard();
      update();
    });
  });

  /* ---------- 自動示範 ---------- */
  var demoTimer = null, demoText = '', demoIdx = 0;

  function stopDemo() {
    if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
    demoBtn.textContent = '▶ 自動示範';
    demoBtn.classList.remove('is-playing');
  }

  function tickDemo() {
    if (demoIdx >= demoText.length) { stopDemo(); return; }
    srcEl.value = demoText.slice(0, ++demoIdx);
    prevValue = srcEl.value;
    update();
    demoTimer = setTimeout(tickDemo, 16);
  }

  function startDemo() {
    demoText = srcEl.value.trim() || PRESETS[2];
    if (reduced) {                       // 降級：不做逐字動畫，直接給結果
      srcEl.value = demoText;
      prevValue = demoText;
      update();
      return;
    }
    demoIdx = 0;
    srcEl.value = '';
    prevValue = '';
    demoBtn.textContent = '■ 停止';
    demoBtn.classList.add('is-playing');
    tickDemo();
  }

  demoBtn.addEventListener('click', function () {
    if (demoTimer) stopDemo(); else startDemo();
  });

  /* 分頁切走時停下逐字示範，別在背景空轉 */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && demoTimer) stopDemo();
  });

  /* ---------- 進場編排 ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach(function (n) { io.observe(n); });

  mReduced.addEventListener('change', function (e) {
    reduced = e.matches;
    document.body.classList.toggle('reduced', reduced);
    if (reduced && demoTimer) stopDemo();
  });
  document.body.classList.toggle('reduced', reduced);

  /* ---------- 啟動 ---------- */
  try {
    var saved = localStorage.getItem(LS + 'layout');
    if (saved && LAYOUTS[saved]) {
      layout = saved;
      $$('.tab').forEach(function (o) {
        var on = o.dataset.tab === layout;
        o.classList.toggle('is-on', on);
        o.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
  } catch (e) {}

  document.body.dataset.layout = layout;
  buildBoard();
  srcEl.value = PRESETS[0];
  prevValue = srcEl.value;
  update();
  showOdo();
})();

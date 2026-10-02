/* core.js — 「我握著她的手，鈴還是響了」的純函式核心（瀏覽器與 node 共用）
 *
 * 這頁的高潮是同一段黑暗演兩次：第一次用普通的小腿，第二次用胡迪尼那條
 * 綁了一整天繃帶、腫起來的小腿。兩次發生的「物理事件」完全相同（phys），
 * 差別只在「感覺得到多小的移動」（perceive 的門檻）。
 *
 *   phys(t, n)      她左腳踝的真實狀態：d＝相對原位挪了幾吋、press＝她要你
 *                   「用力壓」的那一下、lift＝腳離地、tension＝踩鈴時肌腱收緊
 *   perceive(n, S)  用門檻模型把真實狀態翻成「你的腿覺得發生了什麼」：
 *                   0.3 秒內的位移超過門檻才會被察覺；她叫你用力壓的那一刻，
 *                   門檻乘上 mask（大動作蓋過小動作）。
 *   footPos(t, n)   燈亮後畫在平面圖上的那條腳的路徑（SVG 座標）
 *
 * 門檻數字是示意，不是量測值——頁面只主張「慢、小、被大動作蓋住的移動，
 * 一般觸覺抓不到；變敏感之後抓得到」，這也是胡迪尼自己的說法。
 */
(function (root) {
  'use strict';

  /* ── 時間表（秒）── */
  var STEP = 0.18, STEP_DUR = 0.25;                 /* 一頓一頓：每下約 0.18 吋 */
  var STEP_TIMES = [4.0, 4.9, 5.6, 6.5, 7.1, 8.8, 9.5];
  var PRESS_T = 7.6, PRESS_DUR = 0.6;               /* 「用力壓住我的腳踝」 */
  var PRESS_STEP = 0.5, PRESS_STEP_T = 7.72, PRESS_STEP_DUR = 0.25; /* 又挪了半吋 */
  var LIFT_T = 10.2, LIFT_DUR = 0.6;                /* 腳離開地板 */
  var TAP0 = 12.0, TAP_GAP = 0.9;                   /* 踩鈴盒 */
  var DROP_DUR = 0.5, BACK_DUR = 2.2, SETTLE = 2.6; /* 放下、滑回原位、靜下來 */

  var DMAX = STEP * STEP_TIMES.length + PRESS_STEP; /* 1.76 吋 */

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }

  function taps(n) { var a = []; for (var i = 0; i < n; i++) a.push(TAP0 + i * TAP_GAP); return a; }
  function backStart(n) { return TAP0 + (n - 1) * TAP_GAP + 0.9; }
  function duration(n) { return backStart(n) + BACK_DUR + SETTLE; }

  function phys(t, n) {
    var d = 0, i;
    for (i = 0; i < STEP_TIMES.length; i++) d += STEP * smooth((t - STEP_TIMES[i]) / STEP_DUR);
    d += PRESS_STEP * smooth((t - PRESS_STEP_T) / PRESS_STEP_DUR);
    var press = (t >= PRESS_T && t < PRESS_T + PRESS_DUR) ? Math.sin(Math.PI * (t - PRESS_T) / PRESS_DUR) : 0;
    var bs = backStart(n);
    var lift = smooth((t - LIFT_T) / LIFT_DUR) * (1 - smooth((t - bs) / DROP_DUR));
    d *= 1 - smooth((t - bs - DROP_DUR * 0.6) / BACK_DUR);
    var tension = 0, tp = taps(n);
    for (i = 0; i < tp.length; i++) {
      var x = (t - tp[i]) / 0.12;
      if (x > -1 && x < 1) tension = Math.max(tension, 0.6 * (1 - Math.abs(x)));
    }
    return { d: d, press: press, lift: lift, tension: tension };
  }

  /* ── 兩條腿 ── */
  var ORDINARY = { step: 0.4, tens: 0.9, mask: 3 };  /* 平常的小腿 */
  var TENDER = { step: 0.05, tens: 0.2, mask: 3 };   /* 綁了一整天繃帶、腫起來的小腿 */

  /* 回傳等距取樣的「感覺」：felt＝腿覺得她的腳踝挪了多少；spike＝感覺到的肌腱收緊。
     模型：0.3 秒內的位移過了門檻，才「注意到」——注意到的那一刻，感覺一口氣追上
     真實位置（anchor 重設）；沒注意到的慢慢挪，感覺就停在原地。 */
  function perceive(n, S, hz) {
    hz = hz || 30;
    var dt = 1 / hz, N = Math.ceil(duration(n) * hz) + 1, W = 0.3;
    var felt = 0, anchor = 0, T = [], F = [], K = [], D = [];
    for (var i = 0; i < N; i++) {
      var t = i * dt;
      var p = phys(t, n), pw = phys(Math.max(0, t - W), n);
      var thr = S.step * (p.press > 0.25 ? S.mask : 1);
      if (Math.abs(p.d - pw.d) >= thr) { felt += p.d - anchor; anchor = p.d; }
      T.push(t); F.push(felt); D.push(p.d);
      K.push(p.tension >= S.tens ? p.tension : 0);
    }
    return { t: T, felt: F, spike: K, real: D, dt: dt };
  }

  /* 數「感覺到的肌腱收緊」有幾下（連續非零算一下） */
  function countSpikes(spike) {
    var c = 0, on = false;
    for (var i = 0; i < spike.length; i++) {
      if (spike[i] > 0 && !on) { c++; on = true; } else if (spike[i] === 0) on = false;
    }
    return c;
  }

  /* ── 平面圖（SVG 座標 400×300）：她的左腳 → 往前挪 → 抬起越過你的右腳 → 鈴盒蓋 ── */
  var REST = [170, 156], FWD = [167, 136], OVER = [146, 124], LID = [111, 150];
  var PTS = [REST, FWD, OVER, LID];
  function lerp(a, b, k) { return a + (b - a) * k; }
  function footPos(t, n) {
    var p = phys(t, n);
    var s = (p.d / DMAX) + 2 * p.lift;              /* 0..3：d 管第一段、lift 管後兩段 */
    s = Math.max(0, Math.min(3, s));
    var seg = Math.min(2, Math.floor(s)), k = s - seg;
    var a = PTS[seg], b = PTS[seg + 1];
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k) + 4 * (p.tension / 0.6) * p.lift];
  }
  /* 取樣成 SVG 路徑；from/to 秒，去掉太近的點 */
  function pathD(n, from, to, hz) {
    hz = hz || 40;
    var out = [], last = null;
    for (var t = from; t <= to + 1e-9; t += 1 / hz) {
      var q = footPos(t, n);
      if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.6) continue;
      out.push((out.length ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1));
      last = q;
    }
    return out.join(' ');
  }

  /* ── 時間軸：只有「握著」的時候才前進；事件落在 (t0, t1] 才觸發，所以每個只觸發一次
        （腳本裡的事件時間一律 > 0） ── */
  function advance(state, dt, holding, events) {
    var t0 = state.t, end = state.end;
    if (!holding || state.done) return { t: t0, fired: [], done: !!state.done };
    var t1 = Math.min(end, t0 + Math.max(0, dt));
    var fired = [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].t > t0 && events[i].t <= t1) fired.push(events[i]);
    }
    return { t: t1, fired: fired, done: t1 >= end };
  }

  /* ── 腳本：兩夜同樣的物理，不同的旁白 ── */
  function script(kind, n) {
    var tp = taps(n), bs = backStart(n), ev = [];
    function cap(t, text, cls) { ev.push({ t: t, type: 'cap', text: text, cls: cls || '' }); }
    ev.push({ t: 2.6, type: 'knock' });
    var ZH = ['零', '一', '兩', '三', '四', '五', '六', '七', '八', '九'];
    if (kind === 'A') {
      cap(0.4, '很黑。黑到分不出眼睛是開著還是閉著。');
      cap(2.7, '（咚、咚）桌子底下，敲了兩下。', 'snd');
      cap(5.2, '她的呼吸變得又深又慢。');
      cap(7.9, '房間另一頭冒出一個男人的聲音，粗聲粗氣——大家說，華特來了。');
      cap(10.4, '你開口：「華特，可以響' + (ZH[n] || n) + '下嗎？」', 'you');
    } else {
      cap(0.4, '同樣的黑。她的左腳踝貼著你腫起來的那一截。');
      cap(2.7, '（咚、咚）桌子底下，敲了兩下。', 'snd');
      cap(4.3, '……腿上有東西。很小。');
      cap(5.7, '她的腳踝在挪。很慢，一頓、一頓。');
      cap(7.5, '「用力壓住我的腳踝，你就知道它還在。」', 'say');
      cap(8.4, '她壓過來的那一下——又挪了半吋。');
      cap(10.2, '她的腳，離開了地板。');
      cap(11.1, '有人問：華特，可以按鈴嗎？', 'you');
    }
    for (var i = 0; i < tp.length; i++) ev.push({ t: tp[i], type: 'ring', i: i, n: n });
    if (kind === 'A') {
      cap(tp[0] + 0.05, '（鈴——）聲音從她腳前的地板傳上來。', 'snd');
      cap(bs + 0.3, '鈴停了。');
      cap(bs + 1.6, '她的左手一直在你手裡。她的腳踝一直貼著你。');
    } else {
      cap(tp[0] + 0.05, '（鈴——）每響一下，你的小腿都感覺到她的肌腱一緊。', 'snd');
      cap(bs + 0.3, '鈴停了。她的腿滑回去，腳放回你腳邊。');
      cap(bs + 1.9, '手在，腳踝在，跟剛才一模一樣。可是你的腿記得。');
    }
    ev.push({ t: duration(n), type: 'end' });
    ev.sort(function (a, b) { return a.t - b.t; });
    return ev;
  }

  /* ── 十年：按住多久＝過了幾個萬聖夜（1927–1936） ── */
  var YEAR_SEC = 0.95;
  function yearAt(sec) {
    var k = Math.floor(Math.max(0, sec) / YEAR_SEC) + 1;
    return 1926 + Math.max(1, Math.min(10, k));
  }

  /* ── 指紋：疊合進度 0..1 → 對上的特徵點數（Dudley 1932：24 處） ── */
  var MINUTIAE = 24;
  function matchCount(p) { return Math.max(0, Math.min(MINUTIAE, Math.floor(clamp01(p) * MINUTIAE + 1e-9))); }

  /* 可重現的亂數（xorshift32） */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  /* 指紋：一組扭曲的同心紋，帶斷點（端點＝特徵點）。同一個 seed 一定畫出同一枚。 */
  var PCX = 100, PCY = 118, ORX = 80, ORY = 104;
  function inOutline(x, y, pad) {
    var dx = (x - PCX) / (ORX - (pad || 0)), dy = (y - PCY) / (ORY - (pad || 0));
    return dx * dx + dy * dy <= 1;
  }
  function printRidges(seed) {
    var R = rng(seed), TAU = Math.PI * 2;
    var ph1 = R() * TAU, ph2 = R() * TAU, ph3 = R() * TAU, lean = (R() - 0.5) * 0.5;
    var paths = [], ends = [];
    for (var k = 1; k <= 19; k++) {
      var r0 = 5.1 * k + 1.5;
      var gaps = [], ng = k < 3 ? 0 : 1 + Math.floor(R() * 2.6);
      for (var g = 0; g < ng; g++) gaps.push(R() * TAU);
      var cx = PCX + Math.sin(ph1) * k * 0.55, cy = PCY + 6 + Math.cos(ph2) * k * 0.35;
      var segs = [], cur = [];
      for (var i = 0; i <= 160; i++) {
        var th = i / 160 * TAU, inGap = false;
        for (g = 0; g < gaps.length; g++) {
          var dd = Math.abs(((th - gaps[g]) % TAU + TAU * 1.5) % TAU - Math.PI);
          if (dd > Math.PI - 0.085) { inGap = true; break; }
        }
        var r = r0 * (1 + 0.075 * Math.sin(2 * th + ph1) + 0.045 * Math.sin(3 * th + ph2))
              + 1.4 * Math.min(1, k / 6) * Math.sin(5 * th + ph3 + k * 0.35);   /* 核心附近別抖成星形 */
        var x = cx + r * Math.cos(th) * 0.8 + lean * (r * Math.sin(th)) * 0.2;
        var y = cy + r * Math.sin(th) * 1.04;
        if (inGap || !inOutline(x, y, 3)) {
          if (cur.length > 1) segs.push(cur);
          cur = [];
        } else cur.push([x, y]);
      }
      if (cur.length > 1) segs.push(cur);
      for (var s = 0; s < segs.length; s++) {
        var sg = segs[s], d = '';
        for (var j = 0; j < sg.length; j++) d += (j ? 'L' : 'M') + sg[j][0].toFixed(1) + ' ' + sg[j][1].toFixed(1);
        paths.push(d);
        if (sg.length > 6 && k >= 3) {
          var a = sg[0], b = sg[sg.length - 1];
          if (inOutline(a[0], a[1], 12)) ends.push(a);
          if (inOutline(b[0], b[1], 12)) ends.push(b);
        }
      }
    }
    /* 取 24 個分散的端點：最遠點取樣（先取離核心最近的，之後每次取「離已選點最遠」的） */
    var minutiae = [], chosen = [];
    if (ends.length) {
      var first = 0, best = Infinity;
      for (var e0 = 0; e0 < ends.length; e0++) {
        var dc = Math.hypot(ends[e0][0] - PCX, ends[e0][1] - PCY);
        if (dc < best) { best = dc; first = e0; }
      }
      chosen.push(ends[first]);
      while (chosen.length < Math.min(MINUTIAE, ends.length)) {
        var far = -1, farD = -1;
        for (var c = 0; c < ends.length; c++) {
          var md = Infinity;
          for (var q = 0; q < chosen.length; q++) md = Math.min(md, Math.hypot(ends[c][0] - chosen[q][0], ends[c][1] - chosen[q][1]));
          if (md > farD) { farD = md; far = c; }
        }
        chosen.push(ends[far]);
      }
    }
    for (var m = 0; m < chosen.length; m++) minutiae.push([+chosen[m][0].toFixed(1), +chosen[m][1].toFixed(1)]);
    return { paths: paths, minutiae: minutiae, outline: { cx: PCX, cy: PCY, rx: ORX, ry: ORY } };
  }

  var CORE = {
    STEP: STEP, DMAX: DMAX, TAP0: TAP0, TAP_GAP: TAP_GAP, PRESS_T: PRESS_T, LIFT_T: LIFT_T,
    REST: REST, FWD: FWD, OVER: OVER, LID: LID, ORDINARY: ORDINARY, TENDER: TENDER,
    YEAR_SEC: YEAR_SEC, MINUTIAE: MINUTIAE,
    taps: taps, backStart: backStart, duration: duration, phys: phys, perceive: perceive,
    countSpikes: countSpikes, footPos: footPos, pathD: pathD, advance: advance, script: script,
    yearAt: yearAt, matchCount: matchCount, printRidges: printRidges, inOutline: inOutline, smooth: smooth
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  else root.CORE = CORE;
})(typeof window !== 'undefined' ? window : globalThis);

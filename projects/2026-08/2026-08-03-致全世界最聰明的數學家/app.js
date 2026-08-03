/* ==========================================================================
 * 致全世界最聰明的數學家 —— 互動
 * 依賴 physics.js（純函式，另有 node 斷言測試）
 * 世界座標：A=(0,0)，B=(1, BY)，y 向下。物理一律在世界座標算，
 * 只有繪圖才換算成像素，時間因此與螢幕大小無關。
 * ========================================================================== */
(function () {
  'use strict';

  var LS = 'brachi2608.';           // localStorage 專屬前綴
  var BY = 0.62;                    // B 的世界高度
  var VIEW_Y = 0.80;                // 畫布縱向可視到的世界高度（B 下方留空間讓人畫深弧）
  var GW = 2.0;                     // 世界重力，調到讓一場比賽約 1.2–2.5 秒
  var COL = { you: '#5ec8e5', rival: '#e0a94a', line: '#8fa4c9', hump: '#c9607a', dip: '#7ddba3' };

  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (t) { return (Math.round(t * 100) / 100).toFixed(2); };

  /* ---------- 動態偏好：減少動態 ---------- */
  var mqRM = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = mqRM.matches;
  if (mqRM.addEventListener) mqRM.addEventListener('change', function (e) { reduceMotion = e.matches; });
  else if (mqRM.addListener) mqRM.addListener(function (e) { reduceMotion = e.matches; });

  /* ---------- 單一 rAF 排程器：沒有任務就不轉；分頁隱藏或離屏就停 ---------- */
  var jobs = [];
  var rafId = 0, lastT = 0;
  function loop(now) {
    rafId = 0;
    var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
    lastT = now;
    var alive = [];
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      if (j.dead) continue;
      if (j.visible !== false && !document.hidden) { if (j.step(dt) === false) { j.dead = true; continue; } }
      alive.push(j);
    }
    jobs = alive;
    if (jobs.length) rafId = requestAnimationFrame(loop); else lastT = 0;
  }
  function addJob(j) {
    j.dead = false;
    jobs.push(j);
    if (!rafId) { lastT = 0; rafId = requestAnimationFrame(loop); }
    return j;
  }
  document.addEventListener('visibilitychange', function () {
    lastT = 0;
    if (!document.hidden && jobs.length && !rafId) rafId = requestAnimationFrame(loop);
  });

  /* ---------- canvas：CSS 尺寸決定一切，dpr 回寫前先比對，避免每幀翻倍 ---------- */
  function fit(cv) {
    var r = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width));
    var h = Math.max(1, Math.round(r.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cv._w = w; cv._h = h;
    return ctx;
  }
  /* 只有尺寸真的變了才回呼（ResizeObserver 每幀翻倍的經典地雷） */
  function onResize(cv, cb) {
    var lw = 0, lh = 0;
    var ro = new ResizeObserver(function () {
      var r = cv.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height);
      if (w === lw && h === lh) return;
      lw = w; lh = h;
      cb();
    });
    ro.observe(cv);
  }
  /* 離屏暫停 */
  function pauseOffscreen(cv, job) {
    var io = new IntersectionObserver(function (es) {
      job.visible = es[0].isIntersecting;
      if (job.visible && !rafId && jobs.length) { lastT = 0; rafId = requestAnimationFrame(loop); }
    }, { threshold: 0.01 });
    io.observe(cv);
  }

  /* ---------- 世界 → 像素（拉伸填滿，供第一、二幕） ----------
   * viewY：畫布縱向要涵蓋到多深的世界座標。
   * 第一幕沒人會畫到 B 以下，收緊一點才不會在底下留一大條空白；
   * 第二幕要留空間給你畫深弧，用完整的 VIEW_Y。 */
  function mapper(cv, padL, padR, padT, padB, viewY) {
    var w = cv._w, h = cv._h;
    var vy = viewY || VIEW_Y;
    var iw = w - padL - padR, ih = h - padT - padB;
    return {
      vy: vy,
      x: function (wx) { return padL + wx * iw; },
      y: function (wy) { return padT + (wy / vy) * ih; },
      invX: function (px) { return (px - padL) / iw; },
      invY: function (py) { return ((py - padT) / ih) * vy; }
    };
  }

  /* ---------- 候選路徑 ---------- */
  function powPath(p, n) {
    var a = [];
    n = n || 420;
    for (var i = 0; i <= n; i++) { var u = i / n; a.push({ x: u, y: BY * Math.pow(u, p) }); }
    return a;
  }
  var CYC = window.cycloidPoints(0, 0, 1, BY, 600);   // 那位匿名者的曲線
  var TRACKS = {
    line: { name: '最短的那條', key: 'A', color: COL.line, pts: powPath(1) },
    hump: { name: '順順的那條', key: 'B', color: COL.hump, pts: powPath(1.5) },
    dip:  { name: '先摔下去的那條', key: 'C', color: COL.dip, pts: powPath(0.45) }
  };
  Object.keys(TRACKS).forEach(function (k) {
    var d = window.descentTime(TRACKS[k].pts, GW);
    TRACKS[k].time = d.time; TRACKS[k].cum = d.cum;
  });
  var CYC_D = window.descentTime(CYC.pts, GW);

  /* ---------- 共用繪圖零件 ---------- */
  function drawFrame(ctx, m, w, h) {
    ctx.clearRect(0, 0, w, h);
    // 淡淡的水平參考線
    ctx.strokeStyle = 'rgba(143,164,201,.08)';
    ctx.lineWidth = 1;
    for (var i = 1; i <= 3; i++) {
      var y = m.y(m.vy * i / 4);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }
  function drawPeg(ctx, m, wx, wy, label, color) {
    var x = m.x(wx), y = m.y(wy);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.globalAlpha = .35; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color; ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.textAlign = wx < .5 ? 'left' : 'right'; ctx.textBaseline = wx < .5 ? 'top' : 'bottom';
    ctx.fillText(label, x + (wx < .5 ? 14 : -14), y + (wx < .5 ? 6 : -8));
    ctx.restore();
  }
  function strokePath(ctx, m, pts, color, width, alpha) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.strokeStyle = color; ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x(pts[0].x), m.y(pts[0].y));
    for (var i = 1; i < pts.length; i++) ctx.lineTo(m.x(pts[i].x), m.y(pts[i].y));
    ctx.stroke();
    ctx.restore();
  }
  function drawBead(ctx, m, p, color) {
    var x = m.x(p.x), y = m.y(p.y);
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }

  /* ---------- 看板 ---------- */
  function board(el, rows) {
    el.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div');
      var sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = r.color;
      var l = document.createElement('span'); l.className = 'lbl'; l.textContent = r.label;
      var v = document.createElement('span'); v.className = 'val'; v.textContent = r.value;
      d.appendChild(sw); d.appendChild(l); d.appendChild(v);
      if (r.tag) { var t = document.createElement('span'); t.className = 'tag'; t.textContent = r.tag; d.appendChild(t); }
      el.appendChild(d);
    });
  }
  function say(el, lines) {
    el.innerHTML = '';
    lines.forEach(function (h) { var p = document.createElement('p'); p.innerHTML = h; el.appendChild(p); });
  }

  /* ---------- 幕的解鎖 ----------
   * 每一幕在解鎖前是 display:none，畫布量到的尺寸是 0。
   * 解鎖後必須重新量一次再畫，不能只依賴 ResizeObserver 的時機。 */
  var refits = {};
  function reveal(id, focusId) {
    var s = $(id);
    if (!s.hidden) return;
    s.hidden = false;
    requestAnimationFrame(function () {
      if (refits[id]) refits[id]();
      s.classList.add('is-in');
      s.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      if (focusId && $(focusId)) setTimeout(function () { $(focusId).focus({ preventScroll: true }); }, reduceMotion ? 0 : 700);
    });
  }

  /* ══════════════════════════════════════════════════════════════
   * 第一幕：三條軌道
   * ════════════════════════════════════════════════════════════ */
  (function act1() {
    var cv = $('raceCanvas'), ctx = fit(cv);
    var m = mapper(cv, 46, 34, 30, 34, 0.70);
    var picked = null, running = null, finished = false;
    var order = ['line', 'hump', 'dip'];

    function remap() { ctx = fit(cv); m = mapper(cv, 46, 34, 30, 34, 0.70); render(running ? running.t : (finished ? 99 : 0)); }

    function render(t) {
      var w = cv._w, h = cv._h;
      drawFrame(ctx, m, w, h);
      order.forEach(function (k) {
        var tr = TRACKS[k];
        var dim = picked && picked !== k && !finished ? .30 : .62;
        strokePath(ctx, m, tr.pts, tr.color, picked === k ? 2.6 : 1.8, dim);
      });
      drawPeg(ctx, m, 0, 0, 'A', '#efe4cf');
      drawPeg(ctx, m, 1, BY, 'B', '#efe4cf');
      if (t > 0) {
        order.forEach(function (k) {
          var tr = TRACKS[k];
          drawBead(ctx, m, window.pointAtTime(tr.pts, tr.cum, t), tr.color);
        });
      } else {
        order.forEach(function (k) { drawBead(ctx, m, { x: 0, y: 0 }, TRACKS[k].color); });
      }
    }

    function rows(t) {
      return order.map(function (k) {
        var tr = TRACKS[k];
        var done = t >= tr.time;
        return {
          color: tr.color, label: tr.key + '　' + tr.name,
          value: (done ? fmt(tr.time) : fmt(Math.min(t, tr.time))) + ' 秒',
          tag: done ? '抵達' : ''
        };
      });
    }

    function finish() {
      finished = true;
      $('raceAgain').hidden = false;
      $('raceGo').disabled = true;
      board($('raceBoard'), rows(99));
      var win = order.slice().sort(function (a, b) { return TRACKS[a].time - TRACKS[b].time; })[0];
      var gapLine = (TRACKS.line.time - TRACKS.dip.time) / TRACKS.line.time * 100;
      var slowHump = (TRACKS.hump.time / TRACKS.line.time - 1) * 100;
      var head = picked === win
        ? '<strong>你押對了。</strong>'
        : '你押的是 ' + TRACKS[picked].key + '，' + (picked === 'line'
            ? '而<strong>最短的那條輸了</strong>。'
            : '而<strong>贏的是 C</strong>。');
      say($('act1Verdict'), [
        head + ' 先摔下去的 C 比直線快了 <strong>' + gapLine.toFixed(1) + '%</strong>；' +
          '看起來最優雅的 B，反而慢了 ' + slowHump.toFixed(0) + '%。',
        '道理其實不神秘：一開始就把高度換成速度，後面那段長長的路才跑得快。<span class="dim">最短的路，跟最快的路，是兩件事。</span>',
        '但 C 也不是答案。它只是<span class="dim">比較接近</span>而已——差在哪，下一幕見真章。'
      ]);
      $('go2').hidden = false;
    }

    function start() {
      remap();
      $('raceHint').hidden = true;
      $('raceAgain').hidden = true;
      $('raceGo').disabled = true;
      finished = false;
      var maxT = Math.max(TRACKS.line.time, TRACKS.hump.time, TRACKS.dip.time);
      if (reduceMotion) { render(99); finish(); return; }
      if (running) running.dead = true;
      running = addJob({
        t: 0,
        step: function (dt) {
          this.t += dt;
          render(this.t);
          board($('raceBoard'), rows(this.t));
          if (this.t > maxT + .45) { running = null; finish(); return false; }
          return true;
        }
      });
      pauseOffscreen(cv, running);
    }

    order.forEach(function (k) {
      $('bet-' + k).addEventListener('click', function () {
        if (running) return;
        picked = k;
        order.forEach(function (o) { $('bet-' + o).setAttribute('aria-pressed', String(o === k)); });
        $('raceGo').disabled = false;
        $('raceHint').hidden = true;
        if (finished) { finished = false; say($('act1Verdict'), []); $('go2').hidden = true; $('raceAgain').hidden = true; board($('raceBoard'), rows(0)); }
        render(0);
      });
    });
    $('raceGo').addEventListener('click', start);
    $('raceAgain').addEventListener('click', start);
    $('go1').addEventListener('click', function () { reveal('act1', 'bet-line'); });
    $('go2').addEventListener('click', function () { reveal('act2', 'drawClear'); });

    board($('raceBoard'), rows(0));
    render(0);
    refits.act1 = remap;
    onResize(cv, remap);
  }());

  /* ══════════════════════════════════════════════════════════════
   * 第二幕：換你畫
   * ════════════════════════════════════════════════════════════ */
  (function act2() {
    var cv = $('drawCanvas'), ctx = fit(cv);
    var m = mapper(cv, 46, 34, 30, 30);
    var drawing = false, raw = [], mine = null, mineD = null, running = null, sliderMode = false;

    function remap() { ctx = fit(cv); m = mapper(cv, 46, 34, 30, 30); render(running ? running.t : -1); }

    function render(t) {
      var w = cv._w, h = cv._h;
      drawFrame(ctx, m, w, h);
      // 參考虛線：直線
      ctx.save();
      ctx.setLineDash([3, 6]); ctx.globalAlpha = .28; ctx.strokeStyle = COL.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.x(0), m.y(0)); ctx.lineTo(m.x(1), m.y(BY)); ctx.stroke();
      ctx.restore();

      if (t >= 0) strokePath(ctx, m, CYC.pts, COL.rival, 2.4, .85);
      if (mine) strokePath(ctx, m, mine, COL.you, 2.6, 1);
      else if (raw.length > 1) strokePath(ctx, m, raw, COL.you, 2.6, .9);

      drawPeg(ctx, m, 0, 0, 'A', '#efe4cf');
      drawPeg(ctx, m, 1, BY, 'B', '#efe4cf');

      if (t >= 0) {
        drawBead(ctx, m, window.pointAtTime(CYC.pts, CYC_D.cum, t), COL.rival);
        drawBead(ctx, m, window.pointAtTime(mine, mineD.cum, t), COL.you);
      } else if (mine) {
        drawBead(ctx, m, { x: 0, y: 0 }, COL.you);
      }
    }

    /* 把畫出來的折線整理成合法路徑：x 單調、y 夾在可行範圍、輕度平滑、端點釘死 */
    function tidy(pts) {
      var a = [{ x: 0, y: 0 }];
      var lastX = 0;
      for (var i = 0; i < pts.length; i++) {
        var x = Math.min(1, Math.max(0, pts[i].x));
        var y = Math.min(VIEW_Y, Math.max(0.004, pts[i].y));
        if (x <= lastX + 0.0012) continue;
        lastX = x; a.push({ x: x, y: y });
      }
      if (a.length < 3) return null;
      if (a[a.length - 1].x < 0.94) return null;
      // 平滑兩趟（去掉手抖增加的長度，對時間才公平）
      for (var pass = 0; pass < 2; pass++) {
        for (var j = 1; j < a.length - 1; j++) a[j].y = (a[j - 1].y + 2 * a[j].y + a[j + 1].y) / 4;
      }
      a[a.length - 1] = { x: 1, y: BY };
      a[0] = { x: 0, y: 0 };
      if (a[1].y < 0.004) a[1] = { x: a[1].x, y: 0.004 };
      return a;
    }

    function setMine(pts) {
      mine = pts;
      mineD = mine ? window.descentTime(mine, GW) : null;
      $('drawGo').disabled = !(mine && mineD && mineD.ok);
      $('drawHint').hidden = !!mine;
      if (mine && mineD && !mineD.ok) {
        say($('act2Verdict'), ['這條路珠子走不完——中間有一段爬得比起點還高，它上不去。<span class="dim">再畫一條，全程往下。</span>']);
        mine = null; mineD = null;
      }
      render(-1);
    }

    /* --- 指標繪製 --- */
    function toWorld(e) {
      var r = cv.getBoundingClientRect();
      return { x: m.invX(e.clientX - r.left), y: m.invY(e.clientY - r.top) };
    }
    cv.addEventListener('pointerdown', function (e) {
      if (running) return;
      remap();                       // 起筆前先確定座標換算是這一刻的尺寸
      drawing = true; raw = []; mine = null; mineD = null; sliderMode = false;
      $('drawHint').hidden = true;
      cv.setPointerCapture(e.pointerId);
      raw.push(toWorld(e));
      render(-1);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      raw.push(toWorld(e));
      render(-1);
      e.preventDefault();
    });
    function endDraw() {
      if (!drawing) return;
      drawing = false;
      var t = tidy(raw);
      if (!t) {
        raw = [];
        say($('act2Verdict'), ['沒畫到 B。<span class="dim">從左上角的 A 按住，一路往右拖到右下角的 B 再放開。</span>']);
        render(-1);
        return;
      }
      say($('act2Verdict'), []);
      setMine(t);
    }
    /* 只在放開或被系統取消時結束。不要綁 pointerleave：
       筆畫掃出畫布邊界一下下就會被判定「畫完」，人還在畫就被截斷。 */
    cv.addEventListener('pointerup', endDraw);
    cv.addEventListener('pointercancel', endDraw);

    /* --- 滑桿（鍵盤替代路徑） --- */
    function sliderPath(v) {
      var p = 1.8 * Math.pow(0.20 / 1.8, v / 100);
      return { pts: powPath(p, 500), p: p };
    }
    function applySlider() {
      var v = +$('dip').value;
      var s = sliderPath(v);
      $('dipLabel').textContent = '　指數 ' + s.p.toFixed(2) + (Math.abs(s.p - 1) < .03 ? '（正好是直線）' : '');
      sliderMode = true; raw = [];
      say($('act2Verdict'), []);
      setMine(s.pts);
    }
    $('sliderToggle').addEventListener('click', function () {
      var box = $('sliderBox');
      var open = box.hidden;
      box.hidden = !open;
      this.setAttribute('aria-expanded', String(open));
      if (open) { applySlider(); $('dip').focus(); }
    });
    $('dip').addEventListener('input', applySlider);

    $('drawClear').addEventListener('click', function () {
      if (running) { running.dead = true; running = null; }
      raw = []; setMine(null);
      say($('act2Verdict'), []);
      board($('drawBoard'), []);
      $('drawHint').hidden = false;
      $('drawGo').disabled = true;
    });

    /* --- 比賽 --- */
    function best() { try { return parseFloat(localStorage.getItem(LS + 'best')); } catch (e) { return NaN; } }
    function saveBest(g) { try { localStorage.setItem(LS + 'best', String(g)); } catch (e) {} }

    function rows(t) {
      var a = t >= mineD.time, b = t >= CYC_D.time;
      return [
        { color: COL.you, label: '你畫的', value: fmt(Math.min(t, mineD.time)) + ' 秒', tag: a ? '抵達' : '' },
        { color: COL.rival, label: '那位匿名者', value: fmt(Math.min(t, CYC_D.time)) + ' 秒', tag: b ? '抵達' : '' }
      ];
    }

    function finish() {
      board($('drawBoard'), rows(1e9));
      var gap = (mineD.time / CYC_D.time - 1) * 100;
      var prev = best();
      var isBest = !(prev >= 0) || gap < prev - 0.005;
      if (gap >= 0 && isBest) saveBest(gap);
      var lead;
      if (gap < 0.05) lead = '<strong>你畫出來了。</strong>誤差不到千分之五——以手畫的標準，這就是那條線。';
      else if (gap < 1) lead = '<strong>差 ' + gap.toFixed(2) + '%。</strong>幾乎貼著它走。';
      else if (gap < 6) lead = '慢了 <strong>' + gap.toFixed(1) + '%</strong>。方向完全對，只差一點火候。';
      else lead = '慢了 <strong>' + gap.toFixed(1) + '%</strong>。';
      var lines = [lead + ' 你的 ' + fmt(mineD.time) + ' 秒 對 它的 ' + fmt(CYC_D.time) + ' 秒。'];
      if (mineD.time < CYC_D.time - 1e-9) {
        lines[0] = '你比它快了 ' + Math.abs(gap).toFixed(2) + '%——這在數學上不可能，代表你畫的折線在某處抄了近路。<span class="dim">畫細一點再試一次。</span>';
      }
      if (prev >= 0 && !isBest) lines.push('<span class="dim">你最好的一次是差 ' + prev.toFixed(2) + '%。</span>');
      else if (prev >= 0 && isBest && gap >= 0) lines.push('<span class="dim">新紀錄（前一次差 ' + prev.toFixed(2) + '%）。</span>');
      lines.push('不管你怎麼畫，那條金色的線永遠不會輸。<span class="dim">它是所有可能路徑裡最快的那一條，沒有之一——這件事有得證。</span>');
      say($('act2Verdict'), lines);
      $('go3').hidden = false;
      $('drawGo').disabled = false;
    }

    $('drawGo').addEventListener('click', function () {
      if (!mine || !mineD || !mineD.ok) return;
      remap();
      $('drawGo').disabled = true;
      $('drawHint').hidden = true;
      var maxT = Math.max(mineD.time, CYC_D.time);
      if (reduceMotion) { render(1e9); finish(); return; }
      if (running) running.dead = true;
      running = addJob({
        t: 0,
        step: function (dt) {
          this.t += dt;
          render(this.t);
          board($('drawBoard'), rows(this.t));
          if (this.t > maxT + .45) { running = null; finish(); return false; }
          return true;
        }
      });
      pauseOffscreen(cv, running);
    });

    render(-1);
    refits.act2 = remap;
    onResize(cv, remap);
  }());

  /* ══════════════════════════════════════════════════════════════
   * 第三幕：輪子畫線
   * ════════════════════════════════════════════════════════════ */
  (function act3() {
    var cv = $('wheelCanvas'), ctx = fit(cv);
    var sol = window.solveCycloid(1, BY);
    var TH = sol.theta;
    var job = null, theta = 0, done = false;

    function geo() {
      var w = cv._w, h = cv._h;
      var padX = 26, padT = 22, padB = 26;
      // 留下整顆輪子的寬度（起點在左、終點在右），開場時輪子不會被切一半
      var R = Math.min((w - padX * 2) / (TH + 2), (h - padT - padB) / 2.15);
      var x0 = padX + R;
      var y0 = padT;
      return { R: R, x0: x0, y0: y0, w: w, h: h };
    }
    function P(g, th) { return { x: g.x0 + g.R * (th - Math.sin(th)), y: g.y0 + g.R * (1 - Math.cos(th)) }; }

    function render() {
      var g = geo();
      ctx.clearRect(0, 0, g.w, g.h);
      // 天花板
      ctx.strokeStyle = 'rgba(143,164,201,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, g.y0); ctx.lineTo(g.w, g.y0); ctx.stroke();
      ctx.strokeStyle = 'rgba(143,164,201,.12)'; ctx.lineWidth = 1;
      for (var i = 0; i < g.w; i += 9) {
        ctx.beginPath(); ctx.moveTo(i, g.y0); ctx.lineTo(i - 6, g.y0 - 6); ctx.stroke();
      }
      // 已畫出的軌跡
      ctx.save();
      ctx.shadowColor = COL.rival; ctx.shadowBlur = 10;
      ctx.strokeStyle = COL.rival; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      var n = 240;
      for (var k = 0; k <= n; k++) {
        var p = P(g, theta * k / n);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      // 輪子
      var cx = g.x0 + g.R * theta, cy = g.y0 + g.R;
      ctx.strokeStyle = 'rgba(239,228,207,.55)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(cx, cy, g.R, 0, Math.PI * 2); ctx.stroke();
      /* 貼著天花板往右滾，接觸點在上方，輪子是「逆時針」轉（12 點 → 9 點 → 6 點）。
         輪輻位置向量是 (−R·sinθ, −R·cosθ)，x 帶負號才會跟粉筆同方向。
         輪輻整體偏 30°，讓粉筆那根不要剛好疊在灰輪輻上。 */
      ctx.strokeStyle = 'rgba(239,228,207,.22)'; ctx.lineWidth = 1;
      for (var s = 0; s < 6; s++) {
        var a = theta + Math.PI / 6 + s * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx - g.R * Math.sin(a), cy - g.R * Math.cos(a)); ctx.stroke();
      }
      /* 六根輪輻每 60° 就重複一次，光看輪輻分不出轉哪邊。
         在輪胎上補一段「跟在粉筆後面」的亮弧，打掉旋轉對稱，方向才一眼看得出來。
         canvas 的 arc 角度從 +x 軸起算、遞增方向在畫面上是順時針，
         所以粉筆「來時路」在角度較大的那一側。 */
      var phi = Math.atan2(-Math.cos(theta), -Math.sin(theta));
      ctx.save();
      ctx.strokeStyle = COL.rival; ctx.lineWidth = 4.5; ctx.lineCap = 'butt';
      var SEG = 9, SPAN = 1.25;
      for (var q = 0; q < SEG; q++) {
        ctx.globalAlpha = 0.62 * (1 - q / SEG) * (1 - q / SEG);
        ctx.beginPath();
        ctx.arc(cx, cy, g.R, phi + SPAN * q / SEG, phi + SPAN * (q + 1) / SEG + 0.012);
        ctx.stroke();
      }
      ctx.restore();
      var pt = P(g, theta);
      ctx.strokeStyle = COL.rival; ctx.lineWidth = 1.8; ctx.globalAlpha = .8;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.shadowColor = COL.rival; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff3dd'; ctx.fill();
      ctx.restore();
    }

    function finish() {
      done = true;
      say($('act3Verdict'), [
        '這條線叫<strong>擺線</strong>（cycloid）——輪子上一點滾過地面留下的痕跡。把它倒過來，就是下坡最快的那條路。',
        '它不是誰設計出來的形狀。它只是<span class="dim">一顆輪子轉一圈的副產品</span>，卻剛好是重力下最省時間的答案。'
      ]);
    }

    function start() {
      refit();
      $('wheelHint').hidden = true;
      $('wheelGo').textContent = '再滾一次';
      if (reduceMotion) { theta = TH; render(); finish(); return; }
      if (job) job.dead = true;
      theta = 0;
      job = addJob({
        step: function (dt) {
          theta = Math.min(TH, theta + dt * TH / 2.6);
          render();
          if (theta >= TH) { job = null; finish(); return false; }
          return true;
        }
      });
      pauseOffscreen(cv, job);
    }

    function refit() { fit(cv); render(); }

    $('wheelGo').addEventListener('click', start);
    $('go3').addEventListener('click', function () { reveal('act3', 'wheelGo'); });
    $('go4').addEventListener('click', function () { reveal('act4', 'bowlGo'); });
    render();
    refits.act3 = refit;
    onResize(cv, refit);
  }());

  /* ══════════════════════════════════════════════════════════════
   * 第四幕：等時線
   * ════════════════════════════════════════════════════════════ */
  (function act4() {
    var cv = $('bowlCanvas'), ctx = fit(cv);
    var PHI = [-2.95, -2.30, -1.70, -1.10, -0.50];
    var HUES = ['#e0a94a', '#e88f6a', '#c9607a', '#8f7fd4', '#5ec8e5'];
    var job = null, t = 0, passes = 0, flash = 0, revealed = false, ripple = 0;
    var HOLD = 0.55;                 // 第一次落底按住的那一拍（期間圓環會往外擴，不會看起來當掉）

    function geo() {
      var w = cv._w, h = cv._h;
      var r = Math.min((w - 44) / (2 * Math.PI), (h - 46) / 2);
      return { r: r, cx: w / 2, cy: Math.max(12, (h - 2 * r) / 2), w: w, h: h };
    }
    /* 碗：x = r(φ+sinφ)，y = r(1+cosφ)。φ=0 是最低點（畫布 y 最大），φ=±π 是兩側碗口。
       注意別把 y 再翻一次——翻了就變成拱門，珠子會往上聚。 */
    function Q(g, ph) { return { x: g.cx + g.r * (ph + Math.sin(ph)), y: g.cy + g.r * (1 + Math.cos(ph)) }; }

    function render() {
      var g = geo();
      ctx.clearRect(0, 0, g.w, g.h);
      // 碗
      ctx.strokeStyle = 'rgba(143,164,201,.42)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i <= 240; i++) {
        var ph = -Math.PI + 2 * Math.PI * i / 240;
        var p = Q(g, ph);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      // 最低點
      var b = Q(g, 0);
      ctx.strokeStyle = 'rgba(239,228,207,' + (0.18 + flash * 0.7) + ')';
      ctx.lineWidth = 1 + flash * 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 14 - flash * 30); ctx.lineTo(b.x, b.y + 6); ctx.stroke();
      // 珠子
      var w0 = window.tautochroneOmega(g.r, gPx(g));
      var pos = [], k, s, ph2;
      for (k = 0; k < PHI.length; k++) {
        s = Math.sin(PHI[k] / 2) * Math.cos(w0 * t);
        ph2 = 2 * Math.asin(Math.max(-1, Math.min(1, s)));
        pos.push(Q(g, ph2));
      }
      /* 珠子永遠是實心的、不會消失。快重合時再「疊上」一圈圈同心環，
         讓人看得出那一顆其實是五顆——用連續的 f 漸進，不做突然的切換。 */
      var spread = 0;
      for (k = 1; k < pos.length; k++) spread = Math.max(spread, Math.abs(pos[k].x - pos[0].x));
      var f = Math.max(0, Math.min(1, 1 - spread / 18));
      for (k = 0; k < pos.length; k++) {
        ctx.save();
        ctx.shadowColor = HUES[k]; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(pos[k].x, pos[k].y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = HUES[k]; ctx.fill();
        ctx.restore();
      }
      if (f > 0.02) {
        for (k = 0; k < pos.length; k++) {
          ctx.save();
          ctx.globalAlpha = f * (1 - ripple * 0.55);
          ctx.strokeStyle = HUES[k]; ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(pos[k].x, pos[k].y, 6.5 + ((PHI.length - 1 - k) * 4.6 + ripple * 22) * f, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    /* 讓「四分之一週期」固定在 1.05 秒左右，跟畫面大小無關 */
    function gPx(g) { return g.r * Math.PI * Math.PI / (1.05 * 1.05); }

    function finish() {
      if (revealed) return;
      revealed = true;
      say($('act4Verdict'), [
        '<strong>五顆一起到底。</strong>不是接近，是分毫不差——最高那顆多滑了十幾倍的路，也多換到了剛好夠用的速度。',
        '這叫<strong>等時線</strong>：在這條曲線上，從任何高度放手，抵達最低點的時間都等於 <span class="latin">π√(r/g)</span>，跟你放在哪裡完全無關。',
        '惠更斯 1659 年就發現了這件事，1673 年把它寫進《擺鐘論》。<span class="dim">他要的是一個不管擺幅大小、走時都一樣準的鐘——比伯努利出題早了三十七年。同一條曲線，兩次被人類撿到。</span>'
      ]);
      $('go5').hidden = false;
    }

    function start() {
      refit();
      $('bowlHint').hidden = true;
      $('bowlGo').textContent = '再放一次';
      if (reduceMotion) {
        var g = geo();
        t = Math.PI / (2 * window.tautochroneOmega(g.r, gPx(g)));
        render(); finish(); return;
      }
      if (job) job.dead = true;
      t = 0; passes = 0; flash = 0; ripple = 0;
      $('bowlStop').hidden = false;
      var g0 = geo();
      var quarter = Math.PI / (2 * window.tautochroneOmega(g0.r, gPx(g0)));
      var nextPass = quarter;
      var hold = 0;
      job = addJob({
        step: function (dt) {
          /* 五顆重合只有一瞬。第一次落底時把時間按住一拍——但畫面不是靜止的：
             同心環會持續往外擴散淡出，看起來是「撞擊」而不是當機。 */
          if (hold > 0) {
            hold -= dt;
            ripple = Math.min(1, 1 - hold / HOLD);
            flash = Math.max(0, flash - dt * 1.4);
            render();
            return true;
          }
          ripple = 0;
          t += dt;
          if (t >= nextPass) {
            passes++; flash = 1;
            if (passes === 1) { t = nextPass; hold = HOLD; finish(); }
            nextPass += quarter * 2;
          }
          flash = Math.max(0, flash - dt * 3.2);
          render();
          if (passes >= 7) { job = null; $('bowlStop').hidden = true; return false; }
          return true;
        }
      });
      pauseOffscreen(cv, job);
    }

    $('bowlGo').addEventListener('click', start);
    $('bowlStop').addEventListener('click', function () {
      if (job) { job.dead = true; job = null; }
      $('bowlStop').hidden = true;
      finish();
    });
    $('go5').addEventListener('click', function () { reveal('act5'); });
    function refit() { fit(cv); render(); }
    render();
    refits.act4 = refit;
    onResize(cv, refit);
  }());

}());

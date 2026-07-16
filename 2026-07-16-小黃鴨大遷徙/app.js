/* 小黃鴨大遷徙 — 洋流漂流模擬台
 * 以北極為中心的方位投影海圖。小鴨粒子沿科學家重建的漂流路線移動；
 * 登陸點與年份為真實紀錄，洋流走向為主要環流的風格化呈現。
 * localStorage 前綴：duck.
 */
(function () {
  'use strict';

  var LS = 'duck.';
  var Y0 = 1992.03, Y1 = 2008;

  /* ---------- 玩具種類 ---------- */
  var TYPES = {
    duck:   { name: '黃色小鴨', color: '#ffd23f', bleach: true },
    beaver: { name: '紅色海狸', color: '#e8613c', bleach: true },
    turtle: { name: '藍色烏龜', color: '#3fa3ff', bleach: false },
    frog:   { name: '綠色青蛙', color: '#54c96b', bleach: false }
  };
  var TYPE_KEYS = ['duck', 'beaver', 'turtle', 'frog'];

  var SPILL = { lat: 45, lon: 179 };

  /* ---------- 漂流路線（lat, lon[0-360°E], yr） ----------
   * land: 真實登陸紀錄；mark: 途經地點的一句提示。 */
  var ROUTES = [
    { name: '阿拉斯加灣', weight: 46, longExp: false, nodes: [
      { lat: 45, lon: 179, yr: 1992.03 },
      { lat: 50, lon: 193, yr: 1992.35 },
      { lat: 55, lon: 206, yr: 1992.60 },
      { lat: 57.5, lon: 216, yr: 1992.80 },
      { lat: 57.05, lon: 224.7, yr: 1992.88, land: {
        place: 'Sitka，阿拉斯加', date: '1992/11/16',
        fact: '落海十個月後，首批 10 隻被海灘拾荒者撿到，距落海點約 3,200 公里。', km: 3200, type: 'duck' } },
      { lat: 56, lon: 221, yr: 1993.30 },
      { lat: 55, lon: 218, yr: 1993.60, land: {
        place: '阿拉斯加灣（累計）', date: '1993/8',
        fact: '沿約 850 公里海岸線總共尋獲約 400 隻，回收率 1.4%——遠高於漂流瓶的百分之二。', type: 'beaver' } }
    ] },
    { name: '華盛頓州', weight: 12, longExp: false, nodes: [
      { lat: 45, lon: 179, yr: 1992.03 },
      { lat: 50, lon: 194, yr: 1992.40 },
      { lat: 56, lon: 210, yr: 1992.85 },
      { lat: 57, lon: 223, yr: 1993.15 },
      { lat: 53, lon: 229, yr: 1994.20 },
      { lat: 49, lon: 233, yr: 1995.40 },
      { lat: 48.4, lon: 235.3, yr: 1996.0, land: {
        place: '華盛頓州', date: '1996',
        fact: '科學家用洋流模型預測的第二波登陸，後來果然應驗。', type: 'turtle' } }
    ] },
    { name: '夏威夷・亞熱帶環流', weight: 16, longExp: true, nodes: [
      { lat: 45, lon: 179, yr: 1992.03 },
      { lat: 38, lon: 188, yr: 1992.50 },
      { lat: 30, lon: 195, yr: 1993.00 },
      { lat: 23, lon: 201, yr: 1993.60 },
      { lat: 20, lon: 205, yr: 1994.0, land: {
        place: '夏威夷', date: '1990 年代',
        fact: '一部分玩具南漂進北太平洋亞熱帶環流——正是「大垃圾帶」聚積的地方——再靠岸。', type: 'frog' } },
      { lat: 26, lon: 213, yr: 1995.20 },
      { lat: 32, lon: 204, yr: 1996.60 },
      { lat: 29, lon: 192, yr: 1998.00 },
      { lat: 23, lon: 199, yr: 1999.60 },
      { lat: 27, lon: 210, yr: 2001.20 },
      { lat: 31, lon: 200, yr: 2003.00 },
      { lat: 26, lon: 194, yr: 2005.00 },
      { lat: 24, lon: 202, yr: 2007.40 }
    ] },
    { name: '北極→大西洋', weight: 18, longExp: true, freeze: [1995.6, 2000.2], nodes: [
      { lat: 45, lon: 179, yr: 1992.03 },
      { lat: 52, lon: 198, yr: 1992.50 },
      { lat: 58, lon: 206, yr: 1992.95 },
      { lat: 60, lon: 203, yr: 1993.45 },
      { lat: 62, lon: 196, yr: 1994.10 },
      { lat: 65.9, lon: 191, yr: 1995.0, land: {
        place: '白令海峽', date: '約 1995',
        fact: '一支分隊向北漂出太平洋，穿過白令海峽進入北極海。', type: 'turtle' } },
      { lat: 72, lon: 189, yr: 1995.80 },
      { lat: 80, lon: 158, yr: 1997.30 },
      { lat: 87, lon: 120, yr: 1998.70 },
      { lat: 85, lon: 40, yr: 1999.70 },
      { lat: 80, lon: 6, yr: 2000.2, land: {
        place: '弗蘭姆海峽・北大西洋', date: '約 2000',
        fact: '在北極浮冰裡凍了約五年、隨冰橫越極點，冰融後釋放進大西洋。', type: 'frog' } },
      { lat: 70, lon: 342, yr: 2001.40 },
      { lat: 60, lon: 322, yr: 2002.20 },
      { lat: 41.7, lon: 310, yr: 2002.70, mark: '漂過鐵達尼號沉沒的海域' },
      { lat: 44, lon: 291, yr: 2003.2, land: {
        place: '新英格蘭', date: '2003',
        fact: '玩具商懸賞 100 美元，找回在新英格蘭、加拿大或冰島撿到的玩具。', type: 'duck' } },
      { lat: 50, lon: 332, yr: 2005.50 },
      { lat: 52, lon: 351, yr: 2006.60 },
      { lat: 50.5, lon: 356, yr: 2007.0, land: {
        place: '英國德文郡', date: '2007',
        fact: '模型預測會在英國登陸；但當年撿到的那隻經專家鑑定並非本批——傳說跑得比玩具還快。', type: 'duck' } }
    ] },
    { name: '仍在環流裡打轉', weight: 8, longExp: true, nodes: (function () {
      // 副極環流繞圈，永不上岸
      var ring = [ [52, 196], [56, 210], [56, 224], [50, 230], [44, 220], [42, 204], [46, 190], [52, 186] ];
      var out = [ { lat: 45, lon: 179, yr: 1992.03 } ];
      var yr = 1992.4, step = 0.26;
      for (var loop = 0; loop < 8; loop++) {
        for (var i = 0; i < ring.length; i++) {
          out.push({ lat: ring[i][0], lon: ring[i][1], yr: yr });
          yr += step;
          if (yr > Y1) break;
        }
        if (yr > Y1) break;
      }
      return out;
    })() }
  ];

  // 每條路線最後一個 land 節點的年份（用來判斷「已上岸」）
  ROUTES.forEach(function (r) {
    r.lastLandYr = null;
    for (var i = r.nodes.length - 1; i >= 0; i--) {
      if (r.nodes[i].land) { r.lastLandYr = r.nodes[i].yr; break; }
    }
  });

  /* 方向定位標籤 */
  var LABELS = [
    { lat: 46, lon: 178, t: '北太平洋' },
    { lat: 61, lon: 210, t: '阿拉斯加' },
    { lat: 66, lon: 186, t: '白令海峽' },
    { lat: 38, lon: 142, t: '日本' },
    { lat: 19, lon: 205, t: '夏威夷' },
    { lat: 72, lon: 318, t: '格陵蘭' },
    { lat: 52, lon: 332, t: '北大西洋' },
    { lat: 55, lon: 358, t: '英國' },
    { lat: 44, lon: 289, t: '新英格蘭' }
  ];

  /* ---------- DOM ---------- */
  var canvas = document.getElementById('ocean');
  var ctx = canvas.getContext('2d');
  var releaseBtn = document.getElementById('release');
  var mapHint = document.getElementById('mapHint');
  var playBtn = document.getElementById('playBtn');
  var resetBtn = document.getElementById('resetBtn');
  var speedInput = document.getElementById('speed');
  var scrub = document.getElementById('scrub');
  var ticksEl = document.getElementById('ticks');
  var live = document.getElementById('live');
  var logList = document.getElementById('logList');
  var logEmpty = document.getElementById('logEmpty');
  var logCount = document.getElementById('logCount');
  var elReleased = document.getElementById('statReleased');
  var elAdrift = document.getElementById('statAdrift');
  var elLanded = document.getElementById('statLanded');
  var elYear = document.getElementById('statYear');

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var REDUCE = reduceMQ.matches;

  /* ---------- 投影（方位等距，極點在中心） ---------- */
  var CX = 0, CY = 0, RAD = 0, SIZE = 0, DPR = 1;
  var LATMIN = 12;
  function project(lat, lon) {
    var rn = (90 - lat) / (90 - LATMIN);
    if (rn < 0) rn = 0;
    var th = lon * Math.PI / 180;
    return { x: CX - RAD * rn * Math.sin(th), y: CY - RAD * rn * Math.cos(th) };
  }

  function layout() {
    var cssW = canvas.clientWidth || 480;
    SIZE = cssW;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * DPR);
    canvas.height = Math.round(cssW * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CX = cssW / 2; CY = cssW / 2; RAD = cssW * 0.455;
    ROUTES.forEach(function (r) {
      r.pts = r.nodes.map(function (n) {
        var p = project(n.lat, n.lon); p.yr = n.yr; p.land = n.land; p.mark = n.mark; return p;
      });
    });
    SPILL.p = project(SPILL.lat, SPILL.lon);
  }

  /* ---------- 沿路線在某年的位置 ---------- */
  function posAt(route, yr) {
    var pts = route.pts;
    if (yr <= pts[0].yr) return { x: pts[0].x, y: pts[0].y, landed: false };
    var last = pts[pts.length - 1];
    if (yr >= last.yr) return { x: last.x, y: last.y, landed: route.lastLandYr != null };
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (yr >= a.yr && yr <= b.yr) {
        var t = (yr - a.yr) / (b.yr - a.yr || 1);
        // 平滑一下（smoothstep）
        var ts = t * t * (3 - 2 * t);
        return { x: a.x + (b.x - a.x) * ts, y: a.y + (b.y - a.y) * ts, landed: false };
      }
    }
    return { x: last.x, y: last.y, landed: false };
  }

  /* ---------- 粒子 ---------- */
  var TOTAL = 440;
  var ducks = [];
  function buildDucks() {
    ducks = [];
    ROUTES.forEach(function (r, ri) {
      var n = Math.max(4, Math.round(TOTAL * r.weight / 100));
      for (var i = 0; i < n; i++) {
        ducks.push({
          r: ri,
          type: TYPE_KEYS[i % 4],
          tOff: (Math.random() - 0.5) * 0.30,
          amp: 2 + Math.random() * 3,
          ph: Math.random() * 6.283,
          sp: 0.6 + Math.random() * 0.8,
          sz: 1.8 + Math.random() * 1.3
        });
      }
    });
  }

  /* ---------- 狀態 ---------- */
  var released = false, playing = false, simYear = Y0;
  var releasedCount = 0, releaseAnimT = 0;
  var reached = {};            // 本次已抵達的登陸點 place -> true
  var everFound = loadFound(); // 歷來收集
  var burstT = 0;
  var lastMark = null, markT = 0;

  function loadFound() {
    try { return JSON.parse(localStorage.getItem(LS + 'found') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveFound() {
    try { localStorage.setItem(LS + 'found', JSON.stringify(everFound)); } catch (e) {}
  }
  // 速度偏好
  try { var sp = localStorage.getItem(LS + 'speed'); if (sp) speedInput.value = sp; } catch (e) {}

  /* ---------- 顏色工具 ---------- */
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function duckColor(d, route) {
    var base = TYPES[d.type].color;
    var y = simYear + d.tOff;
    if (route.freeze && y >= route.freeze[0] && y <= route.freeze[1]) {
      return { c: mix(base, '#dcefff', 0.72), frost: true };
    }
    if (route.longExp && TYPES[d.type].bleach) {
      var f = (y - 1997) / 6; f = f < 0 ? 0 : f > 0.82 ? 0.82 : f;
      return { c: mix(base, '#eef5f8', f), frost: false };
    }
    return { c: base, frost: false };
  }

  /* ---------- 繪圖 ---------- */
  var foamPhase = 0;

  function draw(dt) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    drawGraticule();
    drawIceCap();
    drawGyres();
    drawCorridors();
    drawLabels();
    drawSpill();
    drawPins();
    if (released) drawDucks(dt);
    drawMark();
  }

  function drawGraticule() {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,190,220,0.10)';
    ctx.lineWidth = 1;
    [60, 40, 20].forEach(function (lat) {
      var rn = (90 - lat) / (90 - LATMIN) * RAD;
      ctx.beginPath(); ctx.arc(CX, CY, rn, 0, 6.2832); ctx.stroke();
    });
    for (var lon = 0; lon < 360; lon += 30) {
      var o = project(90, lon), e = project(LATMIN, lon);
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawIceCap() {
    var r = (90 - 72) / (90 - LATMIN) * RAD;
    var g = ctx.createRadialGradient(CX, CY, 0, CX, CY, r);
    g.addColorStop(0, 'rgba(220,238,250,0.16)');
    g.addColorStop(1, 'rgba(220,238,250,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, r, 0, 6.2832); ctx.fill();
    ctx.save();
    ctx.strokeStyle = 'rgba(200,230,245,0.16)';
    ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(CX, CY, r, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }

  function drawGyres() {
    // 兩個裝飾性環流環（副極 / 亞熱帶）
    ctx.save();
    ctx.strokeStyle = 'rgba(127,212,230,0.10)';
    ctx.lineWidth = 1.4;
    drawRing(project(52, 205), RAD * 0.17);
    drawRing(project(28, 200), RAD * 0.15);
    ctx.restore();
  }
  function drawRing(c, rr) {
    ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, 6.2832); ctx.stroke();
  }

  function drawCorridors() {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ROUTES.forEach(function (r) {
      var pts = r.pts;
      // 底層寬廊
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'rgba(60,140,180,0.16)';
      ctx.lineWidth = 9; ctx.stroke();
      // 上層細流
      ctx.strokeStyle = 'rgba(127,212,230,0.30)';
      ctx.lineWidth = 1.4;
      if (!REDUCE) { ctx.setLineDash([2, 9]); ctx.lineDashOffset = -foamPhase; }
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.restore();
  }

  function drawLabels() {
    ctx.save();
    ctx.fillStyle = 'rgba(147,180,200,0.55)';
    ctx.font = '11px "Noto Sans TC",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    LABELS.forEach(function (l) {
      var p = project(l.lat, l.lon);
      ctx.fillText(l.t, p.x, p.y);
    });
    // 北極
    ctx.fillStyle = 'rgba(200,230,245,0.6)';
    ctx.fillText('北極', CX, CY);
    ctx.restore();
  }

  function drawSpill() {
    var p = SPILL.p;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,63,0.85)';
    ctx.lineWidth = 1.6;
    var s = 5;
    ctx.beginPath(); ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s);
    ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); ctx.stroke();
    if (!released || burstT > 0) {
      var pr = released ? (1 - burstT) : 0;
      ctx.globalAlpha = released ? burstT : 0.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6 + pr * 30, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,210,63,0.85)';
    ctx.font = '10px ui-monospace,Menlo,Consolas,monospace';
    ctx.textAlign = 'center';
    ctx.fillText('落海點 1992', p.x, p.y + 16);
    ctx.restore();
  }

  function drawPins() {
    ctx.save();
    ROUTES.forEach(function (r) {
      r.pts.forEach(function (p) {
        if (!p.land) return;
        var lit = reached[p.land.place];
        var col = TYPES[p.land.type || 'duck'].color;
        if (lit) {
          ctx.shadowColor = col; ctx.shadowBlur = 12;
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 6.2832); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = col; ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 6.2832); ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = 'rgba(147,180,200,0.5)';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 6.2832); ctx.stroke();
        }
      });
    });
    ctx.restore();
  }

  function drawDucks(dt) {
    var trail = playing && !REDUCE;
    for (var i = 0; i < ducks.length; i++) {
      var d = ducks[i], route = ROUTES[d.r];
      var y = simYear + d.tOff;
      var p = posAt(route, y);
      var wob = REDUCE ? 0 : Math.sin(foamPhase * 0.04 * d.sp + d.ph) * d.amp;
      var wob2 = REDUCE ? 0 : Math.cos(foamPhase * 0.037 * d.sp + d.ph) * d.amp;
      var x = p.x + wob, yy = p.y + wob2;
      var dc = duckColor(d, route);
      if (trail) {
        var pv = posAt(route, y - 0.11);
        ctx.strokeStyle = dc.c; ctx.globalAlpha = 0.18; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(pv.x + wob, pv.y + wob2); ctx.lineTo(x, yy); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 光暈
      ctx.fillStyle = dc.c; ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.arc(x, yy, d.sz + 2.4, 0, 6.2832); ctx.fill();
      // 本體
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(x, yy, d.sz, 0, 6.2832); ctx.fill();
      if (dc.frost) {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(x, yy, d.sz + 1.4, 0, 6.2832); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMark() {
    if (!lastMark || markT <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, markT);
    ctx.fillStyle = 'rgba(233,244,250,0.9)';
    ctx.font = '12px "Noto Sans TC",system-ui,sans-serif';
    ctx.textAlign = 'center';
    var p = lastMark.p;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 6.2832);
    ctx.strokeStyle = 'rgba(233,244,250,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillText(lastMark.text, p.x, p.y - 12);
    ctx.restore();
  }

  /* ---------- 登陸偵測 ---------- */
  function checkEvents(prevYear) {
    ROUTES.forEach(function (r) {
      r.pts.forEach(function (p) {
        if (p.land && simYear >= p.yr && !reached[p.land.place]) {
          reached[p.land.place] = true;
          onLanding(p.land, p);
        }
        if (p.mark && simYear >= p.yr && prevYear < p.yr) {
          lastMark = { text: p.mark, p: p }; markT = 3.2;
        }
      });
    });
  }

  function onLanding(land, p) {
    if (!everFound[land.place]) { everFound[land.place] = true; saveFound(); }
    addLogItem(land);
    burstAt(p);
    announce(land.date + '，' + land.place + '：' + land.fact);
    updateLogCount();
  }

  var splashes = [];
  function burstAt(p) { splashes.push({ x: p.x, y: p.y, t: 1 }); }

  function addLogItem(land) {
    if (logEmpty) logEmpty.style.display = 'none';
    var li = document.createElement('li');
    li.className = 'log-item';
    var col = TYPES[land.type || 'duck'].color;
    li.innerHTML =
      '<span class="dot" style="background:' + col + ';color:' + col + '"></span>' +
      '<div><h3>' + land.place + '</h3>' +
      '<span class="when">' + land.date + (land.km ? ' · 漂了約 ' + land.km.toLocaleString() + ' km' : '') + '</span>' +
      '<p>' + land.fact + '</p></div>';
    logList.appendChild(li);
  }

  function announce(msg) { live.textContent = msg; }

  function updateLogCount() {
    var n = Object.keys(reached).length;
    logCount.textContent = ' 已收集 ' + n + ' / 8';
  }

  /* ---------- 統計 ---------- */
  function updateStats() {
    if (releaseAnimT > 0 && releasedCount < 28800) {
      releasedCount = Math.min(28800, releasedCount + Math.ceil((28800 - releasedCount) * 0.14) + 60);
    }
    elReleased.textContent = releasedCount.toLocaleString();
    // 依粒子比例換算成故事裡的數字
    var landedN = 0;
    for (var i = 0; i < ducks.length; i++) {
      var r = ROUTES[ducks[i].r];
      if (r.lastLandYr != null && (simYear + ducks[i].tOff) >= r.lastLandYr) landedN++;
    }
    var landedStory = released ? Math.round(28800 * landedN / ducks.length) : 0;
    var adriftStory = released ? 28800 - landedStory : 0;
    elLanded.textContent = landedStory.toLocaleString();
    elAdrift.textContent = adriftStory.toLocaleString();
    elYear.textContent = Math.floor(simYear);
  }

  /* ---------- 主迴圈 ---------- */
  var lastTs = 0, rafId = null, running = false;
  function loop(ts) {
    if (!running) return;
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    if (!REDUCE) foamPhase += dt * 60;
    if (burstT > 0) burstT = Math.max(0, burstT - dt * 1.4);
    if (markT > 0) markT -= dt;

    if (playing) {
      var prev = simYear;
      var v = parseFloat(speedInput.value) || 1.6;
      simYear += v * dt;
      if (simYear >= Y1) { simYear = Y1; setPlaying(false); }
      scrub.value = String(simYear);
      checkEvents(prev);
      updateStats();
    }

    // splash 疊加（在 duck 之上）
    draw(dt);
    if (splashes.length) drawSplashes(dt);

    rafId = requestAnimationFrame(loop);
  }
  function drawSplashes(dt) {
    ctx.save();
    for (var i = splashes.length - 1; i >= 0; i--) {
      var s = splashes[i]; s.t -= dt * 1.1;
      if (s.t <= 0) { splashes.splice(i, 1); continue; }
      ctx.globalAlpha = s.t * 0.8;
      ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, (1 - s.t) * 34 + 4, 0, 6.2832); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function startRAF() { if (!running) { running = true; lastTs = performance.now(); rafId = requestAnimationFrame(loop); } }
  function stopRAF() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  function setPlaying(on) {
    playing = on && released && simYear < Y1;
    playBtn.textContent = playing ? '⏸ 暫停' : '▶ 播放';
    playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }

  /* ---------- 事件 ---------- */
  function doRelease() {
    released = true;
    releaseBtn.classList.add('gone');
    mapHint.classList.add('gone');
    playBtn.disabled = false; resetBtn.disabled = false; scrub.disabled = false;
    simYear = Y0; scrub.value = String(Y0);
    reached = {}; logList.innerHTML = ''; if (logEmpty) logEmpty.style.display = '';
    releasedCount = 0; releaseAnimT = 1; burstT = 1;
    updateLogCount(); updateStats();
    announce('28,800 隻玩具落入北太平洋。');
    if (!REDUCE) setPlaying(true);
    else setPlaying(false);
  }

  function doReset() {
    simYear = Y0; scrub.value = String(Y0);
    reached = {}; logList.innerHTML = ''; if (logEmpty) logEmpty.style.display = '';
    splashes.length = 0; markT = 0; lastMark = null;
    releasedCount = 0; releaseAnimT = 1; burstT = 1;
    updateLogCount(); updateStats();
    if (!REDUCE) setPlaying(true); else { setPlaying(false); draw(0); }
  }

  releaseBtn.addEventListener('click', doRelease);
  playBtn.addEventListener('click', function () { setPlaying(!playing); if (playing) startRAF(); });
  resetBtn.addEventListener('click', doReset);

  scrub.addEventListener('input', function () {
    var prev = simYear;
    simYear = parseFloat(scrub.value);
    setPlaying(false);
    checkEvents(Math.min(prev, simYear));
    updateStats();
    if (!running) draw(0);
  });
  speedInput.addEventListener('change', function () {
    try { localStorage.setItem(LS + 'speed', speedInput.value); } catch (e) {}
  });

  // 鍵盤：空白鍵播放/暫停、左右步進
  document.addEventListener('keydown', function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!released) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); if (playing) startRAF(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); step(0.25); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); step(-0.25); }
  });
  function step(dy) {
    var prev = simYear;
    simYear = Math.max(Y0, Math.min(Y1, simYear + dy));
    setPlaying(false); scrub.value = String(simYear);
    checkEvents(Math.min(prev, simYear)); updateStats(); draw(0);
  }

  /* ---------- 時間軸刻度 ---------- */
  function buildTicks() {
    var marks = [[1992, '1992'], [1996, '’96'], [2000, '2000'], [2003, '’03'], [2007, '’07']];
    marks.forEach(function (m) {
      var s = document.createElement('span');
      s.textContent = m[1];
      s.style.left = ((m[0] - Y0) / (Y1 - Y0) * 100) + '%';
      ticksEl.appendChild(s);
    });
  }

  /* ---------- 效能：分頁隱藏 / 離屏暫停 ---------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopRAF(); else if (running === false) startRAF();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) startRAF(); else stopRAF(); });
    }, { threshold: 0.02 }).observe(canvas);
  }

  function onReduceChange() {
    REDUCE = reduceMQ.matches;
    if (REDUCE) setPlaying(false);
  }
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduceChange);
  else if (reduceMQ.addListener) reduceMQ.addListener(onReduceChange);

  window.addEventListener('resize', function () { layout(); draw(0); });

  /* ---------- 啟動 ---------- */
  layout();
  buildDucks();
  buildTicks();
  if (Object.keys(everFound).length >= 8) {
    logCount.textContent = ' 你之前已集滿 8 / 8';
  }
  updateStats();
  draw(0);
  startRAF();
})();

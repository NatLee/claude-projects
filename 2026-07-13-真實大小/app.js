/* 真實大小 · 地圖說的謊 — 2026-07-13 每日小專案
   純靜態、零外部相依。國界幾何：Natural Earth 110m（已內嵌於 data.js）。
   數學：麥卡托 / Equal Earth 投影、球面剛體旋轉、投影面積 shoelace 積分。
   倍率 = 投影後面積 ÷ 真實球面面積（piece.sr，立體角）→ 等積投影恆為 ×1.00。 */
(function () {
  'use strict';

  // ---------- 常數 ----------
  var LS = 'truesize.';               // localStorage 前綴（本專案專屬）
  var D2R = Math.PI / 180;
  var MAXLAT = 84;                    // 麥卡托上下裁切緯度
  var TW_KM2 = 36197;                 // 台灣面積，用來當「幾個台灣」的尺
  var AFRICA_KM2 = 30043862;
  var SQRT3 = Math.sqrt(3);
  var A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796; // Equal Earth 係數
  var STEP = 1.5;                     // 幾何加密步長（度）

  var PIECES = window.TS_PIECES || [];
  var BG = window.TS_BG || [];

  // 揭曉時的專屬台詞（未列到的用通用句）
  var LINES = {
    Greenland: '格陵蘭比<b>剛果民主共和國</b>（2,344,858 km²）還小。地圖上它跟非洲一樣大——實際上非洲是它的 <b>13.9 倍</b>。',
    Russia: '俄羅斯確實是世界最大的國家，但沒有地圖上那麼霸道：它其實<b>比非洲小</b>，非洲是它的 1.8 倍。',
    Canada: '加拿大和<b>中國、美國</b>其實在同一個量級，只是它坐得比較北，就被畫得比較大。',
    Iceland: '冰島在地圖上看起來跟英國差不多，實際上<b>不到英國的一半</b>（103,000 vs 243,610 km²）。',
    Sweden: '瑞典看起來很壯，其實只有<b>馬達加斯加的 77%</b>。',
    Finland: '芬蘭的真實面積，和<b>日本</b>幾乎一樣（338,145 vs 377,930 km²）。',
    Taiwan: '台灣位在低緯度，麥卡托幾乎沒放大它——<b>放大鏡從來不對準赤道</b>。被相對縮小的，一直是靠近赤道的地方。',
    Africa: '非洲大到可以把<b>美國、中國、印度和整個西歐</b>一起裝進去，還有剩。30,043,862 km²，這才是它真正的大小。',
    Mongolia: '蒙古看起來很遼闊，其實只有<b>阿根廷的 56%</b>。',
    DemRepCongo: '剛果民主共和國比<b>格陵蘭還大</b>——但地圖從來沒這樣告訴過你。'
  };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('map'), ctx = cv.getContext('2d');
  var stage = $('stage'), hint = $('hint'), toastEl = $('toast');
  var roEmoji = $('roEmoji'), roName = $('roName'), roLat = $('roLat');
  var ratioNum = $('ratioNum'), ratioVal = $('ratioVal'), ratioFill = $('ratioFill');
  var barTrue = $('barTrue'), barFake = $('barFake'), valTrue = $('valTrue'), valFake = $('valFake');
  var truthLine = $('truthLine'), chipsEl = $('chips');
  var btnMerc = $('btnMerc'), btnEE = $('btnEE');
  var btnEquator = $('btnEquator'), btnHome = $('btnHome'), btnClear = $('btnClear');
  var progEl = $('prog'), progFill = $('progFill');

  // ---------- 狀態 ----------
  var W = 900, H = 845, DPR = 1;
  var t = 0;                 // 0 = 麥卡托, 1 = Equal Earth（中間值＝變形動畫）
  var onMap = [];            // {p, lon, lat, ratio, rings(screen px)}
  var sel = null;
  var found = load('found', []);
  var drag = null;
  var raf = null;
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mq.matches;
  if (mq.addEventListener) mq.addEventListener('change', function (e) { reduced = e.matches; });

  function load(k, dflt) {
    try { var v = JSON.parse(localStorage.getItem(LS + k)); return v == null ? dflt : v; }
    catch (e) { return dflt; }
  }
  function save(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }

  // ---------- 投影 ----------
  function projMerc(lon, lat) {
    var f = Math.max(-MAXLAT, Math.min(MAXLAT, lat)) * D2R;
    return [lon * D2R, Math.log(Math.tan(Math.PI / 4 + f / 2))];
  }
  function projEE(lon, lat) {
    var f = lat * D2R, l = lon * D2R;
    var th = Math.asin(SQRT3 / 2 * Math.sin(f));
    var t2 = th * th, t6 = t2 * t2 * t2, t8 = t6 * t2;
    var den = 3 * (9 * A4 * t8 + 7 * A3 * t6 + 3 * A2 * t2 + A1);
    return [2 * SQRT3 * l * Math.cos(th) / den, A4 * th * t8 + A3 * th * t6 + A2 * th * t2 + A1 * th];
  }
  function invMerc(x, y) {
    return [x / D2R, (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / D2R];
  }
  function invEE(x, y) {
    var th = y, t2, t6, t8, i;
    for (i = 0; i < 14; i++) {
      t2 = th * th; t6 = t2 * t2 * t2; t8 = t6 * t2;
      var f = A4 * th * t8 + A3 * th * t6 + A2 * th * t2 + A1 * th - y;
      var fp = 9 * A4 * t8 + 7 * A3 * t6 + 3 * A2 * t2 + A1;
      th -= f / fp;
    }
    var s = Math.max(-1, Math.min(1, 2 * Math.sin(th) / SQRT3));
    t2 = th * th; t6 = t2 * t2 * t2; t8 = t6 * t2;
    var lon = 3 * x * (9 * A4 * t8 + 7 * A3 * t6 + 3 * A2 * t2 + A1) / (2 * SQRT3 * Math.cos(th)) / D2R;
    return [lon, Math.asin(s) / D2R];
  }
  // 兩個投影共用同一個尺度 k（單位球）→ 面積可直接互比
  function K() { return W / (2 * Math.PI); }
  function screenOf(lon, lat) {
    var k = K(), cx = W / 2, cy = H / 2;
    var m = projMerc(lon, lat);
    var sx = cx + m[0] * k, sy = cy - m[1] * k;
    if (t <= 0) return [sx, sy];
    var e = projEE(lon, lat);
    var ex = cx + e[0] * k, ey = cy - e[1] * k;
    return [sx + (ex - sx) * t, sy + (ey - sy) * t];
  }
  function geoOf(px, py) {           // 只在 t=0 或 t=1 時使用（變形動畫中不接受拖曳）
    var k = K(), x = (px - W / 2) / k, y = (H / 2 - py) / k;
    return t >= .5 ? invEE(x, y) : invMerc(x, y);
  }

  // ---------- 球面剛體旋轉：把 from 搬到 to，形狀與真實面積都不變 ----------
  function rotator(from, to) {
    var l0 = from[0] * D2R, p0 = from[1] * D2R, l1 = to[0] * D2R, p1 = to[1] * D2R;
    var c0 = Math.cos(-l0), s0 = Math.sin(-l0);   // Rz(-l0)
    var c1 = Math.cos(p0), s1 = Math.sin(p0);     // Ry(p0)
    var c2 = Math.cos(-p1), s2 = Math.sin(-p1);   // Ry(-p1)
    var c3 = Math.cos(l1), s3 = Math.sin(l1);     // Rz(l1)
    return function (lon, lat) {
      var f = lat * D2R, l = lon * D2R, cf = Math.cos(f);
      var x = cf * Math.cos(l), y = cf * Math.sin(l), z = Math.sin(f);
      var xa = x * c0 - y * s0, ya = x * s0 + y * c0, za = z;
      var xb = xa * c1 + za * s1, yb = ya, zb = -xa * s1 + za * c1;
      var xc = xb * c2 + zb * s2, yc = yb, zc = -xb * s2 + zb * c2;
      var xd = xc * c3 - yc * s3, yd = xc * s3 + yc * c3, zd = zc;
      return [Math.atan2(yd, xd) / D2R, Math.asin(Math.max(-1, Math.min(1, zd))) / D2R];
    };
  }

  // 讓一圈座標的經度連續（跨越 ±180 時不要橫貫整張圖）
  function unwrap(ring) {
    var out = new Array(ring.length), prev = ring[0][0];
    out[0] = [prev, ring[0][1]];
    for (var i = 1; i < ring.length; i++) {
      var lon = ring[i][0];
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
      out[i] = [lon, ring[i][1]];
      prev = lon;
    }
    return out;
  }

  // 加密：把過長的邊切碎，讓「直線段近似曲線」的誤差在兩種投影下都可忽略
  function densify(ring) {
    var out = [], i, j;
    for (i = 0; i < ring.length - 1; i++) {
      var a = ring[i], b = ring[i + 1];
      out.push(a);
      var d = Math.max(Math.abs(b[0] - a[0]) * Math.cos((a[1] + b[1]) / 2 * D2R), Math.abs(b[1] - a[1]));
      var n = Math.min(64, Math.floor(d / STEP));
      for (j = 1; j < n; j++) {
        var f = j / n;
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    out.push(ring[ring.length - 1]);
    return out;
  }
  var denseCache = {};
  function densePiece(piece) {
    if (!denseCache[piece.id]) {
      // 先 unwrap 再加密：否則跨越 ±180 的俄羅斯會被「繞地球一圈」補點
      denseCache[piece.id] = piece.g.map(function (poly) {
        return poly.map(function (ring) { return densify(unwrap(ring)); });
      });
    }
    return denseCache[piece.id];
  }

  // 把一個 piece 放到 (lon,lat)
  function placedGeo(piece, lon, lat) {
    var rot = rotator(piece.c, [lon, lat]);
    return densePiece(piece).map(function (poly) {
      return poly.map(function (ring) {
        return unwrap(ring.map(function (pt) { return rot(pt[0], pt[1]); }));
      });
    });
  }

  // shoelace：投影單位空間的面積（外環加、內環減）
  function shoelace(ring, proj) {
    var a = 0, n = ring.length, p0 = proj(ring[0][0], ring[0][1]), p1;
    for (var i = 1; i < n; i++) {
      p1 = proj(ring[i][0], ring[i][1]);
      a += p0[0] * p1[1] - p1[0] * p0[1];
      p0 = p1;
    }
    return Math.abs(a / 2);
  }
  function projArea(geo, proj) {
    var total = 0;
    for (var i = 0; i < geo.length; i++) {
      var poly = geo[i];
      for (var j = 0; j < poly.length; j++) total += (j === 0 ? 1 : -1) * shoelace(poly[j], proj);
    }
    return Math.max(total, 1e-12);
  }
  function ratioOf(item) {
    var proj = t >= .5 ? projEE : projMerc;
    return projArea(placedGeo(item.p, item.lon, item.lat), proj) / item.p.sr;
  }

  // 整塊形狀都必須留在地圖內：一旦有一角越過 ±84°（翻過極點），
  // 多邊形會自我摺疊、面積計算失去意義 → 拒絕這次移動。
  function maxAbsLat(geo) {
    var m = 0, i, j, k;
    for (i = 0; i < geo.length; i++)
      for (j = 0; j < geo[i].length; j++) {
        var r = geo[i][j];
        for (k = 0; k < r.length; k++) {
          var a = Math.abs(r[k][1]);
          if (a > m) m = a;
        }
      }
    return m;
  }
  function placeIfValid(item, lon, lat) {
    var geo = placedGeo(item.p, lon, lat);
    if (maxAbsLat(geo) <= MAXLAT) {
      item.lon = lon; item.lat = lat;
      item.ratio = projArea(geo, t >= .5 ? projEE : projMerc) / item.p.sr;
      return true;
    }
    if (lat !== item.lat) return placeIfValid(item, lon, item.lat); // 南北卡住，左右仍可動
    return false;
  }

  // ---------- 尺寸 ----------
  function resize() {
    var w = stage.clientWidth || 900;
    var ymax = projMerc(0, MAXLAT)[1];
    W = w;
    H = Math.round(w * (2 * ymax) / (2 * Math.PI));
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw();
  }

  // ---------- 繪圖 ----------
  function pathRings(rings) {
    ctx.beginPath();
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      for (var j = 0; j < r.length; j++) {
        var s = screenOf(r[j][0], r[j][1]);
        if (j === 0) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]);
      }
      ctx.closePath();
    }
  }

  function drawBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1322'); g.addColorStop(1, '#0b1728');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var lon, lat, s, i;

    // 失真熱度帶（緯度越高越紅）— 只在麥卡托時顯示
    var heat = 1 - t;
    if (heat > 0.01) {
      for (lat = -MAXLAT; lat < MAXLAT; lat += 4) {
        var mid = Math.abs(lat + 2);
        var f = Math.pow(Math.min(1 / Math.pow(Math.cos(Math.min(mid, 82) * D2R), 2), 12) / 12, 1.1);
        if (f < 0.02) continue;
        var y1 = screenOf(0, lat)[1], y2 = screenOf(0, lat + 4)[1];
        ctx.fillStyle = 'rgba(239,111,108,' + (f * 0.11 * heat).toFixed(4) + ')';
        ctx.fillRect(0, Math.min(y1, y2), W, Math.abs(y2 - y1) + 1);
      }
    }

    // 經緯網
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150,180,215,.10)';
    ctx.setLineDash([2, 5]);
    for (lon = -180; lon <= 180; lon += 20) {
      ctx.beginPath();
      for (lat = -MAXLAT; lat <= MAXLAT; lat += 4) {
        s = screenOf(lon, lat);
        if (lat === -MAXLAT) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]);
      }
      ctx.stroke();
    }
    for (lat = -80; lat <= 80; lat += 20) {
      if (lat === 0) continue;
      ctx.beginPath();
      for (lon = -180; lon <= 180; lon += 5) {
        s = screenOf(lon, lat);
        if (lon === -180) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 陸地
    ctx.fillStyle = 'rgba(37,55,78,.92)';
    ctx.strokeStyle = 'rgba(96,128,163,.5)';
    ctx.lineWidth = 0.7;
    for (i = 0; i < BG.length; i++) {
      pathRings(BG[i].map(unwrap));
      ctx.fill();
      ctx.stroke();
    }

    // 赤道
    ctx.strokeStyle = 'rgba(227,184,106,.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    for (lon = -180; lon <= 180; lon += 5) {
      s = screenOf(lon, 0);
      if (lon === -180) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    var e0 = screenOf(-176, 0);
    ctx.fillStyle = 'rgba(227,184,106,.8)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('赤道 0°', Math.max(e0[0], 8), e0[1] - 5);
    ctx.textBaseline = 'alphabetic';
  }

  function color(r) {
    if (r >= 4) return '239,111,108';
    if (r >= 1.8) return '240,163,94';
    return '95,211,196';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPiece(item, isSel) {
    var geo = placedGeo(item.p, item.lon, item.lat);
    var rgb = color(item.ratio);
    var screenRings = [];
    var i, j;

    ctx.save();
    for (i = 0; i < geo.length; i++) {
      pathRings(geo[i]);
      if (isSel) { ctx.shadowColor = 'rgba(' + rgb + ',.5)'; ctx.shadowBlur = 16; }
      ctx.fillStyle = 'rgba(' + rgb + ',' + (isSel ? .5 : .34) + ')';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (isSel ? 1 : .75) + ')';
      ctx.lineWidth = isSel ? 1.8 : 1.2;
      ctx.stroke();
      for (j = 0; j < geo[i].length; j++) {
        screenRings.push(geo[i][j].map(function (pt) { return screenOf(pt[0], pt[1]); }));
      }
    }
    ctx.restore();
    item.rings = screenRings;

    // 標籤
    var s = screenOf(item.lon, item.lat);
    var label = item.p.zh + '  ×' + item.ratio.toFixed(1);
    ctx.font = '600 12px system-ui, sans-serif';
    var w = ctx.measureText(label).width + 16;
    var bx = Math.max(2, Math.min(W - w - 2, s[0] - w / 2)), by = s[1] - 11;
    ctx.fillStyle = 'rgba(8,13,23,.85)';
    ctx.strokeStyle = 'rgba(' + rgb + ',.7)';
    ctx.lineWidth = 1;
    roundRect(bx, by, w, 22, 11);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(' + rgb + ',1)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + w / 2, by + 11.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function drawGhost(item) {
    var geo = placedGeo(item.p, item.p.c[0], item.p.c[1]);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(180,205,230,.42)';
    ctx.lineWidth = 1;
    for (var i = 0; i < geo.length; i++) { pathRings(geo[i]); ctx.stroke(); }
    ctx.restore();
  }

  var pulses = [];
  function draw() {
    drawBg();
    onMap.forEach(function (it) {
      if (Math.abs(it.lon - it.p.c[0]) > .01 || Math.abs(it.lat - it.p.c[1]) > .01) drawGhost(it);
    });
    onMap.forEach(function (it) { if (it !== sel) drawPiece(it, false); });
    if (sel) drawPiece(sel, true);

    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      var age = (performance.now() - p.t0) / 900;
      if (age >= 1) { pulses.splice(i, 1); continue; }
      var s = screenOf(p.lon, p.lat);
      ctx.beginPath();
      ctx.arc(s[0], s[1], 18 + age * 120, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(95,211,196,' + (0.75 * (1 - age)).toFixed(3) + ')';
      ctx.lineWidth = 2.5 * (1 - age) + 0.5;
      ctx.stroke();
    }
    if (pulses.length && !raf && !document.hidden) {
      raf = requestAnimationFrame(function () { raf = null; draw(); });
    }
  }

  // ---------- 讀數面板 ----------
  var shownRatio = 1;
  function fmtKm(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' 百萬 km²';
    return Math.round(n).toLocaleString('en-US') + ' km²';
  }
  function updatePanel(animate) {
    if (!sel) {
      roEmoji.textContent = '🗺️';
      roName.textContent = '還沒挑國家';
      roLat.textContent = '從下方清單選一個';
      ratioVal.textContent = '—';
      ratioFill.style.width = '0%';
      barTrue.style.width = '0%'; barFake.style.width = '0%';
      valTrue.textContent = '—'; valFake.textContent = '—';
      truthLine.innerHTML = '拖到赤道（0°）就會揭曉它的真面目。';
      btnEquator.disabled = true; btnHome.disabled = true;
      return;
    }
    var p = sel.p, r = sel.ratio;
    roEmoji.textContent = p.emoji;
    roName.textContent = p.zh;
    roLat.textContent = '目前緯度 ' + Math.abs(sel.lat).toFixed(1) + '° ' + (sel.lat >= 0 ? 'N' : 'S') +
      (t >= .5 ? ' · 等積投影' : ' · 麥卡托投影');
    btnEquator.disabled = false; btnHome.disabled = false;

    var from = shownRatio, to = r, t0 = performance.now();
    var dur = (animate && !reduced) ? 260 : 0;
    (function roll() {
      var k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
      var v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      ratioVal.textContent = v.toFixed(2);
      if (k < 1 && !document.hidden) requestAnimationFrame(roll); else shownRatio = to;
    })();

    ratioNum.className = 'ratio-num ' + (r >= 4 ? 'is-lie' : r >= 1.8 ? 'is-warn' : 'is-true');
    ratioFill.style.width = Math.min(100, (Math.log(Math.max(r, 1)) / Math.log(18)) * 100).toFixed(1) + '%';

    var fake = p.km2 * r;
    var scale = Math.max(fake, AFRICA_KM2);
    barTrue.style.width = (p.km2 / scale * 100).toFixed(1) + '%';
    barFake.style.width = (fake / scale * 100).toFixed(1) + '%';
    valTrue.textContent = fmtKm(p.km2);
    valFake.textContent = fmtKm(fake);

    if (Math.abs(sel.lat) <= 3 || t >= .5) {
      truthLine.innerHTML = LINES[p.id] || genericLine(p);
    } else {
      truthLine.innerHTML = '真實面積 <em>' + p.km2.toLocaleString('en-US') + ' km²</em>（約 ' +
        Math.round(p.km2 / TW_KM2) + ' 個台灣）。現在它被畫成 <em>' + r.toFixed(2) +
        ' 倍大</em>——把它拖到赤道看真相。';
    }
  }
  function genericLine(p) {
    return '真相：<b>' + p.km2.toLocaleString('en-US') + ' km²</b>（約 ' + Math.round(p.km2 / TW_KM2) +
      ' 個台灣）。非洲是它的 ' + (AFRICA_KM2 / p.km2).toFixed(1) + ' 倍。';
  }

  // ---------- 揭曉 ----------
  var toastTimer = null;
  function toast(html) {
    toastEl.innerHTML = html;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 5600);
  }
  function reveal(item) {
    if (!reduced) {
      pulses.push({ lon: item.lon, lat: item.lat, t0: performance.now() });
      ratioNum.classList.remove('pulse');
      void ratioNum.offsetWidth;
      ratioNum.classList.add('pulse');
      draw();
    }
    var p = item.p;
    toast(LINES[p.id] || genericLine(p));
    if (found.indexOf(p.id) === -1) {
      found.push(p.id);
      save('found', found);
      renderProgress();
      markChips();
    }
  }

  // ---------- 互動 ----------
  function pointIn(rings, x, y) {
    var inside = false;
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i], n = r.length;
      for (var a = 0, b = n - 1; a < n; b = a++) {
        var xa = r[a][0], ya = r[a][1], xb = r[b][0], yb = r[b][1];
        if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) inside = !inside;
      }
    }
    return inside;
  }
  function pick(x, y) {
    for (var i = onMap.length - 1; i >= 0; i--) {
      if (onMap[i].rings && pointIn(onMap[i].rings, x, y)) return onMap[i];
    }
    return null;
  }
  function pos(e) {
    var b = cv.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  }

  cv.addEventListener('pointerdown', function (e) {
    if (t > 0 && t < 1) return;                 // 變形動畫中不接受拖曳
    var q = pos(e), hitItem = pick(q[0], q[1]);
    if (!hitItem) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('dragging');
    sel = hitItem;
    onMap.splice(onMap.indexOf(hitItem), 1);
    onMap.push(hitItem);                        // 拉到最上層
    var g = geoOf(q[0], q[1]);
    drag = { dLon: hitItem.lon - g[0], dLat: hitItem.lat - g[1] };
    shownRatio = hitItem.ratio;
    hint.classList.add('gone');
    markChips(); updatePanel(false); draw();
  });

  cv.addEventListener('pointermove', function (e) {
    if (!drag || !sel) return;
    var q = pos(e), g = geoOf(q[0], q[1]);
    if (!isFinite(g[0]) || !isFinite(g[1])) return;
    var lat = Math.max(-MAXLAT, Math.min(MAXLAT, g[1] + drag.dLat));
    var lon = ((g[0] + drag.dLon + 180) % 360 + 360) % 360 - 180;
    if (!placeIfValid(sel, lon, lat)) return;
    updatePanel(false);
    draw();
  });

  function endDrag(e) {
    if (!drag || !sel) return;
    drag = null;
    cv.classList.remove('dragging');
    if (e && e.pointerId != null && cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    if (Math.abs(sel.lat) <= 3 && sel.lat !== 0) {   // 貼齊赤道 → 揭曉
      placeIfValid(sel, sel.lon, 0);
      updatePanel(true);
      draw();
      reveal(sel);
    } else {
      updatePanel(true);
    }
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // 鍵盤操作
  cv.addEventListener('keydown', function (e) {
    if (!sel) return;
    var step = e.shiftKey ? 10 : 2, moved = false;
    var lat = sel.lat, lon = sel.lon, wasZero = sel.lat === 0;
    if (e.key === 'ArrowUp') { lat += step; moved = true; }
    else if (e.key === 'ArrowDown') { lat -= step; moved = true; }
    else if (e.key === 'ArrowLeft') { lon -= step * 2; moved = true; }
    else if (e.key === 'ArrowRight') { lon += step * 2; moved = true; }
    if (!moved) return;
    e.preventDefault();
    // 經過赤道時先停在赤道（別一步跨過真相）
    if (sel.lat * lat < 0 || Math.abs(lat) <= 1.5) lat = 0;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    if (!placeIfValid(sel, lon, lat)) return;
    updatePanel(true);
    draw();
    if (sel.lat === 0 && !wasZero) reveal(sel);
  });

  // ---------- 動畫 ----------
  function glide(item, targetLat, targetLon, done) {
    if (reduced || document.hidden) {
      placeIfValid(item, targetLon, targetLat);
      updatePanel(true); draw();
      if (done) done();
      return;
    }
    var l0 = item.lat, o0 = item.lon, t0 = performance.now(), dur = 1100;
    (function step() {
      if (document.hidden) {
        placeIfValid(item, targetLon, targetLat);
        updatePanel(false); draw();
        if (done) done();
        return;
      }
      var k = Math.min(1, (performance.now() - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      placeIfValid(item, o0 + (targetLon - o0) * e, l0 + (targetLat - l0) * e);
      updatePanel(false);
      draw();
      if (k < 1) requestAnimationFrame(step);
      else { shownRatio = item.ratio; updatePanel(false); if (done) done(); }
    })();
  }

  function setProj(target) {
    if (t === target) return;
    btnMerc.classList.toggle('is-on', target === 0);
    btnEE.classList.toggle('is-on', target === 1);
    btnMerc.setAttribute('aria-pressed', String(target === 0));
    btnEE.setAttribute('aria-pressed', String(target === 1));
    var from = t, t0 = performance.now(), dur = (reduced || document.hidden) ? 0 : 950;
    (function step() {
      var k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
      var e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      t = from + (target - from) * e;
      onMap.forEach(function (it) { it.ratio = ratioOf(it); });
      updatePanel(false);
      draw();
      if (k < 1 && !document.hidden) requestAnimationFrame(step);
      else {
        t = target;
        onMap.forEach(function (it) { it.ratio = ratioOf(it); });
        updatePanel(true);
        draw();
        if (target === 1) toast('<b>等積投影：所見即真實。</b>形狀被拉扯了，但每塊土地的面積比例都對——所有倍率都變成 ×1.00。');
      }
    })();
  }

  btnMerc.addEventListener('click', function () { setProj(0); });
  btnEE.addEventListener('click', function () { setProj(1); });
  btnEquator.addEventListener('click', function () {
    if (!sel) return;
    var it = sel;
    glide(it, 0, it.lon, function () { reveal(it); });
  });
  btnHome.addEventListener('click', function () {
    if (!sel) return;
    glide(sel, sel.p.c[1], sel.p.c[0]);
  });
  btnClear.addEventListener('click', function () {
    onMap = [];
    sel = null;
    markChips();
    updatePanel(false);
    draw();
  });

  // ---------- 清單 ----------
  function addPiece(p) {
    var exist = null, i;
    for (i = 0; i < onMap.length; i++) if (onMap[i].p.id === p.id) exist = onMap[i];
    if (exist) {
      sel = exist;
    } else {
      var item = { p: p, lon: p.c[0], lat: p.c[1], ratio: 1, rings: null };
      item.ratio = ratioOf(item);
      onMap.push(item);
      sel = item;
    }
    shownRatio = sel.ratio;
    hint.classList.add('gone');
    markChips();
    updatePanel(true);
    draw();
    if (cv.focus) cv.focus({ preventScroll: true });
  }

  function buildChips() {
    PIECES.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.dataset.id = p.id;
      b.innerHTML = '<span aria-hidden="true">' + p.emoji + '</span>' + p.zh;
      b.setAttribute('aria-label', '把 ' + p.zh + ' 放到地圖上');
      b.addEventListener('click', function () { addPiece(p); });
      chipsEl.appendChild(b);
    });
  }
  function markChips() {
    [].forEach.call(chipsEl.children, function (b) {
      var id = b.dataset.id;
      b.classList.toggle('is-on', !!sel && sel.p.id === id);
      b.classList.toggle('found', found.indexOf(id) !== -1);
    });
  }
  function renderProgress() {
    progEl.textContent = '已揭穿 ' + found.length + ' / ' + PIECES.length;
    progFill.style.width = (found.length / PIECES.length * 100).toFixed(1) + '%';
  }

  // ---------- 啟動 ----------
  buildChips();
  renderProgress();
  markChips();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);
  resize();
  updatePanel(false);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && raf) {
      cancelAnimationFrame(raf);
      raf = null;
      pulses.length = 0;
    }
  });

  // 開場：格陵蘭已經站在地圖上，等著被拆穿
  var gl = PIECES.filter(function (p) { return p.id === 'Greenland'; })[0];
  if (gl) {
    setTimeout(function () {
      addPiece(gl);
      hint.textContent = '👉 抓住格陵蘭，把它拖到赤道';
      hint.classList.remove('gone');
    }, 950);
  }
})();

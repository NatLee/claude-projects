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
  var MAX_ON_MAP = 4;                 // 地圖上最多同時比較幾個國家
  var GRAB_TOL = 14;                  // 抓取容錯半徑（px）。台灣在 900px 寬的地圖上只有 5×9 px，
                                      // 純多邊形命中判定等於抓不到 → 邊界 14px 內都算抓到它。
  var TINY_PX = 18;                   // 螢幕上小於這個尺寸的國家＝迷你國家，另外畫抓取環
  var SLOT_COLORS = ['#7cc4ff', '#c9a7ff', '#ffce6b', '#ff9ecb']; // 每個位置的識別色（① ② ③ ④）

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
  var truthLine = $('truthLine'), chipsEl = $('chips'), roSlot = $('roSlot');
  var btnMerc = $('btnMerc'), btnEE = $('btnEE');
  var btnEquator = $('btnEquator'), btnHome = $('btnHome'), btnClear = $('btnClear');
  var btnAllEquator = $('btnAllEquator');
  var trayCard = document.querySelector('.tray'), trayInner = $('trayInner');
  var trayList = $('trayList'), trayNote = $('trayNote'), trayCount = $('trayCount');
  var progEl = $('prog'), progFill = $('progFill');

  // 抖完就把 is-full 拿掉，狀態不黏著（下次再滿才會再抖一次）
  trayInner.addEventListener('animationend', function (e) {
    if (e.animationName === 'shake') trayCard.classList.remove('is-full');
  });

  // 同理：pop 播完收掉 .pulse。updatePanel 已改成不重寫 className，殘留的 class 會一直黏著。
  ratioNum.addEventListener('animationend', function (e) {
    if (e.animationName === 'pop') ratioNum.classList.remove('pulse');
  });

  // ---------- 狀態 ----------
  var W = 900, H = 845, DPR = 1;
  var t = 0;                 // 0 = 麥卡托, 1 = Equal Earth（中間值＝變形動畫）
  // onMap：目前放在地圖上的國家，最多 MAX_ON_MAP 個，可同時比較。
  //   {p, slot(0..3 識別色/編號), lon, lat, ratio, rings(screen px), pill(標籤命中框), el(清單 DOM)}
  //   陣列順序＝畫圖與命中判定的 z 序（最後一個在最上層）。
  // sel：目前的「焦點」國家（方向鍵與「送到赤道 / 送回原位」作用的對象）。
  //   不變式：sel 永遠是 onMap 的最後一個；onMap 空 ⇔ sel === null。
  var onMap = [];
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

  // 形狀顏色＝失真程度（紅＝被吹大、綠＝誠實）。這是本頁的主訊號，不拿來當身分色。
  function color(r) {
    if (r >= 4) return '239,111,108';
    if (r >= 1.8) return '240,163,94';
    return '95,211,196';
  }
  function ratioCls(r) {
    return r >= 4 ? 'is-lie' : r >= 1.8 ? 'is-warn' : 'is-true';
  }
  // 身分色（#rrggbb）→ rgba()，用在編號徽章、標籤外框、原位虛線
  function slotRGBA(slot, a) {
    var n = parseInt(SLOT_COLORS[slot].slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function pieceOf(id) {
    for (var i = 0; i < onMap.length; i++) if (onMap[i].p.id === id) return onMap[i];
    return null;
  }
  function freeSlot() {                 // 拿最小的空號，移除後可以被重複利用
    var used = onMap.map(function (it) { return it.slot; });
    for (var i = 0; i < MAX_ON_MAP; i++) if (used.indexOf(i) === -1) return i;
    return 0;
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
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    var i, j, k, ring;

    ctx.save();
    for (i = 0; i < geo.length; i++) {
      pathRings(geo[i]);
      if (isSel) { ctx.shadowColor = 'rgba(' + rgb + ',.5)'; ctx.shadowBlur = 16; }
      ctx.fillStyle = 'rgba(' + rgb + ',' + (isSel ? .5 : .3) + ')';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (isSel ? 1 : .68) + ')';
      ctx.lineWidth = isSel ? 1.8 : 1.2;
      ctx.stroke();
      for (j = 0; j < geo[i].length; j++) {
        ring = geo[i][j].map(function (pt) { return screenOf(pt[0], pt[1]); });
        for (k = 0; k < ring.length; k++) {
          if (ring[k][0] < x0) x0 = ring[k][0];
          if (ring[k][0] > x1) x1 = ring[k][0];
          if (ring[k][1] < y0) y0 = ring[k][1];
          if (ring[k][1] > y1) y1 = ring[k][1];
        }
        screenRings.push(ring);
      }
    }
    ctx.restore();
    item.rings = screenRings;

    var s = screenOf(item.lon, item.lat);
    var tiny = Math.max(x1 - x0, y1 - y0) < TINY_PX;

    // 迷你國家（台灣在地圖上只有幾個像素）：畫一圈抓取環，讓它看得見、也抓得到
    if (tiny) {
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (isSel ? .9 : .55) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s[0], s[1], GRAB_TOL, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 標籤：編號徽章（身分色）＋ 國名 ＋ 倍率（失真色）
    var name = item.p.zh, rt = '×' + item.ratio.toFixed(1);
    ctx.font = '600 12px system-ui, sans-serif';
    var wn = ctx.measureText(name).width, wr = ctx.measureText(rt).width;
    var w = 22 + wn + 6 + wr + 10;
    var bx = Math.max(2, Math.min(W - w - 2, s[0] - w / 2));
    // 迷你國家的標籤往上挪開，才不會把它自己蓋住（原本正是台灣被蓋掉的原因）
    var by = Math.max(2, Math.min(H - 24, s[1] - (tiny ? GRAB_TOL + 25 : 11)));

    ctx.fillStyle = 'rgba(8,13,23,.88)';
    ctx.strokeStyle = slotRGBA(item.slot, isSel ? .95 : .5);
    ctx.lineWidth = isSel ? 1.4 : 1;
    roundRect(bx, by, w, 22, 11);
    ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.arc(bx + 13, by + 11, 7, 0, Math.PI * 2);
    ctx.fillStyle = SLOT_COLORS[item.slot];
    ctx.fill();

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0b1220';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText(String(item.slot + 1), bx + 13, by + 11.5);

    ctx.textAlign = 'left';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = isSel ? '#f2f7ff' : '#c3d3e4';
    ctx.fillText(name, bx + 22, by + 11.5);
    ctx.fillStyle = 'rgba(' + rgb + ',1)';
    ctx.fillText(rt, bx + 22 + wn + 6, by + 11.5);
    ctx.textBaseline = 'alphabetic';

    item.pill = [bx, by, w, 22];   // 標籤本身也是抓取區（尤其對迷你國家）
  }

  function drawGhost(item) {
    var geo = placedGeo(item.p, item.p.c[0], item.p.c[1]);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = slotRGBA(item.slot, .4);   // 原位虛線用身分色，多國同時在場才分得清誰是誰
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
  var shownRatio = 1, rollId = 0;
  function fmtKm(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' 百萬 km²';
    return Math.round(n).toLocaleString('en-US') + ' km²';
  }
  function updatePanel(animate) {
    syncTrayRatios();               // 清單上每個國家的倍率都要跟著動，不只焦點那個
    if (!sel) {
      rollId++;                     // 作廢還在跑的滾動，別讓它把「—」又蓋回數字（清空地圖時會發生）
      roEmoji.textContent = '🗺️';
      roSlot.hidden = true;
      roName.textContent = '還沒挑國家';
      roLat.textContent = '從下方清單選一個';
      ratioVal.textContent = '—';
      ratioNum.className = 'ratio-num';
      ratioFill.style.width = '0%';
      barTrue.style.width = '0%'; barFake.style.width = '0%';
      valTrue.textContent = '—'; valFake.textContent = '—';
      truthLine.innerHTML = '拖到赤道（0°）就會揭曉它的真面目。';
      btnEquator.disabled = true; btnHome.disabled = true;
      shownRatio = 1;
      return;
    }
    var p = sel.p, r = sel.ratio;
    roEmoji.textContent = p.emoji;
    roSlot.hidden = false;
    roSlot.textContent = String(sel.slot + 1);
    roSlot.style.setProperty('--slot', SLOT_COLORS[sel.slot]);
    roName.textContent = p.zh;
    roLat.textContent = '目前緯度 ' + Math.abs(sel.lat).toFixed(1) + '° ' + (sel.lat >= 0 ? 'N' : 'S') +
      (t >= .5 ? ' · 等積投影' : ' · 麥卡托投影');
    btnEquator.disabled = false; btnHome.disabled = false;

    // 只有最後一次 updatePanel 開的滾動有效：焦點切走、或別的國家還在飛（每幀都會進來一次）時，
    // 上一輪滾動要立刻讓位，不然兩輪會搶著寫同一個數字。
    var from = shownRatio, to = r, t0 = performance.now(), myRoll = ++rollId;
    var dur = (animate && !reduced) ? 260 : 0;
    (function roll() {
      if (myRoll !== rollId) return;
      var k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
      var v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      ratioVal.textContent = v.toFixed(2);
      if (k < 1 && !document.hidden) requestAnimationFrame(roll); else shownRatio = to;
    })();

    // 只換失真色，不整個重寫 className——否則會把正在播的 .pulse 洗掉
    //（揭曉之後，還在飛的另一個國家每一幀都會走到這裡）
    ratioNum.classList.remove('is-lie', 'is-warn', 'is-true');
    ratioNum.classList.add(ratioCls(r));
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
  function reveal(item) { revealMany([item]); }

  function revealMany(list) {
    if (!list.length) return;
    if (!reduced) {
      list.forEach(function (it) {
        pulses.push({ lon: it.lon, lat: it.lat, t0: performance.now() });   // 光環畫在各自的落點，永遠對得上
      });
      // 讀數面板此刻顯示的是 sel。使用者若在飛行途中把焦點切到別的國家（chip 新增 / 點托盤某一列），
      // 面板上那個數字就不是這批被揭曉的國家了 → 不能把 pulse 播在錯的數字上。
      if (sel && list.indexOf(sel) !== -1) {
        ratioNum.classList.remove('pulse');
        void ratioNum.offsetWidth;
        ratioNum.classList.add('pulse');
      }
      draw();
    }
    if (list.length === 1) {
      toast(LINES[list[0].p.id] || genericLine(list[0].p));
    } else {
      // 多國同時落在赤道：直接排出真實大小的名次，這才是多選的意義
      var rank = list.slice().sort(function (a, b) { return b.p.km2 - a.p.km2; })
        .map(function (it, i) { return (i + 1) + '. ' + it.p.zh + ' <b>' + fmtKm(it.p.km2) + '</b>'; })
        .join('　');
      toast('<b>赤道上見真章</b>——真實大小排名：<br>' + rank);
    }
    var gained = false;
    list.forEach(function (it) {
      if (found.indexOf(it.p.id) === -1) { found.push(it.p.id); gained = true; }
    });
    if (gained) {
      save('found', found);
      renderProgress();
      markChips();
    }
  }

  // ---------- 地圖上的國家：加入 / 移除 / 切換焦點 ----------
  function syncAll() {
    renderTray();
    markChips();
    updatePanel(true);
    draw();
  }

  function addPiece(p) {
    var exist = pieceOf(p.id);
    if (exist) { focusPiece(exist); return; }
    if (onMap.length >= MAX_ON_MAP) {
      trayCard.classList.remove('is-full');
      void trayCard.offsetWidth;
      trayCard.classList.add('is-full');
      toast('地圖上最多同時放 <b>' + MAX_ON_MAP + '</b> 個國家。先到「地圖上的國家」按 ✕ 移掉一個，再挑新的。');
      return;
    }
    // fly：飛行權杖（0 ＝ 沒在飛）。見 glideMany —— 飛行是「一國一張權杖」，不是一場一張。
    var item = { p: p, slot: freeSlot(), lon: p.c[0], lat: p.c[1], ratio: 1, rings: null, pill: null, el: null, fly: 0 };
    item.ratio = ratioOf(item);
    onMap.push(item);
    sel = item;
    shownRatio = item.ratio;
    hint.classList.add('gone');
    syncAll();
    if (cv.focus) cv.focus({ preventScroll: true });
  }

  function removePiece(item) {
    var i = onMap.indexOf(item);
    if (i === -1) return;
    onMap.splice(i, 1);
    if (sel === item) {
      drag = null;                                                          // 正在拖的那個被移除 → 別把位移套到下一個
      cv.classList.remove('dragging');
      sel = onMap.length ? onMap[onMap.length - 1] : null;                  // 焦點交給最上層那個
    }
    if (sel) shownRatio = sel.ratio;
    syncAll();
  }

  function focusPiece(item) {
    var i = onMap.indexOf(item);
    if (i === -1) return;
    onMap.splice(i, 1);
    onMap.push(item);          // 焦點永遠畫在最上層，也永遠最先被抓到
    sel = item;
    shownRatio = item.ratio;
    syncAll();
  }

  function clearMap() {
    cancelGlide();              // 飛行中按清空：所有國家一起退出飛行，沒有人會被落地或揭曉
    onMap = [];
    sel = null;
    drag = null;
    cv.classList.remove('dragging');
    pulses.length = 0;          // 光環也一起收掉，別在空地圖上擴散
    shownRatio = 1;
    hint.textContent = '👉 從右邊挑國家（最多 ' + MAX_ON_MAP + ' 個），把它們拖到赤道比大小';
    hint.classList.remove('gone');
    syncAll();
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
  function inPill(item, x, y) {          // 標籤也可以抓：迷你國家幾乎只剩標籤看得到
    var r = item.pill;
    return !!r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var u = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
  }
  function ringDist(rings, x, y) {      // 點到多邊形邊界的最短距離
    var m = Infinity, i, j, r, d;
    for (i = 0; i < rings.length; i++) {
      r = rings[i];
      for (j = 1; j < r.length; j++) {
        d = segDist(x, y, r[j - 1][0], r[j - 1][1], r[j][0], r[j][1]);
        if (d < m) m = d;
      }
    }
    return m;
  }
  // 命中判定分兩輪：先「真的點在形狀或標籤裡」（上層優先），
  // 再放寬到 GRAB_TOL 內的最近者——否則台灣那 5×9 px 的形狀永遠抓不到。
  function pick(x, y) {
    var i, it, best = null, bestD = Infinity, d;
    for (i = onMap.length - 1; i >= 0; i--) {
      it = onMap[i];
      if (!it.rings) continue;
      if (inPill(it, x, y) || pointIn(it.rings, x, y)) return it;
    }
    for (i = onMap.length - 1; i >= 0; i--) {
      it = onMap[i];
      if (!it.rings) continue;
      d = ringDist(it.rings, x, y);
      if (d <= GRAB_TOL && d < bestD) { bestD = d; best = it; }
    }
    return best;
  }
  function pos(e) {
    var b = cv.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  }

  cv.addEventListener('pointerdown', function (e) {
    if (t > 0 && t < 1) return;                 // 變形動畫中不接受拖曳
    var q = pos(e), hitItem = pick(q[0], q[1]);
    if (!hitItem) return;                       // 點空海不動任何狀態（不會誤取消選取）
    e.preventDefault();
    cancelGlide(hitItem);                       // 只有被抓住的這一個交還給使用者（不揭曉）；其餘還在飛的照飛照揭曉
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('dragging');
    focusPiece(hitItem);                        // 抓誰、焦點就跟到誰（並拉到最上層）
    var g = geoOf(q[0], q[1]);
    drag = { dLon: hitItem.lon - g[0], dLat: hitItem.lat - g[1] };
    hint.classList.add('gone');
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

  // 鍵盤操作：方向鍵移動焦點國家、Delete/Backspace 把它從地圖移除、Tab 之外用 1–4 切換焦點
  cv.addEventListener('keydown', function (e) {
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removePiece(sel);
      return;
    }
    if (e.key >= '1' && e.key <= String(MAX_ON_MAP)) {
      var want = null, n = +e.key - 1;
      onMap.forEach(function (it) { if (it.slot === n) want = it; });
      if (want) { e.preventDefault(); focusPiece(want); }
      return;
    }
    var step = e.shiftKey ? 10 : 2, moved = false;
    var lat = sel.lat, lon = sel.lon, wasZero = sel.lat === 0;
    if (e.key === 'ArrowUp') { lat += step; moved = true; }
    else if (e.key === 'ArrowDown') { lat -= step; moved = true; }
    else if (e.key === 'ArrowLeft') { lon -= step * 2; moved = true; }
    else if (e.key === 'ArrowRight') { lon += step * 2; moved = true; }
    if (!moved) return;
    e.preventDefault();
    cancelGlide(sel);                           // 鍵盤接手移動 → 同樣只有焦點這一個退出飛行
    // 經過赤道時先停在赤道（別一步跨過真相）
    if (sel.lat * lat < 0 || Math.abs(lat) <= 1.5) lat = 0;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    if (!placeIfValid(sel, lon, lat)) return;
    updatePanel(true);
    draw();
    if (sel.lat === 0 && !wasZero) reveal(sel);
  });

  // ---------- 動畫 ----------
  // 飛行中的國家可能被使用者中途移除 / 清空 / 接手拖曳，
  // 所以每一幀都要重新確認「它還該飛嗎」，落地與 done() 也一樣——
  // 否則會對已經不存在的國家揭曉、寫進度、畫光環（正是使用者抱怨的那種殘留）。
  //
  // 權杖是「每個國家一張」（item.fly），不是整場飛行一張：
  //   glideMany 發一個新序號給它要搬的每個國家，rAF 迴圈每幀只留下 fly 還等於自己序號的。
  //   → 使用者抓住其中一個（或用鍵盤推它）時，只有那一個被 cancelGlide 撤掉權杖、退出飛行，
  //     其餘國家繼續飛完並正常揭曉。整場飛行的 done() 也只收到「真的落地的那幾個」。
  var flySeq = 0;
  // 使用者親手接手某一個國家 → 只讓那一個退出飛行；不給 item ＝ 全部退出（清空地圖）
  function cancelGlide(item) {
    if (item) { item.fly = 0; return; }
    onMap.forEach(function (it) { it.fly = 0; });
  }
  function onMapStill(it) { return onMap.indexOf(it) !== -1; }

  // 一次搬多個國家（moves: [{it, lat, lon}]），共用同一個 rAF 迴圈。
  // done(landed) 收到的是「真的飛完並落地」的 item 陣列（可能是空的）。
  function glideMany(moves, done) {
    var myId = ++flySeq;
    var list = moves
      .filter(function (m) { return onMapStill(m.it); })
      .map(function (m) {
        m.it.fly = myId;                              // 換手：它若還在別場飛行裡，那場下一幀就會放掉它
        return { it: m.it, lat: m.lat, lon: m.lon, fLat: m.it.lat, fLon: m.it.lon };
      });
    var i;

    function alive() {                                // 還在地圖上、而且權杖還是我發的
      list = list.filter(function (m) { return onMapStill(m.it) && m.it.fly === myId; });
      return list.length;
    }
    function selFlying() {                            // 焦點國家是不是這批裡的一員
      return !!sel && list.some(function (m) { return m.it === sel; });
    }
    // 飛行中每一幀的畫面更新。使用者若中途把焦點切到別的國家（chip 新增 / 點托盤某一列 / 抓住另一個），
    // 焦點就不在這批裡了 → 別再每幀覆寫讀數面板：面板要留給使用者主動選的那個國家（也不會打斷它的數字滾動）。
    // 但清單上的倍率仍要跟著飛行即時更新，畫面也照畫。
    function paint() {
      if (selFlying()) { shownRatio = sel.ratio; updatePanel(false); }
      else syncTrayRatios();
      draw();
    }
    function finish() {
      var landed = list.map(function (m) { return m.it; });
      for (i = 0; i < list.length; i++) list[i].it.fly = 0;   // 飛完了，權杖歸還
      if (done) done(landed);
    }
    function land() {
      if (alive()) {
        for (i = 0; i < list.length; i++) placeIfValid(list[i].it, list[i].lon, list[i].lat);
        paint();
      }
      finish();
    }
    if (!list.length) { if (done) done([]); return; }
    if (reduced || document.hidden) { land(); return; }   // 降級：不飛，直接落地（這條路徑要保持可用）

    var t0 = performance.now(), dur = 1100;
    (function step() {
      // 全被移除 / 被清空 / 被使用者接手 / 被下一場飛行接走 → 這場沒人可飛了，靜靜結束
      if (!alive()) { paint(); finish(); return; }
      if (document.hidden) { land(); return; }       // 分頁被切走：直接落地，不空轉
      var k = Math.min(1, (performance.now() - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      for (i = 0; i < list.length; i++) {
        placeIfValid(list[i].it,
          list[i].fLon + (list[i].lon - list[i].fLon) * e,
          list[i].fLat + (list[i].lat - list[i].fLat) * e);
      }
      paint();
      if (k < 1) requestAnimationFrame(step);
      else finish();
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
    // done 收到的就是「真的落地」的那幾個：飛行途中被移除或被使用者接手的都不在裡面，
    // 也就不會被揭曉（不能對不在赤道上、或不在地圖上的國家記進度）
    glideMany([{ it: sel, lat: 0, lon: sel.lon }], revealMany);
  });
  btnHome.addEventListener('click', function () {
    if (!sel) return;
    var it = sel;
    glideMany([{ it: it, lat: it.p.c[1], lon: it.p.c[0] }]);
  });
  btnAllEquator.addEventListener('click', function () {
    if (!onMap.length) return;
    glideMany(onMap.map(function (it) { return { it: it, lat: 0, lon: it.lon }; }), revealMany);
  });
  btnClear.addEventListener('click', clearMap);

  // ---------- 清單（左：可挑的國家；上：已在地圖上的國家） ----------
  function buildChips() {
    PIECES.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.dataset.id = p.id;
      b.dataset.zh = p.zh;
      b.innerHTML = '<span aria-hidden="true">' + p.emoji + '</span>' + p.zh +
        '<span class="chip-tag" aria-hidden="true"></span>';
      // 切換式：不在地圖上→放上去；已在地圖上→拿下來
      b.addEventListener('click', function () {
        var it = pieceOf(p.id);
        if (it) removePiece(it); else addPiece(p);
      });
      chipsEl.appendChild(b);
    });
  }
  function markChips() {
    [].forEach.call(chipsEl.children, function (b) {
      var id = b.dataset.id, zh = b.dataset.zh, it = pieceOf(id);
      b.classList.toggle('is-on', !!it);                                // 在地圖上（染成它的位置色）
      b.classList.toggle('is-focus', !!sel && sel.p.id === id);         // 而且是目前的焦點
      b.classList.toggle('found', found.indexOf(id) !== -1);
      if (it) b.style.setProperty('--slot', SLOT_COLORS[it.slot]);
      else b.style.removeProperty('--slot');
      b.setAttribute('aria-pressed', String(!!it));
      b.setAttribute('aria-label', it ? '把 ' + zh + ' 從地圖上移除' : '把 ' + zh + ' 放到地圖上');
      b.title = it ? '再點一次：從地圖移除' : '放到地圖上比大小';
    });
  }

  // 地圖上的國家：看得到選了誰、切得了焦點、單獨移得掉
  function renderTray() {
    trayList.innerHTML = '';
    onMap.slice()
      .sort(function (a, b) { return a.slot - b.slot; })   // 列表順序固定（不隨 z 序跳動）
      .forEach(function (it) {
        var li = document.createElement('li');
        li.className = 'tray-item' + (it === sel ? ' is-focus' : '');
        li.style.setProperty('--slot', SLOT_COLORS[it.slot]);

        var b = document.createElement('button');
        b.className = 'tray-pick';
        b.type = 'button';
        b.setAttribute('aria-pressed', String(it === sel));
        b.setAttribute('aria-label', '把焦點切到 ' + it.p.zh);
        b.innerHTML =
          '<span class="slot-dot" aria-hidden="true">' + (it.slot + 1) + '</span>' +
          '<span class="tray-emoji" aria-hidden="true">' + it.p.emoji + '</span>' +
          '<span class="tray-name">' + it.p.zh + '</span>' +
          '<span class="tray-ratio"></span>';
        b.addEventListener('click', function () {
          focusPiece(it);
          if (cv.focus) cv.focus({ preventScroll: true });
        });

        var del = document.createElement('button');
        del.className = 'tray-del';
        del.type = 'button';
        del.textContent = '✕';
        del.setAttribute('aria-label', '把 ' + it.p.zh + ' 從地圖上移除');
        del.addEventListener('click', function () {
          removePiece(it);                       // renderTray 會重建整張清單 → 這顆按鈕會被銷毀
          // 焦點不能掉回 <body>：還有國家就接到清單第一顆 ✕，清單空了就交給地圖
          var next = trayList.querySelector('.tray-del');
          if (next) next.focus();
          else if (cv.focus) cv.focus({ preventScroll: true });
        });

        li.appendChild(b);
        li.appendChild(del);
        trayList.appendChild(li);
        it.el = { ratio: b.querySelector('.tray-ratio') };
      });

    // trayCount / trayNote 在 aria-live 區裡（#trayNote），而 renderTray 每次點地圖切焦點都會跑。
    // 只有內容真的變了才寫回 DOM，否則螢幕閱讀器會被同一句話洗版。
    var cnt = onMap.length + ' / ' + MAX_ON_MAP;
    if (trayCount.textContent !== cnt) trayCount.textContent = cnt;
    var note = onMap.length
      ? '點一列切換焦點（方向鍵移動的就是它），按 ✕ 單獨移除。'
      : '還沒有國家在地圖上——從下方清單挑一個放上來。';
    if (trayNote.textContent !== note) trayNote.textContent = note;
    btnClear.disabled = onMap.length === 0;
    btnAllEquator.disabled = onMap.length === 0;
    syncTrayRatios();
  }
  // 倍率會隨拖曳/投影切換即時變 → 只改文字，不重建 DOM
  function syncTrayRatios() {
    for (var i = 0; i < onMap.length; i++) {
      var it = onMap[i];
      if (!it.el) continue;
      var s = '×' + it.ratio.toFixed(2), c = 'tray-ratio ' + ratioCls(it.ratio);
      if (it.el.ratio.textContent !== s) it.el.ratio.textContent = s;
      if (it.el.ratio.className !== c) it.el.ratio.className = c;
    }
  }
  function renderProgress() {
    progEl.textContent = '已揭穿 ' + found.length + ' / ' + PIECES.length;
    progFill.style.width = (found.length / PIECES.length * 100).toFixed(1) + '%';
  }

  // ---------- 啟動 ----------
  buildChips();
  renderProgress();
  renderTray();
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
      hint.textContent = '👉 抓住格陵蘭拖到赤道——也可以再挑幾個國家一起比（最多 ' + MAX_ON_MAP + ' 個）';
      hint.classList.remove('gone');
    }, 950);
  }
})();

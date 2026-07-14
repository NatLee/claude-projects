/* ============================================================
   概念細胞 — 單電極實驗桌
   純靜態、零外部資源、離線可用。
   ------------------------------------------------------------
   誠實聲明：本檔案產生的每一個 spike 都是瀏覽器裡的隨機過程
   （非齊次卜瓦松過程）即時模擬出來的，依據的是論文「報告出來的
   反應型態」——潛伏期約 300 ms、基線近乎為零、稀疏而不變的選擇性。
   這裡沒有任何一筆真實的神經記錄資料。
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 常數 ---------------- */
  var T0 = -700;       // 掃描起點（相對刺激 onset，ms）
  var T1 = 1700;       // 掃描終點
  var STIM_ON = 0;     // 刺激出現
  var STIM_OFF = 1000; // 刺激移除（論文：每張圖呈現 1 秒）
  var WIN_A = 300;     // 計數視窗起點（論文：300–1000 ms）
  var WIN_B = 1000;
  var SR = 300;        // 模擬取樣率（樣本／秒）
  var KERNEL_SD = 55;  // 放電率平滑核（ms）
  var MAX_ROWS = 8;    // raster 顯示的最近試驗數
  var REPORT_T = 1500; // 自由回憶：病人開口報告的時刻（ms）

  var LS = {
    sound: 'cell.sound',
    discovered: 'cell.discovered',
    trials: 'cell.trials'
  };

  /* ---------------- 刺激（全部用 SVG 畫，無任何外部圖檔） ---------------- */
  function svg(inner) {
    return '<svg viewBox="0 0 80 60" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  var BG = '<rect x="0" y="0" width="80" height="60" rx="4" fill="#0d151d"/>';

  function face(opts) {
    var hair = opts.hair, skin = opts.skin || '#2c3b4a', line = opts.line || '#4a6178';
    var s = BG;
    if (opts.sketch) {
      s += '<g fill="none" stroke="' + hair + '" stroke-width="1.4" stroke-linecap="round">' +
        '<path d="M40 14c-8 0-13 6-13 14s5 15 13 15 13-7 13-15-5-14-13-14z"/>' +
        '<path d="M27 24c2-9 9-11 13-11s11 2 13 11"/>' +
        '<path d="M34 29h3M43 29h3"/>' +
        '<path d="M38 34h4"/>' +
        '<path d="M24 52c3-8 9-11 16-11s13 3 16 11"/>' +
        '</g>';
      return s;
    }
    s += '<path d="M24 28c0-11 7-17 16-17s16 6 16 17v3c-2-8-6-11-16-11s-14 3-16 11z" fill="' + hair + '"/>';
    s += '<path d="M27 27c0-6 6-9 13-9s13 3 13 9v6c0 8-6 14-13 14s-13-6-13-14z" fill="' + skin + '"/>';
    if (opts.profile) {
      s += '<circle cx="44" cy="31" r="1.8" fill="' + line + '"/>';
      s += '<path d="M53 30c3 1 3 4 0 5" stroke="' + line + '" stroke-width="1.2" fill="none"/>';
    } else if (opts.closed) {
      s += '<path d="M31 31c2 2 4 2 6 0M43 31c2 2 4 2 6 0" stroke="' + line +
        '" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
    } else {
      s += '<circle cx="34" cy="31" r="1.9" fill="' + line + '"/>' +
        '<circle cx="46" cy="31" r="1.9" fill="' + line + '"/>';
    }
    if (opts.glasses) {
      s += '<g fill="none" stroke="#7d8ea0" stroke-width="1.1">' +
        '<circle cx="34" cy="31" r="4"/><circle cx="46" cy="31" r="4"/><path d="M38 31h4"/></g>';
    }
    if (opts.mask) {
      s += '<path d="M26 27h28v7a5 5 0 0 1-5 5H31a5 5 0 0 1-5-5z" fill="#0f2a33" stroke="' +
        opts.mask + '" stroke-width="1.3"/>';
      s += '<path d="M28 31h24" stroke="' + opts.mask + '" stroke-width="1.6" opacity=".9"/>';
    }
    s += '<path d="M38 38h4" stroke="' + line + '" stroke-width="1.2" stroke-linecap="round"/>';
    s += '<path d="M20 56c2-8 9-12 20-12s18 4 20 12z" fill="' + (opts.shirt || '#1b2733') + '"/>';
    return s;
  }

  function textCard(txt, color) {
    return BG +
      '<rect x="6" y="14" width="68" height="32" rx="3" fill="#0a1016" stroke="#22303f"/>' +
      '<text x="40" y="35" text-anchor="middle" font-size="11" font-family="sans-serif" ' +
      'fill="' + (color || '#dfe8f0') + '" letter-spacing="1">' + txt + '</text>';
  }

  var STIMULI = [
    { id: 'alice_front', label: '艾莉絲·陳<br>正面照', aria: '刺激：艾莉絲·陳的正面照片',
      art: face({ hair: '#3fb9a6', shirt: '#20303e' }) },
    { id: 'alice_profile', label: '艾莉絲·陳<br>側臉', aria: '刺激：艾莉絲·陳的側臉照片',
      art: face({ hair: '#3fb9a6', profile: true, shirt: '#20303e' }) },
    { id: 'alice_sketch', label: '艾莉絲·陳<br>素描', aria: '刺激：艾莉絲·陳的鉛筆素描',
      art: face({ hair: '#8fb8c9', sketch: true }) },
    { id: 'alice_mask', label: '她的角色<br>戴著面罩', aria: '刺激：艾莉絲·陳飾演的角色，戴著面罩',
      art: face({ hair: '#3fb9a6', mask: '#7cf6d8', shirt: '#123240' }) },
    { id: 'alice_text', label: '純文字<br>「艾莉絲·陳」', aria: '刺激：純文字「艾莉絲·陳」',
      art: textCard('艾莉絲·陳', '#e8f4ff') },
    { id: 'lin_mo', label: '林默<br>同劇搭檔', aria: '刺激：另一位演員林默的照片',
      art: face({ hair: '#d09b46', shirt: '#332a1e' }) },
    { id: 'stranger', label: '陌生人<br>非名人', aria: '刺激：一位陌生人的照片',
      art: face({ hair: '#6b7684', glasses: true, shirt: '#242b33' }) },
    { id: 'lighthouse', label: '北方燈塔<br>照片', aria: '刺激：北方燈塔的照片',
      art: BG +
        '<path d="M0 48h80v12H0z" fill="#132330"/>' +
        '<path d="M34 50l3-30h6l3 30z" fill="#e3e9ee"/>' +
        '<path d="M36 30h8v4h-8zM35 40h10v4H35z" fill="#e07a63"/>' +
        '<rect x="36" y="12" width="8" height="8" rx="1.5" fill="#ffd98a"/>' +
        '<path d="M44 14l22-6v18z" fill="#ffd98a" opacity=".26"/>' +
        '<path d="M36 14L14 8v18z" fill="#ffd98a" opacity=".16"/>' },
    { id: 'lighthouse_text', label: '純文字<br>「北方燈塔」', aria: '刺激：純文字「北方燈塔」',
      art: textCard('北方燈塔', '#e8f4ff') },
    { id: 'landscape', label: '風景<br>無名山谷', aria: '刺激：一片無名山谷的風景照',
      art: BG +
        '<path d="M0 40l18-16 12 11 14-17 18 22 18-9v29H0z" fill="#1c3040"/>' +
        '<path d="M0 48l22-12 16 8 20-10 22 12v22H0z" fill="#16242f"/>' +
        '<circle cx="62" cy="14" r="5" fill="#3d5567"/>' },
    { id: 'teapot', label: '隨機物件<br>茶壺', aria: '刺激：一個茶壺',
      art: BG +
        '<path d="M26 30h22a10 10 0 0 1 0 18H26a9 9 0 0 1 0-18z" fill="#3a4a58"/>' +
        '<path d="M48 34c7-1 8 8 1 9" fill="none" stroke="#3a4a58" stroke-width="2.4"/>' +
        '<path d="M26 36c-7 0-9-4-13-2 3 5 7 7 13 8z" fill="#3a4a58"/>' +
        '<path d="M33 30l2-5h6l2 5z" fill="#4d6070"/>' +
        '<rect x="34" y="22" width="8" height="3" rx="1.5" fill="#5c7183"/>' },
    { id: 'blank', label: '空白畫面<br>（基線）', aria: '刺激：空白畫面，用來量基線放電率',
      art: BG +
        '<rect x="10" y="16" width="60" height="28" rx="3" fill="#0a1016" stroke="#1c2733" stroke-dasharray="3 3"/>' +
        '<path d="M34 30h12" stroke="#2b3947" stroke-width="1.4" stroke-linecap="round"/>' },
    { id: 'recall_alice', label: '請病人閉上眼睛，想她', aria: '刺激：請病人閉上眼睛，回想艾莉絲·陳',
      special: true, recall: true,
      art: face({ hair: '#3fb9a6', closed: true, shirt: '#20303e' }) +
        '<circle cx="58" cy="26" r="2.4" fill="#0e2b2a" stroke="#3fb9a6" stroke-width=".8"/>' +
        '<circle cx="66" cy="16" r="7" fill="#0e2b2a" stroke="#3fb9a6" stroke-width="1"/>' +
        '<circle cx="66" cy="16" r="3" fill="#7cf6d8" opacity=".75"/>' }
  ];

  /* ---------------- 神經元（反應型態依論文重現） ---------------- */
  var CELLS = [
    {
      id: 'A',
      name: '單元 A',
      area: '右前海馬迴 · single unit',
      concept: '演員「艾莉絲·陳」',
      baseline: 0.08,
      note: '照著 2005 年 Nature 那顆珍妮佛·安妮斯頓／荷莉·貝瑞細胞的型態做的。照片、素描、角色扮相，甚至只是螢幕上一行純文字的名字，它都放電——它編碼的是概念，不是像素。試試最下面那顆「請病人閉上眼睛想她」。',
      resp: {
        alice_front: 20, alice_profile: 18, alice_sketch: 16,
        alice_mask: 15, alice_text: 12, recall_alice: 11
      }
    },
    {
      id: 'B',
      name: '單元 B',
      area: '左海馬旁迴 · single unit',
      concept: '地標「北方燈塔」',
      baseline: 0.3,
      note: '對應論文裡那顆雪梨歌劇院細胞：它對建築的照片放電，也對「Sydney Opera」這串字放電，卻對「Eiffel Tower」沒反應。留意它對山谷風景有微弱的反應——多半跨不過基線 + 5 SD 的門檻，所以在論文裡「不算數」。這就是為什麼統計閾值很重要。',
      resp: { lighthouse: 19, lighthouse_text: 11, landscape: 4.2 }
    },
    {
      id: 'C',
      name: '單元 C',
      area: '右內嗅皮質 · single unit',
      concept: '艾莉絲·陳 ＋ 林默（同劇搭檔）',
      baseline: 0.15,
      note: '打破「祖母細胞」迷思的那一類。論文裡有一顆同時對珍妮佛·安妮斯頓和《六人行》另一位女演員放電；還有一顆對比薩斜塔和艾菲爾鐵塔都放電；內嗅皮質那顆對路克·天行者放電的細胞，對尤達也放電。相關的概念，共用細胞。',
      resp: {
        alice_front: 15, alice_profile: 13, alice_sketch: 11, alice_mask: 10,
        alice_text: 8.5, recall_alice: 7.5, lin_mo: 16
      }
    },
    {
      id: 'D',
      name: '單元 D',
      area: '左杏仁核 · multi-unit',
      concept: '（沒有偏好——控制單元）',
      baseline: 2.6,
      note: '2005 年那篇記錄到 993 個單元，其中 861 個像這樣：對呈現的每一張圖片都沒有顯著反應。它的基線比較吵（2.6 Hz），但就是不挑食。你把電極插進腦子裡，絕大多數時候聽到的就是這種聲音。',
      resp: {}
    }
  ];

  /* ---------------- 狀態 ---------------- */
  function loadSet(k) {
    try {
      var a = JSON.parse(localStorage.getItem(k) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveSet(k, arr) {
    try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) { /* 無痕模式 */ }
  }

  var state = {
    cell: CELLS[0],
    stim: null,
    running: false,
    trialStart: 0,
    rows: [],
    counts: {},
    discovered: loadSet(LS.discovered),
    trials: parseInt(localStorage.getItem(LS.trials) || '0', 10) || 0,
    sound: localStorage.getItem(LS.sound) === '1',
    reduced: false,
    visible: true,
    inView: true,
    peakShown: 0
  };

  /* ---------------- DOM ---------------- */
  function $(s) { return document.querySelector(s); }
  var tray = $('#tray'), cellsBox = $('#cells'), cv = $('#cv');
  var ctx = cv.getContext('2d');
  var roStim = $('#ro-stim'), roPeak = $('#ro-peak'), roLat = $('#ro-lat'),
      roCount = $('#ro-count'), roSig = $('#ro-sig');
  var stBase = $('#st-base'), stTrials = $('#st-trials'),
      stSel = $('#st-sel'), stSparse = $('#st-sparse');
  var scopeTitle = $('#scope-title'), scopeSub = $('#scope-sub'), cellNote = $('#cell-note');
  var live = $('#live'), barsBox = $('#bars'), tuneEmpty = $('#tune-empty');
  var scopeEl = document.querySelector('.scope');

  /* ---------------- 建構刺激盤 ---------------- */
  STIMULI.forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'stim' + (s.special ? ' special' : '');
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', s.aria);
    b.dataset.id = s.id;
    b.innerHTML = svg(s.art) + '<span>' + s.label + '</span>';
    b.addEventListener('click', function () { runTrial(s.id); });
    tray.appendChild(b);
  });

  /* ---------------- 建構電極清單 ---------------- */
  CELLS.forEach(function (c, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cellbtn';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
    b.tabIndex = i === 0 ? 0 : -1;
    b.dataset.id = c.id;
    b.innerHTML = '<strong>' + c.name + ' — ' + c.concept + '</strong><span>' + c.area +
      ' · 基線 ' + c.baseline.toFixed(2) + ' Hz</span>';
    b.addEventListener('click', function () { selectCell(c.id); });
    b.addEventListener('keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowDown' || k === 'ArrowRight') n = (i + 1) % CELLS.length;
      else if (k === 'ArrowUp' || k === 'ArrowLeft') n = (i - 1 + CELLS.length) % CELLS.length;
      else if (k === 'Home') n = 0;
      else if (k === 'End') n = CELLS.length - 1;
      if (n !== null) {
        e.preventDefault();
        selectCell(CELLS[n].id);
        cellsBox.children[n].focus();
      }
    });
    cellsBox.appendChild(b);
  });

  function selectCell(id) {
    var c = CELLS.filter(function (x) { return x.id === id; })[0];
    if (!c || c === state.cell) return;
    state.cell = c;
    state.rows = [];
    state.stim = null;
    state.running = false;
    Array.prototype.forEach.call(cellsBox.children, function (b) {
      var on = b.dataset.id === id;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    scopeTitle.textContent = '示波器 · ' + c.name;
    scopeSub.textContent = c.area;
    cellNote.textContent = c.note;
    stBase.textContent = c.baseline.toFixed(2) + ' Hz';
    resetReadout();
    refreshTray();
    refreshStats();
    renderBars();
    draw();
    announce('已切換到 ' + c.name + '：' + c.area + '，基線 ' + c.baseline.toFixed(2) + ' 赫茲。');
  }

  /* ---------------- 反應模型 ---------------- */
  function envelope(t, recall) {
    if (recall) {
      // 自由回憶：內生性的重新啟動，緩升、持續（Gelbard-Sagiv et al., 2008）
      if (t < 80) return 0;
      var rise = Math.min(1, (t - 80) / 340);
      var fall = t > 1600 ? Math.max(0, 1 - (t - 1600) / 260) : 1;
      return rise * fall * 0.92;
    }
    // 感知：約 300 ms 起，420 ms 左右達峰，並帶一段延續放電
    if (t < 240 || t > 1500) return 0;
    var g = Math.exp(-Math.pow(t - 420, 2) / (2 * 110 * 110));
    var plateau = (t >= 300 && t <= STIM_OFF) ? 0.3 : 0;
    return Math.min(1, g + plateau);
  }

  function lambdaAt(t) {
    var c = state.cell, base = c.baseline;
    if (!state.stim) return base;
    var peak = c.resp[state.stim] || 0;
    if (!peak) return base;
    var st = STIMULI.filter(function (s) { return s.id === state.stim; })[0];
    return base + peak * envelope(t, st && st.recall);
  }

  // 論文判準：300–1000 ms 的尖峰數 > 基線平均 + 5 SD，且至少 2 個 spike
  function threshold(base) {
    var win = (WIN_B - WIN_A) / 1000;
    var mu = base * win;
    return Math.max(2, mu + 5 * Math.sqrt(mu));
  }

  function rateAt(spikes, t) {
    var sd = KERNEL_SD, s = 0, i;
    for (i = 0; i < spikes.length; i++) {
      var d = t - spikes[i];
      if (d > -4 * sd && d < 4 * sd) s += Math.exp(-d * d / (2 * sd * sd));
    }
    return s * 1000 / (sd * Math.sqrt(2 * Math.PI));
  }

  /* ---------------- 試驗 ---------------- */
  function runTrial(stimId) {
    if (state.running) return;
    state.stim = stimId;
    var row = { stim: stimId, spikes: [], done: false };
    state.rows.push(row);
    if (state.rows.length > MAX_ROWS) state.rows.shift();

    refreshTray();
    var s = STIMULI.filter(function (x) { return x.id === stimId; })[0];
    roStim.textContent = s.label.replace(/<br>/g, ' ');

    if (state.reduced) {
      simulateWhole(row);   // 降級：不做動畫，直接把整段掃描算出來
      finishTrial(row);
      draw();
      return;
    }
    state.running = true;
    state.trialStart = performance.now();
    ensureLoop();
  }

  function simulateWhole(row) {
    var dt = 1000 / SR;
    for (var t = T0; t < T1; t += dt) {
      if (Math.random() < lambdaAt(t) * dt / 1000) row.spikes.push(t + Math.random() * dt);
    }
  }

  function finishTrial(row) {
    row.done = true;
    state.running = false;

    var c = state.cell, t;
    var cnt = row.spikes.filter(function (x) { return x >= WIN_A && x <= WIN_B; }).length;
    var thr = threshold(c.baseline);
    var sig = cnt >= thr;

    var peak = 0;
    for (t = -200; t <= T1; t += 10) {
      var r = rateAt(row.spikes, t);
      if (r > peak) peak = r;
    }

    var thrHz = Math.max(c.baseline + 5 * Math.sqrt(Math.max(c.baseline, 0.05)), 3);
    var lat = null;
    for (t = 0; t <= T1; t += 5) {
      if (rateAt(row.spikes, t) > thrHz) { lat = t; break; }
    }

    row.peak = peak; row.count = cnt; row.sig = sig; row.lat = lat;

    if (!state.counts[c.id]) state.counts[c.id] = {};
    if (!state.counts[c.id][row.stim]) state.counts[c.id][row.stim] = [];
    state.counts[c.id][row.stim].push(cnt);

    state.trials++;
    try { localStorage.setItem(LS.trials, String(state.trials)); } catch (e) {}
    var key = c.id + '|' + row.stim;
    if (state.discovered.indexOf(key) === -1) {
      state.discovered.push(key);
      saveSet(LS.discovered, state.discovered);
    }

    animateNumber(peak);
    roCount.textContent = String(cnt);
    roLat.textContent = (sig && lat !== null) ? Math.round(lat) + ' ms' : '—';
    roSig.textContent = sig ? '顯著反應' : (cnt >= 2 ? '未達閾值' : '無反應');
    roSig.dataset.sig = sig ? 'yes' : (cnt >= 2 ? 'edge' : 'no');

    if (sig && !state.reduced) {
      scopeEl.classList.add('burst');
      setTimeout(function () { scopeEl.classList.remove('burst'); }, 720);
    }

    var st = STIMULI.filter(function (x) { return x.id === row.stim; })[0];
    announce(c.name + ' 對「' + st.aria.replace('刺激：', '') + '」：300 到 1000 毫秒之間 ' +
      cnt + ' 個尖峰，峰值 ' + peak.toFixed(1) + ' 赫茲，閾值 ' + thr.toFixed(1) + ' 個尖峰。' +
      (sig ? '顯著反應。' : '未達顯著。'));

    refreshTray();
    refreshStats();
    renderBars();
  }

  function resetReadout() {
    roStim.textContent = '—';
    roPeak.innerHTML = '0.0<small>Hz</small>';
    roLat.textContent = '—';
    roCount.textContent = '0';
    roSig.textContent = '待命';
    roSig.dataset.sig = 'no';
    state.peakShown = 0;
  }

  function animateNumber(target) {
    var from = state.peakShown || 0;
    if (state.reduced || document.hidden) {
      state.peakShown = target;
      roPeak.innerHTML = target.toFixed(1) + '<small>Hz</small>';
      return;
    }
    var t0 = performance.now(), dur = 480;
    function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      var v = from + (target - from) * e;
      state.peakShown = v;
      roPeak.innerHTML = v.toFixed(1) + '<small>Hz</small>';
      if (k < 1) requestAnimationFrame(step);
      else {
        state.peakShown = target;
        roPeak.innerHTML = target.toFixed(1) + '<small>Hz</small>';
      }
    }
    requestAnimationFrame(step);
  }

  function announce(msg) { live.textContent = msg; }

  /* ---------------- 掃描全部刺激 ---------------- */
  $('#scan').addEventListener('click', function () {
    if (state.running) return;
    var c = state.cell;
    if (!state.counts[c.id]) state.counts[c.id] = {};
    var saved = state.stim;
    STIMULI.forEach(function (s) {
      var arr = state.counts[c.id][s.id] || (state.counts[c.id][s.id] = []);
      state.stim = s.id;
      for (var k = 0; k < 3; k++) {
        var row = { stim: s.id, spikes: [] };
        simulateWhole(row);
        arr.push(row.spikes.filter(function (t) { return t >= WIN_A && t <= WIN_B; }).length);
      }
      var key = c.id + '|' + s.id;
      if (state.discovered.indexOf(key) === -1) state.discovered.push(key);
    });
    state.stim = saved;
    saveSet(LS.discovered, state.discovered);
    state.trials += STIMULI.length * 3;
    try { localStorage.setItem(LS.trials, String(state.trials)); } catch (e) {}
    refreshTray(); refreshStats(); renderBars();
    announce('已對 ' + c.name + ' 掃描全部 13 種刺激，每種 3 次試驗。調諧圖已更新。');
  });

  $('#clear').addEventListener('click', function () {
    state.rows = [];
    state.stim = null;
    state.running = false;
    resetReadout();
    refreshTray();
    draw();
    announce('已清空示波器。');
  });

  /* ---------------- 聲音（Web Audio 即時合成，預設關閉） ---------------- */
  var ac = null, lastClick = 0;
  var soundBtn = $('#sound'), soundLabel = $('#sound-label');

  function updateSoundBtn() {
    soundBtn.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', state.sound ? '關閉喀噠聲' : '開啟喀噠聲');
    soundLabel.textContent = '喀噠聲：' + (state.sound ? '開' : '關');
  }
  soundBtn.addEventListener('click', function () {
    state.sound = !state.sound;
    try { localStorage.setItem(LS.sound, state.sound ? '1' : '0'); } catch (e) {}
    updateSoundBtn();
    if (state.sound) initAudio();
  });
  updateSoundBtn();

  function initAudio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
  }

  function click() {
    if (!state.sound || !ac) return;
    var now = ac.currentTime;
    if (now - lastClick < 0.012) return;
    lastClick = now;
    var len = Math.floor(ac.sampleRate * 0.006);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    var src = ac.createBufferSource(); src.buffer = buf;
    var bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.1;
    var g = ac.createGain(); g.gain.value = 0.14;
    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start(now);
  }

  /* ---------------- 畫布 ---------------- */
  var W = 0, H = 0, dpr = 1;
  var trace = null, traceLen = 0, wavePos = -1;
  var WAVE = [0, -0.18, -0.62, -1, -0.72, -0.1, 0.34, 0.5, 0.28, 0.1, 0.02];
  var PAD = { l: 52, r: 14, t: 22, b: 14 };

  function resize() {
    var rect = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(240, Math.round(rect.width));
    H = Math.max(240, Math.round(rect.height));
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var tw = Math.max(60, W - PAD.l - PAD.r);
    if (traceLen !== tw) {
      traceLen = tw;
      trace = new Float32Array(traceLen);
      wavePos = -1;
    }
    draw();
  }

  function xOf(t) {
    return PAD.l + (t - T0) / (T1 - T0) * (W - PAD.l - PAD.r);
  }

  function currentTrialTime() {
    return T0 + (performance.now() - state.trialStart);
  }

  function draw() {
    var c = state.cell;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#06090d';
    ctx.fillRect(0, 0, W, H);

    var rTop = PAD.t, rBot = Math.round(H * 0.40);
    var fTop = Math.round(H * 0.44), fBot = Math.round(H * 0.64);
    var axisY = fBot + 1;
    var tTop = Math.round(H * 0.755), tBot = H - PAD.b;
    var x0 = PAD.l, x1 = W - PAD.r;
    var isRecall = state.stim === 'recall_alice';

    // 刺激呈現區塊
    ctx.fillStyle = 'rgba(76,196,255,.075)';
    if (isRecall) {
      ctx.fillRect(xOf(0), rTop, xOf(T1) - xOf(0), fBot - rTop);
    } else {
      ctx.fillRect(xOf(STIM_ON), rTop, xOf(STIM_OFF) - xOf(STIM_ON), fBot - rTop);
    }

    // 網格
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#16202c';
    [-500, 0, 500, 1000, 1500].forEach(function (t) {
      var x = Math.round(xOf(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, rTop); ctx.lineTo(x, fBot); ctx.stroke();
    });
    ctx.strokeStyle = '#22303f';
    var xz = Math.round(xOf(0)) + 0.5;
    ctx.beginPath(); ctx.moveTo(xz, rTop); ctx.lineTo(xz, fBot); ctx.stroke();

    // 時間軸
    ctx.fillStyle = '#5f7085';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    [-500, 0, 500, 1000, 1500].forEach(function (t) {
      ctx.fillText(String(t), xOf(t), axisY + 14);
    });
    ctx.textAlign = 'left';
    ctx.fillText('ms', x1 - 16, axisY + 14);

    // 自由回憶：口頭報告標記
    if (isRecall) {
      var xr = Math.round(xOf(REPORT_T)) + 0.5;
      ctx.strokeStyle = '#ffb454';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(xr, rTop); ctx.lineTo(xr, fBot); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffb454';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('病人開口：「艾莉絲…」', xr - 6, rTop + 10);
      ctx.textAlign = 'left';
    }

    // ---- raster ----
    ctx.fillStyle = '#5f7085';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('試驗', PAD.l - 8, rTop + 8);
    ctx.textAlign = 'left';

    var rows = state.rows;
    var rh = (rBot - rTop - 6) / MAX_ROWS;
    rows.forEach(function (row, i) {
      var y = rTop + 6 + i * rh;
      ctx.strokeStyle = 'rgba(255,255,255,.03)';
      ctx.beginPath();
      ctx.moveTo(x0, Math.round(y + rh / 2) + 0.5);
      ctx.lineTo(x1, Math.round(y + rh / 2) + 0.5);
      ctx.stroke();

      var strong = row.done ? row.sig : (c.resp[row.stim] || 0) > 5;
      ctx.strokeStyle = strong ? '#7cf6d8' : '#4e6a7c';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var k = 0; k < row.spikes.length; k++) {
        var x = xOf(row.spikes[k]);
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x, y + rh - 3);
      }
      ctx.stroke();
    });

    if (!rows.length) {
      ctx.fillStyle = '#33445a';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('點左邊的刺激，開始一次試驗', (x0 + x1) / 2, (rTop + rBot) / 2);
      ctx.textAlign = 'left';
    }

    // ---- 放電率曲線 ----
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1b2634';
    ctx.beginPath();
    ctx.moveTo(x0, fBot + 0.5); ctx.lineTo(x1, fBot + 0.5); ctx.stroke();

    var maxHz = 26;
    function yHz(v) { return fBot - Math.min(v, maxHz) / maxHz * (fBot - fTop); }

    ctx.fillStyle = '#5f7085';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Hz', PAD.l - 8, fTop + 8);
    ctx.fillText('20', PAD.l - 8, yHz(20) + 3);
    ctx.fillText('0', PAD.l - 8, fBot + 3);
    ctx.textAlign = 'left';

    // 顯著閾值（等效放電率）
    var thrHz = Math.max(c.baseline + 5 * Math.sqrt(Math.max(c.baseline, 0.05)), 3);
    ctx.strokeStyle = 'rgba(255,180,84,.5)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(yHz(thrHz)) + 0.5);
    ctx.lineTo(x1, Math.round(yHz(thrHz)) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // 同刺激的平均曲線（暗）
    var same = rows.filter(function (r) { return r.stim === state.stim && r.done; });
    if (same.length > 1) {
      ctx.strokeStyle = 'rgba(124,246,216,.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var px = x0; px <= x1; px += 2) {
        var tt = T0 + (px - x0) / (x1 - x0) * (T1 - T0);
        var acc = 0;
        for (var q = 0; q < same.length; q++) acc += rateAt(same[q].spikes, tt);
        var yv = yHz(acc / same.length);
        if (px === x0) ctx.moveTo(px, yv); else ctx.lineTo(px, yv);
      }
      ctx.stroke();
    }

    // 目前試驗的即時曲線
    var cur = rows.length ? rows[rows.length - 1] : null;
    if (cur && cur.spikes.length) {
      var nowT = state.running ? currentTrialTime() : T1;
      ctx.strokeStyle = '#7cf6d8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      var started = false;
      for (var p2 = x0; p2 <= x1; p2 += 2) {
        var t2 = T0 + (p2 - x0) / (x1 - x0) * (T1 - T0);
        if (t2 > nowT) break;
        var y2 = yHz(rateAt(cur.spikes, t2));
        if (!started) { ctx.moveTo(p2, y2); started = true; } else ctx.lineTo(p2, y2);
      }
      ctx.stroke();
    }

    // 掃描游標
    if (state.running) {
      var xc = Math.round(xOf(currentTrialTime())) + 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(124,246,216,.55)';
      ctx.beginPath(); ctx.moveTo(xc, rTop); ctx.lineTo(xc, fBot); ctx.stroke();
    }

    // ---- 原始電極訊號 ----
    ctx.fillStyle = '#5f7085';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('µV', PAD.l - 8, tTop + 8);
    ctx.textAlign = 'left';
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#3f5062';
    ctx.fillText('原始電極訊號（即時，細胞外記錄）', PAD.l, tTop - 4);

    var mid = (tTop + tBot) / 2;
    var amp = (tBot - tTop) / 2 - 2;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#141d27';
    ctx.beginPath();
    ctx.moveTo(x0, Math.round(mid) + 0.5);
    ctx.lineTo(x1, Math.round(mid) + 0.5);
    ctx.stroke();

    if (trace) {
      ctx.strokeStyle = '#5fe0c4';
      ctx.beginPath();
      for (var i = 0; i < traceLen; i++) {
        var xx = x0 + i;
        var yy = mid - trace[i] * amp;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  }

  /* ---------------- 主迴圈（rAF） ---------------- */
  var raf = 0, last = 0, carry = 0;

  function canRun() {
    return state.visible && state.inView && !state.reduced;
  }
  function ensureLoop() {
    if (!raf && canRun()) { last = 0; carry = 0; raf = requestAnimationFrame(loop); }
  }
  function stopLoop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function loop(now) {
    raf = 0;
    if (!last) last = now;
    var dt = Math.min(60, now - last);
    last = now;

    var nSamp = Math.floor((dt + carry) * SR / 1000);
    carry = (dt + carry) - nSamp * 1000 / SR;

    if (nSamp > 0 && trace) {
      var n = Math.min(nSamp, traceLen);
      trace.copyWithin(0, n);
      var row = state.rows.length ? state.rows[state.rows.length - 1] : null;

      for (var i = 0; i < n; i++) {
        var idx = traceLen - n + i;
        var tAbs = now - dt + (i + 1) * (dt / n);
        var tTrial = state.running ? (T0 + (tAbs - state.trialStart)) : null;
        var lam = state.running ? lambdaAt(tTrial) : state.cell.baseline;
        var v;

        if (wavePos >= 0 && wavePos < WAVE.length) {
          v = WAVE[wavePos] * 0.82 + (Math.random() - 0.5) * 0.05;
          wavePos++;
        } else {
          v = (Math.random() - 0.5) * 0.12;
          if (Math.random() < lam / SR) {
            v = WAVE[0];
            wavePos = 1;
            if (state.running && row && tTrial >= T0 && tTrial <= T1) row.spikes.push(tTrial);
            click();
          }
        }
        trace[idx] = v;
      }
    }

    if (state.running && currentTrialTime() >= T1) {
      finishTrial(state.rows[state.rows.length - 1]);
    }

    draw();
    if (canRun()) raf = requestAnimationFrame(loop);
  }

  /* ---------------- 暫停條件：分頁隱藏 / 捲出畫面 / 減少動態 ---------------- */
  function forceFinish() {
    var row = state.rows[state.rows.length - 1];
    if (!row) { state.running = false; return; }
    var from = row.spikes.length ? row.spikes[row.spikes.length - 1] : T0;
    var dt = 1000 / SR;
    for (var t = from + dt; t < T1; t += dt) {
      if (Math.random() < lambdaAt(t) * dt / 1000) row.spikes.push(t);
    }
    finishTrial(row);
    draw();
  }

  document.addEventListener('visibilitychange', function () {
    state.visible = !document.hidden;
    if (!state.visible) {
      if (state.running) forceFinish();
      stopLoop();
    } else {
      ensureLoop();
    }
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      state.inView = es[0].isIntersecting;
      if (!state.inView) {
        if (state.running) forceFinish();
        stopLoop();
      } else {
        ensureLoop();
      }
    }, { threshold: 0.05 });
    io.observe(cv);
  }

  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  function applyMotion() {
    state.reduced = mq.matches;
    if (state.reduced) {
      if (state.running) forceFinish();
      stopLoop();
      if (trace) {
        for (var i = 0; i < traceLen; i++) trace[i] = (Math.random() - 0.5) * 0.1;
      }
      draw();
    } else {
      ensureLoop();
    }
  }
  if (mq.addEventListener) mq.addEventListener('change', applyMotion);
  else if (mq.addListener) mq.addListener(applyMotion);

  /* ---------------- 調諧圖 ---------------- */
  function median(a) {
    if (!a || !a.length) return null;
    var b = a.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  function renderBars() {
    var c = state.cell;
    var data = state.counts[c.id] || {};
    var vals = STIMULI.map(function (s) { return median(data[s.id]); });
    var has = vals.some(function (v) { return v !== null; });
    var thr = threshold(c.baseline);
    var maxV = Math.max(thr * 1.6, 6);
    vals.forEach(function (v) { if (v !== null && v > maxV) maxV = v; });
    maxV *= 1.08;

    barsBox.classList.toggle('empty', !has);
    tuneEmpty.hidden = has;
    barsBox.innerHTML = '';

    // 長條高度依容器實際高度計算，手機也不會被切到
    var LBL = 40; // 標籤 34px + gap 6px
    var boxH = barsBox.clientHeight || 210;
    var BAR_H = Math.max(60, boxH - 12 - LBL);
    barsBox.style.setProperty('--thrb', (LBL + thr / maxV * BAR_H) + 'px');

    STIMULI.forEach(function (s, i) {
      var v = vals[i];
      var d = document.createElement('div');
      d.className = 'bar' + (v !== null && v >= thr ? ' hit' : '');
      var h = v === null ? 0 : Math.max(0.012, v / maxV);
      var lbl = s.label.replace(/<br>/g, ' ');
      d.innerHTML = '<div class="bar-fill" style="height:' + BAR_H + 'px"></div>' +
        '<div class="bar-lbl">' + lbl + '</div>';
      d.title = lbl + '：中位數 ' +
        (v === null ? '尚未測試' : v + ' 個尖峰（閾值 ' + thr.toFixed(1) + '）');
      barsBox.appendChild(d);

      var fill = d.firstChild;
      if (state.reduced) {
        fill.style.transform = 'scaleY(' + h + ')';
      } else {
        requestAnimationFrame(function () {
          setTimeout(function () { fill.style.transform = 'scaleY(' + h + ')'; }, i * 32);
        });
      }
    });
  }

  /* ---------------- 統計 / 刺激盤狀態 ---------------- */
  function refreshTray() {
    Array.prototype.forEach.call(tray.children, function (b) {
      var id = b.dataset.id;
      b.setAttribute('aria-pressed', state.stim === id ? 'true' : 'false');
      b.classList.toggle('tested', state.discovered.indexOf(state.cell.id + '|' + id) !== -1);
    });
  }

  function refreshStats() {
    var c = state.cell;
    var data = state.counts[c.id] || {};
    var thr = threshold(c.baseline);
    var n = 0, tested = 0;
    STIMULI.forEach(function (s) {
      var m = median(data[s.id]);
      if (m !== null) { tested++; if (m >= thr) n++; }
    });
    stTrials.textContent = String(state.trials);
    stSel.textContent = n + ' / ' + tested + ' 種已測刺激';
    stSparse.textContent = tested ? ((n / tested * 100).toFixed(0) + '%（本次取樣）') : '—';
  }

  /* ---------------- 內容分頁 ---------------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  function selectTab(i) {
    tabs.forEach(function (t, j) {
      var on = i === j;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(i); });
    t.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); selectTab(n); tabs[n].focus(); }
    });
  });

  /* ---------------- 啟動 ---------------- */
  window.addEventListener('resize', function () {
    clearTimeout(resize._t);
    resize._t = setTimeout(function () { resize(); renderBars(); }, 120);
  });

  // 第一次使用者互動時才建立 AudioContext（瀏覽器自動播放政策）
  document.addEventListener('pointerdown', function once() {
    if (state.sound) initAudio();
  }, { once: true });

  scopeTitle.textContent = '示波器 · ' + state.cell.name;
  scopeSub.textContent = state.cell.area;
  cellNote.textContent = state.cell.note;
  stBase.textContent = state.cell.baseline.toFixed(2) + ' Hz';
  resetReadout();
  refreshTray();
  refreshStats();
  renderBars();
  resize();
  applyMotion();
})();

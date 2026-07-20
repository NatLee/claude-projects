/* 你以為的曲線 — 先畫，再看真相
   純靜態、零依賴。所有數據皆為公開統計（見 說明.md）。
   localStorage 前綴：drawit. */
(() => {
  'use strict';

  /* ────────── 動畫偏好 ────────── */
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let REDUCE = mqReduce.matches;
  mqReduce.addEventListener('change', e => { REDUCE = e.matches; });

  /* ────────── 資料 ────────── */
  const nf = n => n.toLocaleString('en-US');

  const DATASETS = [
    {
      id: 'solar',
      name: '太陽能板價格',
      title: '太陽能板的價格，接下來 19 年跌到哪裡？',
      sub: '全球太陽光電模組平均價格（每瓦，2023 年美元）。1990–2005 的線已經畫給你了 — 請接著畫出 2006 → 2024。',
      split: 2005,
      y: [0, 12],
      ticks: [0, 3, 6, 9, 12],
      fmt: v => '$' + v.toFixed(2),
      pts: [[1990,11.72],[1991,10.85],[1992,10.11],[1993,9.46],[1994,8.95],[1995,8.27],[1996,7.73],[1997,7.71],
            [1998,6.94],[1999,6.41],[2000,6.29],[2001,6.09],[2002,5.57],[2003,5.29],[2004,4.56],[2005,4.60],
            [2006,5.02],[2007,5.06],[2008,4.61],[2009,3.08],[2010,2.44],[2011,2.00],[2012,1.08],[2013,0.83],
            [2014,0.77],[2015,0.72],[2016,0.66],[2017,0.56],[2018,0.50],[2019,0.45],[2020,0.36],[2021,0.32],
            [2022,0.36],[2023,0.31],[2024,0.26]],
      facts: [
        '1975 年，一瓦太陽能模組要 <strong>$128</strong>（2023 年美元）；2024 年只要 <strong>$0.26</strong> —— 半世紀跌掉 <strong>99.8%</strong>。',
        '你接手的頭三年（2006–2008）價格其實還「漲」了一波（多晶矽缺料）；真正的崩塌從 2009 年開始：<strong>$4.61 → $0.83，五年掉了 82%</strong>。',
        '幾乎每個人都會把它畫成「繼續緩降」，因為直覺是線性的。學習曲線卻是指數的：產量每翻一倍，價格就再往下砍一截。'
      ],
      src: '資料：Our World in Data（Nemet 2009；Farmer & Lafond 2016；IRENA）'
    },
    {
      id: 'ev',
      name: '電動車占比',
      title: '電動車占全球新車銷售的比例，衝到哪裡了？',
      sub: '純電＋插電式混合動力，占當年全球新車銷售的百分比。2013–2018 已給你 — 請畫出 2019 → 2024。',
      split: 2018,
      y: [0, 26],
      ticks: [0, 5, 10, 15, 20, 25],
      fmt: v => v.toFixed(1) + '%',
      pts: [[2013,0.29],[2014,0.44],[2015,0.68],[2016,0.95],[2017,1.4],[2018,2.4],
            [2019,2.7],[2020,4.4],[2021,9.3],[2022,15],[2023,18],[2024,21]],
      facts: [
        '2013 年，全球每 1,000 台新車只有 <strong>3 台</strong>是電動車；2024 年是 <strong>每 5 台就有 1 台</strong>（21%）。',
        '轉折發生在 2020–2022：占比從 4.4% 一路跳到 15%，<strong>三年翻了三倍多</strong>。疫情那年不是停滯，是起跑。',
        'IEA 對 2025 年的估計約 <strong>25%</strong>。如果你畫的是一條溫和的斜線，那你和 2019 年的多數車廠想的一樣。'
      ],
      src: '資料：IEA Global EV Outlook（經 Our World in Data 整理）'
    },
    {
      id: 'life',
      name: '世界平均壽命',
      title: '1990 年之後，全世界的平均壽命走去哪了？',
      sub: '全球出生時平均餘命（歲）。1950–1990 已給你 — 請畫出 1991 → 2023（含疫情那幾年）。',
      split: 1990,
      y: [44, 78],
      ticks: [45, 55, 65, 75],
      fmt: v => v.toFixed(1) + ' 歲',
      pts: [[1950,46.4],[1951,47.1],[1952,48.2],[1953,48.8],[1954,49.7],[1955,50.2],[1956,50.7],[1957,51.1],
            [1958,51.6],[1959,49.6],[1960,47.8],[1961,50.3],[1962,53.2],[1963,53.7],[1964,54.3],[1965,54.0],
            [1966,54.6],[1967,55.1],[1968,55.6],[1969,56.0],[1970,56.3],[1971,56.0],[1972,57.2],[1973,57.7],
            [1974,58.1],[1975,58.3],[1976,58.6],[1977,59.2],[1978,59.5],[1979,60.2],[1980,60.5],[1981,60.9],
            [1982,61.3],[1983,61.5],[1984,61.9],[1985,62.2],[1986,62.7],[1987,63.2],[1988,63.4],[1989,63.8],
            [1990,64.0],[1991,64.1],[1992,64.3],[1993,64.4],[1994,64.3],[1995,64.9],[1996,65.2],[1997,65.5],
            [1998,65.7],[1999,66.0],[2000,66.4],[2001,66.8],[2002,67.1],[2003,67.4],[2004,67.7],[2005,68.1],
            [2006,68.6],[2007,69.0],[2008,69.3],[2009,69.7],[2010,70.1],[2011,70.4],[2012,70.8],[2013,71.1],
            [2014,71.4],[2015,71.6],[2016,71.9],[2017,72.1],[2018,72.4],[2019,72.6],[2020,71.9],[2021,70.9],
            [2022,72.6],[2023,73.2]],
      facts: [
        '1950 年全球平均壽命 <strong>46.4 歲</strong>，2019 年 <strong>72.6 歲</strong> —— 七十年間，人類平均多活了 26 年。',
        '起跑點左邊那個深谷不是誤差：1959–1961 年的<strong>中國大饑荒</strong>，把「全世界」的平均壽命一度壓回 47.8 歲。',
        'COVID-19 讓 2021 年掉到 <strong>70.9 歲</strong>（約等於倒退十年），但 2023 年已回升到 <strong>73.2 歲</strong>，是有紀錄以來的最高點。多數人會畫出下跌，卻不敢畫出反彈。'
      ],
      src: '資料：UN World Population Prospects 2024（經 Our World in Data 整理）'
    },
    {
      id: 'birth',
      name: '台灣出生數',
      title: '2000 年以後，台灣一年生幾個孩子？',
      sub: '台灣每年出生嬰兒數。1980–2000 已給你 — 請畫出 2001 → 2023。',
      split: 2000,
      y: [0, 460000],
      ticks: [0, 100000, 200000, 300000, 400000],
      fmt: v => (v / 10000).toFixed(1) + ' 萬',
      pts: [[1980,427793],[1981,428346],[1982,415689],[1983,396576],[1984,378241],[1985,352431],[1986,324453],
            [1987,325300],[1988,343070],[1989,331476],[1990,339915],[1991,331330],[1992,330104],[1993,333291],
            [1994,332629],[1995,333164],[1996,331283],[1997,322022],[1998,285123],[1999,283308],[2000,272895],
            [2001,258651],[2002,244315],[2003,230252],[2004,218466],[2005,208823],[2006,206338],[2007,204232],
            [2008,197599],[2009,187534],[2010,171332],[2011,198097],[2012,220915],[2013,207916],[2014,211462],
            [2015,212264],[2016,206135],[2017,193976],[2018,182571],[2019,173797],[2020,161442],[2021,155741],
            [2022,135481],[2023,132404]],
      facts: [
        '1981 年台灣生了 <strong>42.8 萬</strong>個孩子；2023 年只剩 <strong>13.2 萬</strong> —— 四十年少了近七成。',
        '中間那兩個轉折不是雜訊，是生肖：1998 <strong>虎年</strong>一年蒸發 3.7 萬個新生兒，2010 <strong>虎年</strong>再探底，2012 <strong>龍年</strong>則硬是回升 5 萬。國家統計裡，真的看得到農民曆。',
        '2020 年起台灣的死亡數超過出生數，人口正式負成長。內政部登記的 2024 年出生數是 <strong>134,856 人</strong>，連續第 9 年下降。'
      ],
      src: '資料：UN World Population Prospects 2024（經 Our World in Data 整理）；2024 年登記數為內政部統計（中央社 2025/1/10）'
    },
    {
      id: 'chip',
      name: '摩爾定律',
      title: '一顆晶片上的電晶體，1990 年之後長成什麼樣？',
      sub: '當年最高階量產微處理器的電晶體數量。注意：y 軸是<strong>對數</strong>，每一格是 100 倍。1971–1990 已給你 — 請畫出 1991 → 2021。',
      split: 1990,
      log: true,
      tol: 0.15,                              // 對數題：容忍度收緊（1 個數量級的誤差就該扣很多分）
      y: [3, 11.2],
      ticks: [1e3, 1e5, 1e7, 1e9, 1e11],
      fmt: v => v >= 1e8 ? Math.round(v / 1e8).toLocaleString('en-US') + ' 億'
              : v >= 1e4 ? Math.round(v / 1e4).toLocaleString('en-US') + ' 萬'
              : nf(Math.round(v)),
      pts: [[1971,2308],[1972,3555],[1974,6098],[1979,29164],[1982,135773],[1985,273842],[1989,1207901],[1990,1207901],
            [1992,3105900],[1995,9646616],[1998,15261378],[1999,21673922],[2000,37180264],[2001,42550656],
            [2002,220673400],[2004,273842000],[2005,305052770],[2006,582941600],[2007,805842200],[2009,2308241400],
            [2011,2600000000],[2013,5000000000],[2014,5700000000],[2016,8000000000],[2017,19200000000],
            [2018,21100000000],[2019,39500000000],[2021,58200000000]],
      facts: [
        '1971 年的 Intel 4004 只有 <strong>2,300 顆</strong>電晶體；2021 年最大的量產微處理器有 <strong>582 億顆</strong> —— 五十年放大了約 <strong>2,500 萬倍</strong>。',
        '在對數紙上，摩爾定律是<strong>一條直線</strong>。只要你畫的線是彎的、開始趨緩的，你就低估了它——而且是低估好幾個數量級。',
        '這正是指數成長最狠的地方：它從不「看起來很快」，它只是每隔兩年再翻一倍，然後把所有人的直覺甩在後面。'
      ],
      src: '資料：Our World in Data（整理自 Wikipedia〈Transistor count〉）'
    },
    {
      id: 'net',
      name: '全球網路人口',
      title: '2010 年之後，全世界又有多少人上了網？',
      sub: '全球網際網路使用人數（億人）。2005–2010 已給你 — 請畫出 2011 → 2021。',
      split: 2010,
      y: [0, 60],
      ticks: [0, 15, 30, 45, 60],
      fmt: v => v.toFixed(1) + ' 億人',
      pts: [[2005,10.28],[2006,11.47],[2007,13.65],[2008,15.61],[2009,17.54],[2010,19.94],
            [2011,21.97],[2012,23.98],[2013,25.74],[2014,27.61],[2015,29.81],[2016,32.96],
            [2017,35.40],[2018,38.19],[2019,42.10],[2020,47.40],[2021,50.75]],
      facts: [
        '2005 年全球有 <strong>10.3 億</strong>人上網，2021 年是 <strong>50.7 億</strong> —— 16 年多了 40 億人，平均<strong>每天新增約 70 萬人</strong>。',
        '2020 年的封城把曲線又往上折了一次：<strong>一年就多了 5.3 億人</strong>，是 2005 年以來最大的單年增幅。',
        '這條線少見地「幾乎是直的」——它是本站六題裡最容易畫準的一題。如果你連它都畫低了，那說明我們對成長的直覺，預設值就是保守。'
      ],
      src: '資料：Our World in Data（整理自 ITU 與世界銀行）'
    }
  ];

  /* ────────── DOM ────────── */
  const $ = id => document.getElementById(id);
  const svg = $('chart');
  const gGrid = $('gGrid'), gBand = $('gBand'), gKnown = $('gKnown'),
        gGuess = $('gGuess'), gTruth = $('gTruth'), gAxis = $('gAxis'), gCursor = $('gCursor');
  const pad = $('drawpad'), padHint = $('padHint');
  const btnReveal = $('btnReveal'), btnRedraw = $('btnRedraw'), btnNext = $('btnNext'), btnClear = $('btnClear');

  const W = 760, H = 440, M = { t: 20, r: 22, b: 42, l: 66 };
  const PW = W - M.l - M.r, PH = H - M.t - M.b;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ────────── 狀態 ────────── */
  let D = null;            // 目前資料集
  let years = [], y0 = 0, y1 = 0;
  let guess = new Map();   // year -> value（原始單位）
  let lastYear = null;
  let drawing = false;
  let revealed = false;
  let cursorYear = null;
  let confettiRAF = 0;

  const LS = 'drawit.best';
  const loadBest = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
  const saveBest = b => { try { localStorage.setItem(LS, JSON.stringify(b)); } catch { /* 隱私模式：忽略 */ } };

  /* ────────── 座標 ────────── */
  const tr = v => D.log ? Math.log10(v) : v;          // 值 → 轉換空間
  const inv = t => D.log ? Math.pow(10, t) : t;       // 轉換空間 → 值
  const X = yr => M.l + (yr - y0) / (y1 - y0) * PW;
  const Y = v => M.t + PH - (tr(v) - D.y[0]) / (D.y[1] - D.y[0]) * PH;
  const yearAtX = px => clamp(Math.round(y0 + (px - M.l) / PW * (y1 - y0)), y0, y1);
  const valAtY = py => inv(clamp(D.y[0] + (M.t + PH - py) / PH * (D.y[1] - D.y[0]), D.y[0], D.y[1]));

  const anchor = () => D.map.get(D.split);

  /* ────────── 繪圖 ────────── */
  function clearG(...gs) { gs.forEach(g => { while (g.firstChild) g.removeChild(g.firstChild); }); }

  function drawStatic() {
    clearG(gGrid, gAxis, gKnown, gGuess, gTruth, gBand, gCursor);

    // 水平格線 + y 軸標籤
    D.ticks.forEach(t => {
      const py = Y(t);
      gGrid.appendChild(el('line', { class: 'grid-line', x1: M.l, x2: M.l + PW, y1: py, y2: py }));
      const lab = el('text', { class: 'axis-txt', x: M.l - 10, y: py + 4, 'text-anchor': 'end' });
      lab.textContent = D.fmt(t);
      gAxis.appendChild(lab);
    });

    // x 軸標籤
    const xs = new Set([y0, D.split, y1]);
    const step = Math.max(1, Math.round((y1 - y0) / 5));
    for (let yr = y0 + step; yr < y1; yr += step) xs.add(yr);
    [...xs].sort((a, b) => a - b).forEach(yr => {
      const t = el('text', { class: 'axis-txt', x: X(yr), y: M.t + PH + 22, 'text-anchor': 'middle' });
      t.textContent = yr;
      gAxis.appendChild(t);
    });

    // 分界線
    gGrid.appendChild(el('line', {
      class: 'divider', x1: X(D.split), x2: X(D.split), y1: M.t, y2: M.t + PH
    }));
    const dl = el('text', { class: 'axis-lab', x: X(D.split) + 8, y: M.t + 14 });
    dl.textContent = '← 已知　你畫 →';
    gAxis.appendChild(dl);

    // 已知線
    const known = D.pts.filter(p => p[0] <= D.split);
    gKnown.appendChild(el('path', { class: 'known-line', d: path(known) }));
    gKnown.appendChild(el('circle', { class: 'truth-dot', cx: X(D.split), cy: Y(anchor()), r: 4 }));
  }

  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');

  function guessPts() {
    const out = [[D.split, anchor()]];
    for (let yr = D.split + 1; yr <= y1; yr++) {
      if (!guess.has(yr)) break;
      out.push([yr, guess.get(yr)]);
    }
    return out;
  }

  function drawGuess() {
    clearG(gGuess);
    const pts = guessPts();
    if (pts.length < 2) return;
    gGuess.appendChild(el('path', { class: 'guess-line' + (revealed ? ' settled' : ''), d: path(pts) }));
    if (!revealed) {
      const last = pts[pts.length - 1];
      gGuess.appendChild(el('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4, fill: 'var(--guess)' }));
    }
  }

  function drawCursor() {
    clearG(gCursor);
    if (cursorYear == null || revealed || !guess.has(cursorYear)) return;
    const px = X(cursorYear), v = guess.get(cursorYear), py = Y(v);
    gCursor.appendChild(el('line', { class: 'cursor-line', x1: px, x2: px, y1: M.t, y2: M.t + PH }));
    gCursor.appendChild(el('circle', { cx: px, cy: py, r: 5, fill: 'var(--guess)' }));
    const t = el('text', {
      class: 'cursor-txt', x: clamp(px, M.l + 30, M.l + PW - 30), y: Math.max(M.t + 14, py - 12),
      'text-anchor': 'middle'
    });
    t.textContent = cursorYear + '：' + D.fmt(v);
    gCursor.appendChild(t);
  }

  /* ────────── 猜測輸入 ────────── */
  function setGuess(yr, v) {
    if (revealed) return;
    yr = clamp(yr, D.split + 1, y1);
    v = clamp(v, inv(D.y[0]), inv(D.y[1]));
    const from = lastYear == null ? D.split : lastYear;
    const fv = lastYear == null ? anchor() : guess.get(lastYear);
    const a = Math.min(from, yr), b = Math.max(from, yr);
    for (let k = a; k <= b; k++) {
      if (k <= D.split) continue;
      const t = b === a ? 1 : (k - from) / (yr - from);
      const val = inv(tr(fv) + (tr(v) - tr(fv)) * clamp(t, 0, 1));
      guess.set(k, val);
    }
    guess.set(yr, v);
    lastYear = yr;
    padHint.classList.add('gone');
    drawGuess();
    updateReady();
  }

  function updateReady() {
    const done = guess.has(y1);
    btnReveal.disabled = !done || revealed;
    if (done && !revealed) padHint.textContent = '✓ 畫好了 — 按下「揭曉真相」';
  }

  const localPt = e => {
    const r = pad.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * W,
      y: (e.clientY - r.top) / r.height * H
    };
  };

  pad.addEventListener('pointerdown', e => {
    if (revealed) return;
    drawing = true;
    lastYear = null;
    guess.clear();
    pad.setPointerCapture(e.pointerId);
    const p = localPt(e);
    setGuess(yearAtX(p.x), valAtY(p.y));
    e.preventDefault();
  });
  pad.addEventListener('pointermove', e => {
    if (!drawing || revealed) return;
    const p = localPt(e);
    setGuess(yearAtX(p.x), valAtY(p.y));
  });
  const endDraw = () => { drawing = false; };
  pad.addEventListener('pointerup', endDraw);
  pad.addEventListener('pointercancel', endDraw);
  pad.addEventListener('pointerleave', endDraw);

  /* 鍵盤：←→ 選年、↑↓ 調值、Enter 揭曉 */
  pad.addEventListener('keydown', e => {
    if (revealed) return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();

    if (!guess.size) {                       // 首次：先給一條水平線
      for (let yr = D.split + 1; yr <= y1; yr++) guess.set(yr, anchor());
      cursorYear = D.split + 1;
      padHint.classList.add('gone');
    }
    const stepV = (D.y[1] - D.y[0]) / 40;

    if (e.key === 'ArrowRight') cursorYear = clamp((cursorYear ?? D.split) + 1, D.split + 1, y1);
    else if (e.key === 'ArrowLeft') cursorYear = clamp((cursorYear ?? y1) - 1, D.split + 1, y1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const yr = cursorYear ?? (D.split + 1);
      const cur = tr(guess.get(yr));
      const nv = inv(clamp(cur + (e.key === 'ArrowUp' ? stepV : -stepV), D.y[0], D.y[1]));
      guess.set(yr, nv);
      cursorYear = yr;
    } else if (e.key === 'Enter') { if (!btnReveal.disabled) reveal(); return; }

    drawGuess();
    drawCursor();
    updateReady();
  });

  /* ────────── 揭曉 ────────── */
  function score() {
    const span = D.y[1] - D.y[0];
    let sum = 0, n = 0;
    D.pts.forEach(([yr, v]) => {
      if (yr <= D.split || !guess.has(yr)) return;
      sum += Math.abs(tr(guess.get(yr)) - tr(v));
      n++;
    });
    const mae = n ? sum / n : span;
    const tol = D.tol ?? 0.3;                  // 平均誤差達到 y 軸範圍的 tol 倍 → 0 分
    return { acc: Math.round(clamp(100 * (1 - mae / (tol * span)), 0, 100)), mae };
  }

  function verdictText(g, t) {
    if (t <= 0) return '你把終點畫在了 ' + D.fmt(g) + '。';
    const r = tr(g) === tr(t) ? 1 : g / t;
    if (D.log) {                                   // 對數題：用「數量級」講
      const oom = Math.abs(Math.log10(g / t));
      if (oom < 0.35) return '你居然跟上了指數。這很罕見。';
      return (g < t)
        ? '你低估了整整 <strong>' + oom.toFixed(1) + ' 個數量級</strong> —— 真相是你畫的 ' + Math.round(t / g).toLocaleString('en-US') + ' 倍。'
        : '你高估了 <strong>' + oom.toFixed(1) + ' 個數量級</strong>，這回直覺衝過頭了。';
    }
    if (r >= 1.15) return '你<strong>高估</strong>了：你畫的終點是真相的 <strong>' + r.toFixed(1) + ' 倍</strong>。';
    if (r <= 0.87) return '你<strong>低估</strong>了：真相是你畫的 <strong>' + (1 / r).toFixed(1) + ' 倍</strong>。';
    return '終點抓得很準 —— 你的直覺這次沒騙你。';
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    btnReveal.disabled = true;
    clearG(gCursor);
    drawGuess();

    const truth = D.pts.filter(p => p[0] >= D.split);
    const tp = el('path', { class: 'truth-line', d: path(truth) });
    gTruth.appendChild(tp);

    // 誤差帶（你的線 vs 真相）
    const gp = guessPts();
    const poly = gp.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1))
      .concat(truth.slice().reverse().map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)))
      .join(' ');
    const band = el('polygon', { class: 'gap-band', points: poly });
    gBand.appendChild(band);

    const endT = D.pts[D.pts.length - 1][1];
    const endG = guess.get(y1);
    const dot = el('circle', { class: 'truth-dot', cx: X(y1), cy: Y(endT), r: 5, opacity: 0 });

    const finish = () => {
      band.classList.add('show');
      gTruth.appendChild(el('circle', { class: 'end-halo', cx: X(y1), cy: Y(endT), r: 16 }));
      dot.setAttribute('opacity', 1);
      gTruth.appendChild(dot);
      const lbl = el('text', {
        class: 'cursor-txt', x: clamp(X(y1), M.l + 40, M.l + PW - 34), y: Math.max(M.t + 16, Y(endT) - 16),
        'text-anchor': 'end', fill: 'var(--truth)'
      });
      lbl.textContent = D.fmt(endT);
      gTruth.appendChild(lbl);
    };

    if (REDUCE) {
      finish();
    } else {
      const len = tp.getTotalLength();
      tp.style.strokeDasharray = len;
      tp.style.strokeDashoffset = len;
      const t0 = performance.now(), dur = 1100;
      const step = now => {
        const k = clamp((now - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        tp.style.strokeDashoffset = len * (1 - e);
        if (k < 1 && !document.hidden) requestAnimationFrame(step);
        else { tp.style.strokeDashoffset = 0; finish(); }
      };
      requestAnimationFrame(step);
    }

    // 結果面板
    const { acc } = score();
    $('sideIdle').hidden = true;
    $('sideResult').hidden = false;
    $('endGuess').textContent = D.fmt(endG);
    $('endTruth').textContent = D.fmt(endT);
    $('verdict').innerHTML = verdictText(endG, endT);
    countUp($('scoreNum'), acc);

    const fp = $('factPanel');
    $('factTitle').textContent = '真相 · ' + D.name;
    $('factList').innerHTML = D.facts.map(f => '<li>' + f + '</li>').join('');
    $('factSrc').textContent = D.src;
    fp.hidden = false;

    const best = loadBest();
    const prev = best[D.id] ?? -1;
    if (acc > prev) { best[D.id] = acc; saveBest(best); $('bestLine').textContent = '★ 新紀錄'; }
    else $('bestLine').textContent = '本題最佳：' + prev + ' 分';
    renderChips(); renderReport();

    if (acc >= 80) confetti();
  }

  function countUp(node, target) {
    if (REDUCE) { node.textContent = target; return; }
    const t0 = performance.now(), dur = 900;
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1);
      node.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && !document.hidden) requestAnimationFrame(step);
      else node.textContent = target;
    };
    requestAnimationFrame(step);
  }

  /* ────────── 紙屑 ────────── */
  function confetti() {
    if (REDUCE || document.hidden) return;
    const host = $('confetti');
    const colors = ['#c8452a', '#b8862b', '#3f7d54', '#20201d', '#7b8fa1'];
    for (let i = 0; i < 36; i++) {
      const b = document.createElement('div');
      b.className = 'bit';
      b.style.background = colors[i % colors.length];
      b.style.left = (48 + Math.random() * 46) + '%';
      b.style.top = '30%';
      host.appendChild(b);
      const dx = (Math.random() - 0.5) * 320, dy = 220 + Math.random() * 260;
      const anim = b.animate(
        [{ transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
         { transform: `translate3d(${dx}px,${dy}px,0) rotate(${(Math.random() - .5) * 900}deg)`, opacity: 0 }],
        { duration: 1200 + Math.random() * 900, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }
      );
      anim.onfinish = () => b.remove();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(confettiRAF);
      $('confetti').innerHTML = '';
    }
  });

  /* ────────── UI ────────── */
  function renderChips() {
    const best = loadBest();
    const host = $('chips');
    host.innerHTML = '';
    DATASETS.forEach(d => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.setAttribute('aria-pressed', String(D && d.id === D.id));
      b.innerHTML = d.name + (best[d.id] != null ? ' <span class="tick">✓' + best[d.id] + '</span>' : '');
      b.addEventListener('click', () => load(d.id));
      host.appendChild(b);
    });
  }

  function renderReport() {
    const best = loadBest();
    const host = $('reportList');
    host.innerHTML = '';
    DATASETS.forEach(d => {
      const li = document.createElement('li');
      const done = best[d.id] != null;
      li.innerHTML = '<span class="rname">' + d.name + '</span>' +
        (done ? '<span class="rscore">' + best[d.id] + ' 分</span>'
              : '<span class="rscore empty">未挑戰</span>');
      host.appendChild(li);
    });
  }

  function load(id) {
    D = DATASETS.find(d => d.id === id) || DATASETS[0];
    D.map = new Map(D.pts);
    years = D.pts.map(p => p[0]);
    y0 = years[0]; y1 = years[years.length - 1];
    guess = new Map(); lastYear = null; cursorYear = null; revealed = false; drawing = false;

    $('qTitle').textContent = D.title;
    $('qSub').innerHTML = D.sub;
    $('sideIdle').hidden = false;
    $('sideResult').hidden = true;
    $('factPanel').hidden = true;
    $('bestLine').textContent = '';
    padHint.classList.remove('gone');
    padHint.textContent = '👆 從虛線處開始，一路往右畫到底';
    btnReveal.disabled = true;

    drawStatic();
    drawGuess();
    renderChips();
    renderReport();
  }

  btnRedraw.addEventListener('click', () => load(D.id));
  btnReveal.addEventListener('click', reveal);
  btnNext.addEventListener('click', () => {
    const i = DATASETS.findIndex(d => d.id === D.id);
    load(DATASETS[(i + 1) % DATASETS.length].id);
    document.querySelector('.board').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
  });
  btnClear.addEventListener('click', () => {
    try { localStorage.removeItem(LS); } catch (e) { /* 忽略 */ }
    renderChips(); renderReport();
  });

  load(DATASETS[Math.floor(Math.random() * DATASETS.length)].id);
})();

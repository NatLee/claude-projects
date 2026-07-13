/* 消失的十天 — 曆法改革機器
 * 所有日期／星期皆由儒略日（JDN）即時推算，不查表。
 * localStorage 前綴：lostdays.
 */
(() => {
  'use strict';

  const LS = 'lostdays.';
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  /* ── 曆法核心：儒略日換算 ── */
  const gJDN = (y, m, d) => {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
      Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  };
  const jJDN = (y, m, d) => {
    const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
  };
  const jdnToJulian = (jdn) => {           // JDN → 儒略曆 {y,m,d}
    const c = jdn + 32082;
    const d0 = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor(1461 * d0 / 4);
    const m0 = Math.floor((5 * e + 2) / 153);
    return {
      d: e - Math.floor((153 * m0 + 2) / 5) + 1,
      m: m0 + 3 - 12 * Math.floor(m0 / 10),
      y: d0 - 4800 + Math.floor(m0 / 10)
    };
  };
  const weekdayOf = (jdn) => (jdn + 1) % 7;  // 0 = 星期日

  /* ── 八個改曆現場 ──
   * sched : 原定的那個月（舊曆），第 1 天的 JDN 與總天數
   * ghost : 被抹掉的日期編號區間
   * lived : 真正過完的日子（分段，各段起始 JDN 連續遞增）
   * extra : 憑空多出來的一天（只有瑞典 1712）
   */
  const STOPS = [
    {
      id: 'papal', chip: '天主教諸國', year: 1582,
      place: '教皇國・西班牙・葡萄牙・波蘭', month: '1582 年 10 月', offset: 10,
      sched: { base: jJDN(1582, 10, 1), days: 31 },
      ghost: [5, 14],
      lived: [
        { cal: 'j', from: 1, to: 4, base: jJDN(1582, 10, 1) },
        { cal: 'g', from: 15, to: 31, base: gJDN(1582, 10, 15) }
      ],
      story: '教宗額我略十三世的詔書寫得很輕鬆：10 月 4 日星期四的隔天，是 10 月 15 日星期五。<strong>星期沒有斷</strong>——只有日期被剪掉了十天。西班牙、葡萄牙、波蘭與義大利諸邦同一天照辦。那年 <em>10 月 5 日至 14 日出生的人，全世界一個也沒有</em>。'
    },
    {
      id: 'france', chip: '法國', year: 1582,
      place: '法蘭西王國', month: '1582 年 12 月', offset: 10,
      sched: { base: jJDN(1582, 12, 1), days: 31 },
      ghost: [10, 19],
      lived: [
        { cal: 'j', from: 1, to: 9, base: jJDN(1582, 12, 1) },
        { cal: 'g', from: 20, to: 31, base: gJDN(1582, 12, 20) }
      ],
      story: '法國慢了兩個月才跟上，於是把十天砍在 12 月：12 月 9 日之後直接是 12 月 20 日。那年的法國人<strong>沒有過到 12 月中旬</strong>——但聖誕節還在，因為刪的是月中，不是月底。'
    },
    {
      id: 'britain', chip: '大英帝國', year: 1752,
      place: '大不列顛與其殖民地（含北美）', month: '1752 年 9 月', offset: 11,
      sched: { base: jJDN(1752, 9, 1), days: 30 },
      ghost: [3, 13],
      lived: [
        { cal: 'j', from: 1, to: 2, base: jJDN(1752, 9, 1) },
        { cal: 'g', from: 14, to: 30, base: gJDN(1752, 9, 14) }
      ],
      story: '新教的英國拖了 170 年才低頭，代價是要刪的天數從 10 天長成 <strong>11 天</strong>：9 月 2 日星期三的隔天，是 9 月 14 日星期四。當時的北美殖民地也一起跳過——所以<em>美國的 1752 年 9 月，只有 19 天</em>。'
    },
    {
      id: 'sweden1712', chip: '瑞典 · 多一天', year: 1712,
      place: '瑞典王國', month: '1712 年 2 月', offset: 11, gain: true,
      sched: { base: jJDN(1712, 1, 31), days: 29 },
      ghost: null,
      extra: 30,
      lived: [{ cal: 's', from: 1, to: 30, base: jJDN(1712, 1, 31) }],
      story: '瑞典不想一次刪掉十一天，決定「分四十年慢慢少放閏日」——結果只執行了一次就忘了，1704 與 1708 照樣過閏年，日曆卡在<strong>誰都不是</strong>的位置。查理十二世乾脆下令退回儒略曆，把欠的一天還回去：那年二月先過了 29 日，隔天是 <em>2 月 30 日</em>。人類史上唯一的一次。'
    },
    {
      id: 'sweden1753', chip: '瑞典 · 補刀', year: 1753,
      place: '瑞典王國（這次來真的）', month: '1753 年 2 月', offset: 11,
      sched: { base: jJDN(1753, 2, 1), days: 28 },
      ghost: [18, 28],
      lived: [{ cal: 'j', from: 1, to: 17, base: jJDN(1753, 2, 1) }],
      story: '繞了四十年，瑞典還是得刪。1753 年 2 月 17 日之後直接跳到 3 月 1 日——那年的<strong>二月只有 17 天</strong>。這是全歐洲最迂迴的一次改曆：先發明一個誰都沒用過的曆法，再花十一天把它埋掉。'
    },
    {
      id: 'alaska', chip: '阿拉斯加', year: 1867,
      place: '阿拉斯加（俄國賣給美國那年）', month: '1867 年 10 月', offset: 12, weird: true,
      sched: { base: jJDN(1867, 10, 1), days: 31 },
      ghost: [7, 17],
      lived: [
        { cal: 'j', from: 1, to: 6, base: jJDN(1867, 10, 1) },
        { cal: 'g', from: 18, to: 31, base: gJDN(1867, 10, 18) }
      ],
      story: '俄國把阿拉斯加賣給美國，日曆得從儒略換成格里（差 12 天），同時<strong>國際換日線</strong>也從阿拉斯加東邊移到白令海峽——一邊減 12 天、一邊補回 1 天。淨結果：跳過 11 天，而且<em>星期五的隔天，還是星期五</em>。世界上少數真的發生過「連續兩個星期五」的地方。'
    },
    {
      id: 'russia', chip: '俄羅斯', year: 1918,
      place: '蘇維埃俄國（列寧簽署的法令）', month: '1918 年 2 月', offset: 13,
      sched: { base: jJDN(1918, 2, 1), days: 28 },
      ghost: [1, 13],
      lived: [{ cal: 'g', from: 14, to: 28, base: gJDN(1918, 2, 14) }],
      story: '拖到二十世紀，落差已經長到 <strong>13 天</strong>。1918 年 1 月 31 日的隔天，蘇俄直接宣布是 2 月 14 日——那年的<em>二月，1 號到 13 號整段不存在</em>。也因為改曆前用的是舊曆，1917 年 10 月 25 日的革命，換算後落在 11 月 7 日：<strong>十月革命，其實在十一月慶祝</strong>。'
    },
    {
      id: 'greece', chip: '希臘 · 最後一個', year: 1923,
      place: '希臘（歐洲最後一個改曆的國家）', month: '1923 年 2 月', offset: 13,
      sched: { base: jJDN(1923, 2, 1), days: 28 },
      ghost: [16, 28],
      lived: [{ cal: 'j', from: 1, to: 15, base: jJDN(1923, 2, 1) }],
      story: '額我略頒布詔書 <strong>341 年</strong>之後，歐洲最後一塊拼圖才落定：希臘的 1923 年 2 月 15 日之後，直接是 3 月 1 日。那年希臘的二月只有 15 天。至今東正教會仍有教派使用舊曆——所以他們的<em>聖誕節落在 1 月 7 日</em>，正好差 13 天。'
    }
  ];

  /* ── 事實卡 ── */
  const CARDS = [
    {
      yr: '1616', q: '莎士比亞與塞萬提斯同一天過世——為什麼那不是同一天？',
      tag: '兩套日期', a: '兩人的墓誌銘都寫著 <b>1616 年 4 月 23 日</b>，聯合國因此把這天訂為世界閱讀日。但西班牙 1582 年就改了曆，英格蘭還在用儒略曆：英格蘭的 4 月 23 日＝西班牙的 <b>5 月 3 日</b>。兩人其實差了十天過世。（塞萬提斯實際上更可能死於 4 月 22 日，4 月 23 日是下葬日。）'
    },
    {
      yr: '1642', q: '牛頓生於聖誕節。那為什麼歐陸的紀錄寫 1643 年？',
      tag: '連年份都變了', a: '英格蘭當時仍用儒略曆，牛頓生於 <b>1642 年 12 月 25 日</b>——一個誕生在聖誕節的男嬰。同一天在已改曆的歐陸，是 <b>1643 年 1 月 4 日</b>：不是聖誕節，甚至不是同一年。'
    },
    {
      yr: '1917', q: '十月革命，為什麼在十一月七日慶祝？',
      tag: '遲到的革命', a: '革命發生於俄國舊曆（儒略曆）<b>1917 年 10 月 25 日</b>。隔年蘇俄改用格里曆、一口氣跳過 13 天，這一天就換算成 <b>11 月 7 日</b>。於是蘇聯每年在十一月，紀念「十月」革命。'
    },
    {
      yr: '1712', q: '人類史上唯一一次的 2 月 30 日，發生在哪裡？',
      tag: '瑞典', a: '瑞典打算花四十年慢慢改曆，卻在中途忘了執行，日曆變成儒略、格里之外的第三種。1712 年他們決定認錯、退回儒略曆，於是在二月<b>加了一天</b>：2 月 29 日之後，是 <b>2 月 30 日</b>。這一天在其他地方叫做 3 月 11 日。'
    },
    {
      yr: '1867', q: '哪裡出現過「星期五的隔天還是星期五」？',
      tag: '阿拉斯加', a: '美國買下阿拉斯加那年，同時發生兩件事：日曆從儒略換成格里（差 12 天），國際換日線也往西挪（補回 1 天）。結果 <b>1867 年 10 月 6 日（星期五）</b> 的隔天，是 <b>10 月 18 日（星期五）</b>。'
    },
    {
      yr: '1752', q: '「還我十一天！」——英國人真的為了日曆上街暴動嗎？',
      tag: '其實沒有', a: '這句名言來自霍加斯 1755 年的畫作《選舉宴會》，畫中地上有張標語寫著 Give us our Eleven Days。後世把它讀成暴動的證據，但史家普遍認為那是在諷刺<b>選舉造勢</b>，不是曆法抗爭。<b>沒有可靠紀錄顯示暴動發生過</b>——一場流傳兩百年的誤讀。'
    },
    {
      yr: '1732', q: '華盛頓的生日為什麼從 2 月 11 日搬到 2 月 22 日？',
      tag: '甚至換了年份', a: '他出生時，英國的日曆寫 <b>1731 年 2 月 11 日</b>。改曆後不只加了 11 天變成 2 月 22 日，連年份也變成 <b>1732 年</b>——因為舊制英國把 <b>3 月 25 日</b>當新年第一天，二月還算「去年」。他本人晚年也改用新的生日。'
    }
  ];

  /* ── DOM ── */
  const $ = (s) => document.querySelector(s);
  const grid = $('#grid'), cal = $('#cal'), ashCv = $('#ash');
  const elPlace = $('#calPlace'), elMonth = $('#calMonth'), elState = $('#calState');
  const elStory = $('#story'), elLive = $('#live');
  const roDays = $('#roDays'), roGone = $('#roGone'), roOff = $('#roOff');
  const roGoneK = $('#roGoneK');
  const btnGo = $('#btnGo'), btnReset = $('#btnReset');
  const stopsBox = $('.stops'), ppDots = $('#ppDots');

  /* ── 動態偏好 ── */
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mq.matches;
  const syncMotion = () => {
    reduced = mq.matches;
    document.body.classList.toggle('no-motion', reduced);
  };
  mq.addEventListener('change', syncMotion);
  syncMotion();

  /* ── 造訪紀錄 ── */
  let seen = [];
  try {
    seen = JSON.parse(localStorage.getItem(LS + 'seen') || '[]');
    if (!Array.isArray(seen)) seen = [];
  } catch (e) { seen = []; }
  const saveSeen = () => {
    try { localStorage.setItem(LS + 'seen', JSON.stringify(seen)); } catch (e) { /* 無痕模式 */ }
  };

  let idx = 0;         // 目前停靠站
  let applied = false; // 是否已執行改曆
  let gen = 0;         // 世代：切換停靠站時作廢所有進行中的動畫／計時器

  /* ── 建 chips ── */
  STOPS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === 0));
    b.innerHTML = `<span>${s.chip}</span><span class="yr">${s.year}</span>`;
    b.addEventListener('click', () => select(i));
    stopsBox.appendChild(b);

    const dot = document.createElement('i');
    ppDots.appendChild(dot);
  });
  const chips = [...stopsBox.querySelectorAll('.chip')];
  const dots = [...ppDots.querySelectorAll('i')];

  stopsBox.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (idx + (e.key === 'ArrowRight' ? 1 : STOPS.length - 1)) % STOPS.length;
    select(n);
    chips[n].focus();
  });

  const paintSeen = () => {
    chips.forEach((c, i) => c.classList.toggle('seen', seen.includes(STOPS[i].id)));
    dots.forEach((d, i) => d.classList.toggle('on', seen.includes(STOPS[i].id)));
  };

  /* ── 產生格子資料 ── */
  // 原定的樣子：舊曆連續 1..days
  const schedCells = (s) => {
    const out = [];
    for (let d = 1; d <= s.sched.days; d++) {
      out.push({ n: d, jdn: s.sched.base + (d - 1), cal: 'old' });
    }
    return out;
  };
  // 實際過完的樣子
  const livedCells = (s) => {
    const out = [];
    s.lived.forEach(seg => {
      for (let d = seg.from; d <= seg.to; d++) {
        out.push({ n: d, jdn: seg.base + (d - seg.from), cal: seg.cal });
      }
    });
    return out;
  };

  /* ── 排版：依星期欄擺放，欄位沒有前進就換行（阿拉斯加的兩個星期五靠這招） ── */
  const layout = (cells) => {
    const rows = [];
    let row = null, prevCol = -1;
    cells.forEach(c => {
      const col = weekdayOf(c.jdn);
      if (!row || col <= prevCol) { row = new Array(7).fill(null); rows.push(row); }
      row[col] = c;
      prevCol = col;
    });
    return rows;
  };

  const renderGrid = (cells, s, showDoom) => {
    grid.innerHTML = '';
    const rows = layout(cells);
    const doom = s.ghost;
    rows.forEach(row => {
      row.forEach((c, col) => {
        const el = document.createElement('div');
        if (!c) { el.className = 'day blank'; el.setAttribute('aria-hidden', 'true'); grid.appendChild(el); return; }
        el.className = 'day';
        el.dataset.n = String(c.n);
        el.textContent = String(c.n);
        const wd = WEEK[weekdayOf(c.jdn)];
        const calName = c.cal === 'g' ? '格里曆' : c.cal === 's' ? '瑞典曆' : '儒略曆';
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-label', `${c.n} 日 星期${wd}（${calName}）`);
        if (c.cal === 'g') {
          el.classList.add('greg');
          const t = document.createElement('span');
          t.className = 'cal-tag';
          t.textContent = '新';
          el.appendChild(t);
        }
        if (showDoom && doom && c.n >= doom[0] && c.n <= doom[1]) el.classList.add('doomed');
        void col;
        grid.appendChild(el);
      });
    });
  };

  /* ── 數字滾動（帶世代守衛，切換停靠站時不會被上一輪覆寫） ── */
  const roll = (el, to, myGen) => {
    const from = parseInt(el.textContent, 10) || 0;
    if (reduced || from === to) { el.textContent = String(to); return; }
    const t0 = performance.now(), dur = 620;
    const step = (t) => {
      if (myGen !== gen) return;
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* ── 灰燼粒子 ── */
  const ctx = ashCv.getContext('2d');
  let parts = [], raf = 0;
  const fitCanvas = () => {
    const r = cal.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    ashCv.width = Math.max(1, Math.round(r.width * dpr));
    ashCv.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  addEventListener('resize', fitCanvas);

  const spawnAsh = (rects) => {
    if (reduced || document.hidden) return;
    fitCanvas();
    const base = cal.getBoundingClientRect();
    rects.forEach(r => {
      const cx = r.left - base.left + r.width / 2;
      const cy = r.top - base.top + r.height / 2;
      for (let i = 0; i < 16; i++) {
        parts.push({
          x: cx + (Math.random() - .5) * r.width * .8,
          y: cy + (Math.random() - .5) * r.height * .8,
          vx: (Math.random() - .5) * .5,
          vy: -0.35 - Math.random() * 1.05,
          r: .8 + Math.random() * 2.1,
          life: 1,
          decay: .006 + Math.random() * .011,
          hot: Math.random() < .34
        });
      }
    });
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const tick = () => {
    raf = 0;
    if (document.hidden) { parts = []; ctx.clearRect(0, 0, ashCv.width, ashCv.height); return; }
    ctx.clearRect(0, 0, ashCv.width, ashCv.height);
    parts = parts.filter(p => p.life > 0);
    parts.forEach(p => {
      p.x += p.vx + Math.sin(p.y * .05) * .25;
      p.y += p.vy;
      p.vy -= .004;
      p.life -= p.decay;
      ctx.globalAlpha = Math.max(0, p.life) * (p.hot ? .95 : .6);
      ctx.fillStyle = p.hot ? '#e05a2b' : '#6b6257';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (parts.length) raf = requestAnimationFrame(tick);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; parts = []; ctx.clearRect(0, 0, ashCv.width, ashCv.height); }
  });

  /* ── 選站 ── */
  function select(i) {
    idx = i;
    applied = false;
    gen++;                                   // 作廢上一站還在跑的滾動與燃燒計時
    const s = STOPS[i];
    chips.forEach((c, k) => c.setAttribute('aria-selected', String(k === i)));
    cal.classList.remove('done');
    elPlace.textContent = s.place;
    elMonth.textContent = s.month;
    elState.textContent = s.gain ? '原定的樣子（29 天）' : '原定的樣子（舊曆）';
    elStory.innerHTML = s.story;
    elLive.textContent = '';
    btnGo.disabled = false;
    btnGo.textContent = s.gain ? '把那一天加回來' : '執行改曆';
    roDays.textContent = String(s.sched.days);
    roGoneK.textContent = s.gain ? '憑空多出來的日子' : '被抹掉的日子';
    roGone.textContent = '0';
    roOff.textContent = String(s.offset);
    renderGrid(schedCells(s), s, true);
    parts = [];
    ctx.clearRect(0, 0, ashCv.width, ashCv.height);
  }

  /* ── 執行改曆：燒掉 → FLIP 補位 ── */
  function apply() {
    if (applied) return;
    applied = true;
    btnGo.disabled = true;
    const s = STOPS[idx];
    const myGen = gen;
    const lived = livedCells(s);

    // FLIP：記下存活格子的位置
    const before = new Map();
    const doomedEls = [];
    grid.querySelectorAll('.day:not(.blank)').forEach(el => {
      const n = el.dataset.n;
      if (el.classList.contains('doomed')) doomedEls.push(el);
      else before.set(n, el.getBoundingClientRect());
    });

    const finish = () => {
      if (myGen !== gen) return;             // 期間已切換停靠站，放棄這次收尾
      renderGrid(lived, s, false);
      cal.classList.add('done');
      elState.textContent = s.gain ? '實際過完的樣子（30 天）' : '實際過完的樣子';

      const cells = [...grid.querySelectorAll('.day:not(.blank)')];
      if (!reduced) {
        cells.forEach(el => {
          const n = el.dataset.n;
          const b = before.get(n);
          const a = el.getBoundingClientRect();
          if (!b) return;                      // 新生的日子（瑞典 2/30）
          const dx = b.left - a.left, dy = b.top - a.top;
          if (!dx && !dy) return;
          el.style.transition = 'none';
          el.style.transform = `translate(${dx}px, ${dy}px)`;
        });
        requestAnimationFrame(() => {
          if (myGen !== gen) return;
          cells.forEach(el => {
            el.style.transition = '';
            el.style.transform = '';
          });
        });
      }

      // 憑空生出的一天
      if (s.extra) {
        const born = cells.find(el => el.dataset.n === String(s.extra));
        if (born) { born.classList.add('born', 'glow'); }
      }
      // 重複的星期
      if (s.weird) {
        const seg2 = s.lived[1];
        const rep = cells.find(el => el.dataset.n === String(seg2.from));
        if (rep) rep.classList.add('repeat');
      }

      const days = lived.length;
      const gone = s.ghost ? (s.ghost[1] - s.ghost[0] + 1) : (s.extra ? 1 : 0);
      roll(roDays, days, myGen);
      roll(roGone, gone, myGen);

      let msg;
      if (s.gain) {
        msg = `瑞典的 1712 年 2 月，過了 30 天——2 月 30 日是人類史上唯一的一次。`;
      } else if (s.weird) {
        msg = `跳過 11 天，而且星期五之後還是星期五：${s.month}只有 ${days} 天。`;
      } else {
        msg = `${gone} 天從歷史上被移除。${s.month}只剩 ${days} 天，那些日期沒有任何人經歷過。`;
      }
      elLive.textContent = msg;

      if (!seen.includes(s.id)) { seen.push(s.id); saveSeen(); paintSeen(); }
      if (seen.length === STOPS.length) {
        elLive.textContent = msg + ' ── 八個改曆現場全數走過，你已經看完人類弄丟時間的所有方式。';
      }
    };

    if (doomedEls.length && !reduced && !document.hidden) {
      spawnAsh(doomedEls.map(el => el.getBoundingClientRect()));
      doomedEls.forEach((el, i) => {
        el.style.animationDelay = `${i * 26}ms`;
        el.classList.add('burning');
      });
      setTimeout(finish, 620 + doomedEls.length * 26);
    } else {
      finish();
    }
  }

  btnGo.addEventListener('click', apply);
  btnReset.addEventListener('click', () => select(idx));

  /* ── 生日換算 ── */
  const bdayIn = document.querySelector('#bdayIn'), bdayOut = document.querySelector('#bdayOut');

  const showBday = () => {
    const v = bdayIn.value;
    if (!v) { bdayOut.innerHTML = '<p class="bo-line">挑一個日子吧。</p>'; return; }
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d || y < 1583) {
      bdayOut.innerHTML = '<p class="bo-line">請挑 1583 年之後的日子（在那之前，格里曆還沒出生）。</p>';
      return;
    }
    const jd = gJDN(y, m, d);
    const old = jdnToJulian(jd);
    const off = jJDN(y, m, d) - jd;   // 格里曆的日期標籤比儒略曆快幾天
    const wd = WEEK[weekdayOf(jd)];

    // 哪些改曆會抹掉這個「月／日」
    const hits = STOPS.filter(s => {
      if (!s.ghost) return false;
      const sm = jdnToJulian(s.sched.base).m;   // 該月（舊曆）月份
      return sm === m && d >= s.ghost[0] && d <= s.ghost[1];
    });

    let html = `
      <p class="bo-line">你出生那天是<strong>星期${wd}</strong>。若你活在還沒改曆的俄國、希臘或英格蘭，身分證上會寫：</p>
      <p class="bo-old">儒略曆 <b>${old.y} 年 ${old.m} 月 ${old.d} 日</b></p>
      <p class="bo-line">兩套日曆在那時差 <strong>${off}</strong> 天。</p>
      <div class="bo-hits">`;

    if (hits.length) {
      hits.forEach((s, j) => {
        html += `<div class="hit" style="--j:${j}"><span class="mark">✕</span><span><strong>${s.year} 年的${s.chip}</strong>：${m} 月 ${d} 日被抹掉了——那一年，你不會有生日。</span></div>`;
      });
    } else {
      html += `<div class="hit safe" style="--j:0"><span class="mark">✓</span><span>你的生日運氣不錯：八次改曆刪掉的日期，沒有一次刪到 ${m} 月 ${d} 日。</span></div>`;
    }
    if (m === 2 && d === 29) {
      html += `<div class="hit" style="--j:${hits.length}"><span class="mark">✦</span><span>你是閏日寶寶——如果你生在 1712 年的瑞典，隔天還會有一個 <strong>2 月 30 日</strong>。</span></div>`;
    }
    html += '</div>';
    bdayOut.innerHTML = html;
  };
  bdayIn.addEventListener('input', showBday);

  /* ── 事實卡 ── */
  const cardsBox = document.querySelector('#cards');
  CARDS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'card';
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${c.yr}：${c.q}（點擊看答案）`);
    b.style.animationDelay = `${i * 60}ms`;
    b.style.animationDelay = `${i * 60}ms`;
    b.innerHTML = `
      <div class="card-in">
        <div class="face front">
          <div class="f-yr">${c.yr}</div>
          <div class="f-q">${c.q}</div>
          <div class="f-hint">點擊翻面 →</div>
        </div>
        <div class="face back">
          <div class="b-tag">${c.tag}</div>
          <div class="b-a">${c.a}</div>
        </div>
      </div>`;
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!on));
    });
    cardsBox.appendChild(b);
  });

  /* ── 啟動 ── */
  paintSeen();
  select(0);
  showBday();
  addEventListener('load', fitCanvas);
})();

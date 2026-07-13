/* 時光錯位 · 2026-07-14
   把卡片插進時間軸的正確位置。年份皆經查證（見 說明.md）。
   localStorage 前綴：chrono.
*/
(() => {
  'use strict';

  // ── 卡片：year 為顯示與判定用的整數年（負數＝西元前），k 為精確排序鍵 ──
  const DECK = [
    { id: 'pyramid',  y: -2560, k: -2560, e: '🔺', n: '吉薩大金字塔完工',      t: '古夫王的陵墓，蓋了約 26 年。' },
    { id: 'mammoth',  y: -1650, k: -1650, e: '🦣', n: '最後的長毛象消失',      t: '弗蘭格爾島上的孤島族群。' },
    { id: 'cleo',     y: -30,   k: -30,   e: '👑', n: '克麗奧佩脫拉之死',      t: '托勒密王朝就此告終。' },
    { id: 'colos',    y: 80,    k: 80,    e: '🏟️', n: '羅馬競技場落成',        t: '啟用時舉行了百日競技。' },
    { id: 'oxford',   y: 1096,  k: 1096,  e: '🎓', n: '牛津大學開始授課',      t: '英語世界最古老的大學。' },
    { id: 'aztec',    y: 1325,  k: 1325,  e: '🏝️', n: '阿茲特克建立特諾奇提特蘭', t: '湖中之城，日後的墨西哥城。' },
    { id: 'press',    y: 1440,  k: 1440,  e: '🖨️', n: '古騰堡發明活字印刷',    t: '知識第一次可以大量複製。' },
    { id: 'harvard',  y: 1636,  k: 1636,  e: '🏛️', n: '哈佛學院創立',          t: '比微積分還早問世。' },
    { id: 'bastille', y: 1789,  k: 1789,  e: '🗝️', n: '巴士底獄陷落',          t: '法國大革命的第一天。' },
    { id: 'fax',      y: 1843,  k: 1843,  e: '📠', n: '傳真機取得專利',        t: '蘇格蘭人 Alexander Bain 的鐘擺裝置。' },
    { id: 'civilwar', y: 1861,  k: 1861,  e: '⚔️', n: '美國南北戰爭爆發',      t: '桑特堡的第一聲砲響。' },
    { id: 'nokia',    y: 1865,  k: 1865,  e: '📱', n: '諾基亞創立',            t: '當時它是一間木漿造紙廠。' },
    { id: 'phone',    y: 1876,  k: 1876,  e: '☎️', n: '貝爾取得電話專利',      t: '「華生先生，過來一下。」' },
    { id: 'coke',     y: 1886,  k: 1886,  e: '🥤', n: '可口可樂問世',          t: '起初在藥局當提神飲料賣。' },
    { id: 'eiffel',   y: 1889,  k: 1889.25, e: '🗼', n: '艾菲爾鐵塔落成',      t: '3 月 31 日，為萬國博覽會而建。' },
    { id: 'nintendo', y: 1889,  k: 1889.72, e: '🎴', n: '任天堂創立',          t: '山內房治郎在京都做花札紙牌。' },
    { id: 'wright',   y: 1903,  k: 1903,  e: '✈️', n: '萊特兄弟首次動力飛行',  t: '第一趟只飛了 12 秒。' },
    { id: 'titanic',  y: 1912,  k: 1912,  e: '🚢', n: '鐵達尼號沉沒',          t: '首航第四天撞上冰山。' },
    { id: 'pigeon',   y: 1914,  k: 1914,  e: '🕊️', n: '最後一隻旅鴿瑪莎死去',  t: '曾經多達數十億隻的鳥，滅絕於動物園。' },
    { id: 'suffrage', y: 1920,  k: 1920,  e: '🗳️', n: '美國女性取得投票權',    t: '憲法第十九修正案通過。' },
    { id: 'pluto',    y: 1930,  k: 1930,  e: '🪐', n: '冥王星被發現',          t: '24 歲的湯博在閃視比較儀前找到它。' },
    { id: 'emu',      y: 1932,  k: 1932,  e: '🦤', n: '澳洲「鴯鶓戰爭」',      t: '軍隊帶機槍去對付鴯鶓——然後輸了。' },
    { id: 'sputnik',  y: 1957,  k: 1957,  e: '🛰️', n: '史普尼克一號升空',      t: '人類第一顆人造衛星。' },
    { id: 'slavery',  y: 1962,  k: 1962,  e: '⛓️', n: '沙烏地阿拉伯正式廢奴',  t: '國王下令禁止人口買賣。' },
    { id: 'moon',     y: 1969,  k: 1969,  e: '🌕', n: '阿波羅 11 號登陸月球',  t: '「這是我個人的一小步。」' },
    { id: 'swiss',    y: 1971,  k: 1971.10, e: '🇨🇭', n: '瑞士女性取得聯邦投票權', t: '2 月公投通過；最後一州要等到 1990。' },
    { id: 'email',    y: 1971,  k: 1971.85, e: '✉️', n: '第一封 @ 電子郵件',    t: 'Tomlinson 選了鍵盤上沒人要的符號。' },
    { id: 'apple',    y: 1976,  k: 1976,  e: '🍎', n: '蘋果公司創立',          t: '車庫裡的 Apple I。' },
    { id: 'starwars', y: 1977,  k: 1977.40, e: '🌌', n: '《星際大戰》上映',     t: '5 月 25 日，只在 32 家戲院。' },
    { id: 'guillo',   y: 1977,  k: 1977.69, e: '🗡️', n: '法國最後一次斷頭台行刑', t: '9 月 10 日，馬賽的清晨四點四十分。' },
    { id: 'web',      y: 1991,  k: 1991,  e: '🌐', n: '世界第一個網站上線',    t: 'CERN 的 info.cern.ch。' },
    { id: 'google',   y: 1998,  k: 1998,  e: '🔍', n: 'Google 創立',           t: '從史丹佛的一個研究計畫開始。' },
    { id: 'youtube',  y: 2005,  k: 2005,  e: '📹', n: 'YouTube 第一支影片',    t: '19 秒，內容是動物園的大象。' },
    { id: 'demote',   y: 2006,  k: 2006,  e: '💔', n: '冥王星被降級為矮行星',  t: '國際天文聯合會投票除名。' },
    { id: 'iphone',   y: 2007,  k: 2007,  e: '📲', n: '初代 iPhone 發表',      t: '「一台 iPod、一支電話、一個上網裝置。」' },
    { id: 'vcr',      y: 2016,  k: 2016,  e: '📼', n: '世界最後一台錄影機出廠', t: '船井電機停產 VCR，錄影帶時代正式結束。' }
  ];

  // ── 時光錯位：所有 need 的卡片都在時間軸上、且剛放下的那張在其中，就揭示 ──
  const SHOCKS = [
    { need: ['fax', 'phone'],       html: '<strong>傳真機（1843）比電話（1876）早了 33 年。</strong>它也早於美國南北戰爭——那台機器用鐘擺掃描金屬板，把圖案「拍」過電報線。' },
    { need: ['oxford', 'aztec'],    html: '<strong>牛津大學開課時（1096），阿茲特克人還沒建城。</strong>特諾奇提特蘭要到 229 年後（1325）才在湖中立起第一根木樁。' },
    { need: ['eiffel', 'nintendo'], html: '<strong>任天堂和艾菲爾鐵塔同一年（1889）誕生。</strong>那年它做的是手繪花札紙牌——比福特汽車（1903）還老 14 歲。' },
    { need: ['starwars', 'guillo'], html: '<strong>《星際大戰》上映四個月後，法國還在用斷頭台。</strong>1977 年 5 月銀幕上有光劍，同年 9 月 10 日馬賽監獄的鍘刀落下——西方世界最後一次。' },
    { need: ['moon', 'swiss'],      html: '<strong>人類先登上月球（1969），瑞士女性才拿到聯邦投票權（1971）。</strong>最後一個州（內阿彭策爾）被聯邦法院逼著點頭，已是 1990 年。' },
    { need: ['sputnik', 'slavery'], html: '<strong>人造衛星已經在繞地球（1957），沙烏地阿拉伯才正式廢奴（1962）。</strong>太空時代與奴隸制，重疊了整整五年。' },
    { need: ['pyramid', 'mammoth'], html: '<strong>金字塔蓋好的時候（前 2560），長毛象還活著。</strong>弗蘭格爾島上的最後一群又撐了 900 年，到前 1650 年才消失。' },
    { need: ['pluto', 'demote'],    html: '<strong>冥王星從被發現（1930）到被除名（2006），連繞太陽一圈都還沒走完。</strong>它的一年是 248 個地球年——它只走了大約 30%。' },
    { need: ['youtube', 'vcr'],     html: '<strong>YouTube 上線 11 年後，世界才做出最後一台錄影機。</strong>2016 年 7 月船井電機停產 VCR——那一年，錄影帶和 4K 串流在同一個貨架上共存。' },
    { need: ['nokia', 'phone'],     html: '<strong>諾基亞（1865）比電話（1876）還老。</strong>它創立時是芬蘭河邊的一間木漿廠，離「手機」還有 116 年。' },
    { need: ['cleo', 'pyramid', 'moon'], html: '<strong>克麗奧佩脫拉離登月，比離金字塔完工還近。</strong>她（前 30）與金字塔（前 2560）隔了 2530 年，與阿波羅 11 號（1969）只隔 1999 年。' },
    { need: ['harvard', 'press'],   html: '<strong>哈佛（1636）創校時，牛頓還沒出生。</strong>它比微積分、比蒸汽機、比美國本身都早——校園裡最老的，是時間本身。' }
  ];

  const LS = {
    best: 'chrono.best',
    plays: 'chrono.plays'
  };

  const $ = (id) => document.getElementById(id);
  const rail = $('rail');
  const handSlot = $('handSlot');
  const revealLine = $('revealLine');
  const livesEl = $('lives');
  const streakEl = $('streak');
  const scoreEl = $('score');
  const bestEl = $('best');
  const shockEl = $('shock');
  const shockText = $('shockText');
  const overEl = $('over');
  const overScore = $('overScore');
  const overSub = $('overSub');
  const handHint = $('handHint');

  // ── 減少動態 ──
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let calm = mq.matches;
  const onMq = (e) => { calm = e.matches; };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq);
  else if (typeof mq.addListener === 'function') mq.addListener(onMq);

  const store = {
    get(k, d) {
      try { const v = localStorage.getItem(k); return v === null ? d : v; }
      catch (_) { return d; }
    },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { /* 無痕模式 */ } }
  };

  const state = {
    pool: [],
    placed: [],     // 依年份排序的卡片（含 wrong 標記）
    current: null,
    lives: 3,
    score: 0,
    streak: 0,
    fired: new Set(),
    over: false
  };

  const yearText = (y) => (y < 0 ? '前 ' + Math.abs(y) : String(y));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── 建卡 ──
  function cardEl(card, opts) {
    const o = opts || {};
    const el = document.createElement('div');
    el.className = 'card';
    if (o.state) el.classList.add(o.state);
    el.dataset.id = card.id;

    const emoji = document.createElement('div');
    emoji.className = 'emoji';
    emoji.textContent = card.e;
    emoji.setAttribute('aria-hidden', 'true');

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = card.n;

    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = card.t;

    el.append(emoji, name, note);

    if (o.showYear) {
      const year = document.createElement('div');
      year.className = 'year';
      year.textContent = yearText(card.y);
      el.appendChild(year);
      el.setAttribute('aria-label', card.n + '，' + yearText(card.y) + ' 年');
      if (o.roll && !calm) rollYear(year, card.y);
    } else {
      el.setAttribute('aria-label', '手上的卡片：' + card.n + '。' + card.t);
    }
    return el;
  }

  // 年份滾動
  function rollYear(el, target) {
    const dur = 620;
    const t0 = performance.now();
    const sign = target < 0 ? -1 : 1;
    const abs = Math.abs(target);
    const step = (now) => {
      if (document.hidden) { el.textContent = yearText(target); return; }
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(abs * eased);
      el.textContent = yearText(sign * v);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = yearText(target);
    };
    requestAnimationFrame(step);
  }

  // ── 畫時間軸 ──
  function renderRail(focusId) {
    // FLIP：先量舊位置
    const before = new Map();
    rail.querySelectorAll('.card').forEach((el) => {
      before.set(el.dataset.id, el.getBoundingClientRect().left);
    });

    rail.textContent = '';

    state.placed.forEach((card, i) => {
      rail.appendChild(slotEl(i));
      const el = cardEl(card, {
        showYear: true,
        state: card.wrong ? 'wrong' : (card.id === focusId ? 'right' : ''),
        roll: card.id === focusId
      });
      if (card.id === focusId) el.classList.add('placed');
      rail.appendChild(el);
    });
    rail.appendChild(slotEl(state.placed.length));

    // FLIP：把舊位置的差距補回去，再讓它滑到新位置
    if (!calm) {
      rail.querySelectorAll('.card').forEach((el) => {
        const old = before.get(el.dataset.id);
        if (old === undefined) return;
        const dx = old - el.getBoundingClientRect().left;
        if (Math.abs(dx) < 1) return;
        el.style.transition = 'none';
        el.style.transform = 'translateX(' + dx + 'px)';
        requestAnimationFrame(() => {
          el.style.transition = 'transform .5s cubic-bezier(.22,.8,.28,1)';
          el.style.transform = '';
        });
      });
    }

    if (focusId) {
      const target = rail.querySelector('.card[data-id="' + focusId + '"]');
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }

  function slotEl(index) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot';
    b.dataset.index = String(index);
    b.textContent = '放這裡';
    const prev = state.placed[index - 1];
    const next = state.placed[index];
    const label = prev && next ? (yearText(prev.y) + ' 與 ' + yearText(next.y) + ' 之間')
      : prev ? (yearText(prev.y) + ' 之後')
      : next ? (yearText(next.y) + ' 之前')
      : '時間軸起點';
    b.setAttribute('aria-label', '放在' + label);
    b.addEventListener('click', () => place(index));
    return b;
  }

  // ── 發牌 ──
  function deal() {
    handSlot.textContent = '';
    if (state.pool.length === 0) { finish(true); return; }
    state.current = state.pool.pop();
    const el = cardEl(state.current, { showYear: false });
    el.tabIndex = 0;
    makeDraggable(el);
    handSlot.appendChild(el);
    handHint.textContent = '「' + state.current.n + '」發生在哪兩件事之間？';
  }

  // ── 判定與放置 ──
  function place(index) {
    if (state.over || !state.current) return;
    const card = state.current;
    const prev = state.placed[index - 1];
    const next = state.placed[index];
    const ok = (!prev || prev.y <= card.y) && (!next || card.y <= next.y);

    state.current = null;

    if (ok) {
      state.placed.splice(index, 0, card);
      state.score++;
      state.streak++;
      scoreEl.textContent = String(state.score);
      streakEl.textContent = String(state.streak);
      pop(scoreEl); pop(streakEl);
      revealLine.className = 'reveal-line good';
      revealLine.textContent = '正確 · ' + card.n + '：' + yearText(card.y) + ' 年'
        + (state.streak >= 3 ? '（連對 ' + state.streak + '）' : '');
      renderRail(card.id);
      sparkle();
      const b = Number(store.get(LS.best, 0)) || 0;
      if (state.score > b) { store.set(LS.best, state.score); bestEl.textContent = String(state.score); pop(bestEl); }
    } else {
      const el = handSlot.querySelector('.card');
      if (el) { el.classList.add('shake'); }
      state.lives--;
      state.streak = 0;
      streakEl.textContent = '0';
      livesEl.textContent = '♥'.repeat(Math.max(0, state.lives)) || '—';
      livesEl.classList.remove('lost');
      void livesEl.offsetWidth;
      livesEl.classList.add('lost');

      const correctIndex = correctSlot(card);
      const marked = Object.assign({}, card, { wrong: true });
      state.placed.splice(correctIndex, 0, marked);
      revealLine.className = 'reveal-line bad';
      revealLine.textContent = '錯位 · ' + card.n + '其實是 ' + yearText(card.y) + ' 年——時間把它搬回去了。';
      renderRail(card.id);
    }

    setTimeout(() => {
      const fired = tellShock(card.id);
      if (state.lives <= 0) { finish(false); return; }
      if (state.pool.length === 0) { finish(true); return; }
      setTimeout(deal, fired ? 260 : 60);
    }, ok ? 520 : 620);
  }

  function correctSlot(card) {
    let i = 0;
    while (i < state.placed.length && state.placed[i].k < card.k) i++;
    return i;
  }

  function pop(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // ── 時光錯位橫幅 ──
  let shockTimer = null;
  function tellShock(justPlacedId) {
    const ids = new Set(state.placed.map((c) => c.id));
    const hit = SHOCKS.find((s) =>
      !state.fired.has(s.need.join('|')) &&
      s.need.includes(justPlacedId) &&
      s.need.every((id) => ids.has(id))
    );
    if (!hit) return false;
    state.fired.add(hit.need.join('|'));

    shockText.innerHTML = hit.html;
    shockEl.hidden = false;
    shockEl.classList.remove('out');
    clearTimeout(shockTimer);
    shockTimer = setTimeout(() => {
      shockEl.classList.add('out');
      setTimeout(() => { shockEl.hidden = true; }, 460);
    }, 7000);
    return true;
  }

  // ── 光點（節制：8 顆、一次性） ──
  function sparkle() {
    if (calm || document.hidden) return;
    const anchor = rail.querySelector('.card.right');
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'spark';
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      document.body.appendChild(s);
      const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.6;
      const dist = 60 + Math.random() * 70;
      const anim = s.animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: 'translate(' + (Math.cos(a) * dist - 50) + '%,' + (Math.sin(a) * dist - 50) + '%) scale(0)', opacity: 0 }
        ],
        { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' }
      );
      anim.onfinish = () => s.remove();
      anim.oncancel = () => s.remove();
    }
  }

  // ── 拖曳（pointer events，滑鼠／觸控通用） ──
  function makeDraggable(el) {
    let ghost = null;
    let hot = null;
    let dragging = false;
    let startX = 0, startY = 0;

    const slots = () => Array.from(rail.querySelectorAll('.slot'));

    const hitSlot = (x, y) => {
      let best = null, bestD = 90; // 容錯半徑
      slots().forEach((s) => {
        const r = s.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = s; }
      });
      return best;
    };

    const onMove = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        dragging = true;
        el.classList.add('dragging');
        ghost = el.cloneNode(true);
        ghost.classList.add('ghost');
        ghost.classList.remove('dragging');
        ghost.style.width = el.getBoundingClientRect().width + 'px';
        document.body.appendChild(ghost);
      }
      if (ghost) {
        ghost.style.left = (ev.clientX - 76) + 'px';
        ghost.style.top = (ev.clientY - 88) + 'px';
      }
      const s = hitSlot(ev.clientX, ev.clientY);
      if (s !== hot) {
        if (hot) hot.classList.remove('hot');
        hot = s;
        if (hot) hot.classList.add('hot');
      }
    };

    const onUp = (ev) => {
      el.releasePointerCapture && safeRelease(el, ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (ghost) { ghost.remove(); ghost = null; }
      el.classList.remove('dragging');
      if (hot) {
        const idx = Number(hot.dataset.index);
        hot.classList.remove('hot');
        hot = null;
        if (dragging) { place(idx); return; }
      }
      dragging = false;
    };

    el.addEventListener('pointerdown', (ev) => {
      if (state.over || !state.current) return;
      ev.preventDefault();
      startX = ev.clientX; startY = ev.clientY;
      safeCapture(el, ev.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        const first = rail.querySelector('.slot');
        if (first) first.focus();
      }
    });
  }

  function safeCapture(el, id) { try { el.setPointerCapture(id); } catch (_) { /* noop */ } }
  function safeRelease(el, id) { try { el.releasePointerCapture(id); } catch (_) { /* noop */ } }

  // ── 結束 ──
  function finish(cleared) {
    state.over = true;
    handSlot.textContent = '';
    handHint.textContent = cleared ? '36 張卡片全部進了時間軸。' : '時間軸暫時關門。';
    overScore.textContent = String(state.score);
    const best = Number(store.get(LS.best, 0)) || 0;
    const plays = (Number(store.get(LS.plays, 0)) || 0) + 1;
    store.set(LS.plays, plays);
    overSub.textContent = cleared
      ? '你把整副牌都排完了——最佳紀錄 ' + best + '，這是你第 ' + plays + ' 次上工。'
      : '最佳紀錄 ' + best + ' 張 · 這是你第 ' + plays + ' 次上工。';
    overEl.hidden = false;
    setTimeout(() => { const b = $('again'); if (b) b.focus(); }, 60);
  }

  // ── 開局 ──
  function start() {
    state.pool = shuffle(DECK);
    state.placed = [];
    state.current = null;
    state.lives = 3;
    state.score = 0;
    state.streak = 0;
    state.fired = new Set();
    state.over = false;

    // 先送一張當錨點（已知年份）
    state.placed.push(state.pool.pop());

    livesEl.textContent = '♥♥♥';
    streakEl.textContent = '0';
    scoreEl.textContent = '0';
    bestEl.textContent = String(Number(store.get(LS.best, 0)) || 0);
    revealLine.className = 'reveal-line';
    revealLine.textContent = '時間軸上先擺好一張——其餘 35 張，交給你。';
    overEl.hidden = true;
    shockEl.hidden = true;

    renderRail(null);
    deal();
  }

  $('restart').addEventListener('click', start);
  $('again').addEventListener('click', start);

  const howtoBtn = $('howto');
  const howtoPanel = $('howtoPanel');
  howtoBtn.addEventListener('click', () => {
    const open = howtoPanel.hidden;
    howtoPanel.hidden = !open;
    howtoBtn.setAttribute('aria-expanded', String(open));
  });

  // 鍵盤：在空隙之間用左右鍵移動
  rail.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const slots = Array.from(rail.querySelectorAll('.slot'));
    const i = slots.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const j = ev.key === 'ArrowLeft' ? Math.max(0, i - 1) : Math.min(slots.length - 1, i + 1);
    slots[j].focus();
  });

  start();
})();

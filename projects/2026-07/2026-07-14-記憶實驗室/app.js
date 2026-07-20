/* 記憶實驗室 — 四個心理學經典實驗，受試者是你
   純靜態、零依賴、離線可用。localStorage 前綴：memlab. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const stage = $('stage'), stageTitle = $('stageTitle'), phaseTag = $('phaseTag');
  const resultPanel = $('resultPanel'), resultTitle = $('resultTitle'), resultBody = $('resultBody');

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let REDUCE = mqReduce.matches;
  mqReduce.addEventListener('change', e => { REDUCE = e.matches; });

  /* ───────── 工具 ───────── */
  const rnd = n => Math.floor(Math.random() * n);
  const pick = a => a[rnd(a.length)];
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  let runId = 0;                 // 切換實驗時讓舊流程自然死亡
  const dead = my => my !== runId;

  // 等待：分頁隱藏時自動暫停（rAF 在隱藏分頁不會跑）
  function wait(ms) {
    return new Promise(res => {
      let elapsed = 0, last = performance.now();
      const step = now => {
        const dt = now - last; last = now;
        if (!document.hidden && dt < 250) elapsed += dt;
        if (elapsed >= ms) res(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  const html = (s) => { stage.innerHTML = s; return stage; };
  const setPhase = t => { phaseTag.textContent = t; };
  const clickOnce = (sel, fn) => { const n = stage.querySelector(sel); if (n) n.addEventListener('click', fn); return n; };

  /* ───────── 儲存 ───────── */
  const KEY = 'memlab.data';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 隱私模式：忽略 */ } };

  /* ───────── 材料 ───────── */
  // DRM：關鍵誘餌「睡覺」「甜」都沒有在清單裡出現，且不與任何清單詞共用字
  const DRM = [
    { lure: '睡覺', words: ['床', '休息', '清醒', '疲倦', '做夢', '打盹', '毯子', '夜晚', '打鼾', '枕頭', '平靜', '哈欠'] },
    { lure: '甜', words: ['糖', '酸', '苦', '蜂蜜', '蛋糕', '巧克力', '味道', '牙齒', '汽水', '派', '心', '可口'] }
  ];
  const DRM_TEST = [
    { w: '毯子', type: 'old' }, { w: '打鼾', type: 'old' }, { w: '疲倦', type: 'old' }, { w: '做夢', type: 'old' },
    { w: '蜂蜜', type: 'old' }, { w: '牙齒', type: 'old' }, { w: '酸', type: 'old' }, { w: '巧克力', type: 'old' },
    { w: '睡覺', type: 'lure' }, { w: '甜', type: 'lure' },
    { w: '火車', type: 'new' }, { w: '雨傘', type: 'new' }
  ];
  const SERIAL_POOL = ['鑰匙', '蘋果', '窗戶', '毛巾', '電池', '地圖', '蠟燭', '手套', '杯子', '梯子', '鏡子', '車票',
    '餅乾', '繩子', '時鐘', '磁鐵', '鉛筆', '沙發', '牙刷', '信封', '貝殼', '抽屜', '水管', '燈泡', '硬幣', '相機',
    '雨鞋', '書架', '茶壺', '螺絲'];
  const LIST_LEN = 15;

  const SHAPES = ['circle', 'square', 'triangle'];
  const COLORS = ['#4dd6c1', '#a78bfa', '#ffc861', '#ff7a6b', '#6ea8fe', '#8fd66b'];

  /* ───────── 實驗清單 ───────── */
  const EXPS = [
    { id: 'drm', n: 'EXP 01', t: '錯誤記憶', d: '你會「記得」一個從未出現過的字', run: runDRM },
    { id: 'serial', n: 'EXP 02', t: '序列位置', d: '開頭與結尾活下來，中間被吃掉', run: runSerial },
    { id: 'loftus', n: 'EXP 03', t: '問句改寫記憶', d: '換一個動詞，你看到的東西就變了', run: runLoftus },
    { id: 'flicker', n: 'EXP 04', t: '變化盲視', d: '它就在你眼前一直變，你看不見', run: runFlicker }
  ];
  let current = null;

  function renderExps() {
    const d = load();
    const g = $('expGrid');
    g.innerHTML = '';
    EXPS.forEach(e => {
      const b = document.createElement('button');
      b.className = 'exp';
      b.type = 'button';
      b.setAttribute('aria-pressed', String(current === e.id));
      b.innerHTML = `<span class="n">${e.n}</span><span class="t">${e.t}</span><span class="d">${e.d}</span>` +
        (d[e.id] ? '<span class="done">✓ 已做</span>' : '');
      b.addEventListener('click', () => start(e.id));
      g.appendChild(b);
    });
  }

  function start(id) {
    const e = EXPS.find(x => x.id === id);
    current = id;
    runId++;
    resultPanel.hidden = true;
    stageTitle.textContent = e.n + ' · ' + e.t;
    renderExps();
    e.run(runId);
    document.querySelector('.stage-wrap').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
  }

  function showResult(title, verdict, stats, notes, cite) {
    resultTitle.textContent = title;
    resultBody.innerHTML =
      `<p class="verdict">${verdict}</p>` +
      (stats.length ? `<div class="stats">${stats.map(s =>
        `<div class="stat${s.warn ? ' warn' : ''}"><b>${s.v}</b><span>${s.k}</span></div>`).join('')}</div>` : '') +
      `<ul class="notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` +
      `<p class="cite">${cite}</p>`;
    resultPanel.hidden = false;
    renderLog();
  }

  /* ══════════ 實驗 01：DRM 錯誤記憶 ══════════ */
  async function runDRM(my) {
    setPhase('說明');
    html(`<h3>實驗 01 · 記住這些字</h3>
      <p>螢幕上會一個一個閃過 <strong>兩組各 12 個字</strong>，每個字只出現 1 秒。
         你的任務很單純：<strong>盡量記住它們</strong>。</p>
      <p class="hint">結束後會有一個小小的干擾任務，再進行「看過／沒看過」的再認測驗。全程約 1 分半。</p>
      <div class="row"><button class="btn primary" id="go">開始（約 25 秒的字）</button></div>`);
    clickOnce('#go', () => phaseStudy());

    async function phaseStudy() {
      setPhase('學習');
      for (let li = 0; li < DRM.length; li++) {
        if (dead(my)) return;
        html(`<h3>第 ${li + 1} 組</h3><p class="hint">準備…</p>`);
        await wait(1200); if (dead(my)) return;
        const list = DRM[li].words;
        for (let i = 0; i < list.length; i++) {
          if (dead(my)) return;
          html(`<div class="word">${list[i]}</div>
                <div class="bar"><i style="width:${(i + 1) / list.length * 100}%"></i></div>
                <div class="counter">第 ${li + 1} 組 · ${i + 1} / ${list.length}</div>`);
          await wait(1000);
        }
      }
      phaseDistract();
    }

    async function phaseDistract() {
      setPhase('干擾');
      let n = rnd(400) + 300, left = 15, correct = 0;
      const tick = async () => {
        while (left > 0 && !dead(my)) {
          const ans = n - 7, opts = shuffle([ans, ans + 1, ans - 2]);
          html(`<h3>干擾任務</h3><p>快速心算，別讓自己有時間複習剛剛的字。</p>
            <div class="word" style="font-size:1.8rem">${n} − 7 = ?</div>
            <div class="row">${opts.map(o => `<button class="btn" data-o="${o}">${o}</button>`).join('')}</div>
            <div class="counter">剩下 ${left} 秒</div>`);
          const chosen = await new Promise(res => {
            stage.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => res(+b.dataset.o)));
            const t0 = left;
            const iv = setInterval(() => {
              left -= 1;
              const c = stage.querySelector('.counter');
              if (c) c.textContent = `剩下 ${Math.max(0, left)} 秒`;
              if (left <= 0 || dead(my) || left < t0 - 20) { clearInterval(iv); res(null); }
            }, 1000);
            stage.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => clearInterval(iv)));
          });
          if (chosen === ans) { correct++; n = ans; } else if (chosen !== null) { n = ans; }
          if (left <= 0) break;
        }
        if (!dead(my)) phaseTest();
      };
      tick();
    }

    async function phaseTest() {
      setPhase('再認測驗');
      // 誘餌不要出現在前兩題
      let items = shuffle(DRM_TEST);
      while (items.slice(0, 2).some(i => i.type === 'lure')) items = shuffle(DRM_TEST);
      const said = [];
      for (let i = 0; i < items.length; i++) {
        if (dead(my)) return;
        const it = items[i];
        html(`<div class="counter">再認測驗 ${i + 1} / ${items.length}</div>
          <div class="word">${it.w}</div>
          <p class="hint">這個字，剛剛有出現在清單裡嗎？</p>
          <div class="row">
            <button class="btn yes" id="y">看過</button>
            <button class="btn no" id="n">沒看過</button>
          </div>`);
        const yes = await new Promise(res => {
          clickOnce('#y', () => res(true));
          clickOnce('#n', () => res(false));
        });
        said.push({ ...it, yes });
      }
      if (dead(my)) return;
      finishDRM(said);
    }

    function finishDRM(said) {
      setPhase('完成');
      const hit = said.filter(s => s.type === 'old' && s.yes).length;
      const lureYes = said.filter(s => s.type === 'lure' && s.yes);
      const falseNew = said.filter(s => s.type === 'new' && s.yes).length;
      const lureWords = lureYes.map(s => s.w).join('、');

      html(`<h3>測驗結束</h3><p>結果在下方。<strong>請特別看「你說看過、但從未出現過的字」。</strong></p>
        <div class="row"><button class="btn" id="again">再做一次</button></div>`);
      clickOnce('#again', () => start('drm'));

      const d = load();
      d.drm = { hit, lure: lureYes.length, at: Date.now() };
      save(d);

      const verdict = lureYes.length
        ? `你剛剛「記得」了 <strong>${lureWords}</strong>——${lureYes.length > 1 ? '這兩個字' : '這個字'}從頭到尾<strong>沒有出現在任何一份清單裡</strong>。是你的大腦自己把${lureYes.length > 1 ? '它們' : '它'}補上去的。`
        : '這一次你沒有上鉤：兩個誘餌你都判定沒看過。（如果你事先知道會有陷阱，抓到它就容易得多——這本身也是實驗結果之一。）';

      showResult('實驗 01 · 錯誤記憶（DRM 派典）', verdict, [
        { k: '學過的字答對', v: `${hit}/8` },
        { k: '從未出現的誘餌，你說「看過」', v: `${lureYes.length}/2`, warn: lureYes.length > 0 },
        { k: '無關字誤認', v: `${falseNew}/2` }
      ], [
        '清單裡的每個字都是「睡覺」或「甜」的<strong>語意鄰居</strong>，但這兩個字本身從未出現。念清單時，大腦會自動把中心概念一起活化——事後你分不清那個活化是「看到的」還是「自己想的」，這叫<strong>來源監控失敗</strong>。',
        'Roediger 與 McDermott（1995）用 24 份這樣的清單發現：某些誘餌（例如 sleep、window）<strong>有超過 60% 的人在自由回憶時把它「想起來」</strong>，再認測驗的誤認率<strong>超過 80%</strong>——比某些真的看過的字還高。這個效應最早由 Deese（1959）發現。',
        '更不安的是「記得」的<strong>主觀感覺</strong>：受試者常對這些從未發生的記憶給出「我清楚記得看到它」的高信心評分。錯誤記憶不會覺得像錯誤，它覺得就像記憶。',
        '這正是目擊證詞研究的核心疑慮：一段栩栩如生、充滿細節、信心十足的記憶，<strong>不等於它真的發生過</strong>。'
      ], 'Deese (1959), J. Exp. Psychol. 58(1), 17–22　·　Roediger & McDermott (1995), JEP:LMC 21(4), 803–814');
    }
  }

  /* ══════════ 實驗 02：序列位置效應 ══════════ */
  async function runSerial(my, delayed = false) {
    setPhase('說明');
    const words = shuffle(SERIAL_POOL).slice(0, LIST_LEN);
    html(`<h3>實驗 02 · ${delayed ? '第二輪：延遲回憶' : '第一輪：立即回憶'}</h3>
      <p>${LIST_LEN} 個字會一個一個出現，每個 1 秒。看完之後${delayed
        ? '<strong>先做 20 秒的心算干擾</strong>，再把記得的字寫下來。'
        : '<strong>立刻</strong>把你記得的字全部寫下來（順序不拘）。'}</p>
      <p class="hint">${delayed ? '注意：這一輪唯一的差別，就是中間插了 20 秒不能複習的空檔。' : '做完第一輪，會邀請你做第二輪——差別只有一個，但結果會很不一樣。'}</p>
      <div class="row"><button class="btn primary" id="go">開始</button></div>`);
    clickOnce('#go', study);

    async function study() {
      setPhase('學習');
      for (let i = 0; i < words.length; i++) {
        if (dead(my)) return;
        html(`<div class="word">${words[i]}</div>
              <div class="bar"><i style="width:${(i + 1) / words.length * 100}%"></i></div>
              <div class="counter">${i + 1} / ${words.length}</div>`);
        await wait(1000);
      }
      if (dead(my)) return;
      if (delayed) await distract(); else await wait(300);
      if (!dead(my)) recall();
    }

    function distract() {
      setPhase('干擾 20 秒');
      return new Promise(res => {
        let n = rnd(400) + 300, left = 20;
        const draw = () => {
          const ans = n - 3, opts = shuffle([ans, ans + 1, ans - 2]);
          html(`<h3>先別回想</h3><p>連續心算 20 秒——這 20 秒不准複習剛剛的字。</p>
            <div class="word" style="font-size:1.7rem">${n} − 3 = ?</div>
            <div class="row">${opts.map(o => `<button class="btn" data-o="${o}">${o}</button>`).join('')}</div>
            <div class="counter" id="cd">剩下 ${left} 秒</div>`);
          stage.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => { n = ans; draw(); }));
        };
        draw();
        const iv = setInterval(() => {
          if (dead(my)) { clearInterval(iv); return; }
          if (document.hidden) return;           // 分頁隱藏 → 暫停計時
          left--;
          const c = $('cd'); if (c) c.textContent = `剩下 ${left} 秒`;
          if (left <= 0) { clearInterval(iv); res(); }
        }, 1000);
      });
    }

    function recall() {
      setPhase('回憶');
      html(`<h3>把你記得的字寫下來</h3>
        <p class="hint">用空白、逗號或頓號分隔，順序不拘。想不起來就留空。</p>
        <textarea id="ta" aria-label="輸入你記得的字"></textarea>
        <div class="row"><button class="btn primary" id="sub">送出</button></div>`);
      stage.querySelector('#ta').focus();
      clickOnce('#sub', () => {
        const raw = stage.querySelector('#ta').value;
        const typed = raw.split(/[\s,，、;；/]+/).map(s => s.trim()).filter(Boolean);
        const hitPos = words.map(w => typed.includes(w));
        finish(hitPos);
      });
    }

    function finish(hitPos) {
      setPhase('完成');
      const d = load();
      const s = d.serial || { imm: { sum: Array(LIST_LEN).fill(0), n: 0 }, del: { sum: Array(LIST_LEN).fill(0), n: 0 } };
      const bucket = delayed ? s.del : s.imm;
      hitPos.forEach((h, i) => { if (h) bucket.sum[i]++; });
      bucket.n++;
      d.serial = s; save(d);

      const total = hitPos.filter(Boolean).length;
      const first3 = hitPos.slice(0, 3).filter(Boolean).length;
      const last3 = hitPos.slice(-3).filter(Boolean).length;
      const mid = hitPos.slice(5, 10).filter(Boolean).length;

      html(`<h3>這一輪：記得 ${total} / ${LIST_LEN} 個</h3>
        <p>${delayed ? '延遲回憶完成。往下看兩條曲線的差別。' : '立即回憶完成。'}</p>
        <div class="row">
          ${delayed ? '' : '<button class="btn primary" id="next">進行第二輪：延遲 20 秒</button>'}
          <button class="btn" id="again">再做一輪（${delayed ? '延遲' : '立即'}）</button>
        </div>`);
      clickOnce('#next', () => { runId++; runSerial(runId, true); });
      clickOnce('#again', () => { runId++; runSerial(runId, delayed); });

      const curve = curveSVG(s);
      const verdict = delayed
        ? (last3 <= 1
          ? '看到了嗎？<strong>結尾的字消失了。</strong>只是 20 秒的心算，就把它們從你腦中沖掉了。'
          : '你這輪的結尾還撐著；多做幾輪，看看延遲曲線的右端會不會塌下來。')
        : (first3 + last3 > mid
          ? '你的記憶是一條 <strong>U 形</strong>：開頭記得、結尾記得，<strong>中間陣亡</strong>。'
          : '這一輪還看不出 U 形；多做幾輪，曲線就會浮出來（單次資料很吵）。');

      showResult('實驗 02 · 序列位置效應', verdict, [
        { k: '開頭 3 個（初始效應）', v: `${first3}/3` },
        { k: '中間 5 個', v: `${mid}/5`, warn: mid <= 1 },
        { k: '結尾 3 個（新近效應）', v: `${last3}/3` }
      ], [
        curve,
        'Murdock（1962）讓受試者自由回憶字表，畫出的曲線就是這個 <strong>U 形</strong>：<strong>初始效應</strong>（開頭的字被複誦最多次，已經進到長期記憶）＋<strong>新近效應</strong>（結尾的字還熱騰騰地躺在短期記憶裡）。',
        'Glanzer 與 Cunitz（1966）加了一個殘忍的操作：回憶前先<strong>倒數心算 30 秒</strong>。結果——<strong>新近效應完全消失，初始效應毫髮無傷</strong>。這是「短期／長期記憶是兩套系統」最漂亮的行為證據之一，也是你剛剛在第二輪親手做出來的結果。',
        '順帶一提那個著名的「7±2」：Miller（1956）本人說那比較像修辭而非硬限制；Cowan（2001）整理大量實驗後認為，扣掉複誦與長期記憶的幫忙，<strong>真正的容量大約是 4±1 個組塊</strong>。你剛剛能記住十幾個字，靠的是<strong>組塊化與複誦</strong>，不是原始容量。',
        '這也是為什麼開會時第一個和最後一個發言的人最有存在感——中間的人，統計上是被吃掉的那一段。'
      ], 'Murdock (1962), J. Exp. Psychol. 64(5), 482–488　·　Glanzer & Cunitz (1966), JVLVB 5(4), 351–360　·　Miller (1956); Cowan (2001)');
    }
  }

  function curveSVG(s) {
    const W = 620, H = 190, L = 34, R = 12, T = 14, B = 28;
    const pw = W - L - R, ph = H - T - B;
    const x = i => L + i / (LIST_LEN - 1) * pw;
    const y = p => T + ph - p * ph;
    const line = (b, cls) => {
      if (!b.n) return '';
      const pts = b.sum.map((v, i) => `${x(i).toFixed(1)},${y(v / b.n).toFixed(1)}`).join(' ');
      return `<polyline class="${cls}" points="${pts}"/>`;
    };
    const grid = [0, .25, .5, .75, 1].map(p =>
      `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/>
       <text class="axis-txt" x="${L - 6}" y="${y(p) + 3}" text-anchor="end">${Math.round(p * 100)}%</text>`).join('');
    const xt = [0, 4, 9, 14].map(i =>
      `<text class="axis-txt" x="${x(i)}" y="${H - 8}" text-anchor="middle">${i + 1}</text>`).join('');
    return `<div><strong>你的序列位置曲線</strong>（累積 ${s.imm.n} 輪立即、${s.del.n} 輪延遲）
      <svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="序列位置曲線：橫軸為字在清單中的位置，縱軸為回憶成功率">
        ${grid}${xt}${line(s.imm, 'mine')}${line(s.del, 'delayed')}
      </svg>
      <div class="legend">
        <span><i style="background:#4dd6c1"></i>立即回憶</span>
        <span><i style="background:#ff7a6b"></i>延遲 20 秒</span>
        <span>橫軸＝字在清單中的第幾個</span>
      </div></div>`;
  }

  /* ══════════ 實驗 03：問句改寫記憶（Loftus & Palmer） ══════════ */
  async function runLoftus(my) {
    setPhase('說明');
    const d = load();
    const used = (d.loftus && d.loftus.verbs) || {};
    const verb = used['撞爛'] && !used['碰到'] ? '碰到' : (!used['撞爛'] && used['碰到'] ? '撞爛' : pick(['撞爛', '碰到']));

    html(`<h3>實驗 03 · 看一段車禍</h3>
      <p>下面會播一段 <strong>3 秒</strong>的車禍動畫（只播一次，就像 1974 年那個實驗給受試者看的影片）。看完後回答兩個問題。</p>
      <p class="hint">請專心看——之後問的問題，比你以為的更狡猾。</p>
      <div class="row"><button class="btn primary" id="go">播放</button></div>`);
    clickOnce('#go', play);

    async function play() {
      setPhase('觀看');
      html(`<canvas id="cv" width="560" height="200" style="width:min(560px,94%);height:auto;border-radius:12px;background:#0a1017;border:1px solid #22303f"></canvas>
            <div class="counter">播放中…</div>`);
      const cv = $('cv'), g = cv.getContext('2d');
      const t0 = performance.now(), DUR = 3000;
      await new Promise(res => {
        const frame = now => {
          if (dead(my)) return res();
          const k = Math.min(1, (now - t0) / DUR);
          drawScene(g, cv.width, cv.height, k);
          if (k < 1) requestAnimationFrame(frame); else res();
        };
        requestAnimationFrame(frame);
      });
      if (dead(my)) return;
      await wait(500);
      if (!dead(my)) ask();
    }

    function drawScene(g, W, H, k) {
      g.fillStyle = '#0a1017'; g.fillRect(0, 0, W, H);
      // 路面
      g.fillStyle = '#161f2b'; g.fillRect(0, H - 70, W, 40);
      g.strokeStyle = '#2c3a4a'; g.setLineDash([14, 12]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, H - 50); g.lineTo(W, H - 50); g.stroke(); g.setLineDash([]);
      const meet = W / 2;
      const ease = t => 1 - Math.pow(1 - t, 2);
      const hitAt = 0.62;
      let ax, bx, shake = 0;
      if (k < hitAt) {
        const t = ease(k / hitAt);
        ax = -70 + t * (meet - 40 + 70);
        bx = W + 10 - t * (W + 10 - (meet + 40));
      } else {
        const t = (k - hitAt) / (1 - hitAt);
        ax = meet - 40 - t * 16;
        bx = meet + 40 + t * 16;
        shake = Math.sin(t * 40) * (1 - t) * 4;
      }
      car(g, ax, H - 78 + shake, '#6ea8fe', 1);
      car(g, bx, H - 78 - shake, '#ff7a6b', -1);
      if (k >= hitAt && k < hitAt + 0.12) {   // 撞擊閃光（沒有碎玻璃！）
        g.globalAlpha = 1 - (k - hitAt) / 0.12;
        g.fillStyle = '#ffc861';
        g.beginPath(); g.arc(meet, H - 66, 26, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
    }
    function car(g, x, y, color, dir) {
      const box = (bx, by, w, h, r) => {
        g.beginPath();
        if (g.roundRect) g.roundRect(bx, by, w, h, r); else g.rect(bx, by, w, h);
        g.fill();
      };
      g.fillStyle = color;
      box(x, y, 62, 20, 5);
      box(x + (dir > 0 ? 14 : 12), y - 12, 30, 14, 4);
      g.fillStyle = '#0a1017';
      [x + 12, x + 48].forEach(cx => { g.beginPath(); g.arc(cx, y + 21, 6, 0, Math.PI * 2); g.fill(); });
    }

    function ask() {
      setPhase('提問');
      html(`<h3>問題 1</h3>
        <p style="font-size:1.05rem">兩台車<strong style="color:var(--amber)">${verb}</strong>的時候，車速大約是多少？</p>
        <div class="readout" id="ro">50 km/h</div>
        <input type="range" id="sp" min="10" max="120" step="5" value="50" aria-label="估計時速">
        <div class="row"><button class="btn primary" id="sub">送出</button></div>`);
      const sp = $('sp'), ro = $('ro');
      sp.addEventListener('input', () => { ro.textContent = sp.value + ' km/h'; });
      clickOnce('#sub', () => askGlass(+sp.value));
    }

    function askGlass(speed) {
      html(`<h3>問題 2</h3>
        <p style="font-size:1.05rem">影片裡，你有看到<strong style="color:var(--amber)">碎玻璃</strong>嗎？</p>
        <div class="row">
          <button class="btn yes" id="y">有看到</button>
          <button class="btn no" id="n">沒有</button>
        </div>`);
      clickOnce('#y', () => finish(speed, true));
      clickOnce('#n', () => finish(speed, false));
    }

    function finish(speed, glass) {
      setPhase('完成');
      const d = load();
      const l = d.loftus || { verbs: {}, glass: {} };
      l.verbs[verb] = speed; l.glass[verb] = glass;
      d.loftus = l; save(d);

      const other = verb === '撞爛' ? '碰到' : '撞爛';
      const hasBoth = l.verbs[other] != null;
      const mine = hasBoth ? `你自己的兩次估計：<strong>撞爛 ${l.verbs['撞爛']} km/h　vs　碰到 ${l.verbs['碰到']} km/h</strong>（差 ${Math.abs(l.verbs['撞爛'] - l.verbs['碰到'])} km/h）。` : '';

      html(`<h3>實驗結束</h3>
        <p>${hasBoth ? '你兩個版本的問句都做過了。' : `想知道另一個動詞會把你推向哪裡嗎？再做一次，你會拿到「<strong>${other}</strong>」的版本。`}</p>
        <div class="row"><button class="btn primary" id="again">${hasBoth ? '再做一次' : `再做一次（換成「${other}」）`}</button></div>`);
      clickOnce('#again', () => start('loftus'));

      showResult('實驗 03 · 一個動詞改寫了記憶',
        glass
          ? `你說看到了碎玻璃——<strong>那段動畫裡根本沒有任何玻璃</strong>。你的記憶剛剛長出了一個不存在的細節。`
          : `你回答「沒有碎玻璃」——正確，動畫裡本來就沒有。但接下來這件事仍然和你有關。`,
        [
          { k: '你拿到的動詞', v: verb },
          { k: '你的時速估計', v: speed + ' km/h' },
          { k: '你說有碎玻璃', v: glass ? '是' : '否', warn: glass }
        ], [
          `你剛剛被隨機分派到「<strong>${verb}</strong>」這個版本的問句。同一段畫面，換一個動詞，人們給的速度就不一樣。${mine}`,
          'Loftus 與 Palmer（1974）給所有受試者看<strong>同一段</strong>車禍影片，只換問句裡的動詞，平均估計速度是：<strong>smashed（撞爛）40.8 mph、collided 39.3、bumped 38.1、hit（撞到）34.0、contacted（碰到）31.8 mph</strong>。換算約 <strong>65.7 km/h vs 51.2 km/h</strong>——同一場車禍，差了快 15 公里。',
          '第二個實驗更關鍵：一週後問「你有看到碎玻璃嗎？」——<strong>「撞爛」組 32% 說有，「撞到」組只有 14%，對照組 12%</strong>。而那段影片裡<strong>根本沒有碎玻璃</strong>。動詞不只影響了「猜測」，它把不存在的細節<strong>寫進了記憶</strong>。',
          '這就是<strong>錯誤訊息效應</strong>：記憶不是錄影帶，而是每次回想時重新拼裝的敘事——問問題的人，正在幫你拼。這也是為什麼警詢與司法訪談會嚴格規定<strong>不得使用引導性問句</strong>。',
          '神經層次上也有對應的發現：Nader 等人（2000）指出記憶被<strong>提取</strong>之後會回到不穩定狀態、需要重新固化（reconsolidation）——換句話說，<strong>你每回想一次，就有一次改寫它的機會</strong>。'
        ],
        'Loftus & Palmer (1974), JVLVB 13(5), 585–589（1 mph ≈ 1.609 km/h）　·　Nader, Schafe & LeDoux (2000), Nature 406, 722–726');
    }
  }

  /* ══════════ 實驗 04：變化盲視（閃爍派典） ══════════ */
  async function runFlicker(my) {
    setPhase('說明');
    const manual = REDUCE;
    html(`<h3>實驗 04 · 找出改變的東西</h3>
      <p>下面 12 個圖形會不斷閃爍：<strong>A 版本 → 空白 → B 版本 → 空白 →…</strong>
         兩個版本之間<strong>有一個</strong>圖形不一樣（顏色或形狀）。找到它，點它一下。</p>
      <p class="hint">${manual ? '偵測到你偏好減少動態：將採用「手動切換」模式（按空白鍵或按鈕切換 A／B）。' : '提示：那個空白畫面只有 0.08 秒——但它足以讓你瞎掉。'}</p>
      <div class="row"><button class="btn primary" id="go">開始</button></div>`);
    clickOnce('#go', () => runTrial(manual));

    function makeScene() {
      const a = Array.from({ length: 12 }, () => ({ s: pick(SHAPES), c: pick(COLORS) }));
      const b = a.map(o => ({ ...o }));
      const i = rnd(12);
      if (Math.random() < 0.6) {
        const others = COLORS.filter(c => c !== a[i].c);
        b[i].c = pick(others);
      } else {
        const others = SHAPES.filter(s => s !== a[i].s);
        b[i].s = pick(others);
      }
      return { a, b, i };
    }
    const svgFor = o => {
      const p = o.s === 'circle' ? `<circle cx="50" cy="50" r="42" fill="${o.c}"/>`
        : o.s === 'square' ? `<rect x="10" y="10" width="80" height="80" rx="10" fill="${o.c}"/>`
          : `<polygon points="50,8 92,88 8,88" fill="${o.c}"/>`;
      return `<svg viewBox="0 0 100 100" aria-hidden="true">${p}</svg>`;
    };

    async function runTrial(manualMode) {
      setPhase('搜尋中');
      const { a, b, i: target } = makeScene();
      html(`<div class="flick" id="flick" role="group" aria-label="12 個圖形，找出在兩個版本間改變的那一個並點選它"></div>
        <div class="counter" id="hud">交替 0 次 · 0.0 秒</div>
        <div class="row">
          <button class="btn" id="toggle">${manualMode ? '切換 A／B（空白鍵）' : '改用手動切換'}</button>
          <button class="btn ghost" id="give">找不到，直接揭曉</button>
        </div>`);
      const flick = $('flick'), hud = $('hud');
      const cells = [];
      for (let k = 0; k < 12; k++) {
        const btn = document.createElement('button');
        btn.className = 'cell'; btn.type = 'button';
        btn.setAttribute('aria-label', `第 ${k + 1} 個圖形`);
        btn.innerHTML = svgFor(a[k]);
        btn.addEventListener('click', () => choose(k, btn));
        flick.appendChild(btn); cells.push(btn);
      }

      let showB = false, blank = false, alts = 0, done = false, mode = manualMode;
      const t0 = performance.now();

      const paint = () => {
        const scene = showB ? b : a;
        cells.forEach((c, k) => {
          c.style.opacity = blank ? '0' : '1';
          if (!blank) c.innerHTML = svgFor(scene[k]);
        });
      };
      const hudTick = () => {
        if (done) return;
        hud.textContent = `交替 ${alts} 次 · ${((performance.now() - t0) / 1000).toFixed(1)} 秒`;
      };

      // 自動閃爍：A 250ms → 空白 80ms → B 250ms → 空白 80ms
      (async function loop() {
        while (!done && !dead(my)) {
          if (mode) { await wait(120); hudTick(); continue; }   // 手動模式：不自動切換
          blank = false; paint(); hudTick();
          await wait(250); if (done || dead(my) || mode) continue;
          blank = true; paint();
          await wait(80); if (done || dead(my) || mode) continue;
          showB = !showB; alts++;
        }
      })();
      paint();

      const manualToggle = () => { blank = false; showB = !showB; alts++; paint(); hudTick(); };
      clickOnce('#toggle', () => {
        if (mode) manualToggle();
        else { mode = true; blank = false; paint(); stage.querySelector('#toggle').textContent = '切換 A／B（空白鍵）'; }
      });
      const keyHandler = e => {
        if (dead(my) || done) { document.removeEventListener('keydown', keyHandler); return; }
        if (e.code === 'Space' && mode) { e.preventDefault(); manualToggle(); }
      };
      document.addEventListener('keydown', keyHandler);
      clickOnce('#give', () => reveal(false, null));

      function choose(k, btn) {
        if (done) return;
        if (k === target) { btn.classList.add('hit'); reveal(true, btn); }
        else { btn.classList.add('miss'); setTimeout(() => btn.classList.remove('miss'), 320); }
      }

      function reveal(found, btn) {
        done = true;
        document.removeEventListener('keydown', keyHandler);
        const secs = (performance.now() - t0) / 1000;
        blank = false; showB = false; paint();
        cells[target].classList.add('hit');
        setPhase('完成');

        // 慢動作對照：拿掉空白畫面，變化立刻跳出來
        let flipping = true;
        (async function slow() {
          while (flipping && !dead(my)) {
            showB = !showB; paint();
            await wait(700);
          }
        })();

        const d = load();
        const f = d.flicker || {};
        if (found && (!f.best || secs < f.best)) { f.best = +secs.toFixed(1); f.alts = alts; }
        f.tries = (f.tries || 0) + 1;
        d.flicker = f; save(d);

        const extra = document.createElement('div');
        extra.className = 'row';
        extra.innerHTML = `<button class="btn primary" id="again">換一組再試</button>`;
        stage.appendChild(extra);
        clickOnce('#again', () => { flipping = false; start('flicker'); });
        hud.textContent = found
          ? `找到了：第 ${target + 1} 個 · ${alts} 次交替 · ${secs.toFixed(1)} 秒　（現在把「空白」拿掉，同樣的變化正在慢慢閃——是不是一秒就看到了？）`
          : `答案是第 ${target + 1} 個（已框起來）。現在沒有空白畫面了，同樣的變化正在閃——是不是一秒就看到了？`;

        showResult('實驗 04 · 變化盲視',
          found
            ? `你花了 <strong>${secs.toFixed(1)} 秒、${alts} 次交替</strong>才看見那個一直在你眼前變的東西。`
            : `你放棄了——而那個東西<strong>從頭到尾都在畫面上</strong>，每 0.6 秒變一次。`,
          [
            { k: '這次交替次數', v: alts, warn: alts > 20 },
            { k: '這次耗時', v: secs.toFixed(1) + ' 秒' },
            { k: '你的最佳紀錄', v: (d.flicker.best ? d.flicker.best + ' 秒' : '—') }
          ], [
            '把空白畫面拿掉，同樣的變化會像跳出來一樣明顯——因為<strong>視覺系統靠「動作訊號」抓變化</strong>。那 0.08 秒的空白會讓整個畫面同時產生瞬變訊號，把真正的變化淹沒；於是你只剩下<strong>注意力</strong>可用，而注意力一次只能顧幾樣東西。',
            'Rensink、O\'Regan 與 Clark（1997）就是用這個「閃爍派典」（畫面 250 ms、空白 80 ms 交替）發現：<strong>即使變化很大、重複出現、而且受試者正在主動搜尋，平均仍需超過 40 次交替才能找到</strong>。',
            'Simons 與 Chabris（1999）的「隱形大猩猩」是同一件事的極端版：當你忙著數傳球次數，<strong>約有一半的人完全沒看見一隻大猩猩走過畫面中央、還停下來捶胸</strong>。',
            '結論很反直覺，但很重要：<strong>你並沒有「看見」整個視野</strong>。你只保留了注意力當下抓住的那幾樣東西，其餘的部分，是大腦即時編出來讓你以為你看到了。記憶靠不住，連「現在」都靠不住。'
          ],
          'Rensink, O\'Regan & Clark (1997), Psychol. Sci. 8(5), 368–373　·　Simons & Chabris (1999), Perception 28(9), 1059–1074');
      }
    }
  }

  /* ───────── 紀錄 ───────── */
  function renderLog() {
    const d = load();
    const rows = [
      ['錯誤記憶（DRM）', d.drm ? `誘餌誤認 ${d.drm.lure}/2 · 學過的字答對 ${d.drm.hit}/8` : null],
      ['序列位置', d.serial ? `立即 ${d.serial.imm.n} 輪 · 延遲 ${d.serial.del.n} 輪` : null],
      ['問句改寫記憶', d.loftus ? Object.entries(d.loftus.verbs).map(([k, v]) => `${k} ${v} km/h`).join(' · ') : null],
      ['變化盲視', d.flicker ? `最佳 ${d.flicker.best ?? '—'} 秒 · 嘗試 ${d.flicker.tries} 次` : null]
    ];
    $('logList').innerHTML = rows.map(([k, v]) =>
      `<li><span>${k}</span><span class="v${v ? '' : ' empty'}">${v || '尚未進行'}</span></li>`).join('');
  }

  $('btnClear').addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    renderExps(); renderLog();
  });

  /* ───────── 初始 ───────── */
  html(`<h3>四個實驗，四種被騙的方式</h3>
    <p>上面挑一個開始。每個實驗做完，都會拿到<strong>你自己的數據</strong>，並和原始論文的統計數字對照。</p>
    <p class="hint">整頁沒有任何網路請求；作答紀錄只存在你的瀏覽器裡。</p>`);
  renderExps();
  renderLog();
})();

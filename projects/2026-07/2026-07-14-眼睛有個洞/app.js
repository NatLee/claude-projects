/* 你的眼睛有個洞 — 五個當場可驗證的知覺實驗
   純靜態、零依賴、離線可用。localStorage 前綴：percept. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let REDUCE = mq.matches;
  mq.addEventListener('change', e => { REDUCE = e.matches; });

  const LS = 'percept.log';
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const save = d => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { /* 忽略 */ } };

  const stage = $('stage'), stTitle = $('stTitle'), stTag = $('stTag');
  const html = s => { stage.innerHTML = s; };
  const tag = s => { stTag.textContent = s; };
  const on = (sel, fn, ev = 'click') => { const n = stage.querySelector(sel); if (n) n.addEventListener(ev, fn); return n; };

  let runId = 0, rafId = 0;
  const dead = my => my !== runId;
  const stopRAF = () => { if (rafId) cancelAnimationFrame(rafId); rafId = 0; };

  const EXPS = [
    { id: 'blind', n: 'EXP 01', t: '找到你的盲點', d: '那個圓點會憑空消失。它一直都在。', run: runBlind },
    { id: 'fill', n: 'EXP 02', t: '大腦在補洞', d: '洞不是黑的——大腦拿旁邊的圖案把它塗滿。', run: runFill },
    { id: 'troxler', n: 'EXP 03', t: 'Troxler 消退', d: '盯著中間十秒，周圍的顏色會自己蒸發。', run: runTroxler },
    { id: 'waterfall', n: 'EXP 04', t: '瀑布錯覺', d: '看完會動的，靜止的東西開始倒著流。', run: runWaterfall },
    { id: 'flashlag', n: 'EXP 05', t: '閃光遲滯', d: '你看到的「現在」，其實晚了幾十毫秒。', run: runFlash }
  ];

  function renderCards() {
    const d = load();
    $('cards').innerHTML = '';
    EXPS.forEach(e => {
      const b = document.createElement('button');
      b.className = 'card'; b.type = 'button';
      b.setAttribute('aria-pressed', String(current === e.id));
      b.innerHTML = `<span class="n">${e.n}</span><span class="t">${e.t}</span><span class="d">${e.d}</span>` +
        (d[e.id] ? '<span class="ok">✓</span>' : '');
      b.addEventListener('click', () => start(e.id));
      $('cards').appendChild(b);
    });
  }
  let current = null;
  function start(id) {
    const e = EXPS.find(x => x.id === id);
    current = id; runId++; stopRAF();
    $('explain').hidden = true;
    stTitle.textContent = e.n + ' · ' + e.t;
    renderCards();
    e.run(runId);
    document.querySelector('.stage-wrap').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
  }

  function explain(title, notes, cite) {
    $('exTitle').textContent = title;
    $('exNotes').innerHTML = notes.map(n => `<li>${n}</li>`).join('');
    $('exCite').innerHTML = cite;
    $('explain').hidden = false;
    renderLog();
  }
  function record(id, value) {
    const d = load(); d[id] = value; save(d); renderCards(); renderLog();
  }
  function renderLog() {
    const d = load();
    const rows = [
      ['盲點', d.blind ? `找到了（十字與圓點相距 ${d.blind} px）` : null],
      ['大腦補洞', d.fill ? '看到條紋接起來了' : null],
      ['Troxler 消退', d.troxler ? `${d.troxler} 秒後消失` : null],
      ['瀑布錯覺', d.waterfall ? (d.waterfall === 'yes' ? '看到靜止的圖在反向流動' : '這次沒感覺到') : null],
      ['閃光遲滯', d.flashlag != null ? `你的視覺延遲約 ${d.flashlag} ms` : null]
    ];
    $('logList').innerHTML = rows.map(([k, v]) =>
      `<li><span>${k}</span><span class="v${v ? '' : ' empty'}">${v || '尚未進行'}</span></li>`).join('');
  }
  $('clear').addEventListener('click', () => {
    try { localStorage.removeItem(LS); } catch (e) { /* 忽略 */ }
    renderCards(); renderLog();
  });

  /* ══════ EXP 01：盲點 ══════ */
  function runBlind(my) {
    tag('操作中');
    let gap = 240, right = false;      // right = 測右眼
    const view = () => {
      html(`
        <ol>
          <li><strong>${right ? '閉上左眼，只用右眼' : '閉上右眼，只用左眼'}</strong>（用手遮住也可以）。</li>
          <li>眼睛<strong>盯住 ${right ? '圓點' : '十字'}</strong>，不要偷看旁邊那個。</li>
          <li>臉慢慢靠近螢幕、再慢慢後退（大約 30–60 公分之間）。</li>
          <li>某個距離，旁邊那個<strong>會整個消失</strong>——不是變模糊，是<strong>不見了</strong>。</li>
        </ol>
        <div class="field" id="fld" style="height:220px">
          <span class="cross" id="cx" style="left:${right ? 78 : 22}%;top:50%">✛</span>
          <span class="disc" id="dc" style="left:${right ? 22 : 78}%;top:50%;width:26px;height:26px"></span>
        </div>
        <label class="lab">十字與圓點的距離 <b id="gv">${gap}</b> px（調到剛好消失為止）</label>
        <input type="range" class="slider" id="gp" min="120" max="480" step="10" value="${gap}" aria-label="十字與圓點的距離">
        <div class="row">
          <button class="btn" id="swap">換${right ? '左' : '右'}眼</button>
          <button class="btn primary" id="gone">它消失了！</button>
        </div>
        <p class="hint">看不到？多調幾次距離、把臉再靠近一點。每個人的盲點位置略有不同，這很正常。</p>`);

      const fld = $('fld'), cx = $('cx'), dc = $('dc');
      const layout = () => {
        const w = fld.clientWidth || 700;
        const cxp = right ? (w / 2 + gap / 2) : (w / 2 - gap / 2);
        const dcp = right ? (w / 2 - gap / 2) : (w / 2 + gap / 2);
        cx.style.left = cxp + 'px'; dc.style.left = dcp + 'px';
      };
      layout();
      window.addEventListener('resize', layout);
      on('#gp', e => { gap = +e.target.value; $('gv').textContent = gap; layout(); }, 'input');
      on('#swap', () => { right = !right; view(); });
      on('#gone', () => {
        record('blind', gap);
        tag('完成');
        html(`<h3>你剛剛親眼確認了：你的視網膜上有一個洞。</h3>
          <p>那個圓點沒有變淡、沒有變模糊——它<strong>整個不見了</strong>，因為它的影像正好落在<strong>視神經盤</strong>上，
             那裡一顆感光細胞都沒有。</p>
          <p class="hint">下一個問題才是真正詭異的：既然那裡沒有訊號，你為什麼<strong>不會看到一個黑洞</strong>？</p>
          <div class="row"><button class="btn primary" id="next">下一個實驗：大腦在補洞 →</button></div>`);
        on('#next', () => start('fill'));
        explain('盲點：一個你天天帶著、卻從沒發現的洞', [
          '視神經要離開眼球，必須在視網膜上鑿一個出口——那個位置叫<strong>視神經盤</strong>，沒有視桿也沒有視錐，<strong>完全不感光</strong>。',
          '它大約在中央窩<strong>顳側 15°</strong> 的位置，視角約 <strong>7.5° × 5.5°</strong>；面積是你看得最清楚的那塊中央窩的<strong>五十倍以上</strong>。',
          '兩隻眼睛的盲點位置不同（一左一右），所以睜著雙眼時互相補位——但即使<strong>只睜一隻眼，你也看不到那個洞</strong>。原因見下一個實驗。',
          '這個洞 1668 年就被法國物理學家 <strong>Mariotte</strong> 描述過。你的眼睛不是相機——相機的感光元件上不會挖一個洞，然後叫軟體自己想辦法。'
        ], '章魚沒有這個問題：牠們的視神經接在感光細胞<strong>背面</strong>，視網膜沒有出口、沒有盲點。演化不是設計，是將就。');
      });
    };
    view();
  }

  /* ══════ EXP 02：填補 ══════ */
  function runFill(my) {
    tag('操作中');
    let gap = 240;
    html(`
      <h3>洞是黑的嗎？</h3>
      <p>同樣的做法：<strong>閉上右眼、盯住十字</strong>，慢慢前後移動。這次右邊不是圓點，而是條紋背景上的一個<strong>空洞</strong>。</p>
      <div class="field" id="fld" style="height:220px">
        <div class="stripes"></div>
        <span class="cross" id="cx" style="top:50%">✛</span>
        <span class="hole" id="hl" style="top:50%;width:64px;height:64px"></span>
      </div>
      <label class="lab">距離 <b id="gv">${gap}</b> px</label>
      <input type="range" class="slider" id="gp" min="120" max="480" step="10" value="${gap}" aria-label="十字與空洞的距離">
      <div class="row">
        <button class="btn primary" id="ok">條紋接起來了！</button>
        <button class="btn" id="no">還沒有，再調</button>
      </div>
      <p class="hint">當空洞落進盲點，你不會看到一個洞，而是看到<strong>條紋一路連過去</strong>——大腦拿旁邊的圖案，把那塊空白畫滿了。</p>`);

    const fld = $('fld'), cx = $('cx'), hl = $('hl');
    const layout = () => {
      const w = fld.clientWidth || 700;
      cx.style.left = (w / 2 - gap / 2) + 'px';
      hl.style.left = (w / 2 + gap / 2) + 'px';
    };
    layout();
    window.addEventListener('resize', layout);
    on('#gp', e => { gap = +e.target.value; $('gv').textContent = gap; layout(); }, 'input');
    on('#no', () => { });
    on('#ok', () => {
      record('fill', true);
      tag('完成');
      html(`<h3>你剛剛看到的東西，並不存在。</h3>
        <p>那塊「連過去的條紋」<strong>沒有進到你的眼睛</strong>——那裡沒有感光細胞，不可能有訊號。<br>
           它是<strong>大腦畫上去的</strong>。</p>
        <p class="hint">你的視覺不是一台把世界照下來的相機，而是一份<strong>持續更新的猜測</strong>：
           有資料的地方用資料，沒資料的地方，就用旁邊的資料補一個「合理的答案」。</p>
        <div class="row"><button class="btn primary" id="next">下一個實驗 →</button></div>`);
      on('#next', () => start('troxler'));
      explain('填補（filling-in）：大腦不容忍空白', [
        '盲點裡沒有任何視覺訊號，但你看到的不是黑洞、也不是灰霧，而是<strong>周圍圖案的延續</strong>——條紋、顏色、質地，全部被補齊。',
        '這不是「你沒注意到」而已。神經生理研究發現，<strong>初級視覺皮質（V1）裡對應盲點的那群神經元，會對「補進去的」圖案產生反應</strong>——彷彿它們真的看到了東西（Komatsu, 2006）。',
        '同樣的機制也解釋了下一件事：你的視野邊緣其實模糊、幾乎沒有顏色分辨力，中央窩以外的解析度低得可憐——但你「感覺」整個視野都是清晰而飽滿的。<strong>那份清晰是被編出來的。</strong>',
        '換句話說：<strong>「我親眼看到」從來就不是「攝影紀錄」的意思。</strong>你看到的世界，一直有一部分是大腦的合理推測。'
      ], 'Komatsu, H. (2006). The neural mechanisms of perceptual filling-in. <em>Nature Reviews Neuroscience, 7</em>, 220–231.');
    });
  }

  /* ══════ EXP 03：Troxler 消退 ══════ */
  function runTroxler(my) {
    tag('準備');
    html(`<h3>盯著中間的十字，不要移開視線</h3>
      <p>周圍那些模糊的顏色，會在幾秒之內<strong>自己淡掉、消失</strong>，畫面剩下一片灰。<br>
         一旦你的眼睛動一下，它們會<strong>立刻全部回來</strong>。</p>
      <div class="row"><button class="btn primary" id="go">開始（盯住十字）</button></div>`);
    on('#go', () => {
      tag('注視中');
      html(`<canvas class="stagec field dark" id="cv" width="720" height="380" style="max-width:720px"
                    aria-label="中央有一個十字，周圍是模糊的彩色圓點"></canvas>
        <div class="big" id="tm">0.0 s</div>
        <div class="row"><button class="btn primary" id="gone">它們消失了！</button></div>
        <p class="hint">大部分人在 <strong>5–15 秒</strong>之間會經歷第一次消退。</p>`);
      const cv = $('cv'), g = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      g.fillStyle = '#8b8b8b'; g.fillRect(0, 0, W, H);
      const cols = ['#7fd4ff', '#ff8fa3', '#ffd48f', '#a6ff9e', '#c9a0ff', '#9ee8e0', '#ffb0d8', '#d8e08f'];
      cols.forEach((c, i) => {
        const a = i / cols.length * Math.PI * 2, r = 120 + (i % 2) * 32;
        const x = W / 2 + Math.cos(a) * r * 1.5, y = H / 2 + Math.sin(a) * r;
        const grd = g.createRadialGradient(x, y, 0, x, y, 62);
        grd.addColorStop(0, c); grd.addColorStop(1, 'rgba(139,139,139,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(x, y, 62, 0, Math.PI * 2); g.fill();
      });
      g.strokeStyle = '#1b1b1b'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(W / 2 - 10, H / 2); g.lineTo(W / 2 + 10, H / 2);
      g.moveTo(W / 2, H / 2 - 10); g.lineTo(W / 2, H / 2 + 10); g.stroke();

      let el = 0, lastT = performance.now();
      const tick = now => {
        if (dead(my)) return;
        const dt = now - lastT; lastT = now;
        const tm = $('tm');
        if (!tm) return;                                   // 畫面已切換
        if (!document.hidden && dt < 250) {
          el += dt;
          tm.textContent = (el / 1000).toFixed(1) + ' s';
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      on('#gone', () => {
        stopRAF();
        const secs = +(el / 1000).toFixed(1);
        record('troxler', secs);
        tag('完成');
        html(`<h3>${secs} 秒</h3>
          <p>那些顏色<strong>從頭到尾都在畫面上</strong>——是你的視覺系統把它們「關掉」了。</p>
          <div class="row"><button class="btn primary" id="next">下一個實驗 →</button></div>`);
        on('#next', () => start('waterfall'));
        explain('Troxler 消退：不變的東西會被大腦丟掉', [
          '視覺系統對<strong>變化</strong>敏感，對<strong>恆定</strong>不感興趣。當一個刺激在視網膜上長時間不動、又落在周邊視野（那裡的神經元感受野很大），它就會被<strong>適應掉、當成背景刪除</strong>。',
          '你之所以平常不會整個世界都消失，是因為眼睛<strong>從來沒有真正靜止</strong>：即使你努力盯著一個點，眼球仍在做每秒數次的<strong>微跳視（microsaccade）</strong>，不斷把影像刷新到新的細胞上。',
          '如果用光學裝置把影像<strong>完全固定</strong>在視網膜上（retinal stabilization），整個畫面會在幾秒內<strong>全部褪成灰色</strong>——真的什麼都看不到。',
          '1804 年，瑞士醫師 <strong>Troxler</strong> 描述了這個現象。兩百年後它變成網路上瘋傳的「盯著看圖就會消失」錯覺圖——原理一模一樣。'
        ], 'Troxler, I. P. V. (1804).　·　微跳視與知覺消退的關係：Martinez-Conde et al. (2004), <em>Nat. Rev. Neurosci. 5</em>, 229–240.');
      });
    });
  }

  /* ══════ EXP 04：瀑布錯覺（運動後效） ══════ */
  function runWaterfall(my) {
    tag('準備');
    html(`<h3>瀑布錯覺（運動後效）</h3>
      <p>畫面會有 <strong>25 秒</strong>持續向外擴張的環紋。盯著正中央的點，不要追著環看。<br>
         時間到，畫面會<strong>立刻換成完全靜止的圖</strong>——然後見證奇怪的事。</p>
      ${REDUCE ? '<p class="warn">你的系統偏好「減少動態」。這個實驗本身就是持續動態畫面，若會造成不適請直接跳過（本頁其他實驗都沒有大面積動態）。</p>' : ''}
      <div class="row"><button class="btn primary" id="go">我準備好了，開始 25 秒</button>
      <button class="btn" id="skip">跳過這個實驗</button></div>`);
    on('#skip', () => start('flashlag'));
    on('#go', () => {
      tag('適應中');
      html(`<canvas class="stagec field dark" id="cv" width="640" height="380" style="max-width:640px"
              aria-label="持續向外擴張的同心環紋，中央有一個注視點"></canvas>
        <div class="big" id="tm">25</div>
        <p class="hint">盯著中央的紅點。環會一直往外擴。</p>`);
      const cv = $('cv'), g = cv.getContext('2d');
      const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
      const DUR = 25000;
      let el = 0, lastT = performance.now();
      const tick = now => {
        if (dead(my)) return;
        const dt = now - lastT; lastT = now;
        if (!document.hidden && dt < 250) {
          el += dt;
          const phase = (el / 1000) * 34;                  // 每秒往外推 34 px
          g.fillStyle = '#0a0b0e'; g.fillRect(0, 0, W, H);
          for (let r = 460; r > 0; r -= 26) {
            const rr = ((r + phase) % 460);
            g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2);
            g.strokeStyle = ((Math.floor((r + phase) / 26) % 2) ? '#e8e8e8' : '#4a4a4a');
            g.lineWidth = 13; g.stroke();
          }
          g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
          const tm = $('tm');
          if (!tm) return;                                 // 畫面已切換
          tm.textContent = Math.max(0, Math.ceil((DUR - el) / 1000));
        }
        if (el < DUR) rafId = requestAnimationFrame(tick); else showStatic();
      };
      rafId = requestAnimationFrame(tick);

      function showStatic() {
        stopRAF();
        if (dead(my)) return;
        tag('現在看這個');
        const g2 = cv.getContext('2d');
        g2.fillStyle = '#0a0b0e'; g2.fillRect(0, 0, W, H);
        for (let r = 460; r > 0; r -= 26) {           // 完全靜止的同心環
          g2.beginPath(); g2.arc(cx, cy, r, 0, Math.PI * 2);
          g2.strokeStyle = ((Math.floor(r / 26) % 2) ? '#cfcfcf' : '#3f3f3f');
          g2.lineWidth = 13; g2.stroke();
        }
        g2.fillStyle = '#ff4d6d'; g2.beginPath(); g2.arc(cx, cy, 5, 0, Math.PI * 2); g2.fill();
        const q = document.createElement('div');
        q.innerHTML = `<p style="margin-top:12px"><strong>這張圖完全靜止。</strong>你看到它在往<strong>內縮</strong>嗎？</p>
          <div class="row"><button class="btn primary" id="yes">有！它在往內收縮</button><button class="btn" id="nope">沒感覺</button></div>`;
        stage.appendChild(q);
        on('#yes', () => finish('yes'));
        on('#nope', () => finish('no'));
      }
      function finish(ans) {
        record('waterfall', ans);
        tag('完成');
        html(`<h3>${ans === 'yes' ? '那個「往內縮」，是你的大腦在說謊。' : '這次沒抓到——換個距離、盯久一點再試一次也可以。'}</h3>
          <p>${ans === 'yes'
            ? '畫面上每一個像素都是靜止的。動的是<strong>你的視覺系統</strong>。'
            : '運動後效的強度因人、因螢幕、因注視穩定度而異。它不是每次都出現。'}</p>
          <div class="row"><button class="btn primary" id="next">最後一個實驗 →</button>
          <button class="btn" id="again">再試一次</button></div>`);
        on('#next', () => start('flashlag'));
        on('#again', () => start('waterfall'));
        explain('運動後效：偵測器也會累', [
          '大腦裡有一群<strong>方向選擇性神經元</strong>：有的專門對「向外」的運動放電，有的專門對「向內」。你平常看到的運動方向，來自兩邊的<strong>平衡</strong>。',
          '盯著向外擴張的畫面 25 秒，「向外」那群細胞<strong>疲勞、適應了</strong>，放電率下降。這時候看靜止畫面，兩邊本該打平——但「向外」那組現在虛弱無力，<strong>「向內」贏了</strong>。於是靜止的東西看起來在往內縮。',
          '1834 年，Robert Addams 在蘇格蘭的 <strong>Falls of Foyers</strong> 瀑布邊盯著水流看，接著轉頭看旁邊的岩石——岩石開始<strong>往上流</strong>。他寫下了這個現象，「瀑布錯覺」因此得名（亞里斯多德其實更早就提過類似的觀察）。',
          '最詭異的地方：你會看到<strong>「在動，但位置沒有改變」</strong>——一種自相矛盾的運動。這正好證明大腦裡「東西在哪裡」和「東西在動」是<strong>兩套獨立的處理</strong>。'
        ], 'Addams, R. (1834). <em>London and Edinburgh Philosophical Magazine, 5</em>, 373–374.');
      }
    });
  }

  /* ══════ EXP 05：閃光遲滯 ══════ */
  function runFlash(my) {
    tag('操作中');
    let offset = 0;           // 閃光相對移動點的水平偏移（px）
    const SPEED = 0.45;       // px / ms
    html(`<h3>把閃光調到「看起來對齊」</h3>
      <p>白點在水平來回移動。每隔一段時間，上方會<strong>閃一下</strong>。<br>
         用下面的滑桿調整閃光位置，直到你覺得閃光<strong>正好在白點的正上方</strong>。</p>
      <canvas class="stagec field dark" id="cv" width="720" height="220" style="max-width:720px"
        aria-label="一個水平來回移動的白點，上方會週期性閃出一個紅點"></canvas>
      <label class="lab">閃光位置微調 <b id="ov">0</b> px</label>
      <input type="range" class="slider" id="of" min="-60" max="60" step="1" value="0" aria-label="閃光水平位置微調">
      <div class="row"><button class="btn primary" id="done">就是這裡，對齊了</button></div>
      <p class="hint">提示：多數人需要把閃光往<strong>白點前進的方向</strong>推一段距離，才會覺得「對齊」。</p>`);

    const cv = $('cv'), g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    let x = 60, dir = 1, flashT = -999;
    let lastT = performance.now();
    on('#of', e => { offset = +e.target.value; $('ov').textContent = offset; }, 'input');

    const tick = now => {
      if (dead(my)) return;
      const dt = Math.min(40, now - lastT); lastT = now;
      if (!document.hidden) {
        x += dir * SPEED * dt;
        if (x > W - 60) { x = W - 60; dir = -1; }
        if (x < 60) { x = 60; dir = 1; }
        if (now - flashT > 1400) flashT = now;

        g.fillStyle = '#0a0b0e'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#1e2229'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, H / 2 + 26); g.lineTo(W, H / 2 + 26); g.stroke();
        // 移動的白點
        g.fillStyle = '#f2f5f8'; g.beginPath(); g.arc(x, H / 2 + 26, 11, 0, Math.PI * 2); g.fill();
        // 閃光（顯示 70 ms）
        if (now - flashT < 70) {
          g.fillStyle = '#ff4d6d';
          g.beginPath(); g.arc(x + offset, H / 2 - 30, 11, 0, Math.PI * 2); g.fill();
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    on('#done', () => {
      stopRAF();
      const lagMs = Math.round(Math.abs(offset) / SPEED);
      record('flashlag', lagMs);
      tag('完成');
      html(`<h3>你把閃光推了 ${offset} px 才覺得對齊。</h3>
        <p>但是——<strong>程式碼裡，閃光原本畫在白點的正上方，座標完全一樣（offset = 0）。</strong><br>
           換算成時間：你的視覺系統對移動物體的位置，<strong>「超前」了大約 ${lagMs} 毫秒</strong>。</p>
        <div class="row">
          <button class="btn" id="again">再試一次</button>
          <button class="btn primary" id="top">回到實驗清單 ↑</button>
        </div>`);
      on('#again', () => start('flashlag'));
      on('#top', () => document.querySelector('.cards').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' }));
      explain('閃光遲滯：你的「現在」是預測出來的', [
        '訊號從視網膜傳到皮質、再變成你「看見」的東西，大約要花 <strong>幾十到一百毫秒</strong>。以這段時間計算，一顆時速 150 公里的球在你「看到」它的時候，其實已經又飛了好幾公尺。',
        '大腦的解法是<strong>外推（extrapolation）</strong>：對持續移動的東西，它不是回報「剛剛在哪」，而是<strong>預測「現在應該在哪」</strong>。所以移動的白點被推到前面去了。',
        '而那個<strong>突然出現的閃光</strong>沒有軌跡可以外推，只能老實地慢一拍——於是它看起來「落後」。這就是 Nijhawan（1994）在 <em>Nature</em> 上提出的<strong>閃光遲滯效應</strong>。',
        '爭論持續了三十年：到底是「移動物體被外推」、還是「閃光被延遲處理」、或是大腦在事後<strong>重新編輯</strong>了剛剛那段時間？共識未定，但有一件事沒有爭議——<strong>你所感知的「此刻」，是一個經過加工的版本。</strong>',
        '順帶一提，這也是棒球裁判與足球越位判決長年爭議的知覺根源之一。'
      ], 'Nijhawan, R. (1994). Motion extrapolation in catching. <em>Nature, 370</em>, 256–257.　·　回顧：Hogendoorn (2020), <em>J. Neurosci. 40</em>(30), 5698–5705.');
    });
  }

  /* ══════ 啟動 ══════ */
  html(`<h3>五個實驗，五種「你看到的不是真的」</h3>
    <p>上面挑一個開始。每一個都<strong>只要你的眼睛</strong>，不用任何器材。</p>
    <p class="hint">建議：坐正、螢幕距離 40–60 公分、房間別太亮。第一個實驗做完，你會有點不安。</p>`);
  renderCards();
  renderLog();
})();

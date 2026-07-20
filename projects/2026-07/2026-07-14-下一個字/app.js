/* 下一個字 — 在瀏覽器裡當場訓練一個 n-gram 語言模型
   純靜態、零外部資源。localStorage 前綴：ngram.
   核心演算法寫成純函式，並在檔尾 export 給 node 測試。
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  // ================= 語料 =================
  const TANG = [
    '床前明月光，疑是地上霜。舉頭望明月，低頭思故鄉。',
    '春眠不覺曉，處處聞啼鳥。夜來風雨聲，花落知多少。',
    '白日依山盡，黃河入海流。欲窮千里目，更上一層樓。',
    '千山鳥飛絕，萬徑人蹤滅。孤舟蓑笠翁，獨釣寒江雪。',
    '紅豆生南國，春來發幾枝。願君多采擷，此物最相思。',
    '空山不見人，但聞人語響。返景入深林，復照青苔上。',
    '松下問童子，言師採藥去。只在此山中，雲深不知處。',
    '向晚意不適，驅車登古原。夕陽無限好，只是近黃昏。'
  ].join('');

  const LUNYU = [
    '子曰：學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？人不知而不慍，不亦君子乎？',
    '有子曰：其為人也孝弟，而好犯上者，鮮矣；不好犯上，而好作亂者，未之有也。君子務本，本立而道生。孝弟也者，其為仁之本與！',
    '子曰：巧言令色，鮮矣仁！',
    '曾子曰：吾日三省吾身：為人謀而不忠乎？與朋友交而不信乎？傳不習乎？',
    '子曰：君子食無求飽，居無求安，敏於事而慎於言，就有道而正焉，可謂好學也已。',
    '子曰：不患人之不己知，患不知人也。',
    '子曰：溫故而知新，可以為師矣。',
    '子曰：學而不思則罔，思而不學則殆。',
    '子曰：知之為知之，不知為不知，是知也。',
    '子曰：三人行，必有我師焉：擇其善者而從之，其不善者而改之。'
  ].join('');

  const PROSE = [
    '語言模型從來沒有理解過任何一句話。它做的事情簡單到近乎無聊：讀進前面的字，然後猜下一個字。',
    '猜對了就繼續，猜錯了就調整。整個訓練過程，就是把這件事重複幾兆次。',
    '這件事聽起來太笨了，笨到不像能長出智慧。可是當語料夠多、模型夠大，猜字這件事就開始需要別的東西來支撐。',
    '要猜對一個推理題的下一個字，它得先學會推理；要猜對一段程式碼的下一個字，它得先學會那個語言的規則；',
    '要猜對一句反諷的下一個字，它得先學會反諷。於是能力是被逼出來的，不是被寫進去的。',
    '這一頁裡的模型沒有那麼幸運。它只會數次數：在你餵給它的文字裡，某個上下文後面出現過哪些字、各出現幾次。',
    '它把這些次數變成機率，然後擲一次骰子。沒有向量，沒有注意力，沒有反向傳播，也沒有語意。',
    '但它和那些真正的語言模型，共用同一個目標：讓下一個字的機率盡可能高。',
    '你會看見它復讀，會看見它胡言亂語，也會看見它開始一字不差地背出你給它的文字。',
    '這三種失敗方式，大型語言模型至今都還在對付。差別只在於，它們把失敗藏得比較深。',
    '把溫度調低，它變得保守、囉嗦、開始重複自己；把溫度調高，它變得大膽、失控、開始說出沒有人說過的句子。',
    '創造力與胡說八道之間，隔著一條很細的線，而那條線就是你手上的那根滑桿。',
    '所以下次有人問你，這些模型到底在做什麼，你可以誠實地回答：它在猜下一個字。',
    '然後你可以補一句：問題是，要把下一個字猜得夠準，你得先懂得很多很多事情。'
  ].join('');

  const CORPORA = [
    { id: 'tang', name: '唐詩八首', note: '公共領域', text: TANG },
    { id: 'lunyu', name: '論語・學而', note: '公共領域', text: LUNYU },
    { id: 'prose', name: '一段散文', note: '本頁自寫', text: PROSE },
    { id: 'mix', name: '全部混在一起', note: '語料越雜越有趣', text: PROSE + TANG + LUNYU }
  ];

  // ================= 核心演算法（純函式） =================
  const MAX_N = 5;

  /** 訓練：統計 0～MAX_N-1 階的上下文 → 下一個字的次數 */
  function train(text, maxN) {
    maxN = maxN || MAX_N;
    const orders = [];
    for (let o = 0; o < maxN; o++) orders.push(new Map());
    const vocab = new Set();
    const chars = Array.from(text);

    for (let i = 0; i < chars.length; i++) {
      vocab.add(chars[i]);
      for (let o = 0; o < maxN; o++) {
        if (i - o < 0) continue;
        const ctx = chars.slice(i - o, i).join('');   // 長度 o 的上下文
        let m = orders[o].get(ctx);
        if (!m) { m = new Map(); orders[o].set(ctx, m); }
        m.set(chars[i], (m.get(chars[i]) || 0) + 1);
      }
    }
    let grams = 0;
    orders.forEach(o => o.forEach(m => { grams += m.size; }));
    return { orders, vocab, text, chars, grams, maxN };
  }

  /** 取分布：從 n-1 字的上下文開始，沒見過就一路回退（stupid backoff） */
  function distribution(model, context, n) {
    const want = Math.max(0, Math.min(n - 1, model.maxN - 1));
    const ctxChars = Array.from(context);
    for (let len = want; len >= 0; len--) {
      const key = ctxChars.slice(ctxChars.length - len).join('');
      const m = model.orders[len] && model.orders[len].get(key);
      if (m && m.size > 0) {
        let total = 0;
        m.forEach(c => { total += c; });
        const items = [];
        m.forEach((c, ch) => items.push({ ch, count: c, p: c / total }));
        items.sort((a, b) => b.p - a.p || (a.ch < b.ch ? -1 : 1));
        return { items, used: len, backoff: want - len, total };
      }
    }
    return { items: [], used: 0, backoff: want, total: 0 };
  }

  /** 溫度：p' ∝ p^(1/T)。T→0 等於 argmax（greedy） */
  function applyTemperature(items, T) {
    if (!items.length) return [];
    if (T <= 0.02) {
      const best = items.reduce((a, b) => (b.p > a.p ? b : a), items[0]);
      return items.map(it => ({ ch: it.ch, count: it.count, p: it.ch === best.ch ? 1 : 0 }))
        .filter(it => it.p > 0);
    }
    const logits = items.map(it => Math.log(it.p) / T);
    const mx = Math.max.apply(null, logits);
    const exps = logits.map(l => Math.exp(l - mx));
    const sum = exps.reduce((a, b) => a + b, 0);
    return items.map((it, i) => ({ ch: it.ch, count: it.count, p: exps[i] / sum }));
  }

  /** top-k：只留機率最高的 k 個，再重新歸一化 */
  function applyTopK(items, k) {
    if (!items.length || k <= 0 || k >= items.length) return items.slice();
    const kept = items.slice().sort((a, b) => b.p - a.p).slice(0, k);
    const sum = kept.reduce((a, b) => a + b.p, 0) || 1;
    return kept.map(it => ({ ch: it.ch, count: it.count, p: it.p / sum }));
  }

  /** 擲骰子 */
  function sample(items, rnd) {
    const r = (rnd || Math.random)();
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      acc += items[i].p;
      if (r < acc) return { pick: items[i], index: i, r };
    }
    return { pick: items[items.length - 1], index: items.length - 1, r };
  }

  /** 有效候選數 ＝ 2^熵（這個分布的困惑度） */
  function branching(items) {
    let h = 0;
    for (const it of items) if (it.p > 0) h -= it.p * Math.log2(it.p);
    return Math.pow(2, h);
  }

  /** 偵測復讀：末段是否由某個短單元重複三次以上構成 */
  function findLoop(s, minRepeat) {
    const rep = minRepeat || 3;
    const arr = Array.from(s);
    const tail = arr.slice(-40);
    for (let len = 1; len <= 10; len++) {
      if (tail.length < len * rep) continue;
      const unit = tail.slice(tail.length - len).join('');
      let ok = true;
      for (let r = 2; r <= rep; r++) {
        const seg = tail.slice(tail.length - len * r, tail.length - len * (r - 1)).join('');
        if (seg !== unit) { ok = false; break; }
      }
      if (ok) return unit;
    }
    return null;
  }

  /** 偵測背書：生成文字的尾巴有多長是「一字不差」抄自語料 */
  function verbatimTail(gen, corpus, minLen) {
    const arr = Array.from(gen);
    const min = minLen || 12;
    const max = Math.min(80, arr.length);
    for (let L = max; L >= min; L--) {
      const tail = arr.slice(arr.length - L).join('');
      if (corpus.indexOf(tail) !== -1) return { len: L, text: tail };
    }
    return null;
  }

  const CORE = {
    CORPORA, MAX_N, train, distribution, applyTemperature, applyTopK,
    sample, branching, findLoop, verbatimTail
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  root.NGRAM = CORE;

  // ================= 介面 =================
  if (typeof document === 'undefined') return;

  const KEY = 'ngram.';
  const $ = id => document.getElementById(id);

  const els = {
    chips: $('chips'), corpus: $('corpus'), trainBtn: $('trainBtn'),
    stChars: $('stChars'), stVocab: $('stVocab'), stGrams: $('stGrams'), stTime: $('stTime'),
    ctx: $('ctx'), output: $('output'), dist: $('dist'), distEmpty: $('distEmpty'), dice: $('dice'),
    mBranch: $('mBranch'), mBackoff: $('mBackoff'),
    nRange: $('nRange'), tRange: $('tRange'), kRange: $('kRange'),
    nOut: $('nOut'), tOut: $('tOut'), kOut: $('kOut'), nCtx: $('nCtx'), tNote: $('tNote'),
    stepBtn: $('stepBtn'), autoBtn: $('autoBtn'), autoText: $('autoText'), resetBtn: $('resetBtn'),
    lenOut: $('lenOut'), discList: $('discList'),
    pop: $('pop'), popTag: $('popTag'), popTitle: $('popTitle'), popBody: $('popBody'), popX: $('popX')
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* 隱私模式 */ } }
  };

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = mq.matches;
  const onMQ = e => { reduce = e.matches; };
  if (mq.addEventListener) mq.addEventListener('change', onMQ);
  else if (mq.addListener) mq.addListener(onMQ);

  let model = null;
  let seed = '';        // 起頭
  let gen = '';         // 生成出來的字（不含起頭）
  let auto = false;
  let rafId = 0;
  let lastGen = 0;
  let found = store.get('found', []);
  let corpusId = store.get('corpusId', 'prose');

  const N = () => parseInt(els.nRange.value, 10);
  const T = () => parseFloat(els.tRange.value);
  const K = () => parseInt(els.kRange.value, 10);
  const full = () => seed + gen;

  // ---- 語料籤 ----
  CORPORA.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.id = c.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = c.name + ' <span style="opacity:.6">· ' + c.note + '</span>';
    b.addEventListener('click', () => {
      els.corpus.value = c.text;
      corpusId = c.id;
      store.set('corpusId', c.id);
      markChips();
      doTrain();
    });
    els.chips.appendChild(b);
  });
  function markChips() {
    els.chips.querySelectorAll('.chip').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.id === corpusId));
    });
  }
  els.corpus.addEventListener('input', () => {
    corpusId = 'custom';
    markChips();
    store.set('custom', els.corpus.value.slice(0, 20000));
  });

  // ---- 訓練 ----
  function doTrain() {
    const text = els.corpus.value.trim();
    if (text.length < 20) {
      els.distEmpty.textContent = '語料太短了，至少給它二十個字。';
      return;
    }
    const t0 = performance.now();
    model = train(text, MAX_N);
    const ms = performance.now() - t0;

    els.stChars.textContent = model.chars.length.toLocaleString('zh-TW');
    els.stVocab.textContent = model.vocab.size.toLocaleString('zh-TW');
    els.stGrams.textContent = model.grams.toLocaleString('zh-TW');
    els.stTime.textContent = (ms < 1 ? '<1' : Math.round(ms)) + ' ms';

    els.stepBtn.disabled = false;
    els.autoBtn.disabled = false;
    els.resetBtn.disabled = false;
    els.distEmpty.hidden = true;

    newSeed();
  }

  function newSeed() {
    stopAuto();
    const chars = model.chars;
    const want = Math.max(1, N() - 1);
    const start = Math.floor(Math.random() * Math.max(1, chars.length - want - 1));
    seed = chars.slice(start, start + want).join('');
    gen = '';
    render();
  }

  // ---- 生成一步 ----
  function step() {
    if (!model) return;
    const dist = distribution(model, full(), N());
    if (!dist.items.length) { newSeed(); return; }
    let items = applyTemperature(dist.items, T());
    items = applyTopK(items, K());
    const { pick } = sample(items);
    gen += pick.ch;
    if (Array.from(full()).length > 600) gen = gen.slice(-500);
    render(pick.ch);
    check();
  }

  // ---- 畫面 ----
  function render(justPicked) {
    if (!model) return;
    const ctxWant = Math.max(0, N() - 1);
    const fullArr = Array.from(full());
    const ctxStr = fullArr.slice(fullArr.length - ctxWant).join('');

    els.ctx.innerHTML = '';
    if (!ctxWant) {
      const s = document.createElement('span');
      s.className = 'ctx-empty';
      s.textContent = '（n＝1：它連前一個字都不看）';
      els.ctx.appendChild(s);
    } else {
      Array.from(ctxStr).forEach(ch => {
        const s = document.createElement('span');
        s.className = 'c';
        s.textContent = ch;
        els.ctx.appendChild(s);
      });
    }

    // 輸出
    els.output.innerHTML = '';
    const seedSpan = document.createElement('span');
    seedSpan.className = 'seed';
    seedSpan.textContent = seed;
    els.output.appendChild(seedSpan);
    const body = document.createTextNode(justPicked ? gen.slice(0, -1) : gen);
    els.output.appendChild(body);
    if (justPicked) {
      const nw = document.createElement('span');
      nw.className = 'new';
      nw.textContent = justPicked;
      els.output.appendChild(nw);
    }
    els.output.scrollTop = els.output.scrollHeight;
    els.lenOut.textContent = gen.length ? '已生成 ' + Array.from(gen).length + ' 個字' : '';

    // 分布
    const dist = distribution(model, full(), N());
    let items = applyTemperature(dist.items, T());
    items = applyTopK(items, K());
    const top = items.slice().sort((a, b) => b.p - a.p).slice(0, 10);

    els.dist.innerHTML = '';
    top.forEach(it => {
      const li = document.createElement('li');
      if (justPicked && it.ch === justPicked) li.className = 'hit';
      const bar = document.createElement('span');
      bar.className = 'bar';
      const ch = document.createElement('span');
      ch.className = 'ch';
      ch.textContent = it.ch === '\n' ? '↵' : it.ch;
      const pct = document.createElement('span');
      pct.className = 'pct';
      pct.textContent = (it.p * 100).toFixed(1) + '%';
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = '語料裡出現 ' + it.count + ' 次';
      li.appendChild(bar); li.appendChild(ch); li.appendChild(pct); li.appendChild(cnt);
      els.dist.appendChild(li);
      const w = Math.max(0.02, it.p);
      if (reduce) bar.style.transform = 'scaleX(' + w + ')';
      else requestAnimationFrame(() => { bar.style.transform = 'scaleX(' + w + ')'; });
    });
    if (!top.length) {
      els.distEmpty.hidden = false;
      els.distEmpty.textContent = '這個上下文後面沒有任何字——換個開頭吧。';
    } else {
      els.distEmpty.hidden = true;
    }

    els.mBranch.textContent = items.length ? branching(items).toFixed(2) : '—';
    els.mBackoff.textContent = dist.items.length
      ? (dist.backoff === 0 ? '沒有回退' : '退了 ' + dist.backoff + ' 階（只看 ' + dist.used + ' 字）')
      : '—';

    if (justPicked && !reduce) {
      els.dice.classList.add('roll');
      setTimeout(() => els.dice.classList.remove('roll'), 200);
    }
  }

  // ---- 三個現象 ----
  const POPS = {
    loop: {
      tag: '現象一 · 復讀機',
      title: '它卡住了',
      body: '溫度趨近 0，模型每次都挑機率最高的那個字——沒有隨機性，就沒有出路：一旦走進一個迴圈，它會永遠繞下去。這就是 greedy decoding 的老毛病，真正的語言模型也會犯，所以實務上幾乎沒有人把溫度設成 0 來寫長文。'
    },
    chaos: {
      tag: '現象二 · 胡言亂語',
      title: '分布被攤平了',
      body: '溫度很高時，機率分布被壓成接近均勻——本來只有 1% 機會的字，現在跟最佳答案幾乎一樣可能被抽中。創造力與胡說八道之間那條線，就是這根滑桿。'
    },
    memo: {
      tag: '現象三 · 它在背書',
      title: '這不是生成，是回憶',
      body: 'n 一大，幾乎每個上下文在語料裡都只出現過一次——模型別無選擇，只能把原文一字不差地吐出來。這就是資料稀疏，也是「模型記住訓練資料」爭議的極簡版本：它不是在理解，它只是在背。'
    }
  };

  function unlock(key, extra) {
    if (found.indexOf(key) === -1) {
      found.push(key);
      store.set('found', found);
    }
    markFound();
    const p = POPS[key];
    els.popTag.textContent = p.tag;
    els.popTitle.textContent = p.title;
    els.popBody.textContent = extra ? extra + p.body : p.body;
    els.pop.hidden = false;
  }
  function markFound() {
    els.discList.querySelectorAll('li').forEach(li => {
      const on = found.indexOf(li.dataset.key) !== -1;
      li.classList.toggle('found', on);
      li.classList.toggle('locked', !on);
    });
  }
  els.popX.addEventListener('click', () => { els.pop.hidden = true; });

  let popCool = 0;
  function check() {
    const now = Date.now();
    if (now - popCool < 4000) return;
    const g = Array.from(gen);
    if (g.length < 16) return;

    if (T() <= 0.05) {
      const unit = findLoop(gen, 3);
      if (unit) { popCool = now; unlock('loop', '它剛剛把「' + unit + '」連寫了三次以上。'); return; }
    }
    if (T() >= 1.55 && g.length >= 24) {
      popCool = now;
      unlock('chaos', '溫度 ' + T().toFixed(2) + '：現在連語料裡只出現過一次的字，都跟最佳解差不多可能被抽中。');
      return;
    }
    if (N() >= 4 && g.length >= 20) {
      const v = verbatimTail(full(), model.text, 18);
      if (v) {
        popCool = now;
        unlock('memo', '它剛剛寫的最後 ' + v.len + ' 個字（「' + v.text.slice(0, 14) + '…」）一字不差地出現在語料裡。');
      }
    }
  }

  // ---- 自動生成 ----
  function tick(ts) {
    if (!auto) return;
    if (ts - lastGen >= (reduce ? 260 : 110)) {
      lastGen = ts;
      step();
      if (Array.from(gen).length >= 400) { stopAuto(); }
    }
    rafId = requestAnimationFrame(tick);
  }
  function startAuto() {
    if (!model || auto) return;
    auto = true;
    els.autoBtn.setAttribute('aria-pressed', 'true');
    els.autoText.textContent = '停下來';
    lastGen = 0;
    rafId = requestAnimationFrame(tick);
  }
  function stopAuto() {
    auto = false;
    els.autoBtn.setAttribute('aria-pressed', 'false');
    els.autoText.textContent = '連續生成';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // ---- 事件 ----
  els.trainBtn.addEventListener('click', doTrain);
  els.stepBtn.addEventListener('click', () => { stopAuto(); step(); });
  els.autoBtn.addEventListener('click', () => (auto ? stopAuto() : startAuto()));
  els.resetBtn.addEventListener('click', newSeed);

  function syncLabels() {
    els.nOut.textContent = N();
    els.nCtx.textContent = Math.max(0, N() - 1);
    els.kOut.textContent = K();
    const t = T();
    els.tOut.textContent = t.toFixed(2);
    els.tNote.textContent = t <= 0.05 ? '幾乎不擲骰子（greedy）'
      : t < 0.7 ? '保守' : t <= 1.2 ? '正常' : t < 1.55 ? '大膽' : '失控';
    store.set('settings', { n: N(), t: T(), k: K() });
  }
  ['nRange', 'tRange', 'kRange'].forEach(id => {
    els[id].addEventListener('input', () => { syncLabels(); if (model) render(); });
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) stopAuto(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { if (!es[0].isIntersecting) stopAuto(); }, { threshold: 0 })
      .observe(els.dist);
  }
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || tag === 'button') return;
    if (e.key === 'Enter') { e.preventDefault(); step(); }
    if (e.key === ' ') { e.preventDefault(); auto ? stopAuto() : startAuto(); }
  });

  // ---- 開機 ----
  (function boot() {
    const st = store.get('settings', null);
    if (st) {
      els.nRange.value = st.n != null ? st.n : 3;
      els.tRange.value = st.t != null ? st.t : 0.8;
      els.kRange.value = st.k != null ? st.k : 10;
    }
    syncLabels();

    const custom = store.get('custom', '');
    const c = CORPORA.filter(x => x.id === corpusId)[0];
    els.corpus.value = c ? c.text : (custom || CORPORA[2].text);
    if (!c && !custom) corpusId = 'prose';
    markChips();
    markFound();
    doTrain();
  })();

})(typeof globalThis !== 'undefined' ? globalThis : this);

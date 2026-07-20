/* 注意力 · Transformer 的心臟
   真的算一個自注意力頭：softmax(QKᵀ/√d)V，並忠實示範 induction head（歸納頭）。
   純靜態、零外部資源、雙擊離線可用、不連網、不呼叫任何 AI API。
   localStorage 前綴：attn.
   數學核心寫成純函式，檔尾 export 給 node 測試；所有 DOM 操作用 typeof document 保護。
   中文一律以 code point 處理（Array.from）。
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  /* ============================================================
     一、純數學核心（可被 node 直接 require 測試，不碰 DOM）
     ============================================================ */

  // 數值穩定的 softmax：減去最大值再取指數，回傳「和為 1」的機率向量
  function softmax(scores) {
    var m = -Infinity, i;
    for (i = 0; i < scores.length; i++) if (scores[i] > m) m = scores[i];
    if (m === -Infinity) return scores.map(function () { return 1 / scores.length; });
    var ex = new Array(scores.length), s = 0;
    for (i = 0; i < scores.length; i++) { ex[i] = Math.exp(scores[i] - m); s += ex[i]; }
    for (i = 0; i < ex.length; i++) ex[i] /= s;
    return ex;
  }

  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

  // 以稀疏項 [{out,in,w}] 定義一個 (outDim×inDim) 線性投影矩陣（W_Q / W_K / W_V）
  function makeW(outDim, inDim, entries) {
    var M = [], r;
    for (r = 0; r < outDim; r++) M.push(new Array(inDim).fill(0));
    entries.forEach(function (e) { M[e.out][e['in']] = e.w; });
    return M;
  }
  // X: n×inDim，W: outDim×inDim → 回傳 n×outDim
  function project(X, W) {
    return X.map(function (x) { return W.map(function (row) { return dot(row, x); }); });
  }

  // 香農熵（bits）：衡量一列注意力分布的尖銳程度，越低越尖、越高越平
  function entropy(p) {
    var h = 0, i, q;
    for (i = 0; i < p.length; i++) { q = p[i]; if (q > 1e-12) h -= q * Math.log2(q); }
    return h;
  }

  // 注意力核心：給 Q、K、V，算 scaled dot-product attention
  // opts: { scale: 是否除以 √dk, beta: 額外倍率, mask: (i,j)->bool 是否允許 }
  // 回傳 scores（QKᵀ/√d）、weights（每列 softmax，和為 1）、out（weights·V）
  function attentionQKV(Q, K, V, opts) {
    opts = opts || {};
    var n = Q.length, m = K.length, dk = Q[0].length, dv = V[0].length;
    var denom = opts.scale ? Math.sqrt(dk) : 1;
    var beta = (opts.beta == null) ? 1 : opts.beta;
    var scores = [], weights = [], out = [], i, j, d;
    for (i = 0; i < n; i++) {
      var row = new Array(m);
      for (j = 0; j < m; j++) {
        var allow = opts.mask ? opts.mask(i, j) : true;
        row[j] = allow ? (beta * dot(Q[i], K[j]) / denom) : -Infinity;
      }
      scores.push(row);
      var w = softmax(row);
      weights.push(w);
      var o = new Array(dv).fill(0);
      for (j = 0; j < m; j++) for (d = 0; d < dv; d++) o[d] += w[j] * V[j][d];
      out.push(o);
    }
    return { scores: scores, weights: weights, out: out, dk: dk };
  }

  // 正弦位置編碼，與〈Attention Is All You Need〉相同形式：
  // PE(pos,2k)=sin(pos/10000^(2k/dp))、PE(pos,2k+1)=cos(...)
  function posEnc(pos, dp) {
    var pe = new Array(dp), k, w;
    for (k = 0; k < dp / 2; k++) {
      w = 1 / Math.pow(10000, (2 * k) / dp);
      pe[2 * k] = Math.sin(pos * w);
      pe[2 * k + 1] = Math.cos(pos * w);
    }
    return pe;
  }

  /* ---- 主展示：一個可解釋的自注意力頭 ----
     每個 token 的輸入向量 x = [內容特徵(4) ; 位置編碼(DP)]
     內容特徵維度：0=名詞性 1=動詞性 2=修飾性 3=有生命
     三個「頭」共用同一套 x，只是 W_Q / W_K 不同（真實模型裡這些矩陣是訓練出來的，
     這裡手工挑選，好讓你看清不同的頭學到不同關係；一旦固定，計算方式一模一樣）。      */
  var DP = 8;                 // 位置編碼維度
  var CDIM = 4;               // 內容特徵維度
  var IN = CDIM + DP;         // 輸入向量總維度 = 12
  var POS0 = CDIM;            // 位置編碼在 x 裡的起始索引

  // 頭的超參數（倍率越大 → 分數越大 → 未除以 √d 時 softmax 越尖）
  var HP = { sA: 4.0, sB: 2.3, betaC: 1.6, beta1: 6.0, beta2: 9.0 };

  // Head A「語法：動詞↔論元」——動詞去找名詞、名詞去找動詞
  var WqA = makeW(2, IN, [{ out: 0, 'in': 1, w: HP.sA }, { out: 1, 'in': 0, w: HP.sA }]);
  var WkA = makeW(2, IN, [{ out: 0, 'in': 0, w: 1 }, { out: 1, 'in': 1, w: 1 }]);
  // Head B「語意：同類相吸」——有生命的去找有生命的、名詞去找名詞
  var WqB = makeW(2, IN, [{ out: 0, 'in': 3, w: HP.sB }, { out: 1, 'in': 0, w: HP.sB }]);
  var WkB = makeW(2, IN, [{ out: 0, 'in': 3, w: 1 }, { out: 1, 'in': 0, w: 1 }]);

  function buildX(feats) {
    return feats.map(function (f, i) { return f.concat(posEnc(i, DP)); });
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  // 計算某個頭在某句子上的注意力
  // headId: 'A' | 'B' | 'C'；scale: 是否除以 √dk
  function computeHead(feats, headId, scale) {
    var X = buildX(feats), n = feats.length, Q, K, V = X, res;
    if (headId === 'A') { Q = project(X, WqA); K = project(X, WkA); res = attentionQKV(Q, K, V, { scale: scale }); }
    else if (headId === 'B') { Q = project(X, WqB); K = project(X, WkB); res = attentionQKV(Q, K, V, { scale: scale }); }
    else { // Head C「位置：看前一個字」——查詢 = 位置編碼往前移一格（PE(i-1)），鍵 = PE(j)
      Q = range(n).map(function (i) { return posEnc(i - 1, DP); });
      K = range(n).map(function (j) { return posEnc(j, DP); });
      res = attentionQKV(Q, K, V, { scale: scale, beta: HP.betaC });
    }
    return res; // { scores, weights, out, dk }
  }

  /* ---- 隱藏寶藏：忠實的 induction head（歸納頭）兩層電路 ----
     第一層＝前一字頭：用位置編碼讓每個位置「回頭看前一格」，把前一個 token 的身分
       抄進自己的殘差流（prev-slot）。
     第二層＝歸納頭：用「當前 token 的內容」當查詢，去比對每個位置 prev-slot 裡寫的
       token——也就是找「哪些位置的前一個字，正好等於我」。命中的位置 j，其本身的
       token（上次那個後繼）就被複製成預測。這正是「在上下文裡複製」＝ [A][B]…[A]→[B]。
     token 用 one-hot 表示，內容比對是精確的，因此預測乾淨；兩層都是真的 softmax 注意力。 */
  function inductionRun(tokens) {
    var n = tokens.length, i;
    var vocab = [], idx = {};
    for (i = 0; i < n; i++) if (!(tokens[i] in idx)) { idx[tokens[i]] = vocab.length; vocab.push(tokens[i]); }
    var V = vocab.length;
    var oh = tokens.map(function (t) { var v = new Array(V).fill(0); v[idx[t]] = 1; return v; });

    // 第一層：前一字頭
    var Q1 = range(n).map(function (i) { return posEnc(i - 1, DP); });
    var K1 = range(n).map(function (j) { return posEnc(j, DP); });
    var r1 = attentionQKV(Q1, K1, oh, { beta: HP.beta1 }); // V=oh → out=抄過來的前一字
    var prevSlot = r1.out;               // prevSlot[i] ≈ token[i-1] 的 one-hot
    var prevTok = r1.weights.map(function (w) {
      var best = 0; for (var j = 1; j < n; j++) if (w[j] > w[best]) best = j; return tokens[best];
    });

    // 第二層：歸納頭。查詢=當前 token 內容；鍵=各位置 prev-slot；遮蔽 j=0（無前一字）
    var r2 = attentionQKV(oh, prevSlot, oh, { beta: HP.beta2, mask: function (i, j) { return j >= 1; } });
    var t = n - 1;                       // 由最後一個 token 發動預測
    var predDist = r2.out[t];            // 對 vocab 的機率分布（複製過來的後繼）
    var predIdx = 0; for (i = 1; i < V; i++) if (predDist[i] > predDist[predIdx]) predIdx = i;

    // 上一次出現當前 token 的位置、以及它的後繼位置（給視覺用）
    var cur = tokens[t], prevOcc = -1, succPos = -1;
    for (i = t - 1; i >= 0; i--) if (tokens[i] === cur) { prevOcc = i; break; }
    if (prevOcc >= 0 && prevOcc + 1 < n) succPos = prevOcc + 1;

    return {
      tokens: tokens, vocab: vocab, n: n,
      A1: r1.weights, prevTok: prevTok, prevSlot: prevSlot,
      A2: r2.weights, scores2: r2.scores,
      predDist: predDist, predIdx: predIdx, predTok: vocab[predIdx],
      queryPos: t, prevOcc: prevOcc, succPos: succPos,
      confidence: predDist[predIdx]
    };
  }

  /* ============================================================
     二、資料：內建例句（含手工可解釋特徵）與 induction 序列
     ============================================================ */
  // 內容特徵 [名詞性, 動詞性, 修飾性, 有生命]
  var EXAMPLES = [
    {
      id: 'cat', lang: 'zh', label: '小貓追老鼠',
      tokens: ['小', '貓', '追', '老', '鼠'],
      feats: [[0, 0, 1, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 1]],
      note: '主詞—動詞—受詞，加上兩個修飾字'
    },
    {
      id: 'buy', lang: 'zh', label: '小明買了新書',
      tokens: ['小', '明', '買', '了', '新', '書'],
      feats: [[0, 0, 1, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0.4, 0], [0, 0, 1, 0], [1, 0, 0, 0]],
      note: '「了」是時貌助詞、幾乎沒有內容'
    },
    {
      id: 'dog', lang: 'en', label: 'the dog chased the cat',
      tokens: ['the', 'dog', 'chased', 'the', 'cat'],
      feats: [[0, 0, 1, 0], [1, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 1]],
      note: '英文以「詞」為 token；兩個 the 是重複的功能詞'
    }
  ];

  var SEQUENCES = [
    { id: 'abcd', label: 'A B C D · 重複', tokens: ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A'] },
    { id: 'color', label: '藍 綠 紅 · 重複', tokens: ['藍', '綠', '紅', '藍', '綠', '紅', '藍', '綠'] },
    { id: 'fewshot', label: '貓→喵 狗→汪 …', tokens: ['貓', '喵', '狗', '汪', '貓', '喵', '狗', '汪', '貓'] }
  ];

  // 常用字的粗略詞性字典（給自訂句子用；只是簡化的自動標記）
  var LEXICON = {};
  (function () {
    var noun = '貓鼠明書狗人山水花草天空雲月日星海魚鳥樹木石心手眼車門窗火風雨雪茶飯水果王后男女媽爸子女朋友師生';
    var verb = '追買賣吃喝看想跑走飛游讀寫說唱來去給拿放做學教愛恨笑哭問答開關';
    var mod = '小老新舊大高低長短紅綠藍白黑很最太更好美快慢';
    var func = '的了嗎呢吧把被和與也都就還又這那是在有';
    Array.from(noun).forEach(function (c) { LEXICON[c] = [1, 0, 0, 0]; });
    Array.from('貓鼠人狗魚鳥王后男女媽爸子女朋友師生明').forEach(function (c) { LEXICON[c] = [1, 0, 0, 1]; });
    Array.from(verb).forEach(function (c) { LEXICON[c] = [0, 1, 0, 0]; });
    Array.from(mod).forEach(function (c) { LEXICON[c] = [0, 0, 1, 0]; });
    Array.from(func).forEach(function (c) { LEXICON[c] = [0, 0, 0.4, 0]; });
  })();

  // 自訂輸入 → tokens + feats（英文按空白切詞、中文按字切）
  function tokenizeCustom(text) {
    text = (text || '').trim();
    var tokens;
    if (/[A-Za-z]/.test(text) && /\s/.test(text)) tokens = text.split(/\s+/).filter(Boolean);
    else tokens = Array.from(text).filter(function (c) { return c.trim() !== ''; });
    tokens = tokens.slice(0, 12);
    var feats = tokens.map(function (tk) {
      if (LEXICON[tk]) return LEXICON[tk].slice();
      // 未知：預設弱名詞，並用 code point 給一點可分辨的抖動（好讓語意頭有東西可分）
      var cp = Array.from(tk)[0] ? Array.from(tk)[0].codePointAt(0) : 0;
      var j = (cp % 7) / 20;
      return [0.6, 0, 0, j];
    });
    return { tokens: tokens, feats: feats };
  }

  var CORE = {
    softmax: softmax, dot: dot, entropy: entropy, attentionQKV: attentionQKV,
    posEnc: posEnc, project: project, makeW: makeW,
    computeHead: computeHead, inductionRun: inductionRun,
    buildX: buildX, tokenizeCustom: tokenizeCustom,
    EXAMPLES: EXAMPLES, SEQUENCES: SEQUENCES, HP: HP, DP: DP, IN: IN
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  root.AttnCore = CORE;

  /* ============================================================
     三、UI（僅在瀏覽器執行；node require 時整段跳過）
     ============================================================ */
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  // ---------- 小工具 ----------
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'attn.';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { } }
  };
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mq.matches;
  var onMQ = function (e) { reduce = e.matches; drawHeadArcs(); drawIndArcs(); };
  if (mq.addEventListener) mq.addEventListener('change', onMQ); else if (mq.addListener) mq.addListener(onMQ);

  function elt(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function pct(x) { return Math.round(x * 100); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // 數字滾動（尊重 reduced-motion 與分頁隱藏；無常駐 rAF 迴圈）
  function rollNumber(node, to, digits) {
    var from = parseFloat(node.getAttribute('data-v') || '0');
    node.setAttribute('data-v', String(to));
    if (reduce || document.hidden) { node.textContent = to.toFixed(digits); return; }
    var t0 = performance.now(), dur = 420;
    function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = (from + (to - from) * e).toFixed(digits);
      if (k < 1 && !document.hidden) requestAnimationFrame(step); else node.textContent = to.toFixed(digits);
    }
    requestAnimationFrame(step);
  }

  // ---------- 狀態 ----------
  var state = {
    exampleId: store.get('exampleId', 'cat'),
    customText: store.get('customText', ''),
    headId: store.get('headId', 'A'),
    scale: store.get('scale', true),
    queryIdx: 0,
    seqId: store.get('seqId', 'abcd'),
    customSeq: store.get('customSeq', '')
  };
  if (['A', 'B', 'C'].indexOf(state.headId) < 0) state.headId = 'A';

  var HEAD_INFO = {
    A: { name: '語法頭', sub: '動詞 ↔ 論元', desc: '這個頭只在「動詞」上活躍：動詞去找它的主詞與受詞，名詞則回頭找動詞。其他字在這個頭裡沒有要找的對象，注意力就攤平——這正是真實模型「每個頭各有專長」的縮影。' },
    B: { name: '語意頭', sub: '同類相吸', desc: '這個頭看「語意類別」：有生命的字互相關注、名詞關注名詞。同一種東西會聚在一起，跟語法位置無關。' },
    C: { name: '位置頭', sub: '看前一個字', desc: '這個頭只看位置：每個字都把注意力投給「前一個字」，用的是正弦位置編碼。記住它——它就是等一下 induction head 的第一層零件。' }
  };

  var curSent = null, curHead = null; // 快取目前計算結果

  function currentSentence() {
    if (state.exampleId === 'custom') {
      var t = CORE.tokenizeCustom(state.customText || '貓 追 老鼠');
      if (!t.tokens.length) { t = CORE.tokenizeCustom('貓 追 老鼠'); }
      return { tokens: t.tokens, feats: t.feats, note: '自訂句子（用簡化的自動詞性標記，僅供把玩）', custom: true };
    }
    return EXAMPLES.filter(function (e) { return e.id === state.exampleId; })[0] || EXAMPLES[0];
  }
  function defaultQuery(sent, headId) {
    var f = sent.feats, i;
    if (headId === 'A') { for (i = 0; i < f.length; i++) if (f[i][1] > 0) return i; }
    if (headId === 'B') { for (i = 0; i < f.length; i++) if (f[i][3] > 0) return i; }
    if (headId === 'C') return sent.tokens.length - 1;
    return 0;
  }

  /* ============ 面板 1：選句子 ============ */
  function renderExampleChips() {
    var box = $('ex-chips'); box.innerHTML = '';
    EXAMPLES.forEach(function (ex) {
      var b = elt('button', 'chip', ex.label); b.type = 'button'; b.dataset.id = ex.id;
      b.setAttribute('aria-pressed', String(state.exampleId === ex.id));
      b.addEventListener('click', function () { state.exampleId = ex.id; store.set('exampleId', ex.id); $('sent-input').value = ''; onSentenceChange(); });
      box.appendChild(b);
    });
    var cb = elt('button', 'chip', '＋ 自訂'); cb.type = 'button'; cb.dataset.id = 'custom';
    cb.setAttribute('aria-pressed', String(state.exampleId === 'custom'));
    cb.addEventListener('click', function () { $('sent-input').focus(); });
    box.appendChild(cb);
  }
  function markExampleChips() {
    Array.prototype.forEach.call($('ex-chips').children, function (c) {
      c.setAttribute('aria-pressed', String(c.dataset.id === state.exampleId));
    });
  }

  /* ============ 面板 2：自注意力頭 ============ */
  function renderHeadTabs() {
    Array.prototype.forEach.call($('head-tabs').children, function (b) {
      var on = b.dataset.head === state.headId;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    });
    var info = HEAD_INFO[state.headId];
    $('head-desc').textContent = info.desc;
  }

  function onSentenceChange() {
    markExampleChips();
    curSent = currentSentence();
    state.queryIdx = clamp(defaultQuery(curSent, state.headId), 0, curSent.tokens.length - 1);
    renderTokenStrip();
    renderHead();
  }

  function renderTokenStrip() {
    var strip = $('tok-strip'); strip.innerHTML = '';
    curSent.tokens.forEach(function (tk, i) {
      var b = elt('button', 'qtok', tk); b.type = 'button'; b.dataset.idx = i;
      b.setAttribute('role', 'option'); b.setAttribute('aria-label', '查詢字 ' + tk);
      b.tabIndex = i === state.queryIdx ? 0 : -1;
      b.addEventListener('click', function () { setQuery(i, true); });
      b.addEventListener('focus', function () { setQuery(i, false); });
      b.addEventListener('keydown', onStripKey);
      strip.appendChild(b);
    });
  }
  function onStripKey(e) {
    var n = curSent.tokens.length, i = state.queryIdx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setQuery((i + 1) % n, true); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setQuery((i - 1 + n) % n, true); }
    else if (e.key === 'Home') { e.preventDefault(); setQuery(0, true); }
    else if (e.key === 'End') { e.preventDefault(); setQuery(n - 1, true); }
  }

  function renderHead() {
    curHead = CORE.computeHead(curSent.feats, state.headId, state.scale);
    renderHeatmap();
    renderHeadTabs();
    // 縮放開關 UI
    $('scale-toggle').checked = state.scale;
    $('scale-note').textContent = state.scale ? '開：分數除以 √dₖ，注意力較平滑' : '關：分數變大，softmax 變尖銳';
    $('formula-scale').classList.toggle('off', !state.scale);
    setQuery(state.queryIdx, false);
  }

  function renderHeatmap() {
    var wrap = $('heat'); wrap.innerHTML = '';
    var tokens = curSent.tokens, W = curHead.weights, n = tokens.length;
    var table = elt('table', 'heat-table');
    var cap = elt('caption', null, '自注意力權重矩陣：列＝查詢字（誰在看），行＝被關注的字（在看誰），數字為百分比，每列相加為 100%。');
    cap.className = 'sr-only'; table.appendChild(cap);
    var thead = elt('thead'), htr = elt('tr');
    htr.appendChild(elt('th', 'corner', '')); 
    tokens.forEach(function (tk) { var th = elt('th', 'kcol', tk); th.scope = 'col'; htr.appendChild(th); });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = elt('tbody');
    for (var i = 0; i < n; i++) {
      var tr = elt('tr'); tr.dataset.row = i;
      var rh = elt('th', 'qrow'); rh.scope = 'row';
      var rb = elt('button', null, tokens[i]); rb.type = 'button'; rb.dataset.idx = i;
      rb.setAttribute('aria-label', '選查詢字 ' + tokens[i]);
      rb.addEventListener('click', (function (ii) { return function () { setQuery(ii, true); }; })(i));
      rh.appendChild(rb); tr.appendChild(rh);
      var argmax = 0; for (var a = 1; a < n; a++) if (W[i][a] > W[i][argmax]) argmax = a;
      for (var j = 0; j < n; j++) {
        var td = elt('td', 'cell'); td.dataset.row = i; td.dataset.col = j;
        if (j === argmax) td.classList.add('peak');
        var fill = elt('span', 'cell-fill'); fill.style.opacity = W[i][j].toFixed(3);
        var num = elt('span', 'cell-num', pct(W[i][j]) === 0 && W[i][j] > 0 ? '·' : String(pct(W[i][j])));
        td.title = tokens[i] + ' → ' + tokens[j] + '：' + pct(W[i][j]) + '%';
        td.appendChild(fill); td.appendChild(num);
        td.addEventListener('mouseenter', (function (ii) { return function () { hoverRow(ii); }; })(i));
        td.addEventListener('click', (function (ii) { return function () { setQuery(ii, true); }; })(i));
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    table.appendChild(tb); wrap.appendChild(table);
  }
  function hoverRow(i) {
    Array.prototype.forEach.call($('heat').querySelectorAll('tr'), function (tr) {
      tr.classList.toggle('hover', tr.dataset.row === String(i));
    });
  }

  function setQuery(i, moveFocus) {
    state.queryIdx = i;
    // token strip 高亮 + roving tabindex
    Array.prototype.forEach.call($('tok-strip').children, function (b, k) {
      var on = k === i; b.classList.toggle('sel', on); b.tabIndex = on ? 0 : -1;
      b.setAttribute('aria-selected', String(on));
      if (on && moveFocus) b.focus();
    });
    // heatmap 選定列 + 對應行
    var argmax = 0, W = curHead.weights[i];
    for (var a = 1; a < W.length; a++) if (W[a] > W[argmax]) argmax = a;
    Array.prototype.forEach.call($('heat').querySelectorAll('tr'), function (tr) {
      tr.classList.toggle('sel', tr.dataset.row === String(i));
    });
    Array.prototype.forEach.call($('heat').querySelectorAll('td'), function (td) {
      td.classList.toggle('colsel', td.dataset.col === String(argmax) && td.dataset.row === String(i));
    });
    drawHeadArcs();
    renderBreakdown(i);
    renderCalc(i);
  }

  function renderBreakdown(i) {
    var tokens = curSent.tokens, W = curHead.weights[i];
    var list = $('bd-list'); list.innerHTML = '';
    $('bd-title').textContent = '查詢字「' + tokens[i] + '」把注意力分給了誰';
    var order = W.map(function (v, j) { return { v: v, j: j }; }).sort(function (a, b) { return b.v - a.v; });
    order.forEach(function (o) {
      var li = elt('li', 'bd-item' + (o.j === i ? ' self' : ''));
      var lab = elt('span', 'bd-key', tokens[o.j] + (o.j === i ? '（自己）' : ''));
      var barwrap = elt('span', 'bd-bar');
      var bar = elt('span', 'bd-fill'); bar.style.transform = 'scaleX(' + o.v.toFixed(3) + ')';
      barwrap.appendChild(bar);
      var val = elt('span', 'bd-val', pct(o.v) + '%');
      li.appendChild(lab); li.appendChild(barwrap); li.appendChild(val);
      list.appendChild(li);
    });
    // aria-live 摘要（前二名）
    var top = order.slice(0, 2).map(function (o) { return tokens[o.j] + ' ' + pct(o.v) + '%'; }).join('、');
    $('live').textContent = '查詢字「' + tokens[i] + '」在' + HEAD_INFO[state.headId].name + '裡最關注：' + top + '。';
  }

  function renderCalc(i) {
    var W = curHead.weights[i];
    var ent = CORE.entropy(W), mx = Math.max.apply(null, W);
    rollNumber($('calc-ent'), ent, 2);
    rollNumber($('calc-max'), mx * 100, 0);
    $('calc-dk').textContent = String(curHead.dk);
    $('calc-scale').textContent = state.scale ? '開（÷√' + curHead.dk + '）' : '關';
  }

  // 主展示的注意力連線（SVG 內部，允許 stroke 動畫）
  function drawHeadArcs() {
    if (!curSent || !curHead) return;
    var svg = $('arc-svg'), wrap = $('strip-wrap'), strip = $('tok-strip');
    var btns = strip.querySelectorAll('.qtok');
    if (!btns.length) { svg.innerHTML = ''; return; }
    var wrapRect = wrap.getBoundingClientRect();
    var yTop = btns[0].getBoundingClientRect().top - wrapRect.top;
    function cx(idx) { var r = btns[idx].getBoundingClientRect(); return r.left - wrapRect.left + r.width / 2; }
    var qi = state.queryIdx, W = curHead.weights[qi];
    var parts = ['<defs><linearGradient id="arcgrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5ee7d0"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>'];
    var order = W.map(function (v, j) { return { v: v, j: j }; }).sort(function (a, b) { return a.v - b.v; });
    order.forEach(function (o) {
      if (o.v < 0.04) return;
      var x1 = cx(qi), x2 = cx(o.j), d;
      if (o.j === qi) { d = 'M' + (x1 - 9) + ',' + yTop + ' C' + (x1 - 16) + ',' + (yTop - 42) + ' ' + (x1 + 16) + ',' + (yTop - 42) + ' ' + (x1 + 9) + ',' + yTop; }
      else { var lift = Math.min(80, 24 + Math.abs(x2 - x1) * 0.34); d = 'M' + x1 + ',' + yTop + ' Q' + ((x1 + x2) / 2) + ',' + (yTop - lift) + ' ' + x2 + ',' + yTop; }
      parts.push('<path d="' + d + '" fill="none" stroke="url(#arcgrad)" stroke-width="' + (1 + o.v * 7).toFixed(2) + '" stroke-linecap="round" opacity="' + (0.16 + o.v * 0.8).toFixed(3) + '"/>');
      parts.push('<circle cx="' + x2 + '" cy="' + yTop + '" r="' + (2 + o.v * 4).toFixed(2) + '" fill="#5ee7d0" opacity="' + (0.3 + o.v * 0.7).toFixed(2) + '"/>');
    });
    svg.innerHTML = parts.join('');
    if (!reduce) { svg.classList.remove('fade'); void svg.offsetWidth; svg.classList.add('fade'); }
  }

  /* ============ 面板 3：induction head ============ */
  function parseSeq(text) {
    text = (text || '').trim();
    var toks;
    if (/[A-Za-z0-9]/.test(text) && /\s/.test(text)) toks = text.split(/\s+/).filter(Boolean);
    else toks = Array.from(text).filter(function (c) { return c.trim() !== ''; });
    return toks.slice(0, 14);
  }
  function currentSeq() {
    if (state.seqId === 'custom') {
      var t = parseSeq(state.customSeq); if (t.length < 2) t = SEQUENCES[0].tokens.slice();
      return t;
    }
    return (SEQUENCES.filter(function (s) { return s.id === state.seqId; })[0] || SEQUENCES[0]).tokens.slice();
  }
  var curInd = null;

  function renderSeqChips() {
    var box = $('seq-chips'); box.innerHTML = '';
    SEQUENCES.forEach(function (s) {
      var b = elt('button', 'chip', s.label); b.type = 'button'; b.dataset.id = s.id;
      b.setAttribute('aria-pressed', String(state.seqId === s.id));
      b.addEventListener('click', function () { state.seqId = s.id; store.set('seqId', s.id); $('seq-input').value = ''; renderInduction(); });
      box.appendChild(b);
    });
    var cb = elt('button', 'chip', '＋ 自訂重複序列'); cb.type = 'button'; cb.dataset.id = 'custom';
    cb.setAttribute('aria-pressed', String(state.seqId === 'custom'));
    cb.addEventListener('click', function () { $('seq-input').focus(); });
    box.appendChild(cb);
  }

  function renderInduction() {
    Array.prototype.forEach.call($('seq-chips').children, function (c) { c.setAttribute('aria-pressed', String(c.dataset.id === state.seqId)); });
    var toks = currentSeq();
    curInd = CORE.inductionRun(toks);
    var r = curInd, n = r.n;
    // 序列 chips
    var seq = $('ind-seq'); seq.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var chip = elt('div', 'seqtok'); chip.dataset.idx = i;
      if (i === r.queryPos) chip.classList.add('q');
      if (i === r.prevOcc) chip.classList.add('occ');
      if (i === r.succPos) chip.classList.add('succ');
      var main = elt('span', 'seqtok-main', r.tokens[i]);
      var prev = elt('span', 'seqtok-prev', i >= 1 ? '前字·' + r.prevTok[i] : '—');
      chip.appendChild(main); chip.appendChild(prev);
      seq.appendChild(chip);
    }
    // 預測長條
    var pred = $('ind-pred'); pred.innerHTML = '';
    var order = r.predDist.map(function (v, k) { return { v: v, k: k }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6);
    order.forEach(function (o) {
      var li = elt('li', 'pred-item' + (o.k === r.predIdx ? ' win' : ''));
      var lab = elt('span', 'pred-key', r.vocab[o.k]);
      var bw = elt('span', 'pred-bar'); var bf = elt('span', 'pred-fill'); bf.style.transform = 'scaleX(' + o.v.toFixed(3) + ')'; bw.appendChild(bf);
      var val = elt('span', 'pred-val', pct(o.v) + '%');
      li.appendChild(lab); li.appendChild(bw); li.appendChild(val); pred.appendChild(li);
    });
    // 說明句
    var cur = r.tokens[r.queryPos];
    if (r.prevOcc >= 0 && r.succPos >= 0) {
      $('ind-explain').innerHTML = '目前 token 是「<b>' + cur + '</b>」。歸納頭回頭找上一個「' + cur + '」（第 ' + (r.prevOcc + 1) + ' 格），看它後面接的是「<b>' + r.tokens[r.succPos] + '</b>」，於是預測下一個字＝「<b>' + r.predTok + '</b>」，信心 ' + pct(r.confidence) + '%。這就是在上下文裡「複製」。';
    } else {
      $('ind-explain').innerHTML = '目前 token 是「<b>' + cur + '</b>」，但它在前文沒有出現過，歸納頭找不到可複製的後繼——換一個「有重複」的序列才看得到電路發動。';
    }
    $('ind-status').textContent = '序列 ' + r.tokens.join(' ') + '，歸納頭預測下一個字是「' + r.predTok + '」，信心 ' + pct(r.confidence) + '%。';
    drawIndArcs();
  }

  function drawIndArcs() {
    if (!curInd) return;
    var svg = $('ind-svg'), wrap = $('ind-seq-wrap'), seq = $('ind-seq');
    var chips = seq.querySelectorAll('.seqtok');
    if (!chips.length) { svg.innerHTML = ''; return; }
    var wrapRect = wrap.getBoundingClientRect();
    var yTop = chips[0].getBoundingClientRect().top - wrapRect.top;
    function cx(idx) { var rr = chips[idx].getBoundingClientRect(); return rr.left - wrapRect.left + rr.width / 2; }
    var r = curInd, qi = r.queryPos, W = r.A2[qi];
    var parts = ['<defs><linearGradient id="indgrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7a9c"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>'];
    var order = W.map(function (v, j) { return { v: v, j: j }; }).sort(function (a, b) { return a.v - b.v; });
    order.forEach(function (o) {
      if (o.v < 0.05) return;
      var x1 = cx(qi), x2 = cx(o.j), lift = Math.min(84, 30 + Math.abs(x2 - x1) * 0.3);
      var d = 'M' + x1 + ',' + yTop + ' Q' + ((x1 + x2) / 2) + ',' + (yTop - lift) + ' ' + x2 + ',' + yTop;
      parts.push('<path d="' + d + '" fill="none" stroke="url(#indgrad)" stroke-width="' + (1.5 + o.v * 7).toFixed(2) + '" stroke-linecap="round" opacity="' + (0.2 + o.v * 0.78).toFixed(3) + '"/>');
      parts.push('<circle cx="' + x2 + '" cy="' + yTop + '" r="' + (2.5 + o.v * 4).toFixed(2) + '" fill="#ff7a9c" opacity="' + (0.35 + o.v * 0.65).toFixed(2) + '"/>');
    });
    svg.innerHTML = parts.join('');
    if (!reduce) { svg.classList.remove('fade'); void svg.offsetWidth; svg.classList.add('fade'); }
  }

  /* ============ 事件接線 ============ */
  // 句子自訂輸入
  var sentTimer = 0;
  $('sent-input').addEventListener('input', function () {
    state.customText = this.value; store.set('customText', this.value);
    if (this.value.trim()) { state.exampleId = 'custom'; store.set('exampleId', 'custom'); }
    clearTimeout(sentTimer); sentTimer = setTimeout(onSentenceChange, 180);
  });
  // 頭切換
  Array.prototype.forEach.call($('head-tabs').children, function (b) {
    b.addEventListener('click', function () { state.headId = b.dataset.head; store.set('headId', state.headId); state.queryIdx = clamp(defaultQuery(curSent, state.headId), 0, curSent.tokens.length - 1); renderHead(); });
    b.addEventListener('keydown', function (e) {
      var tabs = Array.prototype.slice.call($('head-tabs').children), idx = tabs.indexOf(b);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); tabs[(idx + 1) % tabs.length].click(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); tabs[(idx - 1 + tabs.length) % tabs.length].click(); }
    });
  });
  // 縮放開關
  $('scale-toggle').addEventListener('change', function () { state.scale = this.checked; store.set('scale', state.scale); renderHead(); });
  // induction 自訂
  var seqTimer = 0;
  $('seq-input').addEventListener('input', function () {
    state.customSeq = this.value; store.set('customSeq', this.value);
    if (this.value.trim()) { state.seqId = 'custom'; store.set('seqId', 'custom'); }
    clearTimeout(seqTimer); seqTimer = setTimeout(renderInduction, 180);
  });
  // resize 重畫連線（throttle via rAF，分頁隱藏時不畫）
  var rz = 0;
  window.addEventListener('resize', function () { if (rz) return; rz = requestAnimationFrame(function () { rz = 0; if (!document.hidden) { drawHeadArcs(); drawIndArcs(); } }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { drawHeadArcs(); drawIndArcs(); } });

  /* ============ 開機 ============ */
  renderExampleChips();
  renderSeqChips();
  onSentenceChange();
  renderInduction();
  // 首屏動畫跑完後再校正一次連線座標
  setTimeout(function () { drawHeadArcs(); drawIndArcs(); }, reduce ? 0 : 900);
})(typeof globalThis !== 'undefined' ? globalThis : this);

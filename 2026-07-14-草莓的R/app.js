/* =====================================================================
 * 草莓的 R · BPE Tokenizer 遊樂場
 * 純 JS，零外部資源。當場訓練 BPE、切分、數 r。
 * BPE 演算法與 GPT 用的同一套：統計最高頻相鄰 pair → 合併 → 重複。
 * ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 小工具 ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var LS = 'tok.';
  function lsGet(k, d) { try { var v = localStorage.getItem(LS + k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) {} }

  var SEP = '\u0001'; // pair key 分隔字元（不會出現在正常文字裡）

  /* ---------------- 內建語料 ---------------- */
  // 英文語料刻意含大量 straw / berry / raw / 常見子詞，讓 strawberry 切成漂亮的碎片。
  var CORPORA = {
    en: {
      name: '英文',
      text: 'the strawberry is a small red berry. i love strawberries and raspberries and blueberries. ' +
        'a strawberry grows on straw in the summer sun. raw sugar, raw honey, a raw deal. ' +
        'she saw the straw and the raw berry by the river. berries and berries and more berries. ' +
        'learning to read and learning to write and learning to count letters one by one. ' +
        'running and reading and writing and singing and counting, again and again and again. ' +
        'the quick brown fox jumps over the lazy dog near the strawberry farm every morning. ' +
        'tokens are little pieces of text. a token is not a letter. models read tokens, not letters. ' +
        'the cat sat on the mat. the rat ran to the bat. the fat cat sat and sat and sat. ' +
        'international transportation information, unbelievable, understanding, reconstruction. ' +
        'strawberry strawberries straw berry berries raw raspberry blueberry cranberry blackberry.'
    },
    zh: {
      name: '中文',
      text: '草莓是一種紅色的小漿果。我很喜歡吃草莓，也喜歡藍莓和覆盆莓。' +
        '夏天的草莓最甜，草莓園裡到處都是草莓。你數得出草莓有幾個字嗎？' +
        '語言模型看到的不是字，是一塊一塊的 token。token 不是字母，模型讀的是 token。' +
        '學習、閱讀、書寫、計數，一次又一次，一遍又一遍。' +
        '一隻貓坐在墊子上，一隻老鼠跑向蝙蝠。紅紅的草莓長在夏天的陽光下。' +
        '草莓草莓草莓，漿果漿果漿果，甜甜的草莓和甜甜的漿果。'
    },
    mix: {
      name: '中英混合＋emoji',
      text: 'i love 草莓 strawberry 🍓 so much! 我愛 strawberry 和 草莓。' +
        'tokens token 詞元 切分 subword 子詞 🍓🍓🍓 raw straw berry 漿果。' +
        'the model reads tokens 模型讀的是 token 不是 letter 字母。' +
        'strawberry 草莓 raspberry 覆盆莓 blueberry 藍莓 🍓 sweet 甜 red 紅。' +
        'again 再一次 again 再一次 count 數 letters 字母 r r r 🍓.'
    },
    code: {
      name: '程式碼',
      text: 'function countLetters(word) {\n  let count = 0;\n  for (const ch of word) {\n    if (ch === "r") count = count + 1;\n  }\n  return count;\n}\n' +
        'const berries = ["strawberry", "raspberry", "blueberry"];\n' +
        'for (const berry of berries) { console.log(berry, countLetters(berry)); }\n' +
        'const tokens = tokenizer.encode("strawberry"); // tokens, not letters\n' +
        'function encode(text) { return bpe.merge(text); }\n' +
        'let total = 0; for (let i = 0; i < berries.length; i = i + 1) { total = total + 1; }'
    }
  };

  /* ---------------- 字元分類與前置切分 ---------------- */
  // 用 code point 正確處理（含 surrogate pair / emoji）。
  function classOf(cp) {
    if (cp === ' ' || cp === '\t' || cp === '\n' || cp === '\r' || cp === '\f') return 'ws';
    var c = cp.codePointAt(0);
    if (c >= 48 && c <= 57) return 'num';
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return 'lat';
    if (c >= 0xC0 && c <= 0x24F) return 'lat';           // 拉丁擴充字母
    if (c >= 0x3040 && c <= 0x30FF) return 'cjk';        // 日文假名
    if (c >= 0x3400 && c <= 0x9FFF) return 'cjk';        // CJK 統一表意文字
    if (c >= 0xF900 && c <= 0xFAFF) return 'cjk';        // CJK 相容
    if (c >= 0x20000 && c <= 0x2FA1F) return 'cjk';      // 擴充 B~
    return 'sym';                                        // 標點、emoji、其它符號各自成詞
  }

  // 把文字切成「詞」的陣列；每個詞是 code point 字串的陣列。
  // 規則：空白往「後」黏（GPT 風格：" cat" 的空白屬於下一個 token）；
  //       lat/num/cjk 同類相連成一個詞；sym（含 emoji）各自單獨成詞。
  // 保證：所有詞串接起來 === 原文（無損，含空白）。
  function preTokenize(text) {
    var cps = Array.from(text);
    var words = [];
    var pendingWs = [];
    var cur = null, curClass = null;
    function flush() { if (cur) { words.push(cur); cur = null; curClass = null; } }
    function drainWs(arr) { for (var i = 0; i < pendingWs.length; i++) arr.push(pendingWs[i]); pendingWs = []; }
    for (var i = 0; i < cps.length; i++) {
      var cp = cps[i], cl = classOf(cp);
      if (cl === 'ws') { flush(); pendingWs.push(cp); continue; }
      if (cl === 'sym') {
        flush();
        var w = []; drainWs(w); w.push(cp); words.push(w);
        continue;
      }
      if (cur && curClass === cl) { cur.push(cp); }
      else { flush(); cur = []; drainWs(cur); cur.push(cp); curClass = cl; }
    }
    flush();
    if (pendingWs.length) { words.push(pendingWs.slice()); pendingWs = []; }
    return words;
  }

  /* ---------------- BPE 訓練狀態機 ---------------- */
  function createTrainer(text, maxMerges) {
    var words = preTokenize(text);
    // 頻率壓縮：相同的詞只存一份 + 次數（效能關鍵，上萬字也順）
    var map = new Map();
    var baseSet = new Set();
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      for (var j = 0; j < w.length; j++) baseSet.add(w[j]);
      var key = w.join(SEP);
      var e = map.get(key);
      if (e) e.count++;
      else map.set(key, { syms: w.slice(), count: 1 });
    }
    var base = Array.from(baseSet).sort(function (a, b) { return a.codePointAt(0) - b.codePointAt(0); });
    return {
      entries: Array.from(map.values()),
      base: base,
      merges: [],          // { a, b, ab, count, index }
      maxMerges: maxMerges,
      charCount: Array.from(text).length,
      done: false
    };
  }

  // 走一步合併：回傳該次合併紀錄，或 null（沒得合併了）。
  function mergeStep(state) {
    if (state.merges.length >= state.maxMerges) { state.done = true; return null; }
    // 統計所有相鄰 pair 的加權次數；用 [a,b,count] 存，避免拆 key（對任意字元都安全）
    var pairs = new Map();
    var best = null;
    for (var qi = 0; qi < state.entries.length; qi++) {
      var qs = state.entries[qi].syms, qc = state.entries[qi].count;
      for (var qj = 0; qj < qs.length - 1; qj++) {
        var qk = qs[qj] + SEP + qs[qj + 1];
        var pr = pairs.get(qk);
        if (pr) { pr[2] += qc; } else { pr = [qs[qj], qs[qj + 1], qc]; pairs.set(qk, pr); }
        if (!best || pr[2] > best[2]) best = pr;
      }
    }
    if (!best || best[2] < 2) { state.done = true; return null; }
    var A = best[0], B = best[1], AB = A + B;
    for (var i = 0; i < state.entries.length; i++) {
      var s = state.entries[i].syms;
      if (s.length < 2) continue;
      var ns = [], p = 0;
      while (p < s.length) {
        if (p < s.length - 1 && s[p] === A && s[p + 1] === B) { ns.push(AB); p += 2; }
        else { ns.push(s[p]); p++; }
      }
      state.entries[i].syms = ns;
    }
    var rec = { a: A, b: B, ab: AB, count: best[2], index: state.merges.length };
    state.merges.push(rec);
    return rec;
  }

  // 訓練完 → 建出 tokenizer（詞表 + 合併優先序 ranks）
  function buildTokenizer(state) {
    var vocabList = state.base.slice();
    var idOf = new Map();
    for (var i = 0; i < vocabList.length; i++) idOf.set(vocabList[i], i);
    var ranks = new Map();
    for (var m = 0; m < state.merges.length; m++) {
      var rec = state.merges[m];
      ranks.set(rec.a + SEP + rec.b, rec.index);
      if (!idOf.has(rec.ab)) { idOf.set(rec.ab, vocabList.length); vocabList.push(rec.ab); }
    }
    return {
      vocabList: vocabList, idOf: idOf, ranks: ranks,
      baseSize: state.base.length,
      mergeCount: state.merges.length,
      trainedSize: vocabList.length   // 訓練後詞表大小（不含 encode 時臨時擴充）
    };
  }

  /* ---------------- 切分（encode） ---------------- */
  // 對一個詞套用合併：每次挑「學到最早（rank 最小）」的可合併 pair，直到不能再合。
  function encodeWord(syms, tok) {
    var parts = syms.slice();
    while (parts.length > 1) {
      var bestRank = Infinity, bestI = -1;
      for (var i = 0; i < parts.length - 1; i++) {
        var r = tok.ranks.get(parts[i] + SEP + parts[i + 1]);
        if (r !== undefined && r < bestRank) { bestRank = r; bestI = i; }
      }
      if (bestI < 0) break;
      parts.splice(bestI, 2, parts[bestI] + parts[bestI + 1]);
    }
    return parts;
  }

  function encode(text, tok) {
    var words = preTokenize(text);
    var cache = new Map();
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var key = words[i].join(SEP);
      var parts = cache.get(key);
      if (!parts) { parts = encodeWord(words[i], tok); cache.set(key, parts); }
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        var id = tok.idOf.get(p);
        if (id === undefined) { id = tok.vocabList.length; tok.idOf.set(p, id); tok.vocabList.push(p); } // OOV 基本字元臨時給 id
        out.push({ text: p, id: id });
      }
    }
    return out;
  }

  /* 匯出給 node 測試腳本用（瀏覽器下無害） */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { preTokenize: preTokenize, createTrainer: createTrainer, mergeStep: mergeStep, buildTokenizer: buildTokenizer, encode: encode, encodeWord: encodeWord, CORPORA: CORPORA };
  }

  /* 若不在瀏覽器（node 測試）就到此為止 */
  if (typeof document === 'undefined') return;

  /* ================================================================
   *  以下為瀏覽器 UI
   * ================================================================ */

  /* reduced-motion：動態監聽 change */
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mqReduce.matches;
  function applyReduce() { document.documentElement.classList.toggle('reduce-motion', reduce); }
  function onReduceChange(e) { reduce = e.matches; applyReduce(); }
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduceChange);
  else if (mqReduce.addListener) mqReduce.addListener(onReduceChange);
  applyReduce();

  var currentTok = null;

  /* ---- 數字滾動（rAF 一次性，非迴圈） ---- */
  function rollNumber(el, to) {
    var from = parseFloat(el.getAttribute('data-v')) || 0;
    el.setAttribute('data-v', to);
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    var dur = 480, t0 = performance.now();
    function frame(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(frame);
      else el.textContent = fmt(to);
    }
    requestAnimationFrame(frame);
  }
  function fmt(n) { return (typeof n === 'number' && n >= 1000) ? n.toLocaleString('en-US') : String(n); }

  /* ---- token 色塊渲染 ---- */
  function hueOf(id) { return Math.round((id * 137.508) % 360); }
  function displayText(t) {
    // 讓空白 / 換行看得見，但底層字串不變（無損）
    return t.replace(/ /g, '·').replace(/\n/g, '↵').replace(/\t/g, '→');
  }
  function isWhitespaceTok(t) { return /^\s+$/.test(t); }

  function renderTokens(container, tokens, opts) {
    opts = opts || {};
    container.textContent = '';
    var frag = document.createDocumentFragment();
    var stagger = reduce ? 0 : Math.min(28, 420 / Math.max(1, tokens.length));
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var chip = document.createElement('span');
      chip.className = 'tok' + (isWhitespaceTok(t.text) ? ' is-space' : '');
      chip.style.setProperty('--h', hueOf(t.id));
      if (!reduce) chip.style.setProperty('--d', Math.round(i * stagger) + 'ms');
      var txt = document.createElement('span');
      txt.className = 'ttext';
      txt.textContent = displayText(t.text);
      chip.appendChild(txt);
      if (!opts.mini) {
        var idEl = document.createElement('span');
        idEl.className = 'tid';
        idEl.textContent = t.id;
        chip.appendChild(idEl);
        chip.title = 'token「' + t.text + '」· id ' + t.id;
      }
      frag.appendChild(chip);
    }
    container.appendChild(frag);
  }

  /* ================= 訓練區 ================= */
  var trainState = null, trainRAF = 0, trainPaused = false, training = false;
  var el = {
    corpusPicker: $('#corpusPicker'), customCorpus: $('#customCorpus'), corpusMeta: $('#corpusMeta'),
    mergeSlider: $('#mergeSlider'), mergeVal: $('#mergeVal'), trainBtn: $('#trainBtn'),
    trainBar: $('#trainBar'), trainStatus: $('#trainStatus'), mergeLog: $('#mergeLog'),
    statBase: $('#statBase'), statMerges: $('#statMerges'), statVocab: $('#statVocab'), statChars: $('#statChars')
  };

  var selectedCorpus = lsGet('corpus', 'en');
  function buildCorpusPicker() {
    var keys = Object.keys(CORPORA);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio');
      b.dataset.key = k; b.textContent = CORPORA[k].name;
      b.setAttribute('aria-checked', k === selectedCorpus ? 'true' : 'false');
      el.corpusPicker.appendChild(b);
    }
    el.corpusPicker.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      selectCorpus(b.dataset.key);
    });
    el.corpusPicker.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var btns = Array.prototype.slice.call(el.corpusPicker.querySelectorAll('button'));
      var idx = btns.indexOf(document.activeElement);
      if (idx < 0) return;
      e.preventDefault();
      var next = (idx + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length;
      btns[next].focus(); selectCorpus(btns[next].dataset.key);
    });
  }
  function selectCorpus(k) {
    if (!CORPORA[k]) return;
    selectedCorpus = k; lsSet('corpus', k);
    var btns = el.corpusPicker.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-checked', btns[i].dataset.key === k ? 'true' : 'false');
    updateCorpusMeta();
  }
  function activeCorpusText() {
    var custom = el.customCorpus.value.trim();
    if (custom.length >= 12) return custom;    // 有貼夠長的自訂文字就用它
    return CORPORA[selectedCorpus].text;
  }
  function updateCorpusMeta() {
    var custom = el.customCorpus.value.trim();
    if (custom.length >= 12) el.corpusMeta.textContent = '使用自訂語料：' + Array.from(custom).length + ' 字元';
    else if (custom.length > 0) el.corpusMeta.textContent = '自訂語料太短（至少 12 字），先用「' + CORPORA[selectedCorpus].name + '」內建語料。';
    else el.corpusMeta.textContent = '目前使用「' + CORPORA[selectedCorpus].name + '」內建語料。';
  }

  function setMergeFill() {
    var pct = (el.mergeSlider.value - el.mergeSlider.min) / (el.mergeSlider.max - el.mergeSlider.min) * 100;
    el.mergeSlider.style.setProperty('--fill', pct + '%');
  }

  function startTraining() {
    if (training) { trainPaused = false; return; }
    cancelAnimationFrame(trainRAF);
    var text = activeCorpusText();
    var maxMerges = parseInt(el.mergeSlider.value, 10);
    trainState = createTrainer(text, maxMerges);
    training = true; trainPaused = false;
    el.trainBtn.disabled = true;
    el.mergeLog.textContent = '';
    el.trainStatus.textContent = '開始訓練，語料 ' + trainState.charCount + ' 字元，目標合併 ' + maxMerges + ' 次⋯';
    rollNumber(el.statBase, trainState.base.length);
    rollNumber(el.statChars, trainState.charCount);
    rollNumber(el.statMerges, 0);
    rollNumber(el.statVocab, trainState.base.length);
    if (maxMerges === 0) { finishTraining(); return; }
    stepLoop();
  }

  function stepLoop() {
    if (trainPaused) return;
    var start = performance.now(), did = 0;
    while (performance.now() - start < 8 && !trainState.done && did < 60) {
      var rec = mergeStep(trainState);
      if (!rec) break;
      appendMergeRow(rec);
      did++;
    }
    var prog = trainState.maxMerges ? trainState.merges.length / trainState.maxMerges : 1;
    el.trainBar.style.transform = 'scaleX(' + Math.min(1, prog) + ')';
    el.statMerges.textContent = String(trainState.merges.length);
    el.statVocab.textContent = String(trainState.base.length + trainState.merges.length);
    if (!trainState.done) { trainRAF = requestAnimationFrame(stepLoop); }
    else { finishTraining(); }
  }

  function appendMergeRow(rec) {
    // 只保留最近 ~160 列 DOM，避免大量合併塞爆
    while (el.mergeLog.childElementCount > 160) el.mergeLog.removeChild(el.mergeLog.firstChild);
    var li = document.createElement('li');
    if (!reduce) li.className = 'enter';
    li.innerHTML =
      '<span class="ml-idx">#' + (rec.index + 1) + '</span>' +
      '<span class="ml-pair"><span class="ml-tok">' + esc(displayText(rec.a)) + '</span>' +
      '<span class="ml-plus">＋</span><span class="ml-tok">' + esc(displayText(rec.b)) + '</span>' +
      '<span class="ml-arrow">→</span><span class="ml-res">' + esc(displayText(rec.ab)) + '</span></span>' +
      '<span class="ml-count">' + rec.count + ' 次</span>';
    el.mergeLog.appendChild(li);
    el.mergeLog.scrollTop = el.mergeLog.scrollHeight;
  }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); }

  function finishTraining() {
    training = false;
    el.trainBtn.disabled = false;
    el.trainBar.style.transform = 'scaleX(1)';
    var vocabSize = trainState.base.length + trainState.merges.length;
    rollNumber(el.statMerges, trainState.merges.length);
    rollNumber(el.statVocab, vocabSize);
    var note = trainState.merges.length < trainState.maxMerges ? '（語料已無更多重複的相鄰對，提早收斂）' : '';
    el.trainStatus.textContent = '訓練完成：' + trainState.merges.length + ' 次合併，詞表 ' + vocabSize + ' 個 token。' + note;
    if (el.mergeLog.childElementCount === 0) {
      var li = document.createElement('li'); li.className = 'ml-empty';
      li.textContent = '這份設定沒有產生任何合併（合併次數設為 0，或語料沒有重複的相鄰對）。';
      el.mergeLog.appendChild(li);
    }
    currentTok = buildTokenizer(trainState);
    refreshAllOutputs();
  }

  /* visibilitychange：分頁隱藏時暫停訓練 rAF，回來再續（動畫紀律） */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (training) { trainPaused = true; cancelAnimationFrame(trainRAF); }
    } else {
      if (training && trainPaused) { trainPaused = false; stepLoop(); }
    }
  });

  /* ================= 切分區 ================= */
  var elSeg = { input: $('#segInput'), out: $('#segTokens'), tok: $('#segTokCount'), chr: $('#segCharCount'), ratio: $('#segRatio') };
  var segRAF = 0;
  function updateSegment() {
    if (!currentTok) return;
    cancelAnimationFrame(segRAF);
    segRAF = requestAnimationFrame(function () {
      var text = elSeg.input.value;
      var toks = encode(text, currentTok);
      renderTokens(elSeg.out, toks, {});
      var chars = Array.from(text).length;
      elSeg.tok.textContent = toks.length;
      elSeg.chr.textContent = chars;
      elSeg.ratio.textContent = toks.length ? (chars / toks.length).toFixed(1) : '0.0';
    });
  }

  /* ================= 數 r 小遊戲 ================= */
  var elR = { word: $('#rWord'), letters: $('#rLetters'), tokens: $('#rTokens'), count: $('#rCount'), tokCount: $('#rTokCount'), punch: $('#rPunch') };
  function updateRGame() {
    if (!currentTok) return;
    var word = elR.word.value;
    var cps = Array.from(word);
    // 字元視角
    elR.letters.textContent = '';
    var frag = document.createDocumentFragment();
    var rN = 0, stag = reduce ? 0 : Math.min(26, 380 / Math.max(1, cps.length));
    for (var i = 0; i < cps.length; i++) {
      var isR = cps[i].toLowerCase() === 'r';
      if (isR) rN++;
      var d = document.createElement('span');
      d.className = 'ltr' + (isR ? ' isr' : '');
      if (!reduce) d.style.setProperty('--d', Math.round(i * stag) + 'ms');
      d.textContent = cps[i] === ' ' ? '·' : cps[i];
      frag.appendChild(d);
    }
    elR.letters.appendChild(frag);
    rollNumber(elR.count, rN);
    // token 視角
    var toks = encode(word, currentTok);
    renderTokens(elR.tokens, toks, { mini: false });
    rollNumber(elR.tokCount, toks.length);
    // 結語
    var msg;
    if (cps.length === 0) msg = '打幾個字看看⋯';
    else if (rN === 0) msg = '這個字沒有 r。但重點是：模型看到 ' + toks.length + ' 個 id，它連要找什麼都不知道。';
    else msg = '你一眼看到 ' + rN + ' 個 r；模型只有 ' + toks.length + ' 個不透明 token——字母被封在裡面，它要怎麼數？';
    elR.punch.textContent = msg;
  }

  /* ================= 語言成本對照 ================= */
  var elLC = {
    enText: $('#lcEnText'), zhText: $('#lcZhText'),
    enTok: $('#lcEnTokens'), zhTok: $('#lcZhTokens'),
    enTokN: $('#lcEnTok'), zhTokN: $('#lcZhTok'), enChar: $('#lcEnChar'), zhChar: $('#lcZhChar')
  };
  function updateLangCompare() {
    if (!currentTok) return;
    var en = elLC.enText.textContent, zh = elLC.zhText.textContent;
    var te = encode(en, currentTok), tz = encode(zh, currentTok);
    renderTokens(elLC.enTok, te, { mini: true });
    renderTokens(elLC.zhTok, tz, { mini: true });
    rollNumber(elLC.enTokN, te.length); rollNumber(elLC.zhTokN, tz.length);
    elLC.enChar.textContent = Array.from(en).length;
    elLC.zhChar.textContent = Array.from(zh).length;
  }

  function refreshAllOutputs() { updateSegment(); updateRGame(); updateLangCompare(); updateHeroFromTok(); }

  /* ================= glitch specimens ================= */
  var GLITCH = [
    { t: ' SolidGoldMagikarp', n: '最有名的一個。來自 Reddit「r/counting」數數版一位使用者的名稱，被模型讀出時常變成「distribute」。' },
    { t: ' petertodd', n: '行為最詭異者之一，會吐出陰暗、破碎、近乎胡言亂語的字串，讓研究者印象深刻。' },
    { t: ' TheNitromeFan', n: '同樣來自 r/counting。要模型複述時，它常固執地回答「182」。' },
    { t: ' davidjl', n: 'Reddit 使用者 davidjl123 的名稱被切分殘留下來的碎片，也成了幽靈 token。' },
    { t: 'cloneembedreportprint', n: '像是從程式碼或網頁模板爬來的殘料，在正常文字裡幾乎不會出現。' },
    { t: ' guiActiveUn', n: '爬蟲殘料型的 token，被模型讀成毫不相干的「reception」。' }
  ];
  function buildSpecimens() {
    var grid = $('#specimenGrid'); if (!grid) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < GLITCH.length; i++) {
      var card = document.createElement('div'); card.className = 'specimen';
      var tk = document.createElement('code'); tk.className = 'spec-token'; tk.textContent = GLITCH[i].t;
      var nt = document.createElement('p'); nt.className = 'spec-note'; nt.textContent = GLITCH[i].n;
      card.appendChild(tk); card.appendChild(nt); frag.appendChild(card);
    }
    grid.appendChild(frag);
  }

  /* ================= Hero 迷你示範 ================= */
  function buildHero() {
    var word = 'strawberry';
    var lt = $('#heroLetters'), tk = $('#heroTokens');
    if (lt) {
      var cps = Array.from(word), frag = document.createDocumentFragment();
      for (var i = 0; i < cps.length; i++) {
        var s = document.createElement('span');
        s.className = 'ltr' + (cps[i] === 'r' ? ' isr' : '');
        s.textContent = cps[i]; frag.appendChild(s);
      }
      lt.appendChild(frag);
    }
    // hero 的 token 示範用一個固定 demo 切法（等訓練好會被真結果取代）
    if (tk) renderHeroTokens(tk, [{ text: 'st', id: 5 }, { text: 'raw', id: 42 }, { text: 'berry', id: 88 }]);
  }
  function renderHeroTokens(container, toks) {
    container.textContent = '';
    for (var i = 0; i < toks.length; i++) {
      var chip = document.createElement('span');
      chip.className = 'tok'; chip.style.setProperty('--h', hueOf(toks[i].id));
      var t = document.createElement('span'); t.textContent = toks[i].text; chip.appendChild(t);
      var id = document.createElement('span'); id.className = 'tid'; id.textContent = toks[i].id; chip.appendChild(id);
      container.appendChild(chip);
    }
  }
  function updateHeroFromTok() {
    if (!currentTok) return;
    var tk = $('#heroTokens'); if (!tk) return;
    renderTokens(tk, encode('strawberry', currentTok), {});
  }

  /* ================= 進場動畫（IntersectionObserver） ================= */
  function setupReveal() {
    var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); }); return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ================= 綁定事件 ================= */
  function init() {
    buildCorpusPicker();
    buildSpecimens();
    buildHero();
    setupReveal();

    // 還原 localStorage
    var savedMerges = lsGet('merges', '90');
    el.mergeSlider.value = savedMerges; el.mergeVal.textContent = savedMerges; setMergeFill();
    var savedCustom = lsGet('customCorpus', '');
    if (savedCustom) el.customCorpus.value = savedCustom;
    var savedSeg = lsGet('segText', null);
    if (savedSeg !== null) elSeg.input.value = savedSeg;
    var savedR = lsGet('rWord', null);
    if (savedR !== null) elR.word.value = savedR;
    updateCorpusMeta();

    el.mergeSlider.addEventListener('input', function () {
      el.mergeVal.textContent = el.mergeSlider.value; setMergeFill(); lsSet('merges', el.mergeSlider.value);
    });
    el.customCorpus.addEventListener('input', function () { updateCorpusMeta(); lsSet('customCorpus', el.customCorpus.value); });
    el.trainBtn.addEventListener('click', startTraining);

    elSeg.input.addEventListener('input', function () { lsSet('segText', elSeg.input.value); updateSegment(); });
    elR.word.addEventListener('input', function () { lsSet('rWord', elR.word.value); updateRGame(); });

    // 首次自動訓練，讓頁面一載入就是活的（訓練完 refreshAllOutputs 會更新所有輸出，含 hero）
    startTraining();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

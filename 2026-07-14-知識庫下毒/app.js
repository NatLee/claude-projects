/* 知識庫下毒・PoisonedRAG 實驗室
 * 純前端、零外部資源、不呼叫任何 AI。
 * 檢索：正確實作的 BM25 與 TF-IDF 餘弦相似度。
 * 生成：抽取式（挑最相關文件裡最相關的句子），刻意如此以凸顯「答案取決於檢索到什麼」。
 * localStorage 前綴一律 poison.
 */
(function () {
  'use strict';

  var LS_KEY = 'poison.lab.v1';
  var LS_MOTION = 'poison.reducedMotion';

  /* ---------- 種子知識庫（虛構「霧島珈琲」M1 手沖機 FAQ，無害情境） ---------- */
  var SEED_DOCS = [
    { id: 'd_ret1',  title: '退貨鑑賞期', text: '霧島 M1 的退貨期限為 7 天，自簽收日起算，包裝完整即可於鑑賞期內申請退貨。' },
    { id: 'd_ret2',  title: '退貨須知',   text: '退貨期限（鑑賞期）為 7 天，逾期恕不受理；鑑賞期並非試用期。' },
    { id: 'd_refund',title: '退款作業',   text: '退貨核准後，退款約 7 至 14 個工作天退回原付款方式。' },
    { id: 'd_exch',  title: '換貨政策',   text: '非人為損壞於 30 天內可申請換貨一次。' },
    { id: 'd_temp1', title: '建議水溫',   text: '霧島 M1 建議手沖水溫為 92 度，淺焙可略微調降。' },
    { id: 'd_temp2', title: '沖煮參數',   text: '霧島 M1 出廠預設水溫 92 度，粉水比約 1 比 15。' },
    { id: 'd_temp3', title: '水溫與風味', text: '水溫維持在 90 至 94 度之間較能平衡萃取。' },
    { id: 'd_warm',  title: '保溫功能',   text: '沖煮完成後保溫盤維持約 30 分鐘後自動斷電。' },
    { id: 'd_warr1', title: '保固期限',   text: '霧島 M1 提供兩年（24 個月）原廠保固，人為損壞不在保固範圍。' },
    { id: 'd_warr2', title: '保固說明',   text: '主機保固 24 個月，配件保固 6 個月。' },
    { id: 'd_warr3', title: '保固登錄',   text: '於官網登錄序號可延長保固 6 個月。' },
    { id: 'd_bean',  title: '建議豆量',   text: '單杯建議使用 15 克咖啡豆，粉水比約 1 比 15。' },
    { id: 'd_grind', title: '研磨度',     text: '手沖建議中細研磨，約細砂糖顆粒大小。' },
    { id: 'd_clean', title: '清潔保養',   text: '每月以檸檬酸除鈣一次，維持水路暢通。' },
    { id: 'd_filter',title: '濾網更換',   text: '金屬濾網每 3 個月清潔或更換一次。' },
    { id: 'd_ble',   title: '連線方式',   text: '霧島 M1 支援藍牙 5.0，可用霧島 App 記錄沖煮參數。' },
    { id: 'd_fw',    title: '韌體更新',   text: '透過 App 可線上更新韌體，更新時請勿斷電。' },
    { id: 'd_cap',   title: '容量規格',   text: '水箱容量 600 毫升，一次最多沖煮 4 杯。' },
    { id: 'd_power', title: '耗電功率',   text: '加熱功率約 1000 瓦，待機耗電低於 1 瓦。' },
    { id: 'd_cs',    title: '客服管道',   text: '平日 9 至 18 點提供線上客服（此為示意，非真實聯絡方式）。' }
  ].map(function (d) { d.trusted = true; d.source = '官方手冊'; d.kind = 'clean'; return d; });

  /* ---------- 預設問題（含正解與攻擊目標，皆為無害內容） ---------- */
  var QUESTIONS = [
    { id: 'q_return', text: '霧島 M1 的退貨期限是幾天？',
      keywords: '霧島 M1 退貨 期限 幾天', target: '999 天', cleanLabel: '7 天',
      cleanNeedles: ['7 天', '7天'], poisonNeedles: ['999'],
      stealth: function (a) { return '霧島 M1 的退貨期限為 ' + a + '，自簽收日起算，包裝完整即可於鑑賞期內申請退貨。'; } },
    { id: 'q_temp', text: '霧島 M1 建議的手沖水溫是幾度？',
      keywords: '霧島 M1 手沖 水溫 幾度', target: '40 度', cleanLabel: '92 度',
      cleanNeedles: ['92'], poisonNeedles: ['40 度', '40度'],
      stealth: function (a) { return '霧島 M1 建議手沖水溫為 ' + a + '，淺焙可略微調降。'; } },
    { id: 'q_warranty', text: '霧島 M1 的保固期是多久？',
      keywords: '霧島 M1 保固 期 多久', target: '50 年', cleanLabel: '兩年（24 個月）',
      cleanNeedles: ['兩年', '24 個月', '24個月', '2 年', '2年'], poisonNeedles: ['50 年', '50年', '50'],
      stealth: function (a) { return '霧島 M1 提供 ' + a + '原廠保固，人為損壞不在保固範圍。'; } }
  ];

  /* 預設毒文件（keyword-stuffed：關鍵字硬塞，困惑度較高，會被過濾抓到）
   * 刻意寫成「單一句子」，讓抽取式生成挑到的就是含目標答案的這句。 */
  function presetPoisonText(q) {
    var kw = q.keywords;
    var val = q.target;
    return kw + ' ' + kw + '，正確答案是 ' + val + '，就是 ' + val + '。';
  }

  /* ---------- 工具：正規化與斷詞 ---------- */
  function normalize(s) {
    return String(s).toLowerCase()
      .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/　/g, ' ');
  }
  // 中文用字元 bigram、英數用整段 token（資訊檢索中對中文常見且正確的處理）
  function tokenize(s) {
    s = normalize(s);
    var tokens = [];
    var re = /[a-z0-9]+|[一-鿿]+/g, m;
    while ((m = re.exec(s))) {
      var seg = m[0];
      if (/[a-z0-9]/.test(seg[0])) { tokens.push(seg); }
      else if (seg.length === 1) { tokens.push(seg); }
      else { for (var i = 0; i < seg.length - 1; i++) tokens.push(seg.slice(i, i + 2)); }
    }
    return tokens;
  }
  function splitSentences(text) {
    var parts = String(text).split(/(?<=[。！？!?\n])/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (t) out.push(t);
    }
    return out.length ? out : [String(text).trim()];
  }

  /* ---------- 索引（df / idf / tf / 文件長度） ---------- */
  function buildIndex(docs) {
    var N = docs.length;
    var df = Object.create(null);
    var tf = Object.create(null);
    var len = Object.create(null);
    var toks = Object.create(null);
    var totalLen = 0;
    for (var i = 0; i < N; i++) {
      var d = docs[i];
      var t = tokenize(d.title + ' ' + d.text);
      toks[d.id] = t;
      len[d.id] = t.length;
      totalLen += t.length;
      var counts = Object.create(null);
      var seen = Object.create(null);
      for (var j = 0; j < t.length; j++) {
        var term = t[j];
        counts[term] = (counts[term] || 0) + 1;
        if (!seen[term]) { seen[term] = 1; df[term] = (df[term] || 0) + 1; }
      }
      tf[d.id] = counts;
    }
    var idf = Object.create(null);
    for (var term2 in df) {
      // 平滑 idf，保證非負：ln(1 + (N - df + 0.5)/(df + 0.5)) 供 BM25
      idf[term2] = Math.log(1 + (N - df[term2] + 0.5) / (df[term2] + 0.5));
    }
    var idfTfidf = Object.create(null);
    for (var term3 in df) {
      idfTfidf[term3] = Math.log((N + 1) / (df[term3] + 1)) + 1; // sklearn 式平滑 idf
    }
    return { N: N, df: df, idf: idf, idfTfidf: idfTfidf, tf: tf, len: len, avgdl: N ? totalLen / N : 0, toks: toks };
  }

  /* BM25（Okapi，k1=1.5, b=0.75） */
  var BM25_K1 = 1.5, BM25_B = 0.75;
  function bm25Score(index, doc, qTokens) {
    var counts = index.tf[doc.id] || {};
    var dl = index.len[doc.id] || 0;
    var avgdl = index.avgdl || 1;
    var score = 0;
    for (var i = 0; i < qTokens.length; i++) {
      var term = qTokens[i];
      var f = counts[term];
      if (!f) continue;
      var idf = index.idf[term] || 0;
      var denom = f + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl);
      score += idf * (f * (BM25_K1 + 1)) / denom;
    }
    return score;
  }

  /* TF-IDF 餘弦相似度（log-tf 加權，非負 → 0..1） */
  function tfidfVec(index, counts) {
    var v = Object.create(null), norm = 0;
    for (var term in counts) {
      var w = (1 + Math.log10(counts[term])) * (index.idfTfidf[term] || 0);
      v[term] = w; norm += w * w;
    }
    return { v: v, norm: Math.sqrt(norm) };
  }
  function cosineScore(index, doc, qCounts, qVec) {
    var dv = tfidfVec(index, index.tf[doc.id] || {});
    if (!dv.norm || !qVec.norm) return 0;
    var dot = 0;
    var small = Object.keys(qVec.v).length < Object.keys(dv.v).length ? qVec.v : dv.v;
    var other = small === qVec.v ? dv.v : qVec.v;
    for (var term in small) { if (other[term]) dot += small[term] * other[term]; }
    return dot / (dv.norm * qVec.norm);
  }
  function countTokens(tokens) {
    var c = Object.create(null);
    for (var i = 0; i < tokens.length; i++) c[tokens[i]] = (c[tokens[i]] || 0) + 1;
    return c;
  }

  /* 句子層級的餘弦（抽取式生成用；與檢索器選擇無關，固定用餘弦） */
  function sentenceScore(index, sentence, qCounts, qVec) {
    var counts = countTokens(tokenize(sentence));
    var dv = tfidfVec(index, counts);
    if (!dv.norm || !qVec.norm) return 0;
    var dot = 0;
    for (var term in qVec.v) { if (dv.v[term]) dot += qVec.v[term] * dv.v[term]; }
    return dot / (dv.norm * qVec.norm);
  }

  /* ---------- 困惑度過濾（字元 bigram 語言模型，僅用種子乾淨語料訓練） ---------- */
  var PPL = (function () {
    function chars(s) { return Array.from(normalize(s)); }
    var uni = Object.create(null), bi = Object.create(null), vocab = Object.create(null), V = 0;
    for (var i = 0; i < SEED_DOCS.length; i++) {
      var cs = chars(SEED_DOCS[i].title + '。' + SEED_DOCS[i].text);
      for (var j = 0; j < cs.length; j++) {
        var a = cs[j];
        if (!vocab[a]) { vocab[a] = 1; V++; }
        uni[a] = (uni[a] || 0) + 1;
        if (j > 0) { var key = cs[j - 1] + a; bi[key] = (bi[key] || 0) + 1; }
      }
    }
    function perplexity(text) {
      var cs = chars(text);
      if (cs.length < 2) return 1;
      var logp = 0, n = 0;
      for (var k = 1; k < cs.length; k++) {
        var prev = cs[k - 1], cur = cs[k];
        var bc = bi[prev + cur] || 0;
        var uc = uni[prev] || 0;
        var p = (bc + 1) / (uc + V); // add-1 平滑
        logp += Math.log(p); n++;
      }
      return Math.exp(-logp / n);
    }
    var vals = SEED_DOCS.map(function (d) { return perplexity(d.title + '。' + d.text); });
    var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    var variance = vals.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / vals.length;
    var std = Math.sqrt(variance);
    var threshold = mean + 2 * std; // 由乾淨語料的困惑度分佈決定
    return { perplexity: perplexity, threshold: threshold, mean: mean, std: std };
  })();

  /* ---------- 狀態 ---------- */
  var state = {
    userDocs: [],          // 使用者新增（可信文件 + 毒文件）
    retriever: 'bm25',     // 'bm25' | 'tfidf'
    k: 3,
    def: { whitelist: false, perplexity: false, majority: false },
    lastQuestion: ''
  };
  var EXPANSION = 3;       // 知識庫擴充：多取幾筆
  var motionForced = false;

  function allDocs() { return SEED_DOCS.concat(state.userDocs); }

  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        userDocs: state.userDocs, retriever: state.retriever, k: state.k,
        def: state.def, lastQuestion: state.lastQuestion
      }));
    } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (Array.isArray(s.userDocs)) state.userDocs = s.userDocs;
        if (s.retriever) state.retriever = s.retriever;
        if (typeof s.k === 'number') state.k = Math.min(6, Math.max(1, s.k));
        if (s.def) state.def = { whitelist: !!s.def.whitelist, perplexity: !!s.def.perplexity, majority: !!s.def.majority };
        if (typeof s.lastQuestion === 'string') state.lastQuestion = s.lastQuestion;
      }
      motionForced = localStorage.getItem(LS_MOTION) === '1';
    } catch (e) {}
  }

  /* ---------- 檢索 + 生成 ---------- */
  function resolveQuestion(text) {
    var t = String(text).trim();
    for (var i = 0; i < QUESTIONS.length; i++) {
      if (QUESTIONS[i].text === t) return QUESTIONS[i];
    }
    return { id: 'custom', text: t, custom: true };
  }

  function runRAG(text) {
    var q = resolveQuestion(text);
    var docs = allDocs();
    var index = buildIndex(docs);
    var qTokens = tokenize(q.text);
    var qCounts = countTokens(qTokens);
    var qVec = tfidfVec(index, qCounts);

    // 防禦：過濾候選池
    var filtered = [];
    var blocked = [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      var reasonBlock = null;
      // 來源白名單：只信任可信來源
      if (state.def.whitelist && !d.trusted) reasonBlock = 'whitelist';
      // 困惑度過濾：對所有候選量困惑度，異常（讀起來怪）者擋下
      else if (state.def.perplexity && PPL.perplexity(d.text) > PPL.threshold) reasonBlock = 'perplexity';
      if (reasonBlock) blocked.push({ doc: d, reason: reasonBlock });
      else filtered.push(d);
    }

    // 排序
    var scored = filtered.map(function (d) {
      var s = state.retriever === 'bm25' ? bm25Score(index, d, qTokens) : cosineScore(index, d, qCounts, qVec);
      return { doc: d, score: s };
    });
    scored.sort(function (a, b) { return b.score - a.score; });

    var effK = state.k + (state.def.majority ? EXPANSION : 0);
    var top = scored.filter(function (r) { return r.score > 0; }).slice(0, effK);
    if (top.length === 0) top = scored.slice(0, Math.min(effK, scored.length));

    // 生成（抽取式）
    var gen = generate(index, q, top, qCounts, qVec);

    return {
      q: q, index: index, ranked: top, effK: effK,
      gen: gen, blocked: blocked, allScored: scored,
      poisonInKb: docs.filter(function (d) { return d.kind === 'poison'; }).length,
      total: docs.length
    };
  }

  function bestSentence(index, docText, qCounts, qVec) {
    var sents = splitSentences(docText);
    var best = null, bestScore = -1;
    for (var i = 0; i < sents.length; i++) {
      var sc = sentenceScore(index, sents[i], qCounts, qVec);
      if (sc > bestScore) { bestScore = sc; best = sents[i]; }
    }
    return { sentence: best, score: bestScore };
  }

  function classifySentence(q, sentence) {
    if (q.custom || !q.cleanNeedles) return 'unknown';
    var has = function (arr) { for (var i = 0; i < arr.length; i++) if (sentence.indexOf(arr[i]) >= 0) return true; return false; };
    if (has(q.poisonNeedles)) return 'poison';
    if (has(q.cleanNeedles)) return 'clean';
    return 'other';
  }

  function generate(index, q, ranked, qCounts, qVec) {
    if (ranked.length === 0) {
      return { text: '知識庫裡沒有可用的文件可回答。', conf: 0, sourceId: null, verdict: 'empty', votes: null };
    }
    // 每筆檢索文件抽出最佳句子
    var picks = ranked.map(function (r) {
      var bs = bestSentence(index, r.doc.text, qCounts, qVec);
      return { doc: r.doc, retScore: r.score, sentence: bs.sentence, sScore: bs.score, cls: classifySentence(q, bs.sentence) };
    });

    // 多數決防禦：以答案類別投票（同分時比檢索分數）
    if (state.def.majority && !q.custom) {
      var votes = { clean: 0, poison: 0, other: 0 };
      for (var i = 0; i < picks.length; i++) if (votes[picks[i].cls] !== undefined) votes[picks[i].cls]++;
      var winner = 'clean';
      if (votes.poison > votes.clean) winner = 'poison';
      else if (votes.clean === 0 && votes.poison === 0) winner = 'other';
      var pool = picks.filter(function (p) { return p.cls === winner; });
      if (pool.length === 0) pool = picks.slice();
      pool.sort(function (a, b) { return b.retScore - a.retScore; });
      var chosen = pool[0];
      return {
        text: chosen.sentence, conf: clamp01(chosen.sScore), sourceId: chosen.doc.id,
        cls: chosen.cls, verdict: verdictOf(q, chosen.cls), votes: votes, mode: 'majority'
      };
    }

    // 一般：檢索第一名（top-1）的最佳句子
    var top1 = picks[0];
    return {
      text: top1.sentence, conf: clamp01(top1.sScore), sourceId: top1.doc.id,
      cls: top1.cls, verdict: verdictOf(q, top1.cls), votes: null, mode: 'top1'
    };
  }

  function verdictOf(q, cls) {
    if (q.custom) return 'custom';
    if (cls === 'poison') return 'poisoned';
    if (cls === 'clean') return 'clean';
    return 'other';
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x || 0)); }

  /* ================= UI ================= */
  var $ = function (id) { return document.getElementById(id); };
  var els = {};

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  if (typeof document !== 'undefined') ready(function () {
    load();
    cacheEls();
    buildQChips();
    buildComposeSelect();
    buildPresetPoison();
    syncControls();
    renderKb();
    renderRatio(true);
    wireEvents();
    setupReveal();
    setupMotion();
    setupField();
    if (state.lastQuestion) { els.qInput.value = state.lastQuestion; }
  });

  function cacheEls() {
    ['field', 'kbList', 'kbCount', 'qChips', 'qInput', 'askBtn', 'rBm25', 'rTfidf',
     'kSlider', 'kVal', 'defWhitelist', 'defPerplexity', 'defMajority', 'results',
     'answerText', 'answerConf', 'answerCite', 'verdict', 'answerCard', 'retrieverTag',
     'presetPoison', 'cpQuestion', 'cpKeywords', 'cpAnswer', 'cpStealth', 'cpPreview',
     'addPoisonBtn', 'clnText', 'addCleanBtn', 'clearPoisonBtn', 'resetBtn',
     'ratioTotal', 'ratioPoison', 'ratioPct', 'motionToggle', 'srStatus'].forEach(function (id) {
      els[id] = $(id);
    });
    els.cpR = document.querySelector('#cpPreview .cp-r');
    els.cpG = document.querySelector('#cpPreview .cp-g');
  }

  function buildQChips() {
    els.qChips.innerHTML = '';
    QUESTIONS.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'qchip';
      b.textContent = q.text;
      b.addEventListener('click', function () { els.qInput.value = q.text; ask(q.text); });
      els.qChips.appendChild(b);
    });
  }

  function buildComposeSelect() {
    els.cpQuestion.innerHTML = '';
    QUESTIONS.forEach(function (q) {
      var o = document.createElement('option');
      o.value = q.id; o.textContent = q.text;
      els.cpQuestion.appendChild(o);
    });
    var oc = document.createElement('option');
    oc.value = 'custom'; oc.textContent = '自訂（自己填關鍵字與答案）';
    els.cpQuestion.appendChild(oc);
    prefillCompose();
  }

  function currentComposeQ() {
    var v = els.cpQuestion.value;
    for (var i = 0; i < QUESTIONS.length; i++) if (QUESTIONS[i].id === v) return QUESTIONS[i];
    return null;
  }
  function prefillCompose() {
    var q = currentComposeQ();
    if (q) { els.cpKeywords.value = q.keywords; els.cpAnswer.value = q.target; }
    updateComposePreview();
  }

  function composedDoc() {
    var kw = els.cpKeywords.value.trim() || '（關鍵字）';
    var ans = els.cpAnswer.value.trim() || '（目標答案）';
    var stealth = els.cpStealth.checked;
    var q = currentComposeQ();
    var retrieval, payload, text;
    if (stealth) {
      if (q && q.stealth) {
        // 擬態：複製一筆正常文件、只換掉數字 → 困惑度低，躲過過濾
        text = q.stealth(ans);
        retrieval = '（擬態成正常文件）';
        payload = text;
      } else {
        retrieval = '關於' + kw + '，';
        payload = '最新資訊為 ' + ans + '。';
        text = retrieval + payload;
      }
    } else {
      // keyword-stuffed：空白硬塞關鍵字，困惑度高；仍是單一句子以利抽取
      retrieval = kw + ' ' + kw + '，';
      payload = '正確答案是 ' + ans + '，就是 ' + ans + '。';
      text = retrieval + payload;
    }
    return { retrieval: retrieval, payload: payload, text: text, stealth: stealth };
  }
  function updateComposePreview() {
    var c = composedDoc();
    if (c.stealth) {
      els.cpR.textContent = '';
      els.cpG.textContent = c.text;
    } else {
      els.cpR.textContent = c.retrieval;
      els.cpG.textContent = c.payload;
    }
  }

  function buildPresetPoison() {
    els.presetPoison.innerHTML = '';
    QUESTIONS.forEach(function (q) {
      var card = document.createElement('div');
      card.className = 'ppcard';
      card.innerHTML =
        '<div class="ppcard-top"><span class="pptag">毒</span><span class="ppq">' + esc(q.text) + '</span></div>' +
        '<p class="ppgoal">目標：把答案改成 <b>' + esc(q.target) + '</b>（正解是 ' + esc(q.cleanLabel) + '）</p>';
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'ghost-btn small';
      btn.textContent = '注入這筆毒文件';
      btn.addEventListener('click', function () { injectPreset(q); });
      card.appendChild(btn);
      els.presetPoison.appendChild(card);
    });
  }

  function syncControls() {
    setSeg(state.retriever);
    els.kSlider.value = String(state.k);
    els.kVal.textContent = String(state.k);
    els.defWhitelist.checked = state.def.whitelist;
    els.defPerplexity.checked = state.def.perplexity;
    els.defMajority.checked = state.def.majority;
    els.motionToggle.setAttribute('aria-pressed', motionForced ? 'true' : 'false');
    els.motionToggle.classList.toggle('is-on', motionForced);
  }
  function setSeg(which) {
    var on = which === 'bm25' ? els.rBm25 : els.rTfidf;
    var off = which === 'bm25' ? els.rTfidf : els.rBm25;
    on.classList.add('is-on'); on.setAttribute('aria-checked', 'true');
    off.classList.remove('is-on'); off.setAttribute('aria-checked', 'false');
  }

  /* ---------- 渲染：知識庫 ---------- */
  function renderKb() {
    var docs = allDocs();
    els.kbCount.textContent = docs.length + ' 筆';
    els.kbList.innerHTML = '';
    docs.forEach(function (d) {
      var li = document.createElement('li');
      li.className = 'kb-card' + (d.kind === 'poison' ? ' poison' : '') + (d.kind === 'usertrust' ? ' usertrust' : '');
      li.setAttribute('data-id', d.id);
      li.setAttribute('tabindex', '0');
      var srcClass = d.trusted ? 'src-ok' : 'src-bad';
      li.innerHTML =
        '<div class="kb-top">' +
          '<span class="kb-src ' + srcClass + '">' + esc(d.source) + '</span>' +
          '<span class="kb-score" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="kb-title">' + esc(d.title || '（未命名）') + '</div>' +
        '<div class="kb-text">' + esc(d.text) + '</div>';
      if (d.kind === 'poison' || d.kind === 'usertrust') {
        var rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'kb-remove'; rm.setAttribute('aria-label', '移除這筆文件');
        rm.textContent = '×';
        rm.addEventListener('click', function (e) { e.stopPropagation(); removeDoc(d.id); });
        li.appendChild(rm);
      }
      els.kbList.appendChild(li);
    });
  }

  function annotateKb(res) {
    var rankMap = {};
    res.ranked.forEach(function (r, i) { rankMap[r.doc.id] = { rank: i + 1, score: r.score }; });
    var blockMap = {};
    res.blocked.forEach(function (b) { blockMap[b.doc.id] = b.reason; });
    var cards = els.kbList.querySelectorAll('.kb-card');
    Array.prototype.forEach.call(cards, function (card) {
      var id = card.getAttribute('data-id');
      var scoreEl = card.querySelector('.kb-score');
      card.classList.remove('is-hit', 'is-blocked', 'is-source');
      if (rankMap[id]) {
        card.classList.add('is-hit');
        if (res.gen && res.gen.sourceId === id) card.classList.add('is-source');
        scoreEl.textContent = '#' + rankMap[id].rank + ' · ' + fmtScore(rankMap[id].score);
      } else if (blockMap[id]) {
        card.classList.add('is-blocked');
        scoreEl.textContent = blockMap[id] === 'whitelist' ? '白名單擋下' : '困惑度擋下';
      } else {
        scoreEl.textContent = '未進 top-k';
      }
    });
  }
  function fmtScore(s) {
    if (state.retriever === 'tfidf') return s.toFixed(3);
    return s.toFixed(2);
  }

  /* ---------- 渲染：檢索結果（FLIP 動畫） ---------- */
  function renderResults(res) {
    var prev = {};
    Array.prototype.forEach.call(els.results.querySelectorAll('.res-item'), function (it) {
      prev[it.getAttribute('data-id')] = it.getBoundingClientRect();
    });

    els.results.innerHTML = '';
    var maxScore = res.ranked.length ? res.ranked[0].score : 1;
    if (maxScore <= 0) maxScore = 1;

    res.ranked.forEach(function (r, i) {
      var li = document.createElement('li');
      li.className = 'res-item' + (r.doc.kind === 'poison' ? ' poison' : '');
      if (res.gen && res.gen.sourceId === r.doc.id) li.classList.add('is-source');
      li.setAttribute('data-id', r.doc.id);
      var pct = Math.max(4, Math.round(r.score / maxScore * 100));
      li.innerHTML =
        '<div class="res-rank">' + (i + 1) + '</div>' +
        '<div class="res-main">' +
          '<div class="res-line">' +
            '<span class="res-title">' + esc(r.doc.title || '文件') + '</span>' +
            (r.doc.kind === 'poison' ? '<span class="res-badge">毒文件</span>' : '<span class="res-badge ok">' + esc(r.doc.source) + '</span>') +
          '</div>' +
          '<div class="res-bar"><span class="res-fill" style="transform:scaleX(' + (pct / 100) + ')"></span></div>' +
        '</div>' +
        '<div class="res-score">' + fmtScore(r.score) + '</div>';
      els.results.appendChild(li);
    });

    if (res.ranked.length === 0) {
      els.results.innerHTML = '<li class="res-empty">沒有檢索到任何文件。</li>';
    }

    els.retrieverTag.textContent = (state.retriever === 'bm25' ? 'BM25' : 'TF-IDF') +
      '・top-' + res.effK + (state.def.majority ? '（已擴充）' : '');

    // FLIP：從舊位置補間到新位置
    if (!reducedMotion()) {
      Array.prototype.forEach.call(els.results.querySelectorAll('.res-item'), function (it) {
        var id = it.getAttribute('data-id');
        var nowRect = it.getBoundingClientRect();
        if (prev[id]) {
          var dx = prev[id].left - nowRect.left;
          var dy = prev[id].top - nowRect.top;
          if (dx || dy) {
            it.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            it.style.transition = 'none';
            requestAnimationFrame(function () {
              it.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)';
              it.style.transform = '';
            });
          }
        } else {
          it.classList.add('slip-in');
        }
      });
    }
  }

  /* ---------- 渲染：答案與判定 ---------- */
  function renderAnswer(res) {
    var g = res.gen;
    var q = res.q;
    els.answerText.innerHTML = highlightValue(g.text || '', q);

    if (g.conf > 0) {
      els.answerConf.hidden = false;
      els.answerConf.querySelector('b').textContent = Math.round(g.conf * 100) + '%';
    } else { els.answerConf.hidden = true; }

    if (g.sourceId) {
      var src = findDoc(g.sourceId);
      var extra = res.ranked.length > 1 ? ('，另引用 ' + (res.ranked.length - 1) + ' 筆') : '';
      var voteStr = '';
      if (g.votes) voteStr = '（多數決：真 ' + g.votes.clean + '・毒 ' + g.votes.poison + '）';
      els.answerCite.innerHTML = '引用：<b>' + esc(src ? src.title : g.sourceId) + '</b>' +
        (src && src.kind === 'poison' ? ' <span class="cite-poison">毒文件</span>' : '') + esc(extra) + ' ' + voteStr;
    } else { els.answerCite.textContent = ''; }

    var v = els.verdict;
    var poisonBlocked = res.blocked.some(function (b) { return b.doc.kind === 'poison'; });
    if (g.verdict === 'poisoned') { v.dataset.state = 'bad'; v.textContent = '已被下毒'; }
    else if (g.verdict === 'clean') {
      if (res.poisonInKb > 0 && (poisonBlocked || (state.def.majority && g.votes))) {
        v.dataset.state = 'good'; v.textContent = '防禦成功';
      } else { v.dataset.state = 'good'; v.textContent = '乾淨'; }
    }
    else if (g.verdict === 'other') { v.dataset.state = 'warn'; v.textContent = '答非所問'; }
    else if (g.verdict === 'custom') { v.dataset.state = 'idle'; v.textContent = '自訂問題'; }
    else { v.dataset.state = 'idle'; v.textContent = '—'; }

    announce(v.textContent + '。' + (g.text || ''));
  }

  function highlightValue(sentence, q) {
    var s = esc(sentence);
    if (!q.custom) {
      (q.poisonNeedles || []).forEach(function (n) {
        s = s.replace(new RegExp(escRe(esc(n)), 'g'), '<mark class="mk-bad">' + esc(n) + '</mark>');
      });
      (q.cleanNeedles || []).forEach(function (n) {
        s = s.replace(new RegExp(escRe(esc(n)), 'g'), '<mark class="mk-ok">' + esc(n) + '</mark>');
      });
    } else {
      s = s.replace(/(\d+\s*(?:天|度|年|個月|元|%|杯|分鐘)?)/g, function (m0) { return '<mark class="mk-neu">' + m0 + '</mark>'; });
    }
    return s;
  }

  /* ---------- 動作 ---------- */
  function ask(text) {
    text = (text != null ? text : els.qInput.value).trim();
    if (!text) { announce('請先輸入問題'); els.qInput.focus(); return; }
    state.lastQuestion = text; save();
    var res = runRAG(text);
    renderResults(res);
    annotateKb(res);
    renderAnswer(res);
    pulse(els.answerCard);
  }

  function afterDocChange() {
    save();
    renderKb();
    renderRatio(false);
    updateFieldPoison();
    if (state.lastQuestion) ask(state.lastQuestion);
  }

  function injectPreset(q) {
    var id = 'p_' + q.id + '_' + Date.now().toString(36);
    state.userDocs.push({ id: id, title: '【注入】' + q.text, text: presetPoisonText(q),
      trusted: false, source: '外部注入', kind: 'poison' });
    announce('已注入針對「' + q.text + '」的毒文件');
    afterDocChange();
    focusDoc(id);
  }

  function addComposed() {
    var q = currentComposeQ();
    var kw = els.cpKeywords.value.trim();
    var ans = els.cpAnswer.value.trim();
    if (!kw || !ans) { announce('請填入檢索誘餌與目標答案'); return; }
    var c = composedDoc();
    var id = 'p_custom_' + Date.now().toString(36);
    var title = '【注入】' + (q ? q.text : kw);
    state.userDocs.push({ id: id, title: title, text: c.text, trusted: false, source: '外部注入', kind: 'poison' });
    announce('已注入自製毒文件');
    afterDocChange();
    focusDoc(id);
  }

  function addClean() {
    var t = els.clnText.value.trim();
    if (!t) { announce('請輸入文件內容'); return; }
    var id = 'u_' + Date.now().toString(36);
    var title = t.length > 12 ? t.slice(0, 12) + '…' : t;
    state.userDocs.push({ id: id, title: title, text: t, trusted: true, source: '自訂可信', kind: 'usertrust' });
    els.clnText.value = '';
    announce('已加入可信文件');
    afterDocChange();
    focusDoc(id);
  }

  function removeDoc(id) {
    state.userDocs = state.userDocs.filter(function (d) { return d.id !== id; });
    announce('已移除文件');
    afterDocChange();
  }
  function clearPoison() {
    state.userDocs = state.userDocs.filter(function (d) { return d.kind !== 'poison'; });
    announce('已清除所有毒文件');
    afterDocChange();
  }
  function resetAll() {
    state.userDocs = [];
    state.def = { whitelist: false, perplexity: false, majority: false };
    state.k = 3; state.retriever = 'bm25'; state.lastQuestion = '';
    els.qInput.value = '';
    save(); syncControls(); renderKb(); renderRatio(false); updateFieldPoison();
    clearResults();
    announce('已全部重置');
  }
  function clearResults() {
    els.results.innerHTML = '<li class="res-empty">選一個問題開始。</li>';
    els.answerText.textContent = '選一個問題，或自己輸入一句，按「檢索並作答」。';
    els.answerConf.hidden = true; els.answerCite.textContent = '';
    els.verdict.dataset.state = 'idle'; els.verdict.textContent = '尚未提問';
    Array.prototype.forEach.call(els.kbList.querySelectorAll('.kb-card'), function (c) {
      c.classList.remove('is-hit', 'is-blocked', 'is-source');
      var s = c.querySelector('.kb-score'); if (s) s.textContent = '';
    });
  }

  function findDoc(id) { var a = allDocs(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function focusDoc(id) {
    requestAnimationFrame(function () {
      var el = els.kbList.querySelector('[data-id="' + id + '"]');
      if (el) { el.classList.add('just-added'); try { el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) {} setTimeout(function () { el.classList.remove('just-added'); }, 1200); }
    });
  }

  /* ---------- 佔比面板（數字滾動） ---------- */
  function renderRatio(instant) {
    var docs = allDocs();
    var total = docs.length;
    var poison = docs.filter(function (d) { return d.kind === 'poison'; }).length;
    var pct = total ? (poison / total * 100) : 0;
    tween(els.ratioTotal, total, 0, instant);
    tween(els.ratioPoison, poison, 0, instant);
    tween(els.ratioPct, pct, 1, instant);
  }

  var tweenTokens = new WeakMap();
  function tween(el, to, decimals, instant) {
    var token = {};
    tweenTokens.set(el, token);
    var from = parseFloat(el.textContent) || 0;
    if (instant || reducedMotion() || from === to) { el.textContent = fmtNum(to, decimals); return; }
    var start = performance.now(), dur = 550;
    function step(now) {
      if (tweenTokens.get(el) !== token) return;
      var p = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(from + (to - from) * e, decimals);
      if (p < 1) requestAnimationFrame(step); else el.textContent = fmtNum(to, decimals);
    }
    requestAnimationFrame(step);
  }
  function fmtNum(n, d) { return d ? n.toFixed(d) : String(Math.round(n)); }

  /* ---------- 事件 ---------- */
  function wireEvents() {
    els.askBtn.addEventListener('click', function () { ask(); });
    els.qInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
    els.rBm25.addEventListener('click', function () { state.retriever = 'bm25'; setSeg('bm25'); save(); if (state.lastQuestion) ask(state.lastQuestion); });
    els.rTfidf.addEventListener('click', function () { state.retriever = 'tfidf'; setSeg('tfidf'); save(); if (state.lastQuestion) ask(state.lastQuestion); });
    els.kSlider.addEventListener('input', function () { state.k = parseInt(els.kSlider.value, 10); els.kVal.textContent = els.kSlider.value; save(); if (state.lastQuestion) ask(state.lastQuestion); });
    els.defWhitelist.addEventListener('change', function () { state.def.whitelist = els.defWhitelist.checked; save(); if (state.lastQuestion) ask(state.lastQuestion); });
    els.defPerplexity.addEventListener('change', function () { state.def.perplexity = els.defPerplexity.checked; save(); if (state.lastQuestion) ask(state.lastQuestion); });
    els.defMajority.addEventListener('change', function () { state.def.majority = els.defMajority.checked; save(); if (state.lastQuestion) ask(state.lastQuestion); });

    els.cpQuestion.addEventListener('change', prefillCompose);
    els.cpKeywords.addEventListener('input', updateComposePreview);
    els.cpAnswer.addEventListener('input', updateComposePreview);
    els.cpStealth.addEventListener('change', updateComposePreview);
    els.addPoisonBtn.addEventListener('click', addComposed);

    els.addCleanBtn.addEventListener('click', addClean);
    els.clearPoisonBtn.addEventListener('click', clearPoison);
    els.resetBtn.addEventListener('click', resetAll);

    els.motionToggle.addEventListener('click', function () {
      motionForced = !motionForced;
      try { localStorage.setItem(LS_MOTION, motionForced ? '1' : '0'); } catch (e) {}
      els.motionToggle.setAttribute('aria-pressed', motionForced ? 'true' : 'false');
      els.motionToggle.classList.toggle('is-on', motionForced);
      applyMotion();
    });
  }

  /* ---------- 進場揭示 ---------- */
  function setupReveal() {
    var els2 = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || reducedMotion()) {
      Array.prototype.forEach.call(els2, function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(els2, function (e) { io.observe(e); });
  }

  /* ---------- 減少動態 ---------- */
  var mq = (typeof window !== 'undefined' && window.matchMedia) ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: function () {} };
  function reducedMotion() { return mq.matches || motionForced; }
  function setupMotion() {
    applyMotion();
    var handler = function () { applyMotion(); };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }
  function applyMotion() {
    document.body.classList.toggle('reduce-motion', reducedMotion());
    if (reducedMotion()) { field.stop(); } else { field.start(); }
  }

  /* ---------- 背景知識場（canvas，嚴格節流） ---------- */
  var field = (function () {
    var canvas, ctx, dpr = 1, W = 0, H = 0, dots = [], raf = 0, running = false, visible = true, onScreen = true;
    function init(cv) {
      canvas = cv; ctx = canvas.getContext('2d');
      resize();
      seed();
      window.addEventListener('resize', debounce(resize, 150));
      document.addEventListener('visibilitychange', function () { visible = !document.hidden; gate(); });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; gate(); }, { threshold: 0.01 }).observe(canvas);
      }
    }
    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      var n = Math.min(70, Math.round(W * H / 26000));
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .12, r: Math.random() * 1.6 + .6, poison: false });
      }
      updatePoison();
    }
    function updatePoison() {
      var pc = Math.min(8, allDocs().filter(function (d) { return d.kind === 'poison'; }).length);
      for (var i = 0; i < dots.length; i++) dots[i].poison = false;
      for (var k = 0; k < pc && k < dots.length; k++) dots[dots.length - 1 - k].poison = true;
    }
    function frame() {
      if (!running || !ctx) return;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x += W; else if (d.x > W) d.x -= W;
        if (d.y < 0) d.y += H; else if (d.y > H) d.y -= H;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * (d.poison ? 1.7 : 1), 0, Math.PI * 2);
        ctx.fillStyle = d.poison ? 'rgba(236,72,153,0.55)' : 'rgba(120,160,220,0.16)';
        ctx.fill();
        if (d.poison) {
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(236,72,153,0.12)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function gate() { if (running && visible && onScreen && ctx) { if (!raf) raf = requestAnimationFrame(frame); } else { if (raf) { cancelAnimationFrame(raf); raf = 0; } } }
    return {
      mount: init,
      start: function () { running = true; gate(); },
      stop: function () { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } if (ctx) ctx.clearRect(0, 0, W, H); },
      refresh: function () { if (dots.length) updatePoison(); }
    };
  })();
  function setupField() {
    if (!els.field) return;
    field.mount(els.field);
    if (!reducedMotion()) field.start();
  }
  function updateFieldPoison() { field.refresh(); }

  /* ---------- 小工具 ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function announce(msg) { if (els.srStatus) { els.srStatus.textContent = ''; requestAnimationFrame(function () { els.srStatus.textContent = msg; }); } }
  function pulse(el) { if (!el || reducedMotion()) return; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* ---------- 匯出給測試（Node 環境） ---------- */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      SEED_DOCS: SEED_DOCS, QUESTIONS: QUESTIONS, presetPoisonText: presetPoisonText,
      tokenize: tokenize, buildIndex: buildIndex, bm25Score: bm25Score,
      cosineScore: cosineScore, tfidfVec: tfidfVec, countTokens: countTokens,
      splitSentences: splitSentences, sentenceScore: sentenceScore, PPL: PPL,
      state: state, runRAG: runRAG, EXPANSION: EXPANSION, resolveQuestion: resolveQuestion,
      classifyFor: function (q, sentence) {
        var has = function (arr) { for (var i = 0; i < arr.length; i++) if (sentence.indexOf(arr[i]) >= 0) return true; return false; };
        if (has(q.poisonNeedles)) return 'poison';
        if (has(q.cleanNeedles)) return 'clean';
        return 'other';
      }
    };
  }
})();

/* =====================================================================
   RAG 實驗室 — app.js
   純靜態、零外部資源、雙擊即可離線運作。
   不呼叫任何 LLM / AI API、不做任何 fetch。
   所有檢索數學（BM25 / TF-IDF / 餘弦 / PPMI＋截斷SVD 語意向量 / RRF）
   皆於本檔案「當場計算」，資料來源為內建的繁體中文知識庫。
   localStorage 一律使用 rag. 前綴。
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. 內建知識庫（虛構產品手冊，繁體中文；前後一致、可被問答）          *
   * ------------------------------------------------------------------ */
  var KB_TITLE = '雲雀智能 · 候鳥 M2 智慧義式咖啡機 · 使用手冊';
  var KB_SENTENCES = [
    '候鳥M2是雲雀智能於2025年推出的家用智慧義式咖啡機，官方型號為SL-M2。',
    '候鳥M2的可拆式水箱容量為1.8公升，建議使用軟水或濾水以減少水垢生成。',
    '機身內建豆倉可裝入約250公克咖啡豆，並附獨立錐刀研磨器，研磨粗細共12段可調。',
    '候鳥M2的整機保固期為24個月，研磨器與加熱系統延長保固至36個月，需於官網完成註冊。',
    '保固不涵蓋濾網與密封圈等耗材，也不包含人為損壞或因長期未除垢造成的故障。',
    '候鳥M2僅支援2.4GHz頻段的Wi-Fi，長按機身頂部電源鍵5秒即可進入配對模式。',
    '設定連線時，請以「雲雀家庭」App掃描機身螢幕上的QR Code完成綁定。',
    '預設萃取溫度為92度，使用者可在App中於88度到96度之間自行微調。',
    '幫浦最高壓力可達19bar，實際萃取時會穩定維持在約9bar以確保風味。',
    '建議每沖煮約200杯、或每滿兩個月執行一次除垢程序，可使用檸檬酸或原廠除垢劑。',
    '每日使用後請沖洗沖煮頭與奶泡管，奶泡管可拆卸並以清水沖去殘餘奶漬。',
    '錯誤碼E01代表水箱缺水或未裝妥，請重新安裝水箱並確認浮球沒有卡住。',
    '錯誤碼E02代表水溫感測異常，多半因水垢過多所致，請先執行一次除垢程序。',
    '錯誤碼E03代表研磨器卡豆，請關機清空豆倉並取出異物後再重新啟動機器。',
    '候鳥M2閒置15分鐘後會進入節能待機，滿30分鐘則會完全關機，可於App關閉此功能。',
    '加熱功率為1450瓦，待機功耗低於0.5瓦，整體符合節能設計規範。',
    '透過App可設定每日預約沖煮的時間，最多能同時儲存4組排程。',
    '內建蒸氣奶泡棒可製作卡布奇諾與拿鐵，蒸氣需預熱約25秒才會穩定輸出。',
    '候鳥M2機身尺寸為寬28公分、深34公分、高38公分，整機淨重9.6公斤。',
    '網路購買的鑑賞期為到貨後7天內，商品須保持全新未使用，已使用或缺件恕不接受退貨。',
    '客服專線服務時間為週一至週五9點到18點，也可於App線上客服留言並在24小時內獲得回覆。',
    '相容耗材中，濾網型號為SL-F1、密封圈型號為SL-R2，建議每12個月更換一次。',
    '韌體可透過App進行OTA更新，更新期間請勿斷電，整個流程約需5分鐘完成。'
  ];
  var KB_TEXT = KB_SENTENCES.join('');

  /* 範例問題（可點擊帶入問答台）；answer 為「用來判定正確 chunk」的唯一子字串 */
  var SAMPLE_QA = [
    { q: '候鳥M2的保固期是多久？', answer: '24個月' },
    { q: '水箱容量有多大？', answer: '1.8公升' },
    { q: '支援哪一種Wi-Fi頻段？', answer: '2.4GHz' },
    { q: 'E02錯誤碼代表什麼問題？', answer: 'E02' },
    { q: '大約沖幾杯要除垢一次？', answer: '200杯' },
    { q: '機身淨重幾公斤？', answer: '9.6公斤' },
    { q: '網購鑑賞期有幾天？', answer: '7天' },
    { q: '萃取溫度預設是幾度？', answer: '92度' }
  ];

  /* ------------------------------------------------------------------ *
   * 2. 分詞（中文以字為 gram，另補中文 bigram 與英數字整段）            *
   * ------------------------------------------------------------------ */
  function isCJK(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) ||
           (c >= 0xF900 && c <= 0xFAFF);
  }
  function isAlnum(ch) { return ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'z'; }

  /* BM25 / TF-IDF 用：中文 unigram + bigram + 英數字整段 */
  function tokenize(text) {
    var s = (text || '').toLowerCase();
    var atoms = [];            // {t, cjk} 或 null(分隔符，切斷 bigram)
    var i = 0, n = s.length;
    while (i < n) {
      var ch = s[i];
      if (isAlnum(ch)) {
        var j = i + 1;
        while (j < n && isAlnum(s[j])) j++;
        atoms.push({ t: s.slice(i, j), cjk: false });
        i = j;
      } else if (isCJK(ch)) {
        atoms.push({ t: ch, cjk: true });
        i++;
      } else { atoms.push(null); i++; }
    }
    var toks = [];
    for (var k = 0; k < atoms.length; k++) {
      var a = atoms[k];
      if (!a) continue;
      toks.push(a.t);
      if (a.cjk) {
        var b = atoms[k + 1];
        if (b && b.cjk) toks.push(a.t + b.t);   // 相鄰中文字 → bigram
      }
    }
    return toks;
  }

  /* 語意共現用：中文 unigram + 英數字整段（不含 bigram，讓共現矩陣乾淨） */
  function charTokens(text) {
    var s = (text || '').toLowerCase();
    var toks = [], i = 0, n = s.length;
    while (i < n) {
      var ch = s[i];
      if (isAlnum(ch)) {
        var j = i + 1;
        while (j < n && isAlnum(s[j])) j++;
        toks.push(s.slice(i, j)); i = j;
      } else if (isCJK(ch)) { toks.push(ch); i++; }
      else i++;
    }
    return toks;
  }

  function splitSentences(text) {
    var out = [], cur = '', enders = '。！？!?；;\n';
    var arr = Array.from(text || '');
    for (var i = 0; i < arr.length; i++) {
      cur += arr[i];
      if (enders.indexOf(arr[i]) >= 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function termFreq(tokens) {
    var m = new Map();
    for (var i = 0; i < tokens.length; i++) m.set(tokens[i], (m.get(tokens[i]) || 0) + 1);
    return m;
  }

  /* ------------------------------------------------------------------ *
   * 3. 切塊（依字元；size 為塊大小、overlap 為重疊字數）                *
   * ------------------------------------------------------------------ */
  function chunkText(text, size, overlap) {
    var chars = Array.from(text || '');
    var n = chars.length;
    size = Math.max(1, Math.floor(size));
    overlap = Math.max(0, Math.min(Math.floor(overlap), size - 1));
    var step = Math.max(1, size - overlap);
    var chunks = [];
    for (var start = 0; start < n; start += step) {
      var end = Math.min(start + size, n);
      chunks.push({ id: chunks.length, start: start, end: end, text: chars.slice(start, end).join('') });
      if (end >= n) break;
    }
    if (chunks.length === 0) chunks.push({ id: 0, start: 0, end: 0, text: '' });
    return chunks;
  }

  /* ------------------------------------------------------------------ *
   * 4. 稀疏檢索：BM25（Robertson & Zaragoza 2009）＋ TF-IDF 餘弦        *
   * ------------------------------------------------------------------ */
  function buildIndex(tokenizedDocs) {
    var N = tokenizedDocs.length;
    var df = new Map(), docLens = [], total = 0;
    for (var d = 0; d < N; d++) {
      var toks = tokenizedDocs[d];
      docLens.push(toks.length);
      total += toks.length;
      var seen = new Set(toks);
      seen.forEach(function (t) { df.set(t, (df.get(t) || 0) + 1); });
    }
    var avgdl = N ? total / N : 0;
    var idf = new Map();
    df.forEach(function (dcount, t) {
      // BM25 版 idf（Spärck Jones 1972 的 idf 精神）：出現在越少文件 → 權重越大
      idf.set(t, Math.log(1 + (N - dcount + 0.5) / (dcount + 0.5)));
    });
    return { N: N, df: df, idf: idf, docLens: docLens, avgdl: avgdl };
  }

  function bm25Score(qTokens, dTokens, idx, k1, b) {
    k1 = (k1 == null) ? 1.5 : k1;
    b = (b == null) ? 0.75 : b;
    var tf = termFreq(dTokens);
    var dl = dTokens.length;
    var avgdl = idx.avgdl || 1;
    var score = 0;
    var qset = new Set(qTokens);
    qset.forEach(function (t) {
      var f = tf.get(t) || 0;
      if (!f) return;
      var w = idx.idf.get(t);
      if (w == null || w <= 0) return;
      var denom = f + k1 * (1 - b + b * dl / avgdl);
      score += w * (f * (k1 + 1)) / denom;
    });
    return score;
  }

  function tfidfVector(tokens, idf) {
    var tf = termFreq(tokens), v = new Map();
    tf.forEach(function (f, t) {
      var w = idf.get(t);
      if (w == null || w <= 0) return;
      v.set(t, f * w);
    });
    return v;
  }

  /* 稀疏向量（Map）餘弦 */
  function cosine(a, b) {
    var dot = 0, na = 0, nb = 0;
    a.forEach(function (w) { na += w * w; });
    b.forEach(function (w) { nb += w * w; });
    a.forEach(function (w, t) { var w2 = b.get(t); if (w2) dot += w * w2; });
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  /* 稠密向量（陣列）餘弦 */
  function dotArr(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function cosineDense(a, b) {
    var na = Math.sqrt(dotArr(a, a)), nb = Math.sqrt(dotArr(b, b));
    if (!na || !nb) return 0;
    return dotArr(a, b) / (na * nb);
  }

  /* ------------------------------------------------------------------ *
   * 5. 稠密／語意檢索：PPMI ＋ 截斷 SVD（LSA）—— 自包含、當場計算       *
   *    依 Levy & Goldberg (2014)：word2vec ≈ 對 (P)PMI 矩陣做隱式分解。 *
   *    因無法下載預訓練嵌入，改以本語料的詞共現矩陣 → PPMI → SVD 求向量 *
   * ------------------------------------------------------------------ */
  var STOP = new Set(('的了是在和也有並與及且而或於之其這那此為以到就都很更最又不沒'
    + '個可請將對從被把讓使要會能中內外上下時後前').split(''));

  function buildCooccur(charDocs, termIndex, window) {
    var V = termIndex.size, M = [];
    for (var i = 0; i < V; i++) M.push(new Float64Array(V));
    for (var d = 0; d < charDocs.length; d++) {
      var toks = charDocs[d], ids = [];
      for (var t = 0; t < toks.length; t++) {
        var gi = termIndex.get(toks[t]); ids.push(gi == null ? -1 : gi);
      }
      for (var p = 0; p < ids.length; p++) {
        var a = ids[p]; if (a < 0) continue;
        var lo = Math.max(0, p - window), hi = Math.min(ids.length - 1, p + window);
        for (var q = lo; q <= hi; q++) {
          if (q === p) continue;
          var bb = ids[q]; if (bb < 0) continue;
          M[a][bb] += 1;            // 對稱累加（p,q 與 q,p 皆會走到）
        }
      }
    }
    return M;
  }

  function ppmiMatrix(C) {
    var V = C.length, rowSum = new Float64Array(V), total = 0;
    for (var i = 0; i < V; i++) {
      var s = 0; for (var j = 0; j < V; j++) s += C[i][j];
      rowSum[i] = s; total += s;
    }
    var M = []; for (var a = 0; a < V; a++) M.push(new Float64Array(V));
    if (total === 0) return M;
    for (var r = 0; r < V; r++) {
      if (rowSum[r] === 0) continue;
      for (var c = 0; c < V; c++) {
        var cij = C[r][c];
        if (cij === 0) continue;
        var pmi = Math.log((cij * total) / (rowSum[r] * rowSum[c]));
        M[r][c] = pmi > 0 ? pmi : 0;             // PPMI：負值截為 0
      }
    }
    return M;
  }

  /* 對稱矩陣的 Jacobi 特徵分解 → 取 |特徵值| 最大的前 d 維 = 截斷 SVD */
  function jacobiEigen(Ain, maxSweeps) {
    var n = Ain.length, a = [], v = [], i, k;
    for (i = 0; i < n; i++) a.push(Float64Array.from(Ain[i]));
    for (i = 0; i < n; i++) { var r = new Float64Array(n); r[i] = 1; v.push(r); }
    maxSweeps = maxSweeps || 120;
    for (var sweep = 0; sweep < maxSweeps; sweep++) {
      var off = 0, p, q;
      for (p = 0; p < n - 1; p++) for (q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-18) break;
      for (p = 0; p < n - 1; p++) {
        for (q = p + 1; q < n; q++) {
          var apq = a[p][q];
          if (apq === 0) continue;
          var app = a[p][p], aqq = a[q][q];
          var theta = (aqq - app) / (2 * apq);
          var tt = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          var c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
          for (k = 0; k < n; k++) {
            if (k === p || k === q) continue;
            var akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq; a[p][k] = a[k][p];
            a[k][q] = s * akp + c * akq; a[q][k] = a[k][q];
          }
          a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
          a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
          a[p][q] = 0; a[q][p] = 0;
          for (k = 0; k < n; k++) {
            var vkp = v[k][p], vkq = v[k][q];
            v[k][p] = c * vkp - s * vkq;
            v[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    var values = new Float64Array(n);
    for (i = 0; i < n; i++) values[i] = a[i][i];
    return { values: values, vectors: v };   // v[k][j] = 第 j 個特徵向量的第 k 個分量
  }

  function trainLSA(charDocs, opts) {
    opts = opts || {};
    var maxVocab = opts.maxVocab || 160, window = opts.window || 3, dim = opts.dim || 32;
    var tf = new Map(), df = new Map(), N = charDocs.length, d, t;
    for (d = 0; d < N; d++) {
      var seen = new Set();
      for (t = 0; t < charDocs[d].length; t++) {
        var tok = charDocs[d][t];
        tf.set(tok, (tf.get(tok) || 0) + 1); seen.add(tok);
      }
      seen.forEach(function (x) { df.set(x, (df.get(x) || 0) + 1); });
    }
    var cand = [];
    tf.forEach(function (_c, k) { if (!STOP.has(k)) cand.push(k); });
    cand.sort(function (x, y) { return (tf.get(y) - tf.get(x)) || (x < y ? -1 : 1); });
    var vocab = cand.slice(0, maxVocab);
    var termIndex = new Map();
    vocab.forEach(function (x, i) { termIndex.set(x, i); });
    var idf = new Map();
    vocab.forEach(function (x) {
      var dc = df.get(x) || 1;
      idf.set(x, Math.log(1 + (N - dc + 0.5) / (dc + 0.5)));
    });
    var C = buildCooccur(charDocs, termIndex, window);
    var M = ppmiMatrix(C);
    var eig = jacobiEigen(M, 120);
    var values = eig.values, vectors = eig.vectors;
    var dd = Math.min(dim, vocab.length);
    var order = [];
    for (var i = 0; i < values.length; i++) order.push(i);
    order.sort(function (i, j) { return Math.abs(values[j]) - Math.abs(values[i]); });
    var top = order.slice(0, dd);
    var V = vocab.length, termVecs = [];
    for (i = 0; i < V; i++) termVecs.push(new Float64Array(dd));
    for (var cc = 0; cc < dd; cc++) {
      var jj = top[cc], scale = Math.sqrt(Math.abs(values[jj]));
      for (i = 0; i < V; i++) termVecs[i][cc] = vectors[i][jj] * scale;
    }
    return { vocab: vocab, termIndex: termIndex, dim: dd, termVecs: termVecs, idf: idf };
  }

  /* 文字 → 語意向量：以 idf·log(1+tf) 加權平均詞向量，再做 L2 正規化 */
  function embed(charToks, lsa) {
    var v = new Float64Array(lsa.dim);
    var tf = termFreq(charToks), k;
    tf.forEach(function (f, tok) {
      var gi = lsa.termIndex.get(tok);
      if (gi == null) return;
      var w = (lsa.idf.get(tok) || 0) * Math.log(1 + f);
      if (w <= 0) return;
      var tv = lsa.termVecs[gi];
      for (k = 0; k < lsa.dim; k++) v[k] += w * tv[k];
    });
    var nrm = 0; for (k = 0; k < lsa.dim; k++) nrm += v[k] * v[k];
    nrm = Math.sqrt(nrm);
    if (nrm > 0) for (k = 0; k < lsa.dim; k++) v[k] /= nrm;
    return v;
  }

  /* ------------------------------------------------------------------ *
   * 6. 排序 / 混合檢索（Reciprocal Rank Fusion, Cormack 2009, k=60）    *
   * ------------------------------------------------------------------ */
  function rankSparse(query, ctx, mode) {
    var q = tokenize(query), res = [];
    var qv = mode === 'tfidf' ? tfidfVector(q, ctx.idx.idf) : null;
    for (var i = 0; i < ctx.chunks.length; i++) {
      var score;
      if (mode === 'tfidf') score = cosine(qv, tfidfVector(ctx.chunkToks[i], ctx.idx.idf));
      else score = bm25Score(q, ctx.chunkToks[i], ctx.idx);
      res.push({ id: ctx.chunks[i].id, i: i, score: score });
    }
    res.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return res;
  }
  function rankDense(query, ctx) {
    var qv = embed(charTokens(query), ctx.lsa), res = [];
    for (var i = 0; i < ctx.chunks.length; i++)
      res.push({ id: ctx.chunks[i].id, i: i, score: cosineDense(qv, ctx.chunkEmb[i]) });
    res.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return res;
  }
  function rrf(rankedLists, k) {
    k = (k == null) ? 60 : k;
    var agg = new Map();
    rankedLists.forEach(function (list) {
      list.forEach(function (r, rank) {
        var cur = agg.get(r.i) || { i: r.i, id: r.id, score: 0 };
        cur.score += 1 / (k + rank + 1);   // rank 為 0-based → +1
        agg.set(r.i, cur);
      });
    });
    var out = []; agg.forEach(function (x) { out.push(x); });
    out.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return out;
  }
  function retrieve(query, ctx, method, topk) {
    var ranked;
    if (method === 'sparse') ranked = rankSparse(query, ctx, 'bm25');
    else if (method === 'dense') ranked = rankDense(query, ctx);
    else ranked = rrf([rankSparse(query, ctx, 'bm25'), rankDense(query, ctx)], 60);
    return ranked.slice(0, topk);
  }

  /* ------------------------------------------------------------------ *
   * 7. 「生成」= 誠實的抽取式（不呼叫任何 LLM）                          *
   * ------------------------------------------------------------------ */
  function extractAnswer(query, text) {
    var sents = splitSentences(text);
    if (!sents.length) return { sentence: '', score: 0 };
    var q = new Set(tokenize(query)), best = sents[0], bestScore = -1;
    for (var i = 0; i < sents.length; i++) {
      var st = tokenize(sents[i]), seen = new Set(st), overlap = 0;
      q.forEach(function (t) { if (seen.has(t)) overlap++; });
      var sc = overlap / Math.sqrt(st.length || 1);
      if (sc > bestScore) { bestScore = sc; best = sents[i]; }
    }
    return { sentence: best, score: bestScore };
  }

  /* ------------------------------------------------------------------ *
   * 8. Lost in the Middle 讀取機率（依 Liu et al. 2023 定性 U 形示意）  *
   *    t=0 開頭、t=1 結尾；開頭/結尾高、中間低，開頭略高（primacy）。    *
   *    數值為示意，非論文實測準確率。                                   *
   * ------------------------------------------------------------------ */
  function readProbability(t) {
    t = Math.max(0, Math.min(1, t));
    var u = Math.pow(2 * t - 1, 2);        // 兩端=1、中間=0
    var primacy = 0.12 * (1 - t);          // 開頭略高於結尾
    var pMid = 0.42, pEnd = 0.90;
    var p = pMid + (pEnd - pMid) * u + primacy;
    return Math.max(0.05, Math.min(0.99, p));
  }

  /* ------------------------------------------------------------------ *
   * 匯出（供 node 測試 require；瀏覽器端略過）                          *
   * ------------------------------------------------------------------ */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      KB_TITLE: KB_TITLE, KB_SENTENCES: KB_SENTENCES, KB_TEXT: KB_TEXT, SAMPLE_QA: SAMPLE_QA,
      tokenize: tokenize, charTokens: charTokens, splitSentences: splitSentences,
      chunkText: chunkText, buildIndex: buildIndex, bm25Score: bm25Score,
      tfidfVector: tfidfVector, cosine: cosine, cosineDense: cosineDense,
      buildCooccur: buildCooccur, ppmiMatrix: ppmiMatrix, jacobiEigen: jacobiEigen,
      trainLSA: trainLSA, embed: embed,
      rankSparse: rankSparse, rankDense: rankDense, rrf: rrf, retrieve: retrieve,
      extractAnswer: extractAnswer, readProbability: readProbability
    };
  }

  /* 若在 node（無 document）require，到此為止，不執行任何 DOM 程式碼 */
  if (typeof document === 'undefined') return;

  /* ================================================================== *
   * 9. 前端：狀態、工具                                                 *
   * ================================================================== */
  function lsGet(key, def) {
    try { var v = localStorage.getItem('rag.' + key); return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem('rag.' + key, JSON.stringify(val)); } catch (e) {}
  }
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  var mqlMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = mqlMotion.matches;
  function applyMotionPref() {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }
  if (mqlMotion.addEventListener) mqlMotion.addEventListener('change', function (e) {
    reduceMotion = e.matches; applyMotionPref();
    if (reduceMotion) { stopHero(); drawHeroStatic(); } else { startHero(); }
  });
  applyMotionPref();

  /* 安全高亮：把 text 內符合 terms 的片段包成 <mark>（不使用 innerHTML 注入） */
  function highlightInto(node, text, terms) {
    node.textContent = '';
    var list = terms.filter(function (t) { return t && t.length >= 1; })
                    .sort(function (a, b) { return b.length - a.length; });
    var i = 0, lower = text.toLowerCase();
    while (i < text.length) {
      var matched = null;
      for (var k = 0; k < list.length; k++) {
        var t = list[k];
        if (lower.startsWith(t, i)) { matched = t; break; }
      }
      if (matched) {
        var m = el('mark', 'hl'); m.textContent = text.substr(i, matched.length);
        node.appendChild(m); i += matched.length;
      } else {
        var last = node.lastChild;
        if (last && last.nodeType === 3) last.nodeValue += text[i];
        else node.appendChild(document.createTextNode(text[i]));
        i++;
      }
    }
  }
  /* 取出查詢中「值得高亮」的詞：英數字整段、以及中文 bigram */
  function highlightTerms(query) {
    var toks = tokenize(query), out = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.length >= 2) out.push(t);        // bigram 或英數字詞
    }
    return Array.from(new Set(out));
  }

  function animateNumber(node, from, to, dur, fmt) {
    fmt = fmt || function (x) { return x.toFixed(3); };
    if (reduceMotion || dur <= 0) { node.textContent = fmt(to); return; }
    var t0 = performance.now();
    function tick(now) {
      var p = clamp01((now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ================================================================== *
   * 10. 模型與內容建置                                                  *
   * ================================================================== */
  var LSA = trainLSA(KB_SENTENCES.map(charTokens), { maxVocab: 160, window: 3, dim: 32 });

  var state = {
    size: lsGet('chunkSize', 110),
    overlap: lsGet('overlap', 22),
    method: lsGet('method', 'hybrid'),
    topk: lsGet('topk', 3),
    query: lsGet('lastQuery', '候鳥M2的保固期是多久？'),
    litmPos: lsGet('litmPos', 50),
    moreK: lsGet('moreK', 3)
  };

  var CTX = null;
  function rebuildContext() {
    var chunks = chunkText(KB_TEXT, state.size, state.overlap);
    var chunkToks = chunks.map(function (c) { return tokenize(c.text); });
    var idx = buildIndex(chunkToks);
    var chunkEmb = chunks.map(function (c) { return embed(charTokens(c.text), LSA); });
    CTX = { chunks: chunks, chunkToks: chunkToks, idx: idx, chunkEmb: chunkEmb, lsa: LSA };
  }

  /* ================================================================== *
   * 11. 知識庫檢視                                                      *
   * ================================================================== */
  function renderKB() {
    var wrap = $('#kb-list'); if (!wrap) return;
    wrap.textContent = '';
    KB_SENTENCES.forEach(function (s, i) {
      var row = el('li', 'kb-row');
      var badge = el('span', 'kb-idx', 'S' + (i + 1));
      var txt = el('span', 'kb-txt', s);
      row.appendChild(badge); row.appendChild(txt);
      wrap.appendChild(row);
    });
    var meta = $('#kb-meta');
    if (meta) meta.textContent = '共 ' + KB_SENTENCES.length + ' 段、'
      + Array.from(KB_TEXT).length + ' 個字元。語意模型詞彙表 '
      + LSA.vocab.length + ' 詞、向量維度 ' + LSA.dim + '。';
  }

  /* ================================================================== *
   * 12. 切塊實驗室                                                      *
   * ================================================================== */
  function renderChunks() {
    var wrap = $('#chunk-cards'); if (!wrap) return;
    wrap.textContent = '';
    var chunks = CTX.chunks;
    chunks.forEach(function (c, i) {
      var card = el('div', 'chunk-card');
      var head = el('div', 'chunk-head');
      head.appendChild(el('span', 'chunk-id', '#' + c.id));
      head.appendChild(el('span', 'chunk-range', c.start + '–' + c.end));
      head.appendChild(el('span', 'chunk-len', Array.from(c.text).length + ' 字'));
      var body = el('div', 'chunk-body', c.text);
      card.appendChild(head); card.appendChild(body);
      if (!reduceMotion) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(8px)';
        card.style.transitionDelay = Math.min(i * 45, 500) + 'ms';
      }
      wrap.appendChild(card);
      if (!reduceMotion) requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          card.style.opacity = ''; card.style.transform = '';
        });
      });
    });
    var totalChars = Array.from(KB_TEXT).length;
    var avg = chunks.reduce(function (a, c) { return a + Array.from(c.text).length; }, 0) / chunks.length;
    var stats = $('#chunk-stats');
    if (stats) {
      setStat('#stat-count', chunks.length, 0);
      setStat('#stat-avg', avg, 0);
      setStat('#stat-ovl', state.overlap, 0);
      var eff = Math.round((state.overlap / state.size) * 100);
      var effEl = $('#stat-eff'); if (effEl) effEl.textContent = eff + '%';
    }
  }
  function setStat(sel, val, digits) {
    var node = $(sel); if (!node) return;
    var from = parseFloat(node.getAttribute('data-v') || '0');
    node.setAttribute('data-v', String(val));
    animateNumber(node, from, val, 500, function (x) { return x.toFixed(digits); });
  }

  /* ================================================================== *
   * 13. 問答台：整條流水線                                              *
   * ================================================================== */
  var PIPE_STEPS = ['切塊', '嵌入 / 建立索引', '檢索 top-k', '組上下文', '抽取答案'];
  function renderPipelineSkeleton() {
    var wrap = $('#pipeline'); if (!wrap) return;
    wrap.textContent = '';
    PIPE_STEPS.forEach(function (label, i) {
      var step = el('div', 'pipe-step');
      step.setAttribute('data-step', String(i));
      step.appendChild(el('span', 'pipe-dot', String(i + 1)));
      step.appendChild(el('span', 'pipe-label', label));
      wrap.appendChild(step);
      if (i < PIPE_STEPS.length - 1) wrap.appendChild(el('span', 'pipe-arrow', '→'));
    });
  }
  function lightPipeline(done) {
    var steps = $$('#pipeline .pipe-step');
    steps.forEach(function (s) { s.classList.remove('active', 'lit'); });
    if (reduceMotion) {
      steps.forEach(function (s) { s.classList.add('lit'); });
      if (done) done();
      return;
    }
    var i = 0;
    (function next() {
      if (i >= steps.length) { if (done) done(); return; }
      steps[i].classList.add('active');
      if (i > 0) steps[i - 1].classList.add('lit');
      i++;
      setTimeout(next, 190);
    })();
    setTimeout(function () {
      steps.forEach(function (s) { s.classList.add('lit'); });
    }, steps.length * 190 + 60);
  }

  var METHOD_LABEL = { sparse: 'BM25 稀疏', dense: '語意向量 (LSA)', hybrid: '混合 (RRF)' };
  var METHOD_CLASS = { sparse: 'm-sparse', dense: 'm-dense', hybrid: 'm-hybrid' };

  function runQuery() {
    if (!CTX) rebuildContext();
    var q = state.query.trim();
    var out = $('#qa-results'), ans = $('#qa-answer'), ctxBox = $('#qa-context');
    if (!q) {
      if (out) out.textContent = '';
      if (ans) ans.textContent = '請先輸入問題，或點選下方的範例問題。';
      if (ctxBox) ctxBox.textContent = '';
      return;
    }
    var results = retrieve(q, CTX, state.method, state.topk);
    var maxScore = results.reduce(function (m, r) { return Math.max(m, r.score); }, 0) || 1;
    var hterms = highlightTerms(q);

    lightPipeline(function () {
      // top-k 結果卡
      out.textContent = '';
      results.forEach(function (r, rank) {
        var chunk = CTX.chunks[r.i];
        var card = el('div', 'res-card ' + METHOD_CLASS[state.method]);
        var head = el('div', 'res-head');
        head.appendChild(el('span', 'res-rank', '#' + (rank + 1)));
        head.appendChild(el('span', 'res-chunk', 'chunk ' + chunk.id));
        var scoreEl = el('span', 'res-score', '0.000');
        head.appendChild(scoreEl);
        var bar = el('div', 'res-bar');
        var fill = el('div', 'res-fill');
        fill.style.transform = 'scaleX(0)';
        bar.appendChild(fill);
        var body = el('div', 'res-body');
        highlightInto(body, chunk.text, hterms);
        card.appendChild(head); card.appendChild(bar); card.appendChild(body);
        out.appendChild(card);
        var fillRatio = clamp01(r.score / maxScore) * 0.96 + 0.04;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { fill.style.transform = 'scaleX(' + fillRatio.toFixed(3) + ')'; });
        });
        animateNumber(scoreEl, 0, r.score, 520, function (x) { return x.toFixed(3); });
      });

      // 組上下文
      if (ctxBox) {
        ctxBox.textContent = '';
        var ctxChars = 0;
        results.forEach(function (r, rank) {
          var chunk = CTX.chunks[r.i];
          ctxChars += Array.from(chunk.text).length;
          var line = el('div', 'ctx-line');
          line.appendChild(el('span', 'ctx-tag', '[' + (rank + 1) + ']'));
          line.appendChild(el('span', 'ctx-piece', chunk.text));
          ctxBox.appendChild(line);
        });
        var note = el('div', 'ctx-note',
          '此上下文共 ' + ctxChars + ' 字，將連同問題送入生成步驟。真實 RAG 在這步把這些 chunks 餵給 LLM；'
          + '塞越多，token 成本越高，也越可能觸發「Lost in the Middle」與雜訊干擾。');
        ctxBox.appendChild(note);
      }

      // 抽取式答案（誠實：非 LLM）
      if (ans) {
        ans.textContent = '';
        var top = results[0];
        if (!top || top.score <= 0) {
          ans.appendChild(el('p', 'ans-text', '檢索不到夠相關的內容，因此抽取式步驟無法給出可靠答案。這正是重點：答案品質完全取決於檢索到什麼。'));
        } else {
          var picked = extractAnswer(q, CTX.chunks[top.i].text);
          var p = el('p', 'ans-text');
          highlightInto(p, picked.sentence, hterms);
          ans.appendChild(p);
          ans.appendChild(el('p', 'ans-src', '↑ 抽取自 chunk ' + CTX.chunks[top.i].id + '（' + METHOD_LABEL[state.method] + ' 檢索的第 1 名）'));
        }
      }
    });
  }

  /* ================================================================== *
   * 14. 寶藏一：Lost in the Middle（U 形讀取機率）                       *
   * ================================================================== */
  var litmCanvas, litmCtx;
  function drawLITM() {
    if (!litmCanvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = litmCanvas.clientWidth, H = litmCanvas.clientHeight;
    litmCanvas.width = W * dpr; litmCanvas.height = H * dpr;
    var g = litmCtx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    var padL = 44, padR = 16, padT = 16, padB = 30;
    var x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT;
    var css = getComputedStyle(document.documentElement);
    var cGrid = css.getPropertyValue('--line').trim() || 'rgba(255,255,255,.1)';
    var cAxis = css.getPropertyValue('--muted').trim() || '#9aa7b4';
    var cCurve = css.getPropertyValue('--rose').trim() || '#ff6b9d';
    var cAccent = css.getPropertyValue('--accent').trim() || '#7c9cff';
    // 格線 + Y 軸刻度
    g.strokeStyle = cGrid; g.lineWidth = 1; g.font = '11px system-ui, sans-serif';
    g.fillStyle = cAxis; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (var yy = 0; yy <= 1.0001; yy += 0.25) {
      var py = y0 + (y1 - y0) * yy;
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(x0, py); g.lineTo(x1, py); g.stroke();
      g.globalAlpha = 1; g.fillText(Math.round(yy * 100) + '%', x0 - 8, py);
    }
    // U 形曲線
    g.beginPath(); g.strokeStyle = cCurve; g.lineWidth = 2.5; g.globalAlpha = 1;
    for (var i = 0; i <= 120; i++) {
      var t = i / 120, p = readProbability(t);
      var px = x0 + (x1 - x0) * t, py2 = y0 + (y1 - y0) * p;
      if (i === 0) g.moveTo(px, py2); else g.lineTo(px, py2);
    }
    g.stroke();
    // 目前位置標記
    var tpos = state.litmPos / 100, prob = readProbability(tpos);
    var mx = x0 + (x1 - x0) * tpos, my = y0 + (y1 - y0) * prob;
    g.strokeStyle = cAccent; g.globalAlpha = 0.4; g.lineWidth = 1;
    g.beginPath(); g.moveTo(mx, y0); g.lineTo(mx, my); g.stroke();
    g.globalAlpha = 1; g.fillStyle = cAccent;
    g.beginPath(); g.arc(mx, my, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0b0d10'; g.lineWidth = 2; g.stroke();
    // X 軸標籤
    g.fillStyle = cAxis; g.textBaseline = 'top';
    g.textAlign = 'left'; g.fillText('開頭', x0, y0 + 8);
    g.textAlign = 'center'; g.fillText('中間', (x0 + x1) / 2, y0 + 8);
    g.textAlign = 'right'; g.fillText('結尾', x1, y0 + 8);
  }
  function updateLITMReadout() {
    var prob = readProbability(state.litmPos / 100);
    var pctEl = $('#litm-prob'); if (pctEl) animateNumber(pctEl, parseFloat(pctEl.getAttribute('data-v') || '0'), prob * 100, 400, function (x) { return Math.round(x) + '%'; });
    if (pctEl) pctEl.setAttribute('data-v', String(prob * 100));
    var verdict = $('#litm-verdict');
    if (verdict) {
      var t = state.litmPos;
      var msg;
      if (t <= 20) msg = '放在最前面：模型最容易讀到（primacy）。這是安全區。';
      else if (t >= 80) msg = '放在結尾：模型也讀得不錯（recency）。同樣是安全區。';
      else if (t >= 40 && t <= 60) msg = '正中央：讀取機率掉到谷底——這就是「Lost in the Middle」。把最關鍵的證據塞在這裡最危險。';
      else msg = '半中間地帶：機率開始下滑，離兩端越遠越容易被忽略。';
      verdict.textContent = msg;
    }
    var slots = $$('#litm-slots .slot');
    var answerIdx = Math.round(state.litmPos / 100 * (slots.length - 1));
    slots.forEach(function (s, i) {
      var on = i === answerIdx;
      s.classList.toggle('is-answer', on);
      var tag = s.querySelector('.slot-tag');
      if (tag) tag.textContent = on ? '★ 正解 chunk（就在這）' : '雜訊 chunk';
    });
  }
  function renderLITMSlots() {
    var wrap = $('#litm-slots'); if (!wrap) return;
    wrap.textContent = '';
    for (var i = 0; i < 8; i++) {
      var slot = el('div', 'slot');
      slot.appendChild(el('span', 'slot-pos', String(i + 1)));
      slot.appendChild(el('span', 'slot-tag', '雜訊 chunk'));
      wrap.appendChild(slot);
    }
  }

  /* ================================================================== *
   * 15. 寶藏二：切壞的代價                                              *
   * ================================================================== */
  var SPLIT_PASSAGE = '產品說明。候鳥M2的建議萃取溫度預設為92度。';
  var SPLIT_QUERY = '萃取溫度預設是幾度？';
  function renderSplitDemo(mode) {
    var wrap = $('#split-cards'); if (!wrap) return;
    var size = 18, overlap = mode === 'fixed' ? 10 : 0;
    var chunks = chunkText(SPLIT_PASSAGE, size, overlap);
    wrap.textContent = '';
    var hasFull = false;
    chunks.forEach(function (c) {
      var hasKey = c.text.indexOf('萃取溫度') >= 0;
      var hasVal = c.text.indexOf('92度') >= 0;
      if (hasKey && hasVal) hasFull = true;
      var card = el('div', 'split-card');
      var body = el('div', 'split-body');
      highlightInto(body, c.text, ['萃取溫度', '92度']);
      card.appendChild(el('div', 'chunk-id', '#' + c.id));
      card.appendChild(body);
      var tags = el('div', 'split-tags');
      tags.appendChild(el('span', 'tagbit ' + (hasKey ? 'on' : 'off'), (hasKey ? '✓' : '✕') + ' 關鍵詞「萃取溫度」'));
      tags.appendChild(el('span', 'tagbit ' + (hasVal ? 'on' : 'off'), (hasVal ? '✓' : '✕') + ' 答案值「92度」'));
      card.appendChild(tags);
      wrap.appendChild(card);
    });
    // 實跑一次抽取
    var ctx = buildMiniCtx(chunks);
    var top = retrieve(SPLIT_QUERY, ctx, 'sparse', 1)[0];
    var picked = top ? extractAnswer(SPLIT_QUERY, chunks[top.i].text) : { sentence: '' };
    var verdict = $('#split-verdict');
    if (verdict) {
      verdict.textContent = '';
      var line1 = el('p', 'sv-line');
      line1.appendChild(el('strong', null, hasFull ? '✅ 有完整答案的 chunk 存在' : '❌ 沒有任何 chunk 同時含關鍵詞與答案值'));
      var line2 = el('p', 'sv-line', '對問題「' + SPLIT_QUERY + '」，稀疏檢索抓到 chunk '
        + (top ? top.i : '—') + '，抽取出：「' + (picked.sentence || '（空）') + '」。');
      var line3 = el('p', 'sv-note', hasFull
        ? '加了重疊（overlap＝10）後，答案被縫回同一塊，抽取式就能回出「92度」。'
        : '切太小又沒有重疊，答案被切在邊界兩側——檢索到含「萃取溫度」的塊，卻少了「92度」，答案救不回來。');
      verdict.appendChild(line1); verdict.appendChild(line2); verdict.appendChild(line3);
    }
    $$('#split-toggle .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
      b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false');
    });
  }
  function buildMiniCtx(chunks) {
    var chunkToks = chunks.map(function (c) { return tokenize(c.text); });
    return {
      chunks: chunks, chunkToks: chunkToks, idx: buildIndex(chunkToks),
      chunkEmb: chunks.map(function (c) { return embed(charTokens(c.text), LSA); }), lsa: LSA
    };
  }

  /* ================================================================== *
   * 16. 寶藏三：檢索更多 ≠ 更好                                         *
   * ================================================================== */
  var MOREK_QA = { q: '候鳥M2的保固期是多久？', answer: '24個月' };
  function renderMoreK() {
    if (!CTX) rebuildContext();
    var k = state.moreK;
    var ranked = rankSparse(MOREK_QA.q, CTX, 'bm25').slice(0, k);
    var signal = 0;
    ranked.forEach(function (r) { if (CTX.chunks[r.i].text.indexOf(MOREK_QA.answer) >= 0) signal++; });
    var noise = k - signal;
    var barSig = $('#morek-signal'), barNoise = $('#morek-noise');
    if (barSig) barSig.style.transform = 'scaleX(' + (signal / k).toFixed(3) + ')';
    if (barNoise) barNoise.style.transform = 'scaleX(' + (noise / k).toFixed(3) + ')';
    var sigNum = $('#morek-signal-n'), noiseNum = $('#morek-noise-n');
    if (sigNum) sigNum.textContent = String(signal);
    if (noiseNum) noiseNum.textContent = String(noise);
    var list = $('#morek-list');
    if (list) {
      list.textContent = '';
      ranked.forEach(function (r, i) {
        var isSig = CTX.chunks[r.i].text.indexOf(MOREK_QA.answer) >= 0;
        var row = el('div', 'mk-row ' + (isSig ? 'sig' : 'noise'));
        row.appendChild(el('span', 'mk-rank', '#' + (i + 1)));
        row.appendChild(el('span', 'mk-badge', isSig ? '相關' : '雜訊'));
        var snip = CTX.chunks[r.i].text;
        row.appendChild(el('span', 'mk-snip', snip.length > 34 ? snip.slice(0, 34) + '…' : snip));
        list.appendChild(row);
      });
    }
    var verdict = $('#morek-verdict');
    if (verdict) {
      verdict.textContent = k <= 2
        ? '目前 top-k 精準：檢索到的幾乎都是相關內容。'
        : '把 top-k 拉大，雜訊 chunk 開始混入上下文——它們看起來相關卻不含答案，會稀釋訊號、甚至誤導生成（hard negatives）。';
    }
    var kEl = $('#morek-kval'); if (kEl) kEl.textContent = String(k);
  }

  /* ================================================================== *
   * 17. 英雄區 canvas：流水線粒子（rAF 迴圈，分頁隱藏/離屏時暫停）      *
   * ================================================================== */
  var heroCanvas, heroCtx, heroRAF = 0, heroVisible = true, heroParticles = [], heroNodes = [];
  function setupHero() {
    heroCanvas = $('#hero-canvas'); if (!heroCanvas) return;
    heroCtx = heroCanvas.getContext('2d');
    var io = new IntersectionObserver(function (ents) {
      heroVisible = ents[0].isIntersecting;
      if (heroVisible && !reduceMotion) startHero(); else stopHero();
      if (!heroVisible || reduceMotion) drawHeroStatic();
    }, { threshold: 0.05 });
    io.observe(heroCanvas);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopHero();
      else if (heroVisible && !reduceMotion) startHero();
    });
    window.addEventListener('resize', function () {
      if (reduceMotion || !heroVisible) drawHeroStatic();
    });
    for (var i = 0; i < 22; i++) heroParticles.push({ seg: Math.floor(Math.random() * 4), t: Math.random(), sp: 0.14 + Math.random() * 0.18 });
    if (reduceMotion) drawHeroStatic(); else startHero();
  }
  function heroGeometry(W, H) {
    var labels = ['文件', '切塊', '嵌入', '檢索', '生成'];
    var n = labels.length, padX = 30, y = H / 2;
    heroNodes = [];
    for (var i = 0; i < n; i++) {
      var x = padX + (W - 2 * padX) * (i / (n - 1));
      heroNodes.push({ x: x, y: y, label: labels[i] });
    }
  }
  function drawHeroFrame(anim) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = heroCanvas.clientWidth, H = heroCanvas.clientHeight;
    heroCanvas.width = W * dpr; heroCanvas.height = H * dpr;
    var g = heroCtx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    heroGeometry(W, H);
    var css = getComputedStyle(document.documentElement);
    var cLine = css.getPropertyValue('--line').trim() || 'rgba(255,255,255,.12)';
    var cAccent = css.getPropertyValue('--accent').trim() || '#7c9cff';
    var cDense = css.getPropertyValue('--dense').trim() || '#3fd6c1';
    var cMuted = css.getPropertyValue('--muted').trim() || '#9aa7b4';
    // 連線
    g.strokeStyle = cLine; g.lineWidth = 2;
    for (var i = 0; i < heroNodes.length - 1; i++) {
      g.beginPath(); g.moveTo(heroNodes[i].x, heroNodes[i].y); g.lineTo(heroNodes[i + 1].x, heroNodes[i + 1].y); g.stroke();
    }
    // 粒子
    if (anim) {
      for (var p = 0; p < heroParticles.length; p++) {
        var pt = heroParticles[p];
        var A = heroNodes[pt.seg], B = heroNodes[pt.seg + 1];
        var px = A.x + (B.x - A.x) * pt.t, py = A.y + (B.y - A.y) * pt.t;
        g.globalAlpha = 0.85; g.fillStyle = pt.seg % 2 ? cDense : cAccent;
        g.beginPath(); g.arc(px, py, 2.6, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    // 節點
    for (i = 0; i < heroNodes.length; i++) {
      var nd = heroNodes[i];
      g.fillStyle = css.getPropertyValue('--surface-2').trim() || '#1b2027';
      g.strokeStyle = cAccent; g.lineWidth = 1.5;
      g.beginPath(); g.arc(nd.x, nd.y, 15, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = cMuted; g.font = '12px system-ui, "PingFang TC", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(nd.label, nd.x, nd.y + 22);
    }
  }
  function drawHeroStatic() { if (heroCanvas) drawHeroFrame(false); }
  var heroLast = 0;
  function heroLoop(now) {
    if (!heroVisible || reduceMotion || document.hidden) { heroRAF = 0; return; }
    if (now - heroLast > 33) {   // rAF 節流 ~30fps
      heroLast = now;
      for (var p = 0; p < heroParticles.length; p++) {
        var pt = heroParticles[p];
        pt.t += pt.sp * 0.033;
        if (pt.t >= 1) { pt.t = 0; pt.seg = (pt.seg + 1) % (heroNodes.length - 1 || 1); }
      }
      drawHeroFrame(true);
    }
    heroRAF = requestAnimationFrame(heroLoop);
  }
  function startHero() { if (!heroRAF && heroCanvas && !reduceMotion) { heroLast = 0; heroRAF = requestAnimationFrame(heroLoop); } }
  function stopHero() { if (heroRAF) { cancelAnimationFrame(heroRAF); heroRAF = 0; } }

  /* 進場 reveal（IntersectionObserver；reduced-motion 直接顯示） */
  function setupReveal() {
    var items = $$('[data-reveal]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (n, i) {
      n.style.transitionDelay = Math.min((i % 6) * 70, 420) + 'ms';
      io.observe(n);
    });
  }

  /* ================================================================== *
   * 18. 事件綁定與初始化                                                *
   * ================================================================== */
  function bindControls() {
    // 切塊
    var sizeI = $('#ctrl-size'), ovlI = $('#ctrl-overlap');
    if (sizeI) {
      sizeI.value = state.size;
      $('#ctrl-size-val').textContent = state.size;
      sizeI.addEventListener('input', function () {
        state.size = parseInt(sizeI.value, 10);
        if (state.overlap > state.size - 1) { state.overlap = state.size - 1; if (ovlI) { ovlI.value = state.overlap; $('#ctrl-overlap-val').textContent = state.overlap; } }
        if (ovlI) ovlI.max = String(Math.max(1, state.size - 1));
        $('#ctrl-size-val').textContent = state.size;
        lsSet('chunkSize', state.size);
        rebuildContext(); renderChunks(); renderMoreK();
      });
    }
    if (ovlI) {
      ovlI.max = String(Math.max(1, state.size - 1));
      ovlI.value = state.overlap;
      $('#ctrl-overlap-val').textContent = state.overlap;
      ovlI.addEventListener('input', function () {
        state.overlap = parseInt(ovlI.value, 10);
        $('#ctrl-overlap-val').textContent = state.overlap;
        lsSet('overlap', state.overlap);
        rebuildContext(); renderChunks(); renderMoreK();
      });
    }

    // 問答台
    var qi = $('#qa-input');
    if (qi) {
      qi.value = state.query;
      qi.addEventListener('input', function () { state.query = qi.value; lsSet('lastQuery', qi.value); });
      qi.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runQuery(); } });
    }
    var runBtn = $('#qa-run');
    if (runBtn) runBtn.addEventListener('click', runQuery);

    $$('#qa-methods .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-method') === state.method);
      b.setAttribute('aria-pressed', b.getAttribute('data-method') === state.method ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.method = b.getAttribute('data-method'); lsSet('method', state.method);
        $$('#qa-methods .seg-btn').forEach(function (x) {
          var on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        runQuery();
      });
    });

    var topkI = $('#ctrl-topk');
    if (topkI) {
      topkI.value = state.topk; $('#ctrl-topk-val').textContent = state.topk;
      topkI.addEventListener('input', function () {
        state.topk = parseInt(topkI.value, 10); $('#ctrl-topk-val').textContent = state.topk;
        lsSet('topk', state.topk); runQuery();
      });
    }

    var chipWrap = $('#qa-samples');
    if (chipWrap) {
      SAMPLE_QA.forEach(function (item) {
        var chip = el('button', 'chip', item.q);
        chip.type = 'button';
        chip.addEventListener('click', function () {
          state.query = item.q; if (qi) qi.value = item.q; lsSet('lastQuery', item.q); runQuery();
        });
        chipWrap.appendChild(chip);
      });
    }

    // 寶藏一
    var litmI = $('#ctrl-litm');
    if (litmI) {
      litmI.value = state.litmPos;
      litmI.addEventListener('input', function () {
        state.litmPos = parseInt(litmI.value, 10); lsSet('litmPos', state.litmPos);
        drawLITM(); updateLITMReadout();
      });
    }
    $$('#litm-presets .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        state.litmPos = parseInt(b.getAttribute('data-pos'), 10);
        if (litmI) litmI.value = state.litmPos;
        lsSet('litmPos', state.litmPos); drawLITM(); updateLITMReadout();
      });
    });

    // 寶藏二
    $$('#split-toggle .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { renderSplitDemo(b.getAttribute('data-mode')); });
    });

    // 寶藏三
    var mkI = $('#ctrl-morek');
    if (mkI) {
      mkI.value = state.moreK; $('#morek-kval').textContent = state.moreK;
      mkI.addEventListener('input', function () {
        state.moreK = parseInt(mkI.value, 10); lsSet('moreK', state.moreK); renderMoreK();
      });
    }

    // 知識庫展開
    var kbToggle = $('#kb-toggle');
    if (kbToggle) kbToggle.addEventListener('click', function () {
      var panel = $('#kb-panel');
      var open = panel.classList.toggle('open');
      kbToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      kbToggle.textContent = open ? '收合知識庫 ▲' : '展開全部 ' + KB_SENTENCES.length + ' 段 ▼';
    });
  }

  
  function init() {
    rebuildContext();
    renderKB();
    renderChunks();
    renderPipelineSkeleton();
    renderLITMSlots();
    litmCanvas = $('#litm-canvas');
    if (litmCanvas) { litmCtx = litmCanvas.getContext('2d'); }
    var litmI = $('#ctrl-litm'); if (litmI) litmI.value = state.litmPos;
    bindControls();
    setupHero();
    setupReveal();
    drawLITM(); updateLITMReadout();
    renderSplitDemo('bad');
    renderMoreK();
    runQuery();
    window.addEventListener('resize', function () { drawLITM(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

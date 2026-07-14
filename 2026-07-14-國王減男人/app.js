/* ============================================================================
 * 國王 − 男人 + 女人 = 皇后 · 詞向量語意算術
 * 純靜態、零外部資源、可離線。所有向量計算當場真的算。
 *
 * 【誠實聲明】這裡用的是「教學用手工向量」：我們為約 66 個詞，親手設計了一組
 * 可解釋的語意維度（性別、皇室、年齡、國家、首都、時態、複數、程度……），
 * 讓 king−man+woman=queen 這類算術由建構保證成立。真實的 word2vec / GloVe
 * 是從「大量文字」自己學出這些方向的（沒有人告訴它哪個維度是性別）。但
 * 「意思＝方向、相似＝餘弦」這個幾何是真的，而且與真實模型一致。
 *
 * 為了模擬真實嵌入「只是近似成立」，每個詞另加了一點固定的、每個詞獨有的
 * 「個性雜訊」(residual)。這讓「不排除輸入詞時，最近鄰常是輸入詞本身」這個
 * 著名 caveat 會自然浮現（見 Nissim et al. 2020、Linzen 2016）。
 * ==========================================================================*/
(function () {
  'use strict';

  /* ---------------------------------------------------------------------- *
   *  1. 引擎（純函式，不碰 DOM；可被 node 直接 require 測試）
   * ---------------------------------------------------------------------- */

  // 決定性 PRNG（mulberry32）+ 字串雜湊 → 每個詞產生固定的殘差
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // 詞表：[id, 中文, 英文, 類別, 特徵]
  var WORDS = [
    ['man', '男人', 'man', 'person', { g: +1 }],
    ['woman', '女人', 'woman', 'person', { g: -1 }],
    ['king', '國王', 'king', 'royal', { g: +1, roy: 'K' }],
    ['queen', '皇后', 'queen', 'royal', { g: -1, roy: 'K' }],
    ['prince', '王子', 'prince', 'royal', { g: +1, roy: 'P' }],
    ['princess', '公主', 'princess', 'royal', { g: -1, roy: 'P' }],
    ['boy', '男孩', 'boy', 'person', { g: +1, age: 'child' }],
    ['girl', '女孩', 'girl', 'person', { g: -1, age: 'child' }],
    ['father', '父親', 'father', 'person', { g: +1, adult: 1, parent: 1 }],
    ['mother', '母親', 'mother', 'person', { g: -1, adult: 1, parent: 1 }],
    ['son', '兒子', 'son', 'person', { g: +1, age: 'child', offspring: 1 }],
    ['daughter', '女兒', 'daughter', 'person', { g: -1, age: 'child', offspring: 1 }],
    ['actor', '男演員', 'actor', 'person', { g: +1, actingRole: 1 }],
    ['actress', '女演員', 'actress', 'person', { g: -1, actingRole: 1 }],
    ['big', '大', 'big', 'compare', { pol: +1, topic: 'size' }],
    ['small', '小', 'small', 'compare', { pol: -1, topic: 'size' }],
    ['many', '多', 'many', 'compare', { pol: +1, topic: 'qty' }],
    ['few', '少', 'few', 'compare', { pol: -1, topic: 'qty' }],
    ['tall', '高', 'tall', 'compare', { pol: +1, topic: 'height' }],
    ['short', '矮', 'short', 'compare', { pol: -1, topic: 'height' }],
    ['hot', '熱', 'hot', 'compare', { pol: +1, topic: 'temp' }],
    ['cold', '冷', 'cold', 'compare', { pol: -1, topic: 'temp' }],
    ['fast', '快', 'fast', 'compare', { pol: +1, topic: 'speed' }],
    ['slow', '慢', 'slow', 'compare', { pol: -1, topic: 'speed' }],
    ['strong', '強', 'strong', 'compare', { pol: +1, topic: 'strength' }],
    ['weak', '弱', 'weak', 'compare', { pol: -1, topic: 'strength' }],
    ['bright', '亮', 'bright', 'compare', { pol: +1, topic: 'bright' }],
    ['dark', '暗', 'dark', 'compare', { pol: -1, topic: 'bright' }],
    ['new', '新', 'new', 'compare', { pol: +1, topic: 'novel' }],
    ['old', '舊', 'old', 'compare', { pol: -1, topic: 'novel' }],
    ['france', '法國', 'France', 'place', { nation: 'fr' }],
    ['paris', '巴黎', 'Paris', 'place', { nation: 'fr', cap: 1 }],
    ['italy', '義大利', 'Italy', 'place', { nation: 'it' }],
    ['rome', '羅馬', 'Rome', 'place', { nation: 'it', cap: 1 }],
    ['japan', '日本', 'Japan', 'place', { nation: 'jp' }],
    ['tokyo', '東京', 'Tokyo', 'place', { nation: 'jp', cap: 1 }],
    ['germany', '德國', 'Germany', 'place', { nation: 'de' }],
    ['berlin', '柏林', 'Berlin', 'place', { nation: 'de', cap: 1 }],
    ['spain', '西班牙', 'Spain', 'place', { nation: 'es' }],
    ['madrid', '馬德里', 'Madrid', 'place', { nation: 'es', cap: 1 }],
    ['china', '中國', 'China', 'place', { nation: 'cn' }],
    ['beijing', '北京', 'Beijing', 'place', { nation: 'cn', cap: 1 }],
    ['go', '去', 'go', 'verb', { verb: 'go' }],
    ['went', '去過', 'went', 'verb', { verb: 'go', tense: 1 }],
    ['eat', '吃', 'eat', 'verb', { verb: 'eat' }],
    ['ate', '吃過', 'ate', 'verb', { verb: 'eat', tense: 1 }],
    ['see', '看', 'see', 'verb', { verb: 'see' }],
    ['saw', '看過', 'saw', 'verb', { verb: 'see', tense: 1 }],
    ['run', '跑', 'run', 'verb', { verb: 'run' }],
    ['ran', '跑過', 'ran', 'verb', { verb: 'run', tense: 1 }],
    ['write', '寫', 'write', 'verb', { verb: 'write' }],
    ['wrote', '寫過', 'wrote', 'verb', { verb: 'write', tense: 1 }],
    ['cat', '貓', 'cat', 'thing', { thing: 'cat' }],
    ['cats', '貓群', 'cats', 'thing', { thing: 'cat', plural: 1 }],
    ['dog', '狗', 'dog', 'thing', { thing: 'dog' }],
    ['dogs', '狗群', 'dogs', 'thing', { thing: 'dog', plural: 1 }],
    ['car', '車', 'car', 'thing', { thing: 'car' }],
    ['cars', '車隊', 'cars', 'thing', { thing: 'car', plural: 1 }],
    ['apple', '蘋果', 'apple', 'thing', { thing: 'apple' }],
    ['apples', '蘋果堆', 'apples', 'thing', { thing: 'apple', plural: 1 }],
    ['engineer', '工程師', 'engineer', 'prof', { prof: 'engineer' }],
    ['nurse', '護理師', 'nurse', 'prof', { prof: 'nurse' }],
    ['doctor', '醫生', 'doctor', 'prof', { prof: 'doctor' }],
    ['teacher', '老師', 'teacher', 'prof', { prof: 'teacher' }],
    ['chef', '主廚', 'chef', 'prof', { prof: 'chef' }],
    ['nanny', '保母', 'nanny', 'prof', { prof: 'nanny' }]
  ];

  // 建構參數（經測試調校，保證所有示範類比由建構成立，並讓 caveat 自然浮現）
  var PARAMS = {
    base: 9, gender: 0.62, royP: 2.1, royK: 4.2, age: 1.15, parent: 1.25,
    role: 1.6, pol: 0.85, topic: 3.0, nation: 3.4, cap: 2.4, verb: 3.0,
    tense: 1.5, thing: 3.0, plural: 1.5, prof: 3.0, lean: 0.9, res: 1.15, resDims: 6
  };

  // 職業的性別傾向：只有在「有偏見的語料」模式才會套用到共用的性別維度上。
  // 這正是重點——幾何是中性的，是資料把性別和職業綁在一起。
  var GENDER_LEAN = { engineer: +1, doctor: +1, nurse: -1, nanny: -1, teacher: 0, chef: +1 };

  function build(P, opts) {
    opts = opts || {};
    var dims = [], idx = {};
    function dim(name) { if (!(name in idx)) { idx[name] = dims.length; dims.push(name); } return idx[name]; }
    dim('_base');
    ['g', 'roy_P', 'roy_K', 'age_child', 'adult', 'parent', 'offspring', 'actingRole', 'pol'].forEach(dim);
    ['size', 'qty', 'height', 'temp', 'speed', 'strength', 'bright', 'novel'].forEach(function (t) { dim('topic_' + t); });
    ['fr', 'it', 'jp', 'de', 'es', 'cn'].forEach(function (t) { dim('nation_' + t); });
    dim('cap');
    ['go', 'eat', 'see', 'run', 'write'].forEach(function (t) { dim('verb_' + t); });
    dim('tense');
    ['cat', 'dog', 'car', 'apple'].forEach(function (t) { dim('thing_' + t); });
    dim('plural');
    ['engineer', 'nurse', 'doctor', 'teacher', 'chef', 'nanny'].forEach(function (t) { dim('prof_' + t); });
    var RES = P.resDims;
    for (var r = 0; r < RES; r++) dim('_res' + r);
    var D = dims.length;
    var vecs = {}, meta = {};
    for (var w = 0; w < WORDS.length; w++) {
      var row = WORDS[w], id = row[0], f = row[4];
      var v = new Float64Array(D);
      v[idx['_base']] = P.base;
      if (f.g) v[idx['g']] = P.gender * f.g;
      if (f.roy === 'P') v[idx['roy_P']] = P.royP;
      if (f.roy === 'K') v[idx['roy_K']] = P.royK;
      if (f.age === 'child') v[idx['age_child']] = -P.age;
      if (f.adult) v[idx['adult']] = P.age * f.adult;
      if (f.parent) v[idx['parent']] = P.parent * f.parent;
      if (f.offspring) v[idx['offspring']] = P.parent * f.offspring;
      if (f.actingRole) v[idx['actingRole']] = P.role * f.actingRole;
      if (f.pol) v[idx['pol']] = P.pol * f.pol;
      if (f.topic) v[idx['topic_' + f.topic]] = P.topic;
      if (f.nation) v[idx['nation_' + f.nation]] = P.nation;
      if (f.cap) v[idx['cap']] = P.cap * f.cap;
      if (f.verb) v[idx['verb_' + f.verb]] = P.verb;
      if (f.tense) v[idx['tense']] = P.tense * f.tense;
      if (f.thing) v[idx['thing_' + f.thing]] = P.thing;
      if (f.plural) v[idx['plural']] = P.plural * f.plural;
      if (f.prof) v[idx['prof_' + f.prof]] = P.prof;
      if (opts.biased && f.prof && GENDER_LEAN[f.prof]) v[idx['g']] += P.lean * GENDER_LEAN[f.prof];
      // 每個詞獨有的固定殘差（模擬真實嵌入只是近似成立）
      var rng = mulberry32(hashStr('res|' + id));
      var rv = [], n = 0;
      for (var k = 0; k < RES; k++) { var x = gauss(rng); rv.push(x); n += x * x; }
      n = Math.sqrt(n) || 1;
      for (var k2 = 0; k2 < RES; k2++) v[idx['_res' + k2]] = P.res * rv[k2] / n;
      vecs[id] = v;
      meta[id] = { id: id, zh: row[1], en: row[2], cat: row[3] };
    }
    return { dims: dims, idx: idx, D: D, vecs: vecs, meta: meta, ids: WORDS.map(function (x) { return x[0]; }) };
  }

  // 向量代數
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function cosine(a, b) { var na = norm(a), nb = norm(b); if (na === 0 || nb === 0) return 0; return dot(a, b) / (na * nb); }
  function sub(a, b) { var r = new Float64Array(a.length); for (var i = 0; i < a.length; i++) r[i] = a[i] - b[i]; return r; }
  function combine(a, b, c) { var r = new Float64Array(a.length); for (var i = 0; i < a.length; i++) r[i] = a[i] - b[i] + c[i]; return r; }
  function unit(a) { var n = norm(a) || 1; var r = new Float64Array(a.length); for (var i = 0; i < a.length; i++) r[i] = a[i] / n; return r; }

  var MODEL = build(PARAMS, {});
  var MODEL_BIASED = build(PARAMS, { biased: true });

  function nearest(M, vec, k, exclude) {
    exclude = exclude || {};
    var arr = [];
    for (var i = 0; i < M.ids.length; i++) {
      var id = M.ids[i];
      if (exclude[id]) continue;
      arr.push([id, cosine(vec, M.vecs[id])]);
    }
    arr.sort(function (x, y) { return y[1] - x[1]; });
    return arr.slice(0, k);
  }

  // A − B + C 的類比。excludeInputs 為 true 時排除 a,b,c（標準做法）。
  function analogy(M, a, b, c, k, excludeInputs) {
    var vec = combine(M.vecs[a], M.vecs[b], M.vecs[c]);
    var ex = {};
    if (excludeInputs) { ex[a] = 1; ex[b] = 1; ex[c] = 1; }
    return { vec: vec, top: nearest(M, vec, k, ex) };
  }

  // 去掉「非語意」維度（base 與殘差），得到純語意方向 —— 給 2D 投影與座標軸標籤用
  function isNoiseDim(name) { return name === '_base' || name.indexOf('_res') === 0; }
  function cleanDiff(M, a, b) {
    var r = sub(M.vecs[a], M.vecs[b]);
    for (var i = 0; i < M.D; i++) if (isNoiseDim(M.dims[i])) r[i] = 0;
    return r;
  }

  // 由多組平行詞對平均出的「概念方向」（純語意版），如同 Bolukbasi 用多對詞估性別子空間
  function avgAxis(M, pairs) {
    var acc = new Float64Array(M.D);
    for (var p = 0; p < pairs.length; p++) {
      var d = cleanDiff(M, pairs[p][0], pairs[p][1]);
      var u = unit(d);
      for (var i = 0; i < M.D; i++) acc[i] += u[i];
    }
    return unit(acc);
  }
  var CONCEPT_PAIRS = {
    gender: [['man', 'woman'], ['king', 'queen'], ['boy', 'girl'], ['father', 'mother'], ['actor', 'actress'], ['prince', 'princess'], ['son', 'daughter']],
    royalty: [['king', 'man'], ['queen', 'woman'], ['prince', 'man'], ['princess', 'woman']],
    age: [['boy', 'man'], ['girl', 'woman'], ['son', 'father'], ['daughter', 'mother']],
    tense: [['went', 'go'], ['ate', 'eat'], ['saw', 'see'], ['ran', 'run'], ['wrote', 'write']],
    number: [['cats', 'cat'], ['dogs', 'dog'], ['cars', 'car'], ['apples', 'apple']],
    capital: [['paris', 'france'], ['rome', 'italy'], ['tokyo', 'japan'], ['berlin', 'germany'], ['madrid', 'spain'], ['beijing', 'china']],
    degree: [['big', 'small'], ['many', 'few'], ['tall', 'short'], ['hot', 'cold'], ['fast', 'slow'], ['strong', 'weak'], ['bright', 'dark'], ['new', 'old']]
  };
  var CONCEPT_LABEL = { gender: '性別', royalty: '皇室', age: '年齡', tense: '時態', number: '複數', capital: '首都', degree: '程度' };
  var CONCEPT_AXES = {};
  Object.keys(CONCEPT_PAIRS).forEach(function (k) { CONCEPT_AXES[k] = avgAxis(MODEL, CONCEPT_PAIRS[k]); });

  // 職業在性別軸上的投影（偏見這面鏡子）。以乾淨模型的性別方向為基準。
  function genderProjection(id, biased) {
    var axis = CONCEPT_AXES.gender; // 指向「男性」
    var M = biased ? MODEL_BIASED : MODEL;
    return dot(M.vecs[id], axis);
  }

  // 全體語意 PCA（power iteration + deflation），給語意地圖用
  function pcaSemantic(M) {
    var ids = M.ids, n = ids.length, D = M.D;
    var keep = M.dims.map(function (nm) { return !isNoiseDim(nm); });
    var mean = new Float64Array(D), i, id, rr;
    for (i = 0; i < n; i++) { var v = M.vecs[ids[i]]; for (var j = 0; j < D; j++) if (keep[j]) mean[j] += v[j]; }
    for (i = 0; i < D; i++) mean[i] /= n;
    var X = [];
    for (i = 0; i < n; i++) { var vv = M.vecs[ids[i]]; rr = new Float64Array(D); for (var j2 = 0; j2 < D; j2++) rr[j2] = keep[j2] ? (vv[j2] - mean[j2]) : 0; X.push(rr); }
    function covMul(vec) {
      var out = new Float64Array(D);
      for (var r = 0; r < n; r++) { var d = 0, row = X[r]; for (var a = 0; a < D; a++) d += row[a] * vec[a]; for (var b = 0; b < D; b++) out[b] += row[b] * d; }
      for (var c = 0; c < D; c++) out[c] /= n; return out;
    }
    function pIter(defl) {
      var v = new Float64Array(D), s = mulberry32(2024), it;
      for (var q = 0; q < D; q++) v[q] = s() - 0.5;
      for (it = 0; it < 400; it++) {
        var wv = covMul(v);
        if (defl) { var dd = dot(wv, defl); for (var t = 0; t < D; t++) wv[t] -= dd * defl[t]; }
        var nn = norm(wv) || 1; for (var u2 = 0; u2 < D; u2++) wv[u2] /= nn; v = wv;
      }
      return v;
    }
    var p1 = pIter(null), p2 = pIter(p1);
    var pts = {};
    for (i = 0; i < n; i++) pts[ids[i]] = [dot(X[i], p1), dot(X[i], p2)];
    return pts;
  }
  var PCA = pcaSemantic(MODEL);

  // 焦點圖投影：以類比自己的兩個語意位移為軸（B→A、B→C），Gram-Schmidt 正交化。
  // 平行四邊形在任何線性投影下都會閉合；用純語意軸時，箭頭尖端正好落在答案上。
  function focusProject(M, a, b, c, extraIds) {
    var e1 = unit(cleanDiff(M, a, b));
    var e2 = cleanDiff(M, c, b);
    var d = dot(e2, e1);
    for (var i = 0; i < M.D; i++) e2[i] -= d * e1[i];
    var n2 = norm(e2) || 1;
    for (var j = 0; j < M.D; j++) e2[j] /= n2;
    var origin = M.vecs[b];
    function proj(v) { var t = sub(v, origin); return [dot(t, e1), dot(t, e2)]; }
    var ids = [a, b, c].concat(extraIds || []);
    var out = { pts: {}, };
    ids.forEach(function (id) { out.pts[id] = proj(M.vecs[id]); });
    out.query = proj(combine(M.vecs[a], M.vecs[b], M.vecs[c]));
    out.labelX = axisLabel(cleanDiff(M, a, b), b, a);
    out.labelY = axisLabel(cleanDiff(M, c, b), b, c);
    return out;
  }
  function axisLabel(off, bId, aId) {
    var u = unit(off), best = null, bc = 0;
    Object.keys(CONCEPT_AXES).forEach(function (k) {
      var cc = dot(u, CONCEPT_AXES[k]);
      if (Math.abs(cc) > Math.abs(bc)) { bc = cc; best = k; }
    });
    if (Math.abs(bc) > 0.5) return CONCEPT_LABEL[best];
    return null; // 交由呼叫端顯示「詞→詞」
  }

  var Engine = {
    PARAMS: PARAMS,
    ids: MODEL.ids,
    meta: MODEL.meta,
    dims: MODEL.dims,
    vec: function (id) { return MODEL.vecs[id]; },
    vecBiased: function (id) { return MODEL_BIASED.vecs[id]; },
    cosine: cosine,
    cosIds: function (a, b) { return cosine(MODEL.vecs[a], MODEL.vecs[b]); },
    analogy: function (a, b, c, opts) {
      opts = opts || {};
      var M = opts.biased ? MODEL_BIASED : MODEL;
      return analogy(M, a, b, c, opts.k || 5, opts.exclude !== false).top;
    },
    analogyVec: function (a, b, c, biased) { var M = biased ? MODEL_BIASED : MODEL; return combine(M.vecs[a], M.vecs[b], M.vecs[c]); },
    nearestToVec: function (vec, k, excludeSet, biased) { return nearest(biased ? MODEL_BIASED : MODEL, vec, k, excludeSet || {}); },
    nearestById: function (id, k) { var ex = {}; ex[id] = 1; return nearest(MODEL, MODEL.vecs[id], k, ex); },
    conceptAxes: CONCEPT_AXES,
    conceptLabel: CONCEPT_LABEL,
    genderProjection: genderProjection,
    projectOn: function (id, axisKey, biased) {
      var M = biased ? MODEL_BIASED : MODEL;
      if (axisKey === 'pca1') return PCA[id][0];
      if (axisKey === 'pca2') return PCA[id][1];
      return dot(M.vecs[id], CONCEPT_AXES[axisKey]);
    },
    pca: PCA,
    focusProject: function (a, b, c, extra, biased) { return focusProject(biased ? MODEL_BIASED : MODEL, a, b, c, extra); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  if (typeof window !== 'undefined') window.__VEC_ENGINE__ = Engine;

  /* ---------------------------------------------------------------------- *
   *  2. UI（僅在瀏覽器執行）
   * ---------------------------------------------------------------------- */
  if (typeof document === 'undefined') return;

  var LS = 'vec.';
  function lsGet(k, d) { try { var v = localStorage.getItem(LS + k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, v); } catch (e) { } }

  // 動態偏好（含 matchMedia change 監聽）
  var reduceMotion = false;
  (function () {
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mq.matches;
    var handler = function (e) { reduceMotion = e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  })();

  var CAT_COLOR = {
    person: '#8b9cff', royal: '#f5c86b', place: '#5fe3cf',
    verb: '#f39ac0', thing: '#a9e888', compare: '#c39bf2', prof: '#ff9f7a'
  };
  var CAT_NAME = {
    person: '人物', royal: '皇室', place: '地理', verb: '動作／時態',
    thing: '物品／複數', compare: '比較詞', prof: '職業'
  };

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'aria') Object.keys(attrs[k]).forEach(function (a) { e.setAttribute('aria-' + a, attrs[k][a]); });
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function fmt(x) { return (x >= 0 ? '' : '−') + Math.abs(x).toFixed(3); }

  // rAF 動畫：分頁隱藏或元素離屏時，直接跳到終態
  function animate(dur, isAlive, step, done) {
    if (reduceMotion || !isAlive()) { step(1); if (done) done(); return; }
    var t0 = null, raf;
    function frame(ts) {
      if (document.hidden || !isAlive()) { step(1); if (done) done(); return; }
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic
      step(e);
      if (p < 1) raf = requestAnimationFrame(frame); else if (done) done();
    }
    raf = requestAnimationFrame(frame);
  }

  // 數字滾動
  function rollNumber(node, from, to, isAlive) {
    animate(520, isAlive, function (e) { node.textContent = fmt(from + (to - from) * e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var stageVisible = {}; // 各區塊是否在視窗內
    buildMachine();
    buildMap();
    buildHonest();
    setupReveal();
  });

  /* ---- 進場 stagger ---- */
  function setupReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (it) { it.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) {
          var d = parseFloat(en.target.getAttribute('data-delay') || '0');
          en.target.style.transitionDelay = Math.min(d, 1.2) + 's';
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach(function (it) { io.observe(it); });
  }

  /* ====================================================================== *
   *  語意算術機
   * ====================================================================== */
  var EX_EXAMPLES = [
    { a: 'king', b: 'man', c: 'woman', tag: '皇室 × 性別' },
    { a: 'paris', b: 'france', c: 'italy', tag: '國家 → 首都' },
    { a: 'cats', b: 'cat', c: 'dog', tag: '單 → 複數' },
    { a: 'big', b: 'small', c: 'few', tag: '大小 → 多少' },
    { a: 'went', b: 'go', c: 'eat', tag: '現在 → 過去' },
    { a: 'prince', b: 'boy', c: 'girl', tag: '王子 → 公主' }
  ];

  var machine = {};
  function buildMachine() {
    var mount = document.getElementById('machine-mount');
    if (!mount) return;

    // 三個運算元
    function operand(sign, key, initial) {
      var sel = el('select', { class: 'op-select', id: 'op-' + key, aria: { label: key + ' 詞' } });
      var byCat = {};
      Engine.ids.forEach(function (id) { var m = Engine.meta[id]; (byCat[m.cat] = byCat[m.cat] || []).push(id); });
      Object.keys(CAT_NAME).forEach(function (cat) {
        if (!byCat[cat]) return;
        var og = el('optgroup', { label: CAT_NAME[cat] });
        byCat[cat].forEach(function (id) {
          var m = Engine.meta[id];
          var o = el('option', { value: id, text: m.zh + '　' + m.en });
          if (id === initial) o.selected = true;
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      sel.addEventListener('change', function () { recompute(true); });
      var chip = el('div', { class: 'operand' }, [
        sign ? el('span', { class: 'op-sign', text: sign, aria: { hidden: 'true' } }) : null,
        el('div', { class: 'op-chip' }, [sel])
      ]);
      return chip;
    }

    var saved = null;
    try { saved = JSON.parse(lsGet('lastAnalogy', 'null')); } catch (e) { }
    var init = saved && saved.a && Engine.meta[saved.a] ? saved : { a: 'king', b: 'man', c: 'woman' };

    var row = el('div', { class: 'calc-row' }, [
      operand('', 'a', init.a),
      operand('−', 'b', init.b),
      operand('+', 'c', init.c),
      el('span', { class: 'op-sign eq', text: '=', aria: { hidden: 'true' } }),
      el('div', { class: 'answer-slot', id: 'answer-slot' }, [
        el('div', { class: 'answer-zh', id: 'answer-zh', text: '—' }),
        el('div', { class: 'answer-en', id: 'answer-en', text: '' }),
        el('div', { class: 'answer-score', id: 'answer-score', text: '' })
      ])
    ]);

    var exWrap = el('div', { class: 'examples', role: 'group', aria: { label: '一鍵範例' } });
    EX_EXAMPLES.forEach(function (ex) {
      var m = Engine.meta;
      var btn = el('button', {
        class: 'ex-btn', type: 'button',
        onclick: function () { setOperands(ex.a, ex.b, ex.c); }
      }, [
        el('span', { class: 'ex-eq', text: m[ex.a].zh + ' − ' + m[ex.b].zh + ' + ' + m[ex.c].zh }),
        el('span', { class: 'ex-tag', text: ex.tag })
      ]);
      exWrap.appendChild(btn);
    });

    var toggle = el('label', { class: 'excl-toggle' }, [
      (function () {
        var cb = el('input', { type: 'checkbox', id: 'excl-cb' });
        cb.checked = lsGet('excludeInputs', '1') === '1';
        cb.addEventListener('change', function () { lsSet('excludeInputs', cb.checked ? '1' : '0'); recompute(true); });
        machine.excl = cb; return cb;
      })(),
      el('span', { class: 'excl-track', aria: { hidden: 'true' } }, [el('span', { class: 'excl-thumb' })]),
      el('span', { text: '排除輸入詞（標準做法）' })
    ]);

    var canvas = el('canvas', { id: 'focus-canvas', class: 'focus-canvas', role: 'img', aria: { label: '語意算術的二維投影圖' } });
    var neighbors = el('ol', { class: 'neighbors', id: 'neighbors', aria: { live: 'polite', label: '最近鄰結果' } });
    var note = el('p', { class: 'excl-note', id: 'excl-note', aria: { live: 'polite' } });

    mount.appendChild(el('div', { class: 'calc-card', 'data-reveal': '1' }, [
      row,
      el('div', { class: 'excl-line' }, [toggle]),
      el('div', { class: 'calc-body' }, [
        el('div', { class: 'plot-wrap' }, [canvas, el('div', { class: 'plot-cap', id: 'plot-cap', text: '' })]),
        el('div', { class: 'nb-wrap' }, [
          el('div', { class: 'nb-head', text: '最近鄰（餘弦相似度）' }),
          neighbors, note
        ])
      ]),
      el('div', { class: 'ex-head', text: '一鍵試試' }),
      exWrap
    ]));

    machine.canvas = canvas;
    machine.neighbors = neighbors;
    machine.note = note;

    // 視窗內偵測（離屏暫停動畫）
    machine.alive = true;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (e) { machine.alive = e[0].isIntersecting; }, { threshold: 0 });
      io.observe(canvas);
    }
    window.addEventListener('resize', debounce(function () { drawFocus(machine.last, false); }, 150));
    document.addEventListener('visibilitychange', function () { if (!document.hidden && machine.last) drawFocus(machine.last, false); });

    recompute(false);
  }

  function getOperand(k) { return document.getElementById('op-' + k).value; }
  function setOperands(a, b, c) {
    document.getElementById('op-a').value = a;
    document.getElementById('op-b').value = b;
    document.getElementById('op-c').value = c;
    recompute(true);
  }

  function recompute(animateFlag) {
    var a = getOperand('a'), b = getOperand('b'), c = getOperand('c');
    var exclude = machine.excl.checked;
    lsSet('lastAnalogy', JSON.stringify({ a: a, b: b, c: c }));

    var top = Engine.analogy(a, b, c, { exclude: exclude, k: 6 });
    var ansId = top[0][0], ansScore = top[0][1];
    var m = Engine.meta;

    // 答案卡
    var azh = document.getElementById('answer-zh'), aen = document.getElementById('answer-en'), asc = document.getElementById('answer-score');
    azh.textContent = m[ansId].zh; aen.textContent = m[ansId].en;
    var prev = machine.lastScore == null ? ansScore : machine.lastScore;
    asc.textContent = fmt(prev);
    rollNumber(asc, prev, ansScore, function () { return machine.alive; });
    machine.lastScore = ansScore;

    var slot = document.getElementById('answer-slot');
    slot.style.setProperty('--acol', CAT_COLOR[m[ansId].cat]);
    if (!reduceMotion && machine.alive) { slot.classList.remove('pop'); void slot.offsetWidth; slot.classList.add('pop'); }

    // 最近鄰列表（FLIP 重排）
    renderNeighbors(top, [a, b, c], exclude);

    // 誠實提示
    var note = machine.note;
    var isInput = (a === ansId || b === ansId || c === ansId);
    if (!exclude && isInput) {
      note.innerHTML = '注意：<b>不排除輸入詞</b>時，最接近的其實是輸入詞 <b>「' + m[ansId].zh + '」</b>自己。這正是著名的 caveat——' +
        '漂亮的類比結果，往往是把三個輸入詞排除後才得到的。';
      note.classList.add('show');
    } else if (!exclude && !isInput) {
      note.innerHTML = '這組類比即使不排除輸入詞也很穩健（位移夠大）。並不是每個類比都會被輸入詞「霸佔」。';
      note.classList.add('show');
    } else {
      note.classList.remove('show'); note.textContent = '';
    }

    // 焦點圖
    var extra = top.map(function (t) { return t[0]; }).filter(function (id) { return [a, b, c, ansId].indexOf(id) < 0; }).slice(0, 3);
    var fp = Engine.focusProject(a, b, c, [ansId].concat(extra));
    machine.last = { a: a, b: b, c: c, ansId: ansId, fp: fp, exclude: exclude, extra: extra };
    drawFocus(machine.last, animateFlag);

    var cap = document.getElementById('plot-cap');
    var lx = fp.labelX || (m[b].zh + '→' + m[a].zh);
    var ly = fp.labelY || (m[b].zh + '→' + m[c].zh);
    cap.innerHTML = '橫軸：<b>' + lx + '</b>　直軸：<b>' + ly + '</b>　·　箭頭把「' + m[b].zh + '→' + m[c].zh + '」的方向平移到「' + m[a].zh + '」上';
  }

  function renderNeighbors(top, inputs, exclude) {
    var list = machine.neighbors;
    var m = Engine.meta;
    var maxScore = top[0][1];
    // FLIP：記錄舊位置
    var firstPos = {};
    Array.prototype.forEach.call(list.children, function (li) { firstPos[li.getAttribute('data-id')] = li.getBoundingClientRect().top; });

    var frag = document.createDocumentFragment();
    top.slice(0, 6).forEach(function (t, i) {
      var id = t[0], score = t[1];
      var isInput = inputs.indexOf(id) >= 0;
      var li = el('li', { class: 'nb' + (i === 0 ? ' top' : '') + (isInput ? ' input' : ''), 'data-id': id });
      li.style.setProperty('--c', CAT_COLOR[m[id].cat]);
      var frac = Math.max(0, (score - 0.5) / 0.5); // 0.5..1 → 0..1，放大視覺差異
      li.appendChild(el('span', { class: 'nb-rank', text: String(i + 1) }));
      li.appendChild(el('span', { class: 'nb-word' }, [
        el('b', { text: m[id].zh }), el('i', { text: m[id].en }),
        isInput ? el('span', { class: 'nb-flag', text: '輸入詞' }) : null
      ]));
      var bar = el('span', { class: 'nb-bar' }, [el('span', { class: 'nb-fill' })]);
      li.appendChild(bar);
      li.appendChild(el('span', { class: 'nb-score', text: fmt(score) }));
      li.addEventListener('click', function () { pulseWord(id); });
      frag.appendChild(li);
      li._frac = frac;
    });
    list.innerHTML = '';
    list.appendChild(frag);

    // 觸發 bar 動畫 + FLIP
    Array.prototype.forEach.call(list.children, function (li) {
      var fill = li.querySelector('.nb-fill');
      var target = li._frac;
      if (reduceMotion || !machine.alive) { fill.style.transform = 'scaleX(' + target + ')'; }
      else { fill.style.transform = 'scaleX(0)'; requestAnimationFrame(function () { fill.style.transform = 'scaleX(' + target + ')'; }); }
      var id = li.getAttribute('data-id');
      if (!reduceMotion && machine.alive && firstPos[id] != null) {
        var last = li.getBoundingClientRect().top;
        var dy = firstPos[id] - last;
        if (Math.abs(dy) > 1) {
          li.style.transform = 'translateY(' + dy + 'px)';
          li.style.transition = 'none';
          requestAnimationFrame(function () {
            li.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
            li.style.transform = '';
          });
        }
      }
    });
  }

  function pulseWord(id) {
    // 點列表詞 → 帶入為 A，便於連續探索
    document.getElementById('op-a').value = id;
    recompute(true);
  }

  /* ---- 焦點圖繪製（canvas） ---- */
  function drawFocus(state, doAnim) {
    if (!state) return;
    var canvas = machine.canvas, ctx = canvas.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cssW = canvas.clientWidth || 460, cssH = canvas.clientHeight || 360;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var m = Engine.meta, fp = state.fp;
    var ids = [state.b, state.a, state.c, state.ansId].concat(state.extra);
    var uniq = []; ids.forEach(function (id) { if (uniq.indexOf(id) < 0) uniq.push(id); });

    // 座標範圍
    var xs = [fp.query[0]], ys = [fp.query[1]];
    uniq.forEach(function (id) { xs.push(fp.pts[id][0]); ys.push(fp.pts[id][1]); });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs);
    var miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var padX = (maxx - minx) * 0.22 + 0.6, padY = (maxy - miny) * 0.28 + 0.6;
    minx -= padX; maxx += padX; miny -= padY; maxy += padY;
    var padPix = 42;
    function X(v) { return padPix + (v - minx) / (maxx - minx || 1) * (cssW - 2 * padPix); }
    function Y(v) { return cssH - padPix - (v - miny) / (maxy - miny || 1) * (cssH - 2 * padPix); }

    var pB = fp.pts[state.b], pA = fp.pts[state.a], pC = fp.pts[state.c], pQ = fp.query, pAns = fp.pts[state.ansId];

    function render(prog) {
      ctx.clearRect(0, 0, cssW, cssH);
      // 底格線
      ctx.strokeStyle = 'rgba(150,160,200,0.10)'; ctx.lineWidth = 1;
      for (var gx = Math.ceil(minx); gx <= maxx; gx++) { ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), cssH); ctx.stroke(); }
      for (var gy = Math.ceil(miny); gy <= maxy; gy++) { ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(cssW, Y(gy)); ctx.stroke(); }

      // 平行四邊形參考虛線（B,A,query,C）
      ctx.strokeStyle = 'rgba(150,160,200,0.22)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(X(pB[0]), Y(pB[1])); ctx.lineTo(X(pA[0]), Y(pA[1]));
      ctx.lineTo(X(pQ[0]), Y(pQ[1])); ctx.lineTo(X(pC[0]), Y(pC[1])); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);

      // 位移箭頭 B→C（性別/關係方向）
      arrow(ctx, X(pB[0]), Y(pB[1]), X(pC[0]), Y(pC[1]), 'rgba(150,160,200,0.55)', 1.6);
      // 平移到 A 的箭頭 A→query（重點！），依 prog 逐步生長
      var ex = pA[0] + (pQ[0] - pA[0]) * prog, ey = pA[1] + (pQ[1] - pA[1]) * prog;
      arrow(ctx, X(pA[0]), Y(pA[1]), X(ex), Y(ey), 'rgba(245,200,107,0.95)', 2.6);

      // 詞點
      uniq.forEach(function (id) {
        var p = fp.pts[id], isAns = id === state.ansId, isInput = [state.a, state.b, state.c].indexOf(id) >= 0;
        drawDot(ctx, X(p[0]), Y(p[1]), CAT_COLOR[m[id].cat], m[id].zh, isAns, isInput);
      });
      // query 落點（答案高亮環）
      if (prog > 0.02) {
        var qx = X(ex), qy = Y(ey);
        ctx.beginPath(); ctx.arc(qx, qy, 7 + 3 * Math.sin(prog * Math.PI), 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(245,200,107,' + (0.9 * prog) + ')'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    if (doAnim && !reduceMotion && machine.alive) {
      animate(760, function () { return machine.alive; }, function (e) { render(e); });
    } else {
      render(1);
    }
  }
  function arrow(ctx, x1, y1, x2, y2, color, w) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    var ang = Math.atan2(y2 - y1, x2 - x1), h = 8 + w;
    if (Math.hypot(x2 - x1, y2 - y1) < 4) return;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - h * Math.cos(ang - 0.4), y2 - h * Math.sin(ang - 0.4));
    ctx.lineTo(x2 - h * Math.cos(ang + 0.4), y2 - h * Math.sin(ang + 0.4));
    ctx.closePath(); ctx.fill();
  }
  function drawDot(ctx, x, y, color, label, isAns, isInput) {
    ctx.beginPath(); ctx.arc(x, y, isAns ? 7 : 5, 0, 2 * Math.PI);
    ctx.fillStyle = color; ctx.globalAlpha = isInput ? 1 : 0.9; ctx.fill(); ctx.globalAlpha = 1;
    if (isAns) { ctx.beginPath(); ctx.arc(x, y, 11, 0, 2 * Math.PI); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.font = (isAns ? '700 ' : '600 ') + '13px system-ui, sans-serif';
    ctx.fillStyle = isAns ? '#fff' : 'rgba(232,236,248,0.86)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, y - (isAns ? 14 : 10));
  }

  /* ====================================================================== *
   *  語意地圖
   * ====================================================================== */
  var mapState = {};
  function buildMap() {
    var mount = document.getElementById('map-mount');
    if (!mount) return;
    var axisOpts = [
      ['pca1', '主成分 1（整體）'], ['pca2', '主成分 2（整體）'],
      ['gender', '性別'], ['royalty', '皇室'], ['age', '年齡'],
      ['tense', '時態'], ['number', '複數'], ['capital', '首都'], ['degree', '程度']
    ];
    function axisSelect(id, def) {
      var s = el('select', { class: 'axis-select', id: id, aria: { label: id === 'map-x' ? '橫軸' : '直軸' } });
      axisOpts.forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); if (o[0] === def) op.selected = true; s.appendChild(op); });
      s.addEventListener('change', function () { lsSet(id, s.value); redrawMap(true); });
      return s;
    }
    var canvas = el('canvas', { id: 'map-canvas', class: 'map-canvas', role: 'img', aria: { label: '所有詞的二維語意地圖，可用滑鼠或鍵盤瀏覽' }, tabindex: '0' });
    var hover = el('div', { class: 'map-hover', id: 'map-hover', aria: { live: 'polite' } });

    var legend = el('div', { class: 'legend' });
    Object.keys(CAT_NAME).forEach(function (cat) {
      legend.appendChild(el('span', { class: 'lg' }, [
        el('span', { class: 'lg-dot', style: 'background:' + CAT_COLOR[cat] }), el('span', { text: CAT_NAME[cat] })
      ]));
    });

    mount.appendChild(el('div', { class: 'map-card', 'data-reveal': '1' }, [
      el('div', { class: 'map-controls' }, [
        el('label', { class: 'axis-lbl' }, [el('span', { text: '橫軸' }), axisSelect('map-x', lsGet('map-x', 'pca1'))]),
        el('label', { class: 'axis-lbl' }, [el('span', { text: '直軸' }), axisSelect('map-y', lsGet('map-y', 'pca2'))]),
        el('span', { class: 'map-tip', text: '提示：換成「首都」「時態」等座標軸，把不同的語意方向拉出來看。' })
      ]),
      el('div', { class: 'map-stage' }, [canvas, hover]),
      legend
    ]));

    mapState.canvas = canvas; mapState.hover = hover;
    mapState.alive = true;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (e) { mapState.alive = e[0].isIntersecting; }, { threshold: 0 });
      io.observe(canvas);
    }
    canvas.addEventListener('mousemove', function (ev) {
      var r = canvas.getBoundingClientRect();
      hoverAt(ev.clientX - r.left, ev.clientY - r.top);
    });
    canvas.addEventListener('mouseleave', function () { mapState.hoverId = null; redrawMap(false); mapState.hover.classList.remove('show'); });
    canvas.addEventListener('click', function () { if (mapState.hoverId) sendToMachine(mapState.hoverId); });
    // 鍵盤瀏覽（方向鍵在詞之間移動；Enter 帶入算術機）
    canvas.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { ev.preventDefault(); stepHover(1); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { ev.preventDefault(); stepHover(-1); }
      else if ((ev.key === 'Enter' || ev.key === ' ') && mapState.hoverId) { ev.preventDefault(); sendToMachine(mapState.hoverId); }
    });
    window.addEventListener('resize', debounce(function () { redrawMap(false); }, 150));
    document.addEventListener('visibilitychange', function () { if (!document.hidden) redrawMap(false); });

    computeMapPositions();
    redrawMap(false);
  }

  function computeMapPositions() {
    var xKey = document.getElementById('map-x').value, yKey = document.getElementById('map-y').value;
    var pos = {};
    Engine.ids.forEach(function (id) { pos[id] = [Engine.projectOn(id, xKey), Engine.projectOn(id, yKey)]; });
    // 正規化到 [0,1]
    var xs = Engine.ids.map(function (id) { return pos[id][0]; }), ys = Engine.ids.map(function (id) { return pos[id][1]; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    Engine.ids.forEach(function (id) {
      pos[id] = [(pos[id][0] - minx) / (maxx - minx || 1), (pos[id][1] - miny) / (maxy - miny || 1)];
    });
    mapState.targetPos = pos;
    if (!mapState.pos) mapState.pos = JSON.parse(JSON.stringify(pos));
  }

  function redrawMap(doAnim) {
    if (!mapState.canvas) return;
    computeMapPositions();
    if (doAnim && !reduceMotion && mapState.alive) {
      var from = mapState.pos, to = mapState.targetPos;
      animate(620, function () { return mapState.alive; }, function (e) {
        var cur = {};
        Engine.ids.forEach(function (id) { cur[id] = [from[id][0] + (to[id][0] - from[id][0]) * e, from[id][1] + (to[id][1] - from[id][1]) * e]; });
        mapState.pos = cur; paintMap();
      }, function () { mapState.pos = to; paintMap(); });
    } else {
      mapState.pos = mapState.targetPos; paintMap();
    }
  }

  function mapPix() {
    var canvas = mapState.canvas;
    var cssW = canvas.clientWidth || 640, cssH = canvas.clientHeight || 420, pad = 34;
    return {
      cssW: cssW, cssH: cssH,
      X: function (v) { return pad + v * (cssW - 2 * pad); },
      Y: function (v) { return cssH - pad - v * (cssH - 2 * pad); }
    };
  }

  function paintMap() {
    var canvas = mapState.canvas, ctx = canvas.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var g = mapPix();
    canvas.width = Math.round(g.cssW * dpr); canvas.height = Math.round(g.cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.cssW, g.cssH);
    var m = Engine.meta, pos = mapState.pos, hoverId = mapState.hoverId;

    // 若 hover，畫出它到最近鄰的連線
    if (hoverId) {
      var nbs = Engine.nearestById(hoverId, 5);
      nbs.forEach(function (t) {
        var p1 = pos[hoverId], p2 = pos[t[0]];
        ctx.strokeStyle = 'rgba(245,200,107,0.35)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(g.X(p1[0]), g.Y(p1[1])); ctx.lineTo(g.X(p2[0]), g.Y(p2[1])); ctx.stroke();
      });
    }
    Engine.ids.forEach(function (id) {
      var p = pos[id], dim = hoverId && hoverId !== id && !isNeighbor(hoverId, id);
      var x = g.X(p[0]), y = g.Y(p[1]);
      ctx.beginPath(); ctx.arc(x, y, id === hoverId ? 6 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = CAT_COLOR[m[id].cat]; ctx.globalAlpha = dim ? 0.28 : 1; ctx.fill(); ctx.globalAlpha = 1;
      if (id === hoverId || !hoverId) {
        ctx.font = (id === hoverId ? '700 ' : '500 ') + '11px system-ui, sans-serif';
        ctx.fillStyle = dim ? 'rgba(232,236,248,0.3)' : 'rgba(232,236,248,0.82)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(m[id].zh, x, y - 6);
      }
    });
  }
  var _nbCache = {};
  function isNeighbor(hid, id) {
    if (!_nbCache[hid]) _nbCache[hid] = Engine.nearestById(hid, 5).map(function (t) { return t[0]; });
    return _nbCache[hid].indexOf(id) >= 0;
  }

  function hoverAt(px, py) {
    var g = mapPix(), pos = mapState.pos, best = null, bd = 1e9;
    Engine.ids.forEach(function (id) {
      var x = g.X(pos[id][0]), y = g.Y(pos[id][1]);
      var d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = id; }
    });
    if (bd > 26) { if (mapState.hoverId) { mapState.hoverId = null; redrawMap(false); mapState.hover.classList.remove('show'); } return; }
    if (best !== mapState.hoverId) { mapState.hoverId = best; paintMap(); showHover(best); }
  }
  function stepHover(dir) {
    var ids = Engine.ids, i = ids.indexOf(mapState.hoverId);
    i = (i + dir + ids.length) % ids.length;
    mapState.hoverId = ids[i]; paintMap(); showHover(ids[i]);
  }
  function showHover(id) {
    var m = Engine.meta, nbs = Engine.nearestById(id, 5);
    var h = mapState.hover;
    h.innerHTML = '';
    h.appendChild(el('div', { class: 'mh-title' }, [
      el('b', { text: m[id].zh }), el('i', { text: m[id].en }),
      el('span', { class: 'mh-cat', style: 'color:' + CAT_COLOR[m[id].cat], text: CAT_NAME[m[id].cat] })
    ]));
    var ul = el('ul', { class: 'mh-list' });
    nbs.forEach(function (t) { ul.appendChild(el('li', {}, [el('span', { text: m[t[0]].zh }), el('em', { text: fmt(t[1]) })])); });
    h.appendChild(el('div', { class: 'mh-sub', text: '最近鄰：' }));
    h.appendChild(ul);
    h.classList.add('show');
  }
  function sendToMachine(id) {
    document.getElementById('op-a').value = id;
    recompute(true);
    var mm = document.getElementById('machine');
    if (mm) mm.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /* ====================================================================== *
   *  誠實時刻：排除輸入詞 + 偏見鏡子
   * ====================================================================== */
  function buildHonest() {
    buildExclusionDemo();
    buildBiasDemo();
  }

  function buildExclusionDemo() {
    var mount = document.getElementById('exclusion-mount');
    if (!mount) return;
    var m = Engine.meta;
    var out = el('div', { class: 'excl-demo-out', id: 'excl-demo-out', aria: { live: 'polite' } });
    function run(exclude) {
      var top = Engine.analogy('king', 'man', 'woman', { exclude: exclude, k: 4 });
      out.innerHTML = '';
      out.appendChild(el('div', { class: 'edo-eq', text: '國王 − 男人 + 女人 ＝ ？' }));
      var ol = el('ol', { class: 'edo-list' });
      top.forEach(function (t, i) {
        var id = t[0], isInput = ['king', 'man', 'woman'].indexOf(id) >= 0;
        ol.appendChild(el('li', { class: (i === 0 ? 'first ' : '') + (isInput ? 'is-input' : '') }, [
          el('span', { text: m[id].zh + ' ' + m[id].en }),
          isInput ? el('span', { class: 'tagi', text: '輸入詞' }) : null,
          el('em', { text: fmt(t[1]) })
        ]));
      });
      out.appendChild(ol);
      var top1 = top[0][0];
      out.appendChild(el('p', {
        class: 'edo-note',
        html: exclude
          ? '排除輸入詞後，第一名是 <b>皇后 queen</b>——這就是課本上漂亮的結果。'
          : '不排除的話，第一名竟然是 <b>國王 king 自己</b>（輸入詞）。位移「男→女」相對很小，起點 king 依然離結果最近。'
      }));
    }
    var toggle = el('div', { class: 'seg', role: 'group', aria: { label: '是否排除輸入詞' } }, [
      el('button', { class: 'seg-btn on', type: 'button', 'data-x': '1', text: '排除輸入詞', onclick: function () { segPick(toggle, this); run(true); } }),
      el('button', { class: 'seg-btn', type: 'button', 'data-x': '0', text: '不排除', onclick: function () { segPick(toggle, this); run(false); } })
    ]);
    mount.appendChild(el('div', { class: 'honest-card', 'data-reveal': '1' }, [toggle, out]));
    run(true);
  }
  function segPick(group, btn) {
    Array.prototype.forEach.call(group.querySelectorAll('.seg-btn'), function (b) { b.classList.remove('on'); });
    btn.classList.add('on');
  }

  function buildBiasDemo() {
    var mount = document.getElementById('bias-mount');
    if (!mount) return;
    var profs = ['engineer', 'doctor', 'chef', 'teacher', 'nurse', 'nanny'];
    var m = Engine.meta;
    var track = el('div', { class: 'bias-track', aria: { hidden: 'true' } }, [
      el('span', { class: 'bias-pole left', text: '← 偏女性' }),
      el('span', { class: 'bias-mid' }),
      el('span', { class: 'bias-pole right', text: '偏男性 →' })
    ]);
    var rows = el('div', { class: 'bias-rows', id: 'bias-rows' });
    var readout = el('div', { class: 'bias-readout', id: 'bias-readout', aria: { live: 'polite' } });
    profs.forEach(function (id) {
      var row = el('div', { class: 'bias-row', 'data-id': id }, [
        el('span', { class: 'bias-name' }, [el('b', { text: m[id].zh }), el('i', { text: m[id].en })]),
        el('span', { class: 'bias-rail' }, [el('span', { class: 'bias-dot', style: 'background:' + CAT_COLOR.prof })])
      ]);
      rows.appendChild(row);
    });

    var cb = el('input', { type: 'checkbox', id: 'bias-cb' });
    cb.checked = lsGet('bias', '0') === '1';
    cb.addEventListener('change', function () { lsSet('bias', cb.checked ? '1' : '0'); paintBias(cb.checked); });
    var toggle = el('label', { class: 'excl-toggle bias-toggle' }, [
      cb, el('span', { class: 'excl-track', aria: { hidden: 'true' } }, [el('span', { class: 'excl-thumb' })]),
      el('span', { text: '套用「有偏見的語料」' })
    ]);

    mount.appendChild(el('div', { class: 'honest-card', 'data-reveal': '1' }, [
      el('div', { class: 'bias-head' }, [toggle]),
      track, rows, readout
    ]));
    biasState = { profs: profs };
    paintBias(cb.checked, false);
  }
  var biasState = null;
  function paintBias(biased, anim) {
    if (!biasState) return;
    var rows = document.getElementById('bias-rows');
    var vals = {};
    biasState.profs.forEach(function (id) { vals[id] = Engine.genderProjection(id, biased); });
    var maxAbs = 1.4;
    Array.prototype.forEach.call(rows.children, function (row) {
      var id = row.getAttribute('data-id'), dot = row.querySelector('.bias-dot');
      var v = Math.max(-maxAbs, Math.min(maxAbs, vals[id]));
      var pct = 50 + (v / maxAbs) * 46;
      dot.style.left = pct + '%';
    });
    var readout = document.getElementById('bias-readout');
    if (biased) {
      readout.innerHTML = '餵進<b>有偏見的語料</b>後，同樣的幾何學到了偏見：工程師、醫生、主廚被推向「男性」端，護理師、保母被推向「女性」端。' +
        '這正是 Bolukbasi 等人（2016）指出的「男人之於工程師，猶如女人之於家庭主婦」。' +
        '<b>這面鏡子照出的是語料裡的刻板印象，是需要被指出並修正的問題，不是事實。</b>';
    } else {
      readout.innerHTML = '目前是<b>中性模型</b>：職業幾乎都落在中線，沒有性別傾向。' +
        '幾何本身是中性的——是資料把「性別」和「職業」綁在一起。打開開關看看差別。';
    }
  }

  /* ---- utils ---- */
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

})();

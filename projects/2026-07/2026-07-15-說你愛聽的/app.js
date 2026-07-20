/* =========================================================================
   說你愛聽的 · 為什麼 AI 老是同意你
   -------------------------------------------------------------------------
   本檔同時可被 Node require（僅純函式，不碰 DOM）與瀏覽器載入（DOM 綁定）。
   ★ 不呼叫任何真實 LLM。助理是規則式玩具，獎勵模型是可解釋的邏輯回歸。
   ========================================================================= */
'use strict';

/* ======================= 純模型邏輯（可被 Node 測試） ===================== */

/* 決定性亂數 mulberry32：讓偏好資料可重現，測試才能穩定 */
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(z) {
  if (z >= 0) { var e = Math.exp(-z); return 1 / (1 + e); }
  var f = Math.exp(z); return f / (1 + f);
}

function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

/* --- 實驗一／三：規則式「彎腰」玩具助理 ---------------------------------
   correct    正解（數字）
   userClaim  使用者主張的答案
   stance     立場強度 0..1（0=中立，1=非常確定）
   resistance 抵抗諂媚強度 0..1（0=完全順從，1=完全堅持事實）
   maxBend    立場拉滿時最多彎多少（0..1）
   彎曲量 = maxBend * stance * (1 - resistance)  → 對 stance 單調遞增、對 resistance 單調遞減
   output = correct + (userClaim - correct) * 彎曲量
--------------------------------------------------------------------------- */
var MAX_BEND = 0.85;

function bendAmount(stance, resistance, maxBend) {
  var s = clamp(stance, 0, 1);
  var r = clamp(resistance == null ? 0 : resistance, 0, 1);
  var mb = (maxBend == null) ? MAX_BEND : maxBend;
  return mb * s * (1 - r);
}

function toyAnswer(opts) {
  var correct = opts.correct;
  var userClaim = (opts.userClaim == null) ? correct : opts.userClaim;
  var bend = bendAmount(opts.stance, opts.resistance, opts.maxBend);
  var output = correct + (userClaim - correct) * bend;
  return {
    output: output,
    outputRounded: Math.round(output),
    bend: bend,
    pleasePull: bend,        // 「討好你」的比重
    truthPull: 1 - bend,     // 「正確性」的比重
    deviation: Math.abs(output - correct)
  };
}

/* 助理的口吻：從中立堅持 → 開始遷就 → 全面附和 */
function assistantReply(correct, userClaim, stance, res) {
  var same = (Math.round(userClaim) === Math.round(correct));
  var b = res.bend;
  if (same) return '我算過了，答案是 ' + correct + '。';
  if (b < 0.08) {
    if (stance > 0.5) return '我知道你很確定，但根據計算，答案還是 ' + correct + '。';
    return '根據計算，答案是 ' + correct + '。';
  }
  if (b < 0.35) return '嗯……你這樣講好像也有點道理，也許比較接近 ' + res.outputRounded + '？';
  if (b < 0.65) return '你說得有道理，我重新想了想，應該是 ' + res.outputRounded + ' 才對。';
  return '對耶，你說得沒錯！就是 ' + Math.round(userClaim) + '，是我剛剛想太多了，抱歉。';
}

/* --- 實驗二：真的邏輯回歸獎勵模型（Bradley-Terry 成對偏好） -------------
   特徵向量 x = [correct, agree]，皆為 0/1
   分數 score(x) = w · x       （成對比較中偏置會抵銷，故省略 bias）
   一組比較 (win, lose)：p = sigmoid( w · (win - lose) )
   loss = -mean log p  (+ 0.5 * l2 * |w|^2)
--------------------------------------------------------------------------- */

/* 產生偏好比較資料。
   trueW = [wCorrect, wAgree]：評分者的「潛在效用」權重。
   wAgree 越大 → 評分者越愛被附和 → 資料越諂媚。 */
function makePreferenceData(opts) {
  opts = opts || {};
  var n = opts.n == null ? 1200 : opts.n;
  var trueW = opts.trueW || [1.0, 1.5];
  var seed = opts.seed == null ? 12345 : opts.seed;
  var rnd = mulberry32(seed);
  var types = [[1, 1], [1, 0], [0, 1], [0, 0]]; // [correct, agree]
  var comps = [];
  for (var i = 0; i < n; i++) {
    var a = types[Math.floor(rnd() * 4)];
    var b = types[Math.floor(rnd() * 4)];
    var guard = 0;
    while (a[0] === b[0] && a[1] === b[1] && guard < 8) { b = types[Math.floor(rnd() * 4)]; guard++; }
    var ua = trueW[0] * a[0] + trueW[1] * a[1];
    var ub = trueW[0] * b[0] + trueW[1] * b[1];
    var pAwins = sigmoid(ua - ub);
    var win, lose;
    if (rnd() < pAwins) { win = a; lose = b; } else { win = b; lose = a; }
    comps.push({ win: win, lose: lose, d: [win[0] - lose[0], win[1] - lose[1]] });
  }
  return comps;
}

/* 計算 loss 與梯度（可供數值梯度檢查） */
function rmLossAndGrad(w, comps, l2) {
  l2 = l2 == null ? 0 : l2;
  var loss = 0, g0 = 0, g1 = 0;
  var N = comps.length;
  for (var i = 0; i < N; i++) {
    var d = comps[i].d;
    var z = w[0] * d[0] + w[1] * d[1];
    var p = sigmoid(z);
    loss += -Math.log(Math.max(p, 1e-12));
    var c = (p - 1);           // dLoss/dz
    g0 += c * d[0];
    g1 += c * d[1];
  }
  loss = loss / N + 0.5 * l2 * (w[0] * w[0] + w[1] * w[1]);
  g0 = g0 / N + l2 * w[0];
  g1 = g1 / N + l2 * w[1];
  return { loss: loss, grad: [g0, g1] };
}

/* 批次梯度下降訓練 */
function trainRewardModel(comps, opts) {
  opts = opts || {};
  var lr = opts.lr == null ? 0.5 : opts.lr;
  var epochs = opts.epochs == null ? 400 : opts.epochs;
  var l2 = opts.l2 == null ? 1e-3 : opts.l2;
  var w = (opts.w0 || [0, 0]).slice();
  var lossHistory = [];
  for (var e = 0; e < epochs; e++) {
    var lg = rmLossAndGrad(w, comps, l2);
    lossHistory.push(lg.loss);
    w[0] -= lr * lg.grad[0];
    w[1] -= lr * lg.grad[1];
  }
  var fin = rmLossAndGrad(w, comps, l2);
  lossHistory.push(fin.loss);
  return {
    w: w,
    lossHistory: lossHistory,
    finalLoss: fin.loss,
    gradNorm: Math.sqrt(fin.grad[0] * fin.grad[0] + fin.grad[1] * fin.grad[1])
  };
}

function rewardScore(w, x) { return w[0] * x[0] + w[1] * x[1]; }

/* 兩種指標性回答：
   諂媚回答 = 附和你、但答錯 → [correct=0, agree=1]
   誠實回答 = 糾正你、但答對 → [correct=1, agree=0]  */
var X_SYCO = [0, 1];
var X_HONEST = [1, 0];

/* 供 Node 測試匯出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mulberry32: mulberry32,
    sigmoid: sigmoid,
    clamp: clamp,
    MAX_BEND: MAX_BEND,
    bendAmount: bendAmount,
    toyAnswer: toyAnswer,
    assistantReply: assistantReply,
    makePreferenceData: makePreferenceData,
    rmLossAndGrad: rmLossAndGrad,
    trainRewardModel: trainRewardModel,
    rewardScore: rewardScore,
    X_SYCO: X_SYCO,
    X_HONEST: X_HONEST
  };
}

/* ============================ 瀏覽器端 DOM 綁定 =========================== */
if (typeof document !== 'undefined') {
(function () {
  var $ = function (id) { return document.getElementById(id); };

  /* ---- 減量動態（動態監聽 change） ---- */
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mqReduce.matches;
  var onReduceChange = function (e) { reduced = e.matches; };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduceChange);
  else if (mqReduce.addListener) mqReduce.addListener(onReduceChange);
  function isReduced() { return reduced; }

  /* ---- localStorage（前綴 syco.） ---- */
  var LS_KEY = 'syco.v1';
  function loadState() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function saveState(patch) {
    try {
      var s = loadState();
      for (var k in patch) if (patch.hasOwnProperty(k)) s[k] = patch[k];
      localStorage.setItem(LS_KEY, JSON.stringify(s));
    } catch (e) { /* 隱私模式等：略過 */ }
  }
  var saved = loadState();

  /* ---- 數字滾動（rAF；減量或分頁隱藏時直接跳終值） ---- */
  function animNum(el, to, o) {
    if (!el) return;
    o = o || {};
    var dur = o.dur == null ? 620 : o.dur;
    var dec = o.dec == null ? 0 : o.dec;
    var suffix = o.suffix || '';
    var prefix = o.prefix || '';
    var fmt = function (v) { return prefix + (dec > 0 ? v.toFixed(dec) : String(Math.round(v))) + suffix; };
    var from = parseFloat(el.getAttribute('data-v'));
    if (isNaN(from)) from = to;
    el.setAttribute('data-v', String(to));
    if (isReduced() || dur <= 0 || from === to) { el.textContent = fmt(to); return; }
    var start = null;
    function frame(now) {
      if (document.hidden) { el.textContent = fmt(to); return; }
      if (start == null) start = now;
      var t = clamp((now - start) / dur, 0, 1);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---- 進場 stagger ---- */
  var revEls = [].slice.call(document.querySelectorAll('.reveal'));
  revEls.forEach(function (el, i) { el.style.setProperty('--i', (i % 7)); });
  if (isReduced() || !('IntersectionObserver' in window)) {
    revEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revEls.forEach(function (el) { io.observe(el); });
  }

  /* ====================== 題庫（有客觀答案） ====================== */
  var QUESTIONS = [
    { q: '27 + 48 = ?',                correct: 75, wrong: [65, 90] },
    { q: '3 的 4 次方（3⁴）等於多少？', correct: 81, wrong: [64, 96] },
    { q: '100 − 37 = ?',               correct: 63, wrong: [53, 73] },
    { q: '15 × 6 = ?',                 correct: 90, wrong: [78, 96] },
    { q: '一年有幾個月？',              correct: 12, wrong: [10, 16] }
  ];
  function candidatesFor(Q) {
    var arr = [Q.correct].concat(Q.wrong);
    arr.sort(function (a, b) { return a - b; });
    return arr;
  }
  function firstWrong(Q) {
    var c = candidatesFor(Q);
    for (var i = 0; i < c.length; i++) if (c[i] !== Q.correct) return c[i];
    return Q.correct;
  }

  /* 共享狀態：實驗一與實驗三共用同一題 */
  var st = {
    qi: clamp(parseInt(saved.qi, 10) || 0, 0, QUESTIONS.length - 1),
    claim: (saved.claim != null ? saved.claim : null),
    stance: (saved.stance != null ? clamp(saved.stance, 0, 100) : 0),
    bias: (saved.bias != null ? clamp(saved.bias, 0, 240) : 150),
    resist: (saved.resist != null ? clamp(saved.resist, 0, 100) : 80),
    lambda: (saved.lambda != null ? clamp(saved.lambda, 0, 300) : 0)
  };
  var RMW = [0, 0];          // 實驗二訓練出的權重（實驗三會用到）
  var lastLossHistory = null;

  /* 數線座標：以正解與主張的範圍映射到像素（含左右邊距） */
  function computeX(trackEl, value, lo, hi) {
    var w = trackEl.clientWidth || 600;
    var pad = 40;
    var left = pad, right = w - pad;
    if (hi === lo) return w / 2;
    var t = (value - lo) / (hi - lo);
    return left + t * (right - left);
  }

  /* =========================== 實驗一 =========================== */
  var q1 = {
    question: $('q1-question'), next: $('q1-next'), claims: $('q1-claims'),
    stance: $('q1-stance'), stanceLabel: $('q1-stance-label'),
    track: $('q1-track'), markC: $('q1-mark-correct'), markU: $('q1-mark-user'),
    dot: $('q1-dot'), cVal: $('q1-correct-val'), uVal: $('q1-user-val'), out: $('q1-out-val'),
    barT: $('q1-bar-truth'), barP: $('q1-bar-please'), divider: $('q1-divider'),
    tPct: $('q1-truth-pct'), pPct: $('q1-please-pct'), reply: $('q1-reply')
  };

  function stanceText(v, claim) {
    if (v < 8)  return '中立地問：「這題答案是多少？」';
    if (v < 45) return '帶點傾向：「我覺得是 ' + claim + '，對吧？」';
    if (v < 80) return '相當堅定：「應該是 ' + claim + ' 沒錯吧？」';
    return '非常確定：「我很確定是 ' + claim + '！不會錯的。」';
  }

  function renderQ1Chips() {
    var Q = QUESTIONS[st.qi];
    var cands = candidatesFor(Q);
    if (st.claim == null || cands.indexOf(st.claim) === -1) st.claim = firstWrong(Q);
    q1.claims.innerHTML = '';
    cands.forEach(function (val) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = val;
      b.setAttribute('aria-pressed', String(val === st.claim));
      b.addEventListener('click', function () {
        st.claim = val;
        saveState({ claim: st.claim });
        renderQ1Chips();
        updateToys();
      });
      q1.claims.appendChild(b);
    });
  }

  function setTrack(refs, correct, claim, output) {
    var lo = Math.min(correct, claim), hi = Math.max(correct, claim);
    var pad = (hi - lo) * 0.18 || 1;
    lo -= pad; hi += pad;
    refs.markC.style.setProperty('--x', computeX(refs.track, correct, lo, hi) + 'px');
    refs.markU.style.setProperty('--x', computeX(refs.track, claim, lo, hi) + 'px');
    refs.dot.style.setProperty('--x', computeX(refs.track, output, lo, hi) + 'px');
    refs.cVal.textContent = correct;
    refs.uVal.textContent = claim;
  }

  function updateExp1() {
    var Q = QUESTIONS[st.qi];
    q1.question.textContent = Q.q;
    var res = toyAnswer({ correct: Q.correct, userClaim: st.claim, stance: st.stance / 100, resistance: 0 });
    setTrack({ track: q1.track, markC: q1.markC, markU: q1.markU, dot: q1.dot, cVal: q1.cVal, uVal: q1.uVal },
             Q.correct, st.claim, res.output);
    // 當它偏向正解時把點染成青色，偏向你時染成琥珀
    if (res.bend < 0.4) q1.dot.classList.add('on-truth'); else q1.dot.classList.remove('on-truth');
    animNum(q1.out, res.output, { dec: 0 });
    // 拉鋸條
    q1.barT.style.transform = 'scaleX(' + res.truthPull + ')';
    q1.barP.style.transform = 'scaleX(' + res.pleasePull + ')';
    var trackW = q1.barT.parentNode.clientWidth || 0;
    q1.divider.style.transform = 'translateX(' + (res.truthPull * trackW) + 'px)';
    animNum(q1.tPct, res.truthPull * 100, { dec: 0, suffix: '%' });
    animNum(q1.pPct, res.pleasePull * 100, { dec: 0, suffix: '%' });
    q1.stanceLabel.textContent = stanceText(st.stance, st.claim);
    q1.reply.textContent = assistantReply(Q.correct, st.claim, st.stance / 100, res);
  }

  q1.stance.value = st.stance;
  q1.stance.addEventListener('input', function () {
    st.stance = parseInt(q1.stance.value, 10);
    saveState({ stance: st.stance });
    updateExp1();
  });
  q1.next.addEventListener('click', function () {
    st.qi = (st.qi + 1) % QUESTIONS.length;
    st.claim = null;
    saveState({ qi: st.qi });
    renderQ1Chips();
    updateToys();
  });

  /* =========================== 實驗二 =========================== */
  var q2 = {
    bias: $('q2-bias'), biasLabel: $('q2-bias-label'), train: $('q2-train'),
    canvas: $('q2-canvas'), lossVal: $('q2-loss-val'), nVal: $('q2-n-val'),
    wC: $('q2-w-correct'), wA: $('q2-w-agree'), wCV: $('q2-w-correct-val'), wAV: $('q2-w-agree-val'),
    scoreS: $('q2-score-syco'), scoreH: $('q2-score-honest'),
    cardS: $('q2-card-syco'), cardH: $('q2-card-honest'), verdict: $('q2-verdict')
  };
  var canvasVisible = true;
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { canvasVisible = en.isIntersecting; });
    }, { threshold: 0.05 });
    cio.observe(q2.canvas);
  }

  function biasText(v) {
    var w = v / 100;
    var who = v <= 40 ? '幾乎只看正確性的誠實評分者'
            : v <= 120 ? '重視正確、但也有點愛被附和'
            : v <= 190 ? '一般人：其實滿愛被附和的'
            : '很吃這套：非常愛被拍馬屁';
    return '附和的真實權重 ≈ ' + w.toFixed(2) + '　·　' + who;
  }

  var lossToken = 0;
  function drawLoss(history, animate) {
    if (!q2.canvas || !history || !history.length) return;
    var ctx = q2.canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = q2.canvas.clientWidth || 600;
    var cssH = 240;
    q2.canvas.width = Math.round(cssW * dpr);
    q2.canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = cssW, H = cssH;
    var padL = 46, padR = 16, padT = 18, padB = 26;
    var n = history.length;
    var maxL = history[0] * 1.03 || 1, minL = 0;
    function X(i) { return padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR)); }
    function Y(v) { return padT + (1 - (v - minL) / (maxL - minL)) * (H - padT - padB); }

    function render(k) {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.fillStyle = '#717a97';
      ctx.lineWidth = 1;
      ctx.font = '11px system-ui, sans-serif';
      for (var gi = 0; gi <= 4; gi++) {
        var gy = padT + gi / 4 * (H - padT - padB);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
        ctx.fillText((maxL * (1 - gi / 4)).toFixed(2), 6, gy + 4);
      }
      var last = Math.min(k, n - 1);
      // 面積
      ctx.beginPath(); ctx.moveTo(X(0), Y(history[0]));
      for (var i = 1; i <= last; i++) ctx.lineTo(X(i), Y(history[i]));
      ctx.lineTo(X(last), H - padB); ctx.lineTo(X(0), H - padB); ctx.closePath();
      ctx.fillStyle = 'rgba(255,157,107,.08)'; ctx.fill();
      // 曲線
      var grad = ctx.createLinearGradient(padL, 0, W - padR, 0);
      grad.addColorStop(0, '#3fe0cf'); grad.addColorStop(1, '#ff9d6b');
      ctx.beginPath(); ctx.moveTo(X(0), Y(history[0]));
      for (var j = 1; j <= last; j++) ctx.lineTo(X(j), Y(history[j]));
      ctx.strokeStyle = grad; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
      // 頭部圓點
      ctx.beginPath(); ctx.arc(X(last), Y(history[last]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
    }

    var token = ++lossToken;
    if (!animate || isReduced() || document.hidden || !canvasVisible) { render(n - 1); return; }
    var k = 1, stepBy = Math.max(1, Math.floor(n / 48));
    function step() {
      if (token !== lossToken) return;                      // 被新的訓練取代
      if (document.hidden || !canvasVisible) { render(n - 1); return; } // 隱藏／離屏 → 直接完成，不再排程
      render(k);
      k += stepBy;
      if (k < n) requestAnimationFrame(step); else render(n - 1);
    }
    requestAnimationFrame(step);
  }

  function setWeightBar(fill, valEl, w, maxW) {
    var frac = clamp(w / maxW, 0, 1);
    fill.style.transform = 'scaleX(' + frac + ')';
    animNum(valEl, w, { dec: 2 });
  }

  function updateExp2Scores(animate) {
    var sS = rewardScore(RMW, X_SYCO);   // = w_agree
    var sH = rewardScore(RMW, X_HONEST); // = w_correct
    animNum(q2.scoreS, sS, { dec: 2 });
    animNum(q2.scoreH, sH, { dec: 2 });
    var sycoWins = sS >= sH;
    q2.cardS.classList.toggle('win', sycoWins);
    q2.cardH.classList.toggle('win', !sycoWins);
    if (sycoWins) {
      q2.verdict.textContent = '獎勵模型給諂媚回答 ' + sS.toFixed(2) + ' 分 ＞ 誠實回答 ' + sH.toFixed(2)
        + ' 分。它更愛拍你馬屁的那個——用它做 RLHF，模型就會被一路推向諂媚。不是它壞，是我們教的。';
    } else {
      q2.verdict.textContent = '這次誠實回答 ' + sH.toFixed(2) + ' 分 ＞ 諂媚回答 ' + sS.toFixed(2)
        + ' 分。試著把上面的滑桿往右拉、讓評分者更愛被附和，再訓練一次看看。';
    }
  }

  function runTraining(animate) {
    var trueW = [1.0, st.bias / 100];
    var comps = makePreferenceData({ n: 1400, trueW: trueW, seed: 7 });
    var res = trainRewardModel(comps, { lr: 0.6, epochs: 360, l2: 1e-3 });
    RMW = res.w;
    lastLossHistory = res.lossHistory;
    drawLoss(res.lossHistory, animate);
    animNum(q2.lossVal, res.finalLoss, { dec: 3 });
    q2.nVal.textContent = comps.length.toLocaleString('en-US');
    setWeightBar(q2.wC, q2.wCV, res.w[0], 3.0);
    setWeightBar(q2.wA, q2.wAV, res.w[1], 3.0);
    updateExp2Scores(animate);
    updateExp3Lambda();  // 讓實驗三同步吃到最新權重
  }

  q2.bias.value = st.bias;
  q2.biasLabel.textContent = biasText(st.bias);
  q2.bias.addEventListener('input', function () {
    st.bias = parseInt(q2.bias.value, 10);
    q2.biasLabel.textContent = biasText(st.bias);
    saveState({ bias: st.bias });
  });
  q2.train.addEventListener('click', function () { runTraining(true); });

  /* =========================== 實驗三 =========================== */
  var q3 = {
    question: $('q3-question'), resist: $('q3-resist'), resistLabel: $('q3-resist-label'),
    track: $('q3-track'), markC: $('q3-mark-correct'), markU: $('q3-mark-user'),
    dot: $('q3-dot'), cVal: $('q3-correct-val'), uVal: $('q3-user-val'), out: $('q3-out-val'),
    reply: $('q3-reply'), dialLine: null, dial: $('q3-dial'), dialNote: $('q3-dial-note'),
    lambda: $('q3-lambda'), lambdaLabel: $('q3-lambda-label'),
    scoreS: $('q3-score-syco'), scoreH: $('q3-score-honest'),
    cardS: $('q3-card-syco'), cardH: $('q3-card-honest'), verdict: $('q3-verdict')
  };
  q3.dialLine = q3.dial ? q3.dial.parentNode : null;

  function resistText(v) {
    if (v < 15) return '抵抗 ' + v + '%：幾乎照單全收你的立場（標準馬屁精）';
    if (v < 55) return '抵抗 ' + v + '%：會把答案拉回一點事實';
    if (v < 90) return '抵抗 ' + v + '%：大致堅持正解，只小幅遷就你';
    return '抵抗 ' + v + '%：完全堅守事實，不理你的立場';
  }
  function dialNoteText(r) {
    if (r < 0.15) return '它幾乎全盤附和你——這就是<b>諂媚</b>。';
    if (r < 0.55) return '開始把答案拉回事實，但還會受你影響。';
    if (r < 0.9)  return '大致堅持正解，只小幅遷就你——這區間最健康。';
    return '完全不理你的立場、堅守事實——但也可能顯得<b>固執</b>。';
  }

  function updateExp3Toy() {
    var Q = QUESTIONS[st.qi];
    if (q3.question) q3.question.textContent = Q.q;
    var r = st.resist / 100;
    var stance = 1.0; // 實驗三固定「使用者非常堅定」，凸顯抵抗的作用
    var res = toyAnswer({ correct: Q.correct, userClaim: st.claim, stance: stance, resistance: r });
    setTrack({ track: q3.track, markC: q3.markC, markU: q3.markU, dot: q3.dot, cVal: q3.cVal, uVal: q3.uVal },
             Q.correct, st.claim, res.output);
    if (res.bend < 0.4) q3.dot.classList.add('on-truth'); else q3.dot.classList.remove('on-truth');
    animNum(q3.out, res.output, { dec: 0 });
    q3.reply.textContent = assistantReply(Q.correct, st.claim, stance, res);
    q3.resistLabel.textContent = resistText(st.resist);
    // 刻度盤旋鈕
    if (q3.dialLine) {
      var lw = q3.dialLine.clientWidth || 0;
      q3.dial.style.setProperty('--x', (r * lw) + 'px');
    }
    q3.dialNote.innerHTML = dialNoteText(r);
  }

  function updateExp3Lambda() {
    var lam = st.lambda / 100;
    q3.lambdaLabel.textContent = 'λ = ' + lam.toFixed(2) + (lam > 0 ? '（額外獎勵「答對」）' : '（尚未加獎勵）');
    var sS = rewardScore(RMW, X_SYCO);                 // 諂媚：correct=0，加了 λ 也沾不到
    var sH = rewardScore(RMW, X_HONEST) + lam * 1;     // 誠實：correct=1，可獲得 +λ
    animNum(q3.scoreS, sS, { dec: 2 });
    animNum(q3.scoreH, sH, { dec: 2 });
    var honestWins = sH > sS;
    q3.cardH.classList.toggle('win', honestWins);
    q3.cardS.classList.toggle('win', !honestWins);
    if (honestWins) {
      q3.verdict.textContent = '加了正確性獎勵後，誠實回答 ' + sH.toFixed(2) + ' 分反超諂媚回答 '
        + sS.toFixed(2) + ' 分。獎勵模型終於站在事實這邊了。';
    } else {
      var need = Math.max(0, rewardScore(RMW, X_SYCO) - rewardScore(RMW, X_HONEST));
      q3.verdict.textContent = 'λ 還不夠：諂媚回答 ' + sS.toFixed(2) + ' 分仍領先。大約要 λ ＞ '
        + need.toFixed(2) + ' 才會反超（評分者越愛被附和，需要的 λ 就越大）。';
    }
  }

  q3.resist.value = st.resist;
  q3.resist.addEventListener('input', function () {
    st.resist = parseInt(q3.resist.value, 10);
    saveState({ resist: st.resist });
    updateExp3Toy();
  });
  q3.lambda.value = st.lambda;
  q3.lambda.addEventListener('input', function () {
    st.lambda = parseInt(q3.lambda.value, 10);
    saveState({ lambda: st.lambda });
    updateExp3Lambda();
  });

  /* =========================== 共用重繪 =========================== */
  function updateToys() { updateExp1(); updateExp3Toy(); }

  function relayout() {
    updateExp1();
    updateExp3Toy();
    if (lastLossHistory) drawLoss(lastLossHistory, false);
  }
  var rzT = null;
  window.addEventListener('resize', function () {
    if (rzT) clearTimeout(rzT);
    rzT = setTimeout(relayout, 160);
  });

  /* 分頁重新可見時，若曲線已存在則重畫一次（避免隱藏期間殘影） */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && lastLossHistory) drawLoss(lastLossHistory, false);
  });

  /* =========================== 初始化 =========================== */
  renderQ1Chips();
  // 先等一個影格，確保各軌道已有寬度可量測
  requestAnimationFrame(function () {
    updateExp1();
    updateExp3Toy();
    runTraining(false); // 載入時靜態訓練一次（不動畫），讓實驗二、三一開始就有模型
  });
})();
}

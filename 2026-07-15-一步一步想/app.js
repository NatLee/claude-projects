/*  一步一步想 · 思維鏈 (Chain-of-Thought) — 玩具求解器
 *  純靜態、零外部資源、不呼叫任何 LLM。
 *  核心邏輯為純函式，node 測試與瀏覽器共用；UI 僅在瀏覽器執行。
 */
(function () {
  'use strict';

  /* ============================================================
     核心邏輯（純函式，node 與瀏覽器共用）
     每一道題 = 一條「運算鏈」：start 給起始值，之後每一步對執行中的
     總和做一次運算。某些步可帶 inner（例如「2 包 × 5 顆 = 10」），
     讓逐步求解器是「真的在算」，而非讀出預存答案。
     ============================================================ */

  var PROBLEMS = [
    { id:'eggs', title:'雞蛋（1 步）', unit:'顆',
      text:'一盒雞蛋原本有 30 顆，做蛋糕用掉了 12 顆。現在盒子裡還剩幾顆雞蛋？',
      steps:[ {op:'start',a:30,say:'一盒原本有 30 顆'},
              {op:'-',a:12,say:'做蛋糕用掉 12 顆'} ] },

    { id:'books', title:'書架（2 步）', unit:'本',
      text:'書架上有 18 本書，先搬走 5 本，接著又放回 9 本。現在書架上有幾本書？',
      steps:[ {op:'start',a:18,say:'書架上原有 18 本'},
              {op:'-',a:5,say:'先搬走 5 本'},
              {op:'+',a:9,say:'接著放回 9 本'} ] },

    { id:'candy', title:'分糖果（3 步）', unit:'顆',
      text:'小美有 12 顆糖，自己先吃掉 3 顆，媽媽又給她 2 包、每包 5 顆，最後她分給 4 個同學、每人 2 顆。小美還剩幾顆糖？',
      steps:[ {op:'start',a:12,say:'小美原有 12 顆'},
              {op:'-',a:3,say:'自己先吃掉 3 顆'},
              {op:'+',a:2,b:5,inner:'×',say:'媽媽給 2 包、每包 5 顆，共 10 顆'},
              {op:'-',a:4,b:2,inner:'×',say:'分給 4 人、每人 2 顆，共 8 顆'} ] },

    { id:'money', title:'買文具（3 步）', unit:'元',
      text:'阿明帶了 500 元去買文具。他買了 3 支筆、每支 45 元，又買了一本 85 元的筆記本，結帳時老闆折退了 20 元。他最後還剩多少錢？',
      steps:[ {op:'start',a:500,say:'帶了 500 元'},
              {op:'-',a:3,b:45,inner:'×',say:'買 3 支筆、每支 45 元，共 135 元'},
              {op:'-',a:85,say:'買一本 85 元的筆記本'},
              {op:'+',a:20,say:'老闆折退 20 元'} ] },

    { id:'parking', title:'停車場（3 步·陷阱）', unit:'台',
      text:'停車場一開始有 40 台車。早上開走了 15 台，中午又開進來 15 台，傍晚再開走 8 台。現在停車場有幾台車？',
      steps:[ {op:'start',a:40,say:'一開始有 40 台'},
              {op:'-',a:15,say:'早上開走 15 台'},
              {op:'+',a:15,say:'中午開進來 15 台'},
              {op:'-',a:8,say:'傍晚再開走 8 台'} ] },

    { id:'tank', title:'水塔（4 步）', unit:'公升',
      text:'水塔裡有 100 公升的水。先放掉 24 公升，又注入 3 桶、每桶 12 公升，接著蒸發掉 4 公升，最後把剩下的水放掉一半。水塔裡還剩幾公升？',
      steps:[ {op:'start',a:100,say:'水塔裡有 100 公升'},
              {op:'-',a:24,say:'先放掉 24 公升'},
              {op:'+',a:3,b:12,inner:'×',say:'注入 3 桶、每桶 12 公升，共 36 公升'},
              {op:'-',a:4,say:'蒸發掉 4 公升'},
              {op:'÷',a:2,say:'剩下的放掉一半（÷2）'} ] },

    { id:'train', title:'火車行程（3 步）', unit:'公里',
      text:'一列火車以時速 80 公里前進，先開了 3 小時，休息後又以同樣速度開了 2 小時，之後因施工往回退了 40 公里。它現在距離起點多少公里？',
      steps:[ {op:'start',a:80,b:3,inner:'×',say:'時速 80 公里開 3 小時，共 240 公里'},
              {op:'+',a:80,b:2,inner:'×',say:'再開 2 小時，共 160 公里'},
              {op:'-',a:40,say:'施工往回退 40 公里'} ] },

    { id:'quiz', title:'題庫進度（3 步）', unit:'題',
      text:'一份 200 題的題庫，小華第一天做了 60 題，第二天做了 45 題，但其中有 15 題做錯、要退回重做。他還有幾題沒完成？',
      steps:[ {op:'start',a:200,say:'題庫共 200 題（未完成 200）'},
              {op:'-',a:60,say:'第一天完成 60 題'},
              {op:'-',a:45,say:'第二天完成 45 題'},
              {op:'+',a:15,say:'15 題做錯、退回未完成'} ] }
  ];

  function opSymbol(op){
    return ({'+':'+','-':'−','×':'×','÷':'÷'})[op] || op;
  }

  // 算出一步的運算元（可能先做 inner 運算）
  function evalOperand(step){
    if (step.b == null) return step.a;
    switch (step.inner){
      case '×': return step.a * step.b;
      case '+': return step.a + step.b;
      case '-': return step.a - step.b;
      case '÷': return step.a / step.b;
      default:  return step.a;
    }
  }

  function applyOp(v, op, n){
    switch (op){
      case '+': return v + n;
      case '-': return v - n;
      case '×': return v * n;
      case '÷': return v / n;
      default:  return v;
    }
  }

  // 逐步求解：真的把運算鏈折疊起來，記錄每一步的中間值。依構造永遠正確。
  function foldSteps(problem){
    var trace = [], v = 0, i, step, operand, before;
    for (i = 0; i < problem.steps.length; i++){
      step = problem.steps[i];
      operand = evalOperand(step);
      if (step.op === 'start'){
        v = operand;
        trace.push({ op:'start', operand:operand, before:null, after:v, say:step.say, inner:step });
      } else {
        before = v;
        v = applyOp(v, step.op, operand);
        trace.push({ op:step.op, operand:operand, before:before, after:v, say:step.say, inner:step });
      }
    }
    return { value:v, trace:trace };
  }

  function solveStepwise(problem){
    var f = foldSteps(problem);
    return { answer:f.value, trace:f.trace };
  }

  function correctAnswer(problem){ return foldSteps(problem).value; }

  // 直接答（表面模式）：只保留「開頭的數量」與「最後一步」，中間全跳過——一步到位地猜。
  // 只有在題目恰好只有一步時才會對；步數一多就會因為跳步而錯。
  function solveDirect(problem){
    var steps = problem.steps;
    var start = evalOperand(steps[0]);
    var ops = steps.slice(1);
    if (ops.length === 0){
      return { answer:start, skipped:0, lastOp:null, lastOperand:null, startVal:start };
    }
    var last = ops[ops.length - 1];
    var lastOperand = evalOperand(last);
    var answer = applyOp(start, last.op, lastOperand);
    return { answer:answer, skipped:ops.length - 1, lastOp:last.op, lastOperand:lastOperand, startVal:start };
  }

  // 可重現的偽亂數（mulberry32）
  function makeRng(seed){
    var s = seed >>> 0;
    return function(){
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var SLIP_Q = 0.18; // 每一個推理步「手滑算錯」的機率

  // 帶雜訊的逐步求解：每一步有 q 機率手滑（結果 ±小量）。
  // 錯誤會往後傳、最終答案發散——所以錯的路各錯各的，對的路才會一再收斂到同一個答案。
  function solveNoisy(problem, rng, q){
    if (q == null) q = SLIP_Q;
    var v = 0, slipped = false, i, step, operand;
    var deltas = [-3,-2,-1,1,2,3];
    for (i = 0; i < problem.steps.length; i++){
      step = problem.steps[i];
      operand = evalOperand(step);
      if (step.op === 'start'){ v = operand; }
      else { v = applyOp(v, step.op, operand); }
      // 起始步只是抄數字，不算推理步、不會手滑
      if (step.op !== 'start' && rng() < q){
        v += deltas[Math.floor(rng() * deltas.length)];
        slipped = true;
      }
    }
    return { answer:v, slipped:slipped };
  }

  // 多數決：回傳票數最高的答案；平手時取最早達到最高票者（穩定）
  function majorityVote(answers){
    var tally = {}, order = [], i, a, key;
    for (i = 0; i < answers.length; i++){
      a = answers[i]; key = String(a);
      if (tally[key] == null){ tally[key] = 0; order.push(a); }
      tally[key] += 1;
    }
    var winner = null, count = -1;
    for (i = 0; i < order.length; i++){
      a = order[i];
      if (tally[String(a)] > count){ count = tally[String(a)]; winner = a; }
    }
    var dist = order.map(function(x){ return { answer:x, count:tally[String(x)] }; })
                    .sort(function(p,q){ return q.count - p.count; });
    return { winner:winner, count:count, dist:dist, total:answers.length };
  }

  // 對一題採樣 N 條帶雜訊的鏈，回傳每條答案、投票結果、單條正確率
  function sampleSelfConsistency(problem, N, rng, q){
    var correct = correctAnswer(problem);
    var chains = [], singleCorrect = 0, i, r;
    for (i = 0; i < N; i++){
      r = solveNoisy(problem, rng, q);
      if (r.answer === correct) singleCorrect++;
      chains.push(r.answer);
    }
    var vote = majorityVote(chains);
    return {
      chains: chains,
      vote: vote,
      correct: correct,
      singleCorrect: singleCorrect,
      singleRate: N ? singleCorrect / N : 0,
      majorityCorrect: vote.winner === correct
    };
  }

  var CORE = {
    PROBLEMS: PROBLEMS, evalOperand: evalOperand, applyOp: applyOp, foldSteps: foldSteps,
    solveStepwise: solveStepwise, correctAnswer: correctAnswer, solveDirect: solveDirect,
    makeRng: makeRng, solveNoisy: solveNoisy, majorityVote: majorityVote,
    sampleSelfConsistency: sampleSelfConsistency, opSymbol: opSymbol, SLIP_Q: SLIP_Q
  };
  if (typeof module !== 'undefined' && module.exports){ module.exports = CORE; }

  /* ============================================================
     介面（僅在瀏覽器執行）
     ============================================================ */
  if (typeof document === 'undefined') return;

  var $ = function (id){ return document.getElementById(id); };
  var LS = 'cot.';
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduceMotion = mq.matches;
  if (mq.addEventListener) mq.addEventListener('change', function (e){ reduceMotion = e.matches; });
  else if (mq.addListener) mq.addListener(function (e){ reduceMotion = e.matches; });

  function loadPref(k, d){ try { var v = localStorage.getItem(LS + k); return v == null ? d : v; } catch (e){ return d; } }
  function savePref(k, v){ try { localStorage.setItem(LS + k, String(v)); } catch (e){} }
  function clampN(n){ n = Math.round(n); if (isNaN(n)) n = 15; if (n < 3) n = 3; if (n > 41) n = 41; if (n % 2 === 0) n += 1; return n; }
  function hashId(s){ var h = 2166136261 >>> 0, i; for (i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  var state = { id: loadPref('prob', 'candy'), N: clampN(parseInt(loadPref('N', '15'), 10)) };
  if (!PROBLEMS.some(function (p){ return p.id === state.id; })) state.id = 'candy';
  function currentProblem(){ return PROBLEMS.filter(function (p){ return p.id === state.id; })[0] || PROBLEMS[0]; }

  // 可取消的分批揭示（尊重 reduced-motion，分頁隱藏時直接快轉完成）
  var revealToken = 0;
  function scheduleReveal(items, perDelay, onItem, onDone){
    var token = ++revealToken, i = 0;
    if (reduceMotion || document.hidden){
      for (i = 0; i < items.length; i++) onItem(items[i], i);
      if (onDone) onDone();
      return;
    }
    var tick = function (){
      if (token !== revealToken) return;                 // 被新的動作取消
      if (document.hidden){                              // 快轉剩下的
        for (; i < items.length; i++) onItem(items[i], i);
        if (onDone) onDone();
        return;
      }
      if (i >= items.length){ if (onDone) onDone(); return; }
      onItem(items[i], i); i++;
      setTimeout(tick, perDelay);
    };
    tick();
  }

  // 數字滾動（rAF；reduced-motion 或分頁隱藏時直接給終值）
  function animateValue(to, dur, render){
    if (reduceMotion || document.hidden){ render(to); return; }
    var t0 = performance.now();
    function frame(now){
      var p = Math.min(1, (now - t0) / dur);
      var v = Math.round(to * (1 - Math.pow(1 - p, 3)));
      render(v);
      if (p < 1 && !document.hidden) requestAnimationFrame(frame);
      else render(to);
    }
    requestAnimationFrame(frame);
  }

  /* ---- 選題 ---- */
  function buildChips(){
    var wrap = $('probChips'); wrap.innerHTML = '';
    PROBLEMS.forEach(function (p){
      var b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.textContent = p.title;
      b.setAttribute('aria-pressed', String(p.id === state.id));
      b.addEventListener('click', function (){ selectProblem(p.id); });
      wrap.appendChild(b);
    });
  }
  function refreshChips(){
    var kids = $('probChips').children;
    for (var i = 0; i < kids.length; i++){
      kids[i].setAttribute('aria-pressed', String(PROBLEMS[i].id === state.id));
    }
  }
  function selectProblem(id){
    state.id = id; savePref('prob', id);
    refreshChips(); renderProblem(); resetCompare(); resetSC();
  }
  function renderProblem(){
    var p = currentProblem();
    $('probText').innerHTML = p.text.replace(/\d+/g, function (m){ return '<b>' + m + '</b>'; });
    $('probSteps').textContent = (p.steps.length - 1) + ' 個推理步驟';
  }

  /* ---- 對照：直接答 vs 一步一步想 ---- */
  function setVerdict(el, ok){
    el.className = 'verdict ' + (ok ? 'ok' : 'bad');
    el.innerHTML = '<span class="mark">' + (ok ? '✓' : '✗') + '</span>' + (ok ? '答對了' : '答錯了');
  }
  function renderStepLi(t){
    var li = document.createElement('li');
    var calc = document.createElement('div'); calc.className = 'cot-calc';
    if (t.op === 'start'){
      calc.innerHTML = (t.inner && t.inner.b != null)
        ? t.inner.a + ' ' + opSymbol(t.inner.inner) + ' ' + t.inner.b + ' ＝ <span class="res">' + t.after + '</span>'
        : '一開始 ＝ <span class="res">' + t.after + '</span>';
    } else {
      calc.innerHTML = t.before + ' ' + opSymbol(t.op) + ' ' + t.operand + ' ＝ <span class="res">' + t.after + '</span>';
    }
    var say = document.createElement('div'); say.className = 'cot-say'; say.textContent = t.say;
    li.appendChild(calc); li.appendChild(say);
    return li;
  }
  function runCompare(){
    var p = currentProblem();
    var correct = correctAnswer(p);

    // 直接答：脫口而出
    var d = solveDirect(p);
    var blurt = $('directBlurt');
    blurt.classList.remove('show'); void blurt.offsetWidth;
    blurt.innerHTML = d.answer + '<span class="unit">' + p.unit + '</span>';
    blurt.classList.add('show');
    var dOk = d.answer === correct;
    var why;
    if (d.skipped === 0){
      why = '這題只有一步，剛好被它猜中——步數一多就不行了。';
    } else if (dOk){
      why = '它跳過了中間 <b>' + d.skipped + '</b> 步，這題湊巧被它矇對——換一道多半就露餡。';
    } else {
      why = '它只抓開頭的 <b>' + d.startVal + '</b> 和最後一步，中間 <b>' + d.skipped + '</b> 步全跳過，所以錯了。';
    }
    $('directWhy').innerHTML = why;
    setVerdict($('directVerdict'), dOk);
    $('cardDirect').classList.toggle('lose', !dOk);

    // 一步一步想：逐步長出
    var s = solveStepwise(p);
    var ol = $('cotSteps'); ol.innerHTML = '';
    var f = $('cotFinal'); f.textContent = ''; f.classList.remove('show');
    $('cotVerdict').className = 'verdict'; $('cotVerdict').textContent = '';
    $('cardCot').classList.remove('win');
    var lis = s.trace.map(renderStepLi);
    scheduleReveal(lis, 170, function (li){ ol.appendChild(li); }, function (){
      f.innerHTML = '＝ ' + s.answer + '<span class="unit">' + p.unit + '</span>';
      f.classList.add('show');
      var cOk = s.answer === correct;
      setVerdict($('cotVerdict'), cOk);
      $('cardCot').classList.toggle('win', cOk);
    });
    $('resetCompare').hidden = false;
  }
  function resetCompare(){
    revealToken++;
    var blurt = $('directBlurt');
    blurt.classList.remove('show');
    blurt.innerHTML = '<span class="waiting">按下方按鈕，看它脫口而出</span>';
    $('directWhy').textContent = '';
    $('directVerdict').className = 'verdict'; $('directVerdict').textContent = '';
    $('cardDirect').classList.remove('lose');
    $('cotSteps').innerHTML = '';
    var f = $('cotFinal'); f.textContent = ''; f.classList.remove('show');
    $('cotVerdict').className = 'verdict'; $('cotVerdict').textContent = '';
    $('cardCot').classList.remove('win');
    $('resetCompare').hidden = true;
  }

  /* ---- 記分板：整組題目一次跑完 ---- */
  function runAll(){
    var total = PROBLEMS.length, dCorrect = 0, cCorrect = 0;
    PROBLEMS.forEach(function (p){
      var correct = correctAnswer(p);
      if (solveDirect(p).answer === correct) dCorrect++;
      if (solveStepwise(p).answer === correct) cCorrect++;
    });
    $('scoreDirect').style.color = 'var(--hot)';
    $('scoreCot').style.color = 'var(--cy)';
    animateValue(dCorrect, 900, function (v){ $('scoreDirect').textContent = v + ' / ' + total; });
    animateValue(cCorrect, 900, function (v){ $('scoreCot').textContent = v + ' / ' + total; });
    requestAnimationFrame(function (){
      $('scoreDirectBar').style.width = (dCorrect / total * 100) + '%';
      $('scoreCotBar').style.width = (cCorrect / total * 100) + '%';
    });
    var gap = Math.round((cCorrect - dCorrect) / total * 100);
    $('scoreNote').innerHTML = '同一批 ' + total + ' 題：直接答只對 <b>' + dCorrect +
      '</b> 題，一步一步想 <b>' + cCorrect + '</b> 題——正確率差了 <b>' + gap +
      ' 個百分點</b>。題目越多步，差距越大。';
  }

  /* ---- 自我一致性：採樣、投票 ---- */
  function resetSC(){
    revealToken++;
    $('chainStream').innerHTML = '<span class="sc-stream-empty">按「採樣」，讓它跑很多條帶隨機的推理鏈。</span>';
    $('voteBars').innerHTML = '';
    var el = $('scResult'); el.className = 'sc-result';
    el.innerHTML = '<span class="placeholder">投票結果會出現在這裡。</span>';
  }
  function sampleChains(){
    var p = currentProblem(), N = state.N;
    var seed = ((Date.now() >>> 0) ^ Math.imul(N, 2654435761) ^ hashId(p.id)) >>> 0;
    var rng = makeRng(seed);
    var res = sampleSelfConsistency(p, N, rng, SLIP_Q);
    var correct = res.correct, unit = p.unit;

    var stream = $('chainStream'); stream.innerHTML = '';
    $('voteBars').innerHTML = '';
    var el = $('scResult'); el.className = 'sc-result';
    el.innerHTML = '<span class="placeholder">採樣中……</span>';

    var perDelay = Math.max(24, Math.min(70, Math.round(1100 / N)));
    var pills = res.chains.map(function (a){
      var span = document.createElement('span');
      var ok = a === correct;
      span.className = 'chain-pill ' + (ok ? 'ok' : 'bad');
      span.innerHTML = '<span class="cdot"></span>' + a;
      span.title = ok ? '這條算對了' : '這條某一步手滑了';
      return span;
    });
    scheduleReveal(pills, perDelay, function (pill){ stream.appendChild(pill); }, function (){ buildVote(res, unit); });
  }
  function buildVote(res, unit){
    var dist = res.vote.dist.slice();
    var maxC = dist.length ? dist[0].count : 1;
    var top = dist.slice(0, 6);
    if (!top.some(function (d){ return d.answer === res.correct; })){
      var f = dist.filter(function (d){ return d.answer === res.correct; })[0];
      if (f) top = top.concat([f]);
    }
    var shown = {}; top.forEach(function (d){ shown[String(d.answer)] = true; });
    var rest = dist.filter(function (d){ return !shown[String(d.answer)]; });
    var restCount = rest.reduce(function (s, d){ return s + d.count; }, 0);

    var bars = $('voteBars'); bars.innerHTML = '';
    var rows = [];
    top.forEach(function (d){
      var row = document.createElement('div'); row.className = 'vote-row';
      var isWin = d.answer === res.vote.winner;
      var isCorrect = d.answer === res.correct;
      if (isWin) row.classList.add('win');
      var tag = (isWin && isCorrect) ? '多數決・正解'
              : isWin ? '多數決'
              : isCorrect ? '正解 ✓' : '';
      row.innerHTML =
        '<span class="vote-key">' + d.answer + '</span>' +
        '<span class="vote-bar-wrap"><span class="vote-bar" data-w="' + (d.count / maxC) +
        '"></span><span class="vote-cnt">' + d.count + ' 票</span></span>' +
        '<span class="vote-tag">' + tag + '</span>';
      bars.appendChild(row); rows.push(row);
    });
    if (restCount > 0){
      var r2 = document.createElement('div'); r2.className = 'vote-row';
      r2.innerHTML =
        '<span class="vote-key">其他</span>' +
        '<span class="vote-bar-wrap"><span class="vote-bar" data-w="' + (restCount / maxC) +
        '"></span><span class="vote-cnt">' + restCount + ' 票</span></span>' +
        '<span class="vote-tag">' + rest.length + ' 種零星答案</span>';
      bars.appendChild(r2); rows.push(r2);
    }
    requestAnimationFrame(function (){
      rows.forEach(function (r){
        var bar = r.querySelector('.vote-bar');
        bar.style.transform = 'scaleX(' + bar.getAttribute('data-w') + ')';
      });
    });

    var pct = Math.round(res.singleRate * 100), N = res.chains.length;
    var el = $('scResult'); el.className = 'sc-result done';
    if (res.majorityCorrect){
      el.innerHTML =
        '這 <b>' + N + '</b> 條推理鏈裡，單獨看一條、平均只答對 <span class="single">' + pct +
        '%</span>（' + res.singleCorrect + '/' + N + ' 條對）。<br>' +
        '但把它們的答案<b>投票</b>，多數決＝<span class="big-ok">' + res.correct + ' ' + unit +
        '</span>——正是正解 ✓。<br>' +
        '偶爾的手滑各錯各的、彼此抵銷，被多數票洗掉了。這就是 <b>self-consistency</b>。';
    } else {
      el.innerHTML =
        '這次手滑得比較兇（<b>' + N + '</b> 條裡單條僅 <span class="single">' + pct +
        '%</span> 答對），多數決暫時落在 <b>' + res.vote.winner + '</b>，還沒收斂到正解 <b>' +
        res.correct + '</b>。<br>把 N 調大一點再採樣一次——條數越多，正確答案越會浮上來。';
    }
  }

  /* ---- 初始化 ---- */
  function init(){
    buildChips(); renderProblem(); resetCompare(); resetSC();
    $('probCount').textContent = String(PROBLEMS.length);
    var nRange = $('nRange');
    nRange.value = String(state.N); $('nOut').textContent = String(state.N);
    nRange.addEventListener('input', function (e){
      state.N = clampN(parseInt(e.target.value, 10));
      $('nOut').textContent = String(state.N);
      savePref('N', state.N);
    });
    $('runCompare').addEventListener('click', runCompare);
    $('resetCompare').addEventListener('click', function (){ resetCompare(); runCompare(); });
    $('runAll').addEventListener('click', runAll);
    $('sampleBtn').addEventListener('click', sampleChains);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();

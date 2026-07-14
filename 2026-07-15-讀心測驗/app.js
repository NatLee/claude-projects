/* ============================================================
   它知道你在想什麼嗎？ · 機器的心智理論
   - 信念追蹤者：真的追蹤每個角色的信念 → 永遠答對
   - 表面比對者：只看題型樣板 + 關鍵字提及次數 → 經典對、微擾錯
   純靜態、零外部資源、不呼叫任何 AI。
   ============================================================ */
(function () {
  'use strict';

  /* =========================================================
     一、引擎（純函式，可被 node 測試 require）
     ========================================================= */

  var LABELS = { basket: '籃子', box: '盒子', drawer: '抽屜' };
  var TEMPLATE_BUMP = 1.5;   // 「她會去放的地方找」的樣板加成
  var IRRELEVANT_ADD = 2;    // 無關句子替干擾容器多加的提及次數

  // 由設定組出一個完整情境（事件序列 + 容器 + 焦點角色）
  function buildScenario(config) {
    var c = Object.assign({
      sallyStays: false,   // Sally 全程在場（沒有錯誤信念）
      transparent: false,  // 盒子透明
      peek: false,         // Sally 偷看
      irrelevant: false,   // 加入無關句子
      secondMove: false    // Anne 再搬一次到抽屜
    }, config || {});

    var containers = [
      { id: 'basket', label: LABELS.basket, transparent: false },
      { id: 'box', label: LABELS.box, transparent: !!c.transparent }
    ];
    if (c.secondMove) {
      containers.push({ id: 'drawer', label: LABELS.drawer, transparent: !!c.transparent });
    }

    var events = [];
    events.push({ t: 'enter', agent: 'Sally' });
    events.push({ t: 'enter', agent: 'Anne' });
    events.push({ t: 'place', agent: 'Sally', container: 'basket' });
    if (!c.sallyStays) events.push({ t: 'exit', agent: 'Sally' });
    events.push({ t: 'move', agent: 'Anne', from: 'basket', to: 'box' });
    if (c.secondMove) events.push({ t: 'move', agent: 'Anne', from: 'box', to: 'drawer' });
    if (c.peek && !c.sallyStays) events.push({ t: 'peek', agent: 'Sally' });
    if (!c.sallyStays) events.push({ t: 'enter', agent: 'Sally' });

    return {
      config: c,
      agents: [{ id: 'Sally', label: 'Sally' }, { id: 'Anne', label: 'Anne' }],
      containers: containers,
      events: events,
      initialContainer: 'basket',
      focusAgent: 'Sally',
      irrelevant: !!c.irrelevant,
      irrelevantContainer: 'box',
      object: { id: 'marble', label: '彈珠' }
    };
  }

  function containerById(scenario, id) {
    for (var i = 0; i < scenario.containers.length; i++) {
      if (scenario.containers[i].id === id) return scenario.containers[i];
    }
    return null;
  }

  // 信念追蹤引擎：逐一走過事件，維護「誰在場、真實位置、每個角色以為在哪」
  function simulateBeliefs(scenario) {
    var present = {};                 // agentId -> true
    var trueLoc = null;               // 物品真實所在容器
    var belief = {};                  // agentId -> containerId | null
    scenario.agents.forEach(function (a) { belief[a.id] = null; });

    scenario.events.forEach(function (ev) {
      if (ev.t === 'enter') {
        present[ev.agent] = true;
        // 進場時「看見」目前場面：只有當物品此刻可見（容器透明）才更新信念
        if (trueLoc) {
          var c = containerById(scenario, trueLoc);
          if (c && c.transparent) belief[ev.agent] = trueLoc;
        }
      } else if (ev.t === 'exit') {
        delete present[ev.agent];
      } else if (ev.t === 'place') {
        trueLoc = ev.container;
        // 所有在場者都親眼看到「放進去」這個動作
        Object.keys(present).forEach(function (a) { belief[a] = trueLoc; });
      } else if (ev.t === 'move') {
        trueLoc = ev.to;
        Object.keys(present).forEach(function (a) { belief[a] = trueLoc; });
      } else if (ev.t === 'peek') {
        // 偷看：不論在不在場，都私下看見真實位置
        belief[ev.agent] = trueLoc;
      }
    });

    return { trueLoc: trueLoc, belief: belief, present: present };
  }

  // 信念追蹤者的答案 = 焦點角色「以為」的位置（他會去那裡找）
  function beliefTrackerAnswer(scenario) {
    return simulateBeliefs(scenario).belief[scenario.focusAgent];
  }

  // 正確答案 = 真正推理的結果，就是信念追蹤者算出來的（這正是重點）
  function correctAnswer(scenario) {
    return beliefTrackerAnswer(scenario);
  }

  // 表面比對者：只數「關鍵字提及次數」＋認得經典題型的樣板加成
  //   完全不看誰在場、誰看到——這就是它會破功的原因
  function surfaceScores(scenario) {
    var counts = {};
    scenario.containers.forEach(function (c) { counts[c.id] = 0; });
    scenario.events.forEach(function (ev) {
      if (ev.t === 'place') counts[ev.container] = (counts[ev.container] || 0) + 1;
      else if (ev.t === 'move') counts[ev.to] = (counts[ev.to] || 0) + 1;
    });
    if (scenario.irrelevant) {
      counts[scenario.irrelevantContainer] = (counts[scenario.irrelevantContainer] || 0) + IRRELEVANT_ADD;
    }
    var scores = {};
    scenario.containers.forEach(function (c) { scores[c.id] = counts[c.id]; });
    var hasMove = scenario.events.some(function (e) { return e.t === 'move'; });
    var bump = hasMove ? TEMPLATE_BUMP : 0;
    if (hasMove) scores[scenario.initialContainer] += bump; // 「她會去她放的地方找」
    return { counts: counts, scores: scores, templateBump: bump, initial: scenario.initialContainer };
  }

  function surfaceMatcherAnswer(scenario) {
    var s = surfaceScores(scenario).scores;
    var best = null, bestScore = -Infinity;
    scenario.containers.forEach(function (c) {
      if (s[c.id] > bestScore) { bestScore = s[c.id]; best = c.id; }
    });
    return best;
  }

  var ENGINE = {
    LABELS: LABELS,
    buildScenario: buildScenario,
    simulateBeliefs: simulateBeliefs,
    beliefTrackerAnswer: beliefTrackerAnswer,
    correctAnswer: correctAnswer,
    surfaceScores: surfaceScores,
    surfaceMatcherAnswer: surfaceMatcherAnswer
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ENGINE;
  }

  // node 環境（沒有 document）：只匯出引擎，不跑 UI
  if (typeof document === 'undefined') return;

  /* =========================================================
     二、UI（瀏覽器）
     ========================================================= */

  var LS = 'tom.';
  function save(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
  function load(k, def) {
    try { var v = localStorage.getItem(LS + k); return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  }

  function $(id) { return document.getElementById(id); }
  function label(id) { return id ? (LABELS[id] || id) : '不確定'; }
  function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
  function isClassic(cfg) {
    return !cfg.transparent && !cfg.peek && !cfg.irrelevant && !cfg.sallyStays && !cfg.secondMove;
  }
  function signature(cfg) {
    return [cfg.transparent, cfg.peek, cfg.irrelevant, cfg.sallyStays, cfg.secondMove]
      .map(function (b) { return b ? 1 : 0; }).join('');
  }
  function debounce(fn, ms) {
    var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initAmbient();
    initReveal();

    var el = {
      svg: $('svgStage'), gBasket: $('gBasket'), gBox: $('gBox'), gDrawer: $('gDrawer'),
      gMarble: $('gMarble'), gSally: $('gSally'), gPeekEye: $('gPeekEye'),
      storyText: $('storyText'), stepIndicator: $('stepIndicator'),
      btnReset: $('btnReset'), btnPrev: $('btnPrev'), btnPlay: $('btnPlay'), btnNext: $('btnNext'),
      questionBlock: $('questionBlock'), answerButtons: $('answerButtons'), humanResult: $('humanResult'),
      beliefValue: $('beliefValue'), beliefReason: $('beliefReason'),
      surfaceValue: $('surfaceValue'), surfaceReason: $('surfaceReason'),
      pTransparent: $('pTransparent'), pPeek: $('pPeek'), pIrrelevant: $('pIrrelevant'),
      cSallyStays: $('cSallyStays'), cSecondMove: $('cSecondMove'), btnLabReset: $('btnLabReset'),
      scenarioSummary: $('scenarioSummary'),
      labCorrect: $('labCorrect'), labBelief: $('labBelief'), labBeliefMark: $('labBeliefMark'),
      labSurface: $('labSurface'), labSurfaceMark: $('labSurfaceMark'),
      verdictBelief: $('verdictBelief'), verdictSurface: $('verdictSurface'), labExplain: $('labExplain'),
      scoreTotal: $('scoreTotal'), scoreBelief: $('scoreBelief'), scoreSurface: $('scoreSurface')
    };

    var savedScore = load('score', { total: 0, belief: 0, surface: 0, seen: [] });
    var state = {
      config: { sallyStays: false, transparent: false, peek: false, irrelevant: false, secondMove: false },
      scenario: null,
      steps: [],
      stepIndex: 0,
      revealed: !!load('revealed', false),
      humanDone: load('human', null) != null,
      playTimer: null,
      score: { total: savedScore.total || 0, belief: savedScore.belief || 0, surface: savedScore.surface || 0 },
      seen: {}
    };
    (savedScore.seen || []).forEach(function (s) { state.seen[s] = true; });

    /* ---------- 舞台幾何 ---------- */
    var MARBLE = { basket: [190, 250], box: [470, 250], drawer: [660, 250] };
    var SALLY_IN = [300, 206], SALLY_OUT = [-30, 206];
    function containerGroup(id) {
      return id === 'basket' ? el.gBasket : id === 'box' ? el.gBox : id === 'drawer' ? el.gDrawer : null;
    }

    function renderFrame(frame) {
      var sp = frame.sallyOut ? SALLY_OUT : SALLY_IN;
      el.gSally.setAttribute('transform', 'translate(' + sp[0] + ',' + sp[1] + ')');
      el.gSally.classList.toggle('is-out', !!frame.sallyOut);

      if (!frame.marble) {
        el.gMarble.setAttribute('opacity', '0');
      } else {
        el.gMarble.setAttribute('opacity', '1');
        var pos = frame.marble === 'hand' ? [sp[0] + 34, 250] : MARBLE[frame.marble];
        el.gMarble.setAttribute('transform', 'translate(' + pos[0] + ',' + pos[1] + ')');
      }

      el.gBox.classList.toggle('is-transparent', !!frame.transparent);
      el.gPeekEye.setAttribute('opacity', frame.peek ? '1' : '0');
      el.gDrawer.setAttribute('opacity', frame.drawerVisible ? '1' : '0');

      [el.gBasket, el.gBox, el.gDrawer].forEach(function (g) { g.classList.remove('is-target'); });
      if (frame.target) { var g = containerGroup(frame.target); if (g) g.classList.add('is-target'); }
    }

    /* ---------- 故事分鏡 ---------- */
    function buildSteps(scenario) {
      var c = scenario.config;
      var tr = c.transparent, dv = c.secondMove;
      var finalMarble = c.secondMove ? 'drawer' : 'box';
      var steps = [];
      function frame(o) {
        return Object.assign({ marble: null, sallyOut: false, transparent: tr, peek: false, drawerVisible: dv, target: null }, o);
      }

      steps.push({ narr: 'Sally 和 Anne 都在房間裡。Sally 手上有一顆彈珠。',
        frame: frame({ marble: 'hand' }) });
      steps.push({ narr: 'Sally 把彈珠放進了籃子。',
        frame: frame({ marble: 'basket' }) });
      if (!c.sallyStays) {
        steps.push({ narr: 'Sally 離開了房間，走到門外。',
          frame: frame({ marble: 'basket', sallyOut: true }) });
      }
      steps.push({
        narr: c.sallyStays
          ? 'Anne 把彈珠移到盒子——Sally 就站在旁邊，看得一清二楚。'
          : '趁 Sally 不在，Anne 把彈珠從籃子移到盒子。',
        frame: frame({ marble: 'box', sallyOut: !c.sallyStays })
      });
      if (c.secondMove) {
        steps.push({ narr: 'Anne 又把彈珠從盒子移到抽屜。',
          frame: frame({ marble: 'drawer', sallyOut: !c.sallyStays, drawerVisible: true }) });
      }
      if (c.peek && !c.sallyStays) {
        steps.push({
          narr: 'Sally 從門縫偷看——她看見彈珠被移到了' + (c.secondMove ? '抽屜' : '盒子') + '。',
          frame: frame({ marble: finalMarble, sallyOut: true, peek: true })
        });
      }
      if (c.irrelevant) {
        steps.push({
          narr: '（順帶一提：那個盒子是奶奶留下來的綠色盒子。這句話跟彈珠在哪，一點關係也沒有。）',
          frame: frame({ marble: finalMarble, sallyOut: !c.sallyStays, peek: c.peek && !c.sallyStays })
        });
      }
      if (!c.sallyStays) {
        var back = 'Sally 回到房間。';
        if (c.transparent) back += '盒子是透明的，她一眼就看見彈珠在裡面。';
        else if (c.peek) back += '（別忘了：她剛剛從門縫看到了。）';
        else back += '她並不知道彈珠被移動過。';
        steps.push({ narr: back, frame: frame({ marble: finalMarble, sallyOut: false }) });
      }
      steps.push({
        narr: '問題：Sally 會先去哪裡找她的彈珠？',
        frame: frame({ marble: finalMarble }),
        isQuestion: true
      });
      return steps;
    }

    /* ---------- 讀者作答顯示 ---------- */
    function lockHint() {
      return '<span style="color:var(--muted);font-size:0.9rem">先在上面的故事作答，答案就會揭曉。</span>';
    }
    function beliefTableHTML(scenario) {
      var sim = simulateBeliefs(scenario);
      var rows = scenario.agents.map(function (a) {
        return '<tr><th>' + a.label + '</th><td class="loc">' + label(sim.belief[a.id]) + '</td></tr>';
      }).join('');
      return '<div class="reason-title">它追蹤的信念</div>' +
        '<table class="belief-table"><tr><th>角色</th><th>以為彈珠在…</th></tr>' + rows + '</table>';
    }
    function mentionHTML(scenario) {
      var info = surfaceScores(scenario);
      var pick = surfaceMatcherAnswer(scenario);
      var maxS = Math.max(1, scenario.containers.reduce(function (m, c) {
        return Math.max(m, info.scores[c.id]);
      }, 0));
      var bars = scenario.containers.map(function (c) {
        var w = Math.max(0.02, info.scores[c.id] / maxS);
        return '<div class="mention-row"><span class="mention-name">' + c.label + '</span>' +
          '<span class="mention-track"><span class="mention-fill" style="transform:scaleX(' + w.toFixed(3) + ')"></span></span>' +
          '<span class="mention-num">' + fmt(info.scores[c.id]) + '</span></div>';
      }).join('');
      var note = info.templateBump > 0
        ? '<div style="margin:0.5rem 0;color:var(--muted);font-size:0.85rem">＋樣板加成：「她會去『放的地方』找」→ 給 <strong>' +
          label(info.initial) + '</strong> 加 ' + fmt(info.templateBump) + ' 分</div>'
        : '';
      return '<div class="reason-title">它算的「關鍵字分數」</div>' + bars + note +
        '<div class="mention-pick">挑分數最高的 → ' + label(pick) + '</div>';
    }

    function setVerdict(valEl, markEl, boxEl, ans, correct) {
      valEl.textContent = state.revealed ? label(ans) : '？';
      boxEl.classList.remove('is-correct', 'is-wrong');
      markEl.className = 'verdict-mark';
      markEl.textContent = '';
      if (!state.revealed) return;
      if (ans === correct) { boxEl.classList.add('is-correct'); markEl.classList.add('mark-correct'); markEl.textContent = '✓'; }
      else { boxEl.classList.add('is-wrong'); markEl.classList.add('mark-wrong'); markEl.textContent = '✗'; }
    }

    function explainHTML(scenario, belief, surface, correct) {
      var c = scenario.config;
      var active = [];
      if (c.transparent) active.push('透明盒子');
      if (c.peek) active.push('Sally 偷看');
      if (c.irrelevant) active.push('無關句子');
      if (c.sallyStays) active.push('Sally 不離開');
      if (c.secondMove) active.push('搬兩次');
      var surfaceOK = surface === correct;
      if (active.length === 0) {
        return '這是<strong>經典 Sally–Anne</strong>。信念追蹤者知道 Sally 沒看到移動，答「' + label(correct) +
          '」；表面比對者也認得這個熟悉題型，答「' + label(surface) +
          '」。<strong class="hit">兩個都對</strong>——但要小心，表面比對者只是<em>剛好</em>對。';
      }
      var s = '你套用了：<strong>' + active.join('、') + '</strong>。正解是「' + label(correct) + '」。';
      s += '信念追蹤者<strong class="hit">答對（' + label(belief) + '）</strong>，因為它真的更新了「誰看到什麼」。';
      if (surfaceOK) {
        s += '這一次表面比對者<strong>也剛好對（' + label(surface) +
          '）</strong>——別高興太早，它只是被關鍵字碰巧帶對，換個微擾又會錯。';
      } else {
        s += '表面比對者<strong class="miss">答錯（' + label(surface) +
          '）</strong>：它從不檢查誰在場、誰看到，只會背題型或數關鍵字。這正是 Ullman 說的「靠表面模式、沒真懂」。';
      }
      return s;
    }

    function scenarioSummaryText(cfg) {
      var lead = cfg.sallyStays ? 'Sally 把彈珠放進籃子後留在原地' : 'Sally 把彈珠放進籃子後離開房間';
      var mv = 'Anne 把彈珠移到盒子';
      if (cfg.secondMove) mv += '，再移到抽屜';
      var extra = [];
      if (cfg.transparent) extra.push('盒子是透明的');
      if (cfg.peek) extra.push('Sally 從門縫偷看到了移動');
      if (cfg.irrelevant) extra.push('多了一句無關的話');
      var s = '現在的情境：' + lead + '，' + mv + '。';
      if (extra.length) s += ' 微擾：' + extra.join('、') + '。';
      s += ' 問：Sally 會去哪找？';
      return s;
    }

    /* ---------- 計分 ---------- */
    function countScenario(scenario) {
      if (!state.revealed) return;
      var sig = signature(scenario.config);
      if (state.seen[sig]) return;
      state.seen[sig] = true;
      var correct = correctAnswer(scenario);
      state.score.total += 1;
      if (beliefTrackerAnswer(scenario) === correct) state.score.belief += 1;
      if (surfaceMatcherAnswer(scenario) === correct) state.score.surface += 1;
      save('score', {
        total: state.score.total, belief: state.score.belief, surface: state.score.surface,
        seen: Object.keys(state.seen)
      });
      renderScoreboard();
    }
    function renderScoreboard() {
      el.scoreTotal.textContent = state.score.total;
      el.scoreBelief.textContent = state.score.belief;
      el.scoreSurface.textContent = state.score.surface;
    }

    /* ---------- 統一渲染 ---------- */
    function renderCurrent() {
      var step = state.steps[state.stepIndex];
      el.storyText.textContent = step.narr;
      el.stepIndicator.textContent = (state.stepIndex + 1) + ' / ' + state.steps.length;
      var frame = Object.assign({}, step.frame);
      frame.target = (step.isQuestion && state.revealed) ? correctAnswer(state.scenario) : null;
      renderFrame(frame);

      var showQuestion = !!step.isQuestion && isClassic(state.scenario.config);
      el.questionBlock.hidden = !showQuestion;
      el.btnPrev.disabled = state.stepIndex === 0;
      el.btnNext.disabled = state.stepIndex === state.steps.length - 1;
    }

    function renderReaders(scenario) {
      var correct = correctAnswer(scenario);
      var belief = beliefTrackerAnswer(scenario);
      var surface = surfaceMatcherAnswer(scenario);

      el.beliefValue.textContent = state.revealed ? label(belief) : '？';
      el.surfaceValue.textContent = state.revealed ? label(surface) : '？';
      el.beliefReason.innerHTML = state.revealed ? beliefTableHTML(scenario) : lockHint();
      el.surfaceReason.innerHTML = state.revealed ? mentionHTML(scenario) : lockHint();

      el.labCorrect.textContent = state.revealed ? label(correct) : '？';
      setVerdict(el.labBelief, el.labBeliefMark, el.verdictBelief, belief, correct);
      setVerdict(el.labSurface, el.labSurfaceMark, el.verdictSurface, surface, correct);
      el.labExplain.innerHTML = state.revealed
        ? explainHTML(scenario, belief, surface, correct)
        : '<span style="color:var(--muted)">回答上面的問題，或直接撥動下面的開關，這裡就會解說。</span>';
    }

    function renderAll() {
      renderCurrent();
      renderReaders(state.scenario);
      el.scenarioSummary.textContent = scenarioSummaryText(state.scenario.config);
      countScenario(state.scenario);
    }

    function setScenario(config, jumpToQuestion) {
      state.config = config;
      state.scenario = buildScenario(config);
      state.steps = buildSteps(state.scenario);
      if (jumpToQuestion) state.stepIndex = state.steps.length - 1;
      else state.stepIndex = Math.min(state.stepIndex, state.steps.length - 1);
      renderAll();
    }

    /* ---------- 揭曉 ---------- */
    function disableAnswers() {
      Array.prototype.forEach.call(el.answerButtons.children, function (b) { b.disabled = true; });
    }
    function maybeReveal(fromLab) {
      if (state.revealed && state.humanDone) return;
      if (!state.revealed) { state.revealed = true; save('revealed', true); }
      if (!state.humanDone && fromLab) {
        state.humanDone = true;
        disableAnswers();
        el.humanResult.innerHTML = '<span class="info">你先去實驗室探索了，沒問題。</span> 這題的經典正解是「籃子」。';
      }
    }

    /* ---------- 故事控制 ---------- */
    function stopPlay() {
      if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
      el.btnPlay.textContent = '▶ 播放';
      el.btnPlay.setAttribute('aria-label', '播放故事');
    }
    function goto(i) {
      state.stepIndex = Math.max(0, Math.min(i, state.steps.length - 1));
      renderCurrent();
    }
    el.btnNext.addEventListener('click', function () { stopPlay(); goto(state.stepIndex + 1); });
    el.btnPrev.addEventListener('click', function () { stopPlay(); goto(state.stepIndex - 1); });
    el.btnReset.addEventListener('click', function () { stopPlay(); goto(0); });
    el.btnPlay.addEventListener('click', function () {
      if (state.playTimer) { stopPlay(); return; }
      if (state.stepIndex >= state.steps.length - 1) goto(0);
      el.btnPlay.textContent = '⏸ 暫停';
      el.btnPlay.setAttribute('aria-label', '暫停播放');
      state.playTimer = setInterval(function () {
        if (state.stepIndex >= state.steps.length - 1) { stopPlay(); return; }
        goto(state.stepIndex + 1);
      }, prefersReduced.matches ? 900 : 1350);
    });

    /* ---------- 人類作答按鈕（經典題） ---------- */
    function buildAnswerButtons() {
      el.answerButtons.innerHTML = '';
      var classic = buildScenario({});
      classic.containers.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'answer-btn';
        b.textContent = c.label;
        b.setAttribute('data-cid', c.id);
        b.addEventListener('click', function () { onAnswer(c.id, b); });
        el.answerButtons.appendChild(b);
      });
    }
    function onAnswer(cid, btn) {
      if (state.humanDone) return;
      state.humanDone = true;
      Array.prototype.forEach.call(el.answerButtons.children, function (b) {
        b.classList.remove('chosen'); b.disabled = true;
      });
      btn.classList.add('chosen');
      var correct = correctAnswer(state.scenario);
      save('human', cid);
      if (cid === correct) {
        el.humanResult.innerHTML = '<span class="good">答對了！</span> 你選「' + label(cid) +
          '」——就像四歲以上的人，你懂 Sally 抱著一個和事實不符的信念。';
      } else {
        el.humanResult.innerHTML = '<span class="info">這題的正解是「' + label(correct) +
          '」。</span> Sally 沒看到移動，她會去她<em>以為</em>的地方找；三歲小孩常會答錯喔。';
      }
      el.humanResult.innerHTML += ' 往下看，兩台機器怎麼答 ↓';
      maybeReveal(false);
      renderAll();
    }

    /* ---------- 實驗室開關 ---------- */
    function readConfig() {
      return {
        transparent: el.pTransparent.checked,
        peek: el.pPeek.checked,
        irrelevant: el.pIrrelevant.checked,
        sallyStays: el.cSallyStays.checked,
        secondMove: el.cSecondMove.checked
      };
    }
    function onToggle() {
      stopPlay();
      maybeReveal(true);
      setScenario(readConfig(), true);
    }
    [el.pTransparent, el.pPeek, el.pIrrelevant, el.cSallyStays, el.cSecondMove].forEach(function (t) {
      t.addEventListener('change', onToggle);
    });
    el.btnLabReset.addEventListener('click', function () {
      stopPlay();
      el.pTransparent.checked = el.pPeek.checked = el.pIrrelevant.checked = false;
      el.cSallyStays.checked = el.cSecondMove.checked = false;
      state.stepIndex = 0;
      setScenario({}, false);
    });

    /* ---------- 啟動 ---------- */
    buildAnswerButtons();
    if (state.humanDone) { disableAnswers(); }
    setScenario({}, false);
    renderScoreboard();
  }

  /* =========================================================
     三、進場動畫（reveal，stagger ≤ 1.2s）
     ========================================================= */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!items.length) return;
    // 依「所屬區塊」內順序給 stagger 延遲
    var groups = {};
    items.forEach(function (elm) {
      var sec = elm.closest('section, header') || document.body;
      var key = sec.id || 'x';
      groups[key] = groups[key] || 0;
      var i = groups[key]++;
      elm.style.transitionDelay = Math.min(i * 0.07, 1.2) + 's';
    });
    if (!('IntersectionObserver' in window) || prefersReduced.matches) {
      items.forEach(function (elm) { elm.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (elm) { io.observe(elm); });
    // 失效保險：3 秒後強制顯示所有尚未顯示者
    setTimeout(function () { items.forEach(function (elm) { elm.classList.add('in'); }); }, 3000);
  }

  /* =========================================================
     四、氛圍畫布（rAF；隱藏/離屏暫停；reduced-motion 降級）
     ========================================================= */
  function initAmbient() {
    var canvas = document.getElementById('ambient');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var dots = [], raf = null, running = false, inView = true;
    var mq = prefersReduced;

    function build() {
      var n = Math.round((window.innerWidth * window.innerHeight) / 26000);
      n = Math.max(18, Math.min(n, 90));
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
          r: Math.random() * 1.8 + 0.6,
          vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
          a: Math.random() * 0.45 + 0.15
        });
      }
    }
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }
    function draw() {
      var W = window.innerWidth, H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x += W; else if (d.x > W) d.x -= W;
        if (d.y < 0) d.y += H; else if (d.y > H) d.y -= H;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, 6.2832);
        ctx.fillStyle = 'rgba(240,192,99,' + d.a + ')';
        ctx.fill();
      }
    }
    function loop() { if (!running) return; draw(); raf = requestAnimationFrame(loop); }
    function start() {
      if (running || mq.matches || document.hidden || !inView) return;
      running = true; raf = requestAnimationFrame(loop);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }
    function drawStatic() { draw(); }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    var hero = document.getElementById('hero');
    if ('IntersectionObserver' in window && hero) {
      var io = new IntersectionObserver(function (es) {
        inView = es[0].isIntersecting;
        if (inView) start(); else stop();
      }, { threshold: 0 });
      io.observe(hero);
    }
    mq.addEventListener('change', function () {
      if (mq.matches) { stop(); drawStatic(); } else start();
    });
    window.addEventListener('resize', debounce(function () {
      resize(); if (!running) drawStatic();
    }, 200));

    resize();
    if (mq.matches) drawStatic(); else start();
  }

})();

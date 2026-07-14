/* =========================================================
   偏誤照妖鏡 · app.js
   純靜態 · 不呼叫任何 AI/API · localStorage 前綴 bias.
   前半段是可被 node 測試的純邏輯；後半段才碰 DOM。
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 常數資料 ---------------- */
  var BIAS_KEY = 'bias.state.v1';
  var BASE_RATE = 30; // 房間裡工程師比例（基率）

  var FRAME_DATA = {
    gain: {
      name: '獲得框架（講「救活」）',
      safe: '確定能救活 200 人。',
      risky: '有 1/3 機率救活全部 600 人，2/3 機率一個都救不了。'
    },
    loss: {
      name: '損失框架（講「死亡」）',
      safe: '確定會有 400 人死亡。',
      risky: '有 1/3 機率沒有人死亡，2/3 機率 600 人全部死亡。'
    }
  };

  /* ---------------- 純邏輯（可測試） ---------------- */

  function defaultState() {
    return {
      v: 1,
      conjunction: { choice: null, fell: null },
      framing: { assigned: null, gainChoice: null, lossChoice: null, fell: null },
      anchoring: { samples: [] }, // 每筆 {anchor, high, estimate, dir}
      baserate: { estimate: null, fell: null }
    };
  }

  // 合取謬誤：選 B（銀行員 + 女權）= 非理性
  function judgeConjunction(choice) {
    return { fell: choice === 'B' };
  }

  // 隨機把使用者分到獲得/損失框架
  function assignFrame(rng) {
    rng = rng || Math.random;
    return rng() < 0.5 ? 'gain' : 'loss';
  }

  // 個人層級的框架效應：同一問題、兩種說法給出不同選擇 = 中招
  function judgeFraming(gainChoice, lossChoice) {
    var complete = !!gainChoice && !!lossChoice;
    return { complete: complete, fell: complete ? (gainChoice !== lossChoice) : null };
  }

  // 擲一個隨機錨點：高錨落在 60–90、低錨落在 5–35，天然分兩群
  function rollAnchor(rng) {
    rng = rng || Math.random;
    var high = rng() < 0.5;
    var anchor = high ? 60 + Math.floor(rng() * 31) : 5 + Math.floor(rng() * 31);
    return { anchor: anchor, high: high };
  }

  // 統計高錨 vs 低錨的平均估計值
  function anchoringStats(samples) {
    samples = samples || [];
    var low = samples.filter(function (s) { return !s.high; });
    var high = samples.filter(function (s) { return s.high; });
    var mean = function (a) {
      if (!a.length) return null;
      return a.reduce(function (sum, x) { return sum + x.estimate; }, 0) / a.length;
    };
    var lowMean = mean(low), highMean = mean(high);
    var gap = (lowMean != null && highMean != null) ? Math.round((highMean - lowMean) * 10) / 10 : null;
    return {
      lowN: low.length,
      highN: high.length,
      lowMean: lowMean != null ? Math.round(lowMean * 10) / 10 : null,
      highMean: highMean != null ? Math.round(highMean * 10) / 10 : null,
      gap: gap
    };
  }

  // 錨定是否「中招」：高錨平均 > 低錨平均（兩群都要有樣本才算數）
  function anchoringFell(state) {
    var st = anchoringStats(state.anchoring.samples);
    if (st.lowN > 0 && st.highN > 0) return st.highMean > st.lowMean;
    return null;
  }

  // 基率忽略：基率 30%，估計衝到 50% 以上 = 讓代表性蓋過基率
  function judgeBaseRate(estimate, baseRate) {
    baseRate = (baseRate == null) ? BASE_RATE : baseRate;
    return { fell: estimate >= 50, baseRate: baseRate };
  }

  // 統整四題結果
  function computeSummary(state) {
    var per = {
      conjunction: state.conjunction.fell,
      framing: state.framing.fell,
      anchoring: anchoringFell(state),
      baserate: state.baserate.fell
    };
    var fellCount = 0, answered = 0;
    ['conjunction', 'framing', 'anchoring', 'baserate'].forEach(function (k) {
      var v = per[k];
      if (v !== null && v !== undefined) { answered++; if (v) fellCount++; }
    });
    return { per: per, fellCount: fellCount, answered: answered, total: 4 };
  }

  var Logic = {
    BIAS_KEY: BIAS_KEY,
    BASE_RATE: BASE_RATE,
    FRAME_DATA: FRAME_DATA,
    defaultState: defaultState,
    judgeConjunction: judgeConjunction,
    assignFrame: assignFrame,
    judgeFraming: judgeFraming,
    rollAnchor: rollAnchor,
    anchoringStats: anchoringStats,
    anchoringFell: anchoringFell,
    judgeBaseRate: judgeBaseRate,
    computeSummary: computeSummary
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Logic;
  }

  /* ================= 以下只在瀏覽器執行 ================= */
  if (typeof document === 'undefined') return;

  /* ---------------- 減少動態 ---------------- */
  var motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReduced = motionMQ.matches;
  motionMQ.addEventListener('change', function (e) {
    prefersReduced = e.matches;
    if (prefersReduced) MirrorFX.stop(); else MirrorFX.maybeStart();
  });

  /* ---------------- 狀態存取 ---------------- */
  var state = loadState();

  function loadState() {
    try {
      var raw = window.localStorage.getItem(BIAS_KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var base = defaultState();
      // 淺層補齊，避免舊資料缺欄位
      base.conjunction = Object.assign(base.conjunction, s.conjunction || {});
      base.framing = Object.assign(base.framing, s.framing || {});
      base.baserate = Object.assign(base.baserate, s.baserate || {});
      if (s.anchoring && Array.isArray(s.anchoring.samples)) base.anchoring.samples = s.anchoring.samples;
      return base;
    } catch (err) {
      return defaultState();
    }
  }
  function saveState() {
    try { window.localStorage.setItem(BIAS_KEY, JSON.stringify(state)); } catch (err) {}
  }

  /* ---------------- 小工具 ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function animateCount(el, to, dur) {
    if (!el) return;
    to = Number(to) || 0;
    if (prefersReduced) { el.textContent = to; return; }
    dur = dur || 950;
    var start = performance.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(to * e);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function growBars(container) {
    $all('.bar', container).forEach(function (bar) {
      var fill = $('.bar__fill', bar);
      if (!fill) return;
      var v = fill.hasAttribute('data-bar-you') ? fill.getAttribute('data-bar-you') : fill.getAttribute('data-bar');
      var p = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
      bar.style.setProperty('--p', p);
      if (prefersReduced) { bar.classList.add('is-grown'); }
      else { requestAnimationFrame(function () { bar.classList.add('is-grown'); }); }
    });
    $all('.num[data-count]', container).forEach(function (n) {
      animateCount(n, n.getAttribute('data-count'));
    });
  }

  function sectionOf(exp) { return $('#exp-' + exp) || $('[data-exp="' + exp + '"]'); }

  function showReveal(exp, opts) {
    opts = opts || {};
    var section = sectionOf(exp);
    if (!section) return;
    var rv = $('[data-stage="reveal"]', section);
    if (!rv) return;
    var firstTime = rv.hidden;
    rv.hidden = false;
    if (firstTime && !prefersReduced) rv.classList.add('is-in');
    growBars(rv);
    markDone(exp);
    if (opts.scroll && !prefersReduced) {
      rv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function lockAsk(exp) {
    var section = sectionOf(exp);
    if (!section) return;
    var ask = $('[data-stage="ask"]', section);
    if (!ask) return;
    $all('input, button', ask).forEach(function (el) {
      if (el.hasAttribute('data-keep-live')) return;
      el.disabled = true;
    });
    $all('.opt--btn', ask).forEach(function (b) { b.setAttribute('aria-disabled', 'true'); b.tabIndex = -1; });
  }

  function markDone(exp) {
    var li = $('#progress-list li[data-step="' + exp + '"]');
    if (li) li.classList.add('is-done');
  }

  /* ---------------- 實驗一：合取謬誤 ---------------- */
  (function initConjunction() {
    var section = sectionOf('conjunction');
    if (!section) return;
    var radios = $all('input[name="conjunction"]', section);
    var submit = $('[data-submit="conjunction"]', section);

    radios.forEach(function (r) {
      r.addEventListener('change', function () { if (submit) submit.disabled = false; });
    });
    if (submit) submit.addEventListener('click', function () {
      var picked = radios.filter(function (r) { return r.checked; })[0];
      if (!picked) return;
      state.conjunction.choice = picked.value;
      state.conjunction.fell = judgeConjunction(picked.value).fell;
      saveState();
      fillConjunction();
      lockAsk('conjunction');
      showReveal('conjunction', { scroll: true });
      renderSummary();
    });
  })();

  function fillConjunction() {
    var el = $('[data-fill="conjunction-your"]');
    if (!el) return;
    var c = state.conjunction;
    if (c.choice == null) { el.textContent = ''; return; }
    if (c.fell) {
      el.className = 'yourline is-fell';
      el.innerHTML = '你選了 <b>B</b>——你也掉進了合取謬誤：把「更具體、更像 Linda」誤當成「更可能」。';
    } else {
      el.className = 'yourline is-safe';
      el.innerHTML = '你選了 <b>A</b>——漂亮，你避開了這個陷阱。（研究裡只有少數人做得到。）';
    }
  }

  /* ---------------- 實驗二：框架效應 ---------------- */
  (function initFraming() {
    var section = sectionOf('framing');
    if (!section) return;

    if (!state.framing.assigned) {
      state.framing.assigned = assignFrame();
      saveState();
    }
    renderFrameText();

    var btns = $all('.opts--frame .opt--btn', section);
    var submit = $('[data-submit="framing"]', section);
    var chosen = null;

    function selectBtn(btn) {
      chosen = btn.getAttribute('data-choice');
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      if (submit) submit.disabled = false;
    }
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () { selectBtn(btn); });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectBtn(btn); }
      });
    });

    if (submit) submit.addEventListener('click', function () {
      if (!chosen) return;
      var frame = state.framing.assigned;
      if (frame === 'gain') state.framing.gainChoice = chosen;
      else state.framing.lossChoice = chosen;
      recomputeFraming();
      saveState();
      fillFraming();
      lockAsk('framing');
      showReveal('framing', { scroll: true });
      initFlipDemo();
      renderSummary();
    });
  })();

  function renderFrameText() {
    var frame = state.framing.assigned;
    if (!frame) return;
    var d = FRAME_DATA[frame];
    var nameEl = $('[data-fill="frame-name"]');
    if (nameEl) nameEl.textContent = d.name;
    var safeEl = $('[data-fill="frame-safe"]');
    var riskyEl = $('[data-fill="frame-risky"]');
    if (safeEl) safeEl.textContent = d.safe;
    if (riskyEl) riskyEl.textContent = d.risky;
  }

  function recomputeFraming() {
    var r = judgeFraming(state.framing.gainChoice, state.framing.lossChoice);
    state.framing.fell = r.fell;
  }

  function fillFraming() {
    var el = $('[data-fill="framing-your"]');
    if (!el) return;
    var frame = state.framing.assigned;
    var d = FRAME_DATA[frame];
    var myChoice = frame === 'gain' ? state.framing.gainChoice : state.framing.lossChoice;
    if (!myChoice) { el.textContent = ''; return; }
    var choiceLabel = myChoice === 'safe' ? '保守案' : '冒險案';
    el.className = 'yourline';
    el.innerHTML = '你被分到<b>' + d.name + '</b>，選了<b>' + choiceLabel + '</b>。想知道自己有沒有被說法牽著走？往下切換另一個框架，再選一次。';
  }

  function initFlipDemo() {
    var section = sectionOf('framing');
    var flipBtn = $('[data-flip]', section);
    var otherEl = $('[data-fill="frame-other"]');
    var resultEl = $('[data-fill="flip-result"]');
    if (!flipBtn) return;

    var other = state.framing.assigned === 'gain' ? 'loss' : 'gain';
    if (otherEl) otherEl.textContent = other === 'gain' ? '獲得' : '損失';

    var otherChoice = other === 'gain' ? state.framing.gainChoice : state.framing.lossChoice;
    if (otherChoice) { showFlipResult(); return; } // 已完成

    flipBtn.addEventListener('click', function () {
      if ($('.flip-demo__opts', section)) return; // 已展開
      var d = FRAME_DATA[other];
      var wrap = document.createElement('div');
      wrap.className = 'flip-demo__opts opts opts--frame';
      wrap.style.marginTop = '12px';
      wrap.innerHTML =
        '<p class="ask__q" style="margin:0 0 10px">同一個問題，改用<b>' + d.name + '</b>，你會選哪個？</p>';
      [['safe', '保守案', d.safe], ['risky', '冒險案', d.risky]].forEach(function (o) {
        var b = document.createElement('div');
        b.className = 'opt opt--btn';
        b.setAttribute('role', 'button');
        b.tabIndex = 0;
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = '<span class="opt__key">' + o[1] + '</span><span class="opt__text">' + o[2] + '</span>';
        function pick() {
          if (other === 'gain') state.framing.gainChoice = o[0];
          else state.framing.lossChoice = o[0];
          recomputeFraming();
          saveState();
          showFlipResult();
          renderSummary();
        }
        b.addEventListener('click', pick);
        b.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
        });
        wrap.appendChild(b);
      });
      flipBtn.parentNode.insertBefore(wrap, flipBtn.nextSibling);
      flipBtn.disabled = true;
    });

    function showFlipResult() {
      if (!resultEl) return;
      var r = judgeFraming(state.framing.gainChoice, state.framing.lossChoice);
      var gLabel = state.framing.gainChoice === 'safe' ? '保守案' : '冒險案';
      var lLabel = state.framing.lossChoice === 'safe' ? '保守案' : '冒險案';
      resultEl.hidden = false;
      var opts = $('.flip-demo__opts', section);
      if (opts) opts.remove();
      if (flipBtn) flipBtn.style.display = 'none';
      if (r.fell) {
        resultEl.className = 'flip-demo__result is-flip';
        resultEl.innerHTML = '你在<b>獲得框架</b>選了「' + gLabel + '」，在<b>損失框架</b>選了「' + lLabel +
          '」——<b>同一件事、只是換句話說，你的選擇就反轉了</b>。這正是框架效應本人。';
      } else {
        resultEl.className = 'flip-demo__result is-same';
        resultEl.innerHTML = '你兩種說法都選了「' + gLabel + '」——這次沒被框架帶走。' +
          '不過在原始研究裡，多數人會反轉：<b>72% → 22%</b>。';
      }
    }
  }

  /* ---------------- 實驗三：錨定效應 ---------------- */
  (function initAnchoring() {
    var section = sectionOf('anchoring');
    if (!section) return;

    var wheelEl = $('.wheel', section);
    var numEl = $('#wheel-num', section);
    var rollBtn = $('#wheel-roll', section);
    var anchorQ = $('#anchor-q', section);
    var anchorShow = $('#anchor-show', section);
    var hlBtns = $all('.hl-btns [data-hl]', section);
    var estWrap = $('#estimate-wrap', section);
    var estInput = $('#estimate', section);
    var estOut = $('#est-out', section);
    var submit = $('[data-submit="anchoring"]', section);
    var hint = $('#anchor-hint', section);

    if (rollBtn) rollBtn.setAttribute('data-keep-live', '1');
    if (submit) submit.setAttribute('data-keep-live', '1');

    var current = null; // {anchor, high, dir}

    function setEstOut() { if (estOut && estInput) estOut.textContent = estInput.value + '%'; }
    if (estInput) estInput.addEventListener('input', setEstOut);

    function afterRoll(a) {
      current = { anchor: a.anchor, high: a.high, dir: null };
      if (anchorShow) anchorShow.textContent = a.anchor;
      if (anchorQ) anchorQ.hidden = false;
      if (estWrap) estWrap.hidden = true;
      hlBtns.forEach(function (b) { b.classList.remove('is-on'); b.setAttribute('aria-pressed', 'false'); });
      if (estInput) { estInput.value = 30; setEstOut(); }
      if (rollBtn) rollBtn.textContent = '重新擲一次';
    }

    function spin() {
      var a = rollAnchor();
      if (prefersReduced || !wheelEl) {
        if (numEl) numEl.textContent = a.anchor;
        afterRoll(a);
        return;
      }
      wheelEl.classList.add('is-spinning');
      var dur = 750, start = performance.now();
      (function tick(now) {
        var t = Math.min(1, (now - start) / dur);
        if (t < 1) {
          if (numEl) numEl.textContent = Math.floor(Math.random() * 96);
          requestAnimationFrame(tick);
        } else {
          if (numEl) numEl.textContent = a.anchor;
          wheelEl.classList.remove('is-spinning');
          afterRoll(a);
        }
      })(performance.now());
    }

    if (rollBtn) rollBtn.addEventListener('click', spin);

    hlBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (!current) return;
        current.dir = b.getAttribute('data-hl');
        hlBtns.forEach(function (x) {
          var on = x === b;
          x.classList.toggle('is-on', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (estWrap) estWrap.hidden = false;
      });
    });

    if (submit) submit.addEventListener('click', function () {
      if (!current || !estInput) return;
      var est = Math.max(0, Math.min(100, parseInt(estInput.value, 10) || 0));
      state.anchoring.samples.push({ anchor: current.anchor, high: current.high, estimate: est, dir: current.dir });
      saveState();
      if (anchorQ) anchorQ.hidden = true;
      if (numEl) numEl.textContent = '—';
      if (rollBtn) rollBtn.textContent = '再擲一次、多答幾筆';
      current = null;
      if (hint) hint.textContent = '再擲幾次、換高換低多答幾筆，下面的落差會越來越清楚。';
      renderAnchoring();
      showReveal('anchoring', { scroll: true });
      renderSummary();
    });

    // 還原既有樣本
    renderAnchoring();
    if (state.anchoring.samples.length > 0) {
      fillAnchoringYour();
    }
  })();

  function renderAnchoring() {
    var plot = $('#anchor-plot');
    if (plot) plot.innerHTML = buildAnchorPlot(state.anchoring.samples);
    var st = anchoringStats(state.anchoring.samples);
    setText('[data-fill="low-mean"]', st.lowMean != null ? st.lowMean + '%（' + st.lowN + ' 筆）' : '尚無');
    setText('[data-fill="high-mean"]', st.highMean != null ? st.highMean + '%（' + st.highN + ' 筆）' : '尚無');
    setText('[data-fill="anchor-gap"]', st.gap != null ? st.gap + ' 個百分點' : '需高、低錨各至少一筆');
    fillAnchoringYour();
  }

  function fillAnchoringYour() {
    var el = $('[data-fill="anchoring-your"]');
    if (!el) return;
    var st = anchoringStats(state.anchoring.samples);
    var n = state.anchoring.samples.length;
    if (n === 0) { el.textContent = ''; return; }
    var msg = '你已記錄 <b>' + n + '</b> 筆（低錨 ' + st.lowN + ' 筆、高錨 ' + st.highN + ' 筆）。';
    if (st.lowN > 0 && st.highN > 0) {
      if (st.gap > 0) {
        el.className = 'yourline is-fell';
        msg += ' 你的高錨平均比低錨高出 <b>' + st.gap + '</b> 個百分點——那個亂數把你拉走了。';
      } else {
        el.className = 'yourline is-safe';
        msg += ' 你的高、低錨估計幾乎沒差，這回沒被錨點牽走。';
      }
    } else {
      el.className = 'yourline';
      msg += ' 高、低錨各記錄至少一筆，就能看出落差。';
    }
    el.innerHTML = msg;
  }

  function buildAnchorPlot(samples) {
    var W = 320, H = 170, padL = 22, padR = 16, padT = 26, padB = 26;
    var x = function (v) { return padL + (v / 100) * (W - padL - padR); };
    var laneLow = padT + 24, laneHigh = H - padB - 24;
    var st = anchoringStats(samples);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img">';
    // 座標刻度
    [0, 28, 50, 100].forEach(function (t) {
      var dash = t === 28 ? ' stroke-dasharray="3 3"' : '';
      s += '<line x1="' + x(t) + '" y1="' + padT + '" x2="' + x(t) + '" y2="' + (H - padB) + '" stroke="' + (t === 28 ? 'var(--gpt)' : 'var(--line)') + '" stroke-width="1"' + dash + '/>';
      s += '<text x="' + x(t) + '" y="' + (H - padB + 14) + '" fill="var(--ink-3)" font-size="9" text-anchor="middle">' + t + '%</text>';
    });
    s += '<text x="' + x(28) + '" y="' + (padT - 9) + '" fill="var(--gpt)" font-size="9" text-anchor="middle">真實 ≈ 28%</text>';
    s += '<text x="4" y="' + (laneLow + 3) + '" fill="var(--accent-2)" font-size="9">低</text>';
    s += '<text x="4" y="' + (laneHigh + 3) + '" fill="var(--you)" font-size="9">高</text>';
    // 樣本點
    samples.forEach(function (sm) {
      var lane = sm.high ? laneHigh : laneLow;
      var col = sm.high ? 'var(--you)' : 'var(--accent-2)';
      s += '<circle cx="' + x(sm.estimate) + '" cy="' + lane + '" r="5" fill="' + col + '" opacity="0.82"><title>錨 ' + sm.anchor + '% → 估 ' + sm.estimate + '%</title></circle>';
    });
    // 平均標記
    if (st.lowMean != null) s += meanMark(x(st.lowMean), laneLow, 'var(--accent-2)', st.lowMean);
    if (st.highMean != null) s += meanMark(x(st.highMean), laneHigh, 'var(--you)', st.highMean);
    s += '</svg>';
    return s;
  }
  function meanMark(cx, cy, col, val) {
    return '<g>' +
      '<line x1="' + cx + '" y1="' + (cy - 13) + '" x2="' + cx + '" y2="' + (cy + 13) + '" stroke="' + col + '" stroke-width="2"/>' +
      '<text x="' + cx + '" y="' + (cy - 16) + '" fill="' + col + '" font-size="9" font-weight="700" text-anchor="middle">' + val + '</text>' +
      '</g>';
  }

  /* ---------------- 實驗四：基率忽略 ---------------- */
  (function initBaseRate() {
    var section = sectionOf('baserate');
    if (!section) return;
    var input = $('#baserate-est', section);
    var out = $('#br-out', section);
    var submit = $('[data-submit="baserate"]', section);

    function setOut() { if (out && input) out.textContent = input.value + '%'; }
    if (input) input.addEventListener('input', setOut);

    if (submit) submit.addEventListener('click', function () {
      if (!input) return;
      var est = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
      state.baserate.estimate = est;
      state.baserate.fell = judgeBaseRate(est).fell;
      saveState();
      fillBaseRate();
      lockAsk('baserate');
      showReveal('baserate', { scroll: true });
      renderSummary();
    });
  })();

  function fillBaseRate() {
    var section = sectionOf('baserate');
    var est = state.baserate.estimate;
    if (est == null) return;
    // 設定「你的估計」長條與數字
    var youFill = $('.bar__fill--you', section);
    if (youFill) youFill.setAttribute('data-bar-you', est);
    setText('[data-fill="baserate-num"]', est + '%', true);
    var el = $('[data-fill="baserate-your"]');
    if (el) {
      if (state.baserate.fell) {
        el.className = 'yourline is-fell';
        el.innerHTML = '你猜 <b>' + est + '%</b>——基率只有 30%，你的估計被「像不像工程師」帶著跑了。';
      } else {
        el.className = 'yourline is-safe';
        el.innerHTML = '你猜 <b>' + est + '%</b>——你壓在基率附近，沒讓刻板印象蓋過機率。';
      }
    }
  }

  /* ---------------- 總結矩陣 ---------------- */
  var EXP_META = [
    { id: 'conjunction', name: '合取謬誤', sub: 'Linda 問題', humanPct: 85, humanLabel: '選合取', gpt: '研究觀察也如此' },
    { id: 'framing', name: '框架效應', sub: '亞洲疾病問題', humanPct: null, humanLabel: '72% → 22% 反轉', gpt: '被措辭左右' },
    { id: 'anchoring', name: '錨定效應', sub: '非洲比例估計', humanPct: null, humanLabel: '錨 10→25 / 65→45', gpt: '朝錨點靠攏' },
    { id: 'baserate', name: '基率忽略', sub: '律師工程師', humanPct: null, humanLabel: '近乎忽略基率', gpt: '以「像不像」取代' }
  ];

  function renderSummary() {
    var sum = computeSummary(state);
    var countEl = $('#fell-count');
    if (countEl) animateCount(countEl, sum.fellCount, 700);

    var note = $('#scorecard-note');
    if (note) {
      if (sum.answered === 0) {
        note.textContent = '完成上面的實驗，這面鏡子就會亮起來。';
      } else if (sum.answered < 4) {
        note.innerHTML = '已完成 <b>' + sum.answered + '/4</b> 題。做完全部，對照會更完整。';
      } else if (sum.fellCount === 0) {
        note.textContent = '四題你都避開了——非常罕見，但別得意，換一批題目偏誤可能又出現了。';
      } else {
        note.innerHTML = '這不是你「不理性」，而是這些捷思是<b>人類共有的出廠設定</b>——而 AI 從我們的文字裡，把它們一起學了走。';
      }
    }

    var matrix = $('#summary-matrix');
    if (!matrix) return;
    var html = '<div class="mrow mrow--head"><span>偏誤</span><span>你</span><span>人類實測</span><span>GPT</span></div>';
    EXP_META.forEach(function (m) {
      var v = sum.per[m.id];
      var youCls = v === true ? 'is-fell' : (v === false ? 'is-safe' : 'is-none');
      var youTxt = v === true ? '中招' : (v === false ? '避開' : '未測');
      var youIcon = v === true ? '✕' : (v === false ? '✓' : '·');

      var humanCell;
      if (m.humanPct != null) {
        humanCell = '<div class="mrow__human"><div class="bar"><span class="bar__fill" data-bar="' + m.humanPct + '"></span></div><span class="mrow__pct">' + m.humanPct + '%</span></div>';
      } else {
        humanCell = '<div class="mrow__human"><span class="mrow__pct" style="min-width:auto;font-size:.86rem;color:var(--human)">' + m.humanLabel + '</span></div>';
      }

      html += '<div class="mrow">' +
        '<span class="mrow__name">' + m.name + '<small>' + m.sub + '</small></span>' +
        '<span class="mrow__you ' + youCls + '">' + youIcon + ' ' + youTxt + '</span>' +
        humanCell +
        '<span class="mrow__gpt"><i class="dot dot--gpt"></i>' + m.gpt + '</span>' +
        '</div>';
    });
    matrix.innerHTML = html;
    growBars(matrix);
  }

  /* ---------------- 重置 ---------------- */
  (function initReset() {
    var btn = $('#reset-all');
    if (!btn) return;
    btn.addEventListener('click', function () {
      try { window.localStorage.removeItem(BIAS_KEY); } catch (e) {}
      window.location.reload();
    });
  })();

  /* ---------------- 小工具：填字 ---------------- */
  function setText(sel, txt, html) {
    var el = $(sel);
    if (!el) return;
    if (html) el.innerHTML = txt; else el.textContent = txt;
  }

  /* ---------------- 還原已作答的狀態 ---------------- */
  function hydrate() {
    if (state.conjunction.choice != null) {
      fillConjunction(); lockAsk('conjunction'); showReveal('conjunction');
    }
    var frameChoice = state.framing.assigned === 'gain' ? state.framing.gainChoice : state.framing.lossChoice;
    if (frameChoice) {
      fillFraming(); lockAsk('framing'); showReveal('framing'); initFlipDemo();
    }
    if (state.anchoring.samples.length > 0) {
      renderAnchoring(); showReveal('anchoring');
    }
    if (state.baserate.estimate != null) {
      fillBaseRate(); lockAsk('baserate'); showReveal('baserate');
    }
    renderSummary();
  }

  /* ---------------- 進場動畫 & 進度 ---------------- */
  (function initObservers() {
    var ups = $all('.reveal-up');
    if ('IntersectionObserver' in window && !prefersReduced) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-vis'); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      ups.forEach(function (el) { io.observe(el); });
    } else {
      ups.forEach(function (el) { el.classList.add('is-vis'); });
    }

    // 進度高亮
    var steps = $all('#progress-list li');
    var sections = ['conjunction', 'framing', 'anchoring', 'baserate'].map(sectionOf).filter(Boolean);
    var summaryEl = $('#summary');
    if (summaryEl) sections.push(summaryEl);
    if ('IntersectionObserver' in window && sections.length) {
      var active = null;
      var po = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.getAttribute('data-exp') || (en.target.id === 'summary' ? 'summary' : null);
          if (!id || id === active) return;
          active = id;
          steps.forEach(function (li) { li.classList.toggle('is-active', li.getAttribute('data-step') === id); });
        });
      }, { threshold: 0.45 });
      sections.forEach(function (s) { po.observe(s); });
    }
  })();

  /* ---------------- 照妖鏡 canvas ---------------- */
  var MirrorFX = (function () {
    var canvas = $('#mirror-canvas');
    var running = false, rafId = null, onScreen = true, tabVisible = true;
    var ctx, W, H, cx, cy, R, dpr, particles, t0;

    function setup() {
      if (!canvas) return false;
      ctx = canvas.getContext('2d');
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cssW = canvas.clientWidth || 440, cssH = canvas.clientHeight || 440;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      W = canvas.width; H = canvas.height;
      cx = W / 2; cy = H / 2; R = Math.min(W, H) / 2 - 2 * dpr;
      particles = [];
      var N = 42;
      for (var i = 0; i < N; i++) {
        var ang = Math.random() * Math.PI * 2;
        var rad = Math.sqrt(Math.random()) * R;
        particles.push({
          a: ang, r: rad,
          sp: (Math.random() * 0.0015 + 0.0004) * (Math.random() < 0.5 ? 1 : -1),
          rr: Math.random() * 1.6 * dpr + 0.6 * dpr,
          hue: Math.random()
        });
      }
      t0 = performance.now();
      return true;
    }

    function colorFor(h) {
      if (h < 0.4) return 'rgba(143,134,255,';   // accent
      if (h < 0.72) return 'rgba(73,212,196,';   // human
      return 'rgba(255,192,97,';                 // gpt
    }

    function frame(now) {
      if (!running) return;
      var el = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      // 底盤
      var g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      g.addColorStop(0, 'rgba(30,34,54,0.9)');
      g.addColorStop(1, 'rgba(10,12,18,0.95)');
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // 同心環
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1 * dpr;
      for (var k = 1; k <= 4; k++) {
        ctx.beginPath(); ctx.arc(cx, cy, R * k / 4.5, 0, Math.PI * 2); ctx.stroke();
      }

      // 粒子
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.a += p.sp;
        var px = cx + Math.cos(p.a) * p.r;
        var py = cy + Math.sin(p.a) * p.r;
        var tw = 0.45 + 0.4 * Math.sin(el * 1.4 + i);
        ctx.fillStyle = colorFor(p.hue) + tw.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, p.rr, 0, Math.PI * 2); ctx.fill();
      }

      // 掃描線（照）
      var scanX = cx + Math.sin(el * 0.6) * R * 0.92;
      var lg = ctx.createLinearGradient(scanX - 14 * dpr, 0, scanX + 14 * dpr, 0);
      lg.addColorStop(0, 'rgba(87,199,255,0)');
      lg.addColorStop(0.5, 'rgba(87,199,255,0.22)');
      lg.addColorStop(1, 'rgba(87,199,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(scanX - 14 * dpr, cy - R, 28 * dpr, R * 2);

      ctx.restore();
      rafId = requestAnimationFrame(frame);
    }

    function shouldRun() { return onScreen && tabVisible && !prefersReduced; }
    function start() {
      if (running || !canvas) return;
      if (!ctx && !setup()) return;
      running = true; t0 = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }
    function maybeStart() { if (shouldRun()) start(); else stop(); }

    function initGuards() {
      if (!canvas) return;
      document.addEventListener('visibilitychange', function () {
        tabVisible = !document.hidden; maybeStart();
      });
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          onScreen = entries[0].isIntersecting; maybeStart();
        }, { threshold: 0.05 });
        io.observe(canvas);
      }
      window.addEventListener('resize', debounce(function () {
        var wasRunning = running; stop(); setup();
        if (wasRunning) start();
      }, 250));
      if (prefersReduced) drawStatic(); else maybeStart();
    }

    function drawStatic() {
      if (!ctx && !setup()) return;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      var g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      g.addColorStop(0, 'rgba(30,34,54,0.9)'); g.addColorStop(1, 'rgba(10,12,18,0.95)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var px = cx + Math.cos(p.a) * p.r, py = cy + Math.sin(p.a) * p.r;
        ctx.fillStyle = colorFor(p.hue) + '0.5)';
        ctx.beginPath(); ctx.arc(px, py, p.rr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    return { initGuards: initGuards, stop: stop, maybeStart: maybeStart };
  })();

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ---------------- 啟動 ---------------- */
  function boot() {
    hydrate();
    MirrorFX.initGuards();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();

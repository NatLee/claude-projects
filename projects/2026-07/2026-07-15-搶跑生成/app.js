/* 搶跑生成 · Speculative Decoding 玩具示範
 * 純靜態、零外部資源、不呼叫任何 LLM／API、離線可跑。
 * 核心演算法寫成環境無關的純函式（供瀏覽器與 node 測試共用）。
 */
'use strict';

/* ══════════════════════════════════════════════════════════
 * 一、核心：亂數、n-gram 模型、機率分布運算、兩種解碼器
 * 這一整段不碰任何 DOM，node 端 require 後即可測試。
 * ════════════════════════════════════════════════════════ */

/* mulberry32：可設種子的確定性亂數，回傳 [0,1) */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 內建小語料（公共領域文本，去標點只留字元）。
 * 高階模型（大模型）能近乎確定地重現這些句子；
 * 低階模型（小模型草稿）常常一致、但在分岔處偶爾猜錯。 */
const CORPORA = [
  { id: 'tang', name: '唐詩選', seed: '白日依',
    text: '白日依山盡黃河入海流欲窮千里目更上一層樓春眠不覺曉處處聞啼鳥夜來風雨聲花落知多少慈母手中線遊子身上衣臨行密密縫意恐遲遲歸誰言寸草心報得三春暉' },
  { id: 'sanzi', name: '三字經', seed: '人之初',
    text: '人之初性本善性相近習相遠苟不教性乃遷教之道貴以專昔孟母擇鄰處子不學斷機杼養不教父之過教不嚴師之惰子不學非所宜幼不學老何為玉不琢不成器人不學不知義' },
  { id: 'lunyu', name: '論語·學而', seed: '學而時',
    text: '學而時習之不亦說乎有朋自遠方來不亦樂乎人不知而不慍不亦君子乎吾日三省吾身為人謀而不忠乎與朋友交而不信乎傳不習乎' }
];

/* 建 n-gram 計數表（含 0..order-1 各階，供退避 backoff） */
function buildModel(text, order) {
  const chars = Array.from(text);
  const counts = [];
  for (let k = 0; k < order; k++) counts[k] = new Map();
  for (let i = 0; i < chars.length; i++) {
    const nxt = chars[i];
    for (let k = 0; k < order; k++) {
      if (i - k < 0) break;
      const ctx = chars.slice(i - k, i).join('');
      let m = counts[k].get(ctx);
      if (!m) { m = new Map(); counts[k].set(ctx, m); }
      m.set(nxt, (m.get(nxt) || 0) + 1);
    }
  }
  return { order: order, counts: counts, vocab: Array.from(new Set(chars)).sort() };
}

/* 給定上下文，取最高可用階的機率分布（stupid backoff） */
function distAt(model, ctxArr, maxOrder) {
  const mo = Math.min(maxOrder, model.order);
  for (let k = mo - 1; k >= 0; k--) {
    const ctx = ctxArr.slice(ctxArr.length - k).join('');
    const m = model.counts[k].get(ctx);
    if (m) {
      let tot = 0;
      for (const v of m.values()) tot += v;
      const d = new Map();
      for (const [t, c] of m) d.set(t, c / tot);
      return { dist: d, usedOrder: k };
    }
  }
  const d = new Map();
  const p = 1 / model.vocab.length;
  for (const t of model.vocab) d.set(t, p);
  return { dist: d, usedOrder: -1 };
}

/* 兩個分布依比例 kappa 內插並歸一化：小模型 = (1-κ)低階 + κ大模型 */
function mixDist(a, b, k) {
  const d = new Map();
  for (const [t, p] of a) d.set(t, (1 - k) * p);
  for (const [t, p] of b) d.set(t, (d.get(t) || 0) + k * p);
  let tot = 0;
  for (const v of d.values()) tot += v;
  if (tot > 0) for (const [t, v] of d) d.set(t, v / tot);
  return d;
}

/* argmax：機率最大者；同分時以字元順序穩定 tie-break，確保可重現 */
function argmaxDist(d) {
  let best = null, bp = -1;
  for (const [t, p] of d) {
    if (p > bp || (p === bp && (best === null || t < best))) { bp = p; best = t; }
  }
  return best;
}

/* 反 CDF 取樣，u ∈ [0,1)。以字元排序保證確定性 */
function sampleFromDist(d, u) {
  const items = Array.from(d.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let c = 0;
  for (const [t, p] of items) { c += p; if (u < c) return t; }
  return items[items.length - 1][0];
}

/* 修正分布：normalize(max(0, p - q))，即拒絕時的重採來源 */
function residualDist(p, q) {
  const d = new Map();
  const toks = new Set([...p.keys(), ...q.keys()]);
  let tot = 0;
  for (const t of toks) {
    const r = Math.max(0, (p.get(t) || 0) - (q.get(t) || 0));
    if (r > 0) { d.set(t, r); tot += r; }
  }
  if (tot > 0) for (const [t, v] of d) d.set(t, v / tot);
  return d;
}

/* 建立本頁用的目標（大）與草稿（小）預測器 */
const TARGET_ORDER = 4;
const DRAFT_ORDER = 2;

/* 決定性雜湊 → [0,1)，讓「小模型聰明度」平順控制猜中率（可重現） */
function hashUnit(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
function secondBest(dist, top) {
  let best = null, bp = -1;
  for (const [t, p] of dist) {
    if (t !== top && (p > bp || (p === bp && (best === null || t < best)))) { bp = p; best = t; }
  }
  return best;
}

/* 大模型＝高階 n-gram（近乎確定，作為 ground truth）。
 * 小模型＝以低階 n-gram 為形狀的便宜草稿；用 kappa（0..1）平順調整它
 * 「猜中大模型選擇」的比率：以上下文的決定性雜湊決定這一格猜中或猜錯，
 * 猜錯時提出一個像樣的替代字（低階 argmax 或次高），讓拒絕→修正看得見。
 * 草稿怎麼構造都不影響無損性——接受／拒絕規則只看草稿與大模型是否一致。 */
function makePredictors(text, kappa) {
  const big = buildModel(text, TARGET_ORDER);
  const bi = buildModel(text, DRAFT_ORDER);
  const uni = buildModel(text, 1);
  const pOf = (ctx) => distAt(big, ctx, TARGET_ORDER).dist;
  const qOf = (ctx) => {
    const p = pOf(ctx);
    const tTop = argmaxDist(p);
    const biD = distAt(bi, ctx, DRAFT_ORDER).dist;
    let alt = argmaxDist(biD);
    if (alt === tTop) alt = secondBest(p, tTop) || argmaxDist(distAt(uni, ctx, 1).dist);
    if (alt == null) alt = tTop;
    const winner = (hashUnit(ctx.join('')) < kappa) ? tTop : alt;
    const q = new Map(biD);
    let mx = 0; for (const v of q.values()) mx = Math.max(mx, v);
    q.set(winner, Math.max(q.get(winner) || 0, mx) + 0.15);
    let tot = 0; for (const v of q.values()) tot += v;
    if (tot > 0) for (const [t, v] of q) q.set(t, v / tot);
    return q;
  };
  return { pOf: pOf, qOf: qOf, big: big };
}

/* ── 大模型單獨貪婪解碼（逐 token，每 token 一次大模型呼叫）── */
function targetOnlyGreedy(opt) {
  const pOf = opt.pOf, steps = opt.steps;
  let ctx = opt.context.slice();
  const out = [];
  let targetCalls = 0;
  while (out.length < steps) {
    const t = argmaxDist(pOf(ctx));
    targetCalls++;
    out.push(t);
    ctx = ctx.concat(t);
  }
  return { tokens: out, targetCalls: targetCalls };
}

/* ── Speculative decoding（貪婪版；為論文 min(1,p/q)+residual 規則在
 *    溫度→0 時的精確特例）。小模型一次吐 gamma 個草稿，大模型一次
 *    平行驗收（每輪僅 1 次大模型呼叫），接受相符前綴、在第一個不符處
 *    以大模型的選擇修正並繼續。輸出與 targetOnlyGreedy 逐 token 相同。 ── */
function specDecodeGreedy(opt) {
  const pOf = opt.pOf, qOf = opt.qOf, gamma = opt.gamma, steps = opt.steps;
  let ctx = opt.context.slice();
  const out = [];
  let targetCalls = 0;
  const rounds = [];
  let acceptedTotal = 0, evaluatedTotal = 0;
  while (out.length < steps) {
    /* 小模型：自迴歸吐 gamma 個草稿 token（便宜、快） */
    const draft = [];
    let dctx = ctx.slice();
    for (let i = 0; i < gamma; i++) {
      const d = argmaxDist(qOf(dctx));
      draft.push(d);
      dctx = dctx.concat(d);
    }
    /* 大模型：一次平行驗收 gamma+1 個位置（1 次呼叫） */
    targetCalls++;
    const targets = [];
    let tctx = ctx.slice();
    for (let i = 0; i <= gamma; i++) {
      targets.push(argmaxDist(pOf(tctx)));
      if (i < gamma) tctx = tctx.concat(draft[i]);
    }
    /* 接受相符前綴，在第一個不符處停下 */
    let accepted = 0;
    for (let i = 0; i < gamma; i++) {
      if (draft[i] === targets[i]) accepted++;
      else break;
    }
    const corrected = accepted < gamma;   // true=有拒絕修正；false=全接受＋bonus
    /* 輸出接受的草稿 */
    for (let i = 0; i < accepted; i++) out.push(draft[i]);
    /* 再輸出一個：拒絕時＝修正 token；全接受時＝bonus token。
     * 兩者皆為 targets[accepted] = 大模型在該位置的選擇 */
    const extra = targets[accepted];
    out.push(extra);
    ctx = ctx.concat(draft.slice(0, accepted)).concat([extra]);
    acceptedTotal += accepted;
    evaluatedTotal += accepted + (corrected ? 1 : 0);
    rounds.push({
      draft: draft.slice(),
      targets: targets.slice(),
      accepted: accepted,
      corrected: corrected,
      correctedTok: corrected ? extra : null,
      bonusTok: corrected ? null : extra,
      emitted: accepted + 1
    });
  }
  return {
    tokens: out.slice(0, steps),
    targetCalls: targetCalls,
    rounds: rounds,
    acceptedTotal: acceptedTotal,
    evaluatedTotal: evaluatedTotal
  };
}

/* ── 論文的隨機接受／拒絕規則：回傳一輪的「第一個」輸出 token。
 *    接受草稿 x 的機率 = min(1, p(x)/q(x))；拒絕時自 residual 重採。
 *    第一個 token 的邊際分布恰為 p（無損保證的分布形式）。 ── */
function specSampleOnce(pOf, qOf, context, gamma, rng) {
  let dctx = context.slice();
  const draft = [], qd = [];
  for (let i = 0; i < gamma; i++) {
    const dist = qOf(dctx);
    const tok = sampleFromDist(dist, rng());
    draft.push(tok); qd.push(dist);
    dctx = dctx.concat(tok);
  }
  const p0 = pOf(context), q0 = qd[0], d0 = draft[0];
  const pv = p0.get(d0) || 0, qv = q0.get(d0) || 1e-12;
  if (rng() <= Math.min(1, pv / qv)) return d0;             // 接受草稿
  return sampleFromDist(residualDist(p0, q0), rng());        // 拒絕→重採修正
}

/* 給定接受率 α、草稿長度 γ、草稿成本比 c，估計理論加速 */
function expectedTokensPerRound(alpha, gamma) {
  if (alpha >= 0.999999) return gamma + 1;
  return (1 - Math.pow(alpha, gamma + 1)) / (1 - alpha);
}
function walltimeSpeedup(alpha, gamma, cost) {
  return expectedTokensPerRound(alpha, gamma) / (cost * gamma + 1);
}

const SPEC_CORE = {
  makeRng, buildModel, distAt, mixDist, argmaxDist, sampleFromDist, residualDist,
  makePredictors, targetOnlyGreedy, specDecodeGreedy, specSampleOnce,
  expectedTokensPerRound, walltimeSpeedup,
  TARGET_ORDER, DRAFT_ORDER, CORPORA
};
if (typeof module !== 'undefined' && module.exports) module.exports = SPEC_CORE;

/* ══════════════════════════════════════════════════════════
 * 二、介面與動畫（僅在瀏覽器執行）
 * ════════════════════════════════════════════════════════ */
if (typeof document !== 'undefined') (function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const LS = 'spec.';
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionOff = reduceQuery.matches;
  reduceQuery.addEventListener('change', (e) => { motionOff = e.matches; });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((res) => setTimeout(res, motionOff ? 0 : ms));

  /* 狀態 */
  const state = {
    corpusId: load('corpus', 'tang'),
    gamma: clamp(parseInt(load('gamma', '4'), 10) || 4, 1, 8),
    kappa: clamp(parseInt(load('kappa', '62'), 10) || 62, 0, 100),
    cost: clamp(parseInt(load('cost', '15'), 10) || 15, 5, 50)
  };
  function load(k, d) { try { const v = localStorage.getItem(LS + k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(LS + k, String(v)); } catch (e) {} }

  let predictors, seedArr, steps, big, spec;
  function rebuild() {
    const corpus = CORPORA.find((c) => c.id === state.corpusId) || CORPORA[0];
    predictors = makePredictors(corpus.text, state.kappa / 100);
    seedArr = Array.from(corpus.seed);
    const total = Array.from(corpus.text).length;
    steps = clamp(total - seedArr.length, 8, 34);
    big = targetOnlyGreedy({ pOf: predictors.pOf, context: seedArr, steps: steps });
    spec = specDecodeGreedy({ pOf: predictors.pOf, qOf: predictors.qOf, context: seedArr, gamma: state.gamma, steps: steps });
    updateReadouts();
    drawSweet();
  }

  /* ── 讀數 ── */
  function updateReadouts() {
    const alpha = spec.evaluatedTotal > 0 ? spec.acceptedTotal / spec.evaluatedTotal : 0;
    const tpr = spec.tokens.length / spec.rounds.length;      // 每輪平均產出＝呼叫加速
    const timeSp = walltimeSpeedup(alpha, state.gamma, state.cost / 100);
    rollTo($('#alpha'), alpha * 100, '%', 0);
    rollTo($('#tpr'), tpr, '', 2);
    rollTo($('#spCalls'), big.targetCalls / spec.targetCalls, '×', 2);
    rollTo($('#spTime'), timeSp, '×', 2);
    $('#alphaBar').style.transform = 'scaleX(' + alpha + ')';
  }

  /* ── 甜蜜點長條：加速（時間）隨 γ 變化，含成本 c ── */
  function drawSweet() {
    const host = $('#sweet');
    if (!host) return;
    const alpha = spec.evaluatedTotal > 0 ? spec.acceptedTotal / spec.evaluatedTotal : 0;
    const c = state.cost / 100;
    const vals = [];
    for (let g = 1; g <= 8; g++) vals.push(walltimeSpeedup(alpha, g, c));
    const max = Math.max.apply(null, vals);
    const best = vals.indexOf(max) + 1;
    host.innerHTML = '';
    for (let g = 1; g <= 8; g++) {
      const v = vals[g - 1];
      const col = document.createElement('div');
      col.className = 'sweet-col' + (g === state.gamma ? ' cur' : '') + (g === best ? ' best' : '');
      col.setAttribute('role', 'listitem');
      col.setAttribute('aria-label', 'γ=' + g + '，估計加速 ' + v.toFixed(2) + ' 倍' + (g === best ? '（甜蜜點）' : ''));
      const bar = document.createElement('div');
      bar.className = 'sweet-bar';
      bar.style.transform = 'scaleY(' + (max > 0 ? v / max : 0) + ')';
      const lab = document.createElement('span'); lab.className = 'sweet-lab'; lab.textContent = g;
      col.appendChild(bar); col.appendChild(lab);
      col.tabIndex = 0;
      col.addEventListener('click', () => setGamma(g));
      col.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGamma(g); } });
      host.appendChild(col);
    }
    $('#sweetNote').textContent = '目前甜蜜點：γ = ' + best + '（此語料、猜中率與成本比下，估計時間加速最高）';
  }

  /* ── 數字滾動（rAF；reduced-motion 直接跳值）── */
  const rolls = new WeakMap();
  function rollTo(el, target, suffix, dec) {
    if (!el) return;
    suffix = suffix || ''; dec = dec == null ? 0 : dec;
    const prev = rolls.get(el);
    if (prev) cancelAnimationFrame(prev.raf);
    const from = prev ? prev.cur : target;
    if (motionOff) { el.textContent = fmt(target, dec) + suffix; rolls.set(el, { cur: target }); return; }
    const t0 = performance.now(), dur = 420;
    function tick(now) {
      const k = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const cur = from + (target - from) * e;
      el.textContent = fmt(cur, dec) + suffix;
      const rec = { cur: cur };
      if (k < 1) rec.raf = requestAnimationFrame(tick);
      else rec.cur = target;
      rolls.set(el, rec);
    }
    rolls.set(el, { cur: from, raf: requestAnimationFrame(tick) });
  }
  function fmt(v, dec) { return dec ? v.toFixed(dec) : Math.round(v).toString(); }

  /* ══════════ 動畫：一輪 speculative decoding ══════════ */
  const anim = { running: false, auto: false, ctx: null, out: [], calls: 0, roundIdx: 0 };

  function animReset() {
    anim.running = false; anim.auto = false; anim.ctx = seedArr.slice();
    anim.out = []; anim.calls = 0; anim.roundIdx = 0;
    $('#autoBtn').setAttribute('aria-pressed', 'false');
    $('#autoBtn').textContent = '自動播放';
    renderCommit();
    $('#stage').innerHTML = '';
    $('#roundStatus').textContent = '按「跑一輪」看小模型打草稿、大模型驗收。';
    $('#tCallsA').textContent = '0';
    $('#genCount').textContent = '0';
    $('#spA').textContent = '×—';
    setAnimButtons(false);
  }

  function renderCommit() {
    const host = $('#commit');
    host.innerHTML = '';
    const seed = document.createElement('span'); seed.className = 'tk seed';
    seed.textContent = seedArr.join('');
    host.appendChild(seed);
    anim.out.forEach((t) => {
      const s = document.createElement('span'); s.className = 'tk done';
      s.textContent = t; host.appendChild(s);
    });
    if (anim.out.length === 0 && seedArr.length === 0) host.textContent = '（空）';
  }

  function setAnimButtons(busy) {
    $('#stepBtn').disabled = busy;
    $('#resetBtn').disabled = busy && anim.auto;
  }

  async function runRound() {
    if (anim.running) return;
    if (anim.out.length >= steps) { animDone(); return; }
    anim.running = true; setAnimButtons(true);
    const g = state.gamma;
    const stage = $('#stage');
    stage.innerHTML = '';

    /* 預算這一輪（用純函式，確保與驗證一致） */
    const one = specDecodeGreedy({ pOf: predictors.pOf, qOf: predictors.qOf, context: anim.ctx.slice(), gamma: g, steps: 1 });
    const r = one.rounds[0];

    /* 建 gamma 個草稿槽 + 1 個驗收槽 */
    const slots = [];
    for (let i = 0; i < g; i++) slots.push(makeSlot(i, 'draft'));
    const bonus = makeSlot(g, 'verify');
    slots.forEach((s) => stage.appendChild(s.el));
    stage.appendChild(bonus.el);

    $('#roundStatus').textContent = '第 ' + (anim.roundIdx + 1) + ' 輪：小模型一口氣猜 ' + g + ' 個字……';

    /* 1) 小模型快速吐草稿 */
    for (let i = 0; i < g; i++) {
      slots[i].setChar(r.draft[i], 'draft');
      await sleep(150);
    }
    await sleep(180);

    /* 2) 大模型「一次」平行驗收：掃描動畫 */
    anim.calls++;
    $('#tCallsA').textContent = String(anim.calls);
    $('#roundStatus').textContent = '大模型一次平行驗收這 ' + g + ' 個草稿……';
    stage.classList.add('verifying');
    await sleep(motionOff ? 0 : 520);
    stage.classList.remove('verifying');

    /* 3) 逐一揭示接受（綠）／拒絕（紅→修正） */
    for (let i = 0; i < g; i++) {
      if (i < r.accepted) {
        slots[i].mark('accept');
        await sleep(120);
      } else {
        /* 第一個不一致：拒絕→修正 */
        slots[i].mark('reject');
        await sleep(300);
        slots[i].setChar(r.correctedTok, 'correct');
        slots[i].mark('correct');
        break;
      }
    }
    /* 全部接受：bonus 綠燈；否則其餘草稿淡出 */
    if (!r.corrected) {
      bonus.setChar(r.bonusTok, 'correct');
      bonus.mark('correct');
    } else {
      bonus.el.classList.add('dim');
      for (let i = r.accepted + 1; i < g; i++) slots[i].el.classList.add('dim');
    }
    await sleep(220);

    /* 4) 提交這一輪：emitted = accepted 個草稿 + 1 個 extra（修正或 bonus） */
    for (let i = 0; i < r.accepted; i++) anim.out.push(r.draft[i]);
    anim.out.push(r.corrected ? r.correctedTok : r.bonusTok);
    anim.ctx = anim.ctx.concat(r.draft.slice(0, r.accepted)).concat([r.corrected ? r.correctedTok : r.bonusTok]);
    anim.roundIdx++;
    renderCommit();
    $('#genCount').textContent = String(anim.out.length);
    $('#spA').textContent = '×' + (anim.out.length / anim.calls).toFixed(2);

    const msg = r.corrected
      ? ('接受 ' + r.accepted + ' 個，在第 ' + (r.accepted + 1) + ' 個猜錯 → 大模型修正為「' + r.correctedTok + '」。這一輪產出 ' + r.emitted + ' 個字，只花 1 次大模型呼叫。')
      : ('全部 ' + g + ' 個都猜中！再送 1 個 bonus「' + r.bonusTok + '」，一輪產出 ' + r.emitted + ' 個字，只花 1 次大模型呼叫。');
    $('#roundStatus').textContent = '第 ' + anim.roundIdx + ' 輪：' + msg;

    anim.running = false; setAnimButtons(false);
    if (anim.out.length >= steps) { animDone(); return; }
    if (anim.auto && !document.hidden) { await sleep(560); if (anim.auto) runRound(); }
  }

  function animDone() {
    anim.auto = false;
    $('#autoBtn').setAttribute('aria-pressed', 'false');
    $('#autoBtn').textContent = '自動播放';
    const same = anim.out.join('') === big.tokens.join('');
    $('#roundStatus').textContent = '完成：共 ' + anim.out.length + ' 個字，只用了 ' + anim.calls +
      ' 次大模型呼叫（逐字要 ' + big.targetCalls + ' 次）。' +
      (same ? '產生的文字和大模型自己慢慢寫的一模一樣。' : '');
    setAnimButtons(false);
  }

  function makeSlot(i, kind) {
    const el = document.createElement('div');
    el.className = 'slot ' + kind;
    el.style.setProperty('--i', i);
    const ch = document.createElement('span'); ch.className = 'slot-ch'; ch.textContent = '';
    const badge = document.createElement('span'); badge.className = 'slot-badge'; badge.setAttribute('aria-hidden', 'true');
    el.appendChild(ch); el.appendChild(badge);
    return {
      el: el,
      setChar: (c, cls) => { ch.textContent = c; el.classList.remove('draft', 'verify'); if (cls) el.classList.add(cls === 'correct' ? 'correct' : cls); el.classList.add('filled'); },
      mark: (m) => {
        el.classList.remove('accept', 'reject', 'correct');
        el.classList.add(m);
        badge.textContent = m === 'accept' ? '✓' : (m === 'reject' ? '✗' : (m === 'correct' ? '↺' : ''));
      }
    };
  }

  /* ══════════ 計速對照：並排賽跑（rAF 迴圈，可暫停）══════════ */
  const race = { raf: 0, running: false, acc: 0, tick: 220, bigN: 0, specR: 0, done: false, visible: true };

  function raceReset() {
    stopRaceLoop();
    race.running = false; race.acc = 0; race.bigN = 0; race.specR = 0; race.done = false;
    $('#raceBig').innerHTML = ''; $('#raceSpec').innerHTML = '';
    $('#barBig').style.transform = 'scaleX(0)';
    $('#barSpec').style.transform = 'scaleX(0)';
    $('#tickBig').textContent = '0';
    $('#tickSpec').textContent = '0';
    $('#raceSpeed').textContent = '×—';
    $('#raceIdentical').textContent = '';
    $('#raceIdentical').className = 'identical';
    $('#raceBtn').textContent = '開始賽跑';
    $('#raceBtn').setAttribute('aria-pressed', 'false');
  }

  function raceStart() {
    if (race.running) { pauseRace(); return; }
    if (race.done) raceReset();
    race.running = true;
    $('#raceBtn').textContent = '暫停';
    $('#raceBtn').setAttribute('aria-pressed', 'true');
    if (motionOff) { raceFinishInstant(); return; }
    race.last = performance.now(); race.acc = 0;
    startRaceLoop();
  }
  function pauseRace() {
    race.running = false; stopRaceLoop();
    $('#raceBtn').textContent = '繼續';
    $('#raceBtn').setAttribute('aria-pressed', 'false');
  }
  function startRaceLoop() { if (!race.raf) { race.last = performance.now(); race.raf = requestAnimationFrame(raceStep); } }
  function stopRaceLoop() { if (race.raf) { cancelAnimationFrame(race.raf); race.raf = 0; } }

  function raceStep(now) {
    race.raf = 0;
    if (!race.running || !race.visible || document.hidden) { return; }  // 暫停：不排下一幀
    const dt = now - race.last; race.last = now;
    race.acc += dt;
    while (race.acc >= race.tick && !race.done) {
      race.acc -= race.tick;
      advanceRace();
    }
    if (!race.done) race.raf = requestAnimationFrame(raceStep);
    else raceFinish();
  }

  function advanceRace() {
    /* 大模型：一次呼叫吐 1 個字 */
    if (race.bigN < big.tokens.length) {
      appendTok('#raceBig', big.tokens[race.bigN], race.bigN);
      race.bigN++;
      $('#tickBig').textContent = String(race.bigN);
      $('#barBig').style.transform = 'scaleX(' + (race.bigN / big.targetCalls) + ')';
    }
    /* speculative：一次呼叫吐一整輪 */
    if (race.specR < spec.rounds.length) {
      const r = spec.rounds[race.specR];
      let base = 0;
      for (let k = 0; k < race.specR; k++) base += spec.rounds[k].emitted;
      const emitted = tokensOfRound(r);
      emitted.forEach((t, j) => appendTok('#raceSpec', t, base + j, j < r.accepted ? 'acc' : 'cor'));
      race.specR++;
      $('#tickSpec').textContent = String(race.specR);
      $('#barSpec').style.transform = 'scaleX(' + (race.specR / big.targetCalls) + ')';
    }
    if (race.bigN >= big.tokens.length && race.specR >= spec.rounds.length) race.done = true;
  }

  function tokensOfRound(r) {
    const arr = [];
    for (let i = 0; i < r.accepted; i++) arr.push(r.draft[i]);
    arr.push(r.corrected ? r.correctedTok : r.bonusTok);
    return arr;
  }

  function appendTok(sel, ch, idx, cls) {
    const host = $(sel);
    const s = document.createElement('span');
    s.className = 'rtk' + (cls ? ' ' + cls : '');
    s.textContent = ch;
    host.appendChild(s);
  }

  function raceFinish() {
    race.running = false; stopRaceLoop();
    const sp = big.targetCalls / spec.targetCalls;
    rollTo($('#raceSpeed'), sp, '×', 2);
    const same = big.tokens.join('') === spec.tokens.join('');
    const badge = $('#raceIdentical');
    badge.textContent = same ? '兩邊輸出完全相同 ✓（無損）' : '⚠ 輸出不一致';
    badge.className = 'identical ' + (same ? 'ok' : 'bad');
    $('#raceBtn').textContent = '重新賽跑';
    $('#raceBtn').setAttribute('aria-pressed', 'false');
    race.done = true;
  }

  function raceFinishInstant() {
    /* reduced-motion：直接顯示結果 */
    big.tokens.forEach((t, i) => appendTok('#raceBig', t, i));
    let base = 0;
    spec.rounds.forEach((r) => {
      tokensOfRound(r).forEach((t, j) => appendTok('#raceSpec', t, base + j, j < r.accepted ? 'acc' : 'cor'));
      base += r.emitted;
    });
    race.bigN = big.tokens.length; race.specR = spec.rounds.length;
    $('#tickBig').textContent = String(big.targetCalls);
    $('#tickSpec').textContent = String(spec.targetCalls);
    $('#barBig').style.transform = 'scaleX(1)';
    $('#barSpec').style.transform = 'scaleX(' + (spec.targetCalls / big.targetCalls) + ')';
    raceFinish();
  }

  /* ── 分頁隱藏／離屏時暫停 rAF ── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopRaceLoop(); }
    else if (race.running && race.visible) { race.last = performance.now(); startRaceLoop(); }
  });
  const raceSection = () => document.getElementById('race');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        race.visible = e.isIntersecting;
        if (!race.visible) stopRaceLoop();
        else if (race.running && !document.hidden) { race.last = performance.now(); startRaceLoop(); }
      });
    }, { threshold: 0.08 });
    const rs = raceSection(); if (rs) io.observe(rs);
  }

  /* ══════════ 控制項綁定 ══════════ */
  function setGamma(g) {
    state.gamma = clamp(g, 1, 8); save('gamma', state.gamma);
    $('#gamma').value = state.gamma; $('#gammaVal').textContent = state.gamma;
    rebuild(); animReset(); raceReset();
  }

  function bindControls() {
    const gamma = $('#gamma'), kappa = $('#kappa'), cost = $('#cost');
    gamma.value = state.gamma; $('#gammaVal').textContent = state.gamma;
    kappa.value = state.kappa; $('#kappaVal').textContent = state.kappa + '%';
    cost.value = state.cost; $('#costVal').textContent = state.cost + '%';

    gamma.addEventListener('input', () => { setGamma(parseInt(gamma.value, 10)); });
    kappa.addEventListener('input', () => {
      state.kappa = clamp(parseInt(kappa.value, 10), 0, 100); save('kappa', state.kappa);
      $('#kappaVal').textContent = state.kappa + '%';
      rebuild(); animReset(); raceReset();
    });
    cost.addEventListener('input', () => {
      state.cost = clamp(parseInt(cost.value, 10), 5, 50); save('cost', state.cost);
      $('#costVal').textContent = state.cost + '%';
      updateReadouts(); drawSweet();
    });

    /* 語料 chips */
    const host = $('#corpusChips');
    CORPORA.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button'; b.textContent = c.name;
      b.setAttribute('aria-pressed', String(c.id === state.corpusId));
      b.addEventListener('click', () => {
        state.corpusId = c.id; save('corpus', c.id);
        Array.from(host.children).forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        rebuild(); animReset(); raceReset();
      });
      host.appendChild(b);
    });

    /* 動畫按鈕 */
    $('#stepBtn').addEventListener('click', () => runRound());
    $('#autoBtn').addEventListener('click', () => {
      anim.auto = !anim.auto;
      $('#autoBtn').setAttribute('aria-pressed', String(anim.auto));
      $('#autoBtn').textContent = anim.auto ? '暫停' : '自動播放';
      if (anim.auto && !anim.running) runRound();
    });
    $('#resetBtn').addEventListener('click', () => animReset());

    /* 賽跑按鈕 */
    $('#raceBtn').addEventListener('click', () => raceStart());
    $('#raceReset').addEventListener('click', () => raceReset());
  }

  /* ── 進場淡入（stagger）以 IntersectionObserver 觸發 ── */
  function entrance() {
    const els = Array.from(document.querySelectorAll('[data-fade]'));
    if (motionOff || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents, obs) => {
      ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
  }

  /* ── 啟動 ── */
  rebuild();
  bindControls();
  animReset();
  raceReset();
  entrance();
})();

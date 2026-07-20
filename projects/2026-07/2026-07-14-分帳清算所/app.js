/* 分帳清算所 — 純靜態、零依賴。所有金額以整數「分」運算，不用浮點數。
   localStorage 前綴：split.
   下半段的 DOM 程式碼在 document 存在時才執行，方便用 node 直接測試上半段的演算法。 */

/* ===================== 純演算法（可單獨測試） ===================== */

/** 把 total 分（整數）依 weights 比例拆開，餘數依小數大小依序補給前幾位。總和必等於 total。 */
function splitCents(total, weights) {
  const tw = weights.reduce((a, b) => a + b, 0);
  if (tw <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / tw);
  const base = raw.map((x) => Math.floor(x));
  const rem = total - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; k < rem; k++) base[order[k % order.length].i]++;
  return base;
}

/** 每位成員的淨額（分）：付出去的 − 該分攤的。全體加總必為 0。 */
function computeNet(members, expenses) {
  const net = {};
  members.forEach((m) => (net[m.id] = 0));
  expenses.forEach((e) => {
    const ids = Object.keys(e.parts).filter((id) => e.parts[id] > 0 && id in net);
    if (!ids.length || !(e.payer in net)) return;
    const shares = splitCents(e.cents, ids.map((id) => e.parts[id]));
    net[e.payer] += e.cents;
    ids.forEach((id, i) => (net[id] -= shares[i]));
  });
  return net;
}

/** 天真結算：每一筆支出裡，每個分攤者各自把自己那份還給代墊的人。 */
function naiveTransfers(members, expenses) {
  const has = new Set(members.map((m) => m.id));
  const out = [];
  expenses.forEach((e) => {
    const ids = Object.keys(e.parts).filter((id) => e.parts[id] > 0 && has.has(id));
    if (!ids.length || !has.has(e.payer)) return;
    const shares = splitCents(e.cents, ids.map((id) => e.parts[id]));
    ids.forEach((id, i) => {
      if (id !== e.payer && shares[i] > 0) out.push({ from: id, to: e.payer, cents: shares[i] });
    });
  });
  return out;
}

/** 化簡：先做金額完全相抵的配對，再讓欠最多的還給被欠最多的。保證 ≤ n−1 筆。 */
function simplify(net) {
  const debtors = [];
  const creditors = [];
  Object.keys(net).forEach((id) => {
    const v = net[id];
    if (v < 0) debtors.push({ id, v: -v });
    else if (v > 0) creditors.push({ id, v });
  });
  const tx = [];

  // 1) 完全相抵：欠 350 的人剛好碰上被欠 350 的人 → 一筆解決
  debtors.forEach((d) => {
    if (d.v === 0) return;
    const c = creditors.find((c) => c.v === d.v);
    if (c) {
      tx.push({ from: d.id, to: c.id, cents: d.v });
      c.v = 0;
      d.v = 0;
    }
  });

  // 2) 貪婪：最大債務 ↔ 最大債權
  const D = debtors.filter((d) => d.v > 0).sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  const C = creditors.filter((c) => c.v > 0).sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  let i = 0;
  let j = 0;
  while (i < D.length && j < C.length) {
    const m = Math.min(D[i].v, C[j].v);
    tx.push({ from: D[i].id, to: C[j].id, cents: m });
    D[i].v -= m;
    C[j].v -= m;
    if (D[i].v === 0) i++;
    if (C[j].v === 0) j++;
  }
  return tx;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { splitCents, computeNet, naiveTransfers, simplify };
}

/* ===================== 介面 ===================== */

if (typeof document !== 'undefined') (function () {
  'use strict';

  const KEY = 'split.state';
  const COLORS = ['#e8b04b', '#7dbb7a', '#6fb3d6', '#d98cc4', '#e0705f', '#9d8ff0', '#5fc7b8', '#d7a06a'];
  const $ = (s) => document.querySelector(s);

  let reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    reduce = e.matches;
  });

  let state = load() || { members: [], expenses: [], seq: 1 };
  let settled = false;
  let draft = {}; // 支出表單裡各成員的份數（0 = 沒分攤）

  /* ---------- 儲存 ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.members) || !Array.isArray(s.expenses)) return null;
      s.seq = s.seq || s.members.length + s.expenses.length + 1;
      return s;
    } catch (err) {
      return null;
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      /* 隱私模式下略過 */
    }
  }

  /* ---------- 工具 ---------- */
  const nid = () => 'i' + state.seq++;
  const money = (c) => {
    const neg = c < 0;
    const a = Math.abs(c);
    const s = a % 100 === 0
      ? String(a / 100)
      : (a / 100).toFixed(2);
    const [int, dec] = s.split('.');
    const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + g + (dec ? '.' + dec : '');
  };
  const nameOf = (id) => (state.members.find((m) => m.id === id) || { name: '？' }).name;
  const colorOf = (id) => (state.members.find((m) => m.id === id) || { color: '#888' }).color;

  /* ---------- 資料異動 → 清算失效 ---------- */
  function touch() {
    settled = false;
    save();
    render();
  }

  /* ---------- 成員 ---------- */
  function addMember(name) {
    if (!name || state.members.length >= 8) return;
    const used = state.members.map((m) => m.color);
    const color = COLORS.find((c) => !used.includes(c)) || COLORS[state.members.length % COLORS.length];
    state.members.push({ id: nid(), name: name.slice(0, 10), color });
    touch();
  }
  function removeMember(id) {
    state.members = state.members.filter((m) => m.id !== id);
    state.expenses = state.expenses.filter((e) => e.payer !== id);
    state.expenses.forEach((e) => delete e.parts[id]);
    state.expenses = state.expenses.filter((e) => Object.keys(e.parts).some((k) => e.parts[k] > 0));
    delete draft[id];
    touch();
  }

  /* ---------- 範例 ---------- */
  function demo() {
    state = { members: [], expenses: [], seq: 1 };
    ['小明', '阿華', 'Ken', '莉莉', '阿德'].forEach((n) => {
      const used = state.members.map((m) => m.color);
      state.members.push({ id: nid(), name: n, color: COLORS.find((c) => !used.includes(c)) });
    });
    const [a, b, c, d, e] = state.members.map((m) => m.id);
    const all = (w) => ({ [a]: w, [b]: w, [c]: w, [d]: w, [e]: w });
    state.expenses = [
      { id: nid(), title: '燒肉店', payer: a, cents: 468000, parts: all(1) },
      { id: nid(), title: '啤酒加點', payer: c, cents: 96000, parts: { [a]: 1, [c]: 2, [e]: 1 } },
      { id: nid(), title: '計程車', payer: b, cents: 32000, parts: { [b]: 1, [d]: 1, [e]: 1 } },
      { id: nid(), title: 'KTV 包廂', payer: d, cents: 210000, parts: all(1) },
      { id: nid(), title: '便利商店零食', payer: e, cents: 27500, parts: { [b]: 1, [c]: 1, [e]: 1 } },
      { id: nid(), title: '隔天早餐', payer: b, cents: 41000, parts: { [a]: 1, [b]: 1, [d]: 1 } },
    ];
    resetDraft();
    touch();
  }

  function resetDraft() {
    draft = {};
    state.members.forEach((m) => (draft[m.id] = 1));
  }

  /* ---------- 渲染 ---------- */
  function render() {
    renderMembers();
    renderPayer();
    renderChips();
    renderExpenses();
    const net = computeNet(state.members, state.expenses);
    const naive = naiveTransfers(state.members, state.expenses);
    const tx = simplify(net);
    renderStats(net, naive, tx);
    renderNets(net);
    renderWeb(net, naive, tx);
    renderReceipt(tx);

    const ready = state.members.length >= 2 && naive.length > 0;
    const btn = $('#btnSettle');
    btn.disabled = !ready || settled;
    $('#bsSub').textContent = settled
      ? '已經是最少筆數了 · 改動任何資料會重新纏起來'
      : ready
        ? '把纏成一團的欠債，收斂成最少的轉帳'
        : '先加入至少兩位成員與一筆支出';
    $('#webMode').textContent = settled ? '已清算' : naive.length ? '尚未清算' : '—';
  }

  function renderMembers() {
    const ul = $('#memberList');
    ul.innerHTML = '';
    state.members.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'mem';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = m.color;
      dot.style.color = m.color;
      const nm = document.createElement('span');
      nm.textContent = m.name;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.textContent = '×';
      x.setAttribute('aria-label', '移除成員 ' + m.name);
      x.addEventListener('click', () => removeMember(m.id));
      li.append(dot, nm, x);
      ul.appendChild(li);
    });
  }

  function renderPayer() {
    const sel = $('#expPayer');
    const prev = sel.value;
    sel.innerHTML = '';
    state.members.forEach((m) => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.name;
      sel.appendChild(o);
    });
    if (state.members.some((m) => m.id === prev)) sel.value = prev;
  }

  function renderChips() {
    const box = $('#partChips');
    box.innerHTML = '';
    state.members.forEach((m) => {
      if (!(m.id in draft)) draft[m.id] = 1;
      const w = draft[m.id];
      const chip = document.createElement('span');
      chip.className = 'pchip' + (w > 0 ? ' on' : '');

      const nm = document.createElement('button');
      nm.type = 'button';
      nm.className = 'nm';
      nm.textContent = m.name;
      nm.setAttribute('aria-pressed', String(w > 0));
      nm.setAttribute('aria-label', m.name + (w > 0 ? '（分攤 ' + w + ' 份，點擊取消）' : '（未分攤，點擊加入）'));
      nm.addEventListener('click', () => {
        draft[m.id] = draft[m.id] > 0 ? 0 : 1;
        renderChips();
      });

      const stp = document.createElement('span');
      stp.className = 'stp';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', m.name + ' 減少份數');
      minus.addEventListener('click', () => {
        draft[m.id] = Math.max(1, draft[m.id] - 1);
        renderChips();
      });
      const val = document.createElement('span');
      val.className = 'w';
      val.textContent = w + '份';
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '＋';
      plus.setAttribute('aria-label', m.name + ' 增加份數');
      plus.addEventListener('click', () => {
        draft[m.id] = Math.min(9, draft[m.id] + 1);
        renderChips();
      });
      stp.append(minus, val, plus);

      chip.append(nm, stp);
      box.appendChild(chip);
    });
  }

  function renderExpenses() {
    const ul = $('#expenseList');
    ul.innerHTML = '';
    state.expenses.forEach((e) => {
      const li = document.createElement('li');
      li.className = 'exp';
      const main = document.createElement('span');
      main.className = 'exp-main';
      const t = document.createElement('span');
      t.className = 'exp-t';
      t.textContent = e.title;
      const meta = document.createElement('span');
      meta.className = 'exp-m';
      const ids = Object.keys(e.parts).filter((id) => e.parts[id] > 0);
      const who = ids
        .map((id) => nameOf(id) + (e.parts[id] > 1 ? '×' + e.parts[id] : ''))
        .join('、');
      meta.textContent = nameOf(e.payer) + ' 付 · 分給 ' + who;
      main.append(t, meta);

      const a = document.createElement('span');
      a.className = 'exp-a';
      a.textContent = money(e.cents);

      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'x';
      x.textContent = '×';
      x.setAttribute('aria-label', '刪除支出 ' + e.title);
      x.addEventListener('click', () => {
        state.expenses = state.expenses.filter((v) => v.id !== e.id);
        touch();
      });

      li.append(main, a, x);
      ul.appendChild(li);
    });
    $('#expCount').textContent = state.expenses.length + ' 筆';
    $('#expEmpty').hidden = state.expenses.length > 0;
  }

  /* ---------- 統計（數字滾動） ---------- */
  const rollers = {};
  function roll(el, to, fmt) {
    const from = rollers[el.id] === undefined ? to : rollers[el.id];
    rollers[el.id] = to;
    if (from === to) {
      el.textContent = fmt(to);
      return;
    }
    if (reduce || document.hidden) {
      el.textContent = fmt(to);
      return;
    }
    const t0 = performance.now();
    const dur = 520;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const k = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * k));
      if (p < 1 && !document.hidden) requestAnimationFrame(step);
      else el.textContent = fmt(to);
    };
    requestAnimationFrame(step);
  }

  function renderStats(net, naive, tx) {
    const total = state.expenses.reduce((a, e) => a + e.cents, 0);
    roll($('#statTotal'), total, money);
    roll($('#statAvg'), state.members.length ? Math.round(total / state.members.length) : 0, money);
    roll($('#statNaive'), naive.length, String);
    if (settled) {
      roll($('#statMin'), tx.length, String);
    } else {
      rollers['statMin'] = 0;
      $('#statMin').textContent = '？';
    }
  }

  function renderNets(net) {
    const ul = $('#netList');
    ul.innerHTML = '';
    const max = Math.max(1, ...state.members.map((m) => Math.abs(net[m.id] || 0)));
    state.members.forEach((m) => {
      const v = net[m.id] || 0;
      const li = document.createElement('li');
      li.className = 'net';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = m.name;
      const bar = document.createElement('span');
      bar.className = 'bar';
      const fill = document.createElement('span');
      fill.className = 'fill';
      const pct = (Math.abs(v) / max) * 50;
      fill.style.width = pct + '%';
      fill.style.left = v >= 0 ? '50%' : 50 - pct + '%';
      fill.style.background = v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'rgba(255,255,255,.2)';
      bar.appendChild(fill);
      const val = document.createElement('span');
      val.className = 'v ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
      val.textContent = (v > 0 ? '+' : '') + money(v);
      li.append(nm, bar, val);
      ul.appendChild(li);
    });
    $('#netNote').textContent = state.members.length
      ? '正數＝別人欠你，負數＝你要還錢。加總永遠是 0。'
      : '還沒有成員。';
  }

  /* ---------- 欠債網 ---------- */
  const CX = 220;
  const CY = 178;
  const R = 122;
  const NR = 26;

  function pos(i, n) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  }

  function edgePath(p, q, bend) {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const s = { x: p.x + ux * (NR + 4), y: p.y + uy * (NR + 4) };
    const t = { x: q.x - ux * (NR + 8), y: q.y - uy * (NR + 8) };
    const mx = (s.x + t.x) / 2 - uy * bend;
    const my = (s.y + t.y) / 2 + ux * bend;
    return { d: `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${t.x.toFixed(1)} ${t.y.toFixed(1)}`, mx, my };
  }

  function renderWeb(net, naive, tx) {
    const gT = $('#gTangle');
    const gC = $('#gClean');
    const gN = $('#gNodes');
    gT.innerHTML = '';
    gC.innerHTML = '';
    gN.innerHTML = '';
    const n = state.members.length;
    $('#webEmpty').hidden = n >= 2;
    if (n < 2) return;

    const P = {};
    state.members.forEach((m, i) => (P[m.id] = pos(i, n)));

    // 纏成一團的天真轉帳
    gT.classList.toggle('gone', settled);
    const seen = {};
    naive.slice(0, 44).forEach((t) => {
      const k = t.from + '>' + t.to;
      seen[k] = (seen[k] || 0) + 1;
      const bend = 14 + (seen[k] - 1) * 11;
      const { d } = edgePath(P[t.from], P[t.to], bend);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('marker-end', 'url(#ah-thin)');
      gT.appendChild(p);
    });

    // 清算後的轉帳
    if (settled) {
      tx.forEach((t, i) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const { d, mx, my } = edgePath(P[t.from], P[t.to], 16);
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('marker-end', 'url(#ah-bold)');
        p.setAttribute('class', 'edge' + (reduce ? '' : ' in'));
        const len = Math.ceil(Math.hypot(P[t.to].x - P[t.from].x, P[t.to].y - P[t.from].y)) + 40;
        p.style.setProperty('--len', len);
        p.style.setProperty('--i', i);
        p.style.strokeDasharray = len;
        if (reduce) p.style.opacity = 1;
        const lab = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lab.setAttribute('x', mx.toFixed(1));
        lab.setAttribute('y', (my - 4).toFixed(1));
        lab.setAttribute('class', 'lab');
        lab.style.setProperty('--i', i);
        lab.textContent = money(t.cents);
        if (reduce) lab.style.opacity = 1;
        g.append(p, lab);
        gC.appendChild(g);
      });
    }

    // 節點
    state.members.forEach((m) => {
      const p = P[m.id];
      const v = net[m.id] || 0;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'node' + (settled ? ' settled' : ''));
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p.x.toFixed(1));
      c.setAttribute('cy', p.y.toFixed(1));
      c.setAttribute('r', NR);
      c.setAttribute('class', 'n-ring');
      c.setAttribute('stroke', m.color);
      c.setAttribute('stroke-width', '1.6');
      const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t1.setAttribute('x', p.x.toFixed(1));
      t1.setAttribute('y', (p.y - 4).toFixed(1));
      t1.setAttribute('class', 'n-lbl');
      t1.textContent = m.name.length > 4 ? m.name.slice(0, 4) : m.name;
      const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t2.setAttribute('x', p.x.toFixed(1));
      t2.setAttribute('y', (p.y + 10).toFixed(1));
      t2.setAttribute('class', 'n-amt');
      t2.setAttribute('fill', v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--ink-faint)');
      t2.textContent = (v > 0 ? '+' : '') + money(v);
      g.append(c, t1, t2);
      gN.appendChild(g);
    });
  }

  /* ---------- 收據 ---------- */
  let lastTx = [];
  function renderReceipt(tx) {
    lastTx = tx;
    const card = $('#receiptCard');
    if (!settled) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const lines = $('#rLines');
    lines.innerHTML = '';
    const total = state.expenses.reduce((a, e) => a + e.cents, 0);
    $('#rSub').textContent =
      new Date().toLocaleDateString('zh-TW') + ' · ' + state.members.length + ' 人 · 共 ' + money(total) + ' 元';

    if (!tx.length) {
      const li = document.createElement('li');
      li.className = 'r-line zero';
      li.style.setProperty('--i', 0);
      li.textContent = '✓ 帳已經平了，不用轉任何一筆';
      lines.appendChild(li);
    } else {
      tx.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = 'r-line';
        li.style.setProperty('--i', i);
        const w = document.createElement('span');
        w.className = 'who';
        w.textContent = nameOf(t.from);
        const to = document.createElement('span');
        to.className = 'to';
        to.textContent = '付給 ' + nameOf(t.to);
        const dots = document.createElement('span');
        dots.className = 'dots';
        const amt = document.createElement('span');
        amt.className = 'amt';
        amt.textContent = money(t.cents) + ' 元';
        li.append(w, to, dots, amt);
        lines.appendChild(li);
      });
    }
    const naive = naiveTransfers(state.members, state.expenses).length;
    $('#rFoot').textContent = tx.length
      ? '原本要轉 ' + naive + ' 筆，現在只要 ' + tx.length + ' 筆 · 省下 ' + (naive - tx.length) + ' 次轉帳'
      : '原本要轉 ' + naive + ' 筆，現在一筆都不用';
  }

  function receiptText() {
    const total = state.expenses.reduce((a, e) => a + e.cents, 0);
    const head = '【分帳結算】' + state.members.length + ' 人 · 共 ' + money(total) + ' 元\n';
    const body = lastTx.length
      ? lastTx.map((t) => '・' + nameOf(t.from) + ' → ' + nameOf(t.to) + '：' + money(t.cents) + ' 元').join('\n')
      : '・帳已經平了，不用轉任何一筆';
    return head + body + '\n（' + naiveTransfers(state.members, state.expenses).length + ' 筆化簡為 ' + lastTx.length + ' 筆）';
  }

  /* ---------- 事件 ---------- */
  $('#memberForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const inp = $('#memberName');
    const v = inp.value.trim();
    if (!v) return;
    if (state.members.length >= 8) {
      inp.value = '';
      inp.placeholder = '最多 8 人';
      return;
    }
    addMember(v);
    inp.value = '';
    inp.focus();
  });

  $('#expenseForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (state.members.length < 2) return;
    const title = $('#expTitle').value.trim() || '未命名';
    const amt = parseFloat($('#expAmount').value);
    const payer = $('#expPayer').value;
    const parts = {};
    state.members.forEach((m) => {
      if (draft[m.id] > 0) parts[m.id] = draft[m.id];
    });
    if (!(amt > 0) || !payer || !Object.keys(parts).length) return;
    state.expenses.push({
      id: nid(),
      title: title.slice(0, 16),
      payer,
      cents: Math.round(amt * 100),
      parts,
    });
    $('#expTitle').value = '';
    $('#expAmount').value = '';
    touch();
    $('#expTitle').focus();
  });

  $('#btnAll').addEventListener('click', () => {
    state.members.forEach((m) => (draft[m.id] = Math.max(1, draft[m.id] || 0)));
    renderChips();
  });
  $('#btnNone').addEventListener('click', () => {
    state.members.forEach((m) => (draft[m.id] = 0));
    renderChips();
  });
  $('#btnDemo').addEventListener('click', demo);

  $('#btnSettle').addEventListener('click', () => {
    settled = true;
    render();
    const card = $('#receiptCard');
    if (!reduce && card && !card.hidden) {
      setTimeout(() => {
        const top = card.getBoundingClientRect().top;
        if (top > window.innerHeight - 80) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  });

  $('#btnCopy').addEventListener('click', async () => {
    const txt = receiptText();
    const done = () => {
      $('#copied').textContent = '已複製 ✓';
      setTimeout(() => ($('#copied').textContent = ''), 1800);
    };
    try {
      await navigator.clipboard.writeText(txt);
      done();
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch (e2) {
        $('#copied').textContent = '複製失敗，請手動選取';
      }
      ta.remove();
    }
  });

  /* ---------- 起手 ---------- */
  if (!state.members.length && !state.expenses.length) demo();
  else {
    resetDraft();
    render();
  }
})();

/* ===== 密碼實驗室 · app.js =====================================
   全部運算都在瀏覽器本機完成。密碼永遠不會被送出、也不會被寫進 localStorage。
   localStorage 只存 UI 偏好，key 一律加 `pwlab.` 前綴。
   ============================================================== */
(() => {
  'use strict';

  const LS = 'pwlab.';
  const $ = (id) => document.getElementById(id);

  /* ---------- 動畫偏好（動態監聽） ---------- */
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = mq.matches;
  const onMq = (e) => { reduceMotion = e.matches; };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);

  /* ---------- 資料 ---------- */
  const WORDS = window.PWLAB_WORDS || [];                        // 產生密語用
  const WORD_BITS = WORDS.length ? Math.log2(WORDS.length) : 11; // 2048 → 11 bits
  // 偵測字典：依英文詞頻排名。命中的猜測成本 ≈ log2(排名)——排名越前，駭客越早試到。
  const DICT = new Map((window.PWLAB_DICT || []).map((w, i) => [w, i + 1]));

  // 公開外洩統計中最常出現的密碼（NordPass / rockyou 等榜單的經典成員；順序為示意）
  const COMMON = ['123456', 'password', '12345678', 'qwerty', '123456789', '12345', '1234', '111111', '1234567',
    'dragon', '123123', 'baseball', 'abc123', 'football', 'monkey', 'letmein', 'shadow', 'master', '666666',
    'qwertyuiop', '123321', 'mustang', '1234567890', 'michael', '654321', 'superman', '1qaz2wsx', '7777777',
    'iloveyou', '000000', '888888', 'princess', 'admin', 'welcome', 'sunshine', 'passw0rd', 'p@ssw0rd', 'trustno1',
    'ashley', 'bailey', 'flower', 'hottie', 'loveme', 'zaq12wsx', 'password1', 'password123', 'qwerty123',
    'admin123', 'root', 'toor', 'test', 'guest', 'login', 'starwars', 'whatever', 'freedom', 'ninja', 'azerty',
    'solo', 'batman', 'jordan23', 'harley', 'ranger', 'buster', 'soccer', 'hockey', 'killer', 'george',
    'andrew', 'charlie', 'thomas', 'robert', 'access', 'love', 'summer', 'internet', 'service', 'canada', 'hello',
    'ferrari', 'cookie', 'computer', 'corvette', 'matrix', 'biteme', 'maggie', 'jennifer', 'pepper', '1111',
    'zxcvbnm', 'asdfgh', 'qazwsx', 'pass', 'jessica', 'panther', 'hunter', 'purple', 'angel', 'tigger', 'chelsea',
    'diamond', 'yankees', '555555', 'a1b2c3', '1q2w3e4r', '1q2w3e', 'qwe123', 'asdf1234', 'iloveu',
    'secret', 'abcd1234', 'pass@123', 'welcome@123', 'abc12345', 'asd123', '123qwe', 'qwerty1', 'q1w2e3r4'];
  const COMMON_RANK = new Map(COMMON.map((w, i) => [w, i + 1]));

  const SEQS = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx'];
  const LEET = { '@': 'a', '4': 'a', '8': 'b', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't', '9': 'g', '(': 'c' };

  /* ---------- 攻擊者情境（rate = 每秒可試次數） ----------
     RTX 5090 hashcat 實測（Chick3nman）：MD5 220.6 GH/s、bcrypt 成本 5（32 迭代）304.8 kH/s。
     bcrypt 成本 10 = 1024 迭代 = 成本 5 的 32 倍工作量 → 304.8k ÷ 32 ≈ 9,525 H/s。 */
  const ATTACKERS = {
    one_bcrypt: { rate: 9.5e3, note: '一張頂級顯示卡打 bcrypt（成本 10）：每秒約 9,500 次嘗試。慢雜湊就是這樣拖住駭客的。' },
    farm_bcrypt: { rate: 1.14e5, note: 'Hive Systems 2025 密碼表的假設：12 張 RTX 5090 對 bcrypt（成本 10），每秒約 11.4 萬次嘗試。' },
    farm_md5: { rate: 2.65e12, note: '同一批顯示卡，網站卻用老舊的 MD5：每秒 2.6 兆次——密碼沒變，撐的時間卻塌掉好幾個數量級。' },
    ai_md5: { rate: 1.36e15, note: '把訓練 ChatGPT 等級的 2 萬張 A100 全拿去打 MD5：每秒逾千兆次。這時候，長度是唯一還站得住的防線。' }
  };
  let atkKey = localStorage.getItem(LS + 'attacker') || 'farm_bcrypt';
  if (!ATTACKERS[atkKey]) atkKey = 'farm_bcrypt';

  /* ---------- 熵估算 ---------- */
  function poolSize(pw) {
    let n = 0;
    if (/[a-z]/.test(pw)) n += 26;
    if (/[A-Z]/.test(pw)) n += 26;
    if (/[0-9]/.test(pw)) n += 10;
    if (/[^A-Za-z0-9]/.test(pw)) n += 33; // 常見符號
    return n || 1;
  }

  function isSequence(s) {
    if (s.length < 3) return false;
    const low = s.toLowerCase();
    const rev = low.split('').reverse().join('');
    return SEQS.some((seq) => seq.includes(low) || seq.includes(rev));
  }

  function deLeet(s) {
    let out = '', subs = 0;
    for (const ch of s) {
      const m = LEET[ch];
      if (m) { out += m; subs++; } else out += ch.toLowerCase();
    }
    return { word: out, subs: subs };
  }

  // 一個字典字值多少 bits：取「英文詞頻排名」與「常見密碼排名」中較便宜的那個
  function dictBits(word) {
    const r1 = DICT.get(word);
    const r2 = COMMON_RANK.get(word);
    if (!r1 && !r2) return null;
    const rank = Math.min(r1 || Infinity, r2 || Infinity);
    return Math.max(1, Math.log2(rank));
  }

  // 貪婪切詞：把密碼拆成「字典字／序列／重複／數字串／單字元」，各段猜測數相乘
  function smartBits(pw) {
    const low = pw.toLowerCase();
    if (COMMON_RANK.has(low)) return Math.log2(COMMON_RANK.get(low));

    const pool = poolSize(pw);
    let bits = 0, i = 0, tokens = 0;

    while (i < pw.length) {
      let bestLen = 0, bestBits = 0;

      // 1) 字典字（含 leet 還原），由長到短
      for (let len = Math.min(12, pw.length - i); len >= 4; len--) {
        const seg = pw.substr(i, len);
        const dl = deLeet(seg);
        const b0 = dictBits(dl.word);
        if (b0 !== null) {
          let b = b0;
          if (/[A-Z]/.test(seg)) b += 1;             // 大小寫變化買到的很少
          if (dl.subs > 0) b += Math.min(dl.subs, 3); // leet 替換也一樣
          bestLen = len; bestBits = b;
          break;
        }
      }

      // 2) 序列（123 / abc / qwerty）
      if (!bestLen) {
        for (let len = Math.min(10, pw.length - i); len >= 3; len--) {
          const seg = pw.substr(i, len);
          if (isSequence(seg)) { bestLen = len; bestBits = Math.log2(SEQS.length * 2 * len); break; }
        }
      }

      // 3) 重複同一字元（aaaa / 1111）
      if (!bestLen) {
        let len = 1;
        while (i + len < pw.length && pw[i + len] === pw[i]) len++;
        if (len >= 3) { bestLen = len; bestBits = Math.log2(pool * len); }
      }

      // 4) 純數字串（年份、生日、門牌…）
      if (!bestLen) {
        const m = /^\d+/.exec(pw.slice(i));
        if (m && m[0].length >= 2) {
          const d = m[0].length;
          bestLen = d;
          bestBits = (d === 4 && /^(19|20)\d\d$/.test(m[0])) ? Math.log2(120) : d * Math.log2(10);
        }
      }

      // 5) 單一字元
      if (!bestLen) { bestLen = 1; bestBits = Math.log2(pool); }

      bits += bestBits;
      i += bestLen;
      tokens++;
    }

    if (tokens > 1) bits += Math.log2(tokens); // 切法本身也有一點點不確定性
    return bits;
  }

  function analyze(pw) {
    const pool = poolSize(pw);
    const brute = pw.length * Math.log2(pool);
    const smart = Math.min(smartBits(pw), brute);
    return { brute: brute, smart: smart, pool: pool };
  }

  /* ---------- 破解時間（全程在 log 空間，避免 2^300 溢位） ---------- */
  const YEAR = 3.15576e7;         // 秒
  const UNIVERSE_YEARS = 1.38e10; // 宇宙年齡（年）

  // 秒數 = ½ × 2^bits ÷ rate，回傳 log10(秒)
  const log10Seconds = (bits, rate) => Math.log10(0.5) + bits * Math.log10(2) - Math.log10(rate);

  function fmtNum(n) {
    if (n >= 100) return Math.round(n).toLocaleString('en-US');
    return n.toFixed(1).replace(/\.0$/, '');
  }

  function humanTime(l10) {
    if (l10 < -0.3) return '瞬間破解';                   // < 0.5 秒
    const s = Math.pow(10, l10);
    if (l10 < 1.78) return fmtNum(s) + ' 秒';            // < 60 秒
    if (l10 < 3.56) return fmtNum(s / 60) + ' 分鐘';     // < 1 小時
    if (l10 < 4.94) return fmtNum(s / 3600) + ' 小時';   // < 1 天
    if (l10 < 6.42) return fmtNum(s / 86400) + ' 天';    // < 1 年
    const yl = l10 - Math.log10(YEAR);                   // log10(年)
    if (yl < 4) return fmtNum(Math.pow(10, yl)) + ' 年';
    if (yl < 8) return fmtNum(Math.pow(10, yl - 4)) + ' 萬年';
    if (yl < 12) return fmtNum(Math.pow(10, yl - 8)) + ' 億年';
    const times = yl - Math.log10(UNIVERSE_YEARS);
    if (times < 6) return '宇宙年齡的 ' + fmtNum(Math.pow(10, times)) + ' 倍';
    return '宇宙年齡的 10^' + Math.round(times) + ' 倍';
  }

  /* ---------- 等級 ---------- */
  const LEVELS = [
    { max: 28, name: '一戳就破', color: 'var(--weak)', pct: 12 },
    { max: 40, name: '撐不了多久', color: 'var(--weak)', pct: 30 },
    { max: 56, name: '普通', color: 'var(--mid)', pct: 52 },
    { max: 72, name: '很不錯', color: 'var(--ok)', pct: 76 },
    { max: Infinity, name: '固若金湯', color: 'var(--strong)', pct: 100 }
  ];
  const levelOf = (bits) => LEVELS.find((l) => bits < l.max);

  /* ---------- 數字滾動 ---------- */
  function rollTo(el, target) {
    const from = parseFloat(el.dataset.v || '0');
    el.dataset.v = String(target);
    if (reduceMotion) { el.textContent = String(Math.round(target)); return; }
    const t0 = performance.now(), dur = 420;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = String(Math.round(from + (target - from) * e));
      if (k < 1 && el.dataset.v === String(target)) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- 彩帶（只在「變強」的那一刻放一次） ---------- */
  const confettiBox = $('confetti');
  function celebrate() {
    if (reduceMotion || document.hidden) return;
    const colors = ['#39e6a8', '#6ea8ff', '#ffb454', '#ffffff'];
    const pieces = [];
    for (let i = 0; i < 26; i++) {
      const el = document.createElement('i');
      el.style.background = colors[i % colors.length];
      el.style.left = (20 + Math.random() * 60) + '%';
      confettiBox.appendChild(el);
      pieces.push({
        el: el, x: 0, y: 0,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
        r: Math.random() * 360, vr: (Math.random() - 0.5) * 20
      });
    }
    const t0 = performance.now();
    const tick = (t) => {
      const k = (t - t0) / 1400;
      if (k >= 1 || document.hidden) { pieces.forEach((p) => p.el.remove()); return; }
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.r += p.vr;
        p.el.style.transform = 'translate(' + p.x + 'px,' + (p.y + 40) + 'px) rotate(' + p.r + 'deg)';
        p.el.style.opacity = String(1 - k);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- 提示旗 ---------- */
  function buildFlags(pw, a) {
    const low = pw.toLowerCase();
    const out = [];

    if (COMMON_RANK.has(low)) out.push(['bad', '⛔ 這是外洩榜第 ' + COMMON_RANK.get(low) + ' 名的密碼，駭客第一批就試它']);
    if (pw.length < 8) out.push(['bad', '⛔ 太短了：長度是最便宜也最有效的防禦']);
    else if (pw.length < 12) out.push(['warn', '⚠️ 建議至少 12 個字元']);
    else out.push(['good', '✅ 長度 ' + pw.length + ' 個字元，很好']);

    let found = null, leetHit = false;
    for (let len = Math.min(12, pw.length); len >= 4 && !found; len--) {
      for (let i = 0; i + len <= pw.length; i++) {
        const dl = deLeet(pw.substr(i, len));
        if (DICT.has(dl.word)) { found = dl.word; leetHit = dl.subs > 0; break; }
      }
    }
    if (found && !COMMON_RANK.has(low)) out.push(['warn', '⚠️ 裡面藏著字典單字「' + found + '」——字典攻擊會先試它']);
    if (leetHit) out.push(['warn', '⚠️ 把 a 換成 @、o 換成 0，騙不了電腦，只騙得了你自己']);

    for (let i = 0; i + 4 <= pw.length; i++) {
      if (isSequence(pw.substr(i, 4))) { out.push(['bad', '⛔ 含鍵盤／數字序列「' + pw.substr(i, 4) + '」']); break; }
    }
    if (pw.length > 4 && /^(19|20)\d\d$/.test(pw.slice(-4))) out.push(['warn', '⚠️ 結尾是年份，猜測空間只剩一百多種']);
    if (a.brute - a.smart > 12) out.push(['warn', '🔎 看起來很亂，但有跡可循——聰明攻擊比暴力破解快得多']);
    if (a.smart >= 72) out.push(['good', '🛡️ 這種強度，現在的硬體是打不穿的']);
    return out;
  }

  /* ---------- 主更新 ---------- */
  const pwEl = $('pw'), meter = $('meter'), vLabel = $('v-label'), bitsEl = $('bits'),
    tSmart = $('time-smart'), tBrute = $('time-brute'), fSmart = $('foot-smart'),
    flagsEl = $('flags'), lock = $('lock'), atkSel = $('atk'), atkNote = $('atk-note');
  let wasStrong = false;

  function update() {
    const pw = pwEl.value;
    const rate = ATTACKERS[atkKey].rate;

    if (!pw) {
      meter.style.width = '0%';
      meter.style.background = 'var(--faint)';
      vLabel.textContent = '等你輸入…';
      vLabel.style.color = 'var(--muted)';
      bitsEl.textContent = '0'; bitsEl.dataset.v = '0';
      tSmart.textContent = '—'; tBrute.textContent = '—';
      tSmart.style.color = 'var(--ink)';
      fSmart.textContent = '這才是真實世界的猜法';
      flagsEl.innerHTML = '';
      lock.className = 'lock';
      wasStrong = false;
      return;
    }

    const a = analyze(pw);
    const lv = levelOf(a.smart);
    const ls = log10Seconds(a.smart, rate);
    const lb = log10Seconds(a.brute, rate);

    meter.style.width = lv.pct + '%';
    meter.style.background = lv.color;
    vLabel.textContent = lv.name;
    vLabel.style.color = lv.color;
    rollTo(bitsEl, Math.round(a.smart));

    tSmart.textContent = humanTime(ls);
    tSmart.style.color = lv.color;
    tBrute.textContent = humanTime(lb);
    fSmart.textContent = (a.brute - a.smart > 12)
      ? '暴力破解要 ' + humanTime(lb) + '——但駭客不會那樣猜'
      : '這才是真實世界的猜法';

    flagsEl.innerHTML = '';
    buildFlags(pw, a).forEach((f, i) => {
      const li = document.createElement('li');
      li.className = f[0];
      li.textContent = f[1];
      li.style.animationDelay = (i * 45) + 'ms';
      flagsEl.appendChild(li);
    });

    const strong = a.smart >= 72;
    lock.className = 'lock ' + (strong ? 'locked' : 'unlocked');
    if (strong && !wasStrong) celebrate();
    if (!strong && wasStrong) lock.classList.add('rattle');
    wasStrong = strong;
  }

  /* ---------- 密語產生器 ---------- */
  const wc = $('wc'), wcVal = $('wc-val'), optNum = $('opt-num'), optCap = $('opt-cap'),
    sepSel = $('sepsel'), phraseEl = $('phrase'), genStats = $('gen-stats'),
    gBits = $('g-bits'), gTime = $('g-time'), diceEl = $('dice'), copyBtn = $('copy');

  let currentPhrase = '', currentBits = 0;

  try {
    const saved = JSON.parse(localStorage.getItem(LS + 'gen') || '{}');
    if (saved.wc >= 3 && saved.wc <= 6) wc.value = String(saved.wc);
    if (typeof saved.num === 'boolean') optNum.checked = saved.num;
    if (typeof saved.cap === 'boolean') optCap.checked = saved.cap;
    if (typeof saved.sep === 'string') sepSel.value = saved.sep;
  } catch (err) { /* 偏好毀損就用預設值 */ }
  wcVal.textContent = wc.value;

  const savePrefs = () => localStorage.setItem(LS + 'gen', JSON.stringify({
    wc: +wc.value, num: optNum.checked, cap: optCap.checked, sep: sepSel.value
  }));

  // 無偏均勻隨機（拒絕取樣）：用 crypto 而非 Math.random
  function randInt(n) {
    const max = Math.floor(0xFFFFFFFF / n) * n;
    const buf = new Uint32Array(1);
    let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= max);
    return v % n;
  }

  function makePhrase() {
    const n = +wc.value, sep = sepSel.value;
    const picked = [];
    for (let i = 0; i < n; i++) {
      let w = WORDS[randInt(WORDS.length)];
      if (optCap.checked) w = w[0].toUpperCase() + w.slice(1);
      picked.push(w);
    }
    let bits = n * WORD_BITS;
    if (optNum.checked) { picked.push(String(10 + randInt(90))); bits += Math.log2(90); }
    return { text: picked.join(sep), bits: bits };
  }

  function reveal(res) {
    currentPhrase = res.text;
    currentBits = res.bits;
    phraseEl.textContent = res.text;
    phraseEl.classList.remove('pop');
    void phraseEl.offsetWidth;
    if (!reduceMotion) phraseEl.classList.add('pop');
    genStats.hidden = false;
    rollTo(gBits, Math.round(res.bits));
    gTime.textContent = humanTime(log10Seconds(res.bits, ATTACKERS[atkKey].rate));
    copyBtn.textContent = '複製';
    copyBtn.classList.remove('copied');
  }

  const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  function roll() {
    const res = makePhrase();
    if (reduceMotion) { reveal(res); return; }
    const dies = diceEl.querySelectorAll('.die');
    diceEl.classList.add('rolling');
    const t0 = performance.now();
    const tick = (t) => {
      dies.forEach((d) => { d.textContent = FACES[randInt(6)]; });
      if (document.hidden || t - t0 > 620) {
        diceEl.classList.remove('rolling');
        reveal(res);
        return;
      }
      setTimeout(() => requestAnimationFrame(tick), 60);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- 事件 ---------- */
  pwEl.addEventListener('input', update);

  $('toggle').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const show = pwEl.type === 'password';
    pwEl.type = show ? 'text' : 'password';
    btn.textContent = show ? '隱藏' : '顯示';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? '隱藏密碼' : '顯示密碼');
    pwEl.focus();
  });

  document.querySelectorAll('[data-fill]').forEach((b) => {
    b.addEventListener('click', () => {
      pwEl.value = b.dataset.fill;
      pwEl.type = 'text';
      const t = $('toggle');
      t.textContent = '隱藏';
      t.setAttribute('aria-pressed', 'true');
      update();
    });
  });

  atkSel.value = atkKey;
  atkNote.textContent = ATTACKERS[atkKey].note;
  atkSel.addEventListener('change', () => {
    atkKey = atkSel.value;
    localStorage.setItem(LS + 'attacker', atkKey);
    atkNote.textContent = ATTACKERS[atkKey].note;
    update();
    if (currentBits) gTime.textContent = humanTime(log10Seconds(currentBits, ATTACKERS[atkKey].rate));
  });

  $('roll').addEventListener('click', roll);
  wc.addEventListener('input', () => { wcVal.textContent = wc.value; savePrefs(); });
  [optNum, optCap, sepSel].forEach((el) => el.addEventListener('change', savePrefs));

  copyBtn.addEventListener('click', () => {
    if (!currentPhrase) return;
    const done = () => {
      copyBtn.textContent = '已複製 ✓';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = '複製';
        copyBtn.classList.remove('copied');
      }, 1800);
    };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = currentPhrase;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) { /* 瀏覽器不給複製就算了 */ }
      ta.remove();
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentPhrase).then(done).catch(fallback);
    } else {
      fallback();
    }
  });

  /* ---------- 啟動 ---------- */
  update();
  roll();
})();

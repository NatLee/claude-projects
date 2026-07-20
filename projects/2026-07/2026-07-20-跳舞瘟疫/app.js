/* ══════════════════════════════════════════════════════════
   跳舞瘟疫 · 1518
   純靜態、零外部依賴。localStorage 前綴：tanz.
   ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LS = 'tanz.';
  var $ = function (s) { return document.querySelector(s); };

  /* ── 動效偏好（動態監聽） ───────────────────────── */
  var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var calm = mq.matches;
  var onCalmChange = function (e) {
    calm = e.matches;
    if (calm) { stopPlay(); } else { syncPlayLabel(); schedule(); }
    drawStreet();
  };
  if (mq.addEventListener) { mq.addEventListener('change', onCalmChange); }
  else if (mq.addListener) { mq.addListener(onCalmChange); }

  /* ══════════════════════════════════════════════════════
     一、那年夏天：資料
     ══════════════════════════════════════════════════════ */

  var LAST_DAY = 58;               // 1518-07-14 起算，到 9 月初

  // 有史料錨定的三點：第 0 天 1 人、第 6 天三十多人、第 26 天約四百人。
  // 其餘為依這三點所做的內插。
  var ANCHORS = [
    [0, 1], [3, 9], [6, 32], [10, 38], [16, 120],
    [22, 270], [26, 400], [36, 400], [44, 250], [51, 90], [58, 0]
  ];

  var EVENTS = [
    { d: 0,  t: '一個人',
      b: '特羅菲亞夫人走到自家門外的石板路上，開始跳舞。沒有音樂，沒有節慶。她跳了整整一週。' },
    { d: 6,  t: '三十多人',
      b: '看過她的人開始模仿。幾天之內，三十多個人也動了起來。' },
    { d: 12, t: '醫生的診斷',
      b: '議會請來醫生。結論不是中邪、不是星象，是「血過熱」——依當時的體液醫學，熱要靠動來散。' },
    { d: 15, t: '處方：再多跳一點',
      b: '於是市府清空公會廳、在馬市與穀市搭起木台，花錢請來鼓手與笛手，還找了健康的人下場陪跳。' },
    { d: 26, t: '約四百人',
      b: '到了八月，跳舞的人達到約四百。有人倒下，有人被扶起來繼續。' },
    { d: 33, t: '禁令',
      b: '事情變得更糟。議會掉頭，禁止公開跳舞，連音樂也一併禁掉。' },
    { d: 47, t: '紅鞋與聖水',
      b: '剩下的人被送往薩韋爾納的聖維特聖龕。神父把聖物按進他們掌心，替他們穿上灑過聖水、鞋面與鞋底都畫了十字的紅鞋。' },
    { d: 56, t: '它自己停了',
      b: '消息傳開：他們已被聖維特赦免。九月初，這件事結束了，沒有人知道為什麼。' }
  ];

  function countAt(day) {
    if (day <= ANCHORS[0][0]) { return ANCHORS[0][1]; }
    for (var i = 1; i < ANCHORS.length; i++) {
      if (day <= ANCHORS[i][0]) {
        var a = ANCHORS[i - 1], b = ANCHORS[i];
        var k = (day - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return ANCHORS[ANCHORS.length - 1][1];
  }

  function dateLabel(day) {
    var dt = new Date(1518, 6, 14 + Math.round(day));
    return '1518 年 ' + (dt.getMonth() + 1) + ' 月 ' + dt.getDate() + ' 日';
  }

  /* ══════════════════════════════════════════════════════
     二、街景畫布
     ══════════════════════════════════════════════════════ */

  var cv = $('#street');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1;
  var backdrop = document.createElement('canvas');
  var MAX_FIGS = 400;
  var figs = [];

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 固定亂數種子 → 每次重繪的人群與街景都一樣，不會跳動
  (function buildFigures() {
    var r = mulberry32(1518);
    for (var i = 0; i < MAX_FIGS; i++) {
      // 越晚加入的人越往外圍、越遠：讓人群自然由中心向外長
      var spread = 0.16 + 0.84 * Math.pow(i / MAX_FIGS, 0.55);
      figs.push({
        x: 0.5 + (r() - 0.5) * spread,
        d: Math.pow(r(), 0.72),
        ph: r() * Math.PI * 2,
        sp: 1.5 + r() * 2.3,
        am: 0.6 + r() * 0.7,
        lean: (r() - 0.5) * 0.5
      });
    }
  })();

  function horizonOf(h) { return h * 0.54; }

  function paintBackdrop() {
    backdrop.width = cv.width;
    backdrop.height = cv.height;
    var b = backdrop.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.clearRect(0, 0, W, H);

    var hz = horizonOf(H);
    var r = mulberry32(77);

    // 天空
    var sky = b.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#0a0910');
    sky.addColorStop(1, '#1b1726');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, hz + 1);

    // 遠處半木造屋的剪影
    b.fillStyle = '#07060c';
    var x = -40;
    while (x < W + 40) {
      var bw = 52 + r() * 96;
      var bh = hz * (0.24 + r() * 0.42);
      var top = hz - bh;
      b.beginPath();
      b.moveTo(x, hz);
      b.lineTo(x, top + 16);
      b.lineTo(x + bw / 2, top - 12 - r() * 22);   // 尖屋頂
      b.lineTo(x + bw, top + 16);
      b.lineTo(x + bw, hz);
      b.closePath();
      b.fill();

      // 零星幾扇還亮著的窗
      if (r() > 0.62) {
        b.fillStyle = 'rgba(203,161,75,.13)';
        b.fillRect(x + bw * 0.34, top + 30, 7, 9);
        b.fillStyle = '#07060c';
      }
      x += bw - 6;
    }

    // 地面
    var gnd = b.createLinearGradient(0, hz, 0, H);
    gnd.addColorStop(0, '#121019');
    gnd.addColorStop(1, '#08070d');
    b.fillStyle = gnd;
    b.fillRect(0, hz, W, H - hz);

    // 石板紋
    b.strokeStyle = 'rgba(233,226,210,.05)';
    b.lineWidth = 1;
    for (var i = 0; i < 26; i++) {
      var k = i / 25;
      var y = hz + Math.pow(k, 2.1) * (H - hz);
      b.globalAlpha = 0.2 + k * 0.8;
      b.beginPath();
      b.moveTo(0, y);
      b.lineTo(W, y);
      b.stroke();
    }
    b.globalAlpha = 1;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || window.innerWidth;
    H = cv.clientHeight || window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBackdrop();
    drawStreet();
  }

  var BANDS = [
    { lo: 0.00, hi: 0.34, a: 0.34, lw: 1.1 },
    { lo: 0.34, hi: 0.70, a: 0.60, lw: 1.6 },
    { lo: 0.70, hi: 1.01, a: 0.92, lw: 2.2 }
  ];

  function drawStreet() {
    if (!W || !H) { return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(backdrop, 0, 0, W, H);

    var hz = horizonOf(H);
    var n = Math.round(countAt(dayShown));
    if (n <= 0) { return; }
    if (n > MAX_FIGS) { n = MAX_FIGS; }

    var unit = Math.max(0.55, Math.min(1.25, H / 720));
    var t = calm ? 0 : (performance.now() / 1000);

    for (var bi = 0; bi < BANDS.length; bi++) {
      var band = BANDS[bi];
      var limbs = new Path2D();
      var heads = new Path2D();
      var drew = false;

      for (var i = 0; i < n; i++) {
        var f = figs[i];
        if (f.d < band.lo || f.d >= band.hi) { continue; }
        drew = true;

        var s = (0.32 + f.d * 1.05) * unit * 7;
        var px = f.x * W;
        var py = hz + Math.pow(f.d, 1.5) * (H - hz) * 0.96;

        var sw = calm ? 0 : Math.sin(t * f.sp + f.ph);
        var sw2 = calm ? 0 : Math.sin(t * f.sp * 1.37 + f.ph * 1.7);
        var tilt = (f.lean + sw * 0.34) * f.am;

        var hipX = px + tilt * s * 0.5;
        var hipY = py - s * 1.5;
        var shX = px + tilt * s * 1.5;
        var shY = py - s * 4.2;

        // 頭
        heads.moveTo(shX + s * 0.85, shY - s * 0.9);
        heads.arc(shX, shY - s * 0.9, s * 0.85, 0, Math.PI * 2);

        // 軀幹
        limbs.moveTo(hipX, hipY);
        limbs.lineTo(shX, shY);

        // 雙臂（甩動）
        limbs.moveTo(shX, shY);
        limbs.lineTo(shX - s * 1.5, shY + s * (0.4 - sw * 1.5));
        limbs.moveTo(shX, shY);
        limbs.lineTo(shX + s * 1.5, shY + s * (0.4 + sw * 1.5));

        // 雙腿
        limbs.moveTo(hipX, hipY);
        limbs.lineTo(px - s * (0.75 + sw2 * 0.55), py);
        limbs.moveTo(hipX, hipY);
        limbs.lineTo(px + s * (0.75 - sw2 * 0.55), py);
      }

      if (!drew) { continue; }
      ctx.globalAlpha = band.a;
      ctx.strokeStyle = '#e9e2d2';
      ctx.fillStyle = '#e9e2d2';
      ctx.lineWidth = band.lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(limbs);
      ctx.fill(heads);
    }
    ctx.globalAlpha = 1;
  }

  /* ══════════════════════════════════════════════════════
     三、時間軸控制
     ══════════════════════════════════════════════════════ */

  var scrub = $('#scrub');
  var dateOut = $('#dateOut');
  var countOut = $('#countOut');
  var logEl = $('#log');
  var playBtn = $('#playBtn');
  var playIco = $('#playIco');
  var playTxt = $('#playTxt');

  var dayShown = 0;      // 目前顯示的日子（可為小數）
  var playing = false;
  var lastT = 0;
  var shownEvents = 0;
  var dispCount = 1;     // 供數字滾動用

  function renderLog() {
    var want = 0;
    for (var i = 0; i < EVENTS.length; i++) {
      if (EVENTS[i].d <= dayShown) { want++; }
    }
    if (want === shownEvents) { return; }

    if (want < shownEvents) {
      while (logEl.children.length > want) {
        logEl.removeChild(logEl.lastElementChild);
      }
    } else {
      for (var j = shownEvents; j < want; j++) {
        var ev = EVENTS[j];
        var li = document.createElement('li');
        li.style.animationDelay = ((j - shownEvents) * 0.07) + 's';
        var d = document.createElement('span');
        d.className = 'lg-date';
        d.textContent = dateLabel(ev.d).replace('1518 年 ', '');
        var tt = document.createElement('span');
        tt.className = 'lg-title';
        tt.textContent = ev.t;
        var bb = document.createElement('span');
        bb.className = 'lg-body';
        bb.textContent = ev.b;
        li.appendChild(d); li.appendChild(tt); li.appendChild(bb);
        logEl.appendChild(li);
      }
    }
    shownEvents = want;
  }

  // 人數直接跟著日子走：播放時日子連續前進，數字自然滾動；
  // 拖動滑桿時立刻對位（直接操作不該有延遲），也不依賴 rAF 是否在跑。
  function syncReadout() {
    dateOut.textContent = dateLabel(dayShown);
    dispCount = Math.round(countAt(dayShown));
    countOut.textContent = String(dispCount);
    renderLog();
  }

  function setDay(d, fromScrub) {
    dayShown = Math.max(0, Math.min(LAST_DAY, d));
    if (!fromScrub) { scrub.value = String(Math.round(dayShown)); }
    syncReadout();
    if (calm) { drawStreet(); }
  }

  var PEAK_DAY = 26;

  function startPlay() {
    if (calm) {                      // 降級：不做逐格播放，直接跳到最高峰
      dispCount = Math.round(countAt(PEAK_DAY));
      setDay(PEAK_DAY);
      return;
    }
    if (dayShown >= LAST_DAY) { setDay(0); }
    playing = true;
    lastT = 0;
    playIco.textContent = '❚❚';
    playTxt.textContent = '暫停';
    playBtn.setAttribute('aria-label', '暫停時間軸');
  }

  function stopPlay() {
    playing = false;
    syncPlayLabel();
  }

  function syncPlayLabel() {
    if (calm) {
      playIco.textContent = '⇥';
      playTxt.textContent = '跳到最高峰';
      playBtn.setAttribute('aria-label', '跳到人數最高峰那一天');
    } else {
      playIco.textContent = '▶';
      playTxt.textContent = '播放';
      playBtn.setAttribute('aria-label', '播放時間軸');
    }
  }

  playBtn.addEventListener('click', function () {
    if (playing) { stopPlay(); } else { startPlay(); }
  });

  $('#resetBtn').addEventListener('click', function () {
    stopPlay();
    dispCount = 1;
    setDay(0);
  });

  scrub.addEventListener('input', function () {
    stopPlay();
    setDay(parseFloat(scrub.value), true);
  });

  /* ── 主迴圈（分頁隱藏／離屏時暫停） ─────────────── */
  var visible = true, onScreen = true, rafId = 0;

  function loop(ts) {
    rafId = 0;
    if (!visible || !onScreen) { return; }

    if (playing) {
      if (!lastT) { lastT = ts; }
      var dt = Math.min((ts - lastT) / 1000, 0.1);
      lastT = ts;
      dayShown += dt * 5;                    // 約 5 天／秒 → 全程約 12 秒
      if (dayShown >= LAST_DAY) { dayShown = LAST_DAY; stopPlay(); }
      scrub.value = String(Math.round(dayShown));
      syncReadout();
    }

    if (!calm) { drawStreet(); }
    schedule();
  }

  function schedule() {
    if (!rafId && visible && onScreen && !calm) {
      rafId = requestAnimationFrame(loop);
    }
  }

  document.addEventListener('visibilitychange', function () {
    visible = !document.hidden;
    if (visible) { lastT = 0; schedule(); } else { stopPlay(); }
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      onScreen = es[0].isIntersecting;
      if (onScreen) { lastT = 0; schedule(); }
    }, { threshold: 0 }).observe(cv);
  }

  window.addEventListener('resize', function () {
    clearTimeout(resize._t);
    resize._t = setTimeout(resize, 140);
  });

  /* ══════════════════════════════════════════════════════
     四、卷宗
     ══════════════════════════════════════════════════════ */

  var EVIDENCE = [
    {
      t: '議會的處方：再多跳一點',
      src: '史特拉斯堡市議會文書與市政帳目，1518 年夏',
      b: '議會請來醫生。醫生排除了中邪與星象，判定病因是「血過熱」——依當時的體液醫學，熱要靠動來散。於是官方的處方是：讓他們把病跳掉。市府清空了木匠與皮匠的公會廳，在馬市與穀市搭起木台，花錢請來鼓手與笛手，還找了健康的人下場陪跳、扶著快要倒下的人。',
      side: 'p', w: 2,
      r: '這條沒告訴你病因，卻解釋了規模。把跳舞搬上公開的木台、配上音樂，等於替模仿架好了舞台——人數正是在這之後從三十幾人衝到數百。任何「毒素」假說都很難解釋，為什麼官方的助興會讓症狀擴散。'
    },
    {
      t: '黑麥上的黴',
      src: '麥角菌（Claviceps purpurea）的藥理學',
      b: '麥角是長在黑麥穗上的一種真菌，含有麥角胺——LSD-25 最早就是從它合成出來的。中毒者會抽搐、痙攣、產生幻覺。而 1517 到 1518 年的阿爾薩斯連年歉收，人們吃下肚的正是品質最差的穀物。',
      side: 'e', w: 2,
      r: '這是麥角說最強的一擊：對的作物、對的年份、對的症狀。抽搐型麥角中毒確實會造成不自主的劇烈動作，時間點也吻合得不能再吻合。'
    },
    {
      t: '同一種黴，也被拿來解釋審巫案',
      src: '麥角中毒假說的應用史',
      b: '麥角不只被用來解釋這樁案子。1976 年起，也有研究者主張塞勒姆審巫案裡那些「中邪」的少女，其實是吃了受污染的黑麥。',
      side: 'e', w: 2,
      r: '這說明麥角假說不是空穴來風，而是一套被反覆檢驗過的成熟理論，值得認真對待。但也提醒你一件事：塞勒姆那個版本本身至今仍有爭議——一套什麼歷史怪事都能解釋的理論，解釋力反而要打點折。'
    },
    {
      t: '可是麥角會讓血流不通',
      src: 'John Waller, The Lancet 373(9664), 2009',
      b: '麥角中毒還有另一組典型症狀：血管劇烈收縮，四肢血流受阻、劇痛，嚴重時壞疽甚至肢體壞死。中世紀的人給它取了個名字，叫「聖安東尼之火」。',
      side: 'p', w: 3,
      r: '一個四肢血流被切斷、腳正在壞死的人，沒辦法連續好幾天做出協調的舞蹈動作。而且不會有幾百個人對同一種精神作用物質，產生一模一樣的反應。這是 Waller 反駁麥角說的核心。'
    },
    {
      t: '沿著河，不是沿著田',
      src: 'John Waller, The Lancet, 2009',
      b: '這不是唯一一次。光是中世紀，同一片區域就有另外七次類似的爆發——而且幾乎每一次都發生在萊茵河與莫塞爾河沿岸。這些地方靠水路彼此相連，但氣候與作物並不相同。',
      side: 'p', w: 3,
      r: '黴菌跟著作物與濕度走，不會挑著河道走。沿河傳播的是船、是人、是故事與信仰。這個地理分布的形狀，比較像一種在人與人之間傳染的東西，而不是長在麥子上的東西。'
    },
    {
      t: '聖維特的詛咒',
      src: 'Lynneth Miller, Dance Research 35(2), 2017',
      b: '當地人相信聖維特會用一種很特定的方式懲罰罪人：讓你跳舞，而且停不下來。這個信仰的分布，也正好集中在萊茵河沿線。當跳舞的人越來越多，有些人是主動加入的——為了洗清罪、為了不被聖人記恨。',
      side: 'p', w: 3,
      r: '這是集體心因說裡最關鍵的一塊：文化腳本。一個社會要爆發集體心因性疾病，通常需要一套現成的劇本，告訴人們「發作起來會是什麼樣子」。史特拉斯堡剛好有一套，而且人人都熟。'
    },
    {
      t: '1517 年那個冬天',
      src: '阿爾薩斯地區編年史；Waller, 2008',
      b: '事發之前，這裡剛經歷連年歉收、一個世代以來最高的穀價、大規模的營養不良。梅毒剛剛登陸歐洲，痲瘋與鼠疫又捲土重來。',
      side: 'p', w: 2,
      r: '這是集體心因性疾病的標準土壤：長期、無處可逃、看不到盡頭的壓力。Waller 認為那不只是「焦慮」，而是足以把人推進恍惚狀態的極端心理壓力。'
    },
    {
      t: '一天死十五人？',
      src: 'Élisabeth Clementz, Revue d’Alsace 142, 2016',
      b: '最常被引用的細節，是高峰期一天死十五人。但這個數字出自事發之後才寫成的記述。史特拉斯堡當年留下的市政文書完全沒有提到死亡人數，甚至沒有說到底有沒有人死。',
      side: 'u', w: 0,
      r: '最有名的那個數字，很可能是後世加上去的。這不是哪一方勝出的問題，而是提醒你：這樁案子最戲劇化的部分，往往就是史料最薄的部分。'
    },
    {
      t: '第一個跳舞的人',
      src: '六份編年史的比對',
      b: '六份編年史裡，有四份說第一個人是特羅菲亞夫人（Frau Troffea），另外兩份只寫「一個女人」。至於總人數的估計，從五十人到四百人都有。',
      side: 'u', w: 0,
      r: '連最基本的兩件事——誰先開始、總共幾個人——都沒有共識。任何一種解釋，都是蓋在這樣的地基上。'
    },
    {
      t: '他們最後是怎麼停下來的',
      src: '當時的紀錄；The Public Domain Review',
      b: '官方的舞台策略失敗之後，議會掉頭禁止公開跳舞與音樂，並把剩下的人送往薩韋爾納的聖維特聖龕。神父把聖物按進他們掌心，替他們穿上灑過聖水、鞋面與鞋底都畫著十字的紅鞋，念拉丁禱詞、焚香。然後消息傳開了：他們已被聖維特赦免。',
      side: 'p', w: 3,
      r: '一個被儀式終結的病，通常也是被信念發動的病。當「聖維特已經原諒你們」這句話傳開，那套讓人發作的腳本就被撤掉了——這正是集體心因性疾病典型的收場方式：不是被治好，是被說服結束。'
    }
  ];

  var LABEL = { e: '麥角中毒', p: '集體心因', u: '不能斷案' };
  var TOTAL = EVIDENCE.length;

  var scoreE = 0, scoreP = 0, filed = 0, correct = 0;

  var cardsEl = $('#cards');
  var beamEl = $('#beam');
  var panLEl = $('#panL');
  var panREl = $('#panR');
  var valE = $('#valE');
  var valP = $('#valP');
  var scaleStatus = $('#scaleStatus');
  var progFill = $('#progFill');
  var progTxt = $('#progTxt');
  var scoreTxt = $('#scoreTxt');

  function updateScale() {
    valE.textContent = String(scoreE);
    valP.textContent = String(scoreP);

    var span = Math.max(6, scoreE + scoreP);
    var ang = ((scoreP - scoreE) / span) * 15;
    beamEl.style.transform = 'rotate(' + ang.toFixed(2) + 'deg)';
    panLEl.style.transform = 'rotate(' + (-ang).toFixed(2) + 'deg)';
    panREl.style.transform = 'rotate(' + (-ang).toFixed(2) + 'deg)';

    progFill.style.width = (filed / TOTAL * 100) + '%';
    progTxt.textContent = filed + ' / ' + TOTAL;
    scoreTxt.textContent = filed ? '　·　判對 ' + correct + ' 件' : '';

    if (!filed) {
      scaleStatus.textContent = '尚未歸檔任何證物。';
    } else if (scoreE === scoreP) {
      scaleStatus.textContent = '目前兩邊持平。';
    } else if (scoreP > scoreE) {
      scaleStatus.textContent = '天平正倒向「集體心因」（' + scoreP + ' 比 ' + scoreE + '）。';
    } else {
      scaleStatus.textContent = '天平正倒向「麥角中毒」（' + scoreE + ' 比 ' + scoreP + '）。';
    }
  }

  function fileCard(idx, pick, cardEl, choicesEl) {
    var ev = EVIDENCE[idx];
    if (cardEl.classList.contains('filed')) { return; }

    if (ev.side === 'e') { scoreE += ev.w; }
    else if (ev.side === 'p') { scoreP += ev.w; }
    filed++;
    var hit = (pick === ev.side);
    if (hit) { correct++; }

    cardEl.classList.add('filed', 'filed-' + ev.side);
    choicesEl.remove();

    var box = document.createElement('div');
    box.className = 'ruling';

    var tag = document.createElement('span');
    tag.className = 'ruling-tag tag-' + ev.side;
    tag.textContent = ev.side === 'u' ? '這件不能斷案' : '這件壓向「' + LABEL[ev.side] + '」';
    box.appendChild(tag);

    var p = document.createElement('p');
    p.textContent = ev.r;
    box.appendChild(p);

    var hitEl = document.createElement('span');
    hitEl.className = 'ruling-hit' + (hit ? ' yes' : '');
    hitEl.textContent = hit
      ? '✓ 你判對了。'
      : '你判的是「' + LABEL[pick] + '」。';
    box.appendChild(hitEl);

    cardEl.appendChild(box);
    updateScale();

    if (filed === TOTAL) { showVerdict(); }
  }

  function buildCards() {
    var frag = document.createDocumentFragment();
    EVIDENCE.forEach(function (ev, i) {
      var card = document.createElement('article');
      card.className = 'card';

      var no = document.createElement('p');
      no.className = 'card-no';
      no.textContent = '證物 ' + (i + 1);
      card.appendChild(no);

      var h = document.createElement('h3');
      h.textContent = ev.t;
      card.appendChild(h);

      var s = document.createElement('p');
      s.className = 'card-src';
      s.textContent = ev.src;
      card.appendChild(s);

      var b = document.createElement('p');
      b.className = 'card-body';
      b.textContent = ev.b;
      card.appendChild(b);

      var ch = document.createElement('div');
      ch.className = 'choices';
      ch.setAttribute('role', 'group');
      ch.setAttribute('aria-label', '證物 ' + (i + 1) + '：這條把天平壓向哪一邊？');

      ['e', 'p', 'u'].forEach(function (k) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choice';
        btn.dataset.k = k;
        btn.textContent = k === 'u' ? '不能斷案' : '壓向' + LABEL[k];
        btn.setAttribute('aria-label',
          '把證物 ' + (i + 1) + ' 判為' + (k === 'u' ? '不能斷案' : '支持' + LABEL[k]));
        btn.addEventListener('click', function () { fileCard(i, k, card, ch); });
        ch.appendChild(btn);
      });

      card.appendChild(ch);
      frag.appendChild(card);
    });
    cardsEl.appendChild(frag);
  }

  /* ══════════════════════════════════════════════════════
     五、結案
     ══════════════════════════════════════════════════════ */

  function readNum(key) {
    try {
      var v = parseInt(localStorage.getItem(LS + key), 10);
      return isNaN(v) ? 0 : v;
    } catch (err) { return 0; }
  }
  function writeNum(key, v) {
    try { localStorage.setItem(LS + key, String(v)); } catch (err) { /* 無痕模式等 */ }
  }

  function showVerdict() {
    var best = readNum('best');
    var plays = readNum('plays') + 1;
    writeNum('plays', plays);
    if (correct > best) { writeNum('best', correct); }

    var sec = $('#act3');
    var v = $('#verdict');
    v.textContent = '';

    var head = document.createElement('p');
    head.className = 'v-score';
    head.textContent = '十件證物，你判對了 ' + correct + ' 件。';
    v.appendChild(head);

    var lines = [
      '你手上的天平最後停在 ' + scoreP + ' 比 ' + scoreE + '，倒向「集體心因」。這也是今天史學界比較主流的看法：Waller 認為 1518 年的史特拉斯堡是一場集體心因性疾病——症狀完全是真的，但引信是極端壓力，加上一套現成的文化腳本。',
      '不過「主流」不等於「定案」。麥角說沒有被推翻，只是解釋力比較差；而那兩件標成「不能斷案」的證物提醒你，這樁案子的地基比它的名氣薄得多——死了多少人、有幾個人在跳、誰先開始，都沒有共識。'
    ];
    if (plays > 1) {
      lines.push('（這是你第 ' + plays + ' 次翻這份卷宗，最佳成績 ' +
        Math.max(best, correct) + ' / ' + TOTAL + '。）');
    }
    lines.forEach(function (txt) {
      var p = document.createElement('p');
      p.textContent = txt;
      v.appendChild(p);
    });

    var kick = document.createElement('p');
    kick.className = 'v-kick';
    kick.textContent = '這件事最令人不安的地方，或許不是那幾百個停不下來的人，' +
      '而是掌權的人看著他們，認真研究之後，決定蓋一座舞台。';
    v.appendChild(kick);

    var again = document.createElement('div');
    again.className = 'v-again';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = '重新翻一次卷宗';
    btn.addEventListener('click', resetCase);
    again.appendChild(btn);
    v.appendChild(again);

    sec.hidden = false;
    if (!calm) {
      requestAnimationFrame(function () {
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function resetCase() {
    scoreE = 0; scoreP = 0; filed = 0; correct = 0;
    cardsEl.textContent = '';
    $('#act3').hidden = true;
    $('#verdict').textContent = '';
    buildCards();
    updateScale();
    $('#act2').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  }

  /* ══════════════════════════════════════════════════════
     啟動
     ══════════════════════════════════════════════════════ */

  buildCards();
  updateScale();
  syncPlayLabel();
  resize();
  setDay(0);
  schedule();
  if (calm) { drawStreet(); }

  // 上次成績（低調提示，不干擾）
  (function hint() {
    var best = readNum('best');
    if (best > 0) {
      scoreTxt.textContent = '　·　上次最佳 ' + best + ' / ' + TOTAL;
    }
  })();

})();

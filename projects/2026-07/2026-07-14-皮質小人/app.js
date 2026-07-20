/* 皮質小人 — 電刺激手術檯 × homunculus × 經典病例
   純靜態、零依賴、離線可用。localStorage 前綴：cortex. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let REDUCE = mq.matches;
  mq.addEventListener('change', e => { REDUCE = e.matches; });

  const LS = 'cortex.visited';
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch (e) { return []; } };
  const save = v => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) { /* 忽略 */ } };
  let visited = load();

  /* ═══ 腦區 ═══ */
  const REGIONS = [
    {
      id: 'frontal', name: '前額葉', sub: 'prefrontal cortex', color: '#b39dff',
      pts: '112,232 152,116 250,84 292,152 272,272 152,300', lx: 160, ly: 200,
      quote: '……沒有。什麼感覺都沒有。你確定電極開著嗎？',
      tag: '沉默皮質',
      obs: '前額葉大部分區域<b>刺激起來什麼都不會發生</b>——沒有動作、沒有感覺。十九世紀的醫師因此叫它「沉默皮質」，以為它沒什麼用。' +
        '直到 Phineas Gage 的鐵棒穿過這裡，人們才發現：它管的是<b>計畫、抑制衝動、把「我想做」和「我該做」接起來</b>——這些東西，用電極戳一下是看不出來的。'
    },
    {
      id: 'motor', name: '運動皮質（中央前回）', sub: 'primary motor cortex, M1', color: '#ff8fa3',
      pts: '292,84 332,78 306,262 266,256', lx: 288, ly: 130,
      quote: '（右手食指自己彈了一下）欸——那不是我做的。是你讓它動的。',
      tag: '運動',
      obs: '刺激這條帶子，對側身體的肌肉會<b>不由自主地抽動</b>，而病人清楚知道「那不是我」。' +
        '沿著這條帶子往上走是腳、往下走是臉——身體被<b>從腳到嘴，依序排在一條線上</b>。這就是運動小人。'
    },
    {
      id: 'somato', name: '體感皮質（中央後回）', sub: 'primary somatosensory cortex, S1', color: '#7fd4ff',
      pts: '332,78 374,80 348,264 306,262', lx: 344, ly: 140,
      quote: '我的左手拇指……有一種麻麻的、像通電的感覺。但你沒有碰到我的手啊？',
      tag: '感覺',
      obs: '這裡是身體感覺的地圖。刺激它，病人會感覺到<b>身上某個部位被碰到</b>——即使那個部位根本沒被碰。' +
        '地盤分配極度不公平：<b>一根手指占的皮質，比整個背還多</b>。這就是感覺小人為什麼手那麼大。'
    },
    {
      id: 'parietal', name: '頂葉', sub: 'parietal lobe', color: '#7fe0b8',
      pts: '374,80 470,98 482,196 382,232 350,198', lx: 412, ly: 156,
      quote: '很奇怪……我知道我的左手在那裡，可是我感覺不到它是「我的」。',
      tag: '空間與身體感',
      obs: '頂葉把感覺拼成「空間」與「身體所有權」。這裡受損的人可能<b>否認自己的左手是自己的</b>（身體失認），' +
        '或是<b>完全忽略左半邊的世界</b>——盤子左邊的菜沒吃、臉只刮右半邊，而且堅信自己什麼都做完了。'
    },
    {
      id: 'occipital', name: '枕葉（初級視覺）', sub: 'occipital lobe, V1', color: '#ffc861',
      pts: '470,98 542,132 556,240 490,256 478,182', lx: 496, ly: 186,
      quote: '有光！左邊有一顆星星在閃……不是眼睛看到的，是「出現在那裡」。',
      tag: '視覺',
      obs: '刺激視覺皮質會產生<b>光幻視（phosphene）</b>：一顆光點或色斑，出現在對側視野的固定位置。' +
        '這是視覺義肢的原理起點——如果眼睛壞了，直接對這裡放電，理論上還是能「看到」東西。'
    },
    {
      id: 'temporal', name: '顳葉', sub: 'temporal lobe', color: '#ffa06b',
      pts: '232,292 330,276 432,286 442,332 300,342 222,322', lx: 320, ly: 316,
      quote: '我聽到音樂……有人在唱歌。是我小時候的那首歌。不是回想，是<b>正在放</b>。',
      tag: '經驗性反應',
      obs: 'Penfield 最著名的發現：刺激顳葉，少數病人會<b>突然重新經歷一段往事</b>——聽見多年前的音樂、看見一個房間、聞到某種味道，' +
        '而且伴隨「這正在發生」的臨場感。他稱之為<b>經驗性反應（experiential response）</b>，並認為腦裡存著經驗的紀錄；' +
        '這個詮釋至今仍有爭議，但這些回報本身是真的，記錄在 1963 年的論文裡。'
    },
    {
      id: 'a1', name: '初級聽覺皮質', sub: 'primary auditory cortex, A1', color: '#9fe0ff',
      pts: '332,278 392,281 394,302 334,301', lx: 340, ly: 296,
      quote: '嗡——一個聲音。不是有意義的聲音，就是……一個嗡嗡聲。',
      tag: '聽覺',
      obs: '刺激 A1 得到的是<b>單純的聲音</b>：嗡鳴、鈴響、噪音，沒有內容。要聽到「音樂」和「話語」，得往更外圍的顳葉走。' +
        '感覺越原始的皮質，刺激出來的東西越沒有意義；越高階，越像「經驗」。'
    },
    {
      id: 'broca', name: '布洛卡區', sub: "Broca's area", color: '#ff6b8a',
      pts: '236,266 282,258 288,292 240,296', lx: 232, ly: 286,
      quote: '（張著嘴，說不出話。電極一拿開）……我剛剛想說「桌子」，可是嘴巴不聽我的。',
      tag: '語言產生',
      obs: '刺激這裡會造成<b>語言中斷（speech arrest）</b>：病人知道自己要說什麼，就是發不出來。' +
        '外科醫師至今仍靠這一招——在切除腫瘤前，先用電極確認<b>哪裡不能碰</b>，病人得清醒著一直說話。'
    },
    {
      id: 'wernicke', name: '韋尼克區', sub: "Wernicke's area", color: '#c9a0ff',
      pts: '402,256 456,250 462,290 406,294', lx: 404, ly: 284,
      quote: '（流暢地）當然，我當然可以，那個東西就是那個，你把它拿去那個地方——（一句話都不成立）',
      tag: '語言理解',
      obs: '這裡受損的人<b>說話很流暢、語調正常，但內容是空的</b>，而且往往<b>不知道自己在胡說</b>。' +
        '布洛卡失語的人知道自己說不出來、很挫折；韋尼克失語的人不知道——這是兩種完全不同的破碎。'
    },
    {
      id: 'cerebellum', name: '小腦', sub: 'cerebellum', color: '#d3b5cf', sub2: true,
      pts: '', lx: 0, ly: 0,
      quote: '（伸手去拿杯子，手在半路開始抖，最後撞倒了它）我明明看準了啊。',
      tag: '協調',
      obs: '小腦只占大腦體積的 10%，卻裝了<b>全腦超過一半的神經元</b>（主要是密密麻麻的顆粒細胞）。' +
        '它不下命令，它做<b>校正</b>：預測你的動作會落在哪、和實際落點比對、然後修正。壞掉的人不會癱瘓，只會——每一個動作都「差一點」。'
    },
    {
      id: 'brainstem', name: '腦幹', sub: 'brainstem', color: '#c9c1a6', sub2: true,
      pts: '', lx: 0, ly: 0,
      quote: '（沒有回答。這裡不能亂碰。）',
      tag: '生命中樞',
      obs: '呼吸、心跳、血壓、清醒——全部在這裡。前面那些區域壞掉，你會失去某種能力；<b>這裡壞掉，你會失去命。</b>' +
        '所以在手術檯上，這是唯一一個沒有人會拿電極去「試試看」的地方。'
    }
  ];

  /* ═══ 皮質小人資料（相對皮質面積，示意） ═══ */
  const PARTS = [
    { id: 'hand', name: '手與手指', s: 100, m: 100 },
    { id: 'lips', name: '嘴唇與舌', s: 92, m: 88 },
    { id: 'face', name: '臉', s: 60, m: 58 },
    { id: 'eye', name: '眼', s: 30, m: 20 },
    { id: 'foot', name: '腳與腳趾', s: 22, m: 20 },
    { id: 'arm', name: '手臂', s: 20, m: 22 },
    { id: 'leg', name: '腿', s: 16, m: 18 },
    { id: 'trunk', name: '軀幹', s: 14, m: 15 },
    { id: 'neck', name: '頸', s: 8, m: 9 }
  ];
  const STRIP_ORDER = ['lips', 'face', 'eye', 'hand', 'arm', 'trunk', 'leg', 'foot'];
  let mode = 's';

  /* ═══ 病例 ═══ */
  const CASES = [
    {
      name: 'Phineas Gage', yr: '1848 · 佛蒙特州',
      teaser: '一根 1.1 公尺的鐵棒穿過他的左額葉。他當場站起來，自己走上牛車。',
      back: `<p>1848 年 9 月 13 日，鐵路工頭 Gage 用鐵棒夯火藥時發生爆炸，一根<strong>約 13.5 磅、3 呎 7 吋（約 1.1 公尺）</strong>的鐵棒
             從左臉頰下方射入、頭頂穿出，摧毀了大部分左額葉。他<strong>沒有昏迷</strong>，還能說話，被送到旅館時自己走下車，對醫生說：「醫生，這裡有件事要麻煩你了。」</p>
             <p>教科書愛講的版本是：他從此「性情大變、判若兩人」，成了額葉功能的鐵證。<strong>但這個故事被嚴重誇大了。</strong>
             心理學史家 Macmillan 追查後發現，「他不再是 Gage」幾乎全部來自二手轉述；而 Gage 後來到<strong>智利當驛馬車車夫</strong>——
             那是一份需要規劃、應變與社交的工作。他很可能<strong>恢復了相當程度</strong>。</p>
             <p class="src">Macmillan, M. (2000). An Odd Kind of Fame.</p>`
    },
    {
      name: 'H.M.（Henry Molaison）', yr: '1953 · 哈特福',
      teaser: '為了治癲癇，他被切掉雙側內側顳葉。癲癇好了——但他從此活在 30 秒的現在裡。',
      back: `<p>1953 年，外科醫師 Scoville 為 27 歲的 Molaison 切除<strong>雙側內側顳葉</strong>（含海馬迴前三分之二）。癲癇確實改善了，
             代價是：他<strong>再也無法形成新的長期記憶</strong>。此後五十年，他每天都要重新認識研究他一輩子的心理學家 Brenda Milner。</p>
             <p>但真正改寫教科書的是這件事：Milner 讓他做<strong>鏡像描圖</strong>（看著鏡子畫星星），他一天比一天畫得好——
             <strong>技能明明學會了</strong>，可是每一次他都堅稱自己從沒做過這個測驗。<br>
             結論：<strong>記憶不是一個東西。</strong>「知道那件事」（陳述性記憶）和「會做那件事」（程序性記憶）是兩套系統，走不同的路。</p>
             <p>他 2008 年過世，享年 82 歲。大腦被切成 <strong>2,401 片</strong>、逐片數位化，公開給全世界的研究者。</p>
             <p class="src">Scoville &amp; Milner (1957), JNNP 20(1), 11–21.</p>`
    },
    {
      name: '「Tan」（Louis Victor Leborgne）', yr: '1861 · 巴黎',
      teaser: '他聽得懂每一句話，但無論想說什麼，出口都只有一個音節：Tan。',
      back: `<p>Leborgne 住院多年，人們只叫他「Tan」——因為那是他唯一能發出的音節。他<strong>聽力正常、智力正常、聽得懂別人說話</strong>，
             也能用手勢溝通，就是<strong>說不出來</strong>。</p>
             <p>他死後，外科醫師 Paul Broca 解剖他的大腦，在<strong>左額下回</strong>發現一塊病灶。這是人類第一次拿到「某個心智功能住在某個腦區」的
             具體證據——<strong>大腦不是一團均質的果凍</strong>。那塊區域從此叫做布洛卡區。</p>
             <p>後話：2007 年有人用 MRI 重新掃描保存至今的 Leborgne 大腦，發現損傷其實<strong>比 Broca 當年看到的更深、更廣</strong>。經典故事，細節仍在修訂中。</p>
             <p class="src">Broca, P. (1861); Dronkers et al. (2007), Brain 130(5), 1432–1441.</p>`
    },
    {
      name: '裂腦病人', yr: '1960s · 加州理工',
      teaser: '左手畫出了答案。嘴巴卻說：我不知道。然後嘴巴開始替左手編理由。',
      back: `<p>為了治療嚴重癲癇，外科醫師切斷了連接兩個半球的<strong>胼胝體</strong>。病人日常看起來完全正常——直到 Sperry 與 Gazzaniga
             把訊息<strong>只送給其中一個半球</strong>。</p>
             <p>把一個字只閃給<strong>右腦</strong>（左視野）：病人的<strong>左手</strong>可以正確畫出那個東西，但<strong>嘴巴（左腦負責說話）</strong>堅稱
             「我什麼都沒看到」。最詭異的是接下來：當左腦看到左手畫了一隻雞爪，它<strong>當場編出一個理由</strong>——「因為要清理雞舍啊。」</p>
             <p>Gazzaniga 把左腦這個功能叫做<strong>「解釋者」（the interpreter）</strong>：它不斷替你的行為編出一個說得通的故事，
             即使它<strong>根本不知道真正的原因</strong>。你以為你知道自己為什麼那樣做——你只是有一個很會編故事的左腦。</p>
             <p class="src">Sperry（1981 年諾貝爾生理醫學獎）；Gazzaniga (2005), Nat. Rev. Neurosci. 6, 653–659.</p>`
    }
  ];

  /* ═══ 大腦渲染 ═══ */
  const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  function renderBrain() {
    const gr = $('regions'), gs = $('sulci'), sub = $('subRegions');
    gr.innerHTML = ''; gs.innerHTML = ''; sub.innerHTML = '';

    // 腦回紋路（裝飾）
    ['M140 150 C190 130 230 150 260 130', 'M150 200 C210 180 250 210 300 190',
      'M160 260 C220 240 260 268 320 250', 'M380 120 C420 140 470 130 510 155',
      'M400 190 C450 210 490 195 530 215', 'M250 300 C300 285 350 305 410 295'
    ].forEach(d => gs.appendChild(el('path', { class: 'sulcus', d })));

    REGIONS.filter(r => !r.sub2).forEach(r => {
      const p = el('polygon', {
        class: 'reg' + (visited.includes(r.id) ? ' visited' : ''),
        points: r.pts, fill: r.color, tabindex: '0', role: 'button',
        'aria-label': '刺激' + r.name, 'data-id': r.id
      });
      p.addEventListener('click', () => stim(r.id));
      p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stim(r.id); } });
      gr.appendChild(p);
      const t = el('text', { class: 'reg-label', x: r.lx, y: r.ly });
      t.textContent = r.name.replace(/（.*/, '');
      gr.appendChild(t);
    });

    // 小腦、腦幹（在 clip 之外，直接掛可點區）
    [['cerebellum', '#cbPath', 505, 345], ['brainstem', '#bsPath', 372, 390]].forEach(([id, href, lx, ly]) => {
      const u = el('use', { href, class: 'reg', tabindex: '0', role: 'button', 'aria-label': '刺激' + REGIONS.find(r => r.id === id).name, 'data-id': id, fill: 'transparent' });
      u.addEventListener('click', () => stim(id));
      u.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stim(id); } });
      $('subRegions').appendChild(u);
      const t = el('text', { class: 'reg-label', x: lx, y: ly, 'text-anchor': 'middle' });
      t.textContent = REGIONS.find(r => r.id === id).name;
      $('subRegions').appendChild(t);
    });

    $('visited').textContent = `已刺激 ${visited.length} / ${REGIONS.length} 區`;
  }

  let typing = null;
  function stim(id) {
    const r = REGIONS.find(x => x.id === id);
    document.querySelectorAll('.reg').forEach(n => n.classList.toggle('on', n.dataset.id === id));

    // 電極火花
    const node = document.querySelector(`.reg[data-id="${id}"]`);
    if (node && !REDUCE) {
      const bb = node.getBBox ? node.getBBox() : null;
      if (bb) {
        const ring = el('circle', { class: 'zap-ring go', cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2, r: 4 });
        $('subRegions').appendChild(ring);
        setTimeout(() => ring.remove(), 900);
      }
    }

    if (!visited.includes(id)) { visited.push(id); save(visited); }
    $('visited').textContent = `已刺激 ${visited.length} / ${REGIONS.length} 區`;

    const body = $('opBody');
    body.innerHTML =
      `<div><span class="tag">${r.tag}</span><h3>${r.name}</h3><p class="sub">${r.sub}</p></div>
       <blockquote class="quote" id="q"></blockquote>
       <p class="obs">${r.obs}</p>`;

    // 打字機
    const q = $('q'), full = r.quote;
    if (typing) cancelAnimationFrame(typing);
    if (REDUCE) { q.innerHTML = full; return; }
    let i = 0, t0 = performance.now();
    q.classList.add('type');
    const step = now => {
      if (document.hidden) { typing = requestAnimationFrame(step); return; }
      const target = Math.min(full.length, Math.floor((now - t0) / 26));
      if (target > i) { i = target; q.innerHTML = full.slice(0, i); }
      if (i < full.length) typing = requestAnimationFrame(step);
      else { q.classList.remove('type'); typing = null; }
    };
    typing = requestAnimationFrame(step);
  }

  $('clearLog').addEventListener('click', () => {
    try { localStorage.removeItem(LS); } catch (e) { /* 忽略 */ }
    visited = [];
    document.querySelectorAll('.reg').forEach(n => n.classList.remove('on', 'visited'));
    $('visited').textContent = `已刺激 0 / ${REGIONS.length} 區`;
    $('opBody').innerHTML = '<p class="idle">病人清醒著，正看著天花板。<br><strong>點大腦上的任何一個區域，把電極放上去。</strong></p>';
  });

  /* ═══ 皮質小人 ═══ */
  function val(p) { return mode === 's' ? p.s : p.m; }

  function renderHom() {
    const get = id => val(PARTS.find(p => p.id === id)) / 100;
    const k = {
      hand: 0.5 + get('hand') * 1.1, lips: 0.4 + get('lips') * 1.3, face: 0.55 + get('face') * 0.8,
      eye: 0.4 + get('eye') * 1.0, foot: 0.5 + get('foot') * 1.1, arm: 0.5 + get('arm') * 1.0,
      leg: 0.5 + get('leg') * 1.0, trunk: 0.6 + get('trunk') * 1.2, neck: 0.6 + get('neck') * 1.0
    };
    const P = (id, shape) => `<g class="hp" data-part="${id}">${shape}</g>`;
    $('homun').innerHTML = `
      <g class="hpart" opacity=".0"></g>
      ${P('leg', `<rect class="hpart" x="${170 - 9 * k.leg}" y="300" width="${7 * k.leg}" height="${44 * k.leg}" rx="3"/>
                  <rect class="hpart" x="${170 + 2 * k.leg}" y="300" width="${7 * k.leg}" height="${44 * k.leg}" rx="3"/>`)}
      ${P('foot', `<ellipse class="hpart" cx="${170 - 6 * k.leg}" cy="${300 + 46 * k.leg}" rx="${16 * k.foot}" ry="${8 * k.foot}"/>
                   <ellipse class="hpart" cx="${170 + 6 * k.leg}" cy="${300 + 46 * k.leg}" rx="${16 * k.foot}" ry="${8 * k.foot}"/>`)}
      ${P('trunk', `<rect class="hpart" x="${170 - 17 * k.trunk}" y="228" width="${34 * k.trunk}" height="${74 * k.trunk}" rx="10"/>`)}
      ${P('arm', `<rect class="hpart" x="${170 - 17 * k.trunk - 46 * k.arm}" y="238" width="${48 * k.arm}" height="${9 * k.arm}" rx="4"/>
                  <rect class="hpart" x="${170 + 17 * k.trunk - 2}" y="238" width="${48 * k.arm}" height="${9 * k.arm}" rx="4"/>`)}
      ${P('hand', `<circle class="hpart" cx="${170 - 17 * k.trunk - 46 * k.arm - 22 * k.hand}" cy="${243}" r="${26 * k.hand}"/>
                   <circle class="hpart" cx="${170 + 17 * k.trunk + 46 * k.arm + 22 * k.hand}" cy="${243}" r="${26 * k.hand}"/>
                   ${[-1, 1].map(sgn => [0, 1, 2, 3].map(i =>
        `<rect class="hpart" x="${170 + sgn * (17 * k.trunk + 46 * k.arm + 22 * k.hand) - 3}" y="${243 - 26 * k.hand - 16 * k.hand + i * 0}"
                width="6" height="${18 * k.hand}" rx="3" transform="rotate(${(i - 1.5) * 16} ${170 + sgn * (17 * k.trunk + 46 * k.arm + 22 * k.hand)} ${243})"/>`).join('')).join('')}`)}
      ${P('neck', `<rect class="hpart" x="${170 - 7 * k.neck}" y="212" width="${14 * k.neck}" height="20" rx="4"/>`)}
      ${P('face', `<circle class="hpart" cx="170" cy="${170 - 20 * k.face}" r="${40 * k.face}"/>`)}
      ${P('eye', `<circle class="hpart" cx="${170 - 16 * k.face}" cy="${162 - 24 * k.face}" r="${5 * k.eye + 2}"/>
                  <circle class="hpart" cx="${170 + 16 * k.face}" cy="${162 - 24 * k.face}" r="${5 * k.eye + 2}"/>`)}
      ${P('lips', `<ellipse class="hpart" cx="170" cy="${170 - 20 * k.face + 30 * k.face}" rx="${30 * k.lips}" ry="${14 * k.lips}"/>`)}
      <text x="170" y="410" text-anchor="middle" class="strip-t">${mode === 's' ? '感覺小人（中央後回）' : '運動小人（中央前回）'}・示意</text>`;

    // 條狀圖
    $('bars').innerHTML = PARTS.slice().sort((a, b) => val(b) - val(a)).map(p =>
      `<li tabindex="0" data-part="${p.id}" aria-label="${p.name}，相對皮質面積 ${val(p)}">
         <span>${p.name}</span>
         <span class="track"><i style="width:${val(p)}%"></i></span>
         <span class="v">${val(p)}</span>
       </li>`).join('');

    // 皮質帶
    const total = STRIP_ORDER.reduce((s, id) => s + val(PARTS.find(p => p.id === id)), 0);
    let x = 6; const W = 328;
    let out = `<text x="6" y="10" class="strip-t">外側（臉、舌）</text>
               <text x="334" y="10" text-anchor="end" class="strip-t">內側（腳趾）→ 跨過中線</text>`;
    STRIP_ORDER.forEach(id => {
      const p = PARTS.find(q => q.id === id);
      const w = val(p) / total * W;
      out += `<rect class="strip-seg" data-part="${id}" x="${x.toFixed(1)}" y="18" width="${Math.max(2, w - 1).toFixed(1)}" height="34"
                    fill="${['#ff8fa3', '#ffa06b', '#ffc861', '#7fd4ff', '#9fe0ff', '#7fe0b8', '#b39dff', '#c9a0ff'][STRIP_ORDER.indexOf(id)]}" rx="3"/>
              ${w > 26 ? `<text class="strip-t" x="${(x + w / 2).toFixed(1)}" y="70" text-anchor="middle">${p.name.slice(0, 2)}</text>` : ''}`;
      x += w;
    });
    out += `<text x="170" y="86" text-anchor="middle" class="strip-t">中央溝上的排列順序與寬度（寬＝皮質地盤大）</text>`;
    $('strip').innerHTML = out;

    wireHot();
  }

  function wireHot() {
    const setHot = (id, on) => {
      document.querySelectorAll('[data-part]').forEach(n => {
        if (n.dataset.part !== id) return;
        if (n.classList.contains('hp')) n.querySelectorAll('.hpart').forEach(s => s.classList.toggle('hot', on));
        else n.classList.toggle('hot', on);
      });
    };
    document.querySelectorAll('#bars li, .strip-seg').forEach(n => {
      const id = n.dataset.part;
      ['mouseenter', 'focus'].forEach(ev => n.addEventListener(ev, () => setHot(id, true)));
      ['mouseleave', 'blur'].forEach(ev => n.addEventListener(ev, () => setHot(id, false)));
    });
  }

  $('segS').addEventListener('click', () => { mode = 's'; $('segS').classList.add('on'); $('segM').classList.remove('on'); renderHom(); });
  $('segM').addEventListener('click', () => { mode = 'm'; $('segM').classList.add('on'); $('segS').classList.remove('on'); renderHom(); });

  /* ═══ 病例卡 ═══ */
  function renderCases() {
    $('cases').innerHTML = CASES.map((c, i) => `
      <button class="case" type="button" data-i="${i}" aria-label="${c.name}，點擊翻開">
        <div class="inner">
          <div class="face front">
            <span class="yr">${c.yr}</span>
            <h3>${c.name}</h3>
            <p class="teaser">${c.teaser}</p>
            <span class="flip-hint">點一下翻開 →</span>
          </div>
          <div class="face back">${c.back}</div>
        </div>
      </button>`).join('');
    document.querySelectorAll('.case').forEach(c =>
      c.addEventListener('click', () => c.classList.toggle('flip')));
  }

  /* ═══ 分頁 ═══ */
  const TABS = [['tabBrain', 'viewBrain'], ['tabHom', 'viewHom'], ['tabCase', 'viewCase']];
  TABS.forEach(([tid, vid]) => {
    $(tid).addEventListener('click', () => {
      TABS.forEach(([t, v]) => {
        const on = t === tid;
        $(t).setAttribute('aria-selected', String(on));
        $(v).hidden = !on;
      });
    });
  });

  /* ═══ 啟動 ═══ */
  renderBrain();
  renderHom();
  renderCases();
})();

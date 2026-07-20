/* 時光錯位 · 2026-07-14
   把卡片插進時間軸的正確位置。年份皆經查證（見 說明.md）。
   localStorage 前綴：chrono.
*/
(() => {
  'use strict';

  // ── 卡片：year 為顯示與判定用的整數年（負數＝西元前），k 為精確排序鍵 ──
  const DECK = [
    { id: 'pyramid',  y: -2560, k: -2560, e: '🔺', n: '吉薩大金字塔完工',      t: '古夫王的陵墓，蓋了約 26 年。' },
    { id: 'mammoth',  y: -1650, k: -1650, e: '🦣', n: '最後的長毛象消失',      t: '弗蘭格爾島上的孤島族群。' },
    { id: 'cleo',     y: -30,   k: -30,   e: '👑', n: '克麗奧佩脫拉之死',      t: '托勒密王朝就此告終。' },
    { id: 'colos',    y: 80,    k: 80,    e: '🏟️', n: '羅馬競技場落成',        t: '啟用時舉行了百日競技。' },
    { id: 'oxford',   y: 1096,  k: 1096,  e: '🎓', n: '牛津大學開始授課',      t: '英語世界最古老的大學。' },
    { id: 'aztec',    y: 1325,  k: 1325,  e: '🏝️', n: '阿茲特克建立特諾奇提特蘭', t: '湖中之城，日後的墨西哥城。' },
    { id: 'press',    y: 1440,  k: 1440,  e: '🖨️', n: '古騰堡發明活字印刷',    t: '知識第一次可以大量複製。' },
    { id: 'harvard',  y: 1636,  k: 1636,  e: '🏛️', n: '哈佛學院創立',          t: '比微積分還早問世。' },
    { id: 'bastille', y: 1789,  k: 1789,  e: '🗝️', n: '巴士底獄陷落',          t: '法國大革命的第一天。' },
    { id: 'fax',      y: 1843,  k: 1843,  e: '📠', n: '傳真機取得專利',        t: '蘇格蘭人 Alexander Bain 的鐘擺裝置。' },
    { id: 'civilwar', y: 1861,  k: 1861,  e: '⚔️', n: '美國南北戰爭爆發',      t: '桑特堡的第一聲砲響。' },
    { id: 'nokia',    y: 1865,  k: 1865,  e: '📱', n: '諾基亞創立',            t: '當時它是一間木漿造紙廠。' },
    { id: 'phone',    y: 1876,  k: 1876,  e: '☎️', n: '貝爾取得電話專利',      t: '「華生先生，過來一下。」' },
    { id: 'coke',     y: 1886,  k: 1886,  e: '🥤', n: '可口可樂問世',          t: '起初在藥局當提神飲料賣。' },
    { id: 'eiffel',   y: 1889,  k: 1889.25, e: '🗼', n: '艾菲爾鐵塔落成',      t: '3 月 31 日，為萬國博覽會而建。' },
    { id: 'nintendo', y: 1889,  k: 1889.72, e: '🎴', n: '任天堂創立',          t: '山內房治郎在京都做花札紙牌。' },
    { id: 'wright',   y: 1903,  k: 1903,  e: '✈️', n: '萊特兄弟首次動力飛行',  t: '第一趟只飛了 12 秒。' },
    { id: 'titanic',  y: 1912,  k: 1912,  e: '🚢', n: '鐵達尼號沉沒',          t: '首航第四天撞上冰山。' },
    { id: 'pigeon',   y: 1914,  k: 1914,  e: '🕊️', n: '最後一隻旅鴿瑪莎死去',  t: '曾經多達數十億隻的鳥，滅絕於動物園。' },
    { id: 'suffrage', y: 1920,  k: 1920,  e: '🗳️', n: '美國女性取得投票權',    t: '憲法第十九修正案通過。' },
    { id: 'pluto',    y: 1930,  k: 1930,  e: '🪐', n: '冥王星被發現',          t: '24 歲的湯博在閃視比較儀前找到它。' },
    { id: 'emu',      y: 1932,  k: 1932,  e: '🦤', n: '澳洲「鴯鶓戰爭」',      t: '軍隊帶機槍去對付鴯鶓——然後輸了。' },
    { id: 'sputnik',  y: 1957,  k: 1957,  e: '🛰️', n: '史普尼克一號升空',      t: '人類第一顆人造衛星。' },
    { id: 'slavery',  y: 1962,  k: 1962,  e: '⛓️', n: '沙烏地阿拉伯正式廢奴',  t: '國王下令禁止人口買賣。' },
    { id: 'moon',     y: 1969,  k: 1969,  e: '🌕', n: '阿波羅 11 號登陸月球',  t: '「這是我個人的一小步。」' },
    { id: 'swiss',    y: 1971,  k: 1971.10, e: '🇨🇭', n: '瑞士女性取得聯邦投票權', t: '2 月公投通過；最後一州要等到 1990。' },
    { id: 'email',    y: 1971,  k: 1971.85, e: '✉️', n: '第一封 @ 電子郵件',    t: 'Tomlinson 選了鍵盤上沒人要的符號。' },
    { id: 'apple',    y: 1976,  k: 1976,  e: '🍎', n: '蘋果公司創立',          t: '車庫裡的 Apple I。' },
    { id: 'starwars', y: 1977,  k: 1977.40, e: '🌌', n: '《星際大戰》上映',     t: '5 月 25 日，只在 32 家戲院。' },
    { id: 'guillo',   y: 1977,  k: 1977.69, e: '🗡️', n: '法國最後一次斷頭台行刑', t: '9 月 10 日，馬賽的清晨四點四十分。' },
    { id: 'web',      y: 1991,  k: 1991,  e: '🌐', n: '世界第一個網站上線',    t: 'CERN 的 info.cern.ch。' },
    { id: 'google',   y: 1998,  k: 1998,  e: '🔍', n: 'Google 創立',           t: '從史丹佛的一個研究計畫開始。' },
    { id: 'youtube',  y: 2005,  k: 2005,  e: '📹', n: 'YouTube 第一支影片',    t: '19 秒，內容是動物園的大象。' },
    { id: 'demote',   y: 2006,  k: 2006,  e: '💔', n: '冥王星被降級為矮行星',  t: '國際天文聯合會投票除名。' },
    { id: 'iphone',   y: 2007,  k: 2007,  e: '📲', n: '初代 iPhone 發表',      t: '「一台 iPod、一支電話、一個上網裝置。」' },
    { id: 'vcr',      y: 2016,  k: 2016,  e: '📼', n: '世界最後一台錄影機出廠', t: '船井電機停產 VCR，錄影帶時代正式結束。' },
    { id: 'antikyth', y: -100, k: -100, ly: '約前 100', e: '⚙️', n: '安提基特拉機械',  t: '古希臘的齒輪「電腦」，能推算日月食。' },
    { id: 'vending',  y: 50,   k: 50,   ly: '約 50',    e: '⛲', n: '世界第一台自動販賣機', t: '亞歷山卓的希羅：投一枚幣，流出聖水。' },
    { id: 'kongo',    y: 578,  k: 578,  e: '🏯', n: '金剛組創立',              t: '蓋四天王寺的日本建築商，世界最老的公司。' },
    { id: 'vikings',  y: 1000, k: 1000, ly: '約 1000', e: '⛵', n: '維京人踏上北美',      t: '紐芬蘭的蘭塞奧茲牧草地。' },
    { id: 'magna',    y: 1215, k: 1215, e: '📜', n: '《大憲章》簽署',          t: '英王約翰在草地上蓋了印。' },
    { id: 'plague',   y: 1347, k: 1347, e: '🐀', n: '黑死病抵達歐洲',          t: '幾年內帶走三分之一的人口。' },
    { id: 'machu',    y: 1450, k: 1450, ly: '約 1450', e: '🏔️', n: '印加人蓋起馬丘比丘',  t: '兩千四百公尺高的雲端石城。' },
    { id: 'columbus', y: 1492, k: 1492, e: '🧭', n: '哥倫布抵達美洲',          t: '他到死都以為那是印度。' },
    { id: 'goldi',    y: 1782, k: 1782, e: '🔥', n: '歐洲最後一名「女巫」被處決', t: '瑞士的安娜·戈爾迪，2008 年才獲平反。' },
    { id: 'megalo',   y: 1824, k: 1824, e: '🦕', n: '第一隻恐龍被命名',        t: '巨齒龍——那時「恐龍」這個詞還沒發明。' },
    { id: 'photo',    y: 1826, k: 1826, e: '📷', n: '世界第一張照片',          t: '曝光八小時，拍的是自家窗外。' },
    { id: 'ether',    y: 1846, k: 1846, e: '😷', n: '外科麻醉首次公開示範',    t: '在這之前，手術是清醒著做的。' },
    { id: 'zanzibar', y: 1896, k: 1896, e: '💥', n: '史上最短的戰爭',          t: '英國對尚吉巴，38 分鐘結束。' },
    { id: 'ev1900',   y: 1900, k: 1900, e: '🔋', n: '電動車佔美國汽車 38%',     t: '汽油車那時只有 22%。' },
    { id: 'monalisa', y: 1911, k: 1911, e: '🖼️', n: '蒙娜麗莎被偷',            t: '被偷之後，她才變成世界名畫。' },
    { id: 'bread',    y: 1928, k: 1928, e: '🍞', n: '切片麵包上市',            t: '密蘇里的小鎮麵包店，第一次用機器切。' },
    { id: 'z3',       y: 1941, k: 1941, e: '💾', n: '第一台可程式電腦 Z3',      t: 'Zuse 在柏林的公寓客廳裡做出來。' },
    { id: 'duncan',   y: 1944, k: 1944, e: '🔮', n: '英國最後一次「巫術罪」定罪', t: '靈媒海倫·鄧肯，依 1735 年的法律入獄。' },
    { id: 'lego',     y: 1958, k: 1958, e: '🧱', n: '樂高積木取得專利',        t: '今天的積木仍扣得上 1958 年的那一顆。' },
    { id: 'heart',    y: 1967, k: 1967, e: '🫀', n: '世界第一次心臟移植',      t: '南非，Barnard 醫師，病人活了 18 天。' },
    { id: 'cell',     y: 1973, k: 1973, e: '📞', n: '第一通手機通話',          t: 'Motorola 的 Cooper 打去跟對手炫耀。' },
    { id: 'elvis',    y: 1977, k: 1977.62, e: '🎤', n: '貓王去世',              t: '8 月 16 日，孟菲斯，享年 42 歲。' },
    { id: 'spam',     y: 1978, k: 1978, e: '📧', n: '世界第一封垃圾郵件',      t: '一次寄給 ARPANET 上 393 個人。' },
    { id: 'gameboy',  y: 1989, k: 1989.31, e: '🕹️', n: 'Game Boy 上市',        t: '4 月 21 日，一塊灰色的磚。' },
    { id: 'wall',     y: 1989, k: 1989.86, e: '🚧', n: '柏林圍牆倒塌',          t: '11 月 9 日，一場記者會口誤引爆的夜晚。' }
  ];

  // ── 時光錯位：所有 need 的卡片都在時間軸上、且剛放下的那張在其中，就揭示 ──
  const SHOCKS = [
    { need: ['fax', 'phone'],       html: '<strong>傳真機（1843）比電話（1876）早了 33 年。</strong>它也早於美國南北戰爭——那台機器用鐘擺掃描金屬板，把圖案「拍」過電報線。' },
    { need: ['oxford', 'aztec'],    html: '<strong>牛津大學開課時（1096），阿茲特克人還沒建城。</strong>特諾奇提特蘭要到 229 年後（1325）才在湖中立起第一根木樁。' },
    { need: ['eiffel', 'nintendo'], html: '<strong>任天堂和艾菲爾鐵塔同一年（1889）誕生。</strong>那年它做的是手繪花札紙牌——比福特汽車（1903）還老 14 歲。' },
    { need: ['starwars', 'guillo'], html: '<strong>《星際大戰》上映四個月後，法國還在用斷頭台。</strong>1977 年 5 月銀幕上有光劍，同年 9 月 10 日馬賽監獄的鍘刀落下——西方世界最後一次。' },
    { need: ['moon', 'swiss'],      html: '<strong>人類先登上月球（1969），瑞士女性才拿到聯邦投票權（1971）。</strong>最後一個州（內阿彭策爾）被聯邦法院逼著點頭，已是 1990 年。' },
    { need: ['sputnik', 'slavery'], html: '<strong>人造衛星已經在繞地球（1957），沙烏地阿拉伯才正式廢奴（1962）。</strong>太空時代與奴隸制，重疊了整整五年。' },
    { need: ['pyramid', 'mammoth'], html: '<strong>金字塔蓋好的時候（前 2560），長毛象還活著。</strong>弗蘭格爾島上的最後一群又撐了 900 年，到前 1650 年才消失。' },
    { need: ['pluto', 'demote'],    html: '<strong>冥王星從被發現（1930）到被除名（2006），連繞太陽一圈都還沒走完。</strong>它的一年是 248 個地球年——它只走了大約 30%。' },
    { need: ['youtube', 'vcr'],     html: '<strong>YouTube 上線 11 年後，世界才做出最後一台錄影機。</strong>2016 年 7 月船井電機停產 VCR——那一年，錄影帶和 4K 串流在同一個貨架上共存。' },
    { need: ['nokia', 'phone'],     html: '<strong>諾基亞（1865）比電話（1876）還老。</strong>它創立時是芬蘭河邊的一間木漿廠，離「手機」還有 116 年。' },
    { need: ['cleo', 'pyramid', 'moon'], html: '<strong>克麗奧佩脫拉離登月，比離金字塔完工還近。</strong>她（前 30）與金字塔（前 2560）隔了 2530 年，與阿波羅 11 號（1969）只隔 1999 年。' },
    { need: ['harvard', 'press'],   html: '<strong>哈佛（1636）創校時，牛頓還沒出生。</strong>它比微積分、比蒸汽機、比美國本身都早——校園裡最老的，是時間本身。' },
    { need: ['fax', 'ether'],       html: '<strong>人類先學會傳真（1843），才學會讓病人不痛（1846）。</strong>在乙醚麻醉首次公開示範以前，開刀是清醒著挨的——而傳真機的專利，比那早了三年。' },
    { need: ['kongo', 'oxford'],    html: '<strong>金剛組（578）比牛津（1096）還老五百年。</strong>這家日本建築商為了蓋四天王寺而生，然後一路營業到 21 世紀——世界上最老的公司。' },
    { need: ['vikings', 'columbus'],html: '<strong>維京人約在西元 1000 年就踏上北美。</strong>比哥倫布（1492）早了將近 500 年，紐芬蘭的蘭塞奧茲牧草地是實證——他們來了、看了，然後回家了。' },
    { need: ['antikyth', 'vending'],html: '<strong>古希臘人有齒輪「電腦」，也有投幣販賣機。</strong>安提基特拉機械（約前 100）能推算日月食；亞歷山卓的希羅（約公元 50）做出投一枚幣就流出聖水的機器。' },
    { need: ['magna', 'oxford'],    html: '<strong>《大憲章》（1215）簽下去的時候，牛津已經開課 119 年。</strong>那所大學看著英國憲政從一張羊皮紙開始。' },
    { need: ['plague', 'aztec'],    html: '<strong>黑死病橫掃歐洲（1347）時，特諾奇提特蘭才剛蓋好 22 年。</strong>兩個世界正在同一個世紀裡，各自走向自己的災難。' },
    { need: ['machu', 'press'],     html: '<strong>馬丘比丘（約 1450）和古騰堡印刷術（約 1440）幾乎同時誕生。</strong>一邊在雲端疊石頭，一邊在萊茵河畔排鉛字——彼此都不知道對方存在。' },
    { need: ['goldi', 'bastille'],  html: '<strong>歐洲最後一名「女巫」被處決是 1782 年。</strong>距離法國大革命（1789）只剩七年，美國獨立宣言已經簽了六年——啟蒙時代還在砍女巫的頭。' },
    { need: ['duncan', 'z3'],       html: '<strong>1941 年德國做出第一台可程式電腦，1944 年英國還在用 1735 年的《巫術法》抓人。</strong>靈媒海倫·鄧肯被關了九個月——理由是她「洩漏軍機」。' },
    { need: ['megalo', 'photo'],    html: '<strong>人類先給恐龍取了名字（1824），兩年後才拍出第一張照片（1826）。</strong>所以最早的古生物學，全部靠手繪。' },
    { need: ['ev1900', 'wright'],   html: '<strong>萊特兄弟起飛前三年，美國路上有 33,842 台電動車。</strong>1900 年電動車佔 38%、蒸汽車 40%、汽油車只有 22%——電動車不是新東西，是被淘汰過一次的東西。' },
    { need: ['monalisa', 'titanic'],html: '<strong>蒙娜麗莎是先被偷走，才變成世界名畫的。</strong>1911 年她從羅浮宮消失，全歐洲的報紙追了兩年——鐵達尼號（1912）沉沒時，她還下落不明。' },
    { need: ['bread', 'suffrage'],  html: '<strong>切片麵包（1928）比美國女性投票權（1920）還晚。</strong>所以「自從切片麵包以來最棒的發明」這句話，其實年輕得很。' },
    { need: ['heart', 'moon'],      html: '<strong>人類先換了一顆心臟（1967），兩年後才踏上月球（1969）。</strong>南非的 Barnard 醫師動手時，阿波羅 11 號還沒發射。' },
    { need: ['cell', 'apple'],      html: '<strong>第一通手機通話（1973）比蘋果公司（1976）還早三年。</strong>Cooper 站在紐約街頭，打給對手公司的工程師說：我正用一支「行動電話」跟你講話。' },
    { need: ['spam', 'web'],        html: '<strong>第一封垃圾郵件（1978）比第一個網站（1991）早了 13 年。</strong>廣告永遠比內容先抵達。' },
    { need: ['gameboy', 'wall'],    html: '<strong>Game Boy 上市（1989 年 4 月）七個月後，柏林圍牆倒了（11 月）。</strong>俄羅斯方塊就這樣跟著冷戰的結束一起出現在全世界的手上。' },
    { need: ['starwars', 'elvis', 'guillo'], html: '<strong>1977 這一年：5 月《星際大戰》上映，8 月貓王去世，9 月法國最後一次用斷頭台。</strong>同一年、同一個世界。' },
    { need: ['zanzibar', 'coke'],   html: '<strong>史上最短的戰爭只打了 38 分鐘（1896）。</strong>那時可口可樂（1886）已經賣了十年——這場仗的時間，還不夠喝完兩瓶再散步回家。' }
  ];

  const LS = {
    best: 'chrono.best',
    plays: 'chrono.plays'
  };

  const $ = (id) => document.getElementById(id);
  const rail = $('rail');
  const handSlot = $('handSlot');
  const revealLine = $('revealLine');
  const livesEl = $('lives');
  const streakEl = $('streak');
  const scoreEl = $('score');
  const bestEl = $('best');
  const shockEl = $('shock');
  const shockText = $('shockText');
  const overEl = $('over');
  const overScore = $('overScore');
  const overSub = $('overSub');
  const handHint = $('handHint');

  // ── 減少動態 ──
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let calm = mq.matches;
  const onMq = (e) => { calm = e.matches; };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq);
  else if (typeof mq.addListener === 'function') mq.addListener(onMq);

  const store = {
    get(k, d) {
      try { const v = localStorage.getItem(k); return v === null ? d : v; }
      catch (_) { return d; }
    },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { /* 無痕模式 */ } }
  };

  const state = {
    pool: [],
    placed: [],     // 依年份排序的卡片（含 wrong 標記）
    current: null,
    lives: 3,
    score: 0,
    streak: 0,
    fired: new Set(),
    queue: [],
    over: false
  };

  const yearText = (y) => (y < 0 ? '前 ' + Math.abs(y) : String(y));
  const label = (c) => c.ly || yearText(c.y);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ── 建卡 ──
  function cardEl(card, opts) {
    const o = opts || {};
    const el = document.createElement('div');
    el.className = 'card';
    if (o.state) el.classList.add(o.state);
    el.dataset.id = card.id;

    const emoji = document.createElement('div');
    emoji.className = 'emoji';
    emoji.textContent = card.e;
    emoji.setAttribute('aria-hidden', 'true');

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = card.n;

    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = card.t;

    el.append(emoji, name, note);

    if (o.showYear) {
      const year = document.createElement('div');
      year.className = 'year';
      year.textContent = label(card);
      el.appendChild(year);
      el.setAttribute('aria-label', card.n + '，' + label(card) + ' 年');
      if (o.roll && !calm && !card.ly) rollYear(year, card.y);
    } else {
      el.setAttribute('aria-label', '手上的卡片：' + card.n + '。' + card.t);
    }
    return el;
  }

  // 年份滾動
  function rollYear(el, target) {
    const dur = 620;
    const t0 = performance.now();
    const sign = target < 0 ? -1 : 1;
    const abs = Math.abs(target);
    const step = (now) => {
      if (document.hidden) { el.textContent = yearText(target); return; }
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(abs * eased);
      el.textContent = yearText(sign * v);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = yearText(target);
    };
    requestAnimationFrame(step);
  }

  // ── 畫時間軸 ──
  function renderRail(focusId) {
    // FLIP：先量舊位置
    const before = new Map();
    rail.querySelectorAll('.card').forEach((el) => {
      before.set(el.dataset.id, el.getBoundingClientRect().left);
    });

    rail.textContent = '';

    state.placed.forEach((card, i) => {
      rail.appendChild(slotEl(i));
      const el = cardEl(card, {
        showYear: true,
        state: card.wrong ? 'wrong' : (card.id === focusId ? 'right' : ''),
        roll: card.id === focusId
      });
      if (card.id === focusId) el.classList.add('placed');
      rail.appendChild(el);
    });
    rail.appendChild(slotEl(state.placed.length));

    // FLIP：把舊位置的差距補回去，再讓它滑到新位置
    if (!calm) {
      rail.querySelectorAll('.card').forEach((el) => {
        const old = before.get(el.dataset.id);
        if (old === undefined) return;
        const dx = old - el.getBoundingClientRect().left;
        if (Math.abs(dx) < 1) return;
        el.style.transition = 'none';
        el.style.transform = 'translateX(' + dx + 'px)';
        requestAnimationFrame(() => {
          el.style.transition = 'transform .5s cubic-bezier(.22,.8,.28,1)';
          el.style.transform = '';
        });
      });
    }

    if (focusId) {
      const target = rail.querySelector('.card[data-id="' + focusId + '"]');
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }

  function slotEl(index) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot';
    b.dataset.index = String(index);
    b.textContent = '放這裡';
    const prev = state.placed[index - 1];
    const next = state.placed[index];
    const where = prev && next ? (label(prev) + ' 與 ' + label(next) + ' 之間')
      : prev ? (label(prev) + ' 之後')
      : next ? (label(next) + ' 之前')
      : '時間軸起點';
    b.setAttribute('aria-label', '放在' + where);
    b.addEventListener('click', () => place(index));
    return b;
  }

  // ── 發牌 ──
  function deal() {
    handSlot.textContent = '';
    if (state.pool.length === 0) { finish(true); return; }
    state.current = state.pool.pop();
    const el = cardEl(state.current, { showYear: false });
    el.tabIndex = 0;
    makeDraggable(el);
    handSlot.appendChild(el);
    handHint.textContent = '「' + state.current.n + '」發生在哪兩件事之間？';
  }

  // ── 判定與放置 ──
  function place(index) {
    if (state.over || !state.current) return;
    const card = state.current;
    const prev = state.placed[index - 1];
    const next = state.placed[index];
    const ok = (!prev || prev.y <= card.y) && (!next || card.y <= next.y);

    state.current = null;

    if (ok) {
      state.placed.splice(index, 0, card);
      state.score++;
      state.streak++;
      scoreEl.textContent = String(state.score);
      streakEl.textContent = String(state.streak);
      pop(scoreEl); pop(streakEl);
      revealLine.className = 'reveal-line good';
      revealLine.textContent = '正確 · ' + card.n + '：' + label(card) + ' 年'
        + (state.streak >= 3 ? '（連對 ' + state.streak + '）' : '');
      renderRail(card.id);
      sparkle();
      const b = Number(store.get(LS.best, 0)) || 0;
      if (state.score > b) { store.set(LS.best, state.score); bestEl.textContent = String(state.score); pop(bestEl); }
    } else {
      const el = handSlot.querySelector('.card');
      if (el) { el.classList.add('shake'); }
      state.lives--;
      state.streak = 0;
      streakEl.textContent = '0';
      livesEl.textContent = '♥'.repeat(Math.max(0, state.lives)) || '—';
      livesEl.classList.remove('lost');
      void livesEl.offsetWidth;
      livesEl.classList.add('lost');

      const correctIndex = correctSlot(card);
      const marked = Object.assign({}, card, { wrong: true });
      state.placed.splice(correctIndex, 0, marked);
      revealLine.className = 'reveal-line bad';
      revealLine.textContent = '錯位 · ' + card.n + '其實是 ' + label(card) + ' 年——時間把它搬回去了。';
      renderRail(card.id);
    }

    setTimeout(() => {
      const fired = tellShock(card.id);
      if (state.lives <= 0) { finish(false); return; }
      if (state.pool.length === 0) { finish(true); return; }
      setTimeout(deal, fired ? 260 : 60);
    }, ok ? 520 : 620);
  }

  function correctSlot(card) {
    let i = 0;
    while (i < state.placed.length && state.placed[i].k < card.k) i++;
    return i;
  }

  function pop(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // ── 時光錯位橫幅 ──
  let shockTimer = null;
  function tellShock(justPlacedId) {
    const ids = new Set(state.placed.map((c) => c.id));
    // 同一次放置可能同時湊齊多則——全部排進佇列，之後一則一則放，不漏掉任何一個揭示
    SHOCKS.forEach((s) => {
      const key = s.need.join('|');
      if (state.fired.has(key)) return;
      if (!s.need.includes(justPlacedId)) return;
      if (!s.need.every((id) => ids.has(id))) return;
      state.fired.add(key);
      state.queue.push(s);
    });
    const hit = state.queue.shift();
    if (!hit) return false;

    shockText.innerHTML = hit.html;
    shockEl.hidden = false;
    shockEl.classList.remove('out');
    clearTimeout(shockTimer);
    shockTimer = setTimeout(() => {
      shockEl.classList.add('out');
      setTimeout(() => { shockEl.hidden = true; }, 460);
    }, 7000);
    return true;
  }

  // ── 光點（節制：8 顆、一次性） ──
  function sparkle() {
    if (calm || document.hidden) return;
    const anchor = rail.querySelector('.card.right');
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'spark';
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      document.body.appendChild(s);
      const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.6;
      const dist = 60 + Math.random() * 70;
      const anim = s.animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
          { transform: 'translate(' + (Math.cos(a) * dist - 50) + '%,' + (Math.sin(a) * dist - 50) + '%) scale(0)', opacity: 0 }
        ],
        { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' }
      );
      anim.onfinish = () => s.remove();
      anim.oncancel = () => s.remove();
    }
  }

  // ── 拖曳（pointer events，滑鼠／觸控通用） ──
  function makeDraggable(el) {
    let ghost = null;
    let hot = null;
    let dragging = false;
    let startX = 0, startY = 0;

    const slots = () => Array.from(rail.querySelectorAll('.slot'));

    const hitSlot = (x, y) => {
      let best = null, bestD = 90; // 容錯半徑
      slots().forEach((s) => {
        const r = s.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = s; }
      });
      return best;
    };

    const onMove = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        dragging = true;
        el.classList.add('dragging');
        ghost = el.cloneNode(true);
        ghost.classList.add('ghost');
        ghost.classList.remove('dragging');
        ghost.style.width = el.getBoundingClientRect().width + 'px';
        document.body.appendChild(ghost);
      }
      if (ghost) {
        ghost.style.left = (ev.clientX - 76) + 'px';
        ghost.style.top = (ev.clientY - 88) + 'px';
      }
      const s = hitSlot(ev.clientX, ev.clientY);
      if (s !== hot) {
        if (hot) hot.classList.remove('hot');
        hot = s;
        if (hot) hot.classList.add('hot');
      }
    };

    const onUp = (ev) => {
      el.releasePointerCapture && safeRelease(el, ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (ghost) { ghost.remove(); ghost = null; }
      el.classList.remove('dragging');
      if (hot) {
        const idx = Number(hot.dataset.index);
        hot.classList.remove('hot');
        hot = null;
        if (dragging) { place(idx); return; }
      }
      dragging = false;
    };

    el.addEventListener('pointerdown', (ev) => {
      if (state.over || !state.current) return;
      ev.preventDefault();
      startX = ev.clientX; startY = ev.clientY;
      safeCapture(el, ev.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });

    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        const first = rail.querySelector('.slot');
        if (first) first.focus();
      }
    });
  }

  function safeCapture(el, id) { try { el.setPointerCapture(id); } catch (_) { /* noop */ } }
  function safeRelease(el, id) { try { el.releasePointerCapture(id); } catch (_) { /* noop */ } }

  // ── 結束 ──
  function finish(cleared) {
    state.over = true;
    handSlot.textContent = '';
    handHint.textContent = cleared ? '整副牌全部進了時間軸。' : '時間軸暫時關門。';
    overScore.textContent = String(state.score);
    const best = Number(store.get(LS.best, 0)) || 0;
    const plays = (Number(store.get(LS.plays, 0)) || 0) + 1;
    store.set(LS.plays, plays);
    overSub.textContent = cleared
      ? '你把整副牌都排完了——最佳紀錄 ' + best + '，這是你第 ' + plays + ' 次上工。'
      : '最佳紀錄 ' + best + ' 張 · 這是你第 ' + plays + ' 次上工。';
    // 佇列裡還沒放完的錯位揭示，一次補在結束畫面上
    const card = overEl.querySelector ? overEl.querySelector('.over-card') : null;
    const stale = overEl.querySelector ? overEl.querySelector('.left-over') : null;
    if (stale) stale.remove();
    if (card && state.queue.length) {
      const box = document.createElement('div');
      box.className = 'deep-time left-over';
      const h = document.createElement('h3');
      h.textContent = '還沒來得及告訴你';
      box.appendChild(h);
      state.queue.forEach((s) => {
        const p = document.createElement('p');
        p.innerHTML = s.html;
        box.appendChild(p);
      });
      const deep = card.querySelector('.deep-time');
      if (deep && deep.parent !== undefined) card.appendChild(box);
      else card.appendChild(box);
    }
    state.queue = [];

    overEl.hidden = false;
    setTimeout(() => { const b = $('again'); if (b) b.focus(); }, 60);
  }

  // ── 開局 ──
  function start() {
    state.pool = shuffle(DECK);
    state.placed = [];
    state.current = null;
    state.lives = 3;
    state.score = 0;
    state.streak = 0;
    state.fired = new Set();
    state.queue = [];
    state.over = false;

    // 先送一張當錨點（已知年份）
    state.placed.push(state.pool.pop());

    livesEl.textContent = '♥♥♥';
    streakEl.textContent = '0';
    scoreEl.textContent = '0';
    bestEl.textContent = String(Number(store.get(LS.best, 0)) || 0);
    revealLine.className = 'reveal-line';
    revealLine.textContent = '時間軸上先擺好一張——其餘 ' + state.pool.length + ' 張，交給你。';
    overEl.hidden = true;
    shockEl.hidden = true;

    renderRail(null);
    deal();
  }

  $('restart').addEventListener('click', start);
  $('again').addEventListener('click', start);

  const howtoBtn = $('howto');
  const howtoPanel = $('howtoPanel');
  howtoBtn.addEventListener('click', () => {
    const open = howtoPanel.hidden;
    howtoPanel.hidden = !open;
    howtoBtn.setAttribute('aria-expanded', String(open));
  });

  // 鍵盤：在空隙之間用左右鍵移動
  rail.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const slots = Array.from(rail.querySelectorAll('.slot'));
    const i = slots.indexOf(document.activeElement);
    if (i < 0) return;
    ev.preventDefault();
    const j = ev.key === 'ArrowLeft' ? Math.max(0, i - 1) : Math.min(slots.length - 1, i + 1);
    slots[j].focus();
  });

  start();
})();

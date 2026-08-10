/* ==========================================================================
 * 這裡不是榮耀之地 — 一萬年標記系統模擬（純邏輯，無 DOM 相依）
 *
 * 參數依據 Sandia National Laboratories, SAND92-1382（1993）A 組報告裡
 * 真實出現過的設計爭論：規模、材料價值、工藝、訊息層級、中心留空與否、
 * 以及六個具名的地景方案。
 *
 * 這個檔案可以直接被 node require 來跑斷言，也可以被 <script src> 載入。
 * ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NPOH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var GENERATIONS = 400;   // 10,000 年 ÷ 一代 25 年
  var YEARS = 10000;

  var c01 = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };

  /* ---- 六個地景方案：全部出自報告 4.2 節 ---- */
  var FORMS = {
    thorns: {
      name: '荊棘地景', en: 'Landscape of Thorns',
      hostile: 0.95, durable: 0.52, shapeMsg: 0.92, recycle: 0.10,
      note: '十五公尺高的混凝土荊棘，從地裡朝各個方向刺出來。報告自己承認：這些懸臂會在上表面產生細微裂縫，撐不撐得過一萬年，他們不敢保證。但它情緒太強了，還是留在報告裡。'
    },
    spikes: {
      name: '尖刺場', en: 'Spike Field',
      hostile: 0.88, durable: 0.80, shapeMsg: 0.85, recycle: 0.08,
      note: '巨大的石尖以不同角度從地面竄出，不規則、不重複、不受控。它們從掩埋區裡長出來，也就標出了掩埋區的形狀——不要往這底下鑽。'
    },
    leaning: {
      name: '傾斜石尖', en: 'Leaning Stone Spikes',
      hostile: 0.72, durable: 0.86, shapeMsg: 0.70, recycle: 0.08,
      note: '二十一公尺高，底部四點六到六公尺寬，以一比十四的斜度歪斜。報告連傾斜的比例都寫進去了——他們要的是「快倒了」的感覺，不是紀念碑的挺立。'
    },
    earthworks: {
      name: '威嚇土堤', en: 'Menacing Earthworks',
      hostile: 0.76, durable: 0.92, shapeMsg: 0.78, recycle: -0.06,
      note: '閃電形狀的巨大土堤，從一個中空的方形往外放射。從空中看極為震撼；走在裡面，土牆壓過來、切斷你和地平線的連結，你會失去自己在哪裡的感覺。這是 A 組最推薦的方案。'
    },
    slab: {
      name: '黑洞', en: 'Black Hole',
      hostile: 0.62, durable: 0.84, shapeMsg: 0.46, recycle: 0.04,
      note: '一整片黑玄武岩或黑染混凝土。它吸走沙漠的日照再輻射回來，一年裡有大半時間熱到站不住人。不能住、不能耕，就是一個巨大的、被拿走的「無」。'
    },
    blocks: {
      name: '禁忌方塊', en: 'Forbidding Blocks',
      hostile: 0.66, durable: 0.90, shapeMsg: 0.60, recycle: 0.26,
      note: '數百塊約七點六公尺見方的黑色石塊排成不規則格狀，中間留一點五公尺寬的「街道」。你走得進去，但街道通向任何地方——太窄，不能住、不能耕，連聚在一起說話都嫌擠。'
    }
  };
  var FORM_ORDER = ['thorns', 'spikes', 'leaning', 'earthworks', 'slab', 'blocks'];

  var WORD_LEVELS = [
    { label: '什麼都不寫', short: '只有形狀', desc: '第一層：這裡有人造物。純靠地景說話，不留一個字。' },
    { label: '加上圖像', short: '＋圖像', desc: '第二層：這裡有人造物，而且它很危險。刻上表情痛苦的臉、以及一組看得懂順序的連環圖。' },
    { label: '加上七種文字', short: '＋七種文字', desc: '第三層：說清楚是什麼、為什麼、多深、多大。英文、法文、西班牙文、阿拉伯文、俄文、中文、納瓦荷文各刻一份。' },
    { label: '再蓋一間檔案室', short: '＋檔案室', desc: '第四層：完整的地圖、圖表、劑量曲線、地質剖面，收進場內一間房間裡。' }
  ];

  /* ---- 核心評估 ---- */
  function evaluate(d) {
    var F = FORMS[d.form] || FORMS.spikes;
    var s = d.scale / 100, w = d.worth / 100, c = d.craft / 100;
    var k = d.center ? 1 : 0;
    var pict = d.words >= 1 ? 1 : 0, text = d.words >= 2 ? 1 : 0, arch = d.words >= 3 ? 1 : 0;

    /* 存留＝撐得住 ＋ 有人願意維護 － 被拆去當材料。
       好材料讓它耐久，也讓它值得偷；精緻讓後人想修它，也讓後人想切它。 */
    var durability = F.durable * (0.36 + 0.30 * s + 0.14 * c + 0.38 * w);
    var maintained = 0.20 * c + 0.06 * k;
    /* Ast 的反對意見：「美的被保存，醜的被丟掉。」沒有人願意維護的東西會被推倒、
       被拿去墊路、被當成礙事的垃圾清掉——除非它大到清不完。 */
    var neglect = 0.30 * (1 - c) * (1 - 0.45 * s) * (1 - 0.25 * k);
    var stripped = Math.max(0, 0.78 * w + 0.16 * c + F.recycle - 0.28 * s - 0.16);
    var survival = c01(durability + maintained - neglect - stripped);

    /* 可讀：形狀本身在說話（不隨語言死去）＋ 圖像／文字／檔案（各自以不同速度失效）。
       報告估計文字在萬年尺度上幾乎全滅，圖像撐得久一些，但也會被誤讀。 */
    var shapeMsg = F.shapeMsg * (0.42 + 0.44 * s) * (1 - 0.24 * c);
    var msgAdd = 0.30 * pict * 0.60 + 0.35 * text * 0.18 + 0.20 * arch * 0.12 + 0.05 * k;
    var legible = c01((shapeMsg + msgAdd) * (0.30 + 0.70 * survival));

    /* 誘惑：越美、越貴、越像一座殿堂、越是一場浩大工程，越像藏著什麼。 */
    var allure = c01(0.03 + 0.30 * c + 0.26 * w + 0.18 * k + 0.16 * s
      + 0.02 * pict + 0.05 * text + 0.13 * arch + 0.10 * (1 - F.hostile));

    /* 嚇阻：看懂了之後真的會退開嗎 */
    var hostility = F.hostile * (0.42 + 0.44 * s) * (1 - 0.22 * c) * (1 - 0.16 * k);
    var deter = c01(0.16 + 0.70 * hostility + 0.44 * legible - 0.68 * allure);

    /* 誘惑是平方項：一點好奇不會出事，但吸引力一旦過線，一萬年裡一定有人動手。 */
    var score = c01(0.28 * survival + 0.24 * legible + 0.46 * deter - 0.34 * allure * allure);

    return {
      survival: survival, legible: legible, allure: allure, deter: deter, score: score,
      stripped: stripped, neglect: neglect, hostility: hostility, form: F
    };
  }

  /* ---- 四百個世代裡會發生的事 ---- */
  var EVENT_POOL = [
    { gen: 8, tone: 'neutral', when: function () { return true; },
      text: '最後一位參與建造的人下葬。她的孫子還記得爺爺說過那底下有東西，但已經說不清是什麼東西。' },
    { gen: 22, tone: 'bad', when: function (d, m) { return d.words >= 2 && m.legible < 0.9; },
      text: '你刻的七種文字裡，有兩種在這一代之後沒有母語者了。石頭沒有變，讀得懂石頭的人少了兩成。' },
    { gen: 35, tone: 'bad', when: function (d, m) { return m.stripped > 0.18; },
      text: '一場旱災。附近的人來搬石頭築堤，先搬走了最平整、最好切的那些——也就是刻著字的那些。' },
    { gen: 48, tone: 'neutral', when: function (d) { return d.form === 'earthworks' || d.scale < 55; },
      text: '沙從西邊爬上來。外圈矮的那幾道，一個冬天就只剩起伏的輪廓。' },
    { gen: 64, tone: 'bad', when: function () { return true; },
      text: '一支測量隊來過，在地表量到的輻射跟沙漠其他地方一樣。他們在紀錄裡寫下：疑為古代宗教遺址，無實質危害。' },
    { gen: 88, tone: 'good', when: function (d, m) { return m.deter > 0.45; },
      text: '這片地被畫進當時的地圖，旁邊註記了一個現在已經無法翻譯的詞。之後三百年，牧人繞路走。' },
    { gen: 112, tone: 'bad', when: function (d) { return !!d.center; },
      text: '中央那座建築裡開始有人點火。一開始只是躲風，後來變成每年一次，再後來變成一個必須由特定家族主持的儀式。' },
    { gen: 140, tone: 'bad', when: function (d, m) { return m.allure > 0.5; },
      text: '有人拓下石面上的臉，帶回城裡。那些「痛苦的表情」被當成神的面容，開始有人專程來看。' },
    { gen: 168, tone: 'good', when: function (d, m) { return d.words >= 2 && m.survival > 0.6; },
      text: '一位學者花了十一年比對三種殘存文字，拼出這是一份警告。他把它翻成自己的語言，刻在外圍新立的石上——舊的一塊也沒拆。' },
    { gen: 196, tone: 'neutral', when: function (d) { return d.form === 'slab' || d.form === 'blocks'; },
      text: '黑色的表面在夏天燙得站不住人。附近的人給這裡取了個名字，意思大概是「不長東西的地方」。' },
    { gen: 224, tone: 'bad', when: function (d, m) { return m.allure > 0.62; },
      text: '第一支盜掘隊來了。他們的推理很簡單：花這麼大力氣蓋起來、又做得這麼漂亮的地方，底下不可能沒有東西。' },
    { gen: 252, tone: 'good', when: function (d, m) { return m.hostility > 0.45 && m.allure < 0.45; },
      text: '一群移民在附近落腳，繞開了這裡。理由沒有寫下來，只有一句話傳給下一代：那邊走不進去，也不必進去。' },
    { gen: 280, tone: 'bad', when: function (d, m) { return m.survival < 0.55; },
      text: '這一代的人已經不確定這些東西是不是人造的。有孩子在斷掉的柱子之間玩捉迷藏。' },
    { gen: 312, tone: 'good', when: function (d, m) { return m.legible > 0.55; },
      text: '就算沒有一個字讀得懂，這片地的形狀還在說同一句話：這裡不對勁，這裡不歡迎你。有人把它畫下來，畫得很準。' },
    { gen: 344, tone: 'bad', when: function (d, m) { return m.deter < 0.35; },
      text: '一支探勘隊架起了鑽塔。他們有很好的儀器，也有很好的理由——地下七百公尺的鹽層裡，探測到密度異常。' },
    { gen: 372, tone: 'neutral', when: function () { return true; },
      text: '距離你按下那個按鈕，已經過了九千三百年。這片地上的人換了大約三百七十次。' }
  ];

  function timeline(d) {
    var m = evaluate(d);
    var out = [];
    for (var i = 0; i < EVENT_POOL.length; i++) {
      var e = EVENT_POOL[i];
      if (e.when(d, m)) out.push({ gen: e.gen, year: e.gen * 25, tone: e.tone, text: e.text });
    }
    return out;
  }

  /* ---- 結局 ---- */
  var HELD = 0.50, EDGE = 0.40;

  function verdict(m) {
    if (m.score >= HELD) {
      return {
        key: 'held', title: '它守住了',
        text: '沒有奇蹟，只有一件事一直有效：這片地看起來就是拿不到東西。四百代人從旁邊走過去，沒有一代想停下來挖。你送到了——雖然你永遠不會知道。'
      };
    }
    if (m.allure > 0.60 && m.survival > 0.4) {
      return {
        key: 'temple', title: '你蓋了一座神殿',
        text: '它撐過了一萬年，因為每一代都有人願意修它——他們願意修它，是因為它很美。然後有一代人想知道，這麼美的東西底下藏了什麼。他們挖了。'
      };
    }
    if (m.survival < 0.34 && m.stripped > 0.06) {
      return {
        key: 'quarried', title: '它被搬走了',
        text: '不是被摧毀，是被使用。你選的材料太好切、太好搬，於是它成了一整片採石場。西元 12000 年，你的警告散落在方圓兩百公里的牆基與門檻裡。'
      };
    }
    if (m.survival < 0.34) {
      return {
        key: 'discarded', title: '它被清掉了',
        text: '沒有人恨它，只是沒有人替它做過任何事。倒了就倒了，擋路的就推開。醜的東西不會被保存，會被容忍到有一天不再被容忍。'
      };
    }
    if (m.legible < 0.28) {
      return {
        key: 'mute', title: '它還在，但沒有人知道那是什麼',
        text: '石頭一塊不少。只是走過的人看不出這是一句話——他們以為這是地形。沉默地站著一萬年，跟不存在的差別不大。'
      };
    }
    if (m.deter < 0.36) {
      return {
        key: 'drilled', title: '他們下鑽了',
        text: '有人看懂了這裡不對勁。但「不對勁」跟「別動」之間，隔著一整個時代的好奇心，和一整套他們自己的判斷。鑽桿在第三百四十四代下去。'
      };
    }
    return {
      key: 'edge', title: '它擦邊過了',
      text: '有幾代人繞開了，有幾代人差一點就動手。它守住了，但守住的方式讓人不安：不是因為訊息夠清楚，是因為運氣站在你這邊。'
    };
  }

  function run(d) {
    var m = evaluate(d);
    return { metrics: m, events: timeline(d), verdict: verdict(m) };
  }

  return {
    GENERATIONS: GENERATIONS, YEARS: YEARS,
    FORMS: FORMS, FORM_ORDER: FORM_ORDER, WORD_LEVELS: WORD_LEVELS,
    evaluate: evaluate, timeline: timeline, verdict: verdict, run: run
  };
});

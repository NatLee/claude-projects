/* core.js — 「那場手術沒有發生」的純函式與資料（瀏覽器與 node 共用）
 *
 * 一個倒數時鐘，跟著 2013–2024 年的報導往前走。每一則報導都帶著一個「故事日期」，
 * 承諾類的報導還帶著一個「目標日期」：時鐘顯示的天數＝目標日期 − 故事日期。
 * 目標一改，時鐘就被重設；故事日期一越過目標，時鐘就翻成「逾期」往上數。
 * 日期一律用 UTC 午夜計算，避開夏令時間把一天算成 23 或 25 小時。
 */
(function (root) {
  'use strict';

  var DAY = 86400000;
  function utc(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!m) throw new Error('bad date: ' + iso);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  /* b − a，以日計（可為負） */
  function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / DAY); }
  function isoOf(d) {
    var y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  /* 時鐘狀態：還沒公布日期／倒數中／日期不明（「幾天內公布」）／逾期 */
  function clockState(storyDate, target) {
    if (target == null) return { mode: 'none', days: null };
    if (target === 'soon') return { mode: 'soon', days: null };
    var d = daysBetween(storyDate, target);
    if (d >= 0) return { mode: 'count', days: d };
    return { mode: 'over', days: -d };
  }

  /* ── 報導序列（全部有出處，見 說明.md）──
     kind：fact＝事實；promise＝帶目標日期的承諾（讀者選相信／存疑）；
           quiz＝解謎；end＝收尾。target：null＝沿用上一個目標。 */
  var STEPS = [
    { id: 'plan', date: '2013-06-13', kind: 'fact', target: null,
      tag: '計畫',
      head: '一篇論文：把頭接到別人的身體上',
      body: ['義大利杜林的神經外科醫師卡納維羅（Sergio Canavero）發表手術藍圖，取名 HEAVEN：把頭降溫到攝氏十二到十五度，用極鋒利的刀同時切斷兩條脊髓，再用一種叫聚乙二醇（PEG）的化學品，把斷面「黏」回去。',
             '九天後，一位二十九歲的俄國程式設計師寫信給他：我願意。他叫斯皮里多諾夫，患有脊髓性肌肉萎縮症，一歲左右以後就沒有走過路。'] },
    { id: 'p1', date: '2015-02-25', kind: 'promise', target: '2017-02-25',
      tag: '承諾 1',
      head: '「兩年內。」',
      body: ['卡納維羅對英國《衛報》說：把一個人的頭接到另一具身體上，兩年內就能做到。'] },
    { id: 'aanos', date: '2015-06-12', kind: 'fact', target: null,
      tag: '記者會',
      head: '美國馬里蘭州，一場研討會的主講',
      body: ['台下的醫師輪番追問倫理問題，回答的是坐在輪椅上的斯皮里多諾夫。他說，總得有人當第一個，就像第一個上太空的人。',
             '美國神經外科醫學會的候任理事長巴傑爾（Hunt Batjer）留下一句：「有很多事，比死還糟。」'] },
    { id: 'p2', date: '2015-09-10', kind: 'promise', target: '2017-12-31',
      tag: '承諾 2',
      head: '哈爾濱加入，時間改成 2017 年 12 月',
      body: ['哈爾濱醫科大學的任曉平加入。他說自己已經做過一千多次老鼠的換頭手術。',
             '手術的目標月份，改成 2017 年 12 月。'] },
    { id: 'p3', date: '2016-01-21', kind: 'promise', target: '2017-12-25',
      tag: '承諾 3',
      head: '一隻猴子，和「大約聖誕節」',
      body: ['團隊公布一次猴子換頭：脊髓沒有接，猴子沒有醒來，維持了大約二十個小時，基於倫理被安樂死。',
             '卡納維羅說：人的手術，大約在 2017 年聖誕節。'] },
    { id: 'quiz', date: '2016-06-11', kind: 'quiz', target: null,
      tag: '解謎',
      head: '把一顆頭接到新身體上，哪一條最接不起來？',
      options: [
        { k: 'vessel', label: '血管' },
        { k: 'trachea', label: '氣管' },
        { k: 'esoph', label: '食道' },
        { k: 'cord', label: '脊髓' }
      ],
      answer: 'cord',
      body: ['血管早就接得起來：1908 年美國就有人把狗頭接上另一隻狗的血管；1954 年莫斯科有雙頭狗；1970 年克里夫蘭，一隻猴子的頭接上另一隻猴子的身體，醒來會看、會聽、會咬人——脖子以下卻一動也不能動。牠活了多久，說法從幾小時到一週多都有。',
             '那些手術都只接了血管。切斷的脊髓，到今天還不曾被接回去過。卡納維羅開的方子是 PEG。賓州大學的移植外科醫師沙凱德說，那就像拿強力膠去修一條斷掉的越洋電纜；中國前衛生部副部長黃潔夫說，脊髓的神經元一旦切斷就接不回去，這個手術在科學上不可能。'] },
    { id: 'p4', date: '2017-04-28', kind: 'promise', target: '2018-02-28',
      tag: '承諾 4',
      head: '換人了：「十個月內」',
      body: ['一週前，任曉平的團隊發表一個三隻老鼠的模型：小老鼠的頭接到大老鼠身上，再由第三隻老鼠用幫浦供血。',
             '卡納維羅宣布：第一位病人不會是斯皮里多諾夫，而會是一位中國人——在中國，比較容易找到捐贈的身體。時間：十個月內。'] },
    { id: 'p5', date: '2017-11-13', kind: 'promise', target: '2017-12-31',
      tag: '承諾 5',
      head: '「十二月，在中國。」',
      body: ['卡納維羅說：手術就在今年十二月的某個時候，在中國。'] },
    { id: 'p6', date: '2017-11-17', kind: 'promise', target: 'soon',
      tag: '承諾 6',
      head: '維也納：「已經在大體上做完了」',
      body: ['卡納維羅在維也納召開記者會：任曉平的團隊在哈爾濱，用兩具大體做了十八個小時的完整演練，接上了脊柱、神經和血管。他沒有拿出證據。',
             '他說，真正手術的日期，幾天內就會由任曉平宣布。'] },
    { id: 'zero', date: '2018-01-01', kind: 'fact', target: '2017-12-31',   /* 回到「十二月」那個期限 */
      tag: '時間到',
      head: '十二月過完了',
      body: ['沒有手術。沒有日期。沒有公告。'] },
    { id: 'valery', date: '2018-12-18', kind: 'fact', target: null,
      tag: '自願者',
      head: '第一個說「我願意」的人',
      body: ['報導說，斯皮里多諾夫結了婚，有了一個兒子，不打算再接受這個手術了。',
             '他只希望兩位醫師說清楚：在中國，到底哪裡出了錯、為什麼。'] },
    { id: 'bb', date: '2024-05-21', kind: 'fact', target: null,
      tag: '六年後',
      head: '一支兩天幾百萬人看過的影片',
      body: ['網路上流傳一支動畫：機器手臂把一顆頭搬到新的身體上，署名一家叫 BrainBridge 的公司。',
             '《麻省理工科技評論》查過：那是一支概念影片，這家公司沒有在任何地方登記。'] },
    { id: 'now', date: null, kind: 'end', target: null,
      tag: '今天',
      head: '倒數還在走',
      body: ['到今天，世界上還沒有任何一個活人接受過換頭手術。'] }
  ];

  /* 走到第 i 則時，時鐘用的目標日期（沿用最近一次承諾） */
  function targetAt(i) {
    for (var k = i; k >= 0; k--) if (STEPS[k].target != null) return STEPS[k].target;
    return null;
  }
  /* 第 i 則的故事日期；'now' 那則用傳進來的今天 */
  function dateAt(i, todayIso) { return STEPS[i].date || todayIso; }

  /* 逾期天數：從最後一個具體期限（2017-12-31）的隔天起算 */
  var LAST_DEADLINE = '2017-12-31';
  function overdueDays(todayIso) { return Math.max(0, daysBetween(LAST_DEADLINE, todayIso)); }

  /* 讀者的選擇統計 */
  function tally(choices) {
    var t = { trust: 0, doubt: 0, total: 0 };
    for (var k in choices) {
      if (!Object.prototype.hasOwnProperty.call(choices, k)) continue;
      if (choices[k] === 'trust') t.trust++; else if (choices[k] === 'doubt') t.doubt++;
    }
    t.total = t.trust + t.doubt;
    return t;
  }
  function promises() { return STEPS.filter(function (s) { return s.kind === 'promise'; }); }

  /* 千分位（中文頁面也用阿拉伯數字顯示天數） */
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  var CORE = { STEPS: STEPS, LAST_DEADLINE: LAST_DEADLINE, utc: utc, daysBetween: daysBetween, isoOf: isoOf,
    clockState: clockState, targetAt: targetAt, dateAt: dateAt, overdueDays: overdueDays,
    tally: tally, promises: promises, fmt: fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  else root.HVN = CORE;
})(typeof window !== 'undefined' ? window : globalThis);

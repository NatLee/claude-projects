/* ==========================================================================
 * 它是自己縮起來的 —— 純計算核心
 * 瀏覽器與 node 共用：掛在 globalThis.FeltEngine，沒有任何 DOM 依賴。
 * 模型是「示意」等級：用三項因子的相對權重重現羊毛氈化的定性行為
 * （攪動為主因、熱與濕度助長、滾筒烘乾三罪並發），不是精確的縮率預測。
 * 依據與出處寫在同資料夾的 說明.md。
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ---- 因子權重（0–1） ---- */
  var TEMP = { 20: 0.10, 30: 0.22, 40: 0.42, 60: 0.75, 90: 1.00 };
  var AGIT = { hand: 0.08, delicate: 0.30, normal: 0.70, heavy: 1.00 };
  var DRY  = { flat: 0.00, hang: 0.05, tumble: 0.85 };

  /* 氈化啟動門檻：低於此值只有可回復的「鬆弛收縮」 */
  var THRESHOLD = 0.20;
  var RELAX_MAX = 0.02;   // 鬆弛收縮的線性上限
  var FELT_MAX  = 0.40;   // 氈化的線性上限

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  /**
   * 洗衣設定 → 氈化指數與線性縮率
   * @param {{temp:number, agit:string, dry:string}} s
   * @returns {{index:number, wash:number, dryPart:number, linear:number,
   *            remain:number, reversible:boolean, verdictKey:string}}
   */
  function felting(s) {
    var t = TEMP[s.temp], a = AGIT[s.agit], d = DRY[s.dry];
    if (t === undefined || a === undefined || d === undefined) {
      throw new Error('未知的洗衣設定：' + JSON.stringify(s));
    }
    /* 沒有攪動就幾乎不氈化——熱水單獨作用不足以讓鱗片互鎖 */
    var wash = a * (0.35 + 0.65 * t);
    /* 滾筒烘乾自帶熱、翻滾與摩擦，權重再被水溫略為放大 */
    var dryPart = d * (0.55 + 0.45 * t);
    var index = clamp01(1 - (1 - wash) * (1 - dryPart));

    var linear, reversible;
    if (index < THRESHOLD) {
      linear = RELAX_MAX * (index / THRESHOLD);
      reversible = true;
    } else {
      linear = RELAX_MAX + (FELT_MAX - RELAX_MAX) * ((index - THRESHOLD) / (1 - THRESHOLD));
      reversible = false;
    }
    return {
      index: index,
      wash: wash,
      dryPart: dryPart,
      linear: linear,
      remain: 1 - linear,
      reversible: reversible,
      verdictKey: reversible ? 'relax' : (linear < 0.12 ? 'mild' : linear < 0.25 ? 'bad' : 'dead')
    };
  }

  /* ---- ISO 3758 五個位置的符號字典（本案標籤） ---- */
  var LABEL = [
    { slot: '水洗', code: 'wash30vm', name: '洗滌盆・30・雙橫線',
      plain: '最高 30°C，極輕柔行程。',
      why: '橫線是「力道」：一條＝緩和，兩條＝極緩和。兩條的意思是幾乎不要攪它。' },
    { slot: '漂白', code: 'bleachX', name: '三角形・打叉',
      plain: '不可使用任何漂白劑。',
      why: '漂白劑偏鹼，會把鱗片撐開——鱗片一開，卡榫就等著咬。' },
    { slot: '乾燥', code: 'tumbleX', name: '正方形內圓・打叉',
      plain: '不可滾筒烘乾。',
      why: '烘乾機同時給熱、翻滾與摩擦，是氈化的三個條件一次到齊。' },
    { slot: '乾燥', code: 'dryFlat', name: '正方形・水平線',
      plain: '平攤晾乾。',
      why: '濕毛衣吊起來會被自己的重量拉長；躺著晾，形狀才留得住。' },
    { slot: '熨燙', code: 'iron1', name: '熨斗・一點',
      plain: '低溫熨燙，上限約 110°C。',
      why: '點數就是溫度：一點 110°C、兩點 150°C、三點 200°C。' },
    { slot: '專業處理', code: 'dryclean', name: '圓形・P・下橫線',
      plain: '可用四氯乙烯系溶劑乾洗，緩和處理。',
      why: '圓圈是給店家看的，字母是溶劑代號，橫線一樣代表「輕一點」。' }
  ];

  /* ---- 把使用者的洗衣設定拿去對標籤 ---- */
  var TEMP_LABEL = { 20: '20°C', 30: '30°C', 40: '40°C', 60: '60°C', 90: '90°C' };
  var AGIT_LABEL = { hand: '手洗', delicate: '輕柔', normal: '標準', heavy: '強力' };
  var DRY_LABEL  = { flat: '平攤晾乾', hang: '吊掛晾乾', tumble: '滾筒烘乾' };

  /**
   * 逐條比對設定與標籤，回傳判決列表
   * @returns {Array<{item:string, yours:string, label:string, ok:boolean, note:string}>}
   */
  function verdict(s) {
    var rows = [];
    rows.push({
      item: '水溫', yours: TEMP_LABEL[s.temp], label: '30°C 以下',
      ok: s.temp <= 30,
      note: s.temp <= 30 ? '符合。' : '超標 ' + (s.temp - 30) + ' 度——鱗片在熱水裡張得更開。'
    });
    rows.push({
      item: '攪動', yours: AGIT_LABEL[s.agit], label: '極緩和（雙橫線）',
      ok: s.agit === 'hand' || s.agit === 'delicate',
      note: (s.agit === 'hand' || s.agit === 'delicate')
        ? '符合。' : '標準／強力行程的翻攪，正是把卡榫敲進去的那隻手。'
    });
    rows.push({
      item: '乾燥', yours: DRY_LABEL[s.dry], label: '平攤晾乾・不可滾筒烘乾',
      ok: s.dry === 'flat',
      note: s.dry === 'flat' ? '符合。'
        : s.dry === 'tumble' ? '標籤上那個打叉的圓圈，說的就是這一格。'
        : '吊掛不會氈化，但濕重會把它拉長變形。'
    });
    return rows;
  }

  var api = { felting: felting, verdict: verdict, LABEL: LABEL,
              TEMP: TEMP, AGIT: AGIT, DRY: DRY, THRESHOLD: THRESHOLD };
  root.FeltEngine = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

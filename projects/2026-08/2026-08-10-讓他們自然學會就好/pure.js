/* ==========================================================================
 * 「讓他們自然學會就好」——教學模擬的純函式
 *
 * 沒有 DOM、沒有計時器、沒有隨機數：同樣的輸入永遠給同樣的輸出。
 * 同一份檔案給 <script src="pure.js"> 用，也給 node 的 assert 用。
 *
 * 重要聲明（說明.md 有更長的版本）：
 * 下面的係數是「示意模型」，方向取自 Norris & Ortega (2000) 與
 * Goo et al. (2015) 的效果量比較，但數值本身是為了讓遊戲可玩而設的，
 * 不是任何研究的預測公式，不能拿去預測任何真實班級。
 * ========================================================================== */
'use strict';

var TOTAL_SHARE = 100;   /* 四種取向的課堂時間佔比，永遠加起來 100 */
var WEEK_COUNT = 12;     /* 一學期十二週 */

var KEYS = ['input', 'comm', 'fonf', 'explicit'];

var APPROACHES = [
  {
    key: 'input',
    label: '大量可理解輸入',
    tag: '輸入',
    hint: '讀得懂、聽得懂的東西，大量地泡著。Krashen 說這樣就夠了。'
  },
  {
    key: 'comm',
    label: '溝通活動',
    tag: '溝通',
    hint: '要他們把一件事講完，中間沒有人打斷。Swain 說光泡不夠，還要被逼著產出。'
  },
  {
    key: 'fonf',
    label: '順手糾正',
    tag: '順手糾正',
    hint: '話講到一半被輕輕撈回來，意思還熱著。文獻裡叫 Focus on Form。'
  },
  {
    key: 'explicit',
    label: '明確講解與練習',
    tag: '明確講解',
    hint: '先把規則講清楚，再練。文獻裡叫 Focus on FormS，也是最典型的 explicit。'
  }
];

/* --------------------------------------------------------------------------
 * 係數：每 100% 課堂時間換到多少「效果量 d」
 * 方向來源（不是數值來源）：
 *   - explicit 在離散點測驗上最強：N&O(2000) explicit d=1.13 vs implicit d=0.54
 *   - 自由產出上大家都掉下來：N&O(2000) free constructed response d=0.55
 *     （對照 selected response d=1.46、constrained constructed response d=1.20）
 *   - 光給輸入，理解力最高、產出準確度最低：加拿大 French immersion 的長期觀察
 * ------------------------------------------------------------------------ */
var COEF = {
  discrete: { input: 0.40, comm: 0.55, fonf: 1.05, explicit: 1.30 },
  free:     { input: 0.22, comm: 0.55, fonf: 0.95, explicit: 0.75 },
  comp:     { input: 1.15, comm: 0.85, fonf: 0.55, explicit: 0.35 }
};

/* 輸入門檻：可理解輸入是「必要但不充分」。低於門檻，其他東西都打折。
 * 這是模型裡唯一的非線性，也是全頁論點的支點。 */
var GATE = {
  discrete: { floor: 0.80, need: 25 },
  free:     { floor: 0.55, need: 35 },
  comp:     { floor: 1.00, need: 0 }
};

/* 顯示用的天花板（把 d 轉成 0–100 的「分數」） */
var CEIL = { discrete: 1.10, free: 0.72, comp: 1.15 };

/* 「你量什麼」：綜合分數的加權方式。
 * all      = Norris & Ortega 資料庫的實際測量組成（約九成離散點／宣告式知識測量，
 *            約一成自由產出；比例見 Doughty 2003, p.271）
 * freeOnly = 只看自由產出的研究 */
var MEASURE_MIX = {
  all:      { discrete: 0.90, free: 0.10 },
  freeOnly: { discrete: 0.00, free: 1.00 }
};

/* 疊在圖上的真實基準線（單位：Cohen's d） */
var BENCH = [
  { d: 0.54, label: '隱含式教學 d=0.54', src: 'Norris & Ortega 2000' },
  { d: 0.55, label: '自由產出測量 d=0.55', src: 'Norris & Ortega 2000' },
  { d: 0.96, label: '有焦點的教學整體 d=0.96', src: 'Norris & Ortega 2000' },
  { d: 1.13, label: '明確式教學 d=1.13', src: 'Norris & Ortega 2000' }
];

/* 兩個對照班（用來讓玩家看見「換一把尺，冠軍就換人」） */
var RIVALS = [
  { id: 'explicitClass', name: '隔壁的明確教學班', alloc: { input: 20, comm: 10, fonf: 10, explicit: 60 } },
  { id: 'inputClass',    name: '樓下的只給輸入班', alloc: { input: 70, comm: 25, fonf: 5,  explicit: 0  } }
];

var DEFAULT_ALLOC = { input: 40, comm: 25, fonf: 15, explicit: 20 };

/* ========================================================================== */
/* 基本工具                                                                    */
/* ========================================================================== */

function clampInt(v, lo, hi) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) n = lo;
  return n < lo ? lo : (n > hi ? hi : n);
}

function clampNum(v, lo, hi) {
  var n = Number(v);
  if (!isFinite(n)) n = lo;
  return n < lo ? lo : (n > hi ? hi : n);
}

function sumAlloc(alloc) {
  var s = 0;
  for (var i = 0; i < KEYS.length; i++) s += clampInt(alloc && alloc[KEYS[i]], 0, TOTAL_SHARE);
  return s;
}

/* 最大餘額法：把 total 拆成整數，加起來剛好等於 total */
function largestRemainder(weights, total) {
  var n = weights.length;
  var i;
  var sum = 0;
  for (i = 0; i < n; i++) sum += Math.max(0, weights[i]);
  var out = new Array(n);
  if (!(sum > 0)) {
    for (i = 0; i < n; i++) out[i] = 0;
    var each = Math.floor(total / n);
    for (i = 0; i < n; i++) out[i] = each;
    var left = total - each * n;
    for (i = 0; i < left; i++) out[i] += 1;
    return out;
  }
  var frac = new Array(n);
  var used = 0;
  for (i = 0; i < n; i++) {
    var exact = Math.max(0, weights[i]) * total / sum;
    out[i] = Math.floor(exact);
    frac[i] = exact - out[i];
    used += out[i];
  }
  var remain = total - used;
  var order = [];
  for (i = 0; i < n; i++) order.push(i);
  order.sort(function (a, b) {
    if (frac[b] !== frac[a]) return frac[b] - frac[a];
    return a - b;
  });
  for (i = 0; i < remain; i++) out[order[i % n]] += 1;
  return out;
}

/* 把任何東西整理成合法配置：四個整數，加起來剛好 100 */
function normalizeAlloc(raw) {
  var w = [];
  for (var i = 0; i < KEYS.length; i++) w.push(clampNum(raw && raw[KEYS[i]], 0, TOTAL_SHARE));
  var parts = largestRemainder(w, TOTAL_SHARE);
  var out = {};
  for (i = 0; i < KEYS.length; i++) out[KEYS[i]] = parts[i];
  return out;
}

/* 拉動一根滑桿：被拉的那一根拿到指定值，剩下的按原比例分給其他三根。
 * 保證回傳的四個數都是 0–100 的整數，而且加起來剛好 100。 */
function rebalance(alloc, key, value) {
  var base = normalizeAlloc(alloc);
  if (KEYS.indexOf(key) < 0) return base;
  var v = clampInt(value, 0, TOTAL_SHARE);
  var rest = TOTAL_SHARE - v;
  var others = [];
  for (var i = 0; i < KEYS.length; i++) if (KEYS[i] !== key) others.push(KEYS[i]);
  var w = [];
  for (i = 0; i < others.length; i++) w.push(base[others[i]]);
  var parts = largestRemainder(w, rest);
  var out = {};
  out[key] = v;
  for (i = 0; i < others.length; i++) out[others[i]] = parts[i];
  return out;
}

/* ========================================================================== */
/* 計分模型                                                                    */
/* ========================================================================== */

function gateValue(kind, inputShare) {
  var g = GATE[kind];
  if (!g || g.need <= 0) return 1;
  var ratio = clampNum(inputShare, 0, TOTAL_SHARE) / g.need;
  if (ratio > 1) ratio = 1;
  return g.floor + (1 - g.floor) * ratio;
}

/* 回傳三個效果量（單位：d），全部非負 */
function rawScores(alloc) {
  var a = normalizeAlloc(alloc);
  var kinds = ['discrete', 'free', 'comp'];
  var out = {};
  for (var k = 0; k < kinds.length; k++) {
    var kind = kinds[k];
    var acc = 0;
    for (var i = 0; i < KEYS.length; i++) {
      acc += COEF[kind][KEYS[i]] * (a[KEYS[i]] / TOTAL_SHARE);
    }
    var v = acc * gateValue(kind, a.input);
    out[kind] = Math.round(v * 1e6) / 1e6;
  }
  return out;
}

/* 0–100 的顯示分數 */
function displayScore(d, kind) {
  var ceil = CEIL[kind] || 1;
  var n = Math.round(100 * clampNum(d, 0, ceil * 2) / ceil);
  return clampInt(n, 0, 100);
}

function displayScores(alloc) {
  var r = rawScores(alloc);
  return {
    discrete: displayScore(r.discrete, 'discrete'),
    free: displayScore(r.free, 'free'),
    comp: displayScore(r.comp, 'comp')
  };
}

/* 綜合分數：用「你選的那把尺」把兩種測驗混起來 */
function composite(alloc, mode) {
  var mix = MEASURE_MIX[mode] || MEASURE_MIX.all;
  var r = rawScores(alloc);
  var v = mix.discrete * r.discrete + mix.free * r.free;
  return Math.round(v * 1e6) / 1e6;
}

/* 兩個對照班在某一把尺下的差距（明確班減掉只給輸入班） */
function benchGap(mode) {
  return Math.round((composite(RIVALS[0].alloc, mode) - composite(RIVALS[1].alloc, mode)) * 1e6) / 1e6;
}

/* 排名：你的班 + 兩個對照班 */
function leaderboard(alloc, mode) {
  var rows = [{ id: 'you', name: '你的班', alloc: normalizeAlloc(alloc), mine: true }];
  for (var i = 0; i < RIVALS.length; i++) {
    rows.push({ id: RIVALS[i].id, name: RIVALS[i].name, alloc: RIVALS[i].alloc, mine: false });
  }
  for (i = 0; i < rows.length; i++) rows[i].value = composite(rows[i].alloc, mode);
  rows.sort(function (a, b) {
    if (b.value !== a.value) return b.value - a.value;
    return a.id < b.id ? -1 : 1;
  });
  for (i = 0; i < rows.length; i++) rows[i].rank = i + 1;
  return rows;
}

/* ========================================================================== */
/* 敘事                                                                        */
/* ========================================================================== */

/* 把十二週分派給四種取向（最大餘額法，順序固定） */
function weekPlan(alloc) {
  var a = normalizeAlloc(alloc);
  var w = [];
  for (var i = 0; i < KEYS.length; i++) w.push(a[KEYS[i]]);
  var counts = largestRemainder(w, WEEK_COUNT);
  var slots = [];
  for (i = 0; i < KEYS.length; i++) {
    for (var j = 0; j < counts[i]; j++) slots.push(KEYS[i]);
  }
  /* 交錯排開，不要四種取向各自擠成一團 */
  var out = new Array(WEEK_COUNT);
  var pos = 0;
  var stride = 5; /* 與 12 互質，走一圈剛好蓋滿 */
  for (i = 0; i < WEEK_COUNT; i++) {
    while (out[pos] !== undefined) pos = (pos + 1) % WEEK_COUNT;
    out[pos] = slots[i];
    pos = (pos + stride) % WEEK_COUNT;
  }
  for (i = 0; i < WEEK_COUNT; i++) if (out[i] === undefined) out[i] = KEYS[0];
  return out;
}

var WEEK_POOL = {
  input: [
    '你發下第一疊讀本。教室安靜得像圖書館，你有點感動。',
    '有人把課外讀本帶回家看完了。他還不知道那個時態叫什麼。',
    '聽力材料放到第三輪，全班都聽懂了。沒有人開口。',
    '一個學生說：我看得懂，可是我講不出來。你先記在心裡。',
    '「我知道意思」這句話在班上出現的頻率高得可疑。',
    '你換了更長的文章。他們照樣讀完，照樣不說話。'
  ],
  comm: [
    '你把桌子排成圓圈。第一次分組討論，噪音是好事。',
    '有人為了講完一個笑話，硬是把句子拼了出來。全班笑了。',
    '他們講得越來越快，錯得也越來越順。',
    '一個學生連續講了九十秒，時態全部是現在式。沒有人在意。',
    '你聽見同一個錯誤第七次出現，忍住沒說。',
    '有人開始搶著發言。你發現流利跟正確是兩件事。'
  ],
  fonf: [
    '討論到一半，你只重複了一次他的句子——正確版。他停了半秒，改口。',
    '你開始在句子中間輕輕插話。他們已經習慣了，氣不會被打斷。',
    '有人講到一半自己停下來，把動詞換掉。你在教室後面小小握了個拳。',
    '你發現糾正要在意思還熱著的時候給，冷掉就沒用了。',
    '一個學生糾正了另一個學生。你什麼都沒做。',
    '你在筆記本上記：今天只撈了四次，比上週少，這是好事還是壞事。'
  ],
  explicit: [
    '你在黑板上畫了一個表格。表格很漂亮，你知道這不代表什麼。',
    '規則講完、練習做完，全班正確率九成。下課鐘響。',
    '有人舉手問例外。你講了例外。又有人舉手問例外的例外。',
    '他們把規則背起來了。你不確定他們相不相信這條規則。',
    '小考發下去，分數漂亮到讓你有點不安。',
    '你把黑板擦掉的時候想：他們等一下走出去，會用嗎。'
  ]
};

/* 條件事件：踩到就覆蓋掉那一週的原句（依序套用，後面的贏） */
function weekOverrides(a) {
  var list = [];
  if (a.explicit >= 55) {
    list.push({ week: 4, text: '有人在課本邊緣寫：「這是英文課還是數學課」。你假裝沒看到。' });
  }
  if (a.input >= 55) {
    list.push({ week: 5, text: '一個學生忽然說得很流利。時態全錯，但真的很流利。' });
  }
  if (a.explicit === 0) {
    list.push({ week: 3, text: '有人問：「為什麼這裡要用過去式？」你說：多聽就會有感覺了。他點點頭。你不確定他點的是哪個頭。' });
  }
  if (a.comm <= 5) {
    list.push({ week: 6, text: '你翻了翻紀錄：這學期到現在，沒有一個學生連續講超過十秒。' });
  }
  if (a.input <= 10) {
    list.push({ week: 8, text: '全班已經很會填空。你想不起來他們上一次讀完一整段是什麼時候。' });
  }
  if (a.fonf + a.explicit === 0) {
    list.push({ week: 9, text: '第九週了。到今天為止，沒有任何一個人被糾正過。他們非常快樂。' });
  }
  if (a.input >= 15 && a.comm >= 15 && a.fonf >= 15 && a.explicit >= 15) {
    list.push({ week: 10, text: '你這學期什麼都做了一點，也什麼都沒做滿。你不知道這樣算不算負責任。' });
  }
  list.push({
    week: 12,
    text: '最後一堂。你印好了兩份考卷：一份是選擇題跟填空，一份只有一句話——「請你講兩分鐘」。'
  });
  return list;
}

/* 十二週的旁白，純函式：同樣的配置永遠給同樣的十二行 */
function weekLines(alloc) {
  var a = normalizeAlloc(alloc);
  var plan = weekPlan(a);
  var seen = { input: 0, comm: 0, fonf: 0, explicit: 0 };
  var lines = [];
  for (var i = 0; i < WEEK_COUNT; i++) {
    var key = plan[i];
    var pool = WEEK_POOL[key];
    var text = pool[seen[key] % pool.length];
    seen[key] += 1;
    lines.push({ week: i + 1, key: key, text: text, special: false });
  }
  var ov = weekOverrides(a);
  for (i = 0; i < ov.length; i++) {
    var idx = ov[i].week - 1;
    if (idx >= 0 && idx < WEEK_COUNT) {
      lines[idx].text = ov[i].text;
      lines[idx].special = true;
    }
  }
  return lines;
}

/* 排課當下的班級狀態預覽 */
function classPreview(alloc) {
  var a = normalizeAlloc(alloc);
  var out = [];
  if (a.input >= 45) out.push('學生很享受這門課');
  if (a.input <= 10) out.push('沒有人讀懂過一整段');
  if (a.comm >= 40) out.push('教室很吵，這通常是好事');
  if (a.comm <= 5) out.push('幾乎沒有人開口說過話');
  if (a.fonf + a.explicit === 0) out.push('沒有人會被糾正');
  if (a.explicit === 0) out.push('沒有人被講解過任何規則');
  if (a.explicit >= 55) out.push('筆記很整齊，教室很安靜');
  if (a.fonf >= 40) out.push('你隨時準備打斷他們');
  if (a.input >= 15 && a.comm >= 15 && a.fonf >= 15 && a.explicit >= 15) out.push('四件事都做了一點');
  if (!out.length) out.push('一個看起來很普通的班');
  return out.slice(0, 3);
}

/* 期末講評：只講方向，不講因果 */
function resultVerdict(alloc) {
  var a = normalizeAlloc(alloc);
  var s = displayScores(a);
  var gap = s.discrete - s.free;
  if (s.comp >= 80 && s.free <= 45) {
    return '他們什麼都聽得懂，開口就垮。這正是加拿大浸潤式教室裡看了四十年的那張臉。';
  }
  if (gap >= 30) {
    return '考卷上很漂亮，開口就漏。你教出來的東西，剛好只有一種考試看得見。';
  }
  if (gap <= 5 && s.free >= 60) {
    return '兩份考卷差不多。這很難得——通常這代表你沒有只餵他們一種東西。';
  }
  if (s.discrete <= 45 && s.free <= 45) {
    return '兩邊都不高。十二週很短，而你把它押在同一個地方。';
  }
  return '兩份考卷給了你兩個不太一樣的答案。先別急著決定要相信哪一份。';
}

/* ========================================================================== */

if (typeof module === 'object' && module.exports) {
  module.exports = {
    TOTAL_SHARE: TOTAL_SHARE,
    WEEK_COUNT: WEEK_COUNT,
    KEYS: KEYS,
    APPROACHES: APPROACHES,
    COEF: COEF,
    GATE: GATE,
    CEIL: CEIL,
    MEASURE_MIX: MEASURE_MIX,
    BENCH: BENCH,
    RIVALS: RIVALS,
    DEFAULT_ALLOC: DEFAULT_ALLOC,
    clampInt: clampInt,
    clampNum: clampNum,
    sumAlloc: sumAlloc,
    largestRemainder: largestRemainder,
    normalizeAlloc: normalizeAlloc,
    rebalance: rebalance,
    gateValue: gateValue,
    rawScores: rawScores,
    displayScore: displayScore,
    displayScores: displayScores,
    composite: composite,
    benchGap: benchGap,
    leaderboard: leaderboard,
    weekPlan: weekPlan,
    weekLines: weekLines,
    classPreview: classPreview,
    resultVerdict: resultVerdict
  };
}

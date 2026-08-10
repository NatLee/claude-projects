/* ==========================================================================
 * 純函式：三種字幕模式 × 三個目標的評分表、指標條長度換算、個人化處方產生器
 *
 * 重要聲明（說明.md 有更長的版本）：
 * SCORES 裡的 0–100 不是任何一份研究的原始數字，也不是效果量換算。
 * 它們是「多份研究的相對排序示意值」——我把各研究的方向與效果量大小排成順序，
 * 再拉開成好讀的長度。可以拿來比大小，不能拿來當數據引用。
 * 每一格都附一個 tier（strong / medium / mixed / thin）標示證據強度，
 * thin 就是我判定證據不足的地方，頁面上會照實標出來。
 *
 * 同時給 <script src="pure.js"> 與 node（測試）使用。
 * ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
 * 一、三種模式與三個目標
 * -------------------------------------------------------------------------- */

var MODES = [
  { key: 'none', name: '不開', en: 'no subtitles', hint: '只有聲音和畫面' },
  { key: 'l2',   name: '英文字幕', en: 'captions', hint: '文字和語音同一種語言' },
  { key: 'l1',   name: '中文字幕', en: 'subtitles', hint: '母語翻譯' }
];

var GOALS = [
  { key: 'plot',  name: '當下聽懂這一集', short: '看懂劇情' },
  { key: 'vocab', name: '學到新單字',     short: '學單字' },
  { key: 'ear',   name: '長期把耳朵練起來', short: '訓練聽力' }
];

var MODE_KEYS = ['none', 'l2', 'l1'];
var GOAL_KEYS = ['plot', 'vocab', 'ear'];

/* 相對排序示意值（0–100）。三個目標各有不同的贏家，這不是我排的，是研究排的。 */
var SCORES = {
  none: { plot: 40, vocab: 25, ear: 70 },
  l2:   { plot: 78, vocab: 62, ear: 55 },
  l1:   { plot: 95, vocab: 48, ear: 30 }
};

/* 每一格的研究依據與證據強度 */
var CELL = {
  none: {
    plot: {
      tier: 'strong',
      line: '沒有任何文字撐著你。Pujadas 與 Muñoz（2024）讓 250 位 A1 到 C2 的學習者看同一部影集九集，有字幕的那幾集理解答對率顯著較高，而且這個優勢在幾乎每個程度都在。',
      cite: 'Pujadas & Muñoz (2024), SSLLT 14(3)'
    },
    vocab: {
      tier: 'medium',
      line: '不是零。Sutton 與 Webb 的後設分析（56 個實驗、75 個效果量、n = 1,954）算出：光是「看影片」這件事本身對 L2 學習就有 g = 1.01。畫面、情境、一再出現的詞，本來就在教你——只是慢。',
      cite: 'Sutton & Webb, SSLA（audiovisual input 後設分析）'
    },
    ear: {
      tier: 'thin',
      line: '這是唯一一個逼你全程只用耳朵的模式。但「只用耳朵，所以耳朵會變好」這句話本身缺乏長期對照實驗。它是合理的推論，不是被測出來的結論——這一格我給它最高分，同時承認它證據最薄。',
      cite: '本頁判定：證據不足'
    }
  },
  l2: {
    plot: {
      tier: 'strong',
      line: 'Montero Perez、Van Den Noortgate 與 Desmet（2013）從三十年文獻裡篩出 18 份研究，其中 15 份做聽力理解的後設分析，得到大的效果量；測驗型態會調節這個效果（接受性測驗大，產出性測驗中等且不顯著）。',
      cite: 'Montero Perez et al. (2013), System 41(3), 720–739'
    },
    vocab: {
      tier: 'strong',
      line: 'Kurokawa、Hein 與 Uchihara（2025）整合 49 份研究、89 個效果量：英文字幕對附帶詞彙學習 g = 0.56。拆開看，「認得出這個字的書面形式」效果最大（g = 0.74），「說得出意思」最小（g = 0.37）。字幕主要教你字長什麼樣。',
      cite: 'Kurokawa, Hein & Uchihara (2025), Language Learning 75(4)'
    },
    ear: {
      tier: 'thin',
      line: '英文字幕是三種模式裡唯一同時給你聲音和 L2 書寫形式的。但眼動研究一再顯示：字幕在的時候，眼睛會大量停在字幕上。它到底有沒有讓你「以後不看字幕也聽得懂」，目前沒有夠格的長期對照證據。',
      cite: '本頁判定：證據不足'
    }
  },
  l1: {
    plot: {
      tier: 'medium',
      line: '母語翻譯把劇情理解直接推到見底。Markham、Peter 與 McCarthy（2001）比較母語字幕、目標語字幕與無字幕，母語字幕組的內容理解最好。這一格是三種模式裡唯一的滿分，而且它應該是滿分。',
      cite: 'Markham, Peter & McCarthy (2001), Foreign Language Annals 34(5)'
    },
    vocab: {
      tier: 'mixed',
      line: '這一格最常被誤會。Chen（2025）用四週介入比較 L2／L1／雙語字幕：立即詞彙測驗上雙語字幕最強、中文字幕次之，兩者都贏過完全不開。中文字幕確實有用——它給你意思，只是不給你那個字長什麼樣、在語流裡從哪裡斷開。',
      cite: 'Chen (2025), System 132, 103709'
    },
    ear: {
      tier: 'thin',
      line: '直覺說中文字幕會害了你的耳朵。但「長期依賴母語字幕會壓抑聽力發展」這個講法，到今天沒有一份長期對照實驗真的把它測出來。這一格的分數是全表最不確定的一格，我把它擺低，是根據機制推論，不是根據數據。',
      cite: '本頁判定：證據不足'
    }
  }
};

var TIER_LABEL = {
  strong: '證據強',
  medium: '證據中等',
  mixed:  '研究結果不一致',
  thin:   '證據不足'
};

/* --------------------------------------------------------------------------
 * 二、查表與指標條
 * -------------------------------------------------------------------------- */

function score(mode, goal) {
  if (!SCORES[mode] || typeof SCORES[mode][goal] !== 'number') return null;
  return SCORES[mode][goal];
}

function cell(mode, goal) {
  if (!CELL[mode] || !CELL[mode][goal]) return null;
  return CELL[mode][goal];
}

/* 指標條長度換算：0–100 的示意值 → 0–max 的像素／百分比長度 */
function barLen(value, max) {
  var m = (typeof max === 'number' && max > 0) ? max : 100;
  var v = (typeof value === 'number' && isFinite(value)) ? value : 0;
  if (v < 0) v = 0;
  if (v > 100) v = 100;
  return Math.round((v / 100) * m * 1000) / 1000;
}

/* 某個目標上三種模式的排名（由高到低） */
function rankModes(goal) {
  var arr = MODE_KEYS.slice();
  arr.sort(function (a, b) {
    var d = score(b, goal) - score(a, goal);
    if (d !== 0) return d;
    return MODE_KEYS.indexOf(a) - MODE_KEYS.indexOf(b);
  });
  return arr;
}

function winnerOf(goal) {
  return rankModes(goal)[0];
}

/* 某模式在某目標上排第幾（1 起算） */
function rankOf(mode, goal) {
  return rankModes(goal).indexOf(mode) + 1;
}

/* 某個模式的「強項排序」：先看它在那一項贏過其他模式幾名，同名次再比分數。
 * 這是指標條重排的依據——按下哪一顆按鈕，那顆按鈕最擅長的事就會浮到最上面。 */
function goalOrder(mode) {
  var arr = GOAL_KEYS.slice();
  arr.sort(function (a, b) {
    var d = rankOf(mode, a) - rankOf(mode, b);
    if (d !== 0) return d;
    d = score(mode, b) - score(mode, a);
    if (d !== 0) return d;
    return GOAL_KEYS.indexOf(a) - GOAL_KEYS.indexOf(b);
  });
  return arr;
}

/* 某目標在該模式的強項排序中排第幾（1 起算） */
function goalSlot(mode, goal) {
  return goalOrder(mode).indexOf(goal) + 1;
}

/* 有沒有任何一種模式三項全勝？（答案必須是 false，這是全頁的重點） */
function anyModeSweeps() {
  for (var i = 0; i < MODE_KEYS.length; i++) {
    var m = MODE_KEYS[i], all = true;
    for (var j = 0; j < GOAL_KEYS.length; j++) {
      if (winnerOf(GOAL_KEYS[j]) !== m) { all = false; break; }
    }
    if (all) return true;
  }
  return false;
}

/* --------------------------------------------------------------------------
 * 三、押注開獎
 * 題目：「哪一種會讓你在這一集裡學到最多單字？」
 * -------------------------------------------------------------------------- */

var BET_GOAL = 'vocab';

var BET_TEXT = {
  none: '你押了「不開」。這是最有骨氣、也是輸最慘的一注。不開字幕不代表你在鍛鍊什麼，只代表輸入變模糊了——聽不出來的字，不會因為你咬牙就自己浮出來。',
  l2:   '你押對了。而且很多人不會這樣押，因為英文字幕看起來「兩邊都不討好」：沒有中文好懂，又不像全關那麼像在練功。它贏在一件很具體的事——它是唯一會把那個字「長什麼樣」寫給你看的模式。',
  l1:   '你押了「中文字幕」。錯，但錯得很有道理：中文字幕確實比完全不開更會讓你學到字（Chen 2025 就是這樣的結果）。它輸在它給的是意思，不是形式——你懂了那句話，卻沒看見那個字。'
};

function betVerdict(pick) {
  var right = winnerOf(BET_GOAL);
  var ok = (pick === right);
  return {
    pick: pick,
    correct: ok,
    answer: right,
    text: BET_TEXT[pick] || '',
    scores: {
      none: score('none', BET_GOAL),
      l2: score('l2', BET_GOAL),
      l1: score('l1', BET_GOAL)
    }
  };
}

/* --------------------------------------------------------------------------
 * 四、處方產生器
 * 輸入：goal（plot / vocab / ear）、passes（1 / 2 / 3）、level（low / mid / high）
 * 共 27 種組合，全部由規則覆蓋，不查表。
 * -------------------------------------------------------------------------- */

var RX_GOALS  = ['plot', 'vocab', 'ear'];
var RX_PASSES = [1, 2, 3];
var RX_LEVELS = ['low', 'mid', 'high'];

var LEVEL_NAME = { low: '三成以下', mid: '一半上下', high: '八成以上' };
var GOAL_NAME  = { plot: '看懂這一集', vocab: '學到單字', ear: '把耳朵練起來' };

/* 每一遍要開哪一種字幕。三條規則：
 *  1. 第一遍 = 讓自己看得懂的最低劑量（聽不懂就沒有輸入，這一點沒得商量）。
 *  2. 最後一遍 = 把拐杖放下；但如果第一遍就已經全關，最後一遍改開英文字幕核對。
 *  3. 三遍的中間那一遍 = 英文字幕（唯一同時給聲音與 L2 書寫形式的模式）。
 */
function planModes(goal, level, passes) {
  var first;
  if (level === 'low') first = 'l1';
  else if (goal === 'ear') first = 'none';
  else if (goal === 'plot' && level === 'mid') first = 'l1';
  else first = 'l2';

  if (passes === 1) return [first];

  var last = 'none';
  if (first === 'none') last = 'l2';
  else if (goal === 'vocab' && first === 'l1') last = 'l2';

  if (passes === 2) return [first, last];
  return [first, 'l2', 'none'];
}

/* 每一遍的動作與依據 */
function stepDetail(mode, index, total, goal, level) {
  var isFirst = (index === 1);
  var isLast  = (index === total);

  if (mode === 'l1') {
    return {
      action: total === 1
        ? '中文字幕，一路看到底，不要暫停。'
        : '中文字幕，把整集劇情吃下來。不要抄單字，不要暫停，看爽的。',
      why: total === 1
        ? '你只有一遍，理解跟學習只能二選一。Markham、Peter 與 McCarthy（2001）的比較裡，母語字幕的內容理解最好——這一遍就讓它做它最強的事。'
        : '這一遍是地基。Wi 與 Boers（2024）主張的正是這個順序：先用母語字幕把內容弄懂，第二遍再換目標語字幕，兩種字幕各做各的事。Yuan 等人（2025）從認知負荷的角度也得到同方向的結果。',
      cite: total === 1
        ? 'Markham, Peter & McCarthy (2001), Foreign Language Annals 34(5)'
        : 'Wi & Boers (2024), TESOL Quarterly；Yuan et al. (2025), BJEP',
      tier: total === 1 ? 'medium' : 'medium'
    };
  }

  if (mode === 'l2') {
    if (isLast && !isFirst) {
      return {
        action: '英文字幕，這一遍請看著字幕聽。剛剛聽漏的地方，現在對答案。',
        why: '英文字幕是三種模式裡唯一同時給你聲音和 L2 書寫形式的。Kurokawa 等人（2025）的後設分析裡，字幕效果最大的一格正是「認得出這個字的書面形式」（g = 0.74）——那正是你剛剛裸聽時抓不住的東西。',
        cite: 'Kurokawa, Hein & Uchihara (2025), Language Learning 75(4)',
        tier: 'strong'
      };
    }
    return {
      action: isFirst
        ? '英文字幕，正常速度看完。看不懂的地方讓它過去。'
        : '英文字幕，這一遍開始把聲音和字對起來。想倒帶就倒帶。',
      why: isFirst
        ? 'Kurokawa 等人（2025）整合 49 份研究：英文字幕對附帶詞彙學習 g = 0.56。同一份分析也提醒你別期待太高——影集這個類型只有 g = 0.44，對母語者拍的內容是 g = 0.46。有效，但不是奇蹟。'
        : '劇情已經在你腦子裡了，這一遍的認知資源才空得出來給語言本身。Kurokawa 與 Uchihara（2026）的重複觀看研究支持多看一遍，但也發現延宕測驗的成績主要被「這個字出現幾次」和你原有的字彙量決定。',
      cite: isFirst
        ? 'Kurokawa, Hein & Uchihara (2025), Language Learning 75(4)'
        : 'Kurokawa & Uchihara (2026), TESOL Quarterly',
      tier: 'strong'
    };
  }

  /* none */
  if (isFirst) {
    return {
      action: '全部關掉，裸聽一遍。聽不懂的地方不要倒帶，記住那個「卡住」的感覺就好。',
      why: '你已經聽得懂大半了。Pujadas 與 Muñoz（2024）在 250 位 A1–C2 學習者身上發現：到了 C2，字幕對理解的額外幫助已經不顯著——存在一個門檻，過了那個門檻，關掉字幕不會讓你看不懂。',
      cite: 'Pujadas & Muñoz (2024), SSLLT 14(3), 545–570',
      tier: 'strong'
    };
  }
  return {
    action: '關掉字幕，重看一次。不用整集——挑最難的那五分鐘就好。',
    why: '這一遍是驗收，不是學習。前面幾遍你認得的是字的樣子，這一遍檢查的是它有沒有變成聲音。老實說：「字幕看熟了之後關掉重看，聽力就會轉過去」這件事，目前沒有夠格的長期對照實驗支持。我還是建議你做，因為代價只有五分鐘。',
    cite: '本頁判定：證據不足（機制上合理，但缺乏長期實驗）',
    tier: 'thin'
  };
}

function lookupAdvice(goal, level) {
  if (goal === 'plot') {
    return {
      text: '不要查。一個字都不要查。你今天的目標是把這一集看完並且看懂，查字典會把你踢出故事，而故事本身就是你之所以還在看的唯一理由。',
      cite: '這一條沒有實驗依據，是取捨：查單字的代價是理解的連貫性。'
    };
  }
  if (goal === 'vocab') {
    return {
      text: '看的當下不要停。整集看完之後，回頭挑三到五個「出現過不只一次」的字去查——不是挑最難的，是挑最常出現的。',
      cite: 'Kurokawa 與 Uchihara（2026）發現延宕測驗的成績主要受目標詞出現頻率與原有字彙量影響；Kurokawa 等人（2025）也顯示字幕最擅長讓你「認得書面形式」，意思那一半要你自己補。'
    };
  }
  return {
    text: '只查一種字：你聽了三次還是切不出來、但看到拼字之後「啊原來是這個」的那種。那不是你不會這個字，那是你的耳朵還沒把它接上。',
    cite: '這一條的依據最弱：字幕能提供聲音與拼字的對應，但「補上這個對應之後聽力會不會遷移」缺乏長期證據。'
  };
}

function buildWarnings(goal, level, passes, modes) {
  var w = [];

  if (level === 'low') {
    w.push({
      kind: 'material',
      text: '素材可能太難了。Kurokawa 等人（2025）發現一個很少被提起的調節變項：為母語者拍的影片，字幕的詞彙效果只有 g = 0.46；為學習者製作的影片是 g = 1.04，差了一倍多。聽不懂七成的時候，換一部簡單的比調字幕有用得多。'
    });
  }
  if (passes === 1 && goal !== 'plot') {
    w.push({
      kind: 'budget',
      text: '你只給這一集一遍，卻想要「' + GOAL_NAME[goal] + '」。這兩件事對不上。一遍的預算，最誠實的產出是看懂劇情；要單字或耳朵，得再加一遍。'
    });
  }
  if (goal === 'vocab' && modes.indexOf('l2') < 0) {
    w.push({
      kind: 'conflict',
      text: '注意：你的目標是學單字，但這份處方裡沒有任何一遍是英文字幕——因為以你現在的理解程度，開英文字幕會讓你連劇情都跟丟。這是刻意的取捨，代價是這一集的單字收穫會很小。'
    });
  }
  if (goal === 'ear' && modes.indexOf('none') < 0) {
    w.push({
      kind: 'conflict',
      text: '注意：你的目標是練耳朵，但這份處方裡沒有任何一遍是全關——因為你現在聽得懂的比例太低，關掉字幕不會變成訓練，只會變成空轉。先把理解拉上來，再談關字幕。'
    });
  }
  if (level === 'high' && goal !== 'ear') {
    w.push({
      kind: 'threshold',
      text: '你可能已經過了那個門檻。Pujadas 與 Muñoz（2024）發現到 C2 水準，字幕對理解的額外幫助不再顯著。如果你發現自己開字幕只是習慣，那就是可以放下的訊號。'
    });
  }
  if (!w.length) {
    w.push({
      kind: 'general',
      text: '沒有特別要警告你的。唯一要記得的是：這份處方只對「這一集」有效，下一集你的程度和目標可能都變了，就重排一次。'
    });
  }
  return w;
}

function summarize(goal, level, passes, modes) {
  var names = modes.map(function (m) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].key === m) return MODES[i].name;
    return m;
  });
  return '你聽得懂 ' + LEVEL_NAME[level] + '，這一集打算看 ' + passes + ' 遍，想要的是「' +
    GOAL_NAME[goal] + '」。處方：' + names.join(' → ') + '。';
}

var HEADLINE = {
  plot:  '先把故事拿回來',
  vocab: '把字看清楚，不是把意思看懂',
  ear:   '讓耳朵先撞牆，再給它答案'
};

function prescribe(opts) {
  var o = opts || {};
  var goal   = RX_GOALS.indexOf(o.goal) >= 0 ? o.goal : 'plot';
  var level  = RX_LEVELS.indexOf(o.level) >= 0 ? o.level : 'mid';
  var passes = RX_PASSES.indexOf(o.passes) >= 0 ? o.passes : 1;

  var modes = planModes(goal, level, passes);
  var steps = modes.map(function (m, i) {
    var d = stepDetail(m, i + 1, passes, goal, level);
    return {
      pass: i + 1,
      mode: m,
      action: d.action,
      why: d.why,
      cite: d.cite,
      tier: d.tier
    };
  });

  return {
    goal: goal,
    level: level,
    passes: passes,
    headline: HEADLINE[goal],
    summary: summarize(goal, level, passes, modes),
    steps: steps,
    lookup: lookupAdvice(goal, level),
    warnings: buildWarnings(goal, level, passes, modes)
  };
}

/* 窮舉：27 種輸入組合 */
function allCombos() {
  var out = [];
  for (var a = 0; a < RX_GOALS.length; a++) {
    for (var b = 0; b < RX_PASSES.length; b++) {
      for (var c = 0; c < RX_LEVELS.length; c++) {
        out.push({ goal: RX_GOALS[a], passes: RX_PASSES[b], level: RX_LEVELS[c] });
      }
    }
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MODES: MODES, GOALS: GOALS, MODE_KEYS: MODE_KEYS, GOAL_KEYS: GOAL_KEYS,
    SCORES: SCORES, CELL: CELL, TIER_LABEL: TIER_LABEL,
    score: score, cell: cell, barLen: barLen,
    rankModes: rankModes, winnerOf: winnerOf, rankOf: rankOf,
    goalOrder: goalOrder, goalSlot: goalSlot, anyModeSweeps: anyModeSweeps,
    BET_GOAL: BET_GOAL, betVerdict: betVerdict,
    RX_GOALS: RX_GOALS, RX_PASSES: RX_PASSES, RX_LEVELS: RX_LEVELS,
    LEVEL_NAME: LEVEL_NAME, GOAL_NAME: GOAL_NAME,
    planModes: planModes, stepDetail: stepDetail, lookupAdvice: lookupAdvice,
    buildWarnings: buildWarnings, prescribe: prescribe, allCombos: allCombos
  };
}

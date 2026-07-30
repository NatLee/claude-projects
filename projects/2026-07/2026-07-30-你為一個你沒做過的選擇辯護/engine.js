/*!
 * engine.js — 選擇盲視（choice blindness）紙牌把戲的純函式
 *
 * 這裡只有邏輯與資料，不碰 DOM、不碰時間、不讀 localStorage。
 * 同一顆種子永遠產生同一副牌，方便測試與重現。
 *
 * 主要能力：
 *   1. 卡片目錄（每張有唯一 id、名稱、可辨識特徵、以及針對它寫的理由選項）
 *   2. 洗牌與配對（暖色 × 冷色，讓兩張牌一定看得出差別）
 *   3. 決定「哪一輪要掉包」
 *   4. 把使用者的點擊對應到「實際被遞回來的那張卡」
 *   5. 計分與統計
 */
var ChoiceBlind = (function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 卡片目錄
   * family: 'warm' / 'cool'，配對時一暖一冷，確保兩張牌好分辨
   * palette: [主色, 亮色, 暗色]
   * reasons: 針對「這張卡」寫的理由，提到顏色、形狀、對稱性
   * ------------------------------------------------------------------ */
  var CARDS = [
    {
      id: 'ring', name: '赤環', family: 'warm',
      hue: '暖紅', shape: '同心圓', sym: '完全對稱',
      palette: ['#d9452f', '#f3a35c', '#7c2114'],
      reasons: [
        '一圈一圈往中間收，看久了會被吸進去。',
        '它完全對稱，怎麼轉都一樣，看起來很穩。',
        '這張的紅色是暖的，另一張太冷了。'
      ]
    },
    {
      id: 'stair', name: '靛階', family: 'cool',
      hue: '靛藍', shape: '階梯', sym: '斜向不對稱',
      palette: ['#3f63c9', '#7fa6f2', '#1b2f66'],
      reasons: [
        '那幾階一直往上走，有種要去哪裡的感覺。',
        '它不對稱，反而比較有個性。',
        '藍色乾淨，看久了不吵。'
      ]
    },
    {
      id: 'lattice', name: '苔紋', family: 'cool',
      hue: '苔綠', shape: '編織格紋', sym: '四方對稱',
      palette: ['#3f8f6a', '#8fd0a8', '#1d4a36'],
      reasons: [
        '格子交錯編在一起，像老房子的窗花。',
        '綠色看起來最舒服，眼睛不會累。',
        '它排得很整齊，讓人覺得可靠。'
      ]
    },
    {
      id: 'star', name: '曜星', family: 'cool',
      hue: '深紫', shape: '八芒星', sym: '八重對稱',
      palette: ['#7d4fd1', '#b593f5', '#3a1f6b'],
      reasons: [
        '八個角往外射出去，像真的在發光。',
        '深紫色比較神祕，另一張太直白了。',
        '尖角很銳利，我喜歡有稜有角的東西。'
      ]
    },
    {
      id: 'arc', name: '琥珀弧', family: 'warm',
      hue: '琥珀金', shape: '疊弧', sym: '左右鏡射',
      palette: ['#c98d1e', '#f0c664', '#6d4a08'],
      reasons: [
        '那幾道弧線很順，像一筆畫出來的。',
        '金色看起來比較貴氣。',
        '它左右對稱，中間卻空著，留白剛剛好。'
      ]
    },
    {
      id: 'prism', name: '霜稜', family: 'cool',
      hue: '冰藍', shape: '三角切面', sym: '三角對稱',
      palette: ['#3aa3bd', '#9fdcec', '#164e5e'],
      reasons: [
        '切面像玻璃，光好像會折進去。',
        '冷色調很清爽，另一張太熱鬧了。',
        '三角形最有力量，站得住。'
      ]
    },
    {
      id: 'dots', name: '桑葚點', family: 'warm',
      hue: '洋紅', shape: '六角點陣', sym: '放射對稱',
      palette: ['#c8347f', '#f286bd', '#6c1441'],
      reasons: [
        '一整片點散開來，像剛剛才炸開。',
        '洋紅色會跳出來，一眼就先看到它。',
        '它沒有半條線，只有點，很乾淨。'
      ]
    },
    {
      id: 'wave', name: '麥浪', family: 'warm',
      hue: '麥黃', shape: '波紋', sym: '水平重複',
      palette: ['#c9a227', '#efd77a', '#6b5310'],
      reasons: [
        '線條一直在起伏，看起來會動。',
        '黃色讓人心情好一點。',
        '重複的東西讓我安心。'
      ]
    },
    {
      id: 'ink', name: '墨方', family: 'cool',
      hue: '墨黑', shape: '旋轉方框', sym: '旋轉對稱',
      palette: ['#2f4a52', '#7ea7b0', '#16272c'],
      reasons: [
        '方塊轉了一個角度，剛好把規矩打破。',
        '黑色最耐看，其他顏色遲早會膩。',
        '一層套一層，看起來很有深度。'
      ]
    },
    {
      id: 'spiral', name: '硃砂螺', family: 'warm',
      hue: '硃砂', shape: '螺旋', sym: '旋轉不對稱',
      palette: ['#d4506b', '#f79bad', '#75182f'],
      reasons: [
        '螺旋一直繞出去，好像沒有要停。',
        '粉紅裡帶一點紅，這個顏色很特別。',
        '它是唯一一張看起來在轉的。'
      ]
    }
  ];

  /* 2005 年那場實驗的關鍵數字（供文案與統計對照使用） */
  var RESEARCH = {
    year: 2005,
    detectRate: 0.13,   // 只有 13% 的受試者察覺卡片被換掉
    missRate: 0.87      // 其餘約 87% 會替一個自己沒做過的決定提出理由
  };

  /* ------------------------------------------------------------------ *
   * 亂數：可指定種子，讓同一顆種子產生完全相同的牌組
   * ------------------------------------------------------------------ */
  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) {
      var n = Math.floor(Math.abs(seed)) >>> 0;
      return n === 0 ? 0x9e3779b9 : n;
    }
    var s = String(seed == null ? 'choiceblind' : seed);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h >>> 0) || 0x9e3779b9;
  }

  function makeRng(seed) {
    var a = hashSeed(seed);
    return function rng() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Fisher–Yates，回傳新陣列，不動原本的 */
  function shuffle(list, rng) {
    var arr = Array.isArray(list) ? list.slice() : [];
    if (typeof rng !== 'function') rng = makeRng('choiceblind');
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      if (j < 0) j = 0;
      if (j > i) j = i;
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /* ------------------------------------------------------------------ *
   * 卡片查詢
   * ------------------------------------------------------------------ */
  function allCards() { return CARDS.slice(); }

  function cardById(id) {
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i].id === id) return CARDS[i];
    }
    return null;
  }

  function describeCard(card) {
    if (!card) return '';
    return card.name + '（' + card.hue + '・' + card.shape + '・' + card.sym + '）';
  }

  function familyOf(name) {
    var out = [];
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i].family === name) out.push(CARDS[i]);
    }
    return out;
  }

  /* 一副牌最多能發幾輪（一輪吃掉一暖一冷） */
  function maxRounds() {
    return Math.min(familyOf('warm').length, familyOf('cool').length);
  }

  /* ------------------------------------------------------------------ *
   * 發牌：每一輪一張暖色、一張冷色，左右位置也由種子決定
   * ------------------------------------------------------------------ */
  function buildDeck(seed, rounds) {
    var cap = maxRounds();
    var n = Math.floor(Number(rounds));
    if (!isFinite(n) || n < 1) n = 4;
    if (n > cap) n = cap;

    var rng = makeRng(seed);
    var warm = shuffle(familyOf('warm'), rng);
    var cool = shuffle(familyOf('cool'), rng);

    var deck = [];
    for (var i = 0; i < n; i++) {
      var a = warm[i], b = cool[i];
      var leftIsWarm = rng() < 0.5;
      deck.push({
        round: i + 1,
        left: leftIsWarm ? a : b,
        right: leftIsWarm ? b : a
      });
    }
    return deck;
  }

  /* ------------------------------------------------------------------ *
   * 哪一輪要掉包
   * mode 'last'（預設）：最後一輪，故事需要高潮壓軸
   * mode 'random'：從第二輪之後隨機挑一輪（同一顆種子結果固定）
   * ------------------------------------------------------------------ */
  function swapRoundFor(seed, totalRounds, mode) {
    var n = Math.floor(Number(totalRounds));
    if (!isFinite(n) || n < 1) return 0;
    if (mode !== 'random' || n < 2) return n;
    var rng = makeRng(String(seed) + '::swap');
    var idx = 2 + Math.floor(rng() * (n - 1));
    if (idx < 2) idx = 2;
    if (idx > n) idx = n;
    return idx;
  }

  function otherSide(side) { return side === 'right' ? 'left' : 'right'; }

  function normalizeSide(side) {
    return side === 'right' ? 'right' : 'left';
  }

  /* ------------------------------------------------------------------ *
   * 把使用者的點擊，對應到「實際被遞回來的那張卡」
   * 掉包輪：遞回的一定是另一張；非掉包輪：遞回的一定就是你點的那張。
   * ------------------------------------------------------------------ */
  function handBack(pair, pickedSide, isSwapRound) {
    if (!pair || !pair.left || !pair.right) return null;
    var picked = normalizeSide(pickedSide);
    var swapped = !!isSwapRound;
    var shown = swapped ? otherSide(picked) : picked;
    return {
      round: pair.round || 0,
      pickedSide: picked,
      pickedCard: pair[picked],
      shownSide: shown,
      shownCard: pair[shown],
      swapped: swapped
    };
  }

  /* 走完一整輪：從牌組取出該輪，算出遞回的是哪一張 */
  function playRound(deck, roundNo, pickedSide, swapRound) {
    var list = Array.isArray(deck) ? deck : [];
    var n = Math.floor(Number(roundNo));
    var pair = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].round === n) { pair = list[i]; break; }
    }
    if (!pair) return null;
    return handBack(pair, pickedSide, n === Math.floor(Number(swapRound)));
  }

  /* ------------------------------------------------------------------ *
   * 理由選項：永遠是「針對遞回來的那張卡」寫的
   * ------------------------------------------------------------------ */
  function reasonsFor(card, seed) {
    if (!card || !Array.isArray(card.reasons)) return [];
    return shuffle(card.reasons, makeRng(String(seed) + '::' + card.id));
  }

  /* 把一輪的結果整理成一筆紀錄 */
  function makeRecord(hand, reason, detected) {
    if (!hand) return null;
    var text = typeof reason === 'string' ? reason.trim() : '';
    return {
      round: hand.round || 0,
      pickedId: hand.pickedCard ? hand.pickedCard.id : '',
      pickedName: hand.pickedCard ? hand.pickedCard.name : '',
      shownId: hand.shownCard ? hand.shownCard.id : '',
      shownName: hand.shownCard ? hand.shownCard.name : '',
      swapped: !!hand.swapped,
      detected: !!detected,
      reason: text,
      defended: !!hand.swapped && !detected && text.length > 0
    };
  }

  /* ------------------------------------------------------------------ *
   * 統計：0 輪、全發現、全沒發現，都不能吐出 NaN
   * ------------------------------------------------------------------ */
  function safeRatio(a, b) {
    var x = Number(a), y = Number(b);
    if (!isFinite(x) || !isFinite(y) || y === 0) return 0;
    var r = x / y;
    return isFinite(r) ? r : 0;
  }

  function toPct(ratio) {
    var r = Number(ratio);
    if (!isFinite(r)) return 0;
    var p = Math.round(r * 100);
    return isFinite(p) ? p : 0;
  }

  function summarize(records) {
    var list = Array.isArray(records) ? records : [];
    var rounds = 0, swapped = 0, honest = 0, detected = 0, defended = 0, reasoned = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || typeof r !== 'object') continue;
      rounds++;
      if (r.swapped) {
        swapped++;
        if (r.detected) detected++;
        if (r.defended) defended++;
      } else {
        honest++;
      }
      if (typeof r.reason === 'string' && r.reason.length > 0) reasoned++;
    }
    var detectRate = safeRatio(detected, swapped);
    var defendRate = safeRatio(defended, swapped);
    return {
      rounds: rounds,
      honestRounds: honest,
      swappedRounds: swapped,
      detected: detected,
      defended: defended,
      reasoned: reasoned,
      detectRate: detectRate,
      defendRate: defendRate,
      detectPct: toPct(detectRate),
      defendPct: toPct(defendRate)
    };
  }

  /* 一句話結論，兩條路都有話講 */
  function verdictText(stats) {
    var s = stats && typeof stats === 'object' ? stats : summarize([]);
    if (s.swappedRounds === 0) return '這一局還沒走到那一輪。';
    if (s.detected > 0) return '你當場發現牌被換掉了——2005 年那場實驗裡，只有 13% 的人做到。';
    if (s.defended > 0) return '你替一個你沒做過的選擇辯護了。當年約有 87% 的人跟你一樣。';
    return '牌被換掉了，而你沒有說出理由。';
  }

  return {
    CARDS: CARDS,
    RESEARCH: RESEARCH,
    hashSeed: hashSeed,
    makeRng: makeRng,
    shuffle: shuffle,
    allCards: allCards,
    cardById: cardById,
    describeCard: describeCard,
    familyOf: familyOf,
    maxRounds: maxRounds,
    buildDeck: buildDeck,
    swapRoundFor: swapRoundFor,
    otherSide: otherSide,
    handBack: handBack,
    playRound: playRound,
    reasonsFor: reasonsFor,
    makeRecord: makeRecord,
    safeRatio: safeRatio,
    toPct: toPct,
    summarize: summarize,
    verdictText: verdictText
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChoiceBlind;
}

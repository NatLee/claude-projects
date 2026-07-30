/*!
 * math.js —— 「平均報酬騙了你」的純函式核心
 *
 * ── 單位約定（全檔一致，請勿混用）──────────────────────────
 *   報酬一律使用「小數」表示：
 *     +25%  →  0.25
 *     -50%  →  -0.5
 *      0%   →  0
 *   合法範圍是 r >= -1（-1 代表 -100%，資產歸零）。
 *   小於 -1 的報酬在現實中不存在（不可能賠掉超過本金的全部），視為非法輸入。
 *   百分比 ↔ 小數的轉換由呼叫端（UI）負責，這裡只認小數。
 *
 * ── 邊界約定 ──────────────────────────────────────────────
 *   空陣列：平均類函式回傳 null（「沒有資料」不等於「平均是 0」）；
 *           finalValue 回傳本金（零年沒有任何變化）。
 *   -100%： 之後不論怎麼漲都是 0，函式自然得出 0，不做特例。
 *   非法值：丟出 TypeError / RangeError，由呼叫端捕捉。
 *
 * 本檔不碰 DOM、不讀寫全域狀態，瀏覽器與 node 都能用。
 */
(function (root) {
  'use strict';

  /**
   * 把浮點誤差修掉到小數第 12 位。
   * 例：0.9 / (1 - 0.9) 在 IEEE754 下是 9.000000000000002，這裡修回 9。
   * 數量級很大時（>= 1e6）不處理，避免 x * 1e12 超出安全整數範圍。
   */
  function round12(x) {
    if (typeof x !== 'number' || !isFinite(x)) return x;
    if (Math.abs(x) >= 1e6) return x;
    return Math.round(x * 1e12) / 1e12;
  }

  /** 驗證報酬陣列；通過就原樣回傳，不通過就丟例外。 */
  function assertReturns(returns) {
    if (!Array.isArray(returns)) {
      throw new TypeError('returns 必須是陣列');
    }
    for (var i = 0; i < returns.length; i++) {
      var r = returns[i];
      if (typeof r !== 'number' || !isFinite(r)) {
        throw new TypeError('第 ' + (i + 1) + ' 筆報酬不是有限數字');
      }
      if (r < -1) {
        throw new RangeError('第 ' + (i + 1) + ' 筆報酬小於 -100%，不是合法的報酬率');
      }
    }
    return returns;
  }

  /**
   * 算術平均：把每年的報酬加起來除以年數。
   * 這就是廣告上那個「平均年報酬」。
   * @param {number[]} returns 小數形式的年度報酬
   * @returns {number|null} 空陣列回傳 null
   */
  function arithmeticMean(returns) {
    assertReturns(returns);
    var n = returns.length;
    if (n === 0) return null;
    var sum = 0;
    for (var i = 0; i < n; i++) sum += returns[i];
    return sum / n;
  }

  /**
   * 累積成長倍數：Π(1 + r)。
   * 1 代表回到原點，2 代表翻倍，0 代表歸零。
   * @param {number[]} returns
   * @returns {number} 空陣列回傳 1
   */
  function growthFactor(returns) {
    assertReturns(returns);
    var f = 1;
    for (var i = 0; i < returns.length; i++) f *= (1 + returns[i]);
    return f;
  }

  /**
   * 幾何平均（= 年化報酬）：把 n 年的總成長攤平成「每年固定漲多少」。
   * 這才是你實際拿到手的數字。
   * @param {number[]} returns
   * @returns {number|null} 空陣列回傳 null；期間內曾經 -100% 則回傳 -1
   */
  function geometricMean(returns) {
    assertReturns(returns);
    var n = returns.length;
    if (n === 0) return null;
    var f = growthFactor(returns);
    if (f <= 0) return -1; // 歸零（或理論上的負值）：年化就是 -100%
    return Math.pow(f, 1 / n) - 1;
  }

  /**
   * CAGR（年複合成長率）。年度報酬序列的 CAGR 在定義上就是幾何平均，
   * 這裡另開一個名字，是因為多數人是用「CAGR」在找它。
   * @param {number[]} returns
   * @returns {number|null}
   */
  function cagr(returns) {
    return geometricMean(returns);
  }

  /**
   * 終值：本金依序吃完每一年的報酬之後剩下多少。
   * @param {number} principal 本金（任意正數，單位由呼叫端決定）
   * @param {number[]} returns
   * @returns {number} 空陣列回傳 principal 本身
   */
  function finalValue(principal, returns) {
    if (typeof principal !== 'number' || !isFinite(principal)) {
      throw new TypeError('principal 必須是有限數字');
    }
    return principal * growthFactor(returns);
  }

  /**
   * 逐年資產：[本金, 第1年末, 第2年末, ...]，長度為 returns.length + 1。
   * 畫資產曲線用。
   * @param {number} principal
   * @param {number[]} returns
   * @returns {number[]}
   */
  function cumulativeValues(principal, returns) {
    if (typeof principal !== 'number' || !isFinite(principal)) {
      throw new TypeError('principal 必須是有限數字');
    }
    assertReturns(returns);
    var out = [principal];
    var v = principal;
    for (var i = 0; i < returns.length; i++) {
      v = v * (1 + returns[i]);
      out.push(v);
    }
    return out;
  }

  /**
   * 標準差（波動度 σ）。預設用「母體」公式（除以 n），
   * 因為 σ²/2 那條近似式談的是報酬分布本身的變異數。
   * @param {number[]} returns
   * @param {boolean} [sample=false] 傳 true 改用樣本公式（除以 n-1）
   * @returns {number|null} 空陣列回傳 null；樣本公式下 n=1 也回傳 null
   */
  function stdev(returns, sample) {
    assertReturns(returns);
    var n = returns.length;
    if (n === 0) return null;
    if (sample && n < 2) return null;
    var mean = arithmeticMean(returns);
    var acc = 0;
    for (var i = 0; i < n; i++) {
      var d = returns[i] - mean;
      acc += d * d;
    }
    return Math.sqrt(acc / (sample ? n - 1 : n));
  }

  /**
   * 回本算式：賠掉 L 之後，要賺 L / (1 - L) 才回到原點。
   * @param {number} loss 損失比例（小數，0 <= loss <= 1）
   * @returns {number} 需要的報酬率（小數）。loss = 1（全賠光）回傳 Infinity。
   */
  function breakevenGain(loss) {
    if (typeof loss !== 'number' || !isFinite(loss)) {
      throw new TypeError('loss 必須是有限數字');
    }
    if (loss < 0) throw new RangeError('loss 不能是負數');
    if (loss >= 1) return Infinity; // 歸零之後，再怎麼漲都是 0
    return round12(loss / (1 - loss));
  }

  /**
   * 常用近似式：幾何平均 ≈ 算術平均 − σ² / 2。
   * ⚠ 這是近似，不是恆等式。它來自 ln(1+r) 的二階泰勒展開，
   *    在報酬幅度小、波動不大時很準；報酬一大（例如 ±50%）就會偏離。
   *    要精確值請用 geometricMean()。
   * @param {number} arith 算術平均（小數）
   * @param {number} sigma 報酬標準差（小數）
   * @returns {number} 幾何平均的估計值（小數）
   */
  function approxGeometric(arith, sigma) {
    if (typeof arith !== 'number' || !isFinite(arith)) {
      throw new TypeError('arith 必須是有限數字');
    }
    if (typeof sigma !== 'number' || !isFinite(sigma)) {
      throw new TypeError('sigma 必須是有限數字');
    }
    return arith - (sigma * sigma) / 2;
  }

  /**
   * 造一組「算術平均固定、波動度可調」的報酬序列：
   * 逐年輪流 (mean + sigma)、(mean - sigma)。年數為偶數時，
   * 算術平均恰好等於 mean、母體標準差恰好等於 |sigma|。
   * 第三章的滑桿用它來做「只改波動、不改平均」的對照實驗。
   * @param {number} mean 目標算術平均（小數）
   * @param {number} sigma 目標波動度（小數，非負）
   * @param {number} years 年數（建議偶數）
   * @returns {number[]}
   */
  function makeVolSeries(mean, sigma, years) {
    if (typeof mean !== 'number' || !isFinite(mean)) throw new TypeError('mean 必須是有限數字');
    if (typeof sigma !== 'number' || !isFinite(sigma) || sigma < 0) throw new RangeError('sigma 必須是非負的有限數字');
    if (!isFinite(years) || years < 0) throw new RangeError('years 必須是非負整數');
    var n = Math.floor(years);
    var out = [];
    for (var i = 0; i < n; i++) {
      var r = (i % 2 === 0) ? (mean + sigma) : (mean - sigma);
      if (r < -1) r = -1; // 跌幅不可能超過 100%
      out.push(r);
    }
    return out;
  }

  var API = {
    round12: round12,
    assertReturns: assertReturns,
    arithmeticMean: arithmeticMean,
    growthFactor: growthFactor,
    geometricMean: geometricMean,
    cagr: cagr,
    finalValue: finalValue,
    cumulativeValues: cumulativeValues,
    stdev: stdev,
    breakevenGain: breakevenGain,
    approxGeometric: approxGeometric,
    makeVolSeries: makeVolSeries
  };

  root.VolDragMath = API;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

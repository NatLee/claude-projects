/* ==========================================================================
 * 那顆鍵沒有壞 —— 純邏輯（瀏覽器與 node 皆可執行，node 端供斷言測試）
 * 這裡只放「控制器怎麼裁決一次關門請求」的規則，好讓它能被單獨驗證。
 * ========================================================================== */
(function (root) {
  'use strict';

  /* ADA／ASME A17.1 的兩個門檻（秒） */
  var ADA_CAR_CALL_HOLD_S = 3;   /* 車廂內按樓層：門全開後至少維持 3 秒 */
  var ADA_HALL_CALL_MIN_S = 5;   /* 樓層外呼叫：從電梯回應到門開始關，至少 5 秒 */

  /* T = D ÷ 1.5 ft/s，且不得小於 5 秒。D 是走廊上離最遠呼叫鍵前方 60 吋處到門中線的距離 */
  function hallCallNotifySeconds(distanceFt) {
    var t = distanceFt / 1.5;
    return t < ADA_HALL_CALL_MIN_S ? ADA_HALL_CALL_MIN_S : t;
  }

  /* 控制器收到一次關門請求後的裁決
   *   mode 'normal'      —— 一般乘客，受最小開門時間約束
   *   mode 'independent' —— 獨立服務／消防員模式，法規讓位，立刻照做
   */
  function closeVerdict(elapsedMs, holdMs, mode) {
    if (mode === 'independent') return { pass: true, remainMs: 0, reason: 'independent' };
    var remain = holdMs - elapsedMs;
    if (remain > 0) return { pass: false, remainMs: remain, reason: 'hold' };
    return { pass: true, remainMs: 0, reason: 'expired' };
  }

  /* 一連串按壓（相對開門時刻的毫秒）裡，有幾次會被控制器丟掉 */
  function ignoredPresses(pressTimesMs, holdMs) {
    var n = 0;
    for (var i = 0; i < pressTimesMs.length; i++) {
      if (pressTimesMs[i] < holdMs) n++;
    }
    return n;
  }

  function fmtSec(ms) {
    var v = ms > 0 ? ms : 0;
    return (v / 1000).toFixed(1);
  }

  function fmtSec2(ms) {
    var v = ms > 0 ? ms : 0;
    return (v / 1000).toFixed(2);
  }

  var api = {
    ADA_CAR_CALL_HOLD_S: ADA_CAR_CALL_HOLD_S,
    ADA_HALL_CALL_MIN_S: ADA_HALL_CALL_MIN_S,
    hallCallNotifySeconds: hallCallNotifySeconds,
    closeVerdict: closeVerdict,
    ignoredPresses: ignoredPresses,
    fmtSec: fmtSec,
    fmtSec2: fmtSec2
  };

  root.DoorLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

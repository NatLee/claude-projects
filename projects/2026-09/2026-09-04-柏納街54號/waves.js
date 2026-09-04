/* ==========================================================================
 * waves.js — 1810 年 11 月 27 日，柏納街 54 號的門前，一波一波的人
 *
 * 資料依 The Times（1810-11-28）與 The Morning Post（1810-11-28、11-29）的
 * 當日報導重建：報上只明寫「清晨五點掃煙囪的先到」與「下午五點僕人最後一批」，
 * 中間各波的時刻是依報導敘述順序推排的合理重建（見 說明.md）。
 *
 * 純函式（node 可直接 require 斷言）：cumulative / phaseAt / btnLabel
 * ========================================================================== */
(function (root) {
  'use strict';

  var WAVES = [
    {
      time: '05:00', who: '掃煙囪的', n: 12,
      note: '天還全黑。一連串掃煙囪的孩子與師傅站在階上，說是被叫來的。',
      btn: '叩、叩'
    },
    {
      time: '05:40', who: '運煤車', n: 30, cargo: 'coal',
      note: '數十輛煤車從帕丁頓的碼頭一路拉過來，卸在門邊，因為門裡沒有人簽收。',
      btn: '又有人敲門'
    },
    {
      time: '06:20', who: '麵包師與婚禮蛋糕', n: 12, cargo: 'cake',
      note: '十幾位麵包師各捧一座精緻的婚禮蛋糕。沒有人知道誰要結婚。',
      btn: '還在敲'
    },
    {
      time: '07:10', who: '靴匠', n: 15,
      note: '一列靴匠帶著訂製的鞋樣，等著替屋裡的人量腳。',
      btn: '開門'
    },
    {
      time: '09:00', who: '魚販', n: 40, cargo: 'crate',
      note: '四十個魚販，龍蝦與鱈魚。街上開始有味道了。',
      btn: '開門'
    },
    {
      time: '10:00', who: '肉販', n: 40, cargo: 'crate',
      note: '四十個肉販，每人一條羊腿。你要不要先問問是誰在訂東西。',
      btn: '你要不要先問是誰'
    },
    {
      time: '11:00', who: '糕點師', n: 50, cargo: 'crate',
      note: '五十位糕點師，兩千五百個木莓塔。街的兩頭已經看不到盡頭。',
      btn: '開門'
    },
    {
      time: '12:00', who: '家具、亞麻布、珠寶', n: 60, cargo: 'furniture',
      note: '《泰晤士報》寫：一車一車的家具、風琴、鋼琴、亞麻布、珠寶，「還有焦急的商販與一群大笑的人」。',
      btn: '門外的東西比人多了'
    },
    {
      time: '13:00', who: '六個壯漢扛一台風琴', n: 30, cargo: 'organ',
      note: '同一段報導裡還有：帶著許可證的酒商、拿著假髮的理髮師、提著帽盒的女帽匠、扛著整套器具的眼鏡商。',
      btn: '開門'
    },
    {
      time: '14:00', who: '舞蹈教師', n: 10,
      note: '他們手上的信寫著：「她希望她的女兒們接受指導。」屋裡沒有女兒。',
      btn: '開門'
    },
    {
      time: '14:30', who: '殯葬業者', n: 2, cargo: 'coffin',
      note: '一具棺材抬到門口。照托特能太太的尺寸訂做的。',
      btn: '這一次，別開'
    },
    {
      time: '15:00', who: '銀行主席、公司主席、公爵', n: 3,
      note: '英格蘭銀行主席與東印度公司主席收到的信說，有一樁詐騙案正影響他們的機構；格洛斯特公爵收到的信說，一位老僕正在臨終，請他到場。',
      btn: '開門'
    },
    {
      time: '15:20', who: '倫敦市長', n: 1, cargo: 'coach',
      note: '全套官服、官方馬車。他沒有下車——他直接去了馬爾伯羅街治安法庭，叫警察過來。',
      btn: '開門'
    },
    {
      time: '16:00', who: '警察', n: 6,
      note: '警察封住街的兩頭。門外的敲擊聲沒有停：赴約的人還在一個一個抵達。',
      btn: '街被封了。還是有人在敲'
    },
    {
      time: '17:00', who: '一大批僕人', n: 80,
      note: '男僕與女僕，穿上最好的衣服，以為今天要來面試。這是最後一批。',
      btn: '最後一批'
    }
  ];

  /* 前 i 波（含）的累計上門人數；i<0 回 0，超出範圍夾住 */
  function cumulative(waves, i) {
    var s = 0;
    if (i < 0) return 0;
    if (i > waves.length - 1) i = waves.length - 1;
    for (var k = 0; k <= i; k++) s += waves[k].n;
    return s;
  }

  /* 一天的時間相位 0..1（用來換天色）：已開到第 i 波（-1 = 還沒開門） */
  function phaseAt(i, len) {
    if (len <= 1) return 0;
    var v = (i + 1) / len;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /* 下一次「應門」按鈕上的字；全開完之後是走到窗邊 */
  function btnLabel(waves, i) {
    return i >= waves.length ? '走到窗邊' : waves[i].btn;
  }

  var api = { WAVES: WAVES, cumulative: cumulative, phaseAt: phaseAt, btnLabel: btnLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BERN = api;
})(typeof window !== 'undefined' ? window : globalThis);

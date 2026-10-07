/* core.js — 「我聽見北京的玩具在打鼾」的純函式核心（瀏覽器與 node 共用）
 *
 * 實驗台上那顆空鐘的簡化物理：
 *   step(s, dt, hold, sample, noise)  推進一小步，回傳新狀態（不改舊的）
 *     · 按住＝右手棍往下拉，繩子拖著軸心轉；一次拉的行程有限（STROKE_T 秒到底），
 *       拉到底還不放，繩子卡住反而拖慢——所以靠「拉、放、拉、放」的節奏。
 *     · 摩擦：常數項＋線性項；有哨孔的樣品多一項 ∝ ω² 的氣動損失（聲音是要錢的）。
 *     · 傾斜：不轉時像倒立的東西，偏一點就越偏越多（指數長大）；轉起來後，
 *       陀螺效應把這股「倒下去的趨勢」除以 1+(ω/W0)²，再加一項 ∝ ω 的回正。
 *       |傾角| > FALL_DEG 就從繩上掉下來，轉速歸零。
 *   sound(rpm, sample)  聲音狀態：每秒「噗」幾下（孔口掃過的頻率）、鼾聲與哨音的音量、音高
 *
 * 數字是為了好玩調出來的示意值，不是量測。頁面只主張三件事：
 * 轉得越快越穩；有孔的空心鈴低速是一下一下的噗（鼾），高速連成哨音；
 * 哨孔會吃掉轉速（無孔的跑得更快、但啞了）。
 */
(function (root) {
  'use strict';

  var STROKE_T = 0.6;     /* 一次拉到底要幾秒 */
  var RETURN_T = 0.4;     /* 放開後棍子回到頂要幾秒 */
  var DRIVE = 1000;       /* 拉繩加速度上限（rpm/s） */
  var WMAX = 2700;        /* 繩子速度追不上的極限 */
  var STUCK_DRAG = 260;   /* 拉到底還不放：繩卡軸心的拖慢（rpm/s） */
  var C0 = 30, C1 = 0.07; /* 摩擦 */
  var G = 1.25;           /* 不轉時的「倒下」增長率（1/s） */
  var W0 = 260;           /* 陀螺穩定的特徵轉速 */
  var DAMP = 1.6;         /* 轉速帶來的回正（每 2000 rpm） */
  var NOISE = 9;          /* 外界擾動（度/s） */
  var FALL_DEG = 38;      /* 傾到幾度就掉 */
  var REST_TILT = 2.5;    /* 重新掛上繩時的初始歪斜 */

  var SAMPLES = {
    A: { id: 'A', name: '北京空鐘', holes: 2, whistle: 0.0001 },
    B: { id: 'B', name: '1905 巴黎橡膠款', holes: 0, whistle: 0 }
  };

  function init(tilt) {
    return { rpm: 0, tilt: tilt == null ? REST_TILT : tilt, stroke: 0, fallen: 0, phase: 0 };
  }

  /* noise ∈ [-1,1]：由呼叫端給（瀏覽器用亂數，node 測試給固定值） */
  function step(s, dt, hold, sample, noise) {
    sample = sample || SAMPLES.A;
    var n = { rpm: s.rpm, tilt: s.tilt, stroke: s.stroke, fallen: s.fallen, phase: s.phase };

    /* 掉下來了：躺一下再重新掛上 */
    if (n.fallen > 0) {
      n.fallen = Math.max(0, n.fallen - dt);
      n.rpm = 0;
      if (n.fallen === 0) { n.tilt = REST_TILT * (noise >= 0 ? 1 : -1); n.stroke = 0; }
      return n;
    }

    /* 右手棍的行程 */
    var w = n.rpm;
    if (hold) {
      if (n.stroke < 1) {
        w += DRIVE * Math.max(0, 1 - w / WMAX) * dt;
        n.stroke = Math.min(1, n.stroke + dt / STROKE_T);
      } else {
        w -= STUCK_DRAG * dt;
      }
    } else {
      n.stroke = Math.max(0, n.stroke - dt / RETURN_T);
    }

    /* 摩擦＋哨孔氣動損失 */
    w -= (C0 + C1 * w + sample.whistle * w * w) * dt;
    n.rpm = Math.max(0, w);

    /* 傾斜：倒下的趨勢被轉速壓住 */
    var k = n.rpm / W0;
    var grow = (G * n.tilt + NOISE * noise) / (1 + k * k);
    var right = DAMP * (n.rpm / 2000) * n.tilt;
    n.tilt += (grow - right) * dt;

    n.phase = (n.phase + n.rpm / 60 * dt) % 1;

    if (Math.abs(n.tilt) > FALL_DEG) { n.fallen = 1.2; n.rpm = 0; }
    return n;
  }

  function smooth(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /* 聲音狀態：有孔才有聲 */
  function sound(rpm, sample) {
    sample = sample || SAMPLES.A;
    if (!sample.holes) return { puff: 0, snore: 0, whistle: 0, pitch: 0, label: '無聲' };
    var puff = rpm / 60 * sample.holes;              /* 每秒孔口掃過幾次 */
    var snore = smooth(180, 450, rpm) * (1 - smooth(850, 1200, rpm));
    var whistle = smooth(800, 1150, rpm);
    var pitch = 560 + 0.14 * rpm;
    var label = whistle > 0.5 ? '哨音' : snore > 0.15 ? '鼾聲' : '無聲';
    return { puff: puff, snore: snore, whistle: whistle, pitch: pitch, label: label };
  }

  /* 依轉速判讀「穩定度」給儀表顯示（0 不穩 → 1 釘住） */
  function steadiness(rpm) {
    var k = rpm / W0;
    var grow = G / (1 + k * k), right = DAMP * rpm / 2000;
    return Math.max(0, Math.min(1, (right - grow + 0.4) / 1.2));
  }

  /* 劇情門檻：北京那顆過 SING_RPM 撐住 SING_HOLD 秒＝唱起來；
     巴黎那顆過 QUIET_RPM＝北京那顆怎麼拉都到不了的轉速 */
  var SING_RPM = 1100, SING_HOLD = 1.2, QUIET_RPM = 1700;

  var api = {
    SING_RPM: SING_RPM, SING_HOLD: SING_HOLD, QUIET_RPM: QUIET_RPM,
    SAMPLES: SAMPLES, FALL_DEG: FALL_DEG, STROKE_T: STROKE_T, RETURN_T: RETURN_T,
    init: init, step: step, sound: sound, steadiness: steadiness
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KZ = api;
})(typeof window !== 'undefined' ? window : globalThis);

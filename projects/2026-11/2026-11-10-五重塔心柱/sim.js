/* 塔為什麼不倒？—— 振動台核心物理（純函式，瀏覽器與 node 共用）
 * 模型：5 層剪力樓（每層質量 1，單位 px、秒）＋地面加速度 ag。
 *  rigid  ：整座塔膠死，視為剛體；地面加速度超過門檻會累積「翻覆量」，滿 1 就倒。
 *  loose  ：樓層之間只靠鬆軟榫接（低勁度、低阻尼），層間錯位超過 DMAX 就滑落。
 *  pillar ：同 loose，但中央多一根心柱（單自由度懸臂，形狀 s_i=(i/N)^1.5）；
 *           樓層離心柱超過 GAP 就撞上去，非彈性碰撞把能量吃掉。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TowerSim = api;
})(this, function () {
  'use strict';
  var N = 5;
  var P = {
    K: 600, C: 3,          /* 鬆接：基頻約 1.1 Hz */
    DMAX: 28,                /* 層間錯位上限（px） */
    GAP: 6,                  /* 樓層與心柱的間隙 */
    E: 0.1,                  /* 碰撞回彈係數 */
    PM: 8,                   /* 心柱等效質量 */
    PW: 2 * Math.PI * 2.5,   /* 心柱自振角頻率 */
    PZ: 0.3,                 /* 心柱阻尼比 */
    QMAX: 30,
    RIGID_T: 1800,           /* 剛接塔：加速度門檻 px/s² */
    RIGID_R: 1 / 1400,       /* 超過門檻時的翻覆累積率 */
    RIGID_DECAY: 0.6,        /* 低於門檻時回正速率 /s */
    TK: 900, TC: 54          /* 振動台跟隨指標的彈簧 */
  };
  var SHAPE = [];
  for (var i = 0; i < N; i++) SHAPE.push(Math.pow((i + 1) / N, 1.5));

  function create(mode) {
    return { mode: mode, u: [0, 0, 0, 0, 0], v: [0, 0, 0, 0, 0], q: 0, w: 0,
      over: 0, failed: false, failAt: -1, maxDrift: 0, hits: 0, t: 0 };
  }

  function drift(st, i) { return st.u[i] - (i ? st.u[i - 1] : 0); }

  function sub(st, ag, h) {
    var u = st.u, v = st.v, a = [0, 0, 0, 0, 0], i;
    for (i = 0; i < N; i++) {
      var below = i ? u[i] - u[i - 1] : u[i];
      var vb = i ? v[i] - v[i - 1] : v[i];
      var f = -P.K * below - P.C * vb;
      if (i < N - 1) f += P.K * (u[i + 1] - u[i]) + P.C * (v[i + 1] - v[i]);
      a[i] = f - ag;
    }
    for (i = 0; i < N; i++) { v[i] += a[i] * h; u[i] += v[i] * h; }
    if (st.mode === 'pillar') {
      var aw = -ag - P.PW * P.PW * st.q - 2 * P.PZ * P.PW * st.w;
      st.w += aw * h; st.q += st.w * h;
      if (st.q > P.QMAX) { st.q = P.QMAX; if (st.w > 0) st.w = 0; }
      if (st.q < -P.QMAX) { st.q = -P.QMAX; if (st.w < 0) st.w = 0; }
      for (i = 0; i < N; i++) {
        var s = SHAPE[i], rel = u[i] - st.q * s;
        if (Math.abs(rel) > P.GAP) {
          var sg = rel > 0 ? 1 : -1, vr = v[i] - st.w * s;
          if (vr * sg > 0) {
            var J = -(1 + P.E) * vr / (1 + s * s / P.PM);
            v[i] += J; st.w -= J * s / P.PM; st.hits++;
          }
          u[i] = st.q * s + sg * P.GAP;
        }
      }
    }
  }

  /* 推進 dt 秒；ag 為地面加速度（px/s²）。回傳 st。 */
  function step(st, ag, dt) {
    if (st.failed) return st;
    st.t += dt;
    if (st.mode === 'rigid') {
      var ex = Math.abs(ag) - P.RIGID_T;
      if (ex > 0) st.over += ex * P.RIGID_R * dt;
      else st.over = Math.max(0, st.over - P.RIGID_DECAY * dt);
      st.lean = (ag > 0 ? -1 : 1) * Math.min(st.over, 1);
      if (st.over >= 1) { st.failed = true; st.failAt = 0; }
      return st;
    }
    var n = Math.max(1, Math.ceil(dt / (1 / 600))), h = dt / n;
    for (var k = 0; k < n; k++) {
      sub(st, ag, h);
      for (var i = 0; i < N; i++) {
        var d = Math.abs(drift(st, i));
        if (d > st.maxDrift) st.maxDrift = d;
        if (d > P.DMAX) { st.failed = true; st.failAt = i; return st; }
      }
    }
    return st;
  }

  /* 振動台：平滑跟隨目標位置，回傳台面加速度 */
  function table(tb, target, dt) {
    var a = P.TK * (target - tb.x) - P.TC * tb.v;
    tb.v += a * dt; tb.x += tb.v * dt;
    return a;
  }

  /* 一場合成地震（給鍵盤／不想拖曳的人）：約 9 秒，主頻 0.9–1.3 Hz */
  function quake(t) {
    if (t < 0 || t > 9) return 0;
    var env = Math.sin(Math.PI * t / 9); env *= env;
    return 95 * env * (Math.sin(2 * Math.PI * 1.08 * t) * .7 + Math.sin(2 * Math.PI * 1.31 * t + 1) * .3);
  }

  return { N: N, P: P, SHAPE: SHAPE, create: create, step: step, table: table, quake: quake, drift: drift };
});

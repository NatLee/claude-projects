/* ==========================================================================
 * page-kit.js — 子頁面共用執行時（無建置微框架，2026-09-01 起）
 *
 * 動機：195+ 個自包含頁面各自重寫 reduced-motion、rAF 管理、IO 進場、
 *       canvas dpr、dasharray 重播……既肥又易踩地雷。集中在這裡一次寫對。
 * 用法：<script src="../../../assets/page-kit.js"></script>（傳統 script，
 *       非 module——全站必須 file:// 雙擊可開）。全域只暴露一個 PK。
 * 紀律：被大量頁面共用——只能「加 API」，不能改既有行為；改動跑全站健檢。
 *       localStorage 一律由「頁面」以自己的前綴呼叫 PK.store(LS)，kit 本身不碰。
 * ========================================================================== */
(function (win) {
  'use strict';
  var doc = win.document;
  var PK = {};

  /* ── 減少動態 ─────────────────────────────────────── */
  var mq = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  PK.reduced = function () { return !!mq.matches; };
  /* 監聽切換（含舊瀏覽器 fallback）；回呼會在切換當下收到新值 */
  PK.onMotionChange = function (fn) {
    if (mq.addEventListener) mq.addEventListener('change', function () { fn(mq.matches); });
    else if (mq.addListener) mq.addListener(function () { fn(mq.matches); });
  };

  /* ── 共用 rAF 迴圈：分頁隱藏自動暫停，dt 有上限（切回分頁不暴衝） ── */
  var ticks = [], rafId = 0, lastT = 0, running = false;
  function loop(t) {
    if (!running) return;
    var dt = lastT ? Math.min((t - lastT) / 1000, .05) : 0;
    lastT = t;
    for (var i = 0; i < ticks.length; i++) ticks[i](dt, t);
    rafId = win.requestAnimationFrame(loop);
  }
  function syncLoop() {
    var want = ticks.length > 0 && !doc.hidden;
    if (want && !running) { running = true; lastT = 0; rafId = win.requestAnimationFrame(loop); }
    else if (!want && running) { running = false; win.cancelAnimationFrame(rafId); }
  }
  PK.tick = function (fn) { if (ticks.indexOf(fn) < 0) ticks.push(fn); syncLoop(); };
  PK.untick = function (fn) { var i = ticks.indexOf(fn); if (i >= 0) ticks.splice(i, 1); syncLoop(); };
  doc.addEventListener('visibilitychange', syncLoop);

  /* ── 進場編排：把 .rv 元素進視窗時加 .in（reduced 直接全亮） ── */
  PK.reveal = function (sel) {
    var els = doc.querySelectorAll(sel || '.rv');
    if (PK.reduced() || !('IntersectionObserver' in win)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('in');
      return;
    }
    var io = new win.IntersectionObserver(function (es) {
      for (var j = 0; j < es.length; j++) {
        if (es[j].isIntersecting) { es[j].target.classList.add('in'); io.unobserve(es[j].target); }
      }
    }, { rootMargin: '60px 0px' });
    for (var k = 0; k < els.length; k++) io.observe(els[k]);
  };

  /* ── canvas 尺寸（dpr 上限 2；先比較相等才重設，避開 ResizeObserver 地雷） ── */
  PK.fitCanvas = function (cv, cssH) {
    var dpr = Math.min(win.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || (cv.parentNode && cv.parentNode.clientWidth) || 300;
    var h = cssH || cv.clientHeight || w;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    return { w: w, h: h, dpr: dpr };
  };

  /* ── dasharray 畫線動畫可靠重播：none→隱藏→強制 reflow→下一個 rAF 才開 ── */
  PK.replayDash = function (el, durMs) {
    var len = el.getTotalLength ? el.getTotalLength() : parseFloat(el.getAttribute('data-len') || 0);
    el.style.transition = 'none';
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    void el.getBoundingClientRect(); /* 強制 reflow */
    win.requestAnimationFrame(function () {
      el.style.transition = 'stroke-dashoffset ' + (PK.reduced() ? 1 : (durMs || 900)) + 'ms ease';
      el.style.strokeDashoffset = 0;
    });
  };

  /* ── 打字機（reduced 直接整段放上） ── */
  PK.type = function (el, text, msPerChar, done) {
    if (PK.reduced()) { el.textContent = text; if (done) done(); return; }
    var i = 0, acc = 0;
    function f(dt) {
      acc += dt * 1000;
      while (acc >= msPerChar && i < text.length) { acc -= msPerChar; i++; }
      el.textContent = text.slice(0, i);
      if (i >= text.length) { PK.untick(f); if (done) done(); }
    }
    PK.tick(f);
  };

  /* ── localStorage（JSON、try/catch；prefix 必須是頁面自己的 LS 常數） ── */
  PK.store = function (prefix) {
    return {
      get: function (k, d) {
        try { var v = win.localStorage.getItem(prefix + k); return v === null ? d : JSON.parse(v); }
        catch (e) { return d; }
      },
      set: function (k, v) { try { win.localStorage.setItem(prefix + k, JSON.stringify(v)); } catch (e) {} },
      del: function (k) { try { win.localStorage.removeItem(prefix + k); } catch (e) {} }
    };
  };

  /* ── aria-live 播報（共用一個 polite 區） ── */
  var liveEl = null;
  PK.announce = function (msg) {
    if (!liveEl) {
      liveEl = doc.createElement('span');
      liveEl.className = 'pk-sr';
      liveEl.setAttribute('role', 'status');
      liveEl.setAttribute('aria-live', 'polite');
      doc.body.appendChild(liveEl);
    }
    liveEl.textContent = '';
    win.setTimeout(function () { liveEl.textContent = msg; }, 40);
  };

  /* ── 雜項 ── */
  PK.scrollTo = function (el) { el.scrollIntoView({ behavior: PK.reduced() ? 'auto' : 'smooth', block: 'start' }); };
  PK.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  PK.lerp = function (a, b, k) { return a + (b - a) * k; };
  /* FNV-1a → 0..1：固定抖動／相位，不會每次載入亂跳 */
  PK.hash = function (s) {
    var h = 2166136261 >>> 0;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h / 4294967295;
  };

  win.PK = PK;
})(typeof window !== 'undefined' ? window : globalThis);

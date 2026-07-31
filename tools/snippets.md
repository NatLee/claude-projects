# 標準樣板片段（複製時共用）

> 每日子頁面的**行為鷹架**照抄這裡的 canonical 版本（變數名可改以貼合頁面）；
> **視覺與敘事照舊每天大變**——樣板只管「不會壞」，不管「長什麼樣」。
>
> 為什麼存在：過去同一段行為每頁重新發明，寫法有三到六種變體，同一個 bug
> 修了四個 commit 還在新頁重生。這裡是唯一的正典：**修到樣板級 bug 時，先改
> 這個檔，再全站 grep 同模式一次修完**（見 PROMPT.md 步驟 8）。
>
> 明文禁止：把這些樣板抽成 assets/ 底下的執行期共用 JS/CSS，或改寫舊頁去引用
> 共用檔——自包含是刻意設計，共用檔一改就是 130+ 頁的爆炸半徑。

## (a) prefers-reduced-motion：讀取＋動態監聽（含舊版 fallback）

```js
const mReduced = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => mReduced.matches;
const onReducedChange = fn => {
  if (mReduced.addEventListener) mReduced.addEventListener("change", fn);
  else if (mReduced.addListener) mReduced.addListener(fn); /* 舊 Safari */
};
onReducedChange(() => setRunning()); /* 切換時重新評估動畫開關（見 (b)） */
```

## (b) rAF 迴圈：分頁隱藏、減動態即停；回前景再啟

```js
let running = false, rafId = 0;
function frame(t) {
  if (!running) return;
  /* …每幀繪製… */
  rafId = requestAnimationFrame(frame);
}
function setRunning() {
  const want = !document.hidden && !reduced(); /* 離屏也要停的話，加上 IntersectionObserver 的 inView 旗標 */
  if (want && !running) { running = true; rafId = requestAnimationFrame(frame); }
  else if (!want && running) { running = false; cancelAnimationFrame(rafId); }
}
document.addEventListener("visibilitychange", setRunning);
setRunning();
```

## (c) 捲動進場：IntersectionObserver（不掛 scroll 事件），無 IO／減動態直接全顯示

```js
const toReveal = document.querySelectorAll(".reveal");
if (reduced() || !("IntersectionObserver" in window)) {
  toReveal.forEach(el => el.classList.add("in"));
} else {
  const io = new IntersectionObserver((es, obs) => {
    for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
  }, { rootMargin: "60px 0px" });
  toReveal.forEach(el => io.observe(el));
}
```

## (d) canvas 佈局：CSS 必給高度；尺寸未變就短路（別讓網址列收放清空畫布）

```css
/* CSS：canvas 一定要有實際高度，否則會踩 ResizeObserver 回饋迴圈地雷 */
#cv { display: block; width: 100%; height: 240px; }
```

```js
let W = 0, H = 0, DPR = 1;
function fitCanvas(cv, force) {
  const w = cv.clientWidth, h = cv.clientHeight, d = Math.min(2, devicePixelRatio || 1);
  if (!force && w === W && h === H && d === DPR) return false; /* 尺寸未變：不重設、不重生狀態 */
  W = w; H = h; DPR = d;
  cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  cv.getContext("2d").setTransform(d, 0, 0, d, 0, 0);
  return true; /* true 才需要重建與尺寸相關的狀態（粒子、漸層、離屏圖層…） */
}
let rzT = null;
addEventListener("resize", () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => { if (fitCanvas(cv)) draw(); }, 120);
});
fitCanvas(cv, true); draw();
```

## (e) 回首頁連結（子頁在 `projects/YYYY-MM/專案名/`，距根目錄三層）

```html
<a class="home" href="../../../index.html" aria-label="回到首頁：每日小專案">← 回首頁</a>
```

樣式自訂（低調、貼合當頁主題），但 `href` 與 `aria-label` 照抄。

# 每日小專案 — AI 協作者速查（先讀我，省 token）

純靜態「每日互動敘事」網站：每天一個子頁面，首頁星座圖索引。完整規範在 `PROMPT.md`，本檔是壓縮版入口——**先跑指令、按需讀檔，不要整包掃**。

## 省 token 工作流（每日流程請照此）

```
node tools/brief.js        # 偵察一次到位：近14天題材/emoji/LS前綴/保養對象（取代讀 data.js、名冊、grep）
node tools/new-page.js --slug 專案名 --ls 前綴.   # 鷹架：樣板+不變量一次到位，只填故事與互動
node tools/add.js --title … --emoji … --dir … --category … --desc …   # 掛上首頁（含驗證，勿手改 data.js）
node tools/check.js        # 交付門檻：全過才算完成（pre-commit 也會跑，約 40 秒）
```

- 只在需要時讀單一檔案的特定段落（grep/sed），不要通讀 195 個舊頁面。
- 舊頁保養：brief.js 會指名今日對象；只讀那一個資料夾。

## 硬底線（違反即失敗）

- 全站 `file://` 雙擊可開：禁 `type="module"`、禁 fetch 本機檔；外部資源只准 cdnjs。
- 無後端無資料庫；存資料只用 localStorage，key 前綴全站唯一，寫成同檔字面常數 `const LS='xxx.'`。
- 新作品：`projects/YYYY-MM/YYYY-MM-DD-專案名/{index.html, 說明.md}`＋`assets/data.js` 最上方一筆。**首頁清單唯一來源是 data.js**。
- footer 禁語：「說明.md」「只存在你的瀏覽器」「不會上傳」「全程離線」「離線可用」「瀏覽器裡算完」。
- 敘事鐵則：禁「標題→demo→三張卡→結語」罐頭；第一屏鉤子、互動＝高潮、結尾回馬槍；敘事容器與最近幾天不同。

## 檔案地圖（誰能動）

| 路徑 | 說明 |
|---|---|
| `assets/data.js` | ★ 每天唯一要改的首頁檔（PROJECTS 陣列，新→舊） |
| `assets/page-kit.{css,js}` | 子頁共用骨架/執行時（2026-09 起新頁使用）；**只加不改語意** |
| `index.html`、`assets/app.js`、`assets/style.css` | 首頁（星座圖＋三分頁）；平常不動 |
| `tools/check.js` | 全站健檢（也是 pre-commit hook） |
| `tools/brief.js`、`tools/new-page.js`、`tools/add.js` | 偵察／鷹架／掛首頁 |
| `tools/snippets.md` | 舊頁（自包含）行為片段正典；保養舊頁時照它修 |
| `tools/保養名冊.json` | 保養輪替（新作補一筆 `{dir,created,lastMaintained:null,result:null}`） |
| `tools/maintain.js` | git gc（只能在使用者本機跑，掛載環境禁 unlink） |

**page-kit 政策（2026-09-01）**：新頁用 kit；**舊頁一律不回改**（保養時照 snippets.md 的自包含寫法修）；kit 語意凍結、只加不改；動 kit 必過全站健檢。

## page-kit 速查（新頁一律用，別再手寫樣板）

CSS：`pk-wrap/pk-hero/pk-home/pk-btn/pk-foot/pk-sr`、`.rv`+`.in` 進場、`--pk-*` 變數換膚。
JS 全域 `PK`：`reduced()`、`onMotionChange(fn)`、`tick/untick(fn(dt,t))`（rAF 共用迴圈、隱藏自動停）、`reveal(sel)`、`fitCanvas(cv)`（dpr 防翻倍）、`replayDash(el,ms)`（dasharray 安全重播）、`type(el,txt,ms,done)`、`store(LS)`、`announce(msg)`、`scrollTo/clamp/lerp/hash`。
頁內自己的動畫仍要各自做 reduced 降級；核心邏輯抽純函式供 node 斷言。

## 渲染地雷（歷史事故，別再踩）

1. SVG 漸層描邊：`gradientUnits="userSpaceOnUse"`＋實座標，否則水平/垂直線整條消失。
2. **CSS transform 旋轉 SVG 子元素必設 `transform-box`＋`transform-origin`**（否則繞 (0,0) 飛出去；fill-box 百分比會隨 bbox 漂，軸心用 view-box 座標釘死）。
3. 旋轉/位移可能超出 viewBox：記得 `svg{overflow:visible}` 或縮小角度。
4. canvas：要有 CSS 尺寸；dpr 回寫前先比較尺寸相等（用 `PK.fitCanvas`）。
5. dasharray 重播：用 `PK.replayDash`（none→隱藏→reflow→rAF）。
6. drop-shadow 掛 `<g>` 不掛零面積路徑；畫線動畫依實際繪製方向。
7. 物理小遊戲：低重力+高初速會飛出畫面——封閉場景要有天花板/邊界。
8. 隱藏面板中的 canvas 尺寸為 0：layout 函式要先檢查 `rect.width<80 → return`。

## 環境怪癖（git）

- 掛載磁碟**不能 unlink**：git 會殘留 `.git/index.lock` 等，擋下次操作。處置：`mv .git/index.lock .git/stale-locks/index.lock.$RANDOM`（commit 前後都檢查）。
- pre-commit hook 跑全站健檢約 40 秒/次——多 commit 時 bash timeout 要抓寬（每 commit 抓 60s）。
- `git add` 用明確路徑，勿 `-A`；一專案一 commit，訊息「新增子頁面：YYYY-MM-DD 專案名（類別）」；只 commit 不 push。

## 首頁架構備忘（要動首頁時才讀）

- 星空＝六星座（六大類），圖形從 `MOTIFS` 12 圖形池隨機分配；每座隨機抽星、今日之星（PROJECTS[0]）必亮鎮座；`換一批星` 重抽。
- 三分頁 sky/wall/obs（`index.tab` 記憶）；切回 sky 時 `window.__skyRelayout()` 補排。
- hero/卡片牆/產量圖全由 data.js 自動生成。

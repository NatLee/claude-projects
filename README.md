# 每日小專案 📦

一個**純靜態網站**：每天自動長出一個全新的互動子頁面。
主題從六大類隨機抽選——網路趣聞・冷知識、奇聞軼事、科學趣聞、學習新知、生活痛點小工具、創意・娛樂。

## 瀏覽

- **線上版**：<https://natlee.github.io/claude-projects/> （由 `main` 分支自動部署；本地 commit 後要等使用者 push 才會更新）
- **本地**：直接用瀏覽器打開 **[index.html](./index.html)**。不需要架伺服器，雙擊即可。

完整作品清單都在那裡：可即時搜尋、依類別篩選、依時間或分類分組，並看得到每天、每月的產量。這份索引是唯一的清單來源，本檔不再重複列出。

## 結構

```
index.html                    首頁骨架（只有標記，約 4 KB）
404.html / .nojekyll          GitHub Pages 部署硬化
assets/
  ├─ data.js                  ★ 作品清單 PROJECTS —— 唯一的清單來源
  ├─ app.js                   首頁渲染引擎：卡片牆、搜尋、篩選、產量圖
  └─ style.css                首頁樣式
tools/
  ├─ check.js                 全站健檢（品質閘門）：node tools/check.js
  ├─ add.js                   掛上首頁：驗證後把新作品插進 PROJECTS 最上方
  ├─ snippets.md              標準樣板片段（行為鷹架的 canonical 版本）
  ├─ 保養名冊.json             每頁的保養輪替記錄
  ├─ hooks/                   pre-commit 健檢（安裝：node tools/hooks/install.js）
  └─ maintain.js              倉庫保養（清 .git 垃圾＋gc），使用者本機執行
PROMPT.md                     每日產出流程與規範
projects/
  └─ YYYY-MM/                 依月份分組
       └─ YYYY-MM-DD-專案名/
            ├─ index.html     子頁面入口
            └─ 說明.md        這是什麼、怎麼玩、資料來源與方法論
```

首頁原本是一個 93 KB 的單檔，資料、樣式與邏輯全擠在一起，每天要改清單就得動整個檔案。現在拆成上面四塊：**每天只需要動 `assets/data.js`**，樣式與邏輯不必再被翻動，瀏覽器也能分別快取。

三個檔案用一般的 `<script src>` 依序載入（`data.js` 先於 `app.js`），刻意不使用 ES module 或 `fetch`——那兩者在 `file://` 下會被 CORS 擋掉，雙擊就打不開了。

## 健檢

```
node tools/check.js
```

一次驗證：清單欄位與類別、日期（真實日曆日、新→舊排序）、desc 長度、`dir` 與實體資料夾雙向對帳、回首頁連結、HTML 基本結構、全站每一段 JS（含 HTML 內嵌 `<script>`）的語法、`file://` 會壞掉的寫法、本機資源參照（存在＋大小寫）、localStorage 前綴與跨專案撞名、footer 註腳規範、跨作品重複偵測；報表尾端附「近 14 天題材摘要」與保養輪替狀態。

## 規則

- 純靜態、無後端、無資料庫；需要儲存時一律用 localStorage，key 加該專案專屬前綴
- 每個子頁面自包含、可直接開啟；除 cdnjs 外不依賴任何外部資源
- 每頁都有回首頁連結（`../../../index.html`），支援鍵盤操作與 `prefers-reduced-motion`
- 涉及事實與數據一律查證，來源寫在該頁的 `說明.md`

## 新增一頁

1. 建立 `projects/YYYY-MM/YYYY-MM-DD-專案名/`，放入 `index.html` 與 `說明.md`（行為鷹架照抄 `tools/snippets.md`）
2. 跑 `node tools/add.js --title "…" --emoji "…" --dir "projects/YYYY-MM/YYYY-MM-DD-專案名" --category "…" --desc "…"`——驗證欄位與重複後插進 `PROJECTS` 最上方，並自動跑健檢（desc ≤120 字，一句話介紹）
3. 健檢的錯誤必須全清（`node tools/check.js` 可隨時重跑）

卡片、統計數字、類別籌碼與產量圖都會自動生成，`index.html` 本身不需要動。詳細規範見 [PROMPT.md](./PROMPT.md)。

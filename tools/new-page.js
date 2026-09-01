#!/usr/bin/env node
/* ==========================================================================
 * 新頁鷹架：node tools/new-page.js --slug 簡短專案名 --ls 前綴. [--date YYYY-MM-DD]
 *
 * 產出 projects/YYYY-MM/YYYY-MM-DD-簡短專案名/{index.html, 說明.md}：
 *   已接好 page-kit、回首頁、meta、footer、LS 常數、reveal 進場、
 *   reduced-motion 降級——健檢要求的樣板一次到位。
 * 你只需要往裡面填「故事與互動」，並在 assets/data.js 最上方加一筆
 * （本工具最後會印出可直接貼上的那一筆骨架）。
 *
 * 目的：省 token ——樣板不必每天重新生成，也不會漏掉不變量。
 * 選項：--root <dir> 測試用（預設倉庫根目錄）；--force 覆蓋既有資料夾。
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[++i] : true;
}
if (args.help || !args.slug || !args.ls) {
  console.log('用法：node tools/new-page.js --slug 簡短專案名 --ls 前綴. [--date YYYY-MM-DD] [--root dir] [--force]');
  console.log('  --ls 必須含分隔符（如 kola.）且不得與既有前綴撞名（見 node tools/brief.js）');
  process.exit(args.help ? 0 : 1);
}
if (!/[.:_-]$/.test(args.ls)) { console.error('✗ --ls 前綴需以 . : _ - 結尾（例：kola.）'); process.exit(1); }

const ROOT = path.resolve(args.root || path.join(__dirname, '..'));
const date = args.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('✗ --date 格式應為 YYYY-MM-DD'); process.exit(1); }
const dirRel = `projects/${date.slice(0, 7)}/${date}-${args.slug}`;
const dirAbs = path.join(ROOT, dirRel);
if (fs.existsSync(dirAbs) && !args.force) { console.error(`✗ ${dirRel} 已存在（--force 可覆蓋）`); process.exit(1); }
fs.mkdirSync(dirAbs, { recursive: true });

const html = `<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>【頁面標題（懸念句）】｜每日小專案</title>
<meta name="description" content="【一句話介紹】">
<link rel="stylesheet" href="../../../assets/page-kit.css">
<style>
/* ── 本頁個性：換膚只要覆蓋 --pk-* 變數；質感與版面在這裡發揮 ── */
:root{
  --pk-bg:#0d0d10; --pk-ink:#e8e4da; --pk-accent:#e0a458;
}
/* 頁面專屬樣式寫在下面（獲獎作品集工藝、fancy 但不吵雜） */

/* 頁內若有自己的動畫，記得各自降級（kit 只降通用 transition） */
@media (prefers-reduced-motion: reduce){
  /* .my-anim{ animation:none } */
}
</style>
</head>
<body>
<a class="pk-home" href="../../../index.html">← 回首頁</a>

<header class="pk-hero">
  <div class="pk-wrap">
    <!-- 第一屏＝鉤子：場景／懸念／大膽斷言，禁止「XX 是……」定義式開場 -->
    <h1 class="rv">【鉤子第一句】</h1>
    <p class="rv">【第二句，把「你」放進場景】</p>
  </div>
</header>

<main class="pk-wrap">
  <!-- 起承轉合逐段揭露；互動＝劇情高潮、由使用者親手觸發 -->
  <section class="rv">
    <h2>【承】</h2>
    <p>……</p>
  </section>
</main>

<footer class="pk-foot pk-wrap">
  資料來源：【來源掛名，一行】。
</footer>

<script src="../../../assets/page-kit.js"></script>
<script>
'use strict';
const LS = '${args.ls}';           /* 本頁 localStorage 前綴（全站唯一） */
const store = PK.store(LS);        /* store.get('k',預設)／store.set('k',v) */

PK.reveal();                       /* .rv 進場編排（reduced 自動全亮） */

/* 核心邏輯抽成純函式（方便 node 斷言驗證）：
   function coreLogic(input){ ... return output; } */

/* 動畫用 PK.tick(fn(dt,t))／PK.untick(fn)；分頁隱藏自動暫停。
   canvas 用 PK.fitCanvas(cv)；dasharray 重播用 PK.replayDash(el)。
   動態訊息用 PK.announce('…')。 */
</script>
</body>
</html>
`;

const md = `# 【頁面標題】

**${date}｜【六大類之一】｜【emoji】**

**敘事容器**：【…】
**互動形式**：【…；高潮由使用者親手觸發】

---

## 這一頁的故事線

**鉤子**──【…】

**轉折**──【…】

**高潮（由讀者親手觸發）**──【…】

**記憶點**──【…】

## 這是什麼／怎麼玩

【…】

## 為什麼有趣

【…】

## 資料來源與方法論

- 【完整來源清單】

## localStorage

- 前綴 \`${args.ls}\`：【存了什麼】
`;

fs.writeFileSync(path.join(dirAbs, 'index.html'), html);
fs.writeFileSync(path.join(dirAbs, '說明.md'), md);
console.log(`✓ 已建立 ${dirRel}/{index.html, 說明.md}`);
console.log('\n接下來：');
console.log('1. 填入故事與互動（規範速查：CLAUDE.md；行為片段正典：tools/snippets.md 或 PK）');
console.log('2. 掛上首頁（含驗證與健檢，勿手改 data.js）：\n');
console.log(`   node tools/add.js --title "【標題】" --emoji "【emoji】" --dir "${dirRel}" \\`);
console.log(`        --category "【六大類之一】" --desc "【一句話，≤120 字，帶故事鉤子】" --date ${date}\n`);
console.log('3. tools/保養名冊.json 補一筆 {dir, created, lastMaintained:null, result:null}');

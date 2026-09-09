#!/usr/bin/env node
/* ==========================================================================
 * 題材回填 — 從既有頁面推導六軸，產生／補齊 tools/題材檔案.json
 *
 * 一次性工具，但留著：軸的定義若日後調整，可以重跑重新推導。
 * 用法：
 *   node tools/題材回填.js            只印出推導結果，不寫檔（預設乾跑）
 *   node tools/題材回填.js --write    寫入 tools/題材檔案.json（不覆蓋已人工改過的列）
 *   node tools/題材回填.js --write --force   全部重推（會蓋掉人工修正）
 *
 * 推導是啟發式的，會有誤差。真正重要的是「最近幾天」那幾列要準——那是每天
 * 防重複實際比對的範圍——所以人工校對過的列請加上 "by":"人工"，重跑不會被蓋。
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./題材軸.js');

const ROOT = T.ROOT;
const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');

/* ---- 讀 data.js ---- */
const src = fs.readFileSync(path.join(ROOT, 'assets', 'data.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src + ';this.__P = PROJECTS;', sandbox);
const PROJECTS = sandbox.__P;

const read = (dir, f) => {
  const p = path.join(ROOT, dir, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};
/* 一個專案可能拆成 index.html + app.js + style.css */
function allCode(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return '';
  let out = '';
  for (const f of fs.readdirSync(abs)) {
    if (/\.(html|js)$/i.test(f)) out += fs.readFileSync(path.join(abs, f), 'utf8');
    else if (fs.statSync(path.join(abs, f)).isDirectory()) {
      for (const g of fs.readdirSync(path.join(abs, f))) {
        if (/\.(html|js)$/i.test(g)) out += fs.readFileSync(path.join(abs, f, g), 'utf8');
      }
    }
  }
  return out;
}

/* ---- 年代：只看「頁面可見文案」——說明.md 的資料來源塞滿引註年份，會把
 *      每一篇都拖成當代。另外排除 2025 起的年份（那是本站自己的日期）。---- */
function guessEra(pageProse) {
  /* 「1600×1200」「1080p」這種尺寸數字曾經害整頁被判成古代。優先只認「__ 年」，
     真的找不到才退回寬鬆比對，且擋掉前後接數字或 ×／p／px／像素的。 */
  const withNian = [...pageProse.matchAll(/(1[0-9]{3}|20[0-2][0-9])\s*年/g)].map(m => +m[1]);
  const loose = [...pageProse.matchAll(
    /(?<![\d×xX*\-–/.])(1[4-9]\d{2}|20[0-2]\d)(?![\d×xX*\-–/.]|\s*[pP]\b|\s*px|\s*像素)/g)].map(m => +m[1]);
  const years = (withNian.length >= 2 ? withNian : withNian.concat(loose))
    .filter(y => y >= 1000 && y <= 2024);
  const ancient = /西元前|公元前|古希臘|古埃及|古羅馬|亞里斯多德|柏拉圖|畢達哥拉斯|春秋|戰國|漢朝|唐朝|兩千年前|中世紀/.test(pageProse);
  if (ancient && years.filter(y => y > 1500).length < 3) return '古代';
  if (!years.length) return /現在|今天|如今|每天|你的手機|網路上/.test(pageProse) ? '當代' : '無年代';
  const bucket = (y) => y < 1500 ? '古代' : y < 1600 ? '1500s' : y < 1700 ? '1600s'
    : y < 1800 ? '1700s' : y < 1900 ? '1800s' : y < 1950 ? '1900前半'
    : y < 2000 ? '1900後半' : '2000後';
  const tally = new Map();
  for (const y of years) tally.set(bucket(y), (tally.get(bucket(y)) || 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  /* 平手時取較早的那個：故事的重心通常在最早那個年代 */
  const best = top.filter(x => x[1] === top[0][1])
    .sort((a, b) => AXES_ERA_ORDER.indexOf(a[0]) - AXES_ERA_ORDER.indexOf(b[0]))[0][0];
  return best;
}
const AXES_ERA_ORDER = ['古代', '1500s', '1600s', '1700s', '1800s', '1900前半', '1900後半', '2000後', '當代', '無年代'];

/* ---- 地理 ---- */
const GEO = {
  歐洲: ['英國', '英格蘭', '蘇格蘭', '德國', '法國', '巴黎', '倫敦', '義大利', '羅馬', '荷蘭',
        '瑞典', '瑞士', '維也納', '奧地利', '西班牙', '葡萄牙', '丹麥', '挪威', '芬蘭', '匈牙利',
        '波蘭', '希臘', '比利時', '歐洲', '柏林', '慕尼黑'],
  美國: ['美國', '紐約', '加州', '華盛頓', '芝加哥', '矽谷', '波士頓', '德州', '好萊塢', '舊金山'],
  日本: ['日本', '東京', '京都', '大阪', '江戶'],
  華語圈: ['台灣', '臺灣', '中國', '香港', '清朝', '唐朝', '宋朝', '明朝', '北京', '上海'],
  其他地區: ['非洲', '印度', '南美', '巴西', '澳洲', '俄羅斯', '蘇聯', '中東', '埃及', '韓國',
           '墨西哥', '加拿大', '土耳其', '伊朗', '南極', '北極'],
};
function guessRegion(prose) {
  /* 只吃頁面文案：說明.md 的來源清單全是外文出版地，會把地理全部拉去歐美 */
  const tally = [];
  for (const [k, ws] of Object.entries(GEO)) {
    const n = ws.reduce((s, w) => s + (prose.split(w).length - 1), 0);
    if (n) tally.push([k, n]);
  }
  if (!tally.length) return '無';
  tally.sort((a, b) => b[1] - a[1]);
  /* 三個以上文化圈都被提到、且沒有壓倒性的一個 → 視為全球題材 */
  if (tally.length >= 3 && tally[0][1] < tally[1][1] * 2) return '全球';
  return tally[0][0];
}

/* ---- 主互動：由程式碼特徵挑「最主要」的那一個（越前面越優先） ---- */
function guessVerb(code) {
  const table = [
    ['餵自己的資料', /type="file"|FileReader|drop(zone|Zone)|貼上你的|你的照片|你的檔案/],
    ['輸入文字', /<textarea|type="text"|contenteditable="true"/],
    ['繪製', /pointermove[\s\S]{0,400}(lineTo|moveTo)|isDrawing|畫一條|用手畫/],
    ['聆聽', /AudioContext|Tone\.|new Audio\(/],
    ['計時反應', /反應時間|倒數|countdown|Date\.now\(\)[\s\S]{0,200}(start|t0)/],
    ['拖曳', /pointerdown|mousedown|dragstart|draggable/],
    ['滑桿', /type="range"|role="slider"/],
    ['按住', /pointerdown[\s\S]{0,200}pointerup|按住不放|長按/],
    ['選分支', /choice|branch|選項|分支|option-btn/],
    ['點擊揭曉', /addEventListener\(\s*['"]click/],
  ];
  for (const [v, re] of table) if (re.test(code)) return v;
  return '點擊揭曉';
}

/* ---- 敘事容器 ----
 * 只認兩種證據：(1) 說明.md 明講「敘事容器」；(2) 說明.md 故事線段落裡的明確描述。
 * 這一軸沒有可靠的程式特徵——舊版拿頁面關鍵字去猜，結果 44% 都被判成「前後對照」，
 * 純屬「對照」二字在文案裡太常見。猜不出來就老實標 未標註，寧可少擋不要誤擋。
 */
const CONTAINER_KW = [
  ['假文件', ['一封信', '報紙頭條', '頭條', '卷宗', '檔案夾', '筆記本', '實驗筆記', '展示牌', '博物館', '公文', '判決書', '菜單', '說明書', '目錄卡', '標本卡']],
  ['假介面', ['假介面', '假終端', '假的聊天', '假聊天', '終端機', '聊天訊息', '聊天室', '搜尋框', '登入畫面', '上傳進度', '作業系統', '對話框']],
  ['實驗台', ['實驗台', '工作台', '試拍', '操作台', '控制台', '儀表板', '實驗室', '沙盒', '機台']],
  ['可玩故事', ['文字冒險', '可玩的故事', '互動小說', '你的選擇決定']],
  ['倒數解謎', ['倒數解謎', '解謎', '謎題', '密室', '線索一', '破案']],
  ['前後對照', ['前後對照', '對照組', '左右對照', 'before/after', 'before / after', '之前與之後']],
  ['分章旅程', ['分章', '第一章', '章節', '逐章', '一站一站', '一段旅程']],
  ['逐步揭曉', ['逐步揭曉', '一格一格', '一層一層', '一個一個打開', '掀開', '抽屜']],
  ['沉浸全螢幕', ['沉浸式全螢幕', '沉浸式', '滿版']],
  ['捲動敘事', ['捲動敘事', 'scrollytelling', '往下捲', '一路捲']],
];
/* 宣告句常寫成「**一座標本櫃**（不是捲動敘事、不是假介面…）」——括號裡那串
   是「刻意避開的容器」，直接拿去比對會判成完全相反的答案。先砍掉再說。 */
function stripNegations(s) {
  return String(s).replace(/不是[^、。，）)]{0,10}/g, ' ');
}
function guessContainer(md) {
  const named = md.match(/\*\*?敘事容器\*\*?[：:]\s*\*{0,2}([^\n]{2,160})/);
  const zones = [named ? stripNegations(named[1]) : '',
                 stripNegations((md.match(/##\s*故事線[\s\S]{0,900}/) || [''])[0])];
  for (const zone of zones) {
    if (!zone) continue;
    const scored = CONTAINER_KW
      .map(([v, ws]) => [v, ws.reduce((s, w) => s + (zone.split(w).length - 1), 0) + (zone.includes(v) ? 3 : 0)])
      .filter(x => x[1]).sort((a, b) => b[1] - a[1]);
    if (scored.length) return scored[0][0];
  }
  return '未標註';
}

/* ---- 體裁 ----
 * 判斷順序照「這一頁對讀者而言本質上是什麼」：能帶走的工具 > 能重玩的遊戲 >
 * 講一段過去的事 > 拆一個機制 > 談當下 > 談語言。
 */
const cnt = (s, re) => (s.match(re) || []).length;
function guessGenre(p, prose, code, era) {
  const ownData = /type="file"|FileReader|<textarea|contenteditable="true"|貼上你的|你的照片|你的檔案|你自己的|輸入你的|拖進你/.test(code + prose);
  const isGame = cnt(prose, /關卡|分數|過關|得分|再玩一次|排行|挑戰你|你贏|你輸/g) >= 3;
  const historical = ['古代', '1500s', '1600s', '1700s', '1800s', '1900前半', '1900後半'].includes(era);
  /* 「動手實驗」＝拿讀者自己當受試者：測反應、測感知、測記憶 */
  const selfTest = cnt(prose, /測測你|你的反應|閉上眼|你聽得到|你看得出|你的答案是|再試一次你/g) >= 2;
  const mechHits = cnt(prose, /模擬|公式|參數|模型|定律|方程|係數|演算法|實驗條件/g);

  /* 「能用的工具」門檻要高：得是這一類、又真的吃使用者自己的資料，而且
     故事不是掛在某段歷史上——否則每篇提到「你的手機」的歷史故事都會被誤判 */
  if (ownData && p.category === '生活痛點小工具' && !historical) return '能用的工具';
  if (isGame && !historical) return '遊戲玩具';
  if (selfTest && !historical) return '動手實驗';
  if (historical) return '歷史揭曉';
  if (mechHits >= 4) return '科學機制';
  if (era === '當代' || era === '2000後') return '當代觀察';
  if (ownData) return '能用的工具';
  return '科學機制';
}

/* ---- 題材領域：這一頁在談哪個知識圈（2026-09-09 第二版新增） ---- */
const DOMAIN_KW = [
  ['語言文字', /字母|拼字|詞源|文法|標點|注音|漢字|語系|發音|翻譯|字體|排版|方言|語言/g],
  ['心理認知', /記憶|注意力|錯覺|認知|心理|大腦|直覺|偏誤|情緒|知覺|意識|睡眠/g],
  ['生物醫學', /細胞|基因|病毒|細菌|演化|物種|醫學|疾病|藥|解剖|神經元|生態|animal|鳥|昆蟲/g],
  ['物理化學', /重力|光|波|頻率|溫度|壓力|分子|原子|元素|化學|物理|能量|熱|電磁|折射/g],
  ['工程建築', /橋|建築|結構|工程|機械|引擎|材料|鋼|水泥|電路|管線|隧道|工廠|製造/g],
  ['藝術設計', /繪畫|音樂|旋律|和弦|色彩|設計|字型|攝影|電影|動畫|雕塑|美術|舞|樂器/g],
  ['社會制度', /法律|制度|政府|郵政|選舉|條約|警察|法院|規定|政策|城市|人口|經濟|貨幣/g],
  /* 這兩類的關鍵字最容易吃掉別人：「資料」「程式」「遊戲」「球」在任何一頁都可能出現，
     所以只留專有到不會誤傷的詞。 */
  ['數學資訊', /機率|統計|演算法|壓縮率|加密|雜湊|網路協定|封包|數列|幾何|矩陣|位元|編碼|進位|質數/g],
  ['飲食日常', /咖啡|泡茶|麵|食物|烹飪|味覺|餐廳|冰箱|洗衣|家事|通勤|購物|食譜/g],
  ['運動遊戲', /籃球|足球|棒球|田徑|撲克牌|西洋棋|圍棋|骰子|奧運|賽事|選手|球員|球隊/g],
];
function guessDomain(prose) {
  const scored = DOMAIN_KW.map(([v, re]) => [v, cnt(prose, re)])
    .filter(x => x[1]).sort((a, b) => b[1] - a[1]);
  return scored.length ? scored[0][0] : '社會制度';
}

/* ---- 推導 ---- */
const prev = new Map(T.loadDossier().map(r => [r.dir, r]));
const rows = [];
for (const p of PROJECTS) {
  const old = prev.get(p.dir);
  if (old && old.by === '人工' && !FORCE) { rows.push(old); continue; }
  const md = read(p.dir, '說明.md');
  const code = allCode(p.dir);
  /* 年代／地理／體裁一律只看「讀者看得到的文案」＋ desc；
     說明.md 的資料來源塞滿引註年份與外文地名，混進來會把每一篇都判成當代歐美 */
  const prose = T.visibleText(read(p.dir, 'index.html')) + '\n' + p.desc;
  const era = guessEra(prose);
  rows.push({
    dir: p.dir,
    date: p.date,
    genre: guessGenre(p, prose, code, era),
    domain: guessDomain(prose),
    container: guessContainer(md),
    verb: guessVerb(code),
    era,
    region: guessRegion(prose),
    by: '推導',
  });
}
rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/* ---- 報告 ---- */
const tally = (k) => {
  const m = new Map();
  for (const r of rows) m.set(r[k], (m.get(r[k]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `${v} ${n}`).join('｜');
};
console.log(`推導 ${rows.length} 件（人工列保留 ${rows.filter(r => r.by === '人工').length} 筆）\n`);
for (const k of ['genre', 'domain', 'container', 'verb', 'era', 'region']) {
  console.log(`  ${T.AXES[k].label.padEnd(5)}：${tally(k)}`);
}
for (const [lbl, fn] of [['標題句型', T.titleForm], ['標題長度', T.titleBand]]) {
  const m = new Map();
  for (const p of PROJECTS) { const f = fn(p.title); m.set(f, (m.get(f) || 0) + 1); }
  console.log(`  ${lbl.padEnd(5)}：` +
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join('｜'));
}

console.log('\n最近 12 件的推導結果（請人工掃一眼）：');
const byDir = Object.fromEntries(PROJECTS.map(p => [p.dir, p]));
for (const r of rows.slice(0, 12)) {
  const p = byDir[r.dir];
  console.log(`  ${r.date} ${(p.title + '　　　　　　').slice(0, 12)} ` +
    `｜${r.genre}｜${r.domain}｜${r.container}｜${r.verb}｜${r.era}｜${r.region}` +
    `｜${T.titleForm(p.title)}／${T.titleBand(p.title)}`);
}

if (WRITE) { T.saveDossier(rows); console.log(`\n✅ 已寫入 tools/題材檔案.json`); }
else console.log('\n（乾跑，沒有寫檔。要寫入請加 --write）');

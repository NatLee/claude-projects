/* node test.js — 核心模擬斷言（棋盤座標、決定性、今晚那副骰子的劇情、頁面上引用的統計數字） */
const assert=require('assert');
const L=require(__dirname + "/sim.js");
// 棋盤：40 格、36 塊地、四角
assert.strictEqual(L.BOARD.length,40);
assert.strictEqual(L.BOARD.filter(s=>s.kind==='lot').length,36);
// tileCell：四角與連續性（相鄰格曼哈頓距離為 1）、不重複
const seen=new Set();
for(let i=0;i<40;i++){const [c,r]=L.tileCell(i);seen.add(c+','+r);const [c2,r2]=L.tileCell(i+1);assert.strictEqual(Math.abs(c-c2)+Math.abs(r-r2),1);assert(c===0||c===10||r===0||r===10);}
assert.strictEqual(seen.size,40);
assert.deepStrictEqual(L.tileCell(0),[10,10]);assert.deepStrictEqual(L.tileCell(10),[0,10]);assert.deepStrictEqual(L.tileCell(20),[0,0]);assert.deepStrictEqual(L.tileCell(30),[10,0]);
// 決定性：同 seed 同結果
assert.deepStrictEqual(L.simulate({seed:7,tax:.3}).hist,L.simulate({seed:7,tax:.3}).hist);
// 今晚那副（seed 4）：0% 你獨贏；12% 起不再獨贏；100% 全員勝利
const r0=L.simulate({seed:4,tax:0,trace:true});
assert.strictEqual(r0.end,'mono');assert.strictEqual(r0.winner,0);assert.strictEqual(L.summary(r0).busted,3);
assert.strictEqual(r0.owners.length,r0.rounds+1);assert.strictEqual(r0.poses.length,r0.rounds+1);
assert.strictEqual(L.tipping(4),12);
assert.strictEqual(L.simulate({seed:4,tax:1}).end,'prosper');
assert.strictEqual(L.simulate({seed:4,tax:.11}).end,'mono');
// 守恆：tax=0 時沒錢進公庫、工資不變
assert.strictEqual(r0.paidPublic,0);assert.strictEqual(r0.wages[r0.wages.length-1],100);
// 身家不為負；破產者為 0
for(const row of r0.hist) row.forEach(v=>assert(v>=0));
// 頁面文案：200 副骰子的臨界點中位數 9%、九成在 20% 以內
const tips=[];for(let s=1;s<=200;s++)tips.push(L.tipping(s));
tips.sort((a,b)=>a-b);
assert(tips.every(t=>t>=0));
assert.strictEqual(tips[99],9); assert.strictEqual(tips[100],9);
assert(tips.filter(t=>t<=20).length>=180, 'ninety pct <=20: '+tips.filter(t=>t<=20).length);
// 結局分類
assert.strictEqual(L.verdict({end:'mono'}).key,'mono');assert.strictEqual(L.verdict({end:'x'}).key,'stall');
console.log('全部斷言通過', 'r0.rounds', r0.rounds, 'p90', tips[179], '≤20:', tips.filter(t=>t<=20).length);

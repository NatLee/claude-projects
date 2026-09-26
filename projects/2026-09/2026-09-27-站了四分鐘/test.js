const fs=require('fs'),assert=require('assert'),vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
const m=html.match(/\/\* 曝光評級[\s\S]*?module\.exports = \{[\s\S]*?\};\s*\}/);
assert(m,'找不到純函式區塊');
const S={module:{exports:{}},Math:Math}; vm.createContext(S); vm.runInContext(m[0],S);
const F=S.module.exports;

/* 1. 曝光評級 */
[[0,0],[1.29,0],[1.3,1],[3.99,1],[4.0,2],[9,2]].forEach(([s,t])=>
  assert.strictEqual(F.exposureGrade(s).tier,t,'grade '+s));
assert.strictEqual(F.exposureGrade(4.2).key,'plate');

/* 2. 累積權重 */
assert.strictEqual(F.meanAlpha(0,1/48),1,'第一幀要整張蓋滿');
assert.ok(F.meanAlpha(10,1/48)>F.meanAlpha(20,1/48));
assert.strictEqual(F.meanAlpha(999,1/48),1/48,'要有下限');
let acc=0;for(let n=0;n<200;n++){const a=F.meanAlpha(n,0);acc=acc*(1-a)+0.7*a;}
assert.ok(Math.abs(acc-0.7)<1e-9,'常數序列均值 '+acc);
acc=0;for(let n=0;n<400;n++){const a=F.meanAlpha(n,0);acc=acc*(1-a)+(n%2?0.7:0.2)*a;}
assert.ok(Math.abs(acc-0.45)<0.02,'交錯序列均值 '+acc);

/* 3. 環繞 */
for(const v of [-0.62,-0.07,0.07,0.62]) for(const t of [0,1,3.7,55])
  { const x=F.wrapX(0.9,v,t,1.3); assert.ok(x>=0&&x<1.3,'wrapX 越界 '+x); }
assert.ok(Math.abs(F.wrapX(0.5,0.1,3,1.3)-0.8)<1e-12);
assert.ok(Math.abs(F.wrapX(1.2,0.1,3,1.3)-0.2)<1e-12);
assert.ok(Math.abs(F.wrapX(0.1,-0.1,3,1.3)-1.1)<1e-12);

/* 4. 顯影曲線 */
const P=0.70,K=0.115,G=1.7;
assert.strictEqual(F.develop(0.65,P,K,G),P,'淡影沒被抹平');
assert.strictEqual(F.develop(0.59,P,K,G),P);
assert.ok(F.develop(0.20,P,K,G)<0.20,'深色沒被加深');
assert.ok(F.develop(0.90,P,K,G)>0.90,'亮部沒被提亮');
assert.strictEqual(F.develop(P,P,K,G),P);
let prev=-1;for(let i=0;i<=2000;i++){const y=F.develop(i/2000,P,K,G);
  assert.ok(y>=0&&y<=1,'越界 '+y); assert.ok(y>=prev-1e-12,'不單調'); prev=y;}
/* knee=0 時退化成單純提高對比，且不動 pivot */
assert.ok(Math.abs(F.develop(0.60,P,0,G)-(P-0.10*G))<1e-12);

/* 5. 容忍帶隨高度線性收合，沒有硬邊 */
assert.strictEqual(F.kneeAt(0.00,K),0);
assert.strictEqual(F.kneeAt(0.50,K),0);
assert.strictEqual(F.kneeAt(0.62,K),K);
assert.strictEqual(F.kneeAt(1.00,K),K);
assert.ok(Math.abs(F.kneeAt(0.56,K)-K/2)<1e-12);
for(let i=1;i<=1000;i++){const a=F.kneeAt((i-1)/1000,K),b=F.kneeAt(i/1000,K);
  assert.ok(b>=a-1e-12&&b-a<K*0.02,'kneeAt 不連續');}

/* 6. 真正的驗收：頁面實際採用的速度與體型，四分鐘後必須被抹掉 */
const H=1, W=4/3;                       // stage 4:3
const laneScale=l=>0.22+l*0.88;
const bodyW=(l,cart)=>{const s=0.14*H*laneScale(l); return (cart?1.89:0.38)*s/W;};
const V_WALK=[0.07,0.17], V_CART=[0.40,0.62];
const ROAD=0.70, INK=0.12;              // 最深的路人
let worst=0;
for(const [cart,rng] of [[false,V_WALK],[true,V_CART]])
  for(const lane of [0.70,0.80,0.95])
    for(const sp of [rng[0],(rng[0]+rng[1])/2,rng[1]]){
      const c=F.coverage(bodyW(lane,cart),sp,F.NEED);
      const mixed=ROAD*(1-c)+INK*c;
      worst=Math.max(worst,ROAD-mixed);
      assert.strictEqual(F.develop(mixed,ROAD,K,G),ROAD,
        (cart?'車馬':'行人')+' lane='+lane+' v='+sp+' 沒被抹掉（暗了 '+(ROAD-mixed).toFixed(3)+'）');
    }
assert.ok(worst<K,'最壞情況 '+worst.toFixed(3)+' 應小於容忍帶 '+K);

/* 7. 反面：只曝兩秒，最慢的行人必須還看得見（否則故事就沒有轉折） */
{ const c=F.coverage(bodyW(0.95,false),V_WALK[0],2), mixed=ROAD*(1-c)+INK*c;
  assert.notStrictEqual(F.develop(mixed,ROAD,K,G),ROAD,'兩秒就該留下鬼影'); }
/* 8. 靜止的兩位（速度 0）永遠不會被抹掉 */
{ assert.strictEqual(F.coverage(bodyW(0.97,false),0,F.NEED),1);
  assert.ok(F.develop(INK,ROAD,K,G)<INK,'站著不動的人反而該更深'); }

console.log('✓ 全部斷言通過｜最壞殘影 '+worst.toFixed(3)+' < 容忍帶 '+K);

/* 9. 曝光不足的面紗：隨秒數單調退去，四分鐘剛好歸零，三段之間連續 */
assert.ok(Math.abs(F.veil(0,F.NEED)-0.72)<1e-12);
assert.strictEqual(F.veil(F.NEED,F.NEED),0);
assert.strictEqual(F.veil(9,F.NEED),0);
{ let p=1e9; for(let i=0;i<=400;i++){const y=F.veil(i/100,F.NEED);
    assert.ok(y>=0&&y<=0.72,'veil 越界 '+y); assert.ok(y<=p+1e-12,'veil 不遞減'); p=y;} }
{ const a=F.veil(F.GHOST-1e-6,F.NEED), b=F.veil(F.GHOST+1e-6,F.NEED);
  assert.ok(Math.abs(a-b)<1e-4,'tier0→tier1 面紗跳階'); }
console.log('✓ 面紗連續：0秒 '+F.veil(0,F.NEED).toFixed(2)+
            '｜1.3秒 '+F.veil(1.3,F.NEED).toFixed(2)+'｜4秒 '+F.veil(4,F.NEED).toFixed(2));

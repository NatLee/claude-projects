/* 量杯翻譯機 — app.js
   把量杯/大匙/毫升換算成公克（或反過來）。
   密度基準：美制標準杯 236.588 ml。乾料每杯克重採 King Arthur Baking 官方圖表；
   純液體（水、牛奶、油）採實測密度。 */
"use strict";

/* ---------- 常數 ---------- */
var CUP_ML = 236.588;   // 美制標準杯（密度基準）
var TBSP_ML = 14.7868;  // 美制大匙
var TSP_ML = 4.9289;    // 美制小匙

/* ---------- 材料資料 ----------
   g = 每美制杯克重（King Arthur）；density = 實測密度 g/ml（純液體用）。 */
var INGREDIENTS = [
  { id:"apf",   name:"中筋麵粉", kind:"powder", color:"#e6d8ba", g:120 },
  { id:"bread", name:"高筋麵粉", kind:"powder", color:"#e2d3af", g:120 },
  { id:"cake",  name:"低筋麵粉", kind:"powder", color:"#efe6ce", g:120 },
  { id:"ww",    name:"全麥麵粉", kind:"powder", color:"#d3ba8c", g:113 },
  { id:"gsug",  name:"細砂糖",   kind:"powder", color:"#eae4d6", g:198 },
  { id:"bsug",  name:"紅糖（壓實）", kind:"powder", color:"#a9702f", g:213 },
  { id:"psug",  name:"糖粉",     kind:"powder", color:"#f4efe4", g:113 },
  { id:"cocoa", name:"可可粉",   kind:"powder", color:"#6a4326", g:84 },
  { id:"corn",  name:"玉米澱粉", kind:"powder", color:"#f1ecdf", g:112 },
  { id:"oats",  name:"燕麥片",   kind:"powder", color:"#d6c49a", g:89 },
  { id:"pnut",  name:"花生醬",   kind:"sticky", color:"#c1863f", g:270 },
  { id:"butter",name:"奶油",     kind:"solid",  color:"#f2d774", g:227, hint:"1 條奶油 ＝ ½ 杯 ＝ 113 克 ｜ 1 大匙 ＝ 14 克" },
  { id:"oil",   name:"植物油",   kind:"liquid", color:"#e8c84a", density:0.92 },
  { id:"water", name:"水",       kind:"liquid", color:"#a9dcef", density:1.00 },
  { id:"milk",  name:"牛奶",     kind:"liquid", color:"#f1ece0", density:1.03 },
  { id:"honey", name:"蜂蜜",     kind:"sticky", color:"#dfa022", g:336 },
  { id:"maple", name:"楓糖漿",   kind:"liquid", color:"#b0611d", g:312 }
];

var UNITS = [
  { id:"cup",  label:"杯",   cup:true },
  { id:"tbsp", label:"大匙", ml:TBSP_ML },
  { id:"tsp",  label:"小匙", ml:TSP_ML },
  { id:"ml",   label:"毫升", ml:1 }
];

var CUP_STDS = [
  { id:"us",     label:"美制", full:"美制杯", disp:236, ml:236.588, note:"美式食譜" },
  { id:"metric", label:"公制", full:"公制杯", disp:250, ml:250,     note:"澳・紐・加" },
  { id:"jp",     label:"日式", full:"日式杯", disp:200, ml:200,     note:"日本料理" },
  { id:"rice",   label:"米杯", full:"米杯",   disp:180, ml:180,     note:"電鍋量米杯" }
];

var COMPARE_IDS = ["cocoa", "apf", "gsug", "butter", "honey"];

var OVEN_PRESETS = [[300,150],[325,163],[350,177],[375,191],[400,204],[425,218],[450,232],[475,246]];

/* ---------- 狀態 ---------- */
var state = {
  ing: "apf",
  amount: 1,
  unit: "cup",
  dir: "v2w",     // v2w 量杯→公克 ; w2v 公克→量杯
  cupStd: "us",
  ovenF: 350
};

var KEY = "kitchen.state";
var reduce = false;
var els = {};

/* ---------- 工具函式 ---------- */
function byId(id){ return document.getElementById(id); }
function ingById(id){ for (var i=0;i<INGREDIENTS.length;i++){ if (INGREDIENTS[i].id===id) return INGREDIENTS[i]; } return INGREDIENTS[0]; }
function unitById(id){ for (var i=0;i<UNITS.length;i++){ if (UNITS[i].id===id) return UNITS[i]; } return UNITS[0]; }
function cupStdById(id){ for (var i=0;i<CUP_STDS.length;i++){ if (CUP_STDS[i].id===id) return CUP_STDS[i]; } return CUP_STDS[0]; }

function density(ing){ return (ing.density != null) ? ing.density : ing.g / CUP_ML; }
function gPerUSCup(ing){ return Math.round(density(ing) * CUP_ML); }

function unitMl(unit, cupStdMl){ return unit.cup ? cupStdMl : unit.ml; }

function fmtGrams(g){
  if (!isFinite(g)) return "0";
  if (g >= 10) return String(Math.round(g));
  return String(Math.round(g * 10) / 10);
}
function trimNum(n){
  var r = Math.round(n * 100) / 100;
  return String(r);
}
function fmtCups(c){
  // 常見分數顯示
  var fracs = [[0.25,"¼"],[0.333,"⅓"],[0.5,"½"],[0.667,"⅔"],[0.75,"¾"]];
  if (c < 3){
    var whole = Math.floor(c);
    var rem = c - whole;
    for (var i=0;i<fracs.length;i++){
      if (Math.abs(rem - fracs[i][0]) < 0.04){
        return (whole > 0 ? whole : "") + fracs[i][1];
      }
    }
    if (rem < 0.04 && whole >= 1) return String(whole);
  }
  return trimNum(c);
}

function clampAmount(v){ v = parseFloat(v); if (!isFinite(v) || v < 0) return 0; return v; }

/* ---------- 核心計算 ---------- */
function compute(){
  var ing = ingById(state.ing);
  var d = density(ing);
  var cupStd = cupStdById(state.cupStd);
  var amt = clampAmount(state.amount);
  var grams, volumeMl;

  if (state.dir === "v2w"){
    var u = unitById(state.unit);
    volumeMl = amt * unitMl(u, cupStd.ml);
    grams = d * volumeMl;
  } else {
    grams = amt;                 // 輸入即公克
    volumeMl = grams / d;
  }
  var cupFrac = volumeMl / cupStd.ml;
  return { ing:ing, d:d, cupStd:cupStd, amt:amt, grams:grams, volumeMl:volumeMl, cupFrac:cupFrac };
}

/* ---------- 數字滾動動畫 ---------- */
var gaugeRAF = 0;
function tweenGrams(from, to){
  if (gaugeRAF) cancelAnimationFrame(gaugeRAF);
  if (reduce || document.hidden){ els.gVal.textContent = fmtGrams(to); return; }
  var t0 = 0, dur = 620;
  function step(ts){
    if (!t0) t0 = ts;
    var p = Math.min(1, (ts - t0) / dur);
    var e = 1 - Math.pow(1 - p, 3);
    els.gVal.textContent = fmtGrams(from + (to - from) * e);
    if (p < 1) gaugeRAF = requestAnimationFrame(step);
    else els.gVal.textContent = fmtGrams(to);
  }
  gaugeRAF = requestAnimationFrame(step);
}

/* ---------- 錶頭 ---------- */
function niceMax(g){
  var steps = [50,100,150,200,300,400,500,750,1000,1500,2000,3000];
  for (var i=0;i<steps.length;i++){ if (g <= steps[i]) return steps[i]; }
  return Math.ceil(g / 1000) * 1000;
}
function polar(frac, r){
  var a = Math.PI * (1 - frac);
  return { x: 150 + r * Math.cos(a), y: 150 - r * Math.sin(a) };
}
function renderGauge(grams){
  var full = niceMax(Math.max(1, grams));
  var frac = Math.max(0, Math.min(1, grams / full));
  var angle = -90 + 180 * frac;
  els.needle.setAttribute("transform", "rotate(" + angle.toFixed(2) + " 150 150)");
  var LEN = Math.PI * 120;
  els.progArc.setAttribute("stroke-dashoffset", String(LEN * (1 - frac)));

  // 刻度
  var g = els.ticks;
  while (g.firstChild) g.removeChild(g.firstChild);
  var NS = "http://www.w3.org/2000/svg";
  for (var i=0;i<=4;i++){
    var f = i / 4;
    var p1 = polar(f, 111), p2 = polar(f, 122), pt = polar(f, 135);
    var ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1", p1.x.toFixed(1)); ln.setAttribute("y1", p1.y.toFixed(1));
    ln.setAttribute("x2", p2.x.toFixed(1)); ln.setAttribute("y2", p2.y.toFixed(1));
    ln.setAttribute("stroke", "#c9b48c"); ln.setAttribute("stroke-width", "2");
    g.appendChild(ln);
    var tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", pt.x.toFixed(1)); tx.setAttribute("y", (pt.y + 3).toFixed(1));
    tx.setAttribute("text-anchor", "middle");
    tx.setAttribute("font-size", "9"); tx.setAttribute("fill", "#a8987a");
    tx.textContent = String(Math.round(full * f));
    g.appendChild(tx);
  }
}

/* ---------- 量杯 ---------- */
function renderCup(res){
  var fr = Math.max(0, Math.min(1, res.cupFrac));
  var fill = els.cupFill;
  fill.setAttribute("fill", res.ing.color);
  fill.setAttribute("transform", "translate(0 " + (204 * (1 - fr)).toFixed(2) + ") scale(1 " + fr.toFixed(4) + ")");
  // 液面
  var topY = 204 - 164 * fr;
  els.cupMeniscus.setAttribute("cy", topY.toFixed(1));
  els.cupMeniscus.setAttribute("rx", (58 * (0.55 + 0.45 * (1 - fr))).toFixed(1));
  els.cupMeniscus.style.opacity = fr < 0.02 ? "0" : "";
  // 杯身 class（液體有光澤）
  els.cup.setAttribute("class", "cup " + res.ing.kind);
  // 標籤
  els.cupSwatch.style.background = res.ing.color;
  els.cupName.textContent = res.ing.name;
  // 溢出
  if (res.cupFrac > 1.001){
    els.cupOver.hidden = false;
    els.cupOverX.textContent = "×" + trimNum(res.cupFrac);
  } else {
    els.cupOver.hidden = true;
  }
}

function buildCupTicks(){
  var NS = "http://www.w3.org/2000/svg";
  var g = els.cupTicks;
  var levels = [[0.25,"¼"],[0.5,"½"],[0.75,"¾"],[1,"1"]];
  for (var i=0;i<levels.length;i++){
    var y = 204 - 164 * levels[i][0];
    var ln = document.createElementNS(NS, "line");
    ln.setAttribute("x1","132"); ln.setAttribute("x2","146");
    ln.setAttribute("y1", y.toFixed(1)); ln.setAttribute("y2", y.toFixed(1));
    ln.setAttribute("stroke","#c9b48c"); ln.setAttribute("stroke-width","1.5");
    g.appendChild(ln);
    var tx = document.createElementNS(NS,"text");
    tx.setAttribute("x","150"); tx.setAttribute("y",(y+3.5).toFixed(1));
    tx.textContent = levels[i][1];
    g.appendChild(tx);
  }
}

/* ---------- 文字說明 ---------- */
function updateText(res){
  if (state.dir === "v2w"){
    var u = unitById(state.unit);
    els.gUnit.textContent = "克";
    els.gSub.textContent = trimNum(res.amt) + " " + u.label + " " + res.ing.name;
    var extra = res.ing.hint ? "　" + res.ing.hint : "";
    els.hint.innerHTML = "每 <b>1 " + res.cupStd.full + "</b>（" + res.cupStd.disp + " ml）的 " + res.ing.name +
      " ≈ <b>" + fmtGrams(res.d * res.cupStd.ml) + " 克</b>。" + escapeHtml(extra);
  } else {
    els.gUnit.textContent = "克";
    var tbsp = res.volumeMl / TBSP_ML;
    els.gSub.textContent = "≈ " + fmtCups(res.cupFrac) + " " + res.cupStd.full + "　｜　" + trimNum(tbsp) + " 大匙";
    els.hint.innerHTML = "把 <b>" + fmtGrams(res.grams) + " 克</b> 的 " + res.ing.name +
      " 換回體積（以 " + res.cupStd.full + " " + res.cupStd.disp + " ml 計）。";
  }
}
function escapeHtml(s){ return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---------- 主更新 ---------- */
var lastGrams = 0;
function update(){
  var res = compute();
  renderGauge(res.grams);
  renderCup(res);
  updateText(res);
  tweenGrams(lastGrams, res.grams);
  lastGrams = res.grams;
  // pop
  if (!reduce){
    els.readout.classList.remove("pop");
    void els.readout.offsetWidth;
    els.readout.classList.add("pop");
  }
  save();
}

/* ---------- 建立控制項 ---------- */
function buildChips(){
  var box = els.chips;
  for (var i=0;i<INGREDIENTS.length;i++){
    (function(ing){
      var b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.setAttribute("role","option");
      b.setAttribute("aria-selected", ing.id === state.ing ? "true" : "false");
      b.dataset.id = ing.id;
      var sw = document.createElement("span");
      sw.className = "sw"; sw.style.background = ing.color;
      var tx = document.createElement("span"); tx.textContent = ing.name;
      b.appendChild(sw); b.appendChild(tx);
      b.addEventListener("click", function(){
        state.ing = ing.id;
        markChips();
        update();
      });
      box.appendChild(b);
    })(INGREDIENTS[i]);
  }
}
function markChips(){
  var kids = els.chips.children;
  for (var i=0;i<kids.length;i++){
    kids[i].setAttribute("aria-selected", kids[i].dataset.id === state.ing ? "true" : "false");
  }
}

function buildUnits(){
  var box = els.units;
  for (var i=0;i<UNITS.length;i++){
    (function(u){
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role","radio");
      b.setAttribute("aria-checked", u.id === state.unit ? "true" : "false");
      b.textContent = u.label; b.dataset.id = u.id;
      b.addEventListener("click", function(){ state.unit = u.id; markSeg(box, u.id); update(); });
      box.appendChild(b);
    })(UNITS[i]);
  }
}
function buildCupStd(){
  var box = els.cupstd;
  for (var i=0;i<CUP_STDS.length;i++){
    (function(c){
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role","radio");
      b.setAttribute("aria-checked", c.id === state.cupStd ? "true" : "false");
      b.innerHTML = c.label + " <span style='opacity:.6;font-weight:600'>" + c.disp + "</span>";
      b.dataset.id = c.id;
      b.title = c.note + "（" + c.disp + " ml）";
      b.addEventListener("click", function(){ state.cupStd = c.id; markSeg(box, c.id); update(); });
      box.appendChild(b);
    })(CUP_STDS[i]);
  }
}
function markSeg(box, id){
  var kids = box.children;
  for (var i=0;i<kids.length;i++){
    kids[i].setAttribute("aria-checked", kids[i].dataset.id === id ? "true" : "false");
  }
}

function buildDir(){
  var kids = els.dir.children;
  for (var i=0;i<kids.length;i++){
    (function(b){
      b.addEventListener("click", function(){ setDir(b.dataset.dir); });
    })(kids[i]);
  }
}
function setDir(dir){
  if (dir === state.dir) return;
  var res = compute();
  state.dir = dir;
  if (dir === "w2v"){
    state.amount = Math.round(res.grams) || 100;
    els.unitField.style.display = "none";
    els.amtLabel.textContent = "公克數";
    els.amt.step = "5";
  } else {
    state.unit = "cup";
    state.amount = 1;
    els.unitField.style.display = "";
    els.amtLabel.textContent = "份量";
    els.amt.step = "0.25";
    markSeg(els.units, state.unit);
  }
  els.amt.value = trimNum(state.amount);
  var kids = els.dir.children;
  for (var i=0;i<kids.length;i++){
    var on = kids[i].dataset.dir === dir;
    kids[i].setAttribute("aria-checked", on ? "true":"false");
    kids[i].className = on ? "on" : "";
  }
  update();
}

/* ---------- 對照長條 ---------- */
function luminance(hex){
  var c = hex.replace("#","");
  var r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
  return (0.299*r + 0.587*g + 0.114*b) / 255;
}
function buildBars(){
  var box = els.bars;
  var set = [];
  for (var i=0;i<COMPARE_IDS.length;i++){ set.push(ingById(COMPARE_IDS[i])); }
  var max = 0;
  for (var j=0;j<set.length;j++){ max = Math.max(max, gPerUSCup(set[j])); }
  var rows = [];
  for (var k=0;k<set.length;k++){
    var ing = set[k], val = gPerUSCup(ing);
    var row = document.createElement("div"); row.className = "bar-row";
    var name = document.createElement("div"); name.className = "bar-name";
    var sw = document.createElement("span"); sw.className = "sw"; sw.style.background = ing.color;
    var nm = document.createElement("span"); nm.textContent = ing.name;
    name.appendChild(sw); name.appendChild(nm);
    var track = document.createElement("div"); track.className = "bar-track";
    var fill = document.createElement("div"); fill.className = "bar-fill";
    fill.style.background = ing.color;
    var v = document.createElement("span"); v.className = "bar-val";
    if (luminance(ing.color) > 0.62){ v.style.color = "#5a4a2e"; v.style.textShadow = "none"; }
    else { v.style.color = "#fff"; }
    v.textContent = val + " 克";
    fill.appendChild(v); track.appendChild(fill); row.appendChild(name); row.appendChild(track);
    box.appendChild(row);
    rows.push([fill, val, max]);
  }
  els.insight.innerHTML = "一杯<b>蜂蜜（336 克）</b>比一杯<b>可可粉（84 克）</b>重了整整 <b>4 倍</b>——量杯一樣滿，秤上卻天差地遠。所以認真烘焙的人都改用秤。";
  // 動畫：進場後填滿
  function fillBars(){
    for (var i=0;i<rows.length;i++){
      rows[i][0].style.width = (rows[i][1] / rows[i][2] * 100).toFixed(1) + "%";
    }
  }
  if (reduce){ fillBars(); }
  else {
    var done = false;
    var io = new IntersectionObserver(function(entries){
      for (var i=0;i<entries.length;i++){
        if (entries[i].isIntersecting && !done){ done = true; setTimeout(fillBars, 120); io.disconnect(); }
      }
    }, { threshold: 0.3 });
    io.observe(box);
  }
}

/* ---------- 烤箱溫度 ---------- */
function buildOven(){
  els.ovenF.addEventListener("input", function(){
    var f = parseFloat(els.ovenF.value);
    if (isFinite(f)){ state.ovenF = f; els.ovenC.value = String(Math.round((f - 32) * 5 / 9)); markPresets(); save(); }
  });
  els.ovenC.addEventListener("input", function(){
    var c = parseFloat(els.ovenC.value);
    if (isFinite(c)){ var f = Math.round(c * 9 / 5 + 32); els.ovenF.value = String(f); state.ovenF = f; markPresets(); save(); }
  });
  var box = els.ovenPresets;
  for (var i=0;i<OVEN_PRESETS.length;i++){
    (function(p){
      var b = document.createElement("button");
      b.type = "button"; b.className = "preset";
      b.textContent = p[0] + "°F · " + p[1] + "°C";
      b.dataset.f = String(p[0]);
      b.addEventListener("click", function(){
        els.ovenF.value = String(p[0]); els.ovenC.value = String(p[1]);
        state.ovenF = p[0]; markPresets(); save();
      });
      box.appendChild(b);
    })(OVEN_PRESETS[i]);
  }
}
function markPresets(){
  var kids = els.ovenPresets.children;
  for (var i=0;i<kids.length;i++){
    kids[i].classList.toggle("on", parseFloat(kids[i].dataset.f) === state.ovenF);
  }
}

/* ---------- 儲存 ---------- */
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
function load(){
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return;
    var o = JSON.parse(raw);
    if (o && typeof o === "object"){
      if (ingById(o.ing).id === o.ing) state.ing = o.ing;
      if (typeof o.amount === "number") state.amount = o.amount;
      if (unitById(o.unit).id === o.unit) state.unit = o.unit;
      if (o.dir === "v2w" || o.dir === "w2v") state.dir = o.dir;
      if (cupStdById(o.cupStd).id === o.cupStd) state.cupStd = o.cupStd;
      if (typeof o.ovenF === "number") state.ovenF = o.ovenF;
    }
  } catch (e) {}
}

/* ---------- cupWhy 說明 ---------- */
function wireCupWhy(){
  var msg = "同樣叫「一杯」，容量差很多：美式食譜＝236 ml、澳／紐／加＝250 ml、日本＝200 ml、電鍋量米杯＝180 ml。選錯杯，麵粉就差一成。";
  function show(){ els.hint.innerHTML = "<b>「一杯」有很多種：</b>" + escapeHtml(msg); }
  els.cupWhy.addEventListener("click", show);
  els.cupWhy.addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " "){ e.preventDefault(); show(); } });
}

/* ---------- 初始化 ---------- */
function init(){
  els.gauge = byId("gauge"); els.needle = byId("needle"); els.progArc = byId("progArc"); els.ticks = byId("ticks");
  els.gVal = byId("gVal"); els.gUnit = byId("gUnit"); els.gSub = byId("gSub"); els.readout = document.querySelector(".readout");
  els.cup = byId("cup"); els.cupFill = byId("cupFill"); els.cupMeniscus = byId("cupMeniscus");
  els.cupSwatch = byId("cupSwatch"); els.cupName = byId("cupName"); els.cupOver = byId("cupOver"); els.cupOverX = byId("cupOverX");
  els.cupTicks = byId("cupTicks");
  els.chips = byId("chips"); els.units = byId("units"); els.dir = byId("dir"); els.cupstd = byId("cupstd");
  els.unitField = byId("unitField"); els.amtLabel = byId("amtLabel"); els.amt = byId("amt");
  els.hint = byId("hint"); els.bars = byId("bars"); els.insight = byId("insight");
  els.ovenF = byId("ovenF"); els.ovenC = byId("ovenC"); els.ovenPresets = byId("ovenPresets");
  els.cupWhy = byId("cupWhy");

  var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduce = mq.matches;
  if (mq.addEventListener) mq.addEventListener("change", function(e){ reduce = e.matches; });
  else if (mq.addListener) mq.addListener(function(e){ reduce = e.matches; });

  load();

  buildChips(); buildUnits(); buildCupStd(); buildDir(); buildCupTicks(); buildBars(); buildOven();

  // 套用載入的狀態到 UI
  markChips(); markSeg(els.units, state.unit); markSeg(els.cupstd, state.cupStd);
  els.amt.value = trimNum(state.amount);
  els.ovenF.value = String(state.ovenF);
  els.ovenC.value = String(Math.round((state.ovenF - 32) * 5 / 9));
  markPresets();
  // dir UI
  var dkids = els.dir.children;
  for (var i=0;i<dkids.length;i++){
    var on = dkids[i].dataset.dir === state.dir;
    dkids[i].setAttribute("aria-checked", on ? "true":"false");
    dkids[i].className = on ? "on" : "";
  }
  if (state.dir === "w2v"){ els.unitField.style.display = "none"; els.amtLabel.textContent = "公克數"; els.amt.step = "5"; }

  // 份量輸入
  els.amt.addEventListener("input", function(){ state.amount = clampAmount(els.amt.value); update(); });
  byId("stepUp").addEventListener("click", function(){ step(1); });
  byId("stepDown").addEventListener("click", function(){ step(-1); });

  wireCupWhy();

  update();

  // 進場動畫
  requestAnimationFrame(function(){ document.body.classList.add("reveal"); });
}

function step(dir){
  var s = state.dir === "w2v" ? 5 : 0.25;
  var v = clampAmount(els.amt.value) + dir * s;
  if (v < 0) v = 0;
  v = Math.round(v * 1000) / 1000;
  state.amount = v;
  els.amt.value = trimNum(v);
  update();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

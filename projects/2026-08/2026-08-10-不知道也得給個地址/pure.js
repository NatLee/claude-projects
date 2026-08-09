/* ==========================================================================
 * 純函式：座標的算術
 * 這一頁的每個數字都由這裡算出來，沒有一個是手打進畫面的。
 * 同時給 <script src> 與 node（測試）使用。
 * ========================================================================== */
'use strict';

/* 十進位度數捨入到小數點後 d 位 */
function roundTo(v, d) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

/* 小數點後 d 位，在地圖上等於多大一格（公尺，取緯度方向 1 度 ≈ 111320 公尺） */
function gridMeters(d) {
  return 111320 / Math.pow(10, d);
}

/* 大圓距離（公里） */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* 十進位度 → 度分（給「39°50′N」這種寫法） */
function toDM(deg, axis) {
  const hemi = axis === 'lat' ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return d + '°' + String(m).padStart(2, '0') + '′' + hemi;
}

/* 固定小數位數的字串（38 → "38.0000"），保留負號 */
function fixed(v, d) {
  return roundTo(v, d).toFixed(d);
}

/* 千分位 */
function commas(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* 公尺 → 好唸的長度 */
function humanMeters(m) {
  if (m >= 1000) {
    const km = Math.round(m / 100) / 10;
    const int = commas(Math.floor(km));
    const dec = Math.round((km - Math.floor(km)) * 10);
    return (dec ? int + '.' + dec : int) + ' 公里';
  }
  if (m >= 100) return Math.round(m) + ' 公尺';
  return Math.round(m * 10) / 10 + ' 公尺';
}

/* 指數式計數：t=0 → 1，t=1 → target（讓 6 億跑起來像雪崩） */
function rampCount(t, target) {
  const c = Math.pow(target, Math.max(0, Math.min(1, t)));
  return Math.max(1, Math.min(target, Math.round(c)));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { roundTo, gridMeters, haversineKm, toDM, fixed, commas, humanMeters, rampCount };
}

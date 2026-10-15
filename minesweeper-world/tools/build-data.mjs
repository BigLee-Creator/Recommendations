// Builds game/js/data.js: 500 m land masks for each playable city + a low-res world outline.
// Source: Natural Earth land polygons (1:10m for cities, 1:110m for the world map) via world-atlas.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as topojson from 'topojson-client';

const require = createRequire(import.meta.url);
const CELL_KM = 0.5;
const MARGIN = 5; // locked cells drawn around the city boundary

// stars: difficulty 1..5, r: boundary radius in km
// landmarks: [name, lat, lon, kind] where kind 'r' = return point (airport/port/station), 's' = sight
const CITIES = [
  { id: 'busan', name: '부산', en: 'Busan', country: 'KR', flag: '🇰🇷', lat: 35.155, lon: 129.06, r: 13, stars: 2, landmarks: [
    ['김해국제공항', 35.1795, 128.9382, 'r'], ['부산역', 35.1151, 129.0414, 'r'], ['부산항 여객터미널', 35.1176, 129.049, 'r'],
    ['해운대 해수욕장', 35.1587, 129.1604, 's'], ['광안리 해수욕장', 35.1532, 129.1187, 's'], ['태종대', 35.0532, 129.087, 's'],
    ['용두산공원', 35.1006, 129.0323, 's'], ['범어사', 35.2847, 129.0686, 's'], ['을숙도', 35.1036, 128.942, 's'], ['감천문화마을', 35.0975, 129.0106, 's'] ] },
  { id: 'seoul', name: '서울', en: 'Seoul', country: 'KR', flag: '🇰🇷', lat: 37.5565, lon: 126.99, r: 13, stars: 3, landmarks: [
    ['서울역', 37.5547, 126.9707, 'r'], ['청량리역', 37.5803, 127.047, 'r'], ['수서역', 37.4873, 127.1018, 'r'],
    ['경복궁', 37.5796, 126.977, 's'], ['N서울타워', 37.5512, 126.9882, 's'], ['롯데월드타워', 37.5126, 127.1025, 's'],
    ['여의도공원', 37.526, 126.9227, 's'], ['동대문디자인플라자', 37.5665, 127.0092, 's'], ['북한산 백운대', 37.6587, 126.9779, 's'] ] },
  { id: 'tokyo', name: '도쿄', en: 'Tokyo', country: 'JP', flag: '🇯🇵', lat: 35.66, lon: 139.76, r: 14, stars: 3, landmarks: [
    ['하네다 공항', 35.5494, 139.7798, 'r'], ['도쿄역', 35.6812, 139.7671, 'r'], ['신주쿠역', 35.6896, 139.7006, 'r'],
    ['도쿄 타워', 35.6586, 139.7454, 's'], ['센소지', 35.7148, 139.7967, 's'], ['도쿄 스카이트리', 35.7101, 139.8107, 's'],
    ['메이지 신궁', 35.6764, 139.6993, 's'], ['오다이바', 35.6267, 139.7762, 's'], ['시부야 교차로', 35.6595, 139.7005, 's'] ] },
  { id: 'hongkong', name: '홍콩', en: 'Hong Kong', country: 'HK', flag: '🇭🇰', lat: 22.3, lon: 114.17, r: 12, stars: 3, landmarks: [
    ['스타 페리 선착장', 22.2936, 114.1686, 'r'], ['홍콩역', 22.2851, 114.1582, 'r'], ['홍함역', 22.303, 114.1817, 'r'],
    ['빅토리아 피크', 22.2759, 114.1455, 's'], ['몽콕', 22.3193, 114.1694, 's'], ['웡타이신 사원', 22.3416, 114.1938, 's'], ['오션파크', 22.2467, 114.1757, 's'] ] },
  { id: 'sydney', name: '시드니', en: 'Sydney', country: 'AU', flag: '🇦🇺', lat: -33.87, lon: 151.21, r: 13, stars: 2, landmarks: [
    ['시드니 공항', -33.9399, 151.1753, 'r'], ['센트럴역', -33.8832, 151.207, 'r'], ['서큘러 키', -33.8611, 151.2108, 'r'],
    ['오페라 하우스', -33.8568, 151.2153, 's'], ['하버 브리지', -33.8523, 151.2108, 's'], ['본다이 비치', -33.8908, 151.2743, 's'],
    ['타롱가 동물원', -33.8436, 151.2411, 's'], ['왕립 식물원', -33.8642, 151.2166, 's'] ] },
  { id: 'newyork', name: '뉴욕', en: 'New York', country: 'US', flag: '🇺🇸', lat: 40.735, lon: -73.99, r: 13, stars: 4, landmarks: [
    ['그랜드 센트럴역', 40.7527, -73.9772, 'r'], ['펜실베이니아역', 40.7506, -73.9935, 'r'], ['스태튼아일랜드 페리', 40.7013, -74.0132, 'r'],
    ['자유의 여신상', 40.6892, -74.0445, 's'], ['센트럴 파크', 40.7829, -73.9654, 's'], ['엠파이어 스테이트 빌딩', 40.7484, -73.9857, 's'],
    ['타임스 스퀘어', 40.758, -73.9855, 's'], ['브루클린 브리지', 40.7061, -73.9969, 's'] ] },
  { id: 'istanbul', name: '이스탄불', en: 'Istanbul', country: 'TR', flag: '🇹🇷', lat: 41.02, lon: 29.0, r: 13, stars: 3, landmarks: [
    ['시르케지역', 41.015, 28.9768, 'r'], ['하이다르파샤역', 40.9969, 29.0189, 'r'], ['카라쾨이 페리', 41.0225, 28.977, 'r'],
    ['아야 소피아', 41.0086, 28.9802, 's'], ['블루 모스크', 41.0054, 28.9768, 's'], ['갈라타 타워', 41.0256, 28.9744, 's'],
    ['그랜드 바자르', 41.0107, 28.9681, 's'], ['돌마바흐체 궁전', 41.0391, 29.0004, 's'] ] },
  { id: 'singapore', name: '싱가포르', en: 'Singapore', country: 'SG', flag: '🇸🇬', lat: 1.32, lon: 103.83, r: 14, stars: 2, landmarks: [
    ['하버프런트', 1.2653, 103.822, 'r'], ['주롱 이스트역', 1.3331, 103.7422, 'r'], ['창이 공항', 1.3644, 103.9915, 'r'],
    ['마리나 베이 샌즈', 1.2834, 103.8607, 's'], ['가든스 바이 더 베이', 1.2816, 103.8636, 's'], ['센토사', 1.2494, 103.8303, 's'],
    ['싱가포르 동물원', 1.4043, 103.793, 's'], ['머라이언 공원', 1.2868, 103.8545, 's'] ] },
  { id: 'paris', name: '파리', en: 'Paris', country: 'FR', flag: '🇫🇷', lat: 48.8566, lon: 2.3522, r: 12, stars: 4, landmarks: [
    ['파리 북역', 48.8809, 2.3553, 'r'], ['리옹역', 48.8443, 2.3744, 'r'], ['몽파르나스역', 48.8412, 2.3203, 'r'],
    ['에펠탑', 48.8584, 2.2945, 's'], ['루브르 박물관', 48.8606, 2.3376, 's'], ['노트르담 대성당', 48.853, 2.3499, 's'],
    ['개선문', 48.8738, 2.295, 's'], ['사크레쾨르 대성당', 48.8867, 2.3431, 's'] ] },
  { id: 'sanfrancisco', name: '샌프란시스코', en: 'San Francisco', country: 'US', flag: '🇺🇸', lat: 37.78, lon: -122.38, r: 13, stars: 5, landmarks: [
    ['페리 빌딩', 37.7955, -122.3937, 'r'], ['4th & King역', 37.7766, -122.3947, 'r'], ['오클랜드 공항', 37.7126, -122.2197, 'r'],
    ['금문교', 37.8199, -122.4783, 's'], ['알카트라즈', 37.8267, -122.423, 's'], ['피셔맨스 워프', 37.808, -122.4177, 's'],
    ['트윈 피크스', 37.7544, -122.4477, 's'], ['롬바드 스트리트', 37.8021, -122.4187, 's'] ] },
];

function loadLand(res) {
  const topo = JSON.parse(readFileSync(require.resolve(`world-atlas/land-${res}.json`), 'utf8'));
  return topojson.feature(topo, topo.objects.land).features[0].geometry.coordinates;
}

// Local grid: cell (x, y) -> lon/lat, 500 m square cells centered on the city
function makeGrid(c) {
  const R = Math.ceil(c.r / CELL_KM) + MARGIN;
  const size = 2 * R + 1;
  const kmPerLon = 111.32 * Math.cos((c.lat * Math.PI) / 180), kmPerLat = 110.574;
  const toXY = (lon, lat) => [((lon - c.lon) * kmPerLon) / CELL_KM + R, ((c.lat - lat) * kmPerLat) / CELL_KM + R];
  return { R, size, toXY };
}

// Even-odd scanline fill of land rings sampled at cell centers
function rasterize(polys, g) {
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    const pts = ring.map(([lon, lat]) => g.toXY(lon, lat));
    // keep rings whose bounding box overlaps the grid (a city can be far from any coastline vertex)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 >= 0 && x0 <= g.size && y1 >= 0 && y0 <= g.size) rings.push(pts);
  }
  const mask = new Uint8Array(g.size * g.size);
  for (let y = 0; y < g.size; y++) {
    const sy = y + 0.5, xs = [];
    for (const pts of rings) for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      if ((y0 <= sy) !== (y1 <= sy)) xs.push(x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(g.size - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) mask[y * g.size + x] = 1;
    }
  }
  return mask;
}

function packBits(mask) {
  const bytes = new Uint8Array(Math.ceil(mask.length / 8));
  mask.forEach((v, i) => { if (v) bytes[i >> 3] |= 1 << (i & 7); });
  return Buffer.from(bytes).toString('base64');
}

const land10 = loadLand('10m');
const cities = CITIES.map(c => {
  const g = makeGrid(c);
  const mask = rasterize(land10, g);
  const inside = (x, y) => Math.hypot(x - g.R, y - g.R) <= c.r / CELL_KM;
  let playable = 0;
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (mask[y * g.size + x] && inside(x, y)) playable++;
  // snap landmarks to the nearest playable land cell (within 3 cells), drop the rest
  const landmarks = [];
  for (const [name, lat, lon, kind] of c.landmarks) {
    const [fx, fy] = g.toXY(lon, lat);
    let best = null, bd = 9;
    for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) {
      if (!mask[y * g.size + x] || !inside(x, y)) continue;
      const d = (x + 0.5 - fx) ** 2 + (y + 0.5 - fy) ** 2;
      if (d < bd && !landmarks.some(l => l.x === x && l.y === y)) { bd = d; best = [x, y]; }
    }
    if (best) landmarks.push({ name, kind, x: best[0], y: best[1] });
    else console.warn(`  skip landmark ${c.name}/${name} (not on playable land)`);
  }
  console.log(`${c.name.padEnd(8)} grid ${g.size}x${g.size} playable ${playable} landmarks ${landmarks.length}`);
  return { id: c.id, name: c.name, en: c.en, country: c.country, flag: c.flag, lat: c.lat, lon: c.lon, r: c.r,
    stars: c.stars, size: g.size, radiusCells: c.r / CELL_KM, playable, land: packBits(mask), landmarks };
});

// World outline for menus: equirectangular, 0.1° integer coordinates, short rings dropped
// Antarctica is dropped; rings crossing the antimeridian are unwrapped so they stay continuous
const world = loadLand('110m').flatMap(poly => poly.slice(0, 1))
  .filter(r => r.length > 6 && Math.max(...r.map(p => p[1])) > -60)
  .map(r => {
    let prev = r[0][0], shift = 0;
    return r.flatMap(([lon, lat]) => {
      if (lon - prev > 180) shift -= 360; else if (prev - lon > 180) shift += 360;
      prev = lon;
      return [Math.round((lon + shift) * 10), Math.round(lat * 10)];
    });
  });

const out = `// Generated by tools/build-data.mjs from Natural Earth (public domain). Do not edit by hand.
window.WM = window.WM || {};
WM.CELL_KM = ${CELL_KM};
WM.CITIES = ${JSON.stringify(cities)};
WM.WORLD = ${JSON.stringify(world)};
`;
writeFileSync(new URL('../game/js/data.js', import.meta.url), out);
console.log(`wrote game/js/data.js (${(out.length / 1024).toFixed(0)} KB)`);

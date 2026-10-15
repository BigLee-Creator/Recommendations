window.WM = window.WM || {};

WM.U = {
  // mulberry32: small seeded PRNG so a run can be saved and restored exactly
  rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  packBits(arr) {
    const bytes = new Uint8Array(Math.ceil(arr.length / 8));
    for (let i = 0; i < arr.length; i++) if (arr[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  },

  unpackBits(b64, n) {
    const s = atob(b64), out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
    return out;
  },

  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  fmt: n => Math.floor(n).toLocaleString('ko-KR'),
  esc: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  pick: (arr, r) => arr[Math.floor(r() * arr.length)],

  vibrate(ms) {
    if (!WM.save || !WM.save.meta.settings.vibrate) return;
    try {
      if (window.AndroidBridge && AndroidBridge.vibrate) AndroidBridge.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* vibration is optional */ }
  },

  stars: n => '★'.repeat(n) + '☆'.repeat(5 - n),
  timeStr(ms) {
    const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
    return `${m}분 ${String(s).padStart(2, '0')}초`;
  },
};

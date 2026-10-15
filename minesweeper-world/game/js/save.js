// Offline persistence: everything lives in localStorage on the device
WM.save = {
  KEY: 'wm.save.v1',
  meta: null,

  fresh() {
    return {
      v: 1,
      gold: 0,
      up: {},
      settings: { chord: true, vibrate: true },
      stats: { runs: 0, km2: 0, best: {}, countries: [] },
      run: null,
    };
  },

  load() {
    let m = null;
    try { m = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { m = null; }
    const f = this.fresh();
    this.meta = m && m.v === 1 ? { ...f, ...m, settings: { ...f.settings, ...m.settings }, stats: { ...f.stats, ...m.stats } } : f;
  },

  write() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.meta)); } catch (e) { /* storage may be unavailable */ }
  },

  // throttled save while playing
  _t: null,
  soon() {
    if (this._t) return;
    this._t = setTimeout(() => {
      this._t = null;
      const r = WM.game && WM.game.run;
      if (r && !r.ended) { this.meta.run = WM.game.serialize(); this.write(); }
    }, 400);
  },

  reset() { this.meta = this.fresh(); this.write(); },
  up: id => WM.save.meta.up[id] || 0,
};

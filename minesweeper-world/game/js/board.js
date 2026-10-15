// City grid: land mask, mines, numbers and cell states. Pure data, no rendering.
WM.Board = class {
  constructor(city) {
    this.city = city;
    const n = (this.n = city.size), N = (this.N = n * n);
    const land = WM.U.unpackBits(city.land, N);
    const R = (n - 1) / 2;
    this.center = R;
    this.kind = new Uint8Array(N); // 0 sea, 1 playable land, 2 land outside the city (locked)
    this.dist = new Float32Array(N); // distance from center as a fraction of the city radius
    this.playable = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, d = Math.hypot(x - R, y - R);
      this.dist[i] = d / city.radiusCells;
      if (land[i]) { this.kind[i] = d <= city.radiusCells ? 1 : 2; if (this.kind[i] === 1) this.playable++; }
    }
    this.lmAt = new Int16Array(N).fill(-1);
    city.landmarks.forEach((l, k) => { this.lmAt[l.y * n + l.x] = k; });

    this.mine = new Uint8Array(N);
    this.open = new Uint8Array(N);
    this.flag = new Uint8Array(N);
    this.sure = new Uint8Array(N); // flags placed by skills/probes: always correct, locked
    this.boom = new Uint8Array(N); // mines that were stepped on
    this.chest = new Uint8Array(N); // 1 hidden, 2 revealed by skill, 3 collected
    this.num = new Uint8Array(N);
    this.revealAt = new Float64Array(N); // reveal animation timing (not saved)
    this.placed = false;
    this.safeOpened = 0;
    this.mineCount = 0;
  }

  forNb(i, f) {
    const n = this.n, x = i % n, y = (i / n) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < n && ny < n) f(ny * n + nx);
    }
  }

  // Mines are placed on the first click so that the first area is always safe
  placeMines(seed, first, safeR) {
    const r = WM.U.rng(seed), n = this.n, B = WM.BAL;
    const base = B.density[this.city.stars];
    const fx = first % n, fy = (first / n) | 0;
    for (let i = 0; i < this.N; i++) {
      if (this.kind[i] !== 1 || this.lmAt[i] >= 0) continue;
      const x = i % n, y = (i / n) | 0;
      if (Math.abs(x - fx) <= safeR && Math.abs(y - fy) <= safeR) continue;
      const d = this.dist[i];
      const p = base + (d < B.zoneInner ? -B.zoneDelta : d > B.zoneOuter ? B.zoneDelta : 0);
      if (r() < p) { this.mine[i] = 1; this.mineCount++; }
      else if (r() < B.chestRate) this.chest[i] = 1;
    }
    this.placed = true;
    this.computeNumbers();
  }

  computeNumbers() {
    for (let i = 0; i < this.N; i++) {
      let c = 0;
      this.forNb(i, j => { c += this.mine[j]; });
      this.num[i] = c;
    }
  }

  // Opens i (must be safe) and cascades through zeros. Returns opened cells with BFS depth.
  flood(i) {
    const out = [];
    if (this.open[i] || this.kind[i] !== 1 || this.mine[i]) return out;
    const q = [i], depth = new Map([[i, 0]]);
    this.open[i] = 1;
    while (q.length) {
      const c = q.shift(), d = depth.get(c);
      out.push({ i: c, d });
      if (this.flag[c] && !this.sure[c]) this.flag[c] = 0; // wrong flag swept away by the cascade
      if (this.num[c] !== 0) continue;
      this.forNb(c, j => {
        if (this.open[j] || this.kind[j] !== 1 || this.mine[j] || this.sure[j]) return;
        this.open[j] = 1; depth.set(j, d + 1); q.push(j);
      });
    }
    this.safeOpened += out.length;
    return out;
  }

  hasOpenNb(i) {
    let t = false;
    this.forNb(i, j => { if (this.open[j]) t = true; });
    return t;
  }

  flagsAround(i) {
    let c = 0;
    this.forNb(i, j => { if (this.flag[j] || this.boom[j]) c++; });
    return c;
  }

  get safeTotal() { return this.playable - this.mineCount; }

  serialize() {
    const P = WM.U.packBits;
    return { placed: this.placed, mine: P(this.mine), open: P(this.open), flag: P(this.flag), sure: P(this.sure),
      boom: P(this.boom), chest: Array.from(this.chest).join('').replace(/0+$/, '') };
  }

  restore(s) {
    const U = WM.U, N = this.N;
    this.placed = s.placed;
    if (!s.placed) return;
    this.mine = U.unpackBits(s.mine, N); this.open = U.unpackBits(s.open, N); this.flag = U.unpackBits(s.flag, N);
    this.sure = U.unpackBits(s.sure, N); this.boom = U.unpackBits(s.boom, N);
    for (let i = 0; i < s.chest.length; i++) this.chest[i] = +s.chest[i];
    this.mineCount = this.mine.reduce((a, b) => a + b, 0);
    this.safeOpened = this.open.reduce((a, b) => a + b, 0);
    this.computeNumbers();
  }
};

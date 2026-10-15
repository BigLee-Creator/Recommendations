// Run logic: clicks, damage, XP/levels, gold, skills, end conditions.
// Talks to the UI only through WM.ui.* calls so the rules stay readable.
WM.game = {
  run: null,
  board: null,

  newRun(cityId) {
    const city = WM.CITIES.find(c => c.id === cityId);
    const up = WM.save.up;
    const hp = WM.BAL.baseHP + up('hp');
    this.board = new WM.Board(city);
    this.run = {
      cityId, seed: (Math.random() * 2 ** 31) | 0,
      hp, maxHp: hp, shield: up('shield'), maxShield: up('shield'),
      level: 1, xp: 0, gold: 0, skills: {}, probes: up('probe'), rerolls: 1 + up('reroll'),
      pendingLevels: 0, offer: null,
      cnt: { sonar: 0, vest: 0, para: 1e9 }, // para starts ready
      lmFound: [], chestsFound: 0, hits: 0, direct: 0, cascade: 0,
      playMs: 0, newCountry: false, ended: null,
    };
    WM.save.meta.run = this.serialize();
    WM.save.write();
  },

  resume() {
    const s = WM.save.meta.run;
    if (!s || s.run.ended) return false;
    const city = WM.CITIES.find(c => c.id === s.run.cityId);
    if (!city) return false;
    this.board = new WM.Board(city);
    this.board.restore(s.board);
    this.run = s.run;
    return true;
  },

  serialize() { return { run: this.run, board: this.board.serialize() }; },

  lv(id) { return this.run.skills[id] || 0; },
  sv(id) { const lv = this.lv(id); return lv ? WM.SKILL[id].val(lv) : 0; },
  goldMult() { return (1 + WM.save.up('gold') * 0.1 + this.sv('midas')) * WM.BAL.starsGold(this.board.city.stars); },
  xpMult() { return 1 + WM.save.up('xp') * 0.08 + this.sv('learn'); },

  // ---- player actions -------------------------------------------------------

  // Left click / short tap
  primary(i, probe) {
    const b = this.board, r = this.run;
    if (!r || r.ended || r.pendingLevels || b.kind[i] !== 1) return;
    if (probe) return this.useProbe(i);
    if (b.open[i]) {
      if (WM.save.meta.settings.chord && b.num[i] > 0 && b.flagsAround(i) === b.num[i]) this.chord(i);
      return;
    }
    if (b.flag[i] || b.boom[i]) return;
    this.openCell(i, true);
    this.afterAction();
  },

  // Right click / long press
  toggleFlag(i) {
    const b = this.board, r = this.run;
    if (!r || r.ended || r.pendingLevels || b.kind[i] !== 1 || b.open[i] || b.boom[i] || b.sure[i]) return false;
    b.flag[i] ^= 1;
    WM.render.dirty = true;
    WM.save.soon();
    return true;
  },

  chord(i) {
    const b = this.board, targets = [];
    b.forNb(i, j => { if (b.kind[j] === 1 && !b.open[j] && !b.flag[j] && !b.boom[j]) targets.push(j); });
    for (const j of targets) { if (this.run.ended) break; this.openCell(j, true); }
    if (targets.length) this.afterAction();
  },

  useProbe(i) {
    const b = this.board, r = this.run;
    WM.ui.setProbeMode(false);
    if (b.open[i] || b.boom[i] || r.probes <= 0) return;
    r.probes--;
    if (b.placed && b.mine[i]) {
      b.flag[i] = 1; b.sure[i] = 1;
      WM.ui.float(i, '🔍 지뢰 발견!', 'info');
      WM.render.dirty = true;
    } else {
      b.flag[i] = 0;
      this.openCell(i, true);
    }
    this.afterAction();
  },

  openCell(i, direct) {
    const b = this.board, r = this.run;
    if (!b.placed) {
      b.placeMines(r.seed, i, WM.save.up('safe') ? 2 : 1);
      const meta = WM.save.meta;
      if (!meta.stats.countries.includes(b.city.country)) {
        meta.stats.countries.push(b.city.country);
        r.newCountry = true;
        this.addGold(WM.BAL.newCountry, null, true);
        WM.ui.toast(`🌏 새 나라 첫 탐험! <b>+${WM.BAL.newCountry} G</b>`);
      }
    }
    if (b.mine[i]) return this.stepOnMine(i, direct);
    const isolated = !b.hasOpenNb(i) && b.safeOpened > 0;
    const opened = b.flood(i);
    if (!opened.length) return;
    const now = performance.now();
    let xp = 0, goldN = 0;
    const B = WM.BAL, rnd = Math.random;
    const cascXp = this.lv('chain') ? this.sv('chain') : B.xpCascade;
    for (const { i: c, d } of opened) {
      b.revealAt[c] = now + d * 14;
      const first = c === i;
      xp += first ? B.xpDirect : cascXp;
      const [p, lo, hi] = first ? B.goldDirect : B.goldCascade;
      if (rnd() < p) goldN += lo + Math.floor(rnd() * (hi - lo + 1));
      if (b.chest[c] && b.chest[c] < 3) this.openChest(c);
      if (b.lmAt[c] >= 0) this.foundLandmark(c);
    }
    r.direct++; r.cascade += opened.length - 1;
    if (goldN) this.addGold(goldN, null);
    this.addXp(xp, opened.length > 8 ? i : null, opened.length);
    if (isolated && opened.length > 1) WM.ui.float(i, '🪂 새 거점 확보', 'info');
    this.tickCounters(opened.length);
    this.revealChests(opened);
    WM.render.dirty = true;
  },

  stepOnMine(i, direct) {
    const b = this.board, r = this.run;
    const isolated = direct && !b.hasOpenNb(i);
    if (this.lv('para') && isolated && r.cnt.para >= this.sv('para')) {
      r.cnt.para = 0;
      b.flag[i] = 1; b.sure[i] = 1;
      WM.ui.float(i, '🪂 낙하 탐사로 지뢰 회피!', 'info');
      WM.render.dirty = true;
      return;
    }
    if (this.lv('dud') && Math.random() < this.sv('dud')) {
      b.flag[i] = 1; b.sure[i] = 1;
      WM.ui.float(i, '🧯 불발! 피해 없음', 'info');
      WM.render.dirty = true;
      return;
    }
    b.boom[i] = 1; b.flag[i] = 0;
    r.hits++;
    WM.render.explode(i);
    WM.U.vibrate(180);
    if (r.shield > 0) {
      r.shield--;
      WM.ui.float(i, '💥 🛡️ 실드가 막았다', 'warn');
    } else {
      r.hp--;
      WM.ui.float(i, '💥 HP -1', 'bad');
      if (r.hp <= 0) { this.end('death'); return; }
    }
    WM.render.dirty = true;
  },

  openChest(c) {
    const b = this.board, r = this.run, B = WM.BAL;
    b.chest[c] = 3; r.chestsFound++;
    let g = B.chestGold[0] + Math.floor(Math.random() * (B.chestGold[1] - B.chestGold[0] + 1));
    if (this.lv('hunter')) g *= 1.5;
    this.addGold(g, c);
    WM.ui.float(c, `💰 보물 상자 +${WM.U.fmt(g * this.goldMult())} G`, 'gold');
  },

  revealChests(opened) {
    if (!this.lv('hunter')) return;
    const b = this.board, n = b.n, R = this.sv('hunter');
    for (let c = 0; c < b.N; c++) {
      if (b.chest[c] !== 1) continue;
      const cx = c % n, cy = (c / n) | 0;
      if (opened.some(({ i }) => Math.abs(i % n - cx) <= R && Math.abs(((i / n) | 0) - cy) <= R)) b.chest[c] = 2;
    }
  },

  foundLandmark(c) {
    const b = this.board, r = this.run, k = b.lmAt[c];
    if (r.lmFound.includes(k)) return;
    r.lmFound.push(k);
    const lm = b.city.landmarks[k];
    this.addGold(WM.BAL.landmarkGold, null);
    this.addXp(WM.BAL.xpLandmark, null);
    WM.ui.toast(`${lm.kind === 'r' ? '✈️ 귀환 포인트' : '🏛 랜드마크'} 발견: <span>${WM.U.esc(lm.name)}</span> · <b>+${WM.U.fmt(WM.BAL.landmarkGold * this.goldMult())} G</b>`);
  },

  tickCounters(safeCount) {
    const r = this.run;
    r.cnt.para += safeCount;
    if (this.lv('sonar')) {
      r.cnt.sonar += safeCount;
      const need = this.sv('sonar');
      while (r.cnt.sonar >= need) { r.cnt.sonar -= need; this.sonarPing(); }
    }
    if (this.lv('vest') && r.shield < r.maxShield) {
      r.cnt.vest += safeCount;
      const need = this.sv('vest');
      if (r.cnt.vest >= need) { r.cnt.vest = 0; r.shield++; WM.ui.toast('🛡️ 실드 재충전'); }
    } else r.cnt.vest = 0;
  },

  // Flag the hidden frontier mine closest to the most recently opened cells
  sonarPing() {
    const b = this.board;
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < b.N; i++) {
      if (!b.mine[i] || b.sure[i] || b.boom[i]) continue;
      let t = -1;
      b.forNb(i, j => { if (b.open[j] && b.revealAt[j] > t) t = b.revealAt[j]; });
      if (t < 0) continue; // only mines touching the opened area
      const score = t - (b.flag[i] ? 1e12 : 0); // prefer mines the player has not flagged yet
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return;
    b.flag[best] = 1; b.sure[best] = 1;
    WM.ui.float(best, '📡 지뢰 탐지', 'info');
  },

  addGold(base, cell, raw) {
    const g = raw ? base : base * this.goldMult();
    this.run.gold += g;
    if (cell != null) WM.ui.float(cell, `+${WM.U.fmt(g)} G`, 'gold');
  },

  addXp(base, cell, count) {
    const r = this.run;
    const xp = base * this.xpMult();
    r.xp += xp;
    if (cell != null) WM.ui.float(cell, `연쇄 ${count}칸 +${Math.round(xp)} XP`, 'xp');
    while (r.xp >= WM.BAL.xpNeed(r.level)) {
      r.xp -= WM.BAL.xpNeed(r.level);
      r.level++;
      r.pendingLevels++;
      if (this.lv('probe')) r.probes++;
      if (this.lv('medic') && r.hp < r.maxHp && Math.random() < this.sv('medic')) { r.hp++; WM.ui.toast('🩹 응급 처치: HP +1'); }
    }
  },

  afterAction() {
    const r = this.run, b = this.board;
    WM.render.dirty = true;
    if (r.ended) return;
    if (b.placed && b.safeOpened >= b.safeTotal) { this.end('conquest'); return; }
    if (r.pendingLevels && !r.offer) this.makeOffer();
    WM.ui.updateHud();
    WM.save.soon();
    if (r.offer) WM.ui.showLevelUp();
  },

  // ---- level-up cards -------------------------------------------------------

  makeOffer() {
    const r = this.run, owned = Object.keys(r.skills).length;
    const pool = WM.SKILLS.filter(s => this.lv(s.id) < s.max && (this.lv(s.id) || owned < WM.BAL.maxSkills));
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const total = pool.reduce((a, s) => a + WM.RARITY[s.rarity].w, 0);
      let x = Math.random() * total, k = 0;
      for (; k < pool.length - 1; k++) { x -= WM.RARITY[pool[k].rarity].w; if (x <= 0) break; }
      picks.push(pool.splice(k, 1)[0].id);
    }
    const fillers = ['$gold', '$heal'];
    while (picks.length < 3) picks.push(fillers[picks.length % 2]);
    r.offer = picks;
  },

  choose(id) {
    const r = this.run;
    if (!r.offer || !r.offer.includes(id)) return;
    if (id === '$gold') this.addGold(100, null, true);
    else if (id === '$heal') { r.hp = Math.min(r.maxHp, r.hp + 1); }
    else {
      const lv = (r.skills[id] = (r.skills[id] || 0) + 1);
      if (id === 'vital') { r.maxHp++; r.hp = Math.min(r.maxHp, r.hp + 1); }
      if (id === 'vest') { r.maxShield++; r.shield++; }
      if (id === 'probe') r.probes += WM.SKILL.probe.val(lv);
      if (id === 'para' && lv === 1) r.cnt.para = 1e9;
    }
    this.closeOffer();
  },

  skipOffer() { this.addGold(WM.BAL.skipGold, null, true); this.closeOffer(); },

  reroll() {
    if (this.run.rerolls <= 0) return;
    this.run.rerolls--;
    this.makeOffer();
    WM.ui.showLevelUp();
  },

  closeOffer() {
    const r = this.run;
    r.offer = null; r.pendingLevels--;
    if (r.pendingLevels > 0) this.makeOffer();
    WM.ui.updateHud();
    WM.save.soon();
    if (r.offer) WM.ui.showLevelUp(); else WM.ui.closeModal();
  },

  // ---- return / end ---------------------------------------------------------

  // A return point is usable once every safe cell in the 5x5 "runway" around it is open
  returnStatus() {
    const b = this.board, r = this.run, n = b.n, R = WM.BAL.runway;
    const out = [];
    b.city.landmarks.forEach((lm, k) => {
      if (lm.kind !== 'r' || !r.lmFound.includes(k)) return;
      let need = 0, done = 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = lm.x + dx, y = lm.y + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const i = y * n + x;
        if (b.kind[i] !== 1 || b.mine[i]) continue;
        need++; if (b.open[i]) done++;
      }
      out.push({ k, lm, need, done, ready: done >= need });
    });
    return out;
  },

  canReturn() { return this.returnStatus().some(s => s.ready); },

  end(reason) {
    const r = this.run, b = this.board, B = WM.BAL, meta = WM.save.meta;
    if (r.ended) return;
    let correct = 0, wrong = 0;
    for (let i = 0; i < b.N; i++) if (b.flag[i] && !b.sure[i]) { if (b.mine[i]) correct++; else wrong++; }
    const acc = correct + wrong ? correct / (correct + wrong) : 0;
    const flagBonus = correct >= B.flagBonusMin && acc >= B.flagBonusMinAcc ? correct * B.flagBonusPer * this.goldMult() : 0;
    const conquest = reason === 'conquest' ? b.playable * B.conquestPerCell * this.goldMult() : 0;
    const keep = reason === 'return' || reason === 'conquest' ? 1 : B.deathKeep + WM.save.up('insure') * B.insureStep;
    const subtotal = r.gold + flagBonus + conquest;
    const final = Math.floor(subtotal * keep);
    const pct = b.safeTotal ? b.safeOpened / b.safeTotal : 0;
    r.ended = { reason, correct, wrong, acc, flagBonus, conquest, keep, subtotal, final, pct,
      km2: b.safeOpened * WM.CELL_KM ** 2 };
    meta.gold += final;
    meta.stats.runs++;
    meta.stats.km2 += r.ended.km2;
    meta.stats.best[r.cityId] = Math.max(meta.stats.best[r.cityId] || 0, pct);
    meta.run = null;
    WM.save.write();
    // show every mine at the end
    WM.render.dirty = true;
    WM.ui.updateHud();
    setTimeout(() => WM.ui.showResult(), reason === 'death' ? 1100 : 300);
  },
};

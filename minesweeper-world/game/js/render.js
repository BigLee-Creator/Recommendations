// Canvas renderer + camera. Redraws only when something changed or an animation is running.
WM.render = {
  cam: { x: 0, y: 0, s: 24 },
  dirty: true,
  hover: -1,
  effects: [],
  shakeUntil: 0,
  MAX_S: 72,
  NUM_COLORS: ['', '#2f6fdf', '#2f9a47', '#d8433a', '#6a3fc1', '#a7471b', '#178f8f', '#222', '#777'],

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const loop = now => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  },

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
    this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    if (WM.game.board) this.clampCam();
    this.dirty = true;
  },

  // Space reserved by the HUD bars so "fit" keeps the city visible
  insets() {
    const top = document.querySelector('.hud-top'), bot = document.querySelector('.hud-bottom');
    return { top: top ? top.getBoundingClientRect().bottom : 0, bottom: bot ? this.H - bot.getBoundingClientRect().top : 0 };
  },

  minS() {
    const b = WM.game.board, d = b.city.radiusCells * 2 + 4, ins = this.insets();
    return Math.max(2, Math.min(this.W / d, (this.H - ins.top - ins.bottom) / d));
  },

  fit() {
    const b = WM.game.board, ins = this.insets();
    this.cam.s = this.minS();
    this.cam.x = b.center + 0.5;
    this.cam.y = b.center + 0.5 - (ins.top - ins.bottom) / 2 / this.cam.s;
    this.dirty = true;
  },

  // Start zoomed in enough to play, centered on the city
  playView() {
    const b = WM.game.board;
    this.cam.s = Math.max(this.minS(), WM.input.isTouch ? 34 : 28);
    this.cam.x = this.cam.y = b.center + 0.5;
    this.clampCam();
    this.dirty = true;
  },

  clampCam() {
    const b = WM.game.board, c = this.cam;
    c.s = WM.U.clamp(c.s, this.minS(), this.MAX_S);
    const lim = b.city.radiusCells + 2;
    c.x = WM.U.clamp(c.x, b.center + 0.5 - lim, b.center + 0.5 + lim);
    c.y = WM.U.clamp(c.y, b.center + 0.5 - lim, b.center + 0.5 + lim);
  },

  pan(dx, dy) { this.cam.x -= dx / this.cam.s; this.cam.y -= dy / this.cam.s; this.clampCam(); this.dirty = true; },

  zoomAt(sx, sy, factor) {
    const c = this.cam, [wx, wy] = this.toWorld(sx, sy);
    c.s = WM.U.clamp(c.s * factor, this.minS(), this.MAX_S);
    c.x = wx - (sx - this.W / 2) / c.s;
    c.y = wy - (sy - this.H / 2) / c.s;
    this.clampCam();
    this.dirty = true;
  },

  // Smooth zoom used when tapping while zoomed out too far to play
  zoomTo(sx, sy, targetS) {
    const start = this.cam.s, [wx, wy] = this.toWorld(sx, sy), t0 = performance.now();
    const fromX = this.cam.x, fromY = this.cam.y;
    const step = now => {
      const k = Math.min(1, (now - t0) / 260), e = 1 - (1 - k) ** 3;
      this.cam.s = start + (targetS - start) * e;
      this.cam.x = fromX + (wx - fromX) * e;
      this.cam.y = fromY + (wy - fromY) * e;
      this.clampCam(); this.dirty = true;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  toWorld(sx, sy) { const c = this.cam; return [c.x + (sx - this.W / 2) / c.s, c.y + (sy - this.H / 2) / c.s]; },

  toCell(sx, sy) {
    const b = WM.game.board;
    if (!b) return -1;
    const [wx, wy] = this.toWorld(sx, sy), x = Math.floor(wx), y = Math.floor(wy);
    return x < 0 || y < 0 || x >= b.n || y >= b.n ? -1 : y * b.n + x;
  },

  cellToScreen(i) {
    const b = WM.game.board, c = this.cam;
    return [(i % b.n + 0.5 - c.x) * c.s + this.W / 2, (((i / b.n) | 0) + 0.5 - c.y) * c.s + this.H / 2];
  },

  explode(i) {
    this.effects.push({ i, t0: performance.now() });
    this.shakeUntil = performance.now() + 260;
  },

  frame(now) {
    const animating = this.effects.length || now < this.shakeUntil || now < (this.animUntil || 0);
    if (!WM.game.board || WM.ui.screenName !== 'game' || (!this.dirty && !animating)) return;
    this.dirty = false;
    this.draw(now);
  },

  draw(now) {
    const ctx = this.ctx, b = WM.game.board, r = WM.game.run, c = this.cam, s = c.s, dpr = this.dpr;
    const ended = r && r.ended;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let ox = this.W / 2 - c.x * s, oy = this.H / 2 - c.y * s;
    if (now < this.shakeUntil) { ox += (Math.random() - 0.5) * 8; oy += (Math.random() - 0.5) * 8; }

    const g = ctx.createLinearGradient(0, 0, this.W, this.H);
    g.addColorStop(0, '#0d2f4f'); g.addColorStop(1, '#091f37');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);

    const x0 = Math.max(0, Math.floor(-ox / s)), y0 = Math.max(0, Math.floor(-oy / s));
    const x1 = Math.min(b.n - 1, Math.ceil((this.W - ox) / s)), y1 = Math.min(b.n - 1, Math.ceil((this.H - oy) / s));
    const bevel = s >= 10, showNum = s >= 11, gap = s >= 6 ? 1 : 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(s * 0.62)}px system-ui, sans-serif`;
    let revealPending = 0;
    const GREENS = ['#568a4a', '#5f9250', '#678c4e', '#6f9656'];

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * b.n + x, k = b.kind[i];
      if (!k) continue;
      const X = ox + x * s, Y = oy + y * s;
      if (k === 2) {
        ctx.fillStyle = (x + y) & 1 ? '#3b4643' : '#38423f';
        ctx.fillRect(X, Y, s - gap, s - gap);
        continue;
      }
      const shown = b.open[i] && now >= b.revealAt[i];
      if (b.open[i] && !shown) revealPending = Math.max(revealPending, b.revealAt[i]);
      if (shown) {
        ctx.fillStyle = (x * 7 + y * 13) % 5 ? '#efe5cf' : '#e9dec6';
        const a = Math.min(1, (now - b.revealAt[i]) / 120);
        if (a < 1) { revealPending = Math.max(revealPending, b.revealAt[i] + 120); ctx.globalAlpha = 0.35 + 0.65 * a; }
        ctx.fillRect(X, Y, s - gap, s - gap);
        ctx.globalAlpha = 1;
        if (showNum && b.num[i]) { ctx.fillStyle = this.NUM_COLORS[b.num[i]]; ctx.fillText(b.num[i], X + s / 2, Y + s / 2 + 1); }
      } else if (b.boom[i]) {
        ctx.fillStyle = '#e5392f'; ctx.fillRect(X, Y, s - gap, s - gap);
        if (s >= 8) this.drawMine(ctx, X, Y, s);
      } else {
        ctx.fillStyle = GREENS[(i * 2654435761 >>> 0) % 4];
        ctx.fillRect(X, Y, s - gap, s - gap);
        if (bevel) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(X, Y, s - gap, 2); ctx.fillRect(X, Y, 2, s - gap);
          ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(X, Y + s - gap - 2, s - gap, 2); ctx.fillRect(X + s - gap - 2, Y, 2, s - gap);
        }
        if (ended && b.mine[i] && !b.flag[i] && s >= 8) this.drawMine(ctx, X, Y, s, 0.55);
        if (b.flag[i]) {
          if (s >= 8) this.drawFlag(ctx, X, Y, s, b.sure[i]);
          else { ctx.fillStyle = b.sure[i] ? '#4aa3ff' : '#e5392f'; ctx.fillRect(X + s * 0.25, Y + s * 0.25, s * 0.5, s * 0.5); }
          if (ended && !b.mine[i] && s >= 8) this.drawCross(ctx, X, Y, s);
        } else if (b.chest[i] === 2 && s >= 8) {
          ctx.font = `${Math.round(s * 0.55)}px system-ui, sans-serif`;
          ctx.fillText('✨', X + s / 2, Y + s / 2 + 1);
          ctx.font = `800 ${Math.round(s * 0.62)}px system-ui, sans-serif`;
        }
      }
    }
    this.animUntil = revealPending;

    this.drawLandmarks(ctx, b, r, ox, oy, s);

    // city boundary
    ctx.save();
    ctx.strokeStyle = 'rgba(255,197,61,0.9)'; ctx.lineWidth = Math.max(1.5, Math.min(3, s / 10));
    ctx.setLineDash([Math.max(4, s * 0.5), Math.max(3, s * 0.3)]);
    ctx.beginPath(); ctx.arc(ox + (b.center + 0.5) * s, oy + (b.center + 0.5) * s, (b.city.radiusCells + 0.5) * s, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // hover outline (mouse)
    if (this.hover >= 0 && b.kind[this.hover] === 1 && s >= 8 && !ended) {
      const hx = ox + (this.hover % b.n) * s, hy = oy + ((this.hover / b.n) | 0) * s;
      ctx.strokeStyle = WM.ui.probeMode ? '#4aa3ff' : '#ffe066'; ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, s - gap - 2, s - gap - 2);
    }

    // explosion rings
    this.effects = this.effects.filter(e => now - e.t0 < 600);
    for (const e of this.effects) {
      const k = (now - e.t0) / 600, ex = ox + (e.i % b.n + 0.5) * s, ey = oy + (((e.i / b.n) | 0) + 0.5) * s;
      ctx.strokeStyle = `rgba(255,140,40,${1 - k})`; ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(ex, ey, s * (0.5 + k * 2.5), 0, Math.PI * 2); ctx.stroke();
    }
  },

  drawLandmarks(ctx, b, r, ox, oy, s) {
    const R = WM.BAL.runway;
    const status = r ? WM.game.returnStatus() : [];
    for (const st of status) {
      if (s < 4) continue;
      ctx.save();
      ctx.strokeStyle = st.ready ? '#39d5c0' : '#ff9f43'; ctx.lineWidth = 2;
      if (!st.ready) ctx.setLineDash([6, 4]);
      ctx.strokeRect(ox + (st.lm.x - R) * s, oy + (st.lm.y - R) * s, (2 * R + 1) * s, (2 * R + 1) * s);
      ctx.restore();
    }
    b.city.landmarks.forEach((lm, k) => {
      const X = ox + lm.x * s, Y = oy + lm.y * s, found = r && r.lmFound.includes(k);
      if (X < -200 || Y < -60 || X > this.W + 200 || Y > this.H + 60) return;
      const icon = lm.kind === 'r' ? '✈️' : '🏛';
      if (s >= 14) {
        if (!b.open[b.n * lm.y + lm.x]) {
          ctx.font = `${Math.round(s * 0.6)}px system-ui, sans-serif`;
          ctx.fillText(icon, X + s / 2, Y + s / 2 + 1);
        }
      } else {
        ctx.fillStyle = lm.kind === 'r' ? '#4aa3ff' : '#ffc53d';
        ctx.beginPath(); ctx.arc(X + s / 2, Y + s / 2, Math.max(2.5, s * 0.45), 0, Math.PI * 2); ctx.fill();
      }
      if (s >= 9) {
        const fs = Math.round(WM.U.clamp(s * 0.42, 10, 15));
        ctx.font = `700 ${fs}px system-ui, sans-serif`;
        const label = (found ? '' : icon + ' ') + lm.name;
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(6,18,32,0.9)';
        ctx.strokeText(label, X + s / 2, Y - fs * 0.7);
        ctx.fillStyle = found ? '#fff' : '#ffe9a8';
        ctx.fillText(label, X + s / 2, Y - fs * 0.7);
      }
    });
    ctx.font = `800 ${Math.round(s * 0.62)}px system-ui, sans-serif`;
  },

  drawFlag(ctx, X, Y, s, sure) {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(X + s * 0.45, Y + s * 0.2, Math.max(1.5, s * 0.08), s * 0.58);
    ctx.fillRect(X + s * 0.3, Y + s * 0.72, s * 0.42, Math.max(1.5, s * 0.08));
    ctx.fillStyle = sure ? '#3b8cff' : '#e5392f';
    ctx.beginPath();
    ctx.moveTo(X + s * 0.52, Y + s * 0.17); ctx.lineTo(X + s * 0.8, Y + s * 0.32); ctx.lineTo(X + s * 0.52, Y + s * 0.47);
    ctx.closePath(); ctx.fill();
  },

  drawMine(ctx, X, Y, s, alpha = 1) {
    const cx = X + s / 2, cy = Y + s / 2;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1.5, s * 0.08);
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 4, dx = Math.cos(ang) * s * 0.34, dy = Math.sin(ang) * s * 0.34;
      ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
    }
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - s * 0.07, cy - s * 0.07, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  },

  drawCross(ctx, X, Y, s) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath(); ctx.moveTo(X + s * 0.2, Y + s * 0.2); ctx.lineTo(X + s * 0.8, Y + s * 0.8);
    ctx.moveTo(X + s * 0.8, Y + s * 0.2); ctx.lineTo(X + s * 0.2, Y + s * 0.8); ctx.stroke();
  },
};

// Pointer handling for both platforms.
//  PC:     left click = open, right click = flag, wheel = zoom, drag = pan
//  Mobile: short tap = open, long press = flag, pinch = zoom, swipe = pan
WM.input = {
  isTouch: matchMedia('(pointer: coarse)').matches,
  LONG_PRESS_MS: 400,
  MOVE_MOUSE: 5,
  MOVE_TOUCH: 10,
  MIN_PLAY_MOUSE: 12,
  MIN_PLAY_TOUCH: 22,

  init(canvas) {
    const pts = new Map();
    let g = null, longTimer = null;
    const R = WM.render;
    const cancelLong = () => { clearTimeout(longTimer); longTimer = null; };
    const blocked = () => WM.ui.screenName !== 'game' || WM.ui.modalOpen || !WM.game.run || WM.game.run.ended;

    // When zoomed out too far, a tap zooms in instead of acting on a tiny cell
    const tooSmall = touch => R.cam.s < (touch ? this.MIN_PLAY_TOUCH : this.MIN_PLAY_MOUSE);
    const zoomIn = (x, y, touch) => R.zoomTo(x, y, touch ? 34 : 28);

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', e => {
      if (blocked()) return;
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const touch = e.pointerType !== 'mouse';
      this.isTouch = touch;

      if (!touch) {
        if (e.button === 2) {
          if (tooSmall(false)) zoomIn(e.clientX, e.clientY, false);
          else this.flagAt(e.clientX, e.clientY);
          return;
        }
        if (e.button !== 0) return;
        g = { type: 'press', id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, touch };
        return;
      }

      if (pts.size === 1) {
        g = { type: 'press', id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, touch };
        cancelLong();
        longTimer = setTimeout(() => {
          longTimer = null;
          if (!g || g.type !== 'press' || blocked()) return;
          g.type = 'done';
          if (tooSmall(true)) zoomIn(g.sx, g.sy, true);
          else if (this.flagAt(g.sx, g.sy)) WM.U.vibrate(35);
        }, this.LONG_PRESS_MS);
      } else if (pts.size === 2) {
        // a second finger always cancels the tap / long press and starts a pinch
        cancelLong();
        const [a, b] = [...pts.values()];
        g = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      }
    });

    canvas.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && !blocked()) {
          const c = R.toCell(e.clientX, e.clientY);
          if (c !== R.hover) { R.hover = c; R.dirty = true; }
        }
        return;
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!g || blocked()) return;
      if (g.type === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        R.pan(mx - g.mx, my - g.my);
        if (g.d > 0) R.zoomAt(mx, my, d / g.d);
        g.d = d; g.mx = mx; g.my = my;
        return;
      }
      if (e.pointerId !== g.id) return;
      if (g.type === 'press') {
        const lim = g.touch ? this.MOVE_TOUCH : this.MOVE_MOUSE;
        if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > lim) { g.type = 'pan'; cancelLong(); }
      }
      if (g.type === 'pan') {
        R.pan(e.clientX - g.lx, e.clientY - g.ly);
        if (R.hover !== -1) R.hover = -1;
      }
      g.lx = e.clientX; g.ly = e.clientY;
    });

    const up = e => {
      const had = pts.delete(e.pointerId);
      if (!had || !g) return;
      if (g.type === 'press' && e.pointerId === g.id && e.type === 'pointerup' && !blocked()) {
        cancelLong();
        if (tooSmall(g.touch)) zoomIn(g.sx, g.sy, g.touch);
        else this.primaryAt(g.sx, g.sy);
        g = null;
        return;
      }
      if (g.type === 'pinch') {
        // keep panning with the finger that stays down, but never turn it into a tap
        const rest = [...pts.entries()][0];
        g = rest ? { type: 'pan', id: rest[0], lx: rest[1].x, ly: rest[1].y } : null;
        return;
      }
      if (e.pointerId === g.id) { cancelLong(); g = null; }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (blocked()) return;
      const unit = e.deltaMode === 1 ? 33 : 1;
      R.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * unit * 0.0016));
    }, { passive: false });

    canvas.addEventListener('pointerleave', () => { if (R.hover !== -1) { R.hover = -1; R.dirty = true; } });
  },

  primaryAt(x, y) {
    const i = WM.render.toCell(x, y);
    if (i < 0) return;
    WM.game.primary(i, WM.ui.probeMode);
  },

  flagAt(x, y) {
    const i = WM.render.toCell(x, y);
    return i >= 0 && WM.game.toggleFlag(i);
  },
};

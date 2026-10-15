(function () {
  WM.save.load();
  WM.ui.init();
  const canvas = document.getElementById('board');
  WM.render.init(canvas);
  WM.input.init(canvas);
  WM.ui.show('hub');

  // Called by the Android wrapper's back button; returning false lets the app close
  window.WMonBack = () => WM.ui.back();
  // Called by the Android wrapper when the app is paused
  window.WMsave = () => { if (WM.game.run && !WM.game.run.ended) { WM.save.meta.run = WM.game.serialize(); WM.save.write(); } };

  // play time, and save when the app goes to the background
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), r = WM.game.run;
    if (r && !r.ended && WM.ui.screenName === 'game' && !document.hidden) r.playMs += now - last;
    last = now;
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.WMsave(); });
  window.addEventListener('resize', () => { if (WM.ui.screenName === 'hub' || WM.ui.screenName === 'cities') WM.ui.drawWorld(); });
})();

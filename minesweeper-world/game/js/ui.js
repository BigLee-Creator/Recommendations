// DOM screens and overlays: hub, city select, HUD, level-up, result, shop, settings, help
WM.ui = {
  screenName: null,
  modalOpen: false,
  probeMode: false,
  selectedCity: null,

  $: sel => document.querySelector(sel),

  init() {
    this.screen = this.$('#screen');
    this.modal = this.$('#modal');
    this.hud = this.$('#hud');
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (t && !t.disabled) this.act(t.dataset.act, t.dataset.arg, t);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.back(); });
  },

  // ---- navigation -------------------------------------------------------------

  show(name) {
    this.screenName = name;
    this.closeModal();
    this.probeMode = false;
    this.$('#floats').innerHTML = '';
    this.hud.classList.toggle('hidden', name !== 'game');
    WM.render.canvas.classList.toggle('hidden', name !== 'game');
    this.screen.className = name === 'game' ? '' : 'screen ' + name;
    this.screen.innerHTML = name === 'game' ? '' : this['tpl_' + name]();
    if (name === 'hub' || name === 'cities') this.drawWorld();
    if (name === 'game') { this.buildHud(); WM.render.dirty = true; }
  },

  // Android back button / Esc. Returns true when handled.
  back() {
    if (this.modalOpen) {
      if (WM.game.run && WM.game.run.offer && this.screenName === 'game') return true; // level-up must be chosen
      this.closeModal(); return true;
    }
    if (this.screenName === 'game') { this.showPause(); return true; }
    if (this.screenName === 'cities' || this.screenName === 'shop') { this.show('hub'); return true; }
    return false;
  },

  act(a, arg) {
    const G = WM.game;
    switch (a) {
      case 'hub': this.show('hub'); break;
      case 'cities': this.selectedCity = this.selectedCity || WM.CITIES[0].id; this.show('cities'); break;
      case 'pick': this.selectedCity = arg; this.show('cities'); break;
      case 'start':
        G.newRun(this.selectedCity);
        this.show('game'); WM.render.playView();
        this.toast(`${G.board.city.flag} <b>${G.board.city.name}</b> 탐험 시작! 경계 안이라면 어디든 눌러 보세요`);
        break;
      case 'continue':
        if (G.resume()) { this.show('game'); WM.render.playView(); if (G.run.offer) this.showLevelUp(); }
        break;
      case 'shop': this.show('shop'); break;
      case 'buy': this.buy(arg); break;
      case 'settings': this.showSettings(); break;
      case 'help': this.showHelp(); break;
      case 'toggle': WM.save.meta.settings[arg] = !WM.save.meta.settings[arg]; WM.save.write(); this.showSettings(); break;
      case 'reset': this.confirm('모든 골드·업그레이드·기록을 지웁니다. 계속할까요?', () => { WM.save.reset(); this.show('hub'); }); break;
      case 'close': this.closeModal(); break;
      case 'pause': this.showPause(); break;
      case 'save-exit': WM.save.meta.run = G.serialize(); WM.save.write(); G.run = null; G.board = null; this.show('hub'); break;
      case 'giveup': this.confirm('탐험을 포기하면 사망과 같이 처리되어 골드 일부만 남습니다.', () => { this.closeModal(); G.end('giveup'); }); break;
      case 'probe': this.setProbeMode(!this.probeMode); break;
      case 'fit': WM.render.fit(); break;
      case 'return': this.tryReturn(); break;
      case 'choose': G.choose(arg); break;
      case 'skip': G.skipOffer(); break;
      case 'reroll': G.reroll(); break;
      case 'skillinfo': this.showSkills(); break;
    }
  },

  // ---- templates --------------------------------------------------------------

  tpl_hub() {
    const m = WM.save.meta, run = m.run;
    const city = run && WM.CITIES.find(c => c.id === run.run.cityId);
    return `
      <canvas class="world"></canvas>
      <div class="hub-wrap">
        <div class="logo"><span>💣</span><h1>월드 마인스위퍼</h1><p>실제 세계지도 위 500m 지뢰밭을 탐험하세요</p></div>
        <div class="wallet big"><span class="coin"></span>${WM.U.fmt(m.gold)} G</div>
        <div class="hub-stats">
          <div><small>누적 탐사</small><b>${WM.U.fmt(m.stats.km2)} km²</b></div>
          <div><small>탐험 횟수</small><b>${m.stats.runs}회</b></div>
          <div><small>방문한 나라</small><b>${m.stats.countries.length}개</b></div>
        </div>
        <div class="menu">
          ${run ? `<button class="btn pri" data-act="continue">▶ 이어하기 · ${city ? city.flag + ' ' + city.name : ''} Lv ${run.run.level}</button>` : ''}
          <button class="btn ${run ? '' : 'pri'}" data-act="cities">🌍 새 탐험</button>
          <button class="btn gold" data-act="shop">🏪 상점 (영구 업그레이드)</button>
          <div class="row2"><button class="btn" data-act="help">❓ 도움말</button><button class="btn" data-act="settings">⚙️ 설정</button></div>
        </div>
        ${run ? '<p class="note">새 탐험을 시작하면 진행 중인 탐험은 사라집니다.</p>' : ''}
      </div>`;
  },

  tpl_cities() {
    const best = WM.save.meta.stats.best;
    const cards = WM.CITIES.map(c => `
      <button class="city ${c.id === this.selectedCity ? 'on' : ''}" data-act="pick" data-arg="${c.id}">
        <b>${c.flag} ${c.name}</b><small>${c.en}</small>
        <span class="stars">${WM.U.stars(c.stars)}</span>
        <span class="meta">${WM.U.fmt(c.playable)}칸 · 반경 ${c.r}km${best[c.id] ? ` · 최고 ${Math.round(best[c.id] * 100)}%` : ''}</span>
      </button>`).join('');
    const c = WM.CITIES.find(x => x.id === this.selectedCity);
    return `
      <canvas class="world"></canvas>
      <div class="top-bar"><button class="btn icon" data-act="hub">←</button><h2>탐험할 도시 선택</h2></div>
      <div class="cities-wrap">
        <div class="city-list">${cards}</div>
        <div class="city-detail panel">
          <h3>${c.flag} ${c.name} <small>${c.en}</small></h3>
          <p>난이도 <b class="stars">${WM.U.stars(c.stars)}</b> · 지뢰 밀도 약 ${Math.round(WM.BAL.density[c.stars] * 100)}% · 골드 ×${WM.BAL.starsGold(c.stars).toFixed(2)}</p>
          <p>플레이 가능 ${WM.U.fmt(c.playable)}칸 (${WM.U.fmt(c.playable * 0.25)} km²) · 랜드마크 ${c.landmarks.length}곳 (귀환 포인트 ${c.landmarks.filter(l => l.kind === 'r').length}곳)</p>
          <p class="note">한 번 출발하면 이 도시 경계 밖으로 나갈 수 없습니다. 경계 안에서는 어디든 바로 열 수 있어요.</p>
          <button class="btn pri" data-act="start">▶ ${c.name} 탐험 시작</button>
        </div>
      </div>`;
  },

  tpl_shop() {
    const m = WM.save.meta;
    const items = WM.UPGRADES.map(u => {
      const lv = m.up[u.id] || 0, maxed = lv >= u.max, cost = maxed ? 0 : u.cost(lv);
      const bars = Array.from({ length: u.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="item ${maxed ? 'maxed' : ''}">
        <div class="ic">${u.icon}</div>
        <div class="body"><h4>${u.name}</h4><p>${u.desc(lv)}</p><div class="lvbar">${bars}</div></div>
        ${maxed ? '<span class="max">MAX</span>' : `<button class="buy" data-act="buy" data-arg="${u.id}" ${m.gold < cost ? 'disabled' : ''}><span class="coin"></span>${WM.U.fmt(cost)}</button>`}
      </div>`;
    }).join('');
    return `
      <div class="top-bar"><button class="btn icon" data-act="hub">←</button><h2>🏪 탐험가 본부 상점</h2>
        <div class="wallet"><span class="coin"></span>${WM.U.fmt(m.gold)}</div></div>
      <div class="shop-wrap"><div class="grid">${items}</div>
        <div class="shop-cta"><button class="btn pri" data-act="cities">🌍 새 탐험 시작</button></div></div>`;
  },

  buy(id) {
    const u = WM.UPGRADES.find(x => x.id === id), m = WM.save.meta, lv = m.up[id] || 0;
    if (!u || lv >= u.max) return;
    const cost = u.cost(lv);
    if (m.gold < cost) return;
    m.gold -= cost; m.up[id] = lv + 1;
    WM.save.write();
    this.show('shop');
    this.toast(`${u.icon} <b>${u.name}</b> Lv ${lv + 1} 구매 완료`);
  },

  // ---- world map background ------------------------------------------------------

  drawWorld() {
    const cv = this.screen.querySelector('canvas.world');
    if (!cv) return;
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sc = Math.max(W / 3600, H / 1700), focus = WM.CITIES.find(c => c.id === this.selectedCity) || WM.CITIES[0];
    const ox = W / 2 - focus.lon * 10 * sc * (W < H ? 1 : 0.35), oy = H / 2 + 60 * sc;
    const P = (lon, lat) => [ox + lon * sc, oy - lat * sc];
    ctx.fillStyle = '#4f7d4a';
    for (const ring of WM.WORLD) for (const wrap of [-3600, 0, 3600]) {
      ctx.beginPath();
      for (let k = 0; k < ring.length; k += 2) { const [x, y] = P(ring[k] + wrap, ring[k + 1]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
    }
    for (const c of WM.CITIES) {
      const [x, y] = P(c.lon * 10, c.lat * 10), on = this.screenName === 'cities' && c.id === this.selectedCity;
      ctx.fillStyle = on ? '#ffc53d' : '#39d5c0';
      ctx.beginPath(); ctx.arc(x, y, on ? 6 : 4, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.strokeStyle = '#ffc53d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); }
    }
  },

  // ---- in-game HUD ----------------------------------------------------------------

  buildHud() {
    this.hud.innerHTML = `
      <div class="hud-top">
        <button class="btn icon" data-act="pause">☰</button>
        <div class="lvbox"><b class="lv"></b><div class="bar"><i class="xpfill"></i></div></div>
        <div class="hp"></div>
        <div class="gold"><span class="coin"></span><b class="goldv"></b></div>
      </div>
      <div class="hud-sub"><span class="city"></span><span class="pct"></span><button class="skills-chip" data-act="skillinfo"></button></div>
      <div class="hud-bottom">
        <button class="btn hb probe" data-act="probe">🔍 <span>탐침</span> <b class="probes"></b></button>
        <button class="btn hb" data-act="fit">🗺 <span>전체 보기</span></button>
        <button class="btn hb ret" data-act="return">✈️ <span>귀환</span></button>
      </div>`;
    this.updateHud();
  },

  updateHud() {
    const r = WM.game.run, b = WM.game.board;
    if (!r || this.screenName !== 'game') return;
    const q = s => this.hud.querySelector(s);
    q('.lv').textContent = `Lv ${r.level}`;
    q('.xpfill').style.width = `${Math.min(100, (r.xp / WM.BAL.xpNeed(r.level)) * 100)}%`;
    q('.hp').innerHTML = '❤️'.repeat(Math.max(0, r.hp)) + `<span class="off">${'🖤'.repeat(Math.max(0, r.maxHp - r.hp))}</span>` +
      (r.maxShield ? ` <span class="shield">🛡️${r.shield}</span>` : '');
    q('.goldv').textContent = WM.U.fmt(r.gold);
    q('.city').textContent = `${b.city.flag} ${b.city.name}`;
    const pct = b.placed ? Math.floor((b.safeOpened / b.safeTotal) * 1000) / 10 : 0;
    q('.pct').textContent = `개방률 ${pct}%`;
    const owned = Object.entries(r.skills);
    q('.skills-chip').innerHTML = owned.length ? owned.map(([id, lv]) => `${WM.SKILL[id].icon}<sub>${lv}</sub>`).join('') : '스킬 없음';
    q('.probes').textContent = r.probes;
    q('.probe').disabled = r.probes <= 0;
    q('.probe').classList.toggle('on', this.probeMode);
    const ret = q('.ret'), can = WM.game.canReturn();
    ret.classList.toggle('ready', can);
    WM.render.dirty = true;
  },

  setProbeMode(on) {
    this.probeMode = on && WM.game.run && WM.game.run.probes > 0;
    if (this.probeMode) this.toast('🔍 탐침: 확인할 칸을 누르세요');
    this.updateHud();
  },

  tryReturn() {
    const st = WM.game.returnStatus();
    if (st.some(s => s.ready)) {
      const g = WM.U.fmt(WM.game.run.gold);
      this.confirm(`지금 귀환하면 이번 탐험의 골드 <b>${g} G</b>를 100% 가지고 돌아갑니다.`, () => { this.closeModal(); WM.game.end('return'); }, '✈️ 귀환');
      return;
    }
    const lines = st.length
      ? st.map(s => `✈️ ${WM.U.esc(s.lm.name)}: 주변 안전 칸 ${s.done} / ${s.need}`).join('<br>')
      : '아직 발견한 귀환 포인트가 없습니다.';
    this.modalHtml(`<h3>✈️ 귀환 조건</h3>
      <p>공항·역·항구(✈️) 칸을 연 뒤, 그 주변 5×5의 안전 칸을 모두 열면 귀환할 수 있어요. 귀환하면 골드를 100% 가지고 돌아갑니다.</p>
      <p class="note">${lines}</p><div class="actions"><button class="btn pri" data-act="close">확인</button></div>`);
  },

  // ---- modals ---------------------------------------------------------------------

  modalHtml(html, cls = '') {
    this.modalOpen = true;
    this.modal.className = 'open ' + cls;
    this.modal.innerHTML = `<div class="sheet panel">${html}</div>`;
  },

  closeModal() {
    this.modalOpen = false;
    this.modal.className = '';
    this.modal.innerHTML = '';
  },

  confirm(text, onYes, yesLabel = '확인') {
    this.modalHtml(`<p>${text}</p><div class="actions"><button class="btn" data-act="close">취소</button><button class="btn pri yes">${yesLabel}</button></div>`);
    this.modal.querySelector('.yes').onclick = onYes;
  },

  showPause() {
    this.modalHtml(`<h3>일시정지</h3><div class="menu">
      <button class="btn pri" data-act="close">▶ 계속하기</button>
      <button class="btn" data-act="help">❓ 도움말</button>
      <button class="btn" data-act="settings">⚙️ 설정</button>
      <button class="btn" data-act="save-exit">💾 저장하고 본부로</button>
      <button class="btn danger" data-act="giveup">🏳️ 탐험 포기</button></div>`);
  },

  showSettings() {
    const s = WM.save.meta.settings;
    const row = (k, t, d) => `<button class="toggle ${s[k] ? 'on' : ''}" data-act="toggle" data-arg="${k}"><span><b>${t}</b><small>${d}</small></span><i></i></button>`;
    this.modalHtml(`<h3>⚙️ 설정</h3>
      ${row('chord', '숫자 칸 클릭으로 주변 열기', '열린 숫자 칸을 누르면, 주변 지뢰 표시 수가 숫자와 같을 때 나머지 주변 칸을 한 번에 엽니다')}
      ${row('vibrate', '진동', '길게 눌러 지뢰 표시 / 지뢰 폭발 시 진동')}
      <div class="actions"><button class="btn danger" data-act="reset">데이터 초기화</button><button class="btn pri" data-act="close">닫기</button></div>`);
  },

  showHelp() {
    this.modalHtml(`<h3>❓ 도움말</h3>
      <table class="keys">
        <tr><th></th><th>PC</th><th>모바일</th></tr>
        <tr><td>구역 오픈</td><td>왼쪽 클릭</td><td>짧게 탭</td></tr>
        <tr><td>지뢰 표시</td><td>오른쪽 클릭</td><td>길게 누르기</td></tr>
        <tr><td>줌 인/아웃</td><td>마우스 휠</td><td>두 손가락 벌리기/좁히기</td></tr>
        <tr><td>화면 이동</td><td>드래그</td><td>스와이프</td></tr>
      </table>
      <ul class="rules">
        <li>숫자는 주변 8칸의 지뢰 수입니다. 도시 경계(노란 점선) 안이라면 어디든 바로 열 수 있어요.</li>
        <li>안전 칸을 열면 경험치·골드를 얻고, 레벨업하면 스킬 3개 중 하나를 고릅니다 (이번 탐험에서만 유지).</li>
        <li>🏛 랜드마크와 ✈️ 귀환 포인트 칸에는 지뢰가 없습니다.</li>
        <li>✈️ 칸 주변 5×5를 모두 열면 <b>귀환</b> → 골드 100%. 안전 칸을 전부 열면 <b>도시 정복</b> → 100% + 보너스.</li>
        <li>HP가 0이 되면 골드 50%만 남습니다. 골드는 상점에서 영구 업그레이드에 씁니다.</li>
        <li>파란 깃발은 스킬로 확인된 지뢰라 확실합니다.</li>
      </ul>
      <div class="actions"><button class="btn pri" data-act="close">닫기</button></div>`);
  },

  showSkills() {
    const r = WM.game.run;
    const owned = Object.entries(r.skills);
    const list = owned.length
      ? owned.map(([id, lv]) => { const s = WM.SKILL[id]; return `<div class="sk"><span class="ic">${s.icon}</span><div><b>${s.name} Lv ${lv}</b><p>${s.desc(s.val(lv))}</p></div></div>`; }).join('')
      : '<p class="note">레벨업하면 스킬을 얻을 수 있어요.</p>';
    this.modalHtml(`<h3>이번 탐험의 스킬 (${owned.length}/${WM.BAL.maxSkills})</h3>${list}<div class="actions"><button class="btn pri" data-act="close">닫기</button></div>`);
  },

  showLevelUp() {
    const r = WM.game.run;
    if (!r.offer) return;
    const cards = r.offer.map(id => {
      if (id === '$gold') return this.card(id, '🪙', '골드 주머니', 'common', '보너스', '골드 <em>+100</em>', null);
      if (id === '$heal') return this.card(id, '🩹', '구급 상자', 'common', '보너스', 'HP <em>+1</em> 회복', null);
      const s = WM.SKILL[id], cur = WM.game.lv(id), next = cur + 1;
      return this.card(id, s.icon, `${s.name}${cur ? ' Lv ' + next : ''}`, s.rarity, s.cat, s.desc(s.val(next)), { cur, max: s.max, isNew: !cur });
    }).join('');
    this.modalHtml(`
      <div class="lvup-title">LEVEL UP!</div>
      <p class="sub">Lv ${r.level - r.pendingLevels} → Lv ${r.level - r.pendingLevels + 1} · 강화할 능력을 하나 고르세요</p>
      <div class="cards">${cards}</div>
      <div class="actions"><button class="btn" data-act="reroll" ${r.rerolls > 0 ? '' : 'disabled'}>🎲 다시 뽑기 (${r.rerolls})</button>
        <button class="btn" data-act="skip">건너뛰기 +${WM.BAL.skipGold}G</button></div>
      <p class="note center">한 탐험(런) 동안만 유지되는 능력입니다</p>`, 'levelup');
  },

  card(id, icon, name, rarity, cat, desc, lv) {
    const pips = lv ? `<div class="pips">${Array.from({ length: lv.max }, (_, k) => `<i class="${k < lv.cur ? 'on' : k === lv.cur ? 'next' : ''}"></i>`).join('')}</div>` : '';
    return `<button class="card ${rarity}" data-act="choose" data-arg="${id}">
      <div class="ic">${icon}</div>
      <div class="body"><div class="rar">${WM.RARITY[rarity].label} · ${cat}</div>
      <h4>${name}${lv && lv.isNew ? ' <span class="new">NEW</span>' : ''}</h4><p>${desc}</p>${pips}</div></button>`;
  },

  showResult() {
    const r = WM.game.run, b = WM.game.board, e = r.ended, U = WM.U;
    const title = { return: '✈️ 귀환 성공', conquest: '🏆 도시 정복!', death: '💀 탐험 실패', giveup: '🏳️ 탐험 포기' }[e.reason];
    const keepTxt = e.keep >= 1 ? '골드 100% 보존' : `골드 ${Math.round(e.keep * 100)}%만 보존`;
    this.modalHtml(`
      <span class="tag ${e.keep >= 1 ? 'good' : 'bad'}">${title} · ${keepTxt}</span>
      <h3>${b.city.flag} ${b.city.name} 탐험 결과</h3>
      <div class="kv">
        <span>개방한 안전지대</span><b>${U.fmt(b.safeOpened)}칸 (${U.fmt(e.km2)} km²)</b>
        <span>도시 개방률</span><b>${Math.floor(e.pct * 1000) / 10}%</b>
        <span>최종 레벨</span><b>Lv ${r.level}</b>
        <span>지뢰 표시 정답 / 오답</span><b>${e.correct} / ${e.wrong}</b>
        <span>밟은 지뢰</span><b>${r.hits}</b>
        <span>발견한 랜드마크</span><b>${r.lmFound.length} / ${b.city.landmarks.length}</b>
      </div>
      <div class="sum">
        <div class="line"><span>탐사 골드</span><span>${U.fmt(r.gold)} G</span></div>
        ${e.flagBonus ? `<div class="line"><span>지뢰 표시 정확도 보너스 (${Math.round(e.acc * 100)}%)</span><span>+${U.fmt(e.flagBonus)} G</span></div>` : ''}
        ${e.conquest ? `<div class="line"><span>도시 정복 보너스</span><span>+${U.fmt(e.conquest)} G</span></div>` : ''}
        ${e.keep < 1 ? `<div class="line"><span>보존율</span><span>× ${Math.round(e.keep * 100)}%</span></div>` : ''}
        <div class="tot"><span>획득 골드</span><b><span class="coin"></span>${U.fmt(e.final)} G</b></div>
      </div>
      <div class="actions"><button class="btn" data-act="hub">본부로</button><button class="btn gold" data-act="shop">🏪 상점</button></div>`, 'result');
  },

  // ---- feedback -------------------------------------------------------------------

  toast(html) {
    const t = document.createElement('div');
    t.className = 'toast panel';
    t.innerHTML = html;
    const box = this.$('#toasts');
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2600);
  },

  float(cell, text, kind) {
    if (this.screenName !== 'game') return;
    const [x, y] = WM.render.cellToScreen(cell);
    const f = document.createElement('div');
    f.className = 'float ' + kind;
    f.textContent = text;
    f.style.left = x + 'px'; f.style.top = y + 'px';
    this.$('#floats').appendChild(f);
    setTimeout(() => f.remove(), 1400);
  },
};

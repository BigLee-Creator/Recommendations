/** 고객사정보: 마지막 연락일 · 연락 공백 · 계약 만료 */

/** 마스터의 활성 고객사가 고객사정보에 모두 있게 한다 */
function ensureClientRows_(custs) {
  const sh = sheet_(SHEET.CLIENT);
  if (!sh) return;
  const last = sh.getLastRow();
  const have = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  const add = custs.filter(function (c) { return have.indexOf(c) < 0; });
  if (!add.length) return;
  const def = numSetting_('연락 공백 기본(일)', 30);
  sh.getRange(last + 1, 1, add.length, 4).setValues(add.map(function (c) { return [c, '', '', def]; }));
}

/** 매일 아침: 고객사별 마지막 미팅·통화, 마지막 메일, 공백 일수 계산 */
function dailyCheck() {
  if (isRetired_()) return;
  ensureClientRows_(activeCustomers_(readMaster_()));
  const sh = sheet_(SHEET.CLIENT);
  const last = sh.getLastRow();
  if (last < 2) return;
  const today = todayStr_();
  const def = numSetting_('연락 공백 기본(일)', 30);

  // 기록(올해 + 작년)에서 마지막 미팅·통화
  const lastMeet = {};
  readRecords_().list.concat(readPrevYearRecords_()).forEach(function (rec) {
    const v = rec.v;
    if (CONTACT_TYPES.indexOf(v[R.TYPE]) < 0 || !v[R.DATE] || v[R.DATE] > today) return;
    if (v[R.STATUS] !== STATUS.DONE && v[R.STATUS] !== STATUS.PLANNED) return;
    if (!lastMeet[v[R.CUST]] || lastMeet[v[R.CUST]] < v[R.DATE]) lastMeet[v[R.CUST]] = v[R.DATE];
  });

  // 연락처 이메일로 Gmail에서 마지막 메일
  const emails = {};
  const cs = sheet_(SHEET.CONTACT);
  if (cs.getLastRow() > 1) {
    cs.getRange(2, 1, cs.getLastRow() - 1, CONTACT_HEADERS.length).getValues().forEach(function (r) {
      const e = String(r[C.EMAIL]).trim();
      if (e && r[C.CUST]) (emails[r[C.CUST]] = emails[r[C.CUST]] || []).push(e);
    });
  }

  const range = sh.getRange(2, 1, last - 1, CLIENT_HEADERS.length);
  const vals = range.getValues();
  vals.forEach(function (r) {
    const cust = String(r[K.CUST]).trim();
    if (!cust) return;
    if (r[K.GAP_LIMIT] === '') r[K.GAP_LIMIT] = def;
    const meet = lastMeet[cust] || '';
    const mail = lastMailDate_(emails[cust] || []);
    r[K.LAST_MEET] = meet ? dateToCell_(meet) : '';
    r[K.LAST_MAIL] = mail ? dateToCell_(mail) : '';
    const latest = [meet, mail].filter(String).sort().pop();
    r[K.GAP] = latest ? diffDays_(latest, today) : '';
  });
  range.setValues(vals);
  setState_('dailyCheckAt', new Date().toISOString());
}

function lastMailDate_(addrs) {
  if (!addrs.length) return '';
  const parts = addrs.slice(0, 20).map(function (a) { return 'from:' + a + ' OR to:' + a; });
  try {
    const threads = GmailApp.search('(' + parts.join(' OR ') + ') newer_than:2y', 0, 1);
    return threads.length ? fmtDate_(threads[0].getLastMessageDate()) : '';
  } catch (e) {
    log_('메일 확인 오류', e.message, '');
    return '';
  }
}

/** 브리핑용: 공백 초과 / 계약 만료 임박 */
function clientAlerts_() {
  const out = { gap: [], contract: [] };
  const sh = sheet_(SHEET.CLIENT);
  if (!sh || sh.getLastRow() < 2) return out;
  const today = todayStr_();
  const def = numSetting_('연락 공백 기본(일)', 30);
  const warn = numSetting_('계약 만료 알림(일)', 60);
  sh.getRange(2, 1, sh.getLastRow() - 1, CLIENT_HEADERS.length).getValues().forEach(function (r) {
    const cust = String(r[K.CUST]).trim();
    if (!cust) return;
    const limit = Number(r[K.GAP_LIMIT]) || def;
    const meet = parseDate_(r[K.LAST_MEET]);
    const mail = parseDate_(r[K.LAST_MAIL]);
    const latest = [meet, mail].filter(String).sort().pop() || '';
    if (r[K.GAP] !== '' && Number(r[K.GAP]) > limit) out.gap.push({ cust: cust, last: latest, gap: r[K.GAP], limit: limit });
    const end = parseDate_(r[K.END]);
    if (end) {
      const left = diffDays_(today, end);
      if (left >= 0 && left <= warn) out.contract.push({ cust: cust, end: end, left: left });
    }
  });
  out.gap.sort(function (a, b) { return b.gap - a.gap; });
  out.contract.sort(function (a, b) { return a.left - b.left; });
  return out;
}

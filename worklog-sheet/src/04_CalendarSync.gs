/**
 * 구글 캘린더 양방향 동기화
 *
 * - 업무 캘린더: 고객사 업무 일정. 제목은 "[고객사/사업] 제목"
 * - 할 일 캘린더: '다음 액션'으로 생긴 작업. 제목은 "☐ [고객사] 제목" / 완료 시 "✅ ..."
 * - 개인 캘린더: 기본 캘린더. 시트에서는 고객사가 [개인일정]
 *
 * 행과 일정은 숨김 열(이벤트ID, 캘린더)로 연결한다.
 * 양쪽이 모두 바뀌었으면 나중에 바뀐 쪽이 이긴다 (로그에 기록).
 */

function calendarIds_() {
  return {
    '업무': setting_('업무 캘린더 ID', ''),
    '할일': setting_('할 일 캘린더 ID', ''),
    '개인': setting_('개인 캘린더 ID', 'primary'),
  };
}

/** 10분마다 실행: 캘린더 → 시트, 다음 액션 처리, 시트 → 캘린더 */
function syncAll() {
  if (isRetired_() && !retiredSyncActive_()) return retireTriggers_();
  withLock_(function () {
    pullCalendars_(false);
    processAllNextActions_();
    pushToCalendars_(false);
    setState_('lastSyncAt', new Date().toISOString());
  });
}

/** 메뉴: 지금 동기화 */
function syncNow() {
  syncAll();
  ss_().toast('캘린더 동기화를 마쳤습니다.', APP_NAME, 5);
}

/** 메뉴: 대량 삭제 확인 후 동기화 */
function syncAllowMassDelete() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('대량 삭제 승인',
    '시트에서 지워진 행의 캘린더 일정을 기준과 상관없이 모두 지웁니다. 계속할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  withLock_(function () { pushToCalendars_(true); });
  ss_().toast('동기화를 마쳤습니다.', APP_NAME, 5);
}

// ===================== 캘린더 → 시트 =====================

/**
 * @param {boolean} windowPass true면 오늘~N일 범위를 전부 다시 훑는다(반복 일정 새 회차 채우기용)
 */
function pullCalendars_(windowPass) {
  const ids = calendarIds_();
  const data = readRecords_();
  const ctx = {
    data: data,
    today: todayStr_(),
    year: fileYear_(),
    horizon: addDays_(todayStr_(), numSetting_('반복 일정 가져오기(일)', 28)),
    newRows: [],
    newKeys: {},
    myFile: ss_().getId(),
    exclude: excludeKeywords_(),
  };
  [CAL.WORK, CAL.TODO, CAL.PERSONAL].forEach(function (key) {
    const calId = ids[key];
    if (!calId) return;
    try {
      const events = windowPass ? listWindow_(calId, ctx) : listChanges_(calId, key, ctx);
      events.forEach(function (ev) { processIncoming_(ev, key, ctx); });
    } catch (e) {
      log_('동기화 오류', key + ' 캘린더 읽기 실패: ' + e.message, '');
    }
  });
  if (ctx.newRows.length) {
    appendRecords_(data.sheet, ctx.newRows);
    log_('가져오기', '캘린더에서 새 일정 ' + ctx.newRows.length + '건을 가져옴', '');
  }
  removeExcludedRows_(ctx.exclude);
}

/** 설정 '제외 키워드' (쉼표 구분). 설정 행이 없으면 '생일'로 만들어 둔다 */
function excludeKeywords_() {
  const map = settings_();
  if (!Object.prototype.hasOwnProperty.call(map, '제외 키워드')) {
    const sh = sheet_(SHEET.SETTINGS);
    sh.getRange(sh.getLastRow() + 1, 1, 1, 3).setValues([['제외 키워드', '생일', EXCLUDE_DESC]]);
    SETTINGS_CACHE_ = null;
    return ['생일'];
  }
  return String(map['제외 키워드'] || '').split(',')
    .map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}

function isExcluded_(title, keywords) {
  const t = String(title || '').toLowerCase();
  return keywords.some(function (k) { return t.indexOf(k) >= 0; });
}

/**
 * 이미 시트에 들어온 [개인일정] 중 제외 키워드가 든 행을 시트에서만 뺀다.
 * 캘린더 일정은 그대로 두기 위해 _연동 목록에서도 함께 지운다 (지운 행으로 오인해 일정을 삭제하지 않도록).
 */
function removeExcludedRows_(keywords) {
  if (!keywords.length) return;
  const data = readRecords_();
  const targets = data.list.filter(function (rec) {
    return rec.v[R.CUST] === PERSONAL && rec.v[R.EVENT_ID] && isExcluded_(rec.v[R.TITLE], keywords);
  });
  if (!targets.length) return;
  const removed = {};
  targets.sort(function (a, b) { return b.r - a.r; }).forEach(function (rec) {
    if (String(data.sheet.getRange(rec.r, R.ID + 1).getValue()) !== rec.v[R.ID]) return;
    data.sheet.deleteRow(rec.r);
    removed[rec.v[R.ID]] = true;
  });
  const idx = sheet_(SHEET.INDEX);
  const old = idx.getLastRow() > 1 ? idx.getRange(2, 1, idx.getLastRow() - 1, 3).getValues() : [];
  writeIndex_(idx, old.filter(function (r) { return !removed[r[0]]; }));
  log_('제외', '제외 키워드가 든 개인 일정 ' + Object.keys(removed).length + '건을 시트에서 뺌 (캘린더에는 그대로)', '');
}

/** 마지막 동기화 이후 바뀐 일정 (처음이거나 오래됐으면 전체) */
function listChanges_(calId, key, ctx) {
  const stateKey = 'pulledAt:' + key;
  const last = state_(stateKey);
  const startedAt = new Date();
  let events;
  const tooOld = !last || (startedAt.getTime() - toMillis_(last)) > 7 * 86400000;
  if (tooOld) {
    events = listEvents_(calId, {
      timeMin: isoSeoul_(yearStart_(ctx.year), '00:00'),
      timeMax: isoSeoul_(addDays_(ctx.horizon, 1), '00:00'),
      singleEvents: true,
      showDeleted: false,
    });
  } else {
    try {
      events = listEvents_(calId, {
        updatedMin: new Date(toMillis_(last) - 120000).toISOString(),
        singleEvents: true,
        showDeleted: true,
      });
    } catch (e) {
      // updatedMin이 너무 오래됐다는 오류 등 → 전체 다시 읽기
      setState_(stateKey, '');
      return listChanges_(calId, key, ctx);
    }
  }
  setState_(stateKey, startedAt.toISOString());
  return events;
}

function listWindow_(calId, ctx) {
  return listEvents_(calId, {
    timeMin: isoSeoul_(ctx.today, '00:00'),
    timeMax: isoSeoul_(addDays_(ctx.horizon, 1), '00:00'),
    singleEvents: true,
    showDeleted: false,
  });
}

function listEvents_(calId, opts) {
  const out = [];
  let token = null;
  let guard = 0;
  do {
    const args = Object.assign({ maxResults: 2500 }, opts);
    if (token) args.pageToken = token;
    const res = Calendar.Events.list(calId, args);
    (res.items || []).forEach(function (e) { out.push(e); });
    token = res.nextPageToken;
  } while (token && ++guard < 40);
  return out;
}

function processIncoming_(ev, key, ctx) {
  if (ev.eventType && ['default', 'fromGmail'].indexOf(ev.eventType) < 0) return;
  const data = ctx.data;
  let rec = data.byEvent[key + '|' + ev.id];
  const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
  if (!rec && priv.wlRowId && data.byId[priv.wlRowId]) {
    rec = data.byId[priv.wlRowId];
    if (rec.v[R.EVENT_ID] && rec.v[R.EVENT_ID] !== ev.id) rec = null;
  }

  const declined = (ev.attendees || []).some(function (a) { return a.self && a.responseStatus === 'declined'; });
  const gone = ev.status === 'cancelled' || declined;

  if (rec) {
    const v = rec.v.slice();
    if (gone) {
      if (v[R.STATUS] === STATUS.CANCELLED && !v[R.EVENT_ID]) return;
      v[R.STATUS] = STATUS.CANCELLED;
      v[R.EVENT_ID] = '';
      v[R.SYNC] = false;
      v[R.SYNCED] = new Date().toISOString();
      if (writeRecord_(data.sheet, rec, v)) log_('캘린더→시트', '캘린더에서 지워져 취소 처리: ' + v[R.TITLE], v[R.ID]);
      return;
    }
    const evTime = toMillis_(ev.updated);
    const synced = toMillis_(v[R.SYNCED]);
    if (ev.updated === v[R.SYNCED] || evTime <= synced + 1000) return;
    const localChanged = isModified_(v);
    if (localChanged && toMillis_(v[R.MODIFIED]) >= evTime) {
      log_('충돌', '시트와 캘린더가 모두 바뀜 → 나중에 고친 시트 내용으로 덮어씀', v[R.ID]);
      return;
    }
    applyEvent_(v, ev, key, false);
    v[R.EVENT_ID] = ev.id;
    v[R.CAL] = key;
    v[R.SYNCED] = ev.updated;
    if (writeRecord_(data.sheet, rec, v)) {
      if (localChanged) log_('충돌', '시트와 캘린더가 모두 바뀜 → 나중에 고친 캘린더 내용으로 덮어씀', v[R.ID]);
    }
    return;
  }

  // 시트에 없는 일정
  if (gone) return;
  if (priv.wlRowId) return; // 시트에서 지운 행(삭제 대기) 또는 다른 연도 파일의 행
  if (key === CAL.PERSONAL && isExcluded_(ev.summary, ctx.exclude)) return;
  if (ctx.newKeys[key + '|' + ev.id]) return;
  const start = eventStart_(ev);
  if (!start.date) return;
  if (start.date < yearStart_(ctx.year)) return;
  if (isRetired_() && start.date >= yearStart_(ctx.year + 1)) return;
  if (start.date > ctx.horizon) return;

  const v = emptyRecord_();
  applyEvent_(v, ev, key, true);
  v[R.ID] = newId_();
  v[R.EVENT_ID] = ev.id;
  v[R.CAL] = key;
  v[R.SYNC] = true;
  v[R.CREATED] = new Date();
  v[R.SYNCED] = ev.updated;
  if (!v[R.STATUS]) v[R.STATUS] = v[R.DATE] < ctx.today ? STATUS.DONE : STATUS.PLANNED;
  ctx.newRows.push(v);
  ctx.newKeys[key + '|' + ev.id] = true;
}

/** 일정의 시작 날짜/시간 (서울 기준) */
function eventStart_(ev) {
  if (!ev.start) return {};
  if (ev.start.date) return { date: ev.start.date, time: '' };
  const d = new Date(ev.start.dateTime);
  return { date: fmtDate_(d), time: fmtTime_(d) };
}

/** 캘린더 일정 내용을 행 값에 반영 */
function applyEvent_(v, ev, key, isNew) {
  const start = eventStart_(ev);
  v[R.DATE] = start.date;
  if (ev.start.date) {
    v[R.START] = '';
    v[R.END] = '';
    v[R.DAYS] = Math.max(0, diffDays_(ev.start.date, ev.end.date) - 1);
  } else {
    const e = new Date(ev.end.dateTime);
    v[R.START] = start.time;
    v[R.END] = fmtTime_(e);
    v[R.DAYS] = Math.max(0, diffDays_(start.date, fmtDate_(e)));
  }

  const parsed = parseTitle_(ev.summary || '', key);
  v[R.TITLE] = parsed.title;
  if (key === CAL.PERSONAL) {
    v[R.CUST] = PERSONAL;
    v[R.BIZ] = v[R.BIZ] || NONE;
    v[R.TASK] = v[R.TASK] || NONE;
  } else if (parsed.cust) {
    if (parsed.cust !== v[R.CUST]) {
      v[R.CUST] = parsed.cust;
      v[R.BIZ] = parsed.biz || '';
      v[R.TASK] = '';
    } else if (parsed.biz) {
      v[R.BIZ] = parsed.biz;
    }
  } else if (isNew || !v[R.CUST] || v[R.CUST] === PERSONAL) {
    v[R.CUST] = UNCLASSIFIED;
  }
  if (key === CAL.TODO) {
    if (parsed.done) v[R.STATUS] = STATUS.DONE;
    else if (v[R.STATUS] === STATUS.DONE && parsed.undone) v[R.STATUS] = STATUS.PLANNED;
  }
  if (isNew) {
    v[R.TYPE] = key === CAL.TODO ? '작업' : (ev.start.date ? '작업' : '미팅');
  }
  v[R.NOTE] = parseDescription_(ev.description || '');
}

/**
 * "[고객사/사업] 제목" 형식 해석. 할 일 캘린더는 앞의 ☐ / ✅ 표시도 해석.
 */
function parseTitle_(summary, key) {
  let s = String(summary || '').trim();
  const out = { cust: '', biz: '', title: s, done: false, undone: false };
  if (key === CAL.PERSONAL) return out;
  const mark = s.match(/^(✅|✔️?|☑️?|☐|□)\s*/);
  if (mark) {
    out.done = /✅|✔|☑/.test(mark[1]);
    out.undone = !out.done;
    s = s.slice(mark[0].length);
  }
  const m = s.match(/^\[([^\]\/]+)(?:\/([^\]]+))?\]\s*(.*)$/);
  if (m) {
    out.cust = m[1].trim();
    out.biz = (m[2] || '').trim();
    out.title = m[3].trim();
  } else {
    out.title = s;
  }
  return out;
}

function parseDescription_(desc) {
  const s = String(desc || '');
  const i = s.indexOf(DESC_MARK);
  return (i >= 0 ? s.slice(0, i) : s).replace(/\s+$/, '');
}

// ===================== 시트 → 캘린더 =====================

function pushToCalendars_(allowMassDelete) {
  const ids = calendarIds_();
  const data = readRecords_();
  const sh = data.sheet;
  const reminderMin = numSetting_('시간 일정 알림(분)', 60);
  let pushed = 0;

  data.list.forEach(function (rec) {
    const v = rec.v;
    if (!v[R.ID]) return;
    const want = wantsSync_(v);
    const target = desiredCal_(v);
    try {
      if (!want) {
        if (v[R.EVENT_ID]) {
          removeEvent_(ids[v[R.CAL]], v[R.EVENT_ID]);
          v[R.EVENT_ID] = '';
          v[R.SYNCED] = new Date().toISOString();
          writeHidden_(sh, rec, [R.EVENT_ID, R.SYNCED]);
          pushed++;
        }
        return;
      }
      if (v[R.EVENT_ID] && v[R.CAL] !== target) {
        // 캘린더가 바뀜 (예: 고객사를 [개인일정]으로) → 옮겨 만들기
        removeEvent_(ids[v[R.CAL]], v[R.EVENT_ID]);
        v[R.EVENT_ID] = '';
      }
      if (!v[R.EVENT_ID]) {
        const res = Calendar.Events.insert(buildEvent_(v, target, reminderMin, true), ids[target]);
        v[R.EVENT_ID] = res.id;
        v[R.CAL] = target;
        v[R.SYNCED] = res.updated;
        writeHidden_(sh, rec, [R.EVENT_ID, R.CAL, R.SYNCED]);
        pushed++;
      } else if (isModified_(v)) {
        const res = Calendar.Events.patch(buildEvent_(v, target, reminderMin, false), ids[target], v[R.EVENT_ID]);
        v[R.SYNCED] = res.updated;
        writeHidden_(sh, rec, [R.SYNCED]);
        pushed++;
      }
    } catch (e) {
      if (/not found|deleted|404|410/i.test(e.message) && v[R.EVENT_ID]) {
        // 캘린더에서 이미 사라진 일정 → 연결만 끊고 다음 번에 새로 만든다
        v[R.EVENT_ID] = '';
        writeHidden_(sh, rec, [R.EVENT_ID]);
      } else if (v[R.EVENT_ID]) {
        // 남이 만든 초대 일정처럼 고칠 권한이 없는 경우: 시트만 바뀐 채로 두고 재시도하지 않는다
        v[R.SYNCED] = new Date().toISOString();
        writeHidden_(sh, rec, [R.SYNCED]);
      }
      log_('동기화 오류', '캘린더 쓰기 실패: ' + e.message, v[R.ID]);
    }
  });

  syncDeletedRows_(data, ids, allowMassDelete);
  if (pushed) log_('시트→캘린더', pushed + '건 반영', '');
}

/** 시트에서 지운 행의 일정을 지우고 _연동 목록을 새로 쓴다 */
function syncDeletedRows_(data, ids, allowMassDelete) {
  const idx = sheet_(SHEET.INDEX);
  const old = idx.getLastRow() > 1 ? idx.getRange(2, 1, idx.getLastRow() - 1, 3).getValues() : [];
  const gone = old.filter(function (r) { return r[0] && r[1] && !data.byId[r[0]]; });
  const limit = numSetting_('대량 삭제 기준', 20);
  let keep = [];
  if (gone.length > limit && !allowMassDelete) {
    log_('대량 삭제 감지', gone.length + '개 행이 사라져 일정 삭제를 멈춤. 의도한 것이면 메뉴 > 대량 삭제 승인 후 동기화', '');
    keep = gone;
  } else {
    gone.forEach(function (r) {
      try {
        removeEvent_(ids[r[2]], r[1]);
      } catch (e) {
        log_('동기화 오류', '지운 행의 일정 삭제 실패: ' + e.message, r[0]);
      }
    });
    if (gone.length) log_('시트→캘린더', '시트에서 지운 행 ' + gone.length + '건의 일정 삭제', '');
  }
  const rows = data.list
    .filter(function (rec) { return rec.v[R.EVENT_ID]; })
    .map(function (rec) { return [rec.v[R.ID], rec.v[R.EVENT_ID], rec.v[R.CAL]]; })
    .concat(keep);
  writeIndex_(idx, rows);
}

function writeIndex_(idx, rows) {
  if (idx.getLastRow() > 1) idx.getRange(2, 1, idx.getLastRow() - 1, 3).clearContent();
  if (rows.length) {
    if (idx.getMaxRows() < rows.length + 1) idx.insertRowsAfter(idx.getMaxRows(), rows.length + 1 - idx.getMaxRows());
    idx.getRange(2, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
  }
}

function removeEvent_(calId, eventId) {
  if (!calId || !eventId) return;
  try {
    Calendar.Events.remove(calId, eventId);
  } catch (e) {
    if (!/not found|deleted|404|410/i.test(e.message)) throw e;
  }
}

/** 행 → 캘린더 일정 리소스 */
function buildEvent_(v, key, reminderMin, isInsert) {
  const personal = key === CAL.PERSONAL;
  const ev = {
    summary: eventTitle_(v, key),
    description: eventDescription_(v, key),
    extendedProperties: { private: { wlRowId: v[R.ID], wlFile: ss_().getId() } },
  };
  const days = Number(v[R.DAYS]) || 0;
  if (v[R.START]) {
    let end = v[R.END];
    let endDate = addDays_(v[R.DATE], days);
    if (!end) {
      end = minutesToTime_(timeToMinutes_(v[R.START]) + 60);
      if (timeToMinutes_(v[R.START]) + 60 >= 1440) endDate = addDays_(endDate, 1);
    } else if (days === 0 && timeToMinutes_(end) <= timeToMinutes_(v[R.START])) {
      endDate = addDays_(endDate, 1); // 23:00~01:00 처럼 자정을 넘김
    }
    ev.start = { dateTime: isoSeoul_(v[R.DATE], v[R.START]), timeZone: TZ };
    ev.end = { dateTime: isoSeoul_(endDate, end), timeZone: TZ };
    if (!personal) ev.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: reminderMin }] };
  } else {
    ev.start = { date: v[R.DATE] };
    ev.end = { date: addDays_(v[R.DATE], days + 1) };
    ev.transparency = 'transparent';
    // 종일 일정 알림은 캘린더 설정의 '종일 일정 기본 알림(당일 오전 8:30)'을 따른다
    if (!personal) ev.reminders = { useDefault: true };
  }
  if (!personal && TYPE_COLOR[v[R.TYPE]]) ev.colorId = TYPE_COLOR[v[R.TYPE]];
  if (personal && !isInsert) delete ev.reminders;
  return ev;
}

function eventTitle_(v, key) {
  const title = v[R.TITLE] || v[R.TYPE] || '(제목 없음)';
  if (key === CAL.PERSONAL) return title;
  let prefix = '';
  if (v[R.CUST] && v[R.CUST] !== UNCLASSIFIED) {
    const biz = v[R.BIZ] && v[R.BIZ] !== NONE ? '/' + v[R.BIZ] : '';
    prefix = '[' + v[R.CUST] + biz + '] ';
  }
  if (key === CAL.TODO) return (v[R.STATUS] === STATUS.DONE ? '✅ ' : '☐ ') + prefix + title;
  return prefix + title;
}

function eventDescription_(v, key) {
  const note = String(v[R.NOTE] || '').replace(/\s+$/, '');
  if (key === CAL.PERSONAL) return note;
  const lines = [];
  if (v[R.TYPE]) lines.push('유형: ' + v[R.TYPE]);
  if (v[R.TASK] && v[R.TASK] !== NONE) lines.push('업무: ' + v[R.TASK]);
  if (v[R.CONTACT]) lines.push('담당자: ' + v[R.CONTACT]);
  if (v[R.NEXT]) lines.push('다음 액션: ' + v[R.NEXT] + (v[R.NEXT_DUE] ? ' (' + v[R.NEXT_DUE] + ')' : ''));
  if (v[R.LINK]) lines.push('링크: ' + v[R.LINK]);
  lines.push('상태: ' + (v[R.STATUS] || ''));
  return (note ? note + '\n\n' : '') + DESC_MARK + '\n' + lines.join('\n');
}

/** 은퇴한 이전 연도 파일: 모든 자동 실행을 지운다 */
function retireTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  log_('연도 전환', '1월 말이 지나 이 파일의 자동 실행을 모두 껐습니다.', '');
}

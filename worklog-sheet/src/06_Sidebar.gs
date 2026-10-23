/** 입력창(사이드바) 서버 함수 */

function openSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('업무기록 입력');
  SpreadsheetApp.getUi().showSidebar(html);
}

function getSidebarData() {
  const tree = readMaster_();
  const custs = activeCustomers_(tree);
  const map = {};
  custs.forEach(function (c) {
    map[c] = {};
    activeBiz_(tree, c).forEach(function (b) { map[c][b] = activeTasks_(tree, c, b); });
  });
  return {
    customers: custs,
    tree: map,
    contacts: contactsByCustomer_(),
    types: TYPES,
    statuses: STATUSES,
    personal: PERSONAL,
    today: todayStr_(),
    template: MEETING_TEMPLATE,
  };
}

/** 지금 선택한 기록 행을 입력창으로 불러오기 */
function loadSelectedRecord() {
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== SHEET.RECORD) throw new Error('기록 시트에서 행을 선택하세요.');
  const row = sh.getActiveRange().getRow();
  if (row < 2) throw new Error('데이터 행을 선택하세요.');
  const range = sh.getRange(row, 1, 1, RECORD_COLS);
  const raw = range.getValues()[0];
  if (isEmptyRaw_(raw)) throw new Error('빈 행입니다.');
  const v = normalize_(raw, range.getDisplayValues()[0]);
  return formFromRecord_(v);
}

function formFromRecord_(v) {
  return {
    id: v[R.ID], date: v[R.DATE], start: v[R.START], end: v[R.END],
    cust: v[R.CUST], biz: v[R.BIZ], task: v[R.TASK], type: v[R.TYPE],
    title: v[R.TITLE], note: v[R.NOTE],
    contacts: v[R.CONTACT] ? v[R.CONTACT].split(/\s*,\s*/) : [],
    status: v[R.STATUS], next: v[R.NEXT], nextDue: v[R.NEXT_DUE], link: v[R.LINK],
    sync: v[R.SYNC],
  };
}

function applyForm_(v, f) {
  v[R.DATE] = parseDate_(f.date);
  v[R.START] = f.start ? parseTime_(f.start) : '';
  v[R.END] = f.end ? parseTime_(f.end) : '';
  v[R.CUST] = f.cust || '';
  v[R.BIZ] = f.cust === PERSONAL ? NONE : (f.biz || '');
  v[R.TASK] = f.cust === PERSONAL ? NONE : (f.task || '');
  v[R.TYPE] = f.type || '';
  v[R.TITLE] = String(f.title || '').trim();
  v[R.NOTE] = f.note || '';
  v[R.CONTACT] = (f.contacts || []).join(', ');
  v[R.STATUS] = f.status || '';
  v[R.NEXT] = String(f.next || '').trim();
  v[R.NEXT_DUE] = f.nextDue ? parseDate_(f.nextDue) : '';
  v[R.LINK] = f.link || '';
  v[R.SYNC] = !!f.sync;
  v[R.MODIFIED] = new Date();
}

/** 입력창에서 저장 (id가 있으면 수정, 없으면 새 행) */
function saveRecord(f) {
  if (!parseDate_(f.date)) throw new Error('날짜를 입력하세요.');
  if (!f.title && !f.note) throw new Error('제목이나 내용을 입력하세요.');
  const result = withLock_(function () {
    const data = readRecords_();
    const sh = data.sheet;
    if (f.id) {
      const rec = data.byId[f.id];
      if (!rec) throw new Error('수정할 행을 찾지 못했습니다. 시트에서 지워졌을 수 있습니다.');
      const v = rec.v.slice();
      applyForm_(v, f);
      v[R.CAL] = v[R.EVENT_ID] ? v[R.CAL] : desiredCal_(v);
      if (!writeRecord_(sh, rec, v)) throw new Error('그 사이 행이 바뀌었습니다. 다시 불러와 주세요.');
      applyRowDropdowns_(sh, rec.r, v);
      return '수정했습니다.';
    }
    const v = emptyRecord_();
    applyForm_(v, f);
    const syncWanted = v[R.SYNC];
    fillDefaults_(v);
    v[R.SYNC] = syncWanted;
    const rows = appendRecords_(sh, [v]);
    applyRowDropdowns_(sh, rows[0], v);
    return '저장했습니다.';
  }, 20000);
  if (result === null) throw new Error('다른 작업이 실행 중입니다. 잠시 후 다시 저장하세요.');
  // 캘린더에 바로 반영
  withLock_(function () {
    processAllNextActions_();
    pushToCalendars_(false);
  }, 20000);
  return result;
}

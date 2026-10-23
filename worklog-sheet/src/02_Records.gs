/** 기록 시트 읽기·쓰기 */

/**
 * 기록 시트를 읽어 정규화한 행 목록을 돌려준다.
 * rec = { r: 시트 행 번호, v: 정규화 값 배열, raw: 원본 값 배열 }
 */
function readRecords_(sh) {
  sh = sh || sheet_(SHEET.RECORD);
  const n = sh.getLastRow() - 1;
  const out = { sheet: sh, list: [], byId: {}, byEvent: {}, lastRow: 1 };
  if (n < 1) return out;
  const range = sh.getRange(2, 1, n, RECORD_COLS);
  const raw = range.getValues();
  const disp = range.getDisplayValues();
  for (let i = 0; i < n; i++) {
    if (isEmptyRaw_(raw[i])) continue;
    const v = normalize_(raw[i], disp[i]);
    const rec = { r: i + 2, v: v, raw: raw[i] };
    out.list.push(rec);
    if (v[R.ID]) out.byId[v[R.ID]] = rec;
    if (v[R.EVENT_ID]) out.byEvent[v[R.CAL] + '|' + v[R.EVENT_ID]] = rec;
    out.lastRow = i + 2;
  }
  return out;
}

function isEmptyRaw_(raw) {
  return !raw[R.ID] && !raw[R.DATE] && !raw[R.TITLE] && !raw[R.CUST] && !raw[R.NOTE];
}

function normalize_(raw, disp) {
  const v = raw.slice();
  v[R.DATE] = parseDate_(raw[R.DATE] instanceof Date ? raw[R.DATE] : disp[R.DATE]);
  v[R.START] = raw[R.START] === '' ? '' : parseTime_(disp[R.START]);
  v[R.END] = raw[R.END] === '' ? '' : parseTime_(disp[R.END]);
  v[R.NEXT_DUE] = parseDate_(raw[R.NEXT_DUE] instanceof Date ? raw[R.NEXT_DUE] : disp[R.NEXT_DUE]);
  v[R.CARRY] = Number(raw[R.CARRY]) || 0;
  v[R.SYNC] = raw[R.SYNC] === true;
  v[R.DAYS] = Number(raw[R.DAYS]) || 0;
  [R.CUST, R.BIZ, R.TASK, R.TYPE, R.TITLE, R.NOTE, R.CONTACT, R.STATUS, R.NEXT, R.LINK,
    R.ID, R.EVENT_ID, R.CAL, R.PARENT, R.CARRY_FROM, R.SYNCED].forEach(function (c) {
    v[c] = raw[c] === null || raw[c] === undefined ? '' : String(raw[c]).trim();
  });
  v[R.NOTE] = raw[R.NOTE] === null || raw[R.NOTE] === undefined ? '' : String(raw[R.NOTE]);
  return v;
}

/** 정규화 값 → 시트에 쓸 배열 */
function toCells_(v) {
  const out = v.slice();
  out[R.DATE] = dateToCell_(v[R.DATE]);
  out[R.START] = timeToCell_(v[R.START]);
  out[R.END] = timeToCell_(v[R.END]);
  out[R.NEXT_DUE] = dateToCell_(v[R.NEXT_DUE]);
  out[R.CARRY] = Number(v[R.CARRY]) || 0;
  out[R.SYNC] = v[R.SYNC] === true;
  out[R.DAYS] = Number(v[R.DAYS]) || 0;
  out[R.CREATED] = v[R.CREATED] || '';
  out[R.MODIFIED] = v[R.MODIFIED] || '';
  return out;
}

function emptyRecord_() {
  const v = new Array(RECORD_COLS).fill('');
  v[R.CARRY] = 0;
  v[R.SYNC] = false;
  v[R.DAYS] = 0;
  return v;
}

/**
 * 행 하나를 다시 쓴다. 읽은 뒤 사용자가 그 행을 고쳤으면(원본과 다르면) 쓰지 않는다.
 */
function writeRecord_(sh, rec, newV) {
  const range = sh.getRange(rec.r, 1, 1, RECORD_COLS);
  const now = range.getValues()[0];
  if (!sameRaw_(now, rec.raw)) {
    log_('동기화', '쓰는 도중 행이 바뀌어 다음 실행으로 미룸', rec.v[R.ID]);
    return false;
  }
  const cells = toCells_(newV);
  range.setValues([cells]);
  rec.v = newV;
  rec.raw = cells;
  return true;
}

/** 숨김 열 몇 개만 쓴다 (ID로 행 확인 후) */
function writeHidden_(sh, rec, cols) {
  const id = sh.getRange(rec.r, R.ID + 1).getValue();
  if (String(id) !== rec.v[R.ID]) return false;
  cols.forEach(function (c) {
    sh.getRange(rec.r, c + 1).setValue(rec.v[c]);
    rec.raw[c] = rec.v[c];
  });
  return true;
}

function sameRaw_(a, b) {
  for (let i = 0; i < RECORD_COLS; i++) {
    const x = a[i], y = b[i];
    if (x instanceof Date || y instanceof Date) {
      if (toMillis_(x) !== toMillis_(y)) return false;
    } else if (String(x) !== String(y)) {
      return false;
    }
  }
  return true;
}

/** 마지막 데이터 행 뒤에 새 행들을 붙인다 */
function appendRecords_(sh, vs) {
  if (!vs.length) return [];
  const startRow = nextEmptyRow_(sh);
  ensureRows_(sh, startRow + vs.length - 1);
  sh.getRange(startRow, 1, vs.length, RECORD_COLS).setValues(vs.map(toCells_));
  return vs.map(function (v, i) { return startRow + i; });
}

function nextEmptyRow_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return 2;
  const vals = sh.getRange(2, 1, last - 1, RECORD_COLS).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (!isEmptyRaw_(vals[i])) return i + 3;
  }
  return 2;
}

function ensureRows_(sh, row) {
  const max = sh.getMaxRows();
  if (row <= max) return;
  const add = Math.max(row - max, 500);
  sh.insertRowsAfter(max, add);
  applyRecordValidation_(sh, max + 1, add);
}

// ---------- 행 기본값 / 판단 ----------

/** 이 행이 가야 할 캘린더 */
function desiredCal_(v) {
  if (v[R.CUST] === PERSONAL) return CAL.PERSONAL;
  if (v[R.CAL] === CAL.TODO || v[R.PARENT]) return CAL.TODO;
  return CAL.WORK;
}

/** 캘린더에 올려야 하는 행인가 */
function wantsSync_(v) {
  if (v[R.SYNC] !== true) return false;
  if (!v[R.DATE] || !v[R.TITLE] && !v[R.CUST]) return false;
  if (NO_SYNC_STATUSES.indexOf(v[R.STATUS]) >= 0) return false;
  if (v[R.DATE] < yearStart_(fileYear_())) return false;
  if (isRetired_() && v[R.DATE] >= yearStart_(fileYear_() + 1)) return false;
  return true;
}

/** 새 행(ID 없음)에 기본값 채우기. 바뀌었으면 true */
function fillDefaults_(v) {
  if (v[R.ID]) return false;
  const today = todayStr_();
  v[R.ID] = newId_();
  v[R.CREATED] = new Date();
  if (!v[R.STATUS]) {
    v[R.STATUS] = v[R.TYPE] === '메모' ? STATUS.DONE : (v[R.DATE] && v[R.DATE] < today ? STATUS.DONE : STATUS.PLANNED);
  }
  if (v[R.TYPE] !== '메모') v[R.SYNC] = true;
  if (v[R.CUST] === PERSONAL) {
    if (!v[R.BIZ]) v[R.BIZ] = NONE;
    if (!v[R.TASK]) v[R.TASK] = NONE;
  }
  if (v[R.TYPE] === '미팅' && !v[R.NOTE]) v[R.NOTE] = MEETING_TEMPLATE;
  v[R.CARRY] = v[R.CARRY] || 0;
  v[R.CAL] = desiredCal_(v);
  return true;
}

function isModified_(v) {
  return toMillis_(v[R.MODIFIED]) > toMillis_(v[R.SYNCED]) + 1000;
}

function durationMinutes_(v) {
  if (!v[R.START] || !v[R.END]) return 0;
  let m = timeToMinutes_(v[R.END]) - timeToMinutes_(v[R.START]) + (Number(v[R.DAYS]) || 0) * 1440;
  if (m <= 0) m += 1440;
  return m;
}

/** 이전 연도 파일의 기록 (없으면 빈 목록) */
function readPrevYearRecords_() {
  const id = setting_('이전 연도 파일 ID', '');
  if (!id) return [];
  try {
    const sh = SpreadsheetApp.openById(id).getSheetByName(SHEET.RECORD);
    return readRecords_(sh).list;
  } catch (e) {
    log_('이전 연도', '이전 연도 파일을 열 수 없음: ' + e.message, '');
    return [];
  }
}

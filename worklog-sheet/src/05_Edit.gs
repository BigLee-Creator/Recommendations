/**
 * 시트 편집 처리 (설치형 onEdit 트리거: handleEdit)
 * - 기록: 새 행 기본값, 수정시각, 연동 드롭다운, 미팅 템플릿, 다음 액션 → 작업 행
 * - 마스터/연락처: 드롭다운 목록 갱신
 * - 검색/분석: 조건이 바뀌면 다시 계산
 */
function handleEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  const name = sh.getName();
  try {
    if (name === SHEET.RECORD) onRecordEdit_(sh, e);
    else if (name === SHEET.MASTER) rebuildLists_();
    else if (name === SHEET.CONTACT) onContactEdit_(sh, e);
    else if (name === SHEET.SEARCH && e.range.getRow() <= 3) runSearch();
    else if (name === SHEET.ANALYSIS && e.range.getRow() <= 2) runAnalysis();
  } catch (err) {
    log_('편집 처리 오류', err.message, '');
  }
}

function onRecordEdit_(sh, e) {
  const r1 = Math.max(2, e.range.getRow());
  const r2 = e.range.getLastRow();
  if (r2 < 2) return;
  const c1 = e.range.getColumn() - 1;
  const c2 = e.range.getLastColumn() - 1;
  // 숨김 열만 고친 경우는 무시
  if (c1 >= RECORD_VISIBLE) return;
  const touched = function (col) { return col >= c1 && col <= c2; };

  const n = r2 - r1 + 1;
  const range = sh.getRange(r1, 1, n, RECORD_COLS);
  const raw = range.getValues();
  const disp = range.getDisplayValues();
  const tree = readMaster_();
  const contacts = contactsByCustomer_();
  let needNext = false;

  for (let i = 0; i < n; i++) {
    if (isEmptyRaw_(raw[i])) continue;
    const v = normalize_(raw[i], disp[i]);
    const wasNew = fillDefaults_(v);
    if (!wasNew) {
      if (touched(R.CUST)) {
        if (v[R.CUST] === PERSONAL) {
          v[R.BIZ] = NONE;
          v[R.TASK] = NONE;
        } else {
          if (v[R.BIZ] === NONE) v[R.BIZ] = '';
          if (v[R.TASK] === NONE) v[R.TASK] = '';
        }
      }
      if (touched(R.TYPE) && !v[R.EVENT_ID]) {
        if (v[R.TYPE] === '메모') v[R.SYNC] = false;
        else if (raw[i][R.TYPE] && e.oldValue === '메모') v[R.SYNC] = true;
      }
      if (touched(R.TYPE) && v[R.TYPE] === '미팅' && !String(v[R.NOTE]).trim()) v[R.NOTE] = MEETING_TEMPLATE;
    }
    v[R.MODIFIED] = new Date();
    range.offset(i, 0, 1, RECORD_COLS).setValues([toCells_(v)]);
    if (touched(R.CUST) || touched(R.BIZ) || wasNew) applyRowDropdowns_(sh, r1 + i, v, tree, contacts);
    if (touched(R.NEXT) || touched(R.NEXT_DUE)) needNext = true;
  }
  if (needNext) withLock_(processAllNextActions_, 10000);
}

/**
 * '다음 액션' + '다음 액션 기한'이 있는 행마다 연결된 작업 행(할 일 캘린더)을 만든다/고친다.
 * 다음 액션을 지우면 아직 예정인 작업 행은 취소한다.
 */
function processAllNextActions_() {
  const data = readRecords_();
  const sh = data.sheet;
  const children = {};
  data.list.forEach(function (rec) {
    const p = rec.v[R.PARENT];
    if (!p || rec.v[R.STATUS] === STATUS.CARRIED) return;
    const cur = children[p];
    if (!cur || rec.v[R.DATE] > cur.v[R.DATE]) children[p] = rec;
  });

  const newRows = [];
  data.list.forEach(function (rec) {
    const v = rec.v;
    if (!v[R.ID] || v[R.STATUS] === STATUS.CARRIED || v[R.STATUS] === STATUS.CANCELLED) return;
    const child = children[v[R.ID]];
    const next = String(v[R.NEXT] || '').trim();
    if (!next) {
      if (child && child.v[R.STATUS] === STATUS.PLANNED && child.v[R.CARRY] === 0) {
        const cv = child.v.slice();
        cv[R.STATUS] = STATUS.CANCELLED;
        cv[R.MODIFIED] = new Date();
        writeRecord_(sh, child, cv);
      }
      return;
    }
    if (!v[R.NEXT_DUE]) return;
    if (!child) {
      newRows.push(makeTaskRow_(v, next));
      return;
    }
    const open = child.v[R.STATUS] === STATUS.PLANNED || child.v[R.STATUS] === STATUS.RESCHEDULE;
    if (!open) return;
    const cv = child.v.slice();
    let changed = false;
    if (cv[R.TITLE] !== next) { cv[R.TITLE] = next; changed = true; }
    if (cv[R.CARRY] === 0 && cv[R.DATE] !== v[R.NEXT_DUE]) { cv[R.DATE] = v[R.NEXT_DUE]; changed = true; }
    if (changed) {
      cv[R.MODIFIED] = new Date();
      writeRecord_(sh, child, cv);
    }
  });
  if (newRows.length) appendRecords_(sh, newRows);
}

function makeTaskRow_(parent, next) {
  const v = emptyRecord_();
  v[R.DATE] = parent[R.NEXT_DUE];
  v[R.CUST] = parent[R.CUST];
  v[R.BIZ] = parent[R.BIZ];
  v[R.TASK] = parent[R.TASK];
  v[R.TYPE] = '작업';
  v[R.TITLE] = next;
  v[R.NOTE] = '↳ ' + parent[R.DATE] + ' ' + (parent[R.TITLE] || '') + ' 의 다음 액션';
  v[R.CONTACT] = parent[R.CONTACT];
  v[R.STATUS] = STATUS.PLANNED;
  v[R.SYNC] = true;
  v[R.ID] = newId_();
  v[R.PARENT] = parent[R.ID];
  v[R.CAL] = parent[R.CUST] === PERSONAL ? CAL.PERSONAL : CAL.TODO;
  v[R.CREATED] = new Date();
  v[R.MODIFIED] = new Date();
  return v;
}

function onContactEdit_(sh, e) {
  const r1 = Math.max(2, e.range.getRow());
  const r2 = e.range.getLastRow();
  if (r2 < 2 || e.range.getColumn() - 1 > C.INACTIVE) return;
  const now = new Date();
  const vals = [];
  for (let r = r1; r <= r2; r++) vals.push([now]);
  sh.getRange(r1, C.MODIFIED + 1, vals.length, 1).setValues(vals);
}

/** 마스터(고객사 > 사업 > 업무)·연락처 목록과 드롭다운 */

/**
 * 마스터 시트의 열 위치를 1행 제목으로 찾는다.
 * 사용자가 [구분] 같은 열을 어디에 끼워 넣어도 '고객사/사업/업무/비활성/비고' 제목만 있으면 동작한다.
 */
function masterCols_(sh) {
  const width = Math.max(sh.getLastColumn(), MASTER_HEADERS.length);
  const head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  const find = function (name, fallback) {
    const i = head.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  return {
    width: width,
    cust: find('고객사', M.CUST),
    biz: find('사업', M.BIZ),
    task: find('업무', M.TASK),
    inactive: find('비활성', M.INACTIVE),
    memo: find('비고', M.MEMO),
  };
}

/** 마스터 시트 2행부터 마지막 데이터 행까지 (빈 체크박스 행은 제외) */
function masterRows_(sh, mc) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, mc.width).getValues();
  let n = rows.length;
  while (n > 0 && !String(rows[n - 1][mc.cust]).trim() && !String(rows[n - 1][mc.biz]).trim() && !String(rows[n - 1][mc.task]).trim()) n--;
  return rows.slice(0, n);
}

/**
 * 마스터 시트를 트리로 읽는다.
 * { 고객사: { active, biz: { 사업: { active, tasks: { 업무: active } } } } }
 */
function readMaster_() {
  const sh = sheet_(SHEET.MASTER);
  const tree = {};
  if (!sh || sh.getLastRow() < 2) return tree;
  const mc = masterCols_(sh);
  masterRows_(sh, mc).forEach(function (r) {
    const cust = String(r[mc.cust]).trim();
    if (!cust) return;
    const biz = String(r[mc.biz]).trim();
    const task = String(r[mc.task]).trim();
    const active = r[mc.inactive] !== true;
    const c = tree[cust] || (tree[cust] = { active: false, biz: {} });
    if (active) c.active = true;
    if (!biz) return;
    const b = c.biz[biz] || (c.biz[biz] = { active: false, tasks: {} });
    if (active) b.active = true;
    if (task) b.tasks[task] = b.tasks[task] || active;
  });
  return tree;
}

function activeCustomers_(tree) {
  return Object.keys(tree).filter(function (c) { return tree[c].active; }).sort();
}

function activeBiz_(tree, cust) {
  const c = tree[cust];
  if (!c) return [];
  return Object.keys(c.biz).filter(function (b) { return c.biz[b].active; }).sort();
}

function activeTasks_(tree, cust, biz) {
  const b = tree[cust] && tree[cust].biz[biz];
  if (!b) return [];
  return Object.keys(b.tasks).filter(function (t) { return b.tasks[t]; }).sort();
}

/** 연락처: { 고객사: [이름...] } (활성만) */
function contactsByCustomer_() {
  const sh = sheet_(SHEET.CONTACT);
  const map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, CONTACT_HEADERS.length).getValues().forEach(function (r) {
    const cust = String(r[C.CUST]).trim();
    const name = String(r[C.NAME]).trim();
    if (!cust || !name || r[C.INACTIVE] === true) return;
    (map[cust] = map[cust] || []).push(name);
  });
  Object.keys(map).forEach(function (k) { map[k].sort(); });
  return map;
}

/** _목록 시트: A열 고객사 드롭다운 원본 */
function rebuildLists_() {
  const sh = sheet_(SHEET.LISTS);
  const tree = readMaster_();
  const custs = activeCustomers_(tree).concat([PERSONAL, UNCLASSIFIED]);
  sh.getRange('A:A').clearContent();
  sh.getRange(1, 1).setValue('고객사');
  sh.getRange(2, 1, custs.length, 1).setValues(custs.map(function (c) { return [c]; }));
  ensureClientRows_(activeCustomers_(tree));
}

/** 기록 시트의 한 행에 사업/업무/담당자 드롭다운을 고객사에 맞게 건다 */
function applyRowDropdowns_(sh, row, v, tree, contacts) {
  tree = tree || readMaster_();
  contacts = contacts || contactsByCustomer_();
  const cust = v[R.CUST];
  setListValidation_(sh.getRange(row, R.BIZ + 1), cust === PERSONAL ? [NONE] : activeBiz_(tree, cust));
  setListValidation_(sh.getRange(row, R.TASK + 1), cust === PERSONAL ? [NONE] : activeTasks_(tree, cust, v[R.BIZ]));
  // 담당자는 여러 명을 쉼표로 적을 수 있도록 목록 밖 값도 허용(경고만 표시)
  setListValidation_(sh.getRange(row, R.CONTACT + 1), contacts[cust] || [], true);
}

function setListValidation_(range, list, allowInvalid) {
  if (!list.length) {
    range.clearDataValidations();
    return;
  }
  range.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(list.slice(0, 500), true)
      .setAllowInvalid(allowInvalid !== false).build());
}

/** 입력창에서 새 사업/업무 추가 */
function addMasterItem(cust, biz, task) {
  cust = String(cust || '').trim();
  biz = String(biz || '').trim();
  task = String(task || '').trim();
  if (!cust) throw new Error('고객사를 입력하세요.');
  const sh = sheet_(SHEET.MASTER);
  const mc = masterCols_(sh);
  const rows = masterRows_(sh, mc);
  const val = function (r, c) { return String(r[c]).trim(); };
  // 같은 고객사/사업에 업무가 비어 있는 행이 있으면 그 행을 채운다
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (val(r, mc.cust) !== cust) continue;
    if ((val(r, mc.biz) === biz || (!val(r, mc.biz) && biz)) && !val(r, mc.task)) {
      sh.getRange(i + 2, mc.biz + 1).setValue(biz);
      sh.getRange(i + 2, mc.task + 1).setValue(task);
      sh.getRange(i + 2, mc.inactive + 1).setValue(false);
      rebuildLists_();
      return getSidebarData();
    }
    if (val(r, mc.biz) === biz && val(r, mc.task) === task) {
      sh.getRange(i + 2, mc.inactive + 1).setValue(false);
      rebuildLists_();
      return getSidebarData();
    }
  }
  // 새 행: [구분]처럼 사용자가 추가한 열은 같은 고객사(가능하면 같은 사업) 행의 값을 물려받는다
  const known = [mc.cust, mc.biz, mc.task, mc.inactive, mc.memo];
  const tpl = rows.filter(function (r) { return val(r, mc.cust) === cust && val(r, mc.biz) === biz; })[0] ||
    rows.filter(function (r) { return val(r, mc.cust) === cust; })[0];
  const row = new Array(mc.width).fill('');
  if (tpl) for (let j = 0; j < mc.width; j++) if (known.indexOf(j) < 0) row[j] = tpl[j];
  row[mc.cust] = cust;
  row[mc.biz] = biz;
  row[mc.task] = task;
  row[mc.inactive] = false;
  const at = rows.length + 2;
  if (at > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
  sh.getRange(at, 1, 1, mc.width).setValues([row]);
  sh.getRange(at, mc.inactive + 1).insertCheckboxes().setValue(false);
  rebuildLists_();
  return getSidebarData();
}

/**
 * 고객사·사업·업무 이름 바꾸기 (메뉴).
 * 마스터, 기록, 고객사정보, 연락처를 함께 바꾸고 캘린더 제목도 다시 맞춘다.
 */
function renameMasterItem() {
  const ui = SpreadsheetApp.getUi();
  const kind = ui.prompt('이름 바꾸기', '무엇을 바꿀까요? 1=고객사, 2=사업, 3=업무', ui.ButtonSet.OK_CANCEL);
  if (kind.getSelectedButton() !== ui.Button.OK) return;
  const level = Number(kind.getResponseText());
  if ([1, 2, 3].indexOf(level) < 0) return ui.alert('1, 2, 3 중 하나를 입력하세요.');
  const hint = ['', '예: A사', '예: A사/사업1', '예: A사/사업1/업무1'][level];
  const from = ui.prompt('이름 바꾸기', '지금 이름을 경로로 입력하세요 (' + hint + ')', ui.ButtonSet.OK_CANCEL);
  if (from.getSelectedButton() !== ui.Button.OK) return;
  const path = from.getResponseText().split('/').map(function (s) { return s.trim(); });
  if (path.length !== level || path.some(function (s) { return !s; })) return ui.alert('경로 형식이 맞지 않습니다. ' + hint);
  const to = ui.prompt('이름 바꾸기', '새 이름을 입력하세요 (마지막 이름만)', ui.ButtonSet.OK_CANCEL);
  if (to.getSelectedButton() !== ui.Button.OK) return;
  const newName = to.getResponseText().trim();
  if (!newName) return;

  const count = withLock_(function () {
    let n = 0;
    const match = function (c, b, t) {
      if (c !== path[0]) return false;
      if (level >= 2 && b !== path[1]) return false;
      if (level >= 3 && t !== path[2]) return false;
      return true;
    };
    // 마스터
    const ms = sheet_(SHEET.MASTER);
    const mc = masterCols_(ms);
    const mcol = [mc.cust, mc.biz, mc.task][level - 1];
    masterRows_(ms, mc).forEach(function (r, i) {
      if (match(String(r[mc.cust]).trim(), String(r[mc.biz]).trim(), String(r[mc.task]).trim())) {
        ms.getRange(i + 2, mcol + 1).setValue(newName);
      }
    });
    // 기록 (이름이 바뀐 행은 캘린더 제목도 바뀌도록 수정시각 갱신)
    const data = readRecords_();
    const col = [R.CUST, R.BIZ, R.TASK][level - 1];
    data.list.forEach(function (rec) {
      const v = rec.v;
      if (!match(v[R.CUST], v[R.BIZ], v[R.TASK])) return;
      const nv = v.slice();
      nv[col] = newName;
      nv[R.MODIFIED] = new Date();
      if (writeRecord_(data.sheet, rec, nv)) n++;
    });
    if (level === 1) {
      renameInColumn_(SHEET.CLIENT, K.CUST, path[0], newName);
      renameInColumn_(SHEET.CONTACT, C.CUST, path[0], newName);
    }
    rebuildLists_();
    return n;
  });
  if (count !== null) {
    ui.alert('바꿨습니다. 기록 ' + count + '행이 함께 바뀌었고, 캘린더 제목은 다음 동기화 때 반영됩니다.');
  }
}

function renameInColumn_(sheetName, col, from, to) {
  const sh = sheet_(sheetName);
  if (!sh || sh.getLastRow() < 2) return;
  const range = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1);
  const vals = range.getValues();
  let changed = false;
  vals.forEach(function (r) { if (r[0] === from) { r[0] = to; changed = true; } });
  if (changed) range.setValues(vals);
  if (sheetName === SHEET.CONTACT && changed) {
    // 주소록에도 회사명이 반영되도록 수정시각 갱신
    const all = sh.getRange(2, 1, sh.getLastRow() - 1, CONTACT_HEADERS.length).getValues();
    all.forEach(function (r, i) {
      if (r[C.CUST] === to) sh.getRange(i + 2, C.MODIFIED + 1).setValue(new Date());
    });
  }
}

/** 메뉴 · 초기 설정 · 서식 · 자동 실행 등록 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📒 업무기록')
    .addItem('입력창 열기', 'openSidebar')
    .addSeparator()
    .addItem('지금 캘린더 동기화', 'syncNow')
    .addItem('지금 주소록 동기화', 'syncContactsNow')
    .addItem('고객사 연락 공백 갱신', 'dailyCheckNow')
    .addItem('검색·분석 새로고침', 'refreshViews')
    .addSeparator()
    .addItem('브리핑 메일 지금 보내기', 'sendBriefingNow')
    .addItem('주간 리포트 지금 보내기', 'sendWeeklyReportNow')
    .addSeparator()
    .addItem('고객사·사업·업무 이름 바꾸기', 'renameMasterItem')
    .addItem('대량 삭제 승인 후 동기화', 'syncAllowMassDelete')
    .addItem('서식·대시보드 다시 적용', 'reapplyFormatting')
    .addItem('새 연도 파일 만들기', 'createNextYearFile')
    .addSeparator()
    .addItem('초기 설정 (처음 한 번)', 'initialSetup')
    .addToUi();
}

function dailyCheckNow() {
  dailyCheck();
  ss_().toast('고객사 연락 공백을 갱신했습니다.', APP_NAME, 5);
}

function sendBriefingNow() {
  sendBriefing();
  ss_().toast('브리핑 메일을 보냈습니다: ' + mailTo_(), APP_NAME, 5);
}

function sendWeeklyReportNow() {
  sendWeeklyReport();
  ss_().toast('주간 리포트를 보냈습니다: ' + mailTo_(), APP_NAME, 5);
}

/**
 * 처음 한 번 실행. 여러 번 실행해도 기존 데이터는 지우지 않는다.
 */
function initialSetup() {
  const ui = SpreadsheetApp.getUi();
  const ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('ko_KR');

  const order = [SHEET.DASHBOARD, SHEET.RECORD, SHEET.MONTHLY, SHEET.SEARCH, SHEET.ANALYSIS, SHEET.CLIENT,
    SHEET.MASTER, SHEET.CONTACT, SHEET.SETTINGS, SHEET.LOG, SHEET.LISTS, SHEET.INDEX, SHEET.STATE];
  const fresh = {};
  order.forEach(function (name, i) {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name, i);
      fresh[name] = true;
    }
  });
  // 빈 기본 시트(시트1 / Sheet1) 정리
  ss.getSheets().forEach(function (sh) {
    if (order.indexOf(sh.getName()) < 0 && sh.getLastRow() === 0 && ss.getSheets().length > order.length) ss.deleteSheet(sh);
  });

  setupSettings_();
  setupCalendars_();
  setupRecordSheet_(fresh[SHEET.RECORD]);
  setupMasterSheet_(fresh[SHEET.MASTER]);
  setupContactSheet_(fresh[SHEET.CONTACT]);
  setupClientSheet_(fresh[SHEET.CLIENT]);
  setupHelperSheets_();
  rebuildLists_();
  if (fresh[SHEET.DASHBOARD]) buildDashboard_();
  if (fresh[SHEET.MONTHLY]) buildMonthly_();
  if (fresh[SHEET.SEARCH]) buildSearch_();
  if (fresh[SHEET.ANALYSIS]) buildAnalysis_();
  installTriggers_();
  ss.setActiveSheet(ss.getSheetByName(SHEET.MASTER));

  ui.alert('초기 설정 완료',
    '1) 마스터 시트에 고객사·사업·업무를 입력하세요 (예시 행은 지워도 됩니다).\n' +
    '2) 연락처 시트에 고객사 담당자를 입력하세요.\n' +
    '3) 구글 캘린더에서 "업무"·"할 일" 캘린더의 종일 일정 알림을 "당일 오전 8:30"으로 설정하세요.\n' +
    '4) 메일의 [완료 처리] 버튼을 쓰려면 웹앱으로 배포하세요 (설치 가이드 참고).\n\n' +
    '첫 캘린더 동기화는 메뉴 > 지금 캘린더 동기화로 바로 실행하거나 10분 안에 자동으로 실행됩니다.',
    ui.ButtonSet.OK);
}

function setupSettings_() {
  const sh = sheet_(SHEET.SETTINGS);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 3).setValues([['항목', '값', '설명']]).setFontWeight('bold').setBackground('#f1f3f4');
    sh.setFrozenRows(1);
  }
  const have = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  const add = SETTING_DEFAULTS.filter(function (d) { return have.indexOf(d[0]) < 0; });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setValues(add);
  SETTINGS_CACHE_ = null;
  if (!setting_('연도', '')) setSetting_('연도', new Date().getFullYear());
  if (!setting_('브리핑 메일 주소', '')) setSetting_('브리핑 메일 주소', Session.getEffectiveUser().getEmail());
  if (!setting_('웹앱 토큰', '')) setSetting_('웹앱 토큰', Utilities.getUuid().replace(/-/g, ''));
  sh.setColumnWidth(1, 170);
  sh.setColumnWidth(2, 320);
  sh.setColumnWidth(3, 420);
  // 토큰·ID가 숫자로 바뀌지 않도록 값 열은 텍스트 서식
  sh.getRange('B:B').setHorizontalAlignment('left').setNumberFormat('@');
}

function setupCalendars_() {
  const find = function (name) {
    const cals = CalendarApp.getOwnedCalendarsByName(name);
    if (cals.length) return cals[0].getId();
    const cal = CalendarApp.createCalendar(name, { timeZone: TZ });
    return cal.getId();
  };
  if (!setting_('업무 캘린더 ID', '')) setSetting_('업무 캘린더 ID', find('업무'));
  if (!setting_('할 일 캘린더 ID', '')) setSetting_('할 일 캘린더 ID', find('할 일'));
  if (!setting_('개인 캘린더 ID', '')) setSetting_('개인 캘린더 ID', CalendarApp.getDefaultCalendar().getId());
}

function setupRecordSheet_(isNew) {
  const sh = sheet_(SHEET.RECORD);
  sh.getRange(1, 1, 1, RECORD_COLS).setValues([RECORD_HEADERS]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  if (sh.getMaxRows() < 3001) sh.insertRowsAfter(sh.getMaxRows(), 3001 - sh.getMaxRows());
  if (sh.getMaxColumns() < RECORD_COLS) sh.insertColumnsAfter(sh.getMaxColumns(), RECORD_COLS - sh.getMaxColumns());
  applyRecordValidation_(sh, 2, sh.getMaxRows() - 1);
  applyRecordFormatting_(sh);
  if (isNew) {
    const widths = [120, 60, 60, 110, 110, 110, 60, 220, 320, 120, 85, 180, 110, 160, 60, 70];
    widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.hideColumns(RECORD_VISIBLE + 1, RECORD_COLS - RECORD_VISIBLE);
  }
}

/** 기록 시트 드롭다운·서식 (from행부터 n행) */
function applyRecordValidation_(sh, from, n) {
  if (n <= 0) return;
  const col = function (c) { return sh.getRange(from, c + 1, n, 1); };
  col(R.DATE).setNumberFormat('yyyy-mm-dd (ddd)')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  col(R.START).setNumberFormat('HH:mm');
  col(R.END).setNumberFormat('HH:mm');
  col(R.CUST).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sheet_(SHEET.LISTS).getRange('A2:A'), true).setAllowInvalid(true).build());
  col(R.TYPE).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(TYPES, true).build());
  col(R.STATUS).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  col(R.NEXT_DUE).setNumberFormat('yyyy-mm-dd (ddd)')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  col(R.CARRY).setNumberFormat('0');
  col(R.SYNC).insertCheckboxes();
  [R.CUST, R.BIZ, R.TASK, R.TITLE, R.NOTE, R.CONTACT, R.NEXT, R.LINK, R.ID, R.EVENT_ID, R.CAL, R.PARENT, R.CARRY_FROM, R.SYNCED]
    .forEach(function (c) { col(c).setNumberFormat('@'); });
  col(R.CREATED).setNumberFormat('yyyy-mm-dd HH:mm:ss');
  col(R.MODIFIED).setNumberFormat('yyyy-mm-dd HH:mm:ss');
  col(R.NOTE).setWrap(true);
  sh.getRange(from, 1, n, RECORD_VISIBLE).setVerticalAlignment('top');
}

function applyRecordFormatting_(sh) {
  const soon = numSetting_('마감 임박(일)', 3);
  const warnCarry = numSetting_('이월 경고 횟수', 3);
  const all = sh.getRange('A2:P');
  const rule = function (formula, range) {
    return SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setRanges([range || all]);
  };
  const open = '$K2<>"완료",$K2<>"취소",$K2<>"이월됨"';
  const rules = [
    rule('=OR($K2="취소",$K2="이월됨")').setFontColor('#9aa0a6').setStrikethrough(true).build(),
    rule('=$K2="완료"').setFontColor('#80868b').build(),
    rule('=AND($M2<>"",$M2<TODAY(),' + open + ')', sh.getRange('M2:M')).setBackground('#f4c7c3').build(),
    rule('=AND($M2<>"",$M2<=TODAY()+' + soon + ',' + open + ')', sh.getRange('M2:M')).setBackground('#fce8b2').build(),
    rule('=AND($G2="작업",$K2="예정",$A2<>"",$A2<TODAY())', sh.getRange('A2:A')).setBackground('#f4c7c3').build(),
    rule('=AND($G2="작업",$K2="예정",$A2<>"",$A2<=TODAY()+' + soon + ')', sh.getRange('A2:A')).setBackground('#fce8b2').build(),
    rule('=$O2>=' + warnCarry, sh.getRange('O2:O')).setFontColor('#c5221f').setBold(true).build(),
    rule('=$K2="재일정 필요"', sh.getRange('K2:K')).setBackground('#fde6c8').build(),
    rule('=$K2="보류"', sh.getRange('K2:K')).setBackground('#e9e1fb').build(),
    rule('=$D2="' + UNCLASSIFIED + '"', sh.getRange('D2:D')).setBackground('#fde6c8').build(),
    rule('=$D2="' + PERSONAL + '"').setBackground('#eef7ee').build(),
  ];
  sh.setConditionalFormatRules(rules);
}

function setupMasterSheet_(isNew) {
  const sh = sheet_(SHEET.MASTER);
  // 사용자가 [구분] 등 열을 추가했을 수 있으므로 기존 제목은 덮어쓰지 않고, 빠진 제목만 오른쪽에 붙인다
  const width = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  if (!head.some(String)) {
    sh.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS]);
  } else {
    let next = width + 1;
    MASTER_HEADERS.forEach(function (h) { if (head.indexOf(h) < 0) sh.getRange(1, next++).setValue(h); });
  }
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  if (isNew) {
    sh.getRange(2, 1, 3, 5).setValues([
      ['예시고객사', '예시사업1', '정기 점검', false, '예시 행입니다. 지우고 실제 고객사를 입력하세요.'],
      ['예시고객사', '예시사업1', '제안서 작성', false, ''],
      ['예시고객사', '예시사업2', '', false, '업무가 아직 없으면 비워 두어도 됩니다.'],
    ]);
    sh.setColumnWidths(1, 3, 150);
    sh.setColumnWidth(5, 320);
    sh.getRange('F1').setValue('한 줄에 업무 하나. 쓰지 않는 항목은 지우지 말고 "비활성"에 체크하세요. 이름 변경은 메뉴 > 이름 바꾸기.')
      .setFontColor('#5f6368');
  }
  sh.getRange(2, masterCols_(sh).inactive + 1, Math.max(sh.getMaxRows() - 1, 1), 1).insertCheckboxes();
}

function setupContactSheet_(isNew) {
  const sh = sheet_(SHEET.CONTACT);
  sh.getRange(1, 1, 1, CONTACT_HEADERS.length).setValues([CONTACT_HEADERS]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  const n = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, C.CUST + 1, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sheet_(SHEET.LISTS).getRange('A2:A'), true).setAllowInvalid(true).build());
  sh.getRange(2, C.PHONE + 1, n, 1).setNumberFormat('@');
  sh.getRange(2, C.RES + 1, n, 1).setNumberFormat('@');
  sh.getRange(2, C.SYNCED + 1, n, 1).setNumberFormat('@');
  sh.getRange(2, C.MODIFIED + 1, n, 1).setNumberFormat('yyyy-mm-dd HH:mm:ss');
  sh.getRange(2, C.INACTIVE + 1, n, 1).insertCheckboxes();
  if (isNew) {
    sh.setColumnWidths(1, 6, 140);
    sh.setColumnWidth(6, 260);
    sh.hideColumns(C.RES + 1, CONTACT_HEADERS.length - C.RES);
  }
}

function setupClientSheet_(isNew) {
  const sh = sheet_(SHEET.CLIENT);
  sh.getRange(1, 1, 1, CLIENT_HEADERS.length).setValues([CLIENT_HEADERS]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  const n = Math.max(sh.getMaxRows() - 1, 1);
  [K.START, K.END, K.LAST_MEET, K.LAST_MAIL].forEach(function (c) {
    sh.getRange(2, c + 1, n, 1).setNumberFormat('yyyy-mm-dd');
  });
  sh.getRange(2, K.START + 1, n, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  const warn = numSetting_('계약 만료 알림(일)', 60);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($G2<>"",$G2>$D2)')
      .setBackground('#f4c7c3').setRanges([sh.getRange('G2:G')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($C2<>"",$C2>=TODAY(),$C2<=TODAY()+' + warn + ')')
      .setBackground('#fce8b2').setRanges([sh.getRange('C2:C')]).build(),
  ]);
  if (isNew) {
    sh.setColumnWidths(1, 7, 120);
    sh.setColumnWidth(8, 300);
    sh.getRange('J1').setValue('계약 기간·공백 기준을 직접 입력하세요. 마지막 연락일과 공백 일수는 매일 아침 자동 계산됩니다.')
      .setFontColor('#5f6368');
  }
}

function setupHelperSheets_() {
  const idx = sheet_(SHEET.INDEX);
  if (idx.getLastRow() === 0) idx.getRange(1, 1, 1, 3).setValues([['ID', '이벤트ID', '캘린더']]);
  idx.getRange('A:C').setNumberFormat('@');
  sheet_(SHEET.STATE).getRange('A:B').setNumberFormat('@');
  const log = sheet_(SHEET.LOG);
  if (log.getLastRow() === 0) {
    log.getRange(1, 1, 1, 4).setValues([['시각', '종류', '내용', 'ID']]).setFontWeight('bold').setBackground('#f1f3f4');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 150);
    log.setColumnWidth(2, 120);
    log.setColumnWidth(3, 600);
    log.getRange('A:A').setNumberFormat('yyyy-mm-dd HH:mm:ss');
  }
  [SHEET.LISTS, SHEET.INDEX, SHEET.STATE].forEach(function (n) { sheet_(n).hideSheet(); });
}

/** 메뉴: 서식·대시보드 다시 적용 (설정값을 바꾼 뒤) */
function reapplyFormatting() {
  SETTINGS_CACHE_ = null;
  const sh = sheet_(SHEET.RECORD);
  applyRecordValidation_(sh, 2, sh.getMaxRows() - 1);
  applyRecordFormatting_(sh);
  setupClientSheet_(false);
  rebuildLists_();
  buildDashboard_();
  buildMonthly_();
  ss_().toast('서식과 대시보드를 다시 적용했습니다.', APP_NAME, 5);
}

/** 자동 실행 등록 (기존 것은 지우고 새로) */
function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  const ss = ss_();
  ScriptApp.newTrigger('handleEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('syncContacts').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('nightly').timeBased().atHour(0).nearMinute(10).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(7).nearMinute(0).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('briefingTrigger').timeBased().atHour(numSetting_('브리핑 시각', 8)).nearMinute(0)
    .everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('weeklyReportTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(numSetting_('주간 리포트 시각', 17)).nearMinute(0).inTimezone(TZ).create();
}

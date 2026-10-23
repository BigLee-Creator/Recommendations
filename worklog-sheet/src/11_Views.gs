/** 대시보드 · 월간 뷰 (수식으로 실시간 갱신) · 검색 · 분석 */

// ===================== 대시보드 =====================

function buildDashboard_() {
  const sh = sheet_(SHEET.DASHBOARD);
  sh.clear();
  sh.getRange('A1').setValue('업무 대시보드').setFontSize(16).setFontWeight('bold');
  sh.getRange('C1').setFormula('="기준일 "&TEXT(TODAY(),"yyyy-mm-dd (ddd)")').setFontColor('#5f6368');

  const soon = numSetting_('마감 임박(일)', 3);
  const warnCarry = numSetting_('이월 경고 횟수', 3);
  const contractDays = numSetting_('계약 만료 알림(일)', 60);
  const d = function (expr) { return "date '\"&TEXT(" + expr + ",\"yyyy-mm-dd\")&\"'"; };
  const REC = "'" + SHEET.RECORD + "'!A2:P";
  const CLI = "'" + SHEET.CLIENT + "'!A2:H";
  const live = " and K <> '취소' and K <> '이월됨'";

  const sections = [
    { title: '오늘 일정', headers: ['시작', '종료', '고객사', '사업', '유형', '제목', '상태'], rows: 15, time: [0, 1],
      range: REC, q: 'select B,C,D,E,G,H,K where A = ' + d('TODAY()') + live + " and K <> '재일정 필요' order by B" },
    { title: '이번 주 일정 (월~일)', headers: ['날짜', '시작', '고객사', '사업', '유형', '제목', '상태'], rows: 40, date: [0], time: [1],
      range: REC, q: 'select A,B,D,E,G,H,K where A >= ' + d('TODAY()-WEEKDAY(TODAY(),3)') + ' and A <= ' + d('TODAY()-WEEKDAY(TODAY(),3)+6') + live + ' order by A,B' },
    { title: '곧 마감되는 할 일 (' + soon + '일 이내)', headers: ['날짜', '고객사', '사업', '할 일', '이월'], rows: 15, date: [0],
      range: REC, q: "select A,D,E,H,O where G = '작업' and K = '예정' and A <= " + d('TODAY()+' + soon) + ' order by A' },
    { title: '시간을 다시 정해야 하는 미팅·통화', headers: ['날짜', '고객사', '사업', '유형', '제목', '이월'], rows: 10, date: [0],
      range: REC, q: "select A,D,E,G,H,O where K = '재일정 필요' order by A" },
    { title: warnCarry + '번 넘게 밀린 항목', headers: ['날짜', '고객사', '사업', '유형', '제목', '이월'], rows: 10, date: [0],
      range: REC, q: 'select A,D,E,G,H,O where O >= ' + warnCarry + " and (K = '예정' or K = '재일정 필요') order by O desc" },
    { title: '연락이 뜸한 고객사', headers: ['고객사', '마지막 미팅·통화', '마지막 메일', '공백(일)', '기준(일)'], rows: 10, date: [1, 2],
      range: CLI, q: 'select A,E,F,G,D where G > D order by G desc' },
    { title: '계약 만료 임박 (' + contractDays + '일 이내)', headers: ['고객사', '계약 종료'], rows: 10, date: [1],
      range: CLI, q: 'select A,C where C >= ' + d('TODAY()') + ' and C <= ' + d('TODAY()+' + contractDays) + ' order by C' },
    { title: '미분류 일정 (고객사를 골라 주세요)', headers: ['날짜', '시작', '유형', '제목'], rows: 10, date: [0], time: [1],
      range: REC, q: "select A,B,G,H where D = '" + UNCLASSIFIED + "'" + live + ' order by A' },
  ];

  let row = 3;
  sections.forEach(function (s) {
    const cols = s.headers.length;
    sh.getRange(row, 1).setValue(s.title).setFontWeight('bold').setFontSize(12);
    sh.getRange(row, 1, 1, 7).setBackground('#e8f0fe');
    sh.getRange(row + 1, 1, 1, cols).setValues([s.headers]).setFontWeight('bold').setFontColor('#5f6368');
    const f = '=IFERROR(ARRAY_CONSTRAIN(QUERY(' + s.range + ',"' + s.q + '",0),' + s.rows + ',' + cols + '),"—")';
    sh.getRange(row + 2, 1).setFormula(f);
    (s.time || []).forEach(function (c) { sh.getRange(row + 2, c + 1, s.rows, 1).setNumberFormat('HH:mm'); });
    (s.date || []).forEach(function (c) { sh.getRange(row + 2, c + 1, s.rows, 1).setNumberFormat('yyyy-mm-dd (ddd)'); });
    row += s.rows + 4;
  });
  sh.setColumnWidths(1, 7, 130);
  sh.setColumnWidth(6, 260);
  sh.setFrozenRows(1);
}

// ===================== 월간 뷰 =====================

function buildMonthly_() {
  const sh = sheet_(SHEET.MONTHLY);
  sh.clear();
  sh.clearConditionalFormatRules();
  const today = todayStr_();
  sh.getRange('A1').setValue('월 선택').setFontWeight('bold');
  sh.getRange('B1').setValue(dateToCell_(today.slice(0, 8) + '01')).setNumberFormat('yyyy년 m월')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build()).setBackground('#fff8e1');
  sh.getRange('C1').setValue('← 아무 날짜나 넣으면 그 달이 보입니다. 🏠 = 개인 일정').setFontColor('#5f6368');
  sh.getRange('A3:G3').setValues([['일', '월', '화', '수', '목', '금', '토']]).setFontWeight('bold')
    .setHorizontalAlignment('center').setBackground('#f1f3f4');

  const rec = function (col) { return "'" + SHEET.RECORD + "'!$" + col + '$2:$' + col; };
  const rules = [];
  for (let w = 0; w < 6; w++) {
    const dateRow = 4 + w * 2;
    for (let d = 0; d < 7; d++) {
      const a1 = sh.getRange(dateRow, d + 1).getA1Notation();
      sh.getRange(dateRow, d + 1).setFormula('=DATE(YEAR($B$1),MONTH($B$1),1)-WEEKDAY(DATE(YEAR($B$1),MONTH($B$1),1))+' + (w * 7 + d + 1));
      const label = 'IF(' + rec('D') + '="' + PERSONAL + '","🏠 ","")&IF(' + rec('B') + '="","",TEXT(' + rec('B') + ',"hh:mm")&" ")&' +
        'IF((' + rec('D') + '="' + PERSONAL + '")+(' + rec('D') + '="' + UNCLASSIFIED + '")+(' + rec('D') + '=""),"","["&' + rec('D') + '&"] ")&' + rec('H');
      sh.getRange(dateRow + 1, d + 1).setFormula('=ARRAYFORMULA(IFERROR(TEXTJOIN(CHAR(10),TRUE,FILTER(' + label + ',' +
        rec('A') + '=' + a1 + ',' + rec('K') + '<>"취소",' + rec('K') + '<>"이월됨")),""))');
    }
    const dates = sh.getRange(dateRow, 1, 1, 7);
    const content = sh.getRange(dateRow + 1, 1, 1, 7);
    dates.setNumberFormat('d').setFontWeight('bold').setHorizontalAlignment('left');
    content.setWrap(true).setVerticalAlignment('top').setFontSize(9);
    sh.setRowHeight(dateRow + 1, 90);
    const top = 'A' + dateRow;
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=' + top + '=TODAY()')
      .setBackground('#d2e3fc').setRanges([dates]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=MONTH(' + top + ')<>MONTH($B$1)')
      .setFontColor('#bdc1c6').setRanges([dates, content]).build());
  }
  sh.setConditionalFormatRules(rules);
  sh.getRange(3, 1, 13, 7).setBorder(true, true, true, true, true, true, '#dadce0', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, 7, 150);
}

// ===================== 검색 · 고객사 히스토리 =====================

const SEARCH_HEADERS = ['연도', '날짜', '시간', '고객사', '사업', '업무', '유형', '제목', '내용·노트', '담당자', '상태', '다음 액션'];

function buildSearch_() {
  const sh = sheet_(SHEET.SEARCH);
  sh.clear();
  sh.getRange('A1:A3').setValues([['고객사'], ['키워드'], ['범위']]).setFontWeight('bold');
  sh.getRange('B1:B3').setBackground('#fff8e1');
  sh.getRange('B1').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(sheet_(SHEET.LISTS).getRange('A2:A'), true).setAllowInvalid(true).build());
  sh.getRange('B3').setValue('작년 포함').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['올해', '작년 포함'], true).build());
  sh.getRange('D1').setValue('고객사만 고르면 그 고객사의 전체 히스토리, 키워드를 넣으면 노트까지 검색합니다. 조건을 바꾸면 바로 갱신됩니다.')
    .setFontColor('#5f6368');
  sh.getRange(5, 1, 1, SEARCH_HEADERS.length).setValues([SEARCH_HEADERS]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(5);
  sh.setColumnWidth(9, 360);
  sh.setColumnWidth(8, 220);
}

function runSearch() {
  const sh = sheet_(SHEET.SEARCH);
  const cust = String(sh.getRange('B1').getValue()).trim();
  const kw = String(sh.getRange('B2').getValue()).trim().toLowerCase();
  const withPrev = sh.getRange('B3').getValue() !== '올해';
  const maxRows = Math.max(sh.getMaxRows() - 5, 1);
  sh.getRange(6, 1, maxRows, SEARCH_HEADERS.length).clearContent();
  if (!cust && !kw) {
    sh.getRange('D2').setValue('');
    return;
  }
  let list = readRecords_().list.map(function (r) { return r.v; });
  if (withPrev) list = list.concat(readPrevYearRecords_().map(function (r) { return r.v; }));
  const hits = list.filter(function (v) {
    if (cust && cust !== '전체' && v[R.CUST] !== cust) return false;
    if (v[R.STATUS] === STATUS.CARRIED) return false;
    if (!kw) return true;
    return [v[R.TITLE], v[R.NOTE], v[R.CONTACT], v[R.NEXT], v[R.BIZ], v[R.TASK], v[R.CUST]]
      .join('\n').toLowerCase().indexOf(kw) >= 0;
  }).sort(function (a, b) { return byDate_(b, a); }).slice(0, 1000);

  const rows = hits.map(function (v) {
    return [v[R.DATE].slice(0, 4), dateToCell_(v[R.DATE]), timeLabel_(v), v[R.CUST], v[R.BIZ], v[R.TASK], v[R.TYPE],
      v[R.TITLE], v[R.NOTE], v[R.CONTACT], v[R.STATUS], v[R.NEXT]];
  });
  if (rows.length) {
    if (sh.getMaxRows() < rows.length + 5) sh.insertRowsAfter(sh.getMaxRows(), rows.length + 5 - sh.getMaxRows());
    sh.getRange(6, 1, rows.length, SEARCH_HEADERS.length).setValues(rows);
    sh.getRange(6, 2, rows.length, 1).setNumberFormat('yyyy-mm-dd (ddd)');
  }
  sh.getRange('D2').setValue(rows.length + '건 (최근 날짜 먼저)' + (hits.length >= 1000 ? ' — 1000건까지만 표시' : ''))
    .setFontColor('#188038');
}

// ===================== 분석 =====================

function buildAnalysis_() {
  const sh = sheet_(SHEET.ANALYSIS);
  sh.clear();
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  const today = todayStr_();
  sh.getRange('A1:A2').setValues([['시작일'], ['종료일']]).setFontWeight('bold');
  sh.getRange('B1').setValue(dateToCell_(today.slice(0, 8) + '01'));
  sh.getRange('B2').setValue(dateToCell_(today));
  sh.getRange('B1:B2').setNumberFormat('yyyy-mm-dd').setBackground('#fff8e1')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
  sh.getRange('D1').setValue('기간을 바꾸면 다시 계산됩니다. 시작·종료 시간이 모두 있는 기록만 시간에 들어가며, 개인 일정은 빠집니다.')
    .setFontColor('#5f6368');
  sh.getRange('A4').setValue('고객사별').setFontWeight('bold');
  sh.getRange('E4').setValue('사업별').setFontWeight('bold');
  sh.getRange('J4').setValue('유형별').setFontWeight('bold');
  sh.getRange('A5:C5').setValues([['고객사', '시간', '건수']]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange('E5:H5').setValues([['고객사', '사업', '시간', '건수']]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange('J5:L5').setValues([['유형', '시간', '건수']]).setFontWeight('bold').setBackground('#f1f3f4');

  runAnalysis();

  sh.insertChart(sh.newChart().asBarChart().addRange(sh.getRange('A5:B45'))
    .setNumHeaders(1).setOption('title', '고객사별 시간').setOption('legend', { position: 'none' })
    .setPosition(4, 14, 0, 0).setOption('width', 520).setOption('height', 420).build());
  sh.insertChart(sh.newChart().asPieChart().addRange(sh.getRange('J5:K10'))
    .setNumHeaders(1).setOption('title', '유형별 시간').setOption('pieHole', 0.4)
    .setPosition(27, 14, 0, 0).setOption('width', 520).setOption('height', 320).build());
}

function runAnalysis() {
  const sh = sheet_(SHEET.ANALYSIS);
  const from = parseDate_(sh.getRange('B1').getValue());
  const to = parseDate_(sh.getRange('B2').getValue());
  sh.getRange('A6:L300').clearContent();
  if (!from || !to) return;
  let list = readRecords_().list.map(function (r) { return r.v; });
  if (from < yearStart_(fileYear_())) list = list.concat(readPrevYearRecords_().map(function (r) { return r.v; }));

  const byCust = {}, byBiz = {}, byType = {};
  const add = function (map, key, min, extra) {
    const x = map[key] || (map[key] = { min: 0, n: 0, extra: extra });
    x.min += min;
    x.n++;
  };
  list.forEach(function (v) {
    if (!v[R.DATE] || v[R.DATE] < from || v[R.DATE] > to) return;
    if (v[R.CUST] === PERSONAL || !v[R.CUST]) return;
    if ([STATUS.CANCELLED, STATUS.CARRIED, STATUS.RESCHEDULE].indexOf(v[R.STATUS]) >= 0) return;
    const min = durationMinutes_(v);
    add(byCust, v[R.CUST], min);
    add(byBiz, v[R.CUST] + '\u0000' + (v[R.BIZ] || '(없음)'), min);
    add(byType, v[R.TYPE] || '기타', min);
  });
  const h = function (m) { return Math.round(m / 6) / 10; };
  const sortDesc = function (map) {
    return Object.keys(map).sort(function (a, b) { return map[b].min - map[a].min || map[b].n - map[a].n; });
  };
  const custRows = sortDesc(byCust).slice(0, 40).map(function (k) { return [k, h(byCust[k].min), byCust[k].n]; });
  const bizRows = sortDesc(byBiz).slice(0, 200).map(function (k) {
    const p = k.split('\u0000');
    return [p[0], p[1], h(byBiz[k].min), byBiz[k].n];
  });
  const typeRows = sortDesc(byType).slice(0, 5).map(function (k) { return [k, h(byType[k].min), byType[k].n]; });
  if (custRows.length) sh.getRange(6, 1, custRows.length, 3).setValues(custRows);
  if (bizRows.length) sh.getRange(6, 5, bizRows.length, 4).setValues(bizRows);
  if (typeRows.length) sh.getRange(6, 10, typeRows.length, 3).setValues(typeRows);
}

/** 메뉴: 검색·분석 새로고침 */
function refreshViews() {
  runSearch();
  runAnalysis();
  ss_().toast('검색과 분석을 새로 계산했습니다.', APP_NAME, 5);
}

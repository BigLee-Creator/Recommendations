/**
 * 새 연도 파일 만들기 (메뉴, 1월 1일 이후 실행)
 *
 * 1) 이 파일을 복사해 '업무기록_<내년>' 파일을 만든다 (스크립트·마스터·연락처·고객사정보·설정 포함)
 * 2) 새 파일의 기록·로그·내부 상태를 비우고, 새해 날짜의 행을 옮긴다
 * 3) 이 파일은 '이전 연도'가 된다: 1월 말까지는 지난해 일정의 캘린더 변경만 반영하고, 그 뒤 자동 실행을 끈다
 */
function createNextYearFile() {
  const ui = SpreadsheetApp.getUi();
  const year = fileYear_();
  const next = year + 1;
  if (isRetired_()) return ui.alert('이미 ' + next + '년 파일이 있습니다: 설정 > 다음 연도 파일 ID');
  if (todayStr_() < yearStart_(next)) {
    return ui.alert(next + '년 1월 1일 이후에 실행하세요. 그 전까지 입력한 ' + next + '년 일정은 이 파일에 두었다가 함께 옮겨집니다.');
  }
  const ok = ui.alert('새 연도 파일 만들기', next + '년 파일을 만들고 ' + next + '년 날짜의 기록을 옮깁니다. 계속할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  const result = withLock_(function () {
    const ss = ss_();
    const file = DriveApp.getFileById(ss.getId());
    const parents = file.getParents();
    const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    const copy = file.makeCopy(APP_NAME + '_' + next, folder);
    const nss = SpreadsheetApp.openById(copy.getId());

    // 새 파일 정리
    const nrec = nss.getSheetByName(SHEET.RECORD);
    if (nrec.getMaxRows() > 1) nrec.getRange(2, 1, nrec.getMaxRows() - 1, RECORD_COLS).clearContent();
    nrec.getRange(2, R.SYNC + 1, nrec.getMaxRows() - 1, 1).insertCheckboxes();
    [SHEET.LOG, SHEET.INDEX].forEach(function (n) {
      const sh = nss.getSheetByName(n);
      if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    });
    nss.getSheetByName(SHEET.STATE).clear();
    const nsearch = nss.getSheetByName(SHEET.SEARCH);
    if (nsearch.getMaxRows() > 5) nsearch.getRange(6, 1, nsearch.getMaxRows() - 5, nsearch.getLastColumn() || 1).clearContent();
    setSettingIn_(nss, '연도', next);
    setSettingIn_(nss, '이전 연도 파일 ID', ss.getId());
    setSettingIn_(nss, '다음 연도 파일 ID', '');
    setSettingIn_(nss, '웹앱 URL', '');
    setSettingIn_(nss, '웹앱 토큰', Utilities.getUuid().replace(/-/g, ''));
    const nan = nss.getSheetByName(SHEET.ANALYSIS);
    nan.getRange('B1').setValue(dateToCell_(yearStart_(next)));
    nan.getRange('B2').setValue(dateToCell_(todayStr_()));

    // 새해 날짜의 행 옮기기
    const data = readRecords_();
    const moving = data.list.filter(function (rec) { return rec.v[R.DATE] >= yearStart_(next); });
    if (moving.length) {
      nrec.getRange(2, 1, moving.length, RECORD_COLS).setValues(moving.map(function (rec) { return toCells_(rec.v); }));
      const idxRows = moving.filter(function (rec) { return rec.v[R.EVENT_ID]; })
        .map(function (rec) { return [rec.v[R.ID], rec.v[R.EVENT_ID], rec.v[R.CAL]]; });
      writeIndex_(nss.getSheetByName(SHEET.INDEX), idxRows);

      // 이 파일의 _연동 목록에서 먼저 빼야 '지운 행'으로 오인해 일정을 지우지 않는다
      const movedIds = {};
      moving.forEach(function (rec) { movedIds[rec.v[R.ID]] = true; });
      const idx = sheet_(SHEET.INDEX);
      const old = idx.getLastRow() > 1 ? idx.getRange(2, 1, idx.getLastRow() - 1, 3).getValues() : [];
      writeIndex_(idx, old.filter(function (r) { return !movedIds[r[0]]; }));
      moving.map(function (rec) { return rec.r; }).sort(function (a, b) { return b - a; })
        .forEach(function (r) { data.sheet.deleteRow(r); });
    }
    setSetting_('다음 연도 파일 ID', nss.getId());
    log_('연도 전환', next + '년 파일 생성, ' + moving.length + '행 이동: ' + nss.getUrl(), '');
    return { url: nss.getUrl(), moved: moving.length };
  }, 120000);
  if (!result) return;

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;font-size:14px;line-height:1.6">' +
    '<p><b>' + next + '년 파일을 만들었습니다.</b> (' + result.moved + '행 이동)</p>' +
    '<p><a href="' + result.url + '" target="_blank">새 파일 열기</a></p>' +
    '<ol><li>새 파일에서 <b>📒 업무기록 &gt; 초기 설정</b>을 실행해 권한을 승인하세요. (자동 실행은 파일마다 따로 등록됩니다)</li>' +
    '<li>메일 버튼을 쓰려면 새 파일에서도 웹앱을 다시 배포하세요.</li>' +
    '<li>이 파일은 1월 말까지 지난해 일정 변경만 반영하고, 그 뒤 자동으로 멈춥니다.</li></ol></div>')
    .setWidth(460).setHeight(300);
  ui.showModalDialog(html, '새 연도 파일');
}

function setSettingIn_(ss, key, value) {
  const sh = ss.getSheetByName(SHEET.SETTINGS);
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  const i = keys.indexOf(key);
  if (i >= 0) sh.getRange(i + 2, 2).setValue(value);
  else sh.appendRow([key, value, '']);
}

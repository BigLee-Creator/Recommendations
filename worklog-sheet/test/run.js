/**
 * 시나리오 테스트: TZ=Asia/Seoul node test/run.js
 * dist/Code.gs 를 모의 Apps Script 환경에서 실행해 주요 흐름을 확인한다.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { createEnv } = require('./gas-mock');

const code = fs.readFileSync(path.join(__dirname, '..', 'dist', 'Code.gs'), 'utf8');
const T = createEnv();
const ctx = vm.createContext(T.env);
vm.runInContext(code, ctx, { filename: 'Code.gs' });
const run = (src) => vm.runInContext(src, ctx);
const R = run('R');
const rec = () => run('readRecords_()').list.map(r => r.v);
const findRow = (title) => rec().find(v => v[R.TITLE] === title);
const events = (calId) => Object.values(T.cal.store(calId));
const live = (calId) => events(calId).filter(e => e.status !== 'cancelled');

let passed = 0;
function step(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.log('  ✗ ' + name);
    throw e;
  }
}

console.log('업무기록 시나리오 테스트 (기준 시각 2026-10-23 금 09:00 KST)');

step('초기 설정: 시트·캘린더·설정·자동 실행 생성', () => {
  run('initialSetup()');
  const names = T.ss.getSheets().map(s => s.name);
  ['기록', '대시보드', '월간', '검색', '분석', '고객사정보', '마스터', '연락처', '설정', '로그'].forEach(n => assert(names.includes(n), n));
  assert.strictEqual(run("setting_('업무 캘린더 ID')"), 'cal-업무');
  assert.strictEqual(run("setting_('할 일 캘린더 ID')"), 'cal-할 일');
  assert.strictEqual(String(run("setting_('연도')")), '2026');
  assert(T.triggers.includes('syncAll') && T.triggers.includes('nightly') && T.triggers.includes('briefingTrigger'));
  assert.strictEqual(run("readMaster_()")['예시고객사'].active, true);
});

step('마스터에 고객사 추가 → 드롭다운 목록 반영', () => {
  run("addMasterItem('A사', '보안관제', '월간 보고')");
  run("addMasterItem('A사', '보안관제', '정기 점검')");
  run("addMasterItem('B사', '컨설팅', '')");
  const d = JSON.parse(run('JSON.stringify(getSidebarData())'));
  assert.deepStrictEqual(d.tree['A사']['보안관제'], ['월간 보고', '정기 점검']);
  const list = T.ss.getSheetByName('_목록').getRange('A2:A').getValues().map(r => r[0]).filter(String);
  assert(list.includes('A사') && list.includes('[개인일정]') && list.includes('미분류'));
});

step('연락처 → 주소록 동기화 (새 연락처 생성 + 고객사 라벨)', () => {
  const sh = T.ss.getSheetByName('연락처');
  sh.getRange(2, 1, 1, 7).setValues([['A사', '김담당', '보안팀 과장', '010-1234-5678', 'kim@a.com', '', false]]);
  run('syncContacts()');
  const p = Object.values(T.people.people)[0];
  assert.strictEqual(p.names[0].unstructuredName, '김담당');
  assert.strictEqual(p.organizations[0].name, 'A사');
  assert(p.memberships.some(m => m.contactGroupMembership.contactGroupResourceName === 'contactGroups/고객사'));
  assert(String(sh.getRange(2, 8).getValue()).startsWith('people/'));
});

step('주소록에서 고친 전화번호 → 시트 반영', () => {
  const p = Object.values(T.people.people)[0];
  T.advance(5000);
  p.phoneNumbers = [{ value: '010-9999-0000' }];
  p.metadata.sources[0].updateTime = new Date(Date.now()).toISOString();
  T.advance(5000);
  run('syncContacts()');
  assert.strictEqual(T.ss.getSheetByName('연락처').getRange(2, 4).getValue(), '010-9999-0000');
});

step('입력창 저장 → 기록 행 + 업무 캘린더 일정 (1시간 전 알림, 유형 색)', () => {
  run(`saveRecord({ date: '2026-10-24', start: '10:00', end: '11:30', cust: 'A사', biz: '보안관제', task: '월간 보고',
    type: '미팅', title: '10월 보고회', note: '참석자: 김담당', contacts: ['김담당'], status: '', next: '', nextDue: '', link: '', sync: true })`);
  const v = findRow('10월 보고회');
  assert.strictEqual(v[R.STATUS], '예정');
  assert(v[R.EVENT_ID]);
  const ev = T.cal.store('cal-업무')[v[R.EVENT_ID]];
  assert.strictEqual(ev.summary, '[A사/보안관제] 10월 보고회');
  assert.strictEqual(ev.start.dateTime, '2026-10-24T10:00:00+09:00');
  assert.strictEqual(ev.end.dateTime, '2026-10-24T11:30:00+09:00');
  assert.deepStrictEqual(ev.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] });
  assert.strictEqual(ev.colorId, '9');
  assert(ev.description.includes('담당자: 김담당'));
});

step('시트에서 시간 수정(onEdit) → 캘린더 일정 수정', () => {
  T.advance(60000);
  const sh = T.ss.getSheetByName('기록');
  const row = run('readRecords_()').list.find(r => r.v[R.TITLE] === '10월 보고회').r;
  sh.getRange(row, 2).setValue(14 / 24);
  run(`handleEdit({ range: SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기록').getRange(${row}, 2) })`);
  run('syncAll()');
  const v = findRow('10월 보고회');
  const ev = T.cal.store('cal-업무')[v[R.EVENT_ID]];
  assert.strictEqual(ev.start.dateTime, '2026-10-24T14:00:00+09:00');
});

step('같은 내용으로 다시 동기화해도 캘린더를 또 고치지 않음', () => {
  const v = findRow('10월 보고회');
  const before = T.cal.store('cal-업무')[v[R.EVENT_ID]].updated;
  T.advance(600000);
  run('syncAll()');
  run('syncAll()');
  assert.strictEqual(T.cal.store('cal-업무')[v[R.EVENT_ID]].updated, before);
});

step('캘린더 앱에서 제목·날짜 변경 → 시트 반영', () => {
  const v = findRow('10월 보고회');
  T.advance(60000);
  T.cal.userEdit('cal-업무', v[R.EVENT_ID], {
    summary: '[A사/보안관제] 10월 보고회(연기)',
    start: { dateTime: '2026-10-27T15:00:00+09:00' }, end: { dateTime: '2026-10-27T16:00:00+09:00' },
  });
  T.advance(60000);
  run('syncAll()');
  const nv = findRow('10월 보고회(연기)');
  assert(nv, '제목 반영');
  assert.strictEqual(nv[R.DATE], '2026-10-27');
  assert.strictEqual(nv[R.START], '15:00');
  assert.strictEqual(nv[R.CUST], 'A사');
  assert.strictEqual(nv[R.NOTE], '참석자: 김담당', '설명의 꼬리말은 노트에서 빠짐');
});

step('캘린더에서 직접 만든 일정 → 제목 규칙으로 분류 / 형식 없으면 미분류', () => {
  T.advance(60000);
  T.cal.userCreate('cal-업무', { summary: '[B사/컨설팅] 킥오프 통화', start: { dateTime: '2026-10-26T09:00:00+09:00' }, end: { dateTime: '2026-10-26T09:30:00+09:00' } });
  T.cal.userCreate('cal-업무', { summary: '업체 미팅', start: { dateTime: '2026-10-28T13:00:00+09:00' }, end: { dateTime: '2026-10-28T14:00:00+09:00' } });
  T.advance(60000);
  run('syncAll()');
  const a = findRow('킥오프 통화');
  assert.strictEqual(a[R.CUST], 'B사');
  assert.strictEqual(a[R.BIZ], '컨설팅');
  assert.strictEqual(findRow('업체 미팅')[R.CUST], '미분류');
  // 가져온 일정은 다시 캘린더로 밀어 넣지 않음
  const ev = Object.values(T.cal.store('cal-업무')).find(e => e.summary === '업체 미팅');
  assert(!ev.extendedProperties, '가져온 일정을 건드리지 않음');
});

step('개인 캘린더 일정 → [개인일정]으로 들어오고 집계에서 빠짐', () => {
  T.advance(60000);
  T.cal.userCreate('me@example.com', { summary: '치과', start: { dateTime: '2026-10-23T18:00:00+09:00' }, end: { dateTime: '2026-10-23T19:00:00+09:00' } });
  T.advance(60000);
  run('syncAll()');
  const v = findRow('치과');
  assert.strictEqual(v[R.CUST], '[개인일정]');
  assert.strictEqual(v[R.BIZ], '-');
});

step('캘린더에서 지운 일정 → 행은 남고 상태만 취소', () => {
  const ev = Object.values(T.cal.store('cal-업무')).find(e => e.summary === '업체 미팅');
  T.advance(60000);
  T.cal.remove('cal-업무', ev.id);
  T.advance(60000);
  run('syncAll()');
  const v = findRow('업체 미팅');
  assert.strictEqual(v[R.STATUS], '취소');
  assert.strictEqual(v[R.EVENT_ID], '');
});

step('다음 액션 + 기한 → 할 일 캘린더에 종일 작업 (당일 8:30 기본 알림)', () => {
  const sh = T.ss.getSheetByName('기록');
  const r = run('readRecords_()').list.find(x => x.v[R.TITLE] === '킥오프 통화');
  sh.getRange(r.r, 12, 1, 2).setValues([['제안서 초안 보내기', new Date(2026, 9, 29)]]);
  run(`handleEdit({ range: SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기록').getRange(${r.r}, 12, 1, 2) })`);
  run('syncAll()');
  const child = findRow('제안서 초안 보내기');
  assert(child, '작업 행 생성');
  assert.strictEqual(child[R.PARENT], r.v[R.ID]);
  assert.strictEqual(child[R.TYPE], '작업');
  assert.strictEqual(child[R.CAL], '할일');
  const ev = T.cal.store('cal-할 일')[child[R.EVENT_ID]];
  assert.strictEqual(ev.summary, '☐ [B사/컨설팅] 제안서 초안 보내기');
  assert.deepStrictEqual(ev.start, { date: '2026-10-29' });
  assert.deepStrictEqual(ev.end, { date: '2026-10-30' });
  assert.deepStrictEqual(ev.reminders, { useDefault: true });
  // 한 번 더 돌려도 중복 생성 안 됨
  run('syncAll()');
  assert.strictEqual(rec().filter(v => v[R.TITLE] === '제안서 초안 보내기').length, 1);
});

step('할 일을 완료로 바꾸면 캘린더 제목에 ✅', () => {
  T.advance(60000);
  const sh = T.ss.getSheetByName('기록');
  const r = run('readRecords_()').list.find(x => x.v[R.TITLE] === '제안서 초안 보내기');
  sh.getRange(r.r, 11).setValue('완료');
  run(`handleEdit({ range: SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기록').getRange(${r.r}, 11) })`);
  run('syncAll()');
  assert.strictEqual(T.cal.store('cal-할 일')[r.v[R.EVENT_ID]].summary, '✅ [B사/컨설팅] 제안서 초안 보내기');
});

step('메모 유형은 캘린더에 올리지 않음', () => {
  run(`saveRecord({ date: '2026-10-23', cust: 'A사', biz: '보안관제', task: '', type: '메모', title: '전화로 들은 내용', note: '예산 확정은 11월', contacts: [], status: '', next: '', nextDue: '', link: '', sync: false })`);
  const v = findRow('전화로 들은 내용');
  assert.strictEqual(v[R.STATUS], '완료');
  assert.strictEqual(v[R.EVENT_ID], '');
});

step('고객사를 [개인일정]으로 바꾸면 개인 캘린더로 옮겨짐', () => {
  run(`saveRecord({ date: '2026-10-25', start: '12:00', end: '13:00', cust: 'A사', biz: '보안관제', task: '', type: '미팅', title: '점심', note: 'x', contacts: [], status: '', next: '', nextDue: '', link: '', sync: true })`);
  let v = findRow('점심');
  const oldId = v[R.EVENT_ID];
  T.advance(60000);
  const sh = T.ss.getSheetByName('기록');
  const r = run('readRecords_()').list.find(x => x.v[R.TITLE] === '점심');
  sh.getRange(r.r, 4).setValue('[개인일정]');
  run(`handleEdit({ range: SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기록').getRange(${r.r}, 4) })`);
  run('syncAll()');
  v = findRow('점심');
  assert.strictEqual(T.cal.store('cal-업무')[oldId].status, 'cancelled');
  assert.strictEqual(v[R.CAL], '개인');
  const ev = T.cal.store('me@example.com')[v[R.EVENT_ID]];
  assert.strictEqual(ev.summary, '점심');
  assert(!ev.colorId, '개인 일정 색은 건드리지 않음');
});

step('시트에서 행을 지우면 캘린더 일정도 삭제', () => {
  const v = findRow('점심');
  const sh = T.ss.getSheetByName('기록');
  const r = run('readRecords_()').list.find(x => x.v[R.TITLE] === '점심');
  sh.deleteRow(r.r);
  run('syncAll()');
  assert.strictEqual(T.cal.store('me@example.com')[v[R.EVENT_ID]].status, 'cancelled');
});

step('대량 삭제 감지: 기준보다 많이 지워지면 멈춤', () => {
  run("setSetting_('대량 삭제 기준', 1)");
  run(`saveRecord({ date: '2026-10-30', start: '09:00', end: '10:00', cust: 'A사', biz: '보안관제', task: '', type: '통화', title: '삭제1', note: '', contacts: [], status: '', next: '', nextDue: '', link: '', sync: true })`);
  run(`saveRecord({ date: '2026-10-30', start: '11:00', end: '12:00', cust: 'A사', biz: '보안관제', task: '', type: '통화', title: '삭제2', note: '', contacts: [], status: '', next: '', nextDue: '', link: '', sync: true })`);
  const ids = ['삭제1', '삭제2'].map(t => findRow(t)[R.EVENT_ID]);
  const sh = T.ss.getSheetByName('기록');
  run('readRecords_()').list.filter(x => x.v[R.TITLE].startsWith('삭제')).map(x => x.r).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
  run('syncAll()');
  ids.forEach(id => assert.notStrictEqual(T.cal.store('cal-업무')[id].status, 'cancelled'));
  run('withLock_(function () { pushToCalendars_(true); })');
  ids.forEach(id => assert.strictEqual(T.cal.store('cal-업무')[id].status, 'cancelled'));
  run("setSetting_('대량 삭제 기준', 20)");
});

step('자정 이월: 작업은 시간 그대로, 미팅은 재일정 필요, 개인은 완료', () => {
  run(`saveRecord({ date: '2026-10-23', start: '16:00', end: '17:00', cust: 'A사', biz: '보안관제', task: '정기 점검', type: '작업', title: '점검 보고서', note: '', contacts: [], status: '', next: '', nextDue: '', link: '', sync: true })`);
  run(`saveRecord({ date: '2026-10-23', start: '15:00', end: '16:00', cust: 'B사', biz: '컨설팅', task: '', type: '미팅', title: '요구사항 회의', note: 'x', contacts: [], status: '', next: '', nextDue: '', link: '', sync: true })`);
  const taskEvent = findRow('점검 보고서')[R.EVENT_ID];
  T.setNow('2026-10-24T00:10:00+09:00');
  run('nightly()');
  const all = rec();
  const tasks = all.filter(v => v[R.TITLE] === '점검 보고서');
  assert.strictEqual(tasks.length, 2);
  const orig = tasks.find(v => v[R.STATUS] === '이월됨');
  const copy = tasks.find(v => v[R.STATUS] === '예정');
  assert.strictEqual(copy[R.DATE], '2026-10-24');
  assert.strictEqual(copy[R.START], '16:00');
  assert.strictEqual(copy[R.CARRY], 1);
  assert.strictEqual(copy[R.CARRY_FROM], orig[R.ID]);
  assert.strictEqual(T.cal.store('cal-업무')[taskEvent].status, 'cancelled', '원래 일정은 캘린더에서 내려감');
  assert(copy[R.EVENT_ID] && T.cal.store('cal-업무')[copy[R.EVENT_ID]].start.dateTime === '2026-10-24T16:00:00+09:00');
  const meet = all.find(v => v[R.TITLE] === '요구사항 회의' && v[R.STATUS] !== '이월됨');
  assert.strictEqual(meet[R.STATUS], '재일정 필요');
  assert.strictEqual(meet[R.START], '');
  assert.strictEqual(meet[R.EVENT_ID], '');
  assert.strictEqual(findRow('치과')[R.STATUS], '완료');
});

step('아침 브리핑: 이월 항목에 [완료 처리] 버튼', () => {
  T.setNow('2026-10-26T08:00:00+09:00'); // 월요일
  run('nightly()');
  T.mails.length = 0;
  run('briefingTrigger()');
  assert.strictEqual(T.mails.length, 1);
  const html = T.mails[0].htmlBody;
  assert(html.includes('완료 처리'));
  assert(html.includes('점검 보고서'));
  assert(html.includes('킥오프 통화'), '오늘 일정');
});

step('메일 버튼(웹앱) → 원래 행 완료, 이월된 행 삭제', () => {
  const tok = run("setting_('웹앱 토큰')");
  const copy = rec().find(v => v[R.TITLE] === '점검 보고서' && v[R.STATUS] === '예정');
  const out = run(`doGet({ parameter: { a: 'done', o: '${copy[R.CARRY_FROM]}', n: '${copy[R.ID]}', t: '${tok}' } })`);
  assert(out.html.includes('완료 처리했습니다'));
  const rows = rec().filter(v => v[R.TITLE] === '점검 보고서');
  assert(rows.some(v => v[R.STATUS] === '완료'));
  assert(!rows.some(v => v[R.ID] === copy[R.ID]), '이월된 행은 지워짐');
  const bad = run(`doGet({ parameter: { a: 'done', o: 'x', t: 'wrong' } })`);
  assert(bad.html.includes('올바르지 않'));
});

step('주말에는 브리핑을 보내지 않음', () => {
  T.setNow('2026-10-31T08:00:00+09:00'); // 토요일
  T.mails.length = 0;
  run('briefingTrigger()');
  assert.strictEqual(T.mails.length, 0);
  T.setNow('2026-10-26T09:00:00+09:00');
});

step('주간 리포트 · 고객사 공백 · 검색 · 분석 실행', () => {
  T.mails.length = 0;
  run('sendWeeklyReport()');
  assert(T.mails[0].subject.startsWith('[주간 리포트]'));
  run('dailyCheck()');
  const cli = T.ss.getSheetByName('고객사정보').getRange('A2:G10').getValues().filter(r => r[0]);
  assert(cli.some(r => r[0] === 'A사'));
  const s = T.ss.getSheetByName('검색');
  s.getRange('B1').setValue('B사');
  run('runSearch()');
  const hits = s.getRange('H6:H20').getValues().map(r => r[0]).filter(String);
  assert(hits.includes('킥오프 통화'));
  assert(!hits.includes('치과'));
  const a = T.ss.getSheetByName('분석');
  a.getRange('B1').setValue(run('new Date(2026, 9, 1)'));
  a.getRange('B2').setValue(run('new Date(2026, 9, 31)'));
  run('runAnalysis()');
  const custRows = a.getRange('A6:C10').getValues().filter(r => r[0]);
  assert(custRows.some(r => r[0] === 'B사'));
  assert(!custRows.some(r => r[0] === '[개인일정]'));
});

step('이름 바꾸기 헬퍼: 고객사 이름 변경 시 기록·연락처 함께 변경', () => {
  run("renameInColumn_('연락처', C.CUST, 'A사', 'A사(신)')");
  assert.strictEqual(T.ss.getSheetByName('연락처').getRange(2, 1).getValue(), 'A사(신)');
});

step('여러 날짜에 걸친 종일 일정은 기간이 유지됨', () => {
  T.advance(60000);
  T.cal.userCreate('cal-업무', { summary: '[A사/보안관제] 워크숍', start: { date: '2026-11-02' }, end: { date: '2026-11-05' } });
  T.advance(60000);
  run('syncAll()');
  const v = findRow('워크숍');
  assert.strictEqual(v[R.DAYS], 2);
  // 시트에서 노트만 고쳐도 기간이 줄지 않음
  T.advance(60000);
  const sh = T.ss.getSheetByName('기록');
  const r = run('readRecords_()').list.find(x => x.v[R.TITLE] === '워크숍');
  sh.getRange(r.r, 9).setValue('장소: 본사');
  run(`handleEdit({ range: SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기록').getRange(${r.r}, 9) })`);
  run('syncAll()');
  const ev = T.cal.store('cal-업무')[v[R.EVENT_ID]];
  assert.deepStrictEqual(ev.end, { date: '2026-11-05' });
  assert(ev.description.startsWith('장소: 본사'));
});

step('양쪽 동시 수정: 나중에 고친 쪽이 이김', () => {
  const sh = T.ss.getSheetByName('기록');
  const edit = (title, note) => {
    const r = run('readRecords_()').list.find(x => x.v[R.TITLE] === title);
    sh.getRange(r.r, 9).setValue(note);
    run(`handleEdit({ range: SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기록').getRange(${r.r}, 9) })`);
    return r.v[R.EVENT_ID];
  };
  // 시트 먼저, 캘린더 나중 → 캘린더 내용
  T.advance(60000);
  let id = edit('워크숍', '시트에서 고침');
  T.advance(60000);
  T.cal.userEdit('cal-업무', id, { description: '캘린더에서 고침' });
  T.advance(60000);
  run('syncAll()');
  assert.strictEqual(findRow('워크숍')[R.NOTE], '캘린더에서 고침');
  // 캘린더 먼저, 시트 나중 → 시트 내용
  T.advance(60000);
  T.cal.userEdit('cal-업무', id, { description: '캘린더 두 번째' });
  T.advance(60000);
  edit('워크숍', '시트 두 번째');
  T.advance(60000);
  run('syncAll()');
  assert.strictEqual(findRow('워크숍')[R.NOTE], '시트 두 번째');
  assert(T.cal.store('cal-업무')[id].description.startsWith('시트 두 번째'));
});

step('마스터 A열에 [구분]을 끼워 넣어도 제목으로 열을 찾아 동작', () => {
  const ms = T.ss.getSheetByName('마스터');
  ms.rows = ms.rows.map((r, i) => [i === 0 ? '구분' : (r && r[0] ? (r[0] === 'A사' ? '관제' : '기타') : '')].concat(r || []));
  const tree = JSON.parse(run('JSON.stringify(readMaster_())'));
  assert(tree['A사'] && tree['A사'].biz['보안관제'], 'A사 트리 유지');
  assert(!tree['관제'], '구분 값이 고객사로 읽히면 안 됨');
  run("addMasterItem('A사', '보안관제', '분기 보고')");
  const rows = ms.getRange(1, 1, ms.getLastRow(), 6).getValues();
  const last = rows.map((r, i) => [r, i]).filter(([r]) => r[1] || r[2] || r[3]).pop();
  assert.strictEqual(last[0][3], '분기 보고', '새 업무는 마지막 데이터 행 바로 아래');
  assert.strictEqual(last[0][0], '관제', '구분 값은 같은 고객사 행에서 물려받음');
  assert.strictEqual(last[0][1], 'A사');
  assert(last[1] < 20, '빈 체크박스 행(1000행) 아래로 가지 않음');
  run('setupMasterSheet_(false)');
  assert.strictEqual(ms.getRange(1, 1).getValue(), '구분', '초기 설정을 다시 해도 [구분] 제목 유지');
  const d = JSON.parse(run('JSON.stringify(getSidebarData())'));
  assert(d.tree['A사']['보안관제'].includes('분기 보고'));
});

step('주소록에서 가져온 새 연락처는 마지막 데이터 행 바로 아래', () => {
  const g = 'contactGroups/고객사';
  T.people.people['people/x1'] = { resourceName: 'people/x1', etag: 'x', names: [{ displayName: '박팀장' }],
    organizations: [{ name: 'B사' }], memberships: [{ contactGroupMembership: { contactGroupResourceName: g } }],
    metadata: { sources: [{ type: 'CONTACT', updateTime: new Date(Date.now()).toISOString() }] } };
  run('syncContacts()');
  assert.strictEqual(T.ss.getSheetByName('연락처').getRange(3, 2).getValue(), '박팀장');
});

step('개인 캘린더의 "생일" 일정은 시트에 넣지 않음 (캘린더는 그대로)', () => {
  assert.strictEqual(run("settings_()['제외 키워드']"), '생일');
  T.advance(60000);
  const ev = T.cal.userCreate('me@example.com', { summary: '엄마 생일', start: { date: '2026-10-28' }, end: { date: '2026-10-29' } });
  T.advance(60000);
  run('syncAll()');
  assert(!findRow('엄마 생일'), '새 생일 일정은 안 들어옴');
  // 이미 들어와 있던 생일 행 정리: 키워드를 끄고 가져온 뒤 다시 켜기
  run("setSetting_('제외 키워드', '')");
  run("setState_('pulledAt:개인', '')");
  run('syncAll()');
  assert(findRow('엄마 생일'), '키워드를 비우면 들어옴');
  run("setSetting_('제외 키워드', '생일, 기념일')");
  run('syncAll()');
  assert(!findRow('엄마 생일'), '키워드를 다시 넣으면 시트에서 빠짐');
  assert.strictEqual(T.cal.store('me@example.com')[ev.id].status, 'confirmed', '캘린더 일정은 지우지 않음');
  run("setState_('pulledAt:개인', '')");
  run('syncAll()');
  assert(!findRow('엄마 생일'));
  assert.strictEqual(T.cal.store('me@example.com')[ev.id].status, 'confirmed');
  assert(findRow('치과'), '다른 개인 일정은 그대로');
});

step('직접 추가한 시트는 초기 설정을 다시 해도 남고, 사용법 시트가 생김', () => {
  T.ss.insertSheet('내 메모');
  run('initialSetup()');
  assert(T.ss.getSheetByName('내 메모'), '사용자 시트 유지');
  const g = T.ss.getSheetByName('📖 사용법');
  assert(g, '사용법 시트 생성');
  const text = g.getRange(1, 1, g.getLastRow(), 4).getValues().map(r => r.join(' ')).join('\n');
  assert(text.includes('주의사항') && text.includes('"생일, 기념일"'), '설정값(제외 키워드) 반영');
  run('openGuide()');
  assert.strictEqual(T.ss.getSheets().filter(s => s.name === '📖 사용법').length, 1, '다시 열어도 하나');
});

step('제목 해석 단위 테스트', () => {
  const p = (s, k) => JSON.parse(run(`JSON.stringify(parseTitle_(${JSON.stringify(s)}, ${JSON.stringify(k)}))`));
  assert.deepStrictEqual(p('[A사/사업1] 주간회의', '업무'), { cust: 'A사', biz: '사업1', title: '주간회의', done: false, undone: false });
  assert.strictEqual(p('[A사] 통화', '업무').biz, '');
  assert.strictEqual(p('✅ [A사/X] 견적', '할일').done, true);
  assert.strictEqual(p('[A사/X] 견적', '개인').title, '[A사/X] 견적');
});

const errors = rec().length && T.ss.getSheetByName('로그').getRange('B2:C200').getValues().filter(r => /오류/.test(r[0]));
if (errors.length) console.log('\n로그의 오류 항목:\n' + errors.map(r => '  - ' + r[0] + ': ' + r[1]).join('\n'));
console.log(`\n${passed}개 시나리오 통과`);

const logRows = T.ss.getSheetByName('로그').getRange('B2:C300').getValues().filter(r => r[0]);
const deferred = logRows.filter(r => /미룸|충돌|잠금/.test(r[1] + r[0]));
if (deferred.length) console.log('참고 로그:\n' + deferred.map(r => '  - ' + r[0] + ': ' + r[1]).join('\n'));

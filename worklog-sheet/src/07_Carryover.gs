/**
 * 자정 작업 (00시대): 미완료 이월 → 반복 일정 새 회차 가져오기 → 캘린더 반영
 *
 * 이월 규칙
 * - 지난 날짜의 '예정' 행: 원래 행은 '이월됨'(캘린더에서 내려감), 오늘 날짜로 새 행을 만든다.
 *   · 작업/메모: 시간 그대로
 *   · 미팅/통화: 시간 없이 '재일정 필요'로 (시간을 정해 '예정'으로 바꾸면 캘린더에 올라감)
 * - '재일정 필요' 행: 날짜만 오늘로 옮기고 이월 횟수 +1
 * - [개인일정]: 이월하지 않고 지난 일정은 '완료'
 * - '보류'는 그대로 둔다
 */
function nightly() {
  if (isRetired_()) {
    if (!retiredSyncActive_()) retireTriggers_();
    return;
  }
  withLock_(function () {
    pullCalendars_(false);
    carryOver_();
    pullCalendars_(true);
    processAllNextActions_();
    pushToCalendars_(false);
  }, 120000);
}

function carryOver_() {
  const data = readRecords_();
  const sh = data.sheet;
  const today = todayStr_();
  const now = new Date();
  const newRows = [];
  let carried = 0;

  data.list.forEach(function (rec) {
    const v = rec.v;
    if (!v[R.DATE] || v[R.DATE] >= today) return;
    const st = v[R.STATUS];

    if (v[R.CUST] === PERSONAL) {
      if (st === STATUS.PLANNED) {
        const nv = v.slice();
        nv[R.STATUS] = STATUS.DONE;
        nv[R.MODIFIED] = now;
        writeRecord_(sh, rec, nv);
      }
      return;
    }

    if (st === STATUS.RESCHEDULE) {
      const nv = v.slice();
      nv[R.DATE] = today;
      nv[R.CARRY] = (Number(v[R.CARRY]) || 0) + 1;
      nv[R.MODIFIED] = now;
      writeRecord_(sh, rec, nv);
      carried++;
      return;
    }

    if (st !== STATUS.PLANNED) return;

    const copy = v.slice();
    copy[R.ID] = newId_();
    copy[R.EVENT_ID] = '';
    copy[R.SYNCED] = '';
    copy[R.CARRY_FROM] = v[R.ID];
    copy[R.CARRY] = (Number(v[R.CARRY]) || 0) + 1;
    copy[R.DATE] = today;
    copy[R.CREATED] = now;
    copy[R.MODIFIED] = now;
    // 다음 액션은 이미 별도 작업 행으로 존재하므로 복사본에는 남기지 않는다
    copy[R.NEXT] = '';
    copy[R.NEXT_DUE] = '';
    if (v[R.TYPE] === '미팅' || v[R.TYPE] === '통화') {
      copy[R.START] = '';
      copy[R.END] = '';
      copy[R.DAYS] = 0;
      copy[R.STATUS] = STATUS.RESCHEDULE;
    } else {
      copy[R.STATUS] = STATUS.PLANNED;
    }
    const nv = v.slice();
    nv[R.STATUS] = STATUS.CARRIED;
    nv[R.MODIFIED] = now;
    if (writeRecord_(sh, rec, nv)) {
      newRows.push(copy);
      carried++;
    }
  });

  if (newRows.length) appendRecords_(sh, newRows);
  if (carried) log_('이월', carried + '건을 오늘(' + today + ')로 이월', '');
}

/** 브리핑의 [완료 처리]: 원래 행을 완료로, 이월된 행은 지운다 */
function completeCarried_(origId, newId) {
  return withLock_(function () {
    const data = readRecords_();
    const orig = data.byId[origId];
    if (!orig) return '원래 기록을 찾지 못했습니다. 이미 지워졌을 수 있습니다.';
    const ov = orig.v.slice();
    ov[R.STATUS] = STATUS.DONE;
    ov[R.MODIFIED] = new Date();
    writeRecord_(data.sheet, orig, ov);
    const copy = newId && data.byId[newId];
    if (copy && copy.v[R.CARRY_FROM] === origId) {
      const idNow = data.sheet.getRange(copy.r, R.ID + 1).getValue();
      if (String(idNow) === newId) data.sheet.deleteRow(copy.r);
    }
    pushToCalendars_(false);
    return '완료 처리했습니다: ' + (ov[R.TITLE] || ov[R.DATE]);
  }, 30000) || '다른 작업이 실행 중입니다. 잠시 후 다시 눌러 주세요.';
}

/** 아침 브리핑 · 주간 리포트 · 메일 버튼(웹앱) */

function briefingTrigger() {
  if (isRetired_()) return;
  const day = new Date().getDay();
  if (day === 0 || day === 6) return;
  sendBriefing();
}

function weeklyReportTrigger() {
  if (isRetired_()) return;
  sendWeeklyReport();
}

function mailTo_() {
  return setting_('브리핑 메일 주소', Session.getEffectiveUser().getEmail());
}

function webAppUrl_() {
  const s = setting_('웹앱 URL', '');
  if (s) return s;
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (e) {
    return '';
  }
}

function sendBriefing() {
  const data = readRecords_();
  const today = todayStr_();
  const soon = addDays_(today, numSetting_('마감 임박(일)', 3));
  const warnCarry = numSetting_('이월 경고 횟수', 3);
  const url = webAppUrl_();
  const token = setting_('웹앱 토큰', '');
  const list = data.list.map(function (r) { return r.v; });
  const active = function (v) { return v[R.STATUS] !== STATUS.CANCELLED && v[R.STATUS] !== STATUS.CARRIED; };

  const todays = list.filter(function (v) { return v[R.DATE] === today && active(v) && v[R.STATUS] !== STATUS.RESCHEDULE; })
    .sort(byTime_);
  const carried = list.filter(function (v) {
    return v[R.CARRY_FROM] && v[R.CREATED] instanceof Date && fmtDate_(v[R.CREATED]) === today && v[R.CUST] !== PERSONAL;
  });
  const dueSoon = list.filter(function (v) {
    return v[R.TYPE] === '작업' && v[R.STATUS] === STATUS.PLANNED && v[R.DATE] > today && v[R.DATE] <= soon;
  }).sort(byDate_);
  const resched = list.filter(function (v) { return v[R.STATUS] === STATUS.RESCHEDULE; });
  const stuck = list.filter(function (v) {
    return v[R.CARRY] >= warnCarry && (v[R.STATUS] === STATUS.PLANNED || v[R.STATUS] === STATUS.RESCHEDULE);
  });
  const unclassified = list.filter(function (v) { return v[R.CUST] === UNCLASSIFIED && active(v); }).length;
  const clients = clientAlerts_();

  const h = [];
  h.push(mailHead_('☀️ ' + today + ' (' + weekdayKo_(today) + ') 업무 브리핑'));

  h.push(section_('오늘 일정', todays.length ? table_(['시간', '고객사', '제목', '유형'], todays.map(function (v) {
    return [timeLabel_(v), custLabel_(v), v[R.TITLE], v[R.TYPE]];
  })) : empty_('오늘 일정이 없습니다.')));

  if (carried.length) {
    h.push(section_('어젯밤 이월된 항목 (' + carried.length + ')',
      '<p style="margin:0 0 8px;color:#5f6368">이미 끝낸 일이면 [완료 처리]를 누르세요. 원래 기록은 완료로 바뀌고 이월된 행은 지워집니다.</p>' +
      table_(['원래 날짜', '고객사', '제목', '상태', ''], carried.map(function (v) {
        const orig = data.byId[v[R.CARRY_FROM]];
        const od = orig ? orig.v[R.DATE] : '';
        const btn = url
          ? '<a href="' + url + '?a=done&o=' + v[R.CARRY_FROM] + '&n=' + v[R.ID] + '&t=' + encodeURIComponent(token) +
            '" style="background:#1a73e8;color:#fff;padding:4px 10px;border-radius:4px;text-decoration:none;font-size:12px">완료 처리</a>'
          : '<span style="color:#9aa0a6;font-size:12px">웹앱 배포 필요</span>';
        return [od, custLabel_(v), v[R.TITLE] + (v[R.CARRY] >= warnCarry ? ' ⚠️' + v[R.CARRY] + '회' : ''), v[R.STATUS], { html: btn }];
      }))));
  }

  if (dueSoon.length) {
    h.push(section_('곧 마감되는 할 일', table_(['기한', '고객사', '할 일'], dueSoon.map(function (v) {
      return [v[R.DATE] + ' (' + weekdayKo_(v[R.DATE]) + ')', custLabel_(v), v[R.TITLE]];
    }))));
  }
  if (resched.length) {
    h.push(section_('시간을 다시 정해야 하는 미팅·통화', table_(['고객사', '제목', '이월'], resched.map(function (v) {
      return [custLabel_(v), v[R.TITLE], v[R.CARRY] + '회'];
    }))));
  }
  if (stuck.length) {
    h.push(section_('⚠️ ' + warnCarry + '번 넘게 밀린 항목', table_(['고객사', '제목', '이월'], stuck.map(function (v) {
      return [custLabel_(v), v[R.TITLE], v[R.CARRY] + '회'];
    }))));
  }
  if (clients.gap.length) {
    h.push(section_('연락이 뜸한 고객사', table_(['고객사', '마지막 연락', '공백'], clients.gap.map(function (c) {
      return [c.cust, c.last || '기록 없음', c.gap + '일 (기준 ' + c.limit + '일)'];
    }))));
  }
  if (clients.contract.length) {
    h.push(section_('계약 만료 임박', table_(['고객사', '계약 종료', '남은 기간'], clients.contract.map(function (c) {
      return [c.cust, c.end, c.left + '일'];
    }))));
  }
  if (unclassified) {
    h.push(section_('미분류', '<p style="margin:0">고객사가 정해지지 않은 일정이 ' + unclassified + '건 있습니다. 기록 시트에서 고객사를 골라 주세요.</p>'));
  }
  h.push(mailFoot_());

  MailApp.sendEmail({ to: mailTo_(), subject: '[업무 브리핑] ' + today + ' (' + weekdayKo_(today) + ')', htmlBody: h.join('') });
}

function sendWeeklyReport() {
  const today = todayStr_();
  const p = today.split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const monday = addDays_(today, -((dow + 6) % 7));
  const nextWeekEnd = addDays_(today, 7);
  let list = readRecords_().list.map(function (r) { return r.v; });
  if (monday < yearStart_(fileYear_())) list = list.concat(readPrevYearRecords_().map(function (r) { return r.v; }));

  const byCust = {};
  list.forEach(function (v) {
    if (v[R.CUST] === PERSONAL || !v[R.CUST]) return;
    if (v[R.STATUS] === STATUS.CANCELLED || v[R.STATUS] === STATUS.CARRIED) return;
    const c = byCust[v[R.CUST]] || (byCust[v[R.CUST]] = { done: [], next: [], minutes: 0, types: {} });
    if (v[R.DATE] >= monday && v[R.DATE] <= today) {
      c.done.push(v);
      c.minutes += durationMinutes_(v);
      c.types[v[R.TYPE] || '기타'] = (c.types[v[R.TYPE] || '기타'] || 0) + 1;
    } else if (v[R.DATE] > today && v[R.DATE] <= nextWeekEnd && v[R.STATUS] === STATUS.PLANNED) {
      c.next.push(v);
    }
  });
  const custs = Object.keys(byCust).filter(function (c) { return byCust[c].done.length || byCust[c].next.length; })
    .sort(function (a, b) { return byCust[b].minutes - byCust[a].minutes; });

  const h = [mailHead_('📊 주간 리포트 ' + monday + ' ~ ' + today)];
  const totalMin = custs.reduce(function (s, c) { return s + byCust[c].minutes; }, 0);
  h.push(section_('요약', table_(['고객사', '활동', '시간', '유형'], custs.map(function (c) {
    const x = byCust[c];
    return [c, x.done.length + '건', hours_(x.minutes), Object.keys(x.types).map(function (t) { return t + ' ' + x.types[t]; }).join(', ')];
  }).concat([[{ html: '<b>합계</b>' }, '', { html: '<b>' + hours_(totalMin) + '</b>' }, '']]))));

  custs.forEach(function (c) {
    const x = byCust[c];
    let body = '';
    if (x.done.length) {
      body += table_(['날짜', '유형', '제목', '상태'], x.done.sort(byDate_).map(function (v) {
        return [v[R.DATE].slice(5) + ' ' + weekdayKo_(v[R.DATE]), v[R.TYPE], v[R.TITLE], v[R.STATUS]];
      }));
    }
    if (x.next.length) {
      body += '<p style="margin:10px 0 4px;color:#5f6368">다음 주 예정</p>' +
        table_(['날짜', '유형', '제목'], x.next.sort(byDate_).map(function (v) {
          return [v[R.DATE].slice(5) + ' ' + weekdayKo_(v[R.DATE]), v[R.TYPE], v[R.TITLE]];
        }));
    }
    h.push(section_(c, body));
  });
  if (!custs.length) h.push(section_('이번 주', empty_('이번 주 기록이 없습니다.')));
  h.push(mailFoot_());
  MailApp.sendEmail({ to: mailTo_(), subject: '[주간 리포트] ' + monday + ' ~ ' + today, htmlBody: h.join('') });
}

// ---------- 메일 버튼 처리 (웹앱) ----------

function doGet(e) {
  const p = (e && e.parameter) || {};
  let text;
  if (!p.t || p.t !== String(setting_('웹앱 토큰', ''))) {
    text = '링크가 올바르지 않거나 만료되었습니다.';
  } else if (p.a === 'done' && p.o) {
    text = completeCarried_(p.o, p.n || '');
  } else {
    text = '알 수 없는 요청입니다.';
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:40px;text-align:center;font-size:18px">' + escapeHtml_(text) +
    '<p style="color:#5f6368;font-size:14px">이 창은 닫아도 됩니다.</p></div>').setTitle(APP_NAME);
}

// ---------- 메일 HTML 조각 ----------

function mailHead_(title) {
  return '<div style="font-family:\'Noto Sans KR\',Arial,sans-serif;max-width:720px;color:#202124">' +
    '<h2 style="font-size:20px;margin:0 0 16px">' + escapeHtml_(title) + '</h2>';
}

function mailFoot_() {
  return '<p style="color:#9aa0a6;font-size:12px;margin-top:24px">업무기록 시트에서 자동 발송: ' +
    '<a href="' + ss_().getUrl() + '">시트 열기</a></p></div>';
}

function section_(title, body) {
  return '<div style="margin:0 0 20px"><h3 style="font-size:15px;margin:0 0 8px;padding-bottom:4px;border-bottom:2px solid #e8eaed">' +
    escapeHtml_(title) + '</h3>' + body + '</div>';
}

function table_(headers, rows) {
  const th = headers.map(function (x) {
    return '<th style="text-align:left;padding:6px 8px;background:#f1f3f4;font-weight:600;font-size:12px">' + escapeHtml_(x) + '</th>';
  }).join('');
  const tr = rows.map(function (r) {
    return '<tr>' + r.map(function (c) {
      const inner = c && c.html !== undefined ? c.html : escapeHtml_(c);
      return '<td style="padding:6px 8px;border-bottom:1px solid #e8eaed;font-size:13px;vertical-align:top">' + inner + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<table style="border-collapse:collapse;width:100%">' + '<tr>' + th + '</tr>' + tr + '</table>';
}

function empty_(text) {
  return '<p style="margin:0;color:#5f6368">' + escapeHtml_(text) + '</p>';
}

function timeLabel_(v) {
  if (!v[R.START]) return '종일';
  return v[R.START] + (v[R.END] ? '~' + v[R.END] : '');
}

function custLabel_(v) {
  if (v[R.CUST] === PERSONAL) return '🏠 개인';
  return v[R.CUST] + (v[R.BIZ] && v[R.BIZ] !== NONE ? ' / ' + v[R.BIZ] : '');
}

function hours_(min) {
  return (Math.round(min / 6) / 10) + '시간';
}

function byTime_(a, b) {
  const x = a[R.START] || '';
  const y = b[R.START] || '';
  return x < y ? -1 : x > y ? 1 : 0;
}

function byDate_(a, b) {
  const x = a[R.DATE] + (a[R.START] || '');
  const y = b[R.DATE] + (b[R.START] || '');
  return x < y ? -1 : x > y ? 1 : 0;
}

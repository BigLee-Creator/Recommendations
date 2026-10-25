// 업무기록 시트 — Apps Script (src/*.gs 를 build.sh 로 합친 파일입니다. 직접 고치지 말고 src 를 고치세요.)

// ===== 00_Config.gs =====
/**
 * 업무기록 시트 — 설정값과 공용 상수
 *
 * 고객사 > 사업 > 업무 단위로 하루하루 일정·노트를 기록하고
 * 구글 캘린더(업무/할 일/개인)·구글 주소록과 양방향 동기화한다.
 */

const TZ = 'Asia/Seoul';
const APP_NAME = '업무기록';

const SHEET = {
  GUIDE: '📖 사용법',
  RECORD: '기록',
  DASHBOARD: '대시보드',
  MONTHLY: '월간',
  SEARCH: '검색',
  ANALYSIS: '분석',
  CLIENT: '고객사정보',
  MASTER: '마스터',
  CONTACT: '연락처',
  SETTINGS: '설정',
  LOG: '로그',
  LISTS: '_목록',
  INDEX: '_연동',
  STATE: '_상태',
};

// 기록 시트 열 (0부터). A~P는 보이는 열, Q~Y는 숨김 열.
const R = {
  DATE: 0, START: 1, END: 2, CUST: 3, BIZ: 4, TASK: 5, TYPE: 6, TITLE: 7,
  NOTE: 8, CONTACT: 9, STATUS: 10, NEXT: 11, NEXT_DUE: 12, LINK: 13,
  CARRY: 14, SYNC: 15,
  ID: 16, EVENT_ID: 17, CAL: 18, PARENT: 19, CARRY_FROM: 20, DAYS: 21,
  CREATED: 22, MODIFIED: 23, SYNCED: 24,
};
const RECORD_HEADERS = [
  '날짜', '시작', '종료', '고객사', '사업', '업무', '유형', '제목',
  '내용·노트', '담당자', '상태', '다음 액션', '다음 액션 기한', '첨부 링크',
  '이월 횟수', '캘린더 연동',
  'ID', '이벤트ID', '캘린더', '연결ID', '이월원본ID', '기간(일)',
  '입력시각', '수정시각', '동기화시각',
];
const RECORD_COLS = RECORD_HEADERS.length;
const RECORD_VISIBLE = 16;

// 연락처 시트 열
const C = {
  CUST: 0, NAME: 1, TITLE: 2, PHONE: 3, EMAIL: 4, MEMO: 5, INACTIVE: 6,
  RES: 7, MODIFIED: 8, SYNCED: 9,
};
const CONTACT_HEADERS = [
  '고객사', '이름', '부서·직함', '전화', '이메일', '메모', '비활성',
  'resourceName', '수정시각', '동기화시각',
];

// 마스터 시트 열
const M = { CUST: 0, BIZ: 1, TASK: 2, INACTIVE: 3, MEMO: 4 };
const MASTER_HEADERS = ['고객사', '사업', '업무', '비활성', '비고'];

// 고객사정보 시트 열
const K = { CUST: 0, START: 1, END: 2, GAP_LIMIT: 3, LAST_MEET: 4, LAST_MAIL: 5, GAP: 6, MEMO: 7 };
const CLIENT_HEADERS = ['고객사', '계약 시작', '계약 종료', '공백 기준(일)', '마지막 미팅·통화', '마지막 메일', '공백 일수', '메모'];

const PERSONAL = '[개인일정]';
const UNCLASSIFIED = '미분류';
const NONE = '-';

const TYPES = ['미팅', '통화', '작업', '메모'];
const STATUS = {
  PLANNED: '예정', DONE: '완료', HOLD: '보류', CANCELLED: '취소',
  RESCHEDULE: '재일정 필요', CARRIED: '이월됨',
};
const STATUSES = ['예정', '완료', '보류', '취소', '재일정 필요', '이월됨'];
// 캘린더에 올리지 않는 상태
const NO_SYNC_STATUSES = ['취소', '이월됨', '재일정 필요'];
// 연락으로 집계하는 유형
const CONTACT_TYPES = ['미팅', '통화'];

const CAL = { WORK: '업무', TODO: '할일', PERSONAL: '개인' };

// 유형별 캘린더 색 (Google Calendar colorId)
const TYPE_COLOR = { '미팅': '9', '통화': '10', '작업': '5', '메모': '8' };

const MEETING_TEMPLATE = '참석자: \n논의: \n결정: \n할 일: ';
const DESC_MARK = '— 업무기록 —';
const EXCLUDE_DESC = '개인 캘린더 일정 중 제목에 이 단어가 들어가면 시트에 넣지 않음 (쉼표로 여러 개, 비우면 제외 안 함)';

// 설정 시트 기본값: [항목, 값, 설명]
const SETTING_DEFAULTS = [
  ['연도', '', '이 파일이 담당하는 연도'],
  ['업무 캘린더 ID', '', '초기 설정 때 자동 생성'],
  ['할 일 캘린더 ID', '', '초기 설정 때 자동 생성'],
  ['개인 캘린더 ID', '', '기본 캘린더(내 Gmail 주소)'],
  ['브리핑 메일 주소', '', '브리핑·주간 리포트를 받을 주소'],
  ['브리핑 시각', 8, '평일 이 시각 전후(±15분)에 발송'],
  ['주간 리포트 시각', 17, '금요일 이 시각 전후에 발송'],
  ['연락 공백 기본(일)', 30, '고객사정보에 기준이 비어 있으면 이 값 사용'],
  ['마감 임박(일)', 3, '이 일수 이내면 노란색'],
  ['계약 만료 알림(일)', 60, '계약 종료가 이 일수 이내면 알림'],
  ['반복 일정 가져오기(일)', 28, '앞으로 이 기간 안의 캘린더 일정만 행으로 가져옴'],
  ['시간 일정 알림(분)', 60, '업무·할 일 캘린더의 시간 일정 알림'],
  ['이월 경고 횟수', 3, '이 횟수 이상 이월되면 표시'],
  ['대량 삭제 기준', 20, '한 번에 이보다 많은 일정이 지워지려 하면 멈추고 확인'],
  ['제외 키워드', '생일', EXCLUDE_DESC],
  ['이전 연도 파일 ID', '', ''],
  ['다음 연도 파일 ID', '', '새 연도 파일을 만들면 자동 입력'],
  ['웹앱 URL', '', '브리핑 메일의 [완료 처리] 버튼용. 배포 후 자동 감지'],
  ['웹앱 토큰', '', '자동 생성. 바꾸면 이전 메일의 버튼은 동작하지 않음'],
];

// ===== 01_Utils.gs =====
/** 날짜·설정·상태·로그 공용 함수 */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  return ss_().getSheetByName(name);
}

// ---------- 날짜 / 시간 (문자열 'yyyy-MM-dd', 'HH:mm' 기준) ----------

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function fmtDate_(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

function fmtTime_(d) {
  return Utilities.formatDate(d, TZ, 'HH:mm');
}

function todayStr_() {
  return fmtDate_(new Date());
}

/** 'yyyy-MM-dd'에 n일 더하기 */
function addDays_(str, n) {
  const p = str.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/** b - a (일) */
function diffDays_(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

/** 표시값/문자열/Date에서 'yyyy-MM-dd' 추출. 실패하면 '' */
function parseDate_(v) {
  if (v instanceof Date && !isNaN(v)) return fmtDate_(v);
  const m = String(v || '').match(/(\d{4})\s*[-.\/]\s*(\d{1,2})\s*[-.\/]\s*(\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + pad2_(Number(m[2])) + '-' + pad2_(Number(m[3]));
}

/** 표시값에서 'HH:mm' 추출. 실패하면 '' */
function parseTime_(v) {
  const s = String(v || '');
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return '';
  let h = Number(m[1]);
  if (/오후|PM/i.test(s) && h < 12) h += 12;
  if (/오전|AM/i.test(s) && h === 12) h = 0;
  if (h > 24) return '';
  return pad2_(h) + ':' + m[2];
}

function timeToMinutes_(t) {
  const p = t.split(':').map(Number);
  return p[0] * 60 + p[1];
}

function minutesToTime_(min) {
  return pad2_(Math.floor(min / 60) % 24) + ':' + pad2_(min % 60);
}

/** 'yyyy-MM-dd' → 시트에 쓸 Date (서울 자정) */
function dateToCell_(str) {
  if (!str) return '';
  const p = str.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

/** 'HH:mm' → 시트에 쓸 하루 비율 값 */
function timeToCell_(t) {
  if (!t) return '';
  return timeToMinutes_(t) / 1440;
}

/** RFC3339 'yyyy-MM-ddTHH:mm:00+09:00' */
function isoSeoul_(dateStr, timeStr) {
  return dateStr + 'T' + timeStr + ':00+09:00';
}

function yearStart_(year) {
  return year + '-01-01';
}

function weekdayKo_(dateStr) {
  const p = dateStr.split('-').map(Number);
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
}

function toMillis_(v) {
  if (v instanceof Date) return v.getTime();
  if (!v) return 0;
  const t = Date.parse(v);
  return isNaN(t) ? 0 : t;
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

// ---------- 설정 시트 ----------

let SETTINGS_CACHE_ = null;

function settings_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  const sh = sheet_(SHEET.SETTINGS);
  const map = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0]) map[String(r[0]).trim()] = r[1];
    });
  }
  SETTINGS_CACHE_ = map;
  return map;
}

function setting_(key, fallback) {
  const v = settings_()[key];
  return v === '' || v === undefined || v === null ? fallback : v;
}

function numSetting_(key, fallback) {
  const n = Number(setting_(key, fallback));
  return isNaN(n) ? fallback : n;
}

function setSetting_(key, value) {
  const sh = sheet_(SHEET.SETTINGS);
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  const i = keys.indexOf(key);
  if (i >= 0) sh.getRange(i + 2, 2).setValue(value);
  else sh.appendRow([key, value, '']);
  SETTINGS_CACHE_ = null;
}

function fileYear_() {
  return Number(setting_('연도', new Date().getFullYear()));
}

/** 다음 연도 파일이 생긴 뒤의 이전 연도 파일인가 */
function isRetired_() {
  return !!setting_('다음 연도 파일 ID', '');
}

/** 은퇴한 파일의 캘린더 동기화는 다음 해 1월 말까지만 */
function retiredSyncActive_() {
  return todayStr_() <= (fileYear_() + 1) + '-01-31';
}

// ---------- 내부 상태 (숨김 시트: 동기화 시각 등) ----------

function state_(key) {
  const sh = sheet_(SHEET.STATE);
  if (!sh || sh.getLastRow() < 1) return '';
  const vals = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  for (let i = 0; i < vals.length; i++) if (vals[i][0] === key) return String(vals[i][1]);
  return '';
}

function setState_(key, value) {
  const sh = sheet_(SHEET.STATE);
  const last = sh.getLastRow();
  if (last > 0) {
    const keys = sh.getRange(1, 1, last, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) {
        sh.getRange(i + 1, 2).setNumberFormat('@').setValue(String(value));
        return;
      }
    }
  }
  sh.getRange(last + 1, 1, 1, 2).setNumberFormat('@').setValues([[key, String(value)]]);
}

// ---------- 로그 ----------

function log_(kind, msg, id) {
  const sh = sheet_(SHEET.LOG);
  if (!sh) return;
  sh.insertRowAfter(1);
  sh.getRange(2, 1, 1, 4).setValues([[new Date(), kind, msg, id || '']]);
  if (sh.getMaxRows() > 2100) sh.deleteRows(2001, sh.getMaxRows() - 2000);
}

// ---------- 잠금 ----------

function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 30000)) {
    log_('잠금', '다른 작업이 실행 중이라 건너뜀', '');
    return null;
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 02_Records.gs =====
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

// ===== 03_Master.gs =====
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

// ===== 04_CalendarSync.gs =====
/**
 * 구글 캘린더 양방향 동기화
 *
 * - 업무 캘린더: 고객사 업무 일정. 제목은 "[고객사/사업] 제목"
 * - 할 일 캘린더: '다음 액션'으로 생긴 작업. 제목은 "☐ [고객사] 제목" / 완료 시 "✅ ..."
 * - 개인 캘린더: 기본 캘린더. 시트에서는 고객사가 [개인일정]
 *
 * 행과 일정은 숨김 열(이벤트ID, 캘린더)로 연결한다.
 * 양쪽이 모두 바뀌었으면 나중에 바뀐 쪽이 이긴다 (로그에 기록).
 */

function calendarIds_() {
  return {
    '업무': setting_('업무 캘린더 ID', ''),
    '할일': setting_('할 일 캘린더 ID', ''),
    '개인': setting_('개인 캘린더 ID', 'primary'),
  };
}

/** 10분마다 실행: 캘린더 → 시트, 다음 액션 처리, 시트 → 캘린더 */
function syncAll() {
  if (isRetired_() && !retiredSyncActive_()) return retireTriggers_();
  withLock_(function () {
    pullCalendars_(false);
    processAllNextActions_();
    pushToCalendars_(false);
    setState_('lastSyncAt', new Date().toISOString());
  });
}

/** 메뉴: 지금 동기화 */
function syncNow() {
  syncAll();
  ss_().toast('캘린더 동기화를 마쳤습니다.', APP_NAME, 5);
}

/** 메뉴: 대량 삭제 확인 후 동기화 */
function syncAllowMassDelete() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('대량 삭제 승인',
    '시트에서 지워진 행의 캘린더 일정을 기준과 상관없이 모두 지웁니다. 계속할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  withLock_(function () { pushToCalendars_(true); });
  ss_().toast('동기화를 마쳤습니다.', APP_NAME, 5);
}

// ===================== 캘린더 → 시트 =====================

/**
 * @param {boolean} windowPass true면 오늘~N일 범위를 전부 다시 훑는다(반복 일정 새 회차 채우기용)
 */
function pullCalendars_(windowPass) {
  const ids = calendarIds_();
  const data = readRecords_();
  const ctx = {
    data: data,
    today: todayStr_(),
    year: fileYear_(),
    horizon: addDays_(todayStr_(), numSetting_('반복 일정 가져오기(일)', 28)),
    newRows: [],
    newKeys: {},
    myFile: ss_().getId(),
    exclude: excludeKeywords_(),
  };
  [CAL.WORK, CAL.TODO, CAL.PERSONAL].forEach(function (key) {
    const calId = ids[key];
    if (!calId) return;
    try {
      const events = windowPass ? listWindow_(calId, ctx) : listChanges_(calId, key, ctx);
      events.forEach(function (ev) { processIncoming_(ev, key, ctx); });
    } catch (e) {
      log_('동기화 오류', key + ' 캘린더 읽기 실패: ' + e.message, '');
    }
  });
  if (ctx.newRows.length) {
    appendRecords_(data.sheet, ctx.newRows);
    log_('가져오기', '캘린더에서 새 일정 ' + ctx.newRows.length + '건을 가져옴', '');
  }
  removeExcludedRows_(ctx.exclude);
}

/** 설정 '제외 키워드' (쉼표 구분). 설정 행이 없으면 '생일'로 만들어 둔다 */
function excludeKeywords_() {
  const map = settings_();
  if (!Object.prototype.hasOwnProperty.call(map, '제외 키워드')) {
    const sh = sheet_(SHEET.SETTINGS);
    sh.getRange(sh.getLastRow() + 1, 1, 1, 3).setValues([['제외 키워드', '생일', EXCLUDE_DESC]]);
    SETTINGS_CACHE_ = null;
    return ['생일'];
  }
  return String(map['제외 키워드'] || '').split(',')
    .map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}

function isExcluded_(title, keywords) {
  const t = String(title || '').toLowerCase();
  return keywords.some(function (k) { return t.indexOf(k) >= 0; });
}

/**
 * 이미 시트에 들어온 [개인일정] 중 제외 키워드가 든 행을 시트에서만 뺀다.
 * 캘린더 일정은 그대로 두기 위해 _연동 목록에서도 함께 지운다 (지운 행으로 오인해 일정을 삭제하지 않도록).
 */
function removeExcludedRows_(keywords) {
  if (!keywords.length) return;
  const data = readRecords_();
  const targets = data.list.filter(function (rec) {
    return rec.v[R.CUST] === PERSONAL && rec.v[R.EVENT_ID] && isExcluded_(rec.v[R.TITLE], keywords);
  });
  if (!targets.length) return;
  const removed = {};
  targets.sort(function (a, b) { return b.r - a.r; }).forEach(function (rec) {
    if (String(data.sheet.getRange(rec.r, R.ID + 1).getValue()) !== rec.v[R.ID]) return;
    data.sheet.deleteRow(rec.r);
    removed[rec.v[R.ID]] = true;
  });
  const idx = sheet_(SHEET.INDEX);
  const old = idx.getLastRow() > 1 ? idx.getRange(2, 1, idx.getLastRow() - 1, 3).getValues() : [];
  writeIndex_(idx, old.filter(function (r) { return !removed[r[0]]; }));
  log_('제외', '제외 키워드가 든 개인 일정 ' + Object.keys(removed).length + '건을 시트에서 뺌 (캘린더에는 그대로)', '');
}

/** 마지막 동기화 이후 바뀐 일정 (처음이거나 오래됐으면 전체) */
function listChanges_(calId, key, ctx) {
  const stateKey = 'pulledAt:' + key;
  const last = state_(stateKey);
  const startedAt = new Date();
  let events;
  const tooOld = !last || (startedAt.getTime() - toMillis_(last)) > 7 * 86400000;
  if (tooOld) {
    events = listEvents_(calId, {
      timeMin: isoSeoul_(yearStart_(ctx.year), '00:00'),
      timeMax: isoSeoul_(addDays_(ctx.horizon, 1), '00:00'),
      singleEvents: true,
      showDeleted: false,
    });
  } else {
    try {
      events = listEvents_(calId, {
        updatedMin: new Date(toMillis_(last) - 120000).toISOString(),
        singleEvents: true,
        showDeleted: true,
      });
    } catch (e) {
      // updatedMin이 너무 오래됐다는 오류 등 → 전체 다시 읽기
      setState_(stateKey, '');
      return listChanges_(calId, key, ctx);
    }
  }
  setState_(stateKey, startedAt.toISOString());
  return events;
}

function listWindow_(calId, ctx) {
  return listEvents_(calId, {
    timeMin: isoSeoul_(ctx.today, '00:00'),
    timeMax: isoSeoul_(addDays_(ctx.horizon, 1), '00:00'),
    singleEvents: true,
    showDeleted: false,
  });
}

function listEvents_(calId, opts) {
  const out = [];
  let token = null;
  let guard = 0;
  do {
    const args = Object.assign({ maxResults: 2500 }, opts);
    if (token) args.pageToken = token;
    const res = Calendar.Events.list(calId, args);
    (res.items || []).forEach(function (e) { out.push(e); });
    token = res.nextPageToken;
  } while (token && ++guard < 40);
  return out;
}

function processIncoming_(ev, key, ctx) {
  if (ev.eventType && ['default', 'fromGmail'].indexOf(ev.eventType) < 0) return;
  const data = ctx.data;
  let rec = data.byEvent[key + '|' + ev.id];
  const priv = (ev.extendedProperties && ev.extendedProperties.private) || {};
  if (!rec && priv.wlRowId && data.byId[priv.wlRowId]) {
    rec = data.byId[priv.wlRowId];
    if (rec.v[R.EVENT_ID] && rec.v[R.EVENT_ID] !== ev.id) rec = null;
  }

  const declined = (ev.attendees || []).some(function (a) { return a.self && a.responseStatus === 'declined'; });
  const gone = ev.status === 'cancelled' || declined;

  if (rec) {
    const v = rec.v.slice();
    if (gone) {
      if (v[R.STATUS] === STATUS.CANCELLED && !v[R.EVENT_ID]) return;
      v[R.STATUS] = STATUS.CANCELLED;
      v[R.EVENT_ID] = '';
      v[R.SYNC] = false;
      v[R.SYNCED] = new Date().toISOString();
      if (writeRecord_(data.sheet, rec, v)) log_('캘린더→시트', '캘린더에서 지워져 취소 처리: ' + v[R.TITLE], v[R.ID]);
      return;
    }
    const evTime = toMillis_(ev.updated);
    const synced = toMillis_(v[R.SYNCED]);
    if (ev.updated === v[R.SYNCED] || evTime <= synced + 1000) return;
    const localChanged = isModified_(v);
    if (localChanged && toMillis_(v[R.MODIFIED]) >= evTime) {
      log_('충돌', '시트와 캘린더가 모두 바뀜 → 나중에 고친 시트 내용으로 덮어씀', v[R.ID]);
      return;
    }
    applyEvent_(v, ev, key, false);
    v[R.EVENT_ID] = ev.id;
    v[R.CAL] = key;
    v[R.SYNCED] = ev.updated;
    if (writeRecord_(data.sheet, rec, v)) {
      if (localChanged) log_('충돌', '시트와 캘린더가 모두 바뀜 → 나중에 고친 캘린더 내용으로 덮어씀', v[R.ID]);
    }
    return;
  }

  // 시트에 없는 일정
  if (gone) return;
  if (priv.wlRowId) return; // 시트에서 지운 행(삭제 대기) 또는 다른 연도 파일의 행
  if (key === CAL.PERSONAL && isExcluded_(ev.summary, ctx.exclude)) return;
  if (ctx.newKeys[key + '|' + ev.id]) return;
  const start = eventStart_(ev);
  if (!start.date) return;
  if (start.date < yearStart_(ctx.year)) return;
  if (isRetired_() && start.date >= yearStart_(ctx.year + 1)) return;
  if (start.date > ctx.horizon) return;

  const v = emptyRecord_();
  applyEvent_(v, ev, key, true);
  v[R.ID] = newId_();
  v[R.EVENT_ID] = ev.id;
  v[R.CAL] = key;
  v[R.SYNC] = true;
  v[R.CREATED] = new Date();
  v[R.SYNCED] = ev.updated;
  if (!v[R.STATUS]) v[R.STATUS] = v[R.DATE] < ctx.today ? STATUS.DONE : STATUS.PLANNED;
  ctx.newRows.push(v);
  ctx.newKeys[key + '|' + ev.id] = true;
}

/** 일정의 시작 날짜/시간 (서울 기준) */
function eventStart_(ev) {
  if (!ev.start) return {};
  if (ev.start.date) return { date: ev.start.date, time: '' };
  const d = new Date(ev.start.dateTime);
  return { date: fmtDate_(d), time: fmtTime_(d) };
}

/** 캘린더 일정 내용을 행 값에 반영 */
function applyEvent_(v, ev, key, isNew) {
  const start = eventStart_(ev);
  v[R.DATE] = start.date;
  if (ev.start.date) {
    v[R.START] = '';
    v[R.END] = '';
    v[R.DAYS] = Math.max(0, diffDays_(ev.start.date, ev.end.date) - 1);
  } else {
    const e = new Date(ev.end.dateTime);
    v[R.START] = start.time;
    v[R.END] = fmtTime_(e);
    v[R.DAYS] = Math.max(0, diffDays_(start.date, fmtDate_(e)));
  }

  const parsed = parseTitle_(ev.summary || '', key);
  v[R.TITLE] = parsed.title;
  if (key === CAL.PERSONAL) {
    v[R.CUST] = PERSONAL;
    v[R.BIZ] = v[R.BIZ] || NONE;
    v[R.TASK] = v[R.TASK] || NONE;
  } else if (parsed.cust) {
    if (parsed.cust !== v[R.CUST]) {
      v[R.CUST] = parsed.cust;
      v[R.BIZ] = parsed.biz || '';
      v[R.TASK] = '';
    } else if (parsed.biz) {
      v[R.BIZ] = parsed.biz;
    }
  } else if (isNew || !v[R.CUST] || v[R.CUST] === PERSONAL) {
    v[R.CUST] = UNCLASSIFIED;
  }
  if (key === CAL.TODO) {
    if (parsed.done) v[R.STATUS] = STATUS.DONE;
    else if (v[R.STATUS] === STATUS.DONE && parsed.undone) v[R.STATUS] = STATUS.PLANNED;
  }
  if (isNew) {
    v[R.TYPE] = key === CAL.TODO ? '작업' : (ev.start.date ? '작업' : '미팅');
  }
  v[R.NOTE] = parseDescription_(ev.description || '');
}

/**
 * "[고객사/사업] 제목" 형식 해석. 할 일 캘린더는 앞의 ☐ / ✅ 표시도 해석.
 */
function parseTitle_(summary, key) {
  let s = String(summary || '').trim();
  const out = { cust: '', biz: '', title: s, done: false, undone: false };
  if (key === CAL.PERSONAL) return out;
  const mark = s.match(/^(✅|✔️?|☑️?|☐|□)\s*/);
  if (mark) {
    out.done = /✅|✔|☑/.test(mark[1]);
    out.undone = !out.done;
    s = s.slice(mark[0].length);
  }
  const m = s.match(/^\[([^\]\/]+)(?:\/([^\]]+))?\]\s*(.*)$/);
  if (m) {
    out.cust = m[1].trim();
    out.biz = (m[2] || '').trim();
    out.title = m[3].trim();
  } else {
    out.title = s;
  }
  return out;
}

function parseDescription_(desc) {
  const s = String(desc || '');
  const i = s.indexOf(DESC_MARK);
  return (i >= 0 ? s.slice(0, i) : s).replace(/\s+$/, '');
}

// ===================== 시트 → 캘린더 =====================

function pushToCalendars_(allowMassDelete) {
  const ids = calendarIds_();
  const data = readRecords_();
  const sh = data.sheet;
  const reminderMin = numSetting_('시간 일정 알림(분)', 60);
  let pushed = 0;

  data.list.forEach(function (rec) {
    const v = rec.v;
    if (!v[R.ID]) return;
    const want = wantsSync_(v);
    const target = desiredCal_(v);
    try {
      if (!want) {
        if (v[R.EVENT_ID]) {
          removeEvent_(ids[v[R.CAL]], v[R.EVENT_ID]);
          v[R.EVENT_ID] = '';
          v[R.SYNCED] = new Date().toISOString();
          writeHidden_(sh, rec, [R.EVENT_ID, R.SYNCED]);
          pushed++;
        }
        return;
      }
      if (v[R.EVENT_ID] && v[R.CAL] !== target) {
        // 캘린더가 바뀜 (예: 고객사를 [개인일정]으로) → 옮겨 만들기
        removeEvent_(ids[v[R.CAL]], v[R.EVENT_ID]);
        v[R.EVENT_ID] = '';
      }
      if (!v[R.EVENT_ID]) {
        const res = Calendar.Events.insert(buildEvent_(v, target, reminderMin, true), ids[target]);
        v[R.EVENT_ID] = res.id;
        v[R.CAL] = target;
        v[R.SYNCED] = res.updated;
        writeHidden_(sh, rec, [R.EVENT_ID, R.CAL, R.SYNCED]);
        pushed++;
      } else if (isModified_(v)) {
        const res = Calendar.Events.patch(buildEvent_(v, target, reminderMin, false), ids[target], v[R.EVENT_ID]);
        v[R.SYNCED] = res.updated;
        writeHidden_(sh, rec, [R.SYNCED]);
        pushed++;
      }
    } catch (e) {
      if (/not found|deleted|404|410/i.test(e.message) && v[R.EVENT_ID]) {
        // 캘린더에서 이미 사라진 일정 → 연결만 끊고 다음 번에 새로 만든다
        v[R.EVENT_ID] = '';
        writeHidden_(sh, rec, [R.EVENT_ID]);
      } else if (v[R.EVENT_ID]) {
        // 남이 만든 초대 일정처럼 고칠 권한이 없는 경우: 시트만 바뀐 채로 두고 재시도하지 않는다
        v[R.SYNCED] = new Date().toISOString();
        writeHidden_(sh, rec, [R.SYNCED]);
      }
      log_('동기화 오류', '캘린더 쓰기 실패: ' + e.message, v[R.ID]);
    }
  });

  syncDeletedRows_(data, ids, allowMassDelete);
  if (pushed) log_('시트→캘린더', pushed + '건 반영', '');
}

/** 시트에서 지운 행의 일정을 지우고 _연동 목록을 새로 쓴다 */
function syncDeletedRows_(data, ids, allowMassDelete) {
  const idx = sheet_(SHEET.INDEX);
  const old = idx.getLastRow() > 1 ? idx.getRange(2, 1, idx.getLastRow() - 1, 3).getValues() : [];
  const gone = old.filter(function (r) { return r[0] && r[1] && !data.byId[r[0]]; });
  const limit = numSetting_('대량 삭제 기준', 20);
  let keep = [];
  if (gone.length > limit && !allowMassDelete) {
    log_('대량 삭제 감지', gone.length + '개 행이 사라져 일정 삭제를 멈춤. 의도한 것이면 메뉴 > 대량 삭제 승인 후 동기화', '');
    keep = gone;
  } else {
    gone.forEach(function (r) {
      try {
        removeEvent_(ids[r[2]], r[1]);
      } catch (e) {
        log_('동기화 오류', '지운 행의 일정 삭제 실패: ' + e.message, r[0]);
      }
    });
    if (gone.length) log_('시트→캘린더', '시트에서 지운 행 ' + gone.length + '건의 일정 삭제', '');
  }
  const rows = data.list
    .filter(function (rec) { return rec.v[R.EVENT_ID]; })
    .map(function (rec) { return [rec.v[R.ID], rec.v[R.EVENT_ID], rec.v[R.CAL]]; })
    .concat(keep);
  writeIndex_(idx, rows);
}

function writeIndex_(idx, rows) {
  if (idx.getLastRow() > 1) idx.getRange(2, 1, idx.getLastRow() - 1, 3).clearContent();
  if (rows.length) {
    if (idx.getMaxRows() < rows.length + 1) idx.insertRowsAfter(idx.getMaxRows(), rows.length + 1 - idx.getMaxRows());
    idx.getRange(2, 1, rows.length, 3).setNumberFormat('@').setValues(rows);
  }
}

function removeEvent_(calId, eventId) {
  if (!calId || !eventId) return;
  try {
    Calendar.Events.remove(calId, eventId);
  } catch (e) {
    if (!/not found|deleted|404|410/i.test(e.message)) throw e;
  }
}

/** 행 → 캘린더 일정 리소스 */
function buildEvent_(v, key, reminderMin, isInsert) {
  const personal = key === CAL.PERSONAL;
  const ev = {
    summary: eventTitle_(v, key),
    description: eventDescription_(v, key),
    extendedProperties: { private: { wlRowId: v[R.ID], wlFile: ss_().getId() } },
  };
  const days = Number(v[R.DAYS]) || 0;
  if (v[R.START]) {
    let end = v[R.END];
    let endDate = addDays_(v[R.DATE], days);
    if (!end) {
      end = minutesToTime_(timeToMinutes_(v[R.START]) + 60);
      if (timeToMinutes_(v[R.START]) + 60 >= 1440) endDate = addDays_(endDate, 1);
    } else if (days === 0 && timeToMinutes_(end) <= timeToMinutes_(v[R.START])) {
      endDate = addDays_(endDate, 1); // 23:00~01:00 처럼 자정을 넘김
    }
    ev.start = { dateTime: isoSeoul_(v[R.DATE], v[R.START]), timeZone: TZ };
    ev.end = { dateTime: isoSeoul_(endDate, end), timeZone: TZ };
    if (!personal) ev.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: reminderMin }] };
  } else {
    ev.start = { date: v[R.DATE] };
    ev.end = { date: addDays_(v[R.DATE], days + 1) };
    ev.transparency = 'transparent';
    // 종일 일정 알림은 캘린더 설정의 '종일 일정 기본 알림(당일 오전 8:30)'을 따른다
    if (!personal) ev.reminders = { useDefault: true };
  }
  if (!personal && TYPE_COLOR[v[R.TYPE]]) ev.colorId = TYPE_COLOR[v[R.TYPE]];
  if (personal && !isInsert) delete ev.reminders;
  return ev;
}

function eventTitle_(v, key) {
  const title = v[R.TITLE] || v[R.TYPE] || '(제목 없음)';
  if (key === CAL.PERSONAL) return title;
  let prefix = '';
  if (v[R.CUST] && v[R.CUST] !== UNCLASSIFIED) {
    const biz = v[R.BIZ] && v[R.BIZ] !== NONE ? '/' + v[R.BIZ] : '';
    prefix = '[' + v[R.CUST] + biz + '] ';
  }
  if (key === CAL.TODO) return (v[R.STATUS] === STATUS.DONE ? '✅ ' : '☐ ') + prefix + title;
  return prefix + title;
}

function eventDescription_(v, key) {
  const note = String(v[R.NOTE] || '').replace(/\s+$/, '');
  if (key === CAL.PERSONAL) return note;
  const lines = [];
  if (v[R.TYPE]) lines.push('유형: ' + v[R.TYPE]);
  if (v[R.TASK] && v[R.TASK] !== NONE) lines.push('업무: ' + v[R.TASK]);
  if (v[R.CONTACT]) lines.push('담당자: ' + v[R.CONTACT]);
  if (v[R.NEXT]) lines.push('다음 액션: ' + v[R.NEXT] + (v[R.NEXT_DUE] ? ' (' + v[R.NEXT_DUE] + ')' : ''));
  if (v[R.LINK]) lines.push('링크: ' + v[R.LINK]);
  lines.push('상태: ' + (v[R.STATUS] || ''));
  return (note ? note + '\n\n' : '') + DESC_MARK + '\n' + lines.join('\n');
}

/** 은퇴한 이전 연도 파일: 모든 자동 실행을 지운다 */
function retireTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  log_('연도 전환', '1월 말이 지나 이 파일의 자동 실행을 모두 껐습니다.', '');
}

// ===== 05_Edit.gs =====
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

// ===== 06_Sidebar.gs =====
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

// ===== 07_Carryover.gs =====
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

// ===== 08_Mail.gs =====
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

// ===== 09_Client.gs =====
/** 고객사정보: 마지막 연락일 · 연락 공백 · 계약 만료 */

/** 마스터의 활성 고객사가 고객사정보에 모두 있게 한다 */
function ensureClientRows_(custs) {
  const sh = sheet_(SHEET.CLIENT);
  if (!sh) return;
  const last = sh.getLastRow();
  const have = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  const add = custs.filter(function (c) { return have.indexOf(c) < 0; });
  if (!add.length) return;
  const def = numSetting_('연락 공백 기본(일)', 30);
  sh.getRange(last + 1, 1, add.length, 4).setValues(add.map(function (c) { return [c, '', '', def]; }));
}

/** 매일 아침: 고객사별 마지막 미팅·통화, 마지막 메일, 공백 일수 계산 */
function dailyCheck() {
  if (isRetired_()) return;
  ensureClientRows_(activeCustomers_(readMaster_()));
  const sh = sheet_(SHEET.CLIENT);
  const last = sh.getLastRow();
  if (last < 2) return;
  const today = todayStr_();
  const def = numSetting_('연락 공백 기본(일)', 30);

  // 기록(올해 + 작년)에서 마지막 미팅·통화
  const lastMeet = {};
  readRecords_().list.concat(readPrevYearRecords_()).forEach(function (rec) {
    const v = rec.v;
    if (CONTACT_TYPES.indexOf(v[R.TYPE]) < 0 || !v[R.DATE] || v[R.DATE] > today) return;
    if (v[R.STATUS] !== STATUS.DONE && v[R.STATUS] !== STATUS.PLANNED) return;
    if (!lastMeet[v[R.CUST]] || lastMeet[v[R.CUST]] < v[R.DATE]) lastMeet[v[R.CUST]] = v[R.DATE];
  });

  // 연락처 이메일로 Gmail에서 마지막 메일
  const emails = {};
  const cs = sheet_(SHEET.CONTACT);
  if (cs.getLastRow() > 1) {
    cs.getRange(2, 1, cs.getLastRow() - 1, CONTACT_HEADERS.length).getValues().forEach(function (r) {
      const e = String(r[C.EMAIL]).trim();
      if (e && r[C.CUST]) (emails[r[C.CUST]] = emails[r[C.CUST]] || []).push(e);
    });
  }

  const range = sh.getRange(2, 1, last - 1, CLIENT_HEADERS.length);
  const vals = range.getValues();
  vals.forEach(function (r) {
    const cust = String(r[K.CUST]).trim();
    if (!cust) return;
    if (r[K.GAP_LIMIT] === '') r[K.GAP_LIMIT] = def;
    const meet = lastMeet[cust] || '';
    const mail = lastMailDate_(emails[cust] || []);
    r[K.LAST_MEET] = meet ? dateToCell_(meet) : '';
    r[K.LAST_MAIL] = mail ? dateToCell_(mail) : '';
    const latest = [meet, mail].filter(String).sort().pop();
    r[K.GAP] = latest ? diffDays_(latest, today) : '';
  });
  range.setValues(vals);
  setState_('dailyCheckAt', new Date().toISOString());
}

function lastMailDate_(addrs) {
  if (!addrs.length) return '';
  const parts = addrs.slice(0, 20).map(function (a) { return 'from:' + a + ' OR to:' + a; });
  try {
    const threads = GmailApp.search('(' + parts.join(' OR ') + ') newer_than:2y', 0, 1);
    return threads.length ? fmtDate_(threads[0].getLastMessageDate()) : '';
  } catch (e) {
    log_('메일 확인 오류', e.message, '');
    return '';
  }
}

/** 브리핑용: 공백 초과 / 계약 만료 임박 */
function clientAlerts_() {
  const out = { gap: [], contract: [] };
  const sh = sheet_(SHEET.CLIENT);
  if (!sh || sh.getLastRow() < 2) return out;
  const today = todayStr_();
  const def = numSetting_('연락 공백 기본(일)', 30);
  const warn = numSetting_('계약 만료 알림(일)', 60);
  sh.getRange(2, 1, sh.getLastRow() - 1, CLIENT_HEADERS.length).getValues().forEach(function (r) {
    const cust = String(r[K.CUST]).trim();
    if (!cust) return;
    const limit = Number(r[K.GAP_LIMIT]) || def;
    const meet = parseDate_(r[K.LAST_MEET]);
    const mail = parseDate_(r[K.LAST_MAIL]);
    const latest = [meet, mail].filter(String).sort().pop() || '';
    if (r[K.GAP] !== '' && Number(r[K.GAP]) > limit) out.gap.push({ cust: cust, last: latest, gap: r[K.GAP], limit: limit });
    const end = parseDate_(r[K.END]);
    if (end) {
      const left = diffDays_(today, end);
      if (left >= 0 && left <= warn) out.contract.push({ cust: cust, end: end, left: left });
    }
  });
  out.gap.sort(function (a, b) { return b.gap - a.gap; });
  out.contract.sort(function (a, b) { return a.left - b.left; });
  return out;
}

// ===== 10_Contacts.gs =====
/**
 * 연락처 시트 ↔ 구글 주소록 양방향 동기화 (1시간마다)
 *
 * - '고객사' 라벨이 붙은 연락처만 다룬다. 고객사 이름은 연락처의 '회사'에 들어간다.
 * - 처음 연결할 때 이메일/전화번호로 기존 연락처를 찾아 합친다. 후보가 여럿이면 로그에 남기고 건너뛴다.
 * - '비활성'에 체크하면 지우지 않고 라벨만 '고객사-이전'으로 바꾼다.
 * - 양쪽이 모두 바뀌었으면 나중에 바뀐 쪽이 이긴다.
 */

const GROUP_ACTIVE = '고객사';
const GROUP_OLD = '고객사-이전';
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,biographies,memberships,metadata';
const UPDATE_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,biographies';

function syncContacts() {
  if (isRetired_()) return;
  withLock_(syncContacts_, 60000);
}

function syncContactsNow() {
  syncContacts();
  ss_().toast('주소록 동기화를 마쳤습니다.', APP_NAME, 5);
}

function syncContacts_() {
  const groups = ensureGroups_();
  const people = listAllPeople_();
  const byRes = {};
  people.forEach(function (p) { byRes[p.resourceName] = p; });

  const sh = sheet_(SHEET.CONTACT);
  const last = sh.getLastRow();
  const raw = last > 1 ? sh.getRange(2, 1, last - 1, CONTACT_HEADERS.length).getValues() : [];
  const linked = {};
  const addToActive = [], addToOld = [], removeFromActive = [], removeFromOld = [];
  let changes = 0;

  raw.forEach(function (orig, i) {
    const row = orig.slice();
    const name = String(row[C.NAME]).trim();
    if (!name) return;
    let res = String(row[C.RES] || '');
    let person = res ? byRes[res] : null;

    try {
      if (res && !person) {
        // 주소록에서 지워짐
        row[C.INACTIVE] = true;
        row[C.RES] = '';
        row[C.SYNCED] = new Date().toISOString();
        log_('주소록', '주소록에서 지워진 연락처라 비활성 처리: ' + name, '');
      } else if (!res) {
        const cands = findCandidates_(people, row);
        if (cands.length > 1) {
          log_('주소록 확인 필요', name + ': 같은 이메일/전화의 연락처가 ' + cands.length + '개라 자동으로 합치지 않음', '');
          return;
        }
        if (cands.length === 1) {
          person = cands[0];
          mergeIntoRow_(row, person);
          const upd = People.People.updateContact(applyRowToPerson_(person, row), person.resourceName,
            { updatePersonFields: UPDATE_FIELDS, personFields: 'metadata' });
          row[C.SYNCED] = updateTime_(upd) || new Date().toISOString();
          log_('주소록', '기존 연락처와 연결: ' + name, '');
        } else {
          const created = People.People.createContact(applyRowToPerson_({}, row), { personFields: 'metadata' });
          person = created;
          row[C.SYNCED] = updateTime_(created) || new Date().toISOString();
          log_('주소록', '주소록에 새로 추가: ' + name, '');
        }
        res = person.resourceName;
        row[C.RES] = res;
      } else {
        const synced = toMillis_(row[C.SYNCED]);
        const sheetChanged = toMillis_(row[C.MODIFIED]) > synced + 1000;
        const pTime = toMillis_(updateTime_(person));
        const contactChanged = pTime > synced + 1000;
        if (contactChanged && (!sheetChanged || pTime > toMillis_(row[C.MODIFIED]))) {
          personToRow_(person, row);
          row[C.SYNCED] = updateTime_(person);
          if (sheetChanged) log_('충돌', '연락처가 양쪽에서 바뀜 → 나중에 고친 주소록 내용 사용: ' + name, '');
        } else if (sheetChanged) {
          const upd = People.People.updateContact(applyRowToPerson_(person, row), res,
            { updatePersonFields: UPDATE_FIELDS, personFields: 'metadata' });
          row[C.SYNCED] = updateTime_(upd) || new Date().toISOString();
          if (contactChanged) log_('충돌', '연락처가 양쪽에서 바뀜 → 나중에 고친 시트 내용 사용: ' + name, '');
        }
      }
    } catch (e) {
      log_('주소록 오류', name + ': ' + e.message, '');
      return;
    }

    if (row[C.RES]) {
      linked[row[C.RES]] = true;
      const groupsNow = memberGroups_(byRes[row[C.RES]]);
      const nowActive = row[C.INACTIVE] !== true;
      if (nowActive && groupsNow.indexOf(groups.active) < 0) addToActive.push(row[C.RES]);
      if (nowActive && groupsNow.indexOf(groups.old) >= 0) removeFromOld.push(row[C.RES]);
      if (!nowActive && groupsNow.indexOf(groups.old) < 0) addToOld.push(row[C.RES]);
      if (!nowActive && groupsNow.indexOf(groups.active) >= 0) removeFromActive.push(row[C.RES]);
    }
    if (!sameRow_(row, orig)) {
      const r = i + 2;
      const cur = sh.getRange(r, 1, 1, CONTACT_HEADERS.length).getValues()[0];
      if (sameRow_(cur, orig)) {
        sh.getRange(r, 1, 1, CONTACT_HEADERS.length).setValues([row]);
        changes++;
      }
    }
  });

  // 주소록에서 '고객사' 라벨을 붙인 새 연락처 → 시트에 추가
  const newRows = [];
  people.forEach(function (p) {
    if (linked[p.resourceName]) return;
    if (memberGroups_(p).indexOf(groups.active) < 0) return;
    const row = new Array(CONTACT_HEADERS.length).fill('');
    personToRow_(p, row);
    row[C.INACTIVE] = false;
    row[C.RES] = p.resourceName;
    row[C.SYNCED] = updateTime_(p);
    newRows.push(row);
  });
  if (newRows.length) {
    let start = 2;
    for (let i = raw.length - 1; i >= 0; i--) {
      if (String(raw[i][C.NAME]).trim() || String(raw[i][C.CUST]).trim()) { start = i + 3; break; }
    }
    if (start + newRows.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), newRows.length + 100);
    sh.getRange(start, 1, newRows.length, CONTACT_HEADERS.length).setValues(newRows);
    sh.getRange(start, C.INACTIVE + 1, newRows.length, 1).insertCheckboxes();
    sh.getRange(start, C.INACTIVE + 1, newRows.length, 1).setValues(newRows.map(function () { return [false]; }));
    log_('주소록', '주소록에서 연락처 ' + newRows.length + '명을 가져옴', '');
  }

  modifyGroup_(groups.active, addToActive, removeFromActive);
  modifyGroup_(groups.old, addToOld, removeFromOld);
  if (changes || newRows.length) setState_('contactsSyncedAt', new Date().toISOString());
}

function ensureGroups_() {
  const res = People.ContactGroups.list({ pageSize: 1000 });
  const all = res.contactGroups || [];
  const find = function (name) {
    const g = all.filter(function (x) { return x.name === name || x.formattedName === name; })[0];
    if (g) return g.resourceName;
    return People.ContactGroups.create({ contactGroup: { name: name } }).resourceName;
  };
  return { active: find(GROUP_ACTIVE), old: find(GROUP_OLD) };
}

function listAllPeople_() {
  const out = [];
  let token = null;
  let guard = 0;
  do {
    const args = { personFields: PERSON_FIELDS, pageSize: 1000 };
    if (token) args.pageToken = token;
    const res = People.People.Connections.list('people/me', args);
    (res.connections || []).forEach(function (p) { out.push(p); });
    token = res.nextPageToken;
  } while (token && ++guard < 50);
  return out;
}

function modifyGroup_(group, add, remove) {
  for (let i = 0; i < Math.max(add.length, remove.length); i += 500) {
    const body = {};
    if (add.length > i) body.resourceNamesToAdd = add.slice(i, i + 500);
    if (remove.length > i) body.resourceNamesToRemove = remove.slice(i, i + 500);
    if (!body.resourceNamesToAdd && !body.resourceNamesToRemove) continue;
    try {
      People.ContactGroups.Members.modify(body, group);
    } catch (e) {
      log_('주소록 오류', '라벨 변경 실패: ' + e.message, '');
    }
  }
}

function memberGroups_(p) {
  return ((p && p.memberships) || [])
    .map(function (m) { return m.contactGroupMembership && m.contactGroupMembership.contactGroupResourceName; })
    .filter(String);
}

function updateTime_(p) {
  const srcs = (p && p.metadata && p.metadata.sources) || [];
  const s = srcs.filter(function (x) { return x.type === 'CONTACT'; })[0] || srcs[0];
  return (s && s.updateTime) || '';
}

function digits_(s) {
  return String(s || '').replace(/\D/g, '').replace(/^82/, '0');
}

function findCandidates_(people, row) {
  const email = String(row[C.EMAIL]).trim().toLowerCase();
  const phone = digits_(row[C.PHONE]);
  if (!email && !phone) return [];
  return people.filter(function (p) {
    const emails = (p.emailAddresses || []).map(function (e) { return String(e.value).toLowerCase(); });
    const phones = (p.phoneNumbers || []).map(function (x) { return digits_(x.value); });
    return (email && emails.indexOf(email) >= 0) || (phone && phone.length >= 9 && phones.indexOf(phone) >= 0);
  });
}

/** 연결할 때: 시트에 비어 있는 칸은 주소록 값으로 채운다 */
function mergeIntoRow_(row, p) {
  const tmp = new Array(CONTACT_HEADERS.length).fill('');
  personToRow_(p, tmp);
  [C.CUST, C.TITLE, C.PHONE, C.EMAIL, C.MEMO].forEach(function (c) {
    if (!String(row[c]).trim() && tmp[c]) row[c] = tmp[c];
  });
}

function personToRow_(p, row) {
  const first = function (arr) { return (arr && arr[0]) || {}; };
  const org = first(p.organizations);
  row[C.NAME] = first(p.names).displayName || first(p.names).unstructuredName || row[C.NAME];
  row[C.CUST] = org.name || row[C.CUST] || '';
  row[C.TITLE] = [org.department, org.title].filter(function (x) { return x; }).join(' ');
  row[C.PHONE] = first(p.phoneNumbers).value || '';
  row[C.EMAIL] = first(p.emailAddresses).value || '';
  row[C.MEMO] = first(p.biographies).value || '';
}

/** 시트 행 → 연락처 (기존 값의 두 번째 이후 항목은 보존) */
function applyRowToPerson_(p, row) {
  const person = JSON.parse(JSON.stringify(p || {}));
  const setFirst = function (field, obj) {
    const arr = person[field] || [];
    if (obj === null) {
      if (arr.length) arr.shift();
    } else if (arr.length) {
      Object.keys(obj).forEach(function (k) { arr[0][k] = obj[k]; });
    } else {
      arr.push(obj);
    }
    person[field] = arr;
  };
  const name = String(row[C.NAME]).trim();
  const cur = person.names && person.names[0] && person.names[0].displayName;
  if (cur !== name) person.names = [{ unstructuredName: name }];
  setFirst('organizations', row[C.CUST] || row[C.TITLE] ? { name: String(row[C.CUST]), title: String(row[C.TITLE]), department: '' } : null);
  setFirst('phoneNumbers', String(row[C.PHONE]).trim() ? { value: String(row[C.PHONE]).trim() } : null);
  setFirst('emailAddresses', String(row[C.EMAIL]).trim() ? { value: String(row[C.EMAIL]).trim() } : null);
  setFirst('biographies', String(row[C.MEMO]).trim() ? { value: String(row[C.MEMO]), contentType: 'TEXT_PLAIN' } : null);
  if (!p || !p.resourceName) {
    person.memberships = [];
  }
  delete person.metadata;
  return person;
}

function sameRow_(a, b) {
  for (let i = 0; i < CONTACT_HEADERS.length; i++) {
    if (toCmp_(a[i]) !== toCmp_(b[i])) return false;
  }
  return true;
}

function toCmp_(x) {
  return x instanceof Date ? String(x.getTime()) : String(x);
}

// ===== 11_Views.gs =====
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

// ===== 12_Setup.gs =====
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
    .addItem('사용법 시트 열기', 'openGuide')
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
  // 새 파일에 기본으로 생기는 빈 '시트1 / Sheet1'만 정리 (사용자가 추가한 시트는 비어 있어도 건드리지 않음)
  ss.getSheets().forEach(function (sh) {
    if (/^(시트|Sheet)\d+$/.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > order.length) ss.deleteSheet(sh);
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
  ss.setActiveSheet(buildGuide_());

  ui.alert('초기 설정 완료',
    '1) 마스터 시트에 고객사·사업·업무를 입력하세요 (예시 행은 지워도 됩니다).\n' +
    '2) 연락처 시트에 고객사 담당자를 입력하세요.\n' +
    '3) 구글 캘린더에서 "업무"·"할 일" 캘린더의 종일 일정 알림을 "당일 오전 8:30"으로 설정하세요.\n' +
    '4) 메일의 [완료 처리] 버튼을 쓰려면 웹앱으로 배포하세요 (설치 가이드 참고).\n\n' +
    '자세한 사용법과 주의사항은 "📖 사용법" 시트에 있습니다.\n' +
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

// ===== 13_Year.gs =====
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

// ===== 14_Guide.gs =====
/**
 * 📖 사용법 시트: 시트 안내, 기록 방법, 연동 규칙, 주의사항.
 * 초기 설정 / 메뉴 > 사용법 시트 열기 때 새로 쓴다 (설정값이 반영되도록).
 */

function openGuide() {
  const sh = buildGuide_();
  ss_().setActiveSheet(sh);
}

function buildGuide_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET.GUIDE);
  if (!sh) sh = ss.insertSheet(SHEET.GUIDE, 0);
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), 4).breakApart();

  const brief = numSetting_('브리핑 시각', 8);
  const weekly = numSetting_('주간 리포트 시각', 17);
  const soon = numSetting_('마감 임박(일)', 3);
  const warnCarry = numSetting_('이월 경고 횟수', 3);
  const horizon = numSetting_('반복 일정 가져오기(일)', 28);
  const remind = numSetting_('시간 일정 알림(분)', 60);
  const massDel = numSetting_('대량 삭제 기준', 20);
  const exclude = Object.prototype.hasOwnProperty.call(settings_(), '제외 키워드') ? settings_()['제외 키워드'] : '생일';

  const rows = [];
  const types = [];
  const add = function (type, a, b, c, d) {
    rows.push([a || '', b || '', c || '', d || '']);
    types.push(type);
  };
  const h2 = function (text) { add('gap'); add('h2', '', text); };
  const p = function (text, icon) { add('p', icon || '•', text); };
  const th = function (b, c, d) { add('th', '', b, c, d); };
  const td = function (b, c, d) { add('td', '', b, c, d); };

  add('h1', '', '📒 업무기록 시트 사용법');
  add('note', '', '이 시트는 스크립트가 만듭니다. 초기 설정을 다시 누르거나 메뉴 > 사용법 시트 열기를 누르면 새로 쓰이니, 여기에는 메모하지 마세요.');

  h2('1. 처음 한 번 할 일');
  p('마스터 시트에 고객사 > 사업 > 업무를 한 줄에 하나씩 입력합니다. 예시 행은 지워도 됩니다.', '①');
  p('연락처 시트에 고객사 담당자를 입력합니다. 1시간 안에 구글 주소록에 "고객사" 라벨로 들어갑니다.', '②');
  p('고객사정보 시트에 계약 시작·종료일과 연락 공백 기준(일)을 입력합니다.', '③');
  p('구글 캘린더 설정에서 "업무", "할 일" 캘린더의 종일 일정 알림을 "당일 오전 8:30"으로 바꿉니다.', '④');
  p('메일의 [완료 처리] 버튼을 쓰려면 Apps Script에서 웹앱으로 배포하고, 그 주소를 설정 시트 "웹앱 URL"에 넣습니다.', '⑤');

  h2('2. 시트 안내');
  th('시트', '하는 일', '직접 입력');
  td('대시보드', '오늘·이번 주 일정, 곧 마감되는 할 일, 다시 잡을 미팅, 밀린 항목, 연락 공백, 계약 만료, 미분류', '✕ (자동)');
  td('기록', '모든 일정과 노트. 이 파일의 중심', '○');
  td('월간', '달력 모양으로 보기. 🏠는 개인 일정', 'B1 날짜만');
  td('검색', '고객사만 고르면 전체 히스토리, 키워드를 넣으면 노트까지 검색 (작년 파일 포함)', 'B1~B3만');
  td('분석', '기간별 고객사·사업·유형 시간과 건수, 차트', 'B1~B2만');
  td('고객사정보', '계약 기간, 공백 기준. 마지막 연락일·공백 일수는 매일 아침 자동 계산', '계약·기준·메모');
  td('마스터', '고객사 > 사업 > 업무 목록 (드롭다운의 원본)', '○');
  td('연락처', '고객사 담당자. 구글 주소록과 양방향 동기화', '○');
  td('설정', '메일 시각, 기준값, 제외 키워드 등', '값(B열)만');
  td('로그', '동기화·충돌·오류 기록. 문제가 생기면 여기부터 확인', '✕');
  td('📖 사용법', '지금 보고 있는 시트', '✕');
  td('_목록, _연동, _상태', '숨겨진 내부용 시트', '✕ 건드리지 않기');

  h2('3. 기록하는 법');
  p('입력창(추천): 메뉴 > 입력창 열기. 고객사를 고르면 그 고객사의 사업·업무·담당자만 나오고, 담당자는 여러 명 체크할 수 있습니다.');
  p('입력창의 "+ 새 사업 / + 새 업무"로 마스터에 바로 추가됩니다. 기록 시트에서 행을 고르고 "선택한 행 불러오기"를 누르면 수정할 수 있습니다.');
  p('기록 시트에 직접 입력해도 됩니다. 날짜를 넣는 순간 상태·캘린더 연동 같은 기본값이 채워집니다.');
  p('시작 시간을 비우면 종일 일정이 됩니다. 유형을 "미팅"으로 고르면 노트에 참석자/논의/결정/할 일 양식이 채워집니다.');
  p('"다음 액션"과 "다음 액션 기한"을 넣으면 기한 날짜에 작업 행이 자동으로 생기고 "할 일" 캘린더에 올라갑니다.');
  add('gap');
  th('상태', '뜻', '캘린더');
  td('예정', '할 일. 날짜가 지나면 자정에 오늘로 이월', '올라감');
  td('완료', '끝난 일. 날짜가 지난 새 행과 메모는 기본으로 완료', '올라감');
  td('보류', '일부러 미뤄 둔 일. 이월하지 않음', '올라감');
  td('취소', '없던 일. 캘린더에서 지우면 자동으로 취소', '내려감');
  td('재일정 필요', '이월된 미팅·통화. 시간을 정하고 "예정"으로 바꾸면 다시 올라감', '내려감');
  td('이월됨', '오늘로 넘어간 원래 기록 (기록 보존용)', '내려감');

  h2('4. 캘린더 연동 규칙');
  th('시트', '캘린더', '제목');
  td('일반 고객사 행', '업무', '[고객사/사업] 제목');
  td('다음 액션으로 생긴 작업', '할 일 (종일)', '☐ [고객사/사업] 할 일 → 완료 시 ✅');
  td('고객사 [개인일정]', '기본(개인) 캘린더', '제목 그대로');
  add('gap');
  p('10분마다 자동으로 양쪽을 맞춥니다. 바로 맞추려면 메뉴 > 지금 캘린더 동기화.');
  p('폰이나 웹 캘린더에서 일정을 만들 때 제목을 [A사/사업1] 회의 처럼 쓰면 고객사·사업이 자동으로 분류되고, 아니면 "미분류"로 들어옵니다.');
  p('할 일 캘린더에서 제목 앞에 ✅를 붙이면 시트에서 완료가 됩니다.');
  p('양쪽을 모두 고쳤으면 나중에 고친 쪽이 이기고 로그에 남습니다.');
  p('캘린더에서 지운 일정은 시트에서 "취소"가 됩니다. 시트에서 행을 지우면 캘린더 일정도 지워집니다.');
  p('한 번에 ' + massDel + '건 넘게 지워지면 실수로 보고 멈춥니다. 의도한 것이면 메뉴 > 대량 삭제 승인 후 동기화.');
  p('메모 유형, 그리고 취소·이월됨·재일정 필요 상태는 캘린더에 올리지 않습니다.');
  p('반복 일정은 구글 캘린더에서 만드세요. 앞으로 ' + horizon + '일 안의 회차만 시트에 들어옵니다.');
  p('개인 캘린더 일정 중 제목에 "' + (exclude || '(없음)') + '"이 들어간 것은 시트에 넣지 않습니다 (설정 > 제외 키워드).');
  p('알림: 시간 일정은 ' + remind + '분 전, 종일 일정은 캘린더 설정의 종일 알림(당일 8:30)을 따릅니다.');
  p('고객사 담당자는 일정 설명에 이름만 적고 참석자로 넣지 않으므로, 고객사에 초대 메일이 가지 않습니다.');

  h2('5. 자동으로 일어나는 일');
  th('언제', '무엇을', '');
  td('10분마다', '캘린더 ↔ 시트 동기화, 다음 액션 처리', '');
  td('1시간마다', '연락처 ↔ 구글 주소록 동기화', '');
  td('매일 0시대', '미완료 이월, 반복 일정 새 회차 가져오기', '');
  td('매일 7시대', '고객사 마지막 연락일·공백 일수 계산 (Gmail 포함)', '');
  td('평일 ' + brief + '시대', '아침 브리핑 메일', '');
  td('금요일 ' + weekly + '시대', '주간 리포트 메일', '');
  add('note', '', '구글 자동 실행은 정해진 분에 정확히 돌지 않고 ±15분 안에서 실행됩니다.');

  h2('6. 이월 규칙 (매일 자정)');
  p('지난 날짜의 "예정" 행 → 원래 행은 "이월됨", 오늘 날짜로 새 행을 만듭니다.');
  p('작업·메모는 시간 그대로, 미팅·통화는 시간 없이 "재일정 필요"로 넘어갑니다.');
  p('"재일정 필요" 행은 날짜만 오늘로 옮기고 이월 횟수를 올립니다. ' + warnCarry + '번 이상이면 빨간색으로 표시됩니다.');
  p('[개인일정]은 이월하지 않고 지난 일정은 완료가 됩니다. "보류"는 그대로 둡니다.');
  p('브리핑 메일의 [완료 처리]를 누르면 원래 행은 완료, 이월된 행은 지워집니다.');

  h2('7. 메뉴 (📒 업무기록)');
  th('메뉴', '하는 일', '');
  td('입력창 열기', '오른쪽에 입력창', '');
  td('지금 캘린더 동기화 / 지금 주소록 동기화', '10분·1시간을 기다리지 않고 바로 맞춤', '');
  td('고객사 연락 공백 갱신', '고객사정보의 마지막 연락일 다시 계산', '');
  td('검색·분석 새로고침', '검색·분석 결과 다시 계산', '');
  td('브리핑 / 주간 리포트 지금 보내기', '메일 미리 받아 보기', '');
  td('고객사·사업·업무 이름 바꾸기', '마스터·기록·연락처·캘린더 제목을 함께 변경', '');
  td('대량 삭제 승인 후 동기화', '멈춰 둔 대량 삭제를 진행', '');
  td('서식·대시보드 다시 적용', '설정값을 바꾼 뒤, 또는 드롭다운이 이상할 때', '');
  td('사용법 시트 열기', '이 시트를 최신 설정값으로 다시 만들어 열기', '');
  td('새 연도 파일 만들기', '1월 1일 이후 실행. 내년 파일을 만들고 새해 기록을 옮김', '');
  td('초기 설정', '처음 한 번. 다시 눌러도 데이터는 지워지지 않음 (자동 실행 다시 등록)', '');

  h2('8. 주의사항 (꼭 지켜 주세요)');
  p('시트 순서는 바꿔도 되고, 내 시트를 새로 추가해도 됩니다. 단 스크립트 시트의 이름은 바꾸지 마세요.', '⚠️');
  p('숨겨진 시트(_목록, _연동, _상태)와 숨겨진 열(기록 Q~Y열, 연락처 H~J열)은 건드리지 마세요. 캘린더·주소록 연결 정보입니다.', '⚠️');
  p('기록·연락처·고객사정보 시트는 중간에 열을 끼워 넣지 마세요. 필요하면 맨 오른쪽에 추가하세요.', '⚠️');
  p('마스터 시트는 [구분] 같은 열을 어디에 넣어도 되지만, 고객사·사업·업무·비활성·비고 제목 이름은 바꾸지 마세요.', '⚠️');
  p('각 시트 1행의 제목은 바꾸지 마세요.', '⚠️');
  p('정렬할 때는 전체 행을 함께 정렬하세요. 일부 열만 정렬하면 행과 캘린더 연결이 어긋납니다.', '⚠️');
  p('기록 시트에서 행을 지우면 캘린더 일정도 지워집니다. 기록만 남기고 싶으면 상태를 "취소"로 바꾸세요.', '⚠️');
  p('마스터·연락처 항목은 지우지 말고 "비활성"에 체크하세요. 과거 기록은 그대로 남습니다.', '⚠️');
  p('대시보드·월간·사용법 시트는 자동으로 다시 만들어집니다. 여기에 직접 내용을 넣지 마세요.', '⚠️');
  p('파일을 공유하면 개인 일정도 함께 보입니다.', '⚠️');
  p('코드를 업데이트하기 전에는 파일 > 사본 만들기로 백업하세요.', '⚠️');

  h2('9. 문제가 생기면');
  p('먼저 로그 시트를 보세요. 오류·충돌·건너뛴 작업이 시간순으로 남아 있습니다.');
  p('캘린더에 안 올라가요 → 캘린더 연동 체크, 상태(취소/이월됨/재일정 필요 아닌지), 유형(메모 아닌지), 날짜를 확인하세요.');
  p('드롭다운이 이상해요 → 메뉴 > 서식·대시보드 다시 적용.');
  p('로그에 "대량 삭제 감지" → 의도한 삭제면 메뉴 > 대량 삭제 승인 후 동기화, 아니면 지운 행을 되살리세요 (Ctrl+Z 또는 버전 기록).');
  p('자동 실행이 멈춘 것 같아요 → 메뉴 > 초기 설정을 다시 누르세요 (데이터는 지워지지 않음).');
  p('새해가 되면 → 1월 1일 이후 메뉴 > 새 연도 파일 만들기, 그리고 새 파일에서 초기 설정.');

  sh.getRange(1, 1, rows.length, 4).setValues(rows);
  sh.setColumnWidth(1, 36);
  sh.setColumnWidth(2, 230);
  sh.setColumnWidth(3, 560);
  sh.setColumnWidth(4, 160);
  sh.getRange(1, 1, rows.length, 4).setVerticalAlignment('middle').setWrap(true).setFontSize(10);

  const ranges = { h1: [], h2: [], p: [], note: [], th: [], td: [] };
  types.forEach(function (t, i) {
    const r = i + 1;
    if (t === 'h1' || t === 'h2' || t === 'p' || t === 'note') {
      sh.getRange(r, 2, 1, 3).merge();
      ranges[t].push('B' + r + ':D' + r);
      if (t === 'p') ranges.p.push('A' + r);
    } else if (t === 'th' || t === 'td') {
      ranges[t].push('B' + r + ':D' + r);
    }
  });
  const style = function (list, fn) { if (list.length) fn(sh.getRangeList(list)); };
  style(ranges.h1, function (l) { l.setFontSize(18).setFontWeight('bold'); });
  style(ranges.h2, function (l) { l.setFontSize(13).setFontWeight('bold').setBackground('#e8f0fe'); });
  style(ranges.note, function (l) { l.setFontColor('#5f6368').setFontStyle('italic'); });
  style(ranges.th, function (l) { l.setFontWeight('bold').setBackground('#f1f3f4'); });
  style(ranges.td, function (l) { l.setBorder(false, false, true, false, false, false, '#e8eaed', SpreadsheetApp.BorderStyle.SOLID); });
  style(ranges.p, function (l) { l.setVerticalAlignment('top'); });
  sh.getRange(1, 1, rows.length, 1).setHorizontalAlignment('center');
  sh.setFrozenRows(1);
  sh.setTabColor('#1a73e8');
  return sh;
}

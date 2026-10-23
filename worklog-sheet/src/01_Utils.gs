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

/**
 * Apps Script 서비스의 간이 모의 객체 (테스트용).
 * 시트는 메모리 2차원 배열, 캘린더/주소록은 메모리 저장소로 흉내 낸다.
 */
'use strict';
const crypto = require('crypto');

let clock = Date.parse('2026-10-23T09:00:00+09:00');
function now() { return new Date(clock); }
function advance(ms) { clock += ms; }
function setNow(iso) { clock = Date.parse(iso); }

const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(clock);
    else super(...args);
  }
  static now() { return clock; }
}

function formatDate(d, tz, fmt) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).reduce((m, p) => (m[p.type] = p.value, m), {});
  return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
    .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
}

// ---------------- Spreadsheet ----------------

function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function chainable(target) {
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      return () => proxy; // 서식 관련 메서드는 아무것도 안 함
    },
  });
  return proxy;
}

class FakeSheet {
  constructor(ss, name) {
    this.ss = ss; this.name = name; this.rows = []; this.maxRows = 1000; this.maxCols = 26;
    this.formats = {}; this.formulas = {}; this.hidden = false; this.charts = [];
    return chainable(this);
  }
  getName() { return this.name; }
  cell(r, c) { return (this.rows[r - 1] || [])[c - 1]; }
  set(r, c, v) {
    while (this.rows.length < r) this.rows.push([]);
    this.rows[r - 1][c - 1] = v;
    if (r > this.maxRows) this.maxRows = r;
    if (c > this.maxCols) this.maxCols = c;
  }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
      const c1 = colToNum(m[1]);
      const r1 = m[2] ? Number(m[2]) : 1;
      const c2 = m[3] ? colToNum(m[3]) : c1;
      const r2 = m[3] ? (m[4] ? Number(m[4]) : this.maxRows) : (m[2] ? r1 : this.maxRows);
      return new FakeRange(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new FakeRange(this, a, b, c || 1, d || 1);
  }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if ((this.rows[i] || []).some(v => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.rows.forEach(r => (r || []).forEach((v, i) => { if (v !== '' && v !== undefined) m = Math.max(m, i + 1); }));
    return m;
  }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(after, n) { this.maxRows += n; return this; }
  insertColumnsAfter(after, n) { this.maxCols += n; return this; }
  deleteRow(r) { this.rows.splice(r - 1, 1); this.maxRows--; }
  deleteRows(r, n) { this.rows.splice(r - 1, n); this.maxRows -= n; }
  insertRowAfter(r) { this.rows.splice(r, 0, []); this.maxRows++; }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this.set(r, i + 1, v)); }
  clear() { this.rows = []; this.formats = {}; this.formulas = {}; }
  hideSheet() { this.hidden = true; }
  getCharts() { return this.charts; }
  removeChart(c) { this.charts = this.charts.filter(x => x !== c); }
  insertChart(c) { this.charts.push(c); }
  newChart() { const b = chainable({ build: () => ({}) }); return b; }
  getParent() { return this.ss; }
}

function display(v, fmt) {
  if (v === undefined || v === null) return '';
  if (v instanceof RealDate) {
    if (fmt && /HH:mm/.test(fmt) && !/yyyy/.test(fmt)) return formatDate(v, 'Asia/Seoul', 'HH:mm');
    const day = ['일', '월', '화', '수', '목', '금', '토'][new RealDate(formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') + 'T00:00:00Z').getUTCDay()];
    if (fmt && /\(ddd\)/.test(fmt)) return formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') + ' (' + day + ')';
    if (fmt && /HH:mm:ss/.test(fmt)) return formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    return formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  if (typeof v === 'number' && fmt && /HH:mm/.test(fmt) && !/yyyy/.test(fmt)) {
    const min = Math.round(v * 1440);
    return String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) {
    this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc;
    return chainable(this);
  }
  _each(fn) { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(fn(this.r + i, this.c + j)); out.push(row); } return out; }
  getValues() { return this._each((r, c) => { const v = this.sheet.cell(r, c); return v === undefined || v === null ? '' : v; }); }
  getDisplayValues() { return this._each((r, c) => display(this.sheet.cell(r, c), this.sheet.formats[c])); }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error(`setValues 크기 불일치 ${vals.length}x${vals[0].length} vs ${this.nr}x${this.nc}`);
    vals.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, v)));
    return this;
  }
  setValue(v) { this.sheet.set(this.r, this.c, v); return this; }
  setFormula(f) { this.sheet.formulas[this.r + ',' + this.c] = f; this.sheet.set(this.r, this.c, ''); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.sheet.rows[this.r + i - 1]) this.sheet.rows[this.r + i - 1][this.c + j - 1] = ''; return this; }
  setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.sheet.formats[this.c + j] = f; return this; }
  insertCheckboxes() { this._each((r, c) => { const v = this.sheet.cell(r, c); if (v === undefined || v === '') this.sheet.set(r, c, false); }); return this; }
  getRow() { return this.r; }
  getLastRow() { return this.r + this.nr - 1; }
  getColumn() { return this.c; }
  getLastColumn() { return this.c + this.nc - 1; }
  getSheet() { return this.sheet; }
  offset(dr, dc, nr, nc) { return new FakeRange(this.sheet, this.r + dr, this.c + dc, nr || this.nr, nc || this.nc); }
  getA1Notation() { return numToCol(this.c) + this.r; }
}

class FakeSpreadsheet {
  constructor(id) { this.id = id || 'ss-' + crypto.randomUUID().slice(0, 8); this.sheets = []; this.toasts = []; }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(this, n); this.sheets.push(s); return s; }
  getSheets() { return this.sheets.slice(); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  setSpreadsheetTimeZone() {}
  setSpreadsheetLocale() {}
  setActiveSheet(s) { this.active = s; }
  toast(msg) { this.toasts.push(msg); }
}

function builder() {
  const b = new Proxy({}, { get(t, p) { if (p === 'build') return () => ({}); return () => b; } });
  return b;
}

// ---------------- Calendar ----------------

class FakeCalendar {
  constructor() { this.cals = {}; this.seq = 0; }
  store(id) { return this.cals[id] || (this.cals[id] = {}); }
  stamp() { advance(1000); return new RealDate(clock).toISOString(); }
  insert(res, calId) {
    const id = 'ev' + (++this.seq);
    const ev = JSON.parse(JSON.stringify(res));
    Object.assign(ev, { id, status: 'confirmed', updated: this.stamp(), eventType: 'default' });
    this.store(calId)[id] = ev;
    return JSON.parse(JSON.stringify(ev));
  }
  patch(res, calId, id) {
    const ev = this.store(calId)[id];
    if (!ev || ev.status === 'cancelled') throw new Error('Not Found');
    Object.assign(ev, JSON.parse(JSON.stringify(res)));
    ev.updated = this.stamp();
    return JSON.parse(JSON.stringify(ev));
  }
  remove(calId, id) {
    const ev = this.store(calId)[id];
    if (!ev || ev.status === 'cancelled') throw new Error('Resource has been deleted');
    ev.status = 'cancelled';
    ev.updated = this.stamp();
  }
  list(calId, opts) {
    const items = Object.values(this.store(calId)).filter(ev => {
      if (opts.updatedMin && ev.updated < opts.updatedMin) return false;
      if (!opts.showDeleted && !opts.updatedMin && ev.status === 'cancelled') return false;
      const s = ev.start.date ? ev.start.date + 'T00:00:00+09:00' : ev.start.dateTime;
      if (opts.timeMin && Date.parse(s) < Date.parse(opts.timeMin)) return false;
      if (opts.timeMax && Date.parse(s) >= Date.parse(opts.timeMax)) return false;
      return true;
    }).map(ev => ev.status === 'cancelled' ? { id: ev.id, status: 'cancelled', updated: ev.updated } : JSON.parse(JSON.stringify(ev)));
    return { items };
  }
  // 사용자가 캘린더 앱에서 직접 고친 것처럼
  userEdit(calId, id, changes) { const ev = this.store(calId)[id]; Object.assign(ev, changes); ev.updated = this.stamp(); }
  userCreate(calId, res) { return this.insert(res, calId); }
}

// ---------------- People ----------------

class FakePeople {
  constructor() { this.people = {}; this.groups = {}; this.seq = 0; }
  stamp() { advance(1000); return new RealDate(clock).toISOString(); }
  api() {
    const self = this;
    return {
      People: {
        Connections: { list: () => ({ connections: Object.values(self.people).map(p => JSON.parse(JSON.stringify(p))) }) },
        createContact(res) {
          const rn = 'people/c' + (++self.seq);
          const p = JSON.parse(JSON.stringify(res));
          p.resourceName = rn; p.etag = 'e' + self.seq; p.metadata = { sources: [{ type: 'CONTACT', updateTime: self.stamp() }] };
          p.memberships = p.memberships || [];
          self.people[rn] = p;
          return JSON.parse(JSON.stringify(p));
        },
        updateContact(res, rn) {
          const p = self.people[rn];
          if (!p) throw new Error('not found');
          ['names', 'emailAddresses', 'phoneNumbers', 'organizations', 'biographies'].forEach(f => { p[f] = JSON.parse(JSON.stringify(res[f] || [])); });
          p.metadata.sources[0].updateTime = self.stamp();
          return JSON.parse(JSON.stringify(p));
        },
      },
      ContactGroups: {
        list: () => ({ contactGroups: Object.values(self.groups) }),
        create: (res) => { const g = { resourceName: 'contactGroups/' + res.contactGroup.name, name: res.contactGroup.name }; self.groups[g.resourceName] = g; return g; },
        Members: {
          modify(body, group) {
            (body.resourceNamesToAdd || []).forEach(rn => { self.people[rn].memberships = (self.people[rn].memberships || []).concat([{ contactGroupMembership: { contactGroupResourceName: group } }]); });
            (body.resourceNamesToRemove || []).forEach(rn => { self.people[rn].memberships = (self.people[rn].memberships || []).filter(m => m.contactGroupMembership.contactGroupResourceName !== group); });
          },
        },
      },
    };
  }
}

// ---------------- 전역 환경 구성 ----------------

function createEnv() {
  const ss = new FakeSpreadsheet();
  const cal = new FakeCalendar();
  const people = new FakePeople();
  const mails = [];
  const triggers = [];
  const ui = new Proxy({}, {
    get(t, p) {
      if (p === 'ButtonSet') return { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' };
      if (p === 'Button') return { OK: 'OK', YES: 'YES', CANCEL: 'CANCEL', NO: 'NO' };
      if (p === 'alert') return () => 'YES';
      if (p === 'createMenu') return () => { const m = new Proxy({}, { get: () => () => m }); return m; };
      return () => {};
    },
  });
  const triggerBuilder = (fn) => { const b = new Proxy({}, { get(t, p) { if (p === 'create') return () => { triggers.push(fn); return {}; }; return () => b; } }); return b; };
  const env = {
    Date: FakeDate,
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getActiveSheet: () => ss.active,
      openById: () => { throw new Error('no other file'); },
      getUi: () => ui,
      newDataValidation: builder,
      newConditionalFormatRule: builder,
      BorderStyle: { SOLID: 'SOLID' },
    },
    Utilities: {
      formatDate,
      getUuid: () => crypto.randomUUID(),
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'me@example.com' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    CalendarApp: {
      getOwnedCalendarsByName: () => [],
      createCalendar: (name) => ({ getId: () => 'cal-' + name }),
      getDefaultCalendar: () => ({ getId: () => 'me@example.com' }),
    },
    Calendar: { Events: { list: (id, o) => cal.list(id, o), insert: (r, id) => cal.insert(r, id), patch: (r, id, e) => cal.patch(r, id, e), remove: (id, e) => cal.remove(id, e) } },
    People: people.api(),
    MailApp: { sendEmail: (o) => mails.push(o) },
    GmailApp: { search: () => [] },
    ScriptApp: {
      getProjectTriggers: () => [], deleteTrigger: () => {}, newTrigger: triggerBuilder,
      WeekDay: { FRIDAY: 'FRIDAY' }, getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/x/exec' }),
    },
    HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; }, setWidth() { return this; }, setHeight() { return this; } }), createHtmlOutputFromFile: () => ({ setTitle() { return this; } }) },
    DriveApp: {},
  };
  return { env, ss, cal, people, mails, triggers, advance, setNow, now };
}

module.exports = { createEnv, formatDate };

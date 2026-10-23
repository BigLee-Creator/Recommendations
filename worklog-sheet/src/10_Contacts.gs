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
    const start = sh.getLastRow() + 1;
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

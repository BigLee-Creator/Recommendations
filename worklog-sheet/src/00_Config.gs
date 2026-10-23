/**
 * 업무기록 시트 — 설정값과 공용 상수
 *
 * 고객사 > 사업 > 업무 단위로 하루하루 일정·노트를 기록하고
 * 구글 캘린더(업무/할 일/개인)·구글 주소록과 양방향 동기화한다.
 */

const TZ = 'Asia/Seoul';
const APP_NAME = '업무기록';

const SHEET = {
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
  ['이전 연도 파일 ID', '', ''],
  ['다음 연도 파일 ID', '', '새 연도 파일을 만들면 자동 입력'],
  ['웹앱 URL', '', '브리핑 메일의 [완료 처리] 버튼용. 배포 후 자동 감지'],
  ['웹앱 토큰', '', '자동 생성. 바꾸면 이전 메일의 버튼은 동작하지 않음'],
];

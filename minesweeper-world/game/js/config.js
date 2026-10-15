// Balance numbers, run-only skills (level-up cards) and permanent shop upgrades
WM.BAL = {
  baseHP: 3,
  density: [0, 0.12, 0.135, 0.15, 0.165, 0.18], // by city stars
  zoneInner: 0.3, zoneOuter: 0.7, zoneDelta: 0.02, // center -2%p, outskirts +2%p
  xpDirect: 2, xpCascade: 0.5, xpLandmark: 20,
  xpNeed: lv => 30 + 15 * (lv - 1),
  goldDirect: [0.5, 1, 2], goldCascade: [0.3, 1, 1], // [chance, min, max]
  chestRate: 0.015, chestGold: [30, 150],
  landmarkGold: 50,
  starsGold: s => 1 + 0.15 * (s - 1),
  deathKeep: 0.5, insureStep: 0.05,
  conquestPerCell: 0.3,
  flagBonusMinAcc: 0.9, flagBonusMin: 10, flagBonusPer: 0.5,
  newCountry: 500,
  skipGold: 30,
  runway: 2, // return point needs the (2*2+1)^2 = 5x5 area around it opened
  maxSkills: 6,
};

const lvTable = (arr) => (lv) => arr[Math.min(lv, arr.length) - 1];

WM.SKILLS = [
  { id: 'sonar', icon: '📡', name: '음파 탐지', cat: '탐지', rarity: 'epic', max: 5, val: lvTable([40, 35, 30, 25, 20]),
    desc: v => `안전 칸 <em>${v}칸</em>을 열 때마다 열린 영역 근처 지뢰 1개에 자동으로 지뢰 표시` },
  { id: 'probe', icon: '🔍', name: '탐침', cat: '탐지', rarity: 'rare', max: 5, val: lvTable([2, 1, 1, 1, 1]),
    desc: v => `탐침 <em>+${v}개</em>. 탐침으로 고른 칸이 지뢰면 자동 표시, 아니면 안전하게 열림. 레벨업마다 1개 충전` },
  { id: 'vest', icon: '🛡️', name: '방탄 조끼', cat: '생존', rarity: 'rare', max: 5, val: lvTable([150, 130, 110, 90, 70]),
    desc: v => `최대 실드 <em>+1</em>, 즉시 1 충전. 안전 칸 <em>${v}칸</em>마다 실드 1 재충전` },
  { id: 'vital', icon: '❤️', name: '강철 체력', cat: '생존', rarity: 'common', max: 3, val: lvTable([1, 1, 1]),
    desc: () => `최대 HP <em>+1</em>, HP 1 회복` },
  { id: 'medic', icon: '🩹', name: '응급 처치', cat: '생존', rarity: 'common', max: 5, val: lvTable([0.2, 0.3, 0.4, 0.5, 0.6]),
    desc: v => `레벨업할 때 <em>${Math.round(v * 100)}%</em> 확률로 HP 1 회복` },
  { id: 'dud', icon: '🧯', name: '불발탄', cat: '생존', rarity: 'common', max: 5, val: lvTable([0.1, 0.15, 0.2, 0.25, 0.3]),
    desc: v => `지뢰를 밟아도 <em>${Math.round(v * 100)}%</em> 확률로 불발 (피해 없음)` },
  { id: 'para', icon: '🪂', name: '낙하 탐사', cat: '생존', rarity: 'epic', max: 5, val: lvTable([100, 80, 60, 50, 40]),
    desc: v => `열린 영역과 떨어진 칸을 열었는데 지뢰면 피해 없이 지뢰 표시. 재사용까지 안전 칸 <em>${v}칸</em>` },
  { id: 'midas', icon: '💰', name: '황금 손', cat: '경제', rarity: 'common', max: 5, val: lvTable([0.2, 0.35, 0.5, 0.65, 0.8]),
    desc: v => `골드 획득 <em>+${Math.round(v * 100)}%</em>` },
  { id: 'hunter', icon: '🗝', name: '보물 사냥꾼', cat: '경제', rarity: 'rare', max: 5, val: lvTable([3, 4, 5, 6, 8]),
    desc: v => `열린 칸에서 <em>${v}칸</em> 안의 보물 상자 위치 표시, 상자 골드 +50%` },
  { id: 'learn', icon: '📘', name: '빠른 학습', cat: '성장', rarity: 'common', max: 5, val: lvTable([0.15, 0.25, 0.35, 0.45, 0.6]),
    desc: v => `경험치 획득 <em>+${Math.round(v * 100)}%</em>` },
  { id: 'chain', icon: '⚡', name: '연쇄 반응', cat: '성장', rarity: 'rare', max: 5, val: lvTable([0.7, 0.9, 1.1, 1.3, 1.5]),
    desc: v => `연쇄로 열린 칸의 경험치 0.5 → <em>${v}</em>` },
];
WM.SKILL = Object.fromEntries(WM.SKILLS.map(s => [s.id, s]));
WM.RARITY = { common: { w: 1, label: 'COMMON' }, rare: { w: 0.6, label: 'RARE' }, epic: { w: 0.3, label: 'EPIC' } };

WM.UPGRADES = [
  { id: 'hp', icon: '❤️', name: '강인한 체력', max: 3, cost: lv => 600 * 2 ** lv, desc: lv => `시작 HP +1 (현재 ${WM.BAL.baseHP + lv})` },
  { id: 'shield', icon: '🛡️', name: '시작 실드', max: 2, cost: lv => 900 * 2 ** lv, desc: lv => `런 시작 시 실드 +1 (현재 ${lv})` },
  { id: 'gold', icon: '💰', name: '골드 감각', max: 10, cost: lv => Math.round(250 * 1.4 ** lv / 10) * 10, desc: lv => `골드 획득 +10% (현재 +${lv * 10}%)` },
  { id: 'xp', icon: '📘', name: '빠른 학습', max: 10, cost: lv => Math.round(300 * 1.4 ** lv / 10) * 10, desc: lv => `경험치 +8% (현재 +${lv * 8}%)` },
  { id: 'reroll', icon: '🎲', name: '행운의 주사위', max: 3, cost: lv => 1500 * 2 ** lv, desc: lv => `레벨업 다시 뽑기 +1 (현재 ${1 + lv}회)` },
  { id: 'safe', icon: '🎯', name: '안전한 첫 발', max: 1, cost: () => 800, desc: lv => `첫 클릭 안전 범위 ${lv ? '5×5' : '3×3 → 5×5'}` },
  { id: 'probe', icon: '🔍', name: '탐침 키트', max: 4, cost: lv => Math.round(1100 * 1.6 ** lv / 10) * 10, desc: lv => `런 시작 시 탐침 +1 (현재 ${lv}개)` },
  { id: 'insure', icon: '🧳', name: '보험 가입', max: 5, cost: lv => Math.round(2000 * 1.5 ** lv / 10) * 10, desc: lv => `사망 시 골드 보존 ${50 + lv * 5}% → ${55 + lv * 5}%` },
];

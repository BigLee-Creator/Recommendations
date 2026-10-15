# 월드 마인스위퍼 (MVP)

실제 세계지도를 500m 격자로 나눈 지뢰밭에서 도시 하나를 골라 탐험하는 로그라이트 지뢰찾기. 기획은 [PLAN.md](PLAN.md).

## 실행
- **안드로이드**: `dist/world-minesweeper.apk`를 폰에 복사해 설치 (출처를 알 수 없는 앱 설치 허용 필요). 오프라인으로 동작.
- **PC**: `game/index.html`을 브라우저로 열기 (서버 불필요).

## 조작
| | PC | 모바일 |
|---|---|---|
| 구역 오픈 | 왼쪽 클릭 | 짧게 탭 |
| 지뢰 표시 | 오른쪽 클릭 | 길게 누르기 |
| 줌 | 마우스 휠 | 두 손가락 벌리기/좁히기 |
| 화면 이동 | 드래그 | 스와이프 |

열린 숫자 칸을 누르면 주변을 한 번에 여는 기능은 설정에서 끌 수 있음.

## 구성
| 경로 | 내용 |
|---|---|
| `game/` | 게임 본체 (HTML/CSS/JS, 빌드 불필요) |
| `game/js/data.js` | 도시별 500m 육지 격자·랜드마크 (생성 파일) |
| `tools/build-data.mjs` | Natural Earth 해안선 → `data.js` 생성 (`cd tools && npm install && npm run data`) |
| `android/` | WebView 래퍼 앱 + `build-apk.sh` (Gradle·Android SDK 없이 APK 빌드) |
| `dist/` | 빌드된 APK |

## APK 다시 빌드
```
android/build-apk.sh            # Java 17+, curl, zip 필요. 빌드 도구는 android/.tools 에 자동 다운로드
VERSION_NAME=0.2.0 VERSION_CODE=2 android/build-apk.sh   # 업데이트 배포 시 버전 올리기
```
서명은 uber-apk-signer의 디버그 키라 개인 설치용. 같은 키로 빌드한 새 버전은 기존 앱 위에 덮어 설치됨 (진행 데이터 유지). 플레이스토어 배포 시에는 별도 릴리스 키 필요.

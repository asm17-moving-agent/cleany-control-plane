# 홈 작업 공간 구현 및 검증

2026-09-08. 선택한 상용 화면 시안의 배치를 기존 Dashboard에 구현했다.
가상의 A/B 사무실 대신 기존 18층 도면을 사용하고, 현재 API 계약 안에서 연결했다.
동작과 실행 명령은 [Dashboard README](../../apps/dashboard/README.md)를 따른다.

## 구조

- `AppShell`: 상단 홈/작업/결과/로봇 메뉴, 층 선택, 연결 상태, 알림, 운영자 메뉴.
- `HomePage`: 상시 로봇 목록, 시설 지도, 선택된 좌석의 요청 패널, 네 가지 업무 요약.
- `FacilityMap`: PNG·정적 SVG·좌석·로봇 마커의 공통 좌표 변환과 확대·이동·맞춤.
- `seat-layout`: API의 row/grid_column과 D-HUB 48개 실제 좌석 ID의 대응.
- `SeatMissionPanel`: 지원하는 요청 필드와 우선순위, 중복 제출 방지, 재시도 키 유지.
- `home-summary`: 즉시 조치/진행/대기/검토/완료 판정의 공통 함수.
- `ResultsPage`, `RobotsPage`, `MissionsPage`: 홈 진입점과 URL 필터에 대응하는 별도 화면.

배터리와 실시간 좌표는 미연동이고 지도 마커는 예시 위치다. 로봇 지정·메모·
검토 완료 처리·완료 시각 등의 Backend 계약은 추가하지 않았다.

## 실행한 검증

| 검증 | 결과 |
| --- | --- |
| Vitest | 6개 파일, 25개 테스트 통과 |
| TypeScript 및 Vite production build | 통과 |
| OpenAPI snapshot 및 생성 타입 계약 검사 | 차이 없음 |
| Backend contract 단위 테스트 | 2개 통과 |
| 네이티브 Firefox / 실제 Mock Backend | 좌석 선택·확대·드래그 후 seat-12, HIGH 요청 1건 생성, 생성된 요청 상세 이동 확인 |
| 네이티브 Firefox / 별도 API fixture | ERROR/OFFLINE, 검토·완료 분류, URL 필터, 로딩·빈 목록·API 오류·새로고침 복구·같은 키로 재시도 확인 |
| 네이티브 Firefox / 화면 배치 | 큰 창과 작은 창에서 왼쪽 목록·오른쪽 패널·하단 요약 유지, 페이지 넘침 없음 |

시각 검증은 Firefox를 실제 niri 창으로 열고 수행했다. 1.5배 디스플레이에서
최종 측정한 콘텐츠 영역은 1920×1081 및 1366×767 CSS px였다. 1366px 창에서도
요청 필드 높이와 스크롤 높이가 모두 459px로, 폼 안내와 버튼이 함께 보였다.
브라우저 확대율은 100%이며 지도 자체 확대율은 별도로 표시한다.

동작은 Firefox Marionette로 실행하고, 캡처는 `niri msg action screenshot-window`
명령으로 저장했다. 관측 자료의 가짜 사진이나 실시간 경로를 추가하지 않았다.
검증 중 생성한 Mission은 로컬 Mock Dispatcher의 작업이며 실제 로봇 실행은 아니다.

기존 Playwright 시나리오 5개는 새 UI에 맞춰 갱신하고 목록 로딩을 확인했다.
이번 브라우저 검증에서는 Playwright/Chromium을 실행하지 않았다.

활성 구역 맞춤 도입 당시 초기 지도는 흰색 작업 구역의 경계에 맞춰 확대했고, 창 크기가 바뀌면 맞춤 비율을
다시 계산한다. `활성 구역`과 `전체 보기`로 범위를 전환할 수 있다. 이 변경 후
지도 단위 테스트 4개, 계약 검사와 production build를 재실행해 통과했다.
네이티브 Firefox의 1908×1015 및 1366×767 CSS px 화면에서 초기 활성 구역과
48개 좌석이 모두 들어오고 페이지 넘침이 없음을 확인했다. 좌석 12번 선택 후
두 범위를 전환해도 해당 좌석의 요청 패널이 유지됨을 확인했다.

좌석 표식을 사각형으로 통일한 뒤 지도·좌표 테스트 6개, 계약 검사와 production
build가 통과했다. Firefox에서 회의실 28개와 D-HUB 48개 표식의 변경, 번호와 표식의
중앙 정렬, 12번 좌석 선택 시 청록색 강조와 요청 패널 연결을 확인했다.

## 최종 niri 캡처

최신 화면은 모니터 기호를 제거하고 책상 중앙에 큰 번호만 표시한다.

현재 책상은 다시 제시된 2번 시안의 가로형 비율에 맞춰 42×28(3:2)을 사용한다.
번호 굵기와 모니터 받침 형태를 조정하고, 지도 확대 시에도 책상 테두리가 지나치게
굵어지지 않게 했다. 의자·키보드는 생략하고 초기 125% 구도를 유지한다.

책상 크기는 지도 좌표 기준 32×25에서 38×38로 확대했고, 가로·세로 묶음 사이
간격을 줄였다. 번호도 기본 9에서 11로 키웠다. Firefox에서 48개 책상이 모두
보이며 책상끼리 또는 예시 로봇 마커와 겹치지 않고, 12번 선택이 요청 패널로
연결됨을 확인했다.

현재 화면은 추가 요청에 따라 회의실과 D-HUB의 의자를 제거하고 책상과 모니터만
표시한다. Firefox에서 48개 책상·모니터, 초기 125% 배율 및 12번 책상 선택을
확인했으며 관련 단위 테스트 6개와 계약 검사가 통과했다.

선택된 2번 시안을 적용해 D-HUB를 번호가 있는 개인 책상 48개와 작은 의자로 분리했다.
모니터는 도식 기호로 표시하며, 추가 요청에 따라 키보드는 생략했다. API 좌석 ID는
각 책상 면의 선택 영역에 대응한다. 책상·의자 위치와 선택 관련 테스트 7개 및 계약
검사를 통과했고, Firefox에서 책상 선택 후 해당 좌석의 요청 패널이 열림을 확인했다.

현재 초기 화면은 사용자 지정 구도에 따라 전체 맞춤 대비 125% 확대와 도면 상단
정렬을 사용한다. 사각형 좌석과 활성 구역 맞춤 버튼은 유지한다. Firefox에서
125% 배율, 상단·가로 중앙 정렬, 48개 좌석 노출을 확인했다.

- [현재 초기 화면: 책상 중앙에 번호만 표시](assets/home-implementation-20260908/17-number-only-desks.png)
- [가로형 비율 적용 당시](assets/home-implementation-20260908/15-reference-desks.png)
- [시안 비교용 실제 지도 확대 화면](assets/home-implementation-20260908/16-reference-desks-detail.png)
- [정사각형 확대안 검토 당시](assets/home-implementation-20260908/14-larger-desks.png)
- [의자를 제거한 당시의 책상과 모니터](assets/home-implementation-20260908/13-desks-without-chairs.png)
- [독립 책상과 모니터 적용 당시, 125%](assets/home-implementation-20260908/10-desk-modules.png)
- [개인 책상 선택과 요청 패널](assets/home-implementation-20260908/11-desk-module-selected.png)
- [1366px 창의 독립 책상 배치](assets/home-implementation-20260908/12-desk-modules-compact.png)
- [125% 초기 구도 설정 당시](assets/home-implementation-20260908/07-default-125-percent.png)
- [좌판 음영과 등받이 선을 더한 초기 화면](assets/home-implementation-20260908/08-seat-cushions.png)
- [좌석 형태를 다듬은 선택 화면](assets/home-implementation-20260908/09-seat-cushions-selected.png)
- [사각형 좌석 표식으로 통일한 초기 화면](assets/home-implementation-20260908/05-rectangular-seats.png)
- [사각형 좌석 선택과 작업 요청 패널](assets/home-implementation-20260908/06-rectangular-seat-selected.png)
- [흰색 활성 구역에 초점을 맞춘 초기 화면](assets/home-implementation-20260908/04-active-area-default.png)
- [숫자 배경을 제거하고 의자 SVG 위에 좌석 번호만 표시한 화면](assets/home-implementation-20260908/03-seat-numbers-only.png)
- [1920px 창: 좌석 선택 후 전체 지도 보기](assets/home-implementation-20260908/01-request-wide.png)
- [1366px 창: 좌석 선택 및 요청 폼](assets/home-implementation-20260908/02-request-compact.png)

캡처에는 Firefox 창 장식과 niri 그림자가 포함되므로 PNG 픽셀 크기는 콘텐츠 영역과
다르다. 개발 화면은 `http://127.0.0.1:5173/`에서 확인한다.

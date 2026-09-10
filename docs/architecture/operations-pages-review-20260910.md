# 작업·결과·로봇 페이지 정비 — 2026-09-10

홈 화면과 같은 정보 밀도, 네이비 글자, 청록 선택 상태, 흰 표면과 회색 바깥 여백을
세 운영 페이지에 적용했다. 별도 워크트리에서 구현한 뒤 `feat/facility-dashboard`에 통합했다.

| 페이지 | 워크트리 / 브랜치 | 주요 구성 |
|---|---|---|
| 작업 | `../feat-operations-missions` / `feat/operations-missions` | 건수 필터, 요청 목록, 진행 단계와 취소를 제공하는 상세 |
| 결과 | `../feat-operations-results` / `feat/operations-results` | 결과 목록, 검토 안내, 작업 전·후 자료 비교 |
| 로봇 | `../feat-operations-robots` / `feat/operations-robots` | 짧은 카드 목록, 상태 정보, 현재 작업, 3D 외형 미리보기 |

## 공통 구현

- `OperationsPage` / `operations-page.css`: 최대 너비 2040px, 96px 헤더,
  필터 탭과 건수, 목록·상세 표면, 빈 상태와 상태 배지.
- `panel-motion.ts`: 홈과 동일한 200ms 전환. 선택한 상세는 대기 없이 갱신되며
  작은 이동과 페이드로 표시된다. 모션 감소 설정에서는 전환을 사용하지 않는다.
- 기존 `RobotStateBadge`, `BatteryStatus`, `InfoRow`, `MissionProgress`, `WorkspaceMessage`를 재사용한다.
- 페이지가 오류 안내를 담당하므로 상위 Shell은 동일한 오류 배너를 중복 표시하지 않는다.
- 이전 페이지에서만 사용하던 CSS 규칙은 제거했다.

## 데이터 경계

실제 개발 API 확인 당시 작업 이력은 없었고 로봇은 `cleany-01` 한 대, `IDLE` 상태였다.
배터리는 계약에 없으므로 미연동으로 표시한다. 3D는 외장 시안이며 실시간 자세가 아니다.

채워진 화면은 별도 Firefox 프로필에서 `fetch` 응답을 교체한 화면 검증용 예시다.
작업 7건, 로봇 3대이며 캡처 오른쪽 아래에 예시 데이터라고 표시했다.
검증용 취소 요청은 이 브라우저 안에서 처리했으며 실제 Backend에 작업을 생성하거나
취소하지 않았다. 제품 코드에 검증용 API 우회나 예시 데이터 자동 주입을 추가하지 않았다.

관측 참조는 URL과 불투명 식별자를 구분한다. 이미지 확장자가 있는 자료는 미리보기를
제공하고, 읽을 수 없으면 원본 링크와 대체 안내를 유지한다. 참조가 없을 때 사진이나
처리된 물체 수를 만들어 표시하지 않는다. 결과를 열어도 검토 건수는 감소하지 않는다.

## 실행한 검증

- 변경한 취소 동작에 관한 단위 테스트 2개 추가: 응답 전 중복 차단·실패 후 재시도,
  URL로 연 종료 요청에 취소 버튼을 제공하지 않는지 확인.
- 대시보드 Vitest **66개 통과**. 기존 64개 포함.
- `pnpm contracts:check`, 대시보드 타입 검사·프로덕션 빌드, `git diff --check` 통과.
- 네이티브 Firefox에서 1440px / 1100px 너비로 페이지를 열고 niri의
  `screenshot-window`를 사용해 캡처·검토했다. 가로 넘침 없음.
- 캡처에서 찾은 우선순위 라벨 줄바꿈을 수정하고, 결과 관측 영역 높이를 줄였다.
  요청자·우선순위·ID는 가로로 묶어 상세의 빈 공간을 줄였다.
- Firefox에서 단계·우선순위 필터, 선택 URL, 취소 중복 차단·실패·재시도,
  결과 검토 건수 유지, 잘못된 이미지 대체 표시와 안전하지 않은 참조 비활성화를 확인했다.
- 로봇 선택 시 상세·오프라인 안내가 함께 바뀌고, 로봇 페이지에서 나가면 canvas가
  제거되는 것을 확인했다. 실제 API 화면과 예시 화면에서 3D `ready`를 확인했다.
- Firefox 모션 감소 설정에서 상세 애니메이션과 카드 전환이 꺼지는 것을 확인했다.
- API 실패 시 오래된 결과 목록이 숨겨지고 오류 안내가 한 번만 표시되며,
  새로고침 후 목록이 복구되는 것을 확인했다.

Playwright 시나리오는 변경된 작업·3D 선택자만 갱신했다. 이번 시각 검증은 Playwright
실행 결과가 아니라 실제 Firefox/niri 검증이다. 기존 3D 번들의 500kB 초과 빌드 경고는 남아 있다.

## 최종 캡처

이미지 파일은 [캡처 폴더](assets/operations-pages-review-20260910/)에 모았다.

- [실제 API: 로봇 1대](assets/operations-pages-review-20260910/01-robots-live.png)
- [작업: 예시 데이터](assets/operations-pages-review-20260910/02-missions-fixture.png)
- [결과: 예시 데이터](assets/operations-pages-review-20260910/03-results-fixture.png)
- [로봇: 예시 데이터](assets/operations-pages-review-20260910/04-robots-fixture.png)
- [결과: 좁은 창](assets/operations-pages-review-20260910/05-results-narrow.png)
- [작업: 좁은 창](assets/operations-pages-review-20260910/06-missions-narrow.png)
- [로봇: 좁은 창](assets/operations-pages-review-20260910/07-robots-narrow.png)

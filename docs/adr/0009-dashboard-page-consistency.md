# ADR 0009 — 페이지 틀과 도메인 표시 규칙 통합

- 상태: 구현
- 날짜: 2026-11-17
- Before: `5affee2` (`refactor/preview-shadcn`)

## 문제

Button과 색상 토큰을 공유해도 홈은 투명 헤더와 개별 카드, 로봇은 전체 흰 박스 안의
카드와 중첩 패널, 설정은 별도 폭/제목 배치를 사용했다. 같은 로봇 카드와 작업 우선순위도
페이지별로 다른 크기·입력 방식을 사용했다. 프리미티브만으로 페이지 통일성을 보장할 수 없다.

## 결정

`PageShell`을 도입하여 standard1440px(홈/설정), wide1760px(작업/로봇), 공통72px
투명 헤더·여백을 소유한다. 작업/로봇은 목록과 상세가 내부 스크롤되는 workspace flow다.
설정 폼은 가독성을 위해680px를 유지한다. 지도 전체 canvas, 로그인, 모델 전용 화면은
목적에 따른 예외이며 홈의2:1/5:5와 날짜 중심 작업 구성을 유지한다.

로봇 상세는 운영 정보 우선으로 재배치하고 모델을 작은 미리보기로 둔다. 수동 조종 카드의
카메라와 입력을 데스크톱에서 나란히 놓되 `ManualControlPanel` 구현과 명령 경계는 유지한다.
지도와 로봇 페이지는 `RobotSummaryContent`를 공유한다. button/Link의 이벤트와 의미는
기존 소유자에 남긴다. 지도/작업의 우선순위는 `MissionPriorityField`를 공유하며 상태 변경과
idempotency key 수명은 기존 도메인 폼이 관리한다.

layer 선언보다 먼저 컴포넌트 stylesheet가 평가되면 legacy가 components를 덮을 수 있다.
따라서 `main.tsx`의 첫 import에서 글로벌 stylesheet를 로드하여 layer 순서를 먼저 확립한다.
feature의 상위 레이아웃 `:has()` 재정의 대신 AppShell의 명시적 flow를 사용한다.

## 결과와 검증

새 의존성·API·schema·Provider·로봇 내부 상태 변경은 없다. 공통 틀을 바꾸면 여러 화면에
영향을 주므로 페이지 간 computed style과3개 viewport의 배치를 테스트한다. 실제3D 상호작용,
카메라 상태, 조종 release/blur/navigation 정지는 전용 기능 테스트로 유지한다.

Before는45개 원본 PNG를 보존한다. 의도한 변화와 예상하지 않은 손상을 비교 보고서에서
구분한 후 baseline을 갱신하고 동일 환경의0픽셀 시각 검사를 실행한다. 표시용 Mock과 실제
하드웨어 검증을 구분한다. 세부 규칙은 [디자인 시스템](../architecture/dashboard-design-system.md)을 따른다.

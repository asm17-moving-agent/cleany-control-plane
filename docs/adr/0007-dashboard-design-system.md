# ADR 0007 — Cleany UI의 공통 시각 규칙과 선택적 shadcn/ui 도입

- 상태: 구현
- 날짜: 2026-11-16
- 기준: `refactor/telemetry-camera-preview`의 미커밋 작업까지 포함한
  snapshot `16bc31e1275fe0db19dc3e8758feb344163b9c81`

## 문제

홈, 운영 목록, 설정, 로그인과 새 지도 편집기는 서로 다른 시점에 만들어져 버튼 높이,
Radius, 폰트, 패널 여백과 상태 표시 규칙이 달랐다. 단순한 wrapper 교체로는 실제 화면의
일관성을 개선할 수 없다. 반면 지도와 로봇 제어를 범용 UI로 다시 만드는 비용은 크다.

## 결정

색상·타이포그래피·컨트롤 크기·surface·상태 표시를 공통 토큰으로 통일한다.
일반 컨트롤은 40px, 지도 도구는 32px, 로그인/요청 주행동은 48px로 구성한다.
로그인 일러스트, 지도 좌표·배치, 조종 입력의 기하와 상호작용은 목적에 맞는 예외로 유지한다.

shadcn/ui의 Button, Input, NativeSelect, DropdownMenu, Switch를 선택적으로 가져와
Cleany 스타일로 조정했다. Button은 CVA와 Radix Slot, 메뉴와 switch는 Radix 동작을 사용한다.
사용하지 않는 메뉴 종류나 아이콘 라이브러리는 포함하지 않는다. upstream URL과 SHA-256,
MIT 라이선스는 `apps/dashboard/src/components/ui/`에 보관한다.

프리미티브 위에 Surface, PageHeader, PanelHeader, Field, StatusBadge, Notice를 둔다.
도메인 컴포넌트의 상태 판단과 통신은 유지하고 공통 스타일 역할만 적용한다.
CSS layer 순서는 `theme → legacy → components → utilities`다. 기존 CSS는 legacy에
격리하고 시각 규칙은 components에서 소유한다. Tailwind Preflight는 도입하지 않는다.
전면 CSS 재작성 없이 기존 지도/패널 배치를 보존하기 위한 점진적 경계다.

## 비용과 결과

메뉴는 키보드 탐색, Escape, 외부 클릭, 포커스 복귀를 지원하고 설정 switch는 기존
boolean 폼과 명시적 저장을 유지한다. React/Tailwind/Vite 등의 기존 해석 버전은 유지하며
`latest` specifier를 현재 lock 버전으로 고정했다.

메인 JS의 gzip 크기는 동일 Python gzip 측정 기준 약 151 kB에서 191 kB로 증가했다.
3D 모델은 기존 lazy chunk다. shadcn 도입은 무료 추상화가 아니므로 이후 컴포넌트 추가도
실제 반복과 접근성 이득이 있을 때만 한다. Vite의 500 kB chunk 경고는 유지되며 한도를
높여 숨기지 않는다.

현재의 이득은 **공통 토큰/역할 규칙과 검증된 메뉴·switch 동작**에서 나온다.
좌석 지도, joystick, 작업 단계, 결과 사진을 shadcn 컴포넌트로 전면 교체할 이유는 없다.

## 검증 경계

고정 fixture의 Before/After 비교와 개선 후 스냅샷 회귀를 분리한다.
기존 화면과의 차이는 검토 자료이며 실패 기준이 아니다. 개선 후 동일 환경에서의
회귀는 0픽셀 차이로 검사한다. 실시간/수동 조종/카메라/3D는 별도 기능 E2E로 확인한다.
상세 명세와 실행 방법은 [Dashboard 디자인 시스템](../architecture/dashboard-design-system.md)을 따른다.

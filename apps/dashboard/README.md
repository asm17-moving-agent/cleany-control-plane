# Scenario Dashboard

React와 TypeScript로 구현하고 Mock Backend와 연결해 관제 vertical slice를 검증하는
Web UI다. Vite를 build/dev server로, React Router를 화면 이동에, TanStack Query를
HTTP·SSE server state 관리에 사용한다.

홈은 대상 시설의 18층 비상안내도를 정규화한 대화형 SVG 지도를 사용한다. 지도에서
업무·공용 구역을 단일 선택하고 `ZONE` target으로 Mission을 요청한다. 원본 사진은
런타임 asset으로 사용하지 않으며, 좌표와 구역 ID는 `features/facility-map/`에서
관리한다. 실제 로봇 좌표계 및 금지 구역과의 정합은 Robot Edge 연동 전에 별도로
확정해야 한다.

Dashboard shell은 기존 5개 운영 내비게이션을 유지한다. 홈은 좌측 운영 요약,
중앙 시설 지도, 우측 시나리오 제안과 빠른 제어, 하단 Mission 요청으로 구성한다.
예약과 충전 이동처럼 계약이 없는 제어는 비활성으로 표시한다.

좌측 내비게이션은 다음 화면을 제공한다.

- 홈: 시설 구역 선택, Mission 요청, 최근 Mission과 시나리오 제안
- 미션: 단계·우선순위 필터와 전체 Mission 상태 및 취소
- 모니터링: SSE 연결, Robot heartbeat, 좌석 사용률, 성공률과 최근 활동
- 로봇: 등록 Robot의 연결 정보와 현재 할당 Mission
- 설정: polling 주기, 실시간 표시, 기본 우선순위와 완료 알림

탭은 `/missions`, `/monitoring`, `/robots`, `/settings` URL로 유지한다. 설정값은 아직
서버 설정 계약이 없으므로 브라우저 `localStorage`에만 저장하며, 기본 우선순위와
SSE 오류 시 보조 polling 주기에 반영한다.

## 개발 환경

```bash
pnpm install
pnpm dev
```

Vite Dashboard는 [http://127.0.0.1:5173](http://127.0.0.1:5173)에서 실행되며
`/api` 요청을 [http://127.0.0.1:8080](http://127.0.0.1:8080)으로 전달한다.

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Color tokens

화면 색상은 `src/styles.css`의 Tailwind `@theme`와 compatibility CSS의 `:root`
token을 사용한다. Background/Surface/Border, Primary, Text와 상태색을 컴포넌트에
별도 하드코딩하지 않는다. 시설 SVG 지도와 대시보드 layout은 feature 전용 CSS를
유지한다.

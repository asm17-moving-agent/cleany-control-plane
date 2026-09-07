# Scenario Dashboard

React와 TypeScript로 구현하고 Mock Backend와 연결해 관제 vertical slice를 검증하는
Web UI다. Vite를 build/dev server로, React Router를 화면 이동에, TanStack Query를
HTTP·SSE server state 관리에 사용한다.

홈은 편집한 18층 가로형 도면 PNG를 고정 architectural base로 사용한다. 구역명과
Google Material Symbols의 엘리베이터 픽토그램은 별도 SVG layer에 두어 선명도와
좌표 편집 가능성을 유지한다. 그 위에 경로 layer와 HTML Robot marker를 겹친다.
구역명은 현재 정보로만 표시하고 구역 click target은 렌더링하지 않는다. 좌석과
Mission target 상호작용은 좌석 배치 좌표를 확정한 뒤 지도 위에 직접 추가한다.
Home의 왼쪽 패널은 `/api/robots` 응답을 목록으로 표시하고 카드나 지도 marker를
선택하면 해당 Robot 상세로 전환한다. 좌석을 선택하기 전에는 오른쪽 패널을 숨기고,
선택 뒤에만 Mission 요청 drawer를 연다. pose, 경로와 battery는 아직 contract에 없으므로
시나리오 위치 또는 연동 전 상태로 구분해 표시한다. 사진 안내도를 기준으로 복원한
벽체 좌표는 CAD/BIM 원본을 확보하면 교체 검증해야 한다.
이미지 좌표와 구역 ID는 `features/facility-map/`에서 관리한다. 실제 로봇 좌표계 및
금지 구역과의 정합은 Robot Edge 연동 전에 별도로 확정해야 한다.

Dashboard shell은 기존 5개 운영 내비게이션을 유지한다. 홈은 왼쪽 Robot 목록 및
상세, 중앙 시설 지도와 상단 alert popup으로 구성한다. 오른쪽 Mission drawer는 좌석을
선택했을 때만 표시한다. 계약에 없는 telemetry와 제어를 실제 값처럼 표시하지 않는다.

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

Node.js와 pnpm 설치 및 pnpm 없이 기존 production build를 실행하는 방법은 루트
[`README.md`](../../README.md)의 `pnpm이 없을 때`를 따른다.

Backend를 먼저 실행한다.

```bash
uv sync --project apps/backend --extra dev
uv run --project apps/backend python apps/backend/run.py
```

다른 터미널에서 Dashboard 개발 서버를 실행한다.

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
별도 하드코딩하지 않는다. 시설 artwork, SVG 선택 overlay와 대시보드 layout은 feature
전용 component·CSS를 유지한다.

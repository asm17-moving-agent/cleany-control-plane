# Cleany Dashboard

미로그인 상태의 `/`와 `/login`은 로그인 화면을 표시한다. 로그인하면 매장 대시보드로 연결한다.
기존 `/welcome` 링크는 `/login`으로 이동한다. 로그인·첫 비밀번호 변경 화면은 모바일도 지원한다. 오른쪽 위 지구본에서 해당 화면의
한국어·영어를 선택하며 브라우저에 선택을 저장한다. 배경 선화는 `AuthBackdrop.tsx`의 SVG다.

회사가 발급한 계정으로 로그인하고 첫 접속에서 비밀번호를 변경한다. 고객의 시설 목록을
선택하며 시설 전환·로그아웃 때 조회 cache와 실시간 구독을 정리한다. 예시/촬영 모드도
로그인이 필요하다. [계정 발급과 로컬 실행](../backend/README.md#계정-발급과-첫-실행)을 따른다.

## 촬영 모드와 실시간 위치 연동

- `/?demo=0`: backend snapshot/SSE의 위치와 yaw를 표시한다. 위치가 없으면
  예시 위치를 대신 표시하지 않는다. 현재 telemetry 대상은 `cleany-01` 하나다.
- `/?recording=1`: 실제 API 요청 없이 좌석 요청, 이동 경로, 제자리 회전,
  작업 및 복귀를 촬영용으로 재생한다. 복도 좌표는 Gazebo 정합 지도에 맞춘다.
- `/?demo=1&recording=0`: 촬영 모드에서 일반 예시 데이터 모드로 전환한다.
  모드는 탭 세션에 유지되며 `/?demo=0` 또는 상단 실제 데이터 복귀로 해제한다.
- 실제 모드의 위치/yaw 동기화와 미션 명령 전달은 별개다. 미션은 여전히
  Mock Dispatcher에서 처리하며 이 병합으로 Nav2 명령 전달이 추가되지는 않는다.

병합 검증: [2026-09-28 검증 기록](../../docs/architecture/dashboard-telemetry-merge-20260928.md).

React·TypeScript와 Vite로 구현한 관제 UI다. React Router로 화면을 이동하고,
TanStack Query로 HTTP 응답과 SSE 갱신을 관리한다. 현재 Backend는 Mock Dispatcher를
사용한다.

## 홈 구성

상단 메뉴, 상시 로봇 목록, 좌석 지도와 선택 패널을 배치한다.
지도 헤더 높이는 96px이며 제목과 사용 안내, 가로 점유 막대를 표시한다.
점유 막대는 전체 좌석을 사용 중·빈 좌석·미확인으로 나누며 미확인은 사선 무늬로 구분한다.
모든 상태가 확인되면 점유율을, 미확인이 있으면 확인된 점유 수 / 전체 좌석 수를 표시한다.
좌석 검색과 원그래프는 제거했다. 지도 좌석을 클릭하면 기존 요청 패널이 열린다.
이전의 4개 상태 카드와 의자 장식, 카드 필터는 홈에서 제거했다.
좌측 로봇 목록은 260px(1280px 이하 220px), 지도 위 요청 패널은 340px이다.
로봇·요청 패널은 지도 위를 덮으며 전환 시 동시에 닫힘/열림 애니메이션을 적용한다.
로봇 목록과 지도를 포함한 `home-workspace-body`에 최대 너비 2040px와 중앙 마진을 적용한다.
좁은 화면에서는 전체 너비를 사용하며 상단 전역 메뉴는 전체 너비를 유지한다.
지도는 작업 영역에서 로봇 목록 오른쪽의 남은 너비를 전부 사용한다. 지도 개별 최대 너비, 바깥 패딩,
둥근 지도 컨테이너를 추가하지 않고 기존 배치를 유지한다. 지도는 헤더 아래 남은 화면 높이를
채우고 범례는 화면 하단에 배치한다. 하단 업무 요약 영역은 제거했으며 요청과 결과는
상단 메뉴에서, 즉시 조치·결과 검토는 상단 알림에서 진입한다.
홈 최소 너비는 1024px이다.

지도는 기존 18층 PNG와 정적 SVG(가구·구역명·엘리베이터), HTML 좌석·로봇 레이어를
사용한다. 모든 레이어가 같은 좌표 변환을 공유한다. API의 `row`와 `grid_column`을
`features/facility-map/seat-layout.ts`에서 D-HUB 48개 좌석에 대응한다.
실제 로봇 좌표계 및 금지 구역과의 정합은 Robot Edge 연동 전에 별도로 확정해야 한다.

D-HUB 도면은 Gazebo의 12.26m × 10.94m 방을 실제 raster wall 중심
`x=576..976, y=8`에 맞춘 동일 XY 스케일(`400/12.26`)로 표시한다. 하단 벽은
`y≈364.933`이며 기존 `y=413`에서 약 48.067만큼 올려 하단 외부 통로를 넓혔다.
두 출입구의 X 위치·폭과 우하단 1/4원 모서리는 유지한다. 원본 PNG는 변경하지 않고
SVG로 기존 하단 벽선을 가린 뒤 새 벽선을 그린다. 책상 면은
Gazebo의 1.20m × 0.77m, 의자는 책상 바깥쪽 0.385m 중심의 단순 표시 footprint다.
SPACE 책상 상수와 위치는 이 변환을 공유하지 않는다. 벽 출입구는 현재 웹 도면 표현만
제공하며 실제 통행/금지구역 ROS 인터페이스는 구현하지 않는다. 지도 로봇은 수신한
Gazebo world 위치를 같은 변환으로 표시하며 첫 위치 수신 전에는 표시하지 않는다.
좌표는 `cleany_gazebo_sim/config/study_cafe/study_cafe_layout.yaml` 및
`world/generator.py`에서 수동으로 옮겼으며 자동 동기화되지 않는다.
Gazebo는 개구부 없는 직사각형 벽이므로 출입구·둥근 모서리까지 동일한 형상은 아니다.
의자 표시는 좌판만 단순화한 것으로 바퀴·등받이의 충돌 외곽을 나타내지 않는다.

D-HUB는 2번 시안의 독립 책상 형태를 사용한다. 개인 책상 중앙에 좌석 번호를 크게
표시한다. 모니터·키보드는 표시하지 않고, 책상 바깥쪽에 작은 의자 윤곽을 표시한다. 책상 면이
좌석 선택 영역이며 선택 시 청록색 배경과 흰색 번호로 강조한다.

- 좌석 클릭: 해당 좌석을 선택하고 우측 요청 패널을 연다.
- 초기 화면: 전체 맞춤 대비 125%로 확대하고 도면 상단을 맞춰, 오른쪽 휴게 구역과 하단 일부까지 보인다.
- 활성 구역 버튼: 흰색 작업 구역을 중심으로 화면 크기에 맞춰 확대한다.
- 전체 보기: 회색 비운영 공간을 포함한 전체 도면을 맞춘다.
- 확대/축소, 배경 드래그, 범위 전환: 선택된 좌석을 유지하며 지도만 조작한다.
- 로봇 카드/마커: 실제 pose를 수신한 경우 해당 위치로 지도를 이동한다.
- 카드의 화살표: 선택한 로봇의 별도 상세 페이지로 이동한다.
- 요청 닫기 또는 패널 안에서 Escape: 폼을 닫고 좌석으로 포커스를 돌린다.
- 19층: 지도 미연결 상태를 표시하고 좌석 요청을 제공하지 않는다.

## 요청과 요약의 데이터 경계

`POST /api/missions`에는 SEAT target, 우선순위, 요청자, idempotency key를 전송한다.
로봇은 자동 할당, 명령은 책상 위 물체 확인 및 정리로 표시한다. 현재 계약에 없는
로봇 지정과 메모는 입력받지 않는다. 같은 폼의 실패 후 재시도는 같은 idempotency key를
사용하고, 좌석이나 우선순위가 바뀌면 새 요청으로 취급한다. 전송 중 중복 제출을 막고
성공 후에는 생성된 Mission의 로봇 배정을 기다렸다가 해당 로봇 상세 패널로 전환한다.
`Robot.active_mission_id` 또는 수신한 `robot.state_changed` 이벤트로 배정을 확인하며,
아직 배정되지 않은 요청은 대기열 등록 안내와 요청 상세 링크를 유지한다.
운영자가 요청 패널을 닫거나 다른 대상을 선택하면 뒤늦은 자동 전환을 취소한다.

로봇 상세의 현재 작업은 `접수 → 이동 → 작업 → 복귀 → 완료`의 원형 단계로 표시한다.
QUEUED/OFFERED/ACCEPTED는 접수, NAVIGATING은 이동, WORKING은 작업,
RETURNING은 복귀에 대응한다. 색은 API 갱신에 따라 바뀌며 화면 자체에서 단계를 진행하지 않는다.
완료된 단계는 초록색, 현재 단계는 청록색, 남은 단계는 회색이다.
TERMINAL/SUCCESS에서만 모두 완료로 표시하고 취소·실패 등은 별도의 종료 색과 문구로 구분한다.
열어 둔 상세 패널은 Robot의 활성 Mission이 해제되어도 해당 결과를 유지하며,
다음 Mission이 배정되면 새 작업을 표시한다. 현재 위치 항목은 로봇 상세에서 제거했다.

배터리는 **미연동**이다. 지도 pose는 `/api/robots/cleany-01/pose` snapshot과
`/api/events/stream`의 `robot.pose` SSE를 사용한다. 브라우저는 약 200ms 수신 버퍼로
보간하고 큰 이동은 즉시 반영한다. snapshot과 SSE payload는
`{pose: {x,y,yaw,received_at} | null, stale: boolean}`이다. 첫 샘플 전에는 마커를 표시하지
않으며 timeout 이후에는 마지막 표시 위치에서 멈추고 지연 상태를 표시한다. 새로고침 시에는
서버의 마지막 수신 위치와 stale 상태를 복원한다. SSE 재연결마다 snapshot을 다시 조회하며
위치 이벤트로 미션 목록을 재조회하지 않는다. 보간·브라우저 수신 타임아웃은 로컬 monotonic
시간을 사용하므로 서버 UTC 시각과 브라우저 시각이 달라도 동작한다.
Robot Edge producer는 `ws(s)://<host>/api/robots/cleany-01/pose/ws`
에 `{x:number,y:number,yaw?:number|null}` finite-only JSON을 5Hz로 전송한다. 로봇 상태는 `/api/robots`의 외부 상태를 표시한다. 홈의 알림과 요약은
같은 판정 함수를 사용한다.

yaw는 world +X=0, 반시계 방향 양수인 rad 값이다. 지도 y축 반전을 반영해
`-yaw * 180 / PI` 방향으로 옅은 빨간 삼각형을 표시한다. 로봇 이미지는 고정하고
투명한 원 둘레의 삼각형만 최단 각도로 보간한다. 방향 값이 없으면 화살표는 숨긴다.
이미지는 촬영 시안의 80% 크기·60% 채도와 반응형 크기를 사용한다.

위치 표시 설정은 Vite 빌드 시 지정한다. 모두 양의 유한한 값이어야 하며 잘못된 값은
기본값으로 대체한다.

| 환경 변수 | 기본값 | 의미 |
| --- | --- | --- |
| `VITE_POSE_INTERPOLATION_MS` | `200` | 로컬 수신 버퍼 지연(ms) |
| `VITE_POSE_STALE_TIMEOUT_MS` | `1500` | 브라우저 위치 수신 중단 판정(ms) |
| `VITE_POSE_SNAP_DISTANCE` | `2` | 보간 없이 즉시 이동할 거리(m) |

| 홈 진입점 | 판정 | 이동 |
| --- | --- | --- |
| 즉시 조치 | Robot ERROR/OFFLINE | `/robots?filter=attention` |
| 요청 현황 | QUEUED와 그 외 진행 중 phase | `/missions` |
| 결과 검토 | terminal HUMAN_REVIEW_REQUIRED/PARTIAL_SUCCESS/BLOCKED/FAILED/INTERRUPTED | `/results?filter=review` |
| 최근 완료 | terminal SUCCESS | `/results?filter=success` |

결과 페이지는 작업 전·후 관측 참조를 표시한다. HTTP(S) 또는 같은 호스트의 상대
URL만 링크로 제공하고, `mock://` 같은 식별자는 자료 참조 텍스트로 표시한다.
결과 확인만으로 검토 대상 건수를 지우지 않는다. 완료 시각 계약이 없으므로
최근 완료도 **요청 시각 최신순**이며, 시각 옆에 요청 시각임을 명시한다.

상단 홈/작업/결과/로봇 메뉴에 더해 운영자 메뉴에서 기존 `/monitoring`과
`/settings`로 이동한다. 단계·우선순위·결과·로봇 선택 필터는 URL에 반영한다.
설정은 브라우저 `localStorage`에 저장하며 기본 우선순위와 SSE 오류 시 보조
polling 주기에 반영한다.

## 개발 및 검증

Node.js와 pnpm 설치는 루트 [README](../../README.md)의 안내를 따른다.

```bash
uv sync --project apps/backend --extra dev
uv run --project apps/backend python apps/backend/run.py
```

별도 터미널에서 개발 서버를 실행한다.

```bash
pnpm install
pnpm dev
```

개발 화면은 [127.0.0.1:5173](http://127.0.0.1:5173)이며 `/api`를 8080으로
전달한다. 8080의 SPA는 마지막 `pnpm build` 결과를 제공하므로 개발 중에는
5173에서 확인한다.

```bash
pnpm test
pnpm typecheck
pnpm contracts:check
uv run --project apps/backend --extra dev python -m pytest apps/backend/tests/test_contracts.py
pnpm build
pnpm test:e2e
```

Vitest는 좌석 좌표/ID 정합, 요약 분류, 관측 링크, 지도 선택 유지, 요청 실패·재시도·
중복 제출을 검사한다. Playwright 시나리오는 좌석 요청, 각 진입점, SPA 직접 접근과
1920×1080 / 1366×768 배치를 검사한다.

자동 테스트는 요청 무결성, 상태 구분, 패널 전환과 지도 조작의 회귀 방지에 집중한다.
고정 좌표·SVG 구조·단순 표시 상수를 그대로 대조하는 검사는 추가하지 않는다.
외형과 간격은 Firefox/niri 캡처로 확인하고, 같은 동작을 여러 계층에서 중복 검사하지 않는다.

2026-09-08 시각 및 동작 검증은 **네이티브 Firefox와 niri**로 수행했다. 실제 Mock
Backend 요청과 별도 API fixture의 로딩·오류·빈 목록·재시도를 검증했으며, 당시
실행한 항목과 캡처는 [홈 구현 검증 기록](../../docs/architecture/home-workspace.md)에
남겼다. 이 검증을 Playwright 실행 결과로 간주하지 않는다.

## 스타일

상단 메뉴와 공통 페이지는 `src/app/workspace-shell.css`, 홈의 패널 배치는
`src/pages/home-dashboard.css`, 지도 레이어는
`src/features/facility-map/facility-map.css`에서 관리한다. 새로운 화면은 공통
`--workspace-*` 토큰을 사용하며, 기존 모니터링·설정은 compatibility CSS를 유지한다.

SPACE A1~A4는 방별 4개, M1~M3는 방별 6개(3열 × 2행)의 번호형 책상을 표시한다.
SPACE 좌석은 `A11`~`A44`, `M11`~`M36`처럼 방 번호와 좌석 번호를 붙여 표시하며 클릭해서 요청할 수 있다.
API의 기존 좌석 ID와 label은 유지하고 화면과 새 요청의 표시명만 축약한다.
API는 D-HUB 48석과 SPACE 34석, 총 82석을 반환한다. `zone_id`와 방 내부 행·열을
공유 좌표 정의에 대응시켜 회전된 책상에도 클릭 영역을 맞춘다. 기존 D-HUB ID는 유지한다.
SPACE 점유 상태는 아직 연결되지 않아 `UNKNOWN`(점유 미확인)으로 표시한다.

홈의 로봇 목록은 지도 왼쪽 위에 내용 높이만큼 뜨며, 목록이 길면 내부에서 스크롤한다.
카드 또는 지도 로봇 아이콘을 클릭하면 같은 위치에서 목록 대신 로봇 상세 패널을 표시한다.
`← 로봇 목록` 또는 Escape로 돌아가며, 복귀 버튼 옆에는 조치가 필요한 로봇 수를 표시한다.
좌석 선택 시 로봇 상세는 닫히고 목록이 복원되며 오른쪽 작업 요청 패널이 열린다.
두 상세 패널은 지도 위에 겹쳐 표시하며 지도의 크기를 바꾸지 않는다. 초기 화면과 지도 맞춤은 목록 폭을 고려한다.
로봇 상세 패널이 열리면 확대/축소·활성 구역·전체 보기 버튼은 패널 오른쪽으로 이동하고, 닫으면 지도 왼쪽 아래로 돌아온다.
1100px 이하 창에서 양쪽 패널을 함께 열면 활성 구역·전체 보기 버튼을 세로로 배치한다.

브랜드 원본과 웹용 자산은 `src/assets/brand/`에 보관한다. 상단에는 글자 로고,
지도·탭에는 얼굴, 홈 로봇 목록과 로봇 관리 페이지에는 아래의 외형 프리뷰를 사용한다.
지도는 선택한 2번 둥근형 시안을 `robot-face-soft.svg`로 구현했다. 원형 배경과 상태 점 없이
28px 너비의 얼굴을 표시하며 지도 확대율과 관계없이 화면상 크기를 유지한다. 로봇 이름만
호버·키보드 포커스·선택 시 표시하고, 클릭 영역은 투명한 40×36px로 확보한다.
그 외 브랜드 이미지는 제공된 원본에서 파생했으며 자세한 출처는 해당 폴더 README를 참고한다.

## 공통 UI 관리

- `RobotStateBadge`: 홈 목록·로봇 상세·로봇 관리의 상태 배지.
- `BatteryStatus`: 배터리 미연동 표현. API에 배터리 필드가 없으므로 수치를 추정하지 않는다.
- `InfoRow`: `dl` 내부 제목/값 구조. 화면별 간격과 배치는 부모가 관리한다.
- `WorkspaceMessage`: 빈 목록·로딩·오류 메시지와 접근성 역할.
- `MapOverlayPanel`: 지도 패널의 열림 상태, `inert`, `aria-hidden`, 전환 효과.
  `useHomePanelState`가 단일 열린 패널(없음/좌석/로봇), 닫힘 콘텐츠, 포커스 복귀와 작업 배정 후 전환을 관리한다.
  `panel-motion.ts`의 200ms 설정을 콘텐츠 유지 시간과 CSS 전환이 공유한다. 모션 감소 설정에서는 닫힘 콘텐츠를 즉시 정리한다.
- `MissionProgress`: 현재 작업의 진행 단계. 로봇 상세·작업 요청 후 화면·로봇 관리에서 공유한다.

공통 컴포넌트는 표현과 동작을 관리하고, 화면별 레이아웃과 데이터 조회는 호출부가 유지한다.

지도 카메라는 `map-camera.ts`의 순수 계산 함수(배율·맞춤·경계·팬 좌표)와
`useMapCamera`의 조작 상태(ResizeObserver·드래그·확대·로봇 포커스)로 분리한다.
`FacilityMap`은 좌석·로봇 레이어와 클릭, 범례를 렌더링한다. 좌석 선택과 로봇 데이터 갱신만으로
카메라가 이동하지 않으며 로봇 선택 또는 명시적 포커스 요청에서만 로봇 위치로 이동한다.

## 작업·결과·로봇 페이지

작업(`/missions`)·결과(`/results`)·로봇(`/robots`) 페이지는 `OperationsPage`의
헤더, 필터 탭, 목록·상세 표면과 `panel-motion.ts`의 200ms 전환을 공유한다.
홈의 네이비 글자, 청록 선택 표시, 옅은 배경과 경계선을 이어 사용하며,
페이지별 배치는 `missions-page.css`, `results-page.css`, `robots-page.css`에서 관리한다.
필터와 선택 항목은 URL에 남는다. 요청 취소는 응답 전 중복 전송을 막고,
결과 조회는 검토 완료 처리를 수행하지 않는다. 관측 자료는 연결된 참조만 표시한다.
Firefox/niri 캡처와 검증 범위는 [운영 페이지 검증 기록](../../docs/architecture/operations-pages-review-20260910.md)에 남겼다.

## 로봇 3D 모델

홈 로봇 카드 왼쪽에는 정적 외형 썸네일을 표시하며 카드 전체가 상세 진입 버튼이다.
상세 패널은 현재 위치 정보 아래 남는 공간에 216~300px 높이의 프리뷰를 표시한다.
창 높이가 낮으면 상세 정보와 모델을 함께 스크롤한다. 목록과 상세 모델은 각각 독립적으로 회전한다.
로봇 관리 페이지는 216px 높이의 프리뷰를 상태 정보 옆에 표시한다. 지도는 기존 2D 얼굴 아이콘을 유지한다.
PNG 포스터를 먼저 보여 주고, 마우스를 사용할 수 있는 기기에서 카드가 화면 근처에
들어오면 Three.js와 GLB를 지연 로딩한다.

- 모델: Cleany `e718ac57` CAD를 접은 표시용 대기 자세와 외장 시안. 실시간 자세나 확정된 제작 사양이 아니다.
- 기반 형상 최적화: 원본 6.80 MB → 웹용 약 2.93 MB. 고유 삼각형 375,110 → 159,586 (인스턴스 반복 전 수치).
- 호버: 왼쪽 로봇 목록에서는 회전하지 않는다. 상세 패널과 로봇 관리에서는 수평 12°, 위쪽 2°로
  부드럽게 돌아간 뒤 멈추며, 이탈하면 호버 전 각도로 돌아간다.
- 왼쪽 클릭 후 드래그: 수평 회전과 제한된 상하 회전. 드래그는 현재 표시 각도에서 시작하고,
  놓거나 카드 밖으로 나가도 사용자가 맞춘 방향을 유지한다. 단순 클릭은 각도를 저장하지 않는다.
- 방향키로 회전하고 `Home` 키 또는 `처음 각도` 버튼으로 복귀한다. 줌·팬·시점 프리셋·윤곽 UI는 제공하지 않는다.
- 터치 전용 기기는 포스터만 표시한다. `prefers-reduced-motion`에서는 자동 회전과 보간을 끄고,
  직접 드래그하거나 키보드로 회전한 값만 즉시 반영한다.
- 필요한 프레임만 렌더링한다. 호버 보간 종료, 화면 밖, 숨긴 탭에서는 연속 렌더링하지 않는다.
- DPR은 1이며 실시간 그림자 대신 고정 바닥 음영을 사용한다.
- 홈 상세 패널을 닫아도 목록의 모델과 사용자가 맞춘 각도는 유지한다.
  페이지를 나가거나 목록에서 제거된 모델은 canvas와 geometry/material/texture를 해제한다.
  다운로드 중 제거된 모델도 완료 시 해제한다. 로딩·WebGL 실패 시 포스터와 재시도를 표시한다.
- `/robot-model`은 개발 모드 전용 확인 화면이다. `?renderStats=1`로 frame 수, draw call,
  삼각형 수와 카메라 각도를 확인할 수 있으며 운영 빌드에는 이 경로와 진단 표시를 제공하지 않는다.

자산 출처는 `public/models/README.md`에 기록했다. 포스터는 같은 모델의 네이티브
Firefox 화면을 niri로 캡처한 뒤 모델 영역만 잘라 생성했다. 원본 CAD·ROS 모델은 수정하지 않는다.
최적화는 파일 크기와 유휴 렌더링 감소를 목표로 하며, GPU 사용률/소비전력 감소율을 의미하지 않는다.

호버·드래그 브라우저 검사는 API fixture와 Chromium 소프트웨어 WebGL을 사용한다.
실제 로봇 또는 네이티브 GPU 성능 검증이 아니다. 실행 방법:

```bash
pnpm --filter @cleany/dashboard test src/components/RobotModel.test.tsx src/components/robot-model-motion.test.ts src/components/RobotSensorOpenings.test.ts
pnpm --filter @cleany/dashboard test:robot-model
```

브라우저 실행 파일을 따로 지정해야 하는 환경에서는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에
Chromium 경로를 지정한다. 전용 설정이 5176 포트에서 Vite를 실행하며,
수동 확인 주소는 `http://127.0.0.1:5176/robot-model`이다.

홈 하단 업무 패널은 기본 150px/4열, 1500px 이하에서 최대 200px,
1280px 이하에서 최대 300px/2×2로 표시한다. 화면 높이에 따라 확장을 제한하고,
700px 이하 높이에서는 보조 목록을 숨겨 지도 조작 공간을 확보한다.
홈의 최소 너비는 1024px이며, 실제 요청·검토 항목을 요약에 표시한다.

하단 업무 패널 데모: `/?summaryDemo=1`. 즉시 조치 2건, 진행 1건, 대기 2건,
검토 2건과 최근 완료를 화면용 fixture로 표시한다. 로봇 목록·지도·서버 데이터는
변경하지 않으며 상단의 '실제 데이터로 돌아가기'로 해제한다.

### 표시용 대기 자세 모델

홈·로봇 관리·개발용 `/robot-model`의 공통 프리뷰는
`cleany-e718ac57-standby.glb`를 사용한다. 원본
`cleany-e718ac57-web.glb`의 경량 형상을 유지하면서 팔 관절의 표시 자세와
부품별 PBR 재질만 변경했다. 양쪽 어깨 yaw를 각각 -90도/+90도로 돌려
위팔과 아래팔이 거의 포개지도록 접고, 손목을 보정해 그리퍼가 머리 카메라와
같은 정면을 향하게 했다. 어깨 pitch 2.9rad, 팔꿈치 3.05rad, 손목 pitch -0.15rad를 사용한다.
MuJoCo forward kinematics로 만든 정적 예시이며,
실시간 자세나 충돌·안전 검증을 마친 하드웨어 대기 명령이 아니다.
각도와 재질 매핑은 같은 이름의 JSON에 기록한다.

다음 명령은 저장소 루트에서 실행한다. `CLEANY_SOURCE`는 Cleany의
`e718ac57e861f3d34b6e0e10b0d18d87a348bf51` 체크아웃 경로다.
출력은 기존 파일과 다른 경로로 지정한다.

```bash
uv run --with mujoco==3.12.0 --with trimesh --with numpy python \
  tools/prepare_robot_standby.py \
  "$CLEANY_SOURCE/ros2_ws/src/cleany_description/mjcf/cleany.xml" \
  apps/dashboard/public/models/cleany-e718ac57-web.glb \
  /tmp/cleany-standby-new.glb
```

스크립트는 입력 GLB 해시, MJCF와 기존 노드 변환 일치, 관절 제한,
128개 형상 배치 보존, 삼각형 수 보존, GLB 재로드 경계를 검증한다.
팔꿈치는 어깨 뒤로, 손목은 앞으로 접히는지, 두 그리퍼의 로컬 -Y 축이
머리 카메라의 정면 축과 일치하는지도 확인한다.
재질은 표시를 위한 구분이며 실물의 측정된 광학 특성이 아니다.
`cleany-standby-poster.png`는 같은 모델을 Firefox 뷰어에서 렌더링한 미리보기다.

외장과 팔 커버는 `RobotExterior.ts`와 `RobotArmCovers.ts`가 추가하는 표시 레이어다.
수거함, 연속된 본체 외장, 구동부 커플러, 부분 팔 커버와 상부 전면의 글자 로고를 포함한다.
기존 카메라는 노출한다. 로봇의 실시간 상태나 검증된 제작 사양으로 표시하지 않는다.
기본 포스터는 같은 시안의 `cleany-exterior-poster.png`다.

전면 절단선 아래에 라이다용 가로 개구부 1개와 초음파용 가로 개구부 2개를 표시한다.
`RobotSensorOpenings.ts`가 속이 빈 하부 외장의 양쪽 면을 관통하는 구멍과 내부 테두리를 만든다.
표시용 라이다 높이 360mm는 원본 MJCF 기준점 460mm와 다르며, 초음파 개구부는
60×24mm다. 센서 본체·원본 장착 좌표를 바꾸지 않은 디자인 제안이다.
로고 위의 장식선은 제거했고 포스터에도 같은 변경을 반영했다.

프리뷰는 호버·드래그·키보드 회전만 제공한다. 외장 토글과 투입구·구동부·팔·센서 확대
버튼은 `feat/robot-model-standby`의 별도 비교 뷰어에 남아 있다.
형상 치수, 디자인 반복과 과거 검증 범위는
[외장 시안 문서](../../docs/architecture/robot-exterior-concept.md)에 기록한다.
## 운영 예시 모드와 화면 기록

전체 운영 페이지 예시 모드: `/results?demo=1`, `/missions?demo=1`, `/robots?demo=1`.
운영자 메뉴의 **예시 데이터 보기**로도 켤 수 있다. 같은 탭에서 메뉴 이동·새로고침 후에도 유지되고,
상단 **실제 데이터로 돌아가기**로 해제한다. 로봇 3대·요청 7건과 AI 생성 전후 사진을 표시한다.
예시 모드에서는 업무 데이터 API 조회/SSE와 작업 요청·취소 전송을 하지 않는다. 계정 확인과 세션 활동 요청은 유지한다.
사진 경로·생성 프롬프트·검증은 [운영 페이지 예시 문서](../../docs/architecture/operations-demo-20260910.md)에 남겼다.

홈 `/?demo=1`에서는 82석을 연한 파랑(점유 중 19석), 기존 무채색 좌석(청소 완료 46석),
연한 살구색(청소 예정 16석)으로 구분한다. 청소 중인 12번 좌석 1석은 연한 살구색 바탕에 점을 추가한다.
범례의 좌석 수는 지도와 같은 상태로 집계하며 선택 테두리를 켜도 상태 색상을 유지한다.
예시의 현재 청소 상태는 `operations-demo.ts`에 명시하고, 실제 모드에서 청소 상태가 없는
빈 좌석은 회색으로 표시한다. 미션 성공 이력만으로 현재 좌석을 청소 완료로 표시하지 않는다.

기존 좌석 점유율 데모: `/?summaryDemo=1`. 조회된 좌석 ID에 화면용 점유/정리 상태를
배정하고 지도와 점유율 요약에 함께 표시한다. 현재 82석 기준 사용 중 30석(37%)이다.
상단 알림 메뉴도 예시 요약을 표시한다. 로봇 목록은 실제 응답을 유지하고 API 조회·SSE도
계속 연결하며, 홈의 작업 요청은 차단한다. 전체 운영 데이터를 격리해서 보려면 `?demo=1`을 사용한다.
데모 좌석 패널에서는 실제 요청 전송을 비활성화한다. 제목 오른쪽 '데모 · 해제'로 해제한다.
실제 모드의 전체/점유/빈 좌석은 SeatResponse로 집계하며 청소 상태는 계약에 없어 미연동으로
취급한다. 현재 홈에는 청소 상태 카드를 표시하지 않으며 과거 미션 성공을 현재 청결 상태로 추정하지 않는다.

검증: `pnpm --filter @cleany/dashboard test src/pages/HomePage.test.tsx src/lib/seat-summary.test.ts src/features/facility-map/FacilityMap.test.tsx`,
`pnpm contracts:check`, `pnpm build`. Firefox/niri 캡처는
`docs/architecture/assets/home-implementation-20260908/35-seat-cards-*.png`에 보관한다.

정보 밀도 조정 후 Firefox/niri 캡처: `docs/architecture/assets/home-implementation-20260908/36-seat-card-density-{wide,narrow}.png`.

공통 정렬 개선 후 Firefox/niri 캡처: `docs/architecture/assets/home-implementation-20260908/37-seat-layout-aligned-{wide,narrow}.png`.

최소형 좌석 현황 Firefox/niri 캡처: `docs/architecture/assets/home-implementation-20260908/38-minimal-occupancy-{wide,narrow}.png`.

기존 지도 레이아웃 복원 후 캡처: `docs/architecture/assets/home-implementation-20260908/39-original-map-layout.png`.

## Mission Gateway 통합

Backend 기본 모드는 `gateway`다. 최초 Runtime snapshot 전에는 좌석 요청을 막고,
연결 후에는 advertised `supported_seat_ids`만 허용한다. Robot 연결 상태는 브라우저
SSE 연결 상태와 구분하며, 재연결 시 HTTP snapshot을 다시 조회한다.

진행 및 결과 화면은 Runtime의 외부 phase, 실제 observation 참조, execution profile,
수락/종료 시각과 작업 내역을 표시한다. navigation이 `sim`이고 작업이 `mock`이면
혼합 실행으로 표시한다. 취소는 checkpoint 요청이며 safe stop이나 e-stop이 아니다.

```bash
pnpm contracts:check
pnpm test:e2e:gateway
pnpm test:e2e
```

Gateway E2E는 격리된 18082 포트/SQLite DB와 테스트용 WebSocket Runtime을 사용한다.
기존 UI E2E는 18081 포트의 명시적 Mock 모드를 사용한다. 실제 Gazebo 검증은
[Runtime 인계 계약](../../docs/architecture/robot-gateway-integration.md)을 따른다.

## 공통 색상

팔레트와 파생 색상은 [`src/styles/tokens.css`](src/styles/tokens.css)에서 관리한다.
기본은 청록·차콜·회색·흰색·호박색이며, 오류·긴급 상황에만 빨강을 사용한다.
화면에서는 HEX 대신 `--color-text`, `--color-action`, `--color-warning`,
`--color-danger` 등 용도별 변수를 사용한다. 기존 `--workspace-*`와 Tailwind
색상은 이 변수의 별칭이다. 대기·확인 필요는 호박색, 완료·실행은 청록색,
미확인은 회색 패턴으로 구분한다. 로고·지도 이미지와 3D 재질은 별도로 유지한다.

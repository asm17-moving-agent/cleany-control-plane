# Control Plane Backend

관제 사용자 흐름과 contract를 검증하는 FastAPI Backend다. HTTP/SSE transport와
domain, SQLite repository와 Robot Gateway를 분리해 core logic을 독립적으로 검증한다.

## 제공 기능

- `HIGH`, `NORMAL` priority Queue
- 단일 Robot과 하나의 활성 Mission, SQLite Queue 및 재시작 복구
- 양방향 Gateway WebSocket과 heartbeat, 중복 제거 및 재전송
- Mission 생성, 조회와 checkpoint 취소
- `SEAT`, `ZONE`, `POINT` Mission target
- D-HUB 48석과 SPACE 34석 배치 조회 (D-HUB는 Mock 점유, SPACE는 점유 미확인)
- SSE 상태 event
- Robot Edge pose WebSocket (`/api/robots/cleany-01/pose/ws`), latest snapshot and stale events
- idempotency key 기반 중복 생성 방지

## 계정 발급과 첫 실행

인증은 항상 켜져 있다. 회사 담당자가 서버 관리 명령으로 고객·시설·계정을 만들고
아이디와 임시 비밀번호를 전달한다. 첫 로그인에서 15~128자의 새 비밀번호로 변경한다.
같은 고객 사용자는 시설을 공유하며 다른 고객의 미션·사진·로봇에 접근할 수 없다.

저장소 루트에서 실행한다. 각 명령의 출력 ID를 다음 명령에 넣는다.

```bash
uv run --project apps/backend python -m control_plane.admin customer-create "고객 이름"
uv run --project apps/backend python -m control_plane.admin site-create CUSTOMER_ID "매장 이름"
uv run --project apps/backend python -m control_plane.admin account-create CUSTOMER_ID LOGIN_ID "사용자 이름"
uv run --project apps/backend python -m control_plane.admin robot-register CUSTOMER_ID SITE_ID
```

다른 DB는 `admin --database /absolute/path/control-plane.db COMMAND`로 지정한다.
임시 비밀번호와 로봇 토큰은 발급 결과에서만 확인한다. 로봇 Gateway·Pose WebSocket은
`Authorization: Bearer ROBOT_TOKEN` 또는 `X-Cleany-Robot-Token: ROBOT_TOKEN` 헤더가 필요하다.
사용자 쿠키로 로봇을 연결할 수 없다. 로봇 등록·시설 변경은 작업이 없는 상태에서 한다.

```bash
uv run --project apps/backend python -m control_plane.admin reset-password USER_ID
uv run --project apps/backend python -m control_plane.admin disable USER_ID
uv run --project apps/backend python -m control_plane.admin reactivate USER_ID
```

초기화·중지는 기존 세션과 열린 SSE 접근을 회수한다. 실행 중 로봇 작업을 취소하지 않는다.
회사 관리 명령은 서버 접근 권한이 있는 담당자만 사용한다.

로컬 HTTP 개발은 `CLEANY_COOKIE_SECURE=false`를 명시한다. Vite를 쓰면
`CLEANY_ALLOWED_ORIGINS='["http://127.0.0.1:5173"]'`도 지정한다. 운영 HTTPS는 Secure 기본값을 유지한다.
사진은 `CLEANY_OBSERVATION_DIRECTORY` 안에 두고 Runtime 결과가 `observation://relative/path.jpg`로
참조하면 소속을 검사하는 API를 통해 제공한다. 외부 URL·파일 경로는 화면에 공개하지 않는다.
현재 지도·좌석은 `facility-18f` fixture만 제공한다. 새 시설의 실제 지도 등록은 후속 작업이다.

## 기존 DB 이관

Backend를 멈추고 SQLite backup API로 백업한 뒤 실행한다. v1→v2 이관은 자동이며,
미확인 활성 미션이 있으면 거절한다. 기존 미션 ID·종료 payload·inbox·outbox는 보존한다.
기존 미션은 고객 미지정 상태로 숨기고, 소유자를 확인한 기록만 다음 명령으로 연결한다.

```bash
uv run --project apps/backend python -m control_plane.admin adopt-legacy CUSTOMER_ID SITE_ID
```

이 명령은 미지정 기록 전체를 해당 시설로 연결하므로 최초 단일 고객 데이터에만 사용한다.
새 schema에 구버전 앱만 되돌리지 않는다. 롤백은 앱과 대응하는 DB 백업을 함께 검토한다.
자료의 30일 자동 삭제, 외부 백업 저장소와 복원 훈련은 아직 구현하지 않았다.

## 개발 환경

Python dependency와 lock file은 `uv`로 관리한다.

```bash
uv sync --project apps/backend --extra dev
uv run --project apps/backend python apps/backend/run.py
```

Dashboard production build가 `apps/dashboard/dist/`에 있으면 FastAPI가 정적 파일과
SPA fallback을 함께 제공한다. Dashboard 개발 서버는 `/api`를 `8080`으로 proxy한다.

환경 변수에는 `CLEANY_` prefix를 사용한다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `CLEANY_HOST` | `127.0.0.1` | API bind host |
| `CLEANY_PORT` | `8080` | API bind port |
| `CLEANY_POSE_RECEIVE_TIMEOUT_SECONDS` | `1.5` | Monotonic receive silence before producer disconnect/stale |
| `CLEANY_ROBOT_MODE` | `gateway` | 실제 연결 계약 또는 명시적 `mock` 실행 |
| `CLEANY_DATABASE_PATH` | app의 `.data/control-plane.db` | SQLite 저장 경로 (`:memory:`는 테스트용) |
| `CLEANY_GATEWAY_HEARTBEAT_INTERVAL_SECONDS` | `1` | Runtime에 전달할 heartbeat 주기 |
| `CLEANY_GATEWAY_HEARTBEAT_TIMEOUT_SECONDS` | `5` | 수신 단절 판정 |
| `CLEANY_GATEWAY_OFFER_TIMEOUT_SECONDS` | `5` | 수락 지연 시 동기화 요청 |
| `CLEANY_GATEWAY_RETRY_INITIAL_SECONDS` | `1` | 명령 재전송 초기 간격 |
| `CLEANY_GATEWAY_RETRY_MAX_SECONDS` | `30` | 명령 재전송 최대 간격 |
| `CLEANY_GATEWAY_TICK_INTERVAL_SECONDS` | `0.1` | Queue 및 연결 검사 주기 |
| `CLEANY_QUEUE_TTL_SECONDS` | `1800` | 대기 Mission 만료 시간 |
| `CLEANY_MOCK_STEP_DELAY_SECONDS` | `0.8` | Mock 단계 간격 |
| `CLEANY_LOG_LEVEL` | `INFO` | lifecycle 및 Gateway 로그 수준 |
| `CLEANY_COOKIE_SECURE` | `true` | HTTPS 쿠키. 로컬 HTTP만 false |
| `CLEANY_ALLOWED_ORIGINS` | `[]` | JSON origin 목록. 비어 있으면 요청의 origin과 일치해야 함 |
| `CLEANY_TEMPORARY_PASSWORD_SECONDS` | `86400` | 임시 비밀번호 유효 시간 |
| `CLEANY_PASSWORD_CHANGE_SESSION_SECONDS` | `600` | 변경 전용 세션 시간 |
| `CLEANY_SESSION_ABSOLUTE_SECONDS` | `43200` | 일반 세션 최대 시간 |
| `CLEANY_SESSION_IDLE_SECONDS` | `1800` | 사용자 활동 없이 허용할 시간 |
| `CLEANY_AUTH_STREAM_RECHECK_SECONDS` | `10` | 열린 SSE 권한 재검사 |
| `CLEANY_AUTH_FAILURE_WINDOW` | `900` | 로그인 실패 집계 기간 |
| `CLEANY_AUTH_IDENTITY_LIMIT` / `CLEANY_AUTH_IP_LIMIT` | `5` / `30` | 기간 내 계정별/IP별 실패 제한 |
| `CLEANY_OBSERVATION_DIRECTORY` | app의 `.data/observations` | 비공개 사진 루트 |


기본 모드는 Runtime이 `/api/robots/cleany-01/gateway/ws`에 연결해 snapshot과 지원
좌석을 전달해야 dispatch한다. ROS adapter는 `cleany` 저장소의 구현 책임이다.
[Gateway 통합 계약](../../docs/architecture/robot-gateway-integration.md)을 따른다.
UI만 확인할 때는 별도 DB에 위 관리 명령으로 계정과 로봇을 발급한 뒤 다음처럼 명시적으로 Mock을 실행한다.

```bash
CLEANY_COOKIE_SECURE=false CLEANY_ROBOT_MODE=mock CLEANY_DATABASE_PATH=/tmp/cleany-mock.db \
  uv run --project apps/backend python apps/backend/run.py
```

SQLite는 단일 Backend process/worker로 실행한다. Mission, inbox, outbox는 보관하며
자동 삭제하지 않는다. Pose는 별도 실시간 경로로 유지하고 DB에 저장하지 않는다.

Robot Edge sends `{"x": number, "y": number, "yaw"?: number | null}` (finite values, no extra fields) at
5Hz to `ws(s)://<host>/api/robots/cleany-01/pose/ws`. Only one producer is accepted;
duplicates receive WebSocket close code 1008. `GET /api/robots/cleany-01/pose` always
returns `{pose: {x, y, yaw, received_at} | null, stale}` and retains the last stale pose for
reload. Browser updates use `/api/events/stream`: `robot.pose` and `robot.pose.stale`
payloads use the same snapshot envelope. Producers require a registered device token;
HTTP/SSE consumers require a full customer session.
`yaw` is optional for older producers: radians in the same world frame, +X=0,
counterclockwise positive. Missing/null yaw means unknown orientation.

## 검증

```bash
uv run --project apps/backend --extra dev pytest apps/backend/tests
uv run --project apps/backend --extra dev ruff check apps/backend
```

Gateway 검사는 실제 ROS/Gazebo 실행을 대체하지 않는다. PostgreSQL과 다중 worker는 지원하지 않는다.

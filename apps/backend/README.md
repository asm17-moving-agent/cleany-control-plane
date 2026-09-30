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

기본 모드는 Runtime이 `/api/robots/cleany-01/gateway/ws`에 연결해 snapshot과 지원
좌석을 전달해야 dispatch한다. ROS adapter는 `cleany` 저장소의 구현 책임이다.
[Gateway 통합 계약](../../docs/architecture/robot-gateway-integration.md)을 따른다.
UI만 확인할 때는 별도 DB를 사용해 다음처럼 명시적으로 Mock을 실행한다.

```bash
CLEANY_ROBOT_MODE=mock CLEANY_DATABASE_PATH=/tmp/cleany-mock.db \
  uv run --project apps/backend python apps/backend/run.py
```

SQLite는 단일 Backend process/worker로 실행한다. Mission, inbox, outbox는 보관하며
자동 삭제하지 않는다. Pose는 별도 실시간 경로로 유지하고 DB에 저장하지 않는다.

Robot Edge sends `{"x": number, "y": number, "yaw"?: number | null}` (finite values, no extra fields) at
5Hz to `ws(s)://<host>/api/robots/cleany-01/pose/ws`. Only one producer is accepted;
duplicates receive WebSocket close code 1008. `GET /api/robots/cleany-01/pose` always
returns `{pose: {x, y, yaw, received_at} | null, stale}` and retains the last stale pose for
reload. Browser updates use `/api/events/stream`: `robot.pose` and `robot.pose.stale`
payloads use the same snapshot envelope. This endpoint is intended for the trusted robot
network; authentication and authorization are not yet implemented.
`yaw` is optional for older producers: radians in the same world frame, +X=0,
counterclockwise positive. Missing/null yaw means unknown orientation.

## 검증

```bash
uv run --project apps/backend --extra dev pytest apps/backend/tests
uv run --project apps/backend --extra dev ruff check apps/backend
```

Gateway 검사는 실제 ROS/Gazebo 실행을 대체하지 않는다. 인증과 PostgreSQL은 포함하지 않는다.

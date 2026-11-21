# Control Plane Backend

관제 사용자 흐름과 contract를 검증하는 FastAPI Backend다. HTTP/SSE transport와
domain, SQLite repository와 Robot Gateway를 분리해 core logic을 독립적으로 검증한다.

## 제공 기능

- `HIGH`, `NORMAL` priority Queue
- 단일 Robot과 하나의 활성 Mission, SQLite Queue 및 재시작 복구
- 양방향 Gateway WebSocket과 heartbeat, 중복 제거 및 재전송
- Mission 생성, 조회와 checkpoint 취소
- 한국 날짜별 이력/단건 조회와 결과 검토 완료(원본 종료 결과와 별도 저장)
- `SEAT`, `ZONE`, `POINT` Mission target
- D-HUB 48석과 SPACE 34석 배치 조회 (D-HUB는 Mock 점유, SPACE는 점유 미확인)
- SSE 상태 event
- Robot Edge pose WebSocket (`/api/robots/cleany-01/pose/ws`), latest snapshot and stale events
- idempotency key 기반 중복 생성 방지

## 코드 구조

- `control_plane/server.py`: 인증된 HTTP/SSE와 Robot WebSocket, application lifecycle
- `control_plane/domain.py`: 외부 Mission 규칙과 Queue, transaction 및 event 발행
- `control_plane/persistence.py`: SQLite 저장과 schema migration
- `control_plane/gateway.py`: Runtime 메시지와 재연결 처리
- `control_plane/mock/fixtures.py`: 고정 시설 배치, 가상 D-HUB 점유와 SPACE 점유 미확인 데이터
- `control_plane/mock/dispatcher.py`: 명시적 Mock 모드의 시간 기반 실행과 가상 관찰 참조 생성

기본 실행 모드는 Gateway다. Mock dispatcher는 관찰 참조를 생성하고 domain store는
그 참조를 상태 전이와 같은 transaction에서 저장한 뒤 event를 발행한다.

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
저장 SLAM 지도는 [지도 등록과 Jetson 통합](../../docs/architecture/slam-map-integration.md)을 따른다.
`facility-18f`는 기존 예시 지도이며 SLAM 시설에는 실제 좌석 좌표 등록 전까지 좌석을 제공하지 않는다.

## 기존 DB 이관

날짜별 작업 화면의 `mission_reviews`는 초기화 시 자동 추가되는 별도 테이블이다.
검토 완료는 첫 확인자/시각만 기록하며 원본 terminal payload를 변경하지 않는다.
신규 API와 범위는 [작업 계약](../../packages/contracts/README.md)을 따른다.

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

### SLAM 좌석 배치

SLAM 지도에서는 `GET/PUT /api/seat-layout`으로 시설별 배치 revision을 관리하고
`GET /api/seat-layout/targets`로 로봇 목표 JSON을 내보냅니다. 기존 82석은 초안으로
등록하며 점유 상태는 UNKNOWN입니다. 편집 저장은 현장 검증 상태를 해제합니다.
배치 좌표, 현장 검증 기록과 Runtime 버전 확인 절차는
[SLAM 통합 계약](../../docs/architecture/slam-map-integration.md#좌석-배치와-좌표)을 따릅니다.

`CLEANY_SHUTDOWN_GRACE_SECONDS`는 SSE 연결이 열린 상태에서 종료를 기다리는 시간을
정하며 기본 5초입니다. Jetson user service의 종료 제한은 20초로 설정합니다.
재배포 전 미종료 미션을 확인하고 DB를 백업합니다.
## 수동 조종 연결

로봇 탭은 같은 Jetson의 기존 `phone_remote` HTTP 서버에 인증된 입력을 전달합니다.
설정, 입력 만료와 미션 충돌 검사는 [수동 조종 계약](../../docs/architecture/manual-control.md)을
참고합니다. 서버 설정만으로 하드웨어 런타임을 시작하지 않습니다.

## 로봇 관측 및 운영 분석

로봇 화면은 `GET /api/robots/{robot_id}/telemetry`와
`GET /api/robots/{robot_id}/analytics?start=<ISO8601>&end=<ISO8601>`를 사용합니다.
조회는 기존 세션과 `site_id` 범위를 따릅니다. 시간대가 포함된 최대31일 구간이며 이벤트의
`next_event_cursor`를 `before`로 보내 이전100개를 조회합니다. 미래 구간은 현재 시각으로
잘리고 데이터가 없으면 빈 배열을 반환합니다.

Robot은 장치 토큰으로 `/api/robots/{robot_id}/telemetry/ws`에 연결합니다. 한 로봇의
생산자는 하나이며 저장 완료 뒤 `{sequence, accepted}`를 응답합니다.
[관측 계약](../../packages/contracts/schemas/robot-observation.schema.json)과
[예시](../../packages/contracts/examples/robot-observations-v1.json)를 사용합니다.
미션 Gateway, pose WebSocket, 헤드캠과 제어 경로는 독립적입니다. ROS 노드 실행은
`cleany_telemetry/robot_observer`, `cleany_control_bridge/robot_observation_bridge`가 담당합니다.

| 환경 변수 (`CLEANY_` 접두사) | 기본값 | 용도 |
| --- | --- | --- |
| `TELEMETRY_RECEIVE_TIMEOUT_SECONDS` | 45 | 무수신 연결 종료 |
| `TELEMETRY_STALE_SECONDS` | 3 | 관절과 베이스 관측 만료 |
| `TELEMETRY_SUPERVISOR_STALE_SECONDS` | 5 | Supervisor와 safety 관측 만료 |
| `TELEMETRY_BATTERY_STALE_SECONDS` | 30 | 배터리 관측 만료 |
| `TELEMETRY_POLL_INTERVAL_MS` | 200 | 브라우저 관측 조회 간격 |
| `TELEMETRY_ACTIVITY_SAMPLE_SECONDS` | 2 | 같은 활동 구간 저장 간격 |
| `TELEMETRY_BATTERY_SAMPLE_SECONDS` | 30 | 배터리 저장 간격; 충전 변경은 즉시 저장 |
| `TELEMETRY_RETENTION_DAYS` | 90 | 배터리, 활동, 이벤트 보관 기간 |
| `TELEMETRY_PRUNE_INTERVAL_SECONDS` | 3600 | 만료 기록 정리 간격 |
| `TELEMETRY_MOVING_SPEED_THRESHOLD` | 0.01 | odom 선속도(m/s) 또는 각속도(rad/s)의 이동 판정 하한 |

만료는 원본 나이와 서버 수신 이후 경과 시간을 함께 반영합니다. 관측 연결이 닫히면
즉시 마지막 값으로 표시하며 재시작도 같은 규칙을 따릅니다. 활동 우선순위는 Supervisor
장애 잠금, safety 보호/비상정지, 충전, Gateway 오류/작업/이동, odom 이동, Gateway 대기,
미수신입니다. Gateway가 Mock 모드인 가동 시간을 실제 관측으로 저장하지 않습니다.
각 상태는 상호 배타적이며 유효기간이 끝난 시간은 미수신에 포함합니다.

배터리는 시간 구간 평균이고 빈 구간을 선으로 연결하지 않습니다. 시각은 Backend 수신
시각 기준입니다. 장기 보관과 고주파 관절 재생이 필요한 경우 별도 Logger를 사용합니다.
Supervisor 상태 조회는 복구 명령 권한을 만들지 않습니다. 관측된 안전 채널이 오래되면
수동 이동을 차단하지만 기존 STOP 경로와 물리 비상정지는 별개입니다.

## 자연어 운영 AI

루트에서 서버를 실행하면 `.env`의 `OPENAI_API_KEY`를 서버에서만 읽는다.
[설계/검증](../../docs/architecture/operations-agent.md),
[승인 경계 ADR](../../docs/adr/0012-natural-language-operations-agent.md)를 따른다.

```dotenv
OPENAI_API_KEY=your-server-side-key
CLEANY_AGENT_PROVIDER=openai
CLEANY_AGENT_MODEL=gpt-6.1-sol
CLEANY_AGENT_REASONING_EFFORT=low
CLEANY_AGENT_REQUEST_TIMEOUT_SECONDS=90
CLEANY_AGENT_TURN_TIMEOUT_SECONDS=180
CLEANY_AGENT_MAX_OUTPUT_TOKENS=4000
CLEANY_AGENT_MAX_TOOL_ROUNDS=6
CLEANY_AGENT_MAX_PLAN_ITEMS=50
CLEANY_AGENT_PLAN_TTL_SECONDS=900
CLEANY_AGENT_HISTORY_TURNS=20
CLEANY_AGENT_HISTORY_RETENTION_DAYS=90
CLEANY_AGENT_STREAM_HEARTBEAT_SECONDS=5
CLEANY_AGENT_MAX_CONCURRENT_TURNS=4
```

### Jetson Qwen으로 개발하기

기본 제공자는 OpenAI다. 로컬 모드에서는 노트북 Backend가 SSH 터널을 통해 Jetson의
`cleany-local-llm.service`에 요청한다. 모델 선택 경로는 `/var/opt/cleany/models/local-vlm/active`다.

1. Jetson에서 같은 버전의 TensorRT Edge-LLM SDK 소스와 기존 `llm_inference` 빌드 트리를 준비한다.
   두 경로를 `EDGE_SDK_SRC`, `EDGE_SDK_BUILD`로 설정하고 저장소 루트에서 텍스트 실행기를 빌드한다.

   ```bash
   mkdir -p "$HOME/.cache/cleany-builds/local-llm"
   binary="$HOME/.cache/cleany-builds/local-llm/qwen_text_runner"
   CUDA_HOME=/usr/local/cuda-12.6 tools/agent/build_text_runner.sh "$EDGE_SDK_SRC" "$EDGE_SDK_BUILD" "$binary"
   ```

2. 버전 디렉터리에 `qwen_text_runner`, `tools/agent/qwen_worker.py`, `tools/agent/qwen_resident.py`,
   `apps/backend/control_plane/agent_intents.py`를 함께 설치하고
   `/opt/cleany/runtimes/local-llm/current`가 이 디렉터리를 가리키게 한다.
   같은 포트에서 이전 개발 worker가 실행 중이면 교체 시점에 종료한다.

   ```bash
   target=/opt/cleany/runtimes/local-llm
   release_id=$(sha256sum "$binary" tools/agent/{qwen_worker,qwen_resident}.py apps/backend/control_plane/agent_intents.py | sha256sum | cut -c1-12)
   install -d -m 700 "$target/$release_id"
   install -m 755 "$binary" "$target/$release_id/qwen_text_runner"
   install -m 644 tools/agent/{qwen_worker,qwen_resident}.py apps/backend/control_plane/agent_intents.py "$target/$release_id/"
   ln -sfnT "$release_id" "$target/current.next"
   mv -Tf "$target/current.next" "$target/current"
   install -Dm644 tools/agent/cleany-local-llm.service "$HOME/.config/systemd/user/cleany-local-llm.service"
   systemctl --user daemon-reload
   systemctl --user enable cleany-local-llm.service
   systemctl --user restart cleany-local-llm.service
   ```

3. 노트북에서 기존 터널을 사용하거나 다음과 같이 연다. 준비 상태가 HTTP 200이면 Backend를 실행한다.

   ```bash
   systemd-run --user --collect --unit=cleany-dashboard-qwen-tunnel --property=Restart=on-failure --property=RestartSec=5 /usr/bin/ssh -NT -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:18764:127.0.0.1:18764 jetson-orin-via-n100
   curl --fail http://127.0.0.1:18764/health
   CLEANY_AGENT_PROVIDER=qwen uv run --project apps/backend python apps/backend/run.py
   ```

`CLEANY_AGENT_QWEN_URL`의 기본값은 `http://127.0.0.1:18764`다. 서비스는 loopback에서
`GET /v1/models`와 `POST /v1/chat/completions`를 제공한다. 모델 이름은 `local-vlm/active`다.
텍스트 메시지, `temperature=0`, 비스트리밍 응답과 1~256 출력 토큰을 지원한다.

```bash
curl --fail http://127.0.0.1:18764/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"local-vlm/active","messages":[{"role":"user","content":"삼각형의 변은 몇 개야?"}],"max_tokens":24}'
```

서버 한 프로세스가 4B 실행기 하나를 관리한다. 서비스 시작 시 모델을 적재하고 준비 중에는
`/health`가 503을 반환한다. 로컬 추론은 한 번에 한 건이다. 현장 팔 계획기의 GPU 잠금은
`/var/opt/cleany/state/cleany/gpu-work.lock`이다. 로봇이 이 잠금을 보유하거나
짝 파일 `.demand`로 대기 의사를 표시하면 새 질문은 요청 제한 시간까지 기다린다.
그동안 모델은 RAM에 남고, 잠금이 풀리면 같은 실행기에서 답한다. 이미 시작한
추론은 GPU 잠금을 반납할 때까지 실행한다. 동시 요청이나 대기 시간 초과는 429다.
운영 설정은 가용 RAM 3 GiB 미만에서 실행기를 종료하고 7 GiB 이상에서 다시 적재한다.
단순 현재 상태 조회와 명확한 날짜
후속 질문은 Backend에서 검증된 도구를 직접 호출한다.

Jetson에서 `systemctl --user status cleany-local-llm`로 서비스를 확인한다. 중지 및
자동 기동 해제는 `systemctl --user disable --now cleany-local-llm`로 한다.
노트북의 터널만 닫으려면 `systemctl --user stop cleany-dashboard-qwen-tunnel`을 사용한다.

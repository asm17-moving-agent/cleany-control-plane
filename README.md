# Cleany Control Plane

Cleany의 Web Dashboard, Mission Queue, Robot 연결 경계와 외부 Mission lifecycle을
관리하는 control-plane monorepo입니다.

> 현재 구현은 관제 사용자 흐름과 Backend–Robot 계약을 검증하기 위한 prototype입니다.
> ROS 2 Robot Mission Manager와 실제/시뮬레이션 Robot backend는
> [`cleany`](https://github.com/asm17-moving-agent/cleany) 저장소에서 관리합니다.

## MVP 시나리오

운영자가 18층 시설 지도에서 구역을 선택하고 Mission을 요청하면, Mock Backend가 우선순위
Queue와 단일 Robot lifecycle을 실행합니다. Dashboard는 Server-Sent Events로 상태
변경과 최종 결과를 갱신합니다.

```text
Dashboard
  → Mission API
  → Priority Queue
  → Mock Robot lifecycle
  → Server-Sent Events
  → Dashboard status/result
```

## 제공 기능

### Dashboard

- React Router 기반 운영 화면과 TanStack Query 기반 server state
- 실제 안내도 비율을 반영한 가로형 SVG 도면과 SVG 선택 overlay를 결합한 구역 선택
- 구역·좌석을 포괄하는 Mission target과 `NORMAL`/`HIGH` 우선순위 요청
- Mission 단계·우선순위 필터, 진행률, checkpoint 취소와 최종 결과
- Robot heartbeat, Mission 처리율과 최근 활동 모니터링
- Robot 연결 및 현재 할당 Mission 확인
- 브라우저별 화면 갱신·Mission 기본값 설정

### Mock Backend

- FastAPI·Pydantic 기반 HTTP/SSE transport와 OpenAPI
- 메모리 기반 Mission Queue와 `HIGH` 우선 처리
- 단일 Mock Robot과 하나의 활성 Mission
- 외부 Mission lifecycle 및 terminal outcome 불변성
- idempotency key 기반 중복 Mission 생성 방지
- 안전 checkpoint에서 처리하는 취소 요청
- 좌석 fixture, Mission, Robot 조회 API와 SSE 상태 event

### Contracts

- Mission 요청 JSON Schema
- Mission event JSON Schema
- 좌석 상태 JSON Schema

## 빠른 시작

### 요구사항

- Python 3.11 이상
- Node.js 24 이상
- uv
- pnpm 11.21.0
- 최신 Chromium, Chrome, Firefox 또는 Safari

### pnpm이 없을 때

이 저장소는 루트 `package.json`의 `packageManager`에 `pnpm@11.21.0`을 고정한다.
먼저 `node --version`으로 Node.js 24 이상이 설치되어 있는지 확인한다. Node.js가
없다면 [Node.js 다운로드](https://nodejs.org/en/download) 또는 운영체제 패키지
관리자로 설치한 뒤 다음 명령으로 저장소와 같은 pnpm 버전을 설치한다.

```bash
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=11.21.0 sh -
```

설치가 끝나면 새 터미널을 열고 확인한다.

```bash
pnpm --version
# 11.21.0
```

현재 checkout처럼 `apps/dashboard/dist/index.html`이 이미 존재하면 pnpm 없이도
빌드된 Dashboard를 실행할 수 있다.

```bash
test -f apps/dashboard/dist/index.html
uv sync --project apps/backend --extra dev
uv run --project apps/backend python apps/backend/run.py
```

이 경우 브라우저에서 [http://127.0.0.1:8080](http://127.0.0.1:8080)을 연다.

### 실행

```bash
git clone --recurse-submodules \
  git@github.com:asm17-moving-agent/cleany-control-plane.git
cd cleany-control-plane
pnpm install
pnpm build
uv sync --project apps/backend --extra dev
uv run --project apps/backend python apps/backend/run.py
```

브라우저에서 [http://127.0.0.1:8080](http://127.0.0.1:8080)을 열고 시설 구역과
우선순위를 선택해 Mission을 생성합니다. 서버 종료는 실행한 터미널에서 `Ctrl+C`를
누릅니다.

### 개발 서버(hot reload)

Backend와 Vite를 터미널 두 개에서 실행한다.

터미널 1:

```bash
uv sync --project apps/backend --extra dev
uv run --project apps/backend python apps/backend/run.py
```

터미널 2:

```bash
pnpm install
pnpm dev
```

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173)을 연다. Vite가
`/api` 요청을 `127.0.0.1:8080`으로 전달한다.

이 Codex 작업 환경에서만 pnpm과 Node.js가 PATH에 없고 기존 `node_modules`가 남아
있다면 다음 임시 명령으로 Vite를 직접 실행할 수도 있다. 반드시 Dashboard app
디렉터리에서 실행해야 한다.

```bash
cd apps/dashboard
/usr/lib/chatgpt/resources/cua_node/bin/node \
  node_modules/vite/bin/vite.js --host 127.0.0.1
```

이미 저장소를 clone했다면 KB submodule을 별도로 초기화합니다.

```bash
git submodule update --init --recursive docs/cleany-docs
```

## API

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/api/health` | Backend 상태 확인 |
| `GET` | `/api/seats` | 48석 배치와 사용 상태 조회 |
| `GET` | `/api/robots` | Robot 상태와 활성 Mission 조회 |
| `GET` | `/api/missions` | Mission 목록 조회 |
| `POST` | `/api/missions` | Mission 생성 |
| `POST` | `/api/missions/{mission_id}/cancel` | Mission 취소 요청 |
| `GET` | `/api/events/stream` | 상태 변경 SSE 구독 |

Machine-readable payload의 Source of Truth는
[`packages/contracts`](packages/contracts/README.md)입니다.

## 저장소 구조

```text
apps/backend/          FastAPI transport와 Mock control-plane
apps/dashboard/        React scenario validation Dashboard
packages/contracts/    API/event JSON Schema
docs/architecture/     cross-app architecture
docs/adr/              기술 선택 기록
docs/cleany-docs/      제품·기획·예비설계 KB submodule
```

세부 설명은 다음 문서를 참고합니다.

- [Backend](apps/backend/README.md)
- [Dashboard](apps/dashboard/README.md)
- [Cleany KB](docs/cleany-docs/README.md)
- [Control-plane architecture](docs/architecture/control-plane-overview.md)
- [ADR: control-plane monorepo](docs/adr/0001-control-plane-monorepo.md)
- [ADR: dependency-free prototype](docs/adr/0002-prototype-without-framework.md)
- [ADR: production application stack](docs/adr/0003-production-application-stack.md)

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
uv run --project apps/backend --extra dev pytest apps/backend/tests
uv run --project apps/backend --extra dev ruff check apps/backend
```

테스트는 priority dispatch, idempotency, terminal Mission 불변성, 취소 처리와 target
계약을 검증합니다.

## 현재 제한사항

- 데이터는 메모리에만 저장되며 서버 재시작 시 초기화됩니다.
- Robot lifecycle은 시간 기반 Mock dispatcher가 수행합니다.
- 인증, 권한, PostgreSQL과 실제 Robot transport는 아직 포함하지 않습니다.
- Dashboard 설정은 Backend 계약이 확정되기 전까지 브라우저 `localStorage`에만
  저장됩니다.
- PostgreSQL 영속화와 실제 Robot Gateway는 다음 구현 단계입니다.

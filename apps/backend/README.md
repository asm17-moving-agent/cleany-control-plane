# Control Plane Backend

관제 사용자 흐름과 contract를 검증하는 FastAPI Backend다. HTTP/SSE transport와
domain 및 Mock dispatcher를 분리해 core logic을 독립적으로 검증한다.

## 제공 기능

- `HIGH`, `NORMAL` priority Queue
- 단일 Mock Robot과 하나의 활성 Mission
- Mission 생성, 조회와 checkpoint 취소
- `SEAT`, `ZONE`, `POINT` Mission target
- 48석 배치와 Mock 좌석 사용 상태 조회
- SSE 상태 event
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

## 검증

```bash
uv run --project apps/backend --extra dev pytest apps/backend/tests
uv run --project apps/backend --extra dev ruff check apps/backend
```

현재 저장소와 Queue는 메모리 기반 prototype이다. PostgreSQL, 실제 Robot connection과
인증은 계약 검증 후 별도 변경으로 추가한다.

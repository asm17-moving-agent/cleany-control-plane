# Cleany Control Plane

Cleany의 Web Dashboard, Mission Queue, Robot 연결 경계와 외부 Mission lifecycle을
관리하는 control-plane monorepo입니다.

> 현재 구현은 관제 사용자 흐름과 Backend–Robot 계약을 검증하기 위한 prototype입니다.
> ROS 2 Robot Mission Manager와 실제/시뮬레이션 Robot backend는
> [`cleany`](https://github.com/asm17-moving-agent/cleany) 저장소에서 관리합니다.

## MVP 시나리오

운영자가 배치도에서 좌석을 선택하고 Mission을 요청하면, Mock Backend가 우선순위
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

- `3석–통로–2석–통로–3석` 구조의 48석 배치도
- 단일 좌석 선택과 `NORMAL`/`HIGH` 우선순위 Mission 요청
- Mission 단계·우선순위 필터, 진행률, checkpoint 취소와 최종 결과
- Robot heartbeat, 좌석 사용률과 최근 활동 모니터링
- Robot 연결 및 현재 할당 Mission 확인
- 브라우저별 화면 갱신·Mission 기본값 설정

### Mock Backend

- 메모리 기반 Mission Queue와 `HIGH` 우선 처리
- 단일 Mock Robot과 하나의 활성 Mission
- 외부 Mission lifecycle 및 terminal outcome 불변성
- idempotency key 기반 중복 Mission 생성 방지
- 안전 checkpoint에서 처리하는 취소 요청
- 좌석, Mission, Robot 조회 API와 SSE 상태 event

### Contracts

- Mission 요청 JSON Schema
- Mission event JSON Schema
- 좌석 상태 JSON Schema

## 빠른 시작

별도 패키지 설치 없이 Python 표준 라이브러리만 사용합니다.

### 요구사항

- Python 3.11 이상
- 최신 Chromium, Chrome, Firefox 또는 Safari

### 실행

```bash
git clone git@github.com:asm17-moving-agent/cleany-control-plane.git
cd cleany-control-plane
python3 apps/backend/run.py
```

브라우저에서 [http://127.0.0.1:8080](http://127.0.0.1:8080)을 열고 좌석과
우선순위를 선택해 Mission을 생성합니다. 서버 종료는 실행한 터미널에서 `Ctrl+C`를
누릅니다.

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
apps/backend/          dependency-free Mock Backend
apps/dashboard/        scenario validation Dashboard
packages/contracts/    API/event JSON Schema
docs/architecture/     cross-app architecture
docs/adr/              기술 선택 기록
```

세부 설명은 다음 문서를 참고합니다.

- [Backend](apps/backend/README.md)
- [Dashboard](apps/dashboard/README.md)
- [Control-plane architecture](docs/architecture/control-plane-overview.md)
- [ADR: control-plane monorepo](docs/adr/0001-control-plane-monorepo.md)
- [ADR: dependency-free prototype](docs/adr/0002-prototype-without-framework.md)

## 검증

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s apps/backend/tests -v
```

테스트는 priority dispatch, idempotency, terminal Mission 불변성, 취소 처리와 좌석
계약을 검증합니다.

## 현재 제한사항

- 데이터는 메모리에만 저장되며 서버 재시작 시 초기화됩니다.
- Robot lifecycle은 시간 기반 Mock dispatcher가 수행합니다.
- 인증, 권한, PostgreSQL과 실제 Robot transport는 아직 포함하지 않습니다.
- Dashboard 설정은 Backend 계약이 확정되기 전까지 브라우저 `localStorage`에만
  저장됩니다.
- 최종 Frontend·Backend framework는 계약과 사용자 시나리오 검증 후 결정합니다.

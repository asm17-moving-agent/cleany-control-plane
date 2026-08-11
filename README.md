# Cleany Control Plane

Cleany의 Web Dashboard, Mission Queue, Robot 연결과 외부 Mission lifecycle을 관리하는
monorepo다.

## 현재 목표

첫 vertical slice는 운영자가 Web Dashboard에서 좌석 Mission을 요청하고, Mock
Backend의 Queue와 Robot 상태 변화, 최종 결과를 확인하는 흐름이다.

```text
Dashboard
→ Mission API
→ Priority Queue
→ Mock Robot lifecycle
→ Server-Sent Events
→ Dashboard status/result
```

현재 prototype은 계약과 사용자 시나리오를 먼저 검증하기 위해 Python 표준
라이브러리와 정적 Web asset만 사용한다. 최종 Frontend, Backend framework는 ADR
검토 후 교체한다.

## 구조

```text
apps/backend/          dependency-free Mock Backend
apps/dashboard/        scenario validation Dashboard
packages/contracts/    API/event schema and examples
docs/architecture/     cross-app architecture
docs/adr/              implementation decisions
```

## 실행

```bash
python3 apps/backend/run.py
```

그다음 `http://127.0.0.1:8080`을 열고 좌석과 우선순위를 선택해 Mission을
생성한다.

## 검증

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s apps/backend/tests -v
```


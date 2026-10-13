# Control Plane Overview

## 목표

운영자의 좌석·구역·지점 요청을 Queue에 보존하고 실행 가능한 Robot에 Mission을
제안한다. Robot이 수락한 후에는 Mission Manager가 내부 lifecycle을 소유하고,
Control Plane은 운영 단계와 결과만 관리한다.

## 책임

| 구성요소 | 책임 |
|---|---|
| Dashboard | 시설 target 선택, Mission 요청과 취소, 진행과 결과 표시 |
| Backend | priority Queue, Mission Offer, Robot 가용 상태, 외부 lifecycle |
| Robot Gateway | Backend 연결, 중복 제거, ROS Action 변환, 재전송 |
| Mission Manager | Mission 수락과 거절, 내부 실행, checkpoint 취소, 최종 report |

## MVP 불변식

- 단일 Robot에 활성 Mission 하나만 허용한다.
- `HIGH`를 `NORMAL`보다 먼저 할당하고 같은 priority에서 FIFO를 유지한다.
- Backend는 Robot 내부 state를 강제하지 않는다.
- terminal Mission은 다시 실행하거나 변경하지 않는다.
- Mission cancel, safe stop과 e-stop은 서로 다른 제어 경로다.

## 현재 구현

현재 Backend는 FastAPI transport, SQLite Queue와 양방향 Robot Gateway를 사용한다.
React Dashboard는 React Router로 화면을 분리하고 TanStack Query cache에 HTTP와 SSE
server state를 반영한다. 재연결 시 snapshot으로 복구하며 Runtime이 보낸 phase와
report를 표시한다. 명시적 `mock` 모드는 UI 검증에 사용한다.

```text
React page
  → TanStack Query
  → FastAPI HTTP / SSE
  → ControlPlaneStore
  → SQLite repository / Gateway WebSocket
  → Robot Gateway / Mission Manager (cleany 저장소)
```

HTTP transport, domain store와 Gateway는 분리한다. Backend는 Robot의 내부 FSM을
변경하지 않는다. 상세 메시지와 재시작 규칙은
[Gateway 통합 계약](robot-gateway-integration.md)을 따른다.

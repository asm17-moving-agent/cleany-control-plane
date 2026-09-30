# ADR 0005: 미션 Gateway WebSocket과 SQLite 복구

## 배경

SCRUM-403은 위치와 yaw를 연동했지만 미션 실행과 Robot 가용 상태는 MockDispatcher가
수행했다. SCRUM-363은 Dashboard 요청을 외부 FSM 런타임에 전달하고 실제 진행과
결과를 표시해야 한다. Backend의 Python 환경과 ROS 환경은 별도 프로세스로 유지한다.

## 결정

- 기존 pose 채널을 유지하고 미션은 Robot이 연결하는 양방향 WebSocket으로 전달한다.
- Backend는 Queue, Offer, ACK, 중복 제거, 외부 phase와 결과 참조를 소유한다.
- Robot Gateway와 FSM 실행 서버는 `cleany`의 별도 세션 산출물이다.
- 기본 모드는 Gateway이며 MockDispatcher는 명시적 `mock` 모드에서만 실행한다.
- 단일 Backend 프로세스에서 표준 라이브러리 SQLite를 사용한다. Mission, idempotency,
  수신 이벤트, 명령 outbox와 Robot snapshot을 동일 트랜잭션에 저장한다.
- DB commit 후 ACK/SSE를 전달한다. 고빈도 pose는 이 영속 기록과 분리한다.
- 단일 활성 슬롯과 terminal report 불변성은 DB index와 trigger로도 보호한다.
- 최초 handshake 전에는 Robot을 offline으로 표시하고 실제 지원 좌석만 요청을 허용한다.

## 결과와 제한

재연결과 Backend 재시작에서 Queue·결과를 복원할 수 있다. 네트워크 단절만으로
수락한 미션을 재실행하거나 종료하지 않는다. 런타임 boot 변경 시 자동 재개를 허용하지 않는다.

SQLite repository와 in-process 연결 관리는 **단일 worker** 전제다. 다중 worker,
PostgreSQL, AWS 배포와 인증은 이번 변경에 포함하지 않는다. 기록 자동삭제는 수행하지 않는다.
Fake Gateway 검증은 계약 증거이며 실제 Gazebo 왕복이나 물체 정리 성공의 증거가 아니다.

## 관련 자료

- [SCRUM-363](https://aiagentwantstomove.atlassian.net/browse/SCRUM-363)
- [연동 계약과 런타임 요구사항](../architecture/robot-gateway-integration.md)
- [Operations contracts](../../packages/contracts/README.md)

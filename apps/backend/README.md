# Mock Backend

관제 사용자 흐름과 contract를 검증하기 위한 dependency-free Backend다.

## 제공 기능

- `HIGH`, `NORMAL` priority Queue
- 단일 Mock Robot과 하나의 활성 Mission
- Mission 생성, 조회와 checkpoint 취소
- 48석 배치와 Mock 좌석 사용 상태 조회
- SSE 상태 event
- idempotency key 기반 중복 생성 방지

이 구현은 메모리 기반 prototype이며 재시작 복구와 Robot WebSocket을 제공하지
않는다. PostgreSQL, Robot connection과 인증은 계약 검증 후 추가한다.

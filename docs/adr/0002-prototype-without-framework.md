# ADR-0002: 최초 관제 vertical slice는 framework 없이 검증한다

- 상태: Superseded by ADR-0003

## Context

최초 목표는 제품 UI 완성이 아니라 좌석 요청, Queue, Robot phase, 취소와 결과
표시 계약 검증이다. 현재 로컬 환경에 Node.js와 Python package manager가 준비되지
않았다.

## Proposal

Python 표준 라이브러리 Backend와 정적 HTML, CSS, JavaScript로 최초 vertical slice를
검증한다. contract가 안정되면 선택한 Frontend, Backend framework로 교체한다.

## Consequences

- 추가 설치 없이 사용자 흐름을 즉시 검증할 수 있다.
- prototype은 생산 운영, 영속성, 인증과 framework 선택의 근거가 아니다.
- framework 전환 전에 별도 ADR 검토가 필요하다.

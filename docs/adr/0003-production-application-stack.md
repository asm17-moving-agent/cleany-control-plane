# ADR-0003: 관제 애플리케이션 framework와 상태 관리 도구를 채택한다

- 상태: Accepted
- 일자: 2026-08-12
- 대체: ADR-0002의 framework 미선정 상태

## Context

정적 HTML, CSS와 JavaScript 및 Python 표준 라이브러리 서버로 최초 vertical slice를
검증했다. 좌석 선택 외에 Mission 관리, 모니터링, Robot과 설정 화면까지 추가되면서
단일 파일의 DOM 갱신, HTTP 요청, SSE 상태와 화면 이동을 함께 유지하기 어려워졌다.

마이그레이션 중에는 검증된 화면 구성과 사용자 흐름을 유지해야 한다. 또한
`packages/contracts/`의 machine-readable contract가 계속 Source of Truth여야 한다.

## Decision

- Dashboard는 React, TypeScript와 Vite를 사용한다.
- 화면 이동은 React Router의 declarative routing으로 관리한다.
- HTTP와 SSE로 받은 server state는 TanStack Query cache로 관리한다.
- 지역 UI 상태는 React state로 유지하고 별도 global state manager는 도입하지 않는다.
- 스타일은 Tailwind CSS token과 utility를 기본으로 사용한다.
- 좌석 배치도와 출입문처럼 도형·격자 중심인 표현은 전용 CSS를 허용한다.
- Backend HTTP transport는 FastAPI와 Pydantic으로 교체한다.
- 기존 domain과 Mock dispatcher는 transport 전환 중 그대로 재사용한다.
- 계약 schema 변경은 이 ADR 범위에 포함하지 않는다.

## Migration constraints

- React 전환 전후의 주요 화면을 동일 Chromium과 viewport에서 비교한다.
- 기존 CSS는 React component 전환이 완료될 때까지 compatibility layer로 유지한다.
- Tailwind Preflight는 compatibility layer와 충돌하지 않도록 사용하지 않는다.
- Dashboard와 Backend transport를 동시에 교체하지 않는다.
- PostgreSQL 영속화는 FastAPI transport parity가 확인된 이후 별도 변경으로 진행한다.

## Consequences

- URL, server state, local UI state의 책임이 분리된다.
- Dashboard build에 Node.js와 pnpm이 필요하다.
- Backend 실행에 Python package 설치가 필요하다.
- 정적 파일 배포 전 `pnpm build`가 필요하다.
- 시각 회귀와 API contract 검증을 CI에서 실행할 수 있다.

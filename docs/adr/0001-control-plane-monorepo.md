# ADR-0001: Dashboard와 Backend를 control-plane monorepo에 둔다

- 상태: Accepted

## Context

Dashboard, Mission API와 공통 contract는 초기 E2E 검증에서 같이 변경된다. 기존
`cleany` 저장소는 ROS 2 Robot Edge 구현 경계다.

## Decision

Dashboard, Backend, 관제 contract와 infra는 `cleany-control-plane` monorepo에 둔다.
ROS 2 Mission Manager와 Robot Gateway는 `cleany` 저장소에 둔다.

## Consequences

- Frontend, Backend과 contract를 하나의 PR에서 검증할 수 있다.
- Backend–Robot contract는 두 저장소가 사용할 수 있게 versioned artifact가 필요하다.
- KB는 큰 책임 경계만 유지한다.


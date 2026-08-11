# Operations Contracts

Dashboard, Backend와 Robot Gateway 간 machine-readable contract의 Source of Truth다.

## 현재 schema

- `mission-request.schema.json`
- `mission-event.schema.json`
- `seat.schema.json`

schema는 MVP 사용자 흐름을 검증하는 최소 범위다. Robot transport와 영속 Backend를
구현할 때 OpenAPI, AsyncAPI와 생성 type을 추가한다.

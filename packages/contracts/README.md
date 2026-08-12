# Operations Contracts

Dashboard, Backend와 Robot Gateway 간 machine-readable contract의 Source of Truth다.

## 현재 schema

- `mission-request.schema.json`
- `mission-event.schema.json`
- `seat.schema.json`
- `openapi.json`

schema는 MVP 사용자 흐름을 검증하는 최소 범위다. Robot transport와 영속 Backend를
구현할 때 AsyncAPI 범위를 추가한다.

FastAPI의 HTTP 계약은 `openapi.json` snapshot으로 검토하며 Dashboard TypeScript
타입은 이 파일에서 생성한다. Backend schema가 변경되면 다음 명령으로 snapshot과
생성 타입을 함께 갱신한다.

```bash
pnpm contracts
pnpm contracts:check
```

# Operations Contracts

Dashboard, Backend와 Robot Gateway 간 machine-readable contract의 Source of Truth다.

## 현재 schema

- `mission-request.schema.json`
- `mission-event.schema.json`
- `seat.schema.json`
- `openapi.json`

schema는 MVP 사용자 흐름을 검증하는 최소 범위다. Robot transport와 영속 Backend를
구현할 때 AsyncAPI 범위를 추가한다.

`MissionRequest`는 신규 요청의 `target` 객체(`SEAT`, `ZONE`, `POINT`)를 지원한다.
이전 Dashboard 호환을 위해 최상위 `seat_id`도 임시 허용하되 두 필드는 동시에 보낼
수 없다. 응답은 항상 정규화된 `target`을 포함한다.

FastAPI의 HTTP 계약은 `openapi.json` snapshot으로 검토하며 Dashboard TypeScript
타입은 이 파일에서 생성한다. Backend schema가 변경되면 다음 명령으로 snapshot과
생성 타입을 함께 갱신한다.

```bash
pnpm contracts
pnpm contracts:check
```

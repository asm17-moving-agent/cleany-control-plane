# Operations Contracts

Dashboard, Backend와 Robot Gateway 간 machine-readable contract의 Source of Truth다.

## 현재 schema

- `mission-request.schema.json`
- `mission-event.schema.json`
- `seat.schema.json`
- `robot-pose.schema.json` (Robot Edge WebSocket payload; finite `x`, `y` only)
- `robot-pose-event.schema.json` (SSE envelope, HTTP snapshot과 같은 payload)
- `openapi.json`

schema는 MVP 사용자 흐름을 검증하는 최소 범위다. Robot transport와 영속 Backend를
구현할 때 AsyncAPI 범위를 추가한다.

`MissionRequest`는 신규 요청의 `target` 객체(`SEAT`, `ZONE`, `POINT`)를 지원한다.
이전 Dashboard 호환을 위해 최상위 `seat_id`도 임시 허용하되 두 필드는 동시에 보낼
수 없다. 응답은 항상 정규화된 `target`을 포함한다.

좌석의 `zone_id`는 D-HUB 또는 SPACE 방을 구분하며 생략된 기존 데이터는 `d-hub`로
해석한다. `row`와 `grid_column`은 해당 구역 내부 좌표다. SPACE 좌석은
`seat-a1-01` / `A1-01` 같은 ID와 표시명을 사용한다. 점유 정보가 없는 좌석은
`UNKNOWN`과 `occupant_name: null`로 반환한다. `seat.schema.json`에 예시가 있다.

FastAPI의 HTTP 계약은 `openapi.json` snapshot으로 검토하며 Dashboard TypeScript
타입은 이 파일에서 생성한다. Backend schema가 변경되면 다음 명령으로 snapshot과
생성 타입을 함께 갱신한다.

```bash
pnpm contracts
pnpm contracts:check
```

Robot Edge는 `ws(s)://<host>/api/robots/cleany-01/pose/ws`에 초당 5회
`{"x": number, "y": number}`를 전송한다. 추가 필드와 비유한 값은 거부된다.
브라우저 snapshot은 `GET /api/robots/cleany-01/pose`이며, 갱신과 stale 전환은
기존 `/api/events/stream`의 `robot.pose`와 `robot.pose.stale` 이벤트다.

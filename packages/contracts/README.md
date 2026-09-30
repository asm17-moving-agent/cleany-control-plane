# Operations Contracts

Dashboard, Backend와 Robot Gateway 간 machine-readable contract의 Source of Truth다.

## 현재 schema

- `mission-request.schema.json`
- `mission-event.schema.json`
- `seat.schema.json`
- `robot-pose.schema.json` (Robot Edge WebSocket payload; finite `x`, `y` only)
- `robot-pose-event.schema.json` (SSE envelope, HTTP snapshot과 같은 payload)
- `openapi.json`
- `gateway-robot-message.schema.json` (Gateway → Backend)
- `gateway-backend-message.schema.json` (Backend → Gateway)
- [`examples/gateway-v1.json`](examples/gateway-v1.json)

HTTP/SSE와 Gateway WebSocket 계약을 관리한다. Gateway의 ACK, 재연결, 실행 슬롯과
런타임 측 요구사항은 [연동 계약](../../docs/architecture/robot-gateway-integration.md)을 따른다.

`MissionRequest`는 신규 요청의 `target` 객체(`SEAT`, `ZONE`, `POINT`)를 지원한다.
이전 Dashboard 호환을 위해 최상위 `seat_id`도 임시 허용하되 두 필드는 동시에 보낼
수 없다. 응답은 항상 정규화된 `target`을 포함한다.
Gateway 모드의 v1 실행 대상은 런타임 snapshot에 명시된 `SEAT`만 허용한다.
지원 좌석은 `mission_supported: true`, 미지원은 `false`, 최초 snapshot 전에는 `null`이다.
같은 idempotency key와 다른 요청 내용은 HTTP 409를 반환한다.

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
`{"x": number, "y": number, "yaw"?: number | null}`을 전송한다.
정의하지 않은 필드와 비유한 값은 거부된다.
브라우저 snapshot은 `GET /api/robots/cleany-01/pose`이며, 갱신과 stale 전환은
기존 `/api/events/stream`의 `robot.pose`와 `robot.pose.stale` 이벤트다.

미션 Gateway는 별도 `/api/robots/cleany-01/gateway/ws`에 연결한다. Backend는 ROS를
import하지 않으며 Gateway가 ROS 인터페이스와 이 계약을 변환한다.
미션 응답의 `accepted_at`과 `finished_at`은 Backend에서 최초 실행 증거·최종 결과를
수신한 UTC 시각이다. 실제 로봇의 동작 시작·정지 시각이나 ROS `/clock`이 아니다.
Robot의 `last_seen_at`은 첫 런타임 상태 수신 전 `null`이다.

`pnpm contracts`는 OpenAPI, 양방향 Gateway schema와 TypeScript를 생성한다.
`pnpm contracts:check`는 임시 TypeScript 생성물을 비교하므로 파일을 변경하지 않고,
미커밋 변경이 있어도 생성물의 최신 상태를 검증할 수 있다.

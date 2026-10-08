# Operations Contracts

Dashboard, Backend와 Robot Gateway 간 machine-readable contract의 Source of Truth다.

## 계정과 접근 계약

`openapi.json`의 `LoginInput`, `PasswordInput`, `SessionResponse`, `SitesResponse`가 계정 API 계약이다.
[예시](examples/accounts.json)처럼 로그인 → 필요 시 비밀번호 변경 → 시설 조회 순서로 사용한다.
`/api/health` 이외의 HTTP API는 세션이 필요하며, 임시 로그인은 `me`, `password/change`, `logout`만 허용한다.
쿠키는 운영에서 `__Host-cleany_session`이고 로컬 HTTP 설정에서는 `cleany_session`이다.
변경 요청은 같은 Origin과 응답의 `csrf_token`을 `X-CSRF-Token` 헤더에 전달해야 한다.

업무 조회·SSE는 `?site_id=SITE_ID`로 선택한다. 시설이 하나면 생략할 수 있다.
고객과 요청자는 서버 세션에서 결정하며 입력 `requested_by`는 deprecated로 무시한다.
중복 key 범위는 고객별이다. 미션 조회는 `limit`(1~100), `before=created_at|mission_id` 커서를 받는다.
`auth.expired` SSE를 받으면 구독을 종료하고 로그인으로 돌아간다.

Robot WebSocket은 등록한 장비 토큰을 `Authorization: Bearer ...` 또는 `X-Cleany-Robot-Token`으로 전달한다.
사용자 세션은 장비 인증을 대체하지 않는다. 프록시 Basic 인증을 쓰면 별도 장비 토큰 헤더를 함께 전달한다.
관측 파일은 `observation://relative/path`로 전달한다. HTTP/SSE 응답은 권한을 검사하는
`/api/missions/{id}/observations/{stage}` 경로를 제공하며 외부 URL·원시 파일 경로는 공개하지 않는다.

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

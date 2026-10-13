# FSM 런타임과 Control Plane 연동 계약 v1

## 소유권과 현재 범위

```text
Dashboard --HTTP/SSE--> Backend Queue --mission WebSocket--> cleany Robot Gateway
                                                          --> Mission Manager FSM
                                                          --> Navigator/Nav2/Gazebo
cleany_telemetry --pose WebSocket--> Backend --snapshot/SSE--> Dashboard 지도
```

이번 구현은 `cleany-control-plane`만 변경한다. `cleany/feat-mission-runtime`과 KB는
변경하지 않는다. Robot Gateway, ROS 실행 인터페이스, checkpoint 취소와 실제 Navigator는
런타임 담당 세션의 산출물이다. Backend는 ROS node, `/cmd_vel` publisher나 Nav2 client가 아니다.

## 연결과 envelope

Gateway가 `ws(s)://<backend>/api/robots/cleany-01/gateway/ws`에 연결한다. Robot ID는
`cleany-01`이며 동시에 하나의 Gateway 연결만 허용한다. pose producer 소유권은 별도다.
다른 Robot, 중복 연결, Mock 모드 연결과 잘못된 schema/state는 close 1008로 거절한다.
heartbeat timeout은 1001, JSON decoding 실패는 1003이다.

정확한 payload는 [양방향 schema](../../packages/contracts/README.md)와
[예제](../../packages/contracts/examples/gateway-v1.json)를 따른다. 공통 필드는
`schema_version=1`, UUID `event_id`, `event_type`, `robot_id`, nullable UUID `mission_id`,
`sequence`, timezone을 포함한 `occurred_at`과 `payload`다.

- Mission feedback의 sequence는 **미션별 양의 증가값**이며 재연결·재제안에도 유지한다.
- Backend 명령과 Robot snapshot/heartbeat/ACK는 sequence 0을 사용한다.
- Backend HTTP/SSE response sequence와 Robot sequence는 서로 다른 cursor다.
- 재전송은 event ID, sequence와 payload를 보존한다. 로봇의 `mission_id` 중복 실행 방지는
  이벤트 ID 중복 제거와 별개로 수행한다.
- heartbeat와 snapshot은 매번 새로운 event ID를 사용한다. 중복 status는 heartbeat 만료를
  갱신하지 않는다. Mission feedback/ACK도 Robot heartbeat를 대신하지 않는다.
- timestamp는 기록용이다. heartbeat 생존 판정은 Backend의 monotonic clock을 사용한다.

## 런타임 담당 세션의 구현 요구사항

연결 후 Backend가 `sync.request`를 전송하며, Gateway는 **fresh `robot.snapshot`을 먼저**
전송한다. Snapshot ACK 후 해당 연결의 미션 피드백을 보낸다.

Snapshot은 boot ID, `IDLE/BUSY/ERROR`, 활성 mission ID와 외부 phase/sequence,
지원 좌석 ID, 취소 지원 여부, 실행 모드와 미확인 final report를 제공한다.
활성 미션이 없으면 active ID/phase는 null, active sequence는 0이다. 최종 report가
완료된 오류 상태는 `ERROR`와 active ID null로 표현한다. 과거 오류 미션을 활성 미션으로
재노출하지 않는다.

| FSM 실행 증거 | Gateway 외부 이벤트 |
|---|---|
| Mission Manager가 요청을 실제 수락 | `mission.accepted` |
| `NAVIGATE_TO_TARGET` | `mission.phase: NAVIGATING` |
| `PERCEIVE`, `PLAN_TASKS`, `EXECUTE_TASKS` | `mission.phase: WORKING` |
| `RETURN_HOME` | `mission.phase: RETURNING` |
| MissionReport 생성 | `mission.result` |

`REPORT` 또는 `IDLE`만으로 성공을 합성하지 않는다. 내부 state는 선택적 진단 필드로
로그에만 전달한다. Runtime status를 시간 기반 애니메이션으로 생성하지 않는다.

Offer payload의 `mission_type`은 `clean_seat`이며 `target_id`는 Dashboard의 canonical
좌석 ID(`seat-12` 등)다. Gateway/Navigator가 좌석 ID→접근 pose와 home pose를 관리한다.
화면 pixel 좌표를 역산해 주행 목표로 사용하지 않는다.

`execution_profile`은 navigation/perception/planning/execution 각각의 `sim/real/mock`를
선언한다. 실제 입력·구현 또는 simulator backend와 scripted mock을 구분한다.
`mission.result`는 모든 모듈의 실행 출처를 다시 포함한다. 실패, 부분 성공, 사람 확인
필요와 취소는 원래 outcome을 보존하며 전후 관측 참조는 실제 자료가 있을 때만 보낸다.

## ACK와 배차

Backend는 commit 완료 후 `ack`를 보내며 `ack_event_id`와 `applied/duplicate/stale/conflict`
disposition을 포함한다. ACK에 다시 ACK하지 않는다. Snapshot ACK는 포함된 final report들의
저장도 확인한다. 단, `conflict`는 기존 terminal 결과와 다름을 뜻하며 사람 확인이 필요하다.
Gateway는 final report를 ACK까지 보관·재전송해야 한다.

Gateway의 Backend 명령 ACK는 **수신 확인**이다. 실제 수락·취소 완료가 아니며 각각
`mission.accepted`, `mission.result: CANCELLED`로 별도 확인한다. 명령 ACK를 생략하면
Backend가 같은 event ID로 재전송하므로 이를 새 실행으로 취급하지 않는다.

Backend는 HIGH 우선·동순위 FIFO이며 OFFERED부터 활성 슬롯을 예약한다. 활성 미션을
선점하지 않고, report와 fresh Robot 가용 상태 모두 확인한 뒤 다음 미션을 제안한다.
영구 거절은 REJECTED로 종료한다. 일시 거절은 미수락이 확인된 경우 재대기하며 새
snapshot까지 새 Offer를 중지한다. 새로운 제안의 event ID는 새 값이지만 mission ID는 같다.

응답 timeout은 수락 실패의 증거가 아니다. Backend는 연결·실행 슬롯을 유지한 채
동기화를 요청한다. `unaccepted_mission_ids`에는 **기존 Offer가 처리되었고 미수락이
확정된 ID만** 넣는다. 비어 있는 active ID만으로 미수락을 추정하지 않는다. 취소 중인
Offer의 미수락이 확인되면 Backend가 CANCELLED로 종료할 수 있다.

## 취소와 장애

- 대기 요청 취소는 로봇 호출 없이 즉시 종료한다. 제안·활성 요청 취소는 명령을 영속
  outbox에 넣고 checkpoint 최종 보고를 기다린다. 취소와 최종 성공이 경합하면 먼저
  확정한 terminal 결과를 보존한다.
- `can_cancel=false`이면 제안·활성 취소 API와 버튼을 차단한다. 대기 요청 취소는 허용한다.
- 일반 cancel, safe stop, 물리 e-stop은 별도 경로다. 이 계약은 e-stop/reset 명령을 제공하지 않는다.
- 연결이 끊겨도 수락한 미션은 런타임에서 계속 실행한다. Backend는 offline 표시와 배차 중지만 수행한다.
- 재연결 Snapshot에서 미확인 final report를 먼저 반영한 뒤 현재 상태를 대조한다.
- boot 변경으로 미션이 유실되면 INTERRUPTED·사람 확인 필요로 기록한다. 같은 미션을 새 boot에서
  자동 재개한 snapshot은 거절하고 슬롯을 유지한다. 로컬 안전·복구 판단은 Robot 소유다.
- 모르는 active ID는 임의로 입양하거나 새 미션을 덮어쓰지 않고 연결을 거절한다.

## 영속성과 화면

SQLite schema version 1은 missions, robot_snapshot, event_inbox와 command_outbox를 저장한다.
단일 슬롯은 unique index, terminal payload는 immutable trigger로 보호한다. Mission 상태,
수신 event와 outbox 변경은 한 트랜잭션이며 commit 실패 시 SSE와 ACK를 보내지 않는다.
Backend 재시작 후 연결 상태는 항상 offline이다. DB를 삭제하거나 초기화한 경우 기존
Robot 실행을 자동으로 연결하지 않는다. 기록 자동삭제는 없다. 단일 uvicorn worker만 지원한다.

SSE는 알림 경로이며 HTTP 목록/DB가 현재 상태의 기준이다. 브라우저는 SSE open/reconnect 시
Mission·Robot·좌석·pose snapshot을 다시 조회한다. 느린 SSE 소비자의 queue가 넘치면 연결을
닫아 재연결·snapshot 복구를 유도한다. pose는 기존 전용 캐시/보간을 유지한다.

`accepted_at`은 Backend의 최초 실행 증거 수신, `finished_at`은 최종 결과 수신 시각이다.
화면 소요 시간은 요청부터 결과 수신까지이며 Queue·통신 시간을 포함한다. 모니터링은 수락
증거가 있는 모든 미션을 성공률 분모에 포함하고 미종료와 모의 단계 포함 건수를 함께 표시한다.
실제 물체 정리 성공률 또는 센서·주행 정확도 측정으로 해석하지 않는다.

## 검증과 실제 연동 완료 조건

```bash
pnpm contracts:check
uv run --project apps/backend --extra dev pytest apps/backend/tests/test_gateway.py
pnpm test:e2e:gateway
pnpm test:e2e
```

Gateway E2E는 임시 SQLite와 포트 18082, 기존 Mock/pose E2E는 메모리 DB와 포트 18081을
사용한다. 운영 서버를 재사용하지 않으며 Fake Gateway는 ROS를 호출하지 않는다.

실제 SCRUM-363 완료에는 런타임 측 Gateway·FSM·Navigator 준비 후 지원 좌석 왕복과
checkpoint 취소의 Gazebo 확인이 필요하다. Backend 로그/미션 JSON, 사용한 두 저장소
커밋, 전체 수락 건수와 outcome·미종료·소요 시간을 남긴다. contract/unit/E2E 통과를
실제 Gazebo 또는 하드웨어 검증으로 대체하지 않는다.

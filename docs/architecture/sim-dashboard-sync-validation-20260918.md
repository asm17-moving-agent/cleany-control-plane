# Gazebo → Dashboard 위치 동기화 검증

2026-09-18, control-plane `fcbd0d2`, simulator `b621d7f`.
두 저장소 모두 `feat/gazebo-websocket-integration` 브랜치에서 검증했다.

## 실행 범위

- ROS 2 Humble / Gazebo Fortress, headless, `ROS_DOMAIN_ID=77`, `ROS_LOCALHOST_ONLY=1`.
- `/odom` → `cleany_telemetry` → WebSocket `/api/robots/cleany-01/pose/ws`
  → backend snapshot/SSE → Firefox 지도. 실제 하드웨어는 사용하지 않았다.
- Backend는 `uv run --project apps/backend python apps/backend/run.py`로 실행하고,
  `pnpm build` 결과를 `http://127.0.0.1:8080/?demo=0`에서 제공했다.
- Simulator 실행과 relay 설정은 해당 저장소의 `ros2_ws/src/cleany_telemetry/README.md`를 따른다.
  Gazebo와 relay 모두 같은 ROS domain을 사용해야 한다.

## 결과

| 검사 | 결과 |
| --- | --- |
| Backend pose/WebSocket 단위 테스트 | 16개 통과 |
| Frontend pose 보간 단위 테스트 | 4개 통과 |
| Contract 재생성 비교 / Dashboard build | 통과 |
| 합성 WebSocket → SSE → 지도, stale/reload E2E | 1개 통과 |
| 실제 Gazebo 이동 → Firefox | 약 0.540m 이동 반영 |
| Relay 중단 | 마커 정지, `SSE 연결됨 · 위치 지연` 표시 |
| 중단 상태에서 새로고침 | 마지막 위치와 stale 상태 복원 |
| Relay 재시작 | `SSE 연결됨 · 위치 최신` 자동 복구 |
| Gazebo pause | 마지막 수신 시각 정지, stale 전환 |

시뮬레이터에서 전진 명령 0.12m/s를 5초간 보냈다. ROS 60샘플/약 12초와
브라우저·API 80샘플/약 40초를 기록했다. 실제 위치는
`(-1.865, -4.705)`에서 약 `(-1.8651, -4.16512)`로 변했다.
정지 후 `/odom`, `/ground_truth/odom`, API 위치는 일치했다.
이 Gazebo 설정의 odom은 world ground truth이므로 현재 지도 원점과 호환된다.
실제 로봇의 local odom에도 같은 원점이 적용된다는 의미는 아니다.

지도 변환은 `x=776+world_x*400/12.26`,
`y=8+(5.47-world_y)*400/12.26`이다. 브라우저 마커는
`(715.152,339.974)`에서 `(715.146,322.360)`으로 변했다.
비동기 API/DOM 샘플의 최대 차이는 지도 좌표 0.623 미만,
마지막 샘플은 0.001 미만이었다. 이는 200ms 보간을 포함한 좌표 비교이며
센서 정확도나 정확한 종단 지연 측정은 아니다.

Gazebo pause는 relay 입력 만료 1.5초와 backend 수신 만료 1.5초를 거쳐
지연 상태가 된다. 1초 간격 poll에서 첫 stale은 약 3.01초 후 관측했다.

## 증거와 한계

증거 파일: [sim-sync-20260918](assets/sim-sync-20260918/).
`browser-samples.json`, `ros-motion-samples.json`, `simulator-pause.json`,
`stale-reload.json`, `reconnect.json` 및 niri의 Firefox 캡처를 저장했다.

검증 범위는 **위치 x/y의 단방향 동기화**다. 방향/yaw, 이동 경로, 배터리,
실제 로봇 상태와 대시보드 미션 → Nav2 실행은 이 검증에 포함되지 않는다.
미션과 Robot state는 여전히 Mock Dispatcher이며 이동 중에도 대기로 보일 수 있다.
이 테스트를 위해 제품 소스는 변경하지 않았다.

## 후속: 방향 화살표 통합

같은 날 촬영 브랜치의 고정 아이콘·투명 원·옅은 빨간 삼각형 표시를 통합했다.
선택적 `yaw`(world rad)를 계약, backend snapshot/SSE, 보간, simulator relay에 추가했다.
아이콘은 회전하지 않고 `-yaw * 180 / PI`로 삼각형만 회전한다.
기존 x/y 전용 producer는 계속 연결되며, yaw 미수신 시 삼각형을 숨긴다.

- Backend pose/계약 21개, 프런트 보간 5개, simulator relay/ROS 경계 9개 통과.
- Build, backend Ruff, diff 검사 통과.
- Gazebo 제자리 회전 명령 후 실제 yaw `1.570800001 → 2.652374473rad`
  (61.97도 반시계 회전), Firefox 화살표 약 `-90 → -151.97도` 변화 확인.
- 선속도 명령은 없었으나 simulator에서 약 0.0176m 위치 drift가 관측됐다.
- DOM 샘플에서 로봇 이미지 transform은 계속 `none`이었다.
- `yaw-browser.json`, `yaw-simulator.json`, `04-yaw.png`를 증거 폴더에 추가했다.

이 후속 변경으로 x/y와 방향이 연동됐다. 미션 실행과 외부 로봇 상태는 여전히
앞 절의 한계와 같으며 실제 하드웨어 검증은 하지 않았다.

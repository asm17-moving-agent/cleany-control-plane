# 지도 로봇 위치 동기화 검토 (2026-09-18)

## 현재 상태

- `HomePage.tsx`는 고정된 `examplePositions`를 사용하며 항상 `positionMode: scenario`다.
- `RobotResponse`에는 ID, 상태, 활성 미션, 마지막 연결 시각만 있고 pose가 없다.
- Backend의 `MockDispatcher`는 시간에 따라 작업 단계를 전환한다. 로봇 주행 증거가 아니다.
- Dashboard는 SSE 업데이트마다 목록을 다시 조회한다. 고빈도 위치에는 전용 이벤트 처리가 필요하다.
- 도면은 1160×670 화면 좌표다. ROS map 원점·해상도·방향과 연결된 변환은 없다.

## 가능 여부와 권장 경로

가능하다. 우선 명령 전송 없이 위치 수신부터 연결한다.

`Sim/Real ROS TF → cleany 측 telemetry adapter → Backend → SSE → 지도 마커`

1. `cleany`에서 `map → base_link` 위치와 yaw를 읽는다. KB ROS 계약은
   `map → odom → base_link`를 정의한다. 읽은 로컬 main의 Gazebo navigation bridge에는
   `/gazebo_odom`, `/ground_truth/odom`, `/clock` 경로가 있다. 이는 소스 확인이며 실행 검증은 아니다.
2. `packages/contracts`에 robot ID, source(sim/real), map ID/version, frame ID,
   x/y/yaw, source timestamp, sequence를 정의하고 schema/example/test를 함께 추가한다.
   Backend 수신 시각을 별도로 저장해 시뮬레이션 시계 정지·리셋과 연결 끊김을 구분한다.
3. ROS 지도와 UI 도면의 대응점을 보정하고 회전·스케일·이동·Y축 반전을 적용한다.
   지도 ID가 다르거나 보정이 없으면 임의 위치를 실시간으로 표시하지 않는다.
   현재 도면에는 가독성을 위해 조정한 책상 배치가 있어 실제 좌표와의 오차 확인이 필요하다.
4. 전용 pose 이벤트로 위치 캐시만 갱신한다. 송신 주기는 설정으로 관리하며 초기 후보는
   5–10 Hz다. 보간으로 이동을 부드럽게 표시하고 오래된 좌표는 마지막 위치·지연 상태로 표시한다.
5. Sim/Real 발행자를 명시적으로 선택하고 같은 robot ID를 동시에 갱신하지 못하게 한다.
   진단용 ground truth와 localization 결과도 출처를 구분한다.

## 작업 요청 동기화는 별도 단계

좌석 선택을 실제 주행으로 이어가려면 seat ID → 접근 목표 pose를 추가하고,
MockDispatcher를 Robot Mission Manager 외부 계약 어댑터로 대체해야 한다.
수락·진행·종료·취소 이벤트와 재연결, 중복 이벤트 처리를 검증한다.
Backend가 Robot 내부 FSM을 직접 변경하는 방식으로 구현하지 않는다.

## 검증 순서

시뮬레이션 직진·횡이동·회전 시 지도 좌표/방향 확인 → 통신 끊김·시계 리셋 확인 →
실제 로봇 위치 수신 확인 → 좌석 접근 목표와 미션 lifecycle 연동 확인.
이번 변경은 아이콘 확대와 소스 기반 검토까지이며 위치 동기화는 아직 구현하지 않았다.

## 촬영용 로컬 이동 (별도 구현)

- 개발 서버의 `/?recording=1` 또는 운영 메뉴의 **촬영 모드**로 진입한다.
- 좌석 선택 후 요청하면 cleany-01이 화면상 통로 경유점을 따라 이동하고, 4초 작업 후
  출발 위치로 복귀한다. 이동 속도와 작업 시간은 `operations/recording-route.ts`에서 관리한다.
- 복수 요청은 한 번에 하나씩 처리하고 대기 요청끼리는 높은 우선순위를 먼저 처리한다.
  취소 시 현재 위치에서 멈춘다. 페이지 이동 중에도 진행되며 새로고침하면 초기화된다.
- API/ROS로 요청을 보내지 않는다. 경로는 화면 연출용이며 충돌 검증된 Nav2 경로가 아니다.
- 경로만 연한 회색으로 표시한다. 작은 굴곡을 넣고 기존 대비 절반 속도로 이동한다.
  큰 코너에서는 위치를 유지한 채 초당 40도로 아이콘을 회전한 후 이동한다.
  이는 촬영용 표현이며 실제 Nav2 global/local planner 또는 costmap 출력은 아니다.
- 실제 데이터 화면과 기존 읽기 전용 예시 모드는 유지한다.

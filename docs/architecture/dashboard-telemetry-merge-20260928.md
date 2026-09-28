# Dashboard / Gazebo telemetry 병합 검증

2026-09-28, `feat/gazebo-websocket-integration` → `feat/facility-dashboard`.

## 보존 및 충돌 해결

- 현재 브랜치 미커밋 촬영 기능과 발표 캡처: `24a6c6f`.
- 연동 브랜치 미커밋 yaw 계약, 한글 메시지, 진행 단계 정렬, 검증 자료: `4057d1e`.
- HomePage는 촬영/예시 좌표와 실시간 pose를 모드별로 선택한다.
  예시 모드에는 SSE 연결 상태를 표시하지 않는다.
- 공통 마커의 고정 아이콘, 투명 원과 방향 화살표를 유지한다.
- 촬영용 D-HUB 복도와 대기 위치를 새 지도 좌표에 맞춘다.
- 작업 취소의 촬영 모드 지원과 한글 종료 메시지를 모두 보존한다.

## 이번 실행 결과

- 프런트 단위 테스트: 20개 파일, 84개 통과.
- 백엔드 테스트: 37개 통과. Ruff 통과.
- OpenAPI/TypeScript 계약 재생성 비교 및 프로덕션 빌드 통과.
- 기존 운영 흐름 E2E 9개 통과.
- WebSocket → SSE → 지도 위치/yaw, stale 및 reload E2E 통과.
- 촬영 요청 후 이동/경로 표시, 실제 명령 및 telemetry 연결 차단,
  일반 예시 모드 전환 E2E 통과.
- 마지막 모드 전환 테스트는 최초 실행에서 세션의 촬영 모드를 유지했다.
  명시적인 `recording=0` 전환 URL로 테스트를 수정하고 해당 E2E 파일 2개 모두 통과했다.

이번 검증은 합성 WebSocket producer를 사용했다. Gazebo 및 실제 하드웨어를
가동하지 않았다. 기존 실제 시뮬레이터 검증은
[9월 18일 기록](sim-dashboard-sync-validation-20260918.md)을 참고한다.
대시보드 미션 → Nav2 실행은 이번 병합 범위에 포함되지 않는다.

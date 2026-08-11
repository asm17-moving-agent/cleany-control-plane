# Scenario Dashboard

Mock Backend와 연결해 관제 vertical slice를 검증하는 최소 Web UI다.

현재는 직사각형 공간의 `3석-통로-2석-통로-3석` 구조를 6행으로 표현한 48석
배치도 기반 좌석 선택, 좌석 사용 상태, 우선순위, Mission Queue, Robot 상태,
취소와 최종 결과만 다룬다. 두 행마다 공간 간격을 두며, 사용 중 좌석도 관제
시나리오 검증을 위해 선택할 수 있다. 실제 운영의 작업 가능 조건은 별도 정책으로
확정해야 한다.

Dashboard shell은 좌측 운영 내비게이션, Robot/Mission 요약 카드, 좌석 상태 범례,
배치도와 Mission 제어 패널로 구성한다. 단일 좌석을 선택하며 제어 패널에는 좌석
번호와 `B-3` 형태의 열-행 위치를 함께 표시한다.

좌측 내비게이션은 다음 화면을 제공한다.

- 홈: 좌석 선택, Mission 요청, 최근 Mission
- 미션: 단계·우선순위 필터와 전체 Mission 상태 및 취소
- 모니터링: SSE 연결, Robot heartbeat, 좌석 사용률, 성공률과 최근 활동
- 로봇: 등록 Robot의 연결 정보와 현재 할당 Mission
- 설정: polling 주기, 실시간 표시, 기본 우선순위와 완료 알림

탭은 URL hash로 유지한다. 설정값은 아직 서버 설정 계약이 없으므로 브라우저
`localStorage`에만 저장하며, 기본 우선순위와 보조 polling 주기에 반영한다.
최종 Frontend framework와 디자인 시스템은 계약 검증 후 선택한다.

## Color tokens

화면 색상은 `styles.css`의 `:root` token을 사용한다. Background/Surface/Border,
Primary, Text와 Success/Warning/Danger/Info 상태색을 직접 참조하며 컴포넌트에
별도 브랜드 색을 하드코딩하지 않는다.

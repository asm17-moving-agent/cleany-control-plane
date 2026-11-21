# ADR 0012: 승인 기반 자연어 운영 에이전트

상태: 채택 · 2026-11-17

기존 화면을 보면서 운영 기록을 조회하고 좌석 정리를 요청할 수 있도록 전역 AI 패널을
추가한다. 별도 상위 탭이나 로봇 제어 주체를 만들지 않는다. 자연어는 조회 또는 검토할
계획으로 변환하고, 실행 권한은 기존 인증·Mission admission·Gateway 경계에 남긴다.

LLM 호출은 Backend의 `AgentProvider` 인터페이스로 분리한다. 초기 구현은 OpenAI
Responses API, `gpt-6.1-sol`, reasoning `low`다. 모델의 함수 호출과 출력 스트리밍을
사용하며 `store:false`, strict 함수 schema, 직렬 tool 호출을 적용한다. stateless
다중 tool round에는 encrypted reasoning 항목을 유지한다. 모델/effort/timeout/도구
반복 횟수/동시 응답/계획 유효 시간은 환경 설정으로 관리한다.

선택 배경: 운영 질문과 구조화된 도구 호출을 함께 처리하고 짧은 응답 지연을 목표로 한다.
실제 계정에서 모델 가용성과 Responses 동작을 검증했다. 공식 문서:
[모델](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[함수 호출](https://developers.openai.com/api/docs/guides/function-calling),
[스트리밍](https://developers.openai.com/api/docs/guides/streaming-responses).
다른 제공자는 provider factory에 adapter를 등록하며 브라우저와 승인 계약을 바꾸지 않는다.

도구는 좌석·작업 이력·단건 작업·현재 로봇·운영 분석 조회와 초안 작성만 제공한다.
승인·취소 Mission·ROS 명령·안전 설정 변경 도구는 제공하지 않는다. 현재 Mission API의
좌석 정리 전체 작업만 제안하며 하위 작업 선택과 시간 예약은 지원하지 않는다.
좌석의 현재 청소 상태는 미연동이므로 과거 성공이나 점유 상태에서 추정하지 않는다.

계획은 서버에 정규화된 좌석·로봇·우선순위와 revision, 만료 시각으로 저장한다.
관리자 UI의 명시적 `approved:true` POST만 승인 경로에 들어간다. 수정 시 revision을
올리고 새로운 자연어 계획은 이전 미승인 계획을 대체한다. 지도 참조/runtime target map과
실행 모드의 fingerprint를 보관하여 승인 시 환경이 바뀌었으면 재확인을 요구한다. 승인 시 권한·현재 시설·좌석과
로봇·위치 지원·사용 중 여부를 다시 확인한 뒤, 수동 요청과 공유하는 admission helper가
수동 조종 충돌, 검증된 지도 버전과 Gateway target을 검사한다. 전체 batch와 승인 기록을
동일 SQLite transaction으로 commit하여 일부 등록과 중복 실행을 방지한다. 계획과
revision에서 생성한 idempotency key는 재전송에도 동일하다. 외부 Mission의 수락과
종료 결과는 기존 runtime이 결정한다. 승인 결과가 실행 성공을 의미하지 않는다.

대화는 고객/시설/사용자별 비공개이며 쿠키·CSRF·Origin을 기존 정책으로 검증한다.
조회와 승인 권한을 별도 검사한다. 기존 full operator는 양쪽 권한을 가지며 운영 CLI로
read-only 또는 disabled를 지정할 수 있다. 모델 지침과 별개로 API에서 강제한다.
스트리밍 중 세션과 권한을 다시 확인하고 연결 종료 시 provider 요청도 취소한다.
한 대화에서 한 응답만 허용한다. 프로세스 재시작 시 미완료 응답은 중단됨으로 복구한다.
현재 store와 동일하게 단일 backend worker 배포를 전제한다.

대화와 계획은 운영 DB에 저장한다. provider에는 필요한 대화와 조회 결과만 보내며 API 키,
쿠키, CSRF, 이용자 이름은 보내지 않는다. `store:false`는 OpenAI Responses 저장 설정이며
제공자 전체 보관 정책에 대한 보장은 아니다. `.env` 키는 서버에서만 읽는다.

운영 통계는 실제 DB 전체 집계, 상세는 최근 20개 표본, 이벤트는 cursor 페이지를 사용한다.
현재 실행 모드와 과거 기록의 execution_profile/provenance를 구분하고, 관측 공백·stale·
샘플 절단을 모델에 제공한다. 근거 링크는 서버가 내부 경로로 생성한다. 대화 텍스트는
HTML로 실행하지 않으며 굵은 글씨만 제한적으로 표시한다.

UI는 기존 Button/NativeSelect/StatusBadge와 디자인 토큰을 사용한다. 우측 패널 기본
460px, 조절 범위360–800px, 확장 시 헤더 아래 전체 너비다. 모바일은 전체 화면이다.
페이지·좌석·작업·로봇·날짜는 제거 가능한 context chip, 시설은 접근 범위로 고정한다.
편집기의 저장 전 좌표는 전송하지 않으며 작업 계획은 편집을 종료한 지도에서 요청한다.
예시/촬영 모드에서는 실제 데이터로 전환한 뒤 이용한다. Mock backend 실행은 별도로 표시한다.

## 2026-11-21 · 로컬 Qwen 선택지

OpenAI를 기본값으로 유지한다. Qwen은 한국어 요청 분류에 사용하고 기간, 좌석 식별과
운영 수치는 Backend가 결정한다. Jetson 엔진 실험에서 모델이 생성한 도구 인자에는
존재하지 않는 ID와 날짜가 포함됐다. 실행 구성과 지원 질의는 [운영 AI 문서](../architecture/operations-agent.md#제공자-선택)에 정리했다.

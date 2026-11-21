# Cleany 운영 AI

상단 **AI**에서 패널을 열고 페이지를 유지한 채 질문한다. 패널 왼쪽 경계를 드래그하거나
키보드 좌우 화살표로 크기를 바꿀 수 있다. 확장/닫기/새 대화/대화 기록을 제공한다.
선택 context chip을 제거하면 다음 요청부터 제외된다. 시설 변경 시 해당 시설의 개인
대화 기록으로 전환한다. 홈 차트는 기존 예시이고 AI 답변은 운영 DB 조회 결과다.

## 요청과 실행

1. `/map`에서 좌석을 고르고 “여기 정리해 줘”.
2. 대상·우선순위·담당 로봇이 포함된 계획을 확인한다. 수정/취소할 수 있다.
3. **N건 승인·요청**을 누르면 기존 Mission Queue에 등록한다.
4. 패널에서 실제 상태를 확인하거나 작업 상세로 이동한다.

확인되지 않은 SLAM 작업 위치나 지원되지 않는 좌석은 승인할 수 없다. 이 기능을 위해
검증 상태를 변경하거나 안전 검사를 우회하지 않는다. 실제 로봇 실행에는 기존 Gateway,
Mission Manager와 검증된 target map이 필요하다. Mock 실행은 실제 장치 검증이 아니다.

## 지원하는 질의

| 요청 | 근거/동작 |
| --- | --- |
| 오늘 완료된 작업은 몇 건이야? | KST 종료일 기준 SUCCESS 전체 집계 |
| 어제와 오늘 완료 건수를 비교해 줘 | 두 날짜의 완료, 실패, 취소, 요청, 확인 필요 건수와 증감 표 |
| D-HUB 18번 청소가 왜 늦어? | 해당 좌석의 최근 작업을 조회해 진행 단계와 기록된 메시지 표시 |
| 선택한 작업이 왜 실패했어? | 실제 failure_code, message, outcome, review |
| 오늘 로봇이 멈춘 원인을 분석해 줘 | Supervisor 관측, 장애·복구 이벤트, 활동 이력 |
| 최근 일주일 운영 현황 | 기간별 Mission 전체 집계 및 로봇 분석 |
| D-HUB 18번과20번 정리 요청 | 지원되는 실제 좌석의 검토용 계획 |
| 정리되지 않은 좌석 전부 처리 | 청소 상태 미연동 안내 후 대상 명확화 |
| 안전 정지 해제/직접 이동/승인 생략 | 실행하지 않음 |

로봇 기록은 최대31일 범위 조회이며 수집하지 않은 과거 배터리나 장애 원인을 생성하지 않는다.
현재는 좌석 전체 정리만 지원한다. 쓰레기만 수거, 일정 예약, 다중 로봇 자동 배차는 기존
Mission 계약에 없는 기능이므로 실행 계획에서 임의로 약속하지 않는다.

## 구조와 계약

- `apps/backend/control_plane/agent_provider.py`: 교체 가능한 모델 transport.
- `agent_tools.py`: 시설 범위 조회와 내부 근거 링크.
- `agent_service.py`: 제한된 tool loop와 계획 정규화.
- `agent_store.py`: SQLite 대화·계획·권한.
- `agent_routes.py`: 인증된 SSE/계획 수정/명시적 승인.
- `server.py::admit_missions`: 수동 요청과 AI 승인에 공통인 등록 경로.
- `apps/dashboard/src/features/agent/`: 전역 상태, 컨텍스트, 패널/계획 UI.
- `packages/contracts/openapi.json`, `schemas/agent-*.schema.json`, `examples/agent.json`:
  HTTP/SSE·계획의 공개 계약. `pnpm contracts`로 생성한다.

API는 `/api/agent/status`, `/conversations`, `/conversations/{id}`,
`/conversations/{id}/messages`(POST SSE), `/plans/{id}`(PATCH),
`/plans/{id}/cancel`, `/plans/{id}/approve`다. 모두 현재 `site_id`와 인증이 필요하다.
SSE data는 `AgentStreamEvent`이며 started/delta/tool/plan/complete/error/heartbeat를
사용한다. EOF만 수신한 응답은 성공으로 처리하지 않는다.

완료된 답변의 `cards`에는 Backend가 조회한 값만 담는다. OpenAI와 Qwen 모두 같은
계약을 쓴다. 조회 결과는 답변 시점에 저장한다. 위치와 헤드캠은 카드를 열 때 현재 시설의 관측을 읽는다.

- 작업 카드에서 **최신 상태 확인**을 누르면 같은 작업을 다시 조회한다. **작업 상세 열기**로 진행 기록을 볼 수 있다.
- 비교표는 같은 시설과 좌석 범위에서 조회한 두 날짜를 시간순으로 표시한다. 시설 전체를 비교할 때는 날짜를 눌러 그날의 작업 기록을 연다.

### 대화에서 여는 운영 화면

| 질문 | 카드 동작 |
| --- | --- |
| 지금 연결과 안전 상태는 어때? | 로봇 상태와 모드, 마지막 접속, 배터리와 안전 관측 시각 표시 |
| 헤드캠 보여줘 | 버튼을 눌러 영상 열기, 닫을 때 프레임 요청 중지 |
| 18번 책상 정리 전후 사진 보여줘 | 한 작업의 전후 관측 자료 확인, 저장된 원본 열기 |
| 어떤 작업이 밀렸어? | 시설 대기열을 우선순위와 접수 순서로 표시, 질문한 좌석 강조 |
| 검토가 필요한 작업은? | 기간 내 종료된 미검토 작업에서 상세로 이동 |
| 오늘 배터리 추이는? | 수집된 잔량 및 충전 구간 차트, 오전 또는 오후 지정 가능 |
| 아까 장애와 복구 기록을 보여줘 | 시간순 이벤트, 출처와 관련 작업 링크 |
| 로봇이 어디 있어? 18번도 보여줘 | 현재 시설 지도에 좌석과 일치하는 지도 기준의 로봇 위치 표시 |
| 좌석별 완료 기록 보여줘 | 종료 시각 기준 성공한 좌석을 한 번씩 강조, 좌석별 마지막 완료 시각 표시 |
| D-HUB 작업 가능 좌석 보여줘 | 지원 좌석 선택, 검토용 초안 생성, 기존 승인 절차 연결 |

SLAM 지도에서는 등록된 지도와 좌석 배치를 읽고 기존 시설 도면에서는 해당 도면의 좌석 좌표를 사용한다.
검토 및 완료 기록은 한국 시간 기준이다. 배터리 차트는 빈 구간을 연결하지 않는다.
명확한 화면 요청은 두 제공자 모두 같은 읽기 도구를 먼저 호출한다.
좌석을 새로 고르는 화면은 요청한 구역의 후보를 표시한다. 이미 선택한 좌석을 조회하면
지도에서 선택한 ID로 범위를 좁힌다. 선택이 비어 있으면 좌석을 지정하도록 안내한다.

### 운영 기록을 집계하는 카드

| 질문 | 집계 기준 |
| --- | --- |
| 오늘 끝난 작업 결과 비율은? | 종료 작업 전체를 결과별로 분할. 완료율의 분자는 SUCCESS |
| 요청이 몰린 시간대는? | 한국 시간의 접수 시각 기준. 오전 또는 오후는 3시간 구간 4개, 같은 날 오전과 오후 비교는 8개와 반일별 합계 |
| 접수부터 종료까지 얼마나 걸렸어? | 양 끝 시각이 유효한 종료 작업의 소요 시간 분포와 중앙값 |
| 가장 자주 발생한 실패 코드는? | FAILED 결과의 코드별 건수. 코드 미기록도 포함 |
| 구역별로 몇 석씩 정리됐어? | 요청한 각 구역의 등록 좌석 중 기간에 1회 이상 성공한 좌석 비율. 다른 모든 구역과 비교하면 완료가 0인 구역도 포함 |
| 두 번 이상 정리한 자리가 있어? | 등록 좌석별 성공 기록을 집계해 2건 이상인 자리 표시 |
| 전후 사진이 모두 남은 작업은 몇 건이야? | 종료 작업의 관리 대상 사진 참조를 양쪽, 한쪽, 없음으로 분할 |
| 실물과 모의 실행 비중은? | 종료 작업의 주행, 인식, 계획, 실행 출처를 비교해 실물, 모의, 시뮬레이션, 혼합, 미확인으로 분류 |
| 관리자 검토가 얼마나 진행됐어? | 기간에 종료되어 검토가 필요한 작업 중 관리자가 확인한 건수 |
| 30분 넘게 기다린 요청이 있어? | 현재 배정 대기열에서 접수 후 경과 시간 집계 |

좌석 범위와 조회 기간은 Backend에서 적용한다. 대기 시간은 조회 시점을 기준으로 계산한다.
조회 기간에 표본이 없으면 빈 상태를 표시한다. 출처와 관측 시각은 결과에 함께 보존한다.

## 제공자 선택

OpenAI가 기본 제공자다. Qwen 모드에서는 Backend가 현재 질문, 선택 여부와 미승인 초안 유무를
Jetson의 텍스트 추론 서버에 보낸다. 로컬 모델이 반환한 분류는 허용된 목록과 대조한다.
좌석 ID, 작업 이력, 배터리 수치와 계획 내용은 Backend에서 권한이 있는 도구 결과로 채운다.
모델 서버가 준비되면 대시보드 입력이 활성화된다. 현재 상태를 묻는 명확한 질문에는
Backend가 별도의 추론 요청 없이 같은 조회 도구로 답한다.

선택한 개별 작업의 실패 사유는 해당 작업 기록에서 확인한다. 시설 전체 실패 건수는 작업 이력에서 집계한다.
작업 이력은 한국 시간 기준으로 특정 날짜와 좌석을 조회할 수 있다. 두 날짜 비교는 각각
DB를 조회한다. 날짜만 바뀌는 후속 질문은 직전 답변에서 확인된 조회 범위를 이어받는다.
좌석이 바뀌거나 여러 범위가 섞이면 대상을 다시 묻는다. 배터리 범위는 기간 내 수집된
원본 관측값으로 계산한다. 대시보드 차트에는 시간 구간별 평균을 표시한다.

미승인 초안의 좌석 제거와 우선순위 변경은 기존 초안과 대조한 후 새 초안을 제안한다.
작업 등록에는 기존 승인 버튼을 사용한다. 등록된 작업을 취소할 때는 작업 상세 화면을 연다.
헤드캠 영상은 운영자의 브라우저에서 열며, 모델에는 영상 프레임을 보내지 않는다.

전용 서버는 현재 모델을 메모리에 올리고 질의 간에 재사용한다. GPU 경합이나 메모리 부족 시
실행기를 해제하고 여유가 생기면 복구한다. 설치, 상태 확인과 API 예제는
[Backend 실행 문서](../../apps/backend/README.md#jetson-qwen으로-개발하기)에 있다.

## 검증

```bash
uv run --project apps/backend pytest apps/backend/tests/test_agent.py apps/backend/tests/test_agent_cards.py apps/backend/tests/test_agent_provider.py apps/backend/tests/test_agent_qwen.py apps/backend/tests/test_contracts.py -q
pnpm contracts:check
pnpm test
pnpm build
pnpm --filter @cleany/dashboard exec playwright test tests/e2e/agent.spec.ts
pnpm --filter @cleany/dashboard exec playwright test -c playwright.gateway.config.ts
pnpm --filter @cleany/dashboard test:visual
```

실제 모델 평가는 제공자를 선택해 별도로 실행한다. 기본 OpenAI 평가는 유료 API를 호출한다. 매 시나리오마다
독립 메모리 DB/fixture 계정/Mock dispatcher를 사용한다. 실제 로봇과 운영 DB에는 연결하지 않는다.

```bash
uv run --project apps/backend python tools/agent/evaluate.py /tmp/cleany-agent-evaluation.json
CLEANY_AGENT_PROVIDER=qwen uv run --project apps/backend python tools/agent/evaluate.py /tmp/cleany-qwen-evaluation.json
```

구역별 좌석 수, 작업 이력, 배터리 관측값과 초안 수정은 동일한 8건의 모의 작업으로 비교한다.
사용법 질문은 별도 파일로 구성한다. 진단 질문만 실행하려면 `--split diagnostic`을 추가한다.

```bash
uv run --project apps/backend python tools/agent/compare.py --provider qwen --cases tools/agent/comparison_cases.json --output /tmp/cleany-qwen-operations.json
uv run --project apps/backend python tools/agent/compare.py --provider openai --cases tools/agent/capability_cases.json --output /tmp/cleany-openai-capabilities.json
```

자동 테스트의 모델은 deterministic fixture이며 실제 모델 품질 검증을 대체하지 않는다.
실제 모델 평가는 결과 JSON의 답변·도구·승인 전 생성 수·승인 후 lifecycle을 함께 확인한다.
변동하는 모델 응답 때문에 문장 일치만으로 품질을 판정하지 않는다. 저장소에는 실제 키나
운영 대화 원문을 넣지 않는다.

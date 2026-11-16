# Cleany Dashboard 디자인 시스템

기준은 telemetry-camera-preview snapshot `16bc31e1275fe0db19dc3e8758feb344163b9c81`이다.
원본 작업을 보존한 `preview-ui-baseline`과 구현 worktree `preview-shadcn`을 비교한다.
API, 계약, 상태 관리, 지도 좌표, Mission 요청/취소, SSE, 수동 조종의 이벤트 로직은 이번 변경 범위 밖이다.

현재 페이지 구성은 아래 **페이지 구성의 공통 규칙**을 따른다. 하단 날짜별 절의 수치와
검증 건수는 각 변경 당시의 기록이며, 현재 규칙과 다른 과거 배치에 소급 적용하지 않는다.

## 작업 캘린더와 일별 요약 (2026-11-17 후속)

Before는 `4cceb39`다. 상단6개 통계 바를 제거하고 기존 캘린더/목록/상세3열을 위로
올렸다. 열 폭·상세/사진·요청·관리자 조치는 유지한다. 캘린더 아래76px 요약 카드에
전체 작업·완료·확인 필요를3열로 배치한다. 전체와 완료는 정보이며 확인 필요만 버튼이다.
확인 필요 클릭은 날짜를 유지하고 검색/우선순위/명시적 작업 선택을 초기화하여 해당 날짜의
미확인 작업 전체를 보여준다. 다시 누르면 전체 상태로 돌아간다. 기존 상태 select는 유지한다.

- 날짜 아래5px 초록 점은 작업 기록, 주황 계열 점은 미확인 결과다. 확인이 필요하면 둘 다
  표시한다. 날짜 버튼32px와 키보드 이동을 유지하며 범례와 날짜별 접근성 설명을 제공한다.
  5/6주 달력 모두 노트북 화면에 일별 요약이 들어오도록 점 영역을6px로 제한한다.
- 날짜/요약은 기존 Asia/Seoul 요청일·종료일·오늘 미종료 이월 기준이다. 완료는 기존
  SUCCESS 필터, 확인 필요는 `needsResultReview`를 사용한다. 명시적 검토 기록이 있으면
  주황 점과 확인 필요 건수만 해제하며 기록과 원본 결과를 보존한다. 집계는 필터와 독립적이다.
- 기본 최신50건 snapshot을 달력 전체로 간주하지 않는다. 보이는 달력의28~42개 날짜에
  기존 `api.missionDay`의100건 cursor 페이지네이션을 끝까지 사용한다. 동시 날짜 조회는
  최대4개이며 고객/시설/표시 날짜 범위로 캐시한다. 월/시설 전환은 진행 중인 읽기를 취소한다.
- Mission/SSE 갱신과 명시적 새로고침·검토 후 달력을 재조회한다. SSE 연결이 끊기면
  기존 설정의 갱신 간격을 사용한다. 예시/촬영은 각 모드의 데이터에서만 계산한다.
- 읽지 못한 달을 빈 달로 표시하지 않는다. 부분 조회 실패는 달력 안에 재시도를 제공하고
  선택일 목록·요약·상세는 별도 조회로 계속 사용할 수 있다. 일부 날짜만 알려진 경우에도
  나머지는0건으로 추정하지 않는다.

시각 회귀에서는 작업 화면의 상단 통계 제거·위치 이동·날짜 점/범례·하단 요약만 의도한
변화다. Before51장 원본을 보존하고6주 달력 장면을 추가한다. 다른 탭과 기존 업무 동작,
정확한 집계, 월 경계·100건 초과·검토 후 갱신·달력 오류/재시도를 함께 검사한다.

검증: 단위111개, 기본 E2E36개, Gateway1개, 시각52개 통과. 시각 검사는 snapshot 갱신
없이0픽셀/retry0으로 실행했다. 기존51장 중 작업 관련14장만 변경, 다른37장은 동일하며
6주 달력2장을 추가했다. TypeScript/production build와 계약 검사도 통과했다. Backend와
계약 소스는 변경하지 않았으며 전용 Backend/3D suite는 이번 변경에 재실행하지 않았다.

## 페이지 구성의 공통 규칙 (2026-11-17)

페이지 간 통일 작업의 Before는 `5affee2`다. 홈의 카드를 기준으로 페이지 틀과 도메인
컴포넌트의 주변 스타일을 통합한다. [ADR0009](../adr/0009-dashboard-page-consistency.md)를 따른다.

| 대상 | 공통 규칙 |
| --- | --- |
| 페이지 폭 | 홈·설정 `PageShell standard` 최대1440px, 작업·로봇 `wide` 최대1760px, 중앙 정렬 |
| 바깥 여백·카드 간격 | 1280px 이상24px/20px,1024~1279px16px/16px; 제목과 첫 카드 좌측 정렬 |
| 페이지 헤더 | 투명 배경, 바깥 border 없음,72px, 제목24/32px, 오른쪽 행동 간격8px |
| 표면 | 화면 전체를 감싸는 흰 테두리 박스 제거; 주요 카드12px, 내부 상태/선택 항목8px, badge6px |
| 카드 안쪽 | 기본20px, 좁은 화면16px; 목록/캘린더/상세는 컨테이너 padding0 후 내부 구획에 적용 |
| 스크롤 | 홈·설정은 문서 흐름; 작업·로봇은 헤더 고정 및 목록/상세 내부 스크롤 |
| 로봇 카드 | 지도/로봇 탭 모두56×64px thumbnail, 이름14px, 보조12px, padding12px, Radius8px |
| 선택/장애 | teal soft+좌측3px 선택 표시, 장애 border+문구; 실제 Robot 상태 매핑 유지 |
| 우선순위 | 지도·작업 요청 모두 공유 `MissionPriorityField`의40px native select; 값 NORMAL/HIGH 유지 |
| 탐색 기호 | 추가/이전/다음/상세 링크에 공통 SVG; accessible name과 기본 링크/버튼 의미 보존 |
| 빈 목록/오류 | 같은 가운데 정렬·14px·간격; 오류는 alert와 다시 시도, 빈 목록은 오류 문구로 대체하지 않음 |

홈 첫 행2:1, 둘째 행5:5, 좌석 블록/차트는 유지한다. 지도는 전체 canvas와 기존96px
헤더/overlay 배치를 유지한다. 설정은 같은 페이지 시작선 안에서 폼만680px로 제한하고
저장 범위·저장 상태·저장 버튼을 카드 footer로 모은다. 로그인과 모델 전용 화면은 기능별 예외다.

로봇 화면은 목록280px(좁은 화면240px)과 상세로 구성한다. 상세를 다시 큰 카드로 감싸지
않고 상태·현재 작업 카드와 수동 조종 카드를 같은 레벨에 둔다. 3D 미리보기는 오른쪽
220px(좁은 화면160px), stage 높이200px/180px로 줄이며 원본 모델 상세 링크를 유지한다.
1280px 이상에서는 카메라와 조종 입력/상태를 나란히 배치한다. 1024~1279px에서는 카메라가
위로 쌓인다. 카메라 viewport 높이는320px/240px이며 영상 비율/명령 경로는 그대로다.
`ManualControlPanel`의 pointer capture, keyboard/blur, release/navigation 정지 처리와
Robot 변경에 따른 keyed mount 경계는 변경하지 않는다.

공통 페이지 배치는 `components/patterns/page-shell.css`, 로봇 카드 내용/스타일은
`RobotSummaryContent.tsx`/`robot-summary.css`가 소유한다. 페이지가 조상의 배치를
`:has()`로 재정의하지 않는다. `AppShell`에서 workspace flow를 명시하고, `main.tsx`는
`styles.css`를 먼저 import하여 `theme → legacy → components → utilities` 순서를 보장한다.
새 페이지는 기존 feature의 wrapper/CSS를 복사하지 말고 이 조합을 사용한다.

Before45개 PNG는 `5affee2`에서 바이트 그대로 보존한다. 페이지 폭/헤더/카드 배치,
로봇 미리보기 축소와 조종 재배치, 공유 로봇 카드·우선순위 입력·SVG 변경은 의도한 변화다.
홈 차트 비율, 지도 좌표, 로그인, 상태 문구/조치, 입력/고정 액션의 잘림과 동작 손상은 회귀다.
1920/1366/1024px의 실제 bounding box와 computed style, 선택/장애/빈 상태/오류,
수동 조종·카메라·3D의 기능 suite를 함께 검사한다. 새로운 상태 장면은 After 전용으로 표시한다.
픽셀 차이 허용치와 mask를 늘리지 않고 검토한 변경만 snapshot에 반영한다.

### 페이지 통일 검증 기록

- 단위106개, 기본 E2E34개, Gateway1개, 3D/개발 표본13개 통과. 최종 공통 surface
  속성 정리 후 단위106개와 공통 스타일/수동 조종8개를 다시 확인했다.
- TypeScript/production build, OpenAPI/Gateway schema/TypeScript 계약 검사 통과.
  Backend/contract/KB 소스는 변경하지 않았고 Backend 전용 pytest/Ruff는 이번에 재실행하지 않았다.
- 시각50개 통과: baseline 갱신 없이0픽셀/retry0. 기존45장 중34장 갱신,11장 동일,
  로봇 장애·빈 목록·오류6장 추가. Before45장은 `5affee2`의 원본과 바이트가 동일하다.
  홈 차트 배치와 지도 좌표를 유지했고 로그인9장과 지도 로봇 상세2장은 픽셀까지 동일하다.
- 1920/1366/1024px에서 페이지 폭/중앙 정렬/제목72px/바깥 여백을 검사한다.
  조종 정지48px와 입력 넘침, 카메라/조종의 breakpoint 배치를 검사하며 기존 계정/요청/
  검토·취소/카메라/SSE/조종 stop/지도 정렬 테스트를 유지했다.
- 비교 exporter는 `--before-ref 5affee2 --after-ref <reviewed-commit>
  --initial-scene desktop/robots.png`로 실행한다. HTML·ZIP·SHA-256 manifest·전체 탭
  contact sheet를 제공한다. 추가6장은 이전 상태를 합성하지 않고 After 전용으로 표시한다.
- Vite의 기존500kB chunk 경고는 남는다. 표시용 Mock/테스트 Gateway 증거이며 실제 장치
  동작이나 실시간 영상 확인을 의미하지 않는다.

## 공통 시각 명세

| 역할 | 규칙 | 적용 대상 |
| --- | --- | --- |
| 본문 | 자체 호스팅 Cleany Pretendard, 14/20px, weight 400 | 모든 페이지·패널·폼 |
| 페이지 제목 | 24/32px, 700 | 홈 지도, 작업, 결과, 로봇, 설정, 모니터링 |
| 패널 제목 | 16/24px, 600 | 목록·요청·설정·조종 |
| 대상 제목 | 20/28px, 600 | 선택 로봇·작업 상세 |
| 라벨/보조 | 12/18px, 600/400 | 필드·설명·메타데이터 |
| 기본 컨트롤 | 40px, 14/20px, 버튼 600 | 새로고침·층 선택·설정·일반 동작 |
| 작은 컨트롤 | 32px, 12/16px | 지도 도구·좌석 편집·닫기 |
| 큰 컨트롤 | 48px, 16/24px | 로그인 입력/제출·좌석 요청·조종 정지 |
| Radius | control/inset 8px, badge 6px, panel 12px | 동일 역할이면 동일 값 |
| 간격 | 4·8·12·16·20·24·32·40px | panel 20px, map panel 16px, page 24px/좁은 화면16px |
| border/shadow | 1px; 일반 카드 shadow 없음; 떠 있는 패널/메뉴만 shadow | 목록·설정·지도 overlay |
| 포커스 | teal 2px outline + 2px offset | 키보드 탐색 가능한 컨트롤 |
| 상태 badge | 최소24px, 12/16px 600, 문구 병기 | Robot·Mission·조종·카메라 |
| 선택 항목 | teal soft 배경 + 좌측3px 강조 | 작업/결과 목록·로봇 카드 |

색상은 `src/styles/tokens.css`에서 관리한다. 텍스트 `#24333d`, 보조 `#586b70`,
주행동 `#167e70`, 옅은 teal 위 텍스트 `#12695d`, 경고 `#94601d`, 오류 `#b94834`,
입력 경계 `#7a8a8e`를 사용한다. 배경/옅은 상태색은 이 팔레트에서 파생한다.
본문·상태 텍스트 대비 4.5:1, 입력 경계 3:1을 브라우저의 실제 해석 색상으로 검사한다.

유지하는 예외:

- 로그인: 기존 일러스트·중앙 카드·24px Radius, 30/40px 제목(모바일28/36px).
- 지도: 좌석/벽/SVG/로봇 marker의 비율·좌표·범례와 밀도. 지도의 붙어 있는 경계는 square.
- 조이스틱/회전 슬라이더: 원형·가로 입력의 기하, pointer capture, hold/release 동작.
- 3D와 사진/영상: 자체 렌더링과 명암; 카메라 어두운 배경. 로봇 탭 크기는 위 페이지 규칙을 따른다.
- 운영 화면 최소1024px; 로그인만 모바일 지원. 1024px에서 패널 내용은 세로 스크롤할 수 있다.

## 컴포넌트와 책임

```text
src/styles/tokens.css                색상·폰트·크기 토큰
src/styles/ui.css                    시각 역할 + 도메인 공통 스타일
src/components/ui/                   shadcn 기반 native/Radix primitives
src/components/patterns/             Surface/Header/Field/StatusBadge/Notice
src/components/*, src/features/*     도메인 상태·데이터·지도·조종
src/pages/UiPreviewPage.tsx           개발 전용 표본 (/ui-preview?demo=1)
```

| 요소 | 처리 |
| --- | --- |
| 일반 버튼/입력/선택창 | 공유 Button/Input/NativeSelect로 교체. native prop/ref 유지 |
| 운영/알림 메뉴 | Radix DropdownMenu로 교체. 링크 탐색 의미 유지 |
| 설정 | 소비되는 갱신 간격/기본 우선순위만 편집. 미사용 boolean 저장 값은 보존; Switch는 개발 표본에 유지 |
| 페이지/패널/필드/메시지 | 공유 patterns와 공통 CSS로 통일 |
| Robot/Mission badge | 기존 상태 매핑 유지, StatusBadge로 표시 통일 |
| 목록/상세/미션 단계/상태 메시지 | 기존 DOM과 상태 유지, 동일 역할의 여백·폰트·표면 규칙 적용 |
| 지도 좌석·3D·조종 입력·카메라 | 도메인 구현 유지. 주변 버튼/패널/문구만 공통 규칙 적용 |

`Button asChild`는 Link의 의미를 보존한다. `Input`/`NativeSelect`는 `controlSize`로
크기를 선택하고 native `size`, autocomplete, required 등은 그대로 전달한다.
Field hint는 `{htmlFor}-hint`로 만들며 input의 aria-describedby를 명시적으로 연결한다.
disabled/aria-busy는 실제 상태에서 전달한다. 새 취소 확인 단계나 상태 변경은 추가하지 않았다.

기존 feature CSS는 `@layer legacy`에 남겨 배치를 보존한다. 시각적 차이를 일으키던
workspace 팔레트 별칭을 제거했다. 남은 legacy 시각 선언을 제거할 때는 화면별 snapshot으로
검증한다. 새 CSS를 legacy에 추가하거나 임의 specificity로 ui.css를 덮어쓰지 않는다.

## 정보 밀도와 문구 규칙

정보 단순화의 Before는 최초 preview가 아니라 shadcn 통합을 마친 `67bb5fc`다.
대상·현재 상태·가능한 행동을 먼저 보여주고, 제목이나 컨트롤 자체가 설명하는 문장은 삭제한다.
로그인, 지도 점유 정보, 도메인 입력 기하와 14px 본문/40px 기본 컨트롤은 유지한다.

| 영역 | 기본 표시 | 접거나 제거하는 정보 |
| --- | --- | --- |
| 페이지 | 제목과 주행동, 일반 헤더 최소72px/세로 padding12px | 제목을 반복하는 부제; 지도 헤더는 기존 최소96px 유지 |
| 작업 목록 | 대상·상태·요청 시각, 높은 우선순위만 강조; 행 최소64px/세로 padding12px | 매번 같은 작업 종류와 보통 우선순위 |
| 작업 상세 | 진행 단계·배정 로봇·취소 결과/불가 이유 | 요청자·시각·ID·원시 메시지는 `요청 정보` |
| 결과 | 관측 자료·결과·실행 출처·실패 이유·미처리/실패 작업·검토 필요 | 요청자·ID·수락/종료 시각·소요 시간·메시지는 `상세 정보` |
| 로봇 | 상태 badge·배터리·마지막 수신·현재 작업; 배정 없음과 조회 실패를 구분 | 반복 상태 값, transport/profile 진단은 `연결 상세` |
| 수동 조종 | 이동/회전·바퀴 속도 상한·정지 요청·차단 이유·정지 확인 | 긴 설명/단축키는 `조작 도움말`, 서버/구동 응답은 `연결 상세` |
| 카메라 | 영상이 있으면 상단 상태, 없으면 중앙 상태 1개 | 같은 상태의 중복 표시와 자동 표시 안내 |
| 모니터링 | 의미가 드러나는 지표 이름, 성공/수락 분모와 모의 실행 수 | 집계 기준과 원시 이벤트는 접기; 지표 제목/값은 상단 정렬 |
| 설정 | 연결 끊김 시 갱신 간격·기본 우선순위, 브라우저 저장 범위 | 소비되지 않는 실시간 표시/완료 알림 토글, 고정 환경/버전 소개 |
| 예시/촬영 | 전역 실제 명령 미전송, 사진 옆 AI 생성 표기 | 페이지마다 반복하던 예시 설명 |

`Details`는 native details/summary로 키보드와 접근성 의미를 유지한다. 새 조종 도움말의
summary에 포커스한 Space는 접기를 토글하며 조종 명령을 보내지 않는다. 기존 이동 입력,
release/blur/navigation 정지 요청과 stop-confirmed 판단은 그대로다. **정지 요청과 정지 확인,
물리 비상정지를 합쳐 표현하지 않는다.** 오류/빈 목록/로딩은 다른 상태이며 조회 오류에는
`다시 시도`를 제공한다. 결과 열람은 검토 완료 처리가 아니다.

`liveStatus`, `completionNotification`은 저장되지만 동작에서 소비되지 않아 설정 화면에서만
숨겼다. 저장 시 기존 settings에 편집한 두 값만 병합하며, 숨긴 boolean을 지우거나 초기화하지
않는다. 새로운 설정은 실제 소비 경로가 있는 경우에만 노출한다.

## 검증과 Before/After

저장소 루트에서:

```bash
pnpm test
pnpm contracts:check
pnpm build
pnpm --filter @cleany/dashboard test:e2e
pnpm test:e2e:gateway
CI=1 pnpm --filter @cleany/dashboard test:robot-model
pnpm --filter @cleany/dashboard test:visual
uv run --project apps/backend --extra dev pytest apps/backend/tests
uv run --project apps/backend --extra dev ruff check apps/backend
```

시각 테스트는 별도 Vite preview와 intercept한 표시 전용 API fixture를 사용하며 실제 backend
계정/명령을 변경하지 않는다. Chromium, ko-KR, Asia/Seoul, DPR1, 고정 시간, 자체 폰트,
reduced-motion과 기존 CAD poster 경로로 안정화한다. Chromium native select의 fallback-font 캐시를 피하려고 시각 fixture에서만 production entry 실행 전에 실제 로컬 폰트를 로드한다. 기능 E2E는 원래 bootstrap을 그대로 실행한다. 도메인 영역을 mask하지 않는다.

1920×1080/1366×768에서 홈, 요청, 로봇 상세, 작업, 결과, 로봇/조종/카메라, 설정, 모니터링,
메뉴, empty/error/loading, 로그인/오류/첫 비밀번호 변경을 캡처한다. 390×844는 인증 화면,
1024×768은 전체 페이지의 가로 넘침과 헤더 컨트롤 경계를 검사한다.

Before 자료는 아래처럼 **별도 출력 경로**에만 저장한다. baseline에 After의 1024px 계약을
소급 적용하지 않도록 비교 캡처에서는 layout test를 제외한다. After의 layout test는 항상 실행한다.

```bash
CLEANY_VISUAL_URL=http://127.0.0.1:8081 \
CLEANY_VISUAL_SNAPSHOTS=/absolute/review/before \
pnpm --filter @cleany/dashboard test:visual --update-snapshots \
  --grep-invert 'navigation and primary content' --output=/tmp/cleany-before-visual

python3 apps/dashboard/tools/compare_ui.py \
  --before /absolute/review/before \
  --after apps/dashboard/tests/visual/snapshots \
  --output /absolute/review \
  --before-ref 16bc31e1275fe0db19dc3e8758feb344163b9c81 --after-ref <reviewed-commit>
```

Pillow가 없다면 `uv run --with pillow python`으로 exporter를 실행한다.
HTML은 나란히/겹치기/픽셀 차이, 원본 PNG 링크, SHA-256 manifest, ZIP과 contact sheet를 제공한다.
Before/After의 폰트·색상·간격·Radius·컨트롤 높이 변화는 의도한 변경이다. 잘림, 클릭 불가,
지도 정렬 변화, 상태/내용 누락은 회귀다. 개선 후 스냅샷은 동일 환경에서 **0픽셀** 차이를 요구한다.
환경/브라우저 버전이 달라 생긴 차이도 먼저 조사하고, 검토한 디자인 변경만 snapshot에 반영한다.

키보드 메뉴, Escape/외부 클릭/포커스 복귀, 설정 저장/reload와 숨긴 값 보존, 페이지 간 computed style,
대비 검사 외에 기존 계정/권한·요청 payload·실시간 위치·카메라 fresh/lost/demo·수동 조종
release/blur/navigation 정지·SLAM 정렬/82좌석·Gateway phase·3D 상호작용 검사를 유지한다.

## 알려진 제한

- baseline과 동일한 Backend Ruff 오류 6개(head_camera, server route, 기존 테스트 formatting)가
  남아 있다. UI 작업에서 Backend 파일은 수정하지 않았으며 lint 임계치/규칙도 바꾸지 않았다.
- Vite의 기존 500 kB chunk 경고가 남는다. 메인 JS gzip은 약40 kB 증가했다.
- 스냅샷은 모의/표시 자료다. 실제 로봇 연결·카메라 품질·물리 정지 성공을 증명하지 않는다.
- 개발용 표본은 production bundle/route에 포함되지 않는다. 일반 개발 인증 흐름은 유지한다.

## 2026-11-16 최초 shadcn 통합 검증 기록 (`67bb5fc`)

- Frontend: 23개 파일/99개 단위 테스트, TypeScript, production build, contract check 통과.
- Backend: 110개 테스트 통과. Ruff는 baseline과 정확히 같은 기존 오류 6개.
- 브라우저 기능: 기본 E2E 21개, Gateway 1개, 3D 모델 12개, 개발 UI 표본 1개 통과.
- 시각 검증: 개선 후 38개 시나리오를 snapshot 갱신 없이 재실행하여 통과(0픽셀 허용).
  비교용 baseline 캡처 35개 시나리오도 통과. 총37쌍 PNG를 exporter로 비교한다.
- 지도/통신/Backend/contract 구현의 diff 없음. 원본 worktree의 793개 파일을
  초기 SHA-256 manifest와 비교하여 변경 없음을 확인했다.
- 비교 서버는 각각 독립 SQLite/mock 환경이며 실제 장치 검증은 수행하지 않았다.

정보 단순화 비교는 위 명령의 `--before-ref`를 `67bb5fc`로 지정하고, 해당 커밋에서 보존한
37개 snapshot을 Before로 사용한다. `--expected-changes`에 부제 삭제·72px 일반 헤더·64px
작업 행·메타데이터 접기·설정 축소를 명시한다. exporter는 HTML/manifest/contact sheet와
비교 PNG만 ZIP에 포함하며 별도 서버 build/DB는 포함하지 않는다. 이 변경에서 로그인,
지도 좌표, 기존 조종 이벤트 동작의 차이는 의도한 변경에 포함되지 않는다.

## 2026-11-16 정보 단순화 검증 기록

- 단위 99개, 기본 브라우저 E2E 25개, Gateway 1개, 3D/개발 표본 13개 통과.
  새 E2E는 짧은 헤더, 오류 재시도, 결과 메타데이터 접기와 핵심 정보 보존,
  도움말 키보드 조작 시 명령 미전송과 조종 차단/정지 확인 표시를 검사한다.
- 설정 편집/저장/재로드/새 요청 기본 우선순위와 숨긴 boolean 보존 검증 통과.
- production build/TypeScript와 계약 검사 통과. Backend/contract 구현 변경 없음;
  Backend 전용 테스트와 Ruff는 이번 문구 변경에서 재실행하지 않았다.
- 최종 시각 검증 38개를 snapshot 갱신 없이 통과했다(허용 차이 0픽셀).
  지도 상세 캡처에서 초기 도면 decode와 초점 이동이 겹치면 SVG 글자 raster가 달라지는
  현상을 관찰했다. 테스트에서 decode 및 초기 paint 후 로봇을 선택하도록 준비 절차를
  보완했으며, 해당 장면 5회 연속 검사와 전체 재검사가 통과했다. 제품 지도 코드는 그대로다.
- Before 37장은 `67bb5fc`의 PNG와 SHA-256이 일치한다. 37쌍 HTML의 화면 선택,
  나란히/겹치기/투명도/픽셀 차이와 ZIP 다운로드, PNG 해시를 검증했다.
  실제 서버의 지도 헤더는 변경 전/후 모두 97.84375px(최소96px), 좌석 82개다.
- 화면은 표시용 fixture/모의 환경이며 실제 로봇·카메라·물리 정지 증거가 아니다.

## 2026-11-17 운영 홈과 내비게이션

상단은 홈(`/`) / 지도(`/map`) / 작업(`/missions`) / 로봇(`/robots`) / 설정(`/settings`)이다.
작업·결과는 아래 통합 작업 명세에 따라 `/missions`에서 관리한다. `/results`는 필터와
선택 작업을 보존한 호환 경로다. `/monitoring`은 검색 파라미터를 보존해 홈으로 이동한다. 구 홈의 명시적인
`recording=1`, `summaryDemo=1` 링크는 `/map`으로 이동한다. 좌석 요청과 촬영 진입 링크도
지도 경로를 사용하며, 기존 도메인 지도/조종 처리 로직은 변경하지 않는다.

홈은 무인 스터디카페 운영 요약이다. 기존 모니터링의 로봇 지표·원시 활동 대신 정리 상태,
평균 점유율, 점유 추이, 작업 유형별 건수, 운영 상태를 표시한다. 전체 너비1440px,
첫 행 카드2:1, 둘째 행 차트5:5(1024~1279px에서는 두 행 모두5:5),
간격20px/좁은 화면16px, 기존 패널12px Radius를 사용한다.
홈 전용 그래픽은 토큰의 초록/노랑/빨강과 브랜드 teal을 사용하고 색과 함께 숫자·범례를 제공한다.
Recharts의 SVG는 기존 아이콘용 전역 stroke 규칙을 상속하지 않는다. 접근성용 데이터 표는
카드에 위치를 고정한 숨김 컨테이너에 두어 스크롤 영역이 불필요하게 늘어나지 않도록 한다.

### 데이터 의미와 경계

- 홈 본문 전체는 독립된 `HomeSnapshot` Mock이며 제목 옆 `예시 데이터`를 항상 표시한다.
  기존 공통 헤더의 알림·인증·층 선택은 그대로다. 홈의 가짜 수치를 OperationsContext나
  실제 알림 집계에 합산하거나 API 명령으로 전송하지 않는다. 링크는 화면 단위이며 가짜 ID를 넘기지 않는다.
- 기본18층은82석. 완료64/진행1/필요17 순서의 비공간적 블록이며 좌석별 클릭은 없다.
  장애 예시는64/0/18, 로봇 연결 끊김·개입 필요2건으로 구성한다. 다른 층은 예시 데이터 없음.
- 점유율은 Asia/Seoul 당일00:00~집계 시각의 시간 가중 평균이다. 같은 시간 구간으로
  도넛과 시간대별 추이를 구성하고 미래 시간은 그리지 않는다. 자정에는 평균을 `—`로 표시한다.
- 유형별 건수는 해당 시각 이전의 오늘 완료 기록을 합산한다. 좌석 수와 작업 건수는 다르다.
  의자 정리 등은 홈의 제품 예시이며 현재 로봇 capability를 추가했다는 의미가 아니다.
- 진입/새로고침 때 시각을 갱신한다. 무작위 값이나 백그라운드 통계 polling은 없다.
  `homeScenario=attention`은 장애 검토용이며 일반 화면에는 시나리오 선택기를 노출하지 않는다.
- 차트는 shadcn Chart + Recharts3.10.1이며 홈 route에서만 지연 로딩한다. registry 출처와
  SHA-256, adaptation을 `components/ui/registry-provenance.json`에 남기고 MIT 라이선스를 유지한다.
  키보드 접근, 차트 설명/데이터 요약을 제공하며 표시 애니메이션은 사용하지 않는다.

### 비교와 검증

Before는 `031cd46`이다. 비교 이미지의 기존 `home`은 이전 지도 ↔ `/map`, `monitoring`은
이전 모니터링 ↔ 새 홈으로 대응한다. 새 장애/데이터 없음 화면은 After 전용 추가 증거다.
일반·장애·데이터 없음, 시간 가중 평균/자정/미래 제외/작업 합계,5개 탭·구 URL·층 전환,
Mock 격리, 키보드 차트 접근을 검증한다. 기존 지도82좌석/실측 지도/작업/결과/계정/수동 조종/
카메라/Gateway/3D suite를 유지하며 위치가 바뀐 지도 테스트의 경로만 `/map`으로 갱신한다.
차트와 홈/메뉴 변경은 의도한 변화이며, 지도 좌표·업무 로직 손상은 회귀다.

### 구현 검증 기록

- 단위102개, 기본 E2E27개, Gateway1개, 3D/개발 표본13개, 시각42개 통과.
  TypeScript/production build, 계약 검사도 통과했다. 시각42개는 snapshot 갱신 없이
  재실행한 결과이며 허용 차이는0픽셀, retry는0이다.
- 지연 로딩된 홈은 좌석82개와 차트3개의 준비를 기다려 캡처한다. 1024/1366/1920px에서
  실제 카드와 메뉴가 화면 너비 안에 들어오는지 확인한다. 차트 키보드 접근, 숨김 데이터 표,
  문서 높이, 새로고침/층 변경, 명령 미전송도 기능 E2E로 확인했다.
- Chromium의 부분 raster 사용 시 초기/부분 paint 순서에 따라 SVG 가장자리와 로그인
  둥근 테두리에서 소수 픽셀 차이가 재현됐다. 시각 suite에만 `--disable-partial-raster`를
  적용한 뒤 해당 장면18회와 전체42개 검사가 통과했다. 제품 스타일, mask, 허용치는
  바꾸지 않았다. 일반 기능/Gateway/3D suite는 이 옵션 없이 검증한다.
  옵션 의미는 [Chromium 도구용 플래그 문서](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md)를 따른다.
- Before37장은 `031cd46`의 원본 PNG를 보존한다.
  exporter의 `--initial-scene desktop/monitoring.png`로 새 홈 비교를 먼저 열며
  장애/데이터 없음4장은 After 전용이다.
  `--capture-notes`에는 Before 원본 보존과 After raster 환경 차이를 명시한다.
- 기존 HomePage를 MapPage로 옮긴 내용은 함수명과 접근성 영역 이름만 다르다.
  Backend/contract/KB 구현은 변경하지 않았으며 Backend 전용 테스트/Ruff는 재실행하지 않았다.
- 차트는 홈에서 지연 로딩하며 해당 JS는 gzip 약118kB다. 기존 main/3D chunk의
  500kB 경고는 남아 있다. 모든 홈 수치와 시각 자료는 Mock이며 실제 장치 검증은 아니다.

## 2026-11-17 날짜 중심 통합 작업 화면

- `/missions`: 상단 일별 요약 + 캘린더/목록/상세의3열. 최대너비1760px,
  기본열248px / 최소300px / 최소420px, 가변 공간은 목록:상세0.85:1.4로 배분한다.
  1024~1279px에서는208px / 264px / 나머지, 간격12px로 압축한다.
  기존 인증된 관제 화면의 최소1024px 정책을 유지하며 모바일 전용 화면은 별도 범위다.
- 14px 본문,40px 입력·버튼,48px 요청 제출,12px 패널 Radius와 기존 상태 토큰을 따른다.
  캘린더 날짜·이전/다음은 반복되는 밀집 탐색이므로32px 컨트롤을 사용한다.
  일별 집계 버튼은 숫자·범례를 담는72px 카드형 필터다. 색과 문구/숫자/선택 표시를 함께 쓴다.
- 목록/상세/캘린더는 독립 스크롤한다. 상세의 상태와 취소·재요청·검토 액션은 고정한다.
  미종료 작업은 진행과 배정 정보를, 종료 작업은 결과/전후 사진을 먼저 보여준다.
  사진은 원본 비율을 보존하고 최대240px 높이로 미리 보기하며 인증된 원본 링크를 제공한다.
  실패 이유·미처리 작업·로봇 확인 요청·실행 출처를 접지 않는다. ID 등 메타데이터만 접는다.
- `features/mission-workspace/`가 날짜/정렬/조회/캘린더/상세/사진/요청을 소유한다.
  primitives와 domain Provider에 화면별 상태를 넣지 않는다. 이전 두 페이지의 CSS는 제거한다.
- 기본은 오늘이며 요청일·종료일 해당 기록과 오늘의 미종료 이월을 함께 조회한다.
  전체/진행/대기/완료/실패/확인 필요/종료 필터, 검색·우선순위, 키보드 날짜 선택을 제공한다.
  확인 필요는 다른 결과 상태와 겹칠 수 있는 별도 조치 집계다. 취소 결과는 종료 전체에 포함된다.
- 검토 완료는 명시적 버튼으로만 기록한다. 원본 로봇 보고와 실패를 보존하고 확인 알림만 해제한다.
  재시도는 같은 좌석·우선순위를 채운 새 요청이다. 미지원 좌석·예시 명령 차단과 중복 key 보호를 유지한다.
  실행 승인 워크플로는 현재 contract에 없으므로 임의의 승인 버튼을 만들지 않는다.
  API/DB 책임은 [ADR0008](../adr/0008-date-scoped-mission-workspace.md)을 따른다.

### Before/After와 회귀 판정

Before는 홈5:5가 반영된 `50088c1`의41개 원본 PNG다. `missions`와 `results`는 각각
새 기본 작업 화면과 확인 필요 필터로 대응하며, 요청 폼/전날 실패는 새 After 장면으로 추가한다.
전체폭·3열·요약·사진 위치 변경은 의도한 변화다. 홈 레이아웃, 지도, 로그인, 조종,
설정의 비의도 차이, 잘린 고정 액션, 날짜·필터/새 요청 오작동은 회귀로 취급한다.
예시 날짜는 고정된 캡처 시각 기준으로 정규화하며 실제 provider에 합치지 않는다.
검토한 장면만 baseline을 갱신한 뒤 허용 차이0픽셀/retry0으로 전체 suite를 다시 실행한다.
1024/1366/1920px에서 패널·고정 액션이 viewport에 들어오는지 별도로 검사한다.

### 구현 검증 기록

- Backend114개, 프런트엔드 단위106개, 기본 E2E32개, Gateway1개, 3D/개발 표본13개 통과.
  최종 요청 폼 정리 후 해당 단위1개/통합 흐름5개도 재검사했다.
  TypeScript/production build와 생성 계약 검사가 통과했다.
- 시각44개는 baseline 갱신 없이 허용 차이0픽셀/retry0으로 통과했다.
  Before41장 중 작업/결과/빈 상태/오류/로딩의10장만 변경했고31장은 동일하다.
  새 요청 폼과 전날 실패의4장을 추가했다. Before 전체는 `50088c1` 원본과 바이트가 동일하다.
- 날짜 경계/이월/150건 목록/과거 단건 링크, 검토 중복 및 새로고침 유지,
  실패 결과 보존, 재시도 시 새 mission/key, 폼 중복 제출과 연결 실패 후 key 재사용을 검증했다.
  원본 terminal JSON 보존과 재시작 후 검토 기록은 SQLite/API 테스트로 확인했다.
- 변경 Python 파일의 Ruff 검사에서 기존 `server.py` 카메라 route decorator의
  E501 한 건이 남는다. 신규 구현/테스트 파일은 통과하며 허용 규칙은 바꾸지 않았다.
- 비교 화면과 테스트 Gateway는 로컬 Mock/표시용 fixture이다. 실제 로봇 동작·카메라 검증은 아니다.

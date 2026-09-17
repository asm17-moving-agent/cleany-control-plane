# 운영 페이지 예시 데이터와 생성 사진

사용자 요청에 따라 작업·결과·로봇 페이지에 브라우저에서 직접 볼 수 있는 예시 모드를 추가했다.

## 열기

- 결과: http://127.0.0.1:5173/results?demo=1
- 작업: http://127.0.0.1:5173/missions?demo=1
- 로봇: http://127.0.0.1:5173/robots?demo=1
- 운영자 메뉴의 **예시 데이터 보기**로도 진입한다.
- 상단 **실제 데이터로 돌아가기** 또는 `?demo=0`으로 해제한다.
- 같은 탭에서 메뉴를 이동하거나 새로고침해도 모드를 유지한다. 데이터는 고정 예시이며 새로고침으로 상태가 진행되지는 않는다.

## 데이터 경계

`src/operations/operations-demo.ts`에 18층 82석, 로봇 3대, 요청 7건을 보관한다.
진행 1건, 대기 2건, 검토 대상 2건, 완료 2건이며 A11·M21 좌석도 포함한다.
로봇은 작업 중·오류·연결 끊김의 세 상태를 보여준다. 배터리는 계약에 없어 미연동으로 유지한다.
개인 이름이나 실제 관측 자료를 사용하지 않는다. 사진 3장을 종료 상태에 맞게 예시 결과에 재사용한다.

예시 모드에서는 LiveOperationsProvider 자체를 마운트하지 않는다.
API 조회·SSE 연결·작업 요청·취소 전송이 없고, 요청/취소 버튼도 비활성화한다.
호출 경로에서 직접 명령 함수를 호출해도 거부한다. 해제하면 별도 실제 쿼리 상태로 돌아간다.
기존 홈의 `summaryDemo=1`은 좌석 점유율만 위한 이전 예시 모드로 유지한다.

## 이미지

내장 image_gen 도구로 생성했다. 원본 카메라·구도·조명을 보존하는 편집으로 전후를 맞췄다.
실제 로봇 관측이 아니다. 앱 배너와 사진 위에 AI 예시임을 표시한다.

프로젝트 소비 경로:

- `apps/dashboard/public/demo/observations/desk-before.png`: 컵·휴지·수첩
- `apps/dashboard/public/demo/observations/desk-after-review.png`: 수첩이 남은 검토 예시
- `apps/dashboard/public/demo/observations/desk-after-complete.png`: 물체가 모두 치워진 완료 예시

생성 원본은 `/home/ehdrms/.codex/generated_images/01a080e4-38c9-7130-813e-7b6b13f5ef96/` 아래에 보존했다.
각 파일은 `exec-a84ecfce-7f35-43ae-b873-addcbaffe32a.png`, `exec-10be4c10-e896-4ec6-8c83-27f9c9a24976.png`, `exec-bd6e8bb7-3e2d-434e-88e1-054fcb794049.png`이다.

### 최종 프롬프트: 작업 전

Use case: photorealistic-natural. Asset type: generated demo observation photo for an office desk-cleaning robot dashboard, BEFORE cleanup. Create a single realistic landscape 3:2 photo, 1536x1024. A pale warm oak office desktop viewed from a fixed elevated slightly oblique camera looking down at the entire desktop. One used plain kraft takeaway coffee cup with white lid near the left-middle, one small crumpled white tissue near center, and one closed dark navy notebook neatly placed on the right. Background: only a thin strip of a neutral gray desk divider at the top edge. Everyday office lighting, soft natural shadows, realistic subtle wood grain, neutral documentary photography rather than advertising. Clean sharp detail suitable for a robot observation preview. No people, robot, monitor, keyboard, brand marks, letters, captions, UI, watermarks, or collage. The composition must make the three loose objects clearly distinguishable and leave enough desk surface around them. This is synthetic demonstration imagery, not a record of a real mission.

### 최종 프롬프트: 검토용 작업 후

Use case: precise-object-edit. Edit target: the attached generated demo BEFORE photo of the oak desk. Create its matching AFTER photo for a partially completed desk-clearing task. Remove only the takeaway coffee cup including its shadow and the crumpled tissue including its shadow. Reconstruct the oak desktop naturally in those two small areas. Keep the navy notebook exactly unchanged at the same position, angle, shape, size, color, and shadow. Preserve every other pixel as closely as possible: same wood grain, gray divider, camera, framing, perspective, dimensions, lighting and color. No additions, lettering, overlay, collage, robot or people. The remaining notebook is intentionally left for human review. Single photo, landscape 3:2.

### 최종 프롬프트: 완료 작업 후

Use case: precise-object-edit. Edit target: the attached generated demo BEFORE photo of the oak desk. Create its matching AFTER photo for a completed desk-clearing task. Remove all three loose objects: the takeaway coffee cup, the crumpled tissue, and the navy notebook, including their shadows. Reconstruct the exposed oak desktop naturally. Preserve all surrounding visible areas as closely as possible, with the exact same gray divider, wood grain, camera, framing, perspective, dimensions, lighting and color. The entire desktop is now empty. No additions, lettering, overlay, collage, robot or people. Single photo, landscape 3:2.

## 검증

### 2026-09-10 화면 확인 기록

- 대시보드 Vitest 67개 통과. 추가 1개는 예시 모드의 API 격리, 명령 차단, 메뉴 이동·재마운트 유지, 해제 후 실제 provider 복귀와 SSE 정리를 검증한다.
- typecheck, contracts:check, production build, git diff --check 통과.
- Firefox 실제 화면에서 1440px / 1100px 너비의 niri 창 캡처를 확인했다. 사진 2장 로드, 예시 모드 유지, 가로 넘침 없음, 예시 화면의 API 리소스 요청 0건을 확인했다.
- 실제 데이터 복귀 → 운영자 메뉴로 예시 모드 재진입 → 작업 7건과 취소 비활성화 → 홈 82석·로봇 3대와 요청 비활성화를 Firefox에서 확인했다.
- niri 캡처: `docs/architecture/assets/operations-demo-review-20260910/`.
- 실제 로봇 명령 실행이나 실측 전후 비교를 검증한 것은 아니다.

### 2026-09-15 병합 전 재검증

- 대시보드 Vitest 69개, 백엔드 pytest 18개 통과.
- `pnpm contracts:check`, `pnpm typecheck`, `pnpm build`, 백엔드 Ruff 통과.
- production build 이후 `pnpm --filter @cleany/dashboard test:e2e`로 Chromium E2E 9개 통과.
- 기존 E2E의 로봇 목록 이름과 알림 메뉴 경로를 현재 화면에 맞췄다. 요청 생성 응답의
  Mission ID가 배정 로봇 패널과 작업 상세 링크에 이어지는지 확인한다.
- 1920×1080, 1366×768에서 패널의 최종 위치가 화면 안에 들어오는지 확인한다.
  열리는 애니메이션 중의 위치를 실패로 판정하지 않도록 경계 검사를 재시도한다.
- 새 예시 모드 E2E는 전후 사진 로드, 작업·로봇·홈 이동과 새로고침 후 모드 유지,
  요청·취소 버튼 비활성화, 예시 모드의 API 요청 0건과 해제 후 실제 API 복귀를 확인한다.
- `git diff --check main` 통과. 기존 디자인 CSV의 줄바꿈을 LF로 정리했고,
  CSV의 행 내용과 PNG 100개의 SHA-256은 그대로 유지했다.
- 검증은 로컬 API의 MockDispatcher와 브라우저 범위다. 실제 로봇 연동과 실측 결과는 포함하지 않는다.
- 3D 모델의 별도 JavaScript 청크 약 619kB에 대한 Vite 크기 경고는 남아 있다.

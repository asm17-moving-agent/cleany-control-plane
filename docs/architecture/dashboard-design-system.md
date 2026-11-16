# Cleany Dashboard 디자인 시스템

기준은 telemetry-camera-preview snapshot `16bc31e1275fe0db19dc3e8758feb344163b9c81`이다.
원본 작업을 보존한 `preview-ui-baseline`과 구현 worktree `preview-shadcn`을 비교한다.
API, 계약, 상태 관리, 지도 좌표, Mission 요청/취소, SSE, 수동 조종의 이벤트 로직은 이번 변경 범위 밖이다.

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
- 3D와 사진/영상: 자체 렌더링과 명암; 카메라 어두운 배경. 영상 박스 크기는 기존 규칙.
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
| 설정 toggle | Radix Switch + 기존 React Hook Form Controller, boolean 저장 유지 |
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

키보드 메뉴, Escape/외부 클릭/포커스 복귀, Switch 저장/reload, 페이지 간 computed style,
대비 검사 외에 기존 계정/권한·요청 payload·실시간 위치·카메라 fresh/lost/demo·수동 조종
release/blur/navigation 정지·SLAM 정렬/82좌석·Gateway phase·3D 상호작용 검사를 유지한다.

## 알려진 제한

- baseline과 동일한 Backend Ruff 오류 6개(head_camera, server route, 기존 테스트 formatting)가
  남아 있다. UI 작업에서 Backend 파일은 수정하지 않았으며 lint 임계치/규칙도 바꾸지 않았다.
- Vite의 기존 500 kB chunk 경고가 남는다. 메인 JS gzip은 약40 kB 증가했다.
- 스냅샷은 모의/표시 자료다. 실제 로봇 연결·카메라 품질·물리 정지 성공을 증명하지 않는다.
- 개발용 표본은 production bundle/route에 포함되지 않는다. 일반 개발 인증 흐름은 유지한다.

## 2026-11-16 구현 검증 기록

- Frontend: 23개 파일/99개 단위 테스트, TypeScript, production build, contract check 통과.
- Backend: 110개 테스트 통과. Ruff는 baseline과 정확히 같은 기존 오류 6개.
- 브라우저 기능: 기본 E2E 21개, Gateway 1개, 3D 모델 12개, 개발 UI 표본 1개 통과.
- 시각 검증: 개선 후 38개 시나리오를 snapshot 갱신 없이 재실행하여 통과(0픽셀 허용).
  비교용 baseline 캡처 35개 시나리오도 통과. 총37쌍 PNG를 exporter로 비교한다.
- 지도/통신/Backend/contract 구현의 diff 없음. 원본 worktree의 793개 파일을
  초기 SHA-256 manifest와 비교하여 변경 없음을 확인했다.
- 비교 서버는 각각 독립 SQLite/mock 환경이며 실제 장치 검증은 수행하지 않았다.

# Cleany Dashboard

React·TypeScript와 Vite로 구현한 관제 UI다. React Router로 화면을 이동하고,
TanStack Query로 HTTP 응답과 SSE 갱신을 관리한다. 현재 Backend는 Mock Dispatcher를
사용한다.

## 홈 구성

상단 메뉴, 상시 로봇 목록, 좌석 지도, 선택 시 열리는 요청 패널, 하단 업무 요약을
`100dvh` CSS Grid로 배치한다. 왼쪽 목록은 260px, 요청 패널은 340px이며 지도는
남은 너비를 사용한다. 상단은 64px, 하단은 104px이다. 최소 너비는 1280px이며
더 좁은 창에서도 로봇 목록을 숨기지 않고 가로 스크롤을 허용한다. 목록과 폼은
필요할 때 내부에서 스크롤하고, 요청 버튼은 패널 아래에 유지한다.

지도는 기존 18층 PNG와 정적 SVG(가구·구역명·엘리베이터), HTML 좌석·로봇 레이어를
사용한다. 모든 레이어가 같은 좌표 변환을 공유한다. API의 `row`와 `grid_column`을
`features/facility-map/seat-layout.ts`에서 D-HUB 48개 좌석에 대응한다.
실제 로봇 좌표계 및 금지 구역과의 정합은 Robot Edge 연동 전에 별도로 확정해야 한다.

D-HUB는 2번 시안의 독립 책상 형태를 사용한다. 개인 책상 중앙에 좌석 번호를 크게
표시한다. 모니터·키보드는 표시하지 않고, 책상 바깥쪽에 작은 의자 윤곽을 표시한다. 책상 면이
좌석 선택 영역이며 선택 시 청록색 배경과 흰색 번호로 강조한다.

- 좌석 클릭: 해당 좌석을 선택하고 우측 요청 패널을 연다.
- 초기 화면: 전체 맞춤 대비 125%로 확대하고 도면 상단을 맞춰, 오른쪽 휴게 구역과 하단 일부까지 보인다.
- 활성 구역 버튼: 흰색 작업 구역을 중심으로 화면 크기에 맞춰 확대한다.
- 전체 보기: 회색 비운영 공간을 포함한 전체 도면을 맞춘다.
- 확대/축소, 배경 드래그, 범위 전환: 선택된 좌석을 유지하며 지도만 조작한다.
- 로봇 카드/마커, 로봇 중심: 해당 로봇의 예시 위치로 지도를 이동한다.
- 카드의 화살표: 선택한 로봇의 별도 상세 페이지로 이동한다.
- 요청 닫기 또는 패널 안에서 Escape: 폼을 닫고 좌석으로 포커스를 돌린다.
- 19층: 지도 미연결 상태를 표시하고 좌석 요청을 제공하지 않는다.

## 요청과 요약의 데이터 경계

`POST /api/missions`에는 SEAT target, 우선순위, 요청자, idempotency key를 전송한다.
로봇은 자동 할당, 명령은 책상 위 물체 확인 및 정리로 표시한다. 현재 계약에 없는
로봇 지정과 메모는 입력받지 않는다. 같은 폼의 실패 후 재시도는 같은 idempotency key를
사용하고, 좌석이나 우선순위가 바뀌면 새 요청으로 취급한다. 전송 중 중복 제출을 막고
성공 후에는 생성된 Mission의 별도 페이지로 연결한다.

배터리는 **미연동**, 지도 마커는 **예시 위치**다. 이동 경로와 배터리 수치를 만들지
않는다. 로봇 상태는 `/api/robots`의 외부 상태를 표시한다. 홈의 알림과 요약은
같은 판정 함수를 사용한다.

| 홈 진입점 | 판정 | 이동 |
| --- | --- | --- |
| 즉시 조치 | Robot ERROR/OFFLINE | `/robots?filter=attention` |
| 요청 현황 | QUEUED와 그 외 진행 중 phase | `/missions` |
| 결과 검토 | terminal HUMAN_REVIEW_REQUIRED/PARTIAL_SUCCESS/BLOCKED/FAILED/INTERRUPTED | `/results?filter=review` |
| 최근 완료 | terminal SUCCESS | `/results?filter=success` |

결과 페이지는 작업 전·후 관측 참조를 표시한다. HTTP(S) 또는 같은 호스트의 상대
URL만 링크로 제공하고, `mock://` 같은 식별자는 자료 참조 텍스트로 표시한다.
결과 확인만으로 검토 대상 건수를 지우지 않는다. 완료 시각 계약이 없으므로
최근 완료도 **요청 시각 최신순**이며, 시각 옆에 요청 시각임을 명시한다.

상단 홈/작업/결과/로봇 메뉴에 더해 운영자 메뉴에서 기존 `/monitoring`과
`/settings`로 이동한다. 단계·우선순위·결과·로봇 선택 필터는 URL에 반영한다.
설정은 브라우저 `localStorage`에 저장하며 기본 우선순위와 SSE 오류 시 보조
polling 주기에 반영한다.

## 개발 및 검증

Node.js와 pnpm 설치는 루트 [README](../../README.md)의 안내를 따른다.

```bash
uv sync --project apps/backend --extra dev
uv run --project apps/backend python apps/backend/run.py
```

별도 터미널에서 개발 서버를 실행한다.

```bash
pnpm install
pnpm dev
```

개발 화면은 [127.0.0.1:5173](http://127.0.0.1:5173)이며 `/api`를 8080으로
전달한다. 8080의 SPA는 마지막 `pnpm build` 결과를 제공하므로 개발 중에는
5173에서 확인한다.

```bash
pnpm test
pnpm typecheck
pnpm contracts:check
uv run --project apps/backend --extra dev python -m pytest apps/backend/tests/test_contracts.py
pnpm build
pnpm test:e2e
```

Vitest는 좌석 좌표/ID 정합, 요약 분류, 관측 링크, 지도 선택 유지, 요청 실패·재시도·
중복 제출을 검사한다. Playwright 시나리오는 좌석 요청, 각 진입점, SPA 직접 접근과
1920×1080 / 1366×768 배치를 검사한다.

2026-09-08 시각 및 동작 검증은 **네이티브 Firefox와 niri**로 수행했다. 실제 Mock
Backend 요청과 별도 API fixture의 로딩·오류·빈 목록·재시도를 검증했으며, 당시
실행한 항목과 캡처는 [홈 구현 검증 기록](../../docs/architecture/home-workspace.md)에
남겼다. 이 검증을 Playwright 실행 결과로 간주하지 않는다.

## 스타일

상단 메뉴와 공통 페이지는 `src/app/workspace-shell.css`, 홈의 패널 배치는
`src/pages/home-dashboard.css`, 지도 레이어는
`src/features/facility-map/facility-map.css`에서 관리한다. 새로운 화면은 공통
`--workspace-*` 토큰을 사용하며, 기존 모니터링·설정은 compatibility CSS를 유지한다.

SPACE A1~A4와 M1~M3도 동일한 번호형 책상을 방별 4개 표시한다.
방별 01~04는 시각적 배치 번호이며, 현재 API에 등록된 D-HUB 48석과 달리 작업 요청에는 연결되지 않는다.

홈의 로봇 목록(이름·화살표) 또는 지도 로봇 아이콘을 클릭하면 지도 왼쪽에 로봇 상세 패널이 열린다.
상태, 배터리 미연동, 마지막 확인, 현재 할당 작업, 위치 미연동을 표시하며 오른쪽 작업 요청 패널과 함께 사용할 수 있다.
닫기 버튼 또는 패널 내부 Escape로 닫을 수 있으며, 로봇 상세와 작업 요청 패널은 모든 화면 크기에서 지도 위에 겹쳐 표시하며 지도의 크기를 바꾸지 않는다.

브랜드 원본과 웹용 자산은 `src/assets/brand/`에 보관한다. 상단에는 글자 로고,
로봇 목록·지도·탭에는 얼굴, 로봇 상세 패널·페이지에는 전신 캐릭터를 사용한다.
제공된 원본에서 자르기·크기 조정으로 파생했으며 자세한 출처는 해당 폴더 README를 참고한다.

## 로봇 3D 모델

로봇 상세 패널과 로봇 관리 페이지의 `3D 모델 살펴보기`에서 선택적으로 로드한다.
기본 상태는 이미지 포스터이며, Three.js와 GLB는 클릭 후 불러온다. `/robot-model`은
작은 창에서도 사용할 수 있는 독립 미리보기다. 기존 운영 화면의 최소 폭은 변경하지 않는다.

- 모델: Cleany `e718ac57` MJCF 기본 자세의 웹용 파생 GLB. 실시간 관절·센서 상태가 아니다.
- 원본 6.80 MB → 웹용 2.93 MB. 고유 삼각형 375,110 → 159,586 (인스턴스 반복 전 수치).
- 회전/줌/카메라 변경 시에만 렌더링하며, damping이 끝나면 정지한다. 화면 밖/숨긴 탭은 렌더링을 중지한다.
- 기본 DPR 1, 고화질 선택 시 최대 1.5. 실시간 그림자 대신 고정 바닥 음영 사용.
- 닫으면 canvas와 GPU geometry/material/texture를 해제한다. 다운로드 중 닫힌 모델도 완료 시 해제한다.
- 입체·정면·측면·상단 프리셋과 윤곽 모드 지원. WebGL/다운로드 실패 안내와 재시도 제공.
- 개발 모드의 `/robot-model?renderStats=1`에서 누적 frame 수, draw call, 실제 렌더링 삼각형 수를 확인할 수 있다. 운영 빌드에서는 표시하지 않는다.

자산 출처는 `public/models/README.md`에 기록했다. 포스터는 같은 모델의 네이티브
Firefox 화면을 niri로 캡처한 뒤 모델 영역만 잘라 생성했다. 원본 CAD·ROS 모델은 수정하지 않는다.
최적화는 파일 크기와 유휴 렌더링 감소를 목표로 하며, GPU 사용률/소비전력 감소율을 의미하지 않는다.

홈 하단 업무 패널은 기본 150px/4열, 1500px 이하에서 최대 200px,
1280px 이하에서 최대 300px/2×2로 표시한다. 화면 높이에 따라 확장을 제한하고,
700px 이하 높이에서는 보조 목록을 숨겨 지도 조작 공간을 확보한다.
홈의 최소 너비는 1024px이며, 실제 요청·검토 항목을 요약에 표시한다.

하단 업무 패널 데모: `/?summaryDemo=1`. 즉시 조치 2건, 진행 1건, 대기 2건,
검토 2건과 최근 완료를 화면용 fixture로 표시한다. 로봇 목록·지도·서버 데이터는
변경하지 않으며 상단의 '실제 데이터로 돌아가기'로 해제한다.

### 표시용 대기 자세 모델

`/robot-model`은 `cleany-e718ac57-standby.glb`를 사용한다. 원본
`cleany-e718ac57-web.glb`의 경량 형상을 유지하면서 팔 관절의 표시 자세와
부품별 PBR 재질만 변경했다. 양쪽 어깨 yaw를 각각 -90도/+90도로 돌려
위팔과 아래팔이 거의 포개지도록 접고, 손목을 보정해 그리퍼가 머리 카메라와
같은 정면을 향하게 했다. 어깨 pitch 2.9rad, 팔꿈치 3.05rad, 손목 pitch -0.15rad를 사용한다.
MuJoCo forward kinematics로 만든 정적 예시이며,
실시간 자세나 충돌·안전 검증을 마친 하드웨어 대기 명령이 아니다.
각도와 재질 매핑은 같은 이름의 JSON에 기록한다.

다음 명령은 저장소 루트에서 실행한다. `CLEANY_SOURCE`는 Cleany의
`e718ac57e861f3d34b6e0e10b0d18d87a348bf51` 체크아웃 경로다.
출력은 기존 파일과 다른 경로로 지정한다.

```bash
uv run --with mujoco==3.12.0 --with trimesh --with numpy python \
  tools/prepare_robot_standby.py \
  "$CLEANY_SOURCE/ros2_ws/src/cleany_description/mjcf/cleany.xml" \
  apps/dashboard/public/models/cleany-e718ac57-web.glb \
  /tmp/cleany-standby-new.glb
```

스크립트는 입력 GLB 해시, MJCF와 기존 노드 변환 일치, 관절 제한,
128개 형상 배치 보존, 삼각형 수 보존, GLB 재로드 경계를 검증한다.
팔꿈치는 어깨 뒤로, 손목은 앞으로 접히는지, 두 그리퍼의 로컬 -Y 축이
머리 카메라의 정면 축과 일치하는지도 확인한다.
재질은 표시를 위한 구분이며 실물의 측정된 광학 특성이 아니다.
`cleany-standby-poster.png`는 같은 모델을 Firefox 뷰어에서 렌더링한 미리보기다.

외장 디자인은 `RobotExterior.ts`가 생성하는 별도 표시 레이어다. `외장 시안`
버튼으로 같은 구도에서 원본과 비교할 수 있다. 가운데는 수거함이며, 팔 뒤쪽의
열린 입구를 `투입구` 보기에서 확인할 수 있다. 카메라는 추가 커버 없이 노출하고
지지대는 유지한다. 수거함 외장은 네 알루미늄 기둥 바깥을 연속해서 감싸고,
하부 본체와 같은 밝은 회색으로 마감한다. 상하부는 단면과 모서리 곡률을 맞추고
중간 돌출 띠 없이 얇은 이음선으로 연결한다. `후면` 보기에서는 정비 패널을 확인할 수 있다.
`구동부` 보기에서는 네 바퀴에 보완한 표시용 커플러를 확인할 수 있다. 원본 MJCF에
없는 형상을 웹 표시 레이어에 추가했으며, 실물 커플러의 규격은 미확인이다.
`팔` 보기에서는 위팔·아래팔 바깥면과 어깨 앞쪽의 부분 커버 6개를 확인할 수 있다.
커버는 기존 대기 자세의 링크에 맞춰 생성하며 안쪽과 양 끝을 열어 둔다.
관절의 전체 가동 범위와 실물 제작 사양은 검증하지 않았다.
`센서` 보기에서는 전면 절단선 아래의 라이다용 가로 개구부와 초음파용 가로 개구부 두 개를
확대한다. 외장 양쪽 면을 관통하고 안쪽으로 이어지는 표시용 형상이다.
라이다 높이는 사용자 요청에 따라 360mm로 표시하며 원본 MJCF 기준점(460mm)과 다르다.
초음파 개구부는 높이 24mm를 유지하고 가로 폭을 60mm로 넓힌다. 센서 본체는 GLB에 없으며,
초음파 위치·구멍 치수와 라이다 전체 시야는 실물 검증 전의 디자인 제안이다.
현재 기본 미리보기는 `cleany-exterior-poster.png`를 사용한다.
치수, 반복 보완과 검증 범위는
[외장 시안 문서](../../docs/architecture/robot-exterior-concept.md)에 기록한다.

검증: `pnpm --filter @cleany/dashboard exec vitest run src/components/RobotModel.test.tsx src/components/RobotSensorOpenings.test.ts`,
`pnpm contracts:check`, `pnpm build`. 실제 렌더링은 Firefox에서 `/robot-model`을
열어 niri 캡처로 확인한다. 개발 모드에서 `?renderStats=1`을 붙이면 렌더링
진단을 확인할 수 있다.

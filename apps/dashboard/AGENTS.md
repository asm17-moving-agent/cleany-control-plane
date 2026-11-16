# Dashboard UI rules

- 디자인 기준은 [Cleany UI 명세](../../docs/architecture/dashboard-design-system.md)와
  `src/styles/tokens.css`, `src/styles/ui.css`다. 새 화면을 만들기 전에 읽는다.
- 일반 버튼·입력·native select·메뉴·switch는 `components/ui/`를 사용한다.
  링크 형태 버튼은 `Button asChild` + `Link`로 만들고 링크 의미를 유지한다.
- 페이지 제목, 패널 제목, surface, field, badge, notice는 `components/patterns/`를 재사용한다.
  이 두 계층에는 API, Mission 상태 판단, Query, 인증, 통신을 넣지 않는다.
- 일반 페이지는 `PageShell`을 사용한다. 홈·설정은 standard(1440px), 작업·로봇은
  wide(1760px)이며 제목은 투명한72px 헤더로 둔다. 지도는 전체 canvas 예외다.
  작업·로봇은 workspace flow로 목록/상세만 스크롤하며 페이지 헤더는 고정한다.
  상위 main의 배치를 feature `:has()` selector로 바꾸지 말고 AppShell의 flow에 명시한다.
- 페이지 여백/간격은 `patterns/page-shell.css`에서 소유한다. 로봇 목록의 표시 내용은
  `RobotSummaryContent`, 작업 우선순위 입력은 `MissionPriorityField`를 재사용한다.
  지도 button과 로봇 페이지 Link의 의미, 우선순위 변경 시 상태 처리는 각 도메인이 소유한다.
  목록처럼 내부 구획이 여백을 소유하면 `Surface padding="none"`으로 명시한다.
- 기본 컨트롤 40px, 지도 도구 32px, 로그인/작업 요청 주행동 48px를 선택한다.
  임의의 색·폰트·Radius·높이를 페이지마다 추가하지 않는다. 예외는 명세에 이유를 기록한다.
- 새 스타일은 `components` layer에 작성한다. 기존 `legacy` layer는 도메인 배치와
  점진적 이관을 위한 것으로 새로운 시각적 규칙을 추가하지 않는다. Tailwind utility는
  배치에 사용할 수 있으나 역할별 크기·색상·Radius를 화면별로 덮어쓰지 않는다.
- `main.tsx`의 첫 import는 `styles.css`다. 컴포넌트 CSS보다 먼저 layer 순서를
  확립해야 한다. 순서를 바꾸면 전체 페이지 computed-style/시각 검사를 다시 실행한다.
- 지도 좌석·pointer capture·조이스틱·회전 입력·3D canvas는 도메인 컴포넌트로 유지한다.
  스타일 정리를 위해 이벤트 처리나 명령 payload, 중지 조건을 바꾸지 않는다.
- 새로운 상태를 색만으로 표현하지 않는다. 표시 문구와 role/label, disabled/focus를 확인한다.
  Field의 hint가 있으면 입력의 `aria-describedby`를 `${htmlFor}-hint`와 연결한다.
- 기본 화면에는 대상·현재 상태·가능한 행동을 우선 표시한다. 제목을 반복하는 설명은
  추가하지 않는다. ID/원시 메시지/진단 정보는 `Details`로 접고 실패 이유·미처리 작업·
  검토 필요·실행 출처·조종 차단·정지 확인은 바로 보이게 유지한다.
- 일반 페이지 헤더는 최소72px, 지도 헤더는 기존 최소96px를 유지한다. 정보량을 줄일 때
  본문14px와 기본 컨트롤40px를 축소하지 않는다. 실제 소비하지 않는 설정을 노출하지 않는다.
- shadcn registry를 다시 가져올 때 자동 overwrite하지 않는다. `registry-provenance.json`과
  로컬 adaptation을 비교하고 필요한 변경만 적용한다. 라이선스를 보존한다.
- 변경 후 단위/계약 검사부터 실행한다. 공통 UI 변경에는 production build와 E2E,
  `test:visual`을 추가한다. 실제 모델·지도·수동 조종에 영향이 있으면 관련 전용 suite도 실행한다.
- 스냅샷 실패를 픽셀 허용치 확대나 넓은 mask로 숨기지 않는다. fixture와 렌더링을 먼저
  안정화한다. 의도한 변경을 Before/After에서 검토한 뒤 해당 snapshot을 갱신한다.
- mock/예시 데이터 화면과 실제 장치 검증을 구분한다. 테스트 계정과 비교 서버는 로컬 전용이다.
- 홈(`/`)은 스터디카페 운영 요약이며 현재는 독립된 Mock이다. 지도/요청은 `/map`에 둔다.
  홈 예시 수치를 실제 운영 provider·알림 집계·명령에 넣지 않는다. 그래프의 집계 시각과
  출처를 보존하고, 현재 좌석 정리 상태를 과거 Mission 결과만으로 추정하지 않는다.

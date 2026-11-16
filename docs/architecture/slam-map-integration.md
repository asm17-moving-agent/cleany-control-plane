# SLAM 지도와 Jetson 통합

Dashboard와 주행은 같은 저장 지도 버전을 사용한다. Backend는 표시용 지도와 원본을
보관하며 실시간 `/map`이나 주행 목표의 소유자가 되지 않는다. Runtime이 localization,
좌석 접근 자세와 실제 실행을 소유한다.

## 지도 등록과 시설 연결

`apps/backend/maps/slam-20261108/`은 2026-11-08 수동 편집 SLAM 지도다. 원본 PGM과
YAML, 정규화한 `map.yaml`, 픽셀을 보존한 PNG 및 해시·해상도·원점 metadata를 포함한다.
지도는 새 ID로 등록하며 기존 ID를 덮어쓰지 않는다.

```bash
uv run --project apps/backend --extra dev python tools/maps/import_map.py /path/to/map.yaml \
  --map-id new-map-id --label '실측 시설 지도' --kind slam
uv run --project apps/backend python -m control_plane.admin \
  --database /path/to/control-plane.db site-set-map SITE_ID new-map-id
```

시설의 미종료 미션이 있으면 지도 교체를 거절한다. 새 등록 지도에는 기존 fixture의
좌석을 복사하지 않는다. 실제 지도에서 검증한 좌석·접근 자세 등록은 후속 통합 대상이다.
시설 변경 뒤 Dashboard를 새로고침한다.

## API와 좌표

| 경로 | 계약 |
|---|---|
| `GET /api/map?site_id=...` | 로그인 고객의 선택 시설에 연결된 지도 metadata |
| `GET /api/map/image?site_id=...` | 같은 권한 검사 후 PNG 제공 |
| `GET /api/map/presentation?site_id=...` | 같은 시설 권한으로 표시용 SVG 제공; 파생본이 없으면 404 |
| Pose WebSocket | 선택적 `frame_id`, `map_id`; SLAM 표시에는 `map`과 일치하는 지도 ID 필요 |

지도에 연결되지 않은 시설은 404다. `odom`이나 예시 좌표는 SLAM 지도 위에 표시하지
않는다. Runtime은 localization의 `map -> base_link` 좌표를 제공해야 하며 기존 odom relay만
연결한 상태는 지도 위치 검증을 통과한 것으로 보지 않는다. 좌표는 origin의 회전을
역변환하고 resolution으로 나눈 뒤 이미지의 Y축 방향을 뒤집는다.

## 운영 지도 표현

운영 지도는 SLAM 원본과 대조한 `presentation-layout.json`의 주요 구조를 SVG로
표시한다. 바닥과 구조물의 면만 표시하고 SVG 외곽선은 그리지 않는다. SLAM 원본은
22% 불투명도로 겹치며, 이 농도는 Layout의 `reference_opacity`로 조절한다.
벽선 좌표는 좌석 정렬 기준으로 보존한다. 원본의 점유 판단이나
충돌 형상을 대체하지 않으며 세부 장애물은 SLAM 원본 보기에서 확인한다.
실제 확인하지 않은 책상 배치나 방 이름은 추가하지 않는다.

```bash
python3 tools/maps/prepare_presentation.py apps/backend/maps/slam-20261108
```

`presentation-layout-guide.json`은 검토한 구간과 개구부를 보존한다. 각 구간의 법선
방향으로 원본 점유 분포를 읽고 가까운 관측 띠의 중심에 선을 맞춘다. 수평·수직은
강제하지 않으며, 관측이 부족하면 안내선을 유지한다. 작은 고정 구조물은 형태를
찌그러뜨리지 않고 전체 위치와 각도만 보정한다. 보정 후 Layout과 SVG를 재생성한다.

```bash
uv run --with numpy==2.5.4 --with scipy==1.18.1 --with pillow==13.0.0 --with svgpathtools==1.8.0 \
  python tools/maps/fit_structural_layout.py apps/backend/maps/slam-20261108 \
  --report /path/to/run/fit-report.json
python3 tools/maps/prepare_presentation.py apps/backend/maps/slam-20261108
```

8픽셀 탐색 반경은 `--radius`로 지정하며 실행 보고서에 기록한다. 구조 정합을 변경한
후에는 원본 중첩과 확대 화면을 함께 확인한다.

Layout은 원본 PNG 해시에 연결된다. 원본이 달라지면 재검토 없이 다시 생성할 수 없다.
직선화 과정에서 공간 형태를 근사하므로 실제 주행 및 위치 정확도 검증과 구분한다.
`apps/dashboard/tools/review-slam-geometry.mjs`는 원본 위의 윤곽 중첩 이미지와 벽선 샘플을
생성한다. `tools/maps/audit_structural_tracing.py`는 그 샘플과 원본 점유 셀의 거리를
계산한다. 이 수치는 기록된 지도와의 표시 정합이며 실물 정확도를 뜻하지 않는다.

Metadata의 `presentation`은 표시 크기, 원본 PNG 해시, 회전각과 SVG/CSS 순서의
6개 affine 계수를 가진다. Layout의 좌표는 정렬된 표시 좌표이며 SVG 안에서 역변환한다.
프런트엔드는 SVG와 로봇 위치에 동일한 정방향 변환을 적용한다. 이 변환은 회전과
평행이동만 포함하며, 지도 ID, origin, resolution과 주행 파일은 바꾸지 않는다.
API의 기존 지도는 `presentation` 없이도 표시한다.

Dashboard는 기본 운영 지도와 SLAM 원본을 같은 표시 좌표로 전환한다. 로봇 방향에도
같은 회전각을 적용하며, 2 m 축척은 원본 resolution과 화면 확대율로 계산한다.
원본 전환은 영상 표현만 바꾸므로 카메라 위치와 로봇 마커 위치가 변하지 않는다.

## Jetson 호스팅

개발 기준은 Cleany `refactor/docs-and-navigation`, control-plane `main`이다. Backend와
Dashboard는 Jetson에서 제공한다. 주행 Runtime 역시 같은 Jetson에서 실행하되 기존
장치 소유자와 ROS_DOMAIN_ID, 명령·TF 소유자를 확인한 후 연결한다.

`tools/deploy/jetson/`의 user service는 `~/cleany-control-plane/current`에서 Backend를
실행한다. DB와 관찰 자료는 `~/.local/state/cleany-control-plane/`, 설정은
`~/.config/cleany-control-plane/backend.env`에 둔다. release 전환 전 SQLite backup과
미종료 미션을 확인한다. schema가 달라지면 앱만 이전 버전으로 돌리지 않는다.

```bash
python3 tools/deploy/jetson/render.py --lan-ip JETSON_LAN_IP \
  --upstream-dns LAN_DNS_IP --output /path/to/lan
# compose.yaml도 같은 폴더에 복사한 뒤 Jetson에서 실행
cd /path/to/lan
docker compose config
docker compose up -d
```

DNS는 Jetson LAN IP에서만 53/TCP·UDP를 수신하며 DHCP는 제공하지 않는다. 같은 Wi-Fi의
클라이언트 DNS 또는 공유기의 LAN DNS를 Jetson IP로 설정한다. 공유기에서 Jetson 주소를
예약해야 재접속 후 주소 변경을 막을 수 있다. 외부 DNS나 브라우저의 별도 보안 DNS를
쓰는 클라이언트는 로컬 이름을 해석하지 못할 수 있다.

Caddy는 `https://cleany.home.arpa`를 localhost:8080으로 전달한다. 내부 CA의 **공개 root
인증서만** 클라이언트 신뢰 저장소에 등록한다. CA private key는 공유하지 않는다.
`nav.cleany.home.arpa`의 DNS 이름은 예약되어 있으나 주행 서버 프록시는 아직 제공하지
않는다. 주행 UI를 노출할 때 명령 API의 인증과 origin 검사를 먼저 연결한다.

DNS 동작은 [CoreDNS](https://coredns.io/plugins/hosts/), 로컬 이름은
[RFC 8375](https://www.rfc-editor.org/rfc/rfc8375), 내부 HTTPS는
[Caddy TLS](https://caddyserver.com/docs/caddyfile/directives/tls)를 따른다.

## 검증

Backend 지도·권한·pose 테스트, Dashboard 좌표 변환 테스트 및
`tests/e2e/slam-map.spec.ts`가 표시·원본 픽셀·시설 분리 계약을 검사한다. 로봇 실물 위치,
왕복 주행과 책상 정리는 별도 검증이며 지도 이미지 표시만으로 완료 처리하지 않는다.

실제 호스트의 브라우저 검토에는 `apps/dashboard/tools/capture-slam-map.mjs`를 사용한다.
`CLEANY_REVIEW_LOGIN`, `CLEANY_REVIEW_PASSWORD` 환경 변수로 검토 계정을 전달하고
Dashboard 폴더에서 `node tools/capture-slam-map.mjs URL OUTPUT_DIRECTORY SITE_ID`를
실행한다. 로그인 후 운영 지도와 원본, 확대와 전체 맞춤을 확인하고 화면과 제공된 SVG
해시를 저장한다. 테스트 계정은 격리 DB에서만 사용하며 운영 계정을 변경하지 않는다.

## 좌석 배치와 좌표

기존 82석의 ID와 배열을 유지합니다. D-HUB 48석은 SLAM에서 관측한 3행과 3개 책상
묶음에 배치하고, A1–A4와 M1–M3의 34석은 기존 방별 순서를 유지합니다.
`tools/maps/seed_seat_layout.py`가 `maps/slam-20261108/seat-layout.json` 초안을 재현합니다.
이 위치와 책상 치수는 화면 비교로 추정한 값이며 현장 실측이나 접근 성공 기록이 아닙니다.

배경 작업자는 SLAM 원본의 크기, resolution, origin과 presentation transform을 유지합니다.
색상과 외곽선을 바꿔도 좌석은 이동하지 않습니다. 화면 좌표에 저장된 좌석을 배경 크기에
맞춰 다시 늘리지 않습니다. 원본 SLAM을 교체하면 원본 PGM SHA-256 일치 검사에서
배치를 거부하므로 별도의 좌표 재확인이 필요합니다.

| 데이터 | 기준 |
|---|---|
| 좌석 `pose` | 책상 중심의 ROS `map` 미터 좌표, +X 방향은 의자에서 책상을 향하는 방향 |
| `width`, `depth` | 책상의 좌우 폭과 전후 깊이, 미터 |
| `approach` | 별도 로봇 목표 `[x, y, yaw]`, 미터와 라디안 |
| `table_id` | 함께 이동·회전·복제할 책상 묶음 |
| `home` | 현장에서 지정하는 복귀점, 초기값 없음 |
| 원본 연결 | `map_id`, `source_sha256`, `frame_id=map` |
| 저장 | customer/site/map별 SQLite `seat_layouts`, revision별 이력 보존 |

`GET /api/seat-layout`은 배치와 접근점의 장애물·미관측 영역 경고를 반환합니다.
반경 0.4 m 검사는 편집 참고용이며 실제 footprint, costmap, 팔 도달성 검증을 대체하지
않습니다. 초안에서 경고를 허용하되 지도 밖 좌표, 중복 ID와 번호, 비유한 수치는 거부합니다.
`PUT /api/seat-layout`은 로그인·시설 권한·CSRF와 최신 revision을 검사합니다.
대기 또는 진행 중인 미션이 있으면 저장을 거부하며, 편집 저장은 현장 검증 상태를 해제합니다.
원본 점유 지도나 로봇 명령은 수정하지 않습니다. 점유 상태는 데이터 연결 전까지 UNKNOWN입니다.

Dashboard의 **좌석 배치 편집**에서 책상 묶음을 드래그하거나 개별 접근점과 방향을
수정합니다. 복제와 좌석 추가는 새 ID를 만들고, 표시 번호 수정은 기존 ID를 유지합니다.
되돌리기는 최근 30회 편집을 복원하고 변경 취소는 서버의 최신 저장본을 읽습니다.
저장 후 **목표 좌표 내보내기**로 schema 2 JSON 파일을 받습니다. 파일은 YAML 파서로도
읽을 수 있습니다. 초안은 `validation_status=draft`이며 Runtime에서 실행할 수 없습니다.

현장에서 복귀점과 대표 좌석의 주행·정지·정밀 접근을 검증한 뒤 승인한 좌석만 배포 목표에
포함합니다. 좌표 digest는 `target_digest`를 제외한 payload를 키 정렬, compact JSON,
ASCII escaping으로 직렬화한 SHA-256입니다. pose의 세 숫자는 float로 정규화합니다.
Runtime은 파일 해시와 검증 상태를 확인하고 실제 로드한 지도 ID, 원본 해시, revision,
digest를 snapshot으로 보고합니다. Backend는 이 값이 현재 배치와 일치하는 경우만 작업을
허용하며, 대기열에서 로봇으로 전달할 때도 등록 당시 버전과 일치하는지 다시 확인합니다.
기존 schema 1 시뮬레이션 좌석 파일은 SLAM 지도용 버전 일치 증거로 사용하지 않습니다.

실물 주행과 책상 정리 검증은 현장에서 별도로 진행합니다. 자동 테스트의 합성 목표 좌표와
로봇 상태는 물리적 성공 근거가 아닙니다.

### 현장 확인 기록의 반영

현장 작업자는 저장된 배치 revision을 기준으로 검증 기록 JSON을 작성합니다.
`site_id`, `map_id`, `source_sha256`, `revision`, 검증한 `seat_ids` 목록,
`home_verified`, `navigation`, `stopped_pose`, `desk_approach`의 true 값,
`operator`, 시간대가 있는 ISO `checked_at`, 실제 관찰과 원본 자료 경로를 담은 `notes`가
필수입니다. 확인하지 않은 좌석이나 자동 테스트 결과를 현장 기록에 넣지 않습니다.

Backend를 중지하고 DB를 백업한 뒤 다음 명령으로 검증 기록을 반영합니다.

```bash
apps/backend/.venv/bin/python tools/maps/verify_seat_layout.py \
  --database /path/to/control-plane.db --site SITE_ID --evidence /path/to/field-review.json
```

도구는 지도·revision 일치, 복귀점과 미종료 미션을 확인하고 새 revision에 기록과 해시를
보존합니다. 로봇 명령을 보내지 않습니다. Backend를 다시 시작한 뒤 목표 파일을 내보내고,
기존 Runtime 실행 절차의 `targets_file`에 그 파일을 지정합니다. snapshot의 버전 확인과
현장 실행 검증은 서로 다른 단계입니다. 편집 저장은 이 승인 상태를 다시 해제합니다.

### 기존 화면의 책상 비율 유지

기존 화면과 SLAM 배치는 `apps/dashboard/src/features/facility-map/seat-geometry.json`의
치수를 공유합니다. D-HUB는 1.2 × 0.77 m, 방 안 책상은 기존 도면의 38 × 28 단위에
0.85 배율과 `400 / 12.26` 단위/m를 적용합니다. 이는 기존 화면의 기준 치수이며 현장
실측 확정값은 아닙니다. SLAM의 resolution과 origin은 변경하지 않습니다.

D-HUB 좌우 가장자리의 3열 책상 묶음은 구조 도면의 `main-west`, `north-east` 벽선에
외곽 변이 맞닿도록 배치합니다. 벽선의 작은 기울기는 책상 묶음을 강체 회전하여 따르며,
책상 폭과 깊이, 묶음 내 좌석 간격은 바꾸지 않습니다.

초기 배치 오류를 정정할 때 `tools/maps/replace_seat_seed.py`는 저장된 배치가 이전 초안과
일치하는 경우에만 새 revision을 추가합니다. 사용자 수정이 있으면 교체를 거부합니다.
이전 revision과 원본 지도는 보존합니다. `tests/e2e/seat-scale.spec.ts`는 이전 화면과 새
화면에서 책상 치수를 직접 비교하고 동일한 40 pixel/m 화면을 생성합니다.

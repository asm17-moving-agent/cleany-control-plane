# 발표용 보관함 노출 모델

본체 상하부의 외장 벽과 외장에 붙는 도어·손잡이·통풍구·센서 개구부·로고를 숨겨
원본 프레임과 내부 쓰레기 보관함이 드러나게 했다. 상판과 투입구, 팔·카메라 지지대,
바퀴 및 커플러는 유지한다. `createRobotExterior(..., { exposedBin: true })`로 재현한다.
기존 외장 보기는 기본 옵션으로 유지한다.

- `cleany-exposed-bin-transparent.png`: 2400×2400, 투명 배경, 발표 슬라이드용
- `cleany-exposed-bin-white.png`: 2400×2400, 흰 배경
- `preview-niri.png`: 실제 Firefox 미리보기 창을 niri로 캡처한 확인 기록

PNG는 Firefox의 Three.js 장면을 지정 해상도로 다시 렌더링해 직접 저장했다.
생성형 이미지나 스크린샷 확대를 사용하지 않았다. 투명본의 알파 채널과 흰 배경본의
불투명 상태를 확인했고, 두 PNG를 직접 열어 확인했다.

재실행: `pnpm --filter @cleany/dashboard dev --port 5173 --strictPort` 실행 후
`http://127.0.0.1:5173/robot-presentation.html`에서 원하는 방향으로 회전하고 PNG 저장.
이 HTML은 개발용 도구이며 기본 대시보드 빌드의 진입점에는 추가하지 않는다.

검증: 관련 기존 테스트 7개, 앱 typecheck, 발표용 스크립트의 별도 TypeScript 검사,
contracts:check, git diff --check 통과. 원본 CAD·GLB는 변경하지 않았다.

## 하부 전장 장치 배치 시안

`RobotElectronics.ts`에서 Three.js 도형으로 배터리와 고정 스트랩, LiDAR와 브래킷,
방열판이 달린 모터 드라이버 2개, ESP32 형태의 개발 보드, 전원 보드·퓨즈 및
전원·모터·신호 배선을 추가했다. 기존 GLB의 단순 배터리 표현은 발표 장면에서 숨긴다.
부품 형상·크기·장착 위치·배선은 발표용 예시이며 실제 BOM이나 검증된 회로도가 아니다.

- `cleany-electronics-full-white.png`: 전체 모습, 흰 배경
- `cleany-electronics-full-transparent.png`: 전체 모습, 투명 배경
- `cleany-electronics-detail-white.png`: 하부 장치 확대, 흰 배경
- `cleany-electronics-detail-transparent.png`: 하부 장치 확대, 투명 배경
- `electronics-detail-niri.png`: Firefox 하부 확대 화면의 niri 캡처

모든 전장 시안 PNG는 2400×2400이다. 개발용 페이지의 전체 보기/하부 확대 버튼으로
전환해 저장할 수 있다. Firefox 렌더링과 출력 PNG를 직접 확인했고, 투명본의 알파와
흰 배경본의 불투명 상태를 확인했다. 추가 후 앱 및 도구 TypeScript 검사,
contracts:check와 git diff --check를 통과했다.

## 상부 플라스틱 / 하부 아크릴 시안

현재 개발용 페이지는 `transparentLowerBody: true, exposedMast: true` 옵션을 사용한다.
상부 플라스틱 외장과 cleany 로고를 복원하고 하부에는 3 mm 두께를 가정한 투명
아크릴 패널, 절단면과 측면 고정 나사를 추가했다. 전면에는 LiDAR와 브래킷을 위한
상단 홈이 있다. 카메라 마스트의 추가 외장을 숨겨 원본 CAD 마운트를 노출했다.
아크릴 재질은 발표 가독성을 위한 투명도 표현이며 광학 시뮬레이션이 아니다.

- `cleany-acrylic-full-{white,transparent}.png`: 전체 모습, 2400×2400
- `cleany-acrylic-detail-{white,transparent}.png`: 하부 확대, 2400×2400
- `acrylic-full-niri.png`: Firefox 전체 보기 캡처

Firefox/niri 및 PNG 육안 확인, 앱·발표 도구 TypeScript 검사 완료.
기본 대시보드의 외장 옵션과 기존 PNG는 유지한다.

### 아크릴 v2

`cleany-acrylic-v2-{full,detail}-{white,transparent}.png`는 아크릴 불투명도를
0.13에서 0.25로 높이고 표면 거칠기를 0.32로 조정한 후속 시안이다. 상부 외장과
같은 폭 458 mm, 깊이 548 mm, 모서리 반경 35 mm로 하부 윤곽을 맞췄다.
PNG 직접 확인, Firefox/niri 캡처 및 앱 TypeScript 검사를 수행했다.

## KB 대조 후 메카넘휠 및 전장 수정

기준: `docs/cleany-docs/20_TECHNICAL/12 - Hardware Configuration.md`의 4·5·8절과
`30_DECISIONS/Technical/260714 - 4륜 메카넘 베이스.md`를 읽었다.

| 항목 | 확인된 기준 | 이번 표현과 한계 |
| --- | --- | --- |
| 휠 | 127 mm, Option 4 / Size Option A | 직경 127 mm 유지. 12개 롤러와 45도 축 방향 및 좌우 배치는 기존 e718ac57 GLB/MJCF를 따른다. 금속 측판 구멍·허브·볼트는 발표용 가공 시안이며 공급사 도면이 아니다. |
| 구동 모터 | PG42-4266-1270NE, 12 V, 1/61, 4개 | 기존 모터 CAD를 유지. 형상/실제 치수의 부품별 일치는 검증하지 않았다. |
| 드라이버 | Cytron MDD20A 2개 | 임의의 대형 방열판을 제거하고 MOSFET·단자·테스트 버튼으로 표현. PCB 배치와 치수는 단순화한 시안이다. |
| LiDAR | SLAMTEC RPLIDAR A1M8-R6 | A1의 96.8 × 70.3 × 55 mm 외곽 크기, 검은 회전부와 편심 구동 모터 형태 반영. 내부 구조와 브래킷은 시안이다. |
| 배터리·MCU | 3S 배터리 상세 미확정, Decision의 MCU 모델 미확정 | 이전 요청의 배터리·ESP32는 예시로 유지. KB에서 확정된 실장 사양으로 취급하지 않는다. |

제조사 참고:
- [Cytron MDD20A](https://sg.cytron.io/p-20amp-6v-30v-dc-motor-driver-2-channels): 방열판 없는 discrete NMOS H-bridge, 테스트 버튼과 단자 기능.
- [SLAMTEC A1 사양](https://web-stage.eng.slamtec.com/en/Lidar/A1Spec): 외곽 치수.

`cleany-kb-hardware-{full,detail,wheel}-{white,transparent}.png` 6장은 2400×2400이다.
원본 GLB의 휠을 발표 장면에서만 숨기고 `RobotMecanumWheels.ts`의 상세 형상을 사용한다.
상부 플라스틱·로고, 하부 반투명 아크릴, 노출 카메라 마운트는 유지한다.
앱·발표 도구 TypeScript 검사, 관련 기존 테스트 7개 및 PNG/Firefox 육안 확인 완료.

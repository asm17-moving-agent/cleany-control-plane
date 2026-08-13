# ADR 0004: Semantic facility map and Mission target

## Status

Accepted

## Context

초기 prototype은 좌석 ID만 Mission 대상으로 사용했다. 시설 청소 관제 시나리오는
좌석 외에도 공간 구역과 특정 지점을 안정적인 ID로 참조해야 한다. 제공받은 18층
비상안내도 사진은 운영 참고 자료이지만 Robot 좌표계나 정밀 CAD 원본은 아니다.

## Decision

- Dashboard 도면은 원본 사진에서 시설 부분을 원근 보정·정제한 PNG로 보존한다.
- 선택 영역은 PNG와 같은 좌표계의 semantic SVG polygon으로 분리하고 Robot marker와
  상태 UI는 HTML overlay로 표현한다.
- 지도 feature가 화면 좌표, 구역 ID와 표시 label을 소유한다.
- Mission은 `kind`, `reference_id`, 선택적 `label`로 구성된 `target`을 사용한다.
- target 종류는 현재 `SEAT`, `ZONE`, `POINT`로 제한한다.
- 기존 `seat_id` 요청은 마이그레이션 호환용으로만 유지한다.

## Consequences

원본 시설 구조를 수작업으로 재해석하지 않으면서 구역을 키보드와 포인터로 선택할
수 있다. 배경은 raster asset이므로 원본 해상도 이상으로 확대하면 선명도가 제한된다.
또한 overlay 화면 좌표는 Robot map 좌표가 아니므로 Robot Edge 연동 전 map revision과
좌표 변환 계약을 별도로 정의해야 한다.

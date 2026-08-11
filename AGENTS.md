# AGENTS.md

이 저장소는 Cleany Dashboard와 Backend, Backend–Robot 관제 계약을 관리하는
control-plane monorepo다.

## 경계

- 제품 범위와 큰 책임 경계는 `docs/cleany-docs/` submodule의 KB를 따른다.
- KB가 비어 있으면 `git submodule update --init --recursive docs/cleany-docs`로
  초기화한다. 명시적인 KB 수정 요청이 있을 때만 submodule 내부를 편집한다.
- ROS 2 node, Robot Mission Manager와 Sim/Real backend는 `cleany` 저장소에 둔다.
- 이 저장소는 Dashboard, Mission Queue, Robot 연결, 외부 lifecycle과 결과 참조를
  소유한다.
- Backend는 Robot 내부 FSM을 직접 변경하지 않는다.

## 문서와 계약

- machine-readable contract는 `packages/contracts/`를 Source of Truth로 사용한다.
- 기술 선택의 배경과 결과는 `docs/adr/`에 남긴다.
- 전체 구조는 `docs/architecture/`, 실행과 검증 방법은 각 app의 `README.md`에 남긴다.
- 구현이 contract를 바꾸면 schema, example, 관련 테스트를 같이 갱신한다.

## 구현 원칙

- 외부 Mission phase와 Robot 내부 state를 구분한다.
- terminal outcome은 불변으로 다루고 `mission_id`, `event_id`로 중복 실행을 막는다.
- 단일 Robot MVP에서 하나의 활성 Mission만 허용한다.
- 취소, safe stop, e-stop을 서로 다른 경로로 취급한다.
- 시간, timeout, heartbeat과 보관 기간은 코드에 숨기지 않고 설정으로 관리한다.
- 변경 후 가장 작은 단위 테스트와 contract 검사부터 실행한다.

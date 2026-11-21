"""Dashboard intent vocabulary and unambiguous read-only or reviewable requests."""

import re

INSIGHT_LABELS = {
    "outcome_mix": "종료된 작업의 결과 비율과 분포",
    "request_hours": "요청이 몰린 시간대별 접수 건수",
    "elapsed_spread": "접수부터 종료까지 소요 시간 분포와 중앙값",
    "failure_reasons": "실패한 작업의 사유 코드별 빈도",
    "zone_coverage": "구역별 고유 완료 좌석 수와 좌석 대비 완료율",
    "repeat_seats": "기간에 두 번 이상 성공한 좌석과 횟수",
    "photo_pairs": "종료 작업의 전후 사진 기록 완비 여부 집계",
    "run_sources": "종료 작업의 실물, 모의, 시뮬레이션과 혼합 실행 비중",
    "review_progress": "검토 대상 종료 작업 중 관리자 확인이 끝난 비율",
    "queue_age": "현재 대기 요청이 접수 후 기다린 시간 분포",
}

VIEW_LABELS = {
    **INSIGHT_LABELS,
    "robot_health": "로봇의 연결, 배터리, 안전 상태를 모은 요약",
    "head_camera": "현재 헤드캠 화면 열기. 모델은 영상을 판독하지 않는다",
    "desk_photos": "한 작업의 정리 전후 사진",
    "work_queue": "배정 대기 작업 목록과 우선순위",
    "review_inbox": "사람이 검토해야 할 종료 작업 목록",
    "battery_chart": "시간별 배터리 변화와 충전 그래프",
    "event_timeline": "정지, 장애와 복구의 시간 순서",
    "robot_position": "시설 지도 위 로봇과 선택 좌석 위치",
    "seat_coverage": "좌석별 정리 완료 이력 지도, 중복 방문 제외",
    "seat_picker": "작업 가능 좌석을 골라 미승인 초안 준비",
}

# Common display requests are read-only. Ambiguous wording still goes to the classifier.
_PATTERNS = {
    "photo_pairs": (
        r"(?:사진|관측 자료).{0,28}(?:모두|양쪽|둘 다|완비|누락|빠진)"
        r".{0,20}(?:몇|건|비율|현황|작업)"
    ),
    "review_progress": r"검토.{0,18}(?:진행도|진행률|진척|얼마나.{0,5}진행|완료율)",
    "queue_age": (
        r"대기\s*시간\s*분포|(?:배정|요청|대기)"
        r".{0,28}(?:몇 분|\d+분|오래).{0,12}(?:기다|대기)"
    ),
    "zone_coverage": r"구역별.{0,22}(?:완료율|몇\s*석|정리율|완료 좌석)",
    "repeat_seats": (
        r"(?:두\s*번\s*이상|반복|중복)"
        r".{0,10}(?:정리|완료|방문).{0,10}(?:좌석|자리|책상)"
    ),
    "run_sources": r"(?:실물|모의|시뮬레이션|실행\s*출처).{0,23}(?:비중|분포|비율)",
    "failure_reasons": r"실패.{0,8}(?:코드|사유|원인).{0,20}(?:자주|분포|순위|빈도|많)",
    "request_hours": (
        r"요청.{0,15}(?:몰린|몰리"
        r"|시간대별|집중).{0,12}(?:시간|언제|건수|분포)|시간대별.{0,10}(?:요청|접수)"
    ),
    "elapsed_spread": (
        r"접수.{0,8}종료까지.{0,15}(?:얼마나|시간|분포)"
        r"|(?:작업|처리)\s*소요\s*시간.{0,10}(?:분포|중앙값)"
    ),
    "outcome_mix": r"(?:종료|작업|미션).{0,18}결과.{0,7}(?:분포|비율|비중)",
    "desk_photos": (
        r"(?:전후|전.{0,14}(?:후|뒤)|정리.{0,8}사진|작업.{0,8}사진).{0,20}(?:사진|비교|보여)"
        r"|(?:사진|이미지).{0,20}(?:전후|정리 전)"
    ),
    "head_camera": r"헤드\s*캠|카메라.{0,16}(?:켜|열|보여|보고|화면|영상)",
    "robot_position": (
        r"(?:클리니|끌리니|로봇).{0,18}(?:어디|위치|좌표)"
        r"|(?:로봇|클리니).{0,22}지도.{0,10}(?:표시|보여)"
    ),
    "work_queue": (
        r"대기열|밀린\s*(?:작업|요청)|(?:배정|처리)\s*대기\s*(?:작업|목록)"
        r"|대기\s*중인\s*(?:작업|요청)"
    ),
    "review_inbox": (
        r"검토함|미검토|(?:사람|관리자|내가).{0,15}(?:확인|검토)해야"
        r"|검토.{0,6}(?:필요한|대기|목록)|확인\s*필요한\s*작업"
    ),
    "seat_coverage": (
        r"(?:좌석별|자리별).{0,18}(?:완료|이력)|(?:\d+석|좌석).{0,24}어디까지.{0,12}완료"
        r"|(?:완료|정리한)\s*(?:된\s*)?(?:좌석|자리).{0,14}지도"
    ),
    "seat_picker": (
        r"(?:정리|청소|작업).{0,8}(?:할\s*수\s*있는|가능한?|지원).{0,6}(?:자리|좌석)"
        r"|(?:좌석|자리)\s*선택기"
    ),
    "battery_chart": (r"배터리.{0,32}(?:그래프|차트|추이|얼마나\s*(?:떨어|줄)|충전했)|충전\s*이력"),
    "event_timeline": r"타임라인|장애.{0,16}복구|멈췄.{0,32}복구|정지.{0,20}복구",
    "robot_health": (
        r"(?:연결|접속).{0,36}(?:배터리|안전)|(?:로봇|클리니).{0,12}상태\s*(?:요약|한눈)"
        r"|배터리.{0,12}안전\s*상태"
    ),
}


def explicit_view(question):
    if re.search(
        r"말고|말아|하지\s*마|승인.{0,8}(?:없이|생략)|다른\s*(?:시설|지점)|\d+\s*층", question
    ):
        return None
    return next((name for name, pattern in _PATTERNS.items() if re.search(pattern, question)), None)


LABELS = {
    **VIEW_LABELS,
    "mission_history": (
        "작업 통계, 완료·실패·취소 건수, 실물/모의 실행 여부. "
        "좌석 필터나 특정 날짜가 있어도 이 분류."
    ),
    "compare_history": "두 날짜나 두 기간의 작업 건수 비교, 전날 대비 증감.",
    "get_mission": "운영자가 열어 둔 개별 작업 한 건의 진행 단계, 실패 이유, 관리자 확인.",
    "robot_overview": "현재 로봇 상태, 현재 또는 마지막 배터리 잔량.",
    "battery_history": "과거에 측정된 배터리 범위·최저·최고·변화.",
    "robot_analytics": "로봇 자체의 장애, 정지, 복구, 가동 기록.",
    "list_seats": "좌석 목록, 좌석 수나 번호, 지도에서 선택된 좌석 확인.",
    "draft_seat_plan": (
        "지금 정리해 달라는 요청. 화면에서 고른 자리나 번호로 지정한 자리의 정리 초안."
    ),
    "revise_draft": "아직 승인하지 않은 좌석 정리 초안의 대상 또는 우선순위 수정.",
    "unsupported_time": "지금이 아니라 나중이나 지정 시각에 작업을 요청하는 예약.",
    "no_action": "작업을 하지 말거나 보류하라는 말. 조회도 요청했다면 조회 의도로 분류.",
    "safety": "모터 직접 조종, 안전 설정 변경이나 승인 생략 요구.",
    "guide_plan": "지도에서 청소를 요청하고 승인하는 방법을 묻는 사용법 질문.",
    "guide_cancel": "기존 미션을 채팅으로 취소하거나 중단할 수 있는지 또는 취소 방법.",
    "guide_camera": "현재 영상·사진을 보고 무엇이 있는지 또는 카메라 화면을 묻는 질문.",
    "guide_pose": "로봇이 지도 어디에 있는지, 위치 좌표나 방향을 묻는 질문.",
    "clarify": "대상이나 의도가 불명확하거나 지원하는 분류가 없음.",
}
PROMPT = (
    "You route Korean operator requests in a robot dashboard. Classify the requested outcome, "
    "not words mentioned in passing. Return exactly ONE key from this list, with no punctuation.\n"
    + "\n".join(f"{key}: {description}" for key, description in LABELS.items())
    + "\nExamples (request → key):\n"
    "지도에 표시한 자리 처리 부탁해 → draft_seat_plan\n"
    "일정을 잡지 말고 지난 금요일 작업 수만 보고 싶어 → mission_history\n"
    "작업 실패가 몇 번 있었지? → mission_history\n"
    "열어 둔 건의 오류 이유를 설명해 → get_mission\n"
    "지난 목요일과 금요일 실적 차이는? → compare_history\n"
    "금주 배터리 변화 폭을 볼래 → battery_history\n"
    "정리하지 말아줘 → no_action\n"
    "초안에서 한 자리를 빼고 싶어 → revise_draft\n"
    "새 좌석 정리를 긴급으로 요청하면 draft_seat_plan. "
    "우선순위를 지정해도 기존 초안 수정은 아니다.\n"
    "무엇을 요청하는 방법/절차는 guide_plan, 이미 등록된 작업 중단은 guide_cancel.\n"
    "선택 상태와 직전 조회 종류는 참고 정보다. 질문에 대답하거나 명령을 실행하지 마."
)


def decode_label(value):
    if not isinstance(value, str) or value.strip() not in LABELS:
        raise ValueError("invalid classifier output")
    return value.strip()


# Whole utterances only. Mixed, negated or timed commands need the normal classifier.
SELECTED_CLEANUP = re.compile(
    r"(?:여기|이곳|이|선택한|선택된)\s*(?:(?:두|한)\s*)?(?:좌석|자리)?"
    r"\s*(?:을|를)?\s*(?:정리|청소)\s*(?:해\s*(?:줘|주세요|주십시오)|부탁해요)"
)
FAILURE_HISTORY = re.compile(
    r"(?:오늘|금일|어제|그제|이번\s*주|지난\s*주)(?:에|의)?\s*"
    r"실패한\s*(?:작업|미션)(?:이|은|들|들이)?\s*"
    r"(?:있(?:어|나요|었어|었나요)|몇\s*건(?:이야|인가요))"
)


# A present-status lookup has one scoped tool and needs no GPU. Match entire
# utterances so a history, diagnosis, conditional or second action cannot be swallowed.
_NOW = r"(?:(?:지금|현재|지금\s*시점|지금\s*기준)(?:은|의|도)?\s*)?"
_ROBOT = r"(?:(?:이\s*)?(?:로봇|끌리니|클리니|cleany(?:-01)?)(?:의|은|는|이|가)?\s*)?"
_OBJECT = r"(?:배터리(?:\s*(?:잔량|상태|충전량))?|충전량|로봇\s*상태|상태)"
_END = (
    r"(?:알려\s*(?:줘|줄래|주세요|주실래요)|보여\s*(?:줘|주세요)|확인(?:해\s*(?:줘|주세요))?|"
    r"궁금(?:해|해요|합니다)|어때(?:요)?|어떻게\s*(?:돼|되나요)|"
    r"(?:지금\s*)?(?:몇|얼마)(?:\s*(?:퍼센트|프로|%))?\s*(?:나|정도)?\s*(?:남았)?"
    r"(?:어|어요|야|예요|인가요|지|니|나요)?|좀)?"
)
CURRENT_STATUS = re.compile(
    rf"{_NOW}{_ROBOT}{_NOW}{_OBJECT}(?:은|는|이|가|을|를)?\s*"
    rf"(?:좀\s*)?{_END}",
    re.IGNORECASE,
)


def explicit_intent(question):
    """Route unambiguous operator requests before loading the GPU engine."""
    text = question.strip().rstrip(".!").strip()
    view = explicit_view(text)
    if view:
        return view
    if CURRENT_STATUS.fullmatch(text.rstrip("?").strip()):
        return "robot_overview"
    if SELECTED_CLEANUP.fullmatch(text):
        return "draft_seat_plan"
    if FAILURE_HISTORY.fullmatch(text.rstrip("?").strip()):
        return "mission_history"
    return None

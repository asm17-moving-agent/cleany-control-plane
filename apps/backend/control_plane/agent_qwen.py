"""Ground local intent labels in scoped backend tool results and reviewed map selections."""

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from control_plane import agent_qwen_scope as scope
from control_plane.agent_intents import INSIGHT_LABELS, LABELS, VIEW_LABELS
from control_plane.agent_tools import KST

INTENTS = set(LABELS)


def is_date_followup(question):
    return bool(
        re.fullmatch(
            r"(?:그럼|그러면|그렇다면)?\s*(?:어제|전날|전일|오늘|금일|그제|지난\s*주|이번\s*주|"
            r"\d{4}-\d{2}-\d{2})(?:는|은|도)?(?:\s*(?:어땠(?:어|는데)|어때|알려줘))?[?.! ]*",
            question.strip(),
        )
    )


CLARIFY = "어느 구역의 어느 좌석인지 알려주시거나 지도에서 대상 좌석을 선택해 주세요."
DIRTY = "좌석의 청소 상태는 수집하지 않습니다. 정리할 좌석을 지도에서 선택해 주세요."
SCHEDULE = "예약 정리는 지원하지 않습니다. 원하시는 시간에 다시 정리를 요청해 주세요."
SAFETY = (
    "직접 이동, 안전 설정 변경, 승인 생략은 지원하지 않습니다. 정리 초안은 관리자가 검토합니다."
)
SUBTASK = "현재 좌석 전체 정리만 지원합니다. 전체 정리를 원하시면 대상 좌석을 선택해 주세요."
PERIOD = "조회할 날짜나 기간을 YYYY-MM-DD 형식으로 알려주세요. 최대 31일까지 조회할 수 있습니다."


# UI routes are the human-operated alternatives to actions the chat tools cannot perform.
GUIDES = {
    "guide_plan": (
        "지도에서 정리할 좌석을 선택한 뒤 AI에 ‘선택한 자리 정리해 줘’라고 요청하세요. "
        "초안 카드에서 좌석과 우선순위를 검토하고 ‘승인·요청’을 누르면 작업이 등록됩니다."
    ),
    "guide_cancel": (
        "채팅에서 등록된 작업을 취소할 수 없습니다. 작업 탭에서 해당 작업의 상세를 열고 "
        "‘작업 취소 요청’을 누르세요. 요청 후 실제 종료 상태를 확인하세요."
    ),
}


@dataclass
class Call:
    name: str
    args: dict = field(default_factory=dict)
    step: str = ""

    def output(self):
        return {
            "type": "function_call",
            "name": self.name,
            "call_id": self.step or self.name,
            "arguments": json.dumps(self.args, ensure_ascii=False),
        }


def date_args(question, context):
    question = question.replace("전날", "어제").replace("전일", "어제")
    today = datetime.fromisoformat(context["now"]).astimezone(KST).date()
    iso = re.findall(r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)", question)
    if re.search(r"내일|모레|다음|주말|오전|오후|\d+\s*시|분기|작년|올해", question):
        raise ValueError(PERIOD)
    if iso:
        if len(iso) > 2 or re.search(r"오늘|어제|그제|금일|일주일|지난|이번", question):
            raise ValueError(PERIOD)
        start, end = date.fromisoformat(iso[0]), date.fromisoformat(iso[-1])
    elif re.search(r"이번\s*주|지난\s*주", question):
        monday = today - timedelta(days=today.weekday())
        start, end = (
            (monday - timedelta(days=7), monday - timedelta(days=1))
            if "지난" in question
            else (monday, today)
        )
    elif re.search(r"일주일|1\s*주일|최근\s*\d+\s*일", question):
        match = re.search(r"최근\s*(\d+)\s*일", question)
        days = int(match[1]) if match else 7
        if not 1 <= days <= 31:
            raise ValueError(PERIOD)
        start, end = today - timedelta(days=days - 1), today
    elif "어제" in question or "그제" in question:
        if "오늘" in question or "금일" in question or ("어제" in question and "그제" in question):
            raise ValueError(PERIOD)
        start = end = today - timedelta(days=2 if "그제" in question else 1)
    elif re.search(r"지난|저번|전날|개월|달|월|주간|최근|\d+\s*일", question):
        raise ValueError(PERIOD)
    else:
        day = context.get("day")
        start = end = (
            date.fromisoformat(day) if day and not re.search(r"오늘|금일", question) else today
        )
    if start > end or end > today or (end - start).days >= 31:
        raise ValueError(PERIOD)
    return {"start_day": start.isoformat(), "end_day": end.isoformat()}


def comparison_days(question, context):
    """Resolve two distinct, named days inside the supported reporting window."""
    today = datetime.fromisoformat(context["now"]).astimezone(KST).date()
    days = {date.fromisoformat(s) for s in re.findall(r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)", question)}
    for pattern, offset in ((r"오늘|금일|당일", 0), (r"어제|전날|전일", 1), (r"그제|그저께", 2)):
        if re.search(pattern, question):
            days.add(today - timedelta(days=offset))
    if len(days) != 2 or max(days) > today or (max(days) - min(days)).days >= 31:
        raise ValueError(PERIOD)
    return [d.isoformat() for d in sorted(days)]


def history_call(question, context, seat_id, compare, weekly=False):
    try:
        if compare:
            first, _ = comparison_days(question, context)
            return Call(
                "mission_history",
                {"start_day": first, "end_day": first, "seat_id": seat_id},
                "compare_first",
            )
        dates = date_args(question, context)
    except ValueError:
        return PERIOD
    return Call(
        "mission_history", {**dates, "seat_id": seat_id}, "summary_history" if weekly else ""
    )


SELECTED_TARGET = r"(?:여기|이곳|선택한|선택된|이)\s*(?P<count>두|한)?\s*(?:좌석|자리)?"
NUMBERED_TARGET = (
    r"(?:(?P<zone>[A-Za-z][A-Za-z0-9 -]*)\s+)?"
    r"(?P<numbers>\d{1,3}\s*번?(?:\s*(?:과|와|하고|및|,)\s*\d{1,3}\s*번?)*)"
)
CLEANUP_REQUEST = re.compile(
    rf"(?:(?P<selected>{SELECTED_TARGET})|{NUMBERED_TARGET}\s*(?:좌석|자리)?)"
    r"\s*(?:을|를)?\s*(?P<high>(?:높은\s*우선순위로|긴급(?:으로)?|우선적으로)\s*)?"
    r"(?:정리|청소)\s*(?:작업\s*)?(?:요청\s*)?(?:해\s*(?:줘|주세요|주십시오)|부탁해요?|해요|요청)"
)


def draft_targets(question, context, rows):
    """Only an explicit seat expression or a deictic map selection can become a draft."""
    action = CLEANUP_REQUEST.fullmatch(question.strip().rstrip(".!").strip())
    if not action:
        return CLARIFY
    if action["selected"]:
        ids = context.get("seat_ids", [])
        count = {"두": 2, "한": 1}.get(action["count"])
        if not ids or (count is not None and len(ids) != count):
            return CLARIFY
    else:
        # Resolve display numbers against the actual site inventory, including repeated room labels.
        zone = (action["zone"] or "").strip().lower().replace(" ", "-")
        ids = []
        for num in re.findall(r"\d+", action["numbers"]):
            matches = [
                s
                for s in rows
                if (not zone or zone == s["zone_id"].lower())
                and re.search(r"(?:^|-)0*" + str(int(num)) + "$", s["label"])
            ]
            if len(matches) != 1 or matches[0]["seat_id"] in ids:
                return CLARIFY
            ids.append(matches[0]["seat_id"])
    return Call(
        "draft_seat_plan",
        {
            "seat_ids": ids,
            "robot_id": context.get("robot_id"),
            "priority": "HIGH" if action["high"] else "NORMAL",
            "title": "좌석 정리",
            "reason": "관리자가 요청한 좌석 전체 정리",
        },
    )


def view_action(view, question, context):
    dates = {"start_day": None, "end_day": None}
    if view in INSIGHT_LABELS or view in {
        "desk_photos",
        "review_inbox",
        "battery_chart",
        "event_timeline",
        "seat_coverage",
    }:
        try:
            dates = date_args(re.sub(r"오전|오후", "", question), context)
        except ValueError:
            return PERIOD
    return Call("show_operations_view", {"view": view, **dates})


def first_action(intent, question, context):
    if (
        re.search(
            r"(?:안전|비상)\s*정지.*(?:풀|해제)|승인.{0,8}(?:없이|생략|건너)|(?:앞으로|뒤로).{0,8}(?:이동|움직)",
            question,
        )
        or intent == "safety"
    ):
        return SAFETY
    if re.search(
        r"(?:안\s*(?:치운|치워진)|(?:정리|청소)(?:가)?\s*(?:되지\s*않|안\s*[된돼되])|더러운|지저분한)",
        question,
    ):
        return DIRTY
    if re.search(r"(?:쓰레기|의자)만", question):
        return SUBTASK
    cleanup_request = CLEANUP_REQUEST.fullmatch(question.strip().rstrip(".!").strip())
    if (intent == "unsupported_time" and not cleanup_request) or (
        re.search(r"예약|내일|모레|\d+\s*시|다음\s*주", question)
        and re.search(r"청소|정리|예약", question)
    ):
        return SCHEDULE
    if re.search(r"다른\s*시설|다른\s*지점|\d+\s*층", question):
        return "대시보드에서 대상 시설을 선택한 뒤 다시 요청해 주세요."
    if intent in {"mission_history", "get_mission", "robot_analytics", "robot_overview", "clarify"}:
        # A fact about one incident must come from its record; facility counts cannot explain it.
        incident = re.search(
            r"(?:선택된|선택한|해당|열어\s*둔|열려\s*있는|열린|이|그)\s*(?:작업|미션|건)", question
        )
        diagnosis = re.search(r"왜|원인|때문|탓|이유|근거|맞아|확인|기록", question)
        aggregate = re.search(r"몇\s*(?:건|번)|건수|횟수|전체|통계|추이|비교|증감", question)
        if incident and diagnosis and not aggregate:
            intent = "get_mission"
    view = {"guide_camera": "head_camera", "guide_pose": "robot_position"}.get(intent, intent)
    if view in VIEW_LABELS:
        return view_action(view, question, context)
    if (
        scope.has_seat_scope(question)
        and re.search(
            r"늦|지연|안\s*와|안\s*오|어디까지|진행\s*(?:상태|상황|단계)|배정됐", question
        )
        and not re.search(r"몇\s*건|건수|통계|비교", question)
    ):
        return Call("list_seats", step="status_seat")
    if intent in GUIDES:
        return GUIDES[intent]
    if intent == "no_action":
        return "정리 요청은 생성하지 않았습니다."
    if intent == "revise_draft" and cleanup_request:
        # Specifying a priority on a complete new cleanup request is not an edit.
        intent = "draft_seat_plan"
    if intent == "revise_draft":
        if context.get("page") == "/map/edit":
            return "배치 편집을 마친 뒤 지도에서 작업을 요청해 주세요."
        items = context.get("draft_items", [])
        if not items:
            return "현재 대화에 수정할 미승인 정리 초안이 없습니다."
        args = scope.revise_items(question, items)
        return (
            Call("draft_seat_plan", args)
            if args
            else "기존 계획 카드에서 남길 좌석과 우선순위를 확인해 주세요."
        )
    weekly = "운영 현황" in question or "운영 요약" in question
    if weekly and intent in {"mission_history", "robot_analytics", "robot_overview"}:
        intent = "mission_history"
    if intent == "robot_overview" and re.search(r"정지 원인|멈춘|복구 여부|장애 이력", question):
        intent = "robot_analytics"
    if intent == "draft_seat_plan" or (
        intent in {"list_seats", "clarify", "unsupported_time"} and cleanup_request
    ):
        if not cleanup_request:
            return CLARIFY
        if context.get("page") == "/map/edit":
            return "배치 편집을 마친 뒤 지도에서 작업을 요청해 주세요."
        # Match explicit numbers against all seats even if a different seat is selected on the map.
        return Call("list_seats", step="draft_targets")
    if intent == "get_mission":
        key = context.get("mission_id")
        return Call(intent, {"mission_id": key}) if key else "조회할 작업을 선택해 주세요."
    if intent in ("mission_history", "compare_history"):
        compare = intent == "compare_history"
        if "followup_scope" in context:
            seats = context["followup_scope"]
            if seats and not context.get("selected_seats"):
                return Call("list_seats", {"seat_ids": seats}, "followup_seat")
            return history_call(question, context, seats[0] if seats else None, compare)
        if scope.has_seat_scope(question):
            return Call("list_seats", step="scope_compare" if compare else "scope_history")
        return history_call(question, context, None, compare, weekly)
    if intent in ("robot_analytics", "battery_history"):
        try:
            date_args(question, context)
        except ValueError:
            return PERIOD
        return Call(
            "robot_overview",
            step="battery_robot" if intent == "battery_history" else "analytics_robot",
        )
    if intent == "list_seats":
        return Call("list_seats")
    if intent == "robot_overview":
        return Call("robot_overview")
    return "조회할 로봇이나 작업을 선택하거나, 정리할 좌석을 지정해 주세요."


def robot_text(robot):
    battery = robot["observations"].get("battery")
    info = f"{robot['robot_id']}의 기록된 상태는 {robot['state']}입니다."
    if not battery or battery["observation"]["sample"].get("percentage") is None:
        return info + " 배터리 잔량 기록이 없습니다."
    value = battery["observation"]["sample"]["percentage"]
    stale = battery["stale"] or not robot["telemetry_connected"]
    label = "마지막 관측 배터리" if stale else "배터리"
    stamp = datetime.fromisoformat(battery["received_at"]).astimezone(KST).strftime("%m-%d %H:%M")
    origin = battery["observation"]["provenance"]
    text = f"{info} {label}는 {value:g}%입니다 ({stamp} 한국 시간, {origin})."
    return text + (" 현재 잔량은 확인할 수 없습니다." if stale else "")


def record_source(provenance):
    sources = set(provenance)
    if sources == {"mock"}:
        return " 모의 실행(Mock) 기록입니다."
    if sources == {"sim"}:
        return " 시뮬레이션 기록입니다."
    if sources:
        return " 기록 출처: " + ", ".join(sorted(sources)) + "."
    return ""


METRICS = {
    "requested": ("요청", r"요청|접수"),
    "completed": ("완료", r"완료|성공|끝난|끝났|끝났는|실적"),
    "failed": ("실패", r"실패"),
    "cancelled": ("취소", r"취소"),
    "review_needed": ("관리자 확인 대기", r"검토|확인\s*(?:필요|대기)|미확인"),
}


def history_text(result, question="", seat_name=None):
    end = date.fromisoformat(result["end_exclusive"][:10]) - timedelta(days=1)
    start = result["start"][:10]
    period = start if start == end.isoformat() else f"{start}~{end}"
    counts = result["counts"]
    asked = [k for k, (_, pattern) in METRICS.items() if re.search(pattern, question)]
    if len(asked) > 1 and "requested" in asked and re.search(r"요청.{0,4}(?:하지|말고)", question):
        asked.remove("requested")
    values = ", ".join(f"{METRICS[k][0]} {counts[k]}건" for k in (asked or METRICS))
    source = record_source(result["record_provenance"])
    scope_text = f"{seat_name}의 " if seat_name else ""
    return f"{period} (한국 시간) {scope_text}작업 기록은 {values}입니다.{source}"


def compare_text(question, first, second):
    metrics = [k for k, (_, pattern) in METRICS.items() if re.search(pattern, question)] or [
        "completed"
    ]
    rows = []
    for k in metrics:
        label = METRICS[k][0]
        a, b = first["counts"][k], second["counts"][k]
        delta = f"{abs(b - a)}건 {'증가' if b > a else '감소'}" if a != b else "변동 없음"
        rows.append(
            f"{label}: {first['start'][:10]} {a}건 → {second['start'][:10]} {b}건 ({delta})"
        )
    sources = set(first["record_provenance"]) | set(second["record_provenance"])
    return " / ".join(rows) + "." + record_source(sources)


def after_tool(call, result, question, context, previous_results):
    if "error" in result:
        return str(result["error"])
    if call["call_id"] == "draft_targets":
        return draft_targets(question, context, result["seats"])
    if call["call_id"] == "status_seat":
        seats = scope.filter_inventory(question, result["seats"], context.get("seat_ids", []))
        if not seats or len(seats) != 1:
            return "진행 상황을 확인할 좌석 한 곳의 구역과 번호를 알려 주세요."
        return Call("get_latest_seat_mission", {"seat_id": seats[0]["seat_id"]})
    if call["call_id"] == "followup_seat":
        rows = result["seats"]
        if len(rows) != 1:
            return CLARIFY
        return history_call(question, context, rows[0]["seat_id"], False)
    if call["call_id"] in ("scope_history", "scope_compare"):
        rows = scope.filter_inventory(question, result["seats"], context.get("seat_ids", []))
        if not rows or len(rows) != 1:
            return "조회할 좌석 한 곳의 구역과 번호를 알려주시거나 지도에서 선택해 주세요."
        return history_call(
            question, context, rows[0]["seat_id"], call["call_id"] == "scope_compare"
        )
    if call["call_id"] == "compare_first":
        _, second = comparison_days(question, context)
        return Call(
            "mission_history",
            {"start_day": second, "end_day": second, "seat_id": result["seat_id"]},
            "compare_second",
        )
    if call["call_id"] == "compare_second":
        return compare_text(question, previous_results[-1], result)
    name = call["name"]
    if name == "show_operations_view":
        return result["summary"]
    if name == "draft_seat_plan":
        labels = ", ".join(scope.seat_label(item) for item in result["items"])
        priority = (
            " 높은 우선순위로" if all(i["priority"] == "HIGH" for i in result["items"]) else ""
        )
        return f"{labels} 정리 초안을{priority} 만들었습니다. " + (
            "승인 전에 차단 사유를 확인해 주세요."
            if result["blockers"]
            else "검토 후 승인해 주세요."
        )
    if name == "mission_history" and call["call_id"] == "summary_history":
        return Call("robot_overview", step="analytics_robot")
    if name == "mission_history":
        seat_id = result.get("seat_id")
        inventories = [context.get("selected_seats", [])] + [
            data["seats"] for data in previous_results if "seats" in data
        ]
        seat = next((r for rows in inventories for r in rows if r["seat_id"] == seat_id), None)
        focus = (
            (context.get("last_history") or {}).get("question", question)
            if is_date_followup(question)
            else question
        )
        return history_text(result, focus, scope.seat_label(seat) if seat else None)
    if name == "get_latest_seat_mission":
        if result.get("found") is False:
            return "이 좌석에 등록된 작업이 없습니다."
        if result["phase"] == "QUEUED":
            return "이 좌석의 가장 최근 작업은 아직 로봇 배정을 기다리고 있습니다."
        if result["phase"] != "TERMINAL":
            return "이 좌석의 가장 최근 작업이 진행 중입니다. 확인된 단계는 아래와 같습니다."
    if name in ("get_mission", "get_latest_seat_mission"):
        text = f"작업 상태는 {result['outcome'] or result['phase']}입니다. " + " ".join(
            filter(None, [result.get("failure_code"), result.get("message")])
        )
        if result.get("outcome") == "FAILED":
            text += ". 기록된 실패 사유 외에 다른 원인은 확인되지 않았습니다."
        if result.get("needs_human_review") and not result.get("review"):
            text += " 관리자 확인이 필요합니다."
        return text + record_source((result.get("execution_profile") or {}).values())
    if name == "list_seats":
        rows = scope.filter_inventory(question, result["seats"], context.get("seat_ids", []))
        if rows is None:
            return CLARIFY
        if scope.SELECTED.search(question) or scope.SEAT_NUMBERS.search(question):
            return ", ".join(scope.seat_label(r) for r in rows) + f" ({len(rows)}석)."
        zones = {r["zone_id"] for r in rows}
        area = next(iter(zones)).upper() if len(zones) == 1 else "현재 시설"
        return f"{area}에 등록된 좌석은 {len(rows)}개입니다. 청소 상태는 수집하지 않습니다."
    if name == "robot_overview":
        if not result["robots"]:
            return (
                history_text(previous_results[0]) + " " if previous_results else ""
            ) + "현재 시설에 연결된 로봇이 없습니다."
        robot = result["robots"][0]
        if call["call_id"] in ("analytics_robot", "battery_robot"):
            return Call(
                "robot_analytics",
                {"robot_id": robot["robot_id"], **date_args(question, context)},
                "battery_range" if call["call_id"] == "battery_robot" else "",
            )
        return robot_text(robot)
    if name == "robot_analytics":
        if call["call_id"] == "battery_range":
            battery = result["battery"]
            if not battery["recorded_points"]:
                return "조회 기간에 배터리 잔량 관측이 없습니다."
            return (
                f"조회 기간 배터리 관측 {battery['recorded_points']}건 중 "
                f"최저 {battery['min']:g}%, "
                f"최고 {battery['max']:g}%입니다." + record_source(battery["provenance"])
            )
        events = result["events"]
        if events:
            summary = "최근 운영 이벤트: " + ", ".join(
                f"{e['title']} ({e['detail']}, {e['provenance']})" for e in events[:3]
            )
        else:
            summary = "조회 기간에 기록된 로봇 이벤트가 없습니다."
            if re.search(r"정지|멈|복구|원인", question):
                summary += " 이 기록으로는 정지 원인이나 복구 여부를 확인할 수 없습니다."
        if "배터리" in question and previous_results:
            summary += " " + robot_text(previous_results[-1]["robots"][0])
        if previous_results and "counts" in previous_results[0]:
            summary = history_text(previous_results[0]) + " " + summary
        return summary
    return CLARIFY

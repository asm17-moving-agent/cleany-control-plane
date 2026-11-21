"""Build display cards from authenticated operational reads for one conversation turn."""

import re
from datetime import datetime, timedelta

from control_plane import agent_qwen_scope as scope
from control_plane.agent_insights import build_insight
from control_plane.agent_intents import INSIGHT_LABELS
from control_plane.agent_tools import KST, day_window, half_day_window
from control_plane.agent_view_models import (
    AgentBatteryChart,
    AgentEventTimeline,
    AgentInsight,
    AgentLiveRobot,
    AgentMapSeat,
    AgentPhotos,
    AgentRobotHealth,
    AgentSeatMap,
    AgentWorkList,
    AgentWorkRow,
)


async def scoped_seats(ops, question, context):
    rows = (await ops.seats())["seats"]
    # Calendar dates and zone hyphens must not look like an explicit seat scope.
    text = re.sub(r"\d{4}-\d{2}-\d{2}", "", question, flags=re.ASCII)
    text = text.replace("선택기", "").replace("cleany-01", "")
    if context.get("mission_id") and not scope.SEAT_NUMBERS.search(text):
        text = re.sub(r"선택(?:된|한)\s*(?:작업|미션)", "", text)
    selected = context.get("seat_ids", [])
    matches = scope.read_inventory(text, rows, selected)
    if matches is None:
        raise ValueError("구역과 좌석 번호를 알려주시거나 지도에서 좌석을 선택해 주세요.")
    return matches


def robot_for_view(ops):
    rows = ops.robot()["robots"]
    if not rows:
        raise ValueError("이 시설에 연결된 로봇이 없습니다.")
    return rows[0]


def period(start, end):
    return {"start_day": start.date(), "end_day": (end - timedelta(days=1)).date()}


def robot_card(ops, kind, base, start, end, question, focus):
    r = robot_for_view(ops)
    rid = r["robot_id"]
    if kind == "robot_health":
        samples = r["observations"]
        return AgentRobotHealth(
            **base,
            robot_id=rid,
            state=r["state"],
            mode=r["control_mode"],
            connected=r["telemetry_connected"],
            last_seen_at=r["last_seen_at"],
            battery=samples.get("battery"),
            safety=samples.get("safety"),
        ), "연결 상태와 최근 관측을 표시했습니다."
    if kind in {"head_camera", "robot_position"}:
        message = (
            "영상 열기를 누르면 헤드캠을 볼 수 있습니다."
            if kind == "head_camera"
            else "지도에서 로봇의 수신 위치를 확인할 수 있습니다."
        )
        return AgentLiveRobot(**base, kind=kind, robot_id=rid, seat_ids=focus), message

    dates = period(start, end)
    start, end, _ = half_day_window(question, start, end)
    report, stats = ops.app.telemetry.analytics_with_battery(
        rid, (ops.identity.customer_id, ops.site), start, end
    )
    ops.cite(
        "robot",
        "로봇 운영 기록",
        "/robots",
        robot=rid,
        date=dates["end_day"],
        days=(dates["end_day"] - dates["start_day"]).days + 1,
    )
    if kind == "battery_chart":
        message = (
            f"관측 잔량은 {stats['min']:g}~{stats['max']:g}%였습니다."
            if stats["recorded_points"]
            else "지정한 기간에 배터리 관측 기록이 없습니다."
        )
        if stats["recorded_points"] >= 2:
            delta = stats["latest"] - stats["first"]
            trend = f"{abs(delta):g}%p " + ("상승" if delta > 0 else "하락")
            message = f"처음 {stats['first']:g}%, 마지막 {stats['latest']:g}%"
            message += f" ({trend})." if delta else " (변동 없음)."
        if stats["recorded_points"] or stats["charging_observed"]:
            message += (
                " 충전 중인 관측이 있습니다."
                if stats["charging_observed"]
                else " 이 기간에 충전 중으로 기록된 관측은 없습니다."
            )
        return AgentBatteryChart(
            **base,
            **dates,
            robot_id=rid,
            start=start,
            end=end,
            points=report.battery,
            sources=stats["provenance"],
        ), message
    summary = "조회 기간에 운영 이벤트가 없습니다."
    if report.events:
        latest = report.events[0]
        summary = f"최근 기록은 {latest.title}입니다. {latest.detail} ({latest.provenance})"
    return AgentEventTimeline(
        **base, **dates, robot_id=rid, events=report.events, more=bool(report.next_event_cursor)
    ), summary


async def build_view(ops, kind, question, context, start_day=None, end_day=None):
    floors = set(re.findall(r"(\d+)\s*층", question))
    site_floors = set(re.findall(r"(\d+)\s*층", context.get("site_name", "")))
    if re.search(r"다른\s*(?:시설|지점)", question) or not floors.issubset(site_floors):
        raise ValueError("대상 시설을 선택한 뒤 다시 요청해 주세요.")
    start, end = day_window(start_day or context.get("day"), end_day)
    base = {"site_id": ops.site, "captured_at": datetime.now(KST)}
    if kind in {"robot_health", "head_camera", "battery_chart", "event_timeline"}:
        return robot_card(ops, kind, base, start, end, question, [])
    if kind in INSIGHT_LABELS:
        inventory, limited = await scoped_seats(ops, question, context)
        return build_insight(ops, kind, question, inventory, limited, base, start, end)
    if kind not in {
        "desk_photos",
        "work_queue",
        "review_inbox",
        "seat_picker",
        "seat_coverage",
        "robot_position",
    }:
        raise ValueError("지원하지 않는 화면입니다.")
    inventory, limited = await scoped_seats(ops, question, context)
    ids = {r["seat_id"] for r in inventory}
    focus = sorted(ids) if limited else []
    if kind == "robot_position":
        return robot_card(
            ops, kind, base, start, end, question, focus or context.get("seat_ids", [])
        )

    def in_period(stamp):
        return stamp and start <= datetime.fromisoformat(stamp) < end

    with ops.app.store._lock:
        missions = [
            m
            for m in ops.app.store.list_missions()
            if (m.customer_id, m.site_id) == (ops.identity.customer_id, ops.site)
        ]
        if kind == "desk_photos":
            key = context.get("mission_id")
            if key and not focus:
                item = ops.mission(key)
            else:
                targets = focus or context.get("seat_ids", [])
                if len(targets) != 1:
                    raise ValueError("사진을 볼 작업을 열거나 구역과 좌석 한 곳을 알려 주세요.")
                dated = bool(
                    re.search(r"오늘|어제|그제|이번|지난|최근|\d{4}-\d{2}-\d{2}", question)
                )
                finished = [
                    m
                    for m in missions
                    if m.seat_id in targets
                    and m.finished_at
                    and (not dated or in_period(m.finished_at))
                ]
                if not finished:
                    return AgentPhotos(
                        **base,
                        mission_id=None,
                        seat_id=targets[0],
                        before=None,
                        after=None,
                        profile=None,
                    ), "해당 좌석에 종료된 작업 기록이 없습니다."
                item = ops.mission(
                    max(finished, key=lambda m: datetime.fromisoformat(m.finished_at)).mission_id
                )
            card = AgentPhotos(
                **base,
                mission_id=item["mission_id"],
                seat_id=item["seat_id"],
                before=item["before_observation"],
                after=item["after_observation"],
                profile=item["execution_profile"],
            )
            return (
                card,
                "이 작업의 전후 관측 자료입니다."
                if card.before or card.after
                else "이 작업에 저장된 전후 사진이 없습니다.",
            )

        if kind in {"work_queue", "review_inbox"}:
            queue = kind == "work_queue"
            rows = []
            for m in missions:
                if queue:
                    if m.phase != "QUEUED":
                        continue
                elif not (
                    in_period(m.finished_at)
                    and m.needs_human_review
                    and (not focus or m.seat_id in ids)
                ):
                    continue
                item = ops.public_mission(m)
                if not queue and item.review:
                    continue
                rows.append(
                    AgentWorkRow(
                        mission_id=m.mission_id,
                        seat_id=m.seat_id,
                        label=m.target.label or m.target.reference_id,
                        priority=m.priority,
                        created_at=m.created_at,
                        finished_at=m.finished_at,
                        outcome=m.outcome,
                        reason=m.failure_code or m.message,
                        profile=item.execution_profile,
                    )
                )
            if queue:
                rows.sort(
                    key=lambda m: (
                        m.priority != "HIGH",
                        datetime.fromisoformat(m.created_at),
                        m.mission_id,
                    )
                )
            else:
                rows.sort(key=lambda m: datetime.fromisoformat(m.finished_at), reverse=True)
            dates = {"start_day": None, "end_day": None} if queue else period(start, end)
            title = "배정 대기" if queue else "검토 대기"
            summary = f"{title} 작업은 {len(rows)}건입니다."
            if queue and focus:
                count = sum(r.seat_id in ids for r in rows)
                summary += f" 질문한 좌석의 대기 작업은 {count}건입니다."
            return AgentWorkList(**base, **dates, kind=kind, rows=rows, focus_seats=focus), summary

        last = {}
        if kind == "seat_coverage":
            for m in missions:
                if m.seat_id in ids and m.outcome == "SUCCESS" and in_period(m.finished_at):
                    prev = last.get(m.seat_id)
                    if not prev or datetime.fromisoformat(m.finished_at) > datetime.fromisoformat(
                        prev.finished_at
                    ):
                        last[m.seat_id] = m
        seats = []
        for r in inventory:
            m = last.get(r["seat_id"])
            seats.append(
                AgentMapSeat(
                    seat_id=r["seat_id"],
                    label=r["label"],
                    zone_id=r["zone_id"],
                    selectable=r["mission_supported"] is True and r["occupancy"] != "OCCUPIED",
                    last_completed=m.finished_at if m else None,
                    profile=(m.execution_profile or None) if m else None,
                )
            )
        message = (
            f"작업 가능한 좌석은 {sum(s.selectable for s in seats)}석입니다."
            if kind == "seat_picker"
            else f"{len(seats)}석 중 {len(last)}석에 완료 기록이 있습니다."
        )
        return AgentSeatMap(**base, **period(start, end), kind=kind, seats=seats), message


def view_result(card, summary):
    result = {"view": card.kind, "summary": summary}
    if isinstance(card, AgentInsight):
        result.update(
            metric=card.metric,
            value=card.value,
            unit=card.unit,
            basis=card.basis,
            scope=card.scope_label,
            sample_count=card.sample_count,
            start_day=card.start_day,
            end_day=card.end_day,
            buckets=[r.model_dump() for r in card.buckets[:50]],
            more=len(card.buckets) > 50,
            sources=card.sources,
        )
    elif isinstance(card, AgentRobotHealth):
        result.update(card.model_dump(mode="json", exclude={"site_id", "kind"}))
    elif isinstance(card, AgentEventTimeline):
        result["recent_events"] = [event.model_dump() for event in card.events[:8]]
        result["more"] = card.more or len(card.events) > 8
    elif isinstance(card, AgentBatteryChart):
        result.update(start=card.start.isoformat(), end=card.end.isoformat(), sources=card.sources)
    elif isinstance(card, AgentWorkList):
        result["count"] = len(card.rows)
        result["first_items"] = [row.model_dump(mode="json") for row in card.rows[:8]]
    return result

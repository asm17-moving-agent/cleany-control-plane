"""Read-only operational tools. Plan drafting cannot dispatch or control a robot."""

import re
from collections import Counter
from datetime import date, datetime, time, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from control_plane.agent_intents import VIEW_LABELS
from control_plane.agent_models import (
    AgentCitation,
    AgentComparisonCard,
    AgentContext,
    AgentDayCounts,
    AgentMetric,
    AgentMissionCard,
    AgentSummary,
)

KST = ZoneInfo("Asia/Seoul")


def tool(name, description, properties):
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": properties,
            "required": list(properties),
            "additionalProperties": False,
        },
    }


def nullable(description):
    return {"type": ["string", "null"], "description": description}


TOOLS = [
    tool(
        "show_operations_view",
        "운영 질문에 맞는 대화형 화면을 표시. "
        + ", ".join(f"{k}: {v}" for k, v in VIEW_LABELS.items()),
        {
            "view": {"type": "string", "enum": list(VIEW_LABELS)},
            "start_day": nullable("KST 첫 날짜, 기본 오늘"),
            "end_day": nullable("KST 마지막 날짜, 기본 첫 날짜"),
        },
    ),
    tool(
        "list_seats",
        "좌석과 작업 지원 여부. 청소 상태는 UNKNOWN. 과거 작업에서 추정 금지.",
        {
            "zone_id": nullable("d-hub, space-a1 등. null은 모든 구역"),
            "seat_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "빈 배열이면 모든 좌석",
            },
        },
    ),
    tool(
        "mission_history",
        "KST 기간의 전체 집계와 최근 20개. 완료 건수는 종료일 기준.",
        {
            "start_day": nullable("YYYY-MM-DD, null은 오늘"),
            "end_day": nullable("마지막 날짜 포함 YYYY-MM-DD, null은 start_day"),
            "seat_id": nullable("특정 좌석, null은 전체"),
        },
    ),
    tool(
        "get_latest_seat_mission",
        "한 좌석에서 가장 최근 요청한 작업의 단계와 보고 사유. 좌석 ID는 list_seats로 확인.",
        {"seat_id": {"type": "string"}},
    ),
    tool(
        "get_mission",
        "실제 작업 진행, 실패 코드, 결과와 관리자 검토 정보를 조회.",
        {"mission_id": {"type": "string"}},
    ),
    tool(
        "robot_overview",
        "로봇 상태, 배터리, 안전 및 Supervisor 관측. stale은 현재 사실 아님.",
        {},
    ),
    tool(
        "robot_analytics",
        "1~31일 가동/배터리/장애/복구 기록. 공백과 출처 포함. next_cursor로 추가 조회.",
        {
            "robot_id": {"type": "string"},
            "start_day": nullable("YYYY-MM-DD, null은 오늘"),
            "end_day": nullable("YYYY-MM-DD, 마지막 날 포함"),
            "before": nullable("이전 응답 next_cursor 또는 null"),
        },
    ),
    tool(
        "draft_seat_plan",
        "좌석 정리 계획 제안. 생성/실행/승인 불가. 이전 미승인 "
        "계획 대체. 전체 좌석 정리만 지원. 하위 작업 선택 불가.",
        {
            "seat_ids": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 50,
            },
            "priority": {"type": "string", "enum": ["NORMAL", "HIGH"]},
            "robot_id": nullable("현재 시설에 연결된 실제 robot_id, null이면 연결된 로봇"),
            "title": {"type": "string", "maxLength": 80},
            "reason": {"type": "string", "maxLength": 400},
        },
    ),
]
TOOL_LABELS = {
    "show_operations_view": "운영 화면 조회",
    "list_seats": "좌석 확인",
    "mission_history": "작업 기록 조회",
    "get_mission": "작업 상세 조회",
    "get_latest_seat_mission": "좌석 작업 조회",
    "robot_overview": "로봇 상태 확인",
    "robot_analytics": "운영 기록 분석",
    "draft_seat_plan": "작업 계획 작성",
}


def day_window(start_day=None, end_day=None):
    first = date.fromisoformat(start_day) if start_day else datetime.now(KST).date()
    last = date.fromisoformat(end_day) if end_day else first
    if last < first or (last - first).days >= 31 or last > datetime.now(KST).date():
        raise ValueError("조회 기간은 오늘까지의 1~31일이어야 합니다.")
    return datetime.combine(first, time(), KST), datetime.combine(
        last + timedelta(days=1), time(), KST
    )


def half_day_window(question, start, end):
    """Use half-open KST intervals; opposite halves of the same day cover the whole day."""
    halves = set(re.findall("오전|오후", question))
    if not halves:
        return start, end, ""
    days = set(re.findall(r"어제|오늘|그제|\d{4}-\d{2}-\d{2}", question))
    if end - start != timedelta(days=1) or len(days) > 1 or re.search(r"\d+\s*시", question):
        raise ValueError("오전과 오후를 조회할 날짜 한 곳을 지정해 주세요.")
    excluded = set(re.findall(r"(오전|오후)(?:은|는|을|를)?\s*(?:빼|뺀|제외|말고)", question))
    only = set(re.findall(r"(오전|오후)만", question))
    if excluded or only:
        halves = (only or {"오전", "오후"}) - excluded
        if len(halves) != 1:
            raise ValueError("조회할 시간대를 지정해 주세요.")
    if len(halves) == 2:
        return start, end, "오전·오후"
    noon = start + timedelta(hours=12)
    return (start, noon, "오전") if "오전" in halves else (noon, end, "오후")


class OperationalTools:
    def __init__(self, control_plane, identity, site, read_seats, public_mission):
        self.app, self.identity, self.site = control_plane, identity, site
        self.read_seats, self.public_mission = read_seats, public_mission
        self.citations: list[AgentCitation] = []
        self.summaries: list[AgentSummary] = []
        self.mission_cards: dict[str, AgentMissionCard] = {}
        self.comparison_days: dict[date, AgentDayCounts] = {}
        self.comparison_sources: set[str] = set()
        self.has_long_window = False
        self.history_seat_scopes: set[str | None] = set()

    def cite(self, kind, label, path, **query):
        href = path + "?" + urlencode({**query, "site": self.site})
        citation = AgentCitation(kind=kind, label=label[:100], href=href)
        if citation not in self.citations:
            self.citations.append(citation)
        return href

    async def seats(self, zone_id=None, seat_ids=None):
        rows = [
            s.model_dump(mode="json", exclude={"occupant_name"})
            for s in (await self.read_seats()).items
        ]
        if zone_id:
            rows = [s for s in rows if s["zone_id"] == zone_id.lower()]
        if seat_ids:
            if len(seat_ids) > 50:
                raise ValueError("한 번에 50석까지 조회할 수 있습니다.")
            rows = [s for s in rows if s["seat_id"] in seat_ids]
        for row in rows:
            row["cleaning_state"] = "UNKNOWN"
        self.cite("seats", "시설 좌석", "/map")
        return {
            "seats": rows,
            "cleaning_state_available": False,
            "execution_mode": self.app.settings.robot_mode,
            "occupancy_source": "legacy fixture or unknown; not live seat-system data",
        }

    def mission(self, key):
        item = self.app.store.get_mission(key)
        if not item or (item.customer_id, item.site_id) != (self.identity.customer_id, self.site):
            raise ValueError("작업을 찾을 수 없습니다.")
        result = self.public_mission(item).model_dump(
            mode="json", exclude={"requested_by", "idempotency_key"}
        )
        self.cite("mission", result["target"].get("label") or "작업 상세", "/missions", mission=key)
        return result

    def mission_for_card(self, key):
        result = self.mission(key)
        self.mission_cards[key] = AgentMissionCard(
            mission_id=key,
            site_id=self.site,
            target=result["target"],
            phase=result["phase"],
            outcome=result["outcome"],
            cancel_requested=result["cancel_requested"],
            execution_profile=result.get("execution_profile"),
            message=result["message"],
            failure_code=result.get("failure_code"),
            review_pending=bool(result.get("needs_human_review") and not result.get("review")),
            captured_at=datetime.now(KST),
        )
        return result

    def latest_seat_mission(self, seat_id):
        if not isinstance(seat_id, str) or not seat_id:
            raise ValueError("좌석 ID가 필요합니다.")
        with self.app.store._lock:
            for m in self.app.store.list_missions():
                if (m.customer_id, m.site_id, m.seat_id) == (
                    self.identity.customer_id,
                    self.site,
                    seat_id,
                ):
                    return self.mission_for_card(m.mission_id)
        return {"seat_id": seat_id, "found": False}

    def comparison(self):
        if (
            len(self.history_seat_scopes) != 1
            or len(self.comparison_days) != 2
            or self.has_long_window
        ):
            return None
        earlier, later = sorted(self.comparison_days)
        return AgentComparisonCard(
            site_id=self.site,
            seat_id=next(iter(self.history_seat_scopes)),
            earlier=self.comparison_days[earlier],
            later=self.comparison_days[later],
            sources=sorted(self.comparison_sources),
        )

    def history(self, start_day=None, end_day=None, seat_id=None):
        start, end = day_window(start_day, end_day)
        # Count the complete scoped set, never infer totals from a paginated latest snapshot.
        with self.app.store._lock:
            rows = [
                m
                for m in self.app.store.list_missions()
                if (m.customer_id, m.site_id) == (self.identity.customer_id, self.site)
                and (seat_id is None or m.seat_id == seat_id)
            ]

            def within(value):
                return bool(value and start <= datetime.fromisoformat(value) < end)

            requested = [m for m in rows if within(m.created_at)]
            finished = [m for m in rows if within(m.finished_at)]
            relevant = [m for m in rows if within(m.created_at) or within(m.finished_at)]
            awaiting = [
                m for m in relevant if m.needs_human_review and not self.public_mission(m).review
            ]

            def counts_for(requests, terminals, review):
                outcomes = Counter(m.outcome for m in terminals)
                return {
                    "requested": len(requests),
                    "completed": outcomes["SUCCESS"],
                    "failed": outcomes["FAILED"],
                    "cancelled": outcomes["CANCELLED"],
                    "review_needed": len(review),
                }

            counts = counts_for(requested, finished, awaiting)
            daily = []
            length = (end.date() - start.date()).days
            self.has_long_window |= length > 2
            for offset in range(length):
                day = start.date() + timedelta(days=offset)

                def on_day(value, day=day):
                    return value and datetime.fromisoformat(value).astimezone(KST).date() == day

                terminals = [m for m in finished if on_day(m.finished_at)]
                daily.append(
                    {
                        "day": day.isoformat(),
                        "completed": sum(m.outcome == "SUCCESS" for m in terminals),
                    }
                )
                if length <= 2:
                    day_counts = (
                        counts
                        if length == 1
                        else counts_for(
                            [m for m in requested if on_day(m.created_at)],
                            terminals,
                            [m for m in awaiting if on_day(m.created_at) or on_day(m.finished_at)],
                        )
                    )
                    self.comparison_days[day] = AgentDayCounts(day=day, **day_counts)
            latest = [self.mission(m.mission_id) for m in relevant[:20]]
        provenance = dict(
            Counter(
                next(iter(set(m.execution_profile.values())))
                if len(set(m.execution_profile.values())) == 1
                else "mixed"
                if m.execution_profile
                else "unknown"
                for m in relevant
            )
        )
        self.comparison_sources.update(provenance)
        last = (end.date() - timedelta(days=1)).isoformat()
        self.history_seat_scopes.add(seat_id)
        self.cite("history", f"{start.date()}–{last} 작업", "/missions", date=last)
        self.summaries.append(
            AgentSummary(
                title=f"{start.date()}–{last}",
                metrics=[
                    AgentMetric(label=label, value=str(counts[key]))
                    for key, label in [
                        ("requested", "요청"),
                        ("completed", "완료"),
                        ("failed", "실패"),
                        ("review_needed", "확인 필요"),
                    ]
                ],
            )
        )
        return {
            "seat_id": seat_id,
            "start": start.isoformat(),
            "end_exclusive": end.isoformat(),
            "counts": counts,
            "daily": daily,
            "terminal_outcomes": dict(Counter(m.outcome for m in finished)),
            "record_provenance": provenance,
            "recent_missions": latest,
            "total_matching": len(relevant),
            "sample_truncated": len(relevant) > 20,
            "completion_basis": "finished_at",
            "execution_mode": self.app.settings.robot_mode,
        }

    def robot(self):
        robot = self.app.store.robot
        if self.app.accounts.robot_scope(robot.robot_id) != (self.identity.customer_id, self.site):
            return {"robots": []}
        snapshot = self.app.telemetry.snapshot(
            robot.robot_id, (self.identity.customer_id, self.site)
        )
        samples = {
            k: v.model_dump(mode="json")
            for k, v in snapshot.samples.items()
            if k
            in {
                "battery",
                "safety",
                "supervisor_state",
                "supervisor_faults",
                "supervisor_recoveries",
            }
        }
        self.cite("robot", robot.robot_id, "/robots", robot=robot.robot_id)
        return {
            "robots": [
                {
                    "robot_id": robot.robot_id,
                    "state": robot.state,
                    "active_mission_id": robot.active_mission_id,
                    "control_mode": robot.control_mode,
                    "last_seen_at": robot.last_seen_at,
                    "telemetry_connected": snapshot.connected,
                    "observations": samples,
                }
            ]
        }

    def analytics(self, robot_id, start_day=None, end_day=None, before=None):
        scope = self.identity.customer_id, self.site
        if self.app.accounts.robot_scope(robot_id) != scope:
            raise ValueError("로봇을 찾을 수 없습니다.")
        start, end = day_window(start_day, end_day)
        result, battery = self.app.telemetry.analytics_with_battery(
            robot_id, scope, start, end, before
        )
        for event in result.events[:10]:
            self.cite(
                "event",
                event.title,
                "/robots",
                robot=robot_id,
                date=datetime.fromisoformat(event.occurred_at).astimezone(KST).date().isoformat(),
                event=event.event_id,
            )
        self.cite(
            "robot",
            "로봇 운영 기록",
            "/robots",
            robot=robot_id,
            date=(end.date() - timedelta(days=1)).isoformat(),
            days=(end.date() - start.date()).days,
        )
        return {
            **result.model_dump(mode="json", exclude={"battery", "next_event_cursor"}),
            "battery": battery,
            "next_cursor": result.next_event_cursor,
        }

    async def context(self, value: AgentContext):
        result = value.model_dump()
        with self.app.store._lock:
            site = self.app.accounts.db.execute(
                "SELECT display_name FROM sites WHERE site_id=? AND customer_id=?",
                (self.site, self.identity.customer_id),
            ).fetchone()
        result["site_name"] = site[0] if site else self.site
        result.update(
            {"site_id": self.site, "now": datetime.now(KST).isoformat(), "timezone": "Asia/Seoul"}
        )
        if value.seat_ids:
            seats = (await self.seats(seat_ids=value.seat_ids))["seats"]
            if {s["seat_id"] for s in seats} != set(value.seat_ids):
                raise HTTPException(422, "선택한 좌석이 현재 시설에 없습니다.")
            result["selected_seats"] = seats
        if value.mission_id:
            result["selected_mission"] = self.mission(value.mission_id)
        if value.robot_id and value.robot_id not in [r["robot_id"] for r in self.robot()["robots"]]:
            raise HTTPException(422, "선택한 로봇이 현재 시설에 없습니다.")
        if value.day:
            date.fromisoformat(value.day)
        return result

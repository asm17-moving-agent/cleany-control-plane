"""Server-owned display data for the operations chat."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from control_plane.gateway_protocol import ExecutionProfile
from control_plane.telemetry_models import BatteryPoint, ObservedSample, RobotOperationalEvent


class ViewData(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CapturedView(ViewData):
    site_id: str
    captured_at: datetime


class AgentRobotHealth(CapturedView):
    kind: Literal["robot_health"] = "robot_health"
    robot_id: str
    state: str
    mode: str
    connected: bool
    last_seen_at: str | None
    battery: ObservedSample | None
    safety: ObservedSample | None


class AgentLiveRobot(CapturedView):
    kind: Literal["head_camera", "robot_position"]
    robot_id: str
    seat_ids: list[str]


class AgentPhotos(CapturedView):
    kind: Literal["desk_photos"] = "desk_photos"
    mission_id: str | None
    seat_id: str | None
    before: str | None
    after: str | None
    profile: ExecutionProfile | None


class AgentHistoryView(CapturedView):
    start_day: date
    end_day: date


class AgentBatteryChart(AgentHistoryView):
    kind: Literal["battery_chart"] = "battery_chart"
    robot_id: str
    start: datetime
    end: datetime
    points: list[BatteryPoint]
    sources: list[str]


class AgentEventTimeline(AgentHistoryView):
    kind: Literal["event_timeline"] = "event_timeline"
    robot_id: str
    events: list[RobotOperationalEvent]
    more: bool


class AgentWorkRow(ViewData):
    mission_id: str
    seat_id: str | None
    label: str
    priority: str
    created_at: str
    finished_at: str | None
    outcome: str | None
    reason: str
    profile: ExecutionProfile | None


class AgentWorkList(CapturedView):
    kind: Literal["work_queue", "review_inbox"]
    rows: list[AgentWorkRow]
    focus_seats: list[str]
    start_day: date | None
    end_day: date | None


class AgentMapSeat(ViewData):
    seat_id: str
    label: str
    zone_id: str
    selectable: bool
    last_completed: str | None = None
    profile: ExecutionProfile | None = None


class AgentSeatMap(AgentHistoryView):
    kind: Literal["seat_picker", "seat_coverage"]
    seats: list[AgentMapSeat]


InsightKind = Literal[
    "outcome_mix",
    "request_hours",
    "elapsed_spread",
    "failure_reasons",
    "zone_coverage",
    "repeat_seats",
    "photo_pairs",
    "run_sources",
    "review_progress",
    "queue_age",
]


class InsightBucket(ViewData):
    label: str
    value: int
    capacity: int | None = None
    tone: Literal["accent", "muted", "warning", "danger", "info"] = "accent"


class AgentInsight(CapturedView):
    kind: InsightKind
    start_day: date | None
    end_day: date | None
    scope_label: str
    basis: str
    metric: str
    value: float
    unit: Literal["건", "석", "분", "%"]
    sample_count: int
    buckets: list[InsightBucket]
    sources: list[str]

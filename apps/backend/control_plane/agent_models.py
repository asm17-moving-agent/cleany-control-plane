"""Operator-agent HTTP contracts. Execution approval is separate from model output."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from control_plane.agent_view_models import (
    AgentBatteryChart,
    AgentEventTimeline,
    AgentInsight,
    AgentLiveRobot,
    AgentPhotos,
    AgentRobotHealth,
    AgentSeatMap,
    AgentWorkList,
)
from control_plane.domain import MissionOutcome, MissionPhase
from control_plane.gateway_protocol import ExecutionProfile
from control_plane.schemas import MissionTargetModel


class AgentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AgentContext(AgentModel):
    page: Literal["/", "/map", "/map/edit", "/missions", "/robots", "/settings"] | None = "/"
    seat_ids: list[str] = Field(default_factory=list, max_length=50)
    mission_id: str | None = Field(default=None, max_length=80)
    robot_id: str | None = Field(default=None, max_length=80)
    day: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    demo: bool = False


class AgentCitation(AgentModel):
    kind: Literal["mission", "robot", "event", "seats", "history"]
    label: str
    href: str


class AgentMetric(AgentModel):
    label: str
    value: str


class AgentSummary(AgentModel):
    title: str
    metrics: list[AgentMetric]


class AgentPlanItem(AgentModel):
    seat_id: str = Field(min_length=1, max_length=80)
    priority: Literal["NORMAL", "HIGH"] = "NORMAL"
    robot_id: str = Field(min_length=1, max_length=80)
    task_type: Literal["SEAT_SERVICE"] = "SEAT_SERVICE"


class AgentPlanSeat(AgentPlanItem):
    label: str
    zone_id: str


class AgentPlan(AgentModel):
    plan_id: str
    conversation_id: str
    revision: int
    status: Literal["draft", "submitted", "cancelled", "superseded", "expired"]
    title: str
    reason: str
    items: list[AgentPlanSeat]
    blockers: list[str] = Field(default_factory=list)
    created_at: str
    expires_at: str
    mission_ids: list[str] = Field(default_factory=list)
    execution_mode: str = "unknown"
    basis: str = ""
    approved_by: str | None = None
    approved_at: str | None = None


class AgentMissionCard(AgentModel):
    kind: Literal["mission_progress"] = "mission_progress"
    mission_id: str
    site_id: str
    target: MissionTargetModel
    phase: MissionPhase
    outcome: MissionOutcome | None
    cancel_requested: bool
    execution_profile: ExecutionProfile | None
    message: str
    failure_code: str | None
    review_pending: bool
    captured_at: datetime


class AgentDayCounts(AgentModel):
    day: date
    requested: int
    completed: int
    failed: int
    cancelled: int
    review_needed: int


class AgentComparisonCard(AgentModel):
    kind: Literal["day_comparison"] = "day_comparison"
    site_id: str
    seat_id: str | None
    earlier: AgentDayCounts
    later: AgentDayCounts
    sources: list[str]


AgentCard = Annotated[
    AgentMissionCard
    | AgentComparisonCard
    | AgentRobotHealth
    | AgentLiveRobot
    | AgentPhotos
    | AgentBatteryChart
    | AgentEventTimeline
    | AgentWorkList
    | AgentSeatMap
    | AgentInsight,
    Field(discriminator="kind"),
]


class AgentMessage(AgentModel):
    message_id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["streaming", "complete", "interrupted", "error"] = "complete"
    created_at: str
    context: AgentContext | None = None
    citations: list[AgentCitation] = Field(default_factory=list)
    cards: list[AgentCard] = Field(default_factory=list)
    summaries: list[AgentSummary] = Field(default_factory=list)
    plan_ids: list[str] = Field(default_factory=list)
    error: str | None = None


class AgentConversation(AgentModel):
    conversation_id: str
    title: str
    created_at: str
    updated_at: str


class AgentConversationList(AgentModel):
    items: list[AgentConversation]


class AgentConversationDetail(AgentConversation):
    messages: list[AgentMessage]
    plans: list[AgentPlan]


class AgentStatus(AgentModel):
    configured: bool
    provider: str
    model: str
    reasoning_effort: str
    can_read: bool
    can_approve: bool
    max_plan_items: int
    execution_mode: str


class AgentMessageInput(AgentModel):
    client_message_id: str = Field(min_length=8, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    content: str = Field(min_length=1, max_length=4000)
    context: AgentContext = Field(default_factory=AgentContext)


class AgentPlanEdit(AgentModel):
    revision: int = Field(ge=1)
    items: list[AgentPlanItem] = Field(min_length=1, max_length=50)


class AgentPlanDecision(AgentModel):
    revision: int = Field(ge=1)


class AgentPlanApproval(AgentPlanDecision):
    approved: Literal[True]

    @field_validator("approved", mode="before")
    @classmethod
    def explicit_boolean(cls, value):
        if value is not True:
            raise ValueError("explicit administrator approval is required")
        return value


class AgentStreamEvent(AgentModel):
    type: Literal["started", "delta", "tool", "plan", "summary", "complete", "error", "heartbeat"]
    text: str | None = None
    message: AgentMessage | None = None
    plan: AgentPlan | None = None
    summary: AgentSummary | None = None

"""Versioned network contract; no ROS imports belong in the control plane."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

from control_plane.domain import MissionOutcome, RobotState


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExecutionProfile(Payload):
    navigation: Literal["sim", "real", "mock"]
    perception: Literal["sim", "real", "mock"]
    planning: Literal["sim", "real", "mock"]
    execution: Literal["sim", "real", "mock"]


class ReportPayload(Payload):
    outcome: MissionOutcome
    execution_profile: ExecutionProfile
    message: str = ""
    failure_code: str | None = None
    completed_tasks: list[str] = Field(default_factory=list)
    skipped_tasks: list[str] = Field(default_factory=list)
    failed_task: str | None = None
    needs_human_review: bool = False
    before_observation: str | None = None
    after_observation: str | None = None


class CompletedReport(Payload):
    event_id: UUID
    mission_id: UUID
    sequence: int = Field(gt=0, strict=True)
    occurred_at: datetime
    payload: ReportPayload

    @model_validator(mode="after")
    def aware_timestamp(self):
        if self.occurred_at.tzinfo is None:
            raise ValueError("occurred_at requires an explicit UTC offset")
        return self


class RobotStatus(Payload):
    boot_id: str = Field(min_length=1)
    state: Literal[RobotState.IDLE, RobotState.BUSY, RobotState.ERROR]
    active_mission_id: UUID | None

    @model_validator(mode="after")
    def consistent_status(self):
        if self.state == RobotState.IDLE and self.active_mission_id is not None:
            raise ValueError("IDLE robot cannot have an active mission")
        if self.state == RobotState.BUSY and self.active_mission_id is None:
            raise ValueError("BUSY robot requires an active mission")
        return self


class SnapshotPayload(RobotStatus):
    supported_seat_ids: list[str]
    can_cancel: bool
    execution_profile: ExecutionProfile
    active_phase: Literal["ACCEPTED", "NAVIGATING", "WORKING", "RETURNING"] | None = None
    active_sequence: int = Field(default=0, ge=0, strict=True)
    completed_reports: list[CompletedReport] = Field(default_factory=list)
    # Explicit proof that an offered mission was never accepted. Empty active state alone
    # does not prove this when an offer and ROS goal acceptance race with snapshot creation.
    unaccepted_mission_ids: list[UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def active_feedback(self):
        if self.active_mission_id is not None:
            if self.active_phase is None or self.active_sequence < 1:
                raise ValueError("active snapshot requires phase and positive sequence")
        elif self.active_phase is not None or self.active_sequence:
            raise ValueError("inactive snapshot cannot contain active feedback")
        return self


class AcceptedPayload(Payload):
    message: str = "Robot accepted the mission."


class RejectedPayload(Payload):
    message: str
    retryable: bool = False


class PhasePayload(Payload):
    phase: Literal["NAVIGATING", "WORKING", "RETURNING"]
    message: str = ""
    internal_state: str | None = None
    before_observation: str | None = None


class AckPayload(Payload):
    ack_event_id: UUID
    disposition: Literal["applied", "duplicate", "stale", "conflict"] = "applied"


class OfferPayload(Payload):
    mission_type: Literal["clean_seat"] = "clean_seat"
    target_id: str = Field(min_length=1)
    requested_by: str = Field(min_length=1)


class SyncPayload(Payload):
    reason: str
    heartbeat_interval_seconds: float = Field(gt=0, allow_inf_nan=False)


class Envelope(Payload):
    schema_version: Literal[1]
    event_id: UUID
    robot_id: Literal["cleany-01"]
    mission_id: UUID | None
    sequence: int = Field(ge=0, strict=True)
    occurred_at: datetime

    @model_validator(mode="after")
    def scope_and_time(self):
        if self.occurred_at.tzinfo is None:
            raise ValueError("occurred_at requires an explicit UTC offset")
        mission_event = getattr(self, "event_type", "").startswith("mission.")
        if mission_event and self.mission_id is None:
            raise ValueError("mission event requires mission_id")
        if not mission_event and self.mission_id is not None:
            raise ValueError("robot, sync and ack events use mission_id=null")
        if (
            getattr(self, "event_type", "")
            in (
                "mission.accepted",
                "mission.rejected",
                "mission.phase",
                "mission.result",
            )
            and self.sequence < 1
        ):
            raise ValueError("robot mission sequence must be positive")
        return self


class SnapshotEvent(Envelope):
    event_type: Literal["robot.snapshot"]
    payload: SnapshotPayload


class HeartbeatEvent(Envelope):
    event_type: Literal["robot.heartbeat"]
    payload: RobotStatus


class AcceptedEvent(Envelope):
    event_type: Literal["mission.accepted"]
    payload: AcceptedPayload


class RejectedEvent(Envelope):
    event_type: Literal["mission.rejected"]
    payload: RejectedPayload


class PhaseEvent(Envelope):
    event_type: Literal["mission.phase"]
    payload: PhasePayload


class ResultEvent(Envelope):
    event_type: Literal["mission.result"]
    payload: ReportPayload


class AckEvent(Envelope):
    event_type: Literal["ack"]
    payload: AckPayload


class OfferEvent(Envelope):
    event_type: Literal["mission.offer"]
    payload: OfferPayload


class CancelEvent(Envelope):
    event_type: Literal["mission.cancel"]
    payload: Payload


class SyncEvent(Envelope):
    event_type: Literal["sync.request"]
    payload: SyncPayload


RobotMessage = Annotated[
    SnapshotEvent
    | HeartbeatEvent
    | AcceptedEvent
    | RejectedEvent
    | PhaseEvent
    | ResultEvent
    | AckEvent,
    Field(discriminator="event_type"),
]
BackendMessage = Annotated[
    OfferEvent | CancelEvent | SyncEvent | AckEvent, Field(discriminator="event_type")
]
ROBOT_MESSAGE = TypeAdapter(RobotMessage)
BACKEND_MESSAGE = TypeAdapter(BackendMessage)

from __future__ import annotations

from math import isfinite
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from control_plane.domain import (
    MissionOutcome,
    MissionPhase,
    MissionTarget,
    Priority,
    RobotState,
    TargetKind,
)


class MissionTargetModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    kind: TargetKind
    reference_id: str = Field(min_length=1)
    label: str | None = None


class MissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seat_id: str | None = Field(default=None, min_length=1)
    target: MissionTargetModel | None = None
    priority: Priority
    requested_by: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_target(self) -> MissionRequest:
        if (self.seat_id is None) == (self.target is None):
            raise ValueError("provide exactly one of seat_id or target")
        return self

    def to_domain_target(self) -> MissionTarget:
        if self.target is not None:
            return MissionTarget(
                kind=self.target.kind,
                reference_id=self.target.reference_id,
                label=self.target.label,
            )
        return MissionTarget(kind=TargetKind.SEAT, reference_id=self.seat_id or "")


class MissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mission_id: str
    target: MissionTargetModel
    seat_id: str | None
    priority: Priority
    requested_by: str
    idempotency_key: str
    created_at: str
    phase: MissionPhase
    outcome: MissionOutcome | None
    message: str
    sequence: int
    cancel_requested: bool
    before_observation: str | None
    after_observation: str | None


class MissionListResponse(BaseModel):
    items: list[MissionResponse]


class RobotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    robot_id: str
    state: RobotState
    active_mission_id: str | None
    last_seen_at: str


class RobotListResponse(BaseModel):
    items: list[RobotResponse]


class RobotPose(BaseModel):
    """Latest accepted position with a server-owned receive timestamp."""

    model_config = ConfigDict(extra="forbid")

    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)
    received_at: str

    yaw: float | None = Field(
        default=None, allow_inf_nan=False,
        description=(
            "World heading in radians, +X=0, counterclockwise positive; null when unavailable"
        ),
    )


class PoseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float
    yaw: float | None = Field(default=None, allow_inf_nan=False)

    @field_validator("yaw", mode="before")
    @classmethod
    def finite_yaw(cls, value: object) -> float | None:
        return None if value is None else cls.finite_number(value)

    @field_validator("x", "y", mode="before")
    @classmethod
    def finite_number(cls, value: object) -> float:
        if isinstance(value, (bool, str)):
            raise ValueError("pose coordinates must be finite numbers")
        try:
            result = float(value)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("pose coordinates must be finite numbers") from exc
        if not isfinite(result):
            raise ValueError("pose coordinates must be finite numbers")
        return result


class PoseSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pose: RobotPose | None
    stale: bool


class SeatResponse(BaseModel):
    seat_id: str = Field(pattern=r"^seat-(?:[0-9]{2}|(?:a[1-4]|m[1-3])-0[1-6])$")
    label: str = Field(pattern=r"^(?:[0-9]{2}|(?:A[1-4]|M[1-3])-0[1-6])$")
    zone_id: Literal[
        "d-hub", "space-a1", "space-a2", "space-a3", "space-a4", "space-m1", "space-m2", "space-m3"
    ] = "d-hub"
    row: int = Field(ge=1, le=6)
    grid_column: Literal[1, 2, 3, 5, 6, 8, 9, 10]
    occupancy: Literal["AVAILABLE", "OCCUPIED", "UNKNOWN"]
    occupant_name: str | None


class SeatListResponse(BaseModel):
    items: list[SeatResponse]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"

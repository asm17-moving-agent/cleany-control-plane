from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from control_plane.domain import MissionOutcome, MissionPhase, Priority, RobotState


class MissionRequest(BaseModel):
    seat_id: str = Field(min_length=1)
    priority: Priority = Priority.NORMAL
    requested_by: str = Field(min_length=1)
    idempotency_key: str = Field(min_length=1)


class MissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mission_id: str
    seat_id: str
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


class SeatResponse(BaseModel):
    seat_id: str = Field(pattern=r"^seat-[0-9]{2}$")
    label: str = Field(pattern=r"^[0-9]{2}$")
    row: int = Field(ge=1, le=6)
    grid_column: Literal[1, 2, 3, 5, 6, 8, 9, 10]
    occupancy: Literal["AVAILABLE", "OCCUPIED"]
    occupant_name: str | None


class SeatListResponse(BaseModel):
    items: list[SeatResponse]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"

"""Read-only robot observations. Targets never substitute for measured joint positions."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Name = Annotated[str, Field(min_length=1, max_length=128)]
Provenance = Literal["real", "sim", "mock"]
Activity = Literal["WORKING", "MOVING", "IDLE", "CHARGING", "FAULT", "STOPPED", "UNKNOWN"]


class ObservationData(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class BatteryObservation(ObservationData):
    kind: Literal["battery"]
    percentage: Annotated[Number, Field(ge=0, le=100)] | None
    voltage: Annotated[Number, Field(ge=0)] | None = None
    charging: Literal["UNKNOWN", "CHARGING", "DISCHARGING", "NOT_CHARGING", "FULL"]


class JointObservation(ObservationData):
    kind: Literal["joints", "joint_targets"]
    names: list[Name] = Field(min_length=1, max_length=128)
    positions: list[Number] = Field(min_length=1, max_length=128)
    ages_seconds: list[Annotated[Number, Field(ge=0)]] | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def matching_names(self):
        if len(self.names) != len(self.positions) or len(set(self.names)) != len(self.names):
            raise ValueError("joint names and positions must be unique and aligned")
        if self.ages_seconds is not None and len(self.ages_seconds) != len(self.names):
            raise ValueError("joint ages must align with names")
        return self


class BaseObservation(ObservationData):
    kind: Literal["base"]
    frame_id: Name
    child_frame_id: Name
    position: tuple[Number, Number, Number]
    orientation: tuple[Number, Number, Number, Number]
    linear_velocity: tuple[Number, Number, Number]
    angular_velocity: tuple[Number, Number, Number]

    @model_validator(mode="after")
    def normalized_orientation(self):
        norm = sum(v * v for v in self.orientation) ** 0.5
        if not 0.99 <= norm <= 1.01:
            raise ValueError("base orientation must be a unit quaternion")
        self.orientation = tuple(v / norm for v in self.orientation)
        return self


class SupervisorStateObservation(ObservationData):
    kind: Literal["supervisor_state"]
    epoch: Name
    operating_state: Literal["INITIALIZING", "OPERATIONAL", "DEGRADED", "FAULT_LOCKED"]


class SafetyObservation(ObservationData):
    kind: Literal["safety"]
    protection_ready: bool
    estop_engaged: bool
    physical_release_confirmed: bool
    stopped: bool
    detail: str = Field(max_length=1024)


class SupervisorFault(ObservationData):
    code: Name
    source: str = Field(max_length=128)
    severity: str = Field(max_length=32)
    active: bool
    latched: bool
    recovery_policy: str = Field(max_length=128)
    detail: str = Field(max_length=1024)


class SupervisorFaultObservation(ObservationData):
    kind: Literal["supervisor_faults"]
    epoch: Name
    faults: list[SupervisorFault] = Field(max_length=128)


class SupervisorRecovery(ObservationData):
    job_id: Name
    fault_code: str = Field(max_length=128)
    state: Literal["IDLE", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]
    attempt: int = Field(ge=0, strict=True)
    verifying_health: bool
    resource_held: bool
    detail: str = Field(max_length=1024)


class SupervisorRecoveryObservation(ObservationData):
    kind: Literal["supervisor_recoveries"]
    epoch: Name
    recoveries: list[SupervisorRecovery] = Field(max_length=128)


class SupervisorEventObservation(ObservationData):
    kind: Literal["supervisor_event"]
    epoch: Name
    event_sequence: int = Field(ge=0, strict=True)
    event_kind: Name
    code: str = Field(max_length=128)
    severity: str = Field(max_length=32)
    detail: str = Field(max_length=1024)


Sample = Annotated[
    BatteryObservation
    | JointObservation
    | BaseObservation
    | SupervisorStateObservation
    | SupervisorFaultObservation
    | SupervisorRecoveryObservation
    | SupervisorEventObservation
    | SafetyObservation,
    Field(discriminator="kind"),
]


class RobotObservation(ObservationData):
    schema_version: Literal[1]
    boot_id: Name
    sequence: int = Field(ge=0, le=2**53 - 1, strict=True)
    source_topic: Name
    source_stamp: Annotated[Number, Field(gt=0)]
    source_age_seconds: Annotated[Number, Field(ge=0)]
    provenance: Provenance
    sample: Sample


class ObservedSample(ObservationData):
    received_at: str
    expires_at: str
    stale: bool
    observation: RobotObservation


class RobotTelemetrySnapshot(ObservationData):
    robot_id: str
    connected: bool
    samples: dict[str, ObservedSample]
    poll_interval_ms: int


class BatteryPoint(ObservationData):
    time: str
    percentage: float | None
    charging_percentage: float | None
    samples: int


class ActivityDuration(ObservationData):
    state: Activity
    seconds: float


class RobotOperationalEvent(ObservationData):
    event_id: str
    occurred_at: str
    kind: str
    severity: str
    title: str
    detail: str
    provenance: str
    mission_id: str | None = None


class RobotAnalytics(ObservationData):
    robot_id: str
    start: str
    end: str
    window_seconds: float
    observed_seconds: float
    activities: list[ActivityDuration]
    battery: list[BatteryPoint]
    events: list[RobotOperationalEvent]
    next_event_cursor: str | None
    provenance: list[str]
    retention_days: int

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from threading import RLock
from time import monotonic
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class Priority(StrEnum):
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class RobotState(StrEnum):
    OFFLINE = "OFFLINE"
    IDLE = "IDLE"
    BUSY = "BUSY"
    ERROR = "ERROR"


class MissionPhase(StrEnum):
    QUEUED = "QUEUED"
    OFFERED = "OFFERED"
    ACCEPTED = "ACCEPTED"
    NAVIGATING = "NAVIGATING"
    WORKING = "WORKING"
    RETURNING = "RETURNING"
    TERMINAL = "TERMINAL"


class MissionOutcome(StrEnum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    HUMAN_REVIEW_REQUIRED = "HUMAN_REVIEW_REQUIRED"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    REJECTED = "REJECTED"
    INTERRUPTED = "INTERRUPTED"


class TargetKind(StrEnum):
    SEAT = "SEAT"
    ZONE = "ZONE"
    POINT = "POINT"


@dataclass(frozen=True)
class MissionTarget:
    kind: TargetKind
    reference_id: str
    label: str | None = None


@dataclass
class Mission:
    mission_id: str
    target: MissionTarget
    priority: Priority
    requested_by: str
    idempotency_key: str
    created_at: str
    phase: MissionPhase = MissionPhase.QUEUED
    outcome: MissionOutcome | None = None
    message: str = "Mission queued."
    sequence: int = 0
    cancel_requested: bool = False
    before_observation: str | None = None
    after_observation: str | None = None

    @property
    def seat_id(self) -> str | None:
        """Compatibility field for seat-based clients during contract migration."""
        return self.target.reference_id if self.target.kind == TargetKind.SEAT else None

    def to_dict(self) -> dict[str, object]:
        result = asdict(self)
        result["target"]["kind"] = self.target.kind.value
        result["seat_id"] = self.seat_id
        result["priority"] = self.priority.value
        result["phase"] = self.phase.value
        result["outcome"] = self.outcome.value if self.outcome else None
        return result


@dataclass
class Robot:
    robot_id: str = "cleany-01"
    state: RobotState = RobotState.IDLE
    active_mission_id: str | None = None
    last_seen_at: str = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, object]:
        result = asdict(self)
        result["state"] = self.state.value
        return result


@dataclass(frozen=True)
class RobotPose:
    x: float
    y: float
    received_at: str
    received_monotonic: float
    yaw: float | None = None


EventListener = Callable[[dict[str, object]], None]


class ControlPlaneStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._missions: dict[str, Mission] = {}
        self._idempotency: dict[str, str] = {}
        self._listeners: list[EventListener] = []
        self.robot = Robot()
        self._pose: RobotPose | None = None
        self._pose_producer_active = False
        self._pose_stale_published = False

    def subscribe(self, listener: EventListener) -> Callable[[], None]:
        with self._lock:
            self._listeners.append(listener)

        def unsubscribe() -> None:
            with self._lock:
                if listener in self._listeners:
                    self._listeners.remove(listener)

        return unsubscribe

    def _publish(
        self,
        event_type: str,
        mission: Mission | None = None,
        payload: dict[str, object] | None = None,
    ) -> None:
        event: dict[str, object] = {
            "schema_version": 1,
            "event_id": str(uuid4()),
            "event_type": event_type,
            "robot_id": self.robot.robot_id,
            "mission_id": mission.mission_id if mission else None,
            "sequence": mission.sequence if mission else 0,
            "occurred_at": utc_now(),
            "payload": (
                payload if payload is not None
                else (mission.to_dict() if mission else self.robot.to_dict())
            ),
        }
        for listener in list(self._listeners):
            listener(event)

    def create_mission(
        self,
        *,
        priority: str,
        requested_by: str,
        idempotency_key: str,
        seat_id: str | None = None,
        target: MissionTarget | None = None,
    ) -> tuple[Mission, bool]:
        if target is not None and seat_id is not None:
            raise ValueError("provide either target or seat_id, not both")
        if target is None:
            if seat_id is None or not seat_id.strip():
                raise ValueError("target is required")
            target = MissionTarget(TargetKind.SEAT, seat_id.strip())
        if not target.reference_id.strip():
            raise ValueError("target.reference_id is required")
        target = MissionTarget(
            kind=TargetKind(target.kind),
            reference_id=target.reference_id.strip(),
            label=target.label.strip() if target.label else None,
        )
        if not requested_by.strip():
            raise ValueError("requested_by is required")
        if not idempotency_key.strip():
            raise ValueError("idempotency_key is required")
        parsed_priority = Priority(priority)

        with self._lock:
            existing_id = self._idempotency.get(idempotency_key)
            if existing_id:
                return self._missions[existing_id], False

            mission = Mission(
                mission_id=str(uuid4()),
                target=target,
                priority=parsed_priority,
                requested_by=requested_by.strip(),
                idempotency_key=idempotency_key.strip(),
                created_at=utc_now(),
            )
            self._missions[mission.mission_id] = mission
            self._idempotency[idempotency_key] = mission.mission_id
            self._publish("mission.created", mission)
            return mission, True

    def list_missions(self) -> list[Mission]:
        with self._lock:
            return sorted(
                self._missions.values(),
                key=lambda mission: mission.created_at,
                reverse=True,
            )

    def get_mission(self, mission_id: str) -> Mission | None:
        with self._lock:
            return self._missions.get(mission_id)

    def next_queued(self) -> Mission | None:
        with self._lock:
            candidates = [
                mission
                for mission in self._missions.values()
                if mission.phase == MissionPhase.QUEUED
            ]
            if not candidates:
                return None
            return min(
                candidates,
                key=lambda mission: (
                    0 if mission.priority == Priority.HIGH else 1,
                    mission.created_at,
                ),
            )

    def transition(
        self,
        mission_id: str,
        phase: MissionPhase,
        message: str,
        *,
        outcome: MissionOutcome | None = None,
    ) -> Mission:
        with self._lock:
            mission = self._missions[mission_id]
            if mission.phase == MissionPhase.TERMINAL:
                raise ValueError("terminal mission cannot transition")
            if phase == MissionPhase.TERMINAL and outcome is None:
                raise ValueError("terminal mission requires an outcome")
            if phase != MissionPhase.TERMINAL and outcome is not None:
                raise ValueError("non-terminal mission cannot have an outcome")

            mission.phase = phase
            mission.outcome = outcome
            mission.message = message
            mission.sequence += 1
            if phase == MissionPhase.WORKING and mission.before_observation is None:
                mission.before_observation = (
                    f"mock://observations/before-{mission.target.reference_id}"
                )
            if phase == MissionPhase.TERMINAL and outcome == MissionOutcome.SUCCESS:
                mission.after_observation = (
                    f"mock://observations/after-{mission.target.reference_id}"
                )
            self._publish("mission.status_changed", mission)
            return mission

    def request_cancel(self, mission_id: str) -> Mission:
        with self._lock:
            mission = self._missions[mission_id]
            if mission.phase == MissionPhase.TERMINAL:
                return mission
            mission.cancel_requested = True
            mission.sequence += 1
            mission.message = "Cancellation requested; waiting for a safe checkpoint."
            self._publish("mission.cancel_requested", mission)
            return mission

    def set_robot_state(
        self,
        state: RobotState,
        active_mission_id: str | None = None,
    ) -> None:
        with self._lock:
            self.robot.state = state
            self.robot.active_mission_id = active_mission_id
            self.robot.last_seen_at = utc_now()
            self._publish("robot.state_changed")

    def claim_pose_producer(self) -> bool:
        with self._lock:
            if self._pose_producer_active:
                return False
            self._pose_producer_active = True
            return True

    def release_pose_producer(self) -> None:
        with self._lock:
            self._pose_producer_active = False
            self.publish_pose_stale()

    def update_pose(
        self, x: float, y: float, *, received_at: str | None = None, yaw: float | None = None,
    ) -> RobotPose:
        pose = RobotPose(x, y, received_at or utc_now(), monotonic(), yaw)
        with self._lock:
            self._pose = pose
            self._pose_stale_published = False
            self._publish("robot.pose", payload={"pose": {
                "x": pose.x, "y": pose.y, "received_at": pose.received_at, "yaw": pose.yaw,
            }, "stale": False})
            return pose

    def latest_pose(self, timeout: float) -> tuple[RobotPose | None, bool]:
        with self._lock:
            pose = self._pose
            stale = (
                pose is None
                or not self._pose_producer_active
                or self._pose_stale_published
                or monotonic() - pose.received_monotonic > timeout
            )
            return pose, stale

    def publish_pose_stale(self) -> bool:
        with self._lock:
            if self._pose_stale_published:
                return False
            self._pose_stale_published = True
            pose = self._pose
            self._publish("robot.pose.stale", payload={
                "pose": {"x": pose.x, "y": pose.y, "received_at": pose.received_at, "yaw": pose.yaw}
                if pose else None,
                "stale": True,
            })
            return True

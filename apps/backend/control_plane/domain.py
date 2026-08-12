from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from threading import RLock
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


@dataclass
class Mission:
    mission_id: str
    seat_id: str
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

    def to_dict(self) -> dict[str, object]:
        result = asdict(self)
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


EventListener = Callable[[dict[str, object]], None]


class ControlPlaneStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._missions: dict[str, Mission] = {}
        self._idempotency: dict[str, str] = {}
        self._listeners: list[EventListener] = []
        self.robot = Robot()

    def subscribe(self, listener: EventListener) -> Callable[[], None]:
        with self._lock:
            self._listeners.append(listener)

        def unsubscribe() -> None:
            with self._lock:
                if listener in self._listeners:
                    self._listeners.remove(listener)

        return unsubscribe

    def _publish(self, event_type: str, mission: Mission | None = None) -> None:
        event: dict[str, object] = {
            "schema_version": 1,
            "event_id": str(uuid4()),
            "event_type": event_type,
            "robot_id": self.robot.robot_id,
            "mission_id": mission.mission_id if mission else None,
            "sequence": mission.sequence if mission else 0,
            "occurred_at": utc_now(),
            "payload": mission.to_dict() if mission else self.robot.to_dict(),
        }
        for listener in list(self._listeners):
            listener(event)

    def create_mission(
        self,
        *,
        seat_id: str,
        priority: str,
        requested_by: str,
        idempotency_key: str,
    ) -> tuple[Mission, bool]:
        if not seat_id.strip():
            raise ValueError("seat_id is required")
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
                seat_id=seat_id.strip(),
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
                mission.before_observation = "mock://observations/before-seat"
            if phase == MissionPhase.TERMINAL and outcome == MissionOutcome.SUCCESS:
                mission.after_observation = "mock://observations/after-seat"
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

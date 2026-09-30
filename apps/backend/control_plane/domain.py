from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from threading import RLock
from time import monotonic
from uuid import uuid4

from control_plane.persistence import SQLiteRepository


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
    accepted_at: str | None = None
    finished_at: str | None = None
    failure_code: str | None = None
    completed_tasks: list[str] = field(default_factory=list)
    skipped_tasks: list[str] = field(default_factory=list)
    failed_task: str | None = None
    needs_human_review: bool = False
    execution_profile: dict[str, str] = field(default_factory=dict)
    robot_sequence: int = 0

    @property
    def seat_id(self) -> str | None:
        """Compatibility field for seat-based clients during contract migration."""
        return self.target.reference_id if self.target.kind == TargetKind.SEAT else None

    def to_dict(self) -> dict[str, object]:
        result = asdict(self)
        result.pop("robot_sequence")
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
    last_seen_at: str | None = field(default_factory=utc_now)
    control_mode: str = "mock"
    can_cancel: bool = True
    supported_seat_ids: list[str] | None = None
    execution_profile: dict[str, str] = field(default_factory=dict)
    boot_id: str | None = None

    def to_dict(self) -> dict[str, object]:
        result = asdict(self)
        result.pop("boot_id")
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
    def __init__(self, repository: SQLiteRepository | None = None) -> None:
        self._lock = RLock()
        self._missions: dict[str, Mission] = {}
        self._idempotency: dict[str, str] = {}
        self._listeners: list[EventListener] = []
        self.robot = Robot()
        self._pose: RobotPose | None = None
        self._pose_producer_active = False
        self._pose_stale_published = False
        self.repository = repository
        self._transaction_depth = 0
        self._pending_events: list[dict[str, object]] = []
        if repository:
            missions, robot = repository.load()
            for data in missions:
                data["target"]["kind"] = TargetKind(data["target"]["kind"])
                data["target"] = MissionTarget(**data["target"])
                data["priority"] = Priority(data["priority"])
                data["phase"] = MissionPhase(data["phase"])
                data["outcome"] = MissionOutcome(data["outcome"]) if data["outcome"] else None
                mission = Mission(**data)
                self._missions[mission.mission_id] = mission
                self._idempotency[mission.idempotency_key] = mission.mission_id
            if robot:
                robot["state"] = RobotState(robot["state"])
                self.robot = Robot(**robot)

    @contextmanager
    def transaction(self):
        with self._lock:
            outer = self._transaction_depth == 0
            if outer:
                backup = deepcopy((self._missions, self._idempotency, self.robot))
                self._pending_events = []
                if self.repository:
                    self.repository.connection.execute("BEGIN IMMEDIATE")
            self._transaction_depth += 1
            try:
                yield
                if outer and self.repository:
                    if self._missions != backup[0] or self.robot != backup[2]:
                        self.repository.save(
                            [asdict(m) for m in self._missions.values()],
                            asdict(self.robot),
                        )
                    self.repository.connection.execute("COMMIT")
            except BaseException:
                if outer:
                    if self.repository:
                        self.repository.connection.execute("ROLLBACK")
                    # Preserve references held by the mock worker and API callers.
                    for mission_id in set(self._missions) - set(backup[0]):
                        del self._missions[mission_id]
                    for mission_id, previous in backup[0].items():
                        if mission_id in self._missions:
                            vars(self._missions[mission_id]).update(vars(previous))
                        else:
                            self._missions[mission_id] = previous
                    self._idempotency = backup[1]
                    vars(self.robot).update(vars(backup[2]))
                    self._pending_events = []
                raise
            finally:
                self._transaction_depth -= 1
            if outer:
                events, self._pending_events = self._pending_events, []
                for event in events:
                    self._notify(event)

    def _notify(self, event: dict[str, object]) -> None:
        if not str(event["event_type"]).startswith("robot.pose"):
            payload = event["payload"]
            logging.getLogger(__name__).info(
                "event=%s event_id=%s mission=%s phase=%s outcome=%s",
                event["event_type"],
                event["event_id"],
                event["mission_id"],
                payload.get("phase"),
                payload.get("outcome"),
            )
        for listener in list(self._listeners):
            try:
                listener(event)
            except Exception:
                logging.getLogger(__name__).exception("event subscriber failed after commit")

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
                payload
                if payload is not None
                else (mission.to_dict() if mission else self.robot.to_dict())
            ),
        }
        if self._transaction_depth:
            self._pending_events.append(event)
        else:
            self._notify(event)

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

        with self.transaction():
            existing_id = self._idempotency.get(idempotency_key)
            if existing_id:
                existing = self._missions[existing_id]
                if (
                    existing.target != target
                    or existing.priority != parsed_priority
                    or existing.requested_by != requested_by.strip()
                ):
                    raise ValueError("idempotency key already used for another request")
                return existing, False

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

    def next_queued(self, supported_seat_ids: list[str] | None = None) -> Mission | None:
        with self._lock:
            candidates = [
                mission
                for mission in self._missions.values()
                if mission.phase == MissionPhase.QUEUED
                and (supported_seat_ids is None or mission.seat_id in supported_seat_ids)
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
        with self.transaction():
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
            if phase == MissionPhase.ACCEPTED and mission.accepted_at is None:
                mission.accepted_at = utc_now()
            if phase == MissionPhase.TERMINAL:
                mission.finished_at = utc_now()
            self._publish("mission.status_changed", mission)
            return mission

    def request_cancel(self, mission_id: str) -> Mission:
        with self.transaction():
            mission = self._missions[mission_id]
            if mission.phase == MissionPhase.TERMINAL or mission.cancel_requested:
                return mission
            mission.cancel_requested = True
            mission.sequence += 1
            mission.message = "Cancellation requested; waiting for a safe checkpoint."
            if mission.phase == MissionPhase.QUEUED:
                return self.transition(
                    mission_id,
                    MissionPhase.TERMINAL,
                    "Queued mission cancelled.",
                    outcome=MissionOutcome.CANCELLED,
                )
            self._publish("mission.cancel_requested", mission)
            return mission

    def set_robot_state(
        self,
        state: RobotState,
        active_mission_id: str | None = None,
        *,
        seen: bool = True,
    ) -> None:
        with self.transaction():
            self.robot.state = state
            self.robot.active_mission_id = active_mission_id
            if seen:
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
        self,
        x: float,
        y: float,
        *,
        received_at: str | None = None,
        yaw: float | None = None,
    ) -> RobotPose:
        pose = RobotPose(x, y, received_at or utc_now(), monotonic(), yaw)
        with self._lock:
            self._pose = pose
            self._pose_stale_published = False
            self._publish(
                "robot.pose",
                payload={
                    "pose": {
                        "x": pose.x,
                        "y": pose.y,
                        "received_at": pose.received_at,
                        "yaw": pose.yaw,
                    },
                    "stale": False,
                },
            )
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
            self._publish(
                "robot.pose.stale",
                payload={
                    "pose": {
                        "x": pose.x,
                        "y": pose.y,
                        "received_at": pose.received_at,
                        "yaw": pose.yaw,
                    }
                    if pose
                    else None,
                    "stale": True,
                },
            )
            return True

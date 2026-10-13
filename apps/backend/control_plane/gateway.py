"""Network-facing mission adapter and durable single-robot dispatcher."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from time import monotonic, time
from typing import Any
from uuid import uuid4

from control_plane.domain import (
    ControlPlaneStore,
    Mission,
    MissionOutcome,
    MissionPhase,
    RobotState,
    TargetKind,
    utc_now,
)
from control_plane.fixtures import SEATS
from control_plane.gateway_protocol import ROBOT_MESSAGE, Envelope, SnapshotEvent
from control_plane.settings import Settings

logger = logging.getLogger(__name__)
PHASE_ORDER = {phase: index for index, phase in enumerate(MissionPhase)}


def envelope(kind: str, payload: dict[str, Any], mission_id: str | None = None) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "event_id": str(uuid4()),
        "robot_id": "cleany-01",
        "mission_id": mission_id,
        "sequence": 0,
        "occurred_at": utc_now(),
        "event_type": kind,
        "payload": payload,
    }


class GatewayController:
    def __init__(self, store: ControlPlaneStore, settings: Settings) -> None:
        self.store = store
        self.settings = settings
        self.repository = store.repository
        if self.repository is None:
            raise ValueError("gateway requires a persistent repository")
        self.connected = False
        self.synchronized = False
        self.last_contact = 0.0
        self.last_sync = 0.0
        self.sync_reason: str | None = None
        with store.transaction():
            store.robot.control_mode = "gateway"
            if store.robot.boot_id is None:
                store.robot.can_cancel = False
                store.robot.last_seen_at = None
            store.robot.state = RobotState.OFFLINE

    def claim(self) -> bool:
        if self.connected:
            return False
        self.connected = True
        self.synchronized = False
        self.last_contact = monotonic()
        self.last_sync = 0
        self.sync_reason = "connection established"
        return True

    def disconnect(self) -> None:
        self.connected = self.synchronized = False
        self.store.set_robot_state(
            RobotState.OFFLINE, self.store.robot.active_mission_id, seen=False
        )

    def reservation(self) -> Mission | None:
        return next(
            (
                m
                for m in self.store.list_missions()
                if m.phase not in (MissionPhase.QUEUED, MissionPhase.TERMINAL)
            ),
            None,
        )

    def validate_target(self, target, idempotency_key: str, customer_id: str | None = None) -> None:
        # A successful POST retry remains valid even if capabilities later change.
        if any(
            m.idempotency_key == idempotency_key and m.customer_id == customer_id
            for m in self.store.list_missions()
        ):
            return
        if target.kind != TargetKind.SEAT or target.reference_id not in (
            self.store.robot.supported_seat_ids or []
        ):
            raise ValueError("런타임이 지원하는 좌석을 확인한 뒤 요청해 주세요.")

    def cancel(self, mission_id: str) -> Mission:
        with self.store.transaction():
            mission = self.store.get_mission(mission_id)
            if mission is None:
                raise ValueError("mission not found")
            if mission.phase == MissionPhase.TERMINAL or mission.cancel_requested:
                return mission
            if mission.phase != MissionPhase.QUEUED and not self.store.robot.can_cancel:
                raise ValueError("런타임이 활성 미션 취소를 지원하지 않습니다.")
            result = self.store.request_cancel(mission_id)
            if result.phase != MissionPhase.TERMINAL:
                self.repository.enqueue(envelope("mission.cancel", {}, mission_id))
            return result

    def receive(self, raw: Any) -> dict[str, Any] | None:
        event = ROBOT_MESSAGE.validate_python(raw)
        data = event.model_dump(mode="json")
        disposition = "applied"
        with self.store.transaction():
            if self.repository.seen(data["event_id"]):
                disposition = "duplicate"
            elif event.event_type == "ack":
                self.repository.acknowledge(str(event.payload.ack_event_id))
                self.repository.record(data, disposition)
            else:
                if isinstance(event, SnapshotEvent):
                    self._snapshot(event)
                elif event.event_type == "robot.heartbeat":
                    self._heartbeat(event)
                else:
                    known = self.store.get_mission(data["mission_id"])
                    if not self.synchronized and (
                        known is None or known.phase != MissionPhase.TERMINAL
                    ):
                        raise ValueError("snapshot required before mission events")
                    disposition = self._mission_event(data)
                self.repository.record(data, disposition)
        # Malformed messages / command ACKs cannot keep a dead runtime heartbeat alive.
        if event.event_type in ("robot.snapshot", "robot.heartbeat") and disposition == "applied":
            self.last_contact = monotonic()
        logger.info(
            "gateway event=%s event_id=%s mission=%s sequence=%s disposition=%s",
            event.event_type,
            event.event_id,
            event.mission_id,
            event.sequence,
            disposition,
        )
        if event.event_type == "ack":
            return None
        return envelope("ack", {"ack_event_id": data["event_id"], "disposition": disposition})

    def _heartbeat(self, event: Envelope) -> None:
        status = event.payload
        active_id = str(status.active_mission_id) if status.active_mission_id else None
        if not self.synchronized or status.boot_id != self.store.robot.boot_id:
            self.synchronized = False
            self.sync_reason = "runtime boot changed; snapshot required"
            self.store.set_robot_state(
                RobotState.OFFLINE, self.store.robot.active_mission_id, seen=False
            )
            return
        reservation = self.reservation()
        if active_id and (reservation is None or reservation.mission_id != active_id):
            self.synchronized = False
            self.sync_reason = "active mission mismatch"
            self.store.set_robot_state(RobotState.ERROR, active_id)
            return
        if reservation and active_id is None:
            # Never clear an unresolved reservation merely because a heartbeat says IDLE.
            self.sync_reason = "reserved mission requires snapshot"
        self.store.set_robot_state(status.state, active_id)

    def _snapshot(self, event: SnapshotEvent) -> None:
        status = event.payload
        if not set(status.supported_seat_ids).issubset({s["seat_id"] for s in SEATS}):
            raise ValueError("snapshot contains non-canonical seat IDs")
        old_boot = self.store.robot.boot_id
        if (
            old_boot is not None
            and status.boot_id != old_boot
            and status.active_mission_id is not None
        ):
            raise ValueError("active mission resumed across runtime boot; operator review required")
        # Replayed final reports win over interruption inferred from a new boot.
        for report in status.completed_reports:
            child = envelope(
                "mission.result", report.payload.model_dump(mode="json"), str(report.mission_id)
            )
            child.update(
                event_id=str(report.event_id),
                sequence=report.sequence,
                occurred_at=report.occurred_at.isoformat(),
            )
            if not self.repository.seen(child["event_id"]):
                disposition = self._mission_event(child)
                self.repository.record(child, disposition)
        active_id = str(status.active_mission_id) if status.active_mission_id else None
        reservation = self.reservation()
        if active_id:
            if reservation is None or reservation.mission_id != active_id:
                raise ValueError("snapshot active mission conflicts with backend reservation")
            self._advance(reservation, MissionPhase(status.active_phase), "Runtime state restored.")
            reservation.robot_sequence = max(reservation.robot_sequence, status.active_sequence)
            self.repository.retire(active_id, "mission.offer")
        elif reservation:
            if old_boot is not None and status.boot_id != old_boot:
                reservation.needs_human_review = True
                reservation.failure_code = "RUNTIME_RESTART"
                self.store.transition(
                    reservation.mission_id,
                    MissionPhase.TERMINAL,
                    "Runtime restarted; mission was not resumed.",
                    outcome=MissionOutcome.INTERRUPTED,
                )
                self.repository.retire(reservation.mission_id)
            elif reservation.phase == MissionPhase.OFFERED and reservation.mission_id in {
                str(mid) for mid in status.unaccepted_mission_ids
            }:
                self.repository.retire(reservation.mission_id)
                if reservation.cancel_requested:
                    self.store.transition(
                        reservation.mission_id,
                        MissionPhase.TERMINAL,
                        "Unaccepted offer cancelled.",
                        outcome=MissionOutcome.CANCELLED,
                    )
                else:
                    self.store.transition(
                        reservation.mission_id,
                        MissionPhase.QUEUED,
                        "Runtime confirmed offer was never accepted.",
                    )
            else:
                self.sync_reason = "missing report or acceptance proof"
        self.store.robot.boot_id = status.boot_id
        self.store.robot.supported_seat_ids = sorted(set(status.supported_seat_ids))
        self.store.robot.can_cancel = status.can_cancel
        self.store.robot.execution_profile = status.execution_profile.model_dump()
        self.store.set_robot_state(status.state, active_id)
        self.synchronized = True

    def _advance(self, mission: Mission, phase: MissionPhase, message: str) -> bool:
        if PHASE_ORDER[phase] < PHASE_ORDER[mission.phase]:
            return False
        if mission.accepted_at is None:
            mission.accepted_at = utc_now()
        if phase != mission.phase:
            self.store.transition(mission.mission_id, phase, message)
        return True

    def _mission_event(self, data: dict[str, Any]) -> str:
        mission = self.store.get_mission(data["mission_id"])
        if mission is None:
            raise ValueError("event references unknown mission")
        payload, kind = data["payload"], data["event_type"]
        if mission.phase == MissionPhase.TERMINAL:
            if kind == "mission.result" and payload["outcome"] != mission.outcome:
                logger.error("immutable terminal conflict mission=%s", mission.mission_id)
                return "conflict"
            return "stale"
        if data["sequence"] <= mission.robot_sequence:
            return "stale"
        reservation = self.reservation()
        if reservation is None or reservation.mission_id != mission.mission_id:
            raise ValueError("event does not match reserved mission")
        if data["sequence"] > mission.robot_sequence + 1:
            self.sync_reason = "mission event sequence gap"
        mission.robot_sequence = data["sequence"]
        if kind == "mission.accepted":
            self.repository.retire(mission.mission_id, "mission.offer")
            self._advance(mission, MissionPhase.ACCEPTED, payload["message"])
            self.store.set_robot_state(RobotState.BUSY, mission.mission_id)
        elif kind == "mission.rejected":
            if mission.phase != MissionPhase.OFFERED:
                return "conflict"
            self.repository.retire(mission.mission_id)
            if payload["retryable"] and not mission.cancel_requested:
                self.store.transition(mission.mission_id, MissionPhase.QUEUED, payload["message"])
                self.synchronized = False
                self.sync_reason = "temporary rejection; fresh snapshot required"
            else:
                self.store.transition(
                    mission.mission_id,
                    MissionPhase.TERMINAL,
                    payload["message"],
                    outcome=(
                        MissionOutcome.CANCELLED
                        if mission.cancel_requested
                        else MissionOutcome.REJECTED
                    ),
                )
        elif kind == "mission.phase":
            if payload["before_observation"] is not None:
                mission.before_observation = payload["before_observation"]
            self._advance(mission, MissionPhase(payload["phase"]), payload["message"])
            self.repository.retire(mission.mission_id, "mission.offer")
            self.store.set_robot_state(RobotState.BUSY, mission.mission_id)
            if payload["internal_state"]:
                logger.info(
                    "mission=%s internal_state=%s", mission.mission_id, payload["internal_state"]
                )
        elif kind == "mission.result":
            for key in (
                "failure_code",
                "completed_tasks",
                "skipped_tasks",
                "failed_task",
                "needs_human_review",
                "before_observation",
                "after_observation",
                "execution_profile",
            ):
                setattr(mission, key, payload[key])
            if mission.accepted_at is None:
                mission.accepted_at = utc_now()
            self.store.transition(
                mission.mission_id,
                MissionPhase.TERMINAL,
                payload["message"],
                outcome=MissionOutcome(payload["outcome"]),
            )
            self.repository.retire(mission.mission_id)
            # A report is not proof that the robot has become IDLE (fatal -> ERROR is possible).
            self.synchronized = False
            self.sync_reason = "final report received; confirm robot availability"
            self.last_sync = 0
        return "applied"

    def tick(self) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        now = time()
        with self.store.transaction():
            for mission in self.store.list_missions():
                age = now - datetime.fromisoformat(mission.created_at).timestamp()
                if mission.phase == MissionPhase.QUEUED and age >= self.settings.queue_ttl_seconds:
                    self.store.transition(
                        mission.mission_id,
                        MissionPhase.TERMINAL,
                        "Queue lifetime expired.",
                        outcome=MissionOutcome.EXPIRED,
                    )
            if not self.connected:
                return output
            if monotonic() - self.last_contact >= self.settings.gateway_heartbeat_timeout_seconds:
                self.synchronized = False
                self.store.set_robot_state(
                    RobotState.OFFLINE, self.store.robot.active_mission_id, seen=False
                )
                return output
            reservation = self.reservation()
            if reservation and reservation.phase == MissionPhase.OFFERED:
                # The outbox timestamp, not Mission.created_at, measures offer response timeout.
                row = self.repository.connection.execute(
                    "SELECT payload FROM command_outbox WHERE mission_id=? "
                    "AND json_extract(payload,'$.event_type')='mission.offer' ORDER BY rowid DESC",
                    (reservation.mission_id,),
                ).fetchone()
                if row:
                    offered_at = datetime.fromisoformat(
                        json.loads(row[0])["occurred_at"]
                    ).timestamp()
                    if now - offered_at >= self.settings.gateway_offer_timeout_seconds:
                        self.sync_reason = "offer acceptance timeout"
            if self.sync_reason and monotonic() - self.last_sync >= (
                self.settings.gateway_offer_timeout_seconds
            ):
                output.append(
                    envelope(
                        "sync.request",
                        {
                            "reason": self.sync_reason,
                            "heartbeat_interval_seconds": (
                                self.settings.gateway_heartbeat_interval_seconds
                            ),
                        },
                    )
                )
                self.last_sync = monotonic()
                self.sync_reason = None
            if self.synchronized:
                if (
                    reservation is None
                    and self.store.robot.state == RobotState.IDLE
                    and self.store.robot.active_mission_id is None
                ):
                    candidate = self.store.next_queued(self.store.robot.supported_seat_ids or [])
                    if candidate and candidate.seat_id in (
                        self.store.robot.supported_seat_ids or []
                    ):
                        candidate.robot_id = self.store.robot.robot_id
                        candidate.execution_profile = dict(self.store.robot.execution_profile)
                        self.store.transition(
                            candidate.mission_id,
                            MissionPhase.OFFERED,
                            "Mission offered to runtime.",
                        )
                        self.repository.enqueue(
                            envelope(
                                "mission.offer",
                                {
                                    "mission_type": "clean_seat",
                                    "target_id": candidate.seat_id,
                                    "requested_by": candidate.requested_by,
                                },
                                candidate.mission_id,
                            )
                        )
                for event, attempts in self.repository.pending(now):
                    output.append(event)
                    delay = min(
                        self.settings.gateway_retry_max_seconds,
                        self.settings.gateway_retry_initial_seconds * 2 ** min(attempts, 20),
                    )
                    self.repository.sent(event["event_id"], now + delay)
        return output

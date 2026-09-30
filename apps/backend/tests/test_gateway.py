from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from control_plane.domain import (
    ControlPlaneStore,
    MissionOutcome,
    MissionPhase,
    RobotState,
)
from control_plane.gateway import GatewayController, envelope
from control_plane.gateway_protocol import BACKEND_MESSAGE, ROBOT_MESSAGE
from control_plane.persistence import SQLiteRepository
from control_plane.settings import Settings

PROFILE = {"navigation": "sim", "perception": "mock", "planning": "mock", "execution": "mock"}


def snapshot(**updates):
    payload = {
        "boot_id": "boot-1",
        "state": "IDLE",
        "active_mission_id": None,
        "supported_seat_ids": ["seat-12", "seat-18"],
        "can_cancel": True,
        "execution_profile": PROFILE,
        **updates,
    }
    return envelope("robot.snapshot", payload)


def feedback(mission, kind, sequence, **payload):
    if kind == "mission.result":
        payload = {"outcome": "SUCCESS", "execution_profile": PROFILE, **payload}
    event = envelope(kind, payload, mission.mission_id)
    event["sequence"] = sequence
    return event


def request(gateway, key="request-1", priority="NORMAL", seat_id="seat-12"):
    return gateway.store.create_mission(
        seat_id=seat_id, priority=priority, requested_by="operator", idempotency_key=key
    )[0]


@pytest.fixture
def gateway(tmp_path):
    repository = SQLiteRepository(str(tmp_path / "control.db"))
    controller = GatewayController(ControlPlaneStore(repository), Settings())
    controller.claim()
    controller.receive(snapshot())
    yield controller
    repository.close()


def offer(gateway, mission):
    events = gateway.tick()
    command = next(e for e in events if e["event_type"] == "mission.offer")
    assert command["mission_id"] == mission.mission_id
    BACKEND_MESSAGE.validate_python(command)
    return command


def test_single_slot_requires_report_and_fresh_robot_availability(gateway):
    active = request(gateway, "active")
    queued = request(gateway, "queued")
    offer(gateway, active)
    assert queued.phase == MissionPhase.QUEUED
    assert not any(e["event_type"] == "mission.offer" for e in gateway.tick())
    gateway.receive(feedback(active, "mission.accepted", 1))
    gateway.receive(feedback(active, "mission.result", 2))
    assert active.outcome == MissionOutcome.SUCCESS
    # Completion alone cannot release a robot that may have entered ERROR.
    assert not any(e["event_type"] == "mission.offer" for e in gateway.tick())
    gateway.receive(snapshot(state="ERROR"))
    assert not any(e["event_type"] == "mission.offer" for e in gateway.tick())
    gateway.receive(snapshot())
    offer(gateway, queued)


def test_duplicate_stale_and_conflicting_terminal_events(gateway):
    mission = request(gateway)
    offer(gateway, mission)
    accepted = feedback(mission, "mission.accepted", 1)
    gateway.receive(accepted)
    local_sequence = mission.sequence
    assert gateway.receive(accepted)["payload"]["disposition"] == "duplicate"
    assert mission.sequence == local_sequence
    gateway.receive(feedback(mission, "mission.phase", 3, phase="WORKING"))
    assert (
        gateway.receive(feedback(mission, "mission.phase", 2, phase="NAVIGATING"))["payload"][
            "disposition"
        ]
        == "stale"
    )
    result = feedback(mission, "mission.result", 4)
    gateway.receive(result)
    final = mission.to_dict()
    assert gateway.receive(result)["payload"]["disposition"] == "duplicate"
    conflict = feedback(mission, "mission.result", 5, outcome="CANCELLED")
    assert gateway.receive(conflict)["payload"]["disposition"] == "conflict"
    assert mission.to_dict() == final


def test_cancel_pending_and_success_cancel_race(gateway):
    queued = request(gateway, "queued")
    gateway.cancel(queued.mission_id)
    assert queued.outcome == MissionOutcome.CANCELLED
    assert gateway.repository.pending(1e20) == []
    mission = request(gateway)
    offer(gateway, mission)
    gateway.receive(feedback(mission, "mission.accepted", 1))
    gateway.store.robot.can_cancel = False
    with pytest.raises(ValueError, match="취소"):
        gateway.cancel(mission.mission_id)
    assert not mission.cancel_requested
    gateway.store.robot.can_cancel = True
    gateway.cancel(mission.mission_id)
    local_sequence = mission.sequence
    gateway.cancel(mission.mission_id)
    assert mission.sequence == local_sequence
    cancels = [
        e for e, _ in gateway.repository.pending(1e20) if e["event_type"] == "mission.cancel"
    ]
    assert len(cancels) == 1
    BACKEND_MESSAGE.validate_python(cancels[0])
    assert mission.phase == MissionPhase.ACCEPTED
    gateway.receive(feedback(mission, "mission.result", 2))
    assert mission.outcome == MissionOutcome.SUCCESS
    assert gateway.repository.pending(1e20) == []


def test_retransmission_preserves_command_id_and_reservation(gateway):
    mission = request(gateway)
    first = offer(gateway, mission)
    gateway.repository.connection.execute("UPDATE command_outbox SET next_attempt=0")
    again = next(e for e in gateway.tick() if e["event_type"] == "mission.offer")
    assert again == first
    gateway.disconnect()
    gateway.claim()
    gateway.receive(snapshot())  # Empty active state is not proof that an offer was unaccepted.
    assert gateway.store.get_mission(mission.mission_id).phase == MissionPhase.OFFERED
    another = request(gateway, "another")
    assert not any(e.get("mission_id") == another.mission_id for e in gateway.tick())
    gateway.receive(snapshot(unaccepted_mission_ids=[mission.mission_id]))
    assert gateway.store.get_mission(mission.mission_id).phase == MissionPhase.QUEUED


def test_snapshot_reconciles_active_after_backend_restart(tmp_path):
    path = str(tmp_path / "restart.db")
    first = GatewayController(ControlPlaneStore(SQLiteRepository(path)), Settings())
    first.claim()
    first.receive(snapshot())
    mission = request(first)
    offer(first, mission)
    first.receive(feedback(mission, "mission.accepted", 1))
    first.cancel(mission.mission_id)
    first.repository.close()
    second = GatewayController(ControlPlaneStore(SQLiteRepository(path)), Settings())
    try:
        assert second.store.robot.state == RobotState.OFFLINE
        second.claim()
        second.receive(
            snapshot(
                state="BUSY",
                active_mission_id=mission.mission_id,
                active_phase="WORKING",
                active_sequence=3,
            )
        )
        restored = second.store.get_mission(mission.mission_id)
        assert restored.phase == MissionPhase.WORKING
        assert restored.cancel_requested
        assert len(second.store.list_missions()) == 1
        assert (
            len(
                [
                    e
                    for e, _ in second.repository.pending(1e20)
                    if e["event_type"] == "mission.cancel"
                ]
            )
            == 1
        )
        again, created = second.store.create_mission(
            seat_id="seat-12",
            priority="NORMAL",
            requested_by="operator",
            idempotency_key="request-1",
        )
        assert not created and again.mission_id == mission.mission_id
    finally:
        second.repository.close()


def test_runtime_restart_interrupts_but_pending_report_wins(gateway):
    mission = request(gateway)
    offer(gateway, mission)
    gateway.receive(feedback(mission, "mission.accepted", 1))
    with pytest.raises(ValueError, match="resumed across"):
        gateway.receive(
            snapshot(
                boot_id="boot-2",
                state="BUSY",
                active_mission_id=mission.mission_id,
                active_phase="WORKING",
                active_sequence=2,
            )
        )
    assert mission.phase == MissionPhase.ACCEPTED
    gateway.receive(snapshot(boot_id="boot-2"))
    assert mission.outcome == MissionOutcome.INTERRUPTED
    assert mission.needs_human_review
    assert gateway.repository.pending(1e20) == []
    next_mission = request(gateway, "next")
    offer(gateway, next_mission)
    gateway.receive(feedback(next_mission, "mission.accepted", 1))
    report = feedback(next_mission, "mission.result", 2)
    gateway.receive(
        snapshot(
            boot_id="boot-3",
            completed_reports=[
                {
                    key: report[key]
                    for key in ("event_id", "mission_id", "sequence", "occurred_at", "payload")
                }
            ],
        )
    )
    assert next_mission.outcome == MissionOutcome.SUCCESS


def test_contract_examples_are_accepted():
    path = Path(__file__).resolve().parents[3] / "packages/contracts/examples/gateway-v1.json"
    examples = json.loads(path.read_text())
    for direction, adapter in (("robot", ROBOT_MESSAGE), ("backend", BACKEND_MESSAGE)):
        for event in examples[direction]:
            adapter.validate_python(event)


def test_commit_failure_rolls_back_state_inbox_and_notifications(gateway, monkeypatch):
    mission = request(gateway)
    offer(gateway, mission)
    event = feedback(mission, "mission.accepted", 1)
    observed = []
    gateway.store.subscribe(observed.append)

    def fail_save(*args):
        raise sqlite3.OperationalError("simulated disk write failure")

    monkeypatch.setattr(gateway.repository, "save", fail_save)
    with pytest.raises(sqlite3.OperationalError):
        gateway.receive(event)
    assert mission is gateway.store.get_mission(mission.mission_id)
    assert mission.phase == MissionPhase.OFFERED
    assert mission.accepted_at is None and mission.robot_sequence == 0
    assert not gateway.repository.seen(event["event_id"])
    assert observed == []

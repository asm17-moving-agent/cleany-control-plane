from __future__ import annotations

from threading import Event

import pytest

from control_plane.domain import ControlPlaneStore, MissionOutcome, MissionPhase, RobotState
from control_plane.mock.dispatcher import MockDispatcher


@pytest.mark.parametrize(
    ("cancel_at", "initial_before", "outcome", "expected_before", "expected_after"),
    [
        (
            None,
            None,
            MissionOutcome.SUCCESS,
            "mock://observations/before-seat-18",
            "mock://observations/after-seat-18",
        ),
        (
            None,
            "media://existing-before",
            MissionOutcome.SUCCESS,
            "mock://observations/before-seat-18",
            "mock://observations/after-seat-18",
        ),
        (MissionPhase.OFFERED, None, MissionOutcome.CANCELLED, None, None),
        (
            MissionPhase.WORKING,
            None,
            MissionOutcome.CANCELLED,
            "mock://observations/before-seat-18",
            None,
        ),
    ],
)
def test_mock_run_preserves_observations_and_checkpoint_cancellation(
    cancel_at: MissionPhase | None,
    initial_before: str | None,
    outcome: MissionOutcome,
    expected_before: str | None,
    expected_after: str | None,
) -> None:
    store = ControlPlaneStore()
    mission, _ = store.create_mission(
        seat_id="seat-18",
        priority="NORMAL",
        requested_by="test-operator",
        idempotency_key="mock-run",
    )
    if initial_before is not None:
        store.transition(
            mission.mission_id,
            MissionPhase.QUEUED,
            "Mission queued.",
            before_observation=initial_before,
        )
    initial_sequence = mission.sequence
    events: list[dict[str, object]] = []
    finished = Event()

    def listener(event: dict[str, object]) -> None:
        events.append(event)
        payload = event["payload"]
        assert isinstance(payload, dict)
        if event["event_type"] == "mission.status_changed" and payload["phase"] == cancel_at:
            store.request_cancel(mission.mission_id)
        if event["event_type"] == "robot.state_changed" and payload["state"] == RobotState.IDLE:
            finished.set()

    unsubscribe = store.subscribe(listener)
    dispatcher = MockDispatcher(store, step_delay=0)
    dispatcher.start()
    try:
        assert finished.wait(timeout=2), "mock mission did not release the robot"
    finally:
        dispatcher.stop()
        unsubscribe()

    assert mission.phase == MissionPhase.TERMINAL
    assert mission.outcome == outcome
    assert mission.before_observation == expected_before
    assert mission.after_observation == expected_after
    assert store.robot.state == RobotState.IDLE
    assert store.robot.active_mission_id is None

    mission_events = [event for event in events if event["mission_id"] == mission.mission_id]
    assert [event["sequence"] for event in mission_events] == list(
        range(initial_sequence + 1, mission.sequence + 1)
    )
    assert mission_events[-1]["payload"] == mission.to_dict()
    for event in mission_events:
        payload = event["payload"]
        assert isinstance(payload, dict)
        if payload["phase"] == MissionPhase.WORKING:
            assert payload["before_observation"] == expected_before
        if payload["phase"] != MissionPhase.TERMINAL:
            assert payload["after_observation"] is None

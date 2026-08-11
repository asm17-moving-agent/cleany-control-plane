from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from control_plane.domain import (  # noqa: E402
    ControlPlaneStore,
    MissionOutcome,
    MissionPhase,
)


class ControlPlaneStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.store = ControlPlaneStore()

    def create(self, key: str, *, priority: str = "NORMAL"):
        return self.store.create_mission(
            seat_id="seat-A01",
            priority=priority,
            requested_by="operator",
            idempotency_key=key,
        )

    def test_idempotency_key_returns_existing_mission(self) -> None:
        first, first_created = self.create("same-request")
        second, second_created = self.create("same-request")

        self.assertTrue(first_created)
        self.assertFalse(second_created)
        self.assertEqual(first.mission_id, second.mission_id)
        self.assertEqual(1, len(self.store.list_missions()))

    def test_high_priority_is_dispatched_before_normal(self) -> None:
        normal, _ = self.create("normal")
        high, _ = self.create("high", priority="HIGH")

        self.assertEqual(high.mission_id, self.store.next_queued().mission_id)
        self.assertNotEqual(normal.mission_id, high.mission_id)

    def test_terminal_mission_is_immutable(self) -> None:
        mission, _ = self.create("terminal")
        self.store.transition(
            mission.mission_id,
            MissionPhase.TERMINAL,
            "done",
            outcome=MissionOutcome.SUCCESS,
        )

        with self.assertRaisesRegex(ValueError, "terminal mission"):
            self.store.transition(
                mission.mission_id,
                MissionPhase.WORKING,
                "invalid",
            )

    def test_cancel_request_is_idempotent_for_terminal_mission(self) -> None:
        mission, _ = self.create("cancel-terminal")
        self.store.transition(
            mission.mission_id,
            MissionPhase.TERMINAL,
            "done",
            outcome=MissionOutcome.SUCCESS,
        )

        result = self.store.request_cancel(mission.mission_id)

        self.assertEqual(MissionOutcome.SUCCESS, result.outcome)
        self.assertFalse(result.cancel_requested)


if __name__ == "__main__":
    unittest.main()


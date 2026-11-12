"""Simulate robot progress and observation references without a robot connection."""

from __future__ import annotations

from control_plane.domain import ControlPlaneStore, MissionOutcome, MissionPhase, RobotState


class MockDispatcher:
    """Advance a single mock robot through timed checkpoints on a background thread.

    Assignment and the initial offer commit together; shutdown leaves active work for recovery.
    Observation references are synthetic and do not identify captured robot data.
    """

    CHECKPOINTS = (
        (MissionPhase.OFFERED, "Mission offered to cleany-01."),
        (MissionPhase.ACCEPTED, "Robot accepted the mission."),
        (MissionPhase.NAVIGATING, "Navigating to the selected seat."),
        (MissionPhase.WORKING, "Observing and processing the tabletop scene."),
        (MissionPhase.RETURNING, "Returning to the waiting position."),
    )

    def __init__(self, store: ControlPlaneStore, step_delay: float = 0.8) -> None:
        from threading import Event, Thread

        self.store = store
        self.step_delay = step_delay
        self._stop = Event()
        self._thread = Thread(target=self._run, name="mock-dispatcher", daemon=True)

    def start(self) -> None:
        """Start the worker once; this dispatcher cannot be restarted after stopping."""
        self._thread.start()

    def stop(self) -> None:
        """Signal shutdown and join for at most two seconds without finalizing active work."""
        self._stop.set()
        self._thread.join(timeout=2)

    def _run(self) -> None:
        while not self._stop.is_set():
            with self.store.transaction():
                mission = (
                    self.store.next_queued() if self.store.robot.state == RobotState.IDLE else None
                )
                if mission:
                    mission.robot_id = self.store.robot.robot_id
                    self.store.set_robot_state(RobotState.BUSY, mission.mission_id)
                    self.store.transition(mission.mission_id, *self.CHECKPOINTS[0])
            if mission is None:
                self._stop.wait(0.1)
                continue

            for phase, message in self.CHECKPOINTS[1:]:
                if self._stop.is_set():
                    return
                if mission.cancel_requested:
                    break
                self.store.transition(
                    mission.mission_id,
                    phase,
                    message,
                    before_observation=(
                        f"mock://observations/before-{mission.target.reference_id}"
                        if phase == MissionPhase.WORKING else None
                    ),
                )
                self._stop.wait(self.step_delay)

            if self._stop.is_set():
                return
            if mission.cancel_requested:
                self.store.transition(
                    mission.mission_id,
                    MissionPhase.TERMINAL,
                    "Mission cancelled at a safe checkpoint.",
                    outcome=MissionOutcome.CANCELLED,
                )
            else:
                self.store.transition(
                    mission.mission_id,
                    MissionPhase.TERMINAL,
                    "Mission completed successfully.",
                    outcome=MissionOutcome.SUCCESS,
                    after_observation=f"mock://observations/after-{mission.target.reference_id}",
                )
            self.store.set_robot_state(RobotState.IDLE)

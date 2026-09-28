import pytest

from control_plane.domain import ControlPlaneStore
from control_plane.schemas import PoseInput


def test_pose_producer_is_single_and_snapshot_is_latest(monkeypatch: pytest.MonkeyPatch) -> None:
    store = ControlPlaneStore()
    clock = iter((10.0, 10.0, 12.0))
    monkeypatch.setattr("control_plane.domain.monotonic", lambda: next(clock))
    assert store.claim_pose_producer()
    assert not store.claim_pose_producer()
    store.update_pose(1.0, -2.0, received_at="2026-09-18T00:00:00+00:00")
    pose, stale = store.latest_pose(10)
    assert pose is not None and (pose.x, pose.y) == (1.0, -2.0)
    assert not stale
    _, stale = store.latest_pose(1)
    assert stale
    store.release_pose_producer()
    assert store.claim_pose_producer()


def test_pose_schema_forbids_extra_and_non_finite_values() -> None:
    assert PoseInput(x=1, y=2).x == 1
    with pytest.raises(ValueError):
        PoseInput(x=float("inf"), y=2)
    with pytest.raises(ValueError):
        PoseInput.model_validate({"x": 1, "y": 2, "received_at": "now"})
    with pytest.raises(ValueError):
        PoseInput.model_validate({"x": 1, "y": 2, "z": 3})
    with pytest.raises(ValueError):
        PoseInput(x=True, y=2)

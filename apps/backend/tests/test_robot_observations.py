import json
from datetime import UTC, datetime

import pytest
from account_support import authorize
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings
from control_plane.telemetry_models import RobotObservation

ROBOT = "cleany-01"
BASE = f"/api/robots/{ROBOT}"


def frame(sequence=1, kind="battery", **sample):
    if kind == "battery":
        sample = {"percentage": 72, "charging": "DISCHARGING", **sample}
    return RobotObservation.model_validate(
        dict(
            schema_version=1,
            boot_id="bridge-a",
            sequence=sequence,
            source_topic="/fixture/" + kind,
            source_stamp=float(sequence),
            source_age_seconds=0.0,
            provenance="sim",
            sample={"kind": kind, **sample},
        )
    )


@pytest.fixture
def rig(tmp_path):
    app = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            database_path=str(tmp_path / "robot.db"),
            cookie_secure=False,
            allowed_origins=["http://test"],
        ),
    )
    with TestClient(create_app(app), base_url="http://test") as client:
        authorize(client, app)
        client.params = {"site_id": "BUSAN_SOMA_18F"}
        now = [1794873600.0]
        app.telemetry.clock = lambda: now[0]
        scope = app.accounts.robot_scope(ROBOT)
        yield app, client, now, scope


def test_ws_auth_ownership_scope_replay_and_disconnect(rig):
    app, client, now, scope = rig
    with client.websocket_connect(BASE + "/telemetry/ws") as ws:
        ws.send_json(frame().model_dump())
        assert ws.receive_json() == {"sequence": 1, "accepted": True}
        ws.send_json(frame().model_dump())
        assert ws.receive_json()["accepted"] is False
        with pytest.raises(WebSocketDisconnect), client.websocket_connect(BASE + "/telemetry/ws"):
            pass
        snapshot = client.get(BASE + "/telemetry").json()
        assert snapshot["connected"] and not snapshot["samples"]["battery"]["stale"]
        assert (
            client.get(BASE + "/telemetry", params={"site_id": "BUSAN_SOMA_19F"}).status_code == 404
        )
        assert client.get("/api/robots/unknown/telemetry").status_code == 404
    assert client.get(BASE + "/telemetry").json()["samples"]["battery"]["stale"]
    client.headers.pop("X-Cleany-Robot-Token")
    with pytest.raises(WebSocketDisconnect), client.websocket_connect(BASE + "/telemetry/ws"):
        pass
    client.cookies.clear()
    assert client.get(BASE + "/telemetry").status_code == 401


def test_each_source_expires_independently_and_targets_never_become_observations(rig):
    app, _, now, scope = rig
    service = app.telemetry
    session = service.claim(ROBOT, scope)
    service.receive(ROBOT, scope, session, frame())
    service.receive(
        ROBOT, scope, session, frame(2, "joints", names=["left_gripper_joint"], positions=[0.2])
    )
    service.receive(
        ROBOT,
        scope,
        session,
        frame(3, "joint_targets", names=["left_gripper_joint"], positions=[0.8]),
    )
    now[0] += 4
    samples = service.snapshot(ROBOT, scope).samples
    assert samples["joints"].stale and not samples["battery"].stale
    assert samples["joints"].observation.sample.positions == [0.2]
    old = frame(4, "joints", names=["left_gripper_joint"], positions=[0.5])
    old.source_age_seconds = 4
    assert not service.receive(ROBOT, scope, session, old)
    duplicate_stamp = frame(5, "joints", names=["left_gripper_joint"], positions=[0.5])
    duplicate_stamp.source_stamp = 2.0
    assert not service.receive(ROBOT, scope, session, duplicate_stamp)
    assert service.snapshot(ROBOT, scope).samples["joints"].stale


@pytest.mark.parametrize(
    "sample",
    [
        {"kind": "battery", "percentage": float("nan"), "charging": "UNKNOWN"},
        {"kind": "battery", "percentage": True, "charging": "UNKNOWN"},
        {"kind": "battery", "percentage": 101, "charging": "UNKNOWN"},
        {"kind": "joints", "names": ["a", "a"], "positions": [0, 1]},
        {"kind": "joints", "names": ["a"], "positions": []},
        {"kind": "joints", "names": ["a"], "positions": [float("inf")]},
    ],
)
def test_invalid_observations_are_not_coerced(sample):
    data = frame().model_dump()
    data["sample"] = sample
    with pytest.raises(ValidationError):
        RobotObservation.model_validate(data)


def test_history_conserves_time_and_keeps_disconnects_unknown(rig):
    app, _, now, scope = rig
    service, start = app.telemetry, now[0]
    session = service.claim(ROBOT, scope)
    service.receive(ROBOT, scope, session, frame(charging="CHARGING"))
    now[0] += 10
    service.release(ROBOT, session)
    now[0] += 20
    session = service.claim(ROBOT, scope)
    service.receive(ROBOT, scope, session, frame(2, charging="CHARGING"))
    now[0] += 10
    result = service.analytics(
        ROBOT,
        scope,
        datetime.fromtimestamp(start, UTC),
        datetime.fromtimestamp(now[0], UTC),
    )
    assert {a.state: a.seconds for a in result.activities} == {"CHARGING": 20, "UNKNOWN": 20}
    assert sum(a.seconds for a in result.activities) == result.window_seconds == 40
    assert result.provenance == ["sim"]
    assert result.battery[0].percentage == 72


def test_supervisor_events_are_deduplicated_and_manual_gate_does_not_hide_stop(rig):
    app, client, now, scope = rig
    service = app.telemetry
    session = service.claim(ROBOT, scope)
    event = dict(
        epoch="supervisor-a",
        event_sequence=8,
        event_kind="RECOVERY_SUCCEEDED",
        code="NAV",
        severity="info",
        detail="Navigation recovered",
    )
    service.receive(ROBOT, scope, session, frame(1, "supervisor_event", **event))
    service.receive(ROBOT, scope, session, frame(2, "supervisor_event", **event))
    service.receive(
        ROBOT,
        scope,
        session,
        frame(3, "supervisor_state", epoch="supervisor-a", operating_state="FAULT_LOCKED"),
    )
    assert "장애 잠금" in client.get(BASE + "/manual/status").json()["blocked_reason"]
    command = dict(client="browser-test-123456", sequence=1, action="press")
    assert client.post(BASE + "/manual/control", json=command).status_code == 409
    # STOP still reaches the existing upstream path (not configured in this fixture).
    assert (
        client.post(BASE + "/manual/control", json={**command, "action": "stop"}).status_code == 503
    )
    now[0] += 6
    assert "갱신 중단" in client.get(BASE + "/manual/status").json()["blocked_reason"]
    assert (
        service.db.execute(
            "SELECT COUNT(*) FROM robot_operational_events WHERE kind='RECOVERY_SUCCEEDED'"
        ).fetchone()[0]
        == 1
    )


def test_empty_ranges_scope_and_persisted_snapshot_cannot_claim_live(rig):
    app, client, now, scope = rig
    service = app.telemetry
    start = datetime.fromtimestamp(now[0] - 3600, UTC).isoformat()
    end = datetime.fromtimestamp(now[0], UTC).isoformat()
    assert (
        client.get(BASE + "/analytics", params={"start": start, "end": end}).json()["battery"] == []
    )
    assert (
        client.get(BASE + "/analytics", params={"start": "2026-01-01", "end": end}).status_code
        == 422
    )
    assert (
        client.get(
            BASE + "/analytics", params={"start": start, "end": end, "site_id": "BUSAN_SOMA_19F"}
        ).status_code
        == 404
    )
    session = service.claim(ROBOT, scope)
    service.receive(ROBOT, scope, session, frame())
    from control_plane.robot_observations import RobotObservations

    reopened = RobotObservations(app.store, app.settings, app.accounts.robot_scope, service.clock)
    assert reopened.snapshot(ROBOT, scope).samples["battery"].stale
    reopened.unsubscribe()
    assert (
        json.loads(service.db.execute("SELECT payload FROM robot_observations").fetchone()[0])[
            "sample"
        ]["percentage"]
        == 72
    )


def test_partial_joint_updates_can_share_latest_source_stamp(rig):
    app, _, now, scope = rig
    session = app.telemetry.claim(ROBOT, scope)
    first = frame(1, "joints", names=["wheel"], positions=[1.0], ages_seconds=[0.0])
    assert app.telemetry.receive(ROBOT, scope, session, first)
    second = frame(
        2, "joints", names=["wheel", "arm"], positions=[1.0, 0.2], ages_seconds=[0.0, 0.5]
    )
    second.source_stamp = first.source_stamp
    second.source_age_seconds = 0.2
    assert app.telemetry.receive(ROBOT, scope, session, second)
    replay = second.model_copy(update={"sequence": 3})
    assert not app.telemetry.receive(ROBOT, scope, session, replay)


def test_events_paginate_without_duplicates_and_retention_prunes(rig):
    app, client, now, scope = rig
    session = app.telemetry.claim(ROBOT, scope)
    start = datetime.fromtimestamp(now[0] - 1, UTC).isoformat()
    for sequence in range(1, 103):
        app.telemetry.receive(
            ROBOT,
            scope,
            session,
            frame(
                sequence,
                "supervisor_event",
                epoch="system",
                event_sequence=sequence,
                event_kind="RECOVERY_SUCCEEDED",
                code="sensor",
                severity="info",
                detail="recovered",
            ),
        )
    now[0] += 1
    end = datetime.fromtimestamp(now[0], UTC).isoformat()
    first = client.get(BASE + "/analytics", params={"start": start, "end": end}).json()
    assert len(first["events"]) == 100 and first["provenance"] == ["sim"]
    second = client.get(
        BASE + "/analytics",
        params={"start": start, "end": end, "before": first["next_event_cursor"]},
    ).json()
    assert len(second["events"]) == 2 and second["next_event_cursor"] is None
    assert len({e["event_id"] for e in first["events"] + second["events"]}) == 102
    now[0] += (app.settings.telemetry_retention_days + 1) * 86400
    app.telemetry.tick()
    assert (
        app.telemetry.analytics(
            ROBOT, scope, datetime.fromisoformat(start), datetime.fromisoformat(end)
        ).events
        == []
    )


def test_terminal_event_is_idempotent_and_does_not_change_mission_payload(rig):
    app, _, now, scope = rig
    payload = dict(phase="TERMINAL", outcome="SUCCESS", execution_profile={"navigation": "sim"})
    original = json.dumps(payload)
    event = dict(event_type="mission.completed", payload=payload, robot_id=ROBOT, mission_id="test")
    app.telemetry.on_operation(event)
    app.telemetry.on_operation(event)
    assert json.dumps(payload) == original
    result = app.telemetry.analytics(
        ROBOT,
        scope,
        datetime.fromtimestamp(now[0] - 1, UTC),
        datetime.fromtimestamp(now[0] + 1, UTC),
    )
    # The open interval excludes the current instant until time advances.
    now[0] += 1
    result = app.telemetry.analytics(
        ROBOT, scope, datetime.fromtimestamp(now[0] - 2, UTC), datetime.fromtimestamp(now[0], UTC)
    )
    assert len(result.events) == 1 and result.events[0].kind == "MISSION_COMPLETED"

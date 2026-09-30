from threading import Event

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings

WS = "/api/robots/cleany-01/pose/ws"
SNAPSHOT = "/api/robots/cleany-01/pose"


@pytest.mark.parametrize(
    "message",
    [
        '{"x":1,"y":2,"received_at":"attacker"}',
        '{"x":1,"y":2,"yaw":true}',
        '{"x":1,"y":2,"yaw":NaN}',
        '{"x":1,"y":2,"yaw":"1"}',
        '{"x":true,"y":2}',
        '{"x":"1","y":2}',
        '{"x":NaN,"y":2}',
        '{"x":Infinity,"y":2}',
        '{"x":1}',
        "null",
        "[]",
        "not json",
    ],
)
def test_websocket_rejects_invalid_messages_and_releases_owner(message: str) -> None:
    app = create_app(
        ControlPlaneApplication(
            start_dispatcher=False,
            settings=Settings(
                robot_mode="mock",
                database_path=":memory:",
            ),
        )
    )
    with TestClient(app) as client:
        with client.websocket_connect(WS) as socket:
            socket.send_text(message)
            with pytest.raises(WebSocketDisconnect) as error:
                socket.receive_json()
            assert error.value.code == 1003
        with client.websocket_connect(WS):
            assert client.get(SNAPSHOT).json() == {"pose": None, "stale": True}


def test_websocket_rejects_binary_frames() -> None:
    app = create_app(
        ControlPlaneApplication(
            start_dispatcher=False,
            settings=Settings(
                robot_mode="mock",
                database_path=":memory:",
            ),
        )
    )
    with TestClient(app) as client, client.websocket_connect(WS) as socket:
        socket.send_bytes(b'{"x":1,"y":2}')
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1003


def test_websocket_duplicate_does_not_disturb_owner() -> None:
    application = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            robot_mode="mock",
            database_path=":memory:",
        ),
    )
    accepted = Event()

    def observe(event):
        if event["event_type"] == "robot.pose":
            accepted.set()

    application.store.subscribe(observe)
    with TestClient(create_app(application)) as client, client.websocket_connect(WS) as owner:
        with pytest.raises(WebSocketDisconnect) as error, client.websocket_connect(WS):
            pass
        assert error.value.code == 1008
        owner.send_json({"x": 1, "y": -2})
        assert accepted.wait(1)
        assert client.get(SNAPSHOT).json()["stale"] is False


def test_disconnect_and_reconnect_preserve_last_pose_but_not_freshness() -> None:
    application = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            robot_mode="mock",
            database_path=":memory:",
        ),
    )
    accepted, released = Event(), Event()
    events = []

    def observe(event):
        events.append(event)
        if event["event_type"] == "robot.pose":
            accepted.set()
        if event["event_type"] == "robot.pose.stale":
            released.set()

    application.store.subscribe(observe)
    with TestClient(create_app(application)) as client:
        assert client.get(SNAPSHOT).json() == {"pose": None, "stale": True}
        with client.websocket_connect(WS) as socket:
            socket.send_json({"x": -1.865, "y": -4.705, "yaw": 1.57})
            assert accepted.wait(1)
            fresh = client.get(SNAPSHOT).json()
            assert fresh["stale"] is False
            assert fresh["pose"]["x"] == -1.865
            assert fresh["pose"]["yaw"] == 1.57
            assert events[-1]["payload"] == fresh
            socket.close()
            assert released.wait(1)
        stale = client.get(SNAPSHOT).json()
        assert stale == {"pose": fresh["pose"], "stale": True}
        assert events[-1]["payload"] == stale
        with client.websocket_connect(WS) as socket:
            assert client.get(SNAPSHOT).json() == stale
            accepted.clear()
            socket.send_json({"x": 0, "y": 0})
            assert accepted.wait(1)
            assert client.get(SNAPSHOT).json()["stale"] is False


def test_receive_timeout_emits_stale_without_a_snapshot_request() -> None:
    application = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            robot_mode="mock",
            database_path=":memory:",
        ),
    )
    accepted = Event()
    events = []

    def observe(event):
        events.append(event)
        if event["event_type"] == "robot.pose":
            accepted.set()

    application.store.subscribe(observe)
    app = create_app(application)
    app.state.pose_timeout = 0.1
    with TestClient(app) as client, client.websocket_connect(WS) as socket:
        socket.send_json({"x": 1, "y": 2})
        assert accepted.wait(1)
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 1001
        assert events[-1]["event_type"] == "robot.pose.stale"
        assert events[-1]["payload"]["stale"] is True
        assert events[-1]["payload"]["pose"]["x"] == 1

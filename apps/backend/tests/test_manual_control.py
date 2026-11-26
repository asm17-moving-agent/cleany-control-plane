import json
from pathlib import Path

import httpx
import pytest
from account_support import authorize
from fastapi.testclient import TestClient

from control_plane.domain import MissionTarget, Priority, TargetKind
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings

STATUS = dict(
    connected=True,
    ready=True,
    phase="idle",
    mock=True,
    stop_confirmed=True,
    enabled=False,
    web_max_velocity=2,
    velocity=[0.0] * 4,
)
COMMAND = dict(
    client="browser-1234567890", sequence=1, action="press", direction="forward", speed=0.5
)
BASE = "/api/robots/cleany-01/manual/"


@pytest.fixture
def rig(tmp_path):
    token = tmp_path / "token"
    token.write_text("test-private-phone-token-123456789")
    application = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            database_path=":memory:",
            cookie_secure=False,
            allowed_origins=["http://test"],
            teleop_url="http://127.0.0.1:8766",
            teleop_token_file=str(token),
        ),
    )
    requests = []
    reply = dict(STATUS)

    def transport(request):
        requests.append(request)
        if reply.get("timeout"):
            raise httpx.ReadTimeout("synthetic", request=request)
        if reply.get("reject"):
            return httpx.Response(409, json={"error": "이전 요청은 처리하지 않습니다"})
        return httpx.Response(200, json=reply)

    application.manual.transport = httpx.MockTransport(transport)
    with TestClient(create_app(application), base_url="http://test") as client:
        yield client, application, requests, reply


def login(client, app):
    authorize(client, app)
    client.params = {"site_id": "BUSAN_SOMA_18F"}


def test_auth_scope_csrf_and_secret_boundary(rig):
    client, app, requests, _ = rig
    assert client.get(BASE + "status").status_code == 401
    login(client, app)
    assert client.get(BASE + "status", params={"site_id": "BUSAN_SOMA_19F"}).status_code == 404
    assert (
        client.post(BASE + "control", json=COMMAND, headers={"X-CSRF-Token": "bad"}).status_code
        == 403
    )
    assert (
        client.post(BASE + "control", json=COMMAND, headers={"Origin": "http://evil"}).status_code
        == 403
    )
    assert not requests
    response = client.get(BASE + "status")
    assert response.json()["mock"] and response.json()["ready"]
    assert "token" not in response.text
    assert client.post(BASE + "control", json=COMMAND).status_code == 200
    payload = json.loads(requests[-1].content)
    assert "vector" not in payload
    assert payload["ui_version"] == 2
    assert payload["client"] != COMMAND["client"] and len(payload["client"]) == 64
    assert requests[-1].headers["Origin"] == "http://127.0.0.1:8766"
    assert requests[-1].headers["X-Control-Token"] == "test-private-phone-token-123456789"


@pytest.mark.parametrize(
    "patch",
    [
        {"action": "pause"},
        {"speed": 11},
        {"sequence": True},
        {"client": "bad"},
        {"vector": [1, 0]},
        {"vector": [1.1, 0, 0]},
        {"vector": [True, 0, 0]},
        {"vector": ["1", 0, 0]},
    ],
)
def test_command_allowlist(rig, patch):
    client, app, requests, _ = rig
    login(client, app)
    assert client.post(BASE + "control", json={**COMMAND, **patch}).status_code == 422
    assert not requests


def test_pending_work_blocks_motion_but_not_stop(rig):
    client, app, requests, _ = rig
    login(client, app)
    identity = app.accounts.authenticate(client.cookies["cleany_session"])
    with app.store.transaction():
        app.store.create_mission(
            target=MissionTarget(TargetKind.SEAT, "seat-01"),
            priority=Priority.NORMAL,
            requested_by=identity.user_id,
            customer_id=identity.customer_id,
            site_id="BUSAN_SOMA_18F",
            requested_membership_id=identity.membership_id,
            idempotency_key="pending",
        )
    assert client.post(BASE + "control", json=COMMAND).status_code == 409
    assert not requests
    assert client.get(BASE + "status").json()["blocked_reason"]
    assert client.post(BASE + "control", json={**COMMAND, "action": "stop"}).status_code == 200


def test_unavailable_and_unknown_states_never_ready(rig):
    client, app, requests, reply = rig
    login(client, app)
    reply["timeout"] = True
    assert not client.get(BASE + "status").json()["ready"]
    assert client.post(BASE + "control", json=COMMAND).status_code == 503
    reply.clear()
    assert not client.get(BASE + "status").json()["available"]
    reply.update(STATUS, reject=True)
    assert client.post(BASE + "control", json=COMMAND).status_code == 409


def test_manual_motion_blocks_new_mission(rig):
    client, app, _, reply = rig
    login(client, app)
    reply.update(phase="moving", enabled=True, stop_confirmed=False)
    result = client.post(
        "/api/missions", json=dict(seat_id="seat-01", priority="NORMAL", idempotency_key="new")
    )
    assert result.status_code == 409
    assert "수동 조종" in result.json()["detail"]
    assert not app.store.list_missions()


def test_stop_bypasses_admission_lock(rig):
    client, app, _, _ = rig
    login(client, app)
    client.portal.call(app.manual.lock.acquire)
    try:
        assert client.post(BASE + "control", json={**COMMAND, "action": "stop"}).status_code == 200
    finally:
        client.portal.call(app.manual.lock.release)


def test_backend_mock_mode_has_no_physical_relay(rig):
    client, app, requests, _ = rig
    login(client, app)
    app.settings.robot_mode = "mock"
    assert not client.get(BASE + "status").json()["configured"]
    assert client.post(BASE + "control", json=COMMAND).status_code == 503
    assert not requests


@pytest.mark.parametrize(
    "url",
    [
        "http://other-host:8766",
        "https://127.0.0.1",
        "http://a:b@127.0.0.1",
        "http://127.0.0.1/api/control",
    ],
)
def test_loopback_origin_only(url):
    with pytest.raises(ValueError):
        Settings(teleop_url=url)


def test_analog_vector_passes_to_phone_without_quantization(rig):
    client, app, requests, _ = rig
    login(client, app)
    vector = [0.37, -0.52, 0.21]
    assert (
        client.post(BASE + "control", json={**COMMAND, "vector": vector, "speed": 0.1}).status_code
        == 200
    )
    payload = json.loads(requests[-1].content)
    assert payload["vector"] == vector
    assert payload["speed"] == 0.1


def test_local_gamepad_shares_admission_and_does_not_release_browser(tmp_path):
    import os
    import socket
    import time

    path = tmp_path / "pad.sock"
    token = tmp_path / "phone-token"
    token.write_text("test-private-phone-token-123456789")
    app = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            database_path=":memory:",
            cookie_secure=False,
            allowed_origins=["http://test"],
            teleop_url="http://127.0.0.1:8766",
            teleop_token_file=str(token),
            gamepad_socket=str(path),
        ),
    )
    received = []

    reject_update = None

    def upstream(request):
        received.append(json.loads(request.content))
        if reject_update and received[-1]["action"] == "gamepad_update":
            return httpx.Response(409, json=reject_update)
        return httpx.Response(200, json=STATUS)

    def pad(action, sequence, age=0):
        with socket.socket(socket.AF_UNIX) as peer:
            peer.settimeout(1)
            peer.connect(str(path))
            obj = dict(
                command={**COMMAND, "action": action, "sequence": sequence},
                expires_at=time.monotonic() + 0.14 - age,
            )
            peer.sendall(json.dumps(obj).encode() + b"\n")
            with peer.makefile("rb") as output:
                return json.loads(output.readline())

    app.manual.transport = httpx.MockTransport(upstream)
    with TestClient(create_app(app), base_url="http://test") as client:
        assert os.stat(path).st_mode & 0o777 == 0o600
        assert not pad("press", 0)["ok"]  # 미등록 로봇
        login(client, app)
        assert client.post(BASE + "control", json=COMMAND).status_code == 200
        browser = received[-1]["client"]
        assert pad("press", 1)["ok"]
        physical = received[-1]["client"]
        assert physical != browser and received[-1]["action"] == "gamepad_press"
        rejected = pad("update", 2, age=1)
        assert not rejected["ok"] and rejected["discarded"]
        assert received[-1]["action"] == "gamepad_press"
        for response_body, discarded in [
            ({"error": "만료된 패드 입력입니다"}, True),
            ({"error": "이전 요청은 처리하지 않습니다", "stale_request": True}, True),
            ({"error": "조종이 종료되었습니다"}, False),
        ]:
            reject_update = response_body
            rejected = pad("update", len(received) + 2)
            assert not rejected["ok"] and rejected["discarded"] is discarded
        reject_update = None
        identity = app.accounts.authenticate(client.cookies["cleany_session"])
        with app.store.transaction():
            app.store.create_mission(
                target=MissionTarget(TargetKind.SEAT, "seat-01"),
                priority=Priority.NORMAL,
                requested_by=identity.user_id,
                customer_id=identity.customer_id,
                site_id="BUSAN_SOMA_18F",
                requested_membership_id=identity.membership_id,
                idempotency_key="pad-pending",
            )
        rejected = pad("update", 10)
        assert not rejected["ok"] and not rejected["discarded"]
        client.portal.call(app.manual.lock.acquire)
        try:
            assert pad("stop", 11)["ok"]
        finally:
            client.portal.call(app.manual.lock.release)
        assert received[-1]["action"] == "release" and received[-1]["client"] == physical
    assert not path.exists()


def test_relay_reuses_client_and_reads_rotated_token(rig):
    client, app, requests, _ = rig
    login(client, app)
    assert client.get(BASE + "status").status_code == 200
    pool = app.manual._client

    Path(app.settings.teleop_token_file).write_text("rotated-local-phone-token-123456789")
    assert client.post(BASE + "control", json=COMMAND).status_code == 200
    assert pool is not None and app.manual._client is pool
    assert requests[-1].headers["X-Control-Token"] == "rotated-local-phone-token-123456789"

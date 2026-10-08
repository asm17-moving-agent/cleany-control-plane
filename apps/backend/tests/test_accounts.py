import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from control_plane.accounts import AuthError
from control_plane.persistence import SQLiteRepository
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings

PASSWORD = "customer-user-password-2026"


@pytest.fixture
def application():
    app = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            database_path=":memory:",
            robot_mode="mock",
            cookie_secure=False,
            allowed_origins=["http://testserver"],
            auth_stream_recheck_seconds=0.05,
        ),
    )
    yield app
    app.store.repository.close()


def issue(app, login_id="owner"):
    customer = app.accounts.create_customer(login_id)
    site = app.accounts.create_site(customer, login_id + " site")
    user, temporary = app.accounts.provision(customer, login_id, login_id)
    return customer, site, user, temporary


def sign_in(client, login, password):
    response = client.post("/api/auth/login", json={"login_id": login, "password": password})
    assert response.status_code == 200, response.text
    client.headers["x-csrf-token"] = response.json()["csrf_token"]
    return response.json()


def make_client(app):
    return TestClient(create_app(app), headers={"Origin": "http://testserver"})


def test_temporary_login_is_limited_and_change_rotates_all_sessions(application):
    _, _, user, temporary = issue(application)
    with make_client(application) as client:
        assert client.get("/api/missions").status_code == 401
        assert sign_in(client, " OWNER ", temporary)["must_change_password"]
        old_cookie = client.cookies.get("cleany_session")
        assert client.get("/api/sites").status_code == 403
        assert client.get("/api/events/stream").status_code == 403
        assert client.get("/api/robots/cleany-01/pose").status_code == 403
        changed = client.post("/api/auth/password/change", json={"password": PASSWORD})
        assert changed.status_code == 200
        assert changed.json()["must_change_password"] is False
        client.headers["x-csrf-token"] = changed.json()["csrf_token"]
        assert client.get("/api/sites").status_code == 200
        with pytest.raises(AuthError):
            application.accounts.authenticate(old_cookie, full=False)
        new_cookie = client.cookies.get("cleany_session")
        application.accounts.reset(user)
        with pytest.raises(AuthError):
            application.accounts.authenticate(new_cookie)
        assert client.get("/api/auth/me").status_code == 401
        assert (
            client.post(
                "/api/auth/login", json={"login_id": "owner", "password": temporary}
            ).status_code
            == 401
        )


def test_customer_scope_csrf_and_device_identity(application):
    a, site_a, user_a, temporary_a = issue(application, "a")
    _, site_b, _, temporary_b = issue(application, "b")
    robot_token = application.accounts.register_robot(a, site_a)
    with make_client(application) as client:
        sign_in(client, "a", temporary_a)
        changed = client.post("/api/auth/password/change", json={"password": PASSWORD}).json()
        client.headers["x-csrf-token"] = changed["csrf_token"]
        request = {
            "seat_id": "seat-12",
            "priority": "NORMAL",
            "requested_by": "spoofed",
            "idempotency_key": "same",
        }
        created = client.post("/api/missions", json=request)
        assert created.status_code == 201
        assert created.json()["requested_by"] == user_a
        mission_id = created.json()["mission_id"]
        assert client.get("/api/missions", params={"site_id": site_b}).status_code == 404
        assert (
            client.post(
                "/api/missions", json=request, headers={"Origin": "https://attacker.invalid"}
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/missions", json=request, headers={"x-csrf-token": "wrong"}
            ).status_code
            == 403
        )
        sign_in(client, "b", temporary_b)
        changed = client.post("/api/auth/password/change", json={"password": PASSWORD}).json()
        client.headers["x-csrf-token"] = changed["csrf_token"]
        assert client.get("/api/missions").json()["items"] == []
        assert client.post(f"/api/missions/{mission_id}/cancel").status_code == 404
        assert client.get("/api/robots").json()["items"] == []
        assert client.get("/api/robots/cleany-01/pose").status_code == 404
        # Same seat IDs in another customer's fixture cannot dispatch to A's robot.
        assert client.post("/api/missions", json=request).status_code == 409
        assert application.accounts.robot_scope("cleany-01", "wrong") is None
        assert application.accounts.robot_scope("cleany-01", robot_token) == (a, site_a)


def test_expiry_disable_idle_and_login_limit(application, monkeypatch):
    _, _, user, temporary = issue(application)
    token = application.accounts.login("owner", temporary, "ip")
    with application.store.transaction():
        application.accounts.db.execute(
            "UPDATE users SET temporary_password_expires_at=0 WHERE user_id=?", (user,)
        )
    with pytest.raises(AuthError):
        application.accounts.authenticate(token, full=False)
    temporary = application.accounts.reset(user, reactivate=True)
    token = application.accounts.login("owner", temporary, "ip")
    token = application.accounts.change_password(token, PASSWORD)
    with application.store.transaction():
        application.accounts.db.execute("UPDATE sessions SET last_activity_at=0")
    with pytest.raises(AuthError):
        application.accounts.authenticate(token)
    token = application.accounts.login("owner", PASSWORD, "ip")
    application.accounts.disable(user)
    with pytest.raises(AuthError):
        application.accounts.authenticate(token)
    for _ in range(application.settings.auth_identity_limit):
        with pytest.raises(AuthError):
            application.accounts.login("missing", "wrong", "throttle")
    with pytest.raises(AuthError) as error:
        application.accounts.login("missing", "wrong", "throttle")
    assert error.value.status == 429


def test_v1_migration_preserves_terminal_bytes_and_recovery_records(tmp_path):
    path = str(tmp_path / "v1.db")
    db = sqlite3.connect(path)
    payload = '{ "phase": "TERMINAL", "outcome": "SUCCESS", "idempotency_key": "old" }'
    db.executescript(
        "CREATE TABLE missions(mission_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,"
        "active INTEGER,payload TEXT); PRAGMA user_version=1;"
    )
    db.execute("INSERT INTO missions VALUES('old','old',0,?)", (payload,))
    db.commit()
    db.close()
    repo = SQLiteRepository(path)
    assert repo.connection.execute("SELECT payload FROM missions").fetchone()[0] == payload
    assert repo.connection.execute("PRAGMA user_version").fetchone()[0] == 2
    with pytest.raises(sqlite3.IntegrityError):
        repo.connection.execute("UPDATE missions SET payload=?", (json.dumps({"phase": "QUEUED"}),))
    assert repo.connection.execute("PRAGMA foreign_key_check").fetchall() == []
    repo.close()


def test_two_customers_can_use_same_key_and_cross_customer_fk_is_rejected(application):
    a, sa, ua, _ = issue(application, "a")
    b, sb, ub, _ = issue(application, "b")
    db = application.accounts.db
    ma = db.execute("SELECT membership_id FROM memberships WHERE user_id=?", (ua,)).fetchone()[0]
    mb = db.execute("SELECT membership_id FROM memberships WHERE user_id=?", (ub,)).fetchone()[0]
    first, _ = application.store.create_mission(
        seat_id="seat-12",
        priority="NORMAL",
        requested_by=ua,
        idempotency_key="same",
        customer_id=a,
        site_id=sa,
        requested_membership_id=ma,
    )
    second, _ = application.store.create_mission(
        seat_id="seat-12",
        priority="NORMAL",
        requested_by=ub,
        idempotency_key="same",
        customer_id=b,
        site_id=sb,
        requested_membership_id=mb,
    )
    assert first.mission_id != second.mission_id
    with pytest.raises(sqlite3.IntegrityError):
        application.store.create_mission(
            seat_id="seat-12",
            priority="NORMAL",
            requested_by=ua,
            idempotency_key="cross",
            customer_id=a,
            site_id=sb,
            requested_membership_id=ma,
        )
    assert len(application.store.list_missions()) == 2


def test_observations_are_private_and_cannot_escape_storage(application, tmp_path):
    a, site, _, temporary = issue(application, "a")
    issue(application, "b")
    application.accounts.register_robot(a, site)
    application.settings.observation_directory = str(tmp_path / "observations")
    root = tmp_path / "observations"
    root.mkdir()
    (root / "before.jpg").write_bytes(b"private-photo")
    (tmp_path / "outside.jpg").write_bytes(b"outside-photo")
    with make_client(application) as client:
        sign_in(client, "a", temporary)
        changed = client.post("/api/auth/password/change", json={"password": PASSWORD}).json()
        client.headers["x-csrf-token"] = changed["csrf_token"]
        created = client.post(
            "/api/missions",
            json={"seat_id": "seat-12", "priority": "NORMAL", "idempotency_key": "photo"},
        ).json()
        mission_id = created["mission_id"]
        mission = application.store.get_mission(mission_id)
        with application.store.transaction():
            mission.before_observation = "observation://before.jpg"
            mission.after_observation = "https://private.invalid/raw-secret.jpg"
        item = client.get("/api/missions").json()["items"][0]
        path = item["before_observation"]
        assert path == f"/api/missions/{mission_id}/observations/before"
        assert "private.invalid" not in item["after_observation"]
        assert client.get(path).content == b"private-photo"
        with application.store.transaction():
            mission.before_observation = "observation://../outside.jpg"
        assert client.get(path).status_code == 404
        client.cookies.clear()
        assert client.get(path).status_code == 401
        temporary_b = application.accounts.reset(
            application.accounts.db.execute(
                "SELECT user_id FROM users WHERE login_id='b'"
            ).fetchone()[0]
        )
        # A new full B session still cannot read A's media.
        token = application.accounts.login("b", temporary_b, "b")
        token = application.accounts.change_password(token, PASSWORD)
        client.cookies.set("cleany_session", token)
        assert client.get(path).status_code == 404


def test_sse_filters_customers_and_closes_revoked_session(application):
    import asyncio

    from starlette.requests import Request

    a, sa, ua, ta = issue(application, "a")
    b, sb, ub, _ = issue(application, "b")
    token = application.accounts.change_password(application.accounts.login("a", ta, "a"), PASSWORD)
    identity = application.accounts.authenticate(token)
    mb = application.accounts.db.execute(
        "SELECT membership_id FROM memberships WHERE user_id=?", (ub,)
    ).fetchone()[0]
    app = create_app(application)
    endpoint = next(
        route.endpoint
        for route in app.routes
        if getattr(route, "path", None) == "/api/events/stream"
    )

    async def exercise():
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/events/stream",
                "query_string": f"site_id={sa}".encode(),
                "headers": [(b"cookie", f"cleany_session={token}".encode())],
                "state": {"identity": identity},
            }
        )
        response = await endpoint(request)
        iterator = response.body_iterator
        assert "connected" in await anext(iterator)
        application.store.create_mission(
            seat_id="seat-12",
            priority="NORMAL",
            requested_by=ub,
            idempotency_key="b",
            customer_id=b,
            site_id=sb,
            requested_membership_id=mb,
        )
        assert "heartbeat" in await anext(iterator)
        application.store.create_mission(
            seat_id="seat-12",
            priority="NORMAL",
            requested_by=ua,
            idempotency_key="a",
            customer_id=a,
            site_id=sa,
            requested_membership_id=identity.membership_id,
        )
        assert "mission.created" in await anext(iterator)
        application.accounts.disable(ua)
        assert "auth.expired" in await anext(iterator)
        with pytest.raises(StopAsyncIteration):
            await anext(iterator)
        assert not application.store._listeners

    asyncio.run(exercise())


def test_migration_refuses_unresolved_missions_without_binding_owners(tmp_path):
    path = str(tmp_path / "active.db")
    with sqlite3.connect(path) as db:
        db.executescript(
            "CREATE TABLE missions(mission_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,"
            "active INTEGER,payload TEXT); PRAGMA user_version=1;"
        )
        db.execute("INSERT INTO missions VALUES('active','key',1,?)", ('{"phase":"RUNNING"}',))
    with pytest.raises(ValueError, match="unresolved"):
        SQLiteRepository(path)
    with sqlite3.connect(path) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 1
        assert db.execute("SELECT active,payload FROM missions").fetchone() == (
            1,
            '{"phase":"RUNNING"}',
        )
        assert not db.execute("SELECT name FROM sqlite_master WHERE name='customers'").fetchone()

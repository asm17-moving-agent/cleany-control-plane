from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from control_plane.domain import MissionOutcome, MissionPhase
from control_plane.persistence import SQLiteRepository
from control_plane.schemas import MissionRequest
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings


@pytest.fixture
def workspace(tmp_path):
    path = str(tmp_path / "workspace.db")
    app = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            database_path=path,
            robot_mode="mock",
            cookie_secure=False,
            allowed_origins=["http://testserver"],
        ),
    )
    customer = app.accounts.create_customer("Test customer")
    site = app.accounts.create_site(customer, "Test site")
    other_site = app.accounts.create_site(customer, "Other site")
    _, password = app.accounts.provision(customer, "operator", "Test operator")
    token = app.accounts.login("operator", password, "test")
    token = app.accounts.change_password(token, "workspace-test-password-2026")
    identity = app.accounts.authenticate(token)
    app.accounts.register_robot(customer, site)
    with TestClient(create_app(app), headers={"Origin": "http://testserver"}) as client:
        client.cookies.set("cleany_session", token)
        client.headers["x-csrf-token"] = identity.csrf_token
        yield app, client, identity, site, other_site, path
    app.store.repository.close()


def make_mission(app, identity, site, key, created, finished=None):
    with app.store.transaction():
        mission, _ = app.create_mission(
            MissionRequest(
                seat_id="seat-12",
                priority="NORMAL",
                idempotency_key=key,
            ),
            identity,
            site,
        )
        mission.created_at = created
        if finished:
            mission.phase = MissionPhase.TERMINAL
            mission.outcome = MissionOutcome.FAILED
            mission.finished_at = finished
        return mission


def test_day_history_uses_korean_dates_and_does_not_truncate_at_fifty(workspace):
    app, client, identity, site, other_site, _ = workspace
    with app.store.transaction():
        for i in range(105):
            make_mission(app, identity, site, str(i), "2026-11-16T15:00:00+00:00")
        carried_result = make_mission(
            app,
            identity,
            site,
            "overnight",
            "2026-11-15T10:00:00+00:00",
            "2026-11-17T01:00:00+00:00",
        )
        make_mission(app, identity, other_site, "foreign-site", "2026-11-16T15:00:00+00:00")
        make_mission(
            app,
            identity,
            site,
            "before-midnight",
            "2026-11-16T14:59:59+00:00",
            "2026-11-16T14:59:59+00:00",
        )
    params = {"day": "2026-11-17", "site_id": site, "limit": 100}
    first = client.get("/api/missions", params=params).json()["items"]
    assert len(first) == 100
    last = first[-1]
    second = client.get(
        "/api/missions", params={**params, "before": last["created_at"] + "|" + last["mission_id"]}
    ).json()["items"]
    assert len(second) == 6
    ids = [m["mission_id"] for m in first + second]
    assert len(set(ids)) == 106 and carried_result.mission_id in ids
    assert client.get("/api/missions", params={**params, "day": "2026-02-30"}).status_code == 422
    assert (
        client.get(
            f"/api/missions/{carried_result.mission_id}", params={"site_id": other_site}
        ).status_code
        == 404
    )


def test_today_includes_pending_work_carried_from_an_earlier_day(workspace):
    app, client, identity, site, _, _ = workspace
    now = datetime.now(UTC)
    yesterday = (now - timedelta(days=2)).isoformat()
    mission = make_mission(app, identity, site, "carried", yesterday)
    today = (now + timedelta(hours=9)).date().isoformat()
    items = client.get("/api/missions", params={"site_id": site, "day": today}).json()["items"]
    assert [m["mission_id"] for m in items] == [mission.mission_id]


def test_review_is_durable_idempotent_scoped_and_does_not_mutate_terminal_payload(workspace):
    app, client, identity, site, other_site, path = workspace
    mission = make_mission(
        app, identity, site, "result", "2026-11-16T15:00:00+00:00", "2026-11-16T15:01:00+00:00"
    )
    queued = make_mission(app, identity, site, "queued", "2026-11-16T15:00:00+00:00")
    original = app.accounts.db.execute(
        "SELECT payload FROM missions WHERE mission_id=?", (mission.mission_id,)
    ).fetchone()[0]
    events = []
    unsubscribe = app.store.subscribe(events.append)
    url = f"/api/missions/{mission.mission_id}/review?site_id={site}"
    assert client.post(url, headers={"x-csrf-token": "wrong"}).status_code == 403
    assert (
        client.post(f"/api/missions/{mission.mission_id}/review?site_id={other_site}").status_code
        == 404
    )
    assert (
        client.post(f"/api/missions/{queued.mission_id}/review?site_id={site}").status_code == 409
    )
    first = client.post(url)
    assert first.status_code == 200
    again = client.post(url)
    assert again.json() == first.json()
    assert first.json()["review"]["reviewed_by"] == identity.user_id
    assert first.json()["outcome"] == "FAILED"
    assert len([e for e in events if e["event_type"] == "mission.reviewed"]) == 1
    assert (
        app.accounts.db.execute(
            "SELECT payload FROM missions WHERE mission_id=?", (mission.mission_id,)
        ).fetchone()[0]
        == original
    )
    other_customer = app.accounts.create_customer("Other customer")
    app.accounts.create_site(other_customer, "Foreign site")
    _, password = app.accounts.provision(other_customer, "other", "Other operator")
    other_token = app.accounts.login("other", password, "test")
    other_token = app.accounts.change_password(other_token, "workspace-other-password-2026")
    client.cookies.set("cleany_session", other_token)
    client.headers["x-csrf-token"] = app.accounts.authenticate(other_token).csrf_token
    assert client.get(f"/api/missions/{mission.mission_id}").status_code == 404
    assert client.post(f"/api/missions/{mission.mission_id}/review").status_code == 404
    unsubscribe()
    reopened = SQLiteRepository(path)
    try:
        assert (
            reopened.connection.execute(
                "SELECT reviewed_by FROM mission_reviews WHERE mission_id=?", (mission.mission_id,)
            ).fetchone()[0]
            == identity.user_id
        )
        assert (
            reopened.connection.execute(
                "SELECT payload FROM missions WHERE mission_id=?", (mission.mission_id,)
            ).fetchone()[0]
            == original
        )
    finally:
        reopened.close()

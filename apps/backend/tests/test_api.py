from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from control_plane.server import ControlPlaneApplication, create_app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def make_client() -> AsyncIterator[AsyncClient]:
    application = ControlPlaneApplication(start_dispatcher=False)
    transport = ASGITransport(app=create_app(application))
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def mission_request(**overrides: str) -> dict[str, str]:
    return {
        "seat_id": "seat-18",
        "priority": "NORMAL",
        "requested_by": "test-operator",
        "idempotency_key": "request-1",
        **overrides,
    }


def zone_mission_request() -> dict[str, object]:
    return {
        "target": {"kind": "ZONE", "reference_id": "space-a1", "label": "SPACE A1"},
        "priority": "NORMAL",
        "requested_by": "test-operator",
        "idempotency_key": "zone-request-1",
    }


@pytest.mark.anyio
async def test_health_and_fixture_endpoints() -> None:
    async for client in make_client():
        assert (await client.get("/api/health")).json() == {"status": "ok"}
        assert len((await client.get("/api/seats")).json()["items"]) == 48
        robots = (await client.get("/api/robots")).json()["items"]
        assert robots[0]["robot_id"] == "cleany-01"


@pytest.mark.anyio
async def test_create_and_list_mission() -> None:
    async for client in make_client():
        created = await client.post("/api/missions", json=mission_request())
        assert created.status_code == 201
        mission = created.json()
        assert mission["seat_id"] == "seat-18"
        assert mission["phase"] == "QUEUED"
        assert (await client.get("/api/missions")).json()["items"] == [mission]


@pytest.mark.anyio
async def test_create_zone_mission() -> None:
    async for client in make_client():
        created = await client.post("/api/missions", json=zone_mission_request())
        assert created.status_code == 201
        mission = created.json()
        assert mission["target"] == {
            "kind": "ZONE",
            "reference_id": "space-a1",
            "label": "SPACE A1",
        }
        assert mission["seat_id"] is None


@pytest.mark.anyio
async def test_idempotent_request_returns_existing_mission() -> None:
    async for client in make_client():
        first = await client.post("/api/missions", json=mission_request())
        second = await client.post("/api/missions", json=mission_request())
        assert first.status_code == 201
        assert second.status_code == 200
        assert second.json()["mission_id"] == first.json()["mission_id"]


@pytest.mark.anyio
async def test_cancel_and_validation_errors() -> None:
    async for client in make_client():
        mission = (await client.post("/api/missions", json=mission_request())).json()
        cancelled = await client.post(f"/api/missions/{mission['mission_id']}/cancel")
        assert cancelled.status_code == 202
        assert cancelled.json()["cancel_requested"] is True
        assert (await client.post("/api/missions/missing/cancel")).status_code == 404
        invalid = await client.post("/api/missions", json=mission_request(priority="URGENT"))
        assert invalid.status_code == 422
        missing_target = mission_request()
        missing_target.pop("seat_id")
        assert (await client.post("/api/missions", json=missing_target)).status_code == 422
        both_targets = mission_request()
        both_targets["target"] = {
            "kind": "ZONE",
            "reference_id": "space-a1",
        }
        assert (await client.post("/api/missions", json=both_targets)).status_code == 422

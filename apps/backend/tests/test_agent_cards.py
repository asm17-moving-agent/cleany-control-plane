from datetime import datetime, timedelta

import pytest
from test_agent import FakeProvider, send, setup

from control_plane.agent_models import AgentMessage
from control_plane.agent_tools import KST
from control_plane.domain import MissionOutcome, MissionPhase


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_snapshots_follow_explicit_scoped_tool_calls_and_survive_reload():
    cp, client = await setup()
    async with client:
        created = await client.post(
            "/api/missions",
            json={
                "seat_id": "seat-18",
                "priority": "NORMAL",
                "idempotency_key": "card-target",
            },
        )
        mission_id = created.json()["mission_id"]
        cp.agent.provider = FakeProvider([("get_latest_seat_mission", {"seat_id": "seat-18"})])
        key, events = await send(client, "18번 진행 상태는?")
        message = events[-1]["message"]
        [card] = message["cards"]
        assert card["kind"] == "mission_progress" and card["phase"] == "QUEUED"
        assert card["mission_id"] == mission_id
        with cp.store.transaction():
            cp.store.get_mission(mission_id).phase = MissionPhase.NAVIGATING
        saved = (await client.get(f"/api/agent/conversations/{key}")).json()
        assert saved["messages"][-1]["cards"] == [card]
        previous = AgentMessage.model_validate({k: v for k, v in message.items() if k != "cards"})
        assert previous.cards == []
        # Preloading a selected mission into context must not display it for an unrelated question.
        cp.agent.provider = FakeProvider()
        _, unrelated = await send(client, "안녕", {"page": "/missions", "mission_id": mission_id})
        assert not unrelated[-1]["message"]["cards"]
        cp.agent.provider = FakeProvider([("get_mission", {"mission_id": mission_id})])
        client.params = {"site_id": "BUSAN_SOMA_19F"}
        _, foreign = await send(client, "진행 상태는?")
        assert not foreign[-1]["message"]["cards"]


@pytest.mark.anyio
@pytest.mark.parametrize("single_range", [True, False])
async def test_compare_two_kst_days_with_nonzero_counts_and_no_incidental_mission_cards(
    single_range,
):
    cp, client = await setup()
    d = datetime.now(KST).replace(hour=9, minute=0, second=0, microsecond=0)
    today, yesterday = d.date().isoformat(), (d.date() - timedelta(days=1)).isoformat()
    async with client:
        r = await client.post(
            "/api/missions",
            json={
                "seat_id": "seat-18",
                "priority": "NORMAL",
                "idempotency_key": "two-dates",
            },
        )
        with cp.store.transaction():
            mission = cp.store.get_mission(r.json()["mission_id"])
            mission.created_at = (d - timedelta(days=1)).isoformat()
            mission.finished_at = d.isoformat()
            mission.phase, mission.outcome = MissionPhase.TERMINAL, MissionOutcome.CANCELLED

        def history(start, end, seat=None):
            return "mission_history", {"start_day": start, "end_day": end, "seat_id": seat}

        calls = (
            [history(yesterday, today)]
            if single_range
            else [history(today, today), history(yesterday, yesterday)]
        )
        cp.agent.provider = FakeProvider(calls)
        _, events = await send(client, "어제랑 오늘 비교해 줘")
        msg = events[-1]["message"]
        [card] = msg["cards"]
        assert card["kind"] == "day_comparison" and not msg["summaries"]
        assert card["earlier"]["day"] == yesterday and card["later"]["day"] == today
        assert card["earlier"]["requested"] == card["later"]["cancelled"] == 1
        assert card["later"]["requested"] == card["earlier"]["cancelled"] == 0
        cp.agent.provider = FakeProvider(
            [history(today, today), history(yesterday, yesterday, "seat-18")]
        )
        _, mixed = await send(client, "서로 다른 범위")
        assert not mixed[-1]["message"]["cards"] and mixed[-1]["message"]["summaries"]

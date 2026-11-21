"""Check the data behind an operations card independently of model routing."""

from datetime import datetime, time, timedelta

import pytest
from test_agent import FakeProvider, send, setup

from control_plane.agent_tools import KST


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def cards(cp, client, kind, question, selected=(), day=None):
    args = {"view": kind, "start_day": day, "end_day": day}
    cp.agent.provider = FakeProvider([("show_operations_view", args)])
    _, events = await send(client, question, {"page": "/map", "seat_ids": list(selected)})
    message = events[-1]["message"]
    assert message["status"] == "complete" and not message["plan_ids"]
    return message["cards"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("question", "selected", "size"),
    [
        ("지도에서 좌석을 선택하려고 해", (), 82),
        ("D-HUB에서 좌석을 선택하려고 해", ("seat-18",), 48),
        ("방금 선택한 좌석만 보여줘", ("seat-18", "seat-20"), 2),
        ("방금 선택한 좌석만 보여줘", (), None),
        ("내가 골라 둔 자리만 보여줘", ("seat-20",), 1),
        ("내가 골라 둔 자리만 보여줘", (), None),
        ("선택한 자리 말고 보여줘", ("seat-20",), None),
    ],
)
async def test_picker_candidates_and_current_selection(question, selected, size):
    cp, client = await setup()
    async with client:
        result = await cards(cp, client, "seat_picker", question, selected)
        if size is None:
            assert result == []
        else:
            (card,) = result
            assert len(card["seats"]) == size
            if size <= len(selected):
                assert {r["seat_id"] for r in card["seats"]} == set(selected)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("question", "capacity", "zones"),
    [
        ("D-HUB만 완료율을 보고 싶어", 48, 1),
        ("각 구역의 완료율은 어때?", 82, 8),
        ("D-HUB와 나머지 구역의 완료율을 비교해 줘", 82, 8),
        ("D-HUB와 SPACE-M1의 완료율을 비교해 줘", 54, 2),
        ("D-HUB를 제외한 구역들의 완료율", 34, 7),
        ("D-HUB를 빼고 다른 구역들의 완료율", 34, 7),
        ("다른 구역은 빼고 D-HUB만 보여줘", 48, 1),
        ("SPACE-X9와 D-HUB의 완료율", None, None),
        ("라운지 구역만 보고 싶어", None, None),
    ],
)
async def test_zone_denominators(question, capacity, zones):
    cp, client = await setup()
    async with client:
        result = await cards(cp, client, "zone_coverage", question)
        if capacity is None:
            assert result == []
        else:
            (card,) = result
            rows = card["buckets"]
            assert len(rows) == zones
            assert card["sample_count"] == sum(r["capacity"] for r in rows) == capacity
            assert card["value"] == sum(r["value"] for r in rows) == 0
            if zones == 7:
                assert "D-HUB" not in [r["label"] for r in rows]


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("period", "first", "n_buckets", "total"),
    [("오전만", 0, 4, 2), ("오후만", 12, 4, 1), ("오전과 오후 비교", 0, 8, 3)],
)
async def test_hour_window_and_bins(period, first, n_buckets, total):
    cp, client = await setup()
    midnight = datetime.combine(datetime.now(KST).date() - timedelta(days=1), time(), KST)
    async with client:
        for i, offset in enumerate((-1, 0, 43199, 43200, 86400, 86399)):
            response = await client.post(
                "/api/missions",
                json={"seat_id": "seat-18", "priority": "NORMAL", "idempotency_key": f"scope-{i}"},
            )
            response.raise_for_status()
            with cp.store.transaction():
                mission = cp.store.get_mission(response.json()["mission_id"])
                mission.created_at = (midnight + timedelta(seconds=offset)).isoformat()
                if offset == 86399:
                    mission.site_id = "BUSAN_SOMA_19F"
        (card,) = await cards(
            cp, client, "request_hours", f"접수 시간대 {period}", day=midnight.date().isoformat()
        )
        rows = card["buckets"]
        assert [r["label"] for r in rows] == [
            f"{h:02d}–{h + 3:02d}" for h in range(first, first + 3 * n_buckets, 3)
        ]
        assert sum(r["value"] for r in rows) == card["sample_count"] == total
        expected = {"00–03": 1, "09–12": 1, "12–15": 1}
        assert all(r["value"] == expected.get(r["label"], 0) for r in rows)


@pytest.mark.anyio
async def test_two_different_days_with_halves_need_clarification():
    cp, client = await setup()
    async with client:
        assert not await cards(cp, client, "request_hours", "어제 오후와 오늘 오전 접수량 비교")


def test_draft_resolution_remains_single_zone():
    from control_plane.agent_qwen_scope import filter_inventory

    rows = [
        {"zone_id": "d-hub", "seat_id": "first", "label": "18"},
        {"zone_id": "space-m1", "seat_id": "second", "label": "M1-1"},
    ]
    assert filter_inventory("D-HUB와 SPACE-M1", rows, []) is None
    assert filter_inventory("선택한 자리", rows, []) is None

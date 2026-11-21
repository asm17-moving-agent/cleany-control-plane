from datetime import datetime, timedelta

import pytest
from test_agent import FakeProvider, send, setup

from control_plane.agent_intents import explicit_view
from control_plane.agent_provider import create_provider
from control_plane.agent_tools import KST
from control_plane.domain import MissionOutcome, MissionPhase

CASES = {
    "robot_health": "지금 연결은 살아 있어? 배터리랑 안전 상태도 한눈에 보여줘.",
    "head_camera": "로봇 앞에 뭐가 있는지 카메라 좀 켜줘.",
    "desk_photos": "18번 책상 정리하기 전이랑 끝난 뒤를 같이 보여줘.",
    "work_queue": "지금 밀린 작업이 뭐야? 내가 요청한 20번도 대기 중이야?",
    "review_inbox": "오늘 끝난 것 중에 내가 직접 확인해야 할 건 뭐야?",
    "battery_chart": "오후에 배터리가 얼마나 떨어졌어? 중간에 충전했어?",
    "event_timeline": "아까 왜 멈췄어? 그 뒤에 복구된 기록 있어?",
    "robot_position": "클리니 지금 어디 있어? 18번 책상이랑 같이 보여줘.",
    "seat_coverage": "오늘 82석 중 어디까지 정리 완료됐어?",
    "seat_picker": "D-HUB에서 로봇이 정리할 수 있는 자리 보여줘. 내가 두 개 고를게.",
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_all_ten_views_use_scoped_operational_data_and_never_create_work():
    cp, client = await setup()
    cp.settings.agent_provider = "qwen"
    cp.agent.provider = create_provider(cp.settings)
    now = datetime.now(KST)
    async with client:
        for i, seat in enumerate(["18", "18", "07", "20"]):
            response = await client.post(
                "/api/missions",
                json={
                    "seat_id": "seat-" + seat,
                    "priority": "HIGH" if seat == "20" else "NORMAL",
                    "idempotency_key": f"agent-view-{i}",
                },
            )
            response.raise_for_status()
            if seat == "20":
                continue
            with cp.store.transaction():
                m = cp.store.get_mission(response.json()["mission_id"])
                m.phase = MissionPhase.TERMINAL
                m.finished_at = (now - timedelta(seconds=i)).isoformat()
                m.outcome = MissionOutcome.FAILED if seat == "07" else MissionOutcome.SUCCESS
                m.needs_human_review = seat == "07"
        for kind, question in CASES.items():
            assert explicit_view(question) == kind
            key, events = await send(client, question, {"page": "/map"})
            msg = events[-1]["message"]
            assert msg["status"] == "complete" and [c["kind"] for c in msg["cards"]] == [kind], msg
            card = msg["cards"][0]
            assert card["site_id"] == "BUSAN_SOMA_18F"
            if kind == "work_queue":
                assert [r["seat_id"] for r in card["rows"]] == card["focus_seats"] == ["seat-20"]
            if kind == "review_inbox":
                assert [r["seat_id"] for r in card["rows"]] == ["seat-07"]
            if kind == "seat_coverage":
                assert [s["seat_id"] for s in card["seats"] if s["last_completed"]] == ["seat-18"]
                assert len(card["seats"]) == 82
            if kind == "seat_picker":
                assert {s["zone_id"] for s in card["seats"]} == {"d-hub"}
            if kind == "robot_position":
                assert card["seat_ids"] == ["seat-18"]
            if kind == "desk_photos":
                assert card["seat_id"] == "seat-18" and not card["before"] and not card["after"]
            detail = (await client.get("/api/agent/conversations/" + key)).json()
            assert detail["messages"][-1]["cards"] == [card]
            assert not detail["plans"]
        assert len(cp.store.list_missions()) == 4


@pytest.mark.anyio
async def test_no_access_to_robot_in_other_facility_and_ambiguous_photos_stay_unresolved():
    cp, client = await setup()
    async with client:
        for kind, question in [
            ("desk_photos", "1번 작업 전후 사진"),
            ("robot_health", "연결 상태"),
        ]:
            cp.agent.provider = FakeProvider([("show_operations_view", {"view": kind})])
            if kind == "robot_health":
                client.params = {"site_id": "BUSAN_SOMA_19F"}
            _, events = await send(client, question)
            assert not events[-1]["message"]["cards"]

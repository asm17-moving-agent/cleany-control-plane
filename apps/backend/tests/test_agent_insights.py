import json
from datetime import datetime, timedelta

import pytest
from test_agent import send, setup

from control_plane.agent_intents import explicit_view
from control_plane.agent_provider import OpenAIProvider, create_provider
from control_plane.agent_tools import KST, TOOLS
from control_plane.domain import MissionOutcome, MissionPhase

QUESTIONS = {
    "outcome_mix": "오늘 끝난 작업의 결과 비율은 어때?",
    "request_hours": "오늘 요청이 몰린 시간대는 언제야?",
    "elapsed_spread": "오늘 접수부터 종료까지 얼마나 걸렸어?",
    "failure_reasons": "오늘 어떤 실패 코드가 가장 자주 나왔어?",
    "zone_coverage": "오늘 구역별로 몇 석씩 정리됐어?",
    "repeat_seats": "오늘 두 번 이상 정리한 자리가 있어?",
    "photo_pairs": "오늘 전후 사진이 모두 남은 작업은 몇 건이야?",
    "run_sources": "오늘 실물과 모의 실행 비중이 어떻게 돼?",
    "review_progress": "오늘 끝난 작업의 관리자 검토가 얼마나 진행됐어?",
    "queue_age": "지금 배정까지 30분 넘게 기다린 요청이 있어?",
}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_all_insights_route_for_both_providers_and_read_only_scoped_data():
    cp, client = await setup()
    cp.settings.agent_provider = "qwen"
    cp.agent.provider = create_provider(cp.settings)
    now = datetime.now(KST)
    noon = now.replace(hour=12, minute=0, second=0, microsecond=0)
    async with client:
        for i, outcome in enumerate(["SUCCESS", "SUCCESS", "FAILED", None, "SUCCESS", "SUCCESS"]):
            response = await client.post(
                "/api/missions",
                json={
                    "seat_id": "seat-18" if i != 2 else "seat-07",
                    "priority": "NORMAL",
                    "idempotency_key": f"insight-{i}",
                },
            )
            response.raise_for_status()
            with cp.store.transaction():
                m = cp.store.get_mission(response.json()["mission_id"])
                m.created_at = (noon - timedelta(minutes=3)).isoformat()
                if outcome:
                    m.outcome, m.phase = MissionOutcome(outcome), MissionPhase.TERMINAL
                    m.finished_at = noon.isoformat()
                    m.execution_profile = dict.fromkeys(
                        ("navigation", "perception", "planning", "execution"), "mock"
                    )
                else:
                    m.created_at = (now - timedelta(minutes=36)).isoformat()
                if i == 0:
                    m.before_observation = m.after_observation = "observation://demo"
                if i == 1:
                    m.before_observation = "https://unmanaged.invalid"
                    m.execution_profile["navigation"] = "real"
                if i == 2:
                    m.needs_human_review = True
                if i == 4:
                    m.site_id = "BUSAN_SOMA_19F"
                if i == 5:
                    m.created_at = (noon - timedelta(days=1, minutes=3)).isoformat()
                    m.finished_at = (noon - timedelta(days=1)).isoformat()
            if i == 2:
                (await client.post(f"/api/missions/{m.mission_id}/review")).raise_for_status()
        for kind, question in QUESTIONS.items():
            assert explicit_view(question) == kind
            key, events = await send(client, question, {"page": "/map"})
            msg = events[-1]["message"]
            assert msg["status"] == "complete" and not msg["plan_ids"], msg
            (card,) = msg["cards"]
            assert card["kind"] == kind and card["site_id"] == "BUSAN_SOMA_18F"
            assert (await client.get("/api/agent/conversations/" + key)).json()["messages"][-1][
                "cards"
            ] == [card]
            buckets = {b["label"]: b["value"] for b in card["buckets"]}
            if kind == "outcome_mix":
                assert buckets == {"완료": 2, "실패": 1}
            elif kind == "request_hours":
                assert sum(buckets.values()) == 3 + (
                    (now - timedelta(minutes=36)).date() == now.date()
                )
            elif kind == "queue_age":
                assert card["value"] == buckets["30분 초과"] == 1
            elif kind == "repeat_seats":
                assert list(buckets.values()) == [2] and card["value"] == 1
            elif kind == "zone_coverage":
                assert sum(b["capacity"] for b in card["buckets"]) == 82
                assert sum(buckets.values()) == 1
            elif kind == "photo_pairs":
                assert buckets == {"전후 모두": 1, "한 장만": 0, "참조 없음": 2}
            elif kind == "failure_reasons":
                assert buckets == {"코드 미기록": 1}
            elif kind == "run_sources":
                assert buckets == {"모의": 2, "단계 혼합": 1} and card["value"] == 0
            elif kind == "review_progress":
                assert buckets == {"검토 완료": 1, "검토 대기": 0}
            else:
                assert kind == "elapsed_spread" and card["value"] == 3
        _, events = await send(client, "어제 D-HUB 18번 작업 결과 분포 보여줘")
        (card,) = events[-1]["message"]["cards"]
        assert card["sample_count"] == 1 and card["scope_label"] == "D-HUB 18번"
        _, events = await send(client, "어제 대기 시간 분포 보여줘")
        assert not events[-1]["message"]["cards"]
        assert len(cp.store.list_missions()) == 6

    # Explicit read tools are chosen before the remote API's narrative response.
    cp.settings.openai_api_key = type(cp.settings.openai_api_key)("test-only")
    api = OpenAIProvider(cp.settings)
    for kind, question in QUESTIONS.items():
        chunks = [
            part
            async for part in api.stream(
                "", [{"role": "user", "content": question}], TOOLS, {"now": now.isoformat()}
            )
        ]
        assert json.loads(chunks[-1]["output"][0]["arguments"])["view"] == kind

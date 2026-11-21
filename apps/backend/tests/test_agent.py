import json
from uuid import uuid4

import pytest
from account_support import authorize
from httpx import ASGITransport, AsyncClient

from control_plane.agent_service import AgentService
from control_plane.agent_tools import day_window
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings


@pytest.fixture
def anyio_backend():
    return "asyncio"


class FakeProvider:
    def __init__(self, calls=None):
        self.calls = calls or []
        self.count = 0

    async def stream(self, instructions, messages, tools, context=None):
        self.count += 1
        if self.count <= len(self.calls):
            name, args = self.calls[self.count - 1]
            yield {
                "type": "done",
                "output": [
                    {
                        "type": "function_call",
                        "call_id": f"call{self.count}",
                        "name": name,
                        "arguments": json.dumps(args),
                    }
                ],
            }
        else:
            yield {"type": "delta", "text": "실제 기록을 확인했습니다."}
            yield {"type": "done", "output": []}


async def setup(provider=None):
    cp = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            _env_file=None,
            robot_mode="mock",
            database_path=":memory:",
            cookie_secure=False,
            allowed_origins=["http://test"],
        ),
    )
    client = AsyncClient(transport=ASGITransport(app=create_app(cp)), base_url="http://test")
    authorize(client, cp)
    client.params = {"site_id": "BUSAN_SOMA_18F"}
    cp._agent = AgentService(cp, provider or FakeProvider())
    return cp, client


def draft_call(ids=None):
    return (
        "draft_seat_plan",
        {
            "seat_ids": ids or ["seat-18"],
            "priority": "NORMAL",
            "robot_id": None,
            "title": "좌석 정리",
            "reason": "관리자 요청",
        },
    )


async def send(client, text="여기 정리해 줘", context=None, key=None, request_id=None):
    if key is None:
        response = await client.post("/api/agent/conversations")
        assert response.status_code == 201, response.text
        key = response.json()["conversation_id"]
    response = await client.post(
        f"/api/agent/conversations/{key}/messages",
        json={
            "client_message_id": request_id or str(uuid4()),
            "content": text,
            "context": context or {},
        },
    )
    assert response.status_code == 200, response.text
    events = [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]
    assert events[-1]["type"] == "complete", events
    return key, events


@pytest.mark.anyio
async def test_stream_read_only_and_private_history():
    provider = FakeProvider(
        [("mission_history", {"start_day": None, "end_day": None, "seat_id": None})]
    )
    cp, client = await setup(provider)
    async with client:
        key, events = await send(client, "오늘 완료된 작업은?")
        message = events[-1]["message"]
        assert message["status"] == "complete", message
        assert message["summaries"][0]["metrics"][1]["value"] == "0"
        assert message["citations"]
        assert cp.store.list_missions() == []
        assert (await client.get(f"/api/agent/conversations/{key}")).json()["messages"][0][
            "content"
        ] == "오늘 완료된 작업은?"
        client.params = {"site_id": "BUSAN_SOMA_19F"}
        assert (await client.get(f"/api/agent/conversations/{key}")).status_code == 404
        assert (await client.get("/api/agent/conversations")).json()["items"] == []


@pytest.mark.anyio
async def test_plan_requires_explicit_approval_revision_and_is_idempotent():
    cp, client = await setup(FakeProvider([draft_call(["seat-18", "seat-20"])]))
    async with client:
        key, events = await send(client)
        plan = next(e["plan"] for e in events if e["type"] == "plan")
        assert not cp.store.list_missions()
        endpoint = "/api/agent/plans/" + plan["plan_id"]
        assert (await client.post(endpoint + "/approve", json={"revision": 1})).status_code == 422
        assert (
            await client.post(endpoint + "/approve", json={"revision": 2, "approved": True})
        ).status_code == 409
        edited = await client.patch(
            endpoint,
            json={
                "revision": 1,
                "items": [{"seat_id": "seat-18", "robot_id": "cleany-01", "priority": "HIGH"}],
            },
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["revision"] == 2
        accepted = await client.post(endpoint + "/approve", json={"revision": 2, "approved": True})
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["status"] == "submitted"
        repeated = await client.post(endpoint + "/approve", json={"revision": 2, "approved": True})
        assert repeated.json()["mission_ids"] == accepted.json()["mission_ids"]
        assert len(cp.store.list_missions()) == 1
        assert cp.store.list_missions()[0].priority == "HIGH"
        assert cp.store.list_missions()[0].phase == "QUEUED"
        assert (await client.post(endpoint + "/cancel", json={"revision": 2})).status_code == 409


@pytest.mark.anyio
async def test_context_tenant_demo_and_permissions():
    cp, client = await setup(FakeProvider([draft_call()]))
    async with client:
        key, events = await send(client, context={"seat_ids": ["seat-18"]})
        plan = next(e["plan"] for e in events if e["type"] == "plan")
        body = {
            "client_message_id": str(uuid4()),
            "content": "안녕",
            "context": {"seat_ids": ["seat-foreign"]},
        }
        assert (
            await client.post(f"/api/agent/conversations/{key}/messages", json=body)
        ).status_code == 422
        body["context"] = {"demo": True}
        assert (
            await client.post(f"/api/agent/conversations/{key}/messages", json=body)
        ).status_code == 409
        identity = cp.accounts.authenticate(client.cookies["cleany_session"])
        with cp.store.transaction():
            cp.agent.repo.db.execute(
                "INSERT INTO agent_permissions VALUES(?,?,?)", (identity.membership_id, 1, 0)
            )
        endpoint = "/api/agent/plans/" + plan["plan_id"]
        assert (
            await client.post(endpoint + "/approve", json={"revision": 1, "approved": True})
        ).status_code == 403
        assert (await client.get("/api/agent/status")).json()["can_approve"] is False
        with cp.store.transaction():
            cp.agent.repo.db.execute("UPDATE agent_permissions SET can_read=0")
        assert (await client.get("/api/agent/conversations")).status_code == 403
        assert not cp.store.list_missions()


@pytest.mark.anyio
async def test_batch_rollback_on_second_target_rejection():
    cp, client = await setup(FakeProvider([draft_call(["seat-18", "seat-20"])]))
    async with client:
        _, events = await send(client)
        plan = next(e["plan"] for e in events if e["type"] == "plan")
        create = cp.create_mission

        def rejecting(request, identity, site):
            if request.to_domain_target().reference_id == "seat-20":
                raise ValueError("runtime rejected target")
            return create(request, identity, site)

        cp.create_mission = rejecting
        response = await client.post(
            "/api/agent/plans/" + plan["plan_id"] + "/approve",
            json={"revision": 1, "approved": True},
        )
        assert response.status_code == 422
        assert not cp.store.list_missions()
        detail = (await client.get("/api/agent/conversations/" + plan["conversation_id"])).json()
        assert detail["plans"][0]["status"] == "draft"


@pytest.mark.anyio
async def test_cancellation_expiry_supersede_and_replay():
    provider = FakeProvider([draft_call()])
    cp, client = await setup(provider)
    async with client:
        request_id = str(uuid4())
        key, events = await send(client, request_id=request_id)
        plan = next(e["plan"] for e in events if e["type"] == "plan")
        count = provider.count
        await send(client, key=key, request_id=request_id)
        assert provider.count == count
        cp.agent.provider = FakeProvider([draft_call(["seat-20"])])
        _, events = await send(client, key=key)
        second = next(e["plan"] for e in events if e["type"] == "plan")
        assert (
            await client.post(
                "/api/agent/plans/" + plan["plan_id"] + "/approve",
                json={"revision": 1, "approved": True},
            )
        ).status_code == 409
        cancel = await client.post(
            "/api/agent/plans/" + second["plan_id"] + "/cancel", json={"revision": 1}
        )
        assert cancel.status_code == 200
        assert cancel.json()["status"] == "cancelled"
        assert not cp.store.list_missions()


@pytest.mark.anyio
async def test_telemetry_queries_do_not_invent_data_and_csrf():
    cp, client = await setup(
        FakeProvider(
            [
                ("robot_overview", {}),
                (
                    "robot_analytics",
                    {"robot_id": "cleany-01", "start_day": None, "end_day": None, "before": None},
                ),
            ]
        )
    )
    async with client:
        _, events = await send(client, "로봇 배터리와 장애?")
        assert events[-1]["message"]["status"] == "complete", events
        assert events[-1]["message"]["citations"]
        client.headers.pop("X-CSRF-Token")
        assert (await client.post("/api/agent/conversations")).status_code == 403


def test_date_window_is_kst_and_bounded():
    start, end = day_window("2026-01-01", "2026-01-07")
    assert (end - start).days == 7
    assert start.utcoffset().total_seconds() == 32400
    with pytest.raises(ValueError):
        day_window("2026-01-01", "2026-02-01")


@pytest.mark.anyio
async def test_unverified_map_and_manual_control_are_rechecked_on_approval():
    cp, client = await setup(FakeProvider([draft_call()]))
    async with client:
        _, events = await send(client)
        plan = next(e["plan"] for e in events if e["type"] == "plan")
        endpoint = "/api/agent/plans/" + plan["plan_id"] + "/approve"
        from fastapi import HTTPException

        original_idle = cp.manual.require_idle

        async def manual_active():
            raise HTTPException(409, "수동 조종이 활성화되어 있습니다.")

        cp.manual.require_idle = manual_active
        response = await client.post(endpoint, json={"revision": 1, "approved": True})
        assert response.status_code == 409
        assert not cp.store.list_missions()
        cp.manual.require_idle = original_idle
        with cp.store.transaction():
            cp.accounts.db.execute(
                "UPDATE sites SET map_ref='slam-20261108' WHERE site_id='BUSAN_SOMA_18F'"
            )
        response = await client.post(endpoint, json={"revision": 1, "approved": True})
        assert response.status_code == 409
        assert not cp.store.list_missions()


@pytest.mark.anyio
async def test_expiry_permissions_and_site_change_cannot_reuse_old_approval():
    from datetime import UTC, datetime, timedelta

    cp, client = await setup(FakeProvider([draft_call()]))
    async with client:
        key, events = await send(client)
        raw = next(e["plan"] for e in events if e["type"] == "plan")
        identity = cp.accounts.authenticate(client.cookies["cleany_session"])
        plan = cp.agent.repo.plan(raw["plan_id"], identity, "BUSAN_SOMA_18F")
        plan.expires_at = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
        with cp.store.transaction():
            cp.agent.repo.save_plan(plan)
        endpoint = "/api/agent/plans/" + plan.plan_id + "/approve"
        assert (
            await client.post(endpoint, json={"revision": 1, "approved": True})
        ).status_code == 409
        assert (await client.get("/api/agent/conversations/" + key)).json()["plans"][0][
            "status"
        ] == "expired"
        client.params = {"site_id": "BUSAN_SOMA_19F"}
        assert (
            await client.post(endpoint, json={"revision": 1, "approved": True})
        ).status_code == 404
        assert not cp.store.list_missions()


@pytest.mark.anyio
async def test_history_is_private_to_user_even_in_same_customer():
    from account_support import PASSWORD

    cp, client = await setup()
    async with client:
        key, _ = await send(client, "오늘 작업?")
        identity = cp.accounts.authenticate(client.cookies["cleany_session"])
        _, temporary = cp.accounts.provision(
            identity.customer_id, "another-operator", "다른 운영자"
        )
        token = cp.accounts.login("another-operator", temporary, "test")
        token = cp.accounts.change_password(token, PASSWORD)
        client.cookies.set("cleany_session", token)
        client.headers["X-CSRF-Token"] = cp.accounts.authenticate(token).csrf_token
        assert (await client.get("/api/agent/conversations/" + key)).status_code == 404
        assert not (await client.get("/api/agent/conversations")).json()["items"]


@pytest.mark.anyio
async def test_provider_failure_and_invalid_tool_do_not_execute():
    from control_plane.agent_provider import AgentProviderError

    class Broken:
        async def stream(self, *args):
            yield {"type": "delta", "text": "확인 중"}
            raise AgentProviderError("모델 연결 오류")

    cp, client = await setup(Broken())
    async with client:
        key, events = await send(client)
        message = events[-1]["message"]
        assert message["status"] == "error" and message["content"] == "확인 중"
        assert message["error"] == "모델 연결 오류"
        cp.agent.provider = FakeProvider(
            [("approve_plan", {"id": "fake"}), draft_call(["seat-foreign"])]
        )
        _, events = await send(client, key=key)
        assert not any(event["type"] == "plan" for event in events)
        assert not cp.store.list_missions()
        assert not cp.agent.active


@pytest.mark.anyio
async def test_read_scope_and_complete_aggregates_exceed_latest_page():
    from datetime import UTC, datetime

    from control_plane.agent_tools import OperationalTools
    from control_plane.domain import MissionOutcome, MissionPhase
    from control_plane.schemas import MissionResponse

    cp, client = await setup()
    async with client:
        identity = cp.accounts.authenticate(client.cookies["cleany_session"])
        with cp.store.transaction():
            for index in range(61):
                from control_plane.schemas import MissionRequest

                mission, _ = cp.create_mission(
                    MissionRequest(
                        seat_id="seat-18", priority="NORMAL", idempotency_key=str(index)
                    ),
                    identity,
                    "BUSAN_SOMA_18F",
                )
                mission.phase, mission.outcome = MissionPhase.TERMINAL, MissionOutcome.SUCCESS
                mission.finished_at = datetime.now(UTC).isoformat()
        tools = OperationalTools(
            cp, identity, "BUSAN_SOMA_18F", None, MissionResponse.model_validate
        )
        summary = tools.history()
        assert summary["counts"]["completed"] == 61
        assert summary["sample_truncated"] and len(summary["recent_missions"]) == 20
        other = OperationalTools(
            cp, identity, "BUSAN_SOMA_19F", None, MissionResponse.model_validate
        )
        assert other.history()["counts"]["completed"] == 0
        with pytest.raises(ValueError):
            other.mission(mission.mission_id)


def test_approval_boolean_is_strict_and_secret_is_redacted():
    from pydantic import ValidationError

    from control_plane.agent_models import AgentPlanApproval

    for invalid in (False, 1, "true", "approved"):
        with pytest.raises(ValidationError):
            AgentPlanApproval(revision=1, approved=invalid)
    settings = Settings(_env_file=None, openai_api_key="not-a-real-secret")
    assert "not-a-real-secret" not in repr(settings)


@pytest.mark.anyio
async def test_disconnected_generator_persists_interruption_and_releases_conversation():
    from control_plane.agent_models import AgentContext, AgentMessageInput
    from control_plane.agent_tools import OperationalTools
    from control_plane.schemas import MissionResponse

    cp, client = await setup()
    async with client:
        identity = cp.accounts.authenticate(client.cookies["cleany_session"])
        conversation = cp.agent.repo.create(identity, "BUSAN_SOMA_18F")
        key = conversation.conversation_id
        cp.agent.active.add(key)
        ops = OperationalTools(cp, identity, "BUSAN_SOMA_18F", None, MissionResponse.model_validate)
        stream = cp.agent.run(
            key,
            AgentMessageInput(
                client_message_id=str(uuid4()), content="질문", context=AgentContext()
            ),
            ops,
            {},
            lambda: None,
        )
        assert (await anext(stream))["type"] == "started"
        assert (await anext(stream))["type"] == "delta"
        await stream.aclose()
        detail = cp.agent.repo.detail(key, identity, "BUSAN_SOMA_18F")
        assert detail.messages[-1].status == "interrupted"
        assert detail.messages[-1].content
        assert key not in cp.agent.active


@pytest.mark.anyio
async def test_changed_runtime_geometry_requires_new_review_before_execution():
    cp, client = await setup(FakeProvider([draft_call()]))
    async with client:
        _, events = await send(client)
        plan = next(e["plan"] for e in events if e["type"] == "plan")
        assert plan["basis"] and plan["execution_mode"] == "mock"
        with cp.store.transaction():
            cp.store.robot.target_map = {"layout_revision": 999}
        response = await client.post(
            "/api/agent/plans/" + plan["plan_id"] + "/approve",
            json={"revision": 1, "approved": True},
        )
        assert response.status_code == 409
        assert "환경이 변경" in response.json()["detail"]
        assert not cp.store.list_missions()


def test_permission_cli_restricts_approval_without_interrupting_live_history(
    tmp_path, monkeypatch, capsys
):
    from account_support import prepare

    from control_plane.admin import main
    from control_plane.agent_models import AgentMessageInput

    path = tmp_path / "agent.db"
    cp = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(_env_file=None, database_path=str(path), robot_mode="mock"),
    )
    _, token, _, _ = prepare(cp)
    identity = cp.accounts.authenticate(token)
    conversation = cp.agent.repo.create(identity, "BUSAN_SOMA_18F")
    cp.agent.repo.begin(
        conversation.conversation_id,
        AgentMessageInput(client_message_id=str(uuid4()), content="현재 응답 중"),
    )
    monkeypatch.setattr(
        "sys.argv",
        ["admin", "--database", str(path), "agent-permission", identity.membership_id, "read-only"],
    )
    main()
    assert json.loads(capsys.readouterr().out)["agent_access"] == "read-only"
    assert cp.agent.repo.permissions(identity) == (True, False)
    assert (
        cp.agent.repo.detail(conversation.conversation_id, identity, "BUSAN_SOMA_18F")
        .messages[-1]
        .status
        == "streaming"
    )
    cp.store.repository.close()


def test_concurrent_initial_requests_share_one_agent_service():
    from concurrent.futures import ThreadPoolExecutor

    from account_support import prepare

    cp = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(_env_file=None, database_path=":memory:", robot_mode="mock"),
    )
    prepare(cp)
    with ThreadPoolExecutor(max_workers=8) as workers:
        identities = list(workers.map(lambda _: id(cp.agent), range(32)))
    assert len(set(identities)) == 1
    cp.store.repository.close()

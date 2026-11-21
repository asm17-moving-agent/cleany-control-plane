"""Authenticated agent routes. Models may draft; only a separate approval POST can enqueue."""

import asyncio
import json
from contextlib import aclosing, suppress

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from control_plane.accounts import AuthError
from control_plane.agent_models import (
    AgentConversation,
    AgentConversationDetail,
    AgentConversationList,
    AgentMessageInput,
    AgentPlan,
    AgentPlanApproval,
    AgentPlanDecision,
    AgentPlanEdit,
    AgentStatus,
    AgentStreamEvent,
)
from control_plane.agent_provider import QwenProvider
from control_plane.agent_store import now_iso
from control_plane.agent_tools import OperationalTools
from control_plane.schemas import MissionRequest


def register_agent_routes(
    app, cp, selected_site, list_seats, public_mission, admit_missions, cookie_name
):
    def service():
        return cp.agent

    def authorize(request, action="read"):
        identity = cp.accounts.authenticate(request.cookies.get(cookie_name))
        request.state.identity = identity
        site = selected_site(request)
        service().repo.require(identity, action)
        return identity, site

    def operations(request):
        identity, site = authorize(request)
        return OperationalTools(cp, identity, site, lambda: list_seats(request), public_mission)

    @app.get("/api/agent/status", response_model=AgentStatus)
    async def agent_status(request: Request):
        identity, _ = authorize(request)
        read, approve = service().repo.permissions(identity)
        s = cp.settings
        local = s.agent_provider == "qwen"
        configured = (
            await QwenProvider(s).ready()
            if local
            else s.agent_provider == "openai" and bool(s.openai_api_key.get_secret_value())
        )
        return AgentStatus(
            configured=configured,
            provider=s.agent_provider,
            model="local-vlm/active" if local else s.agent_model,
            reasoning_effort="" if local else s.agent_reasoning_effort,
            can_read=read,
            can_approve=approve,
            max_plan_items=s.agent_max_plan_items,
            execution_mode=s.robot_mode,
        )

    @app.get("/api/agent/conversations", response_model=AgentConversationList)
    def conversations(request: Request):
        identity, site = authorize(request)
        return AgentConversationList(items=service().repo.list(identity, site))

    @app.post("/api/agent/conversations", response_model=AgentConversation, status_code=201)
    def new_conversation(request: Request):
        identity, site = authorize(request)
        return service().repo.create(identity, site)

    @app.get("/api/agent/conversations/{key}", response_model=AgentConversationDetail)
    def conversation(key: str, request: Request):
        identity, site = authorize(request)
        return service().repo.detail(key, identity, site)

    @app.post(
        "/api/agent/conversations/{key}/messages",
        responses={
            200: {
                "description": "SSE data frames containing AgentStreamEvent JSON",
                "content": {
                    "text/event-stream": {
                        "schema": {"$ref": "#/components/schemas/AgentStreamEvent"}
                    }
                },
            }
        },
        response_model=AgentStreamEvent,
    )
    async def message(key: str, input: AgentMessageInput, request: Request):
        identity, site = authorize(request)
        agent = service()
        agent.repo.own(key, identity, site)
        if input.context.demo:
            raise HTTPException(409, "실제 데이터 화면에서 AI를 사용할 수 있습니다.")
        if not input.content.strip():
            raise HTTPException(422, "질문을 입력해 주세요.")
        if key in agent.active or len(agent.active) >= cp.settings.agent_max_concurrent_turns:
            raise HTTPException(409, "응답을 처리 중입니다. 잠시 후 다시 시도해 주세요.")
        previous = agent.repo.request_message(key, input.client_message_id)
        if previous:

            async def replay():
                yield (
                    "data: "
                    + json.dumps(
                        {"type": "complete", "message": previous.model_dump(mode="json")},
                        ensure_ascii=False,
                    )
                    + "\n\n"
                )

            return StreamingResponse(replay(), media_type="text/event-stream")
        ops = operations(request)
        try:
            context = await ops.context(input.context)
        except (ValueError, TypeError) as error:
            raise HTTPException(422, str(error)) from error
        agent.active.add(key)

        async def generate():
            queue = asyncio.Queue(maxsize=64)

            async def produce():
                try:
                    async with aclosing(
                        agent.run(key, input, ops, context, lambda: authorize(request))
                    ) as events:
                        async for event in events:
                            await queue.put(event)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    await queue.put({"type": "error", "text": "응답을 시작하지 못했습니다."})
                finally:
                    if not asyncio.current_task().cancelling():
                        await queue.put(None)

            task = asyncio.create_task(produce())
            try:
                while True:
                    try:
                        event = await asyncio.wait_for(
                            queue.get(), cp.settings.agent_stream_heartbeat_seconds
                        )
                    except TimeoutError:
                        event = {"type": "heartbeat"}
                    try:
                        authorize(request)
                    except (AuthError, HTTPException):
                        yield (
                            "data: "
                            + json.dumps(
                                {"type": "error", "text": "세션 또는 접근 권한이 만료되었습니다."},
                                ensure_ascii=False,
                            )
                            + "\n\n"
                        )
                        break
                    if event is None:
                        break
                    yield "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
            finally:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
                agent.active.discard(key)

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    @app.patch("/api/agent/plans/{key}", response_model=AgentPlan)
    async def edit_plan(key: str, input: AgentPlanEdit, request: Request):
        identity, site = authorize(request)
        agent = service()
        agent.editable(key, input.revision, identity, site)
        items, blockers = await agent.normalize(input.items, operations(request))
        with cp.store.transaction():
            plan = agent.editable(key, input.revision, identity, site)
            plan.items, plan.blockers = items, blockers
            plan.basis = agent.basis(identity, site)
            plan.execution_mode = cp.settings.robot_mode
            plan.revision += 1
            agent.repo.save_plan(plan)
        return plan

    @app.post("/api/agent/plans/{key}/cancel", response_model=AgentPlan)
    def cancel_plan(key: str, input: AgentPlanDecision, request: Request):
        identity, site = authorize(request)
        with cp.store.transaction():
            plan = service().editable(key, input.revision, identity, site)
            plan.status = "cancelled"
            service().repo.save_plan(plan)
        return plan

    @app.post("/api/agent/plans/{key}/approve", response_model=AgentPlan)
    async def approve_plan(key: str, input: AgentPlanApproval, request: Request):
        identity, site = authorize(request, "approve")
        agent = service()
        original = agent.repo.plan(key, identity, site)
        if original.revision != input.revision:
            raise HTTPException(409, "계획이 변경되었습니다. 최신 계획을 확인해 주세요.")
        if original.status == "submitted":
            return original  # Lost response / double click never creates more work.
        agent.editable(key, input.revision, identity, site)
        _, blockers = await agent.normalize(original.items, operations(request))
        if blockers:
            raise HTTPException(409, " ".join(blockers))
        requests = [
            MissionRequest(
                target={"kind": "SEAT", "reference_id": item.seat_id, "label": item.label},
                priority=item.priority,
                idempotency_key=f"agent:{key}:{input.revision}:{item.seat_id}",
            )
            for item in original.items
        ]

        def before():
            authorize(request, "approve")
            agent.editable(key, input.revision, identity, site)
            if original.basis != agent.basis(identity, site):
                raise HTTPException(
                    409, "지도 또는 실행 환경이 변경되었습니다. 계획을 다시 확인·수정해 주세요."
                )

        def after(results):
            plan = agent.repo.plan(key, identity, site)
            plan.status, plan.approved_by, plan.approved_at = (
                "submitted",
                identity.user_id,
                now_iso(),
            )
            plan.mission_ids = [m.mission_id for m, _ in results]
            agent.repo.save_plan(plan)

        await admit_missions(requests, request, before=before, after=after)
        return agent.repo.plan(key, identity, site)

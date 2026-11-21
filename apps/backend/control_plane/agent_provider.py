"""Replaceable model transport. User data never contains credentials or robot write tools."""

import json
from collections.abc import AsyncIterator
from typing import Protocol

import httpx

from control_plane import agent_qwen
from control_plane.agent_intents import PROMPT, decode_label, explicit_intent, explicit_view


class AgentProviderError(RuntimeError):
    pass


class AgentProvider(Protocol):
    def stream(
        self,
        instructions: str,
        messages: list[dict],
        tools: list[dict],
        context: dict | None = None,
    ) -> AsyncIterator[dict]: ...


class OpenAIProvider:
    def __init__(self, settings):
        self.settings = settings

    async def stream(self, instructions, messages, tools, context=None):
        settings = self.settings
        if not settings.openai_api_key.get_secret_value():
            raise AgentProviderError("AI 연결이 설정되지 않았습니다.")
        # Explicit visual reads have one known tool. Execute it before asking the model
        # for prose so the answer and the displayed widget share the same evidence.
        if messages and messages[-1].get("role") == "user" and context and "now" in context:
            question = messages[-1]["content"]
            view = explicit_view(question)
            if view and any(t["name"] == "show_operations_view" for t in tools):
                action = agent_qwen.view_action(view, question, context)
                if isinstance(action, agent_qwen.Call):
                    yield {"type": "done", "output": [action.output()]}
                else:
                    yield {"type": "delta", "text": action}
                    yield {"type": "done", "output": []}
                return
        body = {
            "model": settings.agent_model,
            "reasoning": {"effort": settings.agent_reasoning_effort},
            "instructions": instructions,
            "input": messages,
            "tools": tools,
            "parallel_tool_calls": False,
            "max_output_tokens": settings.agent_max_output_tokens,
            "store": False,
            "include": ["reasoning.encrypted_content"],
            "stream": True,
        }
        headers = {"Authorization": "Bearer " + settings.openai_api_key.get_secret_value()}
        try:
            async with (
                httpx.AsyncClient(timeout=settings.agent_request_timeout_seconds) as client,
                client.stream(
                    "POST",
                    settings.agent_api_base_url.rstrip("/") + "/responses",
                    headers=headers,
                    json=body,
                ) as response,
            ):
                if response.status_code != 200:
                    # Never expose provider bodies, headers or secrets.
                    labels = {
                        401: "AI 인증 설정을 확인해 주세요.",
                        403: "이 모델을 사용할 권한이 없습니다.",
                        404: "설정된 AI 모델을 사용할 수 없습니다.",
                        429: "AI 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
                    }
                    raise AgentProviderError(
                        labels.get(
                            response.status_code,
                            "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
                        )
                    )
                completed = False
                async for line in response.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    event = json.loads(line[6:])
                    kind = event.get("type")
                    if kind == "response.output_text.delta" or kind == "response.refusal.delta":
                        yield {"type": "delta", "text": event["delta"]}
                    elif kind == "response.completed":
                        completed = True
                        yield {
                            "type": "done",
                            "output": event["response"]["output"],
                            "usage": event["response"].get("usage", {}),
                        }
                    elif kind in {"error", "response.failed", "response.incomplete"}:
                        raise AgentProviderError(
                            "AI 응답이 완료되지 않았습니다. 질문을 나누어 다시 시도해 주세요."
                        )
                if not completed:
                    raise AgentProviderError("AI 연결이 끊겼습니다. 다시 시도해 주세요.")
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise AgentProviderError(
                "AI 연결 시간이 초과되었거나 연결이 끊겼습니다. 다시 시도해 주세요."
            ) from error
        except (ValueError, KeyError) as error:
            raise AgentProviderError(
                "AI 응답 형식을 확인할 수 없습니다. 다시 시도해 주세요."
            ) from error


class QwenProvider:
    """Classify one operator message on the Jetson and render verified tool results locally."""

    def __init__(self, settings):
        self.settings = settings

    async def ready(self):
        try:
            async with httpx.AsyncClient(timeout=2, trust_env=False) as client:
                response = await client.get(self.settings.agent_qwen_url + "/health")
            return response.is_success and response.json() == {"ready": True}
        except (httpx.HTTPError, ValueError):
            return False

    async def classify(self, question, context, followup):
        quick = explicit_intent(question)
        if quick:
            return quick
        selection = {
            key: bool(context.get(field))
            for key, field in (
                ("seats", "seat_ids"),
                ("mission", "mission_id"),
                ("robot", "robot_id"),
            )
        }
        text = question + "\n현재 선택: " + json.dumps(selection, ensure_ascii=False)
        text += "\n미승인 초안: " + ("있음" if context.get("draft_items") else "없음")
        if followup:
            scope = (context.get("last_history") or {}).get("seat_ids")
            text += "\n직전 조회 종류: " + (
                "선택 좌석 작업 이력 조회" if scope else "시설 전체 작업 이력 조회"
            )
        payload = {
            "model": "local-vlm/active",
            "max_tokens": 24,
            "temperature": 0,
            "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": text}],
        }
        try:
            async with httpx.AsyncClient(
                timeout=self.settings.agent_request_timeout_seconds, trust_env=False
            ) as client:
                response = await client.post(
                    self.settings.agent_qwen_url + "/v1/chat/completions", json=payload
                )
            if response.status_code == 429:
                raise AgentProviderError("Jetson GPU가 사용 중입니다. 잠시 후 다시 시도해 주세요.")
            response.raise_for_status()
            label = decode_label(response.json()["choices"][0]["message"]["content"])
            if not isinstance(label, str) or label not in agent_qwen.INTENTS:
                raise ValueError("unknown intent")
        except (
            httpx.HTTPError,
            ValueError,
            KeyError,
            IndexError,
            TypeError,
            AttributeError,
        ) as error:
            raise AgentProviderError(
                "Jetson Qwen 응답을 확인하지 못했습니다. 연결 상태를 확인해 주세요."
            ) from error
        return label

    async def stream(self, instructions, messages, tools, context=None):
        current = max(i for i, m in enumerate(messages) if m.get("role") == "user")
        question = messages[current]["content"]
        turn = messages[current + 1 :]
        context = context or {}
        if turn:
            # These alternating calls/results are produced by this adapter and the scoped executor.
            call, output = turn[-2:]
            if output["call_id"] != call["call_id"]:
                raise AgentProviderError("조회 결과를 확인할 수 없습니다.")
            prior = [
                json.loads(m["output"])
                for m in turn[:-2]
                if m.get("type") == "function_call_output"
            ]
            action = agent_qwen.after_tool(
                call, json.loads(output["output"]), question, context, prior
            )
        elif len(question.encode()) > 1200:
            action = "질문을 한 가지 요청으로 짧게 나누어 주세요."
        else:
            date_only = agent_qwen.is_date_followup(question)
            last_read = context.get("last_history")
            followup = (
                date_only
                and last_read is not None
                and (not context.get("seat_ids") or context["seat_ids"] == last_read["seat_ids"])
            )
            if date_only:
                if followup:
                    context = {**context, "followup_scope": last_read["seat_ids"]}
                label = "mission_history" if followup else "clarify"
            else:
                label = await self.classify(question, context, False)
            action = agent_qwen.first_action(label, question, context)
        if isinstance(action, agent_qwen.Call):
            if action.name not in {tool["name"] for tool in tools}:
                raise AgentProviderError("지원하지 않는 조회입니다.")
            yield {"type": "done", "output": [action.output()]}
        else:
            yield {"type": "delta", "text": action}
            yield {"type": "done", "output": []}


class UnavailableProvider:
    async def stream(self, instructions, messages, tools, context=None):
        raise AgentProviderError("설정된 AI 제공자를 사용할 수 없습니다.")
        yield  # Keep the asynchronous streaming protocol without a network request.


def create_provider(settings) -> AgentProvider:
    providers = {"openai": OpenAIProvider, "qwen": QwenProvider}
    factory = providers.get(settings.agent_provider)
    return factory(settings) if factory else UnavailableProvider()

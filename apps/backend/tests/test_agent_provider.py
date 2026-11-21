import json

import httpx
import pytest

from control_plane.agent_provider import AgentProviderError, OpenAIProvider
from control_plane.settings import Settings


@pytest.fixture
def anyio_backend():
    return "asyncio"


def configure(monkeypatch, response, capture):
    original = httpx.AsyncClient

    def transport(request):
        capture.append(request)
        return response

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: original(**kwargs, transport=httpx.MockTransport(transport)),
    )
    return OpenAIProvider(Settings(_env_file=None, openai_api_key="provider-test-secret"))


@pytest.mark.anyio
async def test_responses_protocol_keeps_reasoning_tools_and_auth_server_side(monkeypatch):
    events = [
        {"type": "response.output_text.delta", "delta": "안내"},
        {
            "type": "response.completed",
            "response": {
                "output": [
                    {
                        "type": "function_call",
                        "name": "robot_overview",
                        "call_id": "one",
                        "arguments": "{}",
                    }
                ],
                "usage": {"total_tokens": 10},
            },
        },
    ]
    response = httpx.Response(200, text="".join("data: " + json.dumps(e) + "\n\n" for e in events))
    requests = []
    provider = configure(monkeypatch, response, requests)
    result = [
        event
        async for event in provider.stream(
            "instructions", [{"role": "user", "content": "state"}], []
        )
    ]
    body = json.loads(requests[0].content)
    assert body["model"] == "gpt-6.1-sol" and body["reasoning"] == {"effort": "low"}
    assert (
        body["store"] is False and body["stream"] is True and body["parallel_tool_calls"] is False
    )
    assert body["include"] == ["reasoning.encrypted_content"]
    assert result[0] == {"type": "delta", "text": "안내"}
    assert result[-1]["output"][0]["name"] == "robot_overview"
    assert "provider-test-secret" not in json.dumps(result)


@pytest.mark.anyio
@pytest.mark.parametrize("status", [401, 429, 500])
async def test_provider_failures_never_echo_sensitive_error_bodies(monkeypatch, status):
    provider = configure(monkeypatch, httpx.Response(status, text="private-account-and-token"), [])
    with pytest.raises(AgentProviderError) as error:
        _ = [event async for event in provider.stream("", [], [])]
    assert "private-account" not in str(error.value)


@pytest.mark.anyio
async def test_truncated_provider_stream_is_an_error(monkeypatch):
    provider = configure(
        monkeypatch,
        httpx.Response(
            200, text='data: {"type":"response.output_text.delta","delta":"partial"}\n\n'
        ),
        [],
    )
    with pytest.raises(AgentProviderError, match="끊겼습니다"):
        _ = [event async for event in provider.stream("", [], [])]

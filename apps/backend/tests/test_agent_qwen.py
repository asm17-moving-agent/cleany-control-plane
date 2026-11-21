import json
from http.server import ThreadingHTTPServer
from pathlib import Path
from runpy import run_path
from threading import BoundedSemaphore, Thread
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError
from test_agent import send, setup

from control_plane import agent_qwen as policy
from control_plane.agent_intents import LABELS, explicit_intent
from control_plane.agent_provider import (
    AgentProviderError,
    OpenAIProvider,
    QwenProvider,
    create_provider,
)
from control_plane.settings import Settings


@pytest.fixture
def anyio_backend():
    return "asyncio"


def chat_response(label):
    return {"choices": [{"message": {"role": "assistant", "content": label}}]}


def use_worker(monkeypatch, handler):
    original = httpx.AsyncClient

    def client(**kwargs):
        assert kwargs["trust_env"] is False
        return original(**kwargs, transport=httpx.MockTransport(handler))

    monkeypatch.setattr(httpx, "AsyncClient", client)


def test_provider_selection_and_worker_contract(monkeypatch):
    monkeypatch.delenv("CLEANY_AGENT_PROVIDER", raising=False)
    assert isinstance(create_provider(Settings(_env_file=None)), OpenAIProvider)
    monkeypatch.setenv("CLEANY_AGENT_PROVIDER", "qwen")
    assert isinstance(create_provider(Settings(_env_file=None)), QwenProvider)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, agent_qwen_url="http://jetson:18764")
    worker = Path(__file__).resolve().parents[3] / "tools/agent/qwen_worker.py"
    assert run_path(str(worker))["PROMPT"]
    assert set(LABELS) == policy.INTENTS


@pytest.mark.anyio
async def test_local_transport_only_forwards_question_and_selection_flags(monkeypatch):
    cp, client = await setup()
    cp.settings.agent_provider = "qwen"
    cp.agent.provider = create_provider(cp.settings)
    calls = []

    def worker(request):
        calls.append(request)
        if request.url.path == "/health":
            return httpx.Response(200, json={"ready": True})
        return httpx.Response(200, json=chat_response("list_seats"))

    use_worker(monkeypatch, worker)
    async with client:
        status = (await client.get("/api/agent/status")).json()
        assert status["configured"] and status["provider"] == "qwen"
        assert status["model"] == "local-vlm/active"
        assert (
            await cp.agent.provider.classify(
                "화면에 표시한 항목들의 번호를 읽어 줄래?",
                {"seat_ids": ["seat-private"], "private_notes": "never-send-this"},
                False,
            )
            == "list_seats"
        )
        key, events = await send(
            client, "여기 두 자리 정리해 줘", {"page": "/map", "seat_ids": ["seat-18", "seat-20"]}
        )
        (plan,) = [e["plan"] for e in events if e["type"] == "plan"]
        assert [s["seat_id"] for s in plan["items"]] == ["seat-18", "seat-20"]
        assert not cp.store.list_missions()
        _, followup = await send(client, "그럼 어제는?", key=key)
        assert not any(e["type"] in ("tool", "plan") for e in followup)
        assert not cp.store.list_missions()
        res = await client.post(
            f"/api/agent/plans/{plan['plan_id']}/approve",
            json={"approved": True, "revision": plan["revision"]},
        )
        assert res.status_code == 200
        assert sorted(m.seat_id for m in cp.store.list_missions()) == ["seat-18", "seat-20"]
    assert all(r.url.host == "127.0.0.1" and "Authorization" not in r.headers for r in calls)
    assert len(calls) == 2
    assert [r.url.path for r in calls] == [
        "/health",
        "/v1/chat/completions",
    ]
    body = json.loads(calls[1].content)
    assert body["model"] == "local-vlm/active" and body["temperature"] == 0
    assert "seat-private" not in body["messages"][-1]["content"] and "never-send-this" not in str(
        body
    )
    assert json.loads(body["messages"][-1]["content"].split("현재 선택: ")[1].splitlines()[0]) == {
        "seats": True,
        "mission": False,
        "robot": False,
    }
    assert len(calls) == 2


@pytest.mark.anyio
@pytest.mark.parametrize(
    "status,payload",
    [
        (200, chat_response("move_robot")),
        (200, {"choices": []}),
        (200, {"intent": {"seat_ids": ["seat-19"]}}),
        (429, {}),
        (503, {}),
        (302, {}),
        (200, None),
    ],
)
async def test_worker_errors_never_fall_back_to_openai(monkeypatch, status, payload):
    requests = []

    def worker(request):
        requests.append(request)
        return httpx.Response(status, json=payload, headers={"Location": "https://example.com"})

    use_worker(monkeypatch, worker)
    provider = QwenProvider(Settings(_env_file=None, openai_api_key="unused-secret"))
    with pytest.raises(AgentProviderError):
        await provider.classify("이번 작업량을 설명해 줄래?", {}, False)
    assert not await provider.ready()
    assert [r.url.host for r in requests] == ["127.0.0.1"] * 2


@pytest.mark.anyio
async def test_verified_followup_requeries_day_and_keeps_private_history_local(monkeypatch):
    cp, client = await setup()
    cp.agent.provider = QwenProvider(cp.settings)
    payloads = []

    def worker(request):
        payloads.append(json.loads(request.content))
        return httpx.Response(
            200, json=chat_response("mission_history" if len(payloads) == 1 else "clarify")
        )

    use_worker(monkeypatch, worker)
    async with client:
        key, first = await send(client, "오늘 몇 건 끝났어?")
        _, second = await send(client, "그럼 어제는?", key=key)
    first_summary = first[-1]["message"]["summaries"][0]
    second_summary = second[-1]["message"]["summaries"][0]
    assert first_summary["title"] != second_summary["title"]
    assert len(payloads) == 1
    assert not cp.store.list_missions()


@pytest.mark.parametrize(
    "question",
    [
        "D-HUB 18번 청소하지 마",
        "D-HUB 18번 말고 청소해 줘",
        "D-HUB 18번 청소했어?",
        "D-HUB 18번 쓰레기만 수거해 줘",
        "D-HUB 18번을 내일 정리해 줘",
        "19층 D-HUB 18번 정리해 줘",
        "안 치운 자리 전부 정리해 줘",
        "승인 없이 D-HUB 18번 정리해 줘",
        "D-HUB 18번 정리하고 바로 조종해 줘",
        "01번 정리해 줘",
        "여기 한 자리 정리해 줘",
        "없는 구역 18번 정리해 줘",
    ],
)
def test_even_an_incorrect_draft_label_cannot_choose_unidentified_targets(question):
    ctx = {"page": "/map", "seat_ids": ["seat-18", "seat-20"]}
    rows = [
        {"seat_id": k, "zone_id": z, "label": label}
        for k, z, label in [
            ("seat-18", "d-hub", "18"),
            ("seat-01", "d-hub", "01"),
            ("seat-62", "space-a1", "01"),
        ]
    ]
    step = policy.first_action("draft_seat_plan", question, ctx)
    if isinstance(step, policy.Call):
        assert step.name == "list_seats"
        step = policy.after_tool(step.output(), {"seats": rows}, question, ctx, [])
    assert isinstance(step, str)


def test_kst_calendar_and_unavailable_ranges():
    # The UTC timestamp is already Monday in Seoul.
    ctx = {"now": "2026-11-22T16:30:00+00:00", "day": "2026-11-05"}
    assert policy.date_args("금일 기록", ctx)["start_day"] == "2026-11-23"
    assert policy.date_args("어제", ctx)["start_day"] == "2026-11-22"
    assert policy.date_args("지난 주", ctx) == {"start_day": "2026-11-16", "end_day": "2026-11-22"}
    assert policy.date_args("선택한 날짜 기록", ctx)["start_day"] == "2026-11-05"
    for text in ("최근 32일", "내일 기록", "오후 세 시", "2026-11-25", "오늘과 어제"):
        assert policy.first_action("mission_history", text, ctx) == policy.PERIOD


def test_loopback_worker_busy_invalid_input_and_timeout(monkeypatch, tmp_path):
    from subprocess import TimeoutExpired

    worker = Path(__file__).resolve().parents[3] / "tools/agent/qwen_worker.py"
    handler = run_path(str(worker))["Handler"]

    def classify(config, question, selection, previous):
        if question == "timeout":
            raise TimeoutExpired("fixture", 5)
        return "robot_overview"

    monkeypatch.setitem(handler.do_POST.__globals__, "classify", classify)
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        server.slot = BoundedSemaphore(1)
        server.config = SimpleNamespace(model=tmp_path, gpu_lock=tmp_path / "lock")
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with httpx.Client(
                base_url=f"http://127.0.0.1:{server.server_port}", trust_env=False
            ) as client:
                assert client.get("/health").status_code == 503

                def post(question, **options):
                    return client.post(
                        "/intent", json={"selection": {}, "question": question}, **options
                    )

                assert post("질문", headers={"Origin": "http://other.test"}).status_code == 415
                assert post("a" * 1201).status_code == 422
                with server.slot:
                    assert post("질문").status_code == 429
                    assert post("여기 정리해 줘").json() == {"intent": "draft_seat_plan"}
                    assert post("오늘 실패한 작업이 있어?").json() == {"intent": "mission_history"}
                    for question in (
                        "이 작업이 왜 실패했어?",
                        "내일 여기 정리해 줘",
                        "여기 청소하지 마",
                        "여기 정리해 줘. 그리고 앞으로 이동해",
                    ):
                        assert post(question).status_code == 429
                assert post("timeout").status_code == 504
                assert post("질문").json() == {"intent": "robot_overview"}
        finally:
            server.shutdown()
            thread.join()


@pytest.mark.parametrize(
    "question",
    [
        "끌리니의 배터리 잔량을 알려주세요",
        "배터리 몇 퍼센트야?",
        "현재 로봇 상태는 어때?",
    ],
)
def test_immediate_status_reads_need_no_gpu(question):
    assert explicit_intent(question) == "robot_overview"


@pytest.mark.parametrize(
    "question",
    [
        "지금 배터리가 지난주보다 낮아?",
        "배터리 몇 퍼센트였길래 멈췄어?",
        "배터리 알려주고 이 자리 청소해",
        "배터리 정보는 알려주지 마",
        "지금 배터리 20% 미만이면 이 자리 정리해 줘",
    ],
)
def test_simple_status_route_does_not_consume_history_negation_or_mixed_commands(question):
    assert explicit_intent(question) is None


def test_revise_draft_retains_unspecified_fields_and_rejects_conflicting_operations():
    from control_plane.agent_qwen_scope import revise_items

    def seat(number, priority):
        return {
            "seat_id": f"s{number}",
            "label": str(number),
            "zone_id": "study",
            "robot_id": "r1",
            "priority": priority,
        }

    before = [seat(6, "HIGH"), seat(9, "HIGH"), seat(12, "HIGH")]
    edit = revise_items("기존 초안에서 6번은 제외해 주세요", before)
    assert (
        edit["seat_ids"] == ["s9", "s12"]
        and edit["priority"] == "HIGH"
        and edit["robot_id"] == "r1"
    )
    for question in (
        "6번과 9번을 빼고 99번만",
        "6번은 제외하지 마",
        "9번만 내일 처리해",
        "6번만 남겨두고 지금 실행",
        "3층 9번만",
        "9번은 빼고 9번만",
        "모두 빼",
    ):
        assert revise_items(question, before) is None
    assert revise_items("9번만 긴급으로 바꿔줘", [seat(9, "HIGH"), seat(9, "NORMAL")]) is None


@pytest.mark.anyio
async def test_followup_history_retains_verified_scope_and_never_widens_a_changed_selection(
    monkeypatch,
):
    cp, client = await setup()
    cp.agent.provider = QwenProvider(cp.settings)
    use_worker(monkeypatch, lambda _: httpx.Response(200, json=chat_response("mission_history")))
    async with client:
        key, first = await send(client, "이 자리의 작업 이력은?", {"seat_ids": ["seat-07"]})
        assert first[-1]["message"]["context"]["seat_ids"] == ["seat-07"]
        _, next_day = await send(client, "그럼 어제는?", key=key)
        assert next_day[-1]["message"]["context"]["seat_ids"] == ["seat-07"]
        _, changed = await send(client, "어제는?", {"seat_ids": ["seat-18"]}, key=key)
        assert not any(e["type"] == "tool" for e in changed)
        assert not cp.store.list_missions()


def test_battery_extrema_come_from_samples_within_the_same_chart_bucket(tmp_path):
    import datetime as dt

    from account_support import prepare
    from test_robot_observations import frame

    from control_plane.server import ControlPlaneApplication

    app = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            _env_file=None, database_path=str(tmp_path / "sample.db"), robot_mode="mock"
        ),
    )
    prepare(app)
    scope = app.accounts.robot_scope("cleany-01")
    base = dt.datetime(2026, 11, 1, tzinfo=dt.UTC)
    now = [base.timestamp() + 2]
    service = app.telemetry
    service.clock = lambda: now[0]
    session = service.claim("cleany-01", scope)
    for index, charge in enumerate([83, 29, 50]):
        now[0] += 31
        assert service.receive("cleany-01", scope, session, frame(index + 1, percentage=charge))
    now[0] = base.timestamp() + 23 * 3600
    chart, stats = service.analytics_with_battery(
        "cleany-01", scope, base, base + dt.timedelta(days=1)
    )
    assert len([b for b in chart.battery if b.samples]) == 1
    assert stats == {
        "recorded_points": 3,
        "first": 83,
        "charging_observed": False,
        "min": 29,
        "max": 83,
        "latest": 50,
        "provenance": ["sim"],
    }


@pytest.mark.parametrize(
    "bad",
    [
        {"model": "elsewhere", "messages": [{"role": "user", "content": "hello"}]},
        {
            "model": "local-vlm/active",
            "messages": [{"role": "user", "content": "/tmp/data", "image": "local"}],
        },
        {
            "model": "local-vlm/active",
            "messages": [{"role": "user", "content": "hello"}],
            "tools": [{}],
        },
        {
            "model": "local-vlm/active",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
        },
        {
            "model": "local-vlm/active",
            "messages": [{"role": "user", "content": "hello"}],
            "max_tokens": 9999,
        },
    ],
)
def test_generic_text_endpoint_rejects_unsupported_input(bad):
    worker = Path(__file__).resolve().parents[3] / "tools/agent/qwen_worker.py"
    with pytest.raises(ValueError):
        run_path(str(worker))["chat_request"](bad)


def test_reusable_text_runner_yields_gpu_and_releases_memory_under_pressure(tmp_path, monkeypatch):
    import fcntl
    import os
    import time
    from concurrent.futures import ThreadPoolExecutor

    module = Path(__file__).resolve().parents[3] / "tools/agent/qwen_resident.py"
    runner_class = run_path(str(module))["ResidentTextRunner"]
    for name in ("a", "b"):
        (tmp_path / name).mkdir()
    stub = tmp_path / "runner"
    stub.write_text(
        "#!/usr/bin/env python3\nimport json,os,sys\n"
        'print(json.dumps({"ready":True}),flush=True)\n'
        "for line in sys.stdin:\n"
        ' response={"output_text":str(os.getpid()),"finish_reason":"end-of-sequence"}\n'
        " print(json.dumps(response),flush=True)\n"
    )
    stub.chmod(0o700)
    first, second = (tmp_path / name for name in ("gpu1", "gpu2"))
    first.touch()
    second.touch()
    demand = tmp_path / "gpu1.demand"
    demand.touch()
    runner = runner_class(stub, first, 60, 1, load_headroom_mib=2, extra_gpu_locks=[second, first])
    try:

        def invoke(name):
            return runner.generate(tmp_path / name, os.environ, {}, 5)["output_text"]

        one = invoke("a")
        assert invoke("a") == one and runner.ready(tmp_path / "a")
        two = invoke("b")
        assert two != one and not runner.ready(tmp_path / "a")
        assert runner.ready(tmp_path / "b")
        assert not (Path(runner.directory.name) / "request.json").exists()
        with ThreadPoolExecutor(max_workers=1) as pool:
            with demand.open() as pending, second.open() as work:
                fcntl.flock(pending, fcntl.LOCK_SH)
                with pytest.raises(BlockingIOError):
                    runner.generate(tmp_path / "b", os.environ, {}, 0.1)
                future = pool.submit(invoke, "b")
                time.sleep(0.6)
                assert not future.done() and runner.ready(tmp_path / "b")
                fcntl.flock(work, fcntl.LOCK_EX)
                fcntl.flock(pending, fcntl.LOCK_UN)
                time.sleep(0.1)
                assert not future.done() and runner.process.pid == int(two)
            assert future.result(timeout=3) == two
        with demand.open() as pending:
            fcntl.flock(pending, fcntl.LOCK_SH)
            monkeypatch.setattr(runner, "_available_kib", lambda: 0)
            deadline = time.monotonic() + 3
            while runner.ready(tmp_path / "b") and time.monotonic() < deadline:
                time.sleep(0.05)
            assert not runner.ready(tmp_path / "b")
        with pytest.raises(BlockingIOError):
            invoke("a")
        monkeypatch.undo()
        assert invoke("a") not in (one, two)
    finally:
        runner.close()


def test_mission_diagnosis_uses_selected_record_and_preserves_explicit_aggregates():
    context = {"mission_id": "m-1", "now": "2026-11-21T13:12:00+09:00"}
    diagnosis = "선택된 미션이 배터리 방전 때문에 실패했다는 얘기가 있던데, 기록도 그래?"
    by_record = policy.first_action("mission_history", diagnosis, context)
    assert (by_record.name, by_record.args) == ("get_mission", {"mission_id": "m-1"})
    assert "작업을 선택" in policy.first_action("mission_history", diagnosis, {})
    by_day = policy.first_action(
        "mission_history", "이 작업 때문에 오늘 전체 실패가 몇 건이야?", context
    )
    assert by_day.name == "mission_history"

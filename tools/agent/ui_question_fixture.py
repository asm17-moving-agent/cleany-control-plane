"""Serve the real dashboard and OpenAI adapter with recorded routing and isolated mock data."""

import argparse
import asyncio
import json
import logging
from contextvars import ContextVar
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

import uvicorn
from compare import ROOT, Settings, seed, setup
from control_plane import agent_provider
from control_plane.agent_provider import OpenAIProvider
from control_plane.agent_tools import KST
from control_plane.domain import MissionOutcome, MissionPhase
from control_plane.server import create_app

current_round = ContextVar("observed_openai_round", default=None)


class ResponseStatus(logging.Handler):
    """Capture only HTTP status and destination for the active model round."""

    def emit(self, record):
        turn = current_round.get()
        if turn is None or not isinstance(record.args, tuple) or len(record.args) != 5:
            return
        method, url, _, status, _ = record.args
        endpoint = urlsplit(str(url))
        if method == "POST" and endpoint.path.endswith("/responses"):
            turn["http"].append({"host": endpoint.hostname, "status": status})


class ObservedOpenAI(OpenAIProvider):
    def __init__(self, settings, audit):
        super().__init__(settings)
        self.audit = audit

    async def stream(self, instructions, messages, tools, context=None):
        question = next(
            m["content"] for m in reversed(messages) if m.get("role") == "user"
        )
        turn = {"question": question, "http": [], "tools": [], "usage": {}}
        token = current_round.set(turn)
        try:
            async for event in super().stream(instructions, messages, tools, context):
                if event["type"] == "done":
                    turn["usage"] = event.get("usage") or {}
                    for call in event["output"]:
                        if call.get("type") == "function_call":
                            args = json.loads(call["arguments"])
                            turn["tools"].append(
                                {"name": call["name"], "view": args.get("view")}
                            )
                yield event
        finally:
            current_round.reset(token)
            with self.audit.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(turn, ensure_ascii=False) + "\n")


async def start(port, audit):
    settings = Settings(_env_file=ROOT / ".env", agent_provider="openai")
    assert settings.openai_api_key.get_secret_value(), "OpenAI API key unavailable"
    if urlsplit(settings.agent_api_base_url).hostname != "api.openai.com":
        raise RuntimeError("This evaluation requires the official OpenAI endpoint.")
    cp, client = await setup()
    async with client:
        await seed(cp, client)
        for seat in ("18", "20"):
            result = await client.post(
                "/api/missions",
                json={
                    "seat_id": "seat-" + seat,
                    "priority": "NORMAL",
                    "idempotency_key": "photo-" + seat,
                },
            )
            result.raise_for_status()
            with cp.store.transaction():
                mission = cp.store.get_mission(result.json()["mission_id"])
                mission.phase, mission.outcome = (
                    MissionPhase.TERMINAL,
                    MissionOutcome.SUCCESS,
                )
                mission.finished_at = datetime.now(KST).isoformat()
                mission.execution_profile = dict(cp.store.robot.execution_profile)
                mission.before_observation = "observation://desk-before.png"
                mission.after_observation = "observation://desk-after-complete.png"
        reply = await client.post(
            "/api/missions",
            json={
                "seat_id": "seat-20",
                "priority": "HIGH",
                "idempotency_key": "evaluation-queue",
            },
        )
        reply.raise_for_status()
        with cp.store.transaction():
            cp.store.get_mission(reply.json()["mission_id"]).created_at = (
                datetime.now(KST) - timedelta(minutes=42)
            ).isoformat()
            cp.accounts.db.execute(
                "UPDATE sites SET map_ref='slam-20261108' WHERE site_id='BUSAN_SOMA_18F'"
            )
    cp.settings.allowed_origins = [f"http://127.0.0.1:{port}"]
    cp.settings.openai_api_key = settings.openai_api_key
    cp.settings.agent_model = settings.agent_model
    cp.settings.observation_directory = str(
        ROOT / "apps/dashboard/public/demo/observations"
    )
    cp.agent.provider = ObservedOpenAI(settings, audit)
    layout = json.loads(
        (ROOT / "apps/backend/maps/slam-20261108/seat-layout.json").read_text()
    )
    pose = next(s["approach"] for s in layout["seats"] if s["seat_id"] == "seat-18")
    cp.store.update_pose(
        pose["x"],
        pose["y"],
        yaw=pose["yaw"],
        frame_id=layout["frame_id"],
        map_id=layout["map_id"],
    )
    logger = logging.getLogger("httpx")
    logger.addHandler(ResponseStatus())
    logger.setLevel(logging.INFO)
    logger.propagate = False
    print(
        f"Isolated OpenAI dashboard on {port}, {settings.agent_model}, {len(cp.store.list_missions())} fixture missions",
        flush=True,
    )
    return create_app(cp)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18767)
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument(
        "--model-only",
        action="store_true",
        help="Disable only the explicit UI shortcut in this test process.",
    )
    args = parser.parse_args()
    if args.model_only:
        agent_provider.explicit_view = lambda _question: None
    uvicorn.run(
        asyncio.run(start(args.port, args.audit)),
        host="127.0.0.1",
        port=args.port,
        access_log=False,
    )

"""Compare real dashboard providers on identical scoped fixture data via the SSE message route."""

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import datetime, time, timedelta
from pathlib import Path
from time import monotonic

import httpx
from control_plane.agent_tools import KST
from control_plane.domain import MissionOutcome, MissionPhase
from control_plane.settings import Settings
from evaluate import ROOT, EvaluationQwen, create_provider, send, setup
from test_robot_observations import frame


async def seed(app, client):
    day = datetime.now(KST).date()
    clock = datetime.combine(day, time(8), KST)
    failure = None
    for i, (ago, seat, outcome) in enumerate(
        [
            (0, "18", "SUCCESS"),
            (0, "20", "SUCCESS"),
            (0, "07", "FAILED"),
            (0, "20", "CANCELLED"),
            (1, "18", "SUCCESS"),
            (1, "18", "SUCCESS"),
            (1, "07", "SUCCESS"),
            (1, "20", "FAILED"),
        ]
    ):
        response = await client.post(
            "/api/missions",
            json={
                "seat_id": f"seat-{seat}",
                "priority": "NORMAL",
                "idempotency_key": f"fixture-{i}",
            },
        )
        response.raise_for_status()
        with app.store.transaction():
            mission = app.store.get_mission(response.json()["mission_id"])
            at = clock - timedelta(days=ago) + timedelta(minutes=i * 5)
            mission.created_at = at.isoformat()
            mission.finished_at = (at + timedelta(minutes=2)).isoformat()
            mission.phase = MissionPhase.TERMINAL
            mission.outcome = MissionOutcome(outcome)
            mission.execution_profile = dict(app.store.robot.execution_profile)
            mission.message = {
                "SUCCESS": "정리 완료",
                "CANCELLED": "관리자 취소",
                "FAILED": "책상 접근 제한 시간 초과",
            }[outcome]
            if outcome == "FAILED":
                mission.needs_human_review = True
                mission.failure_code = "NAVIGATION_TIMEOUT"
                if ago == 0:
                    failure = mission.mission_id
    now = [clock.timestamp()]
    app.telemetry.clock = lambda: now[0]
    robot = "cleany-01"
    scope = app.accounts.robot_scope(robot)
    session = app.telemetry.claim(robot, scope)
    for index, observation in enumerate(
        [
            frame(1, percentage=67),
            frame(
                2,
                "supervisor_event",
                epoch="eval",
                event_sequence=1,
                event_kind="FAULT_RAISED",
                code="NAV_TIMEOUT",
                severity="error",
                detail="책상 접근 시간 초과",
            ),
            frame(
                3,
                "supervisor_event",
                epoch="eval",
                event_sequence=2,
                event_kind="RECOVERY_SUCCEEDED",
                code="NAV_TIMEOUT",
                severity="info",
                detail="내비게이션 재시작 완료",
            ),
            frame(4, percentage=42),
        ]
    ):
        now[0] = clock.timestamp() + index * 300
        assert app.telemetry.receive(robot, scope, session, observation)
    now[0] += 300
    sample = (await client.get("/api/missions/" + failure)).json()
    assert set(sample["execution_profile"].values()) == {"mock"}
    return failure


async def evaluate(case, settings, provider):
    app, client = await setup()
    app.agent.provider = (
        EvaluationQwen(settings) if provider == "qwen" else create_provider(settings)
    )
    async with client:
        failure = await seed(app, client)
        status = await app.agent.provider.ready() if provider == "qwen" else True
        if not status:
            raise RuntimeError("Qwen worker unavailable")
        before = len(app.store.list_missions())
        turns, key = [], None
        for turn in case["turns"]:
            context = dict(turn.get("context", {}))
            if context.get("mission_id") == "failure":
                context["mission_id"] = failure
            labels = getattr(app.agent.provider, "labels", [])
            label_index = len(labels)
            begin = monotonic()
            key, events = await send(client, turn["question"], context, key=key)
            detail = (await client.get("/api/agent/conversations/" + key)).json()
            msg = events[-1]["message"]
            added = len(app.store.list_missions()) - before
            assert added == 0
            turns.append(
                {
                    "question": turn["question"],
                    "context": turn.get("context", {}),
                    "status": msg["status"],
                    "error": msg["error"],
                    "seconds": round(monotonic() - begin, 3),
                    "answer": msg["content"],
                    "citations": msg["citations"],
                    "summaries": msg["summaries"],
                    "tools": [e["text"] for e in events if e["type"] == "tool"],
                    "plans": [
                        {
                            "status": p["status"],
                            "items": p["items"],
                            "blockers": p["blockers"],
                        }
                        for p in detail["plans"]
                    ],
                    "unapproved_missions": added,
                    "worker_intents": labels[label_index:],
                }
            )
    return {"id": case["id"], "split": case["split"], "turns": turns}


async def run(args):
    raw = args.cases.read_bytes()
    cases = [c for c in json.loads(raw) if c["split"] in args.split]
    settings = Settings(_env_file=ROOT / ".env", agent_provider=args.provider)
    result = {
        "provider": args.provider,
        "model": settings.agent_model
        if args.provider == "openai"
        else "local-vlm/active",
        "date_kst": datetime.now(KST).date().isoformat(),
        "case_sha256": hashlib.sha256(raw).hexdigest(),
        "results": [],
    }
    for case in cases:
        try:
            row = await evaluate(case, settings, args.provider)
        except (
            AssertionError,
            RuntimeError,
            httpx.HTTPError,
            ValueError,
            KeyError,
        ) as error:
            row = {"id": case["id"], "error": type(error).__name__}
        result["results"].append(row)
        temporary = args.output.with_suffix(".partial")
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(args.output)
        print(
            row["id"],
            [t["status"] for t in row.get("turns", [])],
            row.get("error", ""),
            flush=True,
        )
    if any(
        row.get("error") or any(t["status"] != "complete" for t in row["turns"])
        for row in result["results"]
    ):
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=["qwen", "openai"], required=True)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--split",
        choices=["diagnostic", "holdout"],
        nargs="+",
        default=["diagnostic", "holdout"],
    )
    asyncio.run(run(parser.parse_args()))

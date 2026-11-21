"""Loopback intent classifier for the Jetson TensorRT Edge-LLM runtime (Python 3.10+)."""

import argparse
import fcntl
import json
import logging
import os
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import BoundedSemaphore
from uuid import uuid4

try:
    from control_plane.agent_intents import PROMPT, decode_label, explicit_intent
except ModuleNotFoundError as error:
    if error.name != "control_plane":
        raise
    # The standalone Jetson installation ships this same module alongside the server.
    from agent_intents import PROMPT, decode_label, explicit_intent


def assets(selector):
    model = selector.resolve(strict=True)
    manifest = json.loads((model / "manifest.json").read_text())
    runtime = Path(manifest["runtime_directory"])
    runner = runtime / "llm_inference"
    plugin = runtime / "libNvInfer_edgellm_plugin.so"
    if not all(
        p.is_file()
        for p in (
            runner,
            plugin,
            model / "engines/llm.engine",
            model / "runtime-checkpoint/model.safetensors.index.json",
        )
    ):
        raise ValueError("incomplete classifier installation")
    return model, runner, plugin


def classify(config, question, selection, previous):
    text = question + "\n현재 선택: " + json.dumps(selection, ensure_ascii=False)
    if previous:
        text += "\n직전 조회 종류: " + previous
    messages = [
        {"role": role, "content": [{"type": "text", "text": content}]}
        for role, content in (("system", PROMPT), ("user", text))
    ]
    request = {
        "batch_size": 1,
        "max_generate_length": 24,
        "temperature": 0,
        "top_k": 1,
        "top_p": 1,
        "enable_thinking": False,
        "requests": [{"messages": messages}],
    }
    label = decode_label(generate(config, request)["output_text"])
    # Existing dashboard versions speak the original nine-label /intent protocol.
    return {
        "compare_history": "mission_history",
        "battery_history": "robot_analytics",
        "revise_draft": "clarify",
        "no_action": "clarify",
        "guide_plan": "clarify",
        "guide_cancel": "clarify",
        "guide_camera": "clarify",
        "guide_pose": "clarify",
    }.get(label, label)


def runtime_env(plugin, runner):
    return {
        **os.environ,
        "EDGELLM_PLUGIN_PATH": str(plugin),
        "LD_LIBRARY_PATH": f"{runner.parent}:/usr/local/cuda-12.6/lib64:/usr/lib/aarch64-linux-gnu",
    }


def generate(config, request):
    model, runner, plugin = assets(config.model)
    env = runtime_env(plugin, runner)
    resident = getattr(config, "resident", None)
    if resident is not None:
        return resident.generate(model, env, request, config.timeout)

    with config.gpu_lock.open("r") as lock, tempfile.TemporaryDirectory() as tmp:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        inp, out = Path(tmp) / "input.json", Path(tmp) / "output.json"
        inp.write_text(json.dumps(request, ensure_ascii=False))
        subprocess.run(
            [
                runner,
                "--engineDir",
                model / "engines",
                "--multimodalEngineDir",
                model / "engines",
                "--checkpointDir",
                model / "runtime-checkpoint",
                "--inputFile",
                inp,
                "--outputFile",
                out,
                "--warmup",
                "0",
            ],
            env=env,
            cwd=tmp,
            timeout=config.timeout,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.STDOUT,
        )
        (response,) = json.loads(out.read_text())["responses"]
        if response.get("success") is not True:
            raise ValueError("classifier request failed")
        return {
            "output_text": response["output_text"],
            "finish_reason": response.get("finish_reason"),
        }


def chat_request(data):
    """Validate a bounded text-only Chat Completions request and build a native request."""
    if not isinstance(data, dict) or set(data) - {
        "model",
        "messages",
        "temperature",
        "max_tokens",
        "stream",
    }:
        raise ValueError("unsupported fields")
    if (
        data.get("model") != "local-vlm/active"
        or data.get("stream", False) is not False
    ):
        raise ValueError("unsupported model or stream")
    turns = data.get("messages")
    limit, temperature = data.get("max_tokens", 96), data.get("temperature", 0)
    if (
        type(limit) is not int
        or not 1 <= limit <= 256
        or type(temperature) not in (int, float)
        or temperature != 0
    ):
        raise ValueError("unsupported generation setting")
    if not isinstance(turns, list) or not 1 <= len(turns) <= 16:
        raise ValueError("invalid messages")
    messages = []
    for turn in turns:
        if (
            not isinstance(turn, dict)
            or set(turn) != {"role", "content"}
            or turn["role"] not in {"system", "user", "assistant"}
        ):
            raise ValueError("invalid chat turn")
        content = turn["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("text is required")
        messages.append(
            {"role": turn["role"], "content": [{"type": "text", "text": content}]}
        )
    if (
        turns[-1]["role"] != "user"
        or sum(len(t["content"].encode()) for t in turns) > 12000
    ):
        raise ValueError("invalid final turn or length")
    return {
        "batch_size": 1,
        "max_generate_length": limit,
        "temperature": 0,
        "top_k": 1,
        "top_p": 1,
        "enable_thinking": False,
        "requests": [{"messages": messages}],
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Do not log operator questions.

    def reply(self, status, data):
        payload = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/v1/models":
            return self.reply(
                200,
                {
                    "object": "list",
                    "data": [
                        {
                            "id": "local-vlm/active",
                            "object": "model",
                            "owned_by": "cleany",
                        }
                    ],
                },
            )
        if self.path != "/health":
            return self.reply(404, {})
        try:
            model, _, _ = assets(self.server.config.model)
            resident = getattr(self.server.config, "resident", None)
            if getattr(self.server.config, "keep_warm", False) and not resident.ready(
                model
            ):
                return self.reply(503, {"ready": False})
            if not self.server.config.gpu_lock.is_file():
                return self.reply(503, {})
        except (OSError, TypeError, ValueError, KeyError):
            return self.reply(503, {})
        self.reply(200, {"ready": True})

    def do_POST(self):
        if self.path not in ("/intent", "/v1/chat/completions"):
            return self.reply(404, {})
        if self.headers.get_content_type() != "application/json" or self.headers.get(
            "Origin"
        ):
            return self.reply(415, {})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= (8192 if self.path == "/intent" else 20000):
                return self.reply(413, {})
            data = json.loads(self.rfile.read(length))
            if self.path == "/v1/chat/completions":
                request = chat_request(data)
                return self.serve_inference(lambda: self.completion(request))
            question, selection, previous = (
                data["question"],
                data["selection"],
                data.get("previous", ""),
            )
            if (
                not isinstance(question, str)
                or not 0 < len(question.encode()) <= 1200
                or not isinstance(previous, str)
                or len(previous.encode()) > 240
                or not isinstance(selection, dict)
                or set(selection) - {"seats", "mission", "robot"}
                or any(type(v) is not bool for v in selection.values())
            ):
                return self.reply(422, {})
        except (ValueError, TypeError, KeyError):
            return self.reply(422, {})
        intent = explicit_intent(question)
        if intent is not None:
            return self.reply(200, {"intent": intent})
        return self.serve_inference(
            lambda: {
                "intent": classify(self.server.config, question, selection, previous)
            }
        )

    def completion(self, request):
        row = generate(self.server.config, request)
        text = row["output_text"]
        if not isinstance(text, str) or not text.strip():
            raise ValueError("empty model response")
        return {
            "id": "chatcmpl-" + uuid4().hex,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "local-vlm/active",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop"
                    if row.get("finish_reason") == "end-of-sequence"
                    else "length",
                }
            ],
        }

    def serve_inference(self, operation):
        if not self.server.slot.acquire(blocking=False):
            return self.reply(429, {})
        try:
            answer = operation()
        except BlockingIOError:
            return self.reply(429, {})
        except subprocess.TimeoutExpired:
            return self.reply(504, {})
        except (
            OSError,
            ValueError,
            TypeError,
            KeyError,
            subprocess.CalledProcessError,
        ) as exc:
            logging.getLogger(__name__).warning(
                "Classifier failure (%s)", type(exc).__name__
            )
            return self.reply(503, {})
        finally:
            self.server.slot.release()
        self.reply(200, answer)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18764)
    parser.add_argument(
        "--model", type=Path, default=Path("/var/opt/cleany/models/local-vlm/active")
    )
    parser.add_argument("--gpu-lock", required=True, type=Path)
    parser.add_argument(
        "--also-gpu-lock",
        action="append",
        default=[],
        type=Path,
        help="Additional GPU lock used by another runtime",
    )
    parser.add_argument("--timeout", type=int, default=75)
    parser.add_argument(
        "--resident-runner",
        type=Path,
        help="Reuse the text-only classifier between questions",
    )
    parser.add_argument("--idle-seconds", type=int, default=45)
    parser.add_argument("--min-free-mib", type=int, default=1536)
    parser.add_argument(
        "--keep-warm",
        action="store_true",
        help="Preload and retain the model while GPU and memory permit",
    )
    parser.add_argument("--load-headroom-mib", type=int, default=6144)
    config = parser.parse_args()
    if config.also_gpu_lock and not config.resident_runner:
        parser.error("additional locks require the resident runner")
    if config.keep_warm and not config.resident_runner:
        parser.error("--keep-warm requires --resident-runner")
    if config.load_headroom_mib <= config.min_free_mib:
        parser.error("load headroom must be larger than the eviction threshold")
    if min(config.idle_seconds, config.min_free_mib, config.timeout) <= 0:
        parser.error("runtime limits must be positive")
    assets(config.model)
    with ThreadingHTTPServer(("127.0.0.1", config.port), Handler) as server:
        server.config = config
        server.slot = BoundedSemaphore(1)
        if config.resident_runner:
            from qwen_resident import ResidentTextRunner

            def warm_assets():
                model, runner, plugin = assets(config.model)
                return model, runtime_env(plugin, runner)

            config.resident = ResidentTextRunner(
                config.resident_runner,
                config.gpu_lock,
                config.idle_seconds,
                config.min_free_mib,
                warm_assets if config.keep_warm else None,
                config.load_headroom_mib,
                config.timeout,
                config.also_gpu_lock,
            )
        try:
            server.serve_forever()
        finally:
            if config.resident_runner:
                config.resident.close()

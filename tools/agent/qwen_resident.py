"""Keep the text engine resident and schedule its GPU work behind robot requests."""

import fcntl
import json
import os
import select
import subprocess
import tempfile
import threading
import time
from contextlib import ExitStack, contextmanager, suppress
from pathlib import Path


class ResidentTextRunner:
    def __init__(
        self,
        binary,
        gpu_lock,
        idle_seconds,
        min_free_mib,
        warm_assets=None,
        load_headroom_mib=6144,
        timeout=75,
        extra_gpu_locks=(),
    ):
        self.binary = Path(binary).resolve(strict=True)
        self.gpu_locks = []
        seen = set()
        for path in (gpu_lock, *extra_gpu_locks):
            stat = path.stat()
            identity = (stat.st_dev, stat.st_ino)
            if identity not in seen:
                self.gpu_locks.append(path)
                seen.add(identity)
        # Older lock-only clients share work exclusion. The field selector also
        # announces foreground waiters by holding its companion file shared.
        self.demand_locks = [Path(str(path) + ".demand") for path in self.gpu_locks]
        self.demand_locks = [path for path in self.demand_locks if path.is_file()]
        self.idle_seconds = idle_seconds
        self.min_free_kib = min_free_mib * 1024
        self.load_headroom_kib = load_headroom_mib * 1024
        self.warm_assets = warm_assets
        self.timeout = timeout
        self.retry_after = 0.0
        self.lock = threading.Lock()
        self.shutdown = threading.Event()
        self.process = self.directory = self.model = None
        self.last_used = 0.0
        self.loaded = False
        self.reaper = threading.Thread(target=self._reap, daemon=True)
        self.reaper.start()

    def _release(self):
        process, self.process = self.process, None
        self.loaded = False
        try:
            if process is not None:
                with suppress(BrokenPipeError, OSError):
                    process.stdin.close()
                try:
                    process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                finally:
                    process.stdout.close()
        finally:
            if self.directory is not None:
                self.directory.cleanup()
            self.directory = self.model = None

    @contextmanager
    def _claim_gpu(self):
        with ExitStack() as locks:
            with ExitStack() as demand:
                for path in self.demand_locks:
                    stream = demand.enter_context(path.open("rb"))
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                for path in self.gpu_locks:
                    stream = locks.enter_context(path.open("rb"))
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield

    @contextmanager
    def _admit_request(self, deadline):
        # Leave the runner mutex available to the memory monitor while queued.
        while not self.shutdown.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not self.lock.acquire(timeout=remaining):
                break
            with ExitStack() as held:
                held.callback(self.lock.release)
                try:
                    held.enter_context(self._claim_gpu())
                except BlockingIOError:
                    pass
                else:
                    yield
                    return
            self.shutdown.wait(min(0.05, max(0, deadline - time.monotonic())))
        raise BlockingIOError("robot GPU reservation outlasted the request budget")

    def _available_kib(self):
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1])
        return 0

    def _reap(self):
        while not self.shutdown.wait(0.5):
            if not self.lock.acquire(blocking=False):
                continue
            try:
                if self.process is not None and (
                    self.process.poll() is not None
                    or (
                        not self.warm_assets
                        and time.monotonic() - self.last_used >= self.idle_seconds
                    )
                    or self._available_kib() < self.min_free_kib
                ):
                    self._release()
                    self.retry_after = time.monotonic() + 3
                if self.warm_assets and time.monotonic() >= self.retry_after:
                    model, env = self.warm_assets()
                    if self.model != model:
                        self._release()
                        if self._available_kib() >= self.load_headroom_kib:
                            with self._claim_gpu():
                                self._start(model, env, time.monotonic() + self.timeout)
            except (OSError, ValueError, KeyError, subprocess.SubprocessError):
                self._release()
                self.retry_after = time.monotonic() + 3
            finally:
                self.lock.release()

    def _reply(self, deadline):
        fd = self.process.stdout.fileno()
        data = bytearray()
        while len(data) <= 16384:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(str(self.binary), 0)
            if self._available_kib() < self.min_free_kib:
                raise BlockingIOError("insufficient memory for local inference")
            if not select.select([fd], [], [], min(remaining, 0.5))[0]:
                continue
            chunk = os.read(fd, 4096)
            if not chunk:
                raise ValueError("text runner closed its reply pipe")
            data.extend(chunk)
            if data.endswith(b"\n"):
                return json.loads(data)
        raise ValueError("invalid text runner reply")

    def ready(self, model):
        process = self.process
        return (
            self.model == model
            and process is not None
            and process.poll() is None
            and self.loaded
        )

    def _start(self, model, env, deadline):
        self._release()
        self.directory = tempfile.TemporaryDirectory(
            prefix="cleany-qwen-", dir=os.getenv("RUNTIME_DIRECTORY")
        )
        self.process = subprocess.Popen(
            [self.binary, model / "engines", model / "runtime-checkpoint"],
            cwd=self.directory.name,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        if self._reply(deadline) != {"ready": True}:
            raise ValueError("text runner did not start")
        self.model = model
        self.loaded = True
        self.last_used = time.monotonic()

    def generate(self, model, env, request, timeout):
        deadline = time.monotonic() + timeout
        with self._admit_request(deadline):
            try:
                if self._available_kib() < self.min_free_kib:
                    raise BlockingIOError("insufficient memory for local inference")
                if not self.ready(model):
                    if self._available_kib() < self.load_headroom_kib:
                        raise BlockingIOError(
                            "insufficient headroom for model loading"
                        )
                    self._start(model, env, deadline)
                path = Path(self.directory.name) / "request.json"
                path.write_text(json.dumps(request, ensure_ascii=False))
                try:
                    self.process.stdin.write(b"run\n")
                    self.process.stdin.flush()
                    reply = self._reply(deadline)
                    self.last_used = time.monotonic()
                    return reply
                finally:
                    path.unlink(missing_ok=True)
            except (OSError, ValueError, KeyError, subprocess.SubprocessError):
                self._release()
                raise

    def close(self):
        self.shutdown.set()
        self.reaper.join()
        with self.lock:
            self._release()

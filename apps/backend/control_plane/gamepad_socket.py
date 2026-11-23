"""Same-user Unix socket for the Jetson gamepad. One bounded command per connection."""

import asyncio
import fcntl
import json
import logging
import os
import stat
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from control_plane.manual_control import ManualCommand, ManualStatus


class GamepadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command: ManualCommand
    expires_at: float = Field(allow_inf_nan=False)


@asynccontextmanager
async def gamepad_listener(
    location: str,
    submit: Callable[[GamepadRequest], Awaitable[ManualStatus]],
) -> AsyncIterator[None]:
    if not location:
        yield
        return
    path = Path(location).expanduser()
    directory = path.parent.stat()
    if not path.is_absolute() or directory.st_uid != os.getuid() or directory.st_mode & 0o077:
        raise ValueError("Gamepad socket requires an absolute path in a private user directory")

    clients = set()

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        clients.add(asyncio.current_task())
        try:
            try:
                data = await asyncio.wait_for(reader.readline(), timeout=0.25)
                request = GamepadRequest.model_validate_json(data)
                result = await submit(request)
                reply = {"ok": True, "forward_only": result.forward_only}
            except (ValidationError, ValueError, TimeoutError):
                reply = {"ok": False, "error": "invalid or expired gamepad request"}
            except HTTPException as exc:
                reply = {"ok": False, "error": str(exc.detail), "discarded": exc.status_code == 408}
            except Exception:
                logging.getLogger(__name__).exception("Gamepad relay failed")
                reply = {"ok": False, "error": "relay unavailable"}
            with suppress(ConnectionError):
                writer.write(json.dumps(reply).encode() + b"\n")
                await writer.drain()
        finally:
            writer.close()
            clients.discard(asyncio.current_task())

    # Only the worker which owns the lock may replace a socket left by a crash.
    with Path(str(path) + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if path.is_symlink() or (path.exists() and not stat.S_ISSOCK(path.lstat().st_mode)):
            raise ValueError("Gamepad socket path is already in use")
        path.unlink(missing_ok=True)
        server = await asyncio.start_unix_server(handle, path=str(path), limit=4096)
        try:
            path.chmod(0o600)
            yield
        finally:
            server.close()
            await server.wait_closed()
            pending = list(clients)
            for task in pending:
                task.cancel()
            for task in pending:
                with suppress(asyncio.CancelledError):
                    await task
            path.unlink(missing_ok=True)

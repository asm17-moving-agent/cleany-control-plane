"""Authenticated relay to the existing phone controller; ROS retains motion authority."""

import asyncio
import hashlib
from pathlib import Path
from typing import Annotated, Literal

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from control_plane.settings import Settings


class ManualCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client: str = Field(pattern=r"^[a-zA-Z0-9_-]{16,64}$")
    sequence: int = Field(ge=0, le=2**53 - 1, strict=True)
    action: Literal["press", "update", "stop"]
    direction: Literal["forward", "backward", "left", "right", "ccw", "cw"] = "forward"
    speed: float = Field(default=0.5, ge=0.1, le=10, allow_inf_nan=False)
    vector: tuple[
        Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False, strict=True)],
        Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False, strict=True)],
        Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False, strict=True)],
    ] | None = None


class ManualStatus(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    configured: bool = False
    available: bool = False
    connected: bool = False
    ready: bool = False
    phase: str = "unavailable"
    message: str = "수동 조종 서버가 연결되지 않았습니다."
    blocked_reason: str | None = None
    mock: bool = False
    paused: bool = False
    forward_only: bool = False
    stop_confirmed: bool = False
    enabled: bool = False
    fault_bits: int = 0
    feedback_age_ms: float | None = None
    web_max_velocity: float = Field(default=0.5, ge=0.5, le=10)
    velocity: list[float] = Field(default_factory=lambda: [0.0] * 4, min_length=4, max_length=4)


class ManualControl:
    def __init__(self, settings: Settings):
        self.settings = settings
        # Admission serialization covers dashboard motion and new mission creation.
        # STOP bypasses this lock and carries a newer upstream sequence.
        self.lock = asyncio.Lock()
        self.transport: httpx.AsyncBaseTransport | None = None

    @property
    def configured(self) -> bool:
        return bool(
            self.settings.robot_mode == "gateway"
            and self.settings.teleop_url
            and self.settings.teleop_token_file
        )

    async def exchange(self, command: dict | None = None) -> ManualStatus:
        if not self.configured:
            raise HTTPException(503, "수동 조종 서버 연결이 설정되지 않았습니다.")
        try:
            token = Path(self.settings.teleop_token_file).expanduser().read_text().strip()
            if len(token) < 32 or not token.isascii():
                raise ValueError("invalid token")
            async with httpx.AsyncClient(
                timeout=self.settings.teleop_timeout_seconds,
                trust_env=False,
                transport=self.transport,
                follow_redirects=False,
            ) as client:
                response = await client.request(
                    "POST" if command else "GET",
                    self.settings.teleop_url + ("/api/control" if command else "/api/status"),
                    headers={"X-Control-Token": token, "Origin": self.settings.teleop_url},
                    **({"json": command} if command else {}),
                )
            if response.status_code == 409:
                raise HTTPException(409, str(response.json().get("error", "조종 요청 거부"))[:200])
            response.raise_for_status()
            data = response.json()
            # Treat incomplete upstream responses as disconnected, never as permission.
            required = {"phase", "ready", "connected"}
            if not command:
                required.add("mock")
            if not isinstance(data, dict) or not required <= data.keys():
                raise ValueError("incomplete controller status")
            return ManualStatus.model_validate({**data, "configured": True, "available": True})
        except HTTPException:
            raise
        except (OSError, ValueError, ValidationError, httpx.HTTPError):
            raise HTTPException(
                503, "조종 서버에 연결할 수 없습니다. 입력을 놓고 연결 상태를 확인하세요."
            ) from None

    async def status(self, blocked: bool = False) -> ManualStatus:
        try:
            result = await self.exchange()
        except HTTPException:
            result = ManualStatus(configured=self.configured)
        if blocked:
            result.ready = False
            result.blocked_reason = "대기 또는 진행 중인 작업을 종료한 뒤 조종하세요."
        return result

    async def command(self, command: ManualCommand, session_key: str) -> ManualStatus:
        data = command.model_dump(exclude_none=True)
        # A browser cannot impersonate another authenticated session's controller lease.
        data["client"] = hashlib.sha256(f"{session_key}:{command.client}".encode()).hexdigest()
        data["ui_version"] = 2
        return await self.exchange(data)

    async def require_idle(self):
        if not self.configured:
            return
        state = await self.exchange()
        if (
            not state.connected
            or state.phase != "idle"
            or state.enabled
            or not state.stop_confirmed
            or state.fault_bits
        ):
            raise HTTPException(409, "수동 조종의 정지 확인 후 작업을 요청하세요.")

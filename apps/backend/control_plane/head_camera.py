"""Read-only JPEG relay from the independent telemetry camera provider."""

import math

import httpx
from fastapi import HTTPException, Response

from control_plane.settings import Settings

PREVIEW_HEAD_TOPIC = "/camera/head/color/image_preview_redacted"


class HeadCamera:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.transport: httpx.AsyncBaseTransport | None = None

    async def frame(self) -> Response:
        settings = self.settings
        if (
            settings.robot_mode != "gateway"
            or not settings.camera_preview_url
            or settings.head_camera_topic != PREVIEW_HEAD_TOPIC
        ):
            raise HTTPException(503, "헤드캠 연결이 설정되지 않았습니다.")
        try:
            async with (
                httpx.AsyncClient(
                    timeout=settings.camera_timeout_seconds,
                    trust_env=False,
                    follow_redirects=False,
                    transport=self.transport,
                ) as client,
                client.stream(
                    "GET",
                    settings.camera_preview_url + "/api/camera",
                    params={"topic": settings.head_camera_topic},
                ) as response,
            ):
                if response.status_code == 202:
                    raise HTTPException(503, "헤드캠의 새 영상을 기다리고 있습니다.")
                response.raise_for_status()
                if response.headers.get("X-Camera-Topic") != PREVIEW_HEAD_TOPIC:
                    raise ValueError("invalid camera source")
                age = float(response.headers.get("X-Frame-Age", "nan"))
                if not math.isfinite(age) or not 0 <= age <= 2:
                    raise ValueError("stale frame")
                if response.headers.get("Content-Type", "").split(";")[0] != "image/jpeg":
                    raise ValueError("not JPEG")
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > 2 * 1024 * 1024:
                        raise ValueError("frame too large")
                if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
                    raise ValueError("invalid JPEG")
            return Response(
                bytes(data),
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "no-store",
                    "X-Frame-Age": str(age),
                },
            )
        except (ValueError, httpx.HTTPError):
            raise HTTPException(503, "헤드캠 영상이 연결되지 않았습니다.") from None

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from control_plane.domain import ControlPlaneStore, MissionOutcome, MissionPhase, RobotState
from control_plane.fixtures import SEATS
from control_plane.schemas import (
    HealthResponse,
    MissionListResponse,
    MissionRequest,
    MissionResponse,
    PoseInput,
    PoseSnapshot,
    RobotListResponse,
    RobotPose,
    SeatListResponse,
)
from control_plane.settings import Settings


class MockDispatcher:
    CHECKPOINTS = (
        (MissionPhase.OFFERED, "Mission offered to cleany-01."),
        (MissionPhase.ACCEPTED, "Robot accepted the mission."),
        (MissionPhase.NAVIGATING, "Navigating to the selected seat."),
        (MissionPhase.WORKING, "Observing and processing the tabletop scene."),
        (MissionPhase.RETURNING, "Returning to the waiting position."),
    )

    def __init__(self, store: ControlPlaneStore, step_delay: float = 0.8) -> None:
        from threading import Event, Thread

        self.store = store
        self.step_delay = step_delay
        self._stop = Event()
        self._thread = Thread(target=self._run, name="mock-dispatcher", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2)

    def _run(self) -> None:
        while not self._stop.is_set():
            if self.store.robot.state != RobotState.IDLE:
                self._stop.wait(0.1)
                continue
            mission = self.store.next_queued()
            if mission is None:
                self._stop.wait(0.1)
                continue

            self.store.set_robot_state(RobotState.BUSY, mission.mission_id)
            for phase, message in self.CHECKPOINTS:
                if mission.cancel_requested:
                    break
                self.store.transition(mission.mission_id, phase, message)
                self._stop.wait(self.step_delay)

            if mission.cancel_requested:
                self.store.transition(
                    mission.mission_id,
                    MissionPhase.TERMINAL,
                    "Mission cancelled at a safe checkpoint.",
                    outcome=MissionOutcome.CANCELLED,
                )
            else:
                self.store.transition(
                    mission.mission_id,
                    MissionPhase.TERMINAL,
                    "Mission completed successfully.",
                    outcome=MissionOutcome.SUCCESS,
                )
            self.store.set_robot_state(RobotState.IDLE)


class ControlPlaneApplication:
    def __init__(self, *, start_dispatcher: bool = True) -> None:
        self.store = ControlPlaneStore()
        self.dispatcher = MockDispatcher(self.store)
        self.start_dispatcher = start_dispatcher


def create_app(
    application: ControlPlaneApplication | None = None,
    *,
    dashboard_root: Path | None = None,
) -> FastAPI:
    control_plane = application or ControlPlaneApplication()
    dashboard_dist = dashboard_root or Path(__file__).resolve().parents[2] / "dashboard" / "dist"

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if control_plane.start_dispatcher:
            control_plane.dispatcher.start()
        try:
            yield
        finally:
            if control_plane.start_dispatcher:
                control_plane.dispatcher.stop()

    app = FastAPI(
        title="Cleany Control Plane",
        version="0.2.0",
        lifespan=lifespan,
    )
    app.state.control_plane = control_plane
    app.state.pose_timeout = Settings().pose_receive_timeout_seconds

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/api/seats", response_model=SeatListResponse)
    async def list_seats() -> SeatListResponse:
        return SeatListResponse(items=SEATS)

    @app.get("/api/robots", response_model=RobotListResponse)
    async def list_robots() -> RobotListResponse:
        return RobotListResponse(items=[control_plane.store.robot])

    @app.get("/api/robots/cleany-01/pose", response_model=PoseSnapshot)
    async def latest_pose() -> PoseSnapshot:
        pose, stale = control_plane.store.latest_pose(app.state.pose_timeout)
        if stale and pose is not None:
            control_plane.store.publish_pose_stale()
        return PoseSnapshot(
            pose=RobotPose(x=pose.x, y=pose.y, received_at=pose.received_at) if pose else None,
            stale=stale,
        )

    @app.websocket("/api/robots/cleany-01/pose/ws")
    async def robot_pose(websocket: WebSocket) -> None:
        if not control_plane.store.claim_pose_producer():
            await websocket.close(code=1008, reason="pose producer already connected")
            return
        try:
            await websocket.accept()
            while True:
                try:
                    raw = await asyncio.wait_for(
                        websocket.receive_json(), timeout=app.state.pose_timeout,
                    )
                except TimeoutError:
                    control_plane.store.publish_pose_stale()
                    await websocket.close(code=1001, reason="pose receive timeout")
                    return
                except (ValueError, TypeError, KeyError):
                    await websocket.close(code=1003, reason="pose must be JSON {x,y}")
                    return
                try:
                    pose = PoseInput.model_validate(raw)
                except (TypeError, ValueError):
                    await websocket.close(code=1003, reason="pose must be finite {x,y}")
                    return
                control_plane.store.update_pose(pose.x, pose.y)
        except WebSocketDisconnect:
            return
        finally:
            control_plane.store.release_pose_producer()

    @app.get("/api/missions", response_model=MissionListResponse)
    async def list_missions() -> MissionListResponse:
        return MissionListResponse(items=control_plane.store.list_missions())

    @app.post("/api/missions", response_model=MissionResponse)
    async def create_mission(request: MissionRequest, response: Response) -> MissionResponse:
        try:
            mission, created = control_plane.store.create_mission(
                target=request.to_domain_target(),
                priority=request.priority.value,
                requested_by=request.requested_by,
                idempotency_key=request.idempotency_key,
            )
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error
        response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return MissionResponse.model_validate(mission)

    @app.post("/api/missions/{mission_id}/cancel", response_model=MissionResponse, status_code=202)
    async def cancel_mission(mission_id: str) -> MissionResponse:
        mission = control_plane.store.get_mission(mission_id)
        if mission is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission not found")
        try:
            return MissionResponse.model_validate(control_plane.store.request_cancel(mission_id))
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error

    @app.get("/api/events/stream")
    async def stream_events() -> StreamingResponse:
        async def generate() -> AsyncIterator[str]:
            event_queue: asyncio.Queue[dict[str, object]] = asyncio.Queue(maxsize=100)
            loop = asyncio.get_running_loop()

            def listener(event: dict[str, object]) -> None:
                def enqueue() -> None:
                    if not event_queue.full():
                        event_queue.put_nowait(event)

                loop.call_soon_threadsafe(enqueue)

            unsubscribe = control_plane.store.subscribe(listener)
            try:
                yield ": connected\n\n"
                while True:
                    try:
                        event = await asyncio.wait_for(event_queue.get(), timeout=10)
                        payload = json.dumps(event, ensure_ascii=False)
                        yield f"event: update\ndata: {payload}\n\n"
                    except TimeoutError:
                        yield ": heartbeat\n\n"
            finally:
                unsubscribe()

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    if dashboard_dist.is_dir():
        assets = dashboard_dist / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="dashboard-assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def dashboard(path: str) -> FileResponse:
            requested = (dashboard_dist / path).resolve()
            root = dashboard_dist.resolve()
            if requested.is_file() and (requested == root or root in requested.parents):
                return FileResponse(requested)
            return FileResponse(dashboard_dist / "index.html")

    return app


app = create_app()


def run(host: str | None = None, port: int | None = None) -> None:
    settings = Settings()
    uvicorn.run(app, host=host or settings.host, port=port or settings.port)

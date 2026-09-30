from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from time import monotonic

import uvicorn
from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from control_plane.domain import ControlPlaneStore, MissionOutcome, MissionPhase, RobotState
from control_plane.fixtures import SEATS
from control_plane.gateway import GatewayController
from control_plane.persistence import SQLiteRepository
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
            with self.store.transaction():
                mission = (
                    self.store.next_queued() if self.store.robot.state == RobotState.IDLE else None
                )
                if mission:
                    self.store.set_robot_state(RobotState.BUSY, mission.mission_id)
                    self.store.transition(mission.mission_id, *self.CHECKPOINTS[0])
            if mission is None:
                self._stop.wait(0.1)
                continue

            for phase, message in self.CHECKPOINTS[1:]:
                if self._stop.is_set():
                    return
                if mission.cancel_requested:
                    break
                if phase == MissionPhase.WORKING:
                    mission.before_observation = (
                        f"mock://observations/before-{mission.target.reference_id}"
                    )
                self.store.transition(mission.mission_id, phase, message)
                self._stop.wait(self.step_delay)

            if self._stop.is_set():
                return
            if mission.cancel_requested:
                self.store.transition(
                    mission.mission_id,
                    MissionPhase.TERMINAL,
                    "Mission cancelled at a safe checkpoint.",
                    outcome=MissionOutcome.CANCELLED,
                )
            else:
                mission.after_observation = (
                    f"mock://observations/after-{mission.target.reference_id}"
                )
                self.store.transition(
                    mission.mission_id,
                    MissionPhase.TERMINAL,
                    "Mission completed successfully.",
                    outcome=MissionOutcome.SUCCESS,
                )
            self.store.set_robot_state(RobotState.IDLE)


class ControlPlaneApplication:
    def __init__(self, *, start_dispatcher: bool = True, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        # Open SQLite on startup/first request, never on module import or OpenAPI export.
        self._store: ControlPlaneStore | None = None
        self._gateway: GatewayController | None = None
        self._dispatcher: MockDispatcher | None = None
        self.start_dispatcher = start_dispatcher

    @property
    def store(self) -> ControlPlaneStore:
        if self._store is None:
            self._store = ControlPlaneStore(SQLiteRepository(self.settings.database_path))
            if self.settings.robot_mode == "gateway":
                self._gateway = GatewayController(self._store, self.settings)
            else:
                with self._store.transaction():
                    self._store.robot.control_mode = "mock"
                    self._store.robot.can_cancel = True
                    pending = next(
                        (
                            m
                            for m in self._store.list_missions()
                            if m.phase not in (MissionPhase.QUEUED, MissionPhase.TERMINAL)
                        ),
                        None,
                    )
                    self._store.robot.state = RobotState.ERROR if pending else RobotState.IDLE
                    self._store.robot.execution_profile = dict.fromkeys(
                        ("navigation", "perception", "planning", "execution"),
                        "mock",
                    )
        return self._store

    @property
    def gateway(self) -> GatewayController | None:
        _ = self.store
        return self._gateway

    @property
    def dispatcher(self) -> MockDispatcher:
        if self._dispatcher is None:
            self._dispatcher = MockDispatcher(self.store, self.settings.mock_step_delay_seconds)
        return self._dispatcher

    def create_mission(self, request: MissionRequest):
        target = request.to_domain_target()
        with self.store.transaction():
            if self.gateway:
                self.gateway.validate_target(target, request.idempotency_key)
            mission, created = self.store.create_mission(
                target=target,
                priority=request.priority.value,
                requested_by=request.requested_by,
                idempotency_key=request.idempotency_key,
            )
            if created and self.settings.robot_mode == "mock":
                mission.execution_profile = dict(self.store.robot.execution_profile)
            return mission, created


def create_app(
    application: ControlPlaneApplication | None = None,
    *,
    dashboard_root: Path | None = None,
) -> FastAPI:
    control_plane = application or ControlPlaneApplication()
    dashboard_dist = dashboard_root or Path(__file__).resolve().parents[2] / "dashboard" / "dist"

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        _ = control_plane.store
        mock = control_plane.start_dispatcher and control_plane.settings.robot_mode == "mock"
        if mock:
            control_plane.dispatcher.start()

        async def maintenance() -> None:
            while True:
                if control_plane.gateway and not control_plane.gateway.connected:
                    control_plane.gateway.tick()
                await asyncio.sleep(control_plane.settings.gateway_tick_interval_seconds)

        task = asyncio.create_task(maintenance())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
            if mock:
                control_plane.dispatcher.stop()
            if control_plane.store.repository:
                control_plane.store.repository.close()

    app = FastAPI(
        title="Cleany Control Plane",
        version="0.2.0",
        lifespan=lifespan,
    )
    app.state.control_plane = control_plane
    app.state.pose_timeout = control_plane.settings.pose_receive_timeout_seconds

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/api/seats", response_model=SeatListResponse)
    async def list_seats() -> SeatListResponse:
        robot = control_plane.store.robot
        return SeatListResponse(
            items=[
                {
                    **seat,
                    "mission_supported": (
                        True
                        if robot.control_mode == "mock"
                        else None
                        if robot.supported_seat_ids is None
                        else seat["seat_id"] in robot.supported_seat_ids
                    ),
                }
                for seat in SEATS
            ]
        )

    @app.get("/api/robots", response_model=RobotListResponse)
    async def list_robots() -> RobotListResponse:
        return RobotListResponse(items=[control_plane.store.robot])

    @app.websocket("/api/robots/{robot_id}/gateway/ws")
    async def robot_gateway(robot_id: str, websocket: WebSocket) -> None:
        gateway = control_plane.gateway
        if robot_id != "cleany-01" or gateway is None or not gateway.claim():
            await websocket.close(code=1008, reason="unknown robot, mode or connection owner")
            return
        try:
            await websocket.accept()
            while True:
                for message in gateway.tick():
                    await websocket.send_json(message)
                if monotonic() - gateway.last_contact >= (
                    control_plane.settings.gateway_heartbeat_timeout_seconds
                ):
                    await websocket.close(code=1001, reason="runtime heartbeat timeout")
                    return
                try:
                    raw = await asyncio.wait_for(
                        websocket.receive_json(),
                        timeout=control_plane.settings.gateway_tick_interval_seconds,
                    )
                except TimeoutError:
                    continue
                except (ValueError, TypeError):
                    await websocket.close(code=1003, reason="gateway message must be JSON")
                    return
                try:
                    ack = gateway.receive(raw)
                except (ValueError, TypeError, KeyError) as error:
                    logging.getLogger(__name__).warning("gateway protocol rejected: %s", error)
                    await websocket.close(code=1008, reason="invalid gateway event or state")
                    return
                if ack:
                    await websocket.send_json(ack)
        except WebSocketDisconnect:
            return
        finally:
            gateway.disconnect()

    @app.get("/api/robots/cleany-01/pose", response_model=PoseSnapshot)
    async def latest_pose() -> PoseSnapshot:
        pose, stale = control_plane.store.latest_pose(app.state.pose_timeout)
        if stale and pose is not None:
            control_plane.store.publish_pose_stale()
        return PoseSnapshot(
            pose=(
                RobotPose(x=pose.x, y=pose.y, received_at=pose.received_at, yaw=pose.yaw)
                if pose
                else None
            ),
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
                        websocket.receive_json(),
                        timeout=app.state.pose_timeout,
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
                control_plane.store.update_pose(pose.x, pose.y, yaw=pose.yaw)
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
            mission, created = control_plane.create_mission(request)
        except ValueError as error:
            raise HTTPException(
                status_code=(
                    status.HTTP_409_CONFLICT
                    if "idempotency" in str(error)
                    else status.HTTP_422_UNPROCESSABLE_ENTITY
                ),
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
            gateway = control_plane.gateway
            result = (
                gateway.cancel(mission_id)
                if gateway
                else control_plane.store.request_cancel(mission_id)
            )
            return MissionResponse.model_validate(result)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error

    @app.get("/api/events/stream")
    async def stream_events() -> StreamingResponse:
        async def generate() -> AsyncIterator[str]:
            event_queue: asyncio.Queue[dict[str, object]] = asyncio.Queue(maxsize=100)
            overflow = asyncio.Event()
            loop = asyncio.get_running_loop()

            def listener(event: dict[str, object]) -> None:
                def enqueue() -> None:
                    if not event_queue.full():
                        event_queue.put_nowait(event)
                    else:
                        overflow.set()

                loop.call_soon_threadsafe(enqueue)

            unsubscribe = control_plane.store.subscribe(listener)
            try:
                yield ": connected\n\n"
                while True:
                    if overflow.is_set():
                        # Force reconnect/snapshot instead of silently losing lifecycle updates.
                        return
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
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    uvicorn.run(app, host=host or settings.host, port=port or settings.port)

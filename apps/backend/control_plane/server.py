from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from time import monotonic, time

import uvicorn
from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from control_plane.accounts import Accounts, AuthError, Identity
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
                    mission.robot_id = self.store.robot.robot_id
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
        self._accounts: Accounts | None = None

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
    def accounts(self) -> Accounts:
        if self._accounts is None:
            self._accounts = Accounts(self.store, self.settings)
        return self._accounts

    @property
    def gateway(self) -> GatewayController | None:
        _ = self.store
        return self._gateway

    @property
    def dispatcher(self) -> MockDispatcher:
        if self._dispatcher is None:
            self._dispatcher = MockDispatcher(self.store, self.settings.mock_step_delay_seconds)
        return self._dispatcher

    def create_mission(self, request: MissionRequest, identity: Identity, site_id: str):
        target = request.to_domain_target()
        with self.store.transaction():
            if self.gateway:
                self.gateway.validate_target(target, request.idempotency_key, identity.customer_id)
            mission, created = self.store.create_mission(
                target=target,
                priority=request.priority.value,
                requested_by=identity.user_id,
                customer_id=identity.customer_id,
                site_id=site_id,
                requested_membership_id=identity.membership_id,
                idempotency_key=request.idempotency_key,
            )
            if created and self.settings.robot_mode == "mock":
                mission.execution_profile = dict(self.store.robot.execution_profile)
            return mission, created


class LoginInput(BaseModel):
    login_id: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class PasswordInput(BaseModel):
    password: str = Field(min_length=15, max_length=128)
    current_password: str | None = Field(default=None, max_length=128)


class SessionResponse(BaseModel):
    user_id: str
    login_id: str
    display_name: str
    customer_id: str
    customer_name: str
    must_change_password: bool
    csrf_token: str
    expires_at: float


class SiteResponse(BaseModel):
    site_id: str
    display_name: str
    map_ref: str


class SitesResponse(BaseModel):
    items: list[SiteResponse]


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

    cookie_name = (
        "__Host-cleany_session" if control_plane.settings.cookie_secure else "cleany_session"
    )

    def identity_response(identity: Identity) -> SessionResponse:
        return SessionResponse(
            user_id=identity.user_id,
            login_id=identity.login_id,
            display_name=identity.display_name,
            customer_id=identity.customer_id,
            customer_name=identity.customer_name,
            must_change_password=identity.scope != "full",
            csrf_token=identity.csrf_token,
            expires_at=identity.expires_at,
        )

    def session_response(token: str, response: Response) -> SessionResponse:
        identity = control_plane.accounts.authenticate(token, full=False)
        response.set_cookie(
            cookie_name,
            token,
            httponly=True,
            secure=control_plane.settings.cookie_secure,
            samesite="lax",
            path="/",
            max_age=int(control_plane.settings.session_absolute_seconds),
        )
        response.headers["Cache-Control"] = "no-store"
        return identity_response(identity)

    @app.exception_handler(AuthError)
    async def auth_error(_: Request, error: AuthError):
        return JSONResponse(
            {"detail": str(error)}, status_code=error.status, headers={"Cache-Control": "no-store"}
        )

    @app.middleware("http")
    async def authenticate_http(request: Request, call_next):
        if not request.url.path.startswith("/api/") or request.url.path == "/api/health":
            return await call_next(request)
        try:
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                origins = control_plane.settings.allowed_origins or [
                    str(request.base_url).rstrip("/")
                ]
                if request.headers.get("origin") not in origins:
                    raise AuthError("Origin not allowed", 403)
            if request.url.path != "/api/auth/login":
                identity = control_plane.accounts.authenticate(
                    request.cookies.get(cookie_name),
                    full=request.url.path
                    not in ("/api/auth/me", "/api/auth/password/change", "/api/auth/logout"),
                )
                request.state.identity = identity
                if request.method not in ("GET", "HEAD", "OPTIONS"):
                    import secrets

                    if not secrets.compare_digest(
                        request.headers.get("x-csrf-token", ""), identity.csrf_token
                    ):
                        raise AuthError("CSRF validation failed", 403)
            result = await call_next(request)
            result.headers["Cache-Control"] = "no-store"
            return result
        except AuthError as error:
            return await auth_error(request, error)

    def selected_site(request: Request) -> str:
        identity = request.state.identity
        with control_plane.store._lock:
            rows = control_plane.accounts.db.execute(
                "SELECT site_id FROM sites WHERE customer_id=? AND disabled_at IS NULL",
                (identity.customer_id,),
            ).fetchall()
        selected = request.query_params.get("site_id")
        if selected is None and len(rows) == 1:
            selected = rows[0][0]
        if not selected or selected not in {row[0] for row in rows}:
            raise HTTPException(404, "facility not found")
        return selected

    def robot_visible(request: Request) -> bool:
        return control_plane.accounts.robot_scope("cleany-01") == (
            request.state.identity.customer_id,
            selected_site(request),
        )

    def scoped_mission(request: Request, mission_id: str):
        mission = control_plane.store.get_mission(mission_id)
        if mission is None or mission.customer_id != request.state.identity.customer_id:
            raise HTTPException(404, "mission not found")
        return mission

    def public_mission(mission) -> MissionResponse:
        result = MissionResponse.model_validate(mission)
        for field, stage in (("before_observation", "before"), ("after_observation", "after")):
            reference = getattr(result, field)
            if reference and reference.startswith("observation://"):
                setattr(result, field, f"/api/missions/{mission.mission_id}/observations/{stage}")
            elif reference and (reference.startswith(("http://", "https://", "/", "file:"))):
                # Unmanaged runtime links cannot carry our customer's access policy.
                setattr(result, field, "외부 관측 자료 · 저장소 연결 필요")
        return result

    @app.get("/api/missions/{mission_id}/observations/{stage}")
    def observation(mission_id: str, stage: str, request: Request):
        mission = scoped_mission(request, mission_id)
        if stage not in ("before", "after"):
            raise HTTPException(404, "observation not found")
        reference = getattr(mission, stage + "_observation")
        if not reference or not reference.startswith("observation://"):
            raise HTTPException(404, "observation not connected")
        root = Path(control_plane.settings.observation_directory).resolve()
        target = (root / reference.removeprefix("observation://")).resolve()
        if root not in target.parents or not target.is_file():
            raise HTTPException(404, "observation not found")
        return FileResponse(target, headers={"Cache-Control": "no-store"})

    def robot_auth(websocket: WebSocket, robot_id: str) -> bool:
        value = websocket.headers.get("authorization", "")
        token = value.removeprefix("Bearer ") if value.startswith("Bearer ") else ""
        token = websocket.headers.get("x-cleany-robot-token", token)
        protocols = [
            p.strip() for p in websocket.headers.get("sec-websocket-protocol", "").split(",")
        ]
        if not token and len(protocols) == 2 and protocols[0] == "cleany":
            token = protocols[1]
        return bool(token and control_plane.accounts.robot_scope(robot_id, token))

    async def accept_robot(websocket: WebSocket):
        protocols = websocket.headers.get("sec-websocket-protocol", "")
        await websocket.accept(subprotocol="cleany" if protocols.startswith("cleany,") else None)

    @app.post("/api/auth/login", response_model=SessionResponse)
    def login(input: LoginInput, request: Request, response: Response):
        token = control_plane.accounts.login(
            input.login_id, input.password, request.client.host if request.client else "unknown"
        )
        return session_response(token, response)

    @app.get("/api/auth/me", response_model=SessionResponse)
    def me(request: Request):
        return identity_response(request.state.identity)

    @app.post("/api/auth/password/change", response_model=SessionResponse)
    def change_password(input: PasswordInput, request: Request, response: Response):
        token = control_plane.accounts.change_password(
            request.cookies[cookie_name], input.password, input.current_password
        )
        return session_response(token, response)

    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, response: Response):
        with control_plane.store.transaction():
            control_plane.accounts.db.execute(
                "UPDATE sessions SET revoked_at=? WHERE session_id=?",
                (time(), request.state.identity.session_id),
            )
        response.delete_cookie(cookie_name, path="/")

    @app.post("/api/auth/session/touch", status_code=204)
    def touch(request: Request):
        from time import time

        with control_plane.store.transaction():
            identity = control_plane.accounts.authenticate(request.cookies[cookie_name])
            control_plane.accounts.db.execute(
                "UPDATE sessions SET last_activity_at=? WHERE session_id=?",
                (time(), identity.session_id),
            )

    @app.get("/api/sites", response_model=SitesResponse)
    def sites(request: Request):
        with control_plane.store._lock:
            rows = control_plane.accounts.db.execute(
                "SELECT site_id,display_name,map_ref FROM sites "
                "WHERE customer_id=? AND disabled_at IS NULL ORDER BY rowid",
                (request.state.identity.customer_id,),
            ).fetchall()
        return SitesResponse(
            items=[SiteResponse(site_id=r[0], display_name=r[1], map_ref=r[2]) for r in rows]
        )

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    @app.get("/api/seats", response_model=SeatListResponse)
    async def list_seats(request: Request) -> SeatListResponse:
        site_id = selected_site(request)
        with control_plane.store._lock:
            map_ref = control_plane.accounts.db.execute(
                "SELECT map_ref FROM sites WHERE site_id=?", (site_id,)
            ).fetchone()[0]
        robot = control_plane.store.robot
        visible = robot_visible(request)
        return SeatListResponse(
            items=[
                {
                    **seat,
                    "mission_supported": (
                        True
                        if visible and robot.control_mode == "mock"
                        else None
                        if robot.supported_seat_ids is None
                        else visible and seat["seat_id"] in robot.supported_seat_ids
                    ),
                }
                for seat in (SEATS if map_ref == "facility-18f" else [])
            ]
        )

    @app.get("/api/robots", response_model=RobotListResponse)
    async def list_robots(request: Request) -> RobotListResponse:
        return RobotListResponse(
            items=[control_plane.store.robot] if robot_visible(request) else []
        )

    @app.websocket("/api/robots/{robot_id}/gateway/ws")
    async def robot_gateway(robot_id: str, websocket: WebSocket) -> None:
        if not robot_auth(websocket, robot_id):
            await websocket.close(code=1008, reason="device authentication required")
            return
        gateway = control_plane.gateway
        if robot_id != "cleany-01" or gateway is None or not gateway.claim():
            await websocket.close(code=1008, reason="unknown robot, mode or connection owner")
            return
        try:
            await accept_robot(websocket)
            while True:
                if not robot_auth(websocket, robot_id):
                    await websocket.close(code=1008, reason="device access revoked")
                    return
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
    async def latest_pose(request: Request) -> PoseSnapshot:
        if not robot_visible(request):
            raise HTTPException(404, "robot not found")
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
        if not robot_auth(websocket, "cleany-01"):
            await websocket.close(code=1008, reason="device authentication required")
            return
        if not control_plane.store.claim_pose_producer():
            await websocket.close(code=1008, reason="pose producer already connected")
            return
        try:
            await accept_robot(websocket)
            while True:
                if not robot_auth(websocket, "cleany-01"):
                    await websocket.close(code=1008, reason="device access revoked")
                    return
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
    async def list_missions(
        request: Request, limit: int = 50, before: str | None = None
    ) -> MissionListResponse:
        site_id = selected_site(request)
        if not 1 <= limit <= 100:
            raise HTTPException(422, "limit must be 1~100")
        with control_plane.store._lock:
            rows = control_plane.accounts.db.execute(
                "SELECT mission_id FROM missions WHERE customer_id=? AND site_id=? "
                "AND (? IS NULL OR json_extract(payload,'$.created_at')||'|'||mission_id<?) "
                "ORDER BY json_extract(payload,'$.created_at') DESC,mission_id DESC LIMIT ?",
                (request.state.identity.customer_id, site_id, before, before, limit),
            ).fetchall()
            items = [control_plane.store.get_mission(row[0]) for row in rows]
        return MissionListResponse(items=[public_mission(item) for item in items])

    @app.post("/api/missions", response_model=MissionResponse)
    async def create_mission(
        input: MissionRequest, request: Request, response: Response
    ) -> MissionResponse:
        try:
            site_id = selected_site(request)
            with control_plane.store.transaction():
                identity = control_plane.accounts.authenticate(request.cookies[cookie_name])
                if not robot_visible(request):
                    raise HTTPException(409, "시설에 연결된 로봇이 없습니다.")
                mission, created = control_plane.create_mission(input, identity, site_id)
        except AuthError:
            raise
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
        return public_mission(mission)

    @app.post("/api/missions/{mission_id}/cancel", response_model=MissionResponse, status_code=202)
    async def cancel_mission(mission_id: str, request: Request) -> MissionResponse:
        mission = scoped_mission(request, mission_id)
        if mission is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="mission not found")
        try:
            with control_plane.store.transaction():
                scoped_mission(request, mission_id)
                control_plane.accounts.authenticate(request.cookies[cookie_name])
                gateway = control_plane.gateway
                result = (
                    gateway.cancel(mission_id)
                    if gateway
                    else control_plane.store.request_cancel(mission_id)
                )
                return public_mission(result)
        except AuthError:
            raise
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(error),
            ) from error

    @app.get("/api/events/stream")
    async def stream_events(request: Request) -> StreamingResponse:
        site_id = selected_site(request)
        customer_id = request.state.identity.customer_id

        async def generate() -> AsyncIterator[str]:
            event_queue: asyncio.Queue[dict[str, object]] = asyncio.Queue(maxsize=100)
            overflow = asyncio.Event()
            loop = asyncio.get_running_loop()

            def listener(event: dict[str, object]) -> None:
                mission_id = event.get("mission_id")
                if mission_id:
                    mission = control_plane.store.get_mission(str(mission_id))
                    if not mission or (mission.customer_id, mission.site_id) != (
                        customer_id,
                        site_id,
                    ):
                        return
                elif control_plane.accounts.robot_scope(str(event["robot_id"])) != (
                    customer_id,
                    site_id,
                ):
                    return

                if mission_id:
                    event = {**event, "payload": public_mission(mission).model_dump(mode="json")}

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
                    try:
                        control_plane.accounts.authenticate(request.cookies.get(cookie_name))
                    except AuthError:
                        yield "event: auth.expired\ndata: {}\n\n"
                        return
                    if overflow.is_set():
                        # Force reconnect/snapshot instead of silently losing lifecycle updates.
                        return
                    try:
                        event = await asyncio.wait_for(
                            event_queue.get(),
                            timeout=control_plane.settings.auth_stream_recheck_seconds,
                        )
                        control_plane.accounts.authenticate(request.cookies.get(cookie_name))
                        payload = json.dumps(event, ensure_ascii=False)
                        yield f"event: update\ndata: {payload}\n\n"
                    except AuthError:
                        yield "event: auth.expired\ndata: {}\n\n"
                        return
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

"""Authenticated HTTP/SSE and robot WebSockets with Gateway or Mock execution."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from datetime import date, datetime
from pathlib import Path
from time import monotonic, time
from typing import Literal

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
from control_plane.domain import ControlPlaneStore, MissionPhase, RobotState, utc_now
from control_plane.gateway import GatewayController
from control_plane.head_camera import HeadCamera
from control_plane.manual_control import ManualCommand, ManualControl, ManualStatus
from control_plane.maps import SlamMap, load_map, map_directory
from control_plane.mock.dispatcher import MockDispatcher
from control_plane.mock.fixtures import SEATS
from control_plane.persistence import SQLiteRepository
from control_plane.robot_observations import RobotObservations
from control_plane.schemas import (
    HealthResponse,
    MissionListResponse,
    MissionRequest,
    MissionResponse,
    MissionReviewResponse,
    PoseInput,
    PoseSnapshot,
    RobotListResponse,
    RobotPose,
    SeatListResponse,
)
from control_plane.seat_layouts import (
    LayoutReview,
    SeatLayout,
    TargetExport,
    read_layout,
    review_layout,
    runtime_matches,
    save_layout,
    target_export,
)
from control_plane.settings import Settings
from control_plane.telemetry_models import RobotAnalytics, RobotObservation, RobotTelemetrySnapshot


class ControlPlaneApplication:
    """Lazily construct persistent state, accounts, and the configured execution adapter."""

    def __init__(self, *, start_dispatcher: bool = True, settings: Settings | None = None) -> None:
        self.settings = settings or Settings()
        self.manual = ManualControl(self.settings)
        self.head_camera = HeadCamera(self.settings)
        # Open SQLite on startup/first request, never on module import or OpenAPI export.
        self._store: ControlPlaneStore | None = None
        self._gateway: GatewayController | None = None
        self._dispatcher: MockDispatcher | None = None
        self.start_dispatcher = start_dispatcher
        self._accounts: Accounts | None = None
        self._telemetry: RobotObservations | None = None
        self._agent = None

    @property
    def agent(self):
        # Status/history GETs run in worker threads. Construct one shared service so
        # its conversation lock and recovery pass cannot race with another instance.
        with self.store._lock:
            if self._agent is None:
                from control_plane.agent_service import AgentService

                self._agent = AgentService(self)
            return self._agent

    @property
    def telemetry(self) -> RobotObservations:
        if self._telemetry is None:
            self._telemetry = RobotObservations(
                self.store, self.settings, self.accounts.robot_scope
            )
        return self._telemetry

    @property
    def store(self) -> ControlPlaneStore:
        """Open durable state lazily and configure the selected execution adapter.

        Unfinished Mock work exposes an ERROR robot rather than being automatically resumed.
        """
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
        """Register scoped work and capture execution provenance for new Mock requests.

        Args:
            identity: Authenticated requester; client-supplied requester names are ignored.
            site_id: Enabled site already resolved for the requester by the HTTP layer.

        Returns:
            The live mission and whether it was newly created.

        Raises:
            ValueError: Target validation or idempotency matching fails.
        """
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
            if created:
                mission.target_map = self.store.robot.target_map
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
    """Wire authenticated APIs, runtime maintenance, and optional dashboard files.

    The lifespan opens state, starts the selected adapter, and closes background work and SQLite.

    Args:
        application: State/adapter owner to reuse, or None to construct one from settings.
        dashboard_root: Optional built dashboard directory; served only when it exists.
    """
    control_plane = application or ControlPlaneApplication()
    dashboard_dist = dashboard_root or Path(__file__).resolve().parents[2] / "dashboard" / "dist"

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        _ = control_plane.store
        _ = control_plane.telemetry
        mock = control_plane.start_dispatcher and control_plane.settings.robot_mode == "mock"
        if mock:
            control_plane.dispatcher.start()

        async def maintenance() -> None:
            while True:
                # The WebSocket loop owns ticks while connected; maintenance handles offline expiry.
                if control_plane.gateway and not control_plane.gateway.connected:
                    control_plane.gateway.tick()
                await asyncio.sleep(control_plane.settings.gateway_tick_interval_seconds)

        async def observation_maintenance() -> None:
            while True:
                try:
                    control_plane.telemetry.tick()
                except Exception:
                    # Observation storage must not stop Gateway expiry or mission admission.
                    logging.getLogger(__name__).exception("Robot observation maintenance failed")
                await asyncio.sleep(control_plane.settings.telemetry_activity_sample_seconds)

        task = asyncio.create_task(maintenance())
        observation_task = asyncio.create_task(observation_maintenance())
        try:
            yield
        finally:
            task.cancel()
            observation_task.cancel()
            with suppress(asyncio.CancelledError):
                await task
            with suppress(asyncio.CancelledError):
                await observation_task
            if mock:
                control_plane.dispatcher.stop()
            control_plane.telemetry.unsubscribe()
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
        """Authorize API access and enforce Origin/CSRF checks for mutation requests.

        Restricted sessions can only inspect identity, change their password, or log out.
        """
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
        """Resolve site_id within the session customer's enabled facilities.

        Missing selection defaults only when exactly one enabled site exists.

        Raises:
            HTTPException: Return 404 for absent, ambiguous, or inaccessible selection.
        """
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
        """Resolve customer ownership independently of the currently selected site.

        Returns:
            The live mission record for the authenticated customer.

        Raises:
            HTTPException: Return the same 404 for missing and foreign mission IDs.
        """
        mission = control_plane.store.get_mission(mission_id)
        if mission is None or mission.customer_id != request.state.identity.customer_id:
            raise HTTPException(404, "mission not found")
        return mission

    def public_mission(mission) -> MissionResponse:
        """Expose managed observations via authenticated URLs and suppress unmanaged links."""
        result = MissionResponse.model_validate(mission)
        with control_plane.store._lock:
            review = control_plane.accounts.db.execute(
                "SELECT reviewed_at,reviewed_by,reviewer_name FROM mission_reviews "
                "WHERE mission_id=?",
                (mission.mission_id,),
            ).fetchone()
        if review:
            result.review = MissionReviewResponse(
                reviewed_at=review[0], reviewed_by=review[1], reviewer_name=review[2]
            )
        for field, stage in (("before_observation", "before"), ("after_observation", "after")):
            reference = getattr(result, field)
            if reference and reference.startswith("observation://"):
                setattr(result, field, f"/api/missions/{mission.mission_id}/observations/{stage}")
            elif reference and (reference.startswith(("http://", "https://", "/", "file:"))):
                # Unmanaged runtime links cannot carry our customer's access policy.
                setattr(result, field, "외부 관측 자료 · 저장소 연결 필요")
        return result

    # Resolve only managed files below the observation root after customer ownership checks.
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
        """Validate device credentials, including the browser subprotocol fallback."""
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

    # Rotate the cookie after replacement; all prior user sessions are revoked.
    @app.post("/api/auth/password/change", response_model=SessionResponse)
    def change_password(input: PasswordInput, request: Request, response: Response):
        token = control_plane.accounts.change_password(
            request.cookies[cookie_name], input.password, input.current_password
        )
        return session_response(token, response)

    # Logout revokes only the current session, unlike password replacement or account disablement.
    @app.post("/api/auth/logout", status_code=204)
    def logout(request: Request, response: Response):
        with control_plane.store.transaction():
            control_plane.accounts.db.execute(
                "UPDATE sessions SET revoked_at=? WHERE session_id=?",
                (time(), request.state.identity.session_id),
            )
        response.delete_cookie(cookie_name, path="/")

    # Explicit user activity extends idle expiry; reads and stream heartbeats do not.
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

    def site_map(request: Request) -> SlamMap:
        site_id = selected_site(request)
        with control_plane.store._lock:
            map_ref = control_plane.accounts.db.execute(
                "SELECT map_ref FROM sites WHERE site_id=?", (site_id,)
            ).fetchone()[0]
        try:
            return load_map(control_plane.settings.map_directory, map_ref)
        except FileNotFoundError as error:
            raise HTTPException(404, "facility map not registered") from error

    @app.get("/api/map", response_model=SlamMap)
    def facility_map(request: Request):
        return site_map(request)

    @app.get("/api/map/image", response_class=FileResponse)
    def facility_map_image(request: Request):
        metadata = site_map(request)
        return FileResponse(
            map_directory(control_plane.settings.map_directory, metadata.map_id) / "map.png",
            media_type="image/png",
            headers={"Cache-Control": "private, no-store"},
        )

    @app.get("/api/map/presentation", response_class=FileResponse)
    def facility_map_presentation(request: Request):
        metadata = site_map(request)
        if metadata.presentation is None:
            raise HTTPException(404, "map presentation not registered")
        return FileResponse(
            map_directory(control_plane.settings.map_directory, metadata.map_id)
            / "presentation.svg",
            media_type="image/svg+xml",
            headers={"Cache-Control": "private, no-store"},
        )

    @app.get("/api/map/presentation/{layer}", response_class=FileResponse)
    def facility_map_display_layer(request: Request, layer: Literal["floorplan", "slam"]):
        metadata = site_map(request)
        if metadata.presentation is None or metadata.presentation.layers is None:
            raise HTTPException(404, "map display layers not registered")
        return FileResponse(
            map_directory(control_plane.settings.map_directory, metadata.map_id)
            / f"display-{layer}.png",
            media_type="image/png",
            headers={"Cache-Control": "private, no-store"},
        )

    def site_layout(request: Request, metadata: SlamMap | None = None) -> SeatLayout:
        metadata = metadata or site_map(request)
        try:
            with control_plane.store._lock:
                return read_layout(
                    control_plane.accounts.db,
                    control_plane.settings.map_directory,
                    request.state.identity.customer_id,
                    selected_site(request),
                    metadata,
                )
        except FileNotFoundError as error:
            raise HTTPException(404, "좌석 배치가 등록되지 않았습니다.") from error
        except ValueError as error:
            raise HTTPException(409, str(error)) from error

    @app.get("/api/seat-layout", response_model=LayoutReview)
    def get_seat_layout(request: Request):
        metadata = site_map(request)
        return review_layout(
            site_layout(request, metadata), metadata, control_plane.settings.map_directory
        )

    @app.put("/api/seat-layout", response_model=LayoutReview)
    def put_seat_layout(input: SeatLayout, request: Request):
        metadata = site_map(request)
        try:
            with control_plane.store.transaction():
                control_plane.accounts.authenticate(request.cookies[cookie_name])
                layout = save_layout(
                    control_plane.accounts.db,
                    control_plane.settings.map_directory,
                    request.state.identity.customer_id,
                    selected_site(request),
                    metadata,
                    input,
                )
        except ValueError as error:
            raise HTTPException(409, str(error)) from error
        return review_layout(layout, metadata, control_plane.settings.map_directory)

    @app.get("/api/seat-layout/targets", response_model=TargetExport)
    def export_seat_targets(request: Request):
        return target_export(site_layout(request))

    # API liveness only; this does not probe robot connectivity or execution health.
    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    # Inventory is map-specific; unknown runtime capabilities remain null rather than unsupported.
    def physical_profile_ready() -> bool:
        if not control_plane.settings.require_physical_missions:
            return True
        return (
            control_plane.gateway is not None and control_plane.gateway.permits_execution_profile()
        )

    @app.get("/api/seats", response_model=SeatListResponse)
    async def list_seats(request: Request) -> SeatListResponse:
        site_id = selected_site(request)
        with control_plane.store._lock:
            map_ref = control_plane.accounts.db.execute(
                "SELECT map_ref FROM sites WHERE site_id=?", (site_id,)
            ).fetchone()[0]
        robot = control_plane.store.robot
        visible = robot_visible(request)
        if map_ref != "facility-18f":
            try:
                layout = site_layout(request)
            except HTTPException as error:
                if error.status_code == 404:
                    return SeatListResponse(items=[])
                raise
            matches = runtime_matches(layout, robot.target_map)
            return SeatListResponse(
                items=[
                    {
                        **{
                            key: getattr(seat, key)
                            for key in ("seat_id", "label", "zone_id", "row", "grid_column")
                        },
                        "occupancy": "UNKNOWN",
                        "occupant_name": None,
                        "mission_supported": bool(
                            visible
                            and matches
                            and seat.verification == "field_verified"
                            and seat.seat_id in (robot.supported_seat_ids or [])
                            and physical_profile_ready()
                        ),
                    }
                    for seat in layout.seats
                ]
            )
        return SeatListResponse(
            items=[
                {
                    **seat,
                    "mission_supported": False
                    if control_plane.settings.require_physical_missions
                    else (
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

    def observation_scope(robot_id: str, request: Request):
        scope = (request.state.identity.customer_id, selected_site(request))
        if control_plane.accounts.robot_scope(robot_id) != scope:
            raise HTTPException(404, "robot not found")
        return scope

    @app.get("/api/robots/{robot_id}/telemetry", response_model=RobotTelemetrySnapshot)
    def robot_telemetry(robot_id: str, request: Request):
        return control_plane.telemetry.snapshot(robot_id, observation_scope(robot_id, request))

    @app.get("/api/robots/{robot_id}/analytics", response_model=RobotAnalytics)
    def robot_analytics(
        robot_id: str, request: Request, start: datetime, end: datetime, before: str | None = None
    ):
        scope = observation_scope(robot_id, request)
        try:
            return control_plane.telemetry.analytics(robot_id, scope, start, end, before)
        except (ValueError, OverflowError) as error:
            raise HTTPException(422, str(error)) from error

    @app.websocket("/api/robots/{robot_id}/telemetry/ws")
    async def robot_observations(robot_id: str, websocket: WebSocket):
        if not robot_auth(websocket, robot_id):
            await websocket.close(code=1008, reason="device authentication required")
            return
        scope = control_plane.accounts.robot_scope(robot_id)
        session = control_plane.telemetry.claim(robot_id, scope)
        if not session:
            await websocket.close(code=1008, reason="telemetry producer already connected")
            return
        try:
            await accept_robot(websocket)
            while True:
                if (
                    not robot_auth(websocket, robot_id)
                    or control_plane.accounts.robot_scope(robot_id) != scope
                ):
                    await websocket.close(code=1008, reason="device access changed")
                    return
                try:
                    raw = await asyncio.wait_for(
                        websocket.receive_text(),
                        timeout=control_plane.settings.telemetry_receive_timeout_seconds,
                    )
                    if len(raw) > 262144:
                        raise ValueError("telemetry frame too large")
                    frame = RobotObservation.model_validate_json(raw)
                except TimeoutError:
                    await websocket.close(code=1001, reason="telemetry receive timeout")
                    return
                except (ValueError, TypeError, KeyError):
                    await websocket.close(code=1003, reason="invalid telemetry observation")
                    return
                accepted = control_plane.telemetry.receive(robot_id, scope, session, frame)
                await websocket.send_json({"sequence": frame.sequence, "accepted": accepted})
        except WebSocketDisconnect:
            pass
        finally:
            control_plane.telemetry.release(robot_id, session)

    # A device token and sole connection ownership are required; ACKs follow committed receipt.
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

    # A stale read retains coordinates and may publish the cycle's first stale notification.
    def manual_scope(robot_id: str, request: Request):
        if robot_id != "cleany-01" or not robot_visible(request):
            raise HTTPException(404, "robot not found")

    def pending_work(request: Request) -> bool:
        with control_plane.store._lock:
            return bool(
                control_plane.accounts.db.execute(
                    "SELECT 1 FROM missions WHERE customer_id=? AND site_id=? "
                    "AND json_extract(payload,'$.phase')!='TERMINAL' LIMIT 1",
                    (request.state.identity.customer_id, selected_site(request)),
                ).fetchone()
            )

    @app.get(
        "/api/robots/{robot_id}/camera/head",
        response_class=Response,
        responses={
            200: {"content": {"image/jpeg": {"schema": {"type": "string", "format": "binary"}}}}
        },
    )
    async def head_camera_frame(robot_id: str, request: Request):
        manual_scope(robot_id, request)
        return await control_plane.head_camera.frame()

    @app.get("/api/robots/{robot_id}/manual/status", response_model=ManualStatus)
    async def manual_status(robot_id: str, request: Request):
        manual_scope(robot_id, request)
        result = await control_plane.manual.status(pending_work(request))
        blocked = control_plane.telemetry.manual_block(
            robot_id, observation_scope(robot_id, request)
        )
        if blocked:
            result.ready = False
            result.blocked_reason = blocked
        return result

    @app.post("/api/robots/{robot_id}/manual/control", response_model=ManualStatus)
    async def manual_command(robot_id: str, input: ManualCommand, request: Request):
        manual_scope(robot_id, request)
        identity = request.state.identity
        session_key = identity.csrf_token
        if input.action == "stop":
            return await control_plane.manual.command(input, session_key)
        async with control_plane.manual.lock:
            # Authentication may have been revoked while another request held admission.
            control_plane.accounts.authenticate(request.cookies[cookie_name])
            if pending_work(request):
                raise HTTPException(409, "대기 또는 진행 중인 작업을 종료한 뒤 조종하세요.")
            blocked = control_plane.telemetry.manual_block(
                robot_id, observation_scope(robot_id, request)
            )
            if blocked:
                raise HTTPException(409, blocked)
            return await control_plane.manual.command(input, session_key)

    @app.get("/api/robots/cleany-01/pose", response_model=PoseSnapshot)
    async def latest_pose(request: Request) -> PoseSnapshot:
        if not robot_visible(request):
            raise HTTPException(404, "robot not found")
        pose, stale = control_plane.store.latest_pose(app.state.pose_timeout)
        if stale and pose is not None:
            control_plane.store.publish_pose_stale()
        return PoseSnapshot(
            pose=(
                RobotPose(
                    x=pose.x,
                    y=pose.y,
                    received_at=pose.received_at,
                    yaw=pose.yaw,
                    frame_id=pose.frame_id,
                    map_id=pose.map_id,
                )
                if pose
                else None
            ),
            stale=stale,
        )

    # Pose ownership is independent of the mission Gateway; timeout/disconnect marks data stale.
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
                control_plane.store.update_pose(
                    pose.x, pose.y, yaw=pose.yaw, frame_id=pose.frame_id, map_id=pose.map_id
                )
        except WebSocketDisconnect:
            return
        finally:
            control_plane.store.release_pose_producer()

    # Newest-first facility history uses an exclusive created_at|mission_id cursor, not an offset.
    @app.get("/api/missions", response_model=MissionListResponse)
    async def list_missions(
        request: Request, limit: int = 50, before: str | None = None, day: date | None = None
    ) -> MissionListResponse:
        site_id = selected_site(request)
        if not 1 <= limit <= 100:
            raise HTTPException(422, "limit must be 1~100")
        with control_plane.store._lock:
            selected_day = day.isoformat() if day else None
            rows = control_plane.accounts.db.execute(
                "SELECT mission_id FROM missions WHERE customer_id=? AND site_id=? "
                "AND (? IS NULL OR json_extract(payload,'$.created_at')||'|'||mission_id<?) "
                "AND (? IS NULL OR date(json_extract(payload,'$.created_at'),'+9 hours')=? "
                "OR date(json_extract(payload,'$.finished_at'),'+9 hours')=? "
                "OR (?=date('now','+9 hours') AND json_extract(payload,'$.phase')!='TERMINAL' "
                "AND date(json_extract(payload,'$.created_at'),'+9 hours')<?)) "
                "ORDER BY json_extract(payload,'$.created_at') DESC,mission_id DESC LIMIT ?",
                (
                    request.state.identity.customer_id,
                    site_id,
                    before,
                    before,
                    selected_day,
                    selected_day,
                    selected_day,
                    selected_day,
                    selected_day,
                    limit,
                ),
            ).fetchall()
            items = [control_plane.store.get_mission(row[0]) for row in rows]
        return MissionListResponse(items=[public_mission(item) for item in items])

    @app.get("/api/missions/{mission_id}", response_model=MissionResponse)
    async def get_mission(mission_id: str, request: Request) -> MissionResponse:
        mission = scoped_mission(request, mission_id)
        if mission.site_id != selected_site(request):
            raise HTTPException(404, "mission not found")
        return public_mission(mission)

    @app.post("/api/missions/{mission_id}/review", response_model=MissionResponse)
    async def review_mission(mission_id: str, request: Request) -> MissionResponse:
        """Idempotently acknowledge a terminal result without altering its outcome or sequence."""
        with control_plane.store.transaction():
            mission = scoped_mission(request, mission_id)
            identity = control_plane.accounts.authenticate(request.cookies[cookie_name])
            if mission.site_id != selected_site(request):
                raise HTTPException(404, "mission not found")
            if mission.phase != MissionPhase.TERMINAL:
                raise HTTPException(409, "종료된 작업만 검토 완료할 수 있습니다.")
            inserted = control_plane.accounts.db.execute(
                "INSERT OR IGNORE INTO mission_reviews VALUES(?,?,?,?)",
                (mission_id, utc_now(), identity.user_id, identity.display_name),
            ).rowcount
            result = public_mission(mission)
            if inserted:
                control_plane.store._publish(
                    "mission.reviewed", mission, payload=result.model_dump(mode="json")
                )
            return result

    async def admit_missions(inputs, request, *, before=None, after=None):
        """One admission path for manual requests and approved agent batches.

        The whole batch and approval audit commit atomically. Robot/Gateway still owns
        acceptance, safety and execution; this function only enqueues validated requests.
        """
        try:
            site_id = selected_site(request)
            async with control_plane.manual.lock:
                if not robot_visible(request):
                    raise HTTPException(409, "시설에 연결된 로봇이 없습니다.")
                existing = {
                    m.idempotency_key
                    for m in control_plane.store.list_missions()
                    if m.customer_id == request.state.identity.customer_id
                }
                if any(item.idempotency_key not in existing for item in inputs):
                    await control_plane.manual.require_idle()
                with control_plane.store.transaction():
                    identity = control_plane.accounts.authenticate(request.cookies[cookie_name])
                    request.state.identity = identity
                    selected_site(request)
                    if not robot_visible(request):
                        raise HTTPException(409, "시설에 연결된 로봇이 없습니다.")
                    if before:
                        before()
                    map_ref = control_plane.accounts.db.execute(
                        "SELECT map_ref FROM sites WHERE site_id=?", (site_id,)
                    ).fetchone()[0]
                    existing = {
                        m.idempotency_key
                        for m in control_plane.store.list_missions()
                        if m.customer_id == identity.customer_id
                    }
                    new_items = [item for item in inputs if item.idempotency_key not in existing]
                    if new_items:
                        if (
                            map_ref == "facility-18f"
                            and control_plane.settings.require_physical_missions
                        ):
                            raise HTTPException(
                                409, "실물 미션에는 현장 검증된 SLAM 지도가 필요합니다."
                            )
                        if map_ref != "facility-18f":
                            layout = site_layout(request)
                            if not runtime_matches(layout, control_plane.store.robot.target_map):
                                raise HTTPException(
                                    409,
                                    "현장 검증된 작업 위치와 런타임 지도 버전이 일치하지 않습니다.",
                                )
                            verified = {
                                s.seat_id
                                for s in layout.seats
                                if s.verification == "field_verified"
                            }
                            if any(
                                item.to_domain_target().reference_id not in verified
                                for item in new_items
                            ):
                                raise HTTPException(422, "현장 검증이 완료되지 않은 좌석입니다.")
                        if not physical_profile_ready():
                            raise HTTPException(
                                409, "실물 미션 런타임의 연결과 실행 모드를 확인해 주세요."
                            )
                    results = [
                        control_plane.create_mission(item, identity, site_id) for item in inputs
                    ]
                    if after:
                        after(results)
                    return results
        except AuthError:
            raise
        except ValueError as error:
            raise HTTPException(409 if "idempotency" in str(error) else 422, str(error)) from error

    @app.post("/api/missions", response_model=MissionResponse)
    async def create_mission(
        input: MissionRequest, request: Request, response: Response
    ) -> MissionResponse:
        mission, created = (await admit_missions([input], request))[0]
        response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return public_mission(mission)

    from control_plane.agent_routes import register_agent_routes

    register_agent_routes(
        app, control_plane, selected_site, list_seats, public_mission, admit_missions, cookie_name
    )

    # 202 acknowledges handling, not completion of active work; access is customer-scoped.
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

    # SSE has no replay cursor: reconnecting clients refetch snapshots and revalidate their session.
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

                # Worker callbacks hand queue access to the event loop.
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
    """Start Uvicorn using explicit bind overrides or the configured CLEANY_ defaults."""
    settings = Settings()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    uvicorn.run(
        app,
        host=host or settings.host,
        port=port or settings.port,
        timeout_graceful_shutdown=settings.shutdown_grace_seconds,
    )

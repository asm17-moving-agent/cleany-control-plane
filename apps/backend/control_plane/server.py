from __future__ import annotations

import json
import queue
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread
from urllib.parse import urlparse

from control_plane.domain import (
    ControlPlaneStore,
    MissionOutcome,
    MissionPhase,
    RobotState,
)


OCCUPANTS = {
    3: "김태현",
    4: "김혜성",
    6: "신홍재",
    9: "김응현",
    10: "오혜린",
    11: "김정현",
    13: "이창학",
    14: "강정민",
    15: "조성민",
    16: "최규호",
    17: "심여준",
    19: "정지은",
    21: "장현",
    22: "서예진",
    24: "심재혁",
    30: "이학성",
    31: "황선규",
    32: "권상재",
    34: "오창은",
    36: "방현우",
    37: "이강룡",
    38: "정지우",
    39: "엄현준",
    42: "박재영",
    46: "박창수",
    48: "이정현",
}
GRID_COLUMNS = (1, 2, 3, 5, 6, 8, 9, 10)

SEATS = [
    {
        "seat_id": f"seat-{number:02d}",
        "label": f"{number:02d}",
        "row": (number - 1) // 8 + 1,
        "grid_column": GRID_COLUMNS[(number - 1) % 8],
        "occupancy": "OCCUPIED" if number in OCCUPANTS else "AVAILABLE",
        "occupant_name": OCCUPANTS.get(number),
    }
    for number in range(1, 49)
]


class MockDispatcher:
    CHECKPOINTS = (
        (MissionPhase.OFFERED, "Mission offered to cleany-01."),
        (MissionPhase.ACCEPTED, "Robot accepted the mission."),
        (MissionPhase.NAVIGATING, "Navigating to the selected seat."),
        (MissionPhase.WORKING, "Observing and processing the tabletop scene."),
        (MissionPhase.RETURNING, "Returning to the waiting position."),
    )

    def __init__(self, store: ControlPlaneStore, step_delay: float = 0.8) -> None:
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
    def __init__(self, dashboard_root: Path) -> None:
        self.store = ControlPlaneStore()
        self.dashboard_root = dashboard_root
        self.dispatcher = MockDispatcher(self.store)


def make_handler(application: ControlPlaneApplication) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "CleanyMockControlPlane/0.1"
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args: object) -> None:
            print(f"[{self.log_date_time_string()}] {format % args}")

        def _json(self, status: HTTPStatus, payload: object) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _read_json(self) -> dict[str, object]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return {}
            return json.loads(self.rfile.read(length))

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/health":
                self._json(HTTPStatus.OK, {"status": "ok"})
            elif path == "/api/seats":
                self._json(HTTPStatus.OK, {"items": SEATS})
            elif path == "/api/robots":
                self._json(HTTPStatus.OK, {"items": [application.store.robot.to_dict()]})
            elif path == "/api/missions":
                self._json(
                    HTTPStatus.OK,
                    {"items": [item.to_dict() for item in application.store.list_missions()]},
                )
            elif path == "/api/events/stream":
                self._serve_events()
            else:
                self._serve_static(path)

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            try:
                if path == "/api/missions":
                    payload = self._read_json()
                    mission, created = application.store.create_mission(
                        seat_id=str(payload.get("seat_id", "")),
                        priority=str(payload.get("priority", "NORMAL")),
                        requested_by=str(payload.get("requested_by", "operator")),
                        idempotency_key=str(payload.get("idempotency_key", "")),
                    )
                    self._json(
                        HTTPStatus.CREATED if created else HTTPStatus.OK,
                        mission.to_dict(),
                    )
                    return

                parts = path.strip("/").split("/")
                if len(parts) == 4 and parts[:2] == ["api", "missions"] and parts[3] == "cancel":
                    mission = application.store.get_mission(parts[2])
                    if mission is None:
                        self._json(HTTPStatus.NOT_FOUND, {"error": "mission not found"})
                        return
                    self._json(
                        HTTPStatus.ACCEPTED,
                        application.store.request_cancel(parts[2]).to_dict(),
                    )
                    return
            except (ValueError, json.JSONDecodeError) as error:
                self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

        def _serve_events(self) -> None:
            events: queue.Queue[dict[str, object]] = queue.Queue(maxsize=100)

            def listener(event: dict[str, object]) -> None:
                try:
                    events.put_nowait(event)
                except queue.Full:
                    pass

            unsubscribe = application.store.subscribe(listener)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()
                while True:
                    try:
                        event = events.get(timeout=10)
                        data = json.dumps(event, ensure_ascii=False)
                        self.wfile.write(f"event: update\ndata: {data}\n\n".encode())
                    except queue.Empty:
                        self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                unsubscribe()

        def _serve_static(self, path: str) -> None:
            relative = "index.html" if path == "/" else path.lstrip("/")
            requested = (application.dashboard_root / relative).resolve()
            root = application.dashboard_root.resolve()
            if root not in requested.parents and requested != root:
                self._json(HTTPStatus.FORBIDDEN, {"error": "forbidden"})
                return
            if not requested.is_file():
                self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            content_types = {
                ".html": "text/html; charset=utf-8",
                ".js": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".svg": "image/svg+xml",
            }
            body = requested.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header(
                "Content-Type",
                content_types.get(requested.suffix, "application/octet-stream"),
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def run(host: str = "127.0.0.1", port: int = 8080) -> None:
    dashboard_root = Path(__file__).resolve().parents[2] / "dashboard"
    application = ControlPlaneApplication(dashboard_root)
    server = ThreadingHTTPServer((host, port), make_handler(application))
    application.dispatcher.start()
    print(f"Cleany mock control plane: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        application.dispatcher.stop()
        server.server_close()

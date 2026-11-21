import copy
import hashlib
import json
from contextlib import contextmanager

import pytest
from account_support import authorize
from fastapi.testclient import TestClient

from control_plane.maps import load_map
from control_plane.mock.fixtures import SEATS
from control_plane.seat_layouts import MetricPose, raster_point, read_layout
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings


@contextmanager
def session(database=":memory:"):
    app = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            database_path=database,
            robot_mode="mock",
            cookie_secure=False,
            allowed_origins=["http://test"],
        ),
    )
    with TestClient(create_app(app), base_url="http://test") as client:
        authorize(client, app)
        app.accounts.db.execute("UPDATE sites SET map_ref='slam-20261108'")
        client.params = {"site_id": "BUSAN_SOMA_18F"}
        yield client, app


def test_preserves_all_82_ids_and_scope_and_runtime_is_not_verified():
    with session() as (client, app):
        review = client.get("/api/seat-layout").json()
        layout = review["layout"]
        assert [s["seat_id"] for s in layout["seats"]] == [s["seat_id"] for s in SEATS]
        assert len({s["table_id"] for s in layout["seats"]}) == 16
        assert all(s["verification"] == "draft" for s in layout["seats"])
        assert layout["home"] is None
        assert client.get("/api/seat-layout", params={"site_id": "foreign"}).status_code == 404
        assert (
            client.put("/api/seat-layout", json=layout, params={"site_id": "foreign"}).status_code
            == 404
        )
        client.headers.pop("X-CSRF-Token")
        assert client.put("/api/seat-layout", json=layout).status_code == 403
        assert not any(s["mission_supported"] for s in client.get("/api/seats").json()["items"])
        assert (
            client.post(
                "/api/missions", json={"seat_id": "seat-01", "idempotency_key": "blocked"}
            ).status_code
            == 403
        )


def test_revision_history_isolation_and_no_client_verification(tmp_path):
    database = str(tmp_path / "catalog.db")
    with session(database) as (client, app):
        original = client.get("/api/seat-layout").json()["layout"]
        changed = copy.deepcopy(original)
        changed["seats"][0]["pose"]["x"] += 0.1
        changed["seats"][0]["verification"] = "field_verified"
        changed["home_verified"] = True
        result = client.put("/api/seat-layout", json=changed)
        assert result.status_code == 200, result.text
        saved = result.json()["layout"]
        assert saved["revision"] == 1
        assert not saved["home_verified"]
        assert saved["seats"][0]["verification"] == "draft"
        assert client.put("/api/seat-layout", json=original).status_code == 409
        assert (
            client.get("/api/seat-layout", params={"site_id": "BUSAN_SOMA_19F"}).json()["layout"]
            == original
        )
        saved["seats"][0]["label"] = "검토 01"
        assert client.put("/api/seat-layout", json=saved).status_code == 200
        assert (
            app.accounts.db.execute(
                "SELECT count(*) FROM seat_layouts WHERE revision>0"
            ).fetchone()[0]
            == 2
        )
        customer = app.accounts.db.execute("SELECT customer_id FROM sites LIMIT 1").fetchone()[0]
    # Reopen the durable database, rather than trusting the HTTP response alone.
    reopened = ControlPlaneApplication(settings=Settings(database_path=database))
    metadata = load_map(reopened.settings.map_directory, "slam-20261108")
    restored = read_layout(
        reopened.accounts.db, reopened.settings.map_directory, customer, "BUSAN_SOMA_18F", metadata
    )
    assert restored.revision == 2 and restored.seats[0].label == "검토 01"
    reopened.store.repository.close()


@pytest.mark.parametrize("mutation", ["map", "hash", "bounds", "nan", "duplicate", "empty"])
def test_rejects_invalid_layout_without_changing_saved_state(mutation):
    with session() as (client, app):
        original = client.get("/api/seat-layout").json()["layout"]
        changed = copy.deepcopy(original)
        if mutation == "map":
            changed["map_id"] = "another-map"
        if mutation == "hash":
            changed["source_sha256"] = "0" * 64
        if mutation == "bounds":
            changed["seats"][0]["approach"]["x"] = 9999
        if mutation == "nan":
            changed["seats"][0]["pose"]["x"] = "NaN"
        if mutation == "duplicate":
            changed["seats"][1]["seat_id"] = changed["seats"][0]["seat_id"]
        if mutation == "empty":
            changed["seats"] = []
        assert client.put("/api/seat-layout", json=changed).status_code in (409, 422)
        assert client.get("/api/seat-layout").json()["layout"] == original


def test_pending_mission_blocks_edits_and_export_is_digest_bound():
    with session() as (client, app):
        layout = client.get("/api/seat-layout").json()["layout"]
        app.accounts.db.execute(
            "UPDATE sites SET map_ref='facility-18f' WHERE site_id='BUSAN_SOMA_18F'"
        )
        assert (
            client.post(
                "/api/missions",
                json={
                    "seat_id": "seat-01",
                    "idempotency_key": "pending-edit",
                    "priority": "NORMAL",
                },
            ).status_code
            == 201
        )
        app.accounts.db.execute(
            "UPDATE sites SET map_ref='slam-20261108' WHERE site_id='BUSAN_SOMA_18F'"
        )
        assert client.put("/api/seat-layout", json=layout).status_code == 409
        exported = client.get("/api/seat-layout/targets").json()
        digest = exported.pop("target_digest")
        assert (
            hashlib.sha256(
                json.dumps(
                    exported, sort_keys=True, separators=(",", ":"), ensure_ascii=True
                ).encode()
            ).hexdigest()
            == digest
        )
        assert exported["validation_status"] == "draft" and exported["home"] is None
        for seat in layout["seats"]:
            assert exported["seats"][seat["seat_id"]] == [
                seat["approach"][k] for k in ("x", "y", "yaw")
            ]


def test_raster_axis_rotation_and_obstacle_review():
    metadata = load_map(Settings().map_directory, "slam-20261108")
    x, y = metadata.origin[:2]
    assert raster_point(metadata, MetricPose(x=x, y=y, yaw=0)) == pytest.approx(
        (0, metadata.height)
    )
    rotated = metadata.model_copy(update={"origin": (x, y, 1.5707963267948966)})
    assert raster_point(rotated, MetricPose(x=x, y=y + 1, yaw=0)) == pytest.approx(
        (20, metadata.height)
    )
    with session() as (client, app):
        review = client.get("/api/seat-layout").json()
        # Unknown/occupied surroundings must not disappear from the validation report.
        layout = review["layout"]
        layout["seats"][0]["approach"] = {"x": x + 0.1, "y": y + 0.1, "yaw": 0}
        saved = client.put("/api/seat-layout", json=layout)
        assert saved.status_code == 200
        assert "seat-01" in saved.json()["warnings"]


def test_room_columns_are_centered_inside_each_room():
    with session() as (client, _):
        metadata = load_map(Settings().map_directory, "slam-20261108")
        a, b, c, d, e, f = metadata.presentation.transform
        layout = client.get("/api/seat-layout").json()["layout"]
        for zone, cx, cy in [
            ("space-a4", 96, 75),
            ("space-a3", 64, 133),
            ("space-a2", 64, 190),
            ("space-a1", 64, 251),
        ]:
            positions = []
            for seat in layout["seats"]:
                if seat["zone_id"] == zone:
                    x, y = raster_point(metadata, MetricPose(**seat["pose"]))
                    positions.append((a * x + c * y + e, b * x + d * y + f))
            assert sum(p[0] for p in positions) / len(positions) == pytest.approx(cx)
            assert sum(p[1] for p in positions) / len(positions) == pytest.approx(cy)


def test_field_evidence_promotes_only_selected_seats_and_edits_revoke_it(tmp_path):
    import subprocess
    import sys
    from pathlib import Path

    database = str(tmp_path / "approval.db")
    with session(database) as (client, app):
        layout = client.get("/api/seat-layout").json()["layout"]
        layout["home"] = dict(layout["seats"][0]["approach"])
        layout = client.put("/api/seat-layout", json=layout).json()["layout"]
        evidence = {key: layout[key] for key in ("map_id", "source_sha256", "revision")}
        evidence.update(
            site_id="BUSAN_SOMA_18F",
            seat_ids=["seat-01", "seat-a1-01", "seat-m1-01"],
            home_verified=True,
            navigation=True,
            stopped_pose=True,
            desk_approach=True,
            operator="test fixture",
            checked_at="2026-11-13T00:00:00+09:00",
            notes="Synthetic approval fixture, not physical evidence",
        )
        record = tmp_path / "synthetic-evidence.json"
        record.write_text(json.dumps(evidence))
        tool = Path(__file__).resolve().parents[3] / "tools/maps/verify_seat_layout.py"
        completed = subprocess.run(
            [
                sys.executable,
                str(tool),
                "--database",
                database,
                "--site",
                "BUSAN_SOMA_18F",
                "--evidence",
                str(record),
            ],
            capture_output=True,
        )
        assert completed.returncode == 0, completed.stderr
        saved = client.get("/api/seat-layout").json()["layout"]
        exported = client.get("/api/seat-layout/targets").json()
        assert exported["validation_status"] == "field_verified"
        assert set(exported["seats"]) == set(evidence["seat_ids"])
        # Approval alone cannot make an offline or differently configured runtime eligible.
        assert not any(s["mission_supported"] for s in client.get("/api/seats").json()["items"])
        stale = subprocess.run(
            [
                sys.executable,
                str(tool),
                "--database",
                database,
                "--site",
                "BUSAN_SOMA_18F",
                "--evidence",
                str(record),
            ],
            capture_output=True,
        )
        assert stale.returncode != 0
        revised = client.put("/api/seat-layout", json=saved).json()["layout"]
        assert not revised["home_verified"] and revised["verification_evidence"] is None
        assert client.get("/api/seat-layout/targets").json()["validation_status"] == "draft"


def test_seed_scale_matches_legacy_geometry_and_pitch():
    from math import hypot
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    geometry = json.loads(
        (root / "apps/dashboard/src/features/facility-map/seat-geometry.json").read_text()
    )
    layout = json.loads((root / "apps/backend/maps/slam-20261108/seat-layout.json").read_text())
    entries = {s["seat_id"]: s for s in layout["seats"]}
    unit = geometry["reference_room_width_units"] / geometry["reference_room_width_m"]
    for seat in entries.values():
        if seat["zone_id"] == "d-hub":
            assert (seat["width"], seat["depth"]) == (1.2, 0.77)
        else:
            assert seat["width"] == pytest.approx(38 * 0.85 / unit)
            assert seat["depth"] == pytest.approx(28 * 0.85 / unit)
    for first, second, spacing in [
        ("seat-01", "seat-02", 1.2),
        ("seat-01", "seat-09", 0.77),
        ("seat-m1-01", "seat-m1-02", 40 * 0.85 / unit),
        ("seat-m1-01", "seat-m1-04", 32 * 0.85 / unit),
    ]:
        a, b = entries[first]["pose"], entries[second]["pose"]
        assert hypot(a["x"] - b["x"], a["y"] - b["y"]) == pytest.approx(spacing)


def test_correcting_seed_preserves_history_and_refuses_user_edits():
    import importlib.util
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    spec = importlib.util.spec_from_file_location(
        "replace_seed", root / "tools/maps/replace_seat_seed.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from control_plane.seat_layouts import SeatLayout

    with session() as (client, app):
        current = SeatLayout.model_validate(client.get("/api/seat-layout").json()["layout"])
        next_layout = current.model_copy(deep=True)
        next_layout.seats[0].width += 0.1
        with app.store.transaction():
            result = module.replace_seed(
                app.accounts.db, app.settings.map_directory, "BUSAN_SOMA_18F", current, next_layout
            )
        assert result.revision == 1
        assert app.accounts.db.execute("SELECT count(*) FROM seat_layouts").fetchone()[0] == 2
        with pytest.raises(ValueError, match="user edits"), app.store.transaction():
            module.replace_seed(
                app.accounts.db, app.settings.map_directory, "BUSAN_SOMA_18F", current, next_layout
            )


def test_dhub_is_axis_aligned_with_measured_dimensions_and_clearances():
    import math
    from hashlib import sha256
    from pathlib import Path

    directory = Path(__file__).resolve().parents[1] / "maps/slam-20261108"
    reference = json.loads((directory / "dhub-layout-reference.json").read_text())
    image_hash = sha256((directory / reference["display_image"]).read_bytes()).hexdigest()
    assert image_hash == reference["display_image_sha256"]
    layout = json.loads((directory / "seat-layout.json").read_text())
    metadata = load_map(Settings().map_directory, "slam-20261108")
    a, b, c, d, e, f = metadata.presentation.transform
    rows = {}
    for seat in layout["seats"]:
        if seat["zone_id"] != "d-hub":
            continue
        center = MetricPose(**seat["pose"])
        px, py = raster_point(metadata, center)
        cx, cy = a * px + c * py + e, b * px + d * py + f
        heading = math.radians(metadata.presentation.rotation_degrees) - center.yaw
        assert math.cos(heading) == pytest.approx(0, abs=1e-12)
        assert math.sin(heading) == pytest.approx(1 if seat["row"] % 2 else -1)
        assert (seat["width"], seat["depth"]) == (1.2, 0.77)
        approach = seat["approach"]
        assert approach["yaw"] == center.yaw
        approach_distance = 0.8 + 0.77 / 2
        assert math.hypot(approach["x"] - center.x, approach["y"] - center.y) == pytest.approx(
            approach_distance
        )
        assert approach["x"] + math.cos(center.yaw) * approach_distance == pytest.approx(center.x)
        assert approach["y"] + math.sin(center.yaw) * approach_distance == pytest.approx(center.y)
        rows.setdefault(seat["row"], []).append((cx, cy))
    assert len(rows) == 6
    for row in rows.values():
        assert len(row) == 8
        row.sort()
        assert [y for _, y in row] == pytest.approx([row[0][1]] * 8, abs=1e-10)
        # All six rows share the same eight columns; the two aisles are exactly 1.33 m.
        assert [x for x, _ in row] == pytest.approx([x for x, _ in sorted(rows[1])])
        gaps = [(row[i + 1][0] - row[i][0]) * metadata.resolution - 1.2 for i in range(7)]
        assert gaps == pytest.approx([0, 0, 1.33, 0, 1.33, 0, 0], abs=1e-10)
    pitches = [(rows[i + 1][0][1] - rows[i][0][1]) * metadata.resolution for i in range(1, 6)]
    assert pitches == pytest.approx([0.77, 2.4, 0.77, 2.4, 0.77])
    # The open space between paired blocks is 2.4 - 0.77 = 1.63 m.
    walls, units = reference["wall_center_pixels"], reference["pixels_per_unit"]
    cx = (rows[1][0][0] + rows[1][-1][0]) / 2
    cy = (rows[1][0][1] + rows[6][0][1]) / 2
    assert cx == pytest.approx((walls["west"] + walls["east"]) / (2 * units))
    assert cy == pytest.approx((walls["north"] + walls["south"]) / (2 * units))
    furniture_width = (rows[1][-1][0] - rows[1][0][0]) * metadata.resolution + 1.2
    assert furniture_width == pytest.approx(12.26)
    drawn_width = (walls["east"] - walls["west"]) / units * metadata.resolution
    assert abs(furniture_width - drawn_width) < metadata.resolution

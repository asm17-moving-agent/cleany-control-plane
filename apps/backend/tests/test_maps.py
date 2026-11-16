from pathlib import Path

import pytest
from account_support import authorize
from fastapi.testclient import TestClient

from control_plane.maps import load_map, map_directory
from control_plane.server import ControlPlaneApplication, create_app
from control_plane.settings import Settings


def test_map_scope_and_raster():
    application = ControlPlaneApplication(
        start_dispatcher=False,
        settings=Settings(
            database_path=":memory:",
            cookie_secure=False,
            allowed_origins=["http://test"],
        ),
    )
    with TestClient(create_app(application), base_url="http://test") as client:
        assert client.get("/api/map").status_code == 401
        assert client.get("/api/map/presentation").status_code == 401
        authorize(client, application)
        client.params = {"site_id": "BUSAN_SOMA_18F"}
        assert client.get("/api/map").status_code == 404
        application.accounts.db.execute(
            "UPDATE sites SET map_ref='slam-20261108' WHERE site_id='BUSAN_SOMA_18F'"
        )
        response = client.get("/api/map")
        assert response.status_code == 200
        metadata = response.json()
        assert metadata["source_kind"] == "slam_manually_edited"
        assert metadata["resolution"] == pytest.approx(0.05)
        assert client.get(metadata["image_url"]).content.startswith(b"\x89PNG")
        presentation = client.get(metadata["presentation"]["image_url"])
        assert presentation.status_code == 200
        assert presentation.headers["content-type"].startswith("image/svg+xml")
        assert "<svg" in presentation.text
        assert client.get("/api/map/presentation", params={"site_id": "foreign"}).status_code == 404
        assert client.get("/api/map", params={"site_id": "foreign"}).status_code == 404
        assert client.get("/api/map/image", params={"site_id": "foreign"}).status_code == 404
        seats = client.get("/api/seats").json()["items"]
        assert len(seats) == 82
        assert all(s["occupancy"] == "UNKNOWN" and not s["mission_supported"] for s in seats)
        rejected = client.post(
            "/api/missions",
            json={
                "seat_id": "seat-12",
                "priority": "NORMAL",
                "idempotency_key": "slam-no-target",
            },
        )
        assert rejected.status_code == 409
        assert "작업 위치" in rejected.json()["detail"]


def test_catalog_rejects_traversal_and_symlinks(tmp_path):
    with pytest.raises(FileNotFoundError):
        map_directory(str(tmp_path), "../secret")
    (tmp_path / "outside").symlink_to(tmp_path.parent, target_is_directory=True)
    with pytest.raises(FileNotFoundError):
        map_directory(str(tmp_path), "outside")


def test_imported_pixels_and_provenance():
    from hashlib import sha256

    from PIL import Image

    root = Settings().map_directory
    metadata = load_map(root, "slam-20261108")
    directory = Path(root) / metadata.map_id
    for name, digest in metadata.source_sha256.items():
        path = directory / ("source.yaml" if name == "map.yaml" else name)
        assert sha256(path.read_bytes()).hexdigest() == digest
    with Image.open(directory / "map.pgm") as original, Image.open(directory / "map.png") as png:
        assert original.size == (metadata.width, metadata.height)
        assert original.tobytes() == png.tobytes()


def test_structural_presentation_preserves_source_identity_and_metric_scale():
    from hashlib import sha256
    from math import atan2, degrees
    from xml.etree import ElementTree

    metadata = load_map(Settings().map_directory, "slam-20261108")
    presentation = metadata.presentation
    assert presentation is not None
    directory = Path(Settings().map_directory) / metadata.map_id
    source_digest = sha256((directory / "map.png").read_bytes()).hexdigest()
    assert presentation.source_image_sha256 == source_digest
    a, b, c, d, e, f = presentation.transform
    assert a * a + b * b == pytest.approx(1)
    assert c * c + d * d == pytest.approx(1)
    assert a * c + b * d == pytest.approx(0)
    assert a * d - b * c == pytest.approx(1)
    assert degrees(atan2(b, a)) == pytest.approx(presentation.rotation_degrees)
    svg = ElementTree.parse(directory / "presentation.svg").getroot()
    ns = "{http://www.w3.org/2000/svg}"
    import base64

    underlay = svg.find(f".//{ns}image")
    assert underlay.attrib["id"] == "slam-reference"
    assert float(underlay.attrib["opacity"]) == pytest.approx(0.22)
    assert (
        base64.b64decode(underlay.attrib["href"].split(",", 1)[1])
        == (directory / "map.png").read_bytes()
    )
    assert [float(v) for v in underlay.attrib["transform"][7:-1].split()] == list(
        presentation.transform
    )
    children = list(svg.find(f"{ns}g"))
    assert children.index(underlay) == 1  # Above floor fill, below every structural line.
    assert svg.find(f"{ns}desc").text.endswith("this is not collision geometry.")
    group = svg.find(f"{ns}g")
    inverse = [float(value) for value in group.attrib["transform"][7:-1].split()]
    ia, ib, ic, id_, ie, iff = inverse
    for x, y in [(0, 0), (160, 120), (presentation.width, presentation.height)]:
        raw_x, raw_y = ia * x + ic * y + ie, ib * x + id_ * y + iff
        assert a * raw_x + c * raw_y + e == pytest.approx(x, abs=1e-8)
        assert b * raw_x + d * raw_y + f == pytest.approx(y, abs=1e-8)


def test_reviewed_layout_is_reproducible_and_rejects_another_source(tmp_path):
    import json
    import shutil
    import subprocess
    import sys

    source = Path(Settings().map_directory) / "slam-20261108"
    for name in ("metadata.json", "map.png", "presentation-layout.json"):
        shutil.copyfile(source / name, tmp_path / name)
    generator = Path(__file__).resolve().parents[3] / "tools/maps/prepare_presentation.py"
    subprocess.run([sys.executable, str(generator), str(tmp_path)], check=True, capture_output=True)
    assert (tmp_path / "presentation.svg").read_bytes() == (
        source / "presentation.svg"
    ).read_bytes()
    before = (tmp_path / "presentation.svg").read_bytes()
    (tmp_path / "map.png").write_bytes(b"changed-source")
    result = subprocess.run([sys.executable, str(generator), str(tmp_path)], capture_output=True)
    assert result.returncode != 0
    assert b"reviewed again" in result.stderr
    assert (tmp_path / "presentation.svg").read_bytes() == before
    metadata = json.loads((tmp_path / "metadata.json").read_text())
    original = json.loads((source / "metadata.json").read_text())
    for name in ("map_id", "origin", "resolution", "source_sha256", "presentation"):
        assert metadata[name] == original[name]

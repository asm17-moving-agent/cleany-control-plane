import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

from control_plane.maps import load_map
from control_plane.seat_layouts import read_pgm
from control_plane.settings import Settings


def test_migration_preserves_artwork_and_bound_occupancy(tmp_path):
    script = Path(__file__).resolve().parents[3] / "tools/deploy/jetson/host-layout/map_catalog.py"
    spec = importlib.util.spec_from_file_location("map_catalog", script)
    catalog = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(catalog)
    source, root = Path(Settings().map_directory), tmp_path / "maps"
    catalog.seed_catalog(source, root)
    map_id = "slam-20261108"
    view = root / "presentation" / map_id
    nav = root / "navigation" / map_id / "1"
    meta = load_map(str(root / "presentation"), map_id)
    assert meta == load_map(str(source), map_id)
    assert read_pgm(view / "map.pgm")[:2] == (meta.width, meta.height)
    assert (view / "map.pgm").resolve() == nav / "map.pgm"
    hashes = json.loads((nav / "metadata.json").read_bytes())["source_sha256"]
    for name in ("source.yaml", "map.pgm"):
        assert hashlib.sha256((nav / name).read_bytes()).hexdigest() == hashes[name]
    for name in ("display-floorplan.png", "display-slam.png", "seat-layout.json"):
        assert (view / name).read_bytes() == (source / map_id / name).read_bytes()
    (view / "display-floorplan.png").write_bytes(b"operator edit")
    catalog.seed_catalog(source, root)
    assert (view / "display-floorplan.png").read_bytes() == b"operator edit"
    broken = tmp_path / "broken"
    broken.mkdir()
    with pytest.raises(ValueError, match="Incomplete"):
        catalog.seed_catalog(source, broken)

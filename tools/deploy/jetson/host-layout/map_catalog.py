"""Seed persistent Jetson map storage from the bundled maps on first installation."""

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path


def seed_catalog(source: Path, root: Path) -> None:
    if root.exists():
        if not all((root / kind).is_dir() for kind in ("navigation", "presentation")):
            raise ValueError(f"Incomplete persistent catalog: {root}")
        return
    with tempfile.TemporaryDirectory(dir=root.parent, prefix=".map-seed-") as temp:
        catalog = Path(temp) / "maps"
        bundles = sorted(path for path in source.iterdir() if path.is_dir())
        if not bundles:
            raise ValueError(f"No registered maps in {source}")
        for bundle in bundles:
            meta = json.loads((bundle / "metadata.json").read_bytes())
            if meta["map_id"] != bundle.name or meta["frame_id"] != "map":
                raise ValueError(f"Invalid map identity: {bundle}")
            nav = catalog / "navigation" / bundle.name / "1"
            view = catalog / "presentation" / bundle.name
            nav.mkdir(parents=True)
            view.mkdir(parents=True)
            hashes = {}
            for name, key in (("source.yaml", "map.yaml"), ("map.pgm", "map.pgm")):
                file = bundle / name
                if name == "source.yaml" and not file.exists():
                    file = bundle / "map.yaml"
                data = file.read_bytes()
                hashes[name] = hashlib.sha256(data).hexdigest()
                if hashes[name] != meta["source_sha256"][key]:
                    raise ValueError(f"Map checksum mismatch: {file}")
                (nav / name).write_bytes(data)
            manifest = {"map_id": bundle.name, "map_revision": 1, "frame_id": "map", "source_sha256": hashes}
            (nav / "metadata.json").write_text(json.dumps(manifest, indent=2) + "\n")
            for file in bundle.iterdir():
                if file.name not in ("map.pgm", "source.yaml", "map.yaml"):
                    shutil.copy2(file, view / file.name)
            # Seat-layout review reads the occupancy image registered to this presentation.
            (view / "map.pgm").symlink_to(os.path.relpath(nav / "map.pgm", view))
        catalog.rename(root)

"""Import a saved ROS map without altering its source pixels or metadata."""

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

import yaml
from control_plane.maps import SlamMap, map_directory
from control_plane.settings import Settings
from PIL import Image


def import_map(source: Path, root: Path, map_id: str, label: str, kind: str) -> Path:
    document = yaml.safe_load(source.read_text())
    image = (source.parent / document["image"]).resolve()
    image_name = "source-" + image.name if image.name in {
        "map.png", "map.yaml", "source.yaml", "metadata.json",
    } else image.name
    destination = map_directory(str(root), map_id)
    if destination.exists():
        raise FileExistsError("map ID already exists; use a new immutable map ID")
    with Image.open(image) as raster:
        metadata = SlamMap(
            map_id=map_id, label=label, width=raster.width, height=raster.height,
            resolution=document["resolution"], origin=document["origin"],
            negate=document.get("negate", 0), occupied_thresh=document["occupied_thresh"],
            free_thresh=document["free_thresh"], source_run=source.parent.name,
            source_kind=kind,
            source_sha256={source.name: hashlib.sha256(source.read_bytes()).hexdigest(),
                           image_name: hashlib.sha256(image.read_bytes()).hexdigest()},
        )
        if metadata.free_thresh >= metadata.occupied_thresh:
            raise ValueError("free threshold must be below occupied threshold")
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as scratch:
            bundle = Path(scratch) / map_id
            bundle.mkdir()
            shutil.copy2(source, bundle / "source.yaml")
            shutil.copy2(image, bundle / image_name)
            normalized = {**document, "image": image_name}
            (bundle / "map.yaml").write_text(yaml.safe_dump(normalized, sort_keys=False))
            raster.save(bundle / "map.png")
            (bundle / "metadata.json").write_text(
                json.dumps(metadata.model_dump(), ensure_ascii=False, indent=2) + "\n")
            bundle.rename(destination)
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--root", type=Path, default=Path(Settings().map_directory))
    parser.add_argument("--map-id", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--kind", choices=["slam", "slam_manually_edited"], required=True)
    args = parser.parse_args()
    print(import_map(args.source, args.root, args.map_id, args.label, args.kind))

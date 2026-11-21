"""Export an edited GIMP pair in presentation coordinates, without changing navigation assets."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def export_layers(source: str, directory: str, pixels_per_unit: float) -> None:
    # Runs inside GIMP's Python interpreter, in a separate noninteractive instance.
    from gi.repository import Gimp, Gio

    target = Path(directory)
    metadata = json.loads((target / "metadata.json").read_text())
    presentation = metadata["presentation"]
    image = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(source))
    expected = [round(presentation[k] * pixels_per_unit) for k in ("width", "height")]
    if [image.get_width(), image.get_height()] != expected:
        raise ValueError("XCF canvas must preserve the registered presentation coordinates")
    layers = image.get_layers()
    if len(layers) != 2 or not layers[0].get_name().startswith("기존 지도") or layers[1].get_name() != "SLAM 지도":
        raise ValueError("Expected the edited floorplan above the SLAM layer")
    manifest = {
        "source_file": Path(source).name,
        "source_sha256": hashlib.sha256(Path(source).read_bytes()).hexdigest(),
        "coordinate_space": "presentation",
        "canvas": expected,
        "pixels_per_unit": pixels_per_unit,
        "presentation_transform": presentation["transform"],
        "navigation_source_sha256": metadata["source_sha256"]["map.pgm"],
        "layers": {},
    }
    for index, name in enumerate(("floorplan", "slam")):
        copy = image.duplicate()
        for i, layer in enumerate(copy.get_layers()):
            layer.set_visible(i == index)
        layer = copy.get_layers()[index]
        _, x, y = layer.get_offsets()
        manifest["layers"][name] = {
            "source_layer": layer.get_name(), "offset": [x, y],
            "editing_opacity": layer.get_opacity(),
        }
        # GIMP's comparison opacity is not baked in. The dashboard owns the blend.
        layer.set_opacity(100)
        layer.resize_to_image_size()
        Gimp.Selection.none(copy)
        output = target / f"display-{name}.png"
        procedure = Gimp.get_pdb().lookup_procedure("file-png-export")
        config = procedure.create_config()
        for key, value in {
            "run-mode": Gimp.RunMode.NONINTERACTIVE, "image": copy,
            "file": Gio.File.new_for_path(str(output)), "compression": 9,
            "include-exif": False, "include-xmp": False, "include-iptc": False,
            "include-comment": False, "include-thumbnail": False, "time": False,
        }.items():
            config.set_property(key, value)
        result = procedure.run(config)
        if result.index(0) != Gimp.PDBStatusType.SUCCESS:
            raise RuntimeError(f"PNG export failed: {name}")
        manifest["layers"][name]["sha256"] = hashlib.sha256(output.read_bytes()).hexdigest()
        copy.delete()
    image.delete()
    (target / "display-layers.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--pixels-per-unit", type=float, default=3)
    args = parser.parse_args()
    if args.pixels_per_unit <= 0:
        parser.error("pixels-per-unit must be positive")
    command = (
        f"import runpy; runpy.run_path({str(Path(__file__).resolve())!r})['export_layers']"
        f"({str(args.source.resolve())!r}, {str(args.directory.resolve())!r}, {args.pixels_per_unit!r})"
    )
    subprocess.run([
        "gimp", "--new-instance", "--no-interface", "--no-data", "--no-fonts",
        "--console-messages", "--batch-interpreter=python-fu-eval", "--batch", command, "--quit",
    ], check=True)

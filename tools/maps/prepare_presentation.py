"""Render reviewed structural geometry without changing SLAM pixels or coordinates.

python3 tools/maps/prepare_presentation.py apps/backend/maps/slam-20261108
Review presentation-layout.json against the source map before regenerating.
"""

import argparse
import base64
import hashlib
import json
import math
from pathlib import Path
from xml.etree import ElementTree as ET


def render(directory: Path) -> None:
    """Validate source identity and render display-pixel paths in the raw raster frame."""
    metadata_path = directory / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    layout = json.loads((directory / "presentation-layout.json").read_text())
    digest = hashlib.sha256((directory / "map.png").read_bytes()).hexdigest()
    if (
        layout["source_image_sha256"] != digest
        or layout["map_id"] != metadata["map_id"]
    ):
        raise ValueError("Layout must be reviewed again for this source map")
    if layout["schema_version"] != 1:
        raise ValueError("Unsupported presentation layout version")
    a, b, c, d, e, f = layout["transform"]
    previous = metadata.get("presentation") or {}
    if previous.get("layers") and (
        previous["transform"] != layout["transform"]
        or any(previous[key] != layout["viewport"][key] for key in ("width", "height"))
    ):
        raise ValueError("Re-export edited display layers before changing presentation coordinates")
    if not all(math.isfinite(v) for v in (a, b, c, d, e, f)) or not all(
        (
            math.isclose(a * a + b * b, 1),
            math.isclose(c * c + d * d, 1),
            math.isclose(a * c + b * d, 0, abs_tol=1e-9),
            math.isclose(a * d - b * c, 1),
        )
    ):
        raise ValueError("Display transform must preserve orientation and metric scale")
    # Frontend applies the forward transform to both the image and live robot pose.
    inverse = (a, c, b, d, -a * e - b * f, -c * e - d * f)
    svg = ET.Element(
        "svg",
        {
            "xmlns": "http://www.w3.org/2000/svg",
            "width": str(metadata["width"]),
            "height": str(metadata["height"]),
            "viewBox": f"0 0 {metadata['width']} {metadata['height']}",
        },
    )
    ET.SubElement(svg, "title").text = "SLAM structural overview"
    ET.SubElement(svg, "desc").text = layout["description"]
    group = ET.SubElement(
        svg,
        "g",
        {
            "transform": "matrix(" + " ".join(f"{v:.12g}" for v in inverse) + ")",
            "stroke": "none",
        },
    )
    ET.SubElement(
        group,
        "path",
        {
            "id": "floor",
            "d": layout["floor"],
            "fill": "#fdfcf8",
        },
    )
    reference_opacity = layout.get("reference_opacity", 0)
    if not 0 <= reference_opacity <= 1:
        raise ValueError("Reference opacity must be between zero and one")
    if reference_opacity:
        # Raw pixels share the raster frame; the inner forward transform cancels the group inverse.
        ET.SubElement(
            group,
            "image",
            {
                "id": "slam-reference",
                "width": str(metadata["width"]),
                "height": str(metadata["height"]),
                "opacity": str(reference_opacity),
                "style": "mix-blend-mode:multiply",
                "pointer-events": "none",
                "transform": "matrix("
                + " ".join(str(v) for v in layout["transform"])
                + ")",
                "href": "data:image/png;base64,"
                + base64.b64encode((directory / "map.png").read_bytes()).decode(
                    "ascii"
                ),
            },
        )
    for boundary in layout["boundaries"]:
        ET.SubElement(
            group,
            "path",
            {
                "id": boundary["id"],
                "d": boundary["d"],
                "fill": "none",
            },
        )
    for feature in layout["structures"]:
        ET.SubElement(
            group,
            "path",
            {
                "id": feature["id"],
                "d": feature["d"],
                "fill": "#e3ece6",
            },
        )
    for wall in layout["walls"]:
        ET.SubElement(
            group,
            "path",
            {
                "id": wall["id"],
                "d": wall["d"],
                "fill": "none",
            },
        )
    ET.indent(svg)
    (directory / "presentation.svg").write_text(
        ET.tostring(svg, encoding="unicode") + "\n"
    )
    metadata["presentation"] = {
        **({"layers": previous["layers"]} if previous.get("layers") else {}),
        "image_url": "/api/map/presentation",
        **layout["viewport"],
        "transform": layout["transform"],
        "rotation_degrees": round(math.degrees(math.atan2(b, a)), 3),
        "source_image_sha256": digest,
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                "map_id": metadata["map_id"],
                "wall_paths": len(layout["walls"]),
                "structural_features": len(layout["structures"]),
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    render(parser.parse_args().directory)

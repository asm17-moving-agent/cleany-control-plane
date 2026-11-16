"""Measure sampled display wall lines against occupied cells, not physical ground truth."""

import argparse
import json
import math
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
parser.add_argument("samples", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
metadata = json.loads((args.directory / "metadata.json").read_text())
source = Image.open(args.directory / "map.png").convert("L")
a, b, c, d, e, f = metadata["presentation"]["transform"]
occupied = {
    (x, y)
    for y in range(source.height)
    for x in range(source.width)
    if (
        source.getpixel((x, y)) / 255
        if metadata["negate"]
        else 1 - source.getpixel((x, y)) / 255
    )
    > metadata["occupied_thresh"]
}
report = []
all_distances = []
for path in json.loads(args.samples.read_text()):
    distances = []
    for px, py in path["points"]:
        # Occupancy samples lie at cell centres in the raster-edge coordinate system.
        x, y = a * (px - e) + b * (py - f), c * (px - e) + d * (py - f)
        local = [
            math.hypot(xx + 0.5 - x, yy + 0.5 - y)
            for yy in range(int(y) - 12, int(y) + 13)
            for xx in range(int(x) - 12, int(x) + 13)
            if (xx, yy) in occupied
        ]
        distances.append(min(local) if local else 18.0)
    all_distances.extend(distances)
    report.append(
        {
            "id": path["id"],
            "samples": len(distances),
            "mean_pixels": sum(distances) / len(distances),
            "max_pixels": max(distances),
            "largest_gap_at": path["points"][distances.index(max(distances))],
        }
    )
ordered = sorted(all_distances)
result = {
    "scope": "Display wall centres versus recorded occupied cells; not localization accuracy",
    "sample_count": len(ordered),
    "resolution": metadata["resolution"],
    "p95_pixels": ordered[int(0.95 * (len(ordered) - 1))],
    "within_3_pixels_fraction": sum(d <= 3 for d in ordered) / len(ordered),
    "paths": report,
}
args.output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "paths"}, indent=2))
print(
    json.dumps(
        sorted(report, key=lambda path: path["max_pixels"], reverse=True)[:5], indent=2
    )
)

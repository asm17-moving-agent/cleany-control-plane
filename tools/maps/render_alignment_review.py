"""Plot the original occupancy image in the display viewport with a review grid."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
metadata = json.loads((args.directory / "metadata.json").read_text())
view = metadata["presentation"]
a, b, c, d, e, f = view["transform"]
inverse = (a, b, -a * e - b * f, c, d, -c * e - d * f)
source = Image.open(args.directory / "map.png").convert("RGB")
plot = source.transform(
    (view["width"], view["height"]),
    Image.Transform.AFFINE,
    inverse,
    fillcolor="#cdcdcd",
)
plot = plot.resize((view["width"] * 2, view["height"] * 2))
draw = ImageDraw.Draw(plot)
for x in range(0, view["width"], 25):
    draw.line((x * 2, 0, x * 2, plot.height), fill="#a0d5e1", width=1)
    draw.text((x * 2 + 2, 6), str(x), fill="#005574")
for y in range(0, view["height"], 25):
    draw.line((0, y * 2, plot.width, y * 2), fill="#a0d5e1", width=1)
    draw.text((4, y * 2 + 2), str(y), fill="#005574")
args.output.parent.mkdir(parents=True, exist_ok=True)
plot.save(args.output)

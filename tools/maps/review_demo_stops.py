"""Review draft demo stops against the saved SLAM raster and dashboard furniture."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt, label


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layout", required=True, type=Path)
    parser.add_argument("--map", required=True, type=Path, help="Directory with metadata.json and map.pgm")
    parser.add_argument("--seats", nargs="+", required=True)
    parser.add_argument("--home", type=float, nargs=3, required=True, metavar=("X", "Y", "YAW"))
    parser.add_argument("--review-radius", required=True, type=float, help="Grid clearance in meters")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    layout = json.loads(args.layout.read_text())
    metadata = json.loads((args.map / "metadata.json").read_text())
    pgm = args.map / "map.pgm"
    digest = hashlib.sha256(pgm.read_bytes()).hexdigest()
    if (layout["map_id"] != metadata["map_id"] or layout["source_sha256"] != digest
            or metadata["source_sha256"]["map.pgm"] != digest):
        parser.error("layout and navigation raster must have the same source")
    if args.review_radius <= 0 or not all(map(math.isfinite, [*args.home, args.review_radius])):
        parser.error("home and positive review radius must be finite")
    geo = json.loads((Path(__file__).resolve().parents[2]
                      / "apps/dashboard/src/features/facility-map/seat-geometry.json").read_text())["dhub"]
    ox, oy, theta = metadata["origin"]
    resolution = metadata["resolution"]
    source = Image.open(pgm).convert("L")
    grid = np.asarray(source) / 255.0
    occupancy = grid if metadata["negate"] else 1 - grid
    # MapView identifies the ROS OccupancyGrid using bottom-up cells and float32 resolution.
    cells = np.where(occupancy < metadata["free_thresh"], 0, np.where(
        occupancy > metadata["occupied_thresh"], 100, -1))
    geom = (source.width, source.height, float(np.float32(resolution)), ox, oy, theta)
    grid_revision = hashlib.sha256(str(geom).encode() + (cells[::-1] + 1).astype("uint8").tobytes()).hexdigest()[:24]
    mask = Image.fromarray((occupancy < metadata["free_thresh"]).astype("uint8"))
    floor = Image.fromarray(np.where(np.asarray(mask), 245, np.where(
        occupancy > metadata["occupied_thresh"], 79, 196)).astype("uint8")).convert("RGB")
    obstacles, drawing = ImageDraw.Draw(mask), ImageDraw.Draw(floor)

    def pixel(x, y):
        dx, dy = x - ox, y - oy
        return (math.floor((dx * math.cos(theta) + dy * math.sin(theta)) / resolution),
                source.height - 1 - math.floor((-dx * math.sin(theta) + dy * math.cos(theta)) / resolution))

    seats = {s["seat_id"]: s for s in layout["seats"]}
    for seat in seats.values():
        p, depth, width = seat["pose"], seat["depth"], seat["width"]
        cs, sn = math.cos(p["yaw"]), math.sin(p["yaw"])
        dhub = seat["zone_id"] == "d-hub"
        chair_depth = geo["chair_depth_m"] / 2 if dhub else depth * 6 / 28
        chair_width = geo["chair_width_m"] if dhub else width * 12 / 38
        for left, right, span, color in [
            (-depth / 2, depth / 2, width, "#a7bbb8"),
            (-depth / 2 - chair_depth, -depth / 2, chair_width, "#849d9a"),
        ]:
            corners = [pixel(p["x"] + x * cs - y * sn, p["y"] + x * sn + y * cs)
                       for x, y in [(left, -span / 2), (left, span / 2),
                                    (right, span / 2), (right, -span / 2)]]
            obstacles.polygon(corners, fill=0)
            drawing.polygon(corners, fill=color)

    clear = distance_transform_edt(np.pad(np.asarray(mask), 1))[1:-1, 1:-1] * resolution
    regions, _ = label(clear > args.review_radius)
    candidates = {"Home": dict(zip(("x", "y", "yaw"), args.home, strict=True))}
    for key in args.seats:
        candidates[key] = seats[key]["approach"]
    stops = {}
    points = []
    components = set()
    for name, pose in candidates.items():
        u, v = pixel(pose["x"], pose["y"])
        if not 0 <= u < source.width or not 0 <= v < source.height:
            parser.error(f"{name} outside map")
        points.append((u, v))
        components.add(int(regions[v, u]))
        stops[name] = {"pose": pose, "nearest_blocked_cell_m": round(float(clear[v, u]), 3)}
    args.output.mkdir(parents=True, exist_ok=True)
    report = dict(status="draft", map_id=layout["map_id"], layout_revision=layout["revision"],
                  source_sha256=digest, occupancy_grid_revision=grid_revision, review_radius_m=args.review_radius,
                  same_free_region=0 not in components and len(components) == 1,
                  stops=stops)
    (args.output / "candidate-stops.json").write_text(json.dumps(report, indent=2) + "\n")
    pad = 48
    box = (min(x for x, _ in points)-pad, min(y for _, y in points)-pad,
           max(x for x, _ in points)+pad, max(y for _, y in points)+pad)
    view = floor.crop(box).resize(((box[2]-box[0])*3, (box[3]-box[1])*3), Image.Resampling.NEAREST)
    drawing = ImageDraw.Draw(view)
    font = ImageFont.load_default(size=18)
    for (name, pose), (u, v) in zip(candidates.items(), points, strict=True):
        x, y = (u-box[0])*3, (v-box[1])*3
        angle = pose["yaw"]-theta
        color = "#18675c" if name == "Home" else "#9d4433"
        drawing.ellipse((x-6,y-6,x+6,y+6), fill=color)
        drawing.line((x,y,x+21*math.cos(angle),y-21*math.sin(angle)),fill=color,width=3)
        drawing.text((x+10,y+6), name, font=font, fill=color, stroke_width=2, stroke_fill="#ffffff")
    view.save(args.output / "candidate-stops.png")
    print(json.dumps(report))


if __name__ == "__main__":
    main()

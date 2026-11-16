"""Fit guide segments to local SLAM ridges without forcing orthogonal wall directions.

uv run --with numpy --with scipy --with pillow --with svgpathtools python
 tools/maps/fit_structural_layout.py MAP_DIRECTORY --report OUTPUT_JSON
The manually reviewed guide bounds each association; absent observations retain the guide.
"""

import argparse
import hashlib
import json
from collections import defaultdict
from itertools import pairwise
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from svgpathtools import (
    Arc,
    CubicBezier,
    Line,
    QuadraticBezier,
    parse_path,
)
from svgpathtools import (
    Path as SvgPath,
)


def controls(segment):
    if isinstance(segment, Line):
        return np.array([segment.start, segment.end])
    if isinstance(segment, QuadraticBezier):
        return np.array([segment.start, segment.control, segment.end])
    return np.array([segment.start, segment.control1, segment.control2, segment.end])


def make_segment(points):
    return {2: Line, 3: QuadraticBezier, 4: CubicBezier}[len(points)](*points)


def basis(t, count):
    if count == 2:
        return np.column_stack([1 - t, t])
    if count == 3:
        return np.column_stack([(1 - t) ** 2, 2 * t * (1 - t), t * t])
    return np.column_stack(
        [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t**3]
    )


def fit_segment(segment, probability, transform, threshold, radius):
    """Fit a smooth segment to supported normal-profile ridge centres, in display pixels."""
    count = max(12, int(segment.length() / 1.5))
    t = np.linspace(0.04, 0.96, count)
    points = np.array([segment.point(float(v)) for v in t])
    tangent = np.array([segment.derivative(float(v)) for v in t])
    normals = 1j * tangent / np.maximum(np.abs(tangent), 1e-9)
    offsets = np.linspace(-radius, radius, int(radius * 8) + 1)
    probes = points[:, None] + normals[:, None] * offsets
    a, b, c, d, e, f = transform
    dx, dy = probes.real - e, probes.imag - f
    # ndimage indexes pixel centres at integers; SVG uses raster edges.
    raw_x, raw_y = a * dx + b * dy - 0.5, c * dx + d * dy - 0.5
    values = map_coordinates(
        probability, [raw_y, raw_x], order=1, mode="constant", cval=0
    )
    targets, supported = [], []
    for i, profile in enumerate(values):
        occupied = profile > threshold
        transitions = np.diff(np.r_[False, occupied, False].astype(int))
        candidates = []
        for start, end in zip(
            np.flatnonzero(transitions == 1),
            np.flatnonzero(transitions == -1),
            strict=True,
        ):
            weights = profile[start:end] - threshold
            centre = np.average(offsets[start:end], weights=weights)
            score = weights.sum() * np.exp(-0.5 * (centre / (radius * 0.7)) ** 2)
            candidates.append((score, centre))
        if candidates:
            shift = max(candidates)[1]
            targets.append(points[i] + normals[i] * shift)
            supported.append(i)
    support = len(supported) / count
    if len(supported) < 8 or support < 0.45:
        return controls(segment), {"support": support, "fitted": False}
    design = basis(t[np.array(supported)], len(controls(segment)))
    target = np.array(targets)
    original = controls(segment)
    weights = np.ones(len(target))
    fitted = original.copy()
    # Robust residual weighting rejects isolated speckles while retaining consistent wall tilt.
    for _ in range(4):
        matrix = np.vstack([design * weights[:, None], np.eye(len(original)) * 0.35])
        values = np.r_[target * weights, original * 0.35]
        fitted = np.linalg.lstsq(matrix, values, rcond=None)[0]
        residual = np.abs(design @ fitted - target)
        weights = np.minimum(1, 1.5 / np.maximum(residual, 1e-6)) ** 0.5
    delta = fitted - original
    fitted = original + delta * np.minimum(1, radius / np.maximum(np.abs(delta), 1e-9))
    return fitted, {
        "support": support,
        "fitted": True,
        "max_control_shift_pixels": float(np.max(np.abs(fitted - original))),
    }


def align(directory, report_path, radius):
    guide_path = directory / "presentation-layout-guide.json"
    guide = json.loads(guide_path.read_text())
    metadata = json.loads((directory / "metadata.json").read_text())
    digest = hashlib.sha256((directory / "map.png").read_bytes()).hexdigest()
    if digest != guide["source_image_sha256"] or metadata["map_id"] != guide["map_id"]:
        raise ValueError("Guide must be reviewed for this source map")
    pixels = (
        np.asarray(Image.open(directory / "map.png").convert("L"), dtype=float) / 255
    )
    probability = pixels if metadata["negate"] else 1 - pixels
    records, anchors, report = [], defaultdict(list), []
    for category in ("walls", "boundaries", "structures"):
        threshold = metadata["occupied_thresh"] if category == "walls" else 0.32
        for feature in guide[category]:
            segments = []
            for segment in parse_path(feature["d"]):
                segments.extend(
                    segment.as_cubic_curves(curves=2)
                    if isinstance(segment, Arc)
                    else [segment]
                )
            fitted_segments = []
            for segment in segments:
                fitted, evidence = fit_segment(
                    segment, probability, guide["transform"], threshold, radius
                )
                fitted_segments.append(fitted)
                report.append({"category": category, "id": feature["id"], **evidence})
                for index, old in [(0, segment.start), (-1, segment.end)]:
                    anchors[old].append((fitted, index))
            if category == "structures":
                # A fixed fixture moves as a whole; independent edge fits must not pinch circles
                # or collapse the opposite sides of a narrow rectangular feature.
                old_points = np.array(
                    [
                        segment.point(float(t))
                        for segment in segments
                        for t in np.linspace(0, 1, 16)
                    ]
                )
                new_points = np.array(
                    [
                        make_segment(values).point(float(t))
                        for values in fitted_segments
                        for t in np.linspace(0, 1, 16)
                    ]
                )
                old_mean, new_mean = old_points.mean(), new_points.mean()
                correlation = np.sum(
                    np.conj(old_points - old_mean) * (new_points - new_mean)
                )
                angle = np.clip(np.angle(correlation), -np.pi / 24, np.pi / 24)
                rotation = np.exp(1j * angle)
                for values, segment in zip(fitted_segments, segments, strict=True):
                    values[:] = (controls(segment) - old_mean) * rotation + new_mean
            records.append((feature, fitted_segments))
    anchor_map = {}
    for old, links in anchors.items():
        # Adjacent fitted lines meet at their measured intersection, not an averaged gap.
        matrix, target = [], []
        for fitted, index in links:
            if len(fitted) == 2:
                direction = fitted[1] - fitted[0]
                normal = 1j * direction / max(abs(direction), 1e-9)
                matrix.append([normal.real, normal.imag])
                target.append(
                    normal.real * fitted[index].real + normal.imag * fitted[index].imag
                )
            else:
                matrix.extend([[0.6, 0], [0, 0.6]])
                target.extend([0.6 * fitted[index].real, 0.6 * fitted[index].imag])
        matrix.extend([[0.05, 0], [0, 0.05]])
        target.extend([0.05 * old.real, 0.05 * old.imag])
        x, y = np.linalg.lstsq(matrix, target, rcond=None)[0]
        delta = complex(x, y) - old
        joined = old + delta * min(1, radius / max(abs(delta), 1e-9))
        anchor_map[old] = joined
    for old, links in anchors.items():
        for fitted, index in links:
            fitted[index] = anchor_map[old]
    for feature, segments in records:
        feature["d"] = SvgPath(*[make_segment(values) for values in segments]).d()
    floor = parse_path(guide["floor"])
    floor_segments = []
    for segment in floor:
        if isinstance(segment, Line):
            direction = segment.end - segment.start
            knots = [(0.0, segment.start), (1.0, segment.end)]
            for anchor in anchor_map:
                position = (anchor - segment.start) / direction
                if 0 < position.real < 1 and abs(position.imag) * abs(direction) < 0.1:
                    knots.append((position.real, anchor))
            knots.sort(key=lambda item: item[0])
            for (_, start), (_, end) in pairwise(knots):
                floor_segments.append(
                    Line(anchor_map.get(start, start), anchor_map.get(end, end))
                )
            continue
        values = controls(segment)
        values[0] = anchor_map.get(segment.start, segment.start)
        values[-1] = anchor_map.get(segment.end, segment.end)
        floor_segments.append(make_segment(values))
    guide["floor"] = SvgPath(*floor_segments).d()
    guide["alignment"] = {
        "method": "local-normal-profile-ridge-fit",
        "radius_pixels": radius,
        "guide_sha256": hashlib.sha256(guide_path.read_bytes()).hexdigest(),
    }
    (directory / "presentation-layout.json").write_text(
        json.dumps(guide, indent=2) + "\n"
    )
    report_path.write_text(
        json.dumps({"method": guide["alignment"], "segments": report}, indent=2) + "\n"
    )
    print(
        json.dumps(
            {"segments": len(report), "fitted": sum(r["fitted"] for r in report)}
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--radius", type=float, default=8)
    args = parser.parse_args()
    align(args.directory, args.report, args.radius)

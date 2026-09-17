"""Derive a web GLB without changing the source model.

uv run --with trimesh --with fast-simplification python tools/optimize_robot_glb.py input.glb output.glb
"""
import argparse
import json
from pathlib import Path

import numpy as np
import trimesh


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output exists; choose a new path to preserve previous models.')
    scene = trimesh.load(args.source, force='scene')
    original_bounds = scene.bounds.copy()
    before = sum(len(mesh.faces) for mesh in scene.geometry.values())
    for name, mesh in list(scene.geometry.items()):
        if len(mesh.faces) < 500:
            continue
        reduced = mesh.simplify_quadric_decimation(
            face_count=max(300, int(len(mesh.faces) * .22)), aggression=5,
        )
        reduced.visual = mesh.visual.copy()
        scene.geometry[name] = reduced
    # This pipeline is for flat-color CAD geometry, not textured UV assets.
    if not np.allclose(original_bounds, scene.bounds, atol=.005):
        raise ValueError('Bounds changed more than 5 mm; inspect simplification before export.')
    args.output.write_bytes(scene.export(file_type='glb'))
    loaded = trimesh.load(args.output, force='scene')
    assert np.allclose(scene.bounds, loaded.bounds, atol=1e-5)
    print(json.dumps({
        'input_unique_triangles': before,
        'output_unique_triangles': sum(len(mesh.faces) for mesh in loaded.geometry.values()),
        'bytes': args.output.stat().st_size,
        'instances': len(loaded.graph.nodes_geometry),
    }, indent=2))


if __name__ == '__main__':
    main()

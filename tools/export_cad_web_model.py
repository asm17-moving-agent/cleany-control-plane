"""Export the pinned Cleany CAD registration pose to a static, Y-up web GLB.

Run with uv run --with mujoco==3.12.0 --with trimesh==4.12.2 --with fast-simplification==0.1.13 python
 tools/export_cad_web_model.py <cleany-checkout> <output.glb>.
No simulation steps, invented covers or robot commands.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess

import mujoco as mj
import numpy as np
import trimesh as tm


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkout', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix('.json').exists():
        parser.error('Output exists; choose a new versioned filename.')
    package = args.checkout / 'ros2_ws/src/cleany_description'
    manifest_path = package / 'config/geometry/cad_final.json'
    manifest = json.loads(manifest_path.read_text())
    # Verify every CAD mesh against the source export's provenance before loading.
    records = next(v for v in manifest.values() if isinstance(v, list) and v
                   and isinstance(v[0], dict) and 'mesh_sha256' in v[0])
    for record in records:
        if sha(package / record['mesh']) != record['mesh_sha256']:
            raise ValueError(f"CAD mesh hash mismatch: {record['mesh']}")
    mjcf = package / 'mjcf/cleany.xml'
    model = mj.MjModel.from_xml_path(str(mjcf.resolve()))
    data = mj.MjData(model)
    for name, angle in manifest['registration_angles_rad'].items():
        data.qpos[model.joint(name).qposadr[0]] = angle
    mj.mj_forward(model, data)
    # Preserve the dashboard's established view: ROS X -> X, Y -> -Z, Z -> Y.
    up = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], float)
    grouped: dict[tuple, list] = {}
    names = []
    original_triangles = 0
    simplified_meshes = 0
    for i in range(model.ngeom):
        if model.geom_group[i] != 2:
            continue
        rgba = model.geom_rgba[i].copy()
        material = int(model.geom_matid[i])
        if material >= 0:
            rgba = model.mat_rgba[material].copy()
        if rgba[3] == 0:
            continue
        if model.geom_type[i] == mj.mjtGeom.mjGEOM_MESH:
            mesh_id = model.geom_dataid[i]
            va, fa = model.mesh_vertadr[mesh_id], model.mesh_faceadr[mesh_id]
            mesh = tm.Trimesh(
                vertices=model.mesh_vert[va:va + model.mesh_vertnum[mesh_id]].copy(),
                faces=model.mesh_face[fa:fa + model.mesh_facenum[mesh_id]].copy(),
                process=False,
            )
        elif model.geom_type[i] == mj.mjtGeom.mjGEOM_CAPSULE:
            mesh = tm.creation.capsule(radius=model.geom_size[i, 0],
                                       height=2 * model.geom_size[i, 1], count=[12, 16])
        else:
            raise ValueError(f'Unsupported visible geometry type: {model.geom_type[i]}')
        original_triangles += len(mesh.faces)
        if len(mesh.faces) >= 2000:
            reduced = mesh.simplify_quadric_decimation(face_count=max(1000, int(len(mesh.faces) * .3)), aggression=3)
            # Preserve thin panels and reject simplification that shifts local bounds.
            if np.allclose(mesh.bounds, reduced.bounds, atol=.0002, rtol=0):
                mesh = reduced
                simplified_meshes += 1
        transform = np.eye(4)
        transform[:3, :3] = data.geom_xmat[i].reshape(3, 3)
        transform[:3, 3] = data.geom_xpos[i]
        mesh.apply_transform(up @ transform)
        grouped.setdefault(tuple(rgba), []).append(mesh)
        names.append(model.geom(i).name)
    scene = tm.Scene()
    for index, (rgba, meshes) in enumerate(grouped.items()):
        # Static CAD pose: merge by source color to reduce draw calls, preserving the exported parts and transforms.
        mesh = tm.util.concatenate(meshes)
        mesh.visual = tm.visual.TextureVisuals(material=tm.visual.material.PBRMaterial(
            name=f'cad-color-{index}', baseColorFactor=np.round(np.array(rgba) * 255).astype(np.uint8),
            metallicFactor=0, roughnessFactor=.65, doubleSided=True,
        ))
        scene.add_geometry(mesh, node_name=f'cad-color-{index}')
    content = scene.export(file_type='glb')
    loaded = tm.load(io.BytesIO(content), file_type='glb', force='scene')
    triangles = sum(len(m.faces) for m in scene.geometry.values())
    assert sum(len(m.faces) for m in loaded.geometry.values()) == triangles
    assert np.isfinite(loaded.bounds).all()
    assert np.allclose(scene.bounds, loaded.bounds, atol=1e-6)
    report = {
        'source_commit': subprocess.check_output(['git', '-C', str(args.checkout), 'rev-parse', 'HEAD'], text=True).strip(),
        'source_cad': manifest['source_name'], 'source_cad_sha256': manifest['source_sha256'],
        'source_mjcf_sha256': sha(mjcf), 'source_manifest_sha256': sha(manifest_path),
        'pose': 'Saved CAD registration pose; static preview, not live telemetry',
        'joints_radians': manifest['registration_angles_rad'],
        'geometry': 'All visible source parts and wheel capsules; conservative web tessellation, no concept overlays',
        'source_visible_geometry_count': len(names), 'source_visible_geometry_names': names,
        'verified_cad_meshes': len(records), 'draw_meshes': len(loaded.geometry),
        'source_triangles': original_triangles, 'simplified_meshes': simplified_meshes,
        'simplification': {'ratio': .3, 'minimum_faces': 1000, 'local_bounds_tolerance_m': .0002},
        'triangles': triangles, 'bounds_m': loaded.bounds.tolist(),
        'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest(),
        'mujoco_version': mj.__version__, 'trimesh_version': tm.__version__,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(content)
    args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'source_visible_geometry_names'}, indent=2))


if __name__ == '__main__':
    main()

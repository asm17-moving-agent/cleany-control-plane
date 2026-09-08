"""Derive a display-only standby pose from the e718ac57 MJCF and lightweight GLB.

Run with: uv run --with mujoco==3.12.0 --with trimesh --with numpy python
  tools/prepare_robot_standby.py <cleany.xml> <input.glb> <output.glb>
No simulation stepping or robot commands; the original geometry is preserved.
"""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import mujoco as mj
import numpy as np
import trimesh as tm

SOURCE_SHA = '2ef3f79e7d3fbb0cd8f43ea53afe44b8b5a377af250f7171ae23f5165c7131de'
FINISHES = {
    'matte-aluminum': ([166, 177, 184, 255], .55, .48),
    'rubber': ([32, 37, 41, 255], 0, .92),
    'motor-polymer': ([42, 50, 59, 255], .05, .67),
    'carbon': ([30, 37, 42, 255], .15, .63),
    'wheel-metal': ([118, 131, 141, 255], .6, .42),
    'slate-housing': ([47, 66, 79, 255], .08, .62),
    'arm-polymer': ([157, 167, 175, 255], .03, .64),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mjcf', type=Path)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists; choose a new path.')
    digest = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if digest != SOURCE_SHA:
        parser.error('Source GLB does not match the e718ac57 lightweight baseline.')
    model = mj.MjModel.from_xml_path(str(args.mjcf.resolve()))
    baseline = mj.MjData(model)
    mj.mj_forward(model, baseline)
    data = mj.MjData(model)
    joints = {f'{side}_{joint}_joint': angle for side in ('left', 'right')
              for joint, angle in [('shoulder_yaw', 0), ('shoulder_pitch', 2.9),
                                   ('elbow_pitch', 3.05), ('wrist_pitch', -.15),
                                   ('wrist_roll', 0), ('gripper', .15)]}
    # The two arm bases face opposite sides at qpos0. Turn them inward by
    # opposite yaw angles so both folded arms point along the head camera.
    joints.update(left_shoulder_yaw_joint=-np.pi / 2,
                  right_shoulder_yaw_joint=np.pi / 2,
                  head_pan_joint=0, head_tilt_joint=0)
    for name, angle in joints.items():
        index = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT, name)
        assert index >= 0, name
        assert not model.jnt_limited[index] or model.jnt_range[index, 0] <= angle <= model.jnt_range[index, 1], name
        data.qpos[model.jnt_qposadr[index]] = angle
    mj.mj_forward(model, data)
    camera = mj.mj_name2id(model, mj.mjtObj.mjOBJ_CAMERA, 'head_realsense_rgb')
    assert camera >= 0
    forward = -data.cam_xmat[camera].reshape(3, 3)[:, 2]
    horizontal_forward = forward[:2] / np.linalg.norm(forward[:2])
    for side in ('left', 'right'):
        shoulder = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT, f'{side}_shoulder_yaw_joint')
        for joint in ('elbow_pitch', 'wrist_pitch'):
            index = mj.mj_name2id(model, mj.mjtObj.mjOBJ_JOINT, f'{side}_{joint}_joint')
            offset = (data.xanchor[index] - data.xanchor[shoulder])[:2]
            distance = np.dot(offset, horizontal_forward)
            if joint == 'wrist_pitch':
                assert distance > .05, f'{side} wrist must be in front of its shoulder'
            else:
                assert distance < 0, f'{side} elbow must fold behind its shoulder'
            assert np.linalg.norm(offset - distance * horizontal_forward) < .02, f'{side} {joint} must align with the camera'
    # The fixed jaw fingers extend along local -Y. Keep them facing forward.
    for body_name in ('Fixed_Jaw', 'Fixed_Jaw_2'):
        body = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY, body_name)
        assert body >= 0
        grip_forward = -data.xmat[body].reshape(3, 3)[:, 1]
        assert np.dot(grip_forward, forward) > .999, body_name
    scene = tm.load(args.source, force='scene')
    before = scene.extents.copy()
    original_faces = sum(len(g.faces) for g in scene.geometry.values())
    up = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], float)
    mesh_files = {e.attrib['name']: e.attrib['file'].lower() for e in ET.parse(args.mjcf).findall('.//asset/mesh')}
    assignments = {}
    for node in scene.graph.nodes_geometry:
        index = int(node.rsplit('_', 1)[1])
        old_transform, geometry = scene.graph[node]
        transform = np.eye(4)
        transform[:3, :3] = baseline.geom_xmat[index].reshape(3, 3)
        transform[:3, 3] = baseline.geom_xpos[index]
        assert np.allclose(old_transform, up @ transform, atol=1e-5), f'MJCF/GLB mismatch: {node}'
        transform[:3, :3] = data.geom_xmat[index].reshape(3, 3)
        transform[:3, 3] = data.geom_xpos[index]
        scene.graph.update(frame_to=node, matrix=up @ transform, geometry=geometry)
        material = mj.mj_id2name(model, mj.mjtObj.mjOBJ_MATERIAL, int(model.geom_matid[index])) or ''
        mesh = ''
        if model.geom_type[index] == mj.mjtGeom.mjGEOM_MESH:
            mesh = mesh_files.get(mj.mj_id2name(model, mj.mjtObj.mjOBJ_MESH, int(model.geom_dataid[index])), '')
        if material == 'wheel_roller': finish = 'rubber'
        elif material == 'wheel_plate': finish = 'wheel-metal'
        elif material == 'carbon': finish = 'carbon'
        elif any(part in mesh for part in ('upright', 'rail', 'armbase', 'bracket')): finish = 'matte-aluminum'
        elif material == 'motor' or 'motor' in mesh or 'pg42' in mesh: finish = 'motor-polymer'
        elif material == 'blue' or (model.geom_matid[index] < 0 and max(model.geom_rgba[index, :3]) < .25): finish = 'slate-housing'
        else: finish = 'arm-polymer'
        assert geometry not in assignments or assignments[geometry] == finish, geometry
        assignments[geometry] = finish
        color, metal, rough = FINISHES[finish]
        scene.geometry[geometry].visual = tm.visual.TextureVisuals(material=tm.visual.material.PBRMaterial(
            name=finish, baseColorFactor=np.array(color, dtype=np.uint8),
            metallicFactor=metal, roughnessFactor=rough, doubleSided=True))
    assert np.isfinite(scene.bounds).all()
    assert scene.extents[2] < before[2], 'Standby should reduce arm span'
    assert sum(len(g.faces) for g in scene.geometry.values()) == original_faces
    content = scene.export(file_type='glb')
    import io
    loaded = tm.load(io.BytesIO(content), file_type='glb', force='scene')
    assert len(loaded.graph.nodes_geometry) == len(scene.graph.nodes_geometry) == 128
    assert np.allclose(scene.bounds, loaded.bounds, atol=1e-5)
    args.output.write_bytes(content)
    report = dict(source_sha256=digest, source_commit='e718ac57e861f3d34b6e0e10b0d18d87a348bf51',
                  pose='Display-only fully folded standby with forward-facing grippers; no simulation stepping or hardware safety validation',
                  head_camera_forward_ros=forward.tolist(),
                  joints_radians=joints, finishes=FINISHES, geometry_finishes=assignments,
                  dimensions_before_m=before.tolist(), dimensions_after_m=scene.extents.tolist(),
                  instances=128, triangles_unique=original_faces, bytes=len(content))
    args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('geometry_finishes','finishes')}, indent=2))


if __name__ == '__main__':
    main()

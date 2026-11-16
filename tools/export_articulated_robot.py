"""Export the same CAD as the static preview, retaining measured-joint articulation.

OPENBLAS_CORETYPE=ARMV8 uv run --with mujoco==3.12.0 --with trimesh==4.12.2 --with fast-simplification==0.1.13
 python tools/export_articulated_robot.py <cleany-checkout> <new-output.glb>
No simulation steps or control commands. Validate joint transforms against MuJoCo FK.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

import mujoco as mj
import numpy as np
import trimesh as tm

from export_cad_web_model import sha


def matrix(rotation, position):
    result = np.eye(4)
    result[:3, :3], result[:3, 3] = np.asarray(rotation).reshape(3, 3), position
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkout", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists() or args.output.with_suffix(".json").exists():
        parser.error("Choose a new output path; existing assets are preserved.")
    package = args.checkout / "ros2_ws/src/cleany_description"
    manifest_path = package / "config/geometry/cad_final.json"
    manifest = json.loads(manifest_path.read_text())
    records = next(v for v in manifest.values() if isinstance(v, list) and v
                   and isinstance(v[0], dict) and "mesh_sha256" in v[0])
    for record in records:
        assert sha(package / record["mesh"]) == record["mesh_sha256"]
    source = package / "mjcf/cleany.xml"
    # Kinematics-only copy: retain every body/joint/geometry and omit motor dynamics.
    # Source motor dynamics do not participate in the display-only FK export.
    xml = ET.parse(source).getroot()
    for tag in ("actuator", "sensor"):
        for child in xml.findall(tag):
            xml.remove(child)
    for parent in xml.iter():
        for child in list(parent):
            if child.tag == "dcmotor":
                parent.remove(child)
    xml.find("compiler").set("meshdir", str((source.parent / "../meshes").resolve()))
    model = mj.MjModel.from_xml_string(ET.tostring(xml, encoding="unicode"))
    data = mj.MjData(model)
    for name, value in manifest["registration_angles_rad"].items():
        data.qpos[model.joint(name).qposadr[0]] = value
    mj.mj_forward(model, data)
    reference = data.qpos.copy()
    world = [matrix(data.xmat[i], data.xpos[i]) for i in range(model.nbody)]
    local = [np.eye(4)] + [np.linalg.inv(world[model.body_parentid[i]]) @ world[i] for i in range(1, model.nbody)]
    up = np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],float)
    scene = tm.Scene()
    scene.graph.update(frame_to="robot_frame", frame_from="world", matrix=up)
    nodes = ["robot_frame"] + ["body_" + model.body(i).name for i in range(1, model.nbody)]
    joints, root = [], None
    for i in range(1, model.nbody):
        scene.graph.update(frame_to=nodes[i], frame_from=nodes[model.body_parentid[i]], matrix=local[i])
        count = int(model.body_jntnum[i])
        if count == 0:
            continue
        assert count == 1, f"Unsupported multi-joint body: {model.body(i).name}"
        j = int(model.body_jntadr[i])
        kind = int(model.jnt_type[j])
        if kind == mj.mjtJoint.mjJNT_FREE:
            root = nodes[i]
            continue
        assert kind in (mj.mjtJoint.mjJNT_HINGE,mj.mjtJoint.mjJNT_SLIDE)
        joints.append(dict(name=model.joint(j).name, node=nodes[i],
            kind="revolute" if kind == mj.mjtJoint.mjJNT_HINGE else "prismatic",
            axis=model.jnt_axis[j].tolist(), anchor=model.jnt_pos[j].tolist(),
            reference=float(reference[model.jnt_qposadr[j]]),
            limits=model.jnt_range[j].tolist() if model.jnt_limited[j] else None))
    groups, visible_names = {}, []
    source_triangles = 0
    for i in range(model.ngeom):
        if model.geom_group[i] != 2:
            continue
        rgba = model.mat_rgba[model.geom_matid[i]].copy() if model.geom_matid[i] >= 0 else model.geom_rgba[i].copy()
        if rgba[3] == 0:
            continue
        if model.geom_type[i] == mj.mjtGeom.mjGEOM_MESH:
            m = model.geom_dataid[i]
            va, fa = model.mesh_vertadr[m], model.mesh_faceadr[m]
            mesh = tm.Trimesh(vertices=model.mesh_vert[va:va+model.mesh_vertnum[m]].copy(),
                faces=model.mesh_face[fa:fa+model.mesh_facenum[m]].copy(),process=False)
        elif model.geom_type[i] == mj.mjtGeom.mjGEOM_CAPSULE:
            mesh = tm.creation.capsule(radius=model.geom_size[i,0],height=2*model.geom_size[i,1],count=[12,16])
        else:
            raise ValueError("Unsupported visible geometry")
        source_triangles += len(mesh.faces)
        if len(mesh.faces) >= 2000:
            reduced = mesh.simplify_quadric_decimation(face_count=max(1000,int(len(mesh.faces)*.3)),aggression=3)
            if np.allclose(mesh.bounds,reduced.bounds,atol=.0002,rtol=0):
                mesh = reduced
        body = int(model.geom_bodyid[i])
        mesh.apply_transform(np.linalg.inv(world[body]) @ matrix(data.geom_xmat[i],data.geom_xpos[i]))
        groups.setdefault((body,tuple(rgba)),[]).append(mesh)
        visible_names.append(model.geom(i).name)
    for index, ((body,rgba),meshes) in enumerate(groups.items()):
        mesh = tm.util.concatenate(meshes)
        mesh.visual = tm.visual.TextureVisuals(material=tm.visual.material.PBRMaterial(
            name=f"cad-material-{index}",baseColorFactor=np.round(np.asarray(rgba)*255).astype(np.uint8),
            metallicFactor=0,roughnessFactor=.65,doubleSided=True))
        scene.add_geometry(mesh,node_name=f"cad-geometry-{index}",parent_node_name=nodes[body])
    # Independent FK reference: perturb each joint, compare all descendant body transforms.
    max_error = 0.
    for joint in joints:
        j = model.joint(joint["name"]).id
        data.qpos[:] = reference
        delta = .07 if joint["kind"] == "revolute" else .003
        data.qpos[model.jnt_qposadr[j]] += delta
        mj.mj_forward(model,data)
        computed = [np.eye(4)]
        for i in range(1,model.nbody):
            transform = local[i].copy()
            if i == model.jnt_bodyid[j]:
                axis,anchor = np.array(joint["axis"]),np.array(joint["anchor"])
                transform = transform @ (tm.transformations.rotation_matrix(delta,axis,anchor)
                    if joint["kind"] == "revolute" else tm.transformations.translation_matrix(axis*delta))
            computed.append(computed[model.body_parentid[i]] @ transform)
            max_error = max(max_error,float(np.max(np.abs(computed[i]-matrix(data.xmat[i],data.xpos[i])))))
    assert max_error < 1e-8, max_error
    content = scene.export(file_type="glb")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_bytes(content)
    report = dict(schema_version=1,source_commit=subprocess.check_output(["git","-C",str(args.checkout),"rev-parse","HEAD"],text=True).strip(),
        source_mjcf_sha256=sha(source),source_manifest_sha256=sha(manifest_path),
        source_cad_sha256=manifest["source_sha256"],
        kinematics_only=True, mujoco_version=mj.__version__,sha256=hashlib.sha256(content).hexdigest(),
        root_node=root,joints=joints,bounds_m=scene.bounds.tolist(),
        source_visible_geometry_count=len(visible_names),source_visible_geometry_names=visible_names,
        source_triangles=source_triangles,triangles=sum(len(m.faces) for m in scene.geometry.values()),
        draw_meshes=len(scene.geometry),fk_max_matrix_error=max_error,
        note="Source CAD geometry and named MJCF joints; centered base orientation only. No hardware calibration or command authority.")
    args.output.with_suffix(".json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({k:v for k,v in report.items() if k not in ("joints","source_visible_geometry_names")},indent=2))


if __name__ == "__main__":
    main()

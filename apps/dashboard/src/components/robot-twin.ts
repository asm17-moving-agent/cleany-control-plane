import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { rig } from './robot-twin-metadata';
export interface TwinPose { positions: Record<string, number>; orientation?: number[]; }
/** Apply source joint coordinates to the same CAD body hierarchy. Targets never enter this API. */
export function attachTwin(model: Object3D) {
  const bindings = rig.joints.map(joint => {
    const node = model.getObjectByName(joint.node);
    if (!node) throw new Error(`Missing articulated CAD node: ${joint.node}`);
    node.updateMatrix();
    return { joint, node, rest: node.matrix.clone() };
  });
  const root = model.getObjectByName(rig.root_node!);
  if (!root) throw new Error('Missing articulated CAD root');
  const previous: Record<string, number> = {};
  return (pose: TwinPose) => {
    let changed = false;
    for (const { joint, node, rest } of bindings) {
      if (joint.limits && Math.abs(joint.limits[1]-joint.limits[0]) < 1e-8) continue;
      const value = pose.positions[joint.name];
      if (!Number.isFinite(value) || previous[joint.name] === value) continue; // Hold the last observation; never invent missing joints.
      previous[joint.name] = value;
      changed = true;
      const delta = value - joint.reference;
      const axis = new Vector3(...joint.axis);
      const anchor = new Vector3(...joint.anchor);
      const transform = joint.kind === 'revolute'
        ? new Matrix4().makeTranslation(anchor).multiply(new Matrix4().makeRotationAxis(axis, delta))
          .multiply(new Matrix4().makeTranslation(anchor.clone().negate()))
        : new Matrix4().makeTranslation(axis.multiplyScalar(delta));
      rest.clone().multiply(transform).decompose(node.position, node.quaternion, node.scale);
    }
    if (pose.orientation?.length === 4 && pose.orientation.every(Number.isFinite)) {
      const q = new Quaternion(...pose.orientation);
      if (Math.abs(q.length()-1) < .01 && !root.quaternion.equals(q)) { root.quaternion.copy(q.normalize()); changed = true; }
    }
    if (changed) model.updateMatrixWorld(true);
    return changed;
  };
}

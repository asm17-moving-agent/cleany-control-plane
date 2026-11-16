import { describe, expect, it } from 'vitest';
import { Group, Matrix4, Object3D, Vector3 } from 'three';
import rig from './robot-twin-rig.json';
import { attachTwin } from './robot-twin';
describe('CAD articulation', () => {
  it('rotates about the source joint pivot and holds missing measurements', () => {
    const root = new Group();
    const base = new Object3D(); base.name=rig.root_node!; root.add(base);
    for (const joint of rig.joints) {const node=new Object3D();node.name=joint.node;root.add(node);}
    const apply = attachTwin(root);
    const joint = rig.joints.find(j=>j.name==='left_shoulder_pitch_joint')!;
    const node = root.getObjectByName(joint.node)!;
    const anchor = new Vector3(...joint.anchor);
    apply({positions:{[joint.name]:joint.reference+.5}});
    const expected=new Matrix4().makeTranslation(anchor).multiply(new Matrix4().makeRotationAxis(new Vector3(...joint.axis),.5)).multiply(new Matrix4().makeTranslation(anchor.clone().negate()));
    node.matrix.elements.forEach((v,i)=>expect(v).toBeCloseTo(expected.elements[i],10));
    const old=node.matrix.clone();
    apply({positions:{}});
    expect(node.matrix.equals(old)).toBe(true);
    apply({positions:{[joint.name]:joint.reference}});
    expect(node.quaternion.w).toBeCloseTo(1);
  });
  it('rejects an incompatible model instead of showing a fake live pose', () => {
    expect(()=>attachTwin(new Group())).toThrow('Missing articulated CAD node');
  });
});

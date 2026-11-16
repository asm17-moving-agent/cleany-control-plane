import rig from './robot-twin-rig.json';
export { rig };
export const twinGrippers = rig.joints.filter(joint => joint.name.includes("gripper"));
export const twinJointNames = new Set(rig.joints.map(joint => joint.name));
export const movingTwinJoints = rig.joints.filter(joint => !joint.name.includes('roller') && (!joint.limits || Math.abs(joint.limits[1]-joint.limits[0]) >= 1e-8));

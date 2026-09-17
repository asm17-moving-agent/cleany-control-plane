import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

/** Partial, display-only guards fitted to the pinned standby GLB. */
export function createRobotArmCovers(model: THREE.Object3D, material: THREE.Material) {
  const group = new THREE.Group();
  group.name = "arm-cover-concept";
  group.userData = { concept: true, pose: "e718ac57-standby", movingClearancesValidated: false };
  model.updateMatrixWorld(true);

  // A thin C section with an open face and open ends. X is the link normal,
  // Y its width, and Z its length; the folded pair opens toward one another.
  function channel(length: number, depth: number, lip: number, halfWidth: number, corner: number) {
    const wall = .0025;
    const shape = new THREE.Shape();
    shape.moveTo(lip, -halfWidth);
    shape.lineTo(-depth + corner, -halfWidth);
    shape.quadraticCurveTo(-depth, -halfWidth, -depth, -halfWidth + corner);
    shape.lineTo(-depth, halfWidth - corner);
    shape.quadraticCurveTo(-depth, halfWidth, -depth + corner, halfWidth);
    shape.lineTo(lip, halfWidth);
    shape.lineTo(lip, halfWidth - wall);
    shape.lineTo(-depth + corner, halfWidth - wall);
    shape.quadraticCurveTo(-depth + wall, halfWidth - wall, -depth + wall, halfWidth - corner);
    shape.lineTo(-depth + wall, -halfWidth + corner);
    shape.quadraticCurveTo(-depth + wall, -halfWidth + wall, -depth + corner, -halfWidth + wall);
    shape.lineTo(lip, -halfWidth + wall);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: length, steps: 12, curveSegments: 8,
      bevelEnabled: true, bevelSegments: 2, bevelSize: .0006, bevelThickness: .0006,
    });
    geometry.translate(0, 0, -length / 2);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const t = THREE.MathUtils.clamp((length / 2 - Math.abs(positions.getZ(i))) / .022, 0, 1);
      const taper = .86 + .14 * t * t * (3 - 2 * t);
      positions.setXY(i, positions.getX(i) * taper, positions.getY(i) * taper);
    }
    // Smooth the tapered surface while retaining the rims. The utility hashes
    // positions at 0.01 input units, so use millimetres for these thin walls.
    geometry.scale(1000, 1000, 1000);
    return toCreasedNormals(geometry, Math.PI / 3).scale(.001, .001, .001);
  }

  function source(name: string) {
    const mesh = model.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh?.isMesh) throw new Error(`Standby arm mesh missing: ${name}`);
    return mesh;
  }

  for (const [side, upperNode, lowerNode, shoulderNode] of [
    ["left", "Upper_Arm_57", "Lower_Arm_62", "Rotation_Pitch_52"],
    ["right", "Upper_Arm_2_89", "Lower_Arm_2_94", "Rotation_Pitch_2_84"],
  ] as const) {
    for (const [link, node, length] of [["upper", upperNode, .130], ["lower", lowerNode, .128]] as const) {
      const geometry = channel(length, .020, .008, .024, .008);
      if (link === "lower") geometry.rotateZ(Math.PI);
      const cover = new THREE.Mesh(geometry, material);
      cover.name = `arm-cover-${side}-${link}`;
      cover.userData = { sourceNode: node, openTowardFold: true };
      cover.applyMatrix4(source(node).matrixWorld);
      group.add(cover);
    }

    // A shallow front guard hides the upright bracket, leaving its rear open.
    // It ends below the shoulder pivot and does not cover wrist cameras or jaws.
    const bounds = new THREE.Box3().setFromObject(source(shoulderNode), true);
    const center = bounds.getCenter(new THREE.Vector3());
    const shoulder = new THREE.Mesh(channel(.068, .024, -.005, .036, .010), material);
    shoulder.name = `arm-cover-${side}-shoulder`;
    shoulder.userData = { sourceNode: shoulderNode, openAtRear: true };
    shoulder.setRotationFromMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0),
    ));
    shoulder.position.set(bounds.max.x - .0145, bounds.min.y + .044, center.z);
    group.add(shoulder);
  }
  return group;
}

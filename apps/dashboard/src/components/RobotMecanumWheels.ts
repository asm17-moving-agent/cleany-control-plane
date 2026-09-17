import * as THREE from "three";

/** KB: Ø127 mm. Source CAD supplies axle positions, 12 rollers and handedness.
 * Plate machining and fasteners are presentation detail, not a vendor drawing.
 */
export function createRobotMecanumWheels(model: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = "kb-127mm-mecanum-wheels";
  const metal = new THREE.MeshStandardMaterial({ color: 0xc8cdd1, metalness: .45, roughness: .3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x717d87, metalness: .85, roughness: .3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x25282c, metalness: 0, roughness: .83 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172028, metalness: .3, roughness: .55 });
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, z = 0) {
    const part = new THREE.Mesh(geometry, material);
    part.position.z = z; parent.add(part); return part;
  }
  function cylinder(radius: number, length: number, segments = 48) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
    geometry.rotateX(Math.PI / 2); return geometry;
  }
  const plate = new THREE.Shape();
  plate.absarc(0, 0, .049, 0, Math.PI * 2, false);
  const bore = new THREE.Path(); bore.absarc(0, 0, .008, 0, Math.PI * 2, true); plate.holes.push(bore);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const hole = new THREE.Path();
    hole.absarc(.032 * Math.cos(angle), .032 * Math.sin(angle), .009, 0, Math.PI * 2, true);
    plate.holes.push(hole);
  }
  const plateGeometry = new THREE.ExtrudeGeometry(plate, {
    depth: .003, bevelEnabled: true, bevelThickness: .00035, bevelSize: .00035,
    bevelSegments: 2, curveSegments: 48,
  });
  plateGeometry.translate(0, 0, -.0015);
  // Smooth barrel roller; max radius .008 + centre radius .0555 = .0635 m.
  const profile = Array.from({ length: 25 }, (_, i) => {
    const y = -.023 + i / 24 * .046;
    return new THREE.Vector2(.0034 + .0046 * Math.cos(y / .023 * Math.PI / 2), y);
  });
  const rollerGeometry = new THREE.LatheGeometry(profile, 48);
  rollerGeometry.rotateX(Math.PI / 2);
  model.updateMatrixWorld(true);
  model.traverse(source => {
    if (!(source instanceof THREE.Mesh) || !/^(front|rear)_(left|right)_(wheel|roller)_/.test(source.name)) return;
    const part = new THREE.Group(); part.name = `detailed-${source.name}`;
    part.applyMatrix4(source.matrixWorld); group.add(part); source.visible = false;
    if (source.name.includes("roller")) {
      mesh(part, rollerGeometry, rubber);
      mesh(part, cylinder(.0019, .052), steel);
      for (const side of [-1, 1]) {
        mesh(part, cylinder(.0043, .002), metal, side * .024);
        mesh(part, cylinder(.0025, .002, 6), steel, side * .0258);
      }
      return;
    }
    source.geometry.computeBoundingBox();
    const size = source.geometry.boundingBox!.getSize(new THREE.Vector3());
    if (size.z > .01) {
      mesh(part, cylinder(.018, .051), steel);
      for (const side of [-1, 1]) {
        mesh(part, cylinder(.016, .005), metal, side * .026);
        mesh(part, cylinder(.005, .001), dark, side * .029);
      }
      return;
    }
    mesh(part, plateGeometry, metal);
    for (const face of [-1, 1]) {
      const lip = mesh(part, new THREE.TorusGeometry(.0478, .0007, 8, 80), steel, face * .002);
      lip.name = "machined-rim-edge";
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        const bolt = mesh(part, cylinder(.0021, .0018, 6), steel, face * .003);
        bolt.position.x = .043 * Math.cos(angle); bolt.position.y = .043 * Math.sin(angle);
      }
      for (let i = 0; i < 4; i++) {
        const angle = Math.PI / 4 + i * Math.PI / 2;
        const bolt = mesh(part, cylinder(.0026, .002, 6), dark, face * .003);
        bolt.position.x = .021 * Math.cos(angle); bolt.position.y = .021 * Math.sin(angle);
      }
    }
  });
  return group;
}

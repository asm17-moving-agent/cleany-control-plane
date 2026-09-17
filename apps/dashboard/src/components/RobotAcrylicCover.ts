import * as THREE from "three";

/** Presentation-only 3 mm acrylic panels; front cutout leaves the LiDAR exposed. */
export function createRobotAcrylicCover() {
  const group = new THREE.Group();
  group.name = "lower-acrylic-concept";
  const acrylic = new THREE.MeshPhysicalMaterial({
    color: 0xe4eef0, transparent: true, opacity: .25, depthWrite: false,
    metalness: 0, roughness: .32, clearcoat: .65, clearcoatRoughness: .20,
    side: THREE.DoubleSide,
  });
  const edge = new THREE.LineBasicMaterial({ color: 0x91b4c0, transparent: true, opacity: .55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa8b3b9, metalness: .65, roughness: .3 });
  function panel(name: string, geometry: THREE.BufferGeometry, position: THREE.Vector3, rotation = 0) {
    const mesh = new THREE.Mesh(geometry, acrylic);
    mesh.name = name;
    mesh.position.copy(position);
    mesh.rotation.y = rotation;
    group.add(mesh);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edge);
    outline.position.copy(position);
    outline.rotation.copy(mesh.rotation);
    group.add(outline);
  }
  for (const side of [-1, 1]) {
    // Match the upper shell: 458 × 548 mm, with 35 mm corner radii.
    panel(`acrylic-side-${side}`, new THREE.BoxGeometry(.388, .230, .003), new THREE.Vector3(0, .285, side * .2725));
    for (const x of [-.183, .183]) for (const y of [.188, .382]) {
      const fastener = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .004, 16), metal);
      fastener.rotation.x = Math.PI / 2;
      fastener.position.set(x, y, side * .276);
      group.add(fastener);
    }
  }
  panel("acrylic-rear", new THREE.BoxGeometry(.003, .230, .478), new THREE.Vector3(-.2275, .285, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const angle = i / 16 * Math.PI / 2;
      points.push(new THREE.Vector2(sx * (.194 + .035 * Math.cos(angle)), sz * (.239 + .035 * Math.sin(angle))));
    }
    for (let i = 16; i >= 0; i--) {
      const angle = i / 16 * Math.PI / 2;
      points.push(new THREE.Vector2(sx * (.194 + .032 * Math.cos(angle)), sz * (.239 + .032 * Math.sin(angle))));
    }
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: .230, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    panel(`acrylic-rounded-corner-${sx}-${sz}`, geometry, new THREE.Vector3(0, .170, 0));
  }
  // U-shaped upper notch around the sensor bracket: no acrylic across its optical band.
  const front = new THREE.Shape();
  front.moveTo(-.239, .170);
  front.lineTo(.239, .170);
  front.lineTo(.239, .400);
  front.lineTo(.064, .400);
  front.lineTo(.064, .309);
  front.lineTo(-.064, .309);
  front.lineTo(-.064, .400);
  front.lineTo(-.239, .400);
  front.closePath();
  panel("acrylic-front-lidar-cutout", new THREE.ExtrudeGeometry(front, { depth: .003, bevelEnabled: false }),
    new THREE.Vector3(.226, 0, 0), Math.PI / 2);
  return group;
}

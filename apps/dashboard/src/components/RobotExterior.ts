import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createRobotArmCovers } from "./RobotArmCovers";
import { FRONT_SENSOR_OPENINGS, openFrontSensorPorts } from "./RobotSensorOpenings";
import wordmarkUrl from "../assets/brand/wordmark.png";

/** Display-only enclosure for the e718ac57 CAD, in metres: +X front, +Y up. */
export function createRobotExterior(invalidate: () => void, model: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = "cleany-exterior-concept";
  group.userData = { concept: true, source: "e718ac57", units: "metres" };
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xe4e3df, metalness: .12, roughness: .44 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x303639, metalness: .16, roughness: .56 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x202528, roughness: .86 });
  const recess = new THREE.MeshStandardMaterial({ color: 0x373d40, roughness: .82 });
  const binPolymer = new THREE.MeshStandardMaterial({ color: 0x50595b, metalness: .02, roughness: .78 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x899193, metalness: .55, roughness: .4 });
  const seam = new THREE.MeshStandardMaterial({ color: 0x797f7f, metalness: .08, roughness: .7 });
  const couplingMetal = new THREE.MeshStandardMaterial({ color: 0x9da5aa, metalness: .72, roughness: .34 });
  group.add(createRobotArmCovers(model, porcelain));

  function box(name: string, size: [number, number, number], position: [number, number, number], material: THREE.Material, radius = .01) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 3, radius), material);
    mesh.name = name;
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  }

  function roundedOutline(width: number, depth: number, radius: number, centerX = 0) {
    const x = centerX - width / 2, z = -depth / 2;
    const path = new THREE.Shape();
    path.moveTo(x + radius, z);
    path.lineTo(x + width - radius, z);
    path.quadraticCurveTo(x + width, z, x + width, z + radius);
    path.lineTo(x + width, z + depth - radius);
    path.quadraticCurveTo(x + width, z + depth, x + width - radius, z + depth);
    path.lineTo(x + radius, z + depth);
    path.quadraticCurveTo(x, z + depth, x, z + depth - radius);
    path.lineTo(x, z + radius);
    path.quadraticCurveTo(x, z, x + radius, z);
    path.closePath();
    return path;
  }

  function extrudePlate(name: string, outline: THREE.Shape, height: number, y: number,
    material: THREE.Material, x = 0) {
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: height, steps: 1, curveSegments: 8,
      bevelEnabled: true, bevelSegments: 2, bevelSize: .001, bevelThickness: .001,
    });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(x, y, 0);
    group.add(mesh);
    return mesh;
  }

  function openPlate(name: string, width: number, depth: number, height: number, y: number,
    material: THREE.Material, holeWidth: number, holeDepth: number, holeX: number, x = 0,
    outerRadius = .015, innerRadius = .011) {
    const outline = roundedOutline(width, depth, outerRadius);
    const hole = roundedOutline(holeWidth, holeDepth, innerRadius, holeX);
    outline.holes.push(new THREE.Path(hole.getPoints(8).reverse()));
    return extrudePlate(name, outline, height, y, material, x);
  }

  // Both compartments use the same vertical profile, including corner normals.
  const bodyWidth = .458, bodyDepth = .548, bodyRadius = .035;
  // Wheel geometry reaches Y=.127003; the enclosure starts at .139 (~12 mm gap).
  box("lower-bumper", [.470, .030, .560], [0, .154, 0], rubber, .014);
  const lowerBody = openPlate("lower-body", bodyWidth, bodyDepth, .2425, .160,
    porcelain, .432, .522, 0, 0, bodyRadius, .022);
  group.add(openFrontSensorPorts(lowerBody,
    [...FRONT_SENSOR_OPENINGS.lidar, ...FRONT_SENSOR_OPENINGS.ultrasonic], graphite));
  // The bevels leave a 0.5 mm joint at Y=.4035–.404. A matching recessed
  // backing closes it without the previous stacked lid and raised belt.
  extrudePlate("body-joint-backing", roundedOutline(bodyWidth - .002, bodyDepth - .002, bodyRadius - .001),
    .006, .401, porcelain);

  // Recessed rear service panel and an understated finger pull.
  box("service-panel-reveal", [.003, .161, .378], [-.229, .270, 0], seam, .0014);
  box("service-panel", [.004, .151, .368], [-.231, .270, 0], porcelain, .0018);
  box("service-panel-pull", [.004, .008, .069], [-.234, .326, 0], recess, .002);
  // Vent styling is indicative only; it does not claim validated airflow.
  const ventGeometry = new RoundedBoxGeometry(.008, .042, .003, 2, .0014);
  const vents = new THREE.InstancedMesh(ventGeometry, recess, 18);
  vents.name = "side-vent-insets";
  let index = 0;
  for (const side of [-1, 1]) for (let slot = 0; slot < 9; slot++) {
    vents.setMatrixAt(index++, new THREE.Matrix4().makeTranslation(-.085 + slot * .021, .227, side * .274));
  }
  group.add(vents);

  // The source MJCF has no couplers: each shaft stops ~12.9 mm before its hub.
  // These display-only sleeves bridge that gap; their form is not a measured part.
  // Axles run along web Z, at Y=.063503, with a shared Z offset of -.000027.
  // The sleeve overlaps the existing shaft, then its flange enters the wheel hub.
  const couplingProfile = [
    [.0056, .2530], [.0105, .2530], [.0115, .2540],
    [.0115, .2708], [.0122, .2720], [.0170, .2720],
    [.0180, .2730], [.0180, .2768], [.0165, .2784],
    [.0056, .2784], [.0056, .2530],
  ].map(([radius, axial]) => new THREE.Vector2(radius, axial));
  const couplingGeometry = new THREE.LatheGeometry(couplingProfile, 32);
  for (const [end, x] of [["front", .174975], ["rear", -.175025]] as const) {
    for (const [side, direction] of [["left", -1], ["right", 1]] as const) {
      const coupling = new THREE.Mesh(couplingGeometry, couplingMetal);
      coupling.name = `wheel-coupler-${end}-${side}`;
      coupling.userData = { concept: true, specification: "unconfirmed" };
      coupling.rotation.x = direction * Math.PI / 2;
      coupling.position.set(x, .063503, -.000027);
      group.add(coupling);
    }
  }

  // The centre bay holds a hollow collection bin. Front is +X: the opening at
  // X=-.080 is behind both arm mounts (X=.116), clear of the fixed mast foot.
  box("collection-bin-bottom", [.350, .010, .432], [-.001, .411, 0], binPolymer, .004);
  box("collection-bin-front", [.008, .362, .432], [.170, .592, 0], binPolymer, .003);
  box("collection-bin-rear", [.008, .362, .432], [-.172, .592, 0], binPolymer, .003);
  for (const z of [-.212, .212]) {
    box(`collection-bin-side-${z}`, [.342, .362, .008], [-.001, .592, z], binPolymer, .003);
  }
  // One continuous shell wraps outside the four aluminium profiles at
  // X=±.20 / Z=±.25. Its hollow centre preserves the separate bin and drop path.
  // Leave a 1 mm reveal below the cap, backed by deck-edge, so bevels do not overlap.
  openPlate("collection-bin-outer-shell", bodyWidth, bodyDepth, .3855, .405,
    porcelain, .432, .522, 0, 0, bodyRadius, .022);
  box("collection-bin-door-reveal", [.0015, .316, .402], [-.2305, .595, 0], seam, .0007);
  box("collection-bin-door", [.002, .310, .396], [-.2318, .595, 0], porcelain, .0009);
  box("collection-bin-rear-grip", [.003, .010, .092], [-.234, .710, 0], recess, .0014);
  // All three layers have real through-holes; no solid deck blocks the drop.
  openPlate("deck-edge", .456, .546, .020, .774, graphite, .178, .398, -.080, 0, .034);
  openPlate("deck-top", .458, .548, .023, .7935, porcelain, .178, .398, -.080, 0, .035);
  openPlate("collection-bin-inlet-collar", .192, .412, .045, .771, binPolymer, .164, .384, 0, -.080);
  openPlate("collection-bin-inlet-rim", .180, .400, .005, .817, trim, .164, .384, 0, -.080);
  for (const z of [-.175, .175]) {
    box(`arm-mount-${z}`, [.125, .015, .122], [.116, .815, z], graphite, .007);
  }

  // Cover the fixed mast only. Pan/tilt joints and the camera stay exposed.
  box("mast-foot", [.166, .04, .137], [.104, .82, 0], porcelain, .018);
  box("mast-cover", [.084, .294, .080], [.103, .985, 0], porcelain, .019);
  box("mast-cap", [.083, .013, .079], [.103, 1.13, 0], graphite, .006);
  box("mast-accent", [.002, .028, .006], [.146, 1.064, 0], trim, .001);

  // Keep the supplied wordmark on the raised upper front panel.
  let disposed = false;
  const logoTexture = new THREE.TextureLoader().load(wordmarkUrl, () => { if (!disposed) invalidate(); });
  logoTexture.colorSpace = THREE.SRGBColorSpace;
  const logoWidth = .177;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(logoWidth, logoWidth * 142 / 480), new THREE.MeshBasicMaterial({
    map: logoTexture, transparent: true, depthWrite: false, toneMapped: false,
  }));
  logo.name = "cleany-wordmark";
  logo.rotation.y = Math.PI / 2;
  logo.position.set(.231, .600, 0);
  group.add(logo);

  return { group, dispose: () => { disposed = true; logoTexture.dispose(); } };
}

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

type Opening = { name: string; y: number; z: number; width: number; height: number; radius: number; backX: number };

// Display-only layout requested below the body joint (Y≈.404).
// This overrides the pinned MJCF lidar_site height (.46); no sensor meshes
// or hardware mounting coordinates are changed.
export const FRONT_SENSOR_OPENINGS = {
  lidar: [{ name: "lidar", y: .360, z: 0, width: .230 * 2 / 3, height: .032, radius: .010, backX: .176 }],
  ultrasonic: [-.165, .165].map((z, i) => ({
    name: `ultrasonic-${i === 0 ? "left" : "right"}`,
    y: .295, z, width: .060, height: .024, radius: .012, backX: .176,
  })),
} satisfies Record<string, Opening[]>;

function outline(width: number, height: number, radius: number, x: number, y: number) {
  const shape = new THREE.Shape();
  const left = x - width / 2, right = x + width / 2;
  const bottom = y - height / 2, top = y + height / 2;
  if (radius === 0) {
    shape.moveTo(left, bottom); shape.lineTo(right, bottom);
    shape.lineTo(right, top); shape.lineTo(left, top);
  } else {
    shape.moveTo(left + radius, bottom);
    shape.lineTo(right - radius, bottom);
    shape.absarc(right - radius, bottom + radius, radius, -Math.PI / 2, 0);
    shape.lineTo(right, top - radius);
    shape.absarc(right - radius, top - radius, radius, 0, Math.PI / 2);
    shape.lineTo(left + radius, top);
    shape.absarc(left + radius, top - radius, radius, Math.PI / 2, Math.PI);
    shape.lineTo(left, bottom + radius);
    shape.absarc(left + radius, bottom + radius, radius, Math.PI, Math.PI * 1.5);
  }
  shape.closePath();
  return shape;
}

/** Cut both faces of a hollow, upright shell and line the open bores. */
export function openFrontSensorPorts(shell: THREE.Mesh, openings: readonly Opening[], trim: THREE.Material) {
  const original = shell.geometry;
  const source = original.index ? original.toNonIndexed() : original;
  const positions = source.getAttribute("position"), normals = source.getAttribute("normal");
  const uvs = source.getAttribute("uv");
  const kept = { position: [] as number[], normal: [] as number[], uv: [] as number[] };
  const planes = new Map<string, { x: number; facing: number; minY: number; maxY: number; minZ: number; maxZ: number }>();
  for (let i = 0; i < positions.count; i += 3) {
    const x = positions.getX(i), facing = Math.sign(normals.getX(i));
    const front = x > 0 && Math.abs(normals.getX(i)) > .999999 && [0, 1, 2].every(j =>
      Math.abs(positions.getX(i + j) - x) < 1e-7 &&
      Math.abs(normals.getX(i + j) - facing) < 1e-6);
    if (front) {
      const key = `${x.toFixed(6)}:${facing}`;
      const plane = planes.get(key) ?? { x, facing, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
      for (let j = 0; j < 3; j++) {
        plane.minY = Math.min(plane.minY, positions.getY(i + j));
        plane.maxY = Math.max(plane.maxY, positions.getY(i + j));
        plane.minZ = Math.min(plane.minZ, positions.getZ(i + j));
        plane.maxZ = Math.max(plane.maxZ, positions.getZ(i + j));
      }
      planes.set(key, plane);
    } else {
      for (let j = 0; j < 3; j++) {
        kept.position.push(positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j));
        kept.normal.push(normals.getX(i + j), normals.getY(i + j), normals.getZ(i + j));
        kept.uv.push(uvs.getX(i + j), uvs.getY(i + j));
      }
    }
  }
  if (planes.size !== 2) throw new Error(`Expected two front shell faces: ${shell.name}, got ${planes.size}`);

  const rim = .002;
  const retained = new THREE.BufferGeometry();
  retained.setAttribute("position", new THREE.Float32BufferAttribute(kept.position, 3));
  retained.setAttribute("normal", new THREE.Float32BufferAttribute(kept.normal, 3));
  retained.setAttribute("uv", new THREE.Float32BufferAttribute(kept.uv, 2));
  const parts = [retained];
  for (const plane of planes.values()) {
    const face = outline(plane.maxZ - plane.minZ, plane.maxY - plane.minY, 0,
      -plane.facing * (plane.minZ + plane.maxZ) / 2, (plane.minY + plane.maxY) / 2);
    for (const opening of openings) {
      const y = opening.y - shell.position.y, z = opening.z - shell.position.z;
      if (y - opening.height / 2 - rim <= plane.minY || y + opening.height / 2 + rim >= plane.maxY ||
          z - opening.width / 2 - rim <= plane.minZ || z + opening.width / 2 + rim >= plane.maxZ) {
        throw new Error(`Sensor opening crosses a shell edge: ${opening.name}`);
      }
      const hole = outline(opening.width + rim * 2, opening.height + rim * 2,
        opening.radius + rim, -plane.facing * z, y);
      face.holes.push(new THREE.Path(hole.getPoints(12).reverse()));
    }
    const geometry = new THREE.ShapeGeometry(face, 12).toNonIndexed();
    geometry.rotateY(plane.facing * Math.PI / 2).translate(plane.x, 0, 0);
    parts.push(geometry);
  }
  shell.geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  if (source !== original) source.dispose();
  original.dispose();

  const group = new THREE.Group();
  group.name = `sensor-openings-${shell.name}`;
  group.userData = { concept: true, mountingDimensionsValidated: false, fullLidarFieldOfViewValidated: false };
  const outerX = Math.max(...[...planes.values()].map(p => p.x));
  for (const opening of openings) {
    const frame = outline(opening.width + rim * 2, opening.height + rim * 2, opening.radius + rim, 0, 0);
    frame.holes.push(new THREE.Path(outline(opening.width, opening.height, opening.radius, 0, 0).getPoints(12).reverse()));
    const geometry = new THREE.ExtrudeGeometry(frame, {
      depth: outerX - opening.backX - .0008, steps: 1, curveSegments: 12,
      bevelEnabled: true, bevelSize: .0004, bevelThickness: .0004, bevelSegments: 2,
    });
    geometry.rotateY(Math.PI / 2);
    const liner = new THREE.Mesh(geometry, trim);
    liner.name = `${opening.name}-aperture-liner`;
    liner.position.set(shell.position.x + opening.backX + .0004, opening.y, opening.z);
    group.add(liner);
    // A matte inner bay sits behind the reserved sensor position. It is not a
    // sensor face or glazing; the actual shell bores remain open in front of it.
    const backGeometry = new THREE.ShapeGeometry(outline(opening.width + rim * 2,
      opening.height + rim * 2, opening.radius + rim, 0, 0), 12);
    backGeometry.rotateY(Math.PI / 2);
    const back = new THREE.Mesh(backGeometry, trim);
    back.name = `${opening.name}-recess-back`;
    back.position.set(shell.position.x + opening.backX - .0003, opening.y, opening.z);
    group.add(back);
  }
  return group;
}

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FRONT_SENSOR_OPENINGS, openFrontSensorPorts } from "./RobotSensorOpenings";

function shell(y: number, height: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-.229, -.274); shape.lineTo(.229, -.274);
  shape.lineTo(.229, .274); shape.lineTo(-.229, .274); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-.216, -.261); hole.lineTo(-.216, .261);
  hole.lineTo(.216, .261); hole.lineTo(.216, -.261); hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.position.y = y;
  return mesh;
}

function fixture() {
  const group = new THREE.Group();
  const upper = shell(.405, .3855), lower = shell(.160, .2425);
  group.add(upper, lower);
  group.add(openFrontSensorPorts(lower,
    [...FRONT_SENSOR_OPENINGS.lidar, ...FRONT_SENSOR_OPENINGS.ultrasonic], new THREE.MeshStandardMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

describe("front sensor openings", () => {
  it("opens the LiDAR aperture below the joint and closes its old upper-panel position", () => {
    const group = fixture();
    const origin = new THREE.Vector3(.18, .36, 0);
    for (const y of [.351, .36, .369]) for (const z of [-.060, 0, .060]) {
      const direction = new THREE.Vector3(.23, y, z).sub(origin).normalize();
      expect(new THREE.Raycaster(origin, direction, 0, .2).intersectObject(group, true)).toHaveLength(0);
    }
    const oldPosition = new THREE.Raycaster(new THREE.Vector3(.18, .46, 0), new THREE.Vector3(1, 0, 0), 0, .2);
    expect(oldPosition.intersectObject(group, true).length).toBeGreaterThan(0);
    for (const z of [-.09, .09]) {
      const formerEdge = new THREE.Raycaster(new THREE.Vector3(.3, .36, z), new THREE.Vector3(-1, 0, 0), 0, .1);
      expect(formerEdge.intersectObject(group, true)[0]?.point.x).toBeCloseTo(.229, 5);
    }
  });

  it("widens both ultrasonic bores horizontally while retaining their rims and the panel between them", () => {
    const group = fixture();
    for (const z of [-.165, .165]) {
      for (const offset of [-.020, 0, .020]) {
        const through = new THREE.Raycaster(new THREE.Vector3(.3, .295, z + offset), new THREE.Vector3(-1, 0, 0), 0, .1);
        expect(through.intersectObject(group, true)).toHaveLength(0);
      }
      const recessed = new THREE.Raycaster(new THREE.Vector3(.3, .295, z), new THREE.Vector3(-1, 0, 0), 0, .2);
      const back = recessed.intersectObject(group, true)[0];
      expect(back?.object.name).toContain("recess-back");
      expect(back?.point.x).toBeLessThan(.18);
      const rim = new THREE.Raycaster(new THREE.Vector3(.3, .295, z + .031), new THREE.Vector3(-1, 0, 0), 0, .1);
      expect(rim.intersectObject(group, true)[0]?.object.name).toContain("aperture-liner");
    }
    const between = new THREE.Raycaster(new THREE.Vector3(.3, .295, 0), new THREE.Vector3(-1, 0, 0), 0, .1);
    expect(between.intersectObject(group, true)[0]?.point.x).toBeCloseTo(.229, 5);
  });

  it("retains the shell's bounds and finite surface normals", () => {
    const mesh = shell(.160, .2425);
    const before = new THREE.Box3().setFromObject(mesh);
    openFrontSensorPorts(mesh,
      [...FRONT_SENSOR_OPENINGS.lidar, ...FRONT_SENSOR_OPENINGS.ultrasonic], new THREE.MeshStandardMaterial());
    const after = new THREE.Box3().setFromObject(mesh);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-7);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-7);
    expect([...mesh.geometry.getAttribute("normal").array].every(Number.isFinite)).toBe(true);
  });
});

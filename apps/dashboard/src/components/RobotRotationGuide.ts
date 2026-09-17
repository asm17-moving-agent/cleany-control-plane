import * as THREE from "three";

/** Project a growing 120-degree ground circle arc into a crisp SVG stroke. */
export function createRobotRotationGuide(bounds: THREE.Box3) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.hypot(size.x, size.z) * .56;
  const point = new THREE.Vector3();
  const segments = 48;

  return (camera: THREE.Camera, yaw: number, amount: number, width: number, height: number) => {
    const points: string[] = [];
    for (let index = 0; index <= segments; index++) {
      // Extend from screen right to left as the camera turns the model left.
      const angle = yaw + Math.PI / 3 - Math.PI * 2 / 3 * amount * index / segments;
      point.set(
        center.x + Math.sin(angle) * radius,
        bounds.min.y + .002,
        center.z + Math.cos(angle) * radius,
      ).project(camera);
      points.push(`${index === 0 ? "M" : "L"}${((point.x + 1) * width / 2).toFixed(2)},${((1 - point.y) * height / 2).toFixed(2)}`);
    }
    function arrowhead(angle: number, direction: number) {
      const radialX = Math.sin(angle), radialZ = Math.cos(angle);
      const tipX = center.x + radialX * radius, tipZ = center.z + radialZ * radius;
      const length = radius * .09, halfWidth = radius * .045;
      const baseX = tipX - radialZ * length * direction;
      const baseZ = tipZ + radialX * length * direction;
      function project(x: number, z: number) {
        point.set(x, bounds.min.y + .002, z).project(camera);
        return `${((point.x + 1) * width / 2).toFixed(2)},${((1 - point.y) * height / 2).toFixed(2)}`;
      }
      // Both wings lie on the same ground plane as the arc, including foreshortening.
      return `M${project(baseX + radialX * halfWidth, baseZ + radialZ * halfWidth)}`
        + `L${project(tipX, tipZ)}`
        + `L${project(baseX - radialX * halfWidth, baseZ - radialZ * halfWidth)}`;
    }
    const start = yaw + Math.PI / 3;
    return {
      arc: points.join(" "),
      startArrow: arrowhead(start, 1),
      endArrow: arrowhead(start - Math.PI * 2 / 3 * amount, -1),
    };
  };
}

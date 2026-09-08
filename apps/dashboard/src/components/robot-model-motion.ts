export type ModelPose = { yaw: number; elevation: number };

const radians = (degrees: number) => degrees * Math.PI / 180;
export const HOME_POSE: Readonly<ModelPose> = {
  yaw: Math.atan2(1.4, 1.2),
  elevation: Math.atan2(.65, Math.hypot(1.4, 1.2)),
};
const MIN_ELEVATION = radians(8);
const MAX_ELEVATION = radians(65);
const clampElevation = (value: number) => Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, value));
const samePose = (a: ModelPose, b: ModelPose) => Math.abs(a.yaw - b.yaw) < .0001
  && Math.abs(a.elevation - b.elevation) < .0001;

/** Camera motion only; the CAD geometry never represents live robot state. */
export class RobotModelMotion {
  readonly pose: ModelPose = { ...HOME_POSE };
  private rest: ModelPose = { ...HOME_POSE };
  private target: ModelPose = { ...HOME_POSE };
  private dragOrigin: ModelPose | null = null;
  private hovered = false;
  private suppressHover = false;
  private reducedMotion = false;

  get dragging() { return this.dragOrigin !== null; }
  get adjusted() { return !samePose(this.rest, HOME_POSE); }
  get animating() { return !samePose(this.pose, this.target); }

  private aim() {
    const hover = this.hovered && !this.suppressHover && !this.reducedMotion;
    this.target = {
      yaw: this.rest.yaw + (hover ? radians(12) : 0),
      elevation: clampElevation(this.rest.elevation + (hover ? radians(2) : 0)),
    };
    if (this.reducedMotion) this.finish();
  }

  setHovered(hovered: boolean) {
    this.hovered = hovered;
    if (!hovered && !this.dragging) this.suppressHover = false;
    if (!this.dragging) this.aim();
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (!this.dragging) this.aim();
  }

  beginDrag() {
    // Begin at the displayed angle, including any partially completed hover.
    this.dragOrigin = { ...this.pose };
    this.target = { ...this.pose };
  }

  dragBy(yaw: number, elevation: number) {
    if (!this.dragOrigin) return;
    this.rest = {
      yaw: this.dragOrigin.yaw + yaw,
      elevation: clampElevation(this.dragOrigin.elevation + elevation),
    };
    this.suppressHover = true;
    this.target = { ...this.rest };
    this.finish();
  }

  endDrag() {
    this.dragOrigin = null;
    if (!this.hovered) this.suppressHover = false;
    this.aim();
  }

  rotateBy(yaw: number, elevation: number) {
    this.rest = { yaw: this.pose.yaw + yaw, elevation: clampElevation(this.pose.elevation + elevation) };
    this.suppressHover = true;
    this.aim();
    this.finish();
  }

  reset() {
    // Take the shortest path home, even after several complete drag rotations.
    this.pose.yaw = HOME_POSE.yaw + Math.atan2(
      Math.sin(this.pose.yaw - HOME_POSE.yaw), Math.cos(this.pose.yaw - HOME_POSE.yaw),
    );
    this.dragOrigin = null;
    this.rest = { ...HOME_POSE };
    this.suppressHover = true;
    this.aim();
  }

  finish() { Object.assign(this.pose, this.target); }

  step(seconds: number) {
    const amount = 1 - Math.exp(-Math.max(0, seconds) / .14);
    this.pose.yaw += (this.target.yaw - this.pose.yaw) * amount;
    this.pose.elevation += (this.target.elevation - this.pose.elevation) * amount;
    if (!this.animating) this.finish();
  }
}

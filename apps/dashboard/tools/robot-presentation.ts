import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createRobotExterior } from "../src/components/RobotExterior";
import { createRobotElectronics } from "../src/components/RobotElectronics";
import { createRobotMecanumWheels } from "../src/components/RobotMecanumWheels";

const stage = document.querySelector<HTMLDivElement>("#stage")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(32, 1, .01, 30);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.minPolarAngle = .2;
controls.maxPolarAngle = Math.PI / 2 - .05;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8e9499, 1.8));
for (const [color, intensity, position] of [
  [0xffffff, 2.6, [3, 5, 2]], [0xe7ebf2, 1.2, [-2, 2, -3]],
] as const) {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(position[0], position[1], position[2]);
  scene.add(light);
}
let loaded = false;
let radius = 1;
const center = new THREE.Vector3();
const fullCenter = new THREE.Vector3();
let fullRadius = 1;
let view: "full" | "detail" | "wheel" = "full";
function render() { if (loaded) renderer.render(scene, camera); }
controls.addEventListener("change", render);
function fit() {
  const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
  const direction = camera.position.clone().sub(center).normalize();
  camera.position.copy(center).addScaledVector(direction, radius / Math.sin(halfFov) * 1.08);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}
function resize() {
  camera.aspect = stage.clientWidth / stage.clientHeight;
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  if (loaded) { fit(); render(); }
}
function reset() {
  view = "full"; center.copy(fullCenter); radius = fullRadius;
  camera.position.copy(center).add(new THREE.Vector3(2.7, 1.6, 3.0));
  controls.target.copy(center);
  fit(); controls.update(); render();
}
function lowerView() {
  view = "detail"; center.set(.025, .215, .010); radius = .335;
  camera.position.copy(center).add(new THREE.Vector3(3.4, 1.5, 4.4));
  controls.target.copy(center); fit(); controls.update(); render();
}
function wheelView() {
  view = "wheel"; center.set(.174975, .063503, .301873); radius = .105;
  camera.position.copy(center).add(new THREE.Vector3(1.8, .8, 3.8));
  controls.target.copy(center); fit(); controls.update(); render();
}
new ResizeObserver(resize).observe(stage);

function savePng(transparent: boolean) {
  if (!loaded) return;
  const position = camera.position.clone();
  const aspect = camera.aspect;
  const pixelRatio = renderer.getPixelRatio();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(2400, 2400, false);
    renderer.setClearColor(0xffffff, transparent ? 0 : 1);
    camera.aspect = 1;
    fit(); render();
    const link = document.createElement("a");
    link.download = `cleany-kb-hardware-${view}-${transparent ? "transparent" : "white"}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  } finally {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(stage.clientWidth, stage.clientHeight);
    renderer.setClearColor(0x000000, 0);
    camera.aspect = aspect;
    camera.position.copy(position);
    camera.updateProjectionMatrix();
    render();
  }
}
document.querySelector("#reset")!.addEventListener("click", reset);
document.querySelector("#lower")!.addEventListener("click", lowerView);
document.querySelector("#wheel")!.addEventListener("click", wheelView);
document.querySelector("#white")!.addEventListener("click", () => savePng(false));
document.querySelector("#transparent")!.addEventListener("click", () => savePng(true));

try {
  const gltf = await new GLTFLoader().loadAsync("/models/cleany-e718ac57-standby.glb");
  // Replace only the pinned source's plain battery proxy in this presentation.
  const batteryProxy = gltf.scene.getObjectByName("chassis_46");
  if (batteryProxy) batteryProxy.visible = false;
  const exterior = createRobotExterior(render, gltf.scene, { transparentLowerBody: true, exposedMast: true });
  const electronics = createRobotElectronics();
  const wheels = createRobotMecanumWheels(gltf.scene);
  scene.add(gltf.scene, exterior.group, electronics, wheels);
  const bounds = new THREE.Box3().setFromObject(gltf.scene, true);
  // Include visible presentation parts only when fitting the frame.
  exterior.group.traverseVisible(part => {
    if (part instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromObject(part, true));
  });
  bounds.getCenter(center);
  radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  fullCenter.copy(center); fullRadius = radius;
  loaded = true;
  resize(); reset();
  document.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = false; });
  status.textContent = "드래그하여 회전 · 스크롤하여 확대 · PNG 2400 × 2400px";
  stage.dataset.ready = "true";
} catch (error) {
  status.textContent = `모델을 불러오지 못했습니다: ${String(error)}`;
  stage.dataset.ready = "error";
}

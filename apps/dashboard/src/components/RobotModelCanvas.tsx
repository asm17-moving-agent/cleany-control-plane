import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createRobotExterior } from "./RobotExterior";

type View = "home" | "front" | "side" | "rear" | "top" | "intake" | "drive" | "arms" | "sensors";
type Commands = { view: (view: View) => void; wire: (enabled: boolean) => void; quality: (high: boolean) => void; exterior: (enabled: boolean) => void };

export default function RobotModelCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const commands = useRef<Commands | null>(null);
  const [status, setStatus] = useState("모델을 불러오는 중…");
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [wire, setWire] = useState(false);
  const [high, setHigh] = useState(false);
  const [view, setView] = useState<View>("home");
  const [exterior, setExterior] = useState(true);
  useEffect(() => {
    const element = host.current!;
    element.dataset.diagnostics = String(import.meta.env.DEV && new URLSearchParams(location.search).has("renderStats"));
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError(true); setStatus("이 환경에서는 3D를 표시할 수 없습니다."); return; }
    let disposed = false, visible = true, frame = 0, rendered = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .01, 30);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    element.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .12;
    controls.minDistance = .65; controls.maxDistance = 6;
    controls.maxPolarAngle = Math.PI * .49;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8e9499, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 5, 2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe7ebf2, 1.2); fill.position.set(-2, 2, -3); scene.add(fill);
    // A fixed soft contact shadow: no shadow-map render pass.
    const shadowCanvas = document.createElement("canvas"); shadowCanvas.width = shadowCanvas.height = 128;
    const context = shadowCanvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, "rgba(24,30,34,.22)"); gradient.addColorStop(1, "rgba(24,30,34,0)");
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.002; scene.add(shadow);
    const center = new THREE.Vector3(0, .55, 0);
    let radius = 1.6;
    let enclosure: ReturnType<typeof createRobotExterior> | undefined;
    function invalidate() {
      if (disposed || frame || !visible || document.hidden) return;
      frame = requestAnimationFrame(() => {
        frame = 0; controls.update(); renderer.render(scene, camera);
        element.dataset.frames = String(++rendered);
        element.dataset.drawCalls = String(renderer.info.render.calls);
        element.dataset.triangles = String(renderer.info.render.triangles);
      });
    }
    function pose(name: View) {
      // Stop a previous drag's inertia before applying an explicit inspection view.
      const damping = controls.enableDamping;
      controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
      const angles: Record<View, [number, number, number]> = { home: [1.4, .65, 1.2], front: [1.9, .05, 0], side: [0, .05, 1.9], rear: [-1.9, .2, 0], top: [.001, 1.9, 0], intake: [-1.4, 1.2, 1.2], drive: [1.9, .25, .6], arms: [1.4, .6, 1.2], sensors: [1.9, .12, .5] };
      const target = name === "intake" ? new THREE.Vector3(-.055, .84, 0) : name === "drive" ? new THREE.Vector3(.13, .068, 0) : name === "arms" ? new THREE.Vector3(.10, .945, 0) : name === "sensors" ? new THREE.Vector3(.215, .345, 0) : center;
      const distance = name === "intake" ? .55 : name === "drive" ? .3 : name === "arms" ? .32 : name === "sensors" ? .36 : 1;
      controls.target.copy(target); camera.position.copy(target).add(new THREE.Vector3(...angles[name]).multiplyScalar(radius * distance)); controls.update(); invalidate();
    }
    function resize() {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); invalidate();
    }
    function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else invalidate(); }
    function lost(event: Event) { event.preventDefault(); cancelAnimationFrame(frame); frame = 0; setError(true); setStatus("그래픽 연결이 끊겼습니다. 다시 불러와 주세요."); }
    renderer.domElement.addEventListener("webglcontextlost", lost);
    controls.addEventListener("change", invalidate);
    const observer = new ResizeObserver(resize); observer.observe(element);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) { cancelAnimationFrame(frame); frame = 0; } else invalidate(); });
    intersection.observe(element);
    document.addEventListener("visibilitychange", visibility);
    commands.current = {
      view: pose,
      exterior: (enabled) => { if (enclosure) enclosure.group.visible = enabled; element.dataset.exterior = String(enabled); invalidate(); },
      quality: (enabled) => { renderer.setPixelRatio(Math.min(devicePixelRatio, enabled ? 1.5 : 1)); resize(); },
      wire: (enabled) => { scene.traverse(object => { if (object instanceof THREE.Mesh && object !== shadow) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => { if ("wireframe" in material) material.wireframe = enabled; }); } }); invalidate(); },
    };
    function disposeModel(model: THREE.Object3D) {
      model.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()); } });
    }
    new GLTFLoader().load("/models/cleany-e718ac57-standby.glb", gltf => {
      if (disposed) { disposeModel(gltf.scene); return; }
      scene.add(gltf.scene);
      enclosure = createRobotExterior(invalidate, gltf.scene);
      scene.add(enclosure.group);
      const box = new THREE.Box3().setFromObject(gltf.scene).union(new THREE.Box3().setFromObject(enclosure.group)); box.getCenter(center);
      radius = box.getSize(new THREE.Vector3()).length() * .85;
      shadow.position.x = center.x; shadow.position.z = center.z;
      pose("home"); resize(); setReady(true); setStatus("조작할 때만 렌더링");
      element.dataset.loaded = "true";
      element.dataset.exterior = "true";
    }, undefined, () => { if (!disposed) { setError(true); setStatus("모델을 불러오지 못했습니다. 다시 시도해 주세요."); } });
    resize();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility); renderer.domElement.removeEventListener("webglcontextlost", lost);
      controls.dispose(); enclosure?.dispose(); disposeModel(scene); shadowTexture.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); commands.current = null;
    };
  }, [retry]);
  return <div className="robot-model-viewer">
    <div className="robot-model-stage" ref={host} aria-label="드래그로 회전 가능한 Cleany 3D 모델" role="img" />
    <div className="robot-model-status" role="status"><i />{status}</div>
    <div className="robot-model-scale">01 / CLEANY<br /><span>{exterior ? "외장 디자인 시안" : "원본 CAD · 대기 자세 예시"}</span></div>
    {error && <button className="robot-model-retry" onClick={() => { setError(false); setWire(false); setHigh(false); setExterior(true); setView("home"); setStatus("모델을 불러오는 중…"); setRetry(retry + 1); }}>다시 불러오기</button>}
    <fieldset className="robot-model-tools" aria-label="3D 보기 설정" disabled={!ready || error}>
      <div>{([["home", "입체"], ["front", "정면"], ["side", "측면"], ["rear", "후면"], ["top", "위에서"], ["intake", "투입구"], ["drive", "구동부"], ["arms", "팔"], ["sensors", "센서"]] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => { commands.current?.view(key); setView(key); }}>{label}</button>)}</div>
      <div><button aria-pressed={exterior} onClick={() => { commands.current?.exterior(!exterior); setExterior(!exterior); }}>외장 시안</button><button aria-pressed={wire} onClick={() => { commands.current?.wire(!wire); setWire(!wire); }}>윤곽</button><button aria-pressed={high} onClick={() => { commands.current?.quality(!high); setHigh(!high); }}>{high ? "고화질" : "절전"}</button></div>
    </fieldset>
    <p className="robot-model-hint">드래그하여 회전 · 스크롤하여 확대 · 오른쪽 드래그로 이동</p>
  </div>;
}

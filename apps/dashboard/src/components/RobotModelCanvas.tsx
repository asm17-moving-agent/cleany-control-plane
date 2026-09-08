import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RobotModelMotion, ROTATION_GUIDE } from "./robot-model-motion";
import { createRobotExterior } from "./RobotExterior";
import { createRobotRotationGuide } from "./RobotRotationGuide";

function disposeModel(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

export default function RobotModelCanvas({ onReady, onError, hoverEnabled = true, rotationGuide = false }: {
  onReady: () => void; onError: () => void; hoverEnabled?: boolean; rotationGuide?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const guide = useRef<SVGSVGElement>(null);
  const guidePath = useRef<SVGPathElement>(null);
  const reset = useRef<(() => void) | null>(null);
  const instructions = useId();
  const arrowhead = useId();
  const [adjusted, setAdjusted] = useState(false);

  useEffect(() => {
    const element = host.current!;
    const diagnostics = import.meta.env.DEV && new URLSearchParams(location.search).has("renderStats");
    element.dataset.diagnostics = String(diagnostics);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { onError(); return; }

    let disposed = false, failed = false, visible = false, loaded = false, notified = false;
    let frame = 0, rendered = 0, lastFrame: number | undefined;
    let guideTimer: number | undefined;
    let guideDismissed = false, guideHasPlayed = false;
    let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
    let radius = 1, distance = 4;
    let canvasWidth = 1, canvasHeight = 1;
    let enclosure: ReturnType<typeof createRobotExterior> | undefined;
    let orbitGuide: ReturnType<typeof createRobotRotationGuide> | undefined;
    const motion = new RobotModelMotion();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    motion.setReducedMotion(reduced.matches);
    const scene = new THREE.Scene();
    const center = new THREE.Vector3();
    const camera = new THREE.PerspectiveCamera(32, 1, .01, 30);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.append(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8e9499, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(3, 5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe7ebf2, 1.2);
    fill.position.set(-2, 2, -3);
    scene.add(fill);

    // A fixed contact shadow has no continuously rendered shadow-map pass.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const context = shadowCanvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64);
      gradient.addColorStop(0, "rgba(24,30,34,.22)");
      gradient.addColorStop(1, "rgba(24,30,34,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);

    function scheduleGuide() {
      window.clearTimeout(guideTimer);
      guideTimer = undefined;
      if (!rotationGuide || guideDismissed || disposed || failed || !loaded || !visible
        || document.hidden || reduced.matches || motion.guiding) return;
      guideTimer = window.setTimeout(() => {
        guideTimer = undefined;
        if (!document.hasFocus() || element.matches(":hover") || element.contains(document.activeElement)) return;
        if (motion.startGuide()) {
          guideHasPlayed = true;
          invalidate();
        } else scheduleGuide();
      }, guideHasPlayed ? ROTATION_GUIDE.repeatDelayMs : ROTATION_GUIDE.firstDelayMs);
    }

    function stopGuide(dismiss = false) {
      window.clearTimeout(guideTimer);
      guideTimer = undefined;
      if (dismiss) guideDismissed = true;
      motion.cancelGuide();
      element.dataset.guideDirection = "none";
      if (guide.current) guide.current.style.opacity = "0";
    }

    function invalidate() {
      if (disposed || failed || frame || !loaded || !visible || document.hidden) return;
      frame = requestAnimationFrame(time => {
        frame = 0;
        // Exponential easing stays stable across long frames. Capping elapsed time
        // would stretch a short hover into seconds on a throttled native window.
        const wasGuiding = motion.guiding;
        motion.step(lastFrame === undefined ? 1 / 60 : (time - lastFrame) / 1000);
        element.dataset.guideDirection = motion.guideDirection ?? "none";
        if (wasGuiding && !motion.guiding) scheduleGuide();
        lastFrame = time;
        const { yaw, elevation } = motion.pose;
        camera.position.set(
          Math.sin(yaw) * Math.cos(elevation) * distance,
          Math.sin(elevation) * distance,
          Math.cos(yaw) * Math.cos(elevation) * distance,
        ).add(center);
        camera.lookAt(center);
        renderer.render(scene, camera);
        if (orbitGuide && guide.current && guidePath.current) {
          const amount = motion.guideAmount;
          // Hide very short arcs so the opposing arrowheads never overlap.
          guide.current.style.opacity = String(Math.min(1, Math.max(0, (amount - .1) / .15)));
          if (motion.guiding) guidePath.current.setAttribute("d", orbitGuide(camera, yaw, amount, canvasWidth, canvasHeight));
          if (diagnostics) element.dataset.guideAmount = String(amount);
        }
        if (diagnostics) {
          element.dataset.frames = String(++rendered);
          element.dataset.drawCalls = String(renderer.info.render.calls);
          element.dataset.triangles = String(renderer.info.render.triangles);
          element.dataset.yaw = String(yaw);
          element.dataset.elevation = String(elevation);
          element.dataset.animating = String(motion.animating);
        }
        if (!notified) { notified = true; onReady(); }
        if (motion.animating) invalidate();
        else lastFrame = undefined;
      });
    }

    function resize() {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      canvasWidth = width;
      canvasHeight = height;
      guide.current?.setAttribute("viewBox", `0 0 ${width} ${height}`);
      camera.aspect = width / height;
      // Fit the CAD and concept layers inside the card throughout a turn.
      const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
      distance = radius / Math.sin(halfFov) * 1.02;
      camera.far = distance + radius * 4;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      invalidate();
    }

    function endPointer(hovered: boolean) {
      if (!drag) return;
      const id = drag.id;
      drag = null;
      element.dataset.dragging = "false";
      motion.setHovered(hoverEnabled && hovered);
      motion.endDrag();
      if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      invalidate();
    }

    function pause() {
      stopGuide();
      endPointer(false);
      motion.setHovered(false);
      motion.finish();
      if (diagnostics) element.dataset.animating = "false";
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = undefined;
    }

    function pointerEnter(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      stopGuide();
      if (hoverEnabled) motion.setHovered(true);
      invalidate();
    }
    function pointerLeave() {
      if (hoverEnabled) motion.setHovered(false);
      scheduleGuide();
      invalidate();
    }
    function pointerDown(event: PointerEvent) {
      if (!loaded || event.button !== 0 || event.pointerType === "touch" || drag) return;
      event.preventDefault();
      stopGuide(true);
      element.focus({ preventScroll: true });
      element.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      motion.beginDrag();
    }
    function pointerMove(event: PointerEvent) {
      if (!drag || drag.id !== event.pointerId) return;
      const x = event.clientX - drag.x, y = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(x, y) < 3) return;
      drag.moved = true;
      element.dataset.dragging = "true";
      const { width, height } = element.getBoundingClientRect();
      motion.dragBy(-x / Math.max(width, 1) * Math.PI * 1.5, y / Math.max(height, 1) * Math.PI);
      setAdjusted(motion.adjusted);
      invalidate();
    }
    function pointerUp(event: PointerEvent) {
      if (drag?.id !== event.pointerId) return;
      const rect = element.getBoundingClientRect();
      endPointer(event.pointerType === "mouse" && event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom);
    }
    function pointerCancel(event: PointerEvent) {
      if (drag?.id === event.pointerId) endPointer(false);
    }
    function resetView() {
      stopGuide(true);
      endPointer(false);
      motion.reset();
      setAdjusted(false);
      invalidate();
      element.focus({ preventScroll: true });
    }
    function keyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const turns: Record<string, [number, number]> = {
        ArrowLeft: [Math.PI / 12, 0], ArrowRight: [-Math.PI / 12, 0],
        ArrowUp: [0, Math.PI / 24], ArrowDown: [0, -Math.PI / 24],
      };
      if (event.key === "Home") { event.preventDefault(); resetView(); return; }
      if (!turns[event.key]) return;
      event.preventDefault();
      stopGuide(true);
      endPointer(false);
      motion.rotateBy(...turns[event.key]);
      setAdjusted(motion.adjusted);
      invalidate();
    }
    function preferenceChanged() { stopGuide(); motion.setReducedMotion(reduced.matches); scheduleGuide(); invalidate(); }
    function resume() { scheduleGuide(); invalidate(); }
    function focusIn() { stopGuide(); invalidate(); }
    function visibilityChanged() { if (document.hidden) pause(); else resume(); }
    function blur() { pause(); invalidate(); }
    function fail() { failed = true; pause(); onError(); }
    function contextLost(event: Event) { event.preventDefault(); fail(); }

    element.addEventListener("pointerenter", pointerEnter);
    element.addEventListener("pointerleave", pointerLeave);
    element.addEventListener("pointerdown", pointerDown);
    element.addEventListener("pointermove", pointerMove);
    element.addEventListener("pointerup", pointerUp);
    element.addEventListener("pointercancel", pointerCancel);
    element.addEventListener("lostpointercapture", pointerCancel);
    element.addEventListener("keydown", keyDown);
    element.addEventListener("focusin", focusIn);
    element.addEventListener("focusout", scheduleGuide);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", resume);
    reduced.addEventListener("change", preferenceChanged);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resume(); else pause();
    });
    intersection.observe(element);
    reset.current = resetView;

    new GLTFLoader().load("/models/cleany-e718ac57-standby.glb", gltf => {
      if (disposed || failed) { disposeModel(gltf.scene); return; }
      scene.add(gltf.scene);
      enclosure = createRobotExterior(invalidate, gltf.scene);
      scene.add(enclosure.group);
      const box = new THREE.Box3().setFromObject(gltf.scene, true)
        .union(new THREE.Box3().setFromObject(enclosure.group, true));
      box.getCenter(center);
      radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      if (rotationGuide) {
        orbitGuide = createRobotRotationGuide(box);
        element.dataset.guideGeometry = "ground-arc";
      }
      shadow.position.set(center.x, box.min.y - .004, center.z);
      loaded = true;
      element.dataset.loaded = "true";
      if (diagnostics) {
        element.dataset.model = "standby";
        element.dataset.exterior = "true";
      }
      motion.setHovered(hoverEnabled && element.matches(":hover"));
      resize();
      scheduleGuide();
    }, undefined, () => { if (!disposed) fail(); });
    resize();

    return () => {
      disposed = true;
      pause();
      resizeObserver.disconnect();
      intersection.disconnect();
      reduced.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", resume);
      element.removeEventListener("pointerenter", pointerEnter);
      element.removeEventListener("pointerleave", pointerLeave);
      element.removeEventListener("pointerdown", pointerDown);
      element.removeEventListener("pointermove", pointerMove);
      element.removeEventListener("pointerup", pointerUp);
      element.removeEventListener("pointercancel", pointerCancel);
      element.removeEventListener("lostpointercapture", pointerCancel);
      element.removeEventListener("keydown", keyDown);
      element.removeEventListener("focusin", focusIn);
      element.removeEventListener("focusout", scheduleGuide);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      enclosure?.stopLoading();
      disposeModel(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      reset.current = null;
    };
  }, [onReady, onError, hoverEnabled, rotationGuide]);

  return <>
    <div className="robot-model-canvas" ref={host} tabIndex={0} role="group"
      aria-label="Cleany 모델 회전" aria-describedby={instructions} />
    {rotationGuide && <svg ref={guide} className="robot-model-rotation-guide" aria-hidden="true">
      <defs>
        <marker id={arrowhead} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5"
          orient="auto-start-reverse" markerUnits="strokeWidth">
          <path d="M3 1L7 5L3 9" />
        </marker>
      </defs>
      <path ref={guidePath} markerStart={`url(#${arrowhead})`} markerEnd={`url(#${arrowhead})`} />
    </svg>}
    <span id={instructions} className="sr-only">마우스로 드래그하거나 방향키로 회전합니다. Home 키로 처음 각도로 돌아갑니다.</span>
    <button className="robot-model-reset" type="button" disabled={!adjusted}
      onClick={() => reset.current?.()} aria-label="모델을 처음 각도로 되돌리기">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7a7 7 0 1 1-1 6M4 2v5h5" /></svg>
    </button>
  </>;
}

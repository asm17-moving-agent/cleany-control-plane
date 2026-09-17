import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./robot-model.css";

class ModelBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function RobotModel({ compact = false, hoverEnabled = true, rotationGuide = false }: {
  compact?: boolean; hoverEnabled?: boolean; rotationGuide?: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"poster" | "loading" | "ready" | "error">("poster");
  const RobotModelCanvas = useMemo(() => lazy(() => import("./RobotModelCanvas")), [attempt]);
  const onReady = useCallback(() => setStatus("ready"), []);
  const onError = useCallback(() => setStatus("error"), []);

  useEffect(() => {
    if (!window.matchMedia) return;
    const pointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    const update = () => setInteractive(pointer.matches);
    update();
    pointer.addEventListener("change", update);
    return () => pointer.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!window.IntersectionObserver) { setEntered(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setEntered(true); observer.disconnect(); }
    }, { rootMargin: "120px" });
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setStatus(interactive && entered ? "loading" : "poster");
  }, [interactive, entered, attempt]);

  return <figure ref={container} className={"robot-model-card" + (compact ? " robot-model-inline" : "")}
    aria-label="Cleany 외형 미리보기" title={compact ? "대기 자세·외장 시안 · 실시간 자세 미연동" : undefined} data-state={status}>
    <div className="robot-model-stage">
      <img className="robot-model-poster" src="/models/cleany-exterior-poster.png" width="360" height="360"
        alt={status === "ready" ? "" : "Cleany 대기 자세와 외장 시안"} aria-hidden={status === "ready"} loading="lazy" />
      {interactive && entered && status !== "error" && <ModelBoundary key={attempt} onError={onError}>
        <Suspense fallback={null}><RobotModelCanvas onReady={onReady} onError={onError}
          hoverEnabled={hoverEnabled} rotationGuide={rotationGuide && !compact} /></Suspense>
      </ModelBoundary>}
    </div>
    <figcaption className="robot-model-caption">
      <span className={"robot-model-hint" + (!compact && status !== "ready" ? " sr-only" : "")} role="status">
        {status === "ready" ? "드래그하여 회전" : status === "loading" ? "모델 준비 중…" : "외형 미리보기"}
      </span>
      {status === "error" ? <button className="robot-model-retry" type="button" aria-label="3D 다시 시도" onClick={() => setAttempt(attempt + 1)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7a7 7 0 1 1-1 6M4 2v5h5" /></svg>
      </button> : <span className="sr-only">실시간 자세 미연동</span>}
    </figcaption>
  </figure>;
}

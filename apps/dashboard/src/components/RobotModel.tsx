import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./robot-model.css";

class ModelBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function RobotModel({ compact = false }: { compact?: boolean }) {
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
    aria-label="Cleany 외형 미리보기" title={compact ? "로봇 외형 · 실제 로봇 자세와 연동되지 않습니다" : undefined} data-state={status}>
    <div className="robot-model-stage">
      {!compact && <span className="robot-model-label" aria-hidden="true">CLEANY</span>}
      <img className="robot-model-poster" src="/models/cleany-poster.webp" width="360" height="360"
        alt={status === "ready" ? "" : "Cleany 로봇 외형"} aria-hidden={status === "ready"} loading="lazy" />
      {interactive && entered && status !== "error" && <ModelBoundary key={attempt} onError={onError}>
        <Suspense fallback={null}><RobotModelCanvas onReady={onReady} onError={onError} /></Suspense>
      </ModelBoundary>}
    </div>
    <figcaption className="robot-model-caption">
      <span className="robot-model-hint" role="status">
        {status === "ready" ? "드래그하여 회전" : status === "loading" ? "모델 준비 중…" : "외형 미리보기"}
      </span>
      {status === "error" ? <button className="robot-model-retry" type="button" onClick={() => setAttempt(attempt + 1)}>3D 다시 시도</button>
        : <span className={compact ? "sr-only" : undefined}>실시간 자세 미연동</span>}
    </figcaption>
  </figure>;
}

import { lazy, Suspense, useState } from "react";
import { Link } from "react-router";
import "./robot-model.css";

const RobotModelCanvas = lazy(() => import("./RobotModelCanvas"));

export function RobotModel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <section className="robot-model-card" aria-label="로봇 3D 모델">
    <header className="robot-model-heading"><div><span className="robot-model-eyebrow">CLEANY / MODEL EXPLORER</span><h3>로봇을 더 가까이</h3></div><span className="robot-model-static">정적 모델</span></header>
    {open ? <><Suspense fallback={<div className="robot-model-placeholder" role="status">3D 뷰어 준비 중…</div>}><RobotModelCanvas /></Suspense><button className="robot-model-close" onClick={() => setOpen(false)}>3D 닫기 · 그래픽 리소스 해제</button></>
      : <button className="robot-model-poster" onClick={() => setOpen(true)}><img src="/models/cleany-poster.webp" width="140" height="140" alt="Cleany CAD 모델" loading="lazy" /><span><strong>3D 모델 살펴보기 <span aria-hidden="true">↗</span></strong><small>필요할 때만 불러오는 가벼운 미리보기</small></span></button>}
    <footer className="robot-model-caption"><span>CAD e718ac57 · 웹 표시용 경량 모델</span><span>관절 자세·센서 상태 실시간 미연동</span>{!initiallyOpen && <Link to="/robot-model">넓은 화면에서 보기 ↗</Link>}</footer>
  </section>;
}

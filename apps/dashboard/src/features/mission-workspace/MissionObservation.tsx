import { useState } from "react";
import { ChevronIcon, EyeIcon } from "../../components/WorkspaceIcons";
import { observationHref } from "../../lib/home-summary";
import { useDemoMode } from "../../operations/DemoModeContext";
export function MissionObservation({ label, reference }: { label: string; reference: string | null }) {
  const { isDemo } = useDemoMode();
  const href = observationHref(reference);
  const [failed, setFailed] = useState(false);
  const image = href && (href.includes("/observations/") || /\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(href));
  return <section className="result-observation" aria-label={label}>
    <header><h4>{label}</h4>{href && <a href={href} target="_blank" rel="noreferrer">원본 열기 <ChevronIcon /></a>}</header>
    {image && !failed ? <a className="result-observation-image" href={href} target="_blank" rel="noreferrer"><img src={href} alt={`${label} ${isDemo ? "AI 생성 예시" : "관측"} 사진`} onError={() => setFailed(true)} />{isDemo && <span className="result-photo-label">AI 생성 · 예시</span>}</a>
      : <div className="result-observation-empty"><EyeIcon aria-hidden="true" /><strong>{failed ? "미리보기 오류" : href ? "원본 자료" : "자료 없음"}</strong></div>}
    {!href && reference && <details className="result-reference"><summary>자료 참조 확인</summary><code>{reference}</code></details>}
  </section>;
}


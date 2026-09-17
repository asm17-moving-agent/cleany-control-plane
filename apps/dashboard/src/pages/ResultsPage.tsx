import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckIcon, ChevronIcon, EyeIcon } from "../components/WorkspaceIcons";
import { InfoRow } from "../components/InfoRow";
import { MissionStatusBadge, OperationsEmpty, OperationsPage, OperationsTabs } from "../components/OperationsPage";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { byNewestRequest, isSuccessfulResult, needsResultReview, observationHref } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { useDemoMode } from "../operations/DemoModeContext";
import "./results-page.css";

function Observation({ label, reference }: { label: string; reference: string | null }) {
  const { isDemo } = useDemoMode();
  const href = observationHref(reference);
  const [failed, setFailed] = useState(false);
  const image = href && /\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(href);
  return <section className="result-observation" aria-label={label}>
    <header><h4>{label}</h4>{href && <a href={href} target="_blank" rel="noreferrer">원본 열기 <ChevronIcon /></a>}</header>
    {image && !failed ? <a className="result-observation-image" href={href} target="_blank" rel="noreferrer"><img src={href} alt={`${label} ${isDemo ? "AI 생성 예시" : "관측"} 사진`} onError={() => setFailed(true)} />{isDemo && <span className="result-photo-label">AI 생성 · 예시</span>}</a>
      : <div className="result-observation-empty"><EyeIcon aria-hidden="true" /><strong>{failed ? "미리보기를 불러오지 못했습니다" : href ? "관측 자료가 연결되어 있습니다" : "연결된 관측 자료가 없습니다"}</strong><span>{href ? "원본 열기에서 자료를 확인하세요." : "관측 자료가 연결되면 여기에 표시됩니다."}</span></div>}
    {!href && reference && <details className="result-reference"><summary>자료 참조 확인</summary><code>{reference}</code></details>}
  </section>;
}

export function ResultsPage() {
  const { missions, seats, isLoading, error, refresh } = useOperations();
  const [params] = useSearchParams();
  const filter = ["review", "success"].includes(params.get("filter") ?? "") ? params.get("filter")! : "all";
  const selectedId = params.get("mission");
  const terminal = byNewestRequest(missions.filter(mission => mission.phase === "TERMINAL"));
  const matches = (value: string, mission: typeof missions[number]) => value === "review" ? needsResultReview(mission) : value === "success" ? isSuccessfulResult(mission) : true;
  const filtered = terminal.filter(mission => matches(filter, mission));
  const selected = selectedId ? filtered.find(mission => mission.mission_id === selectedId) : filtered[0];
  const href = (id: string) => "/results?" + new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), mission: id });
  return <OperationsPage className="results-view" title="작업 결과" description="종료된 작업의 결과와 작업 전·후 관측 자료를 확인하세요."
    action={<Link className="ops-button" to="/missions">작업 요청 보기 <ChevronIcon /></Link>}>
    <div className="ops-toolbar"><OperationsTabs label="결과 필터" tabs={([ ["all", "전체 결과"], ["review", "검토 대상"], ["success", "완료"] ] as const).map(([id, label]) => ({ label, href: id === "all" ? "/results" : "/results?filter=" + id, active: id === filter, attention: id === "review", count: isLoading || error ? "—" : terminal.filter(mission => matches(id, mission)).length }))} /><button className="ops-button" onClick={() => void refresh()} disabled={isLoading}>새로고침</button></div>
    <div className="ops-body" aria-busy={isLoading}>
      {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"}>{error ? "작업 결과를 불러오지 못했습니다. 새로고침해 주세요." : "작업 결과를 불러오는 중입니다."}</WorkspaceMessage> : <div className="ops-layout results-layout">
        <section className="ops-panel" aria-label="작업 결과 목록"><header className="ops-panel-heading"><h3>결과 목록 <span>{filtered.length}건</span></h3><small>요청 시각 최신순</small></header>
          {filtered.length ? <div className="ops-list">{filtered.map(mission => <Link className="ops-row result-row" to={href(mission.mission_id)} key={mission.mission_id} aria-current={selected?.mission_id === mission.mission_id ? "true" : undefined}>
            <span className={"result-state-icon" + (needsResultReview(mission) ? " needs-review" : "")} aria-hidden="true">{isSuccessfulResult(mission) ? <CheckIcon /> : <EyeIcon />}</span>
            <span><strong>{missionTargetLabel(mission, seats)}</strong><small>{formatDateTime(mission.created_at)}</small><MissionStatusBadge mission={mission} /></span><ChevronIcon aria-hidden="true" />
          </Link>)}</div> : <OperationsEmpty icon={<CheckIcon />} title="표시할 작업 결과가 없습니다">작업이 종료되면 최종 결과를 확인할 수 있습니다.</OperationsEmpty>}
        </section>
        <section className="ops-panel ops-detail result-detail" aria-label="작업 결과 상세">
          <header className="ops-panel-heading"><h3>결과 상세</h3><EyeIcon aria-hidden="true" /></header>
          {selected ? <div key={selected.mission_id} className="ops-detail-content">
            <div className="result-detail-heading"><div className="ops-detail-title"><MissionStatusBadge mission={selected} /><h3>{missionTargetLabel(selected, seats)}</h3><p>책상 위 물체 정리 · 요청 {formatDateTime(selected.created_at)}</p></div><Link className="ops-button" to={"/missions?mission=" + encodeURIComponent(selected.mission_id)}>요청 상세 <ChevronIcon /></Link></div>
            {needsResultReview(selected) && <div className="ops-notice"><strong>확인이 필요한 결과입니다.</strong><br />작업 전·후 자료와 종료 상태를 확인해 주세요. 결과를 열어도 검토 대상에서 제외되지 않습니다.</div>}
            <div className="result-observations"><Observation key={"before:" + selected.before_observation} label="작업 전" reference={selected.before_observation} /><Observation key={"after:" + selected.after_observation} label="작업 후" reference={selected.after_observation} /></div>
            <dl className="ops-facts result-facts"><InfoRow label="요청자">{selected.requested_by}</InfoRow><InfoRow label="우선순위">{selected.priority === "HIGH" ? "높음" : "보통"}</InfoRow><InfoRow label="요청 ID"><code>{selected.mission_id}</code></InfoRow></dl>
            {selected.message && <details className="result-reference"><summary>종료 메시지 확인</summary><p>{selected.message}</p></details>}
          </div> : <OperationsEmpty icon={<EyeIcon />} title={selectedId ? "선택한 결과를 찾을 수 없습니다" : "작업 전·후를 한눈에 비교하세요"}>왼쪽 목록에서 결과를 선택하면 관측 자료와 종료 상태를 확인할 수 있습니다.</OperationsEmpty>}
        </section>
      </div>}
    </div>
  </OperationsPage>;
}

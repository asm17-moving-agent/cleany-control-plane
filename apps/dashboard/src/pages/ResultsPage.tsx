import { Link, useSearchParams } from "react-router";
import type { Mission } from "../api/types";
import { ChevronIcon } from "../components/WorkspaceIcons";
import { byNewestRequest, isSuccessfulResult, needsResultReview, observationHref, outcomeLabels } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";

function Observation({ label, reference }: { label: string; reference: string | null }) {
  const href = observationHref(reference);
  return <div><span>{label}</span>{href
    ? <a href={href} target="_blank" rel="noreferrer">관측 자료 열기 <ChevronIcon /></a>
    : <><p>연결된 관측 자료가 없습니다.</p>{reference && <details className="observation-reference"><summary>자료 참조</summary><code>{reference}</code></details>}</>}
  </div>;
}
export function ResultsPage() {
  const { missions, seats, isLoading, error } = useOperations();
  const [params] = useSearchParams();
  const requestedFilter = params.get("filter");
  const filter = requestedFilter === "review" || requestedFilter === "success" ? requestedFilter : "all";
  const selectedId = params.get("mission");
  const terminal = byNewestRequest(missions.filter((mission) => mission.phase === "TERMINAL"));
  const predicates: Record<string, (mission: Mission) => boolean> = { all: () => true, review: needsResultReview, success: isSuccessfulResult };
  const filtered = terminal.filter((mission) => predicates[filter](mission) && (!selectedId || selectedId === mission.mission_id));
  return <section className="section-view results-view">
    <header className="workspace-page-heading"><div><h2>작업 결과</h2><p>종료된 작업과 작업 전·후 관측 자료를 확인합니다.</p></div><Link to="/">홈으로 <ChevronIcon /></Link></header>
    <nav className="workspace-filter-tabs" aria-label="결과 필터">
      {([{ id: "all", label: "전체 결과", href: "/results" }, { id: "review", label: "검토 대상", href: "/results?filter=review" }, { id: "success", label: "완료", href: "/results?filter=success" }]).map((tab) =>
        <Link key={tab.id} to={tab.href} aria-current={filter === tab.id ? "page" : undefined}>{tab.label}<b>{isLoading || error ? "—" : terminal.filter(predicates[tab.id]).length}</b></Link>)}
    </nav>
    {selectedId && <p className="workspace-list-note">선택한 작업의 결과입니다. <Link to="/results">전체 결과 보기</Link></p>}
    {filter === "review" && <p className="workspace-list-note">검토 대상은 작업 결과에 따라 표시됩니다. 결과를 열어도 검토 대상에서 제외되지 않습니다.</p>}
    <div className="workspace-result-list" aria-busy={isLoading}>
      {isLoading ? <p className="workspace-empty">작업 결과를 불러오는 중입니다.</p> : !filtered.length
        ? <p className="workspace-empty">{error ? "작업 결과를 가져오지 못했습니다." : selectedId ? "종료된 작업 결과를 찾을 수 없습니다." : "조건에 맞는 작업 결과가 없습니다."}</p>
        : filtered.map((mission) => <article className="workspace-result-card" key={mission.mission_id}>
          <header><div><h3>{missionTargetLabel(mission, seats)}</h3><small>요청 시각 {formatDateTime(mission.created_at)} · {mission.mission_id.slice(0, 8)}</small></div>
            <span className="workspace-state" data-tone={needsResultReview(mission) ? "review" : isSuccessfulResult(mission) ? "success" : "neutral"}>{mission.outcome ? outcomeLabels[mission.outcome] : "종료"}</span></header>
          <div className="workspace-observations"><Observation label="작업 전" reference={mission.before_observation} /><Observation label="작업 후" reference={mission.after_observation} /></div>
          {mission.message && <p className="workspace-result-message">{mission.message}</p>}
        </article>)}
    </div>
    <p className="workspace-list-note">요청 시각이 최신인 순서로 표시합니다.</p>
  </section>;
}

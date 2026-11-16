import { Details } from "../components/patterns";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckIcon, ChevronIcon, EyeIcon } from "../components/WorkspaceIcons";
import { InfoRow } from "../components/InfoRow";
import { MissionStatusBadge, OperationsEmpty, OperationsPage, OperationsTabs } from "../components/OperationsPage";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { byNewestRequest, isSuccessfulResult, needsResultReview, observationHref } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel, missionMessage } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { useDemoMode } from "../operations/DemoModeContext";
import { executionSource, missionElapsed } from "../lib/execution-source";
import "./results-page.css";

function Observation({ label, reference }: { label: string; reference: string | null }) {
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

/** Present terminal results and observation references; viewing a result does not mark it reviewed. */
export function ResultsPage() {
  const { isDemo } = useDemoMode();
  const { missions, seats, isLoading, error, refresh } = useOperations();
  const [params] = useSearchParams();
  const filter = ["review", "success"].includes(params.get("filter") ?? "") ? params.get("filter")! : "all";
  const selectedId = params.get("mission");
  const terminal = byNewestRequest(missions.filter(mission => mission.phase === "TERMINAL"));
  const matches = (value: string, mission: typeof missions[number]) => value === "review" ? needsResultReview(mission) : value === "success" ? isSuccessfulResult(mission) : true;
  const filtered = terminal.filter(mission => matches(filter, mission));
  const selected = selectedId ? filtered.find(mission => mission.mission_id === selectedId) : filtered[0];
  const href = (id: string) => "/results?" + new URLSearchParams({ ...(filter !== "all" ? { filter } : {}), mission: id });
  return <OperationsPage className="results-view" title="작업 결과"
    action={<Button asChild variant="secondary"><Link className="ops-button" to="/missions">작업 요청 보기 <ChevronIcon /></Link></Button>}>
    <div className="ops-toolbar"><OperationsTabs label="결과 필터" tabs={([ ["all", "전체 결과"], ["review", "검토 대상"], ["success", "완료"] ] as const).map(([id, label]) => ({ label, href: id === "all" ? "/results" : "/results?filter=" + id, active: id === filter, attention: id === "review", count: isLoading || error ? "—" : terminal.filter(mission => matches(id, mission)).length }))} /><Button variant="secondary" size="default" className="ops-button" onClick={() => void refresh()} disabled={isLoading}>새로고침</Button></div>
    <div className="ops-body" aria-busy={isLoading}>
      {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"} onRetry={() => void refresh()}>{error ? "작업 결과를 불러올 수 없음" : "작업 결과 불러오는 중"}</WorkspaceMessage> : <div className="ops-layout results-layout">
        <section className="ops-panel" aria-label="작업 결과 목록"><header className="ops-panel-heading"><h3>결과 목록 <span>{filtered.length}건</span></h3><small>요청 시각 최신순</small></header>
          {filtered.length ? <div className="ops-list">{filtered.map(mission => <Link className="ops-row result-row" to={href(mission.mission_id)} key={mission.mission_id} aria-current={selected?.mission_id === mission.mission_id ? "true" : undefined}>
            <span className={"result-state-icon" + (needsResultReview(mission) ? " needs-review" : "")} aria-hidden="true">{isSuccessfulResult(mission) ? <CheckIcon /> : <EyeIcon />}</span>
            <span><strong>{missionTargetLabel(mission, seats)}</strong><small>{formatDateTime(mission.created_at)}</small><MissionStatusBadge mission={mission} /></span><ChevronIcon aria-hidden="true" />
          </Link>)}</div> : <OperationsEmpty icon={<CheckIcon />} title={terminal.length ? "조건에 맞는 결과 없음" : "작업 결과 없음"}>{terminal.length ? <Link to="/results">전체 결과</Link> : undefined}</OperationsEmpty>}
        </section>
        <section className="ops-panel ops-detail result-detail" aria-label="작업 결과 상세">
          <header className="ops-panel-heading"><h3>결과 상세</h3><EyeIcon aria-hidden="true" /></header>
          {selected ? <div key={selected.mission_id} className="ops-detail-content">
            <div className="result-detail-heading"><div className="ops-detail-title"><MissionStatusBadge mission={selected} /><h3>{missionTargetLabel(selected, seats)}</h3><p>요청 {formatDateTime(selected.created_at)}</p></div><Button asChild variant="secondary"><Link className="ops-button" to={"/missions?mission=" + encodeURIComponent(selected.mission_id)}>요청 상세 <ChevronIcon /></Link></Button></div>
            {needsResultReview(selected) && <div className="ops-notice">검토 필요 · 열람 후에도 검토 대상으로 유지</div>}
            <div className="result-observations"><Observation key={"before:" + selected.before_observation} label="작업 전" reference={selected.before_observation} /><Observation key={"after:" + selected.after_observation} label="작업 후" reference={selected.after_observation} /></div>
            {!isDemo && <dl className="ops-facts result-facts">
              <InfoRow label="실행 모드">{executionSource(selected.execution_profile)}</InfoRow>
              {selected.failure_code && <InfoRow label="실패 이유">{selected.failure_code}</InfoRow>}
              {!!selected.completed_tasks?.length && <InfoRow label="완료 작업">{selected.completed_tasks.join(", ")}</InfoRow>}
              {!!selected.skipped_tasks?.length && <InfoRow label="미처리 작업">{selected.skipped_tasks.join(", ")}</InfoRow>}
              {selected.failed_task && <InfoRow label="실패 작업">{selected.failed_task}</InfoRow>}
              {selected.needs_human_review && <InfoRow label="확인 필요">사람 확인 필요</InfoRow>}
            </dl>}
            <Details label="상세 정보"><dl className="ops-facts">
              <InfoRow label="요청자">{selected.requested_by}</InfoRow><InfoRow label="우선순위">{selected.priority === "HIGH" ? "높음" : "보통"}</InfoRow><InfoRow label="요청 ID"><code>{selected.mission_id}</code></InfoRow>
              {!isDemo && <><InfoRow label="요청부터 결과 수신">{missionElapsed(selected.created_at, selected.finished_at)}</InfoRow><InfoRow label="수락 / 종료">{formatDateTime(selected.accepted_at)} / {formatDateTime(selected.finished_at)}</InfoRow></>}
            </dl>{selected.message && <p>{missionMessage(selected.message)}</p>}</Details>
          </div> : <OperationsEmpty icon={<EyeIcon />} title={selectedId ? "선택한 결과 없음" : "결과 선택"} />}
        </section>
      </div>}
    </div>
  </OperationsPage>;
}

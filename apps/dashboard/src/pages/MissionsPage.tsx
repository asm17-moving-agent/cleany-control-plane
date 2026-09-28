import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { MissionIcon } from "../components/Icons";
import { ChevronIcon } from "../components/WorkspaceIcons";
import { InfoRow } from "../components/InfoRow";
import { MissionProgress } from "../components/MissionProgress";
import { MissionStatusBadge, OperationsEmpty, OperationsPage, OperationsTabs } from "../components/OperationsPage";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { byNewestRequest } from "../lib/home-summary";
import { formatDateTime, missionTargetLabel, missionMessage } from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { useDemoMode } from "../operations/DemoModeContext";
import "./missions-page.css";

type PhaseFilter = "ALL" | "ACTIVE" | "QUEUED" | "TERMINAL";
export function MissionsPage() {
  const { missions, robots, seats, cancelMission, refresh, isLoading, error } = useOperations();
  const { isDemo } = useDemoMode();
  const [params, setParams] = useSearchParams();
  const phase = (["ACTIVE", "QUEUED", "TERMINAL"].includes(params.get("phase") ?? "") ? params.get("phase") : "ALL") as PhaseFilter;
  const priority = ["HIGH", "NORMAL"].includes(params.get("priority") ?? "") ? params.get("priority")! : "ALL";
  const pending = useRef<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ id: string; message: string } | null>(null);
  const phaseMatches = (value: PhaseFilter, item: typeof missions[number]) => value === "ALL" || item.phase === value || (value === "ACTIVE" && !["QUEUED", "TERMINAL"].includes(item.phase));
  const filtered = byNewestRequest(missions.filter(item => phaseMatches(phase, item) && (priority === "ALL" || item.priority === priority)));
  const selectedId = params.get("mission");
  const selected = selectedId ? filtered.find(item => item.mission_id === selectedId) : filtered[0];
  const assigned = robots.find(robot => robot.active_mission_id === selected?.mission_id);
  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value && value !== "ALL" ? next.set(key, value) : next.delete(key));
    return "/missions?" + next.toString();
  }
  async function cancel() {
    if (isDemo || !selected || selected.phase === "TERMINAL" || selected.cancel_requested || pending.current || isLoading || error) return;
    const id = selected.mission_id;
    pending.current = id; setCancelling(id); setCancelError(null);
    try { await cancelMission(id); }
    catch (failure) { setCancelError({ id, message: failure instanceof Error ? failure.message : "취소 요청을 보내지 못했습니다." }); }
    finally { pending.current = null; setCancelling(null); }
  }
  return <OperationsPage className="missions-view" title="작업 요청" description="대기 중인 요청과 진행 상황을 확인하세요."
    action={<Link className="ops-button is-primary" to="/"><span aria-hidden="true">＋</span> 새 작업 요청</Link>}>
    <div className="ops-toolbar">
      <OperationsTabs label="작업 필터" tabs={([["ALL", "전체 요청"], ["ACTIVE", "진행 중"], ["QUEUED", "대기"], ["TERMINAL", "종료"]] as const).map(([id, label]) => ({ label, href: href({ phase: id, mission: null }), active: phase === id, count: isLoading || error ? "—" : missions.filter(item => phaseMatches(id, item)).length }))} />
      <div className="ops-filters"><label>우선순위<select value={priority} onChange={event => setParams(new URLSearchParams(href({ priority: event.target.value, mission: null }).split("?")[1]))}><option value="ALL">전체</option><option value="HIGH">높음</option><option value="NORMAL">보통</option></select></label><button className="ops-button" onClick={() => void refresh()} disabled={isLoading}>새로고침</button></div>
    </div>
    <div className="ops-body" aria-busy={isLoading}>
      {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"}>{error ? "작업 요청을 불러오지 못했습니다. 새로고침해 주세요." : "작업 요청을 불러오는 중입니다."}</WorkspaceMessage> : <div className="ops-layout">
        <section className="ops-panel" aria-label="작업 요청 목록">
          <header className="ops-panel-heading"><h3>요청 목록 <span>{filtered.length}건</span></h3><small>요청 시각 최신순</small></header>
          {filtered.length ? <><div className="mission-table-heading" aria-hidden="true"><span>작업 대상</span><span>진행 상태</span><span>요청 시각</span><span /></div>
          <div className="ops-list">{filtered.map(mission => <Link className="ops-row mission-table-row" key={mission.mission_id} aria-current={mission.mission_id === selected?.mission_id ? "true" : undefined} to={href({ mission: mission.mission_id })}>
            <span><strong>{missionTargetLabel(mission, seats)}</strong><small><span className={mission.priority === "HIGH" ? "mission-priority-high" : ""}>{mission.priority === "HIGH" ? "↑ 높은 우선순위" : "보통 우선순위"}</span> · 책상 위 물체 정리</small></span>
            <MissionStatusBadge mission={mission} /><time dateTime={mission.created_at}>{formatDateTime(mission.created_at)}</time><ChevronIcon aria-hidden="true" />
          </Link>)}</div><footer className="ops-list-footer">높은 우선순위부터 배정되며, 진행 중인 작업은 유지됩니다.</footer></>
          : <OperationsEmpty icon={<MissionIcon />} title="표시할 작업 요청이 없습니다">필터를 바꾸거나 <Link to="/">지도에서 좌석을 선택</Link>해 작업을 요청하세요.</OperationsEmpty>}
        </section>
        <aside className="ops-panel ops-detail" aria-label="작업 요청 상세"><header className="ops-panel-heading"><h3>요청 상세</h3><MissionIcon aria-hidden="true" /></header>
          {selected ? <div className="ops-detail-content" key={selected.mission_id}>
            <div className="ops-detail-title"><MissionStatusBadge mission={selected} /><h3>{missionTargetLabel(selected, seats)}</h3><p>책상 위 물체 정리</p></div>
            <MissionProgress mission={selected} />
            <dl className="ops-facts"><InfoRow label="우선순위">{selected.priority === "HIGH" ? "높음" : "보통"}</InfoRow><InfoRow label="요청자">{selected.requested_by}</InfoRow><InfoRow label="요청 시각">{formatDateTime(selected.created_at)}</InfoRow><InfoRow label="현재 배정 로봇">{assigned ? <Link to={"/robots?robot=" + encodeURIComponent(assigned.robot_id)}>{assigned.robot_id} →</Link> : selected.phase === "QUEUED" ? "배정 대기" : "현재 배정 없음"}</InfoRow></dl>
            <p className="ops-note">{selected.phase === "TERMINAL" ? "종료된 작업입니다. 작업 결과에서 관측 자료와 최종 상태를 확인하세요." : selected.cancel_requested ? "취소를 요청했습니다. 최종 종료 상태가 확인될 때까지 진행 상황을 표시합니다." : "취소 요청 후 로봇이 안전하게 작업을 마무리하고 종료 상태를 알립니다."}</p>
            {cancelError?.id === selected.mission_id && <p className="mission-cancel-error" role="alert">{cancelError.message}</p>}
            <div className="ops-detail-actions">{selected.phase === "TERMINAL" ? <Link className="ops-button" to={"/results?mission=" + encodeURIComponent(selected.mission_id)}>작업 결과 보기 <ChevronIcon /></Link> : <button className="ops-button is-danger" disabled={isDemo || !!cancelling || selected.cancel_requested} onClick={() => void cancel()}>{cancelling === selected.mission_id ? "취소 요청 중…" : selected.cancel_requested ? "취소 요청됨" : "작업 취소 요청"}</button>}</div>
            <details className="mission-reference"><summary>요청 정보</summary><code>{selected.mission_id}</code>{selected.message && <p>{missionMessage(selected.message)}</p>}</details>
          </div> : <OperationsEmpty icon={<MissionIcon />} title={selectedId ? "선택한 요청을 찾을 수 없습니다" : "요청 상세가 여기에 표시됩니다"}>왼쪽 목록에서 작업을 선택하세요.</OperationsEmpty>}
        </aside>
      </div>}
    </div>
  </OperationsPage>;
}

import { Details, Notice } from "../components/patterns";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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
/** Keep filters and selected detail in the URL, guarding unsupported or duplicate cancel requests. */
export function MissionsPage() {
  const { missions, robots, seats, cancelMission, refresh, isLoading, error } = useOperations();
  const { isDemo, isRecording } = useDemoMode();
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
  const cancelUnsupported = !isDemo && selected?.phase !== "QUEUED"
    && (assigned ?? robots[0])?.can_cancel === false;
  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => value && value !== "ALL" ? next.set(key, value) : next.delete(key));
    return "/missions?" + next.toString();
  }
  async function cancel() {
    if ((isDemo && !isRecording) || cancelUnsupported || !selected || selected.phase === "TERMINAL" || selected.cancel_requested || pending.current || isLoading || error) return;
    const id = selected.mission_id;
    pending.current = id; setCancelling(id); setCancelError(null);
    try { await cancelMission(id); }
    catch (failure) { setCancelError({ id, message: failure instanceof Error ? failure.message : "취소 요청을 보내지 못했습니다." }); }
    finally { pending.current = null; setCancelling(null); }
  }
  return <OperationsPage className="missions-view" title="작업 요청"
    action={<Button asChild variant="primary"><Link className="ops-button is-primary" to="/"><span aria-hidden="true">＋</span> 새 작업 요청</Link></Button>}>
    <div className="ops-toolbar">
      <OperationsTabs label="작업 필터" tabs={([["ALL", "전체 요청"], ["ACTIVE", "진행 중"], ["QUEUED", "대기"], ["TERMINAL", "종료"]] as const).map(([id, label]) => ({ label, href: href({ phase: id, mission: null }), active: phase === id, count: isLoading || error ? "—" : missions.filter(item => phaseMatches(id, item)).length }))} />
      <div className="ops-filters"><label>우선순위<NativeSelect value={priority} onChange={event => setParams(new URLSearchParams(href({ priority: event.target.value, mission: null }).split("?")[1]))}><option value="ALL">전체</option><option value="HIGH">높음</option><option value="NORMAL">보통</option></NativeSelect></label><Button variant="secondary" size="default" className="ops-button" onClick={() => void refresh()} disabled={isLoading}>새로고침</Button></div>
    </div>
    <div className="ops-body" aria-busy={isLoading}>
      {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"} onRetry={() => void refresh()}>{error ? "작업 목록을 불러올 수 없음" : "작업 목록 불러오는 중"}</WorkspaceMessage> : <div className="ops-layout">
        <section className="ops-panel" aria-label="작업 요청 목록">
          <header className="ops-panel-heading"><h3>요청 목록 <span>{filtered.length}건</span></h3><small>요청 시각 최신순</small></header>
          {filtered.length ? <><div className="mission-table-heading" aria-hidden="true"><span>작업 대상</span><span>진행 상태</span><span>요청 시각</span><span /></div>
          <div className="ops-list">{filtered.map(mission => <Link className="ops-row mission-table-row" key={mission.mission_id} aria-current={mission.mission_id === selected?.mission_id ? "true" : undefined} to={href({ mission: mission.mission_id })}>
            <span><strong>{missionTargetLabel(mission, seats)}</strong>{mission.priority === "HIGH" && <small className="mission-priority-high">우선순위 높음</small>}</span>
            <MissionStatusBadge mission={mission} /><time dateTime={mission.created_at}>{formatDateTime(mission.created_at)}</time><ChevronIcon aria-hidden="true" />
          </Link>)}</div><footer className="ops-list-footer">배정: 높은 우선순위 먼저 · 진행 중인 작업 유지</footer></>
          : <OperationsEmpty icon={<MissionIcon />} title={missions.length ? "조건에 맞는 작업 없음" : "작업 요청 없음"}>{missions.length ? <Link to="/missions">전체 작업</Link> : <Link to="/">새 작업 요청</Link>}</OperationsEmpty>}
        </section>
        <aside className="ops-panel ops-detail" aria-label="작업 요청 상세"><header className="ops-panel-heading"><h3>요청 상세</h3><MissionIcon aria-hidden="true" /></header>
          {selected ? <div className="ops-detail-content" key={selected.mission_id}>
            <div className="ops-detail-title"><h3>{missionTargetLabel(selected, seats)}</h3></div>
            <MissionProgress mission={selected} />
            <dl className="ops-facts">{selected.priority === "HIGH" && <InfoRow label="우선순위">높음</InfoRow>}<InfoRow label="현재 배정 로봇">{assigned ? <Link to={"/robots?robot=" + encodeURIComponent(assigned.robot_id)}>{assigned.robot_id} →</Link> : selected.phase === "QUEUED" ? "배정 대기" : "현재 배정 없음"}</InfoRow></dl>
            {selected.cancel_requested && selected.phase !== "TERMINAL" && <p className="ops-note">종료 확인 대기</p>}
            {cancelError?.id === selected.mission_id && <Notice tone="danger" className="mission-cancel-error" role="alert">{cancelError.message}</Notice>}
            {cancelUnsupported && selected.phase !== "TERMINAL" && <p className="ops-note">현재 작업은 원격 취소 미지원</p>}
            <div className="ops-detail-actions">{selected.phase === "TERMINAL" ? <Button asChild variant="secondary"><Link className="ops-button" to={"/results?mission=" + encodeURIComponent(selected.mission_id)}>작업 결과 보기 <ChevronIcon /></Link></Button> : <Button variant="danger-outline" size="default" className="ops-button is-danger" disabled={(isDemo && !isRecording) || cancelUnsupported || !!cancelling || selected.cancel_requested} onClick={() => void cancel()}>{cancelling === selected.mission_id ? "취소 요청 중…" : selected.cancel_requested ? "취소 요청됨" : "작업 취소 요청"}</Button>}</div>
            <Details label="요청 정보"><dl className="ops-facts"><InfoRow label="요청자">{selected.requested_by}</InfoRow><InfoRow label="요청 시각">{formatDateTime(selected.created_at)}</InfoRow><InfoRow label="우선순위">{selected.priority === "HIGH" ? "높음" : "보통"}</InfoRow><InfoRow label="요청 ID"><code>{selected.mission_id}</code></InfoRow></dl>{selected.message && <p>{missionMessage(selected.message)}</p>}</Details>
          </div> : <OperationsEmpty icon={<MissionIcon />} title={selectedId ? "선택한 작업 없음" : "작업 선택"} />}
        </aside>
      </div>}
    </div>
  </OperationsPage>;
}

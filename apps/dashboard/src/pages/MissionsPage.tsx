import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { MissionList } from "../components/MissionList";
import { useOperations } from "../operations/OperationsContext";

type PhaseFilter = "ALL" | "ACTIVE" | "QUEUED" | "TERMINAL";
type PriorityFilter = "ALL" | "HIGH" | "NORMAL";

export function MissionsPage() {
  const { missions, seats, cancelMission, refresh, isLoading, error } = useOperations();
  const [params, setParams] = useSearchParams();
  const phaseFilter = (["ACTIVE", "QUEUED", "TERMINAL"].includes(params.get("phase") ?? "") ? params.get("phase") : "ALL") as PhaseFilter;
  const priorityFilter = (["HIGH", "NORMAL"].includes(params.get("priority") ?? "") ? params.get("priority") : "ALL") as PriorityFilter;
  const selectedId = params.get("mission");
  const [cancelError, setCancelError] = useState("");
  function changeFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("mission");
    if (value === "ALL") next.delete(key); else next.set(key, value);
    setParams(next);
  }
  async function cancel(missionId: string) {
    setCancelError("");
    try { await cancelMission(missionId); }
    catch (failure) { setCancelError(failure instanceof Error ? failure.message : "취소 요청을 보내지 못했습니다."); }
  }
  const active = missions.filter(({ phase }) => !["QUEUED", "TERMINAL"].includes(phase));
  const queued = missions.filter(({ phase }) => phase === "QUEUED");
  const succeeded = missions.filter(({ outcome }) => outcome === "SUCCESS");
  const filtered = useMemo(() => missions.filter((mission) => {
    const matchesPhase = phaseFilter === "ALL"
      || mission.phase === phaseFilter
      || (phaseFilter === "ACTIVE" && !["QUEUED", "TERMINAL"].includes(mission.phase));
    return matchesPhase && (priorityFilter === "ALL" || mission.priority === priorityFilter) && (!selectedId || selectedId === mission.mission_id);
  }), [missions, phaseFilter, priorityFilter, selectedId]);

  return (
    <section className="workspace dashboard-view section-view missions-view">
      <div className="view-intro"><h2>요청 현황</h2><p>요청된 작업의 우선순위와 진행 상태를 한곳에서 확인합니다.</p></div>
      <div className="metric-grid">
        <article className="metric-card"><span>전체 요청</span><strong>{isLoading || error ? "—" : missions.length}</strong><small>누적 작업 요청</small></article>
        <article className="metric-card"><span>진행 중</span><strong>{isLoading || error ? "—" : active.length}</strong><small>로봇 처리 중</small></article>
        <article className="metric-card"><span>대기 중</span><strong>{isLoading || error ? "—" : queued.length}</strong><small>대기열 등록 완료</small></article>
        <article className="metric-card"><span>완료</span><strong>{isLoading || error ? "—" : succeeded.length}</strong><small>성공 종료</small></article>
      </div>
      <article className="panel data-panel">
        <div className="panel-heading data-heading">
          <div><h2>{selectedId ? "선택한 작업 요청" : "작업 요청 목록"}</h2>{selectedId && <Link to="/missions">전체 요청 보기</Link>}</div>
          <div className="filter-bar">
            <label><span>단계</span><select value={phaseFilter} onChange={(event) => changeFilter("phase", event.target.value)}><option value="ALL">전체</option><option value="ACTIVE">진행 중</option><option value="QUEUED">대기</option><option value="TERMINAL">종료</option></select></label>
            <label><span>우선순위</span><select value={priorityFilter} onChange={(event) => changeFilter("priority", event.target.value)}><option value="ALL">전체</option><option value="HIGH">높음</option><option value="NORMAL">보통</option></select></label>
            <button className="secondary" type="button" onClick={() => void refresh()}>새로고침</button>
          </div>
        </div>
        {cancelError && <p role="alert" className="workspace-api-error">{cancelError}</p>}
        <div className="missions mission-catalog" aria-busy={isLoading}>
          {isLoading ? <p className="workspace-empty">작업 요청을 불러오는 중입니다.</p> : <MissionList
            missions={filtered}
            seats={seats}
            emptyMessage={error ? "작업 요청을 가져오지 못했습니다." : "조건에 맞는 작업 요청이 없습니다."}
            onCancel={(missionId) => void cancel(missionId)}
          />}
        </div>
      </article>
    </section>
  );
}

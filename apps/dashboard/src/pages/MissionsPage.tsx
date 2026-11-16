import { PlusIcon, ChevronIcon } from "../components/WorkspaceIcons";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Mission } from "../api/types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import { PageShell, PageHeader, Surface } from "../components/patterns";
import { MissionStatusBadge, OperationsEmpty } from "../components/OperationsPage";
import { MissionIcon } from "../components/Icons";
import { WorkspaceMessage } from "../components/WorkspaceMessage";
import { useOperations } from "../operations/OperationsContext";
import { missionTargetLabel } from "../lib/operations";
import { needsResultReview } from "../lib/home-summary";
import { MissionCalendar } from "../features/mission-workspace/MissionCalendar";
import { MissionDaySummary } from "../features/mission-workspace/MissionDaySummary";
import { MissionDetail } from "../features/mission-workspace/MissionDetail";
import { MissionRequestForm } from "../features/mission-workspace/MissionRequestForm";
import { useMissionDay } from "../features/mission-workspace/useMissionDay";
import { clockLabel, dayKey, matchesTask, shiftDay, sortTasks, summarizeTasks, taskFilters, type TaskFilter } from "../features/mission-workspace/mission-day";
import "../features/mission-workspace/mission-workspace.css";

/** Date-scoped lifecycle workspace. Robot outcomes and operator acknowledgement remain separate. */
export function MissionsPage() {
  const { seats } = useOperations();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("mission");
  const workspace = useMissionDay(params.get("date"), selectedId);
  const { day, today, missions, isLoading, error } = workspace;
  const requestedFilter = (params.get("filter") || params.get("phase") || "ALL").toUpperCase();
  const filter: TaskFilter = taskFilters.some(([key])=>key===requestedFilter) ? requestedFilter as TaskFilter : "ALL";
  const priority = params.get("priority") === "HIGH" ? "HIGH" : params.get("priority") === "NORMAL" ? "NORMAL" : "ALL";
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ retry?: Mission } | null>(null);
  const filtered = sortTasks(missions.filter(m => matchesTask(m,filter) && (priority === "ALL" || priority===m.priority)
    && `${missionTargetLabel(m,seats)} ${m.mission_id}`.toLowerCase().includes(search.toLowerCase().trim())));
  const selected = selectedId ? missions.find(m => m.mission_id === selectedId) : filtered[0];
  const count = (state: TaskFilter) => isLoading || error ? "—" : missions.filter(m=>matchesTask(m,state)).length;
  const summary = isLoading || error ? undefined : summarizeTasks(missions);
  const dateTitle = new Intl.DateTimeFormat("ko-KR", { month:"long", day:"numeric", weekday:"long", timeZone:"Asia/Seoul" }).format(new Date(`${day}T12:00:00+09:00`));
  function nextParams(changes: Record<string,string|null>) {
    const next = new URLSearchParams(params); next.delete("phase");
    Object.entries(changes).forEach(([key,value])=>value && value!=="ALL" ? next.set(key,value) : next.delete(key)); return next;
  }
  function selectDay(value: string) { setForm(null); setSearch(""); setParams(nextParams({date:value,mission:null})); }
  return <PageShell width="wide" flow="workspace" className="task-workspace" aria-label="작업 관리">
    <PageHeader title="작업" action={<div className="task-actions"><Button variant="secondary" onClick={()=>void workspace.refresh()} disabled={isLoading}>새로고침</Button><Button variant="primary" aria-label="새 작업 요청 열기" onClick={()=>setForm({})}><PlusIcon aria-hidden="true" />새 작업 요청</Button></div>} />
    <div className="task-layout">
      <aside className="task-sidebar" aria-label="날짜 선택">
        <Surface padding="none" className="task-calendar-surface"><MissionCalendar day={day} today={today} localMissions={workspace.localMissions} selectedSummary={summary} onSelect={selectDay} /></Surface>
        <MissionDaySummary missions={missions} summary={summary} error={!!error} filter={filter} onFilter={value => {
          setForm(null); setSearch(""); setParams(nextParams({filter:filter === value ? null : value, priority:null, mission:null, date:day}));
        }} />
      </aside>
      <Surface padding="none" className="task-list-panel" aria-label="작업 요청 목록">
        <header className="task-list-heading"><div><span className="task-eyebrow">{day===today ? "오늘의 작업" : `${day.slice(0,4)}년 작업`}</span><h3>{dateTitle}</h3></div><div className="task-actions"><Button variant="ghost" size="icon-compact" aria-label="이전 날짜" onClick={()=>selectDay(shiftDay(day,-1))}><ChevronIcon className="icon-previous" aria-hidden="true" /></Button><Button variant="ghost" size="icon-compact" aria-label="다음 날짜" onClick={()=>selectDay(shiftDay(day,1))}><ChevronIcon aria-hidden="true" /></Button></div></header>
        <div className="task-list-tools"><Input aria-label="작업 검색" placeholder="좌석 또는 요청 ID 검색" value={search} onChange={e=>{setSearch(e.target.value);setParams(nextParams({mission:null}));}} />
          <div><NativeSelect aria-label="작업 상태" value={filter} onChange={e=>{setForm(null);setParams(nextParams({filter:e.target.value,mission:null,date:day}));}}>{taskFilters.map(([key,label])=><option key={key} value={key}>{label} · {count(key)}</option>)}</NativeSelect><NativeSelect aria-label="우선순위" value={priority} onChange={e=>setParams(nextParams({priority:e.target.value,mission:null,date:day}))}><option value="ALL">우선순위 전체</option><option value="HIGH">높음</option><option value="NORMAL">보통</option></NativeSelect></div>
        </div>
        <div className="task-list-scroll ops-body" aria-busy={isLoading}>
          {isLoading || error ? <WorkspaceMessage kind={error ? "error" : "loading"} onRetry={()=>void workspace.refresh()}>{error ? "작업 목록을 불러올 수 없음" : "작업 목록 불러오는 중"}</WorkspaceMessage>
          : filtered.length ? <div className="task-list">{filtered.map(m=><Link key={m.mission_id} className="task-row" data-tone={needsResultReview(m)?"review":matchesTask(m,"ACTIVE")?"active":undefined} to={"/missions?"+nextParams({mission:m.mission_id,date:day})} aria-current={selected?.mission_id===m.mission_id?"true":undefined} onClick={()=>setForm(null)}>
            <div><strong>{missionTargetLabel(m,seats)}</strong><span>{m.priority==="HIGH" && <small className="task-priority">높음</small>}<time dateTime={m.created_at}>{clockLabel(m.created_at)}</time></span></div>
            <div><MissionStatusBadge mission={m} /><span className="task-row-note">{m.review ? "검토 완료" : needsResultReview(m) ? "● 관리자 확인" : dayKey(m.created_at)<day ? "이전 요청" : m.phase==="QUEUED" ? "로봇 배정 대기" : m.robot_id ?? ""}</span></div>
          </Link>)}</div> : <OperationsEmpty icon={<MissionIcon />} title={missions.length ? "조건에 맞는 작업 없음" : "작업 요청 없음"}>{missions.length ? <Button variant="ghost" onClick={()=>{setSearch("");setParams(nextParams({filter:null,priority:null,mission:null,date:day}));}}>필터 초기화</Button> : <Button variant="ghost" onClick={()=>setForm({})}>새 작업 요청</Button>}</OperationsEmpty>}
        </div>
        <footer className="task-list-footer"><span>{isLoading || error ? "—" : filtered.length}건</span></footer>
      </Surface>
      <Surface padding="none" className="task-detail-panel" aria-label="작업 상세">
        {form ? <MissionRequestForm key={form.retry?.mission_id ?? "new"} retry={form.retry} onClose={()=>setForm(null)} onCreated={mission=>{setForm(null);setSearch("");setParams(nextParams({date:dayKey(mission.created_at),mission:mission.mission_id,filter:null,priority:null}));void workspace.refresh();}} />
        : isLoading || error ? <WorkspaceMessage kind={error?"empty":"loading"}>{error?"목록 연결을 확인하면 상세가 표시됩니다.":"작업 상세 불러오는 중"}</WorkspaceMessage>
        : workspace.detailError ? <WorkspaceMessage kind="error" onRetry={()=>void workspace.refresh()}>선택한 작업을 불러올 수 없음</WorkspaceMessage>
        : selected ? <MissionDetail key={selected.mission_id} mission={selected} onRetry={()=>setForm({retry:selected})} onChanged={async()=>{setParams(nextParams({date:day,mission:selected.mission_id}),{replace:true});await workspace.refresh();}} />
        : <div className="task-detail-empty"><span aria-hidden="true"><MissionIcon /></span><h3>{selectedId?"선택한 작업 없음":"선택한 날짜의 작업이 없습니다"}</h3><p>작업을 선택하면 진행 상황과 결과를 확인할 수 있습니다.</p><Button variant="primary" onClick={()=>setForm({})}>새 작업 요청</Button></div>}
      </Surface>
    </div>
  </PageShell>;
}

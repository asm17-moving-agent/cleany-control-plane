import type { Mission } from "../../api/types";
import { Surface } from "../../components/patterns";
import { Button } from "../../components/ui/button";
import { ChevronIcon } from "../../components/WorkspaceIcons";
import { taskDistribution, taskSegments, type DaySummary, type TaskFilter } from "./mission-day";

export function MissionDaySummary({ missions, summary, error, filter, onFilter }: {
  missions: Mission[]; summary?: DaySummary; error: boolean; filter: TaskFilter; onFilter: (filter: TaskFilter) => void;
}) {
  const counts = taskDistribution(missions);
  const total = summary?.total ?? 0;
  const segments = taskSegments.filter(s => s.key !== "OTHER_TERMINAL" || counts[s.key] > 0 || filter === s.key);
  const percent = (count: number) => total ? count / total * 100 : 0;
  const description = !summary ? error ? "작업 현황 조회 실패" : "작업 현황 불러오는 중" : !total ? "작업 없음" :
    `전체 ${total}건. ` + segments.map(s => `${s.label} ${counts[s.key]}건 (${percent(counts[s.key]).toFixed(1)}%)`).join(", ");
  return <Surface padding="none" className="task-day-summary" aria-label="일별 요약">
    <header><h3>작업 현황</h3><span className="task-summary-total" aria-label={`전체 작업 ${summary?.total ?? "—"}건`}><strong>{summary?.total ?? "—"}</strong><small>건</small></span></header>
    <div className="task-stacked-bar" role="img" aria-label={description}>
      {summary && total > 0 && taskSegments.filter(s => counts[s.key] > 0).map(s =>
        <span key={s.key} data-segment={s.key} style={{width:`${percent(counts[s.key])}%`}} aria-hidden="true"
          title={`${s.label} ${counts[s.key]}건 · ${percent(counts[s.key]).toFixed(1)}%`} />)}
    </div>
    {(!summary || !total) && <p className="task-summary-empty">{description}</p>}
    <div className="task-summary-legend" role="group" aria-label="작업 상태별 필터">
      {segments.map(s => <Button key={s.key} variant="ghost" size="compact" data-state={s.key}
        disabled={!summary || !total} aria-pressed={filter === s.key} title={s.description} onClick={() => onFilter(s.key)}>
        <i data-segment={s.key} aria-hidden="true" /><span>{s.label}</span><strong>{summary ? counts[s.key] : "—"}</strong>
      </Button>)}
    </div>
    <Button variant="ghost" size="compact" className="task-summary-review" data-attention={!!summary?.review || undefined}
      disabled={!summary || !total} aria-pressed={filter === "REVIEW"} title="전체 작업 중 관리자 확인이 필요한 작업" onClick={() => onFilter("REVIEW")}>
      <span>확인 필요</span><strong>{summary?.review ?? "—"}</strong><ChevronIcon aria-hidden="true" />
    </Button>
  </Surface>;
}

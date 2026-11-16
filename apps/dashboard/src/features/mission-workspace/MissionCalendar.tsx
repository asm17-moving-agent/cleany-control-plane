import { ChevronIcon } from "../../components/WorkspaceIcons";
import { useEffect, useId, useRef, useState } from "react";
import type { Mission } from "../../api/types";
import { Button } from "../../components/ui/button";
import { calendarDays, dayKey, shiftDay, type DaySummary } from "./mission-day";
import { useMissionCalendar } from "./useMissionCalendar";

export function MissionCalendar({ day, today, localMissions, selectedSummary, onSelect }: {
  day: string; today: string; localMissions: Mission[]; selectedSummary?: DaySummary; onSelect: (day: string) => void;
}) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const descriptionId = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => setMonth(day.slice(0, 7)), [day]);
  const first = `${month}-01`;
  const days = calendarDays(month), weeks = days.length / 7;
  const calendar = useMissionCalendar(days, today, localMissions);
  const title = `${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월`;
  function moveMonth(delta: number) {
    const date = new Date(`${first}T12:00:00+09:00`); date.setUTCMonth(date.getUTCMonth() + delta); setMonth(dayKey(date).slice(0,7));
  }
  return <div className="task-calendar" ref={root}>
    <header><strong aria-live="polite">{title}</strong><div><Button variant="ghost" size="icon-compact" aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronIcon className="icon-previous" aria-hidden="true" /></Button><Button variant="ghost" size="icon-compact" aria-label="다음 달" onClick={() => moveMonth(1)}><ChevronIcon aria-hidden="true" /></Button></div></header>
    <table aria-label="작업 날짜 선택"><thead><tr>{["일","월","화","수","목","금","토"].map(d => <th scope="col" key={d}>{d}</th>)}</tr></thead><tbody>
      {Array.from({ length: weeks }, (_, row) => <tr key={row}>{days.slice(row*7,row*7+7).map(value => {
        const summary = value === day && selectedSummary ? selectedSummary : calendar.summaries[value];
        return <td key={value}>
        <Button variant="ghost" size="compact" className="task-calendar-day" data-day={value} data-outside={value.slice(0,7)!==month || undefined}
          aria-label={value} aria-describedby={`${descriptionId}-${value}`} aria-pressed={value===day} aria-current={value===today ? "date" : undefined}
          tabIndex={value === (day.startsWith(month) ? day : first) ? 0 : -1}
          onClick={() => onSelect(value)} onKeyDown={event => {
            const delta = ({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
            if (delta) { event.preventDefault(); const next=shiftDay(value,delta); onSelect(next); requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus()); }
          }}>{Number(value.slice(8))}</Button>
        <span className="task-calendar-markers" aria-hidden="true">{summary && summary.total > 0 && <i data-marker="work" />}{summary && summary.review > 0 && <i data-marker="review" />}</span>
        <span className="sr-only" id={`${descriptionId}-${value}`}>{summary ? `작업 ${summary.total}건, 확인 필요 ${summary.review}건` : calendar.error ? "날짜별 현황 조회 실패" : "날짜별 현황 불러오는 중"}</span>
      </td>;})}</tr>)}
    </tbody></table>
    <div className="task-calendar-legend" aria-label="날짜 표시 범례"><span><i data-marker="work" />작업 기록</span><span><i data-marker="review" />확인 필요</span></div>
    {calendar.isLoading && <p className="task-calendar-status" role="status">날짜별 현황 불러오는 중</p>}
    {calendar.error && <div className="task-calendar-status" role="status"><span>날짜별 현황 조회 실패</span><Button variant="ghost" size="compact" onClick={() => void calendar.refresh()}>다시 조회</Button></div>}
    <Button variant="secondary" className="task-calendar-today" onClick={() => onSelect(today)}>오늘</Button>
  </div>;
}

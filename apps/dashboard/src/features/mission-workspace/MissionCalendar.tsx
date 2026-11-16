import { ChevronIcon } from "../../components/WorkspaceIcons";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { dayKey, shiftDay } from "./mission-day";

export function MissionCalendar({ day, today, onSelect }: { day: string; today: string; onSelect: (day: string) => void }) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => setMonth(day.slice(0, 7)), [day]);
  const first = `${month}-01`;
  const offset = new Date(`${first}T12:00:00+09:00`).getUTCDay();
  const monthEnd = new Date(`${first}T12:00:00+09:00`); monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1); monthEnd.setUTCDate(0);
  const weeks = Math.ceil((offset + monthEnd.getUTCDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, index) => shiftDay(first, index - offset));
  const title = `${Number(month.slice(0,4))}년 ${Number(month.slice(5))}월`;
  function moveMonth(delta: number) {
    const date = new Date(`${first}T12:00:00+09:00`); date.setUTCMonth(date.getUTCMonth() + delta); setMonth(dayKey(date).slice(0,7));
  }
  return <div className="task-calendar" ref={root}>
    <header><strong aria-live="polite">{title}</strong><div><Button variant="ghost" size="icon-compact" aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronIcon className="icon-previous" aria-hidden="true" /></Button><Button variant="ghost" size="icon-compact" aria-label="다음 달" onClick={() => moveMonth(1)}><ChevronIcon aria-hidden="true" /></Button></div></header>
    <table aria-label="작업 날짜 선택"><thead><tr>{["일","월","화","수","목","금","토"].map(d => <th scope="col" key={d}>{d}</th>)}</tr></thead><tbody>
      {Array.from({ length: weeks }, (_, row) => <tr key={row}>{days.slice(row*7,row*7+7).map(value => <td key={value}>
        <Button variant="ghost" size="compact" className="task-calendar-day" data-day={value} data-outside={value.slice(0,7)!==month || undefined}
          aria-label={value} aria-pressed={value===day} aria-current={value===today ? "date" : undefined}
          tabIndex={value === (day.startsWith(month) ? day : first) ? 0 : -1}
          onClick={() => onSelect(value)} onKeyDown={event => {
            const delta = ({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7} as Record<string,number>)[event.key];
            if (delta) { event.preventDefault(); const next=shiftDay(value,delta); onSelect(next); requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus()); }
          }}>{Number(value.slice(8))}</Button>
      </td>)}</tr>)}
    </tbody></table>
    <Button variant="secondary" className="task-calendar-today" onClick={() => onSelect(today)}>오늘</Button>
  </div>;
}

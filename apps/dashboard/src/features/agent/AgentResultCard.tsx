import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import type { components } from '../../api/generated/openapi';
import type { Mission } from '../../api/types';
import { MissionProgress } from '../../components/MissionProgress';
import { Button } from '../../components/ui/button';
import { formatDateTime, missionMessage, missionTargetLabel, seatLabel } from '../../lib/operations';
import { useOperations } from '../../operations/OperationsContext';
import { OperationsView } from './OperationsView';
import { useAgent } from './AgentContext';

type Schema = components['schemas'];
type Card = NonNullable<Schema['AgentMessage']['cards']>[number];

function MissionCard({ card }: { card: Schema['AgentMissionCard'] }) {
  const { seats } = useOperations();
  const { setOpen } = useAgent();
  const [latest, setLatest] = useState<{ mission: Mission; readAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mission = latest?.mission ?? card;
  const review = latest ? latest.mission.needs_human_review && !latest.mission.review : card.review_pending;
  const readAt = latest?.readAt ?? card.captured_at;
  async function refresh() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const current = await api.mission(card.mission_id);
      setLatest({ mission: current, readAt: new Date().toISOString() });
    } catch {
      setError('최신 상태를 가져오지 못했습니다. 마지막 조회 결과를 표시합니다.');
    } finally {
      setLoading(false);
    }
  }
  const query = new URLSearchParams({ site: card.site_id, mission: card.mission_id });
  return <section className="agent-result-card" aria-label="작업 진행 카드">
    <header><h3>{missionTargetLabel(mission, seats)} 작업</h3>
      <time dateTime={readAt}>{formatDateTime(readAt)} 조회</time></header>
    <MissionProgress mission={mission} />
    {mission.message && <p>{missionMessage(mission.message)}</p>}
    {mission.failure_code && <p>실패 코드 <code>{mission.failure_code}</code></p>}
    {review && <p className="agent-warning">관리자 확인 필요</p>}
    {error && <p role="alert" className="agent-error">{error}</p>}
    <footer>
      <Button size="compact" onClick={() => void refresh()} disabled={loading}>{loading ? '확인 중…' : '최신 상태 확인'}</Button>
      <Button asChild variant="ghost" size="compact"><Link to={'/missions?' + query} onClick={() => setOpen(false)}>작업 상세 열기 ↗</Link></Button>
    </footer>
  </section>;
}

const metrics = [
  ['completed', '완료'], ['failed', '실패'], ['cancelled', '취소'],
  ['requested', '요청'], ['review_needed', '확인 필요'],
] as const;

function ComparisonCard({ card }: { card: Schema['AgentComparisonCard'] }) {
  const { seats } = useOperations();
  const { setOpen } = useAgent();
  const { earlier, later } = card;
  const sourceLabels: Record<string, string> = { mock: '모의 실행', sim: '시뮬레이션', real: '실물 실행', mixed: '단계별 출처 혼합', unknown: '출처 미확인' };
  const sameYear = earlier.day.slice(0, 4) === later.day.slice(0, 4);
  const label = (day: string) => sameYear ? day.slice(5).replace('-', '.') : day;
  return <section className="agent-result-card" aria-label="날짜별 작업 비교">
    <header><h3>작업 기록 비교</h3><span>{card.seat_id ? seatLabel(seats, card.seat_id) : '시설 전체'} · 한국 시간</span></header>
    <table className="agent-compare"><caption className="sr-only">{earlier.day}와 {later.day}의 작업 건수</caption>
      <thead><tr><th scope="col">항목</th>{[earlier, later].map(({ day }) =>
        <th scope="col" key={day}>{card.seat_id ? <time dateTime={day}>{label(day)}</time> :
          <Link aria-label={day + ' 시설 작업 기록 열기'} to={'/missions?' + new URLSearchParams({ site: card.site_id, date: day })} onClick={() => setOpen(false)}>{label(day)} ↗</Link>}</th>)}
        <th scope="col">증감</th></tr></thead>
      <tbody>{metrics.map(([key, title]) => {
        const delta = later[key] - earlier[key];
        return <tr key={key}><th scope="row">{title}</th><td>{earlier[key]}</td><td>{later[key]}</td>
          <td className="agent-change" data-changed={delta !== 0}>{delta > 0 ? '+' + delta : delta === 0 ? '동일' : '−' + Math.abs(delta)}</td></tr>;
      })}</tbody>
    </table>
    {card.sources.length > 0 && <small>{card.sources.map(source => sourceLabels[source] ?? source).join(' · ')}</small>}
  </section>;
}

export function AgentResultCard({ card }: { card: Card }) {
  if (card.kind === 'mission_progress') return <MissionCard card={card} />;
  if (card.kind === 'day_comparison') return <ComparisonCard card={card} />;
  return <OperationsView card={card} />;
}

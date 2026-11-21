import { useState } from 'react';
import type { components } from '../../api/generated/openapi';
import { Button } from '../../components/ui/button';

type Insight = components['schemas']['AgentInsight'];
type Bucket = Insight['buckets'][number];

export const insightTitles: Record<Insight['kind'], string> = {
  outcome_mix: '종료 결과 분포', request_hours: '요청이 몰린 시간', elapsed_spread: '작업 소요 시간',
  failure_reasons: '실패 사유 분포', zone_coverage: '구역별 완료율', repeat_seats: '반복 정리 좌석',
  photo_pairs: '사진 기록 현황', run_sources: '실행 출처 분포', review_progress: '검토 진행도', queue_age: '대기 시간 분포',
};

const ratio = (value: number, total: number) => total > 0 ? Math.round(100 * value / total) : 0;
const captions: Record<string, string> = {
  NAVIGATION_TIMEOUT: '주행 시간 초과', GRASP_FAILED: '물체 잡기 실패',
};

function Composition({ rows }: { rows: Bucket[] }) {
  return <><div className="agent-composition" aria-hidden="true">
    {rows.filter(r => r.value > 0).map(r => <i key={r.label} data-tone={r.tone} style={{flexGrow:r.value}} />)}
  </div><ul className="agent-chart-key">{rows.map(r => <li key={r.label} data-tone={r.tone}>
    <i aria-hidden="true" />{r.label} <strong>{r.value}건</strong>
  </li>)}</ul></>;
}

function Columns({ card }: { card: Insight }) {
  const max = Math.max(1, ...card.buckets.map(r => r.value));
  const hours = card.kind === 'request_hours';
  return <ul className="agent-columns" aria-label={insightTitles[card.kind]}>{card.buckets.map(row => {
    const label = hours ? row.label.split('–')[0] + '시' : row.label.replace('분 초과~', '–');
    return <li key={row.label} aria-label={row.label + ' ' + row.value + '건'}>
      <div aria-hidden="true"><strong>{row.value}</strong><i data-peak={row.value === max} style={{height: 60 * row.value / max + '%'}} /></div>
      <span aria-hidden="true">{label}</span>
    </li>;
  })}</ul>;
}

function Ranked({ card }: { card: Insight }) {
  const [all, setAll] = useState(false);
  const zone = card.kind === 'zone_coverage';
  const visible = all ? card.buckets : card.buckets.slice(0, 4);
  const max = Math.max(1, ...card.buckets.map(b => b.value));
  return <>{visible.length === 0 && <p>{zone ? '완료 기록이 있는 구역이 없습니다.' : card.kind === 'repeat_seats' ? '두 번 이상 완료한 좌석이 없습니다.' : '기록된 실패가 없습니다.'}</p>}
    <ul className="agent-bars">{visible.map(r => <li key={r.label} data-tone={r.tone}>
      <span title={r.label}>{captions[r.label] ?? r.label}</span>
      <i aria-hidden="true"><b style={{width: (100 * r.value / (r.capacity || max)) + '%'}} /></i>
      <strong>{zone ? ratio(r.value, r.capacity ?? 0) + '% · ' + r.value + '/' + r.capacity + '석' : r.value + (card.kind === 'repeat_seats' ? '회' : '건')}</strong>
    </li>)}</ul>
    {(all || visible.length < card.buckets.length) && <Button size="compact" variant="ghost" aria-expanded={all} onClick={() => setAll(!all)}>
      {all ? '요약 보기' : zone ? '전체 ' + card.buckets.length + '개 구역 보기' : '전체 ' + card.buckets.length + '개 보기'}
    </Button>}</>;
}

export function InsightChart({ card }: { card: Insight }) {
  const {kind, buckets, sample_count: total} = card;
  if (!total) return <div className="agent-insight"><p>{kind === 'review_progress' ? '검토 대상 작업이 없습니다.' : kind === 'queue_age' ? '현재 배정 대기 중인 작업이 없습니다.' : '해당 범위에 집계할 기록이 없습니다.'}</p><small>{card.basis}</small></div>;
  const reviewed = kind === 'review_progress';
  const peak = kind === 'request_hours' ? Math.max(...buckets.map(b => b.value), 0) : 0;
  const peakHours = peak ? buckets.filter(b => b.value === peak).map(b => b.label + '시') : [];
  const share = ['outcome_mix','photo_pairs','run_sources'].includes(kind);
  let value = String(card.value), unit: string = card.unit, label = card.metric;
  if (kind === 'outcome_mix') { value = String(ratio(buckets.find(b => b.label === '완료')?.value ?? 0, total)); unit = '%'; label = '완료율 · 종료 ' + total + '건'; }
  if (kind === 'request_hours') { value = String(peak); unit = '건'; label = '최다 접수 · ' + peakHours.join(', '); }
  if (kind === 'run_sources') label = '모든 단계가 실물인 작업';
  if (reviewed) { value = String(ratio(card.value, total)); unit = '%'; label = '검토 완료'; }
  return <div className="agent-insight">
    {reviewed ? <div className="agent-review-meter">
      <div className="agent-ring" style={{backgroundImage:'conic-gradient(var(--color-action) '+value+'%, var(--color-neutral-soft) 0)'}} aria-hidden="true"><span>{value}%</span></div>
      <div><strong>{card.value} / {total}건 검토 완료</strong><p>확인할 작업 {total - card.value}건</p></div>
    </div> : <div className="agent-kpi"><strong>{value}<small>{unit}</small></strong><span>{label}</span></div>}
    {share && (kind === 'run_sources' && buckets.length === 1
      ? <p>{buckets[0].label} {buckets[0].value}건 · 100%</p>
      : <Composition rows={buckets} />)}
    {['request_hours','elapsed_spread','queue_age'].includes(kind) && <Columns card={card} />}
    {['zone_coverage','repeat_seats','failure_reasons'].includes(kind) && <Ranked card={card} />}
    <small>{card.basis}{card.sources.length > 0 && kind !== 'run_sources' && ' · ' + card.sources.join(' / ')}</small>
  </div>;
}

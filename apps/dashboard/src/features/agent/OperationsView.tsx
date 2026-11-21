import { useState } from 'react';
import { Link } from 'react-router';
import type { components } from '../../api/generated/openapi';
import { Button } from '../../components/ui/button';
import { PanelHeader, Surface, StatusBadge } from '../../components/patterns';
import { formatDateTime, missionMessage, seatLabel } from '../../lib/operations';
import { scopedUrl } from '../../api/client';
import { outcomeLabels, robotStateLabels } from '../../lib/home-summary';
import { executionSource } from '../../lib/execution-source';
import { useOperations } from '../../operations/OperationsContext';
import { useAuthOptional } from '../../auth/AuthContext';
import { HeadCamera } from '../manual-control/HeadCamera';
import { MissionObservation } from '../mission-workspace/MissionObservation';
import { BatteryChart } from '../robot-operations/BatteryChart';
import { sourceLabel } from '../robot-operations/data';
import { useAgent } from './AgentContext';
import { shortStamp, timeOfDay } from './view-time';
import { InsightChart, insightTitles } from './InsightChart';
import { AgentSeatMap } from './AgentSeatMap';

type S = components['schemas'];
type View = S['AgentRobotHealth'] | S['AgentLiveRobot'] | S['AgentPhotos'] | S['AgentWorkList']
  | S['AgentInsight'] | S['AgentBatteryChart'] | S['AgentEventTimeline'] | S['AgentSeatMap'];

const titles = {
  ...insightTitles,
  robot_health: '로봇 상태', head_camera: '헤드캠 미리보기', desk_photos: '작업 전후 사진',
  work_queue: '작업 대기열', review_inbox: '관리자 검토함', battery_chart: '배터리 추이',
  event_timeline: '장애·복구 타임라인', robot_position: '로봇 위치', seat_picker: '작업 가능 좌석', seat_coverage: '좌석별 완료 기록',
} as const;

function WorkLink({ site, id, children }: { site: string; id: string; children: React.ReactNode }) {
  const { setOpen } = useAgent();
  return <Link to={'/missions?' + new URLSearchParams({ site, mission: id })} onClick={() => setOpen(false)}>{children} ↗</Link>;
}

function Health({ card }: { card: S['AgentRobotHealth'] }) {
  const { safety, battery } = card;
  const b = battery?.observation.sample, s = safety?.observation.sample;
  const observed = (item: typeof safety) => item
    ? (item.stale || !card.connected ? '마지막 관측 · ' : '') + shortStamp(item.received_at) + ' · ' + sourceLabel(item.observation.provenance)
    : '미수신';
  return <dl className="agent-health">
    <dt>연결</dt><dd><StatusBadge tone={card.connected ? 'success' : 'warning'}>{card.connected ? '연결됨' : '연결 끊김'}</StatusBadge> {robotStateLabels[card.state as keyof typeof robotStateLabels] ?? card.state}</dd>
    <dt>배터리</dt><dd>{b?.kind === 'battery' && b.percentage != null && <strong>{b.percentage}% </strong>}{observed(battery)}</dd>
    <dt>안전</dt><dd>{s?.kind === 'safety' && <strong>{s.estop_engaged ? '비상 정지' : s.stopped ? '정지 중' : s.protection_ready ? '보호 준비됨' : '보호 준비 대기'} </strong>}{observed(safety)}</dd>
    <dt>로봇</dt><dd title={card.last_seen_at ? '최근 접속 ' + formatDateTime(card.last_seen_at) : undefined}>{card.robot_id} · {card.mode === 'mock' ? '모의 운용' : 'Gateway'}</dd>
  </dl>;
}

function Camera({ robot }: { robot: string }) {
  const [open, setOpen] = useState(false);
  return <div className="agent-camera"><Button size="compact" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '영상 닫기' : '영상 열기'}</Button>
    {open && <HeadCamera robotId={robot} />}</div>;
}

function WorkList({ card }: { card: S['AgentWorkList'] }) {
  const { seats } = useOperations();
  const [limit, setLimit] = useState(5);
  const queue = card.kind === 'work_queue';
  if (!card.rows.length) return <p>{queue ? '배정 대기 중인 작업이 없습니다.' : '검토가 필요한 종료 작업이 없습니다.'}</p>;
  return <><ol className="agent-work-list">{card.rows.slice(0, limit).map(row => <li key={row.mission_id}>
    <div><WorkLink site={card.site_id} id={row.mission_id}>{row.seat_id ? seatLabel(seats, row.seat_id) : row.label}</WorkLink>
      {card.focus_seats.includes(row.seat_id ?? '') && <StatusBadge tone="info">질문한 좌석</StatusBadge>}
      {row.priority === 'HIGH' && <StatusBadge tone="waiting">높은 우선순위</StatusBadge>}</div>
    <small>{queue ? '접수 ' + shortStamp(row.created_at) : (row.finished_at ? shortStamp(row.finished_at) : '') + ' · ' + (outcomeLabels[row.outcome as keyof typeof outcomeLabels] ?? '종료')}
      {row.profile && ' · ' + executionSource(row.profile)}</small>
    {!queue && <p title={row.reason}>{({NAVIGATION_TIMEOUT:'주행 시간 초과',GRASP_FAILED:'물체 잡기 실패'} as Record<string,string>)[row.reason] ?? missionMessage(row.reason)}</p>}
  </li>)}</ol>{card.rows.length > limit && <Button size="compact" onClick={() => setLimit(limit + 10)}>더 보기 ({card.rows.length - limit})</Button>}</>;
}

function Timeline({ card }: { card: S['AgentEventTimeline'] }) {
  const [limit, setLimit] = useState(5);
  const { setOpen } = useAgent();
  const days = Math.round((Date.parse(card.end_day)-Date.parse(card.start_day))/86400000)+1;
  return <>{!card.events.length && <p>조회 기간에 기록된 이벤트가 없습니다.</p>}
    <ol className="agent-work-list agent-events">{card.events.slice(0,limit).map(e => <li key={e.event_id}>
      <div><time dateTime={e.occurred_at} title={formatDateTime(e.occurred_at)}>{card.start_day === card.end_day ? timeOfDay(e.occurred_at) : shortStamp(e.occurred_at)}</time><strong>{e.title}</strong><StatusBadge>{sourceLabel(e.provenance)}</StatusBadge></div>
      {e.detail && <p>{e.detail}</p>}
      {e.mission_id && <WorkLink site={card.site_id} id={e.mission_id}>관련 작업</WorkLink>}
    </li>)}</ol>{card.events.length > limit && <Button size="compact" onClick={() => setLimit(limit+10)}>이전 이벤트 더 보기</Button>}
    {card.more && <Button asChild size="compact"><Link onClick={() => setOpen(false)} to={'/robots?' + new URLSearchParams({site:card.site_id,robot:card.robot_id,date:card.end_day,days:String(days)})}>전체 기록 열기</Link></Button>}</>;
}

function BatteryHistory({ card }: { card: S['AgentBatteryChart'] }) {
  const present = card.points.filter(p => p.percentage != null || p.charging_percentage != null);
  if (!present.length) return <p>배터리 관측 기록이 없습니다.</p>;
  const first = card.points.indexOf(present[0]), last = card.points.indexOf(present[present.length - 1]);
  const recent = present[present.length - 1];
  const until = new Date(Date.parse(card.end) - 1).toISOString();
  const scope = card.start_day === card.end_day && (timeOfDay(card.start) !== '00:00' || timeOfDay(until) !== '23:59')
    ? timeOfDay(card.start) + '–' + timeOfDay(until) + ' · ' : '';
  return <><div className="agent-kpi"><strong>{recent.percentage ?? recent.charging_percentage}<small>%</small></strong><span>마지막 관측 구간</span></div>
    <BatteryChart points={card.points.slice(first, last + 1)} days={card.start_day === card.end_day ? 1 : 2} />
    <small>{scope}관측 구간 {shortStamp(present[0].time)}–{card.start_day === card.end_day ? timeOfDay(recent.time) : shortStamp(recent.time)} KST · {card.sources.map(sourceLabel).join(' / ')}{present.some(p => p.charging_percentage != null) && ' · 충전 중 잔량 포함'}</small></>;
}

function Body({ card }: { card: View }) {
  if ('buckets' in card) return <InsightChart card={card} />;
  switch (card.kind) {
    case 'robot_health': return <Health card={card} />;
    case 'head_camera': return <Camera robot={card.robot_id} />;
    case 'desk_photos': return !card.mission_id ? <p>해당 좌석에 종료된 작업 기록이 없습니다.</p> : <><div className="agent-photos">
      <MissionObservation label="정리 전" reference={card.before?.startsWith('/api/') ? scopedUrl(card.before) : card.before} /><MissionObservation label="정리 후" reference={card.after?.startsWith('/api/') ? scopedUrl(card.after) : card.after} /></div>
      <div className="agent-photo-foot">{card.profile && <small>{executionSource(card.profile)}</small>}<WorkLink site={card.site_id} id={card.mission_id}>작업 상세</WorkLink></div></>;
    case 'event_timeline': return <Timeline card={card} />;
    case 'battery_chart': return <BatteryHistory card={card} />;
    case 'work_queue': case 'review_inbox': return <WorkList card={card} />;
    case 'robot_position': case 'seat_picker': case 'seat_coverage': return <AgentSeatMap card={card} />;
  }
}

export function OperationsView({ card }: { card: View }) {
  const auth = useAuthOptional();
  if (auth?.site?.site_id !== card.site_id) return null;
  const period = 'start_day' in card && card.start_day && card.kind !== 'seat_picker'
    ? card.start_day + (card.start_day === card.end_day ? '' : ' – ' + card.end_day) : '';
  const detail = [period, 'scope_label' in card && card.scope_label].filter(Boolean).join(' · ');
  return <Surface className="agent-view" aria-label={titles[card.kind]} data-kind={card.kind}>
    <PanelHeader title={titles[card.kind]} action={<small>{detail || (card.kind === 'head_camera' || card.kind === 'robot_position' ? card.robot_id : '')}{'rows' in card && (detail ? ' · ' : '') + card.rows.length + '건'}</small>} />
    <Body card={card} />
    {card.kind !== 'robot_position' && card.kind !== 'head_camera' && <time className="agent-stamp" dateTime={card.captured_at}>{shortStamp(card.captured_at)} 기준</time>}
  </Surface>;
}

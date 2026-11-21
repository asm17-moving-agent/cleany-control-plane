import { memo, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BatteryChart } from "./BatteryChart";
import { Link, useSearchParams } from 'react-router';
import { api } from '../../api/client';
import { useAuthOptional } from '../../auth/AuthContext';
import { useDemoMode } from '../../operations/DemoModeContext';
import { PanelHeader, StatusBadge, Surface } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/native-select';
import { activityLabels, dayRange, duration, localDay, sourceLabel } from './data';
import { demoAnalytics } from './demo';
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
export const RobotAnalytics = memo(function RobotAnalytics({ robotId }: { robotId: string }) {
  const auth = useAuthOptional();
  const { isDemo } = useDemoMode();
  const [params] = useSearchParams();
  const [day, setDay] = useState(localDay);
  const [days, setDays] = useState(1);
  const linkedDay = params.get('date'), linkedDays = params.get('days'), linkedEvent = params.get('event');
  useEffect(() => {
    if (linkedDay && /^\d{4}-\d{2}-\d{2}$/.test(linkedDay) && linkedDay <= localDay() && !Number.isNaN(Date.parse(linkedDay))) setDay(linkedDay);
    const count = Number(linkedDays ?? 1);
    if (count >= 1 && count <= 31) setDays(count);
  }, [linkedDay, linkedDays]);
  const { start, end } = useMemo(() => dayRange(day, days), [day, days]);
  const demo = useMemo(() => demoAnalytics(robotId, start, end, Date.now()), [robotId, start, end]);
  const query = useInfiniteQuery({ queryKey: ['robot-analytics', auth?.session?.customer_id, auth?.site?.site_id, robotId, start, end],
    queryFn: ({ pageParam, signal }) => api.robotAnalytics(robotId, start, end, pageParam, signal),
    initialPageParam: undefined as string | undefined, getNextPageParam: page => page.next_event_cursor ?? undefined,
    enabled: !isDemo && !!auth?.site, refetchInterval: 30000, retry: false,
  });
  const pages = isDemo ? [demo] : query.data?.pages;
  const data = pages?.[0];
  const events = [...new Map((pages ?? []).flatMap(page => page.events).map(event => [event.event_id, event])).values()];
  useEffect(() => {
    if (!linkedEvent || !query.data) return;
    const element = document.getElementById('robot-event-' + linkedEvent);
    if (element) element.scrollIntoView({ block: 'center' });
    else if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
  }, [linkedEvent, query.data, query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);
  const pending = !isDemo && query.isPending;
  const failed = !isDemo && query.isError;
  const total = data?.window_seconds ?? 0;
  const coverage = total ? Math.round((data?.observed_seconds ?? 0)/total*100) : 0;
  return <section className="robot-history" aria-label="로봇 운영 분석">
    <header className="robot-section-heading"><h3>운영 분석</h3><div className="robot-period">
      <Input type="date" aria-label="분석 기준 날짜" value={day} max={localDay()} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDay(event.target.value); }} />
      <NativeSelect aria-label="분석 기간" value={days} onChange={event => setDays(Number(event.target.value))}>{![1, 7, 30].includes(days) && <option value={days}>{days}일</option>}<option value={1}>하루</option><option value={7}>7일</option><option value={30}>30일</option></NativeSelect>
      <Button onClick={() => void query.refetch()} disabled={isDemo || query.isFetching}>새로고침</Button>
    </div></header>
    {failed && <div className="robot-inline-alert" role="alert">운영 기록을 불러오지 못했습니다. <Button size="compact" onClick={() => void query.refetch()}>다시 시도</Button></div>}
    <div className="robot-analytics-grid" aria-busy={pending}>
      <Surface className="robot-battery-chart"><PanelHeader title="배터리 추이" action={<div className="robot-chart-key"><span><i data-state="WORKING" />잔량</span><span><i data-state="CHARGING" />충전 중</span></div>} />
        {data?.battery.some(point => point.percentage !== null) ? <BatteryChart points={data.battery} days={days} /> : <div className="robot-chart-empty">{pending ? '불러오는 중' : failed ? '배터리 기록 조회 실패' : '배터리 기록 없음'}</div>}
      </Surface>
      <Surface className="robot-activity"><PanelHeader title="활동 분포" action={data && <StatusBadge>관측 {coverage}%</StatusBadge>} />
        {data?.activities.length ? <>
          <div className="robot-activity-total"><strong>{duration(data.observed_seconds)}</strong><span>관측 시간</span></div>
          <div className="robot-activity-bar" role="img" aria-label={data.activities.map(a => `${activityLabels[a.state]} ${duration(a.seconds)}`).join(', ')}>{data.activities.filter(a => a.seconds > 0).map(a => <span key={a.state} data-state={a.state} style={{ width: `${total ? a.seconds/total*100 : 0}%` }} title={`${activityLabels[a.state]} ${duration(a.seconds)}`} />)}</div>
          <dl className="robot-activity-legend">{Object.entries(activityLabels).map(([state, label]) => <div key={state}><dt><i data-state={state} />{label}</dt><dd>{duration(data.activities.find(a => a.state === state)?.seconds ?? 0)}</dd></div>)}</dl>
        </> : <div className="robot-chart-empty">{pending ? '불러오는 중' : failed ? '활동 기록 조회 실패' : '활동 기록 없음'}</div>}
      </Surface>
    </div>
    <Surface className="robot-events"><PanelHeader title="운영 이벤트" action={<div className="robot-data-source">{data?.provenance.map(source => <StatusBadge key={source}>{sourceLabel(source)}</StatusBadge>)}</div>} />
      {events.length ? <ol className="robot-timeline">{events.map(event => <li key={event.event_id} id={'robot-event-' + event.event_id} aria-current={linkedEvent === event.event_id ? 'true' : undefined} data-severity={event.severity.toLowerCase()}>
        <time dateTime={event.occurred_at}>{time(event.occurred_at)}</time><span className="robot-event-dot" aria-hidden="true" /><div><strong>{event.title}</strong>{event.detail && <p>{event.detail}</p>}</div>
        <StatusBadge>{sourceLabel(event.provenance)}</StatusBadge>{event.mission_id && <Button asChild variant="ghost" size="compact"><Link to={'/missions?mission=' + encodeURIComponent(event.mission_id)}>작업 보기</Link></Button>}
      </li>)}</ol> : <div className="robot-events-empty">{pending ? '불러오는 중' : failed ? '이벤트 조회 실패' : '운영 이벤트 없음'}</div>}
      {!isDemo && query.hasNextPage && <Button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>이전 이벤트 더 보기</Button>}
      {data && <footer className="robot-history-footer"><span>{start.slice(0,10) === end.slice(0,10) ? day : `${new Date(start).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} – ${day}`} · KST</span><span>최대 {data.retention_days}일 보관</span></footer>}
    </Surface>
  </section>;
});

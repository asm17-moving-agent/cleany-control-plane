import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, scopedUrl } from '../../api/client';
import type { components } from '../../api/generated/openapi';
import { Button } from '../../components/ui/button';
import { NativeSelect } from '../../components/ui/native-select';
import { Notice } from '../../components/patterns';
import { useAuthOptional } from '../../auth/AuthContext';
import { useOperations } from '../../operations/OperationsContext';
import { formatDateTime, seatLabel } from '../../lib/operations';
import { executionSource } from '../../lib/execution-source';
import { FacilityMap, type FacilityRobotMarker } from '../facility-map/FacilityMap';
import { worldToMap } from '../facility-map/seat-layout';
import { slamPixelToDisplay, slamToPixel } from '../facility-map/slam-map';
import { shortStamp } from './view-time';
import { useAgent } from './AgentContext';

type S = components['schemas'];
type Card = S['AgentSeatMap'] | S['AgentLiveRobot'];

export function AgentSeatMap({ card }: { card: Card }) {
  const auth = useAuthOptional();
  const { pose, poseStale, seats, robot } = useOperations();
  const agent = useAgent();
  const [selected, setSelected] = useState<string[]>([]);
  const [inspected, setInspected] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [zone, setZone] = useState('');
  const [imageError, setImageError] = useState(false);
  const site = card.site_id, customer = auth?.session?.customer_id;
  const legacy = auth?.site?.map_ref === 'facility-18f';
  const mapQuery = useQuery({ queryKey: ['agent-map', customer, site], queryFn: api.map, enabled: !legacy, retry: false });
  const layoutQuery = useQuery({ queryKey: ['agent-seat-layout', customer, site, mapQuery.data?.map_id],
    queryFn: () => api.seatLayout(site), enabled: !!mapQuery.data, retry: false });
  const map = mapQuery.data, layout = layoutQuery.data?.layout;
  const position = card.kind === 'robot_position', picker = card.kind === 'seat_picker';
  const records = 'seats' in card ? card.seats : [];
  const focus = 'seat_ids' in card ? card.seat_ids : [];
  const recordById = new Map(records.map(s => [s.seat_id, s]));
  const selectedRecord = recordById.get(inspected);
  const limit = agent.status?.max_plan_items ?? 50;
  const toggle = (id: string) => {
    setInspected(id);
    if (picker && recordById.get(id)?.selectable)
      setSelected(previous => previous.includes(id) ? previous.filter(v => v !== id) : previous.length < limit ? [...previous, id] : previous);
  };
  const zones = Array.from(new Set(records.map(s => s.zone_id)));
  const visible = records.filter(s => !zone || s.zone_id === zone);
  const canShowPose = position && robot?.robot_id === card.robot_id && !!pose && !!map &&
    pose.frame_id === map.frame_id && pose.map_id === map.map_id;
  const layers = map?.presentation?.layers;
  const width = layers ? map!.presentation!.width : map?.width;
  const height = layers ? map!.presentation!.height : map?.height;
  function project(x: number, y: number, angle?: number | null) {
    const p = slamToPixel(map!, x, y, angle);
    return layers ? slamPixelToDisplay(map!, p) : p;
  }
  const robotPoint = canShowPose ? project(pose.x, pose.y, pose.yaw) : null;
  const legacyPose = legacy && position && robot?.robot_id === card.robot_id && pose && pose.map_id === auth?.site?.map_ref;
  const markers: FacilityRobotMarker[] = legacyPose && robot && pose ? [{
    robotId: robot.robot_id, state: robot.state, ...worldToMap(pose.x, pose.y),
    heading: pose.yaw == null ? undefined : -pose.yaw * 180 / Math.PI, positionMode: 'live', poseStale,
  }] : [];
  const highlighted = position ? focus : records.filter(row => picker ? row.selectable : row.last_completed).map(row => row.seat_id);
  const relevant = visible.filter(s => picker ? s.selectable : s.last_completed);
  const choices = showAll || (!picker && !relevant.length) ? visible : relevant;
  const hasPosition = !!(robotPoint || legacyPose);
  const showMap = !picker || relevant.length > 0 || showAll;
  const coverageSources = Array.from(new Set(relevant.map(s => executionSource(s.profile))));
  return <div className="agent-map-view">
    {position ? <p className="agent-map-summary"><strong>{hasPosition ? (poseStale ? '마지막 수신 위치' : '실시간 위치') : '위치 미수신'}</strong>
      {hasPosition && pose && <small>{shortStamp(pose.received_at)}{robot?.control_mode === 'mock' && ' · 모의'}</small>}</p>
      : <div className="agent-map-summary"><strong>{relevant.length} / {visible.length}석</strong>
        <span>{picker ? '선택 가능' : '완료 기록'}</span>{!picker && coverageSources.length > 0 && <small>{coverageSources.join(' / ')}</small>}</div>}
    {showMap && legacy && <div className="agent-legacy-map" aria-label="시설 미니맵"><FacilityMap
      seats={position ? seats : seats.filter(s => visible.some(row => row.seat_id === s.seat_id))}
      selectedSeatId={inspected || null} onSelectSeat={toggle} highlightedSeatIds={new Set(highlighted)}
      robots={markers} selectedRobotId={null} onSelectRobot={() => {}} robotFocusKey={0} overlayInsetLeft={0} /></div>}
    {mapQuery.isError || layoutQuery.isError || imageError ? <Notice tone="warning">지도 또는 좌석 배치를 불러오지 못했습니다.</Notice> : null}
    {!legacy && mapQuery.isPending && <p role="status">지도 불러오는 중</p>}
    {showMap && map && <svg className="agent-mini-map" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="SLAM 지도와 좌석">
      <image href={scopedUrl(layers?.slam_url ?? map.image_url ?? '/api/map/image')} width={width} height={height} onError={() => setImageError(true)} />
      {layout?.map_id === map.map_id && layout.seats.map(s => {
        const rec = recordById.get(s.seat_id);
        if (!position && (!rec || (zone && rec.zone_id !== zone))) return null;
        const p = project(s.pose.x, s.pose.y, s.pose.yaw);
        const marked = picker ? !!rec?.selectable : position ? focus.includes(s.seat_id) : !!rec?.last_completed;
        const active = selected.includes(s.seat_id) || inspected === s.seat_id;
        return <g key={s.seat_id} className="agent-map-marker" data-marked={marked} data-active={active}
          transform={`translate(${p.x} ${p.y})`} onClick={() => toggle(s.seat_id)}>
          <title>{s.zone_id.toUpperCase()} {s.label} · {position ? (marked ? '질문한 좌석' : '좌석') : picker ? (marked ? '선택 가능' : '선택 불가') : (marked ? '완료 기록' : '완료 기록 없음')}</title>
          <rect x={-s.depth / map.resolution / 2} y={-s.width / map.resolution / 2} width={s.depth / map.resolution}
            height={s.width / map.resolution} rx={1.5} transform={`rotate(${p.heading ?? 0})`} />
          {(active || (position && marked)) && <circle r={3} />}
          {position && marked && focus.length <= 3 && <text y={-7} textAnchor="middle">{s.label}</text>}
        </g>;
      })}
      {robotPoint && <g className="agent-robot-pin" transform={`translate(${robotPoint.x} ${robotPoint.y})`} data-stale={poseStale} aria-label="로봇 위치">
        <circle className="agent-position-halo" r={13} /><circle r={7} />{robotPoint.heading != null && <path transform={`rotate(${robotPoint.heading})`} d="M 5 -4 L 15 0 L 5 4 Z" />}
      </g>}
    </svg>}
    {position ? <>{!!focus.length && <small>강조 좌석 · {focus.map(id => seatLabel(seats,id)).join(', ')}</small>}</> : <>
      {picker && visible.length > 0 && !relevant.length && <small>이 범위에서 작업을 요청할 수 있는 좌석이 없습니다.</small>}
      {zones.length > 1 && <NativeSelect aria-label="좌석 구역" value={zone} onChange={e => {setZone(e.target.value); setShowAll(false);}}>
        <option value="">전체 구역</option>{zones.map(z => <option key={z} value={z}>{z.toUpperCase()}</option>)}</NativeSelect>}
      {relevant.length < visible.length && (picker || relevant.length > 0) && <Button size="compact" variant="ghost" aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? '요약 보기' : '전체 좌석 보기'}</Button>}
      <div className="agent-seat-choices">{choices.map(s => <Button key={s.seat_id} size="compact"
        disabled={picker && (!s.selectable || (!selected.includes(s.seat_id) && selected.length >= limit))}
        aria-pressed={picker ? selected.includes(s.seat_id) : inspected === s.seat_id}
        aria-label={s.zone_id.toUpperCase() + ' ' + s.label + '번'} onClick={() => toggle(s.seat_id)}>
        {picker && selected.includes(s.seat_id) ? '✓ ' : !picker && s.last_completed ? '✓ ' : ''}{s.label}
      </Button>)}</div>
      {picker ? (records.some(s => s.selectable) || selected.length > 0) && <Button variant="primary" disabled={!selected.length || agent.busy || !agent.status?.can_approve || agent.context.page === '/map/edit'}
        onClick={() => void agent.send('선택한 자리 정리해 줘', selected)}>{selected.length}석 정리 초안 만들기</Button>
        : selectedRecord && <p>{selectedRecord.zone_id.toUpperCase()} {selectedRecord.label}번 · {selectedRecord.last_completed ?
          '마지막 완료 ' + formatDateTime(selectedRecord.last_completed) + (selectedRecord.profile ? ' · ' + executionSource(selectedRecord.profile) : '') : '완료 기록 없음'}</p>}
    </>}
  </div>;
}

import { Link, useSearchParams } from 'react-router';
import type { Mission, Robot, Seat } from '../../api/types';
import { Details, PanelHeader, StatusBadge, Surface } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { twinJointNames, movingTwinJoints } from "../../components/robot-twin-metadata";
import { RobotModel } from '../../components/RobotModel';
import { BatteryIcon } from '../../components/WorkspaceIcons';
import { HeadCamera } from '../manual-control/HeadCamera';
import { formatDateTime, missionTargetLabel } from '../../lib/operations';
import { ManualMode } from './ManualMode';
import { RobotAnalytics } from './RobotAnalytics';
import { useRobotTelemetry } from './use-robot-telemetry';
import { isStale, jointValues, lastJointValues, sample, sampleState, sourceLabel } from './data';
import './robot-operations.css';
export function RobotDashboard({ robot, active, seats }: { robot: Robot; active?: Mission; seats: Seat[] }) {
  const [params, setParams] = useSearchParams();
  const requestedMode = params.get('mode');
  const mode = requestedMode === 'manual' || requestedMode === 'diagnostics' ? requestedMode : 'overview';
  function setMode(next: 'overview' | 'manual' | 'diagnostics') {
    setParams(current => {
      const updated = new URLSearchParams(current);
      if (next === 'overview') updated.delete('mode');
      else updated.set('mode', next);
      return updated;
    }, { replace: true });
  }
  const query = useRobotTelemetry(robot.robot_id);
  const { data, isError } = query;
  const battery = sample(data, 'battery');
  const batteryData = battery?.observation.sample.kind === 'battery' ? battery.observation.sample : undefined;
  const supervisor = sample(data, 'supervisor_state');
  const system = supervisor?.observation.sample.kind === 'supervisor_state' ? supervisor.observation.sample.operating_state : undefined;
  const faults = sample(data, 'supervisor_faults');
  const faultList = faults?.observation.sample.kind === 'supervisor_faults' ? faults.observation.sample.faults.filter(f => f.active || f.latched) : [];
  const recovery = sample(data, 'supervisor_recoveries');
  const recoveries = recovery?.observation.sample.kind === 'supervisor_recoveries' ? recovery.observation.sample.recoveries : [];
  const joints = sample(data, 'joints'), targets = sample(data, 'joint_targets'), base = sample(data, 'base');
  const measured = jointValues(joints, isError), commanded = jointValues(targets, isError);
  const unmapped = Object.keys(measured).filter(name => !twinJointNames.has(name));
  const missingJoints = movingTwinJoints.filter(joint => measured[joint.name] === undefined);
  const targetData = targets?.observation.sample;
  const lastTargets = targetData?.kind === "joint_targets" ? Object.fromEntries(targetData.names.map((name, i) => [name, targetData.positions[i]])) : {};
  const lastMeasured = lastJointValues(joints);
  const baseData = base?.observation.sample.kind === 'base' ? base.observation.sample : undefined;
  const operating = robot.state === 'OFFLINE' ? '연결 끊김' : !isStale(supervisor, isError) && system === 'FAULT_LOCKED' || robot.state === 'ERROR' ? '오류' : !isStale(battery, isError) && batteryData?.charging === 'CHARGING' ? '충전' : robot.state === 'BUSY' ? '작업' : '대기';
  const alarm = operating === '오류' || robot.state === 'OFFLINE' || faultList.length > 0;
  const supervisorLabel = system ? ({ INITIALIZING: '준비 중', OPERATIONAL: '정상', DEGRADED: '제한 운용', FAULT_LOCKED: '장애 잠금' }[system]) : '미수신';
  return <div className="fleet-detail-content">
    <Surface className="robot-status-overview">
      <header className="robot-dashboard-heading">
        <div className="robot-identity">
          <div className="robot-identity-line">
            <h3>{robot.robot_id}</h3>
            <StatusBadge tone={alarm ? 'danger' : operating === '충전' ? 'success' : 'info'}>{operating}</StatusBadge>
            {robot.state !== 'OFFLINE' && <span className="robot-connection" aria-label="연결 상태"><span className="robot-connection-dot" data-online="true" />연결됨</span>}
            <span className="robot-battery" aria-label="배터리"><BatteryIcon aria-hidden="true" /><strong>{batteryData?.percentage == null ? '미수신' : `${Math.round(batteryData.percentage)}%`}</strong>
              {battery && (isStale(battery, isError) || (!query.isDemo && battery.observation.provenance !== 'real')) && <small data-stale={isStale(battery, isError)}>{sampleState(battery, isError)}</small>}
              {!isStale(battery, isError) && batteryData?.charging === 'CHARGING' && <small>충전 중</small>}
            </span>
            {query.isDemo ? <StatusBadge>예시 데이터</StatusBadge> : robot.control_mode === "mock" ? <StatusBadge tone="warning">모의 실행</StatusBadge> : null}
          </div>
          <div className="robot-identity-context">
            <span className="robot-mission-label" aria-label="현재 미션">{active ? <><Link to={'/missions?mission=' + encodeURIComponent(active.mission_id)}>{missionTargetLabel(active, seats)}</Link><span>· {active.phase === 'WORKING' ? '작업 중' : active.phase === 'RETURNING' ? '복귀 중' : '진행 중'}</span></> : robot.active_mission_id ? '배정 정보 조회 실패' : '배정 없음'}</span>
            <span className="robot-supervisor-label" aria-label="System Supervisor">시스템 {supervisorLabel}{supervisor && (isStale(supervisor, isError) || (!query.isDemo && supervisor.observation.provenance !== 'real')) && <span data-stale={isStale(supervisor, isError)}>· {sampleState(supervisor, isError)}</span>}</span>
            {(isError || !data?.connected) && <span>관측 {isError ? '조회 실패' : '미연결'}</span>}
          </div>
        </div>
        <div className="robot-mode-switch" role="group" aria-label="로봇 화면 모드">
          <Button size="compact" variant={mode === 'overview' ? 'secondary' : 'ghost'} aria-pressed={mode === 'overview'} onClick={() => setMode('overview')}>관제</Button>
          <Button size="compact" variant={mode === 'manual' ? 'secondary' : 'ghost'} aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>수동 조종</Button>
          <Button size="compact" variant={mode === 'diagnostics' ? 'secondary' : 'ghost'} aria-pressed={mode === 'diagnostics'} onClick={() => setMode('diagnostics')}>진단</Button>
        </div></header>
      {((alarm && !faultList.length) || isError || (supervisor && isStale(supervisor, isError))) && <div className="robot-inline-alert" role="status">{isError ? '실시간 관측 조회 실패' : robot.state === 'OFFLINE' ? '로봇 연결 끊김 · 마지막 수신 정보' : isStale(supervisor, isError) && supervisor ? 'Supervisor 갱신 중단' : '장애 확인 필요'}{isError && <Button size="compact" onClick={() => void query.refetch()}>다시 시도</Button>}</div>}
      {faultList.length > 0 && <ul className="robot-faults">{faultList.map(f => <li key={f.code}><StatusBadge tone="danger">{f.latched ? '장애 잠금' : '장애'}</StatusBadge><strong>{f.detail || f.code}</strong>{isStale(faults, isError) && <StatusBadge>갱신 중단</StatusBadge>}</li>)}</ul>}
      {recoveries.filter(r => r.state === 'RUNNING' || ((r.state === 'FAILED' || r.state === 'CANCELED') && faultList.some(f => f.code === r.fault_code))).map(r => <div className="robot-recovery" key={r.job_id}><StatusBadge tone={r.state === 'FAILED' ? 'danger' : r.state === 'SUCCEEDED' ? 'success' : 'waiting'}>{({ RUNNING: '복구 중', SUCCEEDED: '복구 완료', FAILED: '복구 실패', CANCELED: '복구 취소', IDLE: '복구 대기' })[r.state]}</StatusBadge><span>{r.detail || faultList.find(f => f.code === r.fault_code)?.detail || r.fault_code} · {r.attempt}회{r.verifying_health ? ' · 상태 재확인 중' : ''}</span>{isStale(recovery, isError) && <StatusBadge>갱신 중단</StatusBadge>}</div>)}
    </Surface>
    {mode === 'manual' ? <ManualMode robotId={robot.robot_id} /> : mode === 'diagnostics' ? <Surface className="robot-diagnostics"><PanelHeader title="개발자 진단" />
      <dl><div><dt>Gateway 마지막 수신</dt><dd>{formatDateTime(robot.last_seen_at)}</dd></div><div><dt>실행 출처</dt><dd>{Object.entries(robot.execution_profile ?? {}).map(([k,v]) => `${k}: ${v}`).join(' / ') || '미확인'}</dd></div></dl>
      <h4>모델 연동</h4>
      <dl>
        <div><dt>관절</dt><dd>{Object.keys(measured).length}개 수신 · {missingJoints.length}개 미수신{unmapped.length > 0 && ` · ${unmapped.length}개 미매핑`}</dd></div>
        <div><dt>베이스</dt><dd>{baseData ? baseData.child_frame_id !== 'base_link' ? '프레임 미매핑' : isStale(base, isError) ? '갱신 중단' : `${baseData.frame_id} 기준` : '미수신'}</dd></div>
        <div><dt>그리퍼 모델</dt><dd>고정 툴 CAD · 관측값만 표시</dd></div>
      </dl>
      <h4>관측 소스</h4><div className="robot-diagnostic-table"><table><thead><tr><th>소스</th><th>토픽</th><th>수신 시각</th><th>상태</th></tr></thead><tbody>{Object.entries(data?.samples ?? {}).map(([kind, item]) => <tr key={kind}><td>{kind}</td><td>{item.observation.source_topic}</td><td>{formatDateTime(item.received_at)}</td><td>{sampleState(item, isError)}</td></tr>)}</tbody></table></div>
      {!Object.keys(data?.samples ?? {}).length && <p>관측 데이터 없음</p>}
      <h4>관절 상태</h4><div className="robot-diagnostic-table"><table><thead><tr><th>관절</th><th>실측</th><th>명령 목표</th></tr></thead><tbody>{[...new Set([...Object.keys(lastMeasured), ...Object.keys(lastTargets)])].map(name => <tr key={name}><td>{name}</td><td>{lastMeasured[name]?.toFixed(4) ?? '미수신'}{lastMeasured[name] !== undefined && measured[name] === undefined ? ' · 갱신 중단' : ''}</td><td>{lastTargets[name]?.toFixed(4) ?? '미수신'}{lastTargets[name] !== undefined && commanded[name] === undefined ? ' · 갱신 중단' : ''}</td></tr>)}</tbody></table></div>
      <p className="robot-data-source">회전 관절 rad · 직선 관절 m</p><Details label="원시 관측값"><pre>{JSON.stringify(data?.samples ?? {}, null, 2)}</pre></Details>
    </Surface> : <>
      <div className="robot-live-grid">
        <Surface padding="none" className="robot-twin"><PanelHeader title="Digital Twin" action={<StatusBadge tone={Object.keys(measured).length ? 'success' : 'neutral'}>{Object.keys(measured).length ? joints!.observation.provenance === 'real' ? '실시간' : sourceLabel(joints!.observation.provenance) : joints ? '갱신 중단' : '미연결'}</StatusBadge>} />
          <RobotModel hoverEnabled={false} twin={{ positions: lastMeasured, orientation: baseData?.child_frame_id === "base_link" ? baseData.orientation : undefined }} />
        </Surface>
        <Surface padding="none" className="robot-live-camera"><HeadCamera robotId={robot.robot_id} /></Surface>
      </div>
      <RobotAnalytics robotId={robot.robot_id} />
    </>}
  </div>;
}

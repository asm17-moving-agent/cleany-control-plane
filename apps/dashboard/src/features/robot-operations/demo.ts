import type { Analytics, Sample, Telemetry } from './data';
/** Display-only examples. Never written to the API or shared operations provider. */
export function demoTelemetry(robot: string, now: string): Telemetry {
  const samples: Sample[] = [
    { kind: 'battery', percentage: 76, voltage: 24.8, charging: 'DISCHARGING' },
    { kind: 'supervisor_state', epoch: 'display-only', operating_state: robot === 'cleany-02' ? 'FAULT_LOCKED' : 'OPERATIONAL' },
    { kind: 'supervisor_faults', epoch: 'display-only', faults: robot === 'cleany-02' ? [{ code: 'SENSOR_TIMEOUT', source: 'example', severity: 'error', active: true, latched: true, recovery_policy: 'automatic', detail: '센서 응답 대기' }] : [] },
    { kind: 'supervisor_recoveries', epoch: 'display-only', recoveries: robot === 'cleany-02' ? [{ job_id: 'example', fault_code: 'SENSOR_TIMEOUT', state: 'RUNNING', attempt: 1, verifying_health: true, resource_held: true, detail: '센서 연결 재확인' }] : [] },
  ];
  // No synthesized joint poses or camera frames: unreceived sensors remain visibly unreceived.
  return { robot_id: robot, connected: robot !== 'cleany-03', poll_interval_ms: 200, samples: Object.fromEntries(samples.map((value, i) => [value.kind, {
    received_at: now, expires_at: '2100-01-01T00:00:00Z', stale: robot === 'cleany-03', observation: { schema_version: 1, boot_id: 'display-only', sequence: i, source_topic: '/example/' + value.kind, source_stamp: 1, source_age_seconds: 0, provenance: 'mock', sample: value },
  }])) };
}
export function demoAnalytics(robot: string, start: string, end: string, now: number): Analytics {
  const left = Date.parse(start), right = Math.max(left, Math.min(Date.parse(end), now));
  const hours = Math.ceil((right - left) / 3600000);
  const states = ['WORKING', 'MOVING', 'IDLE', 'CHARGING', 'FAULT', 'UNKNOWN'] as const;
  const fractions = [.32, .18, .25, .18, .02, .05];
  const events = [
    ['MISSION_COMPLETED', '작업 완료', '정리 작업 종료', 'info'],
    ['RECOVERY_SUCCEEDED', '자동 복구 완료', '센서 연결 복원', 'info'],
    ['FAULT_RAISED', '장애 발생', '센서 응답 지연', 'warning'],
    ['CHARGE_ENDED', '충전 종료', '', 'info'],
    ['CHARGE_STARTED', '충전 시작', '', 'info'],
  ];
  return { robot_id: robot, start, end: new Date(right).toISOString(), window_seconds: (right-left)/1000, observed_seconds: (right-left)/1000*.95, retention_days: 90, provenance: hours ? ['mock'] : [], next_event_cursor: null,
    battery: Array.from({ length: hours }, (_, i) => ({ time: new Date(left + i*3600000).toISOString(), percentage: 89 - (i % 8)*5 + (i % 12 > 8 ? 10 : 0), charging_percentage: i % 12 > 8 ? 89 - (i % 8)*5 + 10 : null, samples: 120 })),
    activities: hours ? states.map((state, i) => ({ state, seconds: (right-left)/1000*fractions[i] })) : [],
    events: hours ? events.map(([kind, title, detail, severity], i) => ({ event_id: `example-${i}`, occurred_at: new Date(left + (right-left)*(1-(i+1)/6)).toISOString(), kind, title, detail, severity, provenance: 'mock', mission_id: null })) : [],
  };
}

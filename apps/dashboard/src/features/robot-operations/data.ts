import type { components } from '../../api/generated/openapi';
export type Telemetry = components['schemas']['RobotTelemetrySnapshot'];
export type Analytics = components['schemas']['RobotAnalytics'];
export type Observed = components['schemas']['ObservedSample'];
export type Sample = Observed['observation']['sample'];
export type Kind = Sample['kind'];
export const activityLabels = { WORKING: '작업', MOVING: '이동', IDLE: '대기', CHARGING: '충전', FAULT: '장애', STOPPED: '정지', UNKNOWN: '미수신' } as const;
export const sourceLabel = (value: string) => ({ real: '실측', sim: '시뮬레이션', mock: '예시', unknown: '출처 미확인' }[value] ?? value);
export function sample<K extends Kind>(snapshot: Telemetry | undefined, kind: K) {
  const item = snapshot?.samples?.[kind];
  return item?.observation.sample.kind === kind ? item : undefined;
}
export function isStale(item: Observed | undefined, failed = false, now = Date.now()) {
  return !item || failed || item.stale || now >= Date.parse(item.expires_at);
}
export function sampleState(item: Observed | undefined, failed = false) {
  return !item ? '미수신' : isStale(item, failed) ? '갱신 중단' : sourceLabel(item.observation.provenance);
}
export function duration(seconds: number) {
  if (seconds < 60) return `${Math.floor(seconds)}초`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}
export function localDay(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
}
export function dayRange(day: string, days: number) {
  const start = new Date(day + 'T00:00:00+09:00');
  const end = new Date(start.getTime() + 86400000);
  start.setTime(start.getTime() - (days - 1)*86400000);
  return { start: start.toISOString(), end: end.toISOString() };
}
export function jointValues(item: Observed | undefined, failed = false, now = Date.now()) {
  const values: Record<string, number> = {};
  if (isStale(item, failed, now)) return values;
  const data = item!.observation.sample;
  if (data.kind !== 'joints' && data.kind !== 'joint_targets') return values;
  // Every joint retains its own source age: wheel updates cannot refresh an old arm sample.
  const remaining = (Date.parse(item!.expires_at) - now) / 1000;
  data.names.forEach((name, index) => {
    if ((data.ages_seconds?.[index] ?? 0) < remaining) values[name] = data.positions[index];
  });
  return values;
}
/** Last observed values remain usable for a visibly stale pose; never include targets. */
export function lastJointValues(item: Observed | undefined) {
  const data = item?.observation.sample;
  return data?.kind === 'joints' ? Object.fromEntries(data.names.map((name, i) => [name, data.positions[i]])) : {};
}

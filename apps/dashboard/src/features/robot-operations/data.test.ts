import { describe, expect, it } from 'vitest';
import { dayRange, jointValues, lastJointValues, type Observed } from './data';
const now = Date.parse('2026-11-17T00:00:00Z');
const observation: Observed = { received_at: new Date(now).toISOString(), expires_at: new Date(now+3000).toISOString(), stale: false,
  observation: { schema_version: 1, boot_id: 'fixture', sequence: 1, source_topic: '/joint_states', source_stamp: 1, source_age_seconds: 0, provenance: 'sim',
    sample: { kind: 'joints', names: ['arm', 'wheel'], positions: [.2, 1], ages_seconds: [2.5, 0] } } };
describe('robot observations', () => {
  it('expires each joint separately and retains explicitly stale last measurements', () => {
    expect(jointValues(observation, false, now+1000)).toEqual({wheel:1});
    expect(jointValues(observation, false, now+4000)).toEqual({});
    expect(jointValues(observation, true, now)).toEqual({});
    expect(lastJointValues({...observation,stale:true})).toEqual({arm:.2,wheel:1});
  });
  it('never substitutes a commanded target into the measured model', () => {
    const target = structuredClone(observation);
    target.observation.sample.kind = 'joint_targets';
    expect(lastJointValues(target)).toEqual({});
  });
  it('uses Korea calendar boundaries for periods, including month boundaries', () => {
    expect(dayRange('2026-11-01',7)).toEqual({start:'2026-10-25T15:00:00.000Z',end:'2026-11-01T15:00:00.000Z'});
  });
});

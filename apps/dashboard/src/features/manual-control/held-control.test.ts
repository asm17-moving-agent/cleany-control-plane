import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeldControl, manualConnection, stickAxes, type Command } from './held-control';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('manual hold controller', () => {
  it('keeps a 70ms heartbeat only while held, and never resumes after release', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue({});
    const held = new HeldControl(send, vi.fn(), vi.fn(), 'fixture-browser-123');
    expect(send).not.toHaveBeenCalled();
    held.press('forward', .5);
    await vi.advanceTimersByTimeAsync(220);
    expect(send.mock.calls[0][0].action).toBe('press');
    expect(send.mock.calls.filter(c => c[0].action === 'update').length).toBeGreaterThan(2);
    held.stop();
    const count = send.mock.calls.length;
    expect(send.mock.lastCall?.[0].action).toBe('stop');
    expect(send.mock.lastCall?.[1]).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(count);
    const numbers = send.mock.calls.map(c => c[0].sequence);
    expect(numbers).toEqual([...numbers].sort((a,b) => a-b));
  });

  it('STOP overtakes an unresolved press and its late reply cannot start updates', async () => {
    vi.useFakeTimers();
    let complete!: () => void;
    const send = vi.fn((c: Command) => c.action === 'press' ? new Promise<void>(resolve => { complete = resolve; }) : Promise.resolve());
    const held = new HeldControl(send, vi.fn(), vi.fn());
    held.press('cw', .5); held.stop(); complete();
    await vi.advanceTimersByTimeAsync(1000);
    expect(send.mock.calls.map(c => c[0].action)).toEqual(['press','stop']);
  });

  it('network errors stop the hold and require a fresh press', async () => {
    vi.useFakeTimers();
    const failed = vi.fn();
    const send = vi.fn((c: Command) => c.action === 'update' ? Promise.reject(new Error('timeout')) : Promise.resolve());
    const held = new HeldControl(send, vi.fn(), failed);
    held.press('left', .5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send.mock.calls.map(c => c[0].action)).toEqual(['press','update','stop']);
    expect(failed).toHaveBeenCalledWith('timeout');
  });

  it('disposal sends only STOP for an active hold', async () => {
    const send = vi.fn().mockResolvedValue({});
    const held = new HeldControl(send, vi.fn(), vi.fn());
    held.press('backward', .5); held.dispose(); held.press('forward', .5);
    await Promise.resolve();
    expect(send.mock.calls.map(c => c[0].action)).toEqual(['press','stop']);
  });

  it('freezes the original facility and CSRF for release after navigation', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    const connection = manualConnection('cleany-01', 'original-site', 'original-csrf');
    await connection.send({client:'fixture-browser-123',sequence:2,action:'stop'}, true);
    expect(fetch.mock.calls[0][0]).toContain('site_id=original-site');
    expect(fetch.mock.calls[0][1]).toMatchObject({ keepalive:true,headers:{'X-CSRF-Token':'original-csrf'} });
  });
});


describe('analog inputs', () => {
  it('matches radial limits, dead zone and movement/rotation signs', () => {
    expect(stickAxes(3, 4, 100).vector).toEqual([0, 0, 0]);
    expect(stickAxes(0, -100, 100).vector[0]).toBeCloseTo(1);
    expect(stickAxes(-100, 0, 100).vector[1]).toBeCloseTo(1);
    const diagonal = stickAxes(-200, -200, 100).vector;
    expect(diagonal[0]).toBeCloseTo(Math.SQRT1_2);
    expect(diagonal[1]).toBeCloseTo(Math.SQRT1_2);
    expect(stickAxes(-100, 50, 100, true).vector[2]).toBeCloseTo(1);
    expect(stickAxes(100, 50, 100, true).vector[2]).toBeCloseTo(-1);
    expect(stickAxes(-100, -50, 100, false, true).vector[1]).toBeCloseTo(0);
    expect(stickAxes(0, -50, 100).vector[0]).toBeCloseTo(.42 / .92);
  });
  it('updates the held vector without starting another press', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockResolvedValue({});
    const held = new HeldControl(send, vi.fn(), vi.fn());
    held.press([.3, -.2, 0], .5);
    await vi.advanceTimersByTimeAsync(80);
    held.press([.7, .1, -.4], .5);
    await vi.advanceTimersByTimeAsync(80);
    expect(send.mock.lastCall?.[0].vector).toEqual([.7, .1, -.4]);
    expect(send.mock.calls.filter(call => call[0].action === 'press')).toHaveLength(1);
    held.stop();
    const count = send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(count);
  });
});

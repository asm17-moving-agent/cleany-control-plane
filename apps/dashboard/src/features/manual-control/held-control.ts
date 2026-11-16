import type { components } from '../../api/generated/openapi';
export type Command = components['schemas']['ManualCommand'];
export type ManualState = components['schemas']['ManualStatus'];
export type Direction = NonNullable<Command['direction']>;
export type Vector = [number, number, number];
type Send = (command: Command, keepalive?: boolean) => Promise<unknown>;

/** Same circular bound and 8% radial dead zone as cleany_teleop/ui/hold_input.cjs. */
export function stickAxes(dx: number, dy: number, radius: number, rotation = false, forwardOnly = false) {
  let x = dx / Math.max(1, radius), y = rotation ? 0 : dy / Math.max(1, radius);
  if (forwardOnly && !rotation) x = 0;
  const distance = Math.hypot(x, y), bounded = Math.min(1, distance);
  if (distance > 1) { x /= distance; y /= distance; }
  if (bounded <= .08) return { x: 0, y: 0, vector: [0, 0, 0] as Vector };
  const gain = (bounded - .08) / (.92 * bounded);
  return { x, y, vector: [rotation ? 0 : -y * gain, rotation ? 0 : -x * gain, rotation ? -x * gain : 0] as Vector };
}

/** Each hold needs a new press; errors, release and disposal never resume motion. */
export class HeldControl {
  private sequence = 0;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending = 0;
  private held = false;
  private disposed = false;
  private intent: { direction?: Direction; vector?: Vector; speed: number } = { speed: .5 };
  constructor(private send: Send, private changed: (held: boolean) => void,
    private failed: (message: string) => void, private client: string = crypto.randomUUID()) {}

  press(direction: Direction | Vector, speed: number) {
    if (this.disposed) return;
    this.intent = typeof direction === 'string' ? { direction, speed } : { vector: [...direction], speed };
    if (this.held) return;
    this.held = true;
    this.changed(true);
    const generation = ++this.generation;
    const send = async (action: 'press' | 'update') => {
      if (!this.held || generation !== this.generation || this.pending >= 3) return;
      this.pending++;
      try {
        await this.send({ client: this.client, sequence: ++this.sequence, action, ...this.intent });
      } catch (error) {
        if (generation === this.generation) {
          this.stop();
          this.failed(error instanceof Error ? error.message : '조종 연결이 끊겼습니다.');
        }
      } finally { this.pending--; }
    };
    void send('press').then(() => {
      if (!this.held || generation !== this.generation) return;
      void send('update');
      this.timer = setInterval(() => void send('update'), 70);
    });
  }

  stop(force = false) {
    if (!this.held && !force) return;
    this.held = false;
    ++this.generation;
    clearInterval(this.timer);
    this.timer = undefined;
    this.changed(false);
    // A newer STOP overtakes in-flight press/update requests at the phone server.
    void this.send({ client: this.client, sequence: ++this.sequence, action: 'stop' }, true)
      .catch(() => { if (!this.disposed) this.failed('정지 응답 미확인 · 로봇 상태를 확인하세요.'); });
  }

  dispose() { this.disposed = true; this.stop(); }
}

/** Freeze authentication/scope so leaving a facility sends STOP to the original robot. */
export function manualConnection(robotId: string, siteId: string, csrf: string) {
  const base = `/api/robots/${encodeURIComponent(robotId)}/manual/`;
  async function call(path: string, command?: Command, keepalive = false): Promise<ManualState> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), command ? 350 : 800);
    try {
      const response = await fetch(`${base}${path}?site_id=${encodeURIComponent(siteId)}`, {
        signal: controller.signal, keepalive,
        ...(command ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(command) } : {}),
      });
      if (response.status === 401) window.dispatchEvent(new Event('cleany:auth-expired'));
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : '조종 요청 실패');
      return result;
    } finally { clearTimeout(timer); }
  }
  return { status: () => call('status'), send: (command: Command, keepalive = false) => call('control', command, keepalive) };
}

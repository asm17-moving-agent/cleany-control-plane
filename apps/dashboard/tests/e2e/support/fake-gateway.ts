import { randomUUID } from "node:crypto";

export const profile = { navigation: "sim", perception: "mock", planning: "mock", execution: "mock" };

// Test-only network peer. It simulates the contract, never issues ROS commands.
export class FakeGateway {
  socket!: WebSocket;
  heartbeat?: ReturnType<typeof setInterval>;
  offers: Record<string, any>[] = [];
  cancels: Record<string, any>[] = [];
  state = "IDLE";
  activeId: string | null = null;
  phase: string | null = null;
  sequence = new Map<string, number>();
  reports: Record<string, any>[] = [];
  snapshots = new Map<string, string[]>();
  bootId = randomUUID();
  constructor(readonly url: string) {}

  message(kind: string, payload: Record<string, any>, missionId: string | null = null, sequence = 0) {
    return { schema_version: 1, event_id: randomUUID(), robot_id: "cleany-01", mission_id: missionId,
      event_type: kind, sequence, occurred_at: new Date().toISOString(), payload };
  }
  send(message: Record<string, any>) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  snapshot() {
    const snapshot = this.message("robot.snapshot", {
      boot_id: this.bootId, state: this.state, active_mission_id: this.activeId,
      active_phase: this.phase, active_sequence: this.activeId ? this.sequence.get(this.activeId) : 0,
      supported_seat_ids: ["seat-12", "seat-18"], can_cancel: true, execution_profile: profile,
      completed_reports: this.reports.map(({ event_id, mission_id, sequence, occurred_at, payload }) =>
        ({ event_id, mission_id, sequence, occurred_at, payload })),
    });
    this.snapshots.set(snapshot.event_id, this.reports.map(report => report.event_id));
    this.send(snapshot);
  }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("error", () => reject(new Error("Fake Gateway connection failed")));
      this.socket.addEventListener("message", event => {
        const message = JSON.parse(String(event.data));
        if (message.event_type === "sync.request") this.snapshot();
        else if (message.event_type === "mission.offer") this.offers.push(message);
        else if (message.event_type === "mission.cancel") this.cancels.push(message);
        else if (message.event_type === "ack") {
          const ack = message.payload.ack_event_id;
          const included = this.snapshots.get(ack) ?? [];
          this.reports = this.reports.filter(report => report.event_id !== ack && !included.includes(report.event_id));
          if (this.snapshots.has(ack)) resolve();
        }
      });
    });
    this.heartbeat = setInterval(() => this.send(this.message("robot.heartbeat", {
      boot_id: this.bootId, state: this.state, active_mission_id: this.activeId,
    })), 1000);
  }
  emit(kind: string, missionId: string, payload: Record<string, any>) {
    const sequence = (this.sequence.get(missionId) ?? 0) + 1;
    this.sequence.set(missionId, sequence);
    const message = this.message(kind, payload, missionId, sequence);
    if (kind === "mission.result") this.reports.push(message);
    this.send(message);
  }
  accept(missionId: string) {
    this.state = "BUSY"; this.activeId = missionId; this.phase = "ACCEPTED";
    this.emit("mission.accepted", missionId, {});
  }
  progress(missionId: string, phase: string) {
    this.phase = phase;
    this.emit("mission.phase", missionId, { phase });
  }
  finish(missionId: string, outcome = "SUCCESS") {
    this.state = "IDLE"; this.activeId = null; this.phase = null;
    this.emit("mission.result", missionId, { outcome, execution_profile: profile,
      completed_tasks: outcome === "SUCCESS" ? ["pick_object", "place_object"] : [],
      message: "Fake Gateway contract scenario; no physical execution." });
  }
  async disconnect() {
    clearInterval(this.heartbeat);
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>(resolve => { this.socket.addEventListener("close", () => resolve(), { once: true }); this.socket.close(); });
  }
}

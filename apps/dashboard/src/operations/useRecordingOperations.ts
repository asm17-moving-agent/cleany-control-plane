import { useEffect, useRef, useState } from "react";
import type { Mission, MissionRequest, Robot } from "../api/types";
import { operationsDemo } from "./operations-demo";
import { routeMotion, recordingRoute, RECORDING_HOME, RECORDING_TIMING as timing, type RecordingPoint } from "./recording-route";
import type { OperationsContextValue } from "./OperationsContext";

type Run = { id: string; started: number; duration: number; route: RecordingPoint[] };
const seats = operationsDemo.seats.map(seat => ({ ...seat, occupancy: "AVAILABLE" as const }));

export function useRecordingOperations(): OperationsContextValue {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(Date.now);
  const parked = useRef(RECORDING_HOME);
  const submitted = useRef(new Map<string, Mission>());
  const elapsed = run ? Math.max(0, now - run.started) : 0;
  const returningAt = timing.accepted + (run?.duration ?? 0) + timing.working;
  const phase: Mission["phase"] = !run ? "QUEUED" : elapsed < timing.offered ? "OFFERED"
    : elapsed < timing.accepted ? "ACCEPTED" : elapsed < timing.accepted + run.duration ? "NAVIGATING"
    : elapsed < returningAt ? "WORKING" : elapsed < returningAt + run.duration ? "RETURNING" : "TERMINAL";
  const motion = run ? routeMotion(phase === "RETURNING" ? [...run.route].reverse() : run.route,
    phase === "RETURNING" ? elapsed - returningAt : Math.max(0, elapsed - timing.accepted)) : undefined;
  const position = !run ? parked.current : phase === "NAVIGATING" ? motion!.position
    : phase === "WORKING" ? run.route[run.route.length - 1]
    : phase === "RETURNING" ? motion!.position
    : run.route[0];
  const positionRef = useRef(position); positionRef.current = position;

  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => setNow(Date.now()), timing.tick);
    return () => window.clearInterval(timer);
  }, [run]);
  useEffect(() => {
    if (run) {
      if (phase === "TERMINAL") {
        parked.current = run.route[0];
        setMissions(current => current.map(mission => mission.mission_id === run.id
          ? { ...mission, phase: "TERMINAL", outcome: "SUCCESS", message: "촬영용 작업 완료", sequence: 6 } : mission));
        setRun(null);
      }
      return;
    }
    const next = [...missions].filter(mission => mission.phase === "QUEUED")
      .sort((a, b) => Number(b.priority === "HIGH") - Number(a.priority === "HIGH"))[0];
    if (!next) return;
    const seat = seats.find(seat => seat.seat_id === next.seat_id)!;
    const route = recordingRoute(seat, parked.current), started = Date.now();
    setNow(started);
    setRun({ id: next.mission_id, started, route, duration: routeMotion(route).duration });
  }, [run, phase, missions]);

  const displayedMissions = missions.map(mission => mission.mission_id === run?.id
    ? { ...mission, phase, outcome: phase === "TERMINAL" ? "SUCCESS" as const : null,
      message: "촬영용 시나리오 · 실제 로봇에는 전송하지 않습니다." } : mission);
  const robot: Robot = { robot_id: "cleany-01", state: run && phase !== "TERMINAL" ? "BUSY" : "IDLE",
    active_mission_id: run && phase !== "TERMINAL" ? run.id : null, last_seen_at: new Date(now).toISOString() };
  async function createMission(request: MissionRequest): Promise<Mission> {
    const existing = submitted.current.get(request.idempotency_key);
    if (existing) return existing;
    const target = request.target;
    if (!target || target.kind !== "SEAT") throw new Error("촬영 모드에서는 좌석 작업만 가능합니다.");
    const seat = seats.find(seat => seat.seat_id === target.reference_id);
    if (!seat) throw new Error("좌석을 찾을 수 없습니다.");
    recordingRoute(seat);
    const mission: Mission = { ...request, requested_by: "display-demo", mission_id: crypto.randomUUID(), target,
      seat_id: seat.seat_id, phase: "QUEUED", outcome: null, sequence: 0, cancel_requested: false,
      created_at: new Date().toISOString(), message: "촬영용 요청", before_observation: null, after_observation: null };
    submitted.current.set(request.idempotency_key, mission);
    setMissions(current => [...current, mission]);
    return mission;
  }
  async function cancelMission(id: string): Promise<Mission> {
    const mission = displayedMissions.find(mission => mission.mission_id === id);
    if (!mission) throw new Error("요청을 찾을 수 없습니다.");
    if (mission.phase === "TERMINAL") return mission;
    const cancelled: Mission = { ...mission, phase: "TERMINAL", outcome: "CANCELLED", cancel_requested: true };
    if (run?.id === id) { parked.current = positionRef.current; setRun(null); }
    setMissions(current => current.map(item => item.mission_id === id ? cancelled : item));
    return cancelled;
  }
  return { seats, missions: displayedMissions, robots: [robot], robot, events: [],
    recordingPosition: position,
    recordingHeading: motion?.heading,
    recordingPath: run && phase !== "TERMINAL" ? {
      points: phase === "RETURNING" ? [...run.route].reverse() : run.route, returning: phase === "RETURNING",
      progress: motion?.progress ?? 0,
    } : undefined,
    connectionState: "connected", isLoading: false, error: null,
    refresh: async () => {}, createMission, cancelMission, isCreatingMission: false };
}

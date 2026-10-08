import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, scopedUrl } from "../api/client";
import { queryKeys as defaultKeys } from "../api/queryKeys";
import { useAuthOptional } from "../auth/AuthContext";
import type { Mission, MissionRequest, OperationsEvent, Robot, RobotPose, Seat } from "../api/types";
import { useSettings } from "../settings/SettingsContext";
import { useDemoMode } from "./DemoModeContext";
import { operationsDemo } from "./operations-demo";
import type { SeatCleaningStates } from "../lib/seat-summary";
import { useRecordingOperations } from "./useRecordingOperations";
import type { RecordingPath } from "./recording-route";
import { POSE_STALE_TIMEOUT_MS, validPoseSnapshot } from "../features/robot-pose/robot-pose";

type ConnectionState = "connecting" | "connected" | "error";

export interface OperationsContextValue {
  recordingPosition?: { x: number; y: number };
  recordingHeading?: number;
  recordingPath?: RecordingPath;
  seats: Seat[];
  // Absent for live data until the API supplies a current cleaning snapshot.
  seatCleaning?: SeatCleaningStates;
  missions: Mission[];
  robots: Robot[];
  robot: Robot | null;
  events: OperationsEvent[];
  connectionState: ConnectionState;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createMission: (request: MissionRequest) => Promise<Mission>;
  cancelMission: (missionId: string) => Promise<Mission>;
  isCreatingMission: boolean;
  pose?: RobotPose | null;
  poseStale?: boolean;
}

const OperationsContext = createContext<OperationsContextValue | null>(null);

export function OperationsProvider({ children }: PropsWithChildren) {
  const { isDemo, isRecording } = useDemoMode();
  return isRecording ? <RecordingOperationsProvider>{children}</RecordingOperationsProvider>
    : isDemo ? <DemoOperationsProvider>{children}</DemoOperationsProvider>
    : <LiveOperationsProvider>{children}</LiveOperationsProvider>;
}
function RecordingOperationsProvider({ children }: PropsWithChildren) {
  const value = useRecordingOperations();
  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

async function rejectDemoCommand(): Promise<Mission> {
  throw new Error("예시 모드에서는 작업 요청과 취소를 전송하지 않습니다.");
}
const demoValue: OperationsContextValue = {
  ...operationsDemo, robot: operationsDemo.robots[0], events: [],
  connectionState: "connected", isLoading: false, error: null,
  refresh: async () => {}, createMission: rejectDemoCommand, cancelMission: rejectDemoCommand,
  isCreatingMission: false,
  pose: null, poseStale: true,
};
function DemoOperationsProvider({ children }: PropsWithChildren) {
  return <OperationsContext.Provider value={demoValue}>{children}</OperationsContext.Provider>;
}

function LiveOperationsProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const auth = useAuthOptional();
  const scope = auth ? [auth.session?.customer_id, auth.site?.site_id] : [];
  const scopeKey = scope.join(":");
  const queryKeys = useMemo(() => ({
    seats: [...defaultKeys.seats, ...scope], missions: [...defaultKeys.missions, ...scope],
    robots: [...defaultKeys.robots, ...scope],
  }), [scopeKey]);
  const { settings } = useSettings();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<OperationsEvent[]>([]);
  const [pose, setPose] = useState<RobotPose | null>(null);
  const [poseStale, setPoseStale] = useState(true);
  const pollingInterval = connectionState === "connected"
    ? false
    : Number(settings.refreshSeconds) * 1000;

  const seatsQuery = useQuery({
    queryKey: queryKeys.seats,
    queryFn: api.seats,
    staleTime: 60_000,
  });
  const missionsQuery = useQuery({
    queryKey: queryKeys.missions,
    queryFn: api.missions,
    refetchInterval: pollingInterval,
  });
  const robotsQuery = useQuery({
    queryKey: queryKeys.robots,
    queryFn: api.robots,
    refetchInterval: pollingInterval,
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.seats }),
      queryClient.invalidateQueries({ queryKey: queryKeys.missions }),
      queryClient.invalidateQueries({ queryKey: queryKeys.robots }),
    ]);
  }, [queryClient, queryKeys]);

  useEffect(() => {
    const source = new EventSource(scopedUrl("/api/events/stream"));
    let disposed = false;
    let revision = 0;
    let newestTimestamp = -Infinity;
    let lastReceipt = -Infinity;
    const applySnapshot = (snapshot: unknown) => {
      if (disposed || !validPoseSnapshot(snapshot)) return;
      const timestamp = snapshot.pose ? Date.parse(snapshot.pose.received_at) : -Infinity;
      if (timestamp < newestTimestamp) return;
      newestTimestamp = timestamp;
      setPose(snapshot.pose);
      setPoseStale(snapshot.stale);
      lastReceipt = performance.now();
    };
    const refreshPose = () => {
      const requestedRevision = ++revision;
      void fetch(scopedUrl("/api/robots/cleany-01/pose")).then(response => response.ok ? response.json() : null)
        .then(snapshot => {
          // A newer stream event always wins over an in-flight HTTP snapshot.
          if (requestedRevision === revision) applySnapshot(snapshot);
        }).catch(() => {
          if (!disposed && requestedRevision === revision) setPoseStale(true);
        });
    };
    source.addEventListener("open", () => {
      setConnectionState("connected"); refreshPose(); void refresh();
    });
    source.addEventListener("update", (event) => {
      try {
        const operationEvent = JSON.parse(event.data) as OperationsEvent;
        if (operationEvent.event_type === "robot.pose" || operationEvent.event_type === "robot.pose.stale") {
          if (operationEvent.robot_id === "cleany-01" && validPoseSnapshot(operationEvent.payload)) {
            revision++;
            applySnapshot(operationEvent.payload);
          }
          return;
        }
        setEvents((current) => [operationEvent, ...current].slice(0, 20));
      } catch {
        // Invalid event data is recovered by the state refresh below.
      }
      void refresh();
    });
    source.addEventListener("auth.expired", () => {
      source.close(); window.dispatchEvent(new Event("cleany:auth-expired"));
    });
    source.addEventListener("error", () => {
      if (auth) void fetch("/api/auth/me").then(response => {
        if (response.status === 401) { source.close(); window.dispatchEvent(new Event("cleany:auth-expired")); }
      }).catch(() => {});
      setConnectionState("error");
      revision++;
    });
    // Wall time at this browser, never the remote machine's UTC clock.
    const watchdog = window.setInterval(() => {
      if (performance.now() - lastReceipt > POSE_STALE_TIMEOUT_MS) setPoseStale(true);
    }, Math.min(250, POSE_STALE_TIMEOUT_MS));
    return () => { disposed = true; source.close(); window.clearInterval(watchdog); };
  }, [refresh]);

  const createMutation = useMutation({
    mutationFn: api.createMission,
    onSuccess: refresh,
  });
  const cancelMutation = useMutation({
    mutationFn: api.cancelMission,
    onSuccess: refresh,
  });

  const errors = [seatsQuery.error, missionsQuery.error, robotsQuery.error].filter(Boolean);
  const robots = useMemo(() => robotsQuery.data?.items ?? [], [robotsQuery.data?.items]);
  const value = useMemo<OperationsContextValue>(() => ({
    seats: seatsQuery.data?.items ?? [],
    missions: missionsQuery.data?.items ?? [],
    robots,
    robot: robots[0] ?? null,
    events,
    connectionState,
    isLoading: seatsQuery.isLoading || missionsQuery.isLoading || robotsQuery.isLoading,
    error: (errors[0] as Error | undefined) ?? null,
    refresh,
    createMission: createMutation.mutateAsync,
    cancelMission: cancelMutation.mutateAsync,
    isCreatingMission: createMutation.isPending,
    pose, poseStale,
  }), [
    cancelMutation.mutateAsync,
    connectionState,
    createMutation.isPending,
    createMutation.mutateAsync,
    errors,
    events,
    missionsQuery.data,
    missionsQuery.isLoading,
    refresh,
    robots,
    robotsQuery.isLoading,
    seatsQuery.data,
    seatsQuery.isLoading,
    pose, poseStale,
  ]);

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  const context = useContext(OperationsContext);
  if (!context) throw new Error("useOperations must be used inside OperationsProvider");
  return context;
}

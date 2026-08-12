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
import { api } from "../api/client";
import { queryKeys } from "../api/queryKeys";
import type { Mission, MissionRequest, OperationsEvent, Robot, Seat } from "../api/types";
import { useSettings } from "../settings/SettingsContext";

type ConnectionState = "connecting" | "connected" | "error";

interface OperationsContextValue {
  seats: Seat[];
  missions: Mission[];
  robot: Robot | null;
  events: OperationsEvent[];
  connectionState: ConnectionState;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createMission: (request: MissionRequest) => Promise<Mission>;
  cancelMission: (missionId: string) => Promise<Mission>;
  isCreatingMission: boolean;
}

const OperationsContext = createContext<OperationsContextValue | null>(null);

export function OperationsProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [events, setEvents] = useState<OperationsEvent[]>([]);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.missions }),
      queryClient.invalidateQueries({ queryKey: queryKeys.robots }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    const source = new EventSource("/api/events/stream");
    source.addEventListener("open", () => setConnectionState("connected"));
    source.addEventListener("update", (event) => {
      try {
        const operationEvent = JSON.parse(event.data) as OperationsEvent;
        setEvents((current) => [operationEvent, ...current].slice(0, 20));
      } catch {
        // Invalid event data is recovered by the state refresh below.
      }
      void refresh();
    });
    source.addEventListener("error", () => setConnectionState("error"));
    return () => source.close();
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
  const value = useMemo<OperationsContextValue>(() => ({
    seats: seatsQuery.data?.items ?? [],
    missions: missionsQuery.data?.items ?? [],
    robot: robotsQuery.data?.items[0] ?? null,
    events,
    connectionState,
    isLoading: seatsQuery.isLoading || missionsQuery.isLoading || robotsQuery.isLoading,
    error: (errors[0] as Error | undefined) ?? null,
    refresh,
    createMission: createMutation.mutateAsync,
    cancelMission: cancelMutation.mutateAsync,
    isCreatingMission: createMutation.isPending,
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
    robotsQuery.data,
    robotsQuery.isLoading,
    seatsQuery.data,
    seatsQuery.isLoading,
  ]);

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  const context = useContext(OperationsContext);
  if (!context) throw new Error("useOperations must be used inside OperationsProvider");
  return context;
}

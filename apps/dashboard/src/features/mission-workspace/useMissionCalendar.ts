import { useQuery } from "@tanstack/react-query";
import type { Mission } from "../../api/types";
import { api } from "../../api/client";
import { useAuthOptional } from "../../auth/AuthContext";
import { useDemoMode } from "../../operations/DemoModeContext";
import { useOperations } from "../../operations/OperationsContext";
import { useSettings } from "../../settings/SettingsContext";
import { loadCalendarDays } from "./calendar-data";
import { onMissionDay, summarizeTasks } from "./mission-day";

export function useMissionCalendar(days: string[], today: string, localMissions: Mission[]) {
  const auth = useAuthOptional(), mode = useDemoMode();
  const { settings } = useSettings();
  const { connectionState } = useOperations();
  const live = !mode.isDemo && !mode.isRecording && !!auth;
  const query = useQuery({
    queryKey: ["mission-calendar", auth?.session?.customer_id, auth?.site?.site_id, days[0], days.at(-1)],
    queryFn: ({ signal }) => loadCalendarDays(days, api.missionDay, signal),
    enabled: live, staleTime: Number(settings.refreshSeconds) * 1000, retry: false,
    refetchInterval: connectionState === "connected" ? false : Number(settings.refreshSeconds) * 1000,
  });
  return {
    summaries: live ? query.isError ? {} : query.data ?? {} : Object.fromEntries(days.map(day =>
      [day, summarizeTasks(localMissions.filter(m => onMissionDay(m, day, today)))])),
    isLoading: live && query.isPending, error: live ? query.error : null,
    refresh: () => query.refetch(),
  };
}

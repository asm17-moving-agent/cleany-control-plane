import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthOptional } from "../../auth/AuthContext";
import { api } from "../../api/client";
import { useOperations } from "../../operations/OperationsContext";
import { useDemoMode } from "../../operations/DemoModeContext";
import { useSettings } from "../../settings/SettingsContext";
import { dayKey, missionDay, onMissionDay, validDay } from "./mission-day";
import { workspaceDemo } from "./demo";

export function useMissionDay(requestedDay: string | null, selectedId: string | null) {
  const ops = useOperations(), mode = useDemoMode(), auth = useAuthOptional();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  // Refresh today's date after a background tab crosses midnight, without fake data polling.
  useEffect(() => { const update = () => setNow(new Date()); window.addEventListener("focus", update); return () => window.removeEventListener("focus", update); }, []);
  const today = dayKey(now);
  const local = useMemo(() => mode.isDemo && !mode.isRecording ? workspaceDemo(ops.missions, now) : ops.missions, [mode.isDemo, mode.isRecording, ops.missions, now]);
  const live = !mode.isDemo && !!auth;
  const scope = [auth?.session?.customer_id, auth?.site?.site_id];
  const known = local.find(m => m.mission_id === selectedId);
  const needsLookup = live && !!selectedId && !known && !ops.isLoading;
  const lookup = useQuery({ queryKey: ["mission-detail", ...scope, selectedId], queryFn: () => api.mission(selectedId!), enabled: needsLookup, retry: false });
  const linked = known ?? lookup.data;
  const day = validDay(requestedDay) ? requestedDay : linked ? missionDay(linked) : today;
  const history = useQuery({ queryKey: ["mission-day", ...scope, day], queryFn: ({ signal }) => api.missionDay(day, signal), enabled: live,
    refetchInterval: ops.connectionState === "connected" ? false : Number(settings.refreshSeconds) * 1000 });
  useEffect(() => {
    if (live) void queryClient.invalidateQueries({ queryKey: ["mission-day", ...scope] });
  }, [ops.missions, ops.events, live, scope.join(":"), queryClient]);
  const refresh = async () => {
    setNow(new Date());
    await Promise.all([ops.refresh(), live ? history.refetch() : Promise.resolve(), live && selectedId && !known ? lookup.refetch() : Promise.resolve()]);
  };
  return { day, today, missions: live ? history.data ?? [] : local.filter(m => onMissionDay(m, day, today)),
    isLoading: ops.isLoading || (live && history.isPending) || (needsLookup && lookup.isPending),
    error: ops.error ?? (live ? history.error : null), detailError: needsLookup ? lookup.error : null, refresh };
}

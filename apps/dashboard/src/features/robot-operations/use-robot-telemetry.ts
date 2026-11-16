import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuthOptional } from '../../auth/AuthContext';
import { useDemoMode } from '../../operations/DemoModeContext';
import { demoTelemetry } from './demo';
export function useRobotTelemetry(robot: string) {
  const auth = useAuthOptional();
  const { isDemo } = useDemoMode();
  const example = useMemo(() => demoTelemetry(robot, new Date().toISOString()), [robot]);
  const query = useQuery({ queryKey: ['robot-telemetry', auth?.session?.customer_id, auth?.site?.site_id, robot],
    queryFn: ({ signal }) => api.robotTelemetry(robot, signal), enabled: !isDemo && !!auth?.site,
    refetchInterval: query => query.state.status === 'error' ? 2000 : Math.max(100, query.state.data?.poll_interval_ms ?? 200), retry: false,
  });
  return { ...query, data: isDemo ? example : query.data, isError: !isDemo && query.isError, isLoading: !isDemo && query.isLoading, isDemo };
}

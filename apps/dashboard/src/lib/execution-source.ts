import type { components } from "../api/generated/openapi";

/** Summarize declared navigation provenance while retaining a warning for mocked work stages. */
export function executionSource(profile: components["schemas"]["ExecutionProfile"] | null | undefined) {
  if (!profile) return "실행 모드 확인 전";
  if (profile.navigation === "mock") return "모의 실행";
  const source = profile.navigation === "sim" ? "시뮬레이션" : "실제 로봇";
  const mockedWork = [profile.perception, profile.planning, profile.execution].includes("mock");
  return source + (mockedWork ? " · 작업 모의 실행" : "");
}

/** Format request-to-report receipt duration, including queue and transport time rather than robot execution time. */
export function missionElapsed(createdAt: string, finishedAt: string | null | undefined) {
  if (!finishedAt) return "—";
  const seconds = (Date.parse(finishedAt) - Date.parse(createdAt)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? `${seconds.toFixed(1)}초` : "—";
}

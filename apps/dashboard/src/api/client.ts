import type { components } from "./generated/openapi";
import type { SlamMapMetadata } from "../features/facility-map/slam-map";
import type {
  ApiErrorPayload,
  ListResponse,
  Mission,
  MissionRequest,
  Robot,
  Seat,
} from "./types";

let csrf: string | null = null;
let siteId: string | null = null;
/**
 * Configure module-wide request state shared by HTTP and SSE callers.
 * @param token - Session CSRF token, or null to clear it; authentication uses cookies.
 * @param site - Selected facility ID, or null to omit facility scope.
 */
export function configureClient(token: string | null, site: string | null) { csrf = token; siteId = site; }
/** Add the selected facility to HTTP or SSE URLs without replacing their existing query parameters. */
export function scopedUrl(path: string) {
  return siteId ? path + (path.includes("?") ? "&" : "?") + "site_id=" + encodeURIComponent(siteId) : path;
}
/**
 * Request JSON in the selected facility scope, attaching CSRF when options are supplied.
 * A 401 emits the shared auth-expired event before reading the response body.
 * @throws An Error for non-success responses; fetch and JSON parsing failures also propagate.
 */
export async function request<T>(path: string, init?: RequestInit, selectedSite?: string): Promise<T> {
  const response = await fetch(selectedSite ? path + "?site_id=" + encodeURIComponent(selectedSite) : scopedUrl(path), init ? { ...init,
    headers: { ...init.headers, "X-CSRF-Token": csrf ?? "" },
  } : undefined);
  if (response.status === 401) window.dispatchEvent(new Event("cleany:auth-expired"));
  const payload = (await response.json()) as T | ApiErrorPayload;
  if (!response.ok) {
    const error = payload as ApiErrorPayload;
    const detail = Array.isArray(error.detail)
      ? error.detail.map((item) => item.msg).join(", ")
      : error.detail;
    throw new Error(error.error ?? detail ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

/** Same-origin operations using session cookies and the authenticated facility scope. */
export const api = {
  seatLayout: (site: string) => request<components["schemas"]["LayoutReview"]>("/api/seat-layout", undefined, site),
  saveSeatLayout: (layout: components["schemas"]["SeatLayout"], site: string) => request<components["schemas"]["LayoutReview"]>("/api/seat-layout", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout),
  }, site),
  seatTargets: (site: string) => request<components["schemas"]["TargetExport"]>("/api/seat-layout/targets", undefined, site),
  map: () => request<SlamMapMetadata>("/api/map"),
  seats: () => request<ListResponse<Seat>>("/api/seats"),
  missions: () => request<ListResponse<Mission>>("/api/missions"),
  mission: (id: string) => request<Mission>(`/api/missions/${encodeURIComponent(id)}`),
  /** Fetch every page for the selected operational day; never summarize only the latest 50. */
  missionDay: async (day: string, signal?: AbortSignal): Promise<Mission[]> => {
    const items: Mission[] = [];
    let before: string | undefined;
    for (;;) {
      const query = new URLSearchParams({ day, limit: "100", ...(before ? { before } : {}) });
      const page = await request<ListResponse<Mission>>("/api/missions?" + query, { signal });
      items.push(...page.items);
      if (page.items.length < 100) return items;
      const last = page.items[page.items.length - 1];
      const next = last.created_at + "|" + last.mission_id;
      if (next === before) throw new Error("작업 목록의 다음 페이지를 불러올 수 없습니다.");
      before = next;
    }
  },
  reviewMission: (id: string) => request<Mission>(`/api/missions/${encodeURIComponent(id)}/review`, { method: "POST" }),
  robotTelemetry: (id: string, signal?: AbortSignal) => request<components["schemas"]["RobotTelemetrySnapshot"]>(`/api/robots/${encodeURIComponent(id)}/telemetry`, { signal }),
  robotAnalytics: (id: string, start: string, end: string, before?: string, signal?: AbortSignal) => request<components["schemas"]["RobotAnalytics"]>(`/api/robots/${encodeURIComponent(id)}/analytics?` + new URLSearchParams({ start, end, ...(before ? { before } : {}) }), { signal }),
  robots: () => request<ListResponse<Robot>>("/api/robots"),
  /**
   * Register queued work; runtime acceptance and completion are confirmed separately.
   * @param input - Reuse its idempotency key when retrying unchanged input after a lost response.
   * @returns The new mission or the existing matching request; key/content conflicts reject.
   */
  createMission: (input: MissionRequest) =>
    request<Mission>("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  /**
   * Request cancellation; active work awaits a checkpoint result.
   * @returns The current mission after handling the request; terminal records remain unchanged.
   */
  cancelMission: (missionId: string) =>
    request<Mission>(`/api/missions/${missionId}/cancel`, { method: "POST" }),
};

/** Parse UTF-8 SSE frames across arbitrary network chunks; do not treat EOF as success. */
export async function streamRequest<T extends { type: string }>(path: string, body: unknown, signal: AbortSignal, onEvent: (event: T) => void) {
  const response = await fetch(scopedUrl(path), { method: "POST", signal,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf ?? "" }, body: JSON.stringify(body) });
  if (response.status === 401) window.dispatchEvent(new Event("cleany:auth-expired"));
  if (!response.ok) {
    const data = await response.json() as ApiErrorPayload;
    throw new Error(typeof data.detail === "string" ? data.detail : "AI 요청을 처리하지 못했습니다.");
  }
  if (!response.body) throw new Error("응답 스트림을 열 수 없습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", complete = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const payload = frame.split("\n").filter(line => line.startsWith("data: ")).map(line => line.slice(6)).join("\n");
        if (payload) {
          const event = JSON.parse(payload) as T;
          if (event.type === "complete") complete = true;
          onEvent(event);
        }
      }
      if (done) break;
    }
    if (!complete) throw new Error("응답 연결이 끊겼습니다. 다시 시도해 주세요.");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

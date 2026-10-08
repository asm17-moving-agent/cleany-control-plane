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
export function configureClient(token: string | null, site: string | null) { csrf = token; siteId = site; }
export function scopedUrl(path: string) {
  return siteId ? path + (path.includes("?") ? "&" : "?") + "site_id=" + encodeURIComponent(siteId) : path;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(scopedUrl(path), init ? { ...init,
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

export const api = {
  seats: () => request<ListResponse<Seat>>("/api/seats"),
  missions: () => request<ListResponse<Mission>>("/api/missions"),
  robots: () => request<ListResponse<Robot>>("/api/robots"),
  createMission: (input: MissionRequest) =>
    request<Mission>("/api/missions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  cancelMission: (missionId: string) =>
    request<Mission>(`/api/missions/${missionId}/cancel`, { method: "POST" }),
};

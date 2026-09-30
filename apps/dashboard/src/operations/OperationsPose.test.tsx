// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { SettingsProvider } from "../settings/SettingsContext";
import { DemoModeProvider } from "./DemoModeContext";
import { OperationsProvider, useOperations } from "./OperationsContext";

vi.mock("../api/client", () => ({ api: {
  seats: vi.fn(async () => ({ items: [] })), missions: vi.fn(async () => ({ items: [] })),
  robots: vi.fn(async () => ({ items: [] })), createMission: vi.fn(), cancelMission: vi.fn(),
} }));

class Source {
  static current: Source;
  listeners = new Map<string, (event: { data: string }) => void>();
  close = vi.fn();
  constructor() { Source.current = this; }
  addEventListener(name: string, handler: (event: { data: string }) => void) {
    this.listeners.set(name, handler);
  }
  emit(name: string, value: unknown = null) {
    this.listeners.get(name)?.({ data: JSON.stringify(value) });
  }
}
let operations: ReturnType<typeof useOperations>;
let now = 0;
const pose = { x: 1, y: -2, received_at: "2020-01-01T00:00:00Z" };
const snapshot = { pose, stale: false };
const event = (payload = snapshot, event_type = "robot.pose") => ({
  schema_version: 1, event_id: "pose-event", event_type, robot_id: "cleany-01",
  mission_id: null, sequence: 1, occurred_at: pose.received_at, payload,
});
function Probe() { operations = useOperations(); return null; }
async function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><SettingsProvider><MemoryRouter>
    <DemoModeProvider><OperationsProvider><Probe /></OperationsProvider></DemoModeProvider>
  </MemoryRouter></SettingsProvider></QueryClientProvider>);
  await waitFor(() => expect(operations.isLoading).toBe(false));
}
beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("EventSource", Source);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => snapshot })));
});
afterEach(() => {
  cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); vi.clearAllMocks();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

it("reuses the stream, refetches snapshots on reconnect, and does not refresh missions for poses", async () => {
  await mount();
  act(() => Source.current.emit("open"));
  await waitFor(() => expect(operations.pose).toEqual(pose));
  await waitFor(() => expect(api.missions).toHaveBeenCalledTimes(2));
  const source = Source.current;
  act(() => {
    for (let i = 0; i < 10; i++) source.emit("update", event());
  });
  expect(api.missions).toHaveBeenCalledTimes(2);
  expect(api.robots).toHaveBeenCalledTimes(2);
  expect(operations.events).toHaveLength(0);
  act(() => source.emit("error"));
  expect(operations.connectionState).toBe("error");
  act(() => source.emit("open"));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(api.missions).toHaveBeenCalledTimes(3));
  expect(Source.current).toBe(source);
});

it("does not let an old in-flight snapshot override a newer SSE stale transition", async () => {
  let resolveSnapshot!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { resolveSnapshot = resolve; })));
  await mount();
  act(() => {
    Source.current.emit("open");
    Source.current.emit("update", event());
    Source.current.emit("update", event({ pose, stale: true }, "robot.pose.stale"));
  });
  await act(async () => resolveSnapshot({ ok: true, json: async () => snapshot }));
  expect(operations.pose).toEqual(pose);
  expect(operations.poseStale).toBe(true);
});

it("restores a stale last-known snapshot and ignores older live positions", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ pose, stale: true }) })));
  await mount();
  act(() => Source.current.emit("open"));
  await waitFor(() => expect(operations.pose).toEqual(pose));
  expect(operations.poseStale).toBe(true);
  act(() => Source.current.emit("update", event({
    pose: { ...pose, x: 100, received_at: "2019-01-01T00:00:00Z" }, stale: false,
  })));
  expect(operations.pose).toEqual(pose);
  expect(operations.poseStale).toBe(true);
});

it("uses local elapsed time despite server clock skew, including a silent SSE failure", async () => {
  await mount();
  act(() => Source.current.emit("update", event()));
  expect(operations.poseStale).toBe(false); // Server UTC timestamp is deliberately years old.
  now = 2000;
  await waitFor(() => expect(operations.poseStale).toBe(true));
  expect(operations.connectionState).toBe("connecting");
});

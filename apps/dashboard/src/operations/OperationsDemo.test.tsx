// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { SettingsProvider } from "../settings/SettingsContext";
import { DemoModeProvider, useDemoMode } from "./DemoModeContext";
import { OperationsProvider, useOperations } from "./OperationsContext";
import { seatMapStatus } from "../lib/seat-summary";

vi.mock("../api/client", async (importOriginal) => ({ ...await importOriginal<typeof import("../api/client")>(), api: {
  seats: vi.fn(async () => ({ items: [] })), missions: vi.fn(async () => ({ items: [] })),
  robots: vi.fn(async () => ({ items: [] })), createMission: vi.fn(), cancelMission: vi.fn(),
} }));

let operations: ReturnType<typeof useOperations>;
function Probe() {
  operations = useOperations();
  const { isDemo, setDemoMode } = useDemoMode();
  return <><output>{isDemo ? "예시" : "실제"} · {operations.missions.length}건</output>
    <Link to="/robots">로봇</Link><button onClick={() => setDemoMode(false)}>해제</button>
    <button onClick={() => setDemoMode(true)}>예시 보기</button></>;
}
function mount(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><SettingsProvider><MemoryRouter initialEntries={[path]}>
    <DemoModeProvider><OperationsProvider><Probe /></OperationsProvider></DemoModeProvider>
  </MemoryRouter></SettingsProvider></QueryClientProvider>);
}
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("keeps demo data across navigation and reload, blocks API commands, and restores an isolated live provider on exit", async () => {
  const close = vi.fn();
  const source = vi.fn(function () { return { addEventListener: vi.fn(), close }; });
  vi.stubGlobal("EventSource", source);
  const view = mount("/missions?demo=1");
  expect(screen.getByRole("status")).toHaveTextContent("예시 · 7건");
  expect(operations.robots).toHaveLength(3);
  expect(operations.seats).toHaveLength(82);
  const statuses = operations.seats.map(seat => seatMapStatus(seat, operations.seatCleaning?.[seat.seat_id]));
  expect(new Set(statuses)).toEqual(new Set(["occupied", "ready", "waiting", "working"]));
  expect(operations.seatCleaning?.["seat-12"]).toBe("working");
  expect(operations.seatCleaning?.["seat-a1-01"]).toBe("waiting");
  expect(operations.seatCleaning?.["seat-m2-01"]).toBe("ready");
  expect(operations.missions.filter(mission => mission.phase !== "TERMINAL").every(mission =>
    operations.seats.find(seat => seat.seat_id === mission.seat_id)?.occupancy === "AVAILABLE")).toBe(true);
  expect(operations.missions.every(mission => operations.seats.some(seat => seat.seat_id === mission.seat_id))).toBe(true);
  await expect(operations.createMission({ target: { kind: "SEAT", reference_id: "seat-12", label: "12" }, priority: "NORMAL", requested_by: "test", idempotency_key: "demo-test" })).rejects.toThrow("예시 모드");
  await expect(operations.cancelMission("demo-12")).rejects.toThrow("예시 모드");
  await operations.refresh();
  fireEvent.click(screen.getByRole("link", { name: "로봇" }));
  expect(screen.getByRole("status")).toHaveTextContent("예시 · 7건");
  view.unmount();
  mount("/results");
  expect(screen.getByRole("status")).toHaveTextContent("예시 · 7건");
  Object.values(api).forEach(method => expect(method).not.toHaveBeenCalled());
  expect(source).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "해제" }));
  await waitFor(() => expect(operations.isLoading).toBe(false));
  expect(screen.getByRole("status")).toHaveTextContent("실제 · 0건");
  expect(operations.seatCleaning).toBeUndefined();
  expect(api.missions).toHaveBeenCalledOnce();
  expect(source).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem("cleany.operations-demo")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "예시 보기" }));
  expect(close).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toHaveTextContent("예시 · 7건");
  expect(api.createMission).not.toHaveBeenCalled();
  expect(api.cancelMission).not.toHaveBeenCalled();
});

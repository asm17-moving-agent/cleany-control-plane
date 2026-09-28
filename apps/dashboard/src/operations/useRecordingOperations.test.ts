// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRecordingOperations } from "./useRecordingOperations";
import { recordingRoute, routeMotion, RECORDING_HOME, RECORDING_TIMING as timing } from "./recording-route";

afterEach(() => { cleanup(); vi.useRealTimers(); });
it("holds position while turning at a corner before continuing at half speed", () => {
  const route = [{ x: 0, y: 0 }, { x: 27.5, y: 0 }, { x: 27.5, y: 27.5 }];
  const first = routeMotion(route, 1500), second = routeMotion(route, 2500);
  expect(first.position).toEqual({ x: 27.5, y: 0 });
  expect(second.position).toEqual(first.position);
  expect(second.heading).toBeGreaterThan(first.heading);
  expect(routeMotion(route, 3750).position).toEqual({ x: 27.5, y: 13.75 });
  expect(routeMotion(route).duration).toBe(4250);
});
it("moves to the seat, works, returns, and only then dispatches the queued request", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(useRecordingOperations);
  const request = (id: string) => ({ target: { kind: "SEAT" as const, reference_id: id }, priority: "NORMAL" as const, requested_by: "test", idempotency_key: id });
  await act(async () => { await result.current.createMission(request("seat-12")); await result.current.createMission(request("seat-18")); });
  const route = recordingRoute(result.current.seats.find(s => s.seat_id === "seat-12")!);
  const duration = routeMotion(route).duration;
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.recordingPosition).not.toEqual(RECORDING_HOME);
  expect(result.current.missions[1].phase).toBe("QUEUED");
  act(() => vi.advanceTimersByTime(Math.ceil(duration) + timing.accepted - 2000 + 100));
  expect(result.current.missions[0].phase).toBe("WORKING");
  expect(result.current.recordingPosition).toEqual(route.at(-1));
  act(() => vi.advanceTimersByTime(timing.working + Math.ceil(duration) + 100));
  expect(result.current.missions[0].outcome).toBe("SUCCESS");
  expect(result.current.robot?.active_mission_id).toBe(result.current.missions[1].mission_id);
});
it("deduplicates requests and stops in place when cancelled", async () => {
  vi.useFakeTimers();
  const { result } = renderHook(useRecordingOperations);
  const request = { target: { kind: "SEAT" as const, reference_id: "seat-m2-01" }, priority: "NORMAL" as const, requested_by: "test", idempotency_key: "same" };
  await act(async () => { await result.current.createMission(request); await result.current.createMission(request); });
  expect(result.current.missions).toHaveLength(1);
  act(() => vi.advanceTimersByTime(2000));
  const before = result.current.recordingPosition;
  await act(async () => { await result.current.cancelMission(result.current.missions[0].mission_id); });
  act(() => vi.advanceTimersByTime(20000));
  expect(result.current.recordingPosition).toEqual(before);
  expect(result.current.missions[0].outcome).toBe("CANCELLED");
  expect(result.current.robot?.state).toBe("IDLE");
});

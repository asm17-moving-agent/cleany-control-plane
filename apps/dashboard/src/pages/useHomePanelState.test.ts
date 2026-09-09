// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Robot, Seat } from "../api/types";
import { PANEL_TRANSITION_MS } from "../components/panel-motion";
import { useHomePanelState } from "./useHomePanelState";

const robot: Robot = { robot_id: "cleany-01", state: "IDLE", active_mission_id: null, last_seen_at: "2026-09-09T00:00:00Z" };
const seat: Seat = { seat_id: "seat-12", label: "12", zone_id: "d-hub", row: 2, grid_column: 5, occupancy: "AVAILABLE", occupant_name: null };
const props = { robots: [robot], seats: [seat], events: [], isCreatingMission: false, unavailable: false };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps exit content for the shared duration without delaying the new panel", () => {
  const { result } = renderHook(() => useHomePanelState(props));
  act(() => result.current.selectSeat(seat.seat_id));
  act(() => result.current.selectRobot(robot.robot_id));
  expect(result.current.selectedSeat).toBeNull();
  expect(result.current.selectedRobot).toEqual(robot);
  expect(result.current.closingSeat).toEqual(seat);
  act(() => vi.advanceTimersByTime(PANEL_TRANSITION_MS - 1));
  expect(result.current.closingSeat).toEqual(seat);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.closingSeat).toBeNull();
});

it("preserves a closing robot when a seat opens and cancels its old timer on reselection", () => {
  const { result } = renderHook(() => useHomePanelState(props));
  act(() => result.current.selectRobot(robot.robot_id));
  act(() => result.current.closeRobot());
  act(() => result.current.selectSeat(seat.seat_id));
  expect(result.current.displayedRobot).toEqual(robot);
  expect(result.current.selectedRobot).toBeUndefined();
  act(() => vi.advanceTimersByTime(PANEL_TRANSITION_MS / 2));
  act(() => result.current.selectRobot(robot.robot_id));
  act(() => vi.advanceTimersByTime(PANEL_TRANSITION_MS / 2));
  expect(result.current.selectedRobot).toEqual(robot);
  expect(result.current.closingSeat).toEqual(seat);
  act(() => vi.advanceTimersByTime(PANEL_TRANSITION_MS / 2));
  expect(result.current.closingSeat).toBeNull();
});

it("removes exit content immediately with reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const { result } = renderHook(() => useHomePanelState(props));
  act(() => result.current.selectSeat(seat.seat_id));
  act(() => result.current.closeRequest());
  act(() => vi.advanceTimersByTime(0));
  expect(result.current.closingSeat).toBeNull();
});

it("does not restore old focus after another panel has opened", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const focus = vi.spyOn(trigger, "focus");
  const { result } = renderHook(() => useHomePanelState(props));
  act(() => result.current.selectRobot(robot.robot_id));
  act(() => result.current.closeRobot());
  act(() => result.current.selectSeat(seat.seat_id));
  act(() => vi.advanceTimersByTime(PANEL_TRANSITION_MS));
  expect(focus).not.toHaveBeenCalled();
  trigger.remove();
});

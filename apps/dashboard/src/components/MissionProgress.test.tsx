// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Mission, MissionOutcome, MissionPhase } from "../api/types";
import { MissionProgress } from "./MissionProgress";

afterEach(cleanup);
const mission = (phase: MissionPhase, outcome: MissionOutcome | null = null) => ({ phase, outcome, cancel_requested: false }) as Mission;

it.each([
  ["QUEUED", 0], ["OFFERED", 0], ["ACCEPTED", 0], ["NAVIGATING", 1], ["WORKING", 2], ["RETURNING", 3],
] as const)("shows confirmed progress for %s", (phase, index) => {
  render(<MissionProgress mission={mission(phase)} />);
  const steps = screen.getAllByRole("listitem");
  expect(steps).toHaveLength(5);
  expect(steps[index]).toHaveAttribute("aria-current", "step");
  expect(steps.map(step => step.dataset.state)).toEqual(steps.map((_, position) => position < index ? "done" : position === index ? "current" : "pending"));
});

it("marks all five steps complete only for a successful terminal result", () => {
  render(<MissionProgress mission={mission("TERMINAL", "SUCCESS")} />);
  expect(screen.getAllByRole("listitem").every(step => step.dataset.state === "done")).toBe(true);
  expect(screen.getByRole("status")).toHaveTextContent("완료");
});

it.each(["FAILED", "CANCELLED", "PARTIAL_SUCCESS", "BLOCKED", "HUMAN_REVIEW_REQUIRED"] as const)("does not turn unconfirmed stages green for %s", outcome => {
  render(<MissionProgress mission={mission("TERMINAL", outcome)} />);
  expect(screen.getAllByRole("listitem").some(step => step.dataset.state === "done")).toBe(false);
  expect(screen.getAllByRole("listitem")[4]).toHaveAttribute("data-state", "stopped");
  expect(screen.getByRole("status")).not.toHaveTextContent(/^완료$/);
});

it("keeps the current step until cancellation is confirmed", () => {
  render(<MissionProgress mission={{ ...mission("WORKING"), cancel_requested: true }} />);
  expect(screen.getAllByRole("listitem")[2]).toHaveAttribute("aria-current", "step");
  expect(screen.getByRole("status")).toHaveTextContent("취소 요청 중");
});

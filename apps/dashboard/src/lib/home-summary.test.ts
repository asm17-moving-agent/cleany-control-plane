import { describe, expect, it } from "vitest";
import type { Mission, MissionOutcome, Robot } from "../api/types";
import { getHomeSummary, observationHref } from "./home-summary";

function mission(id: string, phase: Mission["phase"], outcome: MissionOutcome | null, created_at = "2026-09-08T01:00:00Z"): Mission {
  return { mission_id: id, target: { kind: "SEAT", reference_id: "seat-01", label: "01번 좌석" }, seat_id: "seat-01", priority: "NORMAL", requested_by: "test", idempotency_key: id, created_at, phase, outcome, message: "", sequence: 1, cancel_requested: false, before_observation: null, after_observation: null };
}
describe("home business summaries", () => {
  it("keeps robot attention, active work and terminal review outcomes separate", () => {
    const robots: Robot[] = ["IDLE", "BUSY", "OFFLINE", "ERROR"].map((state, index) => ({ robot_id: String(index), state: state as Robot["state"], active_mission_id: null, last_seen_at: "2026-09-08T01:00:00Z" }));
    const missions = [mission("queued", "QUEUED", null), mission("working", "WORKING", null), mission("done", "TERMINAL", "SUCCESS"),
      ...(["HUMAN_REVIEW_REQUIRED", "PARTIAL_SUCCESS", "BLOCKED", "FAILED", "INTERRUPTED", "CANCELLED", "EXPIRED", "REJECTED"] as const).map((outcome) => mission(outcome, "TERMINAL", outcome))];
    const summary = getHomeSummary(robots, missions);
    expect(summary.attention.map(({ state }) => state)).toEqual(["OFFLINE", "ERROR"]);
    expect(summary.active.map(({ mission_id }) => mission_id)).toEqual(["working"]);
    expect(summary.queued.map(({ mission_id }) => mission_id)).toEqual(["queued"]);
    expect(summary.review.map(({ outcome }) => outcome)).toEqual(["HUMAN_REVIEW_REQUIRED", "PARTIAL_SUCCESS", "BLOCKED", "FAILED", "INTERRUPTED"]);
    expect(summary.successes.map(({ mission_id }) => mission_id)).toEqual(["done"]);
  });
  it("sorts success by request time without mutating mission data", () => {
    const missions = [mission("old", "TERMINAL", "SUCCESS"), mission("new", "TERMINAL", "SUCCESS", "2026-09-08T02:00:00Z")];
    expect(getHomeSummary([], missions).successes.map(({ mission_id }) => mission_id)).toEqual(["new", "old"]);
    expect(missions[0].mission_id).toBe("old");
  });
  it("only links usable observation URLs, leaving opaque references as text", () => {
    for (const ref of [null, "mock://observation/before", "javascript:alert(1)", "//outside.example/test", "/\\outside.example/test"]) expect(observationHref(ref)).toBeNull();
    expect(observationHref("/observations/1.png")).toBe("/observations/1.png");
    expect(observationHref("https://example.org/observations/1.png")).toBe("https://example.org/observations/1.png");
  });
});

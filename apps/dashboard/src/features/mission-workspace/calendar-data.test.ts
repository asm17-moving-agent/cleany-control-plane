import { describe, expect, it } from "vitest";
import { loadCalendarDays, CALENDAR_READ_CONCURRENCY } from "./calendar-data";
import { calendarDays } from "./mission-day";
import { homeSummaryDemo } from "../../lib/home-summary-demo";

describe("visible calendar history", () => {
  it("bounds concurrent reads and keeps each day's full result separate", async () => {
    let active = 0, peak = 0;
    const days = calendarDays("2026-11");
    const result = await loadCalendarDays(days, async day => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 0));
      active--;
      return day === "2026-11-17" ? [{...homeSummaryDemo.missions[0],phase:"TERMINAL",outcome:"FAILED",review:null}] : [];
    }, new AbortController().signal);
    expect(peak).toBe(CALENDAR_READ_CONCURRENCY);
    expect(Object.keys(result)).toHaveLength(days.length);
    expect(result["2026-11-17"]).toEqual({total:1,complete:0,review:1});
    expect(result["2026-11-16"]).toEqual({total:0,complete:0,review:0});
  });
  it("does not present a partial failed read as a complete empty month", async () => {
    let calls = 0;
    await expect(loadCalendarDays(calendarDays("2026-11"), async () => {calls++; throw Error("unavailable");},new AbortController().signal)).rejects.toThrow("unavailable");
    expect(calls).toBe(CALENDAR_READ_CONCURRENCY);
  });
  it("stops dispatching dates when month navigation cancels the read", async () => {
    const controller = new AbortController(); let calls = 0;
    await expect(loadCalendarDays(calendarDays("2026-11"), async () => {calls++; controller.abort();return [];},controller.signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

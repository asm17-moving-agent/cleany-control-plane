import { describe, expect, it } from "vitest";
import { averageOccupancy, completedByType, getHomeSnapshot } from "./home-data";
describe("café snapshot", () => {
 it("weights partial hours by duration instead of averaging samples", () => {
  expect(averageOccupancy([{ startMinute: 0, endMinute: 60, occupied: 20, capacity: 100 }, { startMinute: 60, endMinute: 90, occupied: 80, capacity: 100 }])).toBeCloseTo(40);
  expect(averageOccupancy([])).toBeNull();
 });
 it("uses Korean midnight and excludes future periods and tasks", () => {
  const midnight = getHomeSnapshot("BUSAN_SOMA_18F", new Date("2026-11-16T15:00:00Z"), "normal")!;
  expect(midnight.day).toBe("2026-11-17"); expect(midnight.occupancy).toEqual([]); expect(midnight.completions).toEqual([]);
  const next = getHomeSnapshot("BUSAN_SOMA_18F", new Date("2026-11-16T16:30:00Z"), "normal")!;
  expect(next.asOfMinute).toBe(90); expect(next.occupancy.map(i=>i.endMinute)).toEqual([60,90]);
  expect(next.completions.every(i=>i.minute <= 90)).toBe(true);
  expect(completedByType([{minute:20,type:"의자 정리"},{minute:120,type:"의자 정리"}],90).find(i=>i.type==="의자 정리")?.count).toBe(1);
 });
 it("keeps seat totals and a single active robot consistent in both scenarios", () => {
  for (const scenario of ["normal","attention"] as const) {
   const data = getHomeSnapshot("BUSAN_SOMA_18F", new Date("2026-11-17T09:00:00Z"), scenario)!;
   expect(Object.values(data.cleaning).reduce((a,b)=>a+b,0)).toBe(data.capacity);
   expect(data.cleaning.working).toBeLessThanOrEqual(1);
   expect(Boolean(data.robot.currentTask)).toBe(data.cleaning.working===1);
   expect(data.robot.connected).toBe(scenario==="normal");
   expect(completedByType(data.completions,data.asOfMinute).reduce((a,b)=>a+b.count,0)).toBe(data.completions.length);
  }
  expect(getHomeSnapshot("BUSAN_SOMA_19F",new Date(),"normal")).toBeNull();
 });
});

import { describe, expect, it } from "vitest";
import { homeSummaryDemo } from "../../lib/home-summary-demo";
import { dayKey, matchesTask, onMissionDay, shiftDay, validDay } from "./mission-day";
import { needsResultReview } from "../../lib/home-summary";
const base = homeSummaryDemo.missions[0];
describe("mission operational days",()=>{
 it("uses Korean midnight and validates real calendar dates",()=>{
  expect(dayKey("2026-11-16T15:00:00Z")).toBe("2026-11-17");
  expect(dayKey("2026-11-16T14:59:59Z")).toBe("2026-11-16");
  expect(validDay("2026-02-30")).toBe(false); expect(validDay("2028-02-29")).toBe(true);
  expect(shiftDay("2027-01-01",-1)).toBe("2026-12-31");
 });
 it("includes request and completion dates once, and carries unfinished work only into today",()=>{
  const m={...base,created_at:"2026-11-15T18:00:00Z",finished_at:"2026-11-16T18:00:00Z",phase:"TERMINAL" as const,outcome:"SUCCESS" as const};
  expect(onMissionDay(m,"2026-11-16","2026-11-18")).toBe(true);
  expect(onMissionDay(m,"2026-11-17","2026-11-18")).toBe(true);
  expect(onMissionDay(m,"2026-11-18","2026-11-18")).toBe(false);
  expect(onMissionDay({...m,phase:"WORKING",finished_at:null},"2026-11-18","2026-11-18")).toBe(true);
  expect(onMissionDay({...m,phase:"WORKING",finished_at:null},"2026-11-17","2026-11-18")).toBe(false);
 });
 it("acknowledgement clears attention without changing the failed outcome",()=>{
  const failed={...base,phase:"TERMINAL" as const,outcome:"FAILED" as const};
  expect(needsResultReview(failed)).toBe(true);
  const reviewed={...failed,review:{reviewed_at:"2026-11-17T00:00:00Z",reviewed_by:"operator",reviewer_name:"Operator"}};
  expect(matchesTask(reviewed,"FAILED")).toBe(true);expect(matchesTask(reviewed,"REVIEW")).toBe(false);
  expect(needsResultReview({...failed,outcome:"SUCCESS",needs_human_review:true})).toBe(true);
 });
});

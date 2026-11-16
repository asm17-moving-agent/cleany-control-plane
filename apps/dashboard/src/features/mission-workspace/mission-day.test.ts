import { describe, expect, it } from "vitest";
import { homeSummaryDemo } from "../../lib/home-summary-demo";
import { calendarDays, dayKey, matchesTask, onMissionDay, shiftDay, summarizeTasks, taskDistribution, taskSegments, validDay } from "./mission-day";
import type { MissionOutcome, MissionPhase } from "../../api/types";
import { needsResultReview } from "../../lib/home-summary";
const base = homeSummaryDemo.missions[0];
describe("mission operational days",()=>{
 it("partitions every phase and terminal outcome exactly once, including cancelled and missing results",()=>{
  const outcomes: (MissionOutcome|null)[]=["SUCCESS","PARTIAL_SUCCESS","HUMAN_REVIEW_REQUIRED","BLOCKED","FAILED","CANCELLED","EXPIRED","REJECTED","INTERRUPTED",null];
  const phases: MissionPhase[]=["QUEUED","OFFERED","ACCEPTED","NAVIGATING","WORKING","RETURNING"];
  const records=[...outcomes.map((outcome,i)=>({...base,mission_id:`outcome-${i}`,phase:"TERMINAL" as const,outcome})),
   ...phases.map(phase=>({...base,mission_id:phase,phase,outcome:null}))];
  expect(taskDistribution(records)).toEqual({SUCCESS:1,ACTIVE:5,QUEUED:1,FAILED:6,OTHER_TERMINAL:3});
  expect(Object.values(taskDistribution(records)).reduce((a,b)=>a+b,0)).toBe(summarizeTasks(records).total);
  for(const record of records) expect(taskSegments.filter(s=>matchesTask(record,s.key))).toHaveLength(1);
 });
 it("keeps review independent from bar segments before and after acknowledgement",()=>{
  const success={...base,phase:"TERMINAL" as const,outcome:"SUCCESS" as const,needs_human_review:true,review:null};
  const reviewed={...success,review:{reviewed_at:"2026-11-17T00:00:00Z",reviewed_by:"operator",reviewer_name:"Operator"}};
  expect(summarizeTasks([success])).toEqual({total:1,complete:1,review:1});
  expect(summarizeTasks([reviewed])).toEqual({total:1,complete:1,review:0});
  expect(taskDistribution([success])).toEqual(taskDistribution([reviewed]));
  expect(taskDistribution([success,success]).SUCCESS).toBe(1);
 });
 it("returns an empty distribution without inventing a completed share",()=>{
  expect(Object.values(taskDistribution([]))).toEqual([0,0,0,0,0]);
 });
 it("covers leap months and adjacent year dates as full calendar weeks",()=>{
  const leap=calendarDays("2028-02"), year=calendarDays("2027-01");
  expect(leap).toContain("2028-02-29"); expect(leap.length%7).toBe(0);
  expect(year[0]).toBe("2026-12-27");expect(year.at(-1)).toBe("2027-02-06");
  expect(new Set(year).size).toBe(42);
 });
 it("counts actual work once and keeps completion separate from unacknowledged review",()=>{
  const complete={...base,mission_id:"complete",phase:"TERMINAL" as const,outcome:"SUCCESS" as const};
  const failed={...complete,mission_id:"failed",outcome:"FAILED" as const};
  const reviewed={...failed,mission_id:"reviewed",review:{reviewed_at:"2026-11-17T00:00:00Z",reviewed_by:"operator",reviewer_name:"Operator"}};
  expect(summarizeTasks([complete,complete,failed,reviewed,{...base,mission_id:"queued",phase:"QUEUED"}])).toEqual({total:4,complete:1,review:1});
  expect(summarizeTasks([])).toEqual({total:0,complete:0,review:0});
 });
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

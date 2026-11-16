import type { Mission } from "../../api/types";
import { summarizeTasks, type DaySummary } from "./mission-day";

// The existing API is day-scoped. Bound concurrent reads rather than scanning all history.
export const CALENDAR_READ_CONCURRENCY = 4;
export async function loadCalendarDays(days: string[], read: (day: string, signal: AbortSignal) => Promise<Mission[]>, signal: AbortSignal) {
  const summaries: Record<string, DaySummary> = {};
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(CALENDAR_READ_CONCURRENCY, days.length) }, async () => {
    while (next < days.length && !failed) {
      signal.throwIfAborted();
      const day = days[next++];
      try { summaries[day] = summarizeTasks(await read(day, signal)); }
      catch (error) { failed = true; throw error; }
    }
  }));
  signal.throwIfAborted();
  return summaries;
}

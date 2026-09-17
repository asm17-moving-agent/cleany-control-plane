import { expect, it } from "vitest";
import type { Seat } from "../api/types";
import { matchesSeatFilter, seatMapStatus, seatSnapshots } from "./seat-summary";
const seats: Seat[] = Array.from({ length: 48 }, (_, i) => ({ seat_id: `s-${i}`, label: String(i + 1), zone_id: "d-hub", row: Math.floor(i / 8), grid_column: 1, occupancy: i < 7 ? "OCCUPIED" : "AVAILABLE", occupant_name: null }));
it("preserves real occupancy without inventing a cleaning state", () => {
 const rows = seatSnapshots(seats, false);
 expect(rows.filter(row => matchesSeatFilter(row, "occupied"))).toHaveLength(7);
 expect(rows.filter(row => matchesSeatFilter(row, "vacant"))).toHaveLength(41);
 expect(rows.every(row => row.cleaning === null)).toBe(true);
 expect(rows.filter(row => matchesSeatFilter(row, "ready"))).toHaveLength(0);
});
it("prioritizes current occupancy and keeps missing cleaning data unconfirmed", () => {
 const occupied = seats[0];
 const vacant = seats[10];
 expect(seatMapStatus(occupied, "ready")).toBe("occupied");
 expect(seatMapStatus({ ...vacant, occupancy: "UNKNOWN" }, "ready")).toBe("unknown");
 expect(seatMapStatus(vacant)).toBe("unknown");
 expect(seatMapStatus(vacant, "ready")).toBe("ready");
 expect(seatMapStatus(vacant, "waiting")).toBe("waiting");
});
it("partitions demo vacant seats into disjoint states using existing IDs without mutating inputs", () => {
 const rows = seatSnapshots(seats, true);
 const vacant = rows.filter(row => matchesSeatFilter(row, "vacant"));
 const counts = ["ready", "waiting", "working", "review", "unknown"] as const;
 expect(counts.reduce((sum, state) => sum + rows.filter(row => matchesSeatFilter(row, state)).length, 0)).toBe(vacant.length);
 expect(rows.map(row => row.seat.seat_id)).toEqual(seats.map(seat => seat.seat_id));
 expect(rows.filter(row => matchesSeatFilter(row, "occupied"))).toHaveLength(18);
 expect(seats.filter(seat => seat.occupancy === "OCCUPIED")).toHaveLength(7);
 expect(seatSnapshots([], true)).toEqual([]);
});

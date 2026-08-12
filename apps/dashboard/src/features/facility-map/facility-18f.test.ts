import { describe, expect, it } from "vitest";
import { FACILITY_ZONES, getFacilityZone } from "./facility-18f";

describe("18F facility map", () => {
  it("keeps stable unique zone identifiers", () => {
    const ids = FACILITY_ZONES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes selectable mission zones and keeps storage read-only", () => {
    expect(getFacilityZone("the-grond")?.selectable).toBe(true);
    expect(getFacilityZone("storage-north-west")?.selectable).toBe(false);
    expect(getFacilityZone("missing-zone")).toBeNull();
  });
});

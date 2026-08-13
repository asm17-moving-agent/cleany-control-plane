import { describe, expect, it } from "vitest";
import { FACILITY_ZONES, getFacilityZone } from "./facility-18f";

describe("18F facility map", () => {
  it("keeps stable unique zone identifiers", () => {
    const ids = FACILITY_ZONES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes only selectable mission zones", () => {
    expect(getFacilityZone("the-grond")?.selectable).toBe(true);
    expect(FACILITY_ZONES.every(({ selectable }) => selectable)).toBe(true);
    expect(getFacilityZone("missing-zone")).toBeNull();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import type { Seat } from "../api/types";
import { HomeMapHeader } from "./HomeMapHeader";

const seats: Seat[] = [
  { seat_id: "seat-a1-01", label: "A1-01", zone_id: "space-a1", row: 1, grid_column: 1, occupancy: "UNKNOWN", occupant_name: null },
  { seat_id: "seat-01", label: "01", zone_id: "d-hub", row: 1, grid_column: 1, occupancy: "OCCUPIED", occupant_name: "사용자" },
  { seat_id: "seat-02", label: "02", zone_id: "d-hub", row: 1, grid_column: 2, occupancy: "AVAILABLE", occupant_name: null },
];
afterEach(cleanup);
function setup(items = seats, unavailable = false) {
  render(<MemoryRouter><HomeMapHeader seats={items} mapAvailable unavailable={unavailable} /></MemoryRouter>);
}
it("separates unknown seats from vacant seats without an unverified percentage", () => {
  setup();
  expect(screen.getByRole("img", { name: "전체 3석, 사용 중 1석, 빈 좌석 1석, 미확인 1석" })).toBeVisible();
  expect(screen.getByText("1 / 3석")).toBeVisible();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  expect(screen.queryByRole("search")).not.toBeInTheDocument();
});
it("shows percentage when all seat states are known", () => {
  setup(seats.slice(1));
  expect(screen.getByText("50%")).toBeVisible();
});
it("does not present stale data as current occupancy", () => {
  setup(seats, true);
  expect(screen.getByRole("img", { name: "좌석 점유 현황 확인 중" })).toBeEmptyDOMElement();
  expect(screen.queryByText("1 / 3석")).not.toBeInTheDocument();
});
it("handles empty inventory without NaN or a misleading percentage", () => {
  setup([]);
  expect(screen.getByRole("img", { name: "등록된 좌석 없음" })).toBeVisible();
  expect(screen.queryByText(/NaN|%/)).not.toBeInTheDocument();
});

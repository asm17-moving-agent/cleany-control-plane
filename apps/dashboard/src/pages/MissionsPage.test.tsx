// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { homeSummaryDemo } from "../lib/home-summary-demo";
import { MissionsPage } from "./MissionsPage";

const { cancelMission } = vi.hoisted(() => ({ cancelMission: vi.fn() }));
vi.mock("../operations/OperationsContext", () => ({ useOperations: () => ({
  missions: homeSummaryDemo.missions, robots: [], seats: [], isLoading: false, error: null, refresh: vi.fn(), cancelMission,
}) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("prevents repeated cancellation while pending and allows retry after failure", async () => {
  let reject!: (error: Error) => void;
  cancelMission.mockImplementationOnce(() => new Promise((_, no) => { reject = no; })).mockResolvedValueOnce({});
  render(<MemoryRouter initialEntries={["/missions?mission=demo-12"]}><MissionsPage /></MemoryRouter>);
  const button = screen.getByRole("button", { name: "작업 취소 요청" });
  fireEvent.click(button); fireEvent.click(button);
  expect(cancelMission).toHaveBeenCalledTimes(1);
  expect(cancelMission).toHaveBeenCalledWith("demo-12");
  expect(button).toBeDisabled();
  await act(async () => reject(new Error("연결 오류")));
  expect(screen.getByRole("alert")).toHaveTextContent("연결 오류");
  fireEvent.click(screen.getByRole("button", { name: "작업 취소 요청" }));
  await act(async () => {});
  expect(cancelMission).toHaveBeenCalledTimes(2);
});

it("opens a terminal request through its URL without offering cancellation", () => {
  render(<MemoryRouter initialEntries={["/missions?mission=demo-03"]}><MissionsPage /></MemoryRouter>);
  expect(screen.queryByRole("button", { name: "작업 취소 요청" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "작업 결과 보기" })).toHaveAttribute("href", "/results?mission=demo-03");
  expect(cancelMission).not.toHaveBeenCalled();
});

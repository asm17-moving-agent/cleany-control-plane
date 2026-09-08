// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RobotModel } from "./RobotModel";
import { MemoryRouter } from "react-router";

vi.mock("./RobotModelCanvas", () => ({ default: () => <div data-testid="model-canvas">3D canvas</div> }));

describe("RobotModel", () => {
  it("does not mount the renderer until requested and releases it on close", async () => {
    render(<MemoryRouter><RobotModel /></MemoryRouter>);
    expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /3D 모델 살펴보기/ }));
    expect(await screen.findByTestId("model-canvas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /3D 닫기/ }));
    expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
    expect(screen.getByText(/실시간 미연동/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RobotModel } from "./RobotModel";

const { release } = vi.hoisted(() => ({ release: vi.fn() }));
vi.mock("./RobotModelCanvas", () => ({
  default: ({ onReady, onError }: { onReady: () => void; onError: () => void }) => {
    useEffect(() => { onReady(); return release; }, [onReady]);
    return <div data-testid="model-canvas"><button onClick={onError}>Simulate WebGL failure</button></div>;
  },
}));

let intersect: (entries: { isIntersecting: boolean }[]) => void;
let finePointer = true;
beforeEach(() => {
  finePointer = true;
  release.mockClear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: finePointer, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const enterViewport = () => act(() => intersect([{ isIntersecting: true }]));

describe("RobotModel", () => {
  it("keeps a poster until near the viewport, then loads without a click", async () => {
    render(<RobotModel />);
    expect(screen.getByAltText("Cleany 대기 자세와 외장 시안")).toBeVisible();
    expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
    enterViewport();
    expect(await screen.findByTestId("model-canvas")).toBeInTheDocument();
    expect(await screen.findByText("드래그하여 회전")).toBeInTheDocument();
    expect(screen.getByText("실시간 자세 미연동")).toBeInTheDocument();
  });

  it("keeps the static poster on devices without a fine hover pointer", () => {
    finePointer = false;
    render(<RobotModel />);
    enterViewport();
    expect(screen.getByAltText("Cleany 대기 자세와 외장 시안")).toBeVisible();
    expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
    expect(screen.queryByText("모델 준비 중…")).not.toBeInTheDocument();
  });

  it("returns to the poster on rendering failure and supports retry", async () => {
    render(<RobotModel />);
    enterViewport();
    fireEvent.click(await screen.findByRole("button", { name: "Simulate WebGL failure" }));
    expect(screen.queryByTestId("model-canvas")).not.toBeInTheDocument();
    expect(screen.getByAltText("Cleany 대기 자세와 외장 시안")).toBeVisible();
    expect(release).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "3D 다시 시도" }));
    expect(await screen.findByTestId("model-canvas")).toBeInTheDocument();
    expect(await screen.findByText("드래그하여 회전")).toBeInTheDocument();
  });

  it("unmounts the renderer when the detail card closes", async () => {
    const view = render(<RobotModel />);
    enterViewport();
    await screen.findByTestId("model-canvas");
    view.unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });
});

import { expect, test } from "@playwright/test";
import { FakeGateway } from "./support/fake-gateway";

let gateway: FakeGateway;
test.beforeEach(async ({ baseURL }) => {
  gateway = new FakeGateway(baseURL!.replace("http", "ws") + "/api/robots/cleany-01/gateway/ws");
  await gateway.connect();
});
test.afterEach(async () => { await gateway.disconnect(); });

async function submit(page: import("@playwright/test").Page) {
  await page.goto("/?demo=0&recording=0");
  await page.locator('.facility-map-seat[data-seat-id="seat-12"]').click();
  const response = page.waitForResponse(r => r.url().endsWith("/api/missions") && r.request().method() === "POST");
  await page.getByRole("button", { name: "요청 보내기", exact: true }).click();
  const mission = await (await response).json();
  await expect.poll(() => gateway.offers.some(offer => offer.mission_id === mission.mission_id)).toBe(true);
  return mission.mission_id as string;
}

test("supported seat executes the external FSM phases and displays honest result provenance", async ({ page }, testInfo) => {
  await page.goto("/?demo=0&recording=0");
  await page.locator('.facility-map-seat[data-seat-id="seat-a1-01"]').click();
  await expect(page.getByRole("button", { name: "요청 보내기", exact: true })).toBeDisabled();
  await expect(page.getByText("이 좌석은 아직 로봇 작업을 지원하지 않습니다.")).toBeVisible();
  const id = await submit(page);
  gateway.accept(id);
  gateway.progress(id, "NAVIGATING");
  const detail = page.getByRole("complementary", { name: "로봇 상세", exact: true });
  await expect(detail).toContainText("좌석으로 이동 중");
  gateway.progress(id, "WORKING");
  await expect(detail).toContainText("정리 작업 중");
  await expect(detail).toContainText("시뮬레이션 · 작업 모의 실행");
  await page.screenshot({ path: testInfo.outputPath("gateway-working.png"), fullPage: true, animations: "disabled" });
  await gateway.disconnect();
  await expect(page.locator(".home-telemetry-status")).toContainText("SSE 연결됨");
  await expect(page.locator(".home-telemetry-status")).toContainText("로봇 연결 끊김");
  await gateway.connect();
  await expect(detail).toContainText("정리 작업 중");
  expect(gateway.offers.filter(offer => offer.mission_id === id)).toHaveLength(1);
  gateway.progress(id, "RETURNING");
  await expect(detail).toContainText("복귀 중");
  gateway.finish(id);
  await page.goto("/results?mission=" + id);
  const result = page.getByRole("region", { name: "작업 결과 상세" });
  await expect(result).toContainText("시뮬레이션 · 작업 모의 실행");
  await expect(result).toContainText("요청부터 결과 수신");
  await expect(result).toContainText("pick_object, place_object");
  await expect(result.getByText("연결된 관측 자료가 없습니다")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("gateway-result.png"), fullPage: true, animations: "disabled" });
});

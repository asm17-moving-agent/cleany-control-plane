import { expect, test } from "./support/auth";
import type { Mission } from "../../src/api/types";
import { operationsDemo } from "../../src/operations/operations-demo";
import { dayKey, onMissionDay, shiftDay } from "../../src/features/mission-workspace/mission-day";

test("daily distribution partitions real API records, filters independently of review, and follows the date", async ({ page }) => {
  const today = dayKey(), yesterday = shiftDay(today, -1);
  const base: Mission = { ...operationsDemo.missions[5], phase: "TERMINAL", outcome: "SUCCESS",
    created_at: `${today}T00:00:00+09:00`, finished_at: `${today}T00:01:00+09:00`,
    needs_human_review: false, review: null };
  const records: Mission[] = [
    { ...base, mission_id: "successful-review", needs_human_review: true },
    { ...base, mission_id: "active", phase: "WORKING", outcome: null, finished_at: null },
    { ...base, mission_id: "queued", phase: "QUEUED", outcome: null, finished_at: null },
    { ...base, mission_id: "failed", outcome: "FAILED" },
    { ...base, mission_id: "cancelled", outcome: "CANCELLED" },
    { ...base, mission_id: "partial", outcome: "PARTIAL_SUCCESS" },
    { ...base, mission_id: "yesterday", created_at: `${yesterday}T12:00:00+09:00`, finished_at: `${yesterday}T12:01:00+09:00` },
  ];
  await page.route("**/api/missions?*", route => {
    const date = new URL(route.request().url()).searchParams.get("day");
    return route.fulfill({ json: { items: date ? records.filter(m => onMissionDay(m, date, today)) : records } });
  });
  await page.goto(`/missions?date=${today}&priority=HIGH`);
  const summary = page.getByRole("region", { name: "일별 요약" });
  const bar = summary.getByRole("img");
  await expect(summary.getByLabel("전체 작업 6건", { exact: true })).toBeVisible();
  await expect(bar).toHaveAccessibleName(/실패·중단 2건 \(33.3%\)/);
  await expect(bar.locator("[data-segment]")).toHaveCount(5);
  // CSSOM serializes percentages to six significant digits. Compare its exact
  // representation of the expected fractions; unit tests prove the count sum.
  const expectedWidths = await page.evaluate(() => [1, 1, 1, 2, 1].map(count => {
    const element = document.createElement("span"); element.style.width = `${count / 6 * 100}%`; return element.style.width;
  }));
  const widths = await bar.locator("[data-segment]").evaluateAll(elements => elements.map(el => (el as HTMLElement).style.width));
  expect(widths).toEqual(expectedWidths);
  await page.getByRole("textbox", { name: "작업 검색", exact: true }).fill("no-match");
  for (const [state, count] of [["SUCCESS", 1], ["ACTIVE", 1], ["QUEUED", 1], ["FAILED", 2], ["OTHER_TERMINAL", 1]] as const) {
    const legend = summary.locator(`[data-state=${state}]`);
    await expect(legend.locator("strong")).toHaveText(String(count));
    await legend.click();
    await expect(legend).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("combobox", { name: "작업 상태", exact: true })).toHaveValue(state);
    await expect(page.getByRole("combobox", { name: "우선순위", exact: true })).toHaveValue("ALL");
    await expect(page.getByRole("textbox", { name: "작업 검색", exact: true })).toHaveValue("");
    await expect(page.locator(".task-row")).toHaveCount(count);
    if (state === "FAILED") await expect(page.locator(".task-row").filter({ hasText: "취소" })).toHaveCount(1);
    await expect(summary.getByLabel("전체 작업 6건", { exact: true })).toBeVisible();
    await legend.click();
    await expect(page.locator(".task-row")).toHaveCount(6);
  }
  const review = summary.getByRole("button", { name: "확인 필요 3", exact: true });
  await review.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".task-row")).toHaveCount(3);
  await expect(review).toHaveAttribute("aria-pressed", "true");
  await expect(bar.locator("[data-segment]")).toHaveCount(5);
  await expect(summary.getByLabel("전체 작업 6건", { exact: true })).toBeVisible();
  await review.click();
  await page.getByRole("button", { name: "이전 날짜", exact: true }).click();
  await expect(summary.getByLabel("전체 작업 1건", { exact: true })).toBeVisible();
  await expect(bar.locator("[data-segment=SUCCESS]")).toHaveCSS("width", `${await bar.evaluate(el => el.clientWidth)}px`);
  await expect(bar.locator("[data-segment]")).toHaveCount(1);
  await page.getByRole("button", { name: "다음 날짜", exact: true }).click();
  await expect(summary.getByLabel("전체 작업 6건", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다음 날짜", exact: true }).click();
  await expect(summary.getByLabel("전체 작업 0건", { exact: true })).toBeVisible();
  await expect(bar).toHaveAccessibleName("작업 없음");
  await expect(bar.locator("[data-segment]")).toHaveCount(0);
  await expect(summary.getByText("작업 없음", { exact: true })).toBeVisible();
  await expect(summary.locator("button:not(:disabled)")).toHaveCount(0);
});

import { expect, test } from "./support/auth";
import { dayKey, shiftDay } from "../../src/features/mission-workspace/mission-day";
import { operationsDemo } from "../../src/operations/operations-demo";

test("calendar, summary filters and inline results share a single workspace", async ({ page }) => {
 // Keep the real authenticated session's clock; a future fixture time expires it locally.
 const now=new Date(), today=dayKey(now), yesterday=shiftDay(today,-1), previous=shiftDay(today,-2);
 await page.clock.setFixedTime(now);
 await page.goto('/missions?demo=1');
 await expect(page.getByRole('button',{name:today,exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.task-row')).toHaveCount(7);
 await expect(page.locator('.task-summary-bar')).toHaveCount(0);
 await expect(page.getByRole('button',{name:today,exact:true})).toHaveAccessibleDescription('작업 7건, 확인 필요 2건');
 // A month can start on Sunday, placing yesterday outside its visible grid.
 await page.getByRole('button',{name:'이전 날짜',exact:true}).click();
 await expect(page.getByRole('button',{name:yesterday,exact:true})).toHaveAccessibleDescription('작업 1건, 확인 필요 1건');
 await expect(page.locator('.task-row')).toHaveCount(1);
 await expect(page.getByRole('region',{name:'작업 상세',exact:true})).toContainText('NAVIGATION_BLOCKED');
 const selected=page.getByRole('button',{name:yesterday,exact:true});await selected.focus();await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('button',{name:previous,exact:true})).toBeFocused();
 await expect(page.getByRole('heading',{name:'작업 요청 없음'})).toBeVisible();
 await page.getByRole('button',{name:'오늘',exact:true}).click();
 await expect(page.locator('.task-row')).toHaveCount(7);
 await page.getByRole('textbox',{name:'작업 검색'}).fill('없는 좌석');
 await page.getByRole('combobox',{name:'우선순위',exact:true}).selectOption('HIGH');
 await page.getByRole('region',{name:'일별 요약'}).getByRole('button',{name:'확인 필요 2'}).click();
 await expect(page.getByRole('textbox',{name:'작업 검색'})).toHaveValue('');
 await expect(page.getByRole('combobox',{name:'우선순위',exact:true})).toHaveValue('ALL');
 await expect(page.locator('.task-row')).toHaveCount(2);
 await expect(page.getByRole('region',{name:'작업 상세',exact:true})).toContainText('07번 좌석');
 await expect(page.getByRole('img',{name:'작업 전 AI 생성 예시 사진'})).toBeVisible();
 await expect(page.getByRole('button',{name:'검토 완료',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'다시 작업 요청',exact:true}).click();
 await expect(page.getByLabel('작업 좌석',{exact:true})).toHaveValue('seat-07');
 await expect(page.getByRole('button',{name:'요청 보내기',exact:true})).toBeDisabled();
});

test("new work and retry register separate missions through the existing API", async ({ page }) => {
 await page.goto('/missions');
 await page.getByRole('button',{name:'새 작업 요청 열기',exact:true}).click();
 await page.getByLabel('작업 좌석',{exact:true}).selectOption('seat-12');
 await page.getByLabel('우선순위',{exact:true}).last().selectOption('HIGH');
 const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/missions'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'요청 보내기',exact:true}).click();
 const first=await (await created).json();
 await expect(page.getByRole('region',{name:'작업 상세',exact:true})).toContainText('12번 좌석');
 await expect(page.getByRole('button',{name:'다시 작업 요청',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'다시 작업 요청',exact:true}).click();
 await expect(page.getByLabel('작업 좌석',{exact:true})).toHaveValue('seat-12');
 const retried=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/missions'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'요청 보내기',exact:true}).click();
 const second=await (await retried).json();
 expect(first.mission_id).not.toBe(second.mission_id);expect(first.idempotency_key).not.toBe(second.idempotency_key);
 const original=await page.request.get(`/api/missions/${first.mission_id}?site_id=BUSAN_SOMA_18F`);
 expect((await original.json()).outcome).toBe('SUCCESS');
});

test("review acknowledgement is explicit, persists on reload and retains the failure", async ({ page }) => {
 const today=dayKey();
 let record={...operationsDemo.missions[3],mission_id:'review-fixture',phase:'TERMINAL',outcome:'FAILED',failure_code:'OBJECT_REMAINING',
  created_at:`${today}T00:00:00+09:00`,finished_at:`${today}T00:01:00+09:00`,review:null as null|{reviewed_at:string;reviewed_by:string;reviewer_name:string}};
 let reviews=0;
 await page.route('**/api/missions?*',route=>route.fulfill({json:{items:[record]}}));
 await page.route('**/api/missions/review-fixture/review?*',route=>{reviews++;record={...record,review:{reviewed_at:`${today}T01:00:00+09:00`,reviewed_by:'operator',reviewer_name:'운영자'}};return route.fulfill({json:record});});
 await page.goto('/missions?filter=REVIEW&mission=review-fixture');
 const detail=page.getByRole('region',{name:'작업 상세',exact:true});
 await expect(detail).toContainText('OBJECT_REMAINING');expect(reviews).toBe(0);
 await detail.getByRole('button',{name:'검토 완료',exact:true}).click();
 await expect(detail.getByText('검토 완료',{exact:true})).toBeVisible();
 await expect(detail.locator('.task-detail-heading').getByText('실패',{exact:true})).toBeVisible();
 expect(reviews).toBe(1);
 await page.reload();await expect(detail.getByText('검토 완료',{exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'일별 요약'}).getByRole('button',{name:'확인 필요 0'})).toBeVisible();
 await expect(page.getByRole('button',{name:today,exact:true})).toHaveAccessibleDescription('작업 1건, 확인 필요 0건');
 await expect(page.getByRole('button',{name:today,exact:true}).locator('..').locator('[data-marker=work]')).toHaveCount(1);
 await expect(page.getByRole('button',{name:today,exact:true}).locator('..').locator('[data-marker=review]')).toHaveCount(0);
});

test("daily history pages beyond the latest 50 and changes date without mixing results",async({page})=>{
 const today=dayKey(), yesterday=shiftDay(today,-1);
 const history=Array.from({length:150},(_,i)=>({...operationsDemo.missions[5],mission_id:`history-${String(i).padStart(3,'0')}`,created_at:`${today}T00:00:00+09:00`,finished_at:`${today}T00:01:00+09:00`})).reverse();
 const cursors:string[]=[];
 await page.route('**/api/missions?*',route=>{
  const url=new URL(route.request().url());const date=url.searchParams.get('day');const cursor=url.searchParams.get('before');
  if(cursor)cursors.push(cursor);
  const items=date===yesterday?[]:!date?history.slice(0,50):cursor?history.slice(100):history.slice(0,100);
  return route.fulfill({json:{items}});
 });
 await page.goto('/missions');await expect(page.locator('.task-row')).toHaveCount(150);
 expect(cursors.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'이전 날짜',exact:true}).click();
 await expect(page.getByRole('heading',{name:'작업 요청 없음'})).toBeVisible();
 await expect(page.locator('.task-row')).toHaveCount(0);
});

test("a result outside the latest snapshot opens its own day, while a broken link leaves the list usable", async ({page}) => {
 const previous=shiftDay(dayKey(),-10);
 const record={...operationsDemo.missions[5],mission_id:'older-result',created_at:`${previous}T10:00:00+09:00`,finished_at:`${previous}T10:10:00+09:00`};
 await page.route('**/api/missions?*',route=>route.fulfill({json:{items:new URL(route.request().url()).searchParams.get('day')===previous?[record]:[]}}));
 await page.route('**/api/missions/older-result?*',route=>route.fulfill({json:record}));
 await page.goto('/results?mission=older-result');
 await expect(page.getByRole('button',{name:previous,exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.task-row')).toHaveCount(1);
 await expect(page.getByRole('region',{name:'작업 상세',exact:true})).toContainText('완료');
 await page.goto(`/missions?date=${previous}&mission=missing-result`);
 await expect(page.getByRole('alert')).toContainText('선택한 작업을 불러올 수 없음');
 await expect(page.locator('.task-row')).toHaveCount(1);
 await page.locator('.task-row').click();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'작업 상세',exact:true})).toContainText('완료');
});

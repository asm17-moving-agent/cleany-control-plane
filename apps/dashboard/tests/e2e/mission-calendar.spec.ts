import { expect, test } from "./support/auth";
import type { Mission } from "../../src/api/types";
import { operationsDemo } from "../../src/operations/operations-demo";
import { onMissionDay } from "../../src/features/mission-workspace/mission-day";

const today = "2026-11-17";
const complete = {...operationsDemo.missions[5],phase:"TERMINAL" as const,outcome:"SUCCESS" as const,needs_human_review:false,review:null};

test("calendar reads complete day history, month boundaries and review outside the latest snapshot", async ({page}) => {
  const records: Mission[] = [
    ...Array.from({length:105},(_,i)=>({...complete,mission_id:`older-${104-i}`,created_at:'2026-11-03T12:00:00+09:00',finished_at:'2026-11-03T12:10:00+09:00',outcome:i===104?'FAILED' as const:'SUCCESS' as const})),
    {...complete,mission_id:'month-crossing',created_at:'2026-10-31T23:50:00+09:00',finished_at:'2026-11-01T00:10:00+09:00'},
    {...complete,mission_id:'today',created_at:`${today}T10:00:00+09:00`,finished_at:`${today}T10:10:00+09:00`},
  ];
  const readDates=new Set<string>();let nextPages=0;
  await page.route('**/api/missions?*',route=>{
    const url=new URL(route.request().url()), day=url.searchParams.get('day');
    if(!day)return route.fulfill({json:{items:[records.at(-1)]}});
    readDates.add(day);const rows=records.filter(m=>onMissionDay(m,day,today));
    const cursor=url.searchParams.get('before');if(cursor)nextPages++;
    return route.fulfill({json:{items:cursor?rows.slice(100):rows.slice(0,100)}});
  });
  await page.goto(`/missions?date=${today}`);
  const oldDay=page.getByRole('button',{name:'2026-11-03',exact:true});
  await expect(oldDay).toHaveAccessibleDescription('작업 105건, 확인 필요 1건');
  await expect(oldDay.locator('..').locator('[data-marker]')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'2026-11-01',exact:true})).toHaveAccessibleDescription('작업 1건, 확인 필요 0건');
  expect(nextPages).toBeGreaterThan(0);
  await oldDay.click();await expect(page.locator('.task-row')).toHaveCount(105);
  const summary=page.getByRole('region',{name:'일별 요약'});
  await expect(summary.locator('[data-state=complete] strong')).toHaveText('104');
  await summary.getByRole('button',{name:'확인 필요 1',exact:true}).click();
  await expect(page.locator('.task-row')).toHaveCount(1);
  // Browsing a month does not change the selected day's list or summary.
  await page.getByRole('button',{name:'이전 달',exact:true}).click();
  await expect(page.getByRole('button',{name:'2026-10-31',exact:true})).toHaveAccessibleDescription('작업 1건, 확인 필요 0건');
  await expect(page.locator('.task-row')).toHaveCount(1);
  expect(readDates.has('2026-10-31')).toBe(true);
  await page.getByRole('button',{name:'2026-10-31',exact:true}).click();
  await expect(summary.locator('[data-state=complete] strong')).toHaveText('1');
  await page.getByRole('combobox',{name:'작업 상태',exact:true}).selectOption('ALL');
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.getByRole('button',{name:'다음 달',exact:true}).click();
  records[104]={...records[104],review:{reviewed_at:`${today}T12:00:00+09:00`,reviewed_by:'operator',reviewer_name:'운영자'}};
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await expect(page.getByRole('button',{name:'2026-11-03',exact:true})).toHaveAccessibleDescription('작업 105건, 확인 필요 0건');
});

test("a failed calendar read can retry without blocking the selected day's work",async({page})=>{
  let fail=true;
  const record={...complete,mission_id:'today',created_at:`${today}T10:00:00+09:00`,finished_at:`${today}T10:10:00+09:00`};
  await page.route('**/api/missions?*',route=>{
    const date=new URL(route.request().url()).searchParams.get('day');
    if(date==='2026-11-03'&&fail)return route.fulfill({status:503,json:{detail:'temporary failure'}});
    return route.fulfill({json:{items:!date||date===today?[record]:[]}});
  });
  await page.goto(`/missions?date=${today}`);
  await expect(page.locator('.task-calendar-status').getByText('날짜별 현황 조회 실패',{exact:true})).toBeVisible();
  await expect(page.locator('.task-row')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'2026-11-03',exact:true})).toHaveAccessibleDescription('날짜별 현황 조회 실패');
  fail=false;await page.getByRole('button',{name:'다시 조회',exact:true}).click();
  await expect(page.getByRole('button',{name:'2026-11-03',exact:true})).toHaveAccessibleDescription('작업 0건, 확인 필요 0건');
  await expect(page.getByText('날짜별 현황 조회 실패',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:today,exact:true})).toHaveAccessibleDescription('작업 1건, 확인 필요 0건');
});

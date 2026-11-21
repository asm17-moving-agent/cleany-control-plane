// Run against ui_question_fixture.py. Each operator question gets a fresh conversation.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const dashboard = createRequire(path.resolve(__dirname, '../../apps/dashboard/package.json'));
const { chromium, expect } = dashboard('@playwright/test');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'ui_questions.json')));
const destination = process.argv[2];
const port = Number(process.argv[3] ?? 18767);
const base = 'http://127.0.0.1:' + port;
const extraCases = process.argv[4] === '--cases' ? JSON.parse(fs.readFileSync(process.argv[5])) : null;
const subset = !extraCases && process.argv[4] ? new Set(JSON.parse(fs.readFileSync(process.argv[4]))) : null;
const site = 'BUSAN_SOMA_18F';
const groups = Object.entries(cases);
if (groups.length !== 20 || groups.some(([, qs]) => qs.length < 3 || qs.length > 5)) throw Error('Unexpected case set');
const pending = extraCases ?? groups.flatMap(([expected, questions]) => questions.map((question, i) => ({expected, question, i})));
const completed = fs.existsSync(destination) ? fs.readFileSync(destination,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line).question) : [];
const tasks = pending.filter(r => !completed.includes(r.question) && (!subset || subset.has(r.question)));
const relevant = r => /^\/api\/agent\/conversations\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method()==='GET';
async function run(browser) {
  const context = await browser.newContext({viewport:{width:1440,height:1080},locale:'ko-KR',timezoneId:'Asia/Seoul'});
  try {
    const page = await context.newPage();
    await page.goto(base + '/map');
    await page.getByLabel('아이디',{exact:true}).fill('test-operator');
    await page.getByLabel('비밀번호',{exact:true}).fill('test-user-password-2026');
    await page.getByRole('button',{name:'로그인',exact:true}).click();
    await expect(page.getByRole('button',{name:'Cleany AI 열기'})).toBeVisible();
    const status = await (await page.request.get(base+'/api/agent/status?site_id='+site)).json();
    if (status.execution_mode !== 'mock' || status.provider !== 'openai' || !status.configured) throw Error('Expected configured OpenAI test fixture');
    await page.getByRole('button',{name:'Cleany AI 열기'}).click();
    const panel = page.getByRole('complementary',{name:'Cleany AI 운영 도우미'});
    await expect(panel.getByRole('combobox',{name:'대화 기록'})).toBeEnabled();
    for (let row; (row=tasks.shift());) {
      await panel.getByRole('button',{name:'새 대화',exact:true}).click();
      await expect(panel.locator('.agent-message')).toHaveCount(0);
      await panel.getByLabel('AI에게 요청').fill(row.question);
      const refreshed = page.waitForResponse(async response => {
        if(!relevant(response)||!response.ok())return false;
        const data=await response.json().catch(()=>null);
        return data?.messages.some(m=>m.role==='user' && m.content===row.question)
          && ['complete','error','interrupted'].includes(data.messages.at(-1)?.status)
          && data.messages.at(-1)?.role==='assistant';
      },{timeout:202000});
      const start = Date.now();
      await panel.getByRole('button',{name:'보내기 ↑'}).click();
      const detail = await (await refreshed).json();
      const seconds = (Date.now()-start)/1000;
      const message = detail.messages.at(-1);
      await expect(panel.locator('.agent-message.is-user .agent-message-text')).toHaveText(row.question);
      const reply = panel.locator('.agent-message.is-assistant');
      await expect(reply).toHaveCount(1);
      const cards = reply.locator('.agent-view, .agent-result-card');
      await expect(cards).toHaveCount(message.cards.length);
      const rendered = [];
      for (const el of await cards.all()) {
        const label = await el.getAttribute('aria-label');
        const kind = await el.getAttribute('data-kind') ??
          ({'작업 진행 카드':'mission_progress','날짜별 작업 비교':'day_comparison'}[label] ?? label);
        rendered.push({kind,label,visible:await el.isVisible()});
      }
      const scopes=message.cards.map(c=>({kind:c.kind,scope:c.scope_label,seat:c.seat_id,focused:c.seat_ids??c.focus_seats,
        start:c.start_day??c.start,end:c.end_day??c.end,total_seats:c.seats?.length,
        sample_count:c.sample_count, basis:c.basis, buckets:c.buckets?.map(({label,value,capacity})=>({label,value,capacity})),
        zones:c.seats ? [...new Set(c.seats.map(s=>s.zone_id))] : undefined}));
      const record={...row,model:status.model,status:message.status,error:message.error,answer:message.content,
        stored:message.cards.map(c=>c.kind),rendered,scopes,summaries:message.summaries.map(s=>s.title),
        plans:detail.plans.length,seconds,conversation:detail.conversation_id};
      fs.appendFileSync(destination,JSON.stringify(record)+'\n');
      console.log(row.expected, row.i+1, message.status, rendered.map(c=>c.kind).join(',')||'none',seconds);
    }
  } finally { await context.close(); }
}
(async()=>{const browser=await chromium.launch();try {
  const results=await Promise.allSettled(Array.from({length:3},()=>run(browser)));
  for(const result of results)if(result.status==='rejected')throw result.reason;
}finally{await browser.close();}})().catch(err=>{console.error(err);process.exitCode=1});

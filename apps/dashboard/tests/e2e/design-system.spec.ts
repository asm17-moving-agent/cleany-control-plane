import { test, expect } from './support/auth';

test('menus support keyboard navigation, dismissal and focus return', async ({page}) => {
 await page.goto('/');
 const trigger=page.getByRole('button',{name:'운영 메뉴',exact:true});
 await trigger.focus(); await page.keyboard.press('ArrowDown');
 const menu=page.getByRole('menu'); await expect(menu).toBeVisible();
 await expect(page.getByRole('menuitem',{name:'로그아웃',exact:true})).toBeFocused();
 await page.keyboard.press('ArrowDown'); await expect(page.getByRole('menuitem',{name:'예시 데이터 보기',exact:true})).toBeFocused();
 await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
 await trigger.click(); await page.getByRole('menuitem',{name:'촬영 모드',exact:true}).click();
 await expect(page).toHaveURL(/\/map\?recording=1$/); await expect(menu).toHaveCount(0);
 await page.goto('/settings');
 await trigger.click(); await page.getByRole('heading',{name:'관제 설정',exact:true,level:2}).click(); await expect(menu).toHaveCount(0);
});

test('settings save consumed preferences without overwriting dormant values', async ({page}) => {
 await page.goto('/settings');
 const original={refreshSeconds:'5',defaultPriority:'NORMAL',liveStatus:false,completionNotification:false};
 await page.evaluate(value=>localStorage.setItem('cleany.dashboard.settings',JSON.stringify(value)),original);
 await page.reload();
 await expect(page.getByRole('switch')).toHaveCount(0);
 await expect(page.getByText('Local Mock')).toHaveCount(0);
 await page.getByRole('combobox',{name:'연결 끊김 시 갱신 간격'}).selectOption('30');
 await page.getByRole('combobox',{name:'기본 우선순위'}).selectOption('HIGH');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cleany.dashboard.settings')!))).toEqual(original);
 await page.getByRole('button',{name:'설정 저장'}).click(); await page.reload();
 await expect(page.getByRole('combobox',{name:'연결 끊김 시 갱신 간격'})).toHaveValue('30');
 await expect(page.getByRole('combobox',{name:'기본 우선순위'})).toHaveValue('HIGH');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cleany.dashboard.settings')!))).toEqual({...original,refreshSeconds:'30',defaultPriority:'HIGH'});
 await page.goto('/map'); await page.getByRole('button',{name:'12번 좌석 · 비어 있음'}).click();
 await expect(page.getByRole('combobox',{name:'우선순위'})).toHaveValue('HIGH');
});

test('shared controls and status badges have the same visual roles across pages', async ({page}) => {
 let reference: string[] | undefined;
 for (const route of ['/missions','/results','/robots']) {
  await page.goto(route); await page.evaluate(()=>document.fonts.ready);
  const button=page.locator('.ui-page-header').getByRole('button',{name:'새로고침'});
  await expect(button).toBeVisible();
  const style=await button.evaluate(el=>{const s=getComputedStyle(el);return [s.height,s.fontFamily,s.fontSize,s.fontWeight,s.borderRadius,s.backgroundColor];});
  expect(style[0]).toBe('40px');expect(style[2]).toBe('14px');expect(style[3]).toBe('600');expect(style[4]).toBe('8px');
  if(reference) expect(style).toEqual(reference); else reference=style;
 }
 await page.goto('/map?demo=1'); const home=page.locator('.home-robot-list .robot-state-badge').first();
 await expect(home).toHaveCSS('border-radius','6px'); await expect(home).toHaveCSS('font-size','12px');
 await page.goto('/robots?demo=1'); await expect(page.locator('.fleet-roster .robot-state-badge').first()).toHaveCSS('border-radius','6px');
});


test('semantic text and control borders meet contrast targets', async ({page}) => {
 await page.goto('/settings');
 const contrasts=await page.evaluate(()=>{
  function rgb(token: string) {
   const el=document.createElement('span');el.style.color=`var(${token})`;document.body.append(el);
   const color=getComputedStyle(el).color;el.remove();
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
   return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
  }
  function contrast(a:string,b:string) {const x=rgb(a),y=rgb(b);const l=(v:number[])=>v[0]*.2126+v[1]*.7152+v[2]*.0722;return (Math.max(l(x),l(y))+.05)/(Math.min(l(x),l(y))+.05);}
  return [contrast('--color-text','--color-surface'),contrast('--color-text-muted','--color-surface'),contrast('--color-on-action','--color-action'),contrast('--color-action-ink','--color-action-soft'),contrast('--color-danger','--color-danger-soft'),contrast('--color-warning','--color-warning-soft'),contrast('--color-control-border','--color-surface')];
 });
 for(const value of contrasts.slice(0,-1)) expect(value).toBeGreaterThanOrEqual(4.5);
 expect(contrasts.at(-1)).toBeGreaterThanOrEqual(3);
});

test('page shells share title alignment, spacing and deliberate width variants', async ({page}) => {
 for (const width of [1920,1366,1024]) {
  await page.setViewportSize({width,height:1080});
  for (const [route,max] of [['/',1440],['/settings',1440],['/missions',1760],['/robots',1760]] as const) {
   await page.goto(route+'?demo=1');
   const shell=page.locator('.page-shell');await expect(shell).toBeVisible();
   const box=await shell.boundingBox();const header=shell.locator('> .ui-page-header');
   const heading=await header.locator('h2').boundingBox();
   expect(box!.width).toBe(Math.min(max,width-(width<1280?32:48)));
   expect(box!.x).toBe((width-box!.width)/2);expect(heading!.x).toBe(box!.x);
   await expect(header).toHaveCSS('height','72px');
   await expect(header).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
   await expect(header).toHaveCSS('border-bottom-width','0px');
   const main=page.locator('.control-main');await expect(main).toHaveCSS('padding',width<1280?'16px':'24px');
   if(route==='/robots') {
    await expect(page.locator('.manual-body')).toHaveCount(0);
    await expect(page.locator('.robot-twin .robot-model-stage')).toHaveCSS('height','280px');
    await page.getByRole('button',{name:'수동 조종',exact:true}).click();
    const manual=page.getByRole('region',{name:'수동 조종',exact:true});
    await expect(manual).toBeVisible();
    const camera=manual.locator('.head-camera');const controls=manual.locator('.manual-body');
    const cam=await camera.boundingBox(),input=await controls.boundingBox();
    if(width>=1280) {expect(input!.x).toBeGreaterThan(cam!.x+cam!.width);expect(Math.abs(input!.y-cam!.y)).toBeLessThan(1);}
    else expect(input!.y).toBeGreaterThan(cam!.y+cam!.height);
    const stop=page.locator('.manual-stop');await expect(stop).toHaveCSS('height','48px');
    await stop.scrollIntoViewIfNeeded();
    const stopBox=await stop.boundingBox();expect(stopBox!.y+stopBox!.height).toBeLessThanOrEqual(1080);
    for(const part of await page.locator('.manual-sticks,.manual-feedback').all()) {
     expect(await part.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    }
   }
  }
 }
});

test('map and fleet robot cards share selection and attention styling', async ({page}) => {
 const styles: string[][]=[];
 for(const route of ['/map','/robots']) {
  await page.goto(route+'?demo=1');
  const card=page.locator('.robot-summary[data-attention]').first();await expect(card).toBeVisible();
  styles.push(await card.evaluate(el=>{const s=getComputedStyle(el);return [s.padding,s.borderRadius,s.borderColor,s.backgroundColor,s.gridTemplateColumns];}));
 }
 expect(styles[0].slice(0,4)).toEqual(styles[1].slice(0,4));
});

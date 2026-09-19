import {chromium,expect} from 'playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base=new URL(process.env.GOLF_TEST_URL||'http://127.0.0.1:5088');
if(base.hostname!=='127.0.0.1')throw new Error('Browser tests require an isolated loopback demo.');
const runtime=await fetch(new URL('/api/runtime',base)).then(r=>r.json());if(runtime.mode!=='demo')throw new Error('Browser tests only operate an invented demo.');
const out=resolve(process.env.GOLF_BROWSER_OUTPUT||'artifacts/browser-proposals');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
const errors=[],outside=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==base.origin){outside.push(route.request().url());return route.abort();}return route.continue();});
async function section(name){await page.getByRole('navigation',{name:'Proposal sections'}).getByRole('button',{name,exact:true}).click();}
async function total(text){await expect(page.getByTestId('proposal-total')).toHaveText(text);}
try{
 await page.goto(base.href);await page.getByRole('button',{name:'Open as organizer'}).click();await page.locator('[data-tab="proposals"]').click();
 const names=['Valley Weekend','Meadow Retreat','Lake Circuit','Two Cottage Escape','Clubhouse Collection'];
 for(const [index,name] of names.entries()){
  await page.getByRole('button',{name:'Explore '+name,exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Enlarge:/}).first().click();await expect(page.locator('dialog[open]')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('dialog[open]')).toHaveCount(0);
  await section('Budget');
  if(index===0){await total('$1,048');await page.getByLabel('Your arrival route').selectOption('fly');await total('$1,331');await page.getByLabel('Add the practice round').uncheck();await total('$1,277');}
  if(index===1){await total('$1,052');await expect(page.getByTestId('proposal-hard')).toHaveCount(0);}
  if(index===2){await total('$1,168');const hard=await page.getByTestId('proposal-hard').innerText();await page.getByLabel('Show the hypothetical winner return').check();await total('$953');await expect(page.getByTestId('proposal-hard')).toHaveText(hard);}
  if(index===3){await total('$1,202');await page.getByLabel('Add the practice round').check();await total('$1,277');await page.getByLabel('People splitting the lodging').fill('0');await total('Check the inputs');await page.getByLabel('People splitting the lodging').fill('8');await total('$1,277');}
  if(index===4){await total('$1,174.70');await page.getByLabel('Add a replay at the same premium rate').check();await total('$1,360.70');await page.getByLabel('Shared house').selectOption('veranda');await total('$1,416.50');await page.getByLabel('Finale package').selectOption('sunroom');await total('$1,474.50');await page.getByLabel(/^Premium round rate/).fill('');await total('Check the inputs');await page.getByLabel(/^Premium round rate/).fill('186');await total('$1,474.50');await page.getByLabel('Shared house').focus();await page.keyboard.press('End');await expect(page.getByLabel('Shared house')).toHaveValue('veranda');}
  await page.getByRole('button',{name:'Copy this scenario'}).click();const link=page.url();await page.reload();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await section('Budget');checks.push({name,sharedLink:link,total:await page.getByTestId('proposal-total').innerText()});
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:resolve(out,`${index+1}-budget-${width}.png`),fullPage:true});}
  await section('Day by day');for(const button of await page.locator('.proposal-picker button').all())await button.click();
  if(index===4)await expect(page.locator('.proposal-timeline')).toContainText('Sunroom finale package');
  await section('The courses');for(const button of await page.locator('.proposal-picker button').all())await button.click();await page.getByText('Rate notes & booking checks',{exact:true}).click();
  await section('Stay & getting around');await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:/^Show /}).first().focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await page.emulateMedia({media:'print'});await expect(page.locator('.proposal-print-only')).toBeVisible();await expect(page.locator('.proposal-screen-content')).toBeHidden();await page.pdf({path:resolve(out,`${index+1}-proposal.pdf`),format:'Letter',printBackground:true});await page.emulateMedia({media:'screen'});
  await page.getByRole('button',{name:'All five ideas',exact:false}).click();
 }
 if(errors.length||outside.length)throw new Error(JSON.stringify({errors,outside}));
 await writeFile(resolve(out,'results.json'),JSON.stringify({checks,errors,outside},null,2));console.log(JSON.stringify({passed:checks.length,viewports:4,printPDFs:5,errors,outside}));
}finally{await browser.close();}

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=process.env.PLAYWRIGHT_MODULE?await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href):await import('playwright');
const base=process.env.LIBRARY_BASE_URL||'http://luke-mac-mini.local/evaluation-database/';
const output=path.join(root,'validation');await fs.mkdir(output,{recursive:true});
const text=await fs.readFile(path.join(root,'dist/data.js'),'utf8');const records=JSON.parse(text.slice(text.indexOf('['),text.lastIndexOf(']')+1));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base);assert.equal(await page.locator('#evaluation-list tr').count(),28);
 assert.equal(await page.locator('[data-save],#view-saved').count(),0);
 await page.screenshot({path:path.join(output,'library-desktop.png')});
 const filterSpec={case:'business_case_uses',topic:'topics',type:'evidence_type',country:'country',access:'access_level'};
 for(const [key,field] of Object.entries(filterSpec)){
  const value=Array.isArray(records[0][field])?records[0][field][0]:records[0][field];
  await page.locator('#'+key+'-filter').selectOption(value);
  const expected=records.filter(r=>Array.isArray(r[field])?r[field].includes(value):r[field]===value);
  assert.equal(await page.locator('#evaluation-list a').count(),expected.length);
  await page.reload();assert.equal(await page.locator('#'+key+'-filter').inputValue(),value);
  await page.locator('#clear-filters').click();assert.equal(await page.locator('#evaluation-list a').count(),28);
 }
 await page.locator('#case-filter').selectOption(records[0].business_case_uses[0]);
 await page.locator('#country-filter').selectOption(records[0].country);
 const combined=records.filter(r=>r.business_case_uses.includes(records[0].business_case_uses[0])&&r.country===records[0].country);
 assert.equal(await page.locator('#evaluation-list a').count(),combined.length);
 await page.locator('#evaluation-list a').first().click();await page.locator('#back-to-results').click();
 assert.equal(await page.locator('#country-filter').inputValue(),records[0].country);
 assert.equal(await page.locator('#evaluation-list a').count(),combined.length);
 await page.locator('#clear-filters').click();
 const first=records[0];await page.locator('#search').fill(first.evaluation_id);
 assert.equal(await page.locator('#evaluation-list tr').count(),1);await page.reload();assert.equal(await page.locator('#search').inputValue(),first.evaluation_id);
 await page.locator('#evaluation-list a').click();assert.equal(await page.locator('h1').innerText(),first.source_title);
 await page.locator('#back-to-results').click();assert.equal(await page.locator('#search').inputValue(),first.evaluation_id);
 await page.locator('#search').fill('');await page.locator('#sort').selectOption('title');
 assert.equal(await page.locator('#evaluation-list a').first().innerText(),[...records].sort((a,b)=>a.source_title.localeCompare(b.source_title))[0].source_title);
 await page.locator('#search').fill('zzzz-unmatched');assert.equal(await page.locator('#evaluation-list a').count(),0);
 await page.locator('#search').fill('');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-csv').click()]);
 await download.saveAs(path.join(output,'all-evidence.csv'));assert.deepEqual(await fs.readFile(path.join(output,'all-evidence.csv')),await fs.readFile(path.join(root,'dist/evaluation_summaries.csv')));
 for(const r of records){await page.goto(base+'evaluation.html?id='+r.evaluation_id);assert.equal(await page.locator('h1').innerText(),r.source_title);assert.equal(await page.locator('#heading-findings + p').innerText(),r.findings);assert((await page.locator('.boundary').innerText()).includes(r.transfer_boundary));assert.equal(await page.locator('.source-panel a.primary').getAttribute('href'),r.source_file_url);}
 const catalogue=JSON.parse(await fs.readFile(path.join(root,'content/catalogue.json'),'utf8'));
 for(const r of catalogue.filter(r=>!records.some(x=>x.evaluation_id===r.evaluation_id))){await page.goto(base+'evaluation.html?id='+r.evaluation_id);assert.equal(await page.locator('h1').innerText(),'Report not found');}
 await page.goto(base+'evaluation.html?id='+first.evaluation_id);await page.locator('#copy-citation').click();assert((await page.locator('#copy-status').innerText()).length>0);await page.screenshot({path:path.join(output,'detail-desktop.png'),fullPage:true});
 await page.goto(base+'docs/content-review.html');assert.equal(await page.locator('.review-table tbody tr').count(),28);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});for(const route of ['', 'evaluation.html?id='+first.evaluation_id,'docs/content-review.html']){await page.goto(base+route);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 await page.setViewportSize({width:390,height:900});await page.goto(base);await page.screenshot({path:path.join(output,'library-mobile.png')});
 assert.deepEqual(errors,[]);const result={result:'PASS',records:28,detailPages:28,omittedDetails:19,filters:'passed',search:'passed',sort:'passed',csv:'passed',mobileWidths:[320,390,768],javascriptErrors:errors};await fs.writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} finally {await browser.close();}

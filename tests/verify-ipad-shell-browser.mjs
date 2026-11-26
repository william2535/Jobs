// Run after npm run build + preview. Options: JOBS_QA_URL, JOBS_QA_BROWSER,
// JOBS_QA_OUTPUT, JOBS_QA_CHROMIUM, JOBS_QA_WEBKIT, PLAYWRIGHT_MODULE.
// Actual built-app checks. Chromium uses CDP touch input for native scrolling;
// WebKit tests the same classification with labelled synthetic Pointer Events.
// Only a synthetic local job is created. No customer files are loaded.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const name=process.env.JOBS_QA_BROWSER||'chromium';
const base=process.env.JOBS_QA_URL||'http://127.0.0.1:4173/';
const out=process.env.JOBS_QA_OUTPUT||'/tmp/jobs-ipad-qa';
fs.mkdirSync(out,{recursive:true});
const result={status:'running',startedAt:new Date().toISOString(),browser:name,base,physicalDevice:false,checks:[],samples:[],errors:[],gestureMethod:name==='chromium'?'Browser-dispatched native CDP touch gestures':'Synthetic Pointer Events for direction classification; native WebKit touch scrolling is not claimed'};
let browser,context,page,stage='launch';
const check=(name,detail)=>{result.checks.push({name,...(detail?{detail}:{})});console.log('PASS '+name);};
const visible=selector=>page.locator(selector+':visible');
const shot=label=>page.screenshot({path:path.join(out,name+'-'+label+'.png'),fullPage:false});
const nav=()=>page.getByRole('navigation',{name:'Mobile workspace',exact:true});
async function home(){const button=visible('[data-action="home"]');if(await button.count())await button.first().click();else{const workspace=page.getByRole('navigation',{name:'Workspace navigation',exact:true});if(await workspace.isVisible()){await workspace.getByText('Menu',{exact:true}).click();await workspace.getByRole('button',{name:'Home',exact:true}).click();}else await nav().getByRole('button',{name:'Dashboard',exact:true}).click();}await page.locator('body[data-page="home"]').waitFor();}
async function tab(label){await nav().getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(label=>document.body.dataset.jobsMobileTab===label.toLowerCase(),label);}
async function ready(){await page.waitForFunction(()=>document.querySelector('#offline-status')?.textContent==='Ready offline',null,{timeout:120000});}
async function metrics(){return page.evaluate(()=>{
 const measure=selector=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,fontSize:s.fontSize,lineHeight:s.lineHeight,background:s.backgroundImage,transform:s.transform,text:el.textContent.trim()};};
 return{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,scrollY,pointerCoarse:matchMedia('(pointer:coarse)').matches,header:measure('.workspace>header'),title:measure('.jobs-banner-title'),logo:measure('.jobs-banner-brand'),nav:measure('.mw-bottom-nav'),status:measure('.connection'),sidebar:measure('.sidebar')};
});}
async function storedJobs(){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('jobs-local');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result,t=d.transaction('jobs','readonly'),q=t.objectStore('jobs').getAll();t.oncomplete=()=>{d.close();resolve(q.result)};t.onerror=()=>reject(t.error);};}));}
async function gesture(dx,dy){
 const box=await page.locator('.connection').boundingBox();assert.ok(box,'Status must be visible before gesture');const x=box.x+Math.min(70,box.width*.25),y=box.y+box.height/2;
 if(name==='chromium'){
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0}]});
  for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6,id:0}]});await page.waitForTimeout(24);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{
  await page.locator('.connection').evaluate((el,{x,y,dx,dy})=>{const options={bubbles:true,pointerId:51,pointerType:'touch',isPrimary:true,button:0};el.dispatchEvent(new PointerEvent('pointerdown',{...options,clientX:x,clientY:y}));for(let i=1;i<=6;i++)el.dispatchEvent(new PointerEvent('pointermove',{...options,clientX:x+dx*i/6,clientY:y+dy*i/6}));el.dispatchEvent(new PointerEvent('pointerup',{...options,clientX:x+dx,clientY:y+dy}));},{x,y,dx,dy});
 }
 await page.waitForTimeout(160);
}

async function run(){
 browser=await pw[name].launch({headless:true,executablePath:name==='webkit'?process.env.JOBS_QA_WEBKIT:process.env.JOBS_QA_CHROMIUM,...(name==='chromium'?{args:['--no-sandbox','--disable-dev-shm-usage']}:{})});result.browserVersion=browser.version();
 context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow',acceptDownloads:true,reducedMotion:'reduce'});page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>result.errors.push(e.message));
 stage='built shell';await page.goto(base);await page.locator('body[data-page="home"]').waitFor();await ready();await page.evaluate(()=>document.fonts.ready);result.manifest=await page.evaluate(()=>fetch('./offline-manifest.json').then(r=>r.json()).then(m=>({buildId:m.buildId,version:m.version,assets:m.files?.length})));
 check('Built app verifies its actual offline cache before readiness',result.manifest);
 stage='tablet layouts';
 for(const [label,width,height]of[['phone390',390,844],['split540',540,1024],['ipad768',768,1024],['ipad820',820,1180],['ipad1024',1024,768],['ipad1280',1280,900],['ipad1366',1366,1024],['ipad1376',1376,1032],['tablet1440',1440,1032]]){
  await page.setViewportSize({width,height});await home();let first;
  for(const section of['Dashboard','Tasks','Timesheets','About']){
   await tab(section);await page.evaluate(()=>document.fonts.ready);const m=await metrics();result.samples.push({label,section,...m});assert.ok(m.overflow<=1,`${label}/${section}: horizontal body overflow ${m.overflow}`);assert.ok(m.title&&m.title.height>0,'Shared live-text banner title must be visible');assert.ok(m.nav&&m.nav.height>=44,'Tablet keeps reachable navigation');
   const dimensions=await nav().locator('button,a').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert.ok(dimensions.every(r=>r.height>=44&&r.width>=44),'Touch navigation targets are at least44px');
   const anchor={height:m.header.height,titleX:m.title.x-m.header.x,titleY:m.title.y-m.header.y,titleHeight:m.title.height,font:m.title.fontSize,line:m.title.lineHeight};if(first)assert.deepEqual(anchor,first,`${label}: title position/size changed by section`);else first=anchor;
   if(['Dashboard','Timesheets'].includes(section))await shot(label+'-'+section.toLowerCase());
  }
 }
 const firstPhone=result.samples.find(s=>s.label==='phone390');for(const s of result.samples){assert.equal(s.title.fontSize,firstPhone.title.fontSize,'Phone and tablet section title use the same type size');assert.equal(s.title.lineHeight,firstPhone.title.lineHeight,'Phone and tablet section title use the same line height');}
 check('Phone, split view and768/820/1024/1280/1366/1376/1440px touch layouts fit; section titles keep the same anchor/type scale and44px navigation');
 stage='rapid navigation';await page.setViewportSize({width:820,height:1180});await tab('Dashboard');
 const rapid=await page.evaluate(async()=>{const samples=[];for(let i=0;i<24;i++){const name=['Tasks','Timesheets','About','Dashboard'][i%4];[...document.querySelectorAll('.mw-bottom-nav button')].find(b=>b.textContent.trim()===name).click();await new Promise(requestAnimationFrame);const h=document.querySelector('.workspace>header').getBoundingClientRect(),t=document.querySelector('.jobs-banner-title').getBoundingClientRect();samples.push([h.x,h.y,h.width,h.height,t.x,t.y,t.height,getComputedStyle(document.querySelector('.jobs-banner-title')).fontSize]);}return samples;});assert.ok(rapid.every(m=>JSON.stringify(m)===JSON.stringify(rapid[0])),'Rapid section changes must not animate header/title bounds');result.rapidBounds=rapid[0];check('Twenty-four rapid section changes keep the header and title bounds stable');
 stage='fine pointer and desktop';const desktop=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'allow',reducedMotion:'reduce'});const fine=await desktop.newPage();fine.setDefaultTimeout(30000);await fine.goto(base);await fine.locator('body[data-page="home"]').waitFor();
 for(const [width,height]of[[1024,768],[1440,1000]]){
  await fine.setViewportSize({width,height});let firstDesktop;
  for(const action of['home','sites','timesheets','help']){
   await fine.locator(`.sidebar [data-action="${action}"]`).first().click();await fine.waitForFunction(action=>document.body.dataset.page===action,action);assert.ok(await fine.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const anchor=await fine.evaluate(()=>{const h=document.querySelector('.workspace>header').getBoundingClientRect(),t=document.querySelector('.jobs-banner-title'),r=t.getBoundingClientRect(),s=getComputedStyle(t);return{height:h.height,x:r.x-h.x,y:r.y-h.y,heightTitle:r.height,font:s.fontSize,line:s.lineHeight};});
   if(firstDesktop)assert.deepEqual(anchor,firstDesktop,`Desktop ${width}: ${action} title changed geometry`);else firstDesktop=anchor;
  }
  await fine.screenshot({path:path.join(out,name+'-fine-'+width+'.png')});
 }
 await desktop.close();check('1024px fine-pointer and1440px desktop fit; Home/Sites/Timesheets/Help keep identical heading geometry');
 stage='status gestures';await page.setViewportSize({width:390,height:650});await tab('About');await ready();await page.evaluate(()=>scrollTo(0,0));
 const close=page.getByRole('button',{name:'Hide saved and offline status',exact:true});await close.waitFor({state:'visible'});const cb=await close.boundingBox();assert.ok(cb.height>=44&&cb.width>=44);assert.equal(await page.locator('.connection').evaluate(el=>getComputedStyle(el).touchAction),'pan-y');
 const before=await page.evaluate(()=>scrollY);await gesture(0,-140);assert.equal(await page.locator('.connection').isVisible(),true,'Vertical gesture does not dismiss status');if(name==='chromium'){const after=await page.evaluate(()=>scrollY);assert.ok(after>before,'Native vertical swipe from status must scroll the page');result.verticalScroll={before,after};}
 await gesture(150,3);assert.equal(await page.locator('.connection').isVisible(),false,'Horizontal swipe dismisses informational status');await tab('Dashboard');assert.equal(await page.locator('.connection').isVisible(),false,'Dismissal survives section navigation');
 check(name==='chromium'?'Horizontal touch dismisses status; vertical native touch scrolls without dismissal':'Horizontal/vertical synthetic Pointer Events classify dismissal correctly; native WebKit touch scrolling was not tested',result.verticalScroll);
 stage='visible close';const closePage=await context.newPage();await closePage.goto(base);await closePage.getByRole('button',{name:'Hide saved and offline status',exact:true}).waitFor();await closePage.getByRole('button',{name:'Hide saved and offline status',exact:true}).click();assert.equal(await closePage.locator('.connection').isVisible(),false);await closePage.close();check('Visible44px close button provides the same dismissal without a gesture');
 stage='critical recovery';await visible('[data-action="create"]').first().click();const notes=page.locator('.job-notes');await notes.getByRole('textbox',{name:'Job title',exact:true}).fill('Synthetic iPad recovery check');await notes.getByRole('textbox',{name:'Job notes',exact:true}).fill('Original synthetic saved record.');await notes.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="save-status"]')?.textContent==='Saved on this device');
 const original=await storedJobs();await notes.getByRole('textbox',{name:'Job notes',exact:true}).fill('Synthetic unsaved recovery evidence.');await page.locator('.connection').waitFor({state:'visible'});assert.match(await page.getByTestId('save-status').textContent(),/Unsaved/);assert.equal(await close.isVisible(),false);await gesture(150,1);assert.equal(await page.locator('.connection').isVisible(),true);
 await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,options){if(mode==='readwrite'){IDBDatabase.prototype.transaction=original;throw new DOMException('QA injected quota failure','QuotaExceededError');}return original.call(this,stores,mode,options);};});await notes.getByRole('button',{name:'Save',exact:true}).click();await page.locator('#recovery-actions').waitFor({state:'visible'});assert.match(await page.getByTestId('save-status').textContent(),/Save failed/);assert.equal(await close.isVisible(),false);assert.deepEqual(await storedJobs(),original);
 const dl=page.waitForEvent('download');await page.locator('[data-action="recovery-download"]').click();const downloaded=await dl;const recovery=fs.readFileSync(await downloaded.path(),'utf8');assert.ok(recovery.includes('Synthetic unsaved recovery evidence.'));await notes.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-testid="save-status"]')?.textContent==='Saved on this device');assert.ok(JSON.stringify(await storedJobs()).includes('Synthetic unsaved recovery evidence.'));assert.equal(await page.locator('.connection').isVisible(),false);check('Dismissed status reappears for unsaved and failed saves; cannot hide critical state; recovery export and retry preserve the synthetic job');
 stage='help and offline';await home();await tab('About');await page.getByRole('button',{name:'Help & data',exact:true}).click();await page.locator('.release-help').waitFor();assert.match(await page.locator('.release-help').innerText(),/Ready offline/);await ready();await context.setOffline(true);await page.reload();await page.locator('body[data-page="home"]').waitFor();await ready();assert.ok(JSON.stringify(await storedJobs()).includes('Synthetic unsaved recovery evidence.'));await tab('Tasks');assert.equal(await page.getByTestId('job-card').count(),1);await shot('offline-tasks');check('Help retains full live readiness; actual network-off reload preserves the saved job and tablet navigation');
 assert.deepEqual(result.errors,[]);result.status='passed';
}
try{await run();}catch(error){result.status='failed';result.stage=stage;result.error={message:error.message,stack:error.stack};process.exitCode=1;await shot('failure').catch(()=>{});}finally{result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,name+'-final.json'),JSON.stringify(result,null,2)+'\n');await browser?.close();console.log(JSON.stringify({status:result.status,stage,checks:result.checks.length,error:result.error?.message}));}

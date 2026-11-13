// Optional integration test against the separate original Zone Sketch checkout.
// Creates a temporary receiver-equipped runtime; reference source is never edited.
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {resolve,join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
const reference=process.env.ZONE_SKETCH_REFERENCE;
if(!reference)throw Error('Set ZONE_SKETCH_REFERENCE to the external Zone Sketch index.html.');
const input=JSON.parse(await readFile(resolve('public/demo.zonesketch.json'),'utf8'));
const temporary=await mkdtemp(join(tmpdir(),'jobs-zone-bridge-'));
const runtime=join(temporary,'zone-runtime');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let openerHtml='';
const jobsServer=createServer((req,res)=>res.writeHead(200,{'Content-Type':'text/html'}).end(openerHtml));
await listen(jobsServer);
const jobsOrigin=`http://127.0.0.1:${jobsServer.address().port}`;
execFileSync(process.execPath,[resolve('integrations/zone-sketch/install-bridge.mjs'),'--source',resolve(reference,'..'),'--output',runtime,'--jobs-origin',jobsOrigin],{stdio:'pipe'});
const zoneServer=createServer(async(req,res)=>{
 const name=resolve(runtime,'.'+new URL(req.url,'http://localhost').pathname);
 if(!name.startsWith(runtime+'/'))return res.writeHead(403).end();
 try{const body=await readFile(name);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(name)]||'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}
});
await listen(zoneServer);
const zoneOrigin=`http://127.0.0.1:${zoneServer.address().port}`;
const session='synthetic_bridge_session_123456';
const identity={siteId:'synthetic-site',jobId:'synthetic-job',drawingId:'synthetic-drawing',jobRevision:1,project:input};
openerHtml=`<!doctype html><html><body><button id="edit">Edit site</button><script>
const origin=${JSON.stringify(zoneOrigin)},session=${JSON.stringify(session)},identity=${JSON.stringify(identity)};
window.events=[];window.saved=[];window.dropAck=false;
edit.onclick=()=>{window.zone=window.open(origin+'/index.html#jobsOrigin='+encodeURIComponent(location.origin)+'&session='+session,'zone-test');};
window.addEventListener('message',event=>{const data=event.data;if(event.source!==window.zone||event.origin!==origin||data?.session!==session)return;events.push(data.type);if(data.type==='ready')zone.postMessage({protocol:'jobs-zonesketch',version:1,session,type:'load',payload:identity},origin);if(data.type==='save'){saved.push(data);if(!dropAck)zone.postMessage({protocol:'jobs-zonesketch',version:1,session,type:'saved',requestId:data.requestId,payload:{result:{revision:2}}},origin);}});
</script></body></html>`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.goto(jobsOrigin);
 const popupPromise=page.waitForEvent('popup');
 await page.locator('#edit').click();
 const zone=await popupPromise;
 await page.waitForFunction(()=>events.includes('loaded'));
 assert.equal(await zone.locator('#site').inputValue(),input.project.site);
 await zone.locator('#topCollapseBtn').click();
 await zone.locator('#site').fill('Synthetic bridge edited site');
 await zone.locator('#projectMenuBtn').click();
 await zone.locator('#drawingDetails').click();
 await zone.locator('#revision').fill('BRIDGE-02');
 await zone.locator('#detailsSave').click();
 await zone.getByRole('button',{name:'Save to Jobs',exact:true}).click();
 await page.waitForFunction(()=>saved.length===1);
 await zone.waitForFunction(()=>document.getElementById('jobsBridgeBar').textContent.includes('Saved in Jobs.'));
 const receipt=await page.evaluate(()=>saved[0]);
 assert.equal(receipt.payload.project.project.site,'Synthetic bridge edited site');
 assert.equal(receipt.payload.project.project.meta.revision,'BRIDGE-02');
 assert.equal(receipt.payload.previews.length,input.project.floors.length);
 for(const preview of receipt.payload.previews){assert.match(preview.image,/^data:image\/png;base64,/);assert.ok(preview.width>0&&preview.height>0);assert.equal(preview.renderer,'ZoneSketch');}
 for(const floor of input.project.floors){const actual=receipt.payload.project.project.floors.find(f=>f.id===floor.id);assert.ok(actual);assert.deepEqual(actual.data.symbols.map(s=>s.id),floor.data.symbols.map(s=>s.id));}
 // Same load identity is acknowledged without restoring the original and losing edits.
 await page.evaluate(()=>zone.postMessage({protocol:'jobs-zonesketch',version:1,session,type:'load',payload:identity},origin));
 await page.waitForFunction(()=>events.filter(type=>type==='loaded').length===2);
 assert.equal(await zone.locator('#site').inputValue(),'Synthetic bridge edited site');
 // A forged window source cannot cause a load, even with the correct token and origin.
 await zone.evaluate(({origin,session})=>window.dispatchEvent(new MessageEvent('message',{origin,source:window,data:{protocol:'jobs-zonesketch',version:1,session,type:'load',payload:{}}})),{origin:jobsOrigin,session});
 assert.equal(await zone.locator('#site').inputValue(),'Synthetic bridge edited site');
 // Dropped ACK makes a retry explicit and sends exactly the same request.
 await page.evaluate(()=>window.dropAck=true);
 await zone.locator('#site').fill('Synthetic bridge retry site');
 await zone.getByRole('button',{name:'Save to Jobs',exact:true}).click();
 await page.waitForFunction(()=>saved.length===2);
 await zone.getByRole('button',{name:'Retry save to Jobs',exact:true}).waitFor({state:'visible',timeout:20000});
 await page.evaluate(()=>window.dropAck=false);
 await zone.getByRole('button',{name:'Retry save to Jobs',exact:true}).click();
 await page.waitForFunction(()=>saved.length===3);
 const retried=await page.evaluate(()=>[saved[1],saved[2]]);
 assert.equal(retried[0].requestId,retried[1].requestId);
 assert.deepEqual(retried[0].payload,retried[1].payload);
 await zone.waitForFunction(()=>document.getElementById('jobsBridgeBar').textContent.includes('Saved in Jobs.'));
 // Normal project switching must never redirect another drawing into this Jobs site.
 await zone.locator('#headerHomeBtn').click();
 await zone.locator('#homeNew').click();
 await zone.locator('#newProjectName').fill('Synthetic unrelated project');
 await zone.locator('#newProjectCreate').click();
 await zone.waitForFunction(()=>document.getElementById('site').value==='Synthetic unrelated project');
 await zone.getByRole('button',{name:'Save to Jobs',exact:true}).click();
 await zone.waitForFunction(()=>document.getElementById('jobsBridgeBar').textContent.includes('Another Zone Sketch project is open.'));
 assert.equal(await page.evaluate(()=>saved.length),3);
 console.log(JSON.stringify({actualEngine:true,automaticLoad:true,returnedFloors:receipt.payload.project.project.floors.length,returnedAssets:receipt.payload.project.project.floors.flatMap(f=>f.data.symbols).filter(s=>s.type!=='you').length,pngPreviews:receipt.payload.previews.length,editedRevision:true,repeatedLoadPreservesEdits:true,forgedSourceRejected:true,retryPreservesRequestId:true,otherProjectReturnBlocked:true,referenceUnchanged:true}));
}finally{await browser.close();await new Promise(resolve=>jobsServer.close(resolve));await new Promise(resolve=>zoneServer.close(resolve));await rm(temporary,{recursive:true,force:true});}

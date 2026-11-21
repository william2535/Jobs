import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {newSite,newJob} from '../src/model.js';
import {importZoneSketch,parseZoneSketch} from '../src/zone-import.js';
import {prepareZoneLaunch,applyZoneReturn} from '../src/zone-return.js';

const source=JSON.parse(await readFile(new URL('../public/demo.zonesketch.json',import.meta.url),'utf8'));
async function fixture(){
  const {site,drawing}=await importZoneSketch(source,{siteId:'synthetic-bridge-site'});
  const job=newJob(site,{engineer:'Synthetic engineer'});
  const earlier=newJob(site,{engineer:'Earlier synthetic engineer'});
  return {site,drawing,job,earlier,state:{sites:[site],jobs:[job,earlier]}};
}
function changedEnvelope(envelope){
  const changed=structuredClone(envelope);
  changed.project.floors[0].data.symbols.find(s=>s.id==='demo-panel').x=.42;
  changed.project.meta.revision='Bridge edit C03';
  return changed;
}

test('launch uses the actual editable envelope and unchanged return creates no revision',async()=>{
  const {site,job,state}=await fixture(),before=structuredClone(state);
  const {envelope,context}=await prepareZoneLaunch(site,job);
  assert.equal(envelope.format,'ZoneSketchByWill');
  assert.equal(envelope.version,1);
  assert.deepEqual(parseZoneSketch(envelope),envelope);
  assert.equal(context.siteId,site.id);
  assert.equal(context.jobId,job.id);
  assert.equal(context.drawingId,job.drawingId);
  assert.equal(context.jobRevision,job.revision);
  assert.equal(typeof context.sourceDigest,'string');
  assert.deepEqual(state,before,'launch must not mutate the original drawing or visit');
  const returned=await applyZoneReturn(state,context,envelope);
  assert.equal(returned.unchanged,true);
  assert.deepEqual(returned.state,state);
  assert.equal(returned.drawing.id,job.drawingId);
  assert.deepEqual(returned.context,context);
});

test('changed return maps permanent identities and merges results recorded after launch',async()=>{
  const {site,drawing,job,earlier,state}=await fixture();
  const {envelope,context}=await prepareZoneLaunch(site,job);
  const live=structuredClone(state);
  const latest=live.jobs.find(j=>j.id===job.id);
  latest.results[0].state='Unsatisfactory';
  latest.results[0].observations='Engineer evidence recorded after opening Zone Sketch.';
  latest.results[0].photos=structuredClone(drawing.assets[0].photos);
  latest.revision+=1;
  const before=structuredClone(live),changed=changedEnvelope(envelope);
  const returned=await applyZoneReturn(live,context,changed);
  assert.equal(returned.unchanged,false);
  assert.notEqual(returned.drawing.id,drawing.id);
  assert.equal(returned.site.id,site.id);
  assert.equal(returned.site.drawings.length,2);
  assert.equal(returned.drawing.assets.find(a=>a.sourceId==='demo-panel').id,drawing.assets.find(a=>a.sourceId==='demo-panel').id);
  assert.equal(returned.drawing.assets.find(a=>a.sourceId==='demo-panel').x,.42);
  assert.deepEqual(returned.job.results,latest.results);
  assert.equal(returned.job.revision,latest.revision+1);
  assert.deepEqual(returned.state.jobs.find(j=>j.id===earlier.id),earlier,'other visits retain their original drawing and results');
  assert.deepEqual(returned.site.drawings[0],drawing,'original source history remains intact');
  assert.deepEqual(returned.drawing.issuedSnapshots,drawing.issuedSnapshots,'working edits do not change issued snapshots');
  assert.equal(returned.context.drawingId,returned.drawing.id);
  assert.deepEqual(live,before,'return preparation is detached until the caller saves');
  const repeated=await applyZoneReturn(returned.state,returned.context,changed);
  assert.equal(repeated.unchanged,true);
  assert.deepEqual(repeated.state,returned.state);
});

test('stale selected drawing rejects rather than overwriting newer drawing work',async()=>{
  const {site,job,state}=await fixture();
  const {envelope,context}=await prepareZoneLaunch(site,job);
  const live=structuredClone(state);
  const newer={...structuredClone(live.sites[0].drawings[0]),id:'newer-live-drawing',revision:'Newer local revision'};
  live.sites[0].drawings.push(newer);
  live.jobs[0].drawingId=newer.id;
  const before=structuredClone(live);
  await assert.rejects(()=>applyZoneReturn(live,context,changedEnvelope(envelope)),/drawing|changed|newer|reopen/i);
  assert.deepEqual(live,before);
});

test('manual unplaced equipment remains in Jobs while placed supported equipment keeps permanent identity',async()=>{
  const site=newSite('Synthetic manual bridge site');
  const drawing=site.drawings[0],floorId=drawing.floors[0].id;
  drawing.assets=[
    {id:'manual-permanent',floorId,floorName:'Ground floor',reference:'SD-MANUAL',type:'smoke',x:.2,y:.3,photos:[]},
    {id:'manual-battery',floorId,floorName:'Ground floor',reference:'BAT-01',type:'Backup battery',photos:[],notes:'No drawn position supplied'},
    {id:'manual-unplaced-smoke',floorId,floorName:'Ground floor',reference:'SD-UNPLACED',type:'smoke',photos:[]},
  ];
  const job=newJob(site),state={sites:[site],jobs:[job]};
  job.results[1].notes='Retain this asset evidence even without a drawing symbol.';
  const before=structuredClone(state);
  await assert.rejects(()=>prepareZoneLaunch(site,job),/system/i);
  const launched=await prepareZoneLaunch(site,job,{systemType:'fire'});
  assert.equal(launched.envelope.project.systemType,'fire');
  const symbols=launched.envelope.project.floors[0].data.symbols;
  assert.equal(symbols.length,1);
  assert.equal(symbols[0].reference,'SD-MANUAL');
  assert.equal(symbols[0].x,.2);
  assert.equal(symbols[0].y,.3);
  assert.equal(launched.context.unplacedAssets.length,2);
  assert.deepEqual(state,before);
  const changed=structuredClone(launched.envelope);
  changed.project.floors[0].data.symbols[0].x=.6;
  const returned=await applyZoneReturn(state,launched.context,changed);
  assert.equal(returned.drawing.assets.find(a=>a.sourceId===symbols[0].id).id,'manual-permanent');
  assert.deepEqual(returned.drawing.assets.find(a=>a.id==='manual-battery'),drawing.assets[1]);
  assert.deepEqual(returned.drawing.assets.find(a=>a.id==='manual-unplaced-smoke'),drawing.assets[2]);
  assert.deepEqual(returned.job.results,job.results);
  assert.equal(returned.job.archivedResults.length,0);
});

test('site-only return updates the master drawing without rebasing any earlier visit',async()=>{
  const {site,job,earlier,state}=await fixture();
  const launched=await prepareZoneLaunch(site);
  assert.equal(launched.context.jobId,null);
  const returned=await applyZoneReturn(state,launched.context,changedEnvelope(launched.envelope));
  assert.equal(returned.job,null);
  assert.equal(returned.site.drawings.length,2);
  assert.deepEqual(returned.state.jobs,[job,earlier]);
  assert.equal(returned.context.drawingId,returned.site.drawings.at(-1).id);
  const stale=structuredClone(state);
  stale.sites[0].drawings.push({...structuredClone(site.drawings[0]),id:'another-latest-drawing'});
  await assert.rejects(()=>applyZoneReturn(stale,launched.context,launched.envelope),/drawing|changed|newer|reopen/i);
});

test('removed drawn equipment archives its visit result instead of discarding evidence',async()=>{
  const {site,job,state}=await fixture();
  const removed=site.drawings[0].assets.find(a=>a.sourceId==='demo-smoke');
  job.results.find(r=>r.assetId===removed.id).notes='Evidence for removed drawing device.';
  const launch=await prepareZoneLaunch(site,job),changed=structuredClone(launch.envelope);
  changed.project.floors[0].data.symbols=changed.project.floors[0].data.symbols.filter(s=>s.id!=='demo-smoke');
  const returned=await applyZoneReturn(state,launch.context,changed);
  assert.ok(!returned.drawing.assets.some(a=>a.id===removed.id));
  assert.equal(returned.job.archivedResults.length,1);
  assert.equal(returned.job.archivedResults[0].assetId,removed.id);
  assert.equal(returned.job.archivedResults[0].result.notes,'Evidence for removed drawing device.');
  assert.deepEqual(returned.job.drawingChanges[0].previousResults,job.results);
});

test('invalid returns and mismatched pinned identities reject without modifying local records',async()=>{
  const {site,job,state}=await fixture(),launched=await prepareZoneLaunch(site,job),before=structuredClone(state);
  await assert.rejects(()=>applyZoneReturn(state,launched.context,{format:'Unexpected',version:1,project:{}}),/invalid|unsupported/i);
  await assert.rejects(()=>applyZoneReturn(state,{...launched.context,siteId:'different-site'},launched.envelope),/site|context/i);
  await assert.rejects(()=>applyZoneReturn(state,{...launched.context,jobId:'missing-job'},launched.envelope),/job|context/i);
  const other=newSite('Other synthetic site'),otherJob=newJob(other);
  const mixed={sites:[site,other],jobs:[job,otherJob]};
  await assert.rejects(()=>applyZoneReturn(mixed,{...launched.context,jobId:otherJob.id},launched.envelope),/site|job|context/i);
  assert.deepEqual(state,before);
});

test('cached PNG preview changes do not alter the editable source or source digest',async()=>{
  const {site,job}=await fixture();
  const first=await prepareZoneLaunch(site,job),withPreview=structuredClone(site);
  withPreview.drawings[0].preview={image:'data:image/png;base64,eA==',updatedAt:'2026-11-13T10:00:00Z'};
  const second=await prepareZoneLaunch(withPreview,job);
  assert.deepEqual(second.envelope,first.envelope);
  assert.equal(second.context.sourceDigest,first.context.sourceDigest);
});

test('retry of an acknowledged save using its original context is idempotent',async()=>{
  const {site,job,state}=await fixture(),launch=await prepareZoneLaunch(site,job);
  const changed=changedEnvelope(launch.envelope);
  const saved=await applyZoneReturn(state,launch.context,changed);
  const retry=await applyZoneReturn(saved.state,launch.context,changed);
  assert.equal(retry.unchanged,true);
  assert.deepEqual(retry.state,saved.state);
  assert.equal(retry.context.drawingId,saved.drawing.id);
  assert.equal(retry.site.drawings.length,2);
});

test('unplaced equipment survives deletion of its floor without a broken floor reference',async()=>{
  const site=newSite('Synthetic unplaced floor retention'),drawing=site.drawings[0];
  const oldFloor=drawing.floors[0].id;
  drawing.floors.push({id:'retained-floor',name:'Other floor',data:{symbols:[],zones:[]}});
  drawing.assets=[{id:'unplaced-battery',type:'Backup battery',reference:'BAT-UNPLACED',floorId:oldFloor,floorName:'Ground floor',photos:[]}];
  const job=newJob(site),state={sites:[site],jobs:[job]};
  job.results[0].notes='Keep this observation with the permanent asset.';
  const launch=await prepareZoneLaunch(site,job,{systemType:'fire'}),changed=structuredClone(launch.envelope);
  changed.project.floors=changed.project.floors.filter(f=>f.id!==oldFloor);
  changed.project.activeFloor='retained-floor';
  const returned=await applyZoneReturn(state,launch.context,changed),asset=returned.drawing.assets[0];
  assert.equal(asset.id,'unplaced-battery');
  assert.equal(asset.floorId,null);
  assert.equal(asset.sourceFloorId,oldFloor);
  assert.equal(asset.unplacedFloorId,oldFloor);
  assert.equal(asset.x,undefined);
  assert.equal(asset.y,undefined);
  assert.deepEqual(returned.job.results,job.results);
});

test('issued snapshot edits reject while omitted issued history remains retained',async()=>{
  const {site,job,state}=await fixture(),launch=await prepareZoneLaunch(site,job),before=structuredClone(state);
  const tampered=changedEnvelope(launch.envelope);
  tampered.project.issuedAsFits[0].project.site='Altered issued evidence';
  await assert.rejects(()=>applyZoneReturn(state,launch.context,tampered),/issued|read-only/i);
  assert.deepEqual(state,before);
  const omitted=changedEnvelope(launch.envelope);
  delete omitted.project.issuedAsFits;
  const returned=await applyZoneReturn(state,launch.context,omitted);
  assert.deepEqual(returned.drawing.issuedSnapshots,site.drawings[0].issuedSnapshots);
  assert.deepEqual(returned.site.drawings[0],site.drawings[0]);
});

test('a changed master drawing also protects a still-pinned older job from stale return',async()=>{
  const {site,job,state}=await fixture(),launch=await prepareZoneLaunch(site,job),live=structuredClone(state);
  live.sites[0].drawings.push({...structuredClone(site.drawings[0]),id:'new-master-drawing',revision:'New master'});
  assert.equal(live.jobs[0].drawingId,launch.context.drawingId);
  const before=structuredClone(live);
  await assert.rejects(()=>applyZoneReturn(live,launch.context,changedEnvelope(launch.envelope)),/drawing|changed|newer|reopen/i);
  assert.deepEqual(live,before);
});

test('unchanged returned site name cannot roll back a concurrent master-site rename',async()=>{
  const {site,job,state}=await fixture(),launch=await prepareZoneLaunch(site,job),live=structuredClone(state);
  live.sites[0].name='New name entered in Jobs while Zone Sketch was open';
  const returned=await applyZoneReturn(live,launch.context,changedEnvelope(launch.envelope));
  assert.equal(returned.site.name,live.sites[0].name);
  assert.equal(returned.drawing.assets.find(a=>a.sourceId==='demo-panel').x,.42);
  const conflicting=changedEnvelope(launch.envelope);
  conflicting.project.site='Different name entered inside Zone Sketch';
  await assert.rejects(()=>applyZoneReturn(live,launch.context,conflicting),/site|name|changed|reopen/i);
  assert.equal(live.sites[0].name,'New name entered in Jobs while Zone Sketch was open');
});

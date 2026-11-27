import test from 'node:test';
import assert from 'node:assert/strict';
import { newSite, newJob, createQuickJob } from '../src/model.js';
import { addJobAsset, addJobAssets, duplicateJobAsset, duplicateJobAssets, previewAssetReferences, nextAssetReference, saveAssetTemplate, validateAssetTemplates, attachAssetJobToSite } from '../src/asset-library.js';
import { createJobPackage, validateJobPackage, importJobPackage } from '../src/packages.js';
import { createWorkspaceBackup, restoreWorkspaceBackup } from '../src/workspace-backup.js';
import { acceptZoneSketchPreviews, hasPlanPreviews, ensurePlanPreviews } from '../src/plan-preview.js';

const values = { reference: 'PIR 01', type: 'pir', typeName: 'PIR detector', manufacturer: 'Synthetic maker', model: 'Sample', description: 'Indoor detector' };
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=';
const blank = () => ({ sites: [], jobs: [], assetTemplates: [] });
const standalone = () => { const state = blank(), job = createQuickJob(); state.jobs.push(job); return addJobAsset(state, job.id, values); };

test('manual standalone assets and duplicates are unplaced, independently identified and never inherit visit evidence', () => {
  const { state, job, asset } = standalone();
  const before = structuredClone(state);
  asset.sourceId = 'source-identity'; asset.serial = 'serial-identity'; asset.x = .4; asset.photos.push({ id: 'photo', image });
  job.results[0].state = 'Satisfactory'; job.results[0].notes = 'Original visit only'; job.results[0].photos.push({ id: 'visit-photo', image });
  const duplicate = duplicateJobAsset(state, job.id, asset.id, { reference: 'PIR 02' });
  assert.notEqual(duplicate.asset.id, asset.id);
  assert.equal(duplicate.asset.sourceId, undefined); assert.equal(duplicate.asset.serial, undefined);
  assert.equal(duplicate.asset.x, null); assert.equal(duplicate.asset.y, null); assert.equal(duplicate.asset.floorId, null);
  assert.deepEqual(duplicate.asset.photos, []);
  assert.equal(duplicate.job.results[1].state, 'Not tested'); assert.deepEqual(duplicate.job.results[1].photos, []);
  assert.notEqual(duplicate.job.results[0].id, duplicate.job.results[1].id);
  assert.equal(duplicate.job.results[0].notes, 'Original visit only');
  assert.equal(state.jobs[0].assetRegister.assets.length, 1);
  assert.equal(before.jobs[0].siteId, null); assert.equal(duplicate.job.drawingId, null);
  assert.throws(() => addJobAsset(state, job.id, { ...values, floorId: 'unknown-floor' }), /Choose a floor/);
  assert.equal(addJobAsset(state, job.id, { ...values, reference: '' }).asset.reference, 'PIR detector 001');
  assert.throws(() => addJobAsset(state, job.id, { ...values, reference: '  pir 01  ' }), /already used/);
  const automatic = duplicateJobAsset(state, job.id, asset.id);
  assert.equal(automatic.asset.reference, 'PIR 02');
  const another = duplicateJobAsset(automatic.state, job.id, asset.id);
  assert.equal(another.asset.reference, 'PIR 03');
});

test('numbering preserves tag prefixes and zero padding, skips case-insensitive collisions, and handles large suffixes exactly', () => {
  const assets = ['MCP-L2/009', 'mcp-l2/010', ' MCP-L2/012 '].map(reference => ({ reference }));
  assert.deepEqual(previewAssetReferences(assets, 'MCP-L2/009', 4), ['MCP-L2/011', 'MCP-L2/013', 'MCP-L2/014', 'MCP-L2/015']);
  assert.equal(nextAssetReference(assets, 'MCP-L2/009'), 'MCP-L2/011');
  assert.deepEqual(previewAssetReferences([], 'SM-099', 3), ['SM-099', 'SM-100', 'SM-101']);
  assert.deepEqual(previewAssetReferences([], 'SD-9007199254740992', 2), ['SD-9007199254740992', 'SD-9007199254740993']);
  assert.equal(nextAssetReference([{ reference: 'Camera 001' }], 'Camera'), 'Camera 002');
  assert.deepEqual(previewAssetReferences([], 'Camera', 3), ['Camera', 'Camera 001', 'Camera 002']);
  assert.equal(previewAssetReferences([], 'x'.repeat(200))[0], 'x'.repeat(200));
  assert.throws(() => previewAssetReferences([], 'x'.repeat(200), 2), /too long to number/);
});

test('standalone batch creation and duplication need no typed tags and retain specification and location without copying evidence', async () => {
  const job = createQuickJob(), initial = { ...blank(), jobs: [job] };
  const created = addJobAssets(initial, job.id, { ...values, reference: '' }, 3);
  assert.equal(initial.jobs[0].assetRegister, undefined);
  assert.equal(created.job.revision, job.revision + 1);
  assert.deepEqual(created.assets.map(asset => asset.reference), ['PIR detector 001', 'PIR detector 002', 'PIR detector 003']);
  const original = created.assets[0];
  original.location = 'Rear entrance'; original.serial = 'Old serial'; original.sourceId = 'Imported source';
  original.photos.push({ id: 'source-photo', image });
  created.job.results[0].state = 'Unsatisfactory';
  created.job.results[0].notes = 'Retain this observation';
  created.job.results[0].defects = 'Existing defect';
  created.job.results[0].photos.push({ id: 'result-photo', image });
  const before = structuredClone(created.state);
  const duplicated = duplicateJobAssets(created.state, job.id, original.id, {}, 20);
  assert.deepEqual(created.state, before);
  assert.equal(duplicated.job.revision, created.job.revision + 1);
  assert.equal(duplicated.job.assetRegister.revision, 'Register 23');
  assert.equal(duplicated.assets[0].reference, 'PIR detector 004');
  assert.equal(duplicated.assets.at(-1).reference, 'PIR detector 023');
  assert.equal(duplicated.assets.length, 20);
  assert.equal(new Set(duplicated.job.assetRegister.assets.map(asset => asset.id)).size, 23);
  assert.equal(new Set(duplicated.job.results.map(result => result.id)).size, 23);
  for (const asset of duplicated.assets) {
    assert.equal(asset.location, 'Rear entrance'); assert.equal(asset.manufacturer, values.manufacturer);
    assert.equal(asset.model, values.model); assert.equal(asset.description, values.description);
    assert.equal(asset.serial, undefined); assert.equal(asset.sourceId, undefined);
    assert.equal(asset.x, null); assert.equal(asset.y, null); assert.deepEqual(asset.photos, []);
    const result = duplicated.job.results.find(item => item.assetId === asset.id);
    assert.equal(result.state, 'Not tested'); assert.equal(result.notes, ''); assert.equal(result.defects, '');
    assert.deepEqual(result.photos, []); assert.deepEqual(result.readings, []);
  }
  assert.deepEqual(duplicated.job.results[0], created.job.results[0]);
  // Source-only details above deliberately exceed a manual register's contract.
  delete duplicated.job.assetRegister.assets[0].sourceId;
  const wire = await createJobPackage(null, duplicated.job), reopened = validateJobPackage(wire);
  assert.deepEqual(reopened.job.assetRegister, duplicated.job.assetRegister);
  assert.deepEqual(reopened.job.results, duplicated.job.results);
  const imported = await importJobPackage(blank(), wire);
  assert.equal(imported.state.jobs[0].assetRegister.assets.length, 23);
});

test('linked batches make one revision, preserve other visits and source plans, and duplicate floor and location by default', async () => {
  const site = newSite('Batch site'), base = site.drawings[0];
  base.source = { preserved: 'Original source' };
  base.issuedSnapshots.push({ id: 'issued', revision: 'Issued 1', floors: [], assets: [] });
  const job = newJob(site), other = newJob(site), initial = { sites: [site], jobs: [job, other] };
  const before = structuredClone(initial);
  const created = addJobAssets(initial, job.id, { ...values, reference: 'SM-001', floorId: base.floors[0].id, location: 'Production' }, 100);
  assert.deepEqual(initial, before);
  assert.equal(created.state.sites[0].drawings.length, 2);
  assert.equal(created.job.revision, job.revision + 1);
  assert.equal(created.job.drawingChanges.length, 1);
  assert.equal(created.job.drawingChanges[0].addedAssetIds.length, 100);
  assert.equal(created.assets[0].reference, 'SM-001'); assert.equal(created.assets.at(-1).reference, 'SM-100');
  assert.deepEqual(created.state.jobs[1], other);
  assert.deepEqual(created.state.sites[0].drawings[0], base);
  assert.deepEqual(created.state.sites[0].drawings[1].source, base.source);
  assert.deepEqual(created.state.sites[0].drawings[1].issuedSnapshots, base.issuedSnapshots);
  created.job.results[0].state = 'Satisfactory'; created.job.results[0].notes = 'Original tested';
  const duplicated = duplicateJobAssets(created.state, job.id, created.asset.id, {}, 2);
  assert.equal(duplicated.state.sites[0].drawings.length, 3);
  assert.equal(duplicated.job.drawingChanges.length, 2);
  assert.equal(duplicated.job.revision, created.job.revision + 1);
  assert.deepEqual(duplicated.assets.map(asset => asset.reference), ['SM-101', 'SM-102']);
  for (const asset of duplicated.assets) {
    assert.equal(asset.floorId, base.floors[0].id); assert.equal(asset.floorName, 'Ground floor');
    assert.equal(asset.location, 'Production'); assert.equal(asset.x, null); assert.equal(asset.y, null);
    assert.equal(duplicated.job.results.find(result => result.assetId === asset.id).state, 'Not tested');
  }
  assert.deepEqual(duplicated.job.results[0], created.job.results[0]);
  const revisedLocation = duplicateJobAsset(created.state, job.id, created.asset.id, { reference: 'CCTV-009', floorId: null, location: 'Office' });
  assert.equal(revisedLocation.asset.reference, 'CCTV-009');
  assert.equal(revisedLocation.asset.floorId, null); assert.equal(revisedLocation.asset.location, 'Office');
  const reopened = validateJobPackage(await createJobPackage(duplicated.state.sites[0], duplicated.job));
  assert.deepEqual(reopened.site.drawings.at(-1).assets, duplicated.state.sites[0].drawings.at(-1).assets);
  assert.equal(reopened.job.drawingChanges.length, 2);
});

test('invalid counts, specifications, floors, numbering overflow and capacity reject a whole batch without changing state', () => {
  const { state, job, asset } = standalone(), before = structuredClone(state);
  for (const count of [0, -1, 1.5, 101, '2', null, NaN, Infinity]) {
    assert.throws(() => addJobAssets(state, job.id, values, count), /whole number/);
    assert.throws(() => duplicateJobAssets(state, job.id, asset.id, {}, count), /whole number/);
    assert.throws(() => previewAssetReferences([], 'SM-001', count), /whole number/);
  }
  assert.throws(() => addJobAssets(state, job.id, { ...values, type: '' }, 20), /nonempty/);
  assert.throws(() => addJobAssets(state, job.id, { ...values, floorId: 'missing' }, 20), /Choose a floor/);
  assert.throws(() => duplicateJobAssets(state, job.id, asset.id, { description: 'x'.repeat(5001) }, 20), /5000/);
  assert.throws(() => addJobAssets(state, job.id, { ...values, reference: 'x'.repeat(200) }, 2), /too long to number/);
  assert.deepEqual(state, before);
  const nearCapacity = structuredClone(state);
  nearCapacity.jobs[0].assetRegister.assets = Array.from({ length: 49999 }, (_, index) => ({ id: `asset-${index}`, reference: `SM-${index}` }));
  const originalRegister = nearCapacity.jobs[0].assetRegister;
  assert.throws(() => addJobAssets(nearCapacity, job.id, values, 2), /50,000/);
  assert.equal(nearCapacity.jobs[0].assetRegister, originalRegister);
  assert.equal(originalRegister.assets.length, 49999);
  assert.equal(nearCapacity.jobs[0].revision, job.revision);
});

test('adding linked equipment creates one drawing revision without changing other visits, original source or issued records', () => {
  const site = newSite('Synthetic site'), base = site.drawings[0];
  base.source = { preserved: 'Original import' };
  base.issuedSnapshots = [{ id: 'issued-1', revision: 'Issued 1', floors: [], assets: [] }];
  base.assets.push({ id: 'existing-asset', type: 'smoke', reference: 'SD1', photos: [] });
  const job = newJob(site), other = newJob(site), state = { sites: [site], jobs: [job, other] }, before = structuredClone(state);
  job.results[0].notes = 'Existing observation'; before.jobs[0].results[0].notes = 'Existing observation';
  const added = addJobAsset(state, job.id, { ...values, floorId: base.floors[0].id });
  assert.deepEqual(state, before); assert.deepEqual(added.state.jobs[1], other);
  assert.deepEqual(added.state.sites[0].drawings[0], base);
  assert.notEqual(added.job.drawingId, base.id);
  const updated = added.state.sites[0].drawings.at(-1);
  assert.deepEqual(updated.source, base.source); assert.deepEqual(updated.issuedSnapshots, base.issuedSnapshots);
  assert.equal(added.asset.floorName, 'Ground floor'); assert.equal(added.asset.x, null);
  assert.equal(added.job.results[0].id, job.results[0].id); assert.equal(added.job.results[0].notes, 'Existing observation');
  assert.equal(added.job.results[1].state, 'Not tested'); assert.equal(added.job.drawingChanges.length, 1);
});

test('asset favourites retain only reusable specifications and reject injected evidence, duplicate IDs and duplicate specifications', () => {
  const templates = saveAssetTemplate([], { ...values, id: 'source-id', serial: 'serial', location: 'Customer location', source: { private: true }, photos: [{ id: 'photo', image }] });
  assert.deepEqual(Object.keys(templates[0]).sort(), ['id', 'name', 'type', 'typeName', 'manufacturer', 'model', 'description'].sort());
  assert.equal(templates[0].name, values.typeName); assert.notEqual(templates[0].id, 'source-id');
  assert.deepEqual(saveAssetTemplate(templates, { ...values, reference: 'Different reference' }), templates);
  assert.throws(() => validateAssetTemplates([{ ...templates[0], photos: [] }]), /invalid structure/);
  assert.throws(() => validateAssetTemplates([templates[0], { ...templates[0], id: 'another-id' }]), /unique/);
  assert.throws(() => validateAssetTemplates([{ ...templates[0], type: '' }]), /nonempty/);
});

test('standalone register packages preserve results and attachments, deduplicate and keep conflicts without inventing a site', async () => {
  const { job } = standalone();
  job.results[0].notes = 'Work recorded'; job.results[0].photos.push({ id: 'visit-photo', image });
  const wire = await createJobPackage(null, job), expanded = validateJobPackage(wire);
  assert.equal(expanded.site, null); assert.equal(expanded.job.results[0].photos[0].image, image);
  assert.deepEqual(expanded.job.assetRegister, job.assetRegister);
  const first = await importJobPackage(blank(), wire), again = await importJobPackage(first.state, wire);
  assert.equal(first.state.sites.length, 0); assert.equal(again.duplicate, true); assert.equal(again.state.jobs.length, 1);
  const changed = structuredClone(first.state); changed.jobs[0].results[0].notes = 'Later local work';
  const newer = structuredClone(job); newer.results[0].notes = 'Conflicting received work'; newer.revision++;
  const conflict = await importJobPackage(changed, await createJobPackage(null, newer));
  assert.equal(conflict.conflict, true); assert.equal(conflict.state.jobs.length, 2);
  assert.equal(conflict.state.jobs[0].results[0].notes, 'Later local work');
  const broken = structuredClone(expanded); broken.job.assetRegister.assets[0].x = .2;
  assert.throws(() => validateJobPackage(broken), /unplaced/);
  broken.job.assetRegister.assets[0].x = null; broken.job.results[0].assetId = 'missing';
  assert.throws(() => validateJobPackage(broken), /missing asset/);
  broken.job.results[0].assetId = job.results[0].assetId;
  broken.job.assetRegister.assets[0].description = 'x'.repeat(5001);
  assert.throws(() => validateJobPackage(broken), /exceeds 5000/);
  broken.job.assetRegister.assets[0].description = ''; broken.job.assetRegister.assets[0].reference = { unsupported: true };
  assert.throws(() => validateJobPackage(broken), /asset.reference/);
});

test('later site attachment retains manual asset/result IDs and evidence while starting site equipment as Not tested', async () => {
  const { state, job, asset } = standalone(), site = newSite('Synthetic destination');
  site.drawings[0].assets.push({ id: 'site-asset', type: 'panel', photos: [] });
  const existingVisit = newJob(site); state.sites.push(site); state.jobs.push(existingVisit);
  job.results[0].state = 'Satisfactory'; job.results[0].notes = 'Manual equipment tested'; job.results[0].photos.push({ id: 'photo', image });
  const original = structuredClone(state), attached = attachAssetJobToSite(state, job.id, site.id);
  assert.deepEqual(state, original); assert.deepEqual(attached.state.jobs[1], existingVisit);
  assert.equal(attached.job.assetRegister, undefined); assert.equal(attached.job.siteId, site.id);
  assert.deepEqual(attached.job.results.find(result => result.assetId === asset.id), job.results[0]);
  assert.equal(attached.job.results.find(result => result.assetId === 'site-asset').state, 'Not tested');
  const imported = validateJobPackage(await createJobPackage(attached.state.sites[0], attached.job));
  assert.equal(imported.job.results.find(result => result.assetId === asset.id).photos[0].image, image);
  assert.equal(imported.site.drawings.length, 3); assert.equal(imported.job.drawingChanges[0].fromDrawingId, job.assetRegister.id);
});

test('workspace backup includes reusable asset favourites and standalone register work', async () => {
  const { state, job } = standalone(); state.assetTemplates = saveAssetTemplate([], values);
  job.results[0].photos.push({ id: 'photo', image });
  const backup = await createWorkspaceBackup(state), restored = await restoreWorkspaceBackup(blank(), backup);
  assert.deepEqual(restored.state.assetTemplates, state.assetTemplates);
  assert.deepEqual(restored.state.jobs[0].assetRegister, job.assetRegister);
  assert.equal(restored.state.jobs[0].results[0].photos[0].image, image);
  assert.equal(restored.summary.assetTemplates, 1); assert.equal(restored.summary.assets, 1);
  assert.equal((await restoreWorkspaceBackup(restored.state, backup)).duplicate, true);
  await assert.rejects(restoreWorkspaceBackup({ ...blank(), assetTemplates: state.assetTemplates }, backup), /empty job workspace/);
});

test('unplaced additions and later site attachment retain genuine Zone Sketch PNG bytes and issued preview provenance', async () => {
  const site = newSite('Synthetic preview site'), base = site.drawings[0], floor = base.floors[0];
  floor.data.walls = [{ id: 'wall', points: [{ x: .1, y: .1 }, { x: .9, y: .1 }] }];
  site.drawings[0] = acceptZoneSketchPreviews(base, [{ renderer: 'ZoneSketch', mode: 'survey', floorId: floor.id, revision: base.revision, image, width: 1, height: 1, generatedAt: '2026-11-01T00:00:00Z' }]);
  const cached = site.drawings[0];
  cached.issuedSnapshots.push({ id: 'issued', revision: 'Issued original', floors: structuredClone(cached.floors), assets: [] });
  cached.planPreviews.push({ ...cached.planPreviews[0], id: 'issued-preview', snapshotId: 'issued', revision: 'Issued original' });
  const job = newJob(site), initial = { sites: [site], jobs: [job] }, added = addJobAsset(initial, job.id, values);
  const revised = added.state.sites[0].drawings.at(-1);
  assert(hasPlanPreviews(revised));
  assert.equal(await ensurePlanPreviews(revised), revised, 'complete exact cache does not require a browser rasterizer');
  const preview = revised.planPreviews[0], issued = revised.planPreviews[1];
  assert.equal(preview.image, image); assert.equal(preview.renderer, 'ZoneSketch'); assert.equal(preview.overlayMode, 'none');
  assert.equal(preview.drawingId, revised.id); assert.equal(preview.sourcePreviewDrawingId, cached.id);
  assert.equal(preview.sourcePreviewRevision, cached.revision); assert.equal(preview.generatedAt, '2026-11-01T00:00:00Z');
  assert.equal(issued.revision, 'Issued original'); assert.equal(issued.image, image);
  assert.deepEqual(revised.issuedSnapshots, cached.issuedSnapshots);
  const loose = standalone(); loose.state.sites.push(site);
  const attached = attachAssetJobToSite(loose.state, loose.job.id, site.id), attachedDrawing = attached.state.sites[0].drawings.at(-1);
  assert(hasPlanPreviews(attachedDrawing)); assert.equal(await ensurePlanPreviews(attachedDrawing), attachedDrawing);
  const reopened = validateJobPackage(await createJobPackage(attached.state.sites[0], attached.job));
  assert.equal(reopened.site.drawings.at(-1).planPreviews[0].image, image);
  assert.equal(reopened.site.drawings.at(-1).planPreviews[0].sourcePreviewDrawingId, cached.id);
});

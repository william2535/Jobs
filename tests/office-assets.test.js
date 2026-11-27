import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newSite, createQuickJob } from '../src/model.js';
import { addJobAsset, duplicateJobAsset, attachAssetJobToSite } from '../src/asset-library.js';
import { importZoneSketch } from '../src/zone-import.js';
import { createJobPackage, importJobPackage } from '../src/packages.js';
import { buildOfficeAssets, hasRetainedZoneSketchProject } from '../src/office-assets.js';

const source = JSON.parse(await readFile(new URL('../public/demo.zonesketch.json', import.meta.url), 'utf8'));
const blank = () => ({ sites: [], jobs: [] });
const spec = reference => ({ type: 'smoke', typeName: 'Smoke detector', manufacturer: '', model: '', description: '', reference, location: 'Hallway' });

test('manual sites and PNG-only plans remain waiting while an actual retained Zone Sketch source qualifies', async () => {
  const manual = newSite('Manual site'), imageOnly = newSite('Image site');
  imageOnly.drawings[0].planPreviews = [{ image: 'data:image/png;base64,placeholder', drawingId: imageOnly.drawings[0].id }];
  const imported = await importZoneSketch(source, { siteId: 'zone-site' });
  const model = buildOfficeAssets({ sites: [manual, imageOnly, imported.site], jobs: [] });
  assert.deepEqual(model.totals, { sites: 3, waitingSites: 2, readySites: 1, assets: 4, manualAssets: 0, importedAssets: 4, otherAssets: 0 });
  assert.deepEqual(model.waitingSites.map(site => site.name).sort(), ['Image site', 'Manual site']);
  assert.equal(model.sites.find(site => site.id === imported.site.id).sourceDrawingIds.length, 1);
});

test('source availability rejects absent, malformed and unsupported envelopes but includes retained issued sources', async () => {
  assert.equal(hasRetainedZoneSketchProject({ source: null }), false);
  assert.equal(hasRetainedZoneSketchProject({ source: { format: 'ZoneSketchByWill', version: 1, project: { site: 'Fake', floors: [] } } }), false);
  const malformed = structuredClone(source); delete malformed.project.floors[0].data.symbols;
  assert.equal(hasRetainedZoneSketchProject({ source: malformed }), false);
  assert.equal(hasRetainedZoneSketchProject({ source: { ...source, format: 'UnrelatedPlan' } }), false);
  assert.equal(hasRetainedZoneSketchProject({ source: { ...source, version: 9 } }), false);
  assert.equal(hasRetainedZoneSketchProject({ kind: 'issued', source: { ...source, issuedAsFit: { id: 'issued-source' } } }), true);
  assert.equal(hasRetainedZoneSketchProject({ source: { ...source, format: 'ZoneSketch' } }), true);
});

test('drawing revisions, issued snapshots, repeated imports and notes-only job copies do not inflate assets', async () => {
  const imported = await importZoneSketch(source, { siteId: 'stable-site' });
  const visit = createQuickJob(imported.site, { title: 'Synthetic site visit' });
  let field = { sites: [imported.site], jobs: [visit] };
  const added = addJobAsset(field, visit.id, spec('Added-1')); field = added.state;
  assert.equal(field.sites[0].drawings.length, 2);
  let wire = await createJobPackage(field.sites[0], field.jobs[0]);
  let office = (await importJobPackage(blank(), wire)).state;
  office = (await importJobPackage(office, wire)).state;
  field.jobs[0].scope = 'Amended work notes'; field.jobs[0].revision++;
  wire = await createJobPackage(field.sites[0], field.jobs[0]);
  office = (await importJobPackage(office, wire)).state;
  const before = structuredClone(office), model = buildOfficeAssets(office);
  assert.deepEqual(office, before); assert.equal(office.jobs.length, 2);
  assert.equal(model.totals.sites, 1); assert.equal(model.totals.assets, 5); assert.equal(model.totals.manualAssets, 1); assert.equal(model.totals.importedAssets, 4);
  assert.equal(model.assets.find(asset => asset.id === added.asset.id).jobIds.length, 2);
  assert.equal(model.assets.find(asset => asset.id === added.asset.id).origin, 'manual');
  assert.ok(model.assets.every(asset => !Object.hasOwn(asset, 'addedAt') && !Object.hasOwn(asset, 'engineer')));
});

test('standalone asset registers and real asset duplication count permanent identities', () => {
  const visit = createQuickJob(null, { title: 'Standalone visit' });
  const first = addJobAsset({ ...blank(), jobs: [visit] }, visit.id, spec('Device-1'));
  const second = duplicateJobAsset(first.state, visit.id, first.asset.id);
  const preservedCopy = { ...structuredClone(second.job), id: 'preserved-job-copy', sourceJobId: visit.id };
  second.state.jobs.push(preservedCopy);
  const model = buildOfficeAssets(second.state);
  assert.equal(model.totals.sites, 0); assert.equal(model.totals.assets, 2); assert.equal(model.totals.manualAssets, 2);
  assert.equal(model.standaloneAssets.length, 2); assert.ok(model.assets.every(asset => asset.jobIds.length === 2));
});

test('attaching a standalone register preserves its original manual identity across retained job copies and site history', () => {
  const site = newSite('Attached site'), visit = createQuickJob(null, { title: 'Register visit' });
  const first = addJobAsset({ sites: [site], jobs: [visit] }, visit.id, spec('Device-1'));
  const original = { ...structuredClone(first.job), id: 'retained-standalone', sourceJobId: visit.id };
  const attached = attachAssetJobToSite(first.state, visit.id, site.id);
  attached.state.jobs.push(original);
  const model = buildOfficeAssets(attached.state);
  assert.equal(model.totals.assets, 1); assert.equal(model.totals.manualAssets, 1); assert.equal(model.totals.waitingSites, 1);
  assert.deepEqual(model.assets[0].siteIds, [site.id]); assert.equal(model.assets[0].jobIds.length, 2);
});

test('sites with the same name and unrelated legacy IDs remain separate', async () => {
  const a = newSite('Same site name'), b = newSite('Same site name');
  for (const site of [a, b]) site.drawings[0].assets.push({ id: 'legacy-device', type: 'smoke', reference: 'Detector-1' });
  let model = buildOfficeAssets({ sites: [a, b], jobs: [] });
  assert.equal(model.totals.sites, 2); assert.equal(model.totals.assets, 2); assert.equal(model.totals.otherAssets, 2);
  const one = await importZoneSketch(source, { siteId: 'first-distinct-site' }), two = await importZoneSketch(source, { siteId: 'second-distinct-site' });
  model = buildOfficeAssets({ sites: [one.site, two.site], jobs: [] });
  assert.equal(model.totals.sites, 2); assert.equal(model.totals.assets, 8);
});

test('archived and issued evidence retains unique assets without creating live site folders or source readiness', () => {
  const visit = createQuickJob(null, { title: 'Retained evidence' });
  const asset = { id: 'retained-manual-device', origin: 'manual', type: 'smoke', reference: 'Old detector' };
  visit.archivedResults = [{ asset, drawingId: 'old-drawing' }];
  visit.certificates = { issued: [{ evidence: { site: null, drawing: { id: 'old-drawing', assets: [structuredClone(asset)] }, job: { id: visit.id } } }] };
  const model = buildOfficeAssets({ ...blank(), jobs: [visit] });
  assert.equal(model.totals.assets, 1); assert.equal(model.totals.manualAssets, 1); assert.equal(model.totals.sites, 0);
  assert.equal(model.assets[0].historyOnly, true); assert.deepEqual(model.assets[0].jobIds, [visit.id]);
});

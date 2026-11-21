import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickJob, attachJobToSite, newSite } from '../src/model.js';
import { createJobPackage, importJobPackage, validateJobPackage } from '../src/packages.js';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=';
const notes = () => ({
  version: 1,
  blocks: [{ id: 'note-block', type: 'paragraph', align: 'left', runs: [{ text: 'Synthetic service note', bold: true, color: '#112233' }] }],
  photos: [{ id: 'note-photo', image, caption: 'Synthetic example only' }],
});
const empty = () => ({ sites: [], jobs: [] });

function siteWithDevice() {
  const site = newSite('Synthetic optional site');
  site.drawings[0].assets.push({ id: 'asset-1', type: 'smoke', floorId: site.drawings[0].floors[0].id, photos: [] });
  return site;
}

test('a blank quick-job draft has stable identity without creating a site or requiring classification', () => {
  const first = createQuickJob();
  const second = createQuickJob(null, { title: '  ', description: '' });
  assert.equal(first.siteId, null);
  assert.equal(first.drawingId, null);
  assert.equal(first.revision, 1);
  assert.equal(first.status, 'Open');
  assert.equal(first.discipline, '');
  assert.equal(first.workType, '');
  assert.deepEqual(first.results, []);
  assert.deepEqual(first.settings, { version: 1, overrides: {} });
  assert.notEqual(first.id, second.id);
  assert.equal(second.workflow.details.title, '');
});

test('quick jobs use site defaults while explicit choices become paired settings overrides', () => {
  const site = siteWithDevice();
  site.profile = { version: 1, engineer: 'Site engineer', discipline: 'Fire', workType: 'Maintenance' };
  const inherited = createQuickJob(site);
  assert.equal(inherited.engineer, 'Site engineer');
  assert.equal(inherited.discipline, 'Fire');
  assert.deepEqual(inherited.settings.overrides, {});
  const changed = createQuickJob(site, { engineer: '', workType: 'Custom', customWorkType: 'Document review' });
  assert.deepEqual(changed.settings.overrides, { engineer: '', workType: 'Custom', customWorkType: 'Document review' });
  assert.equal(changed.results[0].state, 'Not tested');
  assert.throws(() => createQuickJob(site, { discipline: 'Custom' }), /custom discipline/);
});

test('first site attachment preserves job and note IDs, starts fresh device results and protects existing site evidence', () => {
  const job = createQuickJob(null, { title: 'Unassigned notes' });
  job.notesDocument = notes();
  const before = structuredClone(job);
  const site = siteWithDevice();
  const attached = attachJobToSite(job, site);
  assert.deepEqual(job, before);
  assert.equal(attached.id, job.id);
  assert.equal(attached.revision, job.revision, 'saving owns the revision increment');
  assert.equal(attached.siteId, site.id);
  assert.equal(attached.drawingId, site.drawings[0].id);
  assert.deepEqual(attached.notesDocument, job.notesDocument);
  assert.equal(attached.results[0].state, 'Not tested');
  attached.results[0].state = 'Satisfactory';
  assert.deepEqual(attachJobToSite(attached, site), attached);
  assert.throws(() => attachJobToSite(attached, newSite('Another site')), /already has site/);
  assert.throws(() => attachJobToSite(job, newSite('')), /named site/);
});

test('standalone v3 package round trip keeps formatted notes and actual photos without an invented site', async () => {
  const job = createQuickJob(null, { title: 'Unassigned visit' });
  job.notesDocument = notes();
  const wire = await createJobPackage(null, job);
  assert.equal(wire.version, 3);
  assert.equal(wire.site, null);
  assert.equal(wire.attachments.length, 1);
  assert.equal(wire.attachments[0].image, image);
  assert.equal(wire.job.notesDocument.photos[0].image, null);
  const expanded = validateJobPackage(wire);
  assert.equal(expanded.version, 3);
  assert.equal(expanded.site, null);
  assert.equal(expanded.job.notesDocument.photos[0].image, image);
  const imported = await importJobPackage(empty(), JSON.stringify(wire));
  assert.equal(imported.state.sites.length, 0);
  assert.equal(imported.job.id, job.id);
  assert.equal(imported.job.siteId, null);
  assert.deepEqual(imported.job.notesDocument, expanded.job.notesDocument);
  assert.deepEqual(await createJobPackage(null, imported.job), wire);
  const fromExpanded = await importJobPackage(empty(), expanded);
  assert.deepEqual(fromExpanded.job.notesDocument, expanded.job.notesDocument);
});

test('standalone repeat imports deduplicate while conflicts preserve existing work and the incoming notes', async () => {
  const original = createQuickJob();
  original.notesDocument = notes();
  const wire = await createJobPackage(null, original);
  const alreadySaved = await importJobPackage({ sites: [], jobs: [original] }, wire);
  assert.equal(alreadySaved.duplicate, true);
  assert.equal(alreadySaved.state.jobs.length, 1);
  const local = structuredClone(original);
  local.notesDocument.blocks[0].runs[0].text = 'Later local engineer note';
  local.revision++;
  const state = { sites: [], jobs: [local] };
  const before = structuredClone(state);
  const preserved = await importJobPackage(state, wire);
  assert.deepEqual(state, before);
  assert.equal(preserved.conflict, true);
  assert.equal(preserved.state.sites.length, 0);
  assert.equal(preserved.state.jobs.length, 2);
  assert.equal(preserved.state.jobs[0].notesDocument.blocks[0].runs[0].text, 'Later local engineer note');
  assert.notEqual(preserved.job.id, original.id);
  assert.equal(preserved.job.sourceJobId, original.id);
  assert.equal(preserved.job.notesDocument.blocks[0].runs[0].text, 'Synthetic service note');
  const repeated = await importJobPackage(preserved.state, wire);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.job.id, preserved.job.id);
  assert.equal(repeated.state.jobs.length, 2);
});

test('invalid standalone references, notes, settings and older null-site envelopes reject before changing saved work', async () => {
  const job = createQuickJob();
  job.notesDocument = notes();
  const wire = await createJobPackage(null, job);
  const state = { sites: [], jobs: [job] };
  const before = structuredClone(state);
  for (const change of [
    (pack) => { pack.version = 2; },
    (pack) => { pack.version = 1; },
    (pack) => { delete pack.site; },
    (pack) => { pack.job.siteId = 'missing-site'; },
    (pack) => { pack.job.drawingId = 'missing-drawing'; },
    (pack) => { pack.job.results = [{ id: 'orphan', assetId: 'missing', state: 'Satisfactory', readings: [] }]; },
    (pack) => { pack.job.notesDocument.html = '<img src=x onerror=alert(1)>'; },
    (pack) => { pack.job.notesDocument.blocks[0].runs[0].color = 'url(https://example.invalid)'; },
    (pack) => { pack.job.settings.version = 999; },
  ]) {
    const invalid = structuredClone(wire);
    change(invalid);
    await assert.rejects(() => importJobPackage(state, invalid));
    assert.deepEqual(state, before);
  }
  const associated = createQuickJob(siteWithDevice());
  await assert.rejects(() => createJobPackage(null, associated), /null site and drawing/);
});

test('site-bound v1 and v2 packages remain compatible with v3 and stored import receipts', async () => {
  const site = siteWithDevice();
  const job = createQuickJob(site);
  job.notesDocument = notes();
  const current = await createJobPackage(site, job);
  const legacy2 = { ...structuredClone(current), version: 2 };
  const legacy1 = validateJobPackage(legacy2);
  assert.equal(legacy1.version, 1);
  for (const version of [legacy1, legacy2, current]) {
    const imported = await importJobPackage(empty(), version);
    assert.equal(imported.state.sites[0].id, site.id);
    assert.equal(imported.job.drawingId, job.drawingId);
    assert.equal(imported.job.notesDocument.photos[0].image, image);
    imported.job.notesDocument.blocks[0].runs[0].text = 'Later work after import receipt';
    const repeated = await importJobPackage(imported.state, current);
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.state.jobs.length, 1);
    assert.equal(repeated.job.notesDocument.blocks[0].runs[0].text, 'Later work after import receipt');
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { newDeviceRemark, saveDeviceRemark, validateDeviceRemarks } from '../src/device-remarks.js';
import { newSite, newJob } from '../src/model.js';
import { applyDrawingToJob } from '../src/revisions.js';
import { createJobPackage, importJobPackage, validateJobPackage } from '../src/packages.js';
import { panelContext } from '../src/panel-context.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=';
function remark() {
  return {
    ...newDeviceRemark('Battery backup'), description: 'Synthetic observed damage',
    location: 'Control panel', internalNote: 'PRIVATE REMARK OFFICE',
    lastVerified: '2026-11-14', recommendation: 'Review the recorded condition',
    beforePhotos: [{ id: 'before-photo', image: PNG, caption: 'Before' }],
    products: [{ id: 'product-1', description: 'Recorded part', quantity: 1.5, unit: 'each' }],
  };
}
function fixture() {
  const site = newSite('Synthetic remarks site');
  const floor = site.drawings[0].floors[0];
  site.drawings[0].assets = [
    { id: 'asset-1', type: 'panel', floorId: floor.id, photos: [] },
    { id: 'asset-2', type: 'sounder', floorId: floor.id, photos: [] },
  ];
  const job = newJob(site);
  job.results[0].remarks = saveDeviceRemark(undefined, remark());
  return { site, job };
}

test('templates start open and do not invent a test result, findings or verification', () => {
  assert.equal(validateDeviceRemarks(undefined), undefined);
  for (const title of ['Battery backup', 'Critical defect', 'Custom note', 'Customer advice given']) {
    const item = newDeviceRemark(title);
    assert.equal(item.title, title);
    assert.equal(item.status, 'Open');
    assert.equal(item.description, '');
    assert.equal(item.lastVerified, '');
    assert.equal(item.severity, title === 'Critical defect' ? title : 'Unclassified');
    assert.equal(item.state, undefined);
    assert.deepEqual(item.beforePhotos, []);
    assert.deepEqual(validateDeviceRemarks({ version: 1, items: [item], history: [] }).items[0], item);
  }
  assert.throws(() => newDeviceRemark('Passed equipment'), /template/);
});

test('explicit updates retain stable identities, prior evidence and independent result state', () => {
  const { job } = fixture();
  const original = structuredClone(job);
  const first = job.results[0].remarks;
  const item = { ...first.items[0], status: 'Resolved', description: 'Engineer recorded repair', resolvedPhotos: [{ id: 'resolved-photo', image: PNG, caption: 'After' }] };
  const updated = saveDeviceRemark(first, item);
  assert.deepEqual(job, original);
  assert.equal(job.results[0].state, 'Not tested');
  assert.equal(updated.items[0].id, first.items[0].id);
  assert.equal(updated.items[0].createdAt, first.items[0].createdAt);
  assert.equal(updated.items[0].status, 'Resolved');
  assert.deepEqual(updated.history[0].item, first.items[0]);
  assert.equal(updated.history[0].remarkId, first.items[0].id);
  assert.deepEqual(saveDeviceRemark(updated, updated.items[0]), updated, 'no-op save does not inflate history');
  const another = saveDeviceRemark(updated, newDeviceRemark());
  assert.equal(another.items.length, 2);
  assert.deepEqual(another.items[0], updated.items[0]);
});

test('remarks reject unsafe structure, malformed dates, ID collisions and invalid media', () => {
  const good = saveDeviceRemark(undefined, remark());
  const mutations = [
    value => value.version = 2,
    value => value.html = '<img>',
    value => value.items[0].onclick = 'unsafe',
    value => value.items[0].severity = 'Passed',
    value => value.items[0].status = 'Automatically resolved',
    value => value.items[0].lastVerified = '2026-02-30',
    value => value.items[0].updatedAt = '2026-02-30T00:00:00Z',
    value => value.items[0].products[0].quantity = Infinity,
    value => value.items[0].products[0].id = value.items[0].beforePhotos[0].id,
    value => value.items[0].resolvedPhotos = structuredClone(value.items[0].beforePhotos),
    value => value.items.push(structuredClone(value.items[0])),
    value => value.items[0].beforePhotos[0].image = 'https://example.com/photo.png',
    value => value.items[0].beforePhotos[0].image = 'data:image/png;base64,AAAA',
    value => value.items[0].beforePhotos[0].image = 'data:image/svg+xml;base64,AAAA',
    value => value.history.push({ id: 'history-1', remarkId: 'missing', savedAt: new Date().toISOString(), item: structuredClone(value.items[0]) }),
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(good); mutate(bad);
    assert.throws(() => validateDeviceRemarks(bad));
  }
  const invalidHistory = saveDeviceRemark(good, { ...good.items[0], description: 'Revised' });
  invalidHistory.history[0].id = invalidHistory.items[0].id;
  assert.throws(() => validateDeviceRemarks(invalidHistory), /unique/);
});

test('history capacity rejects the edit without discarding existing records', () => {
  const records = saveDeviceRemark(undefined, newDeviceRemark());
  records.history = Array.from({ length: 200 }, (_, index) => ({
    id: `history-${index}`, remarkId: records.items[0].id, savedAt: records.items[0].updatedAt,
    item: structuredClone(records.items[0]),
  }));
  const before = structuredClone(records);
  assert.throws(() => saveDeviceRemark(records, { ...records.items[0], description: 'Changed' }), /at most 200/);
  assert.deepEqual(records, before);
});

test('package v3 retains current and historical remark photos, deduplicates and preserves conflicting work', async () => {
  const { site, job } = fixture();
  job.results[0].remarks = saveDeviceRemark(job.results[0].remarks, {
    ...job.results[0].remarks.items[0], status: 'Resolved', resolvedPhotos: [{ id: 'resolved-photo', image: PNG, caption: 'After' }],
  });
  const exported = await createJobPackage(site, job);
  assert.equal(exported.version, 3);
  assert.equal(exported.attachments.length, 1);
  const imported = await importJobPackage({ sites: [], jobs: [] }, exported);
  assert.deepEqual(imported.job.results[0].remarks, job.results[0].remarks);
  assert.equal(imported.job.results[0].state, 'Not tested');
  assert.equal((await importJobPackage(imported.state, exported)).duplicate, true);
  const local = imported.state.jobs[0].results[0];
  local.remarks = saveDeviceRemark(local.remarks, { ...local.remarks.items[0], description: 'New local evidence' });
  const fresh = structuredClone(exported);
  fresh.job.results[0].remarks.items[0].description = 'Conflicting incoming evidence';
  const conflict = await importJobPackage(imported.state, fresh);
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.state.jobs.length, 2);
  assert.equal(conflict.state.jobs[0].results[0].remarks.items[0].description, 'New local evidence');
  assert.equal((await importJobPackage(conflict.state, fresh)).duplicate, true);
});

test('drawing history and removed-device remarks are validated and travel in packages', async () => {
  const { site, job } = fixture();
  const revised = structuredClone(site.drawings[0]);
  revised.id = 'next-drawing'; revised.revision = 'B'; revised.assets.shift();
  const changed = applyDrawingToJob({ sites: [site], jobs: [job] }, job.id, revised);
  const exported = await createJobPackage(changed.sites[0], changed.jobs[0]);
  const expanded = validateJobPackage(exported);
  assert.deepEqual(expanded.job.archivedResults[0].result.remarks, job.results[0].remarks);
  assert.deepEqual(expanded.job.drawingChanges[0].previousResults[0].remarks, job.results[0].remarks);
  for (const section of ['archived', 'previous']) {
    const invalid = structuredClone(expanded);
    const target = section === 'archived' ? invalid.job.archivedResults[0].result : invalid.job.drawingChanges[0].previousResults[0];
    target.remarks.items[0].severity = 'Guaranteed safe';
    const before = structuredClone(changed);
    await assert.rejects(importJobPackage(changed, invalid), /severity/);
    assert.deepEqual(changed, before);
  }
});

test('Panel Pal context includes selected remarks and notes without internal notes or automatic results', () => {
  const { site, job } = fixture();
  job.notesDocument = { version: 1, blocks: [], photos: [] };
  job.results[0].remarks = saveDeviceRemark(job.results[0].remarks, { ...job.results[0].remarks.items[0], status: 'Resolved' });
  job.drawingChanges = [{ previousResults: structuredClone(job.results) }];
  job.archivedResults = [{ result: structuredClone(job.results[0]) }];
  const before = structuredClone(job);
  const context = panelContext(site, job);
  assert.equal(context.schemaVersion, 1);
  assert.equal(context.adapter.connected, false);
  assert.equal(context.engineerEvidence.results[0].state, 'Not tested');
  assert.deepEqual(context.engineerEvidence.notesDocument, job.notesDocument);
  assert.equal(context.engineerEvidence.faults[0].remarks[0].status, 'Resolved');
  assert.equal(context.engineerEvidence.faults[0].remarks[0].beforePhotos[0].image, PNG);
  assert.ok(!JSON.stringify(context).includes('PRIVATE REMARK OFFICE'));
  assert.deepEqual(job, before);
  assert.equal(panelContext(site, job, { assetIds: ['asset-2'] }).engineerEvidence.faults.length, 0);
  const critical = newDeviceRemark('Critical defect');
  job.results[1].remarks = saveDeviceRemark(undefined, critical);
  const criticalContext = panelContext(site, job, { assetIds: ['asset-2'] });
  assert.equal(criticalContext.engineerEvidence.faults[0].remarks[0].severity, 'Critical defect');
  assert.equal(criticalContext.engineerEvidence.results[0].state, 'Not tested');
  assert.equal(criticalContext.engineerEvidence.faults[0].remarks[0].description, '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWorkspaceBackup, inspectWorkspaceBackup, restoreWorkspaceBackup, MAX_BACKUP_BYTES } from '../src/workspace-backup.js';
import { createQuickJob, newJob, newSite } from '../src/model.js';
import { createJobPackage, importJobPackage } from '../src/packages.js';
import { quickDefectFromRemark } from '../src/quick-defects.js';
import { newDeviceRemark } from '../src/device-remarks.js';
import { saveTimesheet, submitTimesheets, deleteTimesheet } from '../src/timesheets.js';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=';
const empty = () => ({ sites: [], jobs: [], quickDefects: [], unassignedTimesheets: [] });
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object'
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
function reseal(pack) {
  const { checksum, backupId, ...payload } = pack;
  const digest = hash(payload);
  return { ...payload, checksum: `sha256:${digest}`, backupId: `workspace-${digest}` };
}
const notes = () => ({ version: 1, blocks: [{ id: 'synthetic-block', type: 'paragraph', align: 'left', runs: [{ text: 'Recorded engineer notes', bold: true }] }], photos: [{ id: 'synthetic-note-photo', image: PIXEL, caption: 'Synthetic pixel only' }] });

async function fixture() {
  const site = newSite('Synthetic recovery site');
  const drawing = site.drawings[0];
  drawing.source = { format: 'ZoneSketchByWill', version: 1, project: { original: 'Unmodified synthetic project', photograph: PIXEL } };
  drawing.assets.push({ id: 'synthetic-smoke', type: 'Smoke detector', floorId: drawing.floors[0].id, x: 10, y: 20, photos: [{ id: 'synthetic-source-photo', image: PIXEL }] });
  drawing.planPreviews = [{ id: 'synthetic-preview', drawingId: drawing.id, floorId: drawing.floors[0].id, revision: 'Manual 1', rendererVersion: 1, image: PIXEL, width: 1, height: 1, generatedAt: '2026-11-16T10:00:00.000Z' }];
  drawing.issuedSnapshots.push({ id: 'synthetic-issued', revision: 'Issued A', floors: structuredClone(drawing.floors), assets: structuredClone(drawing.assets), issuedSnapshots: [] });
  const job = newJob(site);
  job.notesDocument = notes();
  job.results[0].state = 'Unsatisfactory';
  job.results[0].defects = 'Synthetic device requires investigation.';
  const originalJobPackage = await createJobPackage(site, job);
  const imported = await importJobPackage(empty(), originalJobPackage);
  const workspace = imported.state;
  workspace.jobs[0].notesDocument.blocks[0].runs[0].text = 'Later saved note after the original import';
  workspace.jobs[0].revision++;
  const unusedSite = newSite('Prepared site without visits');
  unusedSite.profile = { version: 1, contactName: 'Synthetic contact', instructions: 'Use the service entrance' };
  workspace.sites.push(unusedSite);
  const standalone = createQuickJob(null, { title: 'Independent notes job' });
  standalone.notesDocument = notes();
  workspace.jobs.push(standalone);
  workspace.quickDefects = [quickDefectFromRemark(newDeviceRemark('Battery backup'))];
  let timed = saveTimesheet(workspace, { id: 'unassigned-live', date: '2026-11-16', start: '08:00', end: '09:00', sessionType: 'Travel', note: 'Synthetic travel' }, { jobId: null });
  timed = submitTimesheets(timed, [{ jobId: null, entryId: 'unassigned-live' }], { from: '2026-11-16' }).state;
  timed = saveTimesheet(timed, { id: 'unassigned-trashed', date: '2026-11-16', start: '09:00', end: '09:30', sessionType: 'Administration' }, { jobId: null });
  timed = deleteTimesheet(timed, { jobId: null, entryId: 'unassigned-trashed' });
  return { workspace: timed, originalJobPackage };
}

test('workspace backup round trip includes unused sites, issued plans, photos, note jobs, quick defects and unassigned histories', async () => {
  const { workspace } = await fixture(), before = structuredClone(workspace);
  const wire = await createWorkspaceBackup(workspace, { appVersion: '1.0.0' });
  assert.equal(wire.format, 'JobsWorkspaceBackup');
  assert.equal(wire.version, 1);
  assert.equal(wire.kind, 'backup');
  assert.equal(wire.attachments.length, 1, 'Identical images across notes, source and drawings are pooled');
  assert.equal(wire.attachments[0].image, PIXEL);
  assert.ok(wire.attachmentRefs.length >= 6);
  assert.deepEqual(workspace, before, 'Creating the download never changes application state');
  const wireBefore = structuredClone(wire);
  const inspected = await inspectWorkspaceBackup(JSON.stringify(wire));
  assert.deepEqual(inspected.workspace, workspace);
  assert.deepEqual(inspected.summary, { sites: 2, jobs: 2, drawings: 2, assets: 1, quickDefects: 1, unassignedTimesheets: 2, attachments: 1 });
  assert.equal(inspected.metadata.appVersion, '1.0.0');
  assert.match(inspected.metadata.checksum, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(wire, wireBefore);
  const restored = await restoreWorkspaceBackup(empty(), wire);
  assert.equal(restored.duplicate, false);
  assert.deepEqual(restored.state, before);
  restored.state.jobs[0].scope = 'Changed after inspection';
  assert.deepEqual(inspected.workspace, before);
});

test('restored import receipts still prevent duplicates after the originally received package is imported again', async () => {
  const { workspace, originalJobPackage } = await fixture();
  assert.ok(workspace.jobs[0].importHistory.length);
  const wire = await createWorkspaceBackup(workspace);
  const restored = await restoreWorkspaceBackup(empty(), wire);
  assert.deepEqual(restored.state.jobs[0].importHistory, workspace.jobs[0].importHistory);
  const repeated = await importJobPackage(restored.state, originalJobPackage);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state.jobs.length, 2);
  assert.equal(repeated.job.notesDocument.blocks[0].runs[0].text, 'Later saved note after the original import');
});

test('identical restoration is a no-op even after IndexedDB returns sites and jobs in a different key order', async () => {
  const { workspace } = await fixture(), wire = await createWorkspaceBackup(workspace);
  const reordered = structuredClone(workspace);
  reordered.jobs.reverse(); reordered.sites.reverse();
  const repeated = await restoreWorkspaceBackup(reordered, wire);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state, reordered);
  assert.equal((await restoreWorkspaceBackup(empty(), await createWorkspaceBackup(empty()))).duplicate, true);
});

test('differing existing work, including only a quick defect or unassigned session, is never replaced', async () => {
  const { workspace } = await fixture(), wire = await createWorkspaceBackup(workspace);
  for (const current of [
    { ...empty(), sites: [newSite('Other saved site')] },
    { ...empty(), jobs: [createQuickJob()] },
    { ...empty(), quickDefects: workspace.quickDefects },
    { ...empty(), unassignedTimesheets: workspace.unassignedTimesheets },
    { ...structuredClone(workspace), jobs: workspace.jobs.map(job => ({ ...job, scope: 'Newer local work' })) },
  ]) {
    const before = structuredClone(current);
    await assert.rejects(restoreWorkspaceBackup(current, wire), /empty job workspace/);
    assert.deepEqual(current, before);
  }
});

test('recovery snapshots explicitly identify an attempted save without claiming successful persistence', async () => {
  const { workspace } = await fixture();
  const wire = await createWorkspaceBackup(workspace, { appVersion: '1.0.0', kind: 'recovery' });
  assert.equal((await inspectWorkspaceBackup(wire)).metadata.kind, 'recovery');
  assert.match((await restoreWorkspaceBackup(empty(), wire)).message, /save attempt/);
  await assert.rejects(createWorkspaceBackup(workspace, { kind: 'saved-and-verified' }), /kind/);
});

test('invalid JSON, unsupported versions, damaged records and attachment tampering are rejected before restore', async () => {
  const { workspace } = await fixture(), wire = await createWorkspaceBackup(workspace), original = structuredClone(workspace);
  await assert.rejects(inspectWorkspaceBackup('{"broken":'), /valid JSON/);
  for (const mutate of [
    pack => { pack.version = 99; },
    pack => { pack.workspace.jobs[0].scope = 'Tampered scope'; },
    pack => { pack.attachments[0].image = PIXEL.replace('CAQ', 'CAR'); },
    pack => { pack.createdAt = '2026-02-30T10:00:00.000Z'; },
    pack => { delete pack.checksum; },
    pack => { pack.cloudSync = true; },
  ]) {
    const invalid = structuredClone(wire); mutate(invalid);
    await assert.rejects(restoreWorkspaceBackup(workspace, invalid));
    assert.deepEqual(workspace, original);
  }
  const media = structuredClone(wire); media.attachments[0].image = PIXEL.replace('CAQ', 'CAR');
  await assert.rejects(inspectWorkspaceBackup(reseal(media)), /attachment content/);
});

test('fully checksummed malformed paths, orphan references and invalid records still cannot be restored', async () => {
  const { workspace } = await fixture(), wire = await createWorkspaceBackup(workspace);
  for (const mutate of [
    pack => { pack.attachmentRefs.push(structuredClone(pack.attachmentRefs[0])); },
    pack => { pack.attachmentRefs[0].path = ['workspace', '__proto__', 'polluted']; },
    pack => { pack.attachmentRefs[0].attachmentId = 'missing'; },
    pack => { pack.attachmentRefs[0].path = ['workspace', 'jobs', '0', 'notesDocument']; },
    pack => { pack.attachmentRefs[0].path = ['workspace', 'jobs', 0, 'scope']; },
    pack => { pack.workspace.jobs[0].siteId = 'missing-site'; },
    pack => { pack.workspace.jobs[0].drawingId = 'missing-drawing'; },
    pack => { pack.workspace.jobs[0].importHistory = [{}]; },
    pack => { pack.workspace.quickDefects[0].internalNote = 'Never a reusable field'; },
    pack => { pack.workspace.unassignedTimesheets[0].hours = -2; },
  ]) {
    const invalid = structuredClone(wire); mutate(invalid);
    await assert.rejects(inspectWorkspaceBackup(reseal(invalid)));
  }
  const unused = structuredClone(wire), extraImage = PIXEL.replace('CAQ', 'CAR');
  unused.attachments.push({ id: `image-${hash(extraImage)}`, image: extraImage });
  await assert.rejects(inspectWorkspaceBackup(reseal(unused)), /unreferenced attachments/);
});

test('sites without jobs receive complete drawing validation without creating a synthetic saved visit', async () => {
  const site = newSite('Unused site'), workspace = { ...empty(), sites: [site] };
  const good = await inspectWorkspaceBackup(await createWorkspaceBackup(workspace));
  assert.equal(good.workspace.jobs.length, 0);
  assert.deepEqual(good.workspace.sites, [site]);
  for (const mutate of [
    value => { value.sites[0].drawings = []; },
    value => { value.sites[0].drawings[0].floors[0].data.image = 'https://example.test/remote.png'; },
    value => { value.sites[0].drawings[0].assets.push({ id: 'orphan-asset', type: 'panel', floorId: 'missing-floor' }); },
    value => { value.sites[0].drawings[0].basedOnDrawingId = 'missing-parent'; },
  ]) {
    const invalid = structuredClone(workspace); mutate(invalid);
    await assert.rejects(createWorkspaceBackup(invalid));
  }
});

test('file, depth, unsafe-key and expansion limits reject oversized or malicious backup structures', async () => {
  await assert.rejects(inspectWorkspaceBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /100 MiB/);
  const workspace = empty();
  workspace.extra = true;
  await assert.rejects(createWorkspaceBackup(workspace), /unsupported fields/);
  const site = newSite('Bounded test'), deep = { ...empty(), sites: [site] };
  let branch = site.drawings[0].source = {};
  for (let index = 0; index < 90; index++) branch = branch.next = {};
  await assert.rejects(createWorkspaceBackup(deep), /deeply nested/);
  const unsafe = JSON.parse('{"sites":[],"jobs":[],"quickDefects":[],"unassignedTimesheets":[],"__proto__":{"polluted":true}}');
  await assert.rejects(createWorkspaceBackup(unsafe));
  assert.equal({}.polluted, undefined);
  const valid = await createWorkspaceBackup(empty());
  const largeImage = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);
  const attachmentId = `image-${hash(largeImage)}`;
  valid.workspace.sites = [newSite('Expansion test')];
  valid.workspace.sites[0].drawings[0].source = { images: Array(130).fill(null) };
  valid.attachments = [{ id: attachmentId, image: largeImage }];
  valid.attachmentRefs = Array.from({ length: 130 }, (_, index) => ({ path: ['workspace', 'sites', 0, 'drawings', 0, 'source', 'images', index], attachmentId }));
  await assert.rejects(inspectWorkspaceBackup(reseal(valid)), /256 MiB expanded/);
});

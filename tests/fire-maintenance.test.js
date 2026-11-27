import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRE_SYSTEM_QUESTIONS, FIRE_EQUIPMENT_TEMPLATES, isFireMaintenanceJob,
  createFireMaintenanceDraft, createFireMaintenanceEquipment, saveFireMaintenance, validateFireMaintenance,
} from '../src/fire-maintenance.js';
import { createQuickJob, newSite } from '../src/model.js';
import { addJobAsset } from '../src/asset-library.js';
import { createJobPackage, importJobPackage, validateJobPackage } from '../src/packages.js';

function fixture() {
  const site = newSite('Synthetic maintenance site');
  const drawing = site.drawings[0];
  drawing.assets = [
    { id: 'panel-asset', type: 'panel', reference: 'P1', floorId: drawing.floors[0].id, photos: [] },
    { id: 'battery-asset', type: 'battery', reference: 'B1', floorId: drawing.floors[0].id, photos: [] },
  ];
  const job = createQuickJob(site, { discipline: 'Fire', workType: 'Maintenance', engineer: 'Synthetic engineer', scope: 'Recorded test scope' });
  return { site, drawing, job };
}

test('maintenance templates provide actual questions, units and explicit Not recorded defaults', () => {
  const { job, drawing } = fixture();
  const before = structuredClone(job), draft = createFireMaintenanceDraft(job, drawing);
  assert.equal(FIRE_SYSTEM_QUESTIONS.length, 8);
  assert.equal(FIRE_EQUIPMENT_TEMPLATES.find(item => item.id === 'fire-panel').questions.length, 7);
  assert.equal(FIRE_EQUIPMENT_TEMPLATES.find(item => item.id === 'battery').questions.length, 6);
  assert.ok(Object.values(draft.systemAnswers).every(answer => answer.value === null && answer.notes === ''));
  assert.deepEqual(draft.equipment, []);
  assert.equal(draft.fields.engineer, job.engineer);
  assert.equal(draft.fields.scope, job.scope);
  for (const field of ['visitDate', 'standard', 'engineerName', 'engineerDate', 'clientName', 'company']) assert.equal(draft.fields[field], '');
  assert.equal(draft.revision, 0);
  assert.equal(draft.savedAt, '');
  assert.deepEqual(job, before);
  assert.equal(isFireMaintenanceJob({ workType: 'Fire alarm maintenance' }), true);
  assert.equal(isFireMaintenanceJob({ discipline: 'CCTV', workType: 'Maintenance' }), false);
  assert.equal(isFireMaintenanceJob({ discipline: 'Fire', workType: 'Install' }), false);
  assert.equal(validateFireMaintenance(undefined), undefined);
});

test('explicit maintenance records work for unclassified jobs without changing classification or results', () => {
  const job = createQuickJob();
  const before = structuredClone(job);
  assert.equal(isFireMaintenanceJob(job), false, 'no automatic suggestion for an unclassified job');
  const draft = createFireMaintenanceDraft(job);
  draft.systemAnswers['false-alarms-12-months'].value = 0;
  const saved = saveFireMaintenance(job, draft);
  assert.equal(saved.systemAnswers['false-alarms-12-months'].value, 0);
  assert.equal(saved.drawingId, null);
  assert.deepEqual(job, before);
  assert.equal(job.discipline, '');
  assert.equal(job.workType, '');
  assert.deepEqual(job.results, []);
});

test('standalone job assets are available for maintenance and survive job export', async () => {
  const original = createQuickJob();
  const { job, asset } = addJobAsset({ sites: [], jobs: [original] }, original.id, { type: 'panel', reference: 'Panel 1' });
  const draft = createFireMaintenanceDraft(job, job.assetRegister);
  draft.equipment.push(createFireMaintenanceEquipment('fire-panel', asset));
  job.fireMaintenance = saveFireMaintenance(job, draft, job.assetRegister);
  assert.equal(job.fireMaintenance.drawingId, job.assetRegister.id);
  assert.equal(job.fireMaintenance.equipment[0].assetId, asset.id);
  assert.equal(job.results[0].state, 'Not tested');
  const pack = await createJobPackage(null, job);
  const restored = validateJobPackage(pack);
  assert.equal(restored.job.fireMaintenance.equipment[0].assetId, asset.id);
  assert.throws(() => createFireMaintenanceDraft(job, { ...job.assetRegister, id: 'another-job-register' }), /does not belong/);
});

test('partial saving preserves numeric zero and manual equipment without passing any device', () => {
  const { job, drawing } = fixture();
  const draft = createFireMaintenanceDraft(job, drawing);
  draft.systemAnswers['false-alarms-12-months'].value = 0;
  draft.systemAnswers['mcp-siting'] = { value: 'Pass', notes: '' };
  const battery = createFireMaintenanceEquipment('battery');
  battery.label = 'Manually recorded battery set';
  battery.answers['battery-charge-voltage'].value = 0;
  battery.answers['battery-load-voltage'].value = -0.5;
  battery.answers['battery-capacity'].value = 0;
  draft.equipment.push(battery);
  const before = structuredClone(job), saved = saveFireMaintenance(job, draft, drawing);
  assert.equal(saved.systemAnswers['false-alarms-12-months'].value, 0);
  assert.equal(saved.systemAnswers['system-category'].value, null);
  assert.equal(saved.equipment[0].answers['battery-charge-voltage'].value, 0);
  assert.equal(saved.equipment[0].answers['battery-load-voltage'].value, -0.5);
  assert.equal(saved.equipment[0].assetId, null);
  assert.equal(saved.equipment[0].answers['battery-service-life'].value, null);
  assert.equal(saved.revision, 1);
  assert.deepEqual(job, before);
  assert.ok(job.results.every(result => result.state === 'Not tested'));
});

test('Fail and N/A need notes; invalid answers, dates, numeric counts and unknown data reject', () => {
  const { job, drawing } = fixture();
  for (const value of ['Fail', 'N/A']) {
    const draft = createFireMaintenanceDraft(job, drawing);
    draft.systemAnswers['logbook-updated'].value = value;
    assert.throws(() => saveFireMaintenance(job, draft, drawing), /Explain/);
    draft.systemAnswers['logbook-updated'].notes = 'Engineer recorded the reason';
    assert.equal(saveFireMaintenance(job, draft, drawing).systemAnswers['logbook-updated'].value, value);
  }
  const saved = saveFireMaintenance(job, createFireMaintenanceDraft(job, drawing), drawing);
  for (const mutate of [
    value => value.version = 2,
    value => value.certified = true,
    value => value.systemAnswers['mcp-siting'].value = 'Automatically passed',
    value => value.systemAnswers['false-alarms-12-months'].value = -1,
    value => value.systemAnswers['false-alarms-12-months'].value = 1.5,
    value => value.systemAnswers['false-alarms-12-months'].value = '0',
    value => value.systemAnswers['layout-changes'].value = 'Pass',
    value => value.systemAnswers.unknown = { value: null, notes: '' },
    value => delete value.systemAnswers['areas-devices-tested'],
    value => value.fields.visitDate = '2026-02-30',
    value => value.fields.engineerDate = 'today',
    value => value.savedAt = '2026-02-30T12:00:00Z',
  ]) {
    const invalid = structuredClone(saved); mutate(invalid);
    assert.throws(() => validateFireMaintenance(invalid));
  }
});

test('equipment records require an entered label or valid selected asset and preserve the register', () => {
  const { job, drawing } = fixture(), before = structuredClone(drawing);
  const draft = createFireMaintenanceDraft(job, drawing);
  const panel = createFireMaintenanceEquipment('fire-panel', drawing.assets[0]);
  assert.equal(panel.label, 'P1');
  assert.equal(panel.assetId, 'panel-asset');
  draft.equipment.push(panel);
  const saved = saveFireMaintenance(job, draft, drawing);
  assert.deepEqual(drawing, before);
  assert.equal(saved.equipment[0].id, panel.id);
  const duplicate = structuredClone(draft); duplicate.equipment.push(structuredClone(panel));
  assert.throws(() => saveFireMaintenance(job, duplicate, drawing), /unique/);
  const manual = createFireMaintenanceDraft(job, drawing); manual.equipment.push(createFireMaintenanceEquipment('battery'));
  assert.throws(() => saveFireMaintenance(job, manual, drawing), /label/);
  draft.equipment[0].assetId = 'missing-asset';
  assert.throws(() => saveFireMaintenance(job, draft, drawing), /belong/);
  assert.throws(() => createFireMaintenanceEquipment('invented-panel'), /unsupported/);
});

test('editing archives complete prior records, keeps identities and rejects stale drafts without duplication', () => {
  const { job, drawing } = fixture();
  job.fireMaintenance = saveFireMaintenance(job, createFireMaintenanceDraft(job, drawing), drawing);
  const original = structuredClone(job), draft = createFireMaintenanceDraft(job, drawing);
  draft.systemAnswers['system-category'].value = 'Apparent category: engineer review required';
  const second = saveFireMaintenance(job, draft, drawing);
  assert.deepEqual(job, original);
  assert.equal(second.id, original.fireMaintenance.id);
  assert.equal(second.revision, 2);
  assert.equal(second.history.length, 1);
  assert.equal(second.history[0].systemAnswers['system-category'].value, null);
  assert.equal(second.history[0].revision, 1);
  job.fireMaintenance = second;
  assert.deepEqual(saveFireMaintenance(job, createFireMaintenanceDraft(job, drawing), drawing), second);
  assert.throws(() => saveFireMaintenance(job, draft, drawing), /out of date/);
  assert.equal(Object.hasOwn(second, 'jobId'), false);
});

test('drawing changes start unrecorded checks and preserve earlier drawing and equipment evidence', () => {
  const { site, job, drawing } = fixture();
  const first = createFireMaintenanceDraft(job, drawing);
  first.systemAnswers['mcp-siting'] = { value: 'Pass', notes: 'Original inspected scope' };
  first.equipment.push(createFireMaintenanceEquipment('fire-panel', drawing.assets[0]));
  job.fireMaintenance = saveFireMaintenance(job, first, drawing);
  const nextDrawing = { ...structuredClone(drawing), id: 'drawing-b', revision: 'B' };
  site.drawings.push(nextDrawing); job.drawingId = nextDrawing.id; job.revision++;
  const draft = createFireMaintenanceDraft(job, nextDrawing);
  assert.equal(draft.systemAnswers['mcp-siting'].value, null);
  assert.deepEqual(draft.equipment, []);
  job.fireMaintenance = saveFireMaintenance(job, draft, nextDrawing);
  assert.equal(job.fireMaintenance.history[0].drawingId, drawing.id);
  assert.equal(job.fireMaintenance.history[0].equipment[0].assetId, 'panel-asset');
  assert.equal(job.fireMaintenance.drawingId, nextDrawing.id);
  assert.equal(job.fireMaintenance.history[0].systemAnswers['mcp-siting'].value, 'Pass');
});

test('standalone maintenance records export and reimport without invented sites or duplicate jobs', async () => {
  const job = createQuickJob(null, { discipline: 'Fire', workType: 'Maintenance' });
  const draft = createFireMaintenanceDraft(job);
  draft.fields.visitDate = '2026-11-14';
  const panel = createFireMaintenanceEquipment('fire-panel'); panel.label = 'Panel recorded on visit';
  panel.answers['panel-quiescent-current'].value = 0;
  draft.equipment.push(panel);
  job.fireMaintenance = saveFireMaintenance(job, draft);
  const output = await createJobPackage(null, job);
  assert.equal(output.version, 3);
  const imported = await importJobPackage({ sites: [], jobs: [] }, output);
  assert.deepEqual(imported.state.sites, []);
  assert.deepEqual(imported.job.fireMaintenance, job.fireMaintenance);
  assert.equal((await importJobPackage(imported.state, output)).duplicate, true);
  assert.deepEqual(await createJobPackage(null, imported.job), output);
});

test('package conflicts remap current and historical form drawings and retain both saved jobs', async () => {
  const { site, drawing, job } = fixture();
  const first = createFireMaintenanceDraft(job, drawing);
  first.equipment.push(createFireMaintenanceEquipment('fire-panel', drawing.assets[0]));
  job.fireMaintenance = saveFireMaintenance(job, first, drawing);
  const secondDrawing = { ...structuredClone(drawing), id: 'drawing-b', revision: 'B' };
  site.drawings.push(secondDrawing); job.drawingId = secondDrawing.id; job.revision++;
  const second = createFireMaintenanceDraft(job, secondDrawing);
  second.equipment.push(createFireMaintenanceEquipment('battery', secondDrawing.assets[1]));
  job.fireMaintenance = saveFireMaintenance(job, second, secondDrawing);
  const output = await createJobPackage(site, job);
  const incoming = validateJobPackage(output);
  site.drawings.forEach(item => item.revision = `Changed local ${item.revision}`);
  const state = { sites: [site], jobs: [job] }, before = structuredClone(state);
  const imported = await importJobPackage(state, output);
  assert.equal(imported.conflict, true);
  assert.deepEqual(state, before);
  assert.deepEqual(imported.state.jobs[0], before.jobs[0]);
  assert.equal(imported.state.jobs.length, 2);
  for (const record of [imported.job.fireMaintenance, ...imported.job.fireMaintenance.history]) {
    const preserved = imported.state.sites[0].drawings.find(item => item.id === record.drawingId);
    assert.ok(preserved.sourceDrawingId);
    assert.ok(record.equipment.every(item => preserved.assets.some(asset => asset.id === item.assetId)));
  }
  assert.equal(imported.job.fireMaintenance.id, incoming.job.fireMaintenance.id);
  assert.equal((await importJobPackage(imported.state, output)).duplicate, true);
});

test('invalid current and retained drawing/asset references reject before mutating local work', async () => {
  const { site, drawing, job } = fixture();
  const draft = createFireMaintenanceDraft(job, drawing);
  draft.equipment.push(createFireMaintenanceEquipment('fire-panel', drawing.assets[0]));
  job.fireMaintenance = saveFireMaintenance(job, draft, drawing);
  const updated = createFireMaintenanceDraft(job, drawing); updated.fields.conditionLeft = 'Recorded condition';
  job.fireMaintenance = saveFireMaintenance(job, updated, drawing);
  const output = validateJobPackage(await createJobPackage(site, job));
  const state = { sites: [site], jobs: [job] }, before = structuredClone(state);
  for (const historical of [false, true]) for (const key of ['drawing', 'asset', 'job-revision']) {
    const invalid = structuredClone(output);
    const record = historical ? invalid.job.fireMaintenance.history[0] : invalid.job.fireMaintenance;
    if (key === 'drawing') record.drawingId = 'missing-drawing';
    if (key === 'asset') record.equipment[0].assetId = 'missing-asset';
    if (key === 'job-revision') record.basedOnJobRevision = job.revision + 1;
    await assert.rejects(importJobPackage(state, invalid), /fire maintenance.*(missing|future)/);
    assert.deepEqual(state, before);
  }
});

test('history limits reject further changes without discarding any saved record', () => {
  const { job, drawing } = fixture();
  const initial = saveFireMaintenance(job, createFireMaintenanceDraft(job, drawing), drawing);
  const { version, id, history, ...snapshot } = initial;
  job.fireMaintenance = { ...initial, revision: 101, history: Array.from({ length: 100 }, (_, index) => ({ ...structuredClone(snapshot), revision: index + 1 })) };
  const before = structuredClone(job), draft = createFireMaintenanceDraft(job, drawing);
  draft.fields.nextActions = 'Additional recorded action';
  assert.throws(() => saveFireMaintenance(job, draft, drawing), /at most 100/);
  assert.deepEqual(job, before);
});

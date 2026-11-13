import test from 'node:test';
import assert from 'node:assert/strict';
import { panelContext } from '../src/panel-context.js';

const fixture = () => ({
  site: { id: 'site-1', name: 'Synthetic workshop', sourceKeys: ['floor-1'], drawings: [{
    id: 'drawing-1', revision: 'A', kind: 'working', drawingRef: 'SYN-01', floors: [{ id: 'floor-1' }],
    assets: [{ id: 'asset-1', sourceId: 'detector-1', sourceFloorId: 'source-floor-1', floorId: 'floor-1', reference: 'D1', type: 'smoke', x: 10, y: 20, drawingStatus: 'existing', photos: [{ id: 'photo-1', image: 'data:image/png;base64,AA==' }] }, { id: 'asset-2', reference: 'D2' }],
  }] },
  job: { id: 'job-1', siteId: 'site-1', drawingId: 'drawing-1', revision: 3, system: 'Fire alarm', workType: 'General fault or repair work', scope: 'Investigate intermittent fault', results: [{ id: 'result-1', assetId: 'asset-1', state: 'Unsatisfactory', observations: 'Repeated fault', readings: [{ name: 'Voltage', value: 23.9, unit: 'V' }], defects: 'Loose connection', photos: [{ id: 'photo-2', image: 'data:image/png;base64,AA==' }] }, { id: 'result-2', assetId: 'asset-2', state: 'Not tested' }], aiProposals: [{ id: 'proposal-1', text: 'Check connection', confirmed: false }] },
});

test('context retains provenance, numeric units and embedded attachments without confirming AI proposals', () => {
  const { site, job } = fixture();
  const before = structuredClone({ site, job });
  const output = panelContext(site, job, { exportedAt: '2026-11-13T00:00:00.000Z' });
  assert.equal(output.kind, 'jobs-panel-pal-context');
  assert.equal(output.adapter.connected, false);
  assert.equal(output.identity.jobRevision, 3);
  assert.equal(output.identity.drawingRevision, 'A');
  assert.equal(output.equipment[0].sourceId, 'detector-1');
  assert.equal(output.equipment[0].model, null);
  assert.equal(output.equipment[0].installedIdentityConfirmed, false);
  assert.deepEqual(output.engineerEvidence.results, job.results);
  assert.equal(output.engineerEvidence.results[1].state, 'Not tested');
  assert.equal(output.engineerEvidence.faults[0].resultId, 'result-1');
  assert.deepEqual(output.aiProposals, job.aiProposals);
  output.equipment[0].photos[0].image = 'modified';
  output.engineerEvidence.results[0].readings[0].unit = 'modified';
  assert.deepEqual({ site, job }, before);
});

test('selection narrows equipment and visit evidence together and rejects unrelated identities', () => {
  const { site, job } = fixture();
  const output = panelContext(site, job, { assetIds: ['asset-2'] });
  assert.deepEqual(output.equipment.map(item => item.id), ['asset-2']);
  assert.deepEqual(output.engineerEvidence.results.map(item => item.id), ['result-2']);
  assert.equal(output.engineerEvidence.faults.length, 0);
  assert.throws(() => panelContext(site, job, { assetIds: ['missing'] }), /Selected equipment/);
  assert.throws(() => panelContext(site, { ...job, siteId: 'different' }), /belong/);
  assert.throws(() => panelContext(site, { ...job, drawingId: 'missing' }), /drawing/);
});


test('unsatisfactory observation remains a recorded fault without a defect entry', () => {
  const { site, job } = fixture();
  job.results[0].defects = '';
  const output = panelContext(site, job);
  assert.equal(output.engineerEvidence.faults.length, 1);
  assert.equal(output.engineerEvidence.faults[0].state, 'Unsatisfactory');
  assert.equal(output.engineerEvidence.faults[0].observations, 'Repeated fault');
  assert.equal(output.engineerEvidence.faults[0].resultId, 'result-1');
});

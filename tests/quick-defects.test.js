import test from 'node:test';
import assert from 'node:assert/strict';
import { newDeviceRemark, saveDeviceRemark } from '../src/device-remarks.js';
import { addQuickDefect, findQuickDefect, instantiateQuickDefect, quickDefectFromRemark, removeQuickDefect, validateQuickDefects } from '../src/quick-defects.js';
import { applyQuickDeviceResult } from '../src/device-results.js';

const source = () => ({
  ...newDeviceRemark('Critical defect'), description: 'Battery capacity requires review',
  recommendation: 'Record battery checks', location: 'Private site panel room',
  internalNote: 'Private office note', lastVerified: '2026-11-14', status: 'Resolved',
  beforePhotos: [{ id: 'photo-before', image: 'included-private-photo', caption: 'Private' }],
  resolvedPhotos: [{ id: 'photo-after', image: 'included-repair-photo', caption: 'Private repair' }],
  products: [{ id: 'product-1', description: 'Site-specific part', quantity: 3, unit: 'each' }],
});

test('saved wording deduplicates independently of device evidence and preserves the source remark', () => {
  const remark = source(), before = structuredClone(remark);
  const items = addQuickDefect([], remark);
  assert.equal(items.length, 1);
  assert.deepEqual(Object.keys(items[0]).sort(), ['id', 'title', 'description', 'severity', 'recommendation', 'createdAt'].sort());
  assert.equal(items[0].description, remark.description);
  const otherDevice = { ...remark, id: 'other-device-remark', location: 'Different room', status: 'Open', internalNote: 'Different private note' };
  assert.equal(addQuickDefect(items, otherDevice).length, 1);
  assert.equal(findQuickDefect(items, otherDevice).id, items[0].id);
  assert.deepEqual(remark, before);
  assert.equal(findQuickDefect(items, { ...remark, severity: 'Minor defect' }), undefined);
  const detached = validateQuickDefects(items);
  detached[0].title = 'Only the returned copy';
  assert.notEqual(detached[0].title, items[0].title);
});

test('using a favorite creates a fresh open remark without copying site facts, photos or outcomes', () => {
  const template = quickDefectFromRemark(source());
  const first = instantiateQuickDefect(template), second = instantiateQuickDefect(template);
  assert.notEqual(first.id, template.id);
  assert.notEqual(first.id, second.id);
  assert.equal(first.status, 'Open');
  for (const field of ['location', 'internalNote', 'lastVerified']) assert.equal(first[field], '');
  for (const field of ['beforePhotos', 'resolvedPhotos', 'products']) assert.deepEqual(first[field], []);
  assert.equal(first.description, template.description);
  assert.equal(first.recommendation, template.recommendation);
  assert.equal(first.severity, template.severity);
  assert.equal(first.state, undefined);
  assert.equal(saveDeviceRemark(undefined, first).items[0].id, first.id);
});

test('unstar removes only the reusable wording and never alters existing device records', () => {
  const remark = source(), before = structuredClone(remark), library = addQuickDefect([], remark);
  assert.deepEqual(removeQuickDefect(library, library[0].id), []);
  assert.equal(library.length, 1);
  assert.deepEqual(remark, before);
  assert.deepEqual(removeQuickDefect(library, 'missing'), library);
});

test('local library validates bounds, identities, exact fields and dates', () => {
  assert.deepEqual(validateQuickDefects(undefined), []);
  const template = quickDefectFromRemark(source());
  for (const mutate of [
    value => value.photos = [],
    value => value.internalNote = 'Private',
    value => value.severity = 'Passed',
    value => value.id = '',
    value => value.title = ' ',
    value => value.createdAt = '2026-02-30T00:00:00Z',
    value => value.description = 'x'.repeat(10001),
  ]) {
    const bad = structuredClone(template); mutate(bad);
    assert.throws(() => validateQuickDefects([bad]));
  }
  assert.throws(() => validateQuickDefects([template, { ...template, title: 'Other' }]), /IDs/);
  assert.throws(() => validateQuickDefects([template, { ...template, id: 'different-id' }]), /wording/);
  const full = Array.from({ length: 200 }, (_, i) => ({ ...template, id: `template-${i}`, title: `Template ${i}` }));
  assert.equal(addQuickDefect(full, full[0]).length, 200, 'starring a duplicate does not consume capacity');
  assert.throws(() => addQuickDefect(full, source()), /200/);
});

test('quick results change only the selected device and retain all work and identities', () => {
  const job = { id: 'job-1', revision: 7, engineer: 'Recorded engineer', results: [
    { id: 'result-1', assetId: 'asset-1', state: 'Not tested', observations: '', notes: 'Keep note', defects: '', readings: [{ name: 'Voltage', value: '24', unit: 'V' }], photos: [{ id: 'photo-1', image: 'keep-photo' }], remarks: { version: 1, items: [source()], history: [] } },
    { id: 'result-2', assetId: 'asset-2', state: 'Not tested', notes: '' },
  ] };
  const before = structuredClone(job);
  const saved = applyQuickDeviceResult(job, 'asset-1', 'Satisfactory');
  assert.equal(saved.revision, 7, 'caller owns revision updates');
  assert.deepEqual(saved.results[1], before.results[1]);
  for (const key of ['id', 'assetId', 'remarks', 'notes', 'defects', 'readings', 'photos']) assert.deepEqual(saved.results[0][key], before.results[0][key]);
  assert.equal(saved.results[0].state, 'Satisfactory');
  assert.equal(saved.results[0].recordedBy, 'Recorded engineer');
  assert.ok(Number.isFinite(Date.parse(saved.results[0].recordedAt)));
  assert.deepEqual(job, before);
});

test('Fail and N/A require recorded explanations; quick remarks never imply a test outcome', () => {
  const job = { results: [{ id: 'result-1', assetId: 'asset-1', state: 'Not tested', observations: '', notes: '', defects: '', remarks: { items: [source()] } }] };
  for (const state of ['Unsatisfactory', 'Not applicable', 'Inaccessible']) {
    assert.throws(() => applyQuickDeviceResult(job, 'asset-1', state), /explanation/);
    const changed = applyQuickDeviceResult(job, 'asset-1', state, 'Engineer entered reason');
    assert.equal(changed.results[0].state, state);
    assert.equal(changed.results[0].observations, 'Engineer entered reason');
  }
  job.results[0].defects = 'Existing recorded reason';
  assert.equal(applyQuickDeviceResult(job, 'asset-1', 'Unsatisfactory').results[0].defects, 'Existing recorded reason');
  assert.equal(job.results[0].state, 'Not tested');
  assert.throws(() => applyQuickDeviceResult(job, 'missing', 'Satisfactory'), /one device/);
  assert.throws(() => applyQuickDeviceResult(job, 'asset-1', 'Passed'), /supported/);
  assert.throws(() => applyQuickDeviceResult(job, 'asset-1', 'Satisfactory', 'x'.repeat(10001)), /10,000/);
});

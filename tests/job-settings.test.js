import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveJob, adoptSiteSettings, captureJobOverrides, validateJobSettings } from '../src/job-settings.js';

const site = (profile = {}) => ({ id: 'site-1', name: 'Synthetic shared site', profile: { version: 1, client: 'Training client', engineer: 'Site engineer', discipline: 'Fire', workType: 'Maintenance', scope: 'Recorded site scope', ...profile } });
const job = (values = {}) => ({ id: 'job-1', siteId: 'site-1', drawingId: 'drawing-1', revision: 4, engineer: '', workType: '', scope: '', settings: { version: 1, overrides: {} }, workflow: { version: 1, details: { title: 'Synthetic notes visit', description: 'Recorded visit request' } }, notesDocument: { version: 1, text: 'Keep the actual notes' }, results: [{ id: 'result-1', state: 'Unsatisfactory', defects: 'Recorded fault', photos: [{ id: 'photo-1', image: 'synthetic-image-data' }] }], ...values });

test('shared site settings apply to every linked job and later profile changes without changing work', () => {
  const first = job(), second = job({ id: 'job-2', drawingId: 'older-drawing' });
  const original = structuredClone([first, second]);
  const oldSite = site();
  assert.equal(effectiveJob(first, oldSite).engineer, 'Site engineer');
  assert.equal(effectiveJob(second, oldSite).workflow.details.client, 'Training client');
  const changedSite = site({ engineer: 'New shared engineer', client: 'New client' });
  for (const record of [first, second]) {
    const shown = effectiveJob(record, changedSite);
    assert.equal(shown.engineer, 'New shared engineer');
    assert.equal(shown.workflow.details.client, 'New client');
    assert.deepEqual(shown.notesDocument, record.notesDocument);
    assert.deepEqual(shown.results, record.results);
    assert.equal(shown.drawingId, record.drawingId);
    assert.equal(shown.revision, record.revision);
  }
  assert.deepEqual([first, second], original);
});

test('explicit per-job settings including deliberate blanks take precedence over shared setup', () => {
  const record = job({ settings: { version: 1, overrides: { engineer: 'Visit engineer', scope: '', client: 'Job client', discipline: 'CCTV', customDiscipline: '' } } });
  const shown = effectiveJob(record, site());
  assert.equal(shown.engineer, 'Visit engineer');
  assert.equal(shown.scope, '');
  assert.equal(shown.workflow.details.client, 'Job client');
  assert.equal(shown.discipline, 'CCTV');
  assert.equal(shown.workType, 'Maintenance');
  shown.results[0].defects = 'Changed copy';
  assert.equal(record.results[0].defects, 'Recorded fault');
});

test('removing a shared value clears the inherited display but keeps explicit overrides', () => {
  const record = job({ engineer: 'Cached old engineer', scope: 'Cached old scope' });
  const shown = effectiveJob(record, { id: 'site-1', profile: { version: 1 } });
  assert.equal(shown.engineer, '');
  assert.equal(shown.scope, '');
  assert.equal(record.engineer, 'Cached old engineer');
  record.settings.overrides.engineer = 'Retained visit engineer';
  assert.equal(effectiveJob(record, { id: 'site-1', profile: { version: 1 } }).engineer, 'Retained visit engineer');
});

test('legacy adoption before site changes distinguishes inherited defaults from independent visit edits', () => {
  const legacy = job({ settings: undefined, engineer: 'Site engineer', workType: 'Maintenance', scope: 'Specific visit scope', workflow: { version: 1, details: { client: 'Training client', contactName: 'Specific contact' } } });
  const before = structuredClone(legacy);
  const adopted = adoptSiteSettings(legacy, site());
  assert.deepEqual(adopted.settings.overrides, { scope: 'Specific visit scope', contactName: 'Specific contact' });
  const shown = effectiveJob(adopted, site({ engineer: 'Changed site engineer', scope: 'Changed default scope', client: 'Changed client' }));
  assert.equal(shown.engineer, 'Changed site engineer');
  assert.equal(shown.scope, 'Specific visit scope');
  assert.equal(shown.workflow.details.client, 'Changed client');
  assert.equal(shown.workflow.details.contactName, 'Specific contact');
  assert.deepEqual(legacy, before);
});

test('a legacy editor only captures edited shared fields and retains work and empty overrides', () => {
  const record = job();
  const edited = effectiveJob(record, site());
  edited.engineer = '';
  edited.discipline = 'Custom';
  edited.customDiscipline = 'Synthetic specialist system';
  edited.workflow.details.contactName = 'Engineer entered contact';
  const saved = captureJobOverrides(record, edited, site());
  assert.deepEqual(saved.settings.overrides, { engineer: '', discipline: 'Custom', customDiscipline: 'Synthetic specialist system', contactName: 'Engineer entered contact' });
  assert.deepEqual(saved.results, record.results);
  assert.deepEqual(saved.notesDocument, record.notesDocument);
  assert.equal(effectiveJob(saved, site({ engineer: 'Another engineer' })).engineer, '');
});

test('standalone jobs keep their recorded metadata and do not invent a site or defaults', () => {
  const record = job({ siteId: null, drawingId: null, engineer: 'Independent engineer', discipline: '', settings: undefined });
  const shown = effectiveJob(record);
  assert.equal(shown.siteId, null);
  assert.equal(shown.drawingId, null);
  assert.equal(shown.engineer, 'Independent engineer');
  assert.equal(shown.discipline, '');
  assert.equal(shown.workflow.details.client, undefined);
  assert.throws(() => effectiveJob(record, site()), /own site/);
});

test('settings validation rejects unsupported structures and incomplete custom classifications', () => {
  assert.equal(validateJobSettings(undefined), undefined);
  for (const value of [null, [], { version: 2, overrides: {} }, { version: 1, overrides: [] }, { version: 1, overrides: { results: 'replaced' } }, { version: 1, overrides: { engineer: 7 } }, { version: 1, overrides: { scope: 'x'.repeat(10001) } }]) assert.throws(() => validateJobSettings(value));
  assert.throws(() => validateJobSettings({ version: 1, overrides: { discipline: 'Fire' } }), /custom name field/);
  assert.throws(() => validateJobSettings({ version: 1, overrides: { discipline: 'Custom', customDiscipline: '' } }), /custom discipline/i);
  assert.throws(() => validateJobSettings({ version: 1, overrides: { workType: 'Made up type', customWorkType: '' } }), /job type/i);
  const normalized = validateJobSettings({ version: 1, overrides: { engineer: '  Named engineer  ', discipline: 'Fire', customDiscipline: 'Stale name' } });
  assert.deepEqual(normalized.overrides, { engineer: 'Named engineer', discipline: 'Fire', customDiscipline: '' });
});

test('returning to shared defaults changes no saved result or note and supports legacy job types', () => {
  const record = job({ settings: { version: 1, overrides: { workType: 'Fire alarm maintenance', customWorkType: '', engineer: 'Visit engineer' } } });
  assert.equal(effectiveJob(record, site()).workType, 'Fire alarm maintenance');
  const reset = { ...record, settings: { version: 1, overrides: {} } };
  assert.equal(effectiveJob(reset, site()).workType, 'Maintenance');
  assert.deepEqual(effectiveJob(reset, site()).results, record.results);
  assert.deepEqual(effectiveJob(reset, site()).notesDocument, record.notesDocument);
});

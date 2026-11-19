import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateJobChecklist, createChecklistDraft, checklistPrompts,
  checklistProgress, checklistReportTitle, renderChecklistReport,
} from '../src/job-checklist.js';

function job(overrides = {}) {
  return {
    id: 'synthetic-job', siteId: 'synthetic-site', drawingId: 'synthetic-drawing', revision: 3,
    discipline: 'Fire', workType: 'Maintenance', engineer: 'Test Engineer', scope: 'Agreed synthetic scope',
    results: [
      { id: 'result-1', state: 'Not tested' },
      { id: 'result-2', state: 'Unsatisfactory' },
      { id: 'result-3', state: 'Inaccessible' },
    ],
    ...overrides,
  };
}
function saved(value = job()) {
  const draft = createChecklistDraft(value);
  draft.revision++;
  draft.savedAt = '2026-11-14T12:00:00.000Z';
  return validateJobChecklist(draft);
}

test('new checklist prefills recorded scope and engineer without inventing dates, standards or outcomes', () => {
  const visit = job();
  const before = structuredClone(visit);
  const draft = createChecklistDraft(visit);
  assert.equal(draft.revision, 0);
  assert.equal(draft.savedAt, '');
  assert.ok(draft.id);
  assert.equal(draft.fields.engineer, 'Test Engineer');
  assert.equal(draft.fields.scope, 'Agreed synthetic scope');
  for (const key of ['company', 'visitDate', 'standard', 'conditionLeft']) assert.equal(draft.fields[key], '');
  assert.ok(draft.entries.every(entry => entry.state === 'Not recorded'));
  assert.deepEqual(visit, before);
  assert.equal(validateJobChecklist(undefined), undefined);
});

test('discipline and job type select distinct prompts without inventing an installation declaration', () => {
  const expected = { Fire: 'fire-functions', Intruder: 'intruder-functions', CCTV: 'cctv-evidence', 'Access control': 'access-functions', Security: 'security-checks', Custom: 'custom-evidence' };
  for (const [discipline, id] of Object.entries(expected)) {
    const visit = job({ discipline, ...(discipline === 'Custom' ? { customDiscipline: 'Special system' } : {}) });
    assert.ok(checklistPrompts(visit).some(prompt => prompt.id === id));
  }
  assert.ok(checklistPrompts(job({ workType: 'Small works' })).some(prompt => prompt.id === 'alteration-boundary'));
  assert.ok(checklistPrompts(job({ workType: 'Install' })).some(prompt => prompt.id === 'install-responsibility'));
  assert.ok(checklistPrompts(job({ workType: 'Take over visit' })).some(prompt => prompt.id === 'takeover-baseline'));
  assert.ok(checklistPrompts(job({ workType: 'Call out' })).some(prompt => prompt.id === 'callout-outcome'));
  assert.ok(checklistPrompts(job({ discipline: '', workType: 'Fire alarm maintenance' })).some(prompt => prompt.id === 'fire-functions'));
  assert.equal(checklistReportTitle(job({ discipline: 'Custom', customDiscipline: 'Water monitoring', workType: 'Custom', customWorkType: 'Annual review' })), 'Draft Water monitoring annual review report');
});

test('drafts may save incomplete fields but an exclusion requires its explanation', () => {
  const value = saved();
  assert.equal(value.fields.visitDate, '');
  value.entries[0].state = 'Not applicable';
  assert.throws(() => validateJobChecklist(value), /Explain why/);
  value.entries[0].notes = 'Outside the agreed work boundary';
  assert.equal(validateJobChecklist(value).entries[0].state, 'Not applicable');
  value.entries[0].state = 'Passed';
  assert.throws(() => validateJobChecklist(value), /state is invalid/);
});

test('changed classification resets active prompts and preserves complete earlier evidence', () => {
  const original = saved();
  original.entries[0].state = 'Recorded';
  original.entries[0].notes = 'Original fire visit evidence';
  const changed = job({ discipline: 'CCTV', workType: 'Call out', checklist: original });
  const before = structuredClone(changed);
  const draft = createChecklistDraft(changed);
  assert.equal(draft.id, original.id);
  assert.equal(draft.history.length, 1);
  assert.equal(draft.history[0].entries[0].notes, 'Original fire visit evidence');
  assert.equal(draft.history[0].classification.discipline, 'Fire');
  assert.ok(draft.entries.every(entry => entry.state === 'Not recorded'));
  assert.equal(checklistProgress(changed).needsReview, true);
  draft.revision++;
  draft.savedAt = '2026-11-14T13:00:00.000Z';
  const revised = validateJobChecklist(draft);
  assert.equal(checklistProgress({ ...changed, checklist: revised }).needsReview, false);
  assert.deepEqual(changed, before);
});

test('same classification retains stable checklist identity and earlier unmapped prompts', () => {
  const original = saved();
  original.entries.push({ id: 'previous-prompt', label: 'Prior recorded prompt', state: 'Recorded', notes: 'Retained evidence' });
  original.entries[0].state = 'Recorded';
  const draft = createChecklistDraft(job({ checklist: original }));
  assert.equal(draft.id, original.id);
  assert.equal(draft.revision, original.revision);
  assert.equal(draft.entries[0].state, 'Recorded');
  assert.equal(draft.entries.at(-1).notes, 'Retained evidence');
  assert.deepEqual(draft.history, []);
});

test('a different drawing requires review and retains the earlier drawing evidence', () => {
  const original = saved();
  original.drawingRevision = 'B02';
  original.entries[0].state = 'Recorded';
  const visit = job({ drawingId: 'revised-drawing', revision: 5, checklist: original });
  const draft = createChecklistDraft(visit);
  assert.equal(checklistProgress(visit).needsReview, true);
  assert.ok(draft.entries.every(entry => entry.state === 'Not recorded'));
  assert.equal(draft.drawingId, 'revised-drawing');
  assert.equal(draft.history[0].drawingId, 'synthetic-drawing');
  assert.equal(draft.history[0].drawingRevision, 'B02');
  assert.equal(draft.history[0].basedOnJobRevision, 3);
  assert.equal(draft.basedOnJobRevision, 5);
});

test('all checklist prompts recorded never pass devices or remove missing evidence', () => {
  const visit = job();
  const checklist = saved(visit);
  checklist.entries.forEach(entry => { entry.state = 'Recorded'; });
  visit.checklist = checklist;
  const before = structuredClone(visit);
  const progress = checklistProgress(visit);
  assert.equal(progress.recorded, progress.total);
  assert.deepEqual(progress.counts, { notTested: 1, unsatisfactory: 1, inaccessible: 1, notApplicable: 0 });
  assert.ok(progress.gaps.some(gap => gap.includes('Not tested')));
  assert.ok(progress.gaps.includes('Applicable standard and edition'));
  assert.deepEqual(visit, before);
});

test('malformed imported checklist records and dates are rejected', () => {
  const value = saved();
  for (const invalid of [null, [], { ...value, version: 2 }, { ...value, issued: true }, { ...value, revision: 0 }, { ...value, savedAt: 'yesterday' }]) {
    assert.throws(() => validateJobChecklist(invalid));
  }
  assert.throws(() => validateJobChecklist({ ...value, fields: { ...value.fields, visitDate: '2026-02-30' } }), /valid date/);
  assert.throws(() => validateJobChecklist({ ...value, entries: [value.entries[0], value.entries[0]] }), /unique/);
  assert.throws(() => validateJobChecklist({ ...value, fields: { ...value.fields, extra: 'unknown' } }), /structure/);
  assert.throws(() => validateJobChecklist({ ...value, fields: { ...value.fields, engineer: 'a'.repeat(10001) } }), /at most/);
});

test('history cannot silently exceed its bound or reuse current revision numbers', () => {
  const value = saved();
  const { version, id, history, ...snapshot } = value;
  assert.throws(() => validateJobChecklist({ ...value, history: [snapshot] }), /earlier/);
  assert.throws(() => validateJobChecklist({ ...value, history: Array.from({ length: 101 }, () => snapshot) }), /at most 100/);
  const atLimit = { ...value, revision: 101, history: Array.from({ length: 100 }, (_, index) => ({ ...structuredClone(snapshot), revision: index + 1 })) };
  assert.throws(() => createChecklistDraft(job({ discipline: 'CCTV', checklist: atLimit })), /history is full/);
});

test('draft report contains exact references, missing information and escaped user text', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ className: '', innerHTML: '' }) };
  try {
    const visit = job({ checklist: saved() });
    visit.checklist.fields.company = '<img src=x onerror=alert(1)>';
    const site = { id: 'synthetic-site', name: 'Synthetic site', drawings: [{ id: 'synthetic-drawing', revision: 'B02' }] };
    const html = renderChecklistReport(site, visit).innerHTML;
    assert.match(html, /Draft — not a validated compliance certificate/);
    assert.match(html, /synthetic-job \/ 3/);
    assert.match(html, /synthetic-drawing \/ B02/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /Not recorded/);
    assert.match(renderChecklistReport(site, job()).innerHTML, /No checklist has been saved/);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

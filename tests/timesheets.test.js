import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTimesheetEntry, validateTimesheetEntries, minutesForTimesheet, isWorkSession,
  splitTimesheetByDay, shiftLocalDateTime, timesheetEntries, timesheetDayEntries, timesheetDayArchives,
  prepareTimesheetEdit, saveTimesheet, deleteTimesheet, restoreTimesheet,
  submitTimesheets, createTimesheetPackage,
} from '../src/timesheets.js';
import { createQuickJob } from '../src/model.js';
import { createJobPackage, importJobPackage } from '../src/packages.js';

const session = (extra = {}) => ({
  id: 'session-1', date: '2026-11-14', start: '09:00', end: '10:30', endDate: '2026-11-14',
  hours: 1.5, sessionType: 'Work', note: 'Synthetic visit work', engineer: 'Synthetic engineer', ...extra,
});
const workspace = () => ({ sites: [], jobs: [createQuickJob(), createQuickJob()], unassignedTimesheets: [] });

test('legacy entered hours remain authoritative while typed sessions calculate from explicit endpoints', () => {
  const legacy = { id: 'legacy', date: '2026-11-14', start: '09:00', end: '12:00', hours: '1.25', note: '', engineer: '' };
  assert.equal(validateTimesheetEntry(legacy).hours, 1.25);
  assert.equal(minutesForTimesheet(validateTimesheetEntry(legacy)), 75);
  assert.equal(validateTimesheetEntry({ ...legacy, hours: 0 }).hours, 0);
  assert.equal(validateTimesheetEntry({ ...legacy, sessionType: 'Work' }).hours, 3);
  assert.equal(validateTimesheetEntry({ ...legacy, start: '', end: '', hours: 2.5 }).hours, 2.5);
  assert.equal(minutesForTimesheet({ hours: NaN, start: '09:00', end: '09:30' }), 30);
  assert.equal(minutesForTimesheet({ hours: NaN }), 0);
  for (const type of [undefined, 'Work', 'Administration', 'Training']) assert.equal(isWorkSession({ sessionType: type }), true);
  for (const type of ['Travel', 'Break', 'Custom']) assert.equal(isWorkSession({ sessionType: type }), false);
});

test('overnight sessions split by calendar day and clock arithmetic is deterministic across DST', () => {
  const entry = validateTimesheetEntry(session({ start: '23:00', end: '01:30', endDate: '2026-11-15' }));
  assert.equal(entry.hours, 2.5);
  assert.deepEqual(splitTimesheetByDay(entry), [
    { date: '2026-11-14', start: '23:00', end: '24:00', minutes: 60, hours: 1 },
    { date: '2026-11-15', start: '00:00', end: '01:30', minutes: 90, hours: 1.5 },
  ]);
  assert.equal(shiftLocalDateTime('2026-11-14T23:45', 30), '2026-11-15T00:15');
  assert.equal(shiftLocalDateTime('2026-01-01T00:10', -15), '2025-12-31T23:55');
  const dst = session({ date: '2026-03-29', endDate: '2026-03-29', start: '00:30', end: '03:30' });
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'UTC'; const utc = minutesForTimesheet(dst);
    process.env.TZ = 'Europe/London'; assert.equal(minutesForTimesheet(dst), utc);
    assert.equal(utc, 180, 'entered wall-clock duration does not infer an unrecorded timezone offset');
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});

test('strict writes reject malformed dates, backwards times, duplicate IDs and unsafe submission claims', () => {
  for (const override of [
    { date: '2026-02-30' }, { start: '24:00' }, { end: '' }, { start: '12:00', end: '09:00' },
    { hours: Infinity }, { sessionType: 'Paid automatically' }, { sessionType: 'Custom', customType: '' },
    { endDate: '2027-01-14' }, { submittedAt: new Date().toISOString(), submissionId: 'invented' },
    { remoteApproval: true }, { submissionHistory: [{ id: 'bad' }] },
    { date: '', endDate: '', start: '', end: '', hours: 1 },
  ]) assert.throws(() => validateTimesheetEntry(session(override)));
  assert.throws(() => validateTimesheetEntries([session(), session()]), /unique/);
  assert.equal(validateTimesheetEntry(session({ end: '09:00' })).hours, 0);
});

test('creating and moving sessions updates only raw owning jobs atomically, keeping evidence and identity', () => {
  const state = workspace(), before = structuredClone(state), firstId = state.jobs[0].id, secondId = state.jobs[1].id;
  let saved = saveTimesheet(state, session(), { jobId: firstId });
  assert.deepEqual(state, before);
  assert.equal(saved.jobs[0].revision, before.jobs[0].revision + 1);
  assert.equal(saved.jobs[1].revision, before.jobs[1].revision);
  assert.deepEqual(saved.jobs[0].results, before.jobs[0].results);
  assert.equal(saved.jobs[0].workflow.timesheets[0].id, 'session-1');
  const preMove = structuredClone(saved);
  saved = saveTimesheet(saved, saved.jobs[0].workflow.timesheets[0], { jobId: secondId, previousJobId: firstId });
  assert.deepEqual(preMove.jobs[0].workflow.timesheets.map(entry => entry.id), ['session-1']);
  assert.equal(saved.jobs[0].workflow.timesheets.length, 0);
  assert.equal(saved.jobs[1].workflow.timesheets[0].id, 'session-1');
  assert.equal(saved.jobs[0].revision, preMove.jobs[0].revision + 1);
  assert.equal(saved.jobs[1].revision, preMove.jobs[1].revision + 1);
  const unassigned = saveTimesheet(saved, saved.jobs[1].workflow.timesheets[0], { jobId: null, previousJobId: secondId });
  assert.equal(unassigned.unassignedTimesheets[0].id, 'session-1');
  assert.equal(unassigned.jobs[1].workflow.timesheets.length, 0);
  assert.throws(() => saveTimesheet(unassigned, session(), { jobId: firstId }), /already exists/);
});

test('local submission retains immutable snapshots; edits reset current status and deletion is recoverable', () => {
  let state = saveTimesheet(workspace(), session(), { jobId: null });
  const submitted = submitTimesheets(state, [{ jobId: null, entryId: 'session-1' }], { from: '2026-11-14' });
  const original = structuredClone(submitted.state.unassignedTimesheets[0]);
  assert.equal(submitted.package.delivery.sent, false);
  assert.deepEqual(submitted.package.entries[0].entry, original);
  assert.equal(original.submissionHistory.length, 1);
  assert.equal(original.submissionHistory[0].entry.submissionId, undefined);
  assert.deepEqual(prepareTimesheetEdit(original, original), original, 'a no-op preserves the current submitted receipt');
  state = saveTimesheet(submitted.state, { ...original, note: 'Edited after local submission' }, { jobId: null, previousJobId: null });
  assert.equal(state.unassignedTimesheets[0].submissionId, undefined);
  assert.deepEqual(state.unassignedTimesheets[0].submissionHistory, original.submissionHistory);
  const deleted = deleteTimesheet(state, { jobId: null, entryId: 'session-1' });
  assert.ok(deleted.unassignedTimesheets[0].deletedAt);
  assert.equal(timesheetEntries(deleted).length, 0);
  assert.equal(timesheetEntries(deleted, { includeDeleted: true }).length, 1);
  assert.equal(timesheetDayArchives(deleted, '2026-11-14').length, 1);
  const archiveExport = createTimesheetPackage(deleted, { from: '2026-11-14' });
  assert.deepEqual(archiveExport.entries, []);
  assert.deepEqual(archiveExport.archivedEntries[0].entry, deleted.unassignedTimesheets[0]);
  assert.deepEqual(archiveExport.archivedEntries[0].entry.submissionHistory, original.submissionHistory);
  assert.equal(archiveExport.totals.minutes, 0);
  const restored = restoreTimesheet(deleted, { jobId: null, entryId: 'session-1' });
  assert.equal(timesheetEntries(restored).length, 1);
  assert.equal(restored.unassignedTimesheets[0].note, 'Edited after local submission');
  assert.deepEqual(restored.unassignedTimesheets[0].submissionHistory, original.submissionHistory);
});

test('stale edits and reassignment cannot replace a newer in-memory session', () => {
  let state = workspace();
  state = saveTimesheet(state, session(), { jobId: state.jobs[0].id });
  const stale = structuredClone(state.jobs[0].workflow.timesheets[0]);
  state = saveTimesheet(state, { ...stale, note: 'Newer saved work' }, { jobId: state.jobs[0].id, previousJobId: state.jobs[0].id });
  const before = structuredClone(state);
  assert.throws(() => saveTimesheet(state, { ...stale, note: 'Stale overwrite' }, { jobId: state.jobs[0].id, previousJobId: state.jobs[0].id }), /changed since/);
  assert.throws(() => saveTimesheet(state, stale, { jobId: state.jobs[1].id, previousJobId: state.jobs[0].id }), /changed since/);
  assert.deepEqual(state, before);
});

test('job exports round-trip overnight sessions, submission history and recoverable deletions', async () => {
  let state = workspace(), jobId = state.jobs[0].id;
  state = saveTimesheet(state, session({ start: '23:00', end: '01:30', endDate: '2026-11-15' }), { jobId });
  state = submitTimesheets(state, [{ jobId, entryId: 'session-1' }], { from: '2026-11-14' }).state;
  state = deleteTimesheet(state, { jobId, entryId: 'session-1' });
  const output = await createJobPackage(null, state.jobs[0]);
  const imported = await importJobPackage({ sites: [], jobs: [] }, output);
  assert.deepEqual(imported.job.workflow.timesheets, state.jobs[0].workflow.timesheets);
  assert.equal(imported.job.workflow.timesheets[0].submissionHistory[0].jobId, jobId);
  assert.ok(imported.job.workflow.timesheets[0].deletedAt);
  assert.equal((await importJobPackage(imported.state, output)).duplicate, true);
});

test('daily exports count selected day segments and separate Work from travel and break', () => {
  let state = saveTimesheet(workspace(), session({ start: '23:00', end: '01:30', endDate: '2026-11-15' }), { jobId: null });
  for (const [id, type] of [['travel', 'Travel'], ['break', 'Break'], ['admin', 'Administration']])
    state = saveTimesheet(state, session({ id, sessionType: type, start: '10:00', end: '10:30' }), { jobId: null });
  assert.equal(timesheetDayEntries(state, '2026-11-15')[0].segment.minutes, 90);
  const exported = createTimesheetPackage(state, { from: '2026-11-14' });
  assert.equal(exported.format, 'JobsTimesheetPackage');
  assert.equal(exported.version, 1);
  assert.equal(exported.entries.length, 4);
  assert.equal(exported.totals.minutes, 150);
  assert.equal(exported.totals.workMinutes, 90);
  assert.equal(exported.totals.unassignedMinutes, 150);
  assert.equal(exported.entries[0].entry.hours, 2.5, 'full overnight record is included with day-scoped totals');
});

test('conflicting copied session IDs remain visible and are excluded from confirmed totals', () => {
  const state = workspace();
  for (const job of state.jobs) job.workflow = { version: 1, timesheets: [validateTimesheetEntry(session())] };
  const rows = timesheetDayEntries(state, '2026-11-14');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.conflict));
  const output = createTimesheetPackage(state, { from: '2026-11-14' });
  assert.equal(output.entries.length, 2);
  assert.equal(output.totals.minutes, 0);
  assert.equal(output.totals.conflictCount, 2);
  assert.throws(() => submitTimesheets(state, [{ jobId: state.jobs[0].id, entryId: 'session-1' }], { from: '2026-11-14' }), /conflicting/);
  assert.throws(() => saveTimesheet(state, session(), { jobId: state.jobs[1].id, previousJobId: state.jobs[0].id }), /already contains/);
  assert.equal(timesheetEntries({ jobs: [{ id: 'legacy', workflow: { timesheets: [{ hours: 1 }, { hours: 2 }] } }] }).some(row => row.conflict), false);
});


test('engineer exports group normalised names and include only that engineer’s active and archived records', () => {
  const state = workspace();
  state.jobs.forEach(job => { job.workflow = { version: 1, timesheets: [] }; });
  state.jobs[0].workflow.timesheets = [
    validateTimesheetEntry(session({ id: 'alice-one', engineer: ' Alice  Green ' })),
    validateTimesheetEntry(session({ id: 'bob-one', engineer: 'Bob Green' })),
    validateTimesheetEntry(session({ id: 'alice-trash', engineer: 'ALICE GREEN', deletedAt: '2026-11-14T17:00:00Z' })),
    validateTimesheetEntry(session({ id: 'bob-trash', engineer: 'Bob Green', deletedAt: '2026-11-14T17:00:00Z' })),
  ];
  state.unassignedTimesheets = [validateTimesheetEntry(session({ id: 'alice-two', engineer: 'Ａｌｉｃｅ Green', start: '12:00', end: '12:30' }))];
  const output = createTimesheetPackage(state, { from: '2026-11-14', engineer: ' Alice Green ' });
  assert.equal(output.engineer, 'Alice Green');
  assert.deepEqual(output.entries.map(row => row.entry.id), ['alice-one', 'alice-two']);
  assert.deepEqual(output.archivedEntries.map(row => row.entry.id), ['alice-trash']);
  assert.equal(output.totals.minutes, 120);
  assert.equal(output.totals.unassignedMinutes, 30);
  const all = createTimesheetPackage(state, { from: '2026-11-14' });
  assert.equal(all.engineer, undefined);
  assert.equal(all.entries.length, 3);
  assert.equal(all.archivedEntries.length, 2);
});

test('engineer submission cannot include another engineer or leak unrelated archived sessions', () => {
  const state = workspace(), jobId = state.jobs[0].id;
  state.jobs.forEach(job => { job.workflow = { version: 1, timesheets: [] }; });
  state.jobs[0].workflow.timesheets = [
    validateTimesheetEntry(session({ id: 'alice', engineer: 'Alice Green' })),
    validateTimesheetEntry(session({ id: 'bob', engineer: 'Bob Green' })),
    validateTimesheetEntry(session({ id: 'alice-trash', engineer: 'Alice Green', deletedAt: '2026-11-14T17:00:00Z' })),
    validateTimesheetEntry(session({ id: 'bob-trash', engineer: 'Bob Green', deletedAt: '2026-11-14T17:00:00Z' })),
  ];
  const before = structuredClone(state), options = { from: '2026-11-14', engineer: 'ALICE GREEN' };
  assert.throws(() => submitTimesheets(state, [{ jobId, entryId: 'bob' }], options), /Selected sessions/);
  assert.deepEqual(state, before);
  const output = submitTimesheets(state, [{ jobId, entryId: 'alice' }], options);
  assert.equal(output.package.engineer, 'ALICE GREEN');
  assert.deepEqual(output.package.entries.map(row => row.entry.id), ['alice']);
  assert.deepEqual(output.package.archivedEntries, []);
  assert.equal(output.state.jobs[0].workflow.timesheets.find(entry => entry.id === 'bob').submissionId, undefined);
  assert.deepEqual(state, before);
  const subset = createTimesheetPackage(state, { from: options.from, refs: [{ jobId, entryId: 'alice' }] });
  assert.deepEqual(subset.archivedEntries, [], 'a refs-based export is limited to the selected records');
});

test('engineer filtering does not hide global duplicate-ID conflicts or fail on other legacy names', () => {
  const state = workspace();
  state.jobs.forEach(job => { job.workflow = { version: 1, timesheets: [] }; });
  state.jobs[0].workflow.timesheets = [validateTimesheetEntry(session({ engineer: 'Alice Green' }))];
  state.jobs[1].workflow.timesheets = [validateTimesheetEntry(session({ engineer: 'Bob Green' }))];
  state.unassignedTimesheets = [validateTimesheetEntry(session({ id: 'legacy-name', engineer: 'Old\nname' }))];
  const output = createTimesheetPackage(state, { from: '2026-11-14', engineer: 'alice green' });
  assert.equal(output.entries.length, 1);
  assert.equal(output.entries[0].conflict, true);
  assert.equal(output.totals.minutes, 0);
  assert.equal(output.totals.conflictCount, 1);
  assert.throws(() => submitTimesheets(state, [{ jobId: state.jobs[0].id, entryId: 'session-1' }], { from: '2026-11-14', engineer: 'Alice Green' }), /conflicting/);
});

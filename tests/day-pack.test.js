import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickJob } from '../src/model.js';
import { createDayPack, inspectDayPack, importDayPack, validateOfficeReceipts } from '../src/day-pack.js';
import { startOfficeDay, finishOfficeDay, markOfficeDayPrepared, acknowledgeOfficeDay } from '../src/day-session.js';
import { saveTimesheet, deleteTimesheet } from '../src/timesheets.js';

const blank = () => ({ sites: [], jobs: [], unassignedTimesheets: [], officeDays: [], officeReceipts: [] });
const fixture = () => ({ ...blank(), jobs: [createQuickJob(null, { title: 'Synthetic morning visit' }), createQuickJob(null, { title: 'Synthetic afternoon visit' })] });
const assign = state => createDayPack(state, { jobIds: state.jobs.map(job => job.id), officeId: 'office-1', date: '2026-11-27', engineer: '', label: 'Friday field work', createdAt: '2026-11-27T07:30:00.000Z' });
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value))))].map(value => value.toString(16).padStart(2, '0')).join('');
async function reseal(pack) { const { checksum, packId, ...body } = pack, { createdAt, ...identity } = body; const id = `day-pack-${await hash(identity)}`; return { ...body, packId: id, checksum: `sha256:${await hash({ ...body, packId: id })}` }; }

test('a team assignment carries complete jobs, stable semantic identity and inspectable metadata without modifying the office', async () => {
  const state = fixture(), before = structuredClone(state), pack = await assign(state);
  assert.deepEqual(state, before); assert.equal(pack.engineer, ''); assert.equal(pack.kind, 'assignment'); assert.equal(pack.day, null);
  assert.equal(pack.packages.length, 2); assert.deepEqual(pack.jobIds, state.jobs.map(job => job.id));
  const inspected = await inspectDayPack(JSON.stringify(pack));
  assert.equal(inspected.summary.jobCount, 2); assert.equal(inspected.summary.attendanceMinutes, 0);
  const reissued = await createDayPack(state, { ...pack, createdAt: '2026-11-27T07:45:00.000Z' });
  assert.equal(reissued.packId, pack.packId); assert.notEqual(reissued.checksum, pack.checksum, 'creation timestamp integrity still checked');
  const imported = await importDayPack(blank(), pack);
  assert.equal(imported.state.jobs.length, 2); assert.equal(imported.state.officeReceipts.length, 1);
  assert.equal(imported.receipt.dayId, null); assert.equal(imported.receipt.engineer, '');
  assert.deepEqual(validateOfficeReceipts(imported.state.officeReceipts), imported.state.officeReceipts);
  const edited = structuredClone(imported.state); edited.jobs[0].scope = 'Saved local edit after collection';
  const repeated = await importDayPack(edited, reissued);
  assert.equal(repeated.duplicate, true); assert.equal(repeated.state, edited); assert.equal(repeated.state.jobs[0].scope, 'Saved local edit after collection');
});

test('returns preserve edited jobs, attendance and time; office receipt alone acknowledges the matching return', async () => {
  const office = fixture(), assignment = await assign(office), imported = await importDayPack(blank(), assignment);
  const started = startOfficeDay(imported.state, { packId: assignment.packId, parentPackId: assignment.parentPackId, officeId: assignment.officeId, engineer: 'Alice', date: assignment.date, jobIds: imported.jobIds, at: '2026-11-27T08:00:00.000Z', localStart: '2026-11-27T08:00' });
  started.state.jobs[0].scope = 'Engineer recorded the repair'; started.state.jobs[0].revision++;
  const finished = finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T16:00:00.000Z', localFinish: '2026-11-27T16:00' });
  const returned = await createDayPack(finished.state, { kind: 'return', day: finished.day, label: 'Friday returned work' });
  assert.equal(returned.parentPackId, assignment.packId); assert.equal(returned.engineer, 'Alice');
  assert.equal(returned.unassignedTimesheets[0].hours, 8); assert.equal(returned.day.status, 'finished'); assert.equal(returned.day.receipt, null);
  const review = await importDayPack(office, returned, { receivedAt: '2026-11-27T16:05:00.000Z' });
  assert.equal(review.conflicts.length, 1); assert.equal(review.state.jobs.length, 3, 'office and engineer versions both remain');
  assert.equal(review.state.jobs[0].scope, office.jobs[0].scope);
  assert.equal(review.jobs[0].scope, 'Engineer recorded the repair');
  assert.equal(review.summary.attendanceMinutes, 480); assert.equal(review.summary.unallocatedMinutes, 480);
  assert.equal(review.state.officeReceipts[0].day.localStart, '2026-11-27T08:00');
  assert.equal(review.state.officeReceipts[0].day.localFinish, '2026-11-27T16:00');
  const pending = markOfficeDayPrepared(finished.state, finished.day.id, returned.packId);
  assert.equal(pending.day.status, 'finished');
  const acknowledged = await acknowledgeOfficeDay(pending.state, pending.day.id, review.receipt);
  assert.equal(acknowledged.day.status, 'returned');
  const repeated = await importDayPack(review.state, returned);
  assert.equal(repeated.duplicate, true); assert.deepEqual(repeated.state, review.state);
});

test('manager redistribution keeps parent pack identity and independent engineers cannot overwrite each other', async () => {
  const office = fixture(), original = await assign(office), manager = await importDayPack(blank(), original);
  const shared = await createDayPack(manager.state, { jobIds: [manager.jobIds[0]], date: original.date, officeId: original.officeId, parentPackId: original.packId, engineer: '', label: 'Site team' });
  assert.equal(shared.parentPackId, original.packId); assert.equal(shared.engineer, '');
  const alice = await importDayPack(blank(), shared), bob = await importDayPack(blank(), shared);
  alice.state.jobs[0].scope = 'Alice evidence'; alice.state.jobs[0].revision++;
  bob.state.jobs[0].scope = 'Bob evidence'; bob.state.jobs[0].revision++;
  const first = await createDayPack(alice.state, { jobIds: alice.jobIds, date: original.date, officeId: original.officeId, parentPackId: shared.packId, engineer: 'Alice' });
  const second = await createDayPack(bob.state, { jobIds: bob.jobIds, date: original.date, officeId: original.officeId, parentPackId: shared.packId, engineer: 'Bob' });
  const received = await importDayPack((await importDayPack(office, first)).state, second);
  assert.equal(received.conflicts.length, 1);
  assert.ok(received.state.jobs.some(job => job.scope === 'Alice evidence')); assert.ok(received.state.jobs.some(job => job.scope === 'Bob evidence'));
});

test('all packages validate before import: corrupt later jobs, hashes, unsafe keys and oversized structure reject unchanged input', async () => {
  const office = fixture(), before = structuredClone(office), pack = await assign(office);
  const malformed = structuredClone(pack); malformed.packages[1].job.status = 42;
  const sealed = await reseal(malformed);
  await assert.rejects(() => importDayPack(office, sealed), /job.status/);
  await assert.rejects(() => importDayPack(office, { ...pack, label: 'Changed without a checksum' }), /checksum/);
  await assert.rejects(() => inspectDayPack(JSON.stringify(pack).slice(0, -1)), /valid JSON/);
  const nested = {}; let cursor = nested; for (let i = 0; i < 90; i++) { cursor.next = {}; cursor = cursor.next; }
  await assert.rejects(() => inspectDayPack(nested), /deeply nested/);
  const unsafe = JSON.parse('{"__proto__":{"polluted":true}}'); await assert.rejects(() => inspectDayPack(unsafe), /unsafe/);
  assert.deepEqual(office, before); assert.equal({}.polluted, undefined);
});

test('conflicting returned unassigned time stays in review evidence instead of being counted twice', async () => {
  const office = fixture(), assignment = await assign(office), received = await importDayPack(blank(), assignment);
  const started = startOfficeDay(received.state, { packId: assignment.packId, officeId: assignment.officeId, engineer: 'Alice', date: assignment.date, jobIds: received.jobIds, at: '2026-11-27T08:00:00.000Z', localStart: '2026-11-27T08:00' });
  const finished = finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T16:00:00.000Z', localFinish: '2026-11-27T16:00' });
  const pack = await createDayPack(finished.state, { kind: 'return', day: finished.day });
  const changed = { ...pack.unassignedTimesheets[0], end: '15:00', hours: 7 };
  const prior = saveTimesheet(office, changed);
  const imported = await importDayPack(prior, pack);
  assert.equal(imported.state.unassignedTimesheets.length, 1); assert.equal(imported.state.unassignedTimesheets[0].hours, 7);
  assert.equal(imported.state.officeReceipts[0].timeConflicts[0].entry.hours, 8);
  assert.equal(imported.summary.conflictCount, 1);
  assert.equal((await importDayPack(imported.state, pack)).duplicate, true);
});

for (const destination of ['original job', 'job created after finishing']) test(`return follows a finished day’s time moved into ${destination}`, async () => {
  const office = fixture(), assignment = await assign(office), received = await importDayPack(blank(), assignment);
  const started = startOfficeDay(received.state, { packId: assignment.packId, officeId: assignment.officeId, engineer: 'Alice', date: assignment.date, jobIds: received.jobIds, at: '2026-11-27T08:00:00.000Z', localStart: '2026-11-27T08:00' });
  const finished = finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T16:00:00.000Z', localFinish: '2026-11-27T16:00' });
  const originalReturn = await createDayPack(finished.state, { kind: 'return', day: finished.day });
  const oldReceipt = (await importDayPack(office, originalReturn)).receipt;
  const prepared = markOfficeDayPrepared(finished.state, finished.day.id, originalReturn.packId);
  const target = destination === 'original job' ? prepared.state.jobs[0] : createQuickJob(null, { title: 'Additional visit' });
  if (destination !== 'original job') prepared.state.jobs.push(target);
  const tracked = prepared.state.unassignedTimesheets[0];
  const moved = saveTimesheet(prepared.state, tracked, { jobId: target.id, previousJobId: null });
  const before = structuredClone(moved);
  const returned = await createDayPack(moved, { kind: 'return', day: moved.officeDays[0], jobIds: [received.jobIds[0]] });
  assert.deepEqual(moved, before, 'preparing the return does not mutate local day tracking');
  assert.deepEqual(moved.officeDays[0].timesheetEntryIds, [tracked.id]);
  assert.deepEqual(returned.day.timesheetEntryIds, []);
  assert.deepEqual(returned.unassignedTimesheets, []);
  assert.ok(returned.jobIds.includes(target.id), 'current time owner is included even outside the original selection');
  assert.ok(received.jobIds.every(id => returned.jobIds.includes(id)), 'all original day jobs remain included');
  assert.equal(returned.packages.find(pack => pack.job.id === target.id).job.workflow.timesheets[0].id, tracked.id);
  assert.notEqual(returned.packId, originalReturn.packId, 'moving time changes the returned content identity');
  const inspected = await inspectDayPack(returned);
  assert.equal(inspected.summary.attendanceMinutes, 480);
  assert.equal(inspected.summary.unallocatedMinutes, 0);
  const pending = markOfficeDayPrepared(moved, finished.day.id, returned.packId);
  await assert.rejects(() => acknowledgeOfficeDay(pending.state, finished.day.id, oldReceipt), /does not acknowledge/);
  const review = await importDayPack(office, returned);
  assert.equal(review.state.unassignedTimesheets.length, 0);
  assert.equal(review.jobs.find(job => job.workflow.timesheets?.some(entry => entry.id === tracked.id)).workflow.timesheets[0].hours, 8);
  assert.equal((await acknowledgeOfficeDay(pending.state, finished.day.id, review.receipt)).day.status, 'returned');
});

test('trashed day time returns as deleted evidence and ambiguous owners require review', async () => {
  const office = fixture(), assignment = await assign(office), received = await importDayPack(blank(), assignment);
  const started = startOfficeDay(received.state, { packId: assignment.packId, officeId: assignment.officeId, engineer: 'Alice', date: assignment.date, jobIds: received.jobIds, at: '2026-11-27T08:00:00.000Z', localStart: '2026-11-27T08:00' });
  const finished = finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T16:00:00.000Z', localFinish: '2026-11-27T16:00' });
  const tracked = finished.state.unassignedTimesheets[0];
  const trashed = deleteTimesheet(finished.state, { entryId: tracked.id });
  const returned = await createDayPack(trashed, { kind: 'return', day: trashed.officeDays[0] });
  assert.ok(returned.unassignedTimesheets[0].deletedAt);
  assert.equal((await inspectDayPack(returned)).summary.unallocatedMinutes, 0);
  const receivedDeletion = await importDayPack(saveTimesheet(office, tracked), returned);
  assert.equal(receivedDeletion.state.unassignedTimesheets[0].deletedAt, undefined, 'existing office evidence is preserved');
  assert.ok(receivedDeletion.state.officeReceipts[0].timeConflicts[0].entry.deletedAt, 'deletion remains visible for review');
  const ambiguous = structuredClone(finished.state);
  ambiguous.jobs[0].workflow.timesheets.push(structuredClone(tracked));
  await assert.rejects(() => createDayPack(ambiguous, { kind: 'return', day: ambiguous.officeDays[0] }), /conflicting copies/);
});
